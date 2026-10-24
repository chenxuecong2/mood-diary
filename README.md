# 心情日记 · 小米快应用（Vela 手表）

一个为**方形手表屏幕**设计的心情记录快应用。一天可以记很多次，每次只需两步：点一下表情、点保存；想说的话用内置中文键盘敲进去。

- 平台：小米快应用 / Vela（`deviceTypeList: ["watch"]`）
- 设计宽度：`466`（方形屏），包名 `com.chenxuecong.mood`
- 构建产物：`dist/com.chenxuecong.mood.debug.1.0.0.rpk`（约 162 KB）

## 功能

| 功能 | 说明 |
|---|---|
| 一天多条 | 每条记录独立成条，同一天记几次就有几条，按添加时间排序 |
| 三种心情 | 开心 `3` / 平静 `2` / 生气 `1`，对应三张表情图与主题色 |
| 回填日期 | 添加页左右步进选日期，范围是**前 30 天 ~ 后 7 天**；点日期文字一键回到今天 |
| 心里话 | 每条最多 30 字，用内置拼音/英文键盘输入，支持中英日切换 |
| 首页网格 | 表情按每行 5 格排布，不足一格用透明图补齐，不出现空 `src` 的占位图标 |
| 自动回顾 | **周一**自动显示「上周」、**每月 1 号**自动显示「上月」的心情占比条（开心/平静/生气各自的次数与百分比） |
| 详情与删除 | 点表情进详情，删除需要**二次确认**（3 秒内有效），删除后返回首页 |

## 页面

| 路由 | 文件 | 职责 |
|---|---|---|
| `pages/index` | `src/pages/index/index.ux` | 首页：月份标题、周/月回顾条、五列表情网格、空状态、添加入口 |
| `pages/add` | `src/pages/add/add.ux` | 添加：切换心情、选日期、输入心里话、保存 |
| `pages/detail` | `src/pages/detail/detail.ux` | 详情：心情、日期、心里话全文、二次确认删除 |

交互细节：

- 首页左上角的返回键没有上一页可回，**直接退出应用**回桌面（`app.terminate()`）。
- 添加页在「表单」与「输入态」之间切换，输入态顶部只留输入框和「完成」，其余让位给键盘。
- 详情页删除按钮第一次点只「上膛」，且 3 秒不操作自动复位，避免手滑删掉记录。

## 快速上手

### 环境要求

- Node.js（`package.json` 声明 `>=8.10`，实测 v25.5 构建通过）
- `aiot-toolkit` 2.0.5（`npm install` 自动装）
- 调试设备 / 快应用模拟器（可选，配 `.vscode/mcp.json` 里的 velajs MCP 可直接真机调试）

### 安装与开发

```bash
npm install
npm start          # aiot start --watch，改动热更新
```

### 构建

```bash
npm run build      # 正式构建（--enable-image-png8 --optimize-css-attr）
npm run build:fast # 纯构建，不带优化，速度快
npm run release    # 发布构建
```

产物落在 `dist/`。

> ⚠️ `npm run release` 目前会报 `there is a problem with the certification path`：生产模式不认 node_modules 里自带的调试证书，需要自己从小米快应用平台申请正式证书（预期放在 `sign/` 目录，见 `.eslintignore`）。日常构建用 `npm run build` 即可。

## 目录结构

```
src/
├── app.ux                       应用生命周期（空壳）
├── manifest.json               包名、权限、路由、designWidth=466
├── config-watch.json           手表端配置
├── common/
│   ├── mood.js                 数据层：storage 读写、日期工具、区间统计
│   ├── mood-happy.png          开心表情
│   ├── mood-calm.png           平静表情
│   ├── mood-angry.png          生气表情
│   ├── logo.png                应用图标
│   └── blank.png               网格补位用的透明图
├── pages/
│   ├── index/index.ux
│   ├── add/add.ux
│   └── detail/detail.ux
└── components/InputMethod/     内置键盘组件（见「第三方组件」）
    ├── InputMethod.ux
    └── assets/
        ├── dicUtil.js          拼音引擎
        ├── dictionaryLoader.js 词库懒加载
        ├── dictionary/         cn.txt / jp.txt / words-a..z.txt（28 个）
        ├── horizontal/         rect 屏键盘图（12 张）
        └── t9/                 九宫格图（8 张）
```

## 数据设计

全部记录存在一个 `system.storage` key 里：

- key：`mood_entries_v1`
- value：JSON 数组，每条

```js
{
  id: 1761302400000,     // 添加时刻的时间戳，同毫秒顺延保证唯一
  date: '2026-10-24',    // YYYY-MM-DD，可回填
  score: 3,              // 3 开心 / 2 平静 / 1 生气
  note: '今天还不错'      // 最多 30 字，可为空
}
```

读取时会做一次归一化（`src/common/mood.js` 的 `normalize`）：

- 丢掉字段缺失或 `date` 不是 `YYYY-MM-DD` 的脏数据；
- 老数据没有 `id` 的，按当天 0 点时间戳补齐，**冲突时顺延 1ms** 保证唯一（否则删除会连坐同 id 的多条）；
- 排序统一为日期正序，同一天内按 `id` 正序。

## 实现要点

- **列表高度不写死**：只取 `device.getInfo()` 的宽高比换算出设计高度（`DESIGN_WIDTH × height / width`），页头 96 + 页脚 112 + 回顾条 58×N 之后剩下的给列表。336×480、432×514、466×466 等不同比例屏幕都能用；取不到设备信息时退回 466 方屏兜底。
- **返回首页不丢滚动位置**：首页用「日期 + 条数 + 首尾 id」做数据指纹，数据没变就跳过列表重建。
- **不依赖 picker**：日期用左右步进 + 点中间回今天，避免 `picker` 组件在手表上的适配问题。
- **键盘懒建**：键盘子树首次弹出才创建，之后保活只切显隐，避免进页瞬间创建两百多个节点导致的卡顿。
- **写入失败会提示**：`storage.set` 失败不再静默成功，添加页/详情页分别提示「保存失败」「删除失败」。

## 第三方组件

`src/components/InputMethod/` 是内置的中文输入法组件（拼音引擎 `dicUtil.js` + 词库分片懒加载）。

本项目只用到**方形屏 + QWERTY**这一条路径，因此：

- 已移除用不到的**圆屏**（`full/` 26 张）与**胶囊屏**（`arc/` 12 张）键盘资源，以及对应的模板分支；
- 包体从 245.9 KB 降到 162 KB（`npm run build`，压缩后）。

> 如果以后要适配圆表或胶囊屏，需要把上述资源与 `InputMethod.ux` 里的对应分支从上游组件拷回来。

## 已知限制

- **`npm run lint` 不可用**：仓库里没有 ESLint 配置（`.eslintrc`），且 `.ux` 文件需要自定义 parser/processor 才能解析。
- **全量数据存单个 key**：记录很多时会顶到 storage 单值上限（此时会明确提示保存失败，不会静默丢数据）。长期使用可考虑按天/按月分 key。
- **最新记录在列表底部**：日期正序排列，想看最新一条需要往下滚。
- `t9/` 目录中除 `123.png` 外 7 张图当前已无引用（约 14 KB），可安全删除。

## 许可证

尚未指定开源许可证。如果要放开复用，建议 MIT 或 Apache-2.0 —— 确定后补一个 `LICENSE` 文件即可。
