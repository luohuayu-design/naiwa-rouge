// ============================================================
// profile.js —— 本机档案（唯一的 localStorage 聚合层）
//
// 为什么要单独一个文件：这些数据要被「设置面板 / 图鉴 / 成就 /
// 结算 / 局外成长」五处同时读写，散在 main.js 里很快就互相踩。
//
// 键 naiwa_rouge_profile_v1 里存五块，互不干扰：
//   settings  设置：音量、画质、摇杆、震动
//   stats     全局累计：局数、击杀、时长、金币
//   codex     图鉴计数：{ enemies:{id:n}, cards:{}, swords:{}, relics:{}, events:{} }
//   ach       成就：{ id: 解锁时间戳 }
//   bones     夜行骨币（局外货币，第 19 块篝火用）
//   camp      篝火各簇的等级 { id: 3 }（第 19 块；第 23 块起可升到 3 级）
//   boons     永夜火种 { id: 层数 }（第 23 块，通关白给的永久属性）
//   boonPending 还没领的永久选择次数（通关 +3，关网页也不丢）
//
// 读不出来（隐私模式 / 老浏览器 / 存档损坏）就退回内存对象，
// 游戏照常能玩，只是这一局结束后数据不落地。
// ============================================================

const KEY = 'naiwa_rouge_profile_v1';

// 记录（分关卡战绩）与武器教程沿用各自的老键，不往这里搬：
//   naiwa_rouge_records_v1 / naiwa_rouge_wtut_v1
export const RESET_KEYS = [
  KEY, 'naiwa_rouge_records_v1', 'naiwa_rouge_wtut_v1', 'naiwa_rouge_runs_v1',
  'naiwa_rouge_notice_v1', 'naiwa_rouge_daily_v1', 'naiwa_rouge_seeds_v1',
];

export const DEFAULT_SETTINGS = {
  sfx: 0.8,          // 音效音量 0~1
  music: 0.55,       // 音乐音量 0~1
  quality: 'high',   // high | mid | low
  joySize: 'mid',    // small | mid | large
  joyHand: 'left',   // left | right
  shake: true,       // 屏幕震动 / 受击抖屏
  speedFov: true,    // 速度感：跑起来视野微微拉宽（第 36 块；晕的人可以关掉）
  admin: false,      // 历史遗留占位键（第 30 块）；实际开关已移到独立键 naiwa_rouge_admin_v1，见 main.js
};

const DEFAULT_PROFILE = {
  v: 1,
  settings: { ...DEFAULT_SETTINGS },
  stats: { runs: 0, wins: 0, kills: 0, seconds: 0, coins: 0, dmgTaken: 0, cards: {} },
  codex: { enemies: {}, cards: {}, swords: {}, relics: {}, events: {} },
  ach: {},
  bones: 0,
  camp: {},          // 篝火：各簇等级（第 19 块；第 23 块起 0~3）
  boons: {},         // 永夜火种：各卡层数（第 23 块）
  boonPending: 0,    // 待领的永久选择次数（第 23 块）
  // 主线进度（第 32 块）：看过哪几夜、三次印记各交了几回、最后落在哪个结局
  //   seen   { s01: true }  局内**亲历**过的夜（局内调度只看这个）
  //   read   { s02: true }  在主菜单「夜行记忆」里读过的夜（只影响面板标记）
  //   marks  { laughter: 2, name: 1, memory: 0 }
  //   ending 第 18 夜读完后写下的结局 key（'' = 还没读终章）
  story: { seen: {}, read: {}, marks: {}, ending: '' },
  // 第 41 块：局外永久选择的「已读提示」标记。
  //   campfire 篝火首次进入前的那段说明看过了
  //   boon     永夜火种首次三选一前的说明看过了
  // 看过之后不再拦路，但界面上的常驻警示条一直在。
  notice: { campfire: false, boon: false },
  // 礼包兑换（第 44 块）：{ <兑换码哈希>: 兑换时间戳 }
  //   只存哈希，不存明文码；同一个哈希第二次进来就拦下 = 一码一次。
  gifts: {},
  // 音效包（第 46 块）：{ unlocked 通关第一关后解锁, id 当前用的那套 }
  //   id 是唯一真相源，audio.setPack() 只是把它推进音频引擎；
  //   解锁前设置里那两项是锁着的，点不动。
  voicePack: { unlocked: false, id: 'normal' },
  // 见过的怪（第 55 块）：{ minion: 首次遇到的时间戳 }。
  // 用来决定「新怪物信息卡」还要不要弹 —— 一种怪一辈子只拦一次，
  // 之后靠图鉴自己查。**不能用 codex.enemies 代替**：那是击倒数，
  // 遇到而没打死的怪在那边是 0。
  met: {},
  // 环剑「已经拿到过」（第 56 块）：第一关第 5 回合首次获得时置 true。
  // 之后从第二关起（含读档新开一局直接选后面的关卡）开局就送 3 把铁剑，
  // 不用再等那一关的第 5 回合。第一关自己仍保留「第 5 回合获得」的仪式时刻。
  ringGot: false,
};

let cache = null;

// 管理员沙盒（第 37 块扩展）：开启期间所有 save() 都不落地，
// 这样关卡进度 / 永夜火种 / 篝火 / 成就 / 记录全部留在内存里，
// 退出时 reloadFromStorage() 把内存丢掉、重新读本地档 = 一切回到开之前。
let suppressSave = false;
export function setSaveSuppressed(b) { suppressSave = !!b; }

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// 浅合并：只补缺失字段，不覆盖玩家已有的值（旧版本档案升级用）
function fill(target, def) {
  for (const k of Object.keys(def)) {
    if (target[k] == null) target[k] = clone(def[k]);
    else if (typeof def[k] === 'object' && !Array.isArray(def[k])) fill(target[k], def[k]);
  }
  return target;
}

export function profile() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { raw = null; }
  cache = raw && typeof raw === 'object' ? fill(raw, DEFAULT_PROFILE) : clone(DEFAULT_PROFILE);
  return cache;
}

export function save() {
  if (suppressSave) return profile();   // 管理员沙盒期：任何进度都不落地
  try { localStorage.setItem(KEY, JSON.stringify(profile())); } catch (_) { /* 写不进就算了 */ }
  return profile();
}

// 把内存里的缓存丢掉，从本地档（沙盒期从未被写过的那份）重新读回来。
// 管理员退出时用它「回滚」整段沙盒内的改动。
export function reloadFromStorage() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { raw = null; }
  cache = raw && typeof raw === 'object' ? fill(raw, clone(DEFAULT_PROFILE)) : clone(DEFAULT_PROFILE);
  return cache;
}

export function settings() {
  return profile().settings;
}

// 只接受白名单键，值按默认值的类型做一次转换（防止存档里塞进奇怪的东西）
export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) return null;
  const def = DEFAULT_SETTINGS[key];
  let v = value;
  if (typeof def === 'number') v = Math.max(0, Math.min(1, Number(v) || 0));
  if (typeof def === 'boolean') v = !!value;
  if (typeof def === 'string') v = String(value);
  profile().settings[key] = v;
  save();
  return v;
}

export function resetSettings() {
  profile().settings = { ...DEFAULT_SETTINGS };
  save();
  return settings();
}

// ---------------- 全局累计 ----------------
export function bumpStat(key, n = 1) {
  const s = profile().stats;
  s[key] = (Number(s[key]) || 0) + n;
  return s[key];
}

export function setStatMax(key, v) {
  const s = profile().stats;
  if (!(s[key] >= v)) s[key] = v;
  return s[key];
}

// 最常拿的卡：结算/选卡时 +1
export function countCard(id) {
  const c = profile().stats.cards;
  c[id] = (Number(c[id]) || 0) + 1;
  return c[id];
}

// ---------------- 图鉴 ----------------
export function codexAdd(group, id, n = 1) {
  const g = profile().codex[group];
  if (!g) return 0;
  g[id] = (Number(g[id]) || 0) + n;
  return g[id];
}

export function codexCount(group, id) {
  const g = profile().codex[group];
  return (g && Number(g[id])) || 0;
}

export function codexAll(group) {
  return profile().codex[group] || {};
}

// ---------------- 见过的怪（第 55 块） ----------------
// 注意：这不是「击倒过」，是「在场上遇见过」。首次遭遇卡只看这张表。
export function metLog() {
  const p = profile();
  if (!p.met || typeof p.met !== 'object') p.met = {};
  return p.met;
}

export function enemyMet(type) {
  return !!metLog()[type];
}

// 记一笔「见过了」。返回 true 表示这次是新纪录（调用方据此决定弹不弹卡）。
export function markEnemyMet(type) {
  const m = metLog();
  if (!type || m[type]) return false;
  m[type] = Date.now();
  save();
  return true;
}

// ---------------- 环剑「已拿到过」（第 56 块） ----------------
// 第一关第 5 回合首次获得时记下；之后的关卡开局直接送 3 把铁剑。
export function ringObtained() {
  return !!profile().ringGot;
}

// 记下「拿到过环剑」。重复调用无副作用（幂等）。
export function markRingObtained() {
  const p = profile();
  if (p.ringGot) return false;
  p.ringGot = true;
  save();
  return true;
}

// ---------------- 成就 ----------------
export function hasAch(id) {
  return !!profile().ach[id];
}

// 返回 true 表示「这次是新解锁」——调用方据此弹 toast
export function unlockAch(id) {
  const p = profile();
  if (p.ach[id]) return false;
  p.ach[id] = Date.now();
  save();
  return true;
}

// ---------------- 骨币 ----------------
export function bones() {
  return profile().bones || 0;
}

export function addBones(n) {
  const p = profile();
  p.bones = Math.max(0, (p.bones || 0) + n);
  save();
  return p.bones;
}

// ---------------- 礼包兑换（第 44 块） ----------------
export function giftLog() {
  const p = profile();
  if (!p.gifts || typeof p.gifts !== 'object') p.gifts = {};
  return p.gifts;
}

export function giftRedeemed(hash) {
  return !!giftLog()[hash];
}

// 记一笔「这个码本机已用」。返回兑换时间戳。
export function markGift(hash) {
  const g = giftLog();
  if (g[hash]) return g[hash];
  g[hash] = Date.now();
  save();
  return g[hash];
}

// ---------------- 主线（第 32 块） ----------------
// 只看不写「读过」，不存任何播放位置：章节是整章读的，没有中途状态。
export function storyProgress() {
  const p = profile();
  if (!p.story) p.story = { seen: {}, read: {}, marks: {}, ending: '' };
  if (!p.story.read) p.story.read = {};
  if (!p.story.seen) p.story.seen = {};
  if (!p.story.marks) p.story.marks = {};
  return p.story;
}

export function storySeen(id) {
  return !!storyProgress().seen[id];
}

export function markStorySeen(id) {
  const s = storyProgress();
  if (s.seen[id]) return false;
  s.seen[id] = true;
  save();
  return true;
}

// 面板里读过（和局内亲历分开记：读档案不会让局内那夜消失）
export function markStoryRead(id) {
  const s = storyProgress();
  if (s.read[id]) return false;
  s.read[id] = true;
  save();
  return true;
}

// 印记：笑声 / 名字 / 记忆各记一次
export function addStoryMark(kind) {
  const s = storyProgress();
  s.marks[kind] = (Number(s.marks[kind]) || 0) + 1;
  save();
  return s.marks[kind];
}

export function setStoryEnding(key) {
  const s = storyProgress();
  s.ending = key || '';
  save();
  return s.ending;
}

// ---------------- 清档 ----------------
export function resetAll() {
  for (const k of RESET_KEYS) {
    try { localStorage.removeItem(k); } catch (_) { /* 忽略 */ }
  }
  cache = clone(DEFAULT_PROFILE);
  save();
  return profile();
}
