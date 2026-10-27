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
// 第 97 块（用户第 4 条）：**存档码太长了**。
// 以前是「JSON → base64」，base64 本身还要涨 33%，一份玩到第九关的档轻松四五万字符，
// 手机复制 / 粘贴根本吃不下。现在改成「JSON → LZ77 → base64url」：
//   · LZ77 吃的是存档里大量重复的键名（"enemies" / "cards" / "story" …），
//     实测一份完整档能压到原 JSON 的三分之一上下；
//   · base64url 不涨体积太多（本来就是 4/3），而且**没有 + / =**，
//     不会在聊天软件、输入框、URL 里被转义或截断。
// 老的明文码（NWSAVE1:）继续认 —— 玩家的旧备份不能因为改格式就作废。
const MAGIC = 'NWSZ1:';
const MAGIC_RAW = 'NWSAVE1:';

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
  'naiwa_rouge_notice_v1', 'naiwa_rouge_promo_v1',
  // 第 97 块：本机自动备份槽。它是「存档的副本」而不是存档本身，导入/导出都不该带上它
  'naiwa_rouge_autobak_v1'];

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

// ------------------------------------------------------------
// 第 97 块：LZ77 压缩（自己写的，不引任何库 —— 项目是零依赖静态站）
//
// 字节流格式（解一对就懂）：
//   tag < 0x80   → 字面量 run：(tag+1) 个原始字节跟在后面
//   tag >= 0x80  → 回指：(tag & 0x7f) + 3 个字节，距离 = 后两个字节拼成的 16 位数
// 窗口 4095、单次最多复制 130 字节 —— 存档是 JSON，键名反复出现，这种参数够用。
// ------------------------------------------------------------
const LZ_WIN = 16383;
const LZ_MAX = 130;

function lzCompress(bytes) {
  const n = bytes.length;
  const out = [];
  const table = new Map();      // 3 字节键 → 最近若干位置（最多 8 个，够贪心）
  const keyAt = (p) => (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
  const put = (p, v) => {
    const a = table.get(p);
    if (a) { a.push(v); if (a.length > 8) a.shift(); } else table.set(p, [v]);
  };
  let litStart = 0;
  const flushLit = (end) => {
    let p = litStart;
    while (p < end) {
      const run = Math.min(128, end - p);
      out.push(run - 1);
      for (let k = 0; k < run; k++) out.push(bytes[p + k]);
      p += run;
    }
  };
  let i = 0;
  while (i + 2 < n) {
    const k = keyAt(i);
    const cands = table.get(k);
    let bestLen = 0, bestD = 0;
    if (cands) {
      for (let c = cands.length - 1; c >= 0; c--) {
        const p = cands[c];
        const d = i - p;
        if (d <= 0 || d > LZ_WIN) continue;
        let len = 0;
        const max = Math.min(LZ_MAX, n - i);
        while (len < max && bytes[p + len] === bytes[i + len]) len++;
        if (len > bestLen) { bestLen = len; bestD = d; if (len >= 96) break; }
      }
    }
    put(k, i);
    if (bestLen >= 3) {
      flushLit(i);
      out.push(0x80 | (bestLen - 3));
      out.push((bestD >> 8) & 0xff);
      out.push(bestD & 0xff);
      for (let k2 = 1; k2 < bestLen; k2++) if (i + k2 + 2 < n) put(keyAt(i + k2), i + k2);
      i += bestLen;
      litStart = i;
    } else {
      i++;
    }
  }
  flushLit(n);
  return Uint8Array.from(out);
}

function lzDecompress(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i++];
    if (tag < 0x80) {
      const len = tag + 1;
      for (let k = 0; k < len && i < bytes.length; k++) out.push(bytes[i++]);
    } else {
      if (i + 1 >= bytes.length) break;
      const len = (tag & 0x7f) + 3;
      const d = (bytes[i] << 8) | bytes[i + 1];
      i += 2;
      const start = out.length - d;
      if (start < 0) throw new Error('bad match');
      for (let k = 0; k < len; k++) out.push(out[start + k]);
    }
  }
  return Uint8Array.from(out);
}

// base64url：没有 + / =，扔进任何输入框、聊天窗口、URL 都不会变形
const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function bytesToB64u(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = u8[i + 1], c = u8[i + 2];
    s += B64U[a >> 2];
    s += B64U[((a & 3) << 4) | ((b || 0) >> 4)];
    if (i + 1 < u8.length) s += B64U[(((b || 0) & 15) << 2) | ((c || 0) >> 6)];
    if (i + 2 < u8.length) s += B64U[(c || 0) & 63];
  }
  return s;
}
function b64uToBytes(s) {
  const idx = (ch) => {
    const v = B64U.indexOf(ch);
    if (v < 0) throw new Error('bad b64');
    return v;
  };
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = idx(s[i]);
    const b = s[i + 1] != null ? idx(s[i + 1]) : 0;
    const c = s[i + 2] != null ? idx(s[i + 2]) : 0;
    const d = s[i + 3] != null ? idx(s[i + 3]) : 0;
    out.push((a << 2) | (b >> 4));
    if (s[i + 2] != null) out.push(((b & 15) << 4) | (c >> 2));
    if (s[i + 3] != null) out.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(out);
}

// 给「复制存档码」用：一整串压缩码，没有换行没有空格
export function payloadCode(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return MAGIC + bytesToB64u(lzCompress(bytes));
}

// 第 97 块：把长码切成人能一段段复制的片段。
// 手机上「全选整段」经常被输入框 / 剪贴板截断，切成 700 字符一段后
// 每段单独复制都不会出问题；导入时按顺序粘进去，会自己拼回来。
export const CODE_CHUNK = 700;
export function chunkCode(code, size = CODE_CHUNK) {
  const out = [];
  for (let i = 0; i < code.length; i += size) out.push(code.slice(i, i + size));
  return out;
}

// 压缩率（只给提示文案用，测试也拿它断言）
export function codeStats(payload) {
  const json = JSON.stringify(payload);
  const code = payloadCode(payload);
  return {
    json: json.length,
    code: code.length,
    chunks: chunkCode(code).length,
    ratio: json.length ? +(code.length / json.length).toFixed(3) : 0,
  };
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
  const up = s.toUpperCase();
  let compressed = false;
  if (up.startsWith(MAGIC)) { s = s.slice(MAGIC.length); compressed = true; }
  else if (up.startsWith(MAGIC_RAW)) { s = s.slice(MAGIC_RAW.length); }
  if (!s) return { ok: false, err: '存档码里没有内容（只有前缀）' };
  let json;
  try {
    json = compressed
      ? new TextDecoder().decode(lzDecompress(b64uToBytes(s)))
      : b64decode(s);
  } catch (_) {
    return { ok: false, err: '这段码读不出来 —— 可能复制时少了一截' };
  }
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
  const up = s.toUpperCase();
  if (up.startsWith(MAGIC) || up.startsWith(MAGIC_RAW)) return parseText(s);
  if (s.charAt(0) === '{') return parseJsonFile(s);
  return parseText(s);
}

// ------------------------------------------------------------
// 第 97 块（用户第 4 条）：**本机自动备份槽**
//
// 用户的原话是「能不能直接存储本机」。老实说浏览器没有「写用户手机文件夹」这种权力，
// 能自动做的只有「再多存几份在自己的存储里」：
//   · 每打完一回合、每次通关，自动把当时那份快照压进 `naiwa_rouge_autobak_v1`；
//   · 只留最近 3 份（3 份已经能挡住「手滑重置 / 一局打崩了覆盖好档」）；
//   · 清缓存时它和主存档一起没 —— 它防的是误操作，**不防清缓存**，文案必须说清。
// 存档本身是字符串（profile 那份是 JSON 文本），这里原样存，不做二次转换。
// ------------------------------------------------------------
const K_AUTO = 'naiwa_rouge_autobak_v1';
export const AUTO_SLOTS = 3;

function readAuto() {
  const p = parseJson(read(K_AUTO));
  return Array.isArray(p) ? p.filter((x) => x && x.data && x.data[K_PROFILE]) : [];
}

// 自动存一份（同一秒内重复调用只保留最后一份，别把槽位浪费在同一个瞬间）
export function pushAuto(payload) {
  if (!payload || !payload.data) return { ok: false, err: '没有可存的数据' };
  const list = readAuto();
  const now = Date.now();
  if (list.length && now - (list[list.length - 1].ts || 0) < 800) list.pop();
  list.push({ ts: now, at: payload.at || new Date(now).toISOString(), game: payload.game || '', data: payload.data });
  while (list.length > AUTO_SLOTS) list.shift();
  try { localStorage.setItem(K_AUTO, JSON.stringify(list)); } catch (_) {
    return { ok: false, err: '写不进去 —— 浏览器存储可能满了' };
  }
  return { ok: true, count: list.length };
}

// 给设置页看的摘要（按时间倒序，最近的在前）
export function listAuto() {
  return readAuto().slice().reverse().map((x) => {
    const prof = parseJson(x.data[K_PROFILE]) || {};
    const camp = prof.camp || {};
    const campLv = Object.values(camp).reduce((a, b) => a + (Number(b) || 0), 0);
    return {
      ts: x.ts || 0,
      at: String(x.at || ''),
      bones: Number(prof.bones) || 0,
      campLv,
      ach: Object.keys(prof.ach || {}).length,
    };
  });
}

// 取回第 i 份（0 = 最新）
export function getAuto(i) {
  const list = readAuto().slice().reverse();
  const x = list[i | 0];
  if (!x) return null;
  return { app: APP, kind: 'save', ver: FORMAT, at: x.at, game: x.game, data: x.data };
}

export function clearAuto() {
  try { localStorage.removeItem(K_AUTO); } catch (_) { /* 忽略 */ }
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
