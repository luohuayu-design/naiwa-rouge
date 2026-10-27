// ============================================================
// dailyQuest.js —— 每日任务（第 94 块）
//
// 用户定案的结构：**简单 3 条（其中「完整通过任一关卡」是常驻，每天必有）
// + 中等 1 条 + 困难 1 条**，共 5 条。中等 / 困难 与另外两条简单任务都从一个
// 池子里随机抽，跨天就换一批。奖励：简单 30 / 中等 80 / 困难 150 骨币，
// 全清一天 320 骨币（克制档 —— 见下面 DQ_TIERS 的注释）。
//
// ============ 为什么奖励要手动领 ============
// 进度是自动记的（打完就算），但骨币要玩家自己点「领取」。
// 自动发放的话玩家根本不知道自己赚了多少，也不会在标题页停留 ——
// 而标题页停留正是每日任务和成就面板存在的前提。可领时 tab 上亮红点。
//
// ============ 存档 ============
// 存在 profile().dq（profile 本来就在存档导入导出名单里，跟着走）：
//   { day:'2026-10-26', picked:[id...], c:{ 计数器 }, got:{ id: 时间戳 } }
// 跨天 = day 变了 → 整个重掷（计数器清零、没领的奖励作废）。
//
// ⚠️ 抽签用**日期哈希**而不是 Math.random：玩家一天里刷新十次网页，看到的
//    必须是同一批任务（和种子挑战一个道理，见 seed.js）。
//
// ⚠️ dqPump 只在「有任务刚好达成」的那一帧才落盘。一场战斗要杀几百只怪，
//    每杀一只写一次 localStorage 会让老手机掉帧 —— 进度在一局没打完时
//    丢了也不影响（反正是半成品），但**达成时那一次必须写**，否则玩家
//    关掉网页回来会发现“明明做完了却没算”。
// ============================================================

import { profile, save, addBones, bones } from './profile.js?v=107';

// ---------------- 三档难度 ----------------
// 第 94 块定案用**克制档**：木匣首价 30、金匣 280。一天全清 320 骨币 ≈
// 一个金匣多一点，不会把盲盒那套靠成本兜底的平衡冲掉。
export const DQ_TIERS = [
  { id: 'easy', name: '简单', bones: 30, icon: 'assets/icons/quest-easy.svg' },
  { id: 'mid', name: '中等', bones: 80, icon: 'assets/icons/quest-mid.svg' },
  { id: 'hard', name: '困难', bones: 150, icon: 'assets/icons/quest-hard.svg' },
];
export const DQ_BONES = Object.fromEntries(DQ_TIERS.map((t) => [t.id, t.bones]));
export function dqTier(id) { return DQ_TIERS.find((t) => t.id === id) || DQ_TIERS[0]; }

// ---------------- 计数器 ----------------
// 值只有两种累加语义：sum（一天内累计）/ max（取单局最高）。
// 写反了会很难查：「单局打到第 15 回合」用 sum 的话，打两局第 8 回合就满了。
const AGG = {
  kills: 'sum', runs: 'sum', wins: 'sum', potions: 'sum',
  events: 'sum', shopBuys: 'sum', curseWins: 'sum', hellWins: 'sum', fast7: 'sum',
  roundMax: 'max', killRunMax: 'max', coinMax: 'max', cardsMax: 'max',
  swordMax: 'max', clearLv: 'max', hellRoundMax: 'max', flawlessRunMax: 'max',
};
// 按怪种分别记的击杀（键形如 'kT:minion'），一律 sum
const KILL_KIND = (type) => `kT:${type}`;

// ---------------- 任务池 ----------------
// 常驻那条每天都出，不进随机池（否则玩家可能一整天都拿不到「通关」）。
export const DQ_PINNED = ['dq_clear_any'];

export const DQ_POOL = [
  // ===== 简单 =====
  { id: 'dq_clear_any', tier: 'easy', metric: 'wins', need: 1,
    name: '完整通过任一关卡', desc: '通关一次（哪一关都行，倒下不算）' },
  { id: 'dq_kill_minion', tier: 'easy', metric: KILL_KIND('minion'), need: 10,
    name: '击倒 10 只骷髅小兵', desc: '冲到脸上自爆的那种，满地都是' },
  { id: 'dq_kill_50', tier: 'easy', metric: 'kills', need: 50,
    name: '击倒 50 只骷髅', desc: '什么种类都算，一天打两局就够了' },
  { id: 'dq_kill_warrior', tier: 'easy', metric: KILL_KIND('warrior'), need: 15,
    name: '击倒 15 只骷髅战士', desc: '慢慢挪过来挥拳的那种' },
  { id: 'dq_round_6', tier: 'easy', metric: 'roundMax', need: 6,
    name: '单局打到第 6 回合', desc: '一局之内，撑过前六波' },
  { id: 'dq_runs_2', tier: 'easy', metric: 'runs', need: 2,
    name: '打完 2 局', desc: '倒下也算，不用通关' },
  { id: 'dq_coins_120', tier: 'easy', metric: 'coinMax', need: 120,
    name: '单局攒到 120 金币', desc: '边跑边捡，一局就能凑够' },
  { id: 'dq_shop_3', tier: 'easy', metric: 'shopBuys', need: 3,
    name: '在商店买 3 件东西', desc: '药水也算，同一家店可以连着买' },
  { id: 'dq_potion_2', tier: 'easy', metric: 'potions', need: 2,
    name: '喝 2 瓶药水', desc: '背包里那两格，别忘了用' },
  { id: 'dq_card_6', tier: 'easy', metric: 'cardsMax', need: 6,
    name: '一局拿到 6 张升级卡', desc: '回合清空就有一次三选一' },
  { id: 'dq_event_3', tier: 'easy', metric: 'events', need: 3,
    name: '遇到 3 次随机事件', desc: '夜行奇遇，回合结束会自己弹' },
  { id: 'dq_sword_6', tier: 'easy', metric: 'swordMax', need: 6,
    name: '环上同时挂 6 把剑', desc: '商店里的剑可以一直买，环没有上限' },
  { id: 'dq_kill_run_80', tier: 'easy', metric: 'killRunMax', need: 80,
    name: '单局击倒 80 只', desc: '一局之内，别中途存档退出' },

  // ===== 中等 =====
  { id: 'dq_m_lv2', tier: 'mid', metric: 'clearLv', need: 2,
    name: '通关第 2 关及以后', desc: '骨塔庭院那一关往后，随便哪一关' },
  { id: 'dq_m_round15', tier: 'mid', metric: 'roundMax', need: 15,
    name: '单局打到第 15 回合', desc: '一局之内，别死在第 14 回合' },
  { id: 'dq_m_kill150', tier: 'mid', metric: 'killRunMax', need: 150,
    name: '单局击倒 150 只', desc: '一局之内，后面的回合怪很密' },
  { id: 'dq_m_hell10', tier: 'mid', metric: 'hellRoundMax', need: 10,
    name: '噩梦 / 地狱难度打到第 10 回合', desc: '开一局高难度，撑过前十波' },
  { id: 'dq_m_curse', tier: 'mid', metric: 'curseWins', need: 1,
    name: '带至少一条诅咒通关', desc: '开局选诅咒，骨币倍率还能更高' },
  { id: 'dq_m_flawless2', tier: 'mid', metric: 'flawlessRunMax', need: 2,
    name: '一局里 2 个回合不掉血', desc: '两个回合，一次都别被碰到' },

  // ===== 困难 =====
  { id: 'dq_h_win2', tier: 'hard', metric: 'wins', need: 2,
    name: '一天内通关 2 次', desc: '两关，或者同一关打两遍' },
  { id: 'dq_h_lv5', tier: 'hard', metric: 'clearLv', need: 5,
    name: '通关第 5 关及以后', desc: '草甸路口往后，随便哪一关' },
  { id: 'dq_h_kill250', tier: 'hard', metric: 'killRunMax', need: 250,
    name: '单局击倒 250 只', desc: '一局之内，得打到很后面' },
  { id: 'dq_h_hell', tier: 'hard', metric: 'hellWins', need: 1,
    name: '在「地狱」难度下通关', desc: '最高难度，整关通关' },
  { id: 'dq_h_fast7', tier: 'hard', metric: 'fast7', need: 1,
    name: '7 分钟内通关', desc: '打得快比打得稳难' },
];

const BY_ID = Object.fromEntries(DQ_POOL.map((t) => [t.id, t]));

// ---------------- 日期 ----------------
function pad2(n) { return String(n).padStart(2, '0'); }
export function dayKeyOf(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 日期 → 32 位种子（和 seed.js 同款 FNV-1a，但各走各的流，互不影响）
function daySeed(k) {
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- 抽签 ----------------
// 简单抽 2 条（常驻那条不参与）+ 中等 1 条 + 困难 1 条。
// 池子必须够大：简单池抽完常驻还剩 12 条，抽 2 条不会重复。
function rollTasks(day) {
  const rng = mulberry32(daySeed(day));
  const pick = (tier, n) => {
    const pool = DQ_POOL.filter((t) => t.tier === tier && !DQ_PINNED.includes(t.id));
    const out = [];
    const idx = pool.map((_, i) => i);
    for (let k = 0; k < n && idx.length; k++) {
      const j = Math.floor(rng() * idx.length);
      out.push(pool[idx[j]].id);
      idx.splice(j, 1);
    }
    return out;
  };
  return [...DQ_PINNED, ...pick('easy', 2), ...pick('mid', 1), ...pick('hard', 1)];
}

// ---------------- 状态 ----------------
// 唯一会修正 profile().dq 结构的地方；跨天就重掷。
export function dqState(now = new Date()) {
  const p = profile();
  if (!p.dq || typeof p.dq !== 'object') p.dq = { day: '', picked: [], c: {}, got: {} };
  const s = p.dq;
  if (!Array.isArray(s.picked)) s.picked = [];
  if (!s.c || typeof s.c !== 'object') s.c = {};
  if (!s.got || typeof s.got !== 'object') s.got = {};
  const k = dayKeyOf(now);
  if (s.day !== k) {
    s.day = k;
    s.picked = rollTasks(k);
    s.c = {};
    s.got = {};
    save();
  }
  // 防御：池子里删掉过的任务 id 会从老档里漏出来，直接剔除
  s.picked = s.picked.filter((id) => BY_ID[id]);
  return s;
}

// 面板要的全部数据（含进度、是否达成、是否已领）
export function dqTasks(now = new Date()) {
  const s = dqState(now);
  return s.picked.map((id) => {
    const def = BY_ID[id];
    const cur = Number(s.c[def.metric]) || 0;
    const done = cur >= def.need;
    return {
      id, def,
      tier: def.tier,
      name: def.name,
      desc: def.desc,
      need: def.need,
      cur: Math.min(cur, def.need),
      done,
      got: !!s.got[id],
      bones: DQ_BONES[def.tier] || 0,
    };
  });
}

// ---------------- 进度累计 ----------------
// updates 形如 { kills: 1, 'kT:minion': 1, roundMax: 12 }
// 返回这次「刚好达成」的任务 id 列表（调用方据此弹提示）。
export function dqPump(updates, now = new Date()) {
  if (!updates) return [];
  const s = dqState(now);
  const before = {};
  for (const id of s.picked) before[id] = (Number(s.c[BY_ID[id].metric]) || 0) >= BY_ID[id].need;

  let touched = false;
  for (const [k, v] of Object.entries(updates)) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const kind = AGG[k] || (String(k).startsWith('kT:') ? 'sum' : null);
    if (!kind) continue;
    const cur = Number(s.c[k]) || 0;
    if (kind === 'max') {
      if (n > cur) { s.c[k] = n; touched = true; }
    } else {
      if (n !== 0) { s.c[k] = cur + n; touched = true; }
    }
  }
  if (!touched) return [];

  // 达成时那一帧落盘（见文件头注释：平时不写，达成必写）
  const hit = [];
  for (const id of s.picked) {
    const ok = (Number(s.c[BY_ID[id].metric]) || 0) >= BY_ID[id].need;
    if (ok && !before[id]) hit.push(id);
  }
  if (hit.length) save();
  return hit;
}

// 手动落盘（结算时调，把一整局的进度存住）
export function dqSave() { save(); }

// ---------------- 领取 ----------------
// 返回 { ok, bones } / { ok:false, reason:'notdone'|'got' }
export function dqClaim(id, now = new Date()) {
  const s = dqState(now);
  const def = BY_ID[id];
  if (!def || !s.picked.includes(id)) return { ok: false, reason: 'notdone' };
  if (s.got[id]) return { ok: false, reason: 'got' };
  if ((Number(s.c[def.metric]) || 0) < def.need) return { ok: false, reason: 'notdone' };
  s.got[id] = Date.now();
  const n = DQ_BONES[def.tier] || 0;
  addBones(n);
  return { ok: true, bones: n, total: bones() };
}

// 一键领完所有已达成未领的。返回 [{ id, bones }]
export function dqClaimAll(now = new Date()) {
  const s = dqState(now);
  const out = [];
  for (const id of s.picked) {
    const r = dqClaim(id, now);
    if (r.ok) out.push({ id, bones: r.bones });
  }
  return out;
}

// 还有几条「做好了但没领」—— tab 上的红点看这个
export function dqPending(now = new Date()) {
  return dqTasks(now).filter((t) => t.done && !t.got).length;
}

// 今天已经领了多少骨币（面板头部显示）
export function dqGained(now = new Date()) {
  const s = dqState(now);
  let n = 0;
  for (const id of Object.keys(s.got)) {
    const def = BY_ID[id];
    if (def) n += DQ_BONES[def.tier] || 0;
  }
  return n;
}

// 距离明天 0 点还有多少毫秒（面板上的倒计时）
export function dqMsLeft(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

// 任务名字（战斗里弹「每日任务达成」那句要用）
export function dqTaskName(id) {
  const d = BY_ID[id];
  return d ? d.name : id;
}

// 调试用：强制换一批任务（不清计数器），或者整条重置
export function dqForceReroll(now = new Date()) {
  const s = dqState(now);
  s.picked = rollTasks(dayKeyOf(now) + '#force');
  save();
  return s.picked;
}
export function dqReset() {
  const p = profile();
  p.dq = { day: '', picked: [], c: {}, got: {} };
  save();
  return p.dq;
}
