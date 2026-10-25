// ============================================================
// saveIO.js —— 存档导出 / 导入（第 78 块）
//
// 用户第 11 条：「清缓存不丢档能不能实现」。
// 结论：**完全自动免疫做不到** —— 浏览器清缓存 / 换设备 / 换浏览器时，
// 页面自己没有任何办法把 localStorage 保住（没有跨设备的持久存储、
// 也不能偷偷写到用户的网盘）。所以只能给一条「手动备份」的路：
// 把有价的东西打成一份文件 / 一串码，换设备时导回来。
//
// 只导「真正有价的」：
//   进度（篝火 / 骨币 / 永夜火种 / 图鉴 / 成就 / 战绩 / 剧情 / 在途局 / 签到记录）
// 故意不导：
//   naiwa_rouge_audio_v1   音量 / 静音 —— 换台设备本来就该重调
//   naiwa_rouge_admin_v1   管理员标记 —— 别跟着存档到处跑
//   naiwa_rouge_notice_v1 / promo_v1   公告、宣传已读 —— 换机器该重看一遍
//   profile.settings       （音量 / 画质 / 摇杆尺寸位置 / 震动 / 速度感）导出时剥掉，
//                          导入时沿用本机那份，不然会把别人手机的摇杆尺寸搬过来
//
// 本文件**不碰 DOM**（下载按钮、弹窗都在 main.js），这样 Node 里能直接跑契约测试。
// ============================================================

const APP = 'naiwa-rouge';
const FORMAT = 1;
const MAGIC = 'NWSAVE1:';

const K_PROFILE = 'naiwa_rouge_profile_v1';
const K_RECORDS = 'naiwa_rouge_records_v1';
const K_RUNS = 'naiwa_rouge_runs_v1';
const K_DAILY = 'naiwa_rouge_daily_v1';
const K_SEEDS = 'naiwa_rouge_seeds_v1';
const K_WTUT = 'naiwa_rouge_wtut_v1';

export const SAVE_MAGIC = MAGIC;
export const SAVE_FORMAT = FORMAT;
export const IO_KEYS = [K_PROFILE, K_RECORDS, K_RUNS, K_DAILY, K_SEEDS, K_WTUT];
// 导入时允许被覆盖的键（就是 IO_KEYS，单独列出来是为了让「不许导入的键」一目了然）
export const NEVER_IMPORT_KEYS = ['naiwa_rouge_audio_v1', 'naiwa_rouge_admin_v1',
  'naiwa_rouge_notice_v1', 'naiwa_rouge_promo_v1'];

// ---------- base64（UTF-8 安全：store 里可能有中文，btoa 直接吃会把非 Latin1 炸掉） ----------
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CH = 0x8000;             // 一次别拼太长，大存档也能过
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function read(k) {
  try { return localStorage.getItem(k); } catch (_) { return null; }
}

function parseJson(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

// profile 里剥掉设备设置（settings 块）。其余整块原样带走。
function stripProfileSettings(raw) {
  const p = parseJson(raw);
  if (!p || typeof p !== 'object') return raw;
  delete p.settings;
  return JSON.stringify(p);
}

// 当前游戏版本号：从加载本模块的那个 script 标签上读 ?v=N（读不到就返回 ''，只作诊断用）
function gameVer() {
  try {
    const s = document.querySelector('script[type="module"][src*="main.js"]');
    const m = s && s.src.match(/[?&]v=(\d+)/);
    return m ? m[1] : '';
  } catch (_) { return ''; }
}

// ------------------------------------------------------------
// 导出
// ------------------------------------------------------------
export function snapshot() {
  const data = {};
  for (const k of IO_KEYS) {
    const raw = read(k);
    if (raw == null) continue;
    data[k] = (k === K_PROFILE) ? stripProfileSettings(raw) : raw;
  }
  return {
    app: APP, kind: 'save', ver: FORMAT,
    at: new Date().toISOString(),
    game: gameVer(),
    data,
  };
}

// 给「导出文件」用：人能看懂的 JSON
export function payloadJson(payload) {
  return JSON.stringify(payload, null, 2);
}

// 给「复制存档码」用：一整串 base64，微信里发给自己也不会被截断（没有换行、没有空格）
export function payloadCode(payload) {
  return MAGIC + b64encode(JSON.stringify(payload));
}

export function fileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return '蛙步夜行-存档-' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate())
    + '-' + p(now.getHours()) + p(now.getMinutes()) + '.json';
}

// ------------------------------------------------------------
// 导入：校验
// ------------------------------------------------------------
export function validate(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, err: '这不是存档数据' };
  if (p.app !== APP) return { ok: false, err: '这不是《蛙步 · 夜行》的存档' };
  if (!p.data || typeof p.data !== 'object' || Array.isArray(p.data)) return { ok: false, err: '存档里没有数据' };
  if (p.data[K_PROFILE] == null) return { ok: false, err: '存档缺少进度数据' };
  const prof = parseJson(p.data[K_PROFILE]);
  if (!prof || typeof prof !== 'object' || Array.isArray(prof)) return { ok: false, err: '进度数据已损坏' };
  const ver = Number(p.ver);
  if (!Number.isFinite(ver) || ver < 1) return { ok: false, err: '存档格式标记不对' };
  if (ver > FORMAT) return { ok: false, err: '这份存档来自更新版本的游戏，先把游戏更新到最新再导入' };
  return { ok: true, payload: p };
}

// 一串码 → 存档。容错：粘进来的码常带空格 / 换行（微信转发会自动折行）
export function parseText(txt) {
  let s = String(txt == null ? '' : txt).replace(/\s+/g, '');
  if (!s) return { ok: false, err: '存档码是空的' };
  if (s.toUpperCase().startsWith(MAGIC)) s = s.slice(MAGIC.length);
  if (!s) return { ok: false, err: '存档码里没有内容（只有前缀）' };
  let json;
  try { json = b64decode(s); } catch (_) { return { ok: false, err: '这段码读不出来 —— 可能复制时少了一截' }; }
  const p = parseJson(json);
  if (!p) return { ok: false, err: '存档码内容已损坏' };
  return validate(p);
}

// 一个 .json 文件的内容 → 存档
export function parseJsonFile(txt) {
  const p = parseJson(txt);
  if (!p) return { ok: false, err: '这个文件不是 JSON' };
  return validate(p);
}

// 两种都认（导入框里既可以粘码，也可以粘 JSON 全文）
export function parseAny(txt) {
  const s = String(txt == null ? '' : txt).trim();
  if (!s) return { ok: false, err: '内容是空的' };
  if (s.toUpperCase().startsWith(MAGIC)) return parseText(s);
  if (s.charAt(0) === '{') return parseJsonFile(s);
  return parseText(s);
}

// ------------------------------------------------------------
// 导入：摘要（确认弹窗里给玩家看「这份存档里有什么」）
// ------------------------------------------------------------
export function summarize(p) {
  const data = (p && p.data) || {};
  const prof = parseJson(data[K_PROFILE]) || {};
  const camp = prof.camp || {};
  const campLv = Object.values(camp).reduce((a, b) => a + (Number(b) || 0), 0);
  const boons = prof.boons || {};
  const boonLv = Object.values(boons).reduce((a, b) => a + (Number(b) || 0), 0);
  const codex = prof.codex || {};
  const stats = prof.stats || {};
  const runs = parseJson(data[K_RUNS]);
  return {
    at: String(p.at || ''),
    game: String(p.game || ''),
    bones: Number(prof.bones) || 0,
    campLv,
    boonLv,
    boonKinds: Object.keys(boons).length,
    enemies: Object.keys(codex.enemies || {}).length,
    cards: Object.keys(codex.cards || {}).length,
    ach: Object.keys(prof.ach || {}).length,
    runs: Array.isArray(runs) ? runs.length : 0,
    wins: Number(stats.wins) || 0,
    kills: Number(stats.kills) || 0,
    story: Object.keys((prof.story || {}).seen || {}).length,
  };
}

// ------------------------------------------------------------
// 导入：落地
// 只覆盖 IO_KEYS 里出现过的键；没出现的保留本机的（不清空、不合并）。
// profile 的 settings 用**本机**那份覆盖回去。
// ------------------------------------------------------------
export function apply(p) {
  const v = validate(p);
  if (!v.ok) return v;
  const data = p.data;
  const written = [];
  for (const k of IO_KEYS) {
    if (data[k] == null) continue;
    let out = String(data[k]);
    if (k === K_PROFILE) {
      const incoming = parseJson(out);
      if (!incoming) return { ok: false, err: '进度数据已损坏' };
      const local = parseJson(read(K_PROFILE)) || {};
      if (local.settings) incoming.settings = local.settings;
      out = JSON.stringify(incoming);
    }
    try { localStorage.setItem(k, out); } catch (_) {
      return { ok: false, err: '写入失败 —— 可能是隐私模式，或者浏览器存储已满' };
    }
    written.push(k);
  }
  return { ok: true, payload: p, written };
}
