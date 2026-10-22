// ============================================================
// seed.js —— 种子与每日挑战（第 22 块）
//
// 为什么不用服务器：
//   · 站点是纯静态的（GitHub Pages，没有后端，也不打算有）；
//   · 「同一天所有人玩到同一局」只要一个**人人算得出、又不用联网**的种子。
//     日期字符串 → FNV-1a 32 位哈希 → 种子；显示成 6 位 base36 短码给玩家看。
//
// 种子只决定「抽什么」，不决定「你打成什么样」：
//   · 三选一（rollChoices）、商店摆货（rollShopItems）、奇遇（pickEvent）、
//     对话里的掷骰（resolveRoll）、掉不掉金币（gold.maybeDrop）各自一条
//     独立的随机流（salt 不同），互不干扰；
//   · 分不出种子时（普通局）一律退回 Math.random，行为和以前完全一样。
//
// 每日挑战的规则写死在 DAILY_RULES 里：固定第一关、噩梦、两条由种子挑出的诅咒。
// 为什么不用第二关：第二关要通关第一关才解锁，每日挑战不能把人挡在门外。
// ============================================================

// FNV-1a 32 位：短、无依赖、分布够用
export function hashStr(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32：32 位状态、周期 2^32，够做一局肉鸽的抽签
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 本机日期（不是 UTC）：玩家眼里的「今天」就是本地零点换种子
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayText(d = new Date()) {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

// 同一天同一颗种子。前缀固定，换算法等于换整批挑战，所以写死别动
export function dailySeed(d = new Date()) {
  return hashStr(`naiwa-rouge-daily:${dayKey(d)}`);
}

// 6 位 base36 短码（放大写）：给玩家报种子用，碰撞概率对「一天一颗」无所谓
export function seedCode(seed) {
  const s = (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');
  return s.slice(-6);
}

// 每日挑战规则：关卡固定第一关、难度固定噩梦、两条诅咒
export const DAILY_RULES = {
  levelId: 1,
  diff: 'nightmare',
  curseCount: 2,
  boneMul: 1.25,        // 和 campfire.js 的 BONE.dailyMul 保持一致，UI 文案共用
};

// 从诅咒表里按种子挑 n 条（洗牌取前 n 张，顺序固定）。
// 用独立的 salt 流，不占用主随机流 —— 加一条诅咒不会让今天的商店换货。
export function pickDailyCurses(seed, table, n = DAILY_RULES.curseCount) {
  const ids = table.map((c) => c.id);
  const rng = makeRng((seed ^ 0x5bf03635) >>> 0);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.max(0, Math.min(n, ids.length)));
}

// ---------------- 每日战绩（本机） ----------------
const DAILY_KEY = 'naiwa_rouge_daily_v1';

function loadAll() {
  try {
    const v = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
    return v && typeof v === 'object' && v.days && typeof v.days === 'object' ? v : { days: {} };
  } catch (_) {
    return { days: {} };
  }
}

function saveAll(all) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(all)); } catch (_) { /* 隐私模式就算了 */ }
  return all;
}

export function dailyRecord(key = dayKey()) {
  return loadAll().days[key] || null;
}

// 只记「今天」的一天一条，胜负都记，但同一天取更好的那次：
// 通关优先，其次回合，其次击杀
export function saveDailyRecord(payload, key = dayKey()) {
  const all = loadAll();
  const old = all.days[key] || null;
  const better = !old
    || (payload.win && !old.win)
    || (!!payload.win === !!old.win && payload.round > (old.round || 0))
    || (!!payload.win === !!old.win && payload.round === (old.round || 0) && payload.kills > (old.kills || 0));
  if (better) {
    all.days[key] = {
      win: !!payload.win,
      round: Math.max(0, payload.round | 0),
      kills: Math.max(0, payload.kills | 0),
      time: Number.isFinite(payload.time) ? payload.time : null,
      seed: payload.seed >>> 0,
      at: Date.now(),
    };
    saveAll(all);
    return { record: all.days[key], improved: true };
  }
  return { record: old, improved: false };
}

// 只留最近 30 天，别让 localStorage 无限长（一天一条，本来也不大）
export function pruneDaily(keep = 30) {
  const all = loadAll();
  const keys = Object.keys(all.days).sort();
  while (keys.length > keep) {
    delete all.days[keys.shift()];
  }
  saveAll(all);
  return Object.keys(all.days).length;
}

export function dailyCount() {
  return Object.keys(loadAll().days).length;
}

// ---------------- 自定义种子挑战（第 49 块） ----------------
// 玩家随手输入一串字（「奶蛙666」也行、乱敲也行）→ 加盐哈希成 32 位种子。
// 种子决定三选一 / 商店 / 奇遇 / 掉钱这些「抽什么」；关卡、难度、诅咒
// 由战绩自动匹配（用户定案：实力和难度要相配，公式简单直白）。

export function seedFromText(text) {
  return hashStr(`naiwa-rouge-seed:${String(text).trim()}`);
}

// 难度匹配（records = loadRecords() 的战绩表）：
//   总通关 wins        → 难度：0~1 普通 / 2~5 困难 / ≥6 噩梦
//   第二关是否解锁     → 通关过第一关（wins≥3 且解锁）才去第二关
//   诅咒条数           → 0 / 1 / 2 随 wins 分段（诅咒由种子从表里挑）
export function pickSeedRules(seed, records, curseTable) {
  let wins = 0;
  for (const k in records) wins += (records[k]?.wins || 0) | 0;
  const lvl2Open = ((records[1]?.wins) | 0) > 0;
  const levelId = lvl2Open && wins >= 3 ? 2 : 1;
  const diff = wins >= 6 ? 'nightmare' : wins >= 2 ? 'hard' : 'normal';
  const curseCount = wins >= 6 ? 2 : wins >= 2 ? 1 : 0;
  const curses = curseCount > 0 ? pickDailyCurses(seed, curseTable, curseCount) : [];
  return { levelId, diff, curses, wins };
}

// ---------------- 种子游玩记录（本机） ----------------
const SEED_KEY = 'naiwa_rouge_seeds_v1';

function loadSeedsRaw() {
  try {
    const v = JSON.parse(localStorage.getItem(SEED_KEY) || '{}');
    return v && typeof v === 'object' && v.runs ? v : { runs: {} };
  } catch (_) {
    return { runs: {} };
  }
}

export function loadSeedRecords() {
  const { runs } = loadSeedsRaw();
  return Object.values(runs)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

// 一颗种子一条记录，取更好的那次（通关优先 → 回合 → 击杀），与每日挑战同款比较
export function saveSeedRecord(payload) {
  const all = loadSeedsRaw();
  const code = payload.code;
  const old = all.runs[code] || null;
  const better = !old
    || (payload.win && !old.win)
    || (!!payload.win === !!old.win && (payload.round | 0) > (old.round | 0))
    || (!!payload.win === !!old.win && (payload.round | 0) === (old.round | 0) && (payload.kills | 0) > (old.kills | 0));
  if (better) {
    all.runs[code] = {
      code,
      text: String(payload.text || '').slice(0, 24),
      seed: payload.seed >>> 0,
      win: !!payload.win,
      round: Math.max(0, payload.round | 0),
      kills: Math.max(0, payload.kills | 0),
      time: Number.isFinite(payload.time) ? payload.time : null,
      level: payload.level | 0,
      diff: String(payload.diff || ''),
      at: Date.now(),
    };
    try { localStorage.setItem(SEED_KEY, JSON.stringify(all)); } catch (_) { /* 隐私模式就算了 */ }
    return { record: all.runs[code], improved: true };
  }
  return { record: old, improved: false };
}

// 只留最近 40 条
export function pruneSeeds(keep = 40) {
  const all = loadSeedsRaw();
  const list = Object.values(all.runs).sort((a, b) => (b.at || 0) - (a.at || 0));
  for (const r of list.slice(keep)) delete all.runs[r.code];
  try { localStorage.setItem(SEED_KEY, JSON.stringify(all)); } catch (_) { /* 同上 */ }
  return list.length;
}
