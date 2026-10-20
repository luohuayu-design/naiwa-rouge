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
//         RMS 归一 -18.5dBFS。脚本见 .tmp-audio-build.py（留在项目根，改素材时重跑）。
// ============================================================

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

const buffers = new Map();    // name -> AudioBuffer
const loading = new Map();    // name -> Promise
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
    sfxGain.gain.value = muted ? 0 : MASTER_SFX;
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
function loadOne(name) {
  if (buffers.has(name) || failed.has(name)) return Promise.resolve(buffers.get(name) || null);
  if (loading.has(name)) return loading.get(name);
  const def = SFX_DEFS[name];
  if (!def) return Promise.resolve(null);
  const c = ensureCtx();
  if (!c) return Promise.resolve(null);
  const p = fetch(SFX_BASE + def.file)
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((buf) => {
      buffers.set(name, buf);
      loading.delete(name);
      return buf;
    })
    .catch((err) => {
      failed.add(name);
      loading.delete(name);
      console.warn(`[音频] 音效 ${name} 加载失败：`, err.message || err);
      return null;
    });
  loading.set(name, p);
  return p;
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
  const def = SFX_DEFS[name];
  if (!def) { console.warn('[音频] 未知音效：', name); return false; }

  const now = performance.now();
  if (now - (lastAt.get(name) || 0) < MIN_GAP_MS) return false;
  lastAt.set(name, now);

  const buf = buffers.get(name);
  if (!buf) { loadOne(name); return false; }   // 首次触发顺手加载，本次静默

  const src = c.createBufferSource();
  src.buffer = buf;
  const j = opts.jitter != null ? opts.jitter : (def.jitter || 0);
  const base = opts.rate != null ? opts.rate : 1;
  src.playbackRate.value = Math.max(0.25, base * (1 + (Math.random() * 2 - 1) * j));

  const g = c.createGain();
  g.gain.value = (opts.vol != null ? opts.vol : 1) * def.vol;
  src.connect(g);
  g.connect(sfxGain);

  voiceCount++;
  src.onended = () => { voiceCount--; try { src.disconnect(); g.disconnect(); } catch (_) {} };
  try {
    src.start();
  } catch (err) {
    voiceCount--;
    return false;
  }
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
        ? (def ? def.vol : 0.5) * MASTER_BGM * (ducked ? DUCK : 1) * (muted ? 0 : 1)
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
  if (sfxGain) sfxGain.gain.value = muted ? 0 : MASTER_SFX;
  rampBgm();
  return muted;
}

export function toggleMute() { return setMuted(!muted); }

// ---------------- 测试用 ----------------
export function stats() {
  return {
    unlocked, muted, ducked, bgmName, wantBgm,
    ctxState: ctx ? ctx.state : 'none',
    loaded: [...buffers.keys()].sort(),
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
  BGM_DEFS, SFX_DEFS,
};

export default audio;
