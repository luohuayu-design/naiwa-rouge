// ============================================================
// skills.js —— 技能栏注册表（第 10 块）
//
// 以前技能栏是「1 个释放键 + 5 个剑槽」，剑槽只展示每种剑各有几把，
// 既不能点、又占地方。现在改成**一栏纯技能键**：
//   · 一个技能 = 一个按钮，按注册顺序从下往上排（第一格贴着拇指）；
//   · 剑有几把不再是 UI 要展示的信息（属性面板里能看），技能键只回答
//     「现在能不能放」+「还差多少」；
//   · 以后加技能只需要往 SKILLS 里追加一条，不用再动 main.js 的 DOM。
//
// 一条技能的结构：
//   {
//     id            唯一 id（调试钩子 / 测试用）
//     name          名字（无障碍标签、长按提示）
//     icon          图标路径
//     hint          副标题（点开提示 / 文档用）
//     key           键盘快捷键（'1'~'9'，可选）
//     requiresWeapon 没拿到环剑时这一格不出现（默认 false）
//     visible(ctx)  更细的显示条件（可选，覆盖 requiresWeapon）
//     ready(ctx)    现在能不能按
//     progress(ctx) 0~1，按钮底部那根竖条（冷却/恢复进度）
//     press(ctx)    按下时执行；返回 false 表示什么也没发生（不放音效）
//   }
//
// 第 64 块（用户需求）：属性面板要能查到「每个技能的 CD 多长」，
// 所以每条技能补了三样**纯展示用**的元数据（不影响战斗逻辑）：
//   cd            基础冷却秒数（不吃局外商店的 CD 缩短）
//   cdNow(ctx)    本局实际冷却秒数（吃 CD 缩短；面板显示这个）
//   desc          一段完整的效果说明（属性面板「技能」页用）
//   unlockNote    解锁条件（没解锁时面板上显示）
//   state(ctx)    'lock' 未解锁 / 'ready' 可放 / 'cd' 冷却中 / 'full' 条件不满足
//
// ctx 由 main.js 每帧拼好传进来：{ playing, weapon, playerPos, stats, coins }
// ============================================================
import audio from './audio.js?v=93';

// 冷却数字统一两位小数（第 64 块用户需求：倒计时精确到两位小数）。
// 不补零会跳字（3.4 → 3.35 期间宽度变化），toFixed(2) 宽度恒定。
export function fmtCd(sec) {
  const v = Number(sec);
  if (!Number.isFinite(v) || v <= 0) return '';
  return v.toFixed(2);
}

export const SKILLS = [
  {
    id: 'swordRain',
    name: '万剑齐发',
    icon: 'assets/weapons/icon-sword.png',
    // 第 56 块（用户定案）：技能改成有 CD 的 —— 向四周辐射出「拥有的每一把剑」，
    // 不影响环上正在转的。介绍文案同步改说法（不再是「把环上的剑全射出去」）。
    hint: '向四周辐射出你拥有的每一把剑（不影响环上转的），冷却 6 秒',
    key: '1',
    requiresWeapon: true,
    cd: 6.0,
    cdNow: (ctx) => (ctx.weapon ? ctx.weapon.fireCdTotal : 6.0),
    desc: '不管环上此刻恢复了几把，按下就向四周辐射出 n 把剑 —— n = 你拥有的总剑数（最初 3 把 + 商店买的 + 事件给的），'
      + '不是环上现有的数量。每把剑飞出去各打一次伤害，飞完或命中就回收。放完技能环上一把不少，该转的照转、该补的照补。'
      + '被围住的时候放，或者用来清一条直线上的怪。',
    unlockNote: '第 5 回合结束自动获得环剑后拥有',
    state: (ctx) => (ctx.weapon.granted ? (ctx.weapon.fireReady ? 'ready' : 'cd') : 'lock'),
    // 冷却中按不动；按钮底部进度条 = 冷却填充，格子上的数字 = 还剩几秒
    ready: (ctx) => ctx.playing && ctx.weapon.granted && ctx.weapon.fireReady,
    progress: (ctx) => (ctx.weapon.granted ? ctx.weapon.fireCdProgress : 0),
    cdText: (ctx) => (ctx.weapon.granted && !ctx.weapon.fireReady ? fmtCd(ctx.weapon.fireCdLeft) : ''),
    press(ctx) {
      if (!ctx.weapon.fire(() => ctx.playerPos)) return false;
      audio.sfx('swordFire');
      return true;
    },
  },

  // ---- 新武器「箭雨」（第 47 块，用户定案：第二关起解锁） ----
  // 没有普通攻击形态，只有这一个技能；冷却 8 秒，技能框上有倒计时数字。
  {
    id: 'arrowRain',
    name: '箭雨',
    icon: 'assets/skills/icon-arrow.svg',
    hint: '在最近的怪物头顶标出一片区域，片刻后群箭落下（冷却 8 秒）',
    key: '2',
    cd: 8.0,
    cdNow: (ctx) => (ctx.arrowRain ? ctx.arrowRain.cdMax : 8.0),
    desc: '自动挑怪最密的地方（离你最近那一堆）标出一片圆形区域，片刻之后群箭从那片天上落下，'
      + '范围内每只怪各吃一次伤害。它不用瞄、不用站位，是「远处那一堆我不想过去」的解法；'
      + '空地上没有怪时按不动，不会白扔。',
    unlockNote: '第二关起开局送环剑时一并解锁（第一关只有剑）',
    state: (ctx) => (!ctx.arrowRain || !ctx.arrowRain.unlocked ? 'lock' : (ctx.arrowRain.ready ? 'ready' : 'cd')),
    // 只在解锁后出现（第二关起拿环剑时一并解锁；第一关永远只有剑）
    visible: (ctx) => ctx.playing && !!ctx.arrowRain && ctx.arrowRain.unlocked,
    ready: (ctx) => !!ctx.arrowRain && ctx.arrowRain.ready,
    progress: (ctx) => (ctx.arrowRain ? ctx.arrowRain.progress : 0),
    // 冷却倒计时数字：ready 时返回空串（不显示），冷却中显示「还差几秒」
    cdText: (ctx) => (ctx.arrowRain && !ctx.arrowRain.ready ? fmtCd(ctx.arrowRain.cdLeft) : ''),
    press(ctx) {
      if (!ctx.arrowRain.fire(ctx.playerPos)) return false;
      return true;
    },
  },

  // ---- 新技能「回血」（第 62 块，用户需求） ----
  // 第四关通关后永久解锁（档案里 profile.heal.unlocked）。
  // 按下瞬间回 5 点、不超上限、冷却 25 秒；满血按不动 —— 别让玩家白扔一次 CD。
  {
    id: 'heal',
    name: '回血',
    icon: 'assets/skills/icon-heal.svg',
    // 第 65 块（用户：回血键太丑）：技能键不再用那张灰扑扑的小图，
    // 直接画一个粗一点的**绿色十字**，冷却走外圈进度环（ring:true）。
    // art 是内联 SVG（跟着 CSS 一起缩放，不糊），icon 留着给属性面板/长按提示用。
    art: '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<rect x="15.6" y="5.4" width="8.8" height="29.2" rx="4.2" fill="#7df0b0"/>'
      + '<rect x="5.4" y="15.6" width="29.2" height="8.8" rx="4.2" fill="#7df0b0"/>'
      + '<rect x="17.4" y="9" width="2.4" height="10" rx="1.2" fill="#d8ffe9" opacity=".75"/>'
      + '</svg>',
    ring: true,
    hint: '绿色十字：瞬间回复 5 点生命（不超上限），冷却 25 秒；满血时按不动',
    key: '3',
    cd: 25.0,
    cdNow: (ctx) => (ctx.heal && ctx.heal.cdTotal ? ctx.heal.cdTotal : 25.0),
    desc: '绿十字键：按下的瞬间立刻回 5 点生命，不会超过上限。25 秒冷却（外圈那条环走完就回满），'
      + '满血时按不动 —— 不让你白扔一次 CD。第四关往后怪越打越疼、药水不一定在手边，'
      + '这个技能的价值是「不用回城、不用找商店」的兜底。',
    unlockNote: '第四关通关后永久解锁（局外档案，跨局有效）',
    state: (ctx) => {
      if (!ctx.heal || !ctx.heal.unlocked) return 'lock';
      return ctx.heal.status === 'cd' ? 'cd' : ctx.heal.status === 'full' ? 'full' : 'ready';
    },
    // 解锁后一直有，不依赖环剑 —— 它是保命技能，不能因为没拿到剑就不给
    visible: (ctx) => ctx.playing && !!ctx.heal && ctx.heal.unlocked,
    ready: (ctx) => !!ctx.heal && ctx.heal.ready,
    progress: (ctx) => (ctx.heal ? ctx.heal.progress : 0),
    // 冷却中显示剩余秒数；满血时显示「满」（按不动但不是因为在转 CD）
    cdText: (ctx) => {
      if (!ctx.heal || !ctx.heal.unlocked) return '';
      if (ctx.heal.status === 'cd') return fmtCd(ctx.heal.cdLeft);
      if (ctx.heal.status === 'full') return '满';
      return '';
    },
    press(ctx) {
      if (!ctx.heal.fire()) return false;   // 满血 / CD 中：什么都不发生（不播音效）
      return true;
    },
  },

  // ---- 下面留给后面的技能（第 11 块起） ----
  // 想加技能就在这里追加一条：图标放 assets/weapons/ 或 assets/skills/，
  // ready/progress/press 三件套写好，技能栏会自动多一格。
  // 例：
  // {
  //   id: 'whack', name: '打地鼠', icon: 'assets/skills/whack.png', key: '2',
  //   hint: '把钻出来的地鼠敲回去',
  //   ready: (ctx) => ctx.playing && ctx.miniGameReady,
  //   progress: () => 1,
  //   press(ctx) { ctx.openMiniGame('whack'); return true; },
  // },
];

// 当前这一局该显示哪几个技能（按注册顺序）
export function visibleSkills(ctx) {
  return SKILLS.filter((sk) => (sk.visible ? sk.visible(ctx) : (!sk.requiresWeapon || ctx.weapon.granted)));
}

export function getSkill(id) {
  return SKILLS.find((sk) => sk.id === id) || null;
}

// 键盘快捷键 → 技能（'1' 对应第一个技能）
export function skillForKey(key) {
  const list = SKILLS.filter((sk) => sk.key);
  return list.find((sk) => sk.key === key) || null;
}
