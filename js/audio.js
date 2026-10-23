// ============================================================
// audio.js —— 音频引擎（BGM 流式播放 + 音效 WebAudio 缓冲）
//
// 为什么这么设计：
//   · 音效要「同时响、低延迟、能变调」→ 走 WebAudio（decodeAudioData 一次，
//     之后每次 new AudioBufferSourceNode，天然并发，改 playbackRate 就能变调）。
//   · BGM 要「流式、省内存、能交叉淡化」→ 走 HTMLAudioElement + loop，
//     两个 <audio> 轮流当 A/B 轨做淡入淡出，手机上比整段解码成 AudioBuffer 省得多。
//   · 浏览器/微信的自动播放限制：AudioContext 与 Audio.play() 都必须在**用户手势**
//     里解锁。所以进游戏先 init()（只建对象，不出声），第一次点屏幕时 unlock()。
//     解锁前请求的 BGM 会记在 wantBgm 里，解锁后自动补播。
//
// 素材：全部 CC0（见 assets/audio/LICENSE.md）
//   BGM  RezaParsian/free-sfx-bgm-pack（合成，CC0）
//   SFX  Kenney RPG Audio / UI Audio、RezaParsian、Beatscribe/homebrew_vgm
//   处理：音效去首尾静音 + 峰值归一 -3dBFS；BGM 尾部 2s 与开头交叉淡化做无缝循环，
//         RMS 归一 -18.5dBFS。脚本见 .tmp-audio-build.py（老 26 个）与
//         .tmp-audio-build2.py（第 25 块追加 7 个），都留在项目根，改素材时重跑。
//
// 第 46 块：多了一套「抽象奶蛙音效包」（js/voicepack.js 定义参数）。
//   包里不复制文件、不预裁切：同一段奶蛙叫声用 start(0, offset, dur) 现裁现播，
//   所以 buffer 缓存按**实际文件**存（'s:音效名' / 'v:文件名'），换包只换取哪份。
// ============================================================

import { VOICE_BASE, FROG_SFX } from './voicepack.js?v=66';

const BGM_BASE = 'assets/audio/bgm/';
const SFX_BASE = 'assets/audio/sfx/';

// BGM：name → 文件 + 基准音量（战斗要压得住音效，标题可以轻一点）
export const BGM_DEFS = {
  night: { file: 'bgm_night.mp3', vol: 0.55, desc: '标题 / 夜行底噪' },
  battle: { file: 'bgm_battle.mp3', vol: 0.42, desc: '战斗' },
  shop: { file: 'bgm_shop.mp3', vol: 0.45, desc: '商店 / 三选一 / 事件' },
};

// 音效：name → 文件 + 基准音量 + 变调幅度（jitter：每次播放 ±N 的音高，
// 避免同一声音连响几十次像机关枪）
export const SFX_DEFS = {
  swing: { file: 'swing.mp3', vol: 0.50, jitter: 0.08 },
  hit: { file: 'hit.mp3', vol: 0.70, jitter: 0.10 },
  crit: { file: 'crit.mp3', vol: 0.85, jitter: 0.04 },
  die: { file: 'die.mp3', vol: 0.60, jitter: 0.12 },
  explode: { file: 'explode.mp3', vol: 0.85, jitter: 0.06 },
  hurt: { file: 'hurt.mp3', vol: 0.90, jitter: 0 },
  coin: { file: 'coin.mp3', vol: 0.45, jitter: 0.10 },
  swordFire: { file: 'swordFire.mp3', vol: 0.60, jitter: 0.06 },
  swordHit: { file: 'swordHit.mp3', vol: 0.55, jitter: 0.10 },
  ice: { file: 'ice.mp3', vol: 0.45, jitter: 0.05 },
  thunder: { file: 'thunder.mp3', vol: 0.50, jitter: 0.06 },
  poison: { file: 'poison.mp3', vol: 0.30, jitter: 0.08 },
  heal: { file: 'heal.mp3', vol: 0.45, jitter: 0 },
  uiClick: { file: 'uiClick.mp3', vol: 0.45, jitter: 0 },
  uiSwitch: { file: 'uiSwitch.mp3', vol: 0.40, jitter: 0 },
  card: { file: 'card.mp3', vol: 0.55, jitter: 0 },
  buy: { file: 'buy.mp3', vol: 0.60, jitter: 0 },
  event: { file: 'event.mp3', vol: 0.70, jitter: 0 },
  upgrade: { file: 'upgrade.mp3', vol: 0.60, jitter: 0 },
  repDown: { file: 'repDown.mp3', vol: 0.55, jitter: 0 },
  roundStart: { file: 'roundStart.mp3', vol: 0.70, jitter: 0 },
  roundClear: { file: 'roundClear.mp3', vol: 0.70, jitter: 0 },
  boss: { file: 'boss.mp3', vol: 0.70, jitter: 0 },
  victory: { file: 'victory.mp3', vol: 0.75, jitter: 0 },
  defeat: { file: 'defeat.mp3', vol: 0.75, jitter: 0 },
  // 第 25 块追加（丰富音效）：补上以前没声音的时刻
  aegis: { file: 'aegis.mp3', vol: 0.55, jitter: 0.03 },        // 金钟罩护体开启
  turretShot: { file: 'turretShot.mp3', vol: 0.30, jitter: 0.10 }, // 弩炮台发射（频繁，音量压低）
  spikes: { file: 'spikes.mp3', vol: 0.45, jitter: 0.08 },      // 地刺破土
  curse: { file: 'curse.mp3', vol: 0.60, jitter: 0 },           // 被咒面图腾咒中
  soldout: { file: 'soldout.mp3', vol: 0.50, jitter: 0 },       // 商店售罄 / 买不了
  ach: { file: 'ach.mp3', vol: 0.60, jitter: 0 },               // 成就解锁
  boon: { file: 'boon.mp3', vol: 0.65, jitter: 0 },             // 永夜火种揭示
};

const STORE_KEY = 'naiwa_rouge_audio_v1';
const MASTER_BGM = 1.0;      // BGM 总音量（各曲的 vol 再乘这个）
const MASTER_SFX = 0.9;      // 音效总音量
const DUCK = 0.34;           // 面板打开时 BGM 压低到多少
const MIN_GAP_MS = 25;       // 同一音效的最小间隔（防同帧爆炸式叠加）
const MAX_VOICES = 24;       // 同时最多几个音效

// ---------------- 状态 ----------------
let ctx = null;               // AudioContext
let sfxGain = null;
let unlocked = false;
let muted = false;
let voiceCount = 0;
// 玩家音量（设置面板调，0~1）：乘在各自的 MASTER 上，静音开关独立于它
let sfxVol = 1.0;
let musicVol = 1.0;
// 第 46 块：当前音效包（'normal' | 'frog'）。只存内存 —— 真正的选择记在
// 本机档案 profile().voicePack 里（和「解锁没解锁」放在一起），
// main.js 的 applySettings() 每次启动/切包时把它推进来。
let packId = 'normal';

const buffers = new Map();    // 缓存键 -> AudioBuffer（'s:音效名' 或 'v:奶蛙文件名'）
const loading = new Map();    // 同上，按缓存键去重
const failed = new Set();     // 加载失败的，别反复重试
const lastAt = new Map();     // name -> 上次播放时间戳

let bgmEls = [];              // 两个 <audio>（A/B 交叉淡化）
let bgmActive = 0;            // 当前在响的那个索引
let bgmName = '';             // 当前曲名（空 = 没放）
let wantBgm = '';             // 想在放什么（解锁后补播）
let ducked = false;
let fadeTimer = 0;

// ---------------- 持久化 ----------------
function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    muted = !!o.muted;
  } catch (_) { /* 隐私模式 / 存储被禁：忽略 */ }
}
function savePrefs() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ muted })); } catch (_) { /* 同上 */ }
}
loadPrefs();

// ---------------- 初始化 ----------------
export function init() {
  if (bgmEls.length) return;
  for (let i = 0; i < 2; i++) {
    const el = new Audio();
    el.loop = true;           // 素材已经在构建时做过「尾接首」交叉淡化，直接 loop 就无缝
    el.preload = 'none';      // 真的要用再去取（标题页 BGM 由 playBgm 触发加载）
    el.volume = 0;
    el.crossOrigin = 'anonymous';
    bgmEls.push(el);
  }
}

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = muted ? 0 : MASTER_SFX * sfxVol;
    sfxGain.connect(ctx.destination);
  } catch (err) {
    console.warn('[音频] AudioContext 创建失败：', err);
    ctx = null;
  }
  return ctx;
}

// 必须在用户手势里调用一次（点开始游戏、点任意按钮都算）
export function unlock() {
  init();
  const c = ensureCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (!unlocked) {
    unlocked = true;
    // 解锁后才真正下载+解码音效（别和开局的模型加载抢带宽）
    preload(Object.keys(SFX_DEFS));
  }
  if (wantBgm) playBgm(wantBgm, { fade: 0.6 });
  return unlocked;
}

export function isUnlocked() { return unlocked; }

// ---------------- 音效 ----------------
// 当前包对某个音效的覆盖参数（奶蛙包里才有；null = 用原版素材）
function packOverride(name) {
  if (packId !== 'frog') return null;
  return FROG_SFX[name] || null;
}

// 一个音效在当前包下该用哪个缓存键 / 哪个文件（pool 时预热第一个备选）
function voiceOf(name) {
  const ov0 = packOverride(name);
  if (!ov0) return { key: 's:' + name, url: SFX_BASE + SFX_DEFS[name].file };
  const ov = ov0.pool ? ov0.pool[0] : ov0;
  if (!ov || !ov.file) return { key: 's:' + name, url: SFX_BASE + SFX_DEFS[name].file };
  return { key: 'v:' + ov.file, url: VOICE_BASE + ov.file };
}

// 按「文件」加载并缓存：普通音效和奶蛙素材走同一条路
function loadFile(key, url) {
  if (buffers.has(key)) return Promise.resolve(buffers.get(key));
  if (failed.has(key)) return Promise.resolve(null);
  if (loading.has(key)) return loading.get(key);
  const c = ensureCtx();
  if (!c) return Promise.resolve(null);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((buf) => {
      buffers.set(key, buf);
      loading.delete(key);
      return buf;
    })
    .catch((err) => {
      failed.add(key);
      loading.delete(key);
      console.warn(`[音频] ${url} 加载失败：`, err.message || err);
      return null;
    });
  loading.set(key, p);
  return p;
}

function loadOne(name) {
  if (!SFX_DEFS[name]) return Promise.resolve(null);
  const { key, url } = voiceOf(name);
  return loadFile(key, url);
}

export function preload(names = Object.keys(SFX_DEFS)) {
  if (!ensureCtx()) return Promise.resolve();
  return Promise.all(names.map(loadOne));
}

// 播一个音效。opts: { vol 相对倍率, rate 播放速率（1=原速）, jitter 覆盖变调幅度 }
export function sfx(name, opts = {}) {
  if (muted) return false;
  const c = ensureCtx();
  if (!c || c.state !== 'running') return false;
  if (voiceCount >= MAX_VOICES) return false;

  let ov = packOverride(name);
  if (ov && ov.silent) return false;   // 奶蛙包里这个音效整段静音（怪死不播，用户定案 2026-10-22）
  // 奶蛙包攻击音随机池：从包里两个奶蛙叫声（voice-3 短呱 / voice-2 闷呱）随机挑一个 ——
  // 每次攻击音色有变化、又不糊（怪死已静音，不会叠）
  if (ov && ov.pool) ov = ov.pool[(Math.random() * ov.pool.length) | 0];

  const def = SFX_DEFS[name];
  if (!def) { console.warn('[音频] 未知音效：', name); return false; }

  const now = performance.now();
  if (now - (lastAt.get(name) || 0) < MIN_GAP_MS) return false;
  lastAt.set(name, now);

  // 选中的是奶蛙素材就用 v: 键（不能再走 voiceOf(name)，那里只会拿 pool[0]）
  const key = ov && ov.file ? 'v:' + ov.file : 's:' + name;
  let buf = buffers.get(key);
  if (!buf) {
    loadFile(key, ov && ov.file ? VOICE_BASE + ov.file : SFX_BASE + def.file);
    // 奶蛙包里那份还没下完（或者网络挂了）就先拿原版顶上，
    // 别让玩家觉得「换了个包之后打击没声音了」；下一声自己就换成奶蛙。
    // 注意这时候必须把 ov 丢掉 —— 原版素材只有零点几秒，套奶蛙的 offset 会直接播空。
    const plainKey = 's:' + name;
    if (key !== plainKey && buffers.has(plainKey)) {
      buf = buffers.get(plainKey);
      ov = null;
    }
    if (!buf) return false;   // 首次触发顺手加载，本次静默
  }

  const src = c.createBufferSource();
  src.buffer = buf;
  const j = opts.jitter != null ? opts.jitter : (ov && ov.jitter != null ? ov.jitter : (def.jitter || 0));
  const base = opts.rate != null ? opts.rate : (ov && ov.rate != null ? ov.rate : 1);
  src.playbackRate.value = Math.max(0.25, base * (1 + (Math.random() * 2 - 1) * j));

  const g = c.createGain();
  const selfVol = ov && ov.vol != null ? ov.vol : def.vol;
  g.gain.value = (opts.vol != null ? opts.vol : 1) * selfVol;
  src.connect(g);
  g.connect(sfxGain);

  voiceCount++;
  src.onended = () => { voiceCount--; try { src.disconnect(); g.disconnect(); } catch (_) {} };
  try {
    // 裁切播放：offset 秒开始、只播 dur 秒（dur 是源时间，变速前）。
    // delay（秒）：奶蛙包里 hit/die 常同帧触发，die/explode 错开一拍才不糊成一团；
    // 用 AudioContext 的绝对时间调度（start 的第一个参数），比 setTimeout 精确
    const delay = opts.delay != null ? opts.delay : (ov && ov.delay != null ? ov.delay : 0);
    const at = c.currentTime + Math.max(0, delay);
    if (ov) src.start(at, Math.max(0, ov.offset || 0), ov.dur || undefined);
    else src.start(at);
  } catch (err) {
    voiceCount--;
    return false;
  }
  return true;
}

// ---------------- 音效包（第 46 块） ----------------
export function getPack() { return packId; }

// 换包：只改内存标记 + 预热新包要用的素材（已在响的不打断）
export function setPack(id) {
  const next = id === 'frog' ? 'frog' : 'normal';
  if (next === packId) return packId;
  packId = next;
  if (unlocked) preload(Object.keys(SFX_DEFS));   // 新包里的奶蛙素材这就开始下
  return packId;
}

// 试听一段奶蛙素材（解锁卡与设置面板用）：从 offset 播 dur 秒
export async function previewVoice(file, offset = 0, dur = 1.6) {
  if (muted) return false;
  const c = ensureCtx();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const buf = await loadFile('v:' + file, VOICE_BASE + file);
  if (!buf || c.state !== 'running') return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 0.8 * MASTER_SFX * sfxVol;
  src.connect(g);
  g.connect(c.destination);
  voiceCount++;
  src.onended = () => { voiceCount--; try { src.disconnect(); g.disconnect(); } catch (_) {} };
  try { src.start(0, Math.max(0, offset), Math.min(dur, buf.duration)); } catch (_) { voiceCount--; return false; }
  return true;
}

// ---------------- BGM ----------------
function rampBgm(dt = 0.06) {
  clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    let moving = false;
    for (let i = 0; i < bgmEls.length; i++) {
      const el = bgmEls[i];
      const def = BGM_DEFS[bgmName];
      const base = i === bgmActive && bgmName
        ? (def ? def.vol : 0.5) * MASTER_BGM * musicVol * (ducked ? DUCK : 1) * (muted ? 0 : 1)
        : 0;
      const d = base - el.volume;
      if (Math.abs(d) < 0.004) {
        if (el.volume !== base) el.volume = base;
      } else {
        el.volume = Math.max(0, Math.min(1, el.volume + d * 0.22));
        moving = true;
      }
    }
    if (!moving) clearInterval(fadeTimer);
  }, 40);
  return dt;
}

export function playBgm(name, opts = {}) {
  init();
  if (!BGM_DEFS[name]) { console.warn('[音频] 未知 BGM：', name); return false; }
  wantBgm = name;
  if (!bgmName) bgmName = name;
  const cur = bgmEls[bgmActive];
  if (name === bgmName && cur && cur.src) {
    // 同一首：正在放就只更新音量（比如解除 duck）；
    // 被自动播放策略拦成暂停的（还没解锁就来过 playBgm），这里补一次 play()
    if (cur.paused) cur.play().catch(() => {});
    rampBgm();
    return true;
  }
  const next = bgmActive === 0 ? 1 : 0;
  const el = bgmEls[next];
  if (!el) return false;
  const old = bgmEls[bgmActive];

  el.src = BGM_BASE + BGM_DEFS[name].file;
  el.volume = 0;
  bgmName = name;
  bgmActive = next;
  el.play().then(() => {
    unlocked = true;
    rampBgm();
  }).catch(() => {
    // 没解锁 / 被策略拦：留着 wantBgm，等 unlock() 再补
  });
  if (old && old !== el) rampBgm();   // 旧轨自动淡出
  return true;
}

export function stopBgm(opts = {}) {
  wantBgm = '';
  bgmName = '';
  rampBgm();
  const fade = opts.fade != null ? opts.fade : 0.5;
  setTimeout(() => {
    for (const el of bgmEls) { if (el.paused) continue; el.pause(); el.volume = 0; }
  }, fade * 1000);
}

// 面板（三选一/商店/事件/暂停）打开时压低 BGM，关掉恢复
export function duck(on) {
  ducked = !!on;
  if (bgmName) rampBgm();
}

// ---------------- 静音 ----------------
export function isMuted() { return muted; }

export function setMuted(v) {
  muted = !!v;
  savePrefs();
  if (sfxGain) sfxGain.gain.value = muted ? 0 : MASTER_SFX * sfxVol;
  rampBgm();
  return muted;
}

export function toggleMute() { return setMuted(!muted); }

// ---------------- 音量（设置面板用，与静音开关独立） ----------------
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function setSfxVolume(v) {
  sfxVol = clamp01(v);
  if (sfxGain) sfxGain.gain.value = muted ? 0 : MASTER_SFX * sfxVol;
  return sfxVol;
}

export function setMusicVolume(v) {
  musicVol = clamp01(v);
  if (bgmEls.length) rampBgm();     // 立刻平滑滑到新音量
  return musicVol;
}

export function volumes() {
  return { sfx: sfxVol, music: musicVol, muted };
}

// ---------------- 测试用 ----------------
export function stats() {
  const keys = [...buffers.keys()];
  return {
    unlocked, muted, ducked, bgmName, wantBgm,
    ctxState: ctx ? ctx.state : 'none',
    pack: packId,
    // 老字段：只列原版音效（去掉 's:' 前缀），换包后仍是同一批名字
    loaded: keys.filter((k) => k.startsWith('s:')).map((k) => k.slice(2)).sort(),
    // 奶蛙素材（'v:' 前缀去掉后是文件名）
    voiceLoaded: keys.filter((k) => k.startsWith('v:')).map((k) => k.slice(2)).sort(),
    failed: [...failed],
    voices: voiceCount,
    bgmVolumes: bgmEls.map((e) => +e.volume.toFixed(3)),
    bgmSrc: bgmEls.map((e) => (e.src || '').split('/').pop()),
    bgmPaused: bgmEls.map((e) => e.paused),
    bgmLoop: bgmEls.map((e) => e.loop),
  };
}

export const audio = {
  init, unlock, isUnlocked, sfx, preload, playBgm, stopBgm, duck,
  isMuted, setMuted, toggleMute, stats,
  setSfxVolume, setMusicVolume, volumes,
  getPack, setPack, previewVoice,
  BGM_DEFS, SFX_DEFS,
};

export default audio;
