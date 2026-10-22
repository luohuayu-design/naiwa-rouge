// ============================================================
// voicepack.js —— 音效包表（第 46 块）
//
// 第 46 块之前只有一套音效（assets/audio/sfx/ 里 32 个 CC0 素材）。
// 现在多了一套「抽象奶蛙音效包」：素材来自同作者的音游《蛙步》
// （naiwa-step/sounds/voice-1|2|3 + voice-end），4 段奶蛙叫声，
// 通关第一关后解锁，之后在设置里随时切换。
//
// 为什么要裁切：这 4 段是「一整段叫声」（1.8~6.1 秒），直接拿去做
// 「打中一下」的反馈会糊成一片。所以这里给每个要替换的音效
// **指定播放区间**（offset 起点 + dur 时长 + rate 变速 + vol 音量），
// 由 audio.js 用 AudioBufferSourceNode.start(0, offset, dur) 现场裁切 ——
// 不用改音频文件、不额外占空间，觉得长度不对改这里两个数字就行。
//
// 没被列进来的音效（挥剑、金币、UI、商店…）在奶蛙包里仍是原版：
// 2.7 秒的叫声去替「每秒 1.2 次的挥剑」，只会吵得听不见别的。
// ============================================================

export const VOICE_BASE = 'assets/audio/voice/';

// 包里到底有哪 4 段（解锁界面按这个列表显示 + 试听）
export const FROG_FILES = [
  { file: 'voice-3.mp3', name: '短促一呱', use: '攻击（随机二选一）', offset: 0.745, preview: 0.85 },
  { file: 'voice-1.mp3', name: '用力一声', use: '暴击 · 清完一回', offset: 0.334, preview: 1.60 },
  { file: 'voice-2.mp3', name: '挨打那种', use: '受伤 · 自爆 · 攻击（随机二选一）', offset: 0.177, preview: 1.20 },
  { file: 'voice-end.mp3', name: '收尾长鸣', use: '通关 · 倒下', offset: 0, preview: 2.20 },
];

// 音效名 → 奶蛙素材的播放参数
//   offset 从素材第几秒开始（已经减掉开头静音）
//   dur    播多长（源时间，变速前）；不写 = 一直播到结束
//   vol    这个音效在奶蛙包里的音量（覆盖 SFX_DEFS 的 vol）
//   rate   基准播放速率（<1 更低沉、>1 更尖更短）
export const FROG_SFX = {
  // 打中一下：用户定案（2026-10-22）—— 攻击时随机播「原版打击 / 原版怪死」其中之一。
  // 攻击音随机池（用户定案 2026-10-22：攻击时随机播奶蛙包的两个叫声）——
  //   A：voice-3 的短促一「呱」（原 hit 用的那段）
  //   B：voice-2 的那声闷呱（原 die 用的那段，压低降速）
  // 两个都是奶蛙素材，音色相近但一听是两声不同的叫，打起来不会单调
  hit: { pool: [
    { file: 'voice-3.mp3', offset: 0.745, dur: 0.45, vol: 0.50, rate: 1.12, jitter: 0.08 },
    { file: 'voice-2.mp3', offset: 0.177, dur: 0.70, vol: 0.42, rate: 0.82, jitter: 0.10 },
  ] },
  // 暴击：一记完整的用力叫声，比 hit 长、比 hit 响
  crit: { file: 'voice-1.mp3', offset: 0.334, dur: 0.90, vol: 0.60, rate: 1.00, jitter: 0.04 },
  // 自己挨打：完整一声
  hurt: { file: 'voice-2.mp3', offset: 0.177, dur: 0.85, vol: 0.72, rate: 1.00, jitter: 0 },
  // 怪死：不播（用户定案 —— 攻击音已经随机借走了原版怪死声，死再响一声就是叠音）
  die: { silent: true },
  // 小兵自爆：更低更闷，和 die 拉开层次（自爆是特效事件音，保留）
  explode: { file: 'voice-2.mp3', offset: 0.177, dur: 0.55, vol: 0.55, rate: 0.72, jitter: 0.06, delay: 0.13 },
  // 清完一回合：一声完整的叫，别太长（20 个回合要听 20 次）
  roundClear: { file: 'voice-1.mp3', offset: 0.334, dur: 1.10, vol: 0.55, rate: 1.00, jitter: 0 },
  // 通关：整段 6 秒长鸣
  victory: { file: 'voice-end.mp3', offset: 0, dur: 6.00, vol: 0.62, rate: 1.00, jitter: 0 },
  // 倒下：同一段压低变慢，只取前 3.4 秒
  defeat: { file: 'voice-end.mp3', offset: 0, dur: 3.40, vol: 0.55, rate: 0.80, jitter: 0 },
};

// 设置面板与解锁卡上的两套包
export const PACK_LIST = [
  { id: 'normal', name: '正常音效包', desc: '原版：打击清脆、结算利落' },
  { id: 'frog', name: '抽象奶蛙音效包', desc: '全场换成奶蛙的 4 段叫声' },
];

export const PACK_IDS = PACK_LIST.map((p) => p.id);

export function packInfo(id) {
  return PACK_LIST.find((p) => p.id === id) || PACK_LIST[0];
}
