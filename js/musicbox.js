// ============================================================
// musicbox.js —— 音乐盒收集系统（第 115 块 · 创意 15）
//
// 创意（用户 2026-10-28）：「收集关卡里隐藏的音符，集齐解锁 BGM 循环 / 音效皮肤」。
// 呼应本作音游血统（脱胎自《蛙步》）+ 主线「被记住」的主题。
//
//   「音符」是关卡里隐藏的收集物（藏在草丛 / 井边 / 钟楼角落），
//   集齐一首曲子的一组音符 → 解锁一首 BGM 循环（主菜单 / 局内可切）。
//   纯收藏向、情感向，不影响战斗数值。
//
// ⚠️ 零 import 业务模块。音符的**实际生成 / 拾取 / 音频播放**由 main.js
//   接入（场景摆位 + 碰撞 + audio 切换），本文件只给「曲目数据 + 收集状态 +
//   解锁判定」。收集进度走局外档案（跨局保留），所以序列化进 profile，
//   不进 runSave（参照图鉴 / 成就的局外口径）。
// ============================================================

// ---------------- 曲目表 ----------------
// 每首曲子 = 一组音符（note ids），集齐即解锁。
// bgm：解锁后可在主菜单/局内循环播放的曲目 id（对应 audio 资源）。
export const TRACKS = [
  {
    id: 'night_meadow',
    name: '草甸夜曲',
    notes: ['n1', 'n2', 'n3', 'n4'],
    bgm: 'bgm_meadow',
    hint: '第一夜在草甸捡到的几个音符，拼起来是它没唱完的那句。',
  },
  {
    id: 'bone_tower',
    name: '骨塔回响',
    notes: ['n5', 'n6', 'n7'],
    bgm: 'bgm_tower',
    hint: '井底的回声，比任何钟声都长。',
  },
  {
    id: 'clocktower',
    name: '钟楼十二响',
    notes: ['n8', 'n9', 'n10', 'n11', 'n12'],
    bgm: 'bgm_clock',
    hint: '钟楼只敲了十一下，第十二下被空白藏起来了。',
  },
];
export const TRACK_IDS = TRACKS.map((t) => t.id);

// ============================================================
// 系统本体（局外档案，跨局保留）
// ============================================================
export function createMusicboxSystem(deps = {}) {
  const { onUnlock = () => {} } = deps;

  // 已收集的音符 id 集合（跨局，存 profile）
  const collected = new Set();

  // 拾取一个音符。返回是否因此解锁了某首曲子。
  function collect(noteId) {
    if (collected.has(noteId)) return null;
    collected.add(noteId);
    for (const t of TRACKS) {
      if (t.notes.includes(noteId) && isUnlocked(t.id)) {
        onUnlock(t);
        return t;
      }
    }
    return null;
  }

  function hasNote(noteId) { return collected.has(noteId); }
  function notesOf(trackId) {
    const t = TRACKS.find((x) => x.id === trackId);
    return t ? t.notes : [];
  }

  // 某曲目是否集齐
  function isUnlocked(trackId) {
    const t = TRACKS.find((x) => x.id === trackId);
    if (!t) return false;
    return t.notes.every((n) => collected.has(n));
  }

  function unlockedTracks() {
    return TRACKS.filter((t) => isUnlocked(t.id));
  }

  // 序列化（存 profile 的 musicbox 字段）
  function serialize() {
    return { collected: Array.from(collected) };
  }
  function restore(saved) {
    collected.clear();
    if (saved && Array.isArray(saved.collected)) {
      for (const n of saved.collected) collected.add(n);
    }
  }

  return {
    collect, hasNote, notesOf, isUnlocked, unlockedTracks, serialize, restore,
    DEFS: { TRACKS },
  };
}
