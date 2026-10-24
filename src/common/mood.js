import storage from '@system.storage';

const STORAGE_KEY = 'mood_entries_v1';

// 三种心情：score 越大越正向
// img 用完整路径（Vela 规范：src 不要用变量拼接，直接绑变量）
export const MOODS = [
  { score: 3, img: '/common/mood-happy.png', badge: '喜', label: '开心', color: '#f0b64a' },
  { score: 2, img: '/common/mood-calm.png', badge: '静', label: '平静', color: '#5b9bd5' },
  { score: 1, img: '/common/mood-angry.png', badge: '怒', label: '生气', color: '#e2695c' }
];

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 生成 YYYY-MM-DD
export function dateKey(date) {
  const d = date || new Date();
  return [d.getFullYear(), pad2(d.getMonth() + 1), pad2(d.getDate())].join('-');
}

export function moodOf(score) {
  return MOODS.find((m) => m.score === score) || MOODS[1];
}

// 2026年10月
export function monthText(key) {
  const parts = (key || dateKey()).split('-');
  return Number(parts[0]) + '年' + Number(parts[1]) + '月';
}

// 是多少号
export function dayOfMonth(key) {
  return Number((key || dateKey()).split('-')[2]);
}

// 10月18日
export function mdText(key) {
  const parts = key.split('-');
  return Number(parts[1]) + '月' + Number(parts[2]) + '日';
}

export function weekdayOf(key) {
  const parts = key.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return WEEK[d.getDay()];
}

// 10月18日 周六
export function prettyDate(key) {
  return mdText(key) + ' ' + weekdayOf(key);
}

// 列表里的短日期：今天 / 10月18日
export function shortDate(key) {
  return key === dateKey() ? '今天' : mdText(key);
}

// 把 key 往前推 n 天
export function shiftKey(key, offset) {
  const parts = key.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + offset);
  return dateKey(d);
}

// 本周（周一到周日）
export function weekRange(key) {
  const base = key || dateKey();
  const parts = base.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const offset = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const start = shiftKey(base, -offset);
  return { start: start, end: shiftKey(start, 6) };
}

// 本月
export function monthRange(key) {
  const base = key || dateKey();
  const parts = base.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: year + '-' + pad2(month) + '-01',
    end: year + '-' + pad2(month) + '-' + pad2(lastDay)
  };
}

// 上周（周一打开时回顾）
export function lastWeekRange(key) {
  return weekRange(shiftKey(key || dateKey(), -7));
}

// 上月（每月1号打开时回顾）
export function lastMonthRange(key) {
  return monthRange(shiftKey(key || dateKey(), -1));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 旧数据是一天一条、没有 id，补一个让排序稳定。
// 补 id 时按已用时间戳顺延，避免同一天的旧数据拿到相同 id（否则删除会连着删掉几条）
function normalize(list) {
  const used = {};
  return list
    .filter((item) => item && typeof item.score === 'number' && typeof item.date === 'string' && DATE_RE.test(item.date))
    .map((item) => {
      if (typeof item.id === 'number' && !used[item.id]) {
        used[item.id] = true;
        return item;
      }
      const parts = item.date.split('-');
      let ts = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
      while (used[ts]) {
        ts += 1;
      }
      used[ts] = true;
      return { id: ts, date: item.date, score: item.score, note: item.note || '' };
    });
}

function parseEntries(raw) {
  if (!raw) {
    return [];
  }
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? normalize(list) : [];
  } catch (e) {
    return [];
  }
}

// 日期正序：早的在前，新记录排在后面；同一天内按添加时间正序
function sortByOldest(list) {
  return list.slice().sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return a.id - b.id;
  });
}

export function loadEntries(callback) {
  storage.get({
    key: STORAGE_KEY,
    default: '[]',
    success: (data) => {
      callback(sortByOldest(parseEntries(data)));
    },
    fail: () => {
      callback([]);
    }
  });
}

// 回调参数 ok：写入是否真的成功（存储超限/失败时上层要能提示，而不是假装成功）
function persist(list, callback) {
  storage.set({
    key: STORAGE_KEY,
    value: JSON.stringify(sortByOldest(list)),
    success: () => {
      callback && callback(true);
    },
    fail: () => {
      callback && callback(false);
    }
  });
}

// 同一毫秒连续添加时顺延，保证 id 唯一
function nextId(list) {
  let ts = Date.now();
  while (list.some((item) => item.id === ts)) {
    ts += 1;
  }
  return ts;
}

// 一天可以记多次，每次都是独立一条；date 不传则取当前时间
export function addEntry(input, callback) {
  loadEntries((list) => {
    const id = nextId(list);
    persist(list.concat([{
      id: id,
      date: input.date || dateKey(new Date(id)),
      score: input.score,
      note: input.note || ''
    }]), callback);
  });
}

// 路由传参会转成字符串，这里统一按字符串比对；只删第一条命中，避免 id 冲突时误删多条
export function deleteEntry(id, callback) {
  loadEntries((list) => {
    const index = list.findIndex((item) => '' + item.id === '' + id);
    if (index < 0) {
      callback && callback(false);
      return;
    }
    persist(list.slice(0, index).concat(list.slice(index + 1)), callback);
  });
}

// 区间统计：三种心情各自的次数占比 + 总次数 + 平均分
export function rangeSummary(list, range) {
  const hit = list.filter((item) => item.date >= range.start && item.date <= range.end);
  const total = hit.length;
  const sum = hit.reduce((acc, item) => acc + item.score, 0);
  return {
    total: total,
    avg: total ? Math.round((sum / total) * 10) / 10 : 0,
    counts: MOODS.map((mood) => {
      const count = hit.filter((item) => item.score === mood.score).length;
      const pct = total ? Math.round((count / total) * 100) : 0;
      return {
        label: mood.label,
        color: mood.color,
        count: count,
        barStyle: 'width: ' + pct + '%; background-color: ' + mood.color + ';'
      };
    })
  };
}
