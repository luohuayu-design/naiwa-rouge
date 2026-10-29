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
import audio from './audio.js?v=133';

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
  // 没有普通攻击形态，只有这一个技能；冷却 8 秒起（速射卡可缩短），技能框上有倒计时数字。
  {
    id: 'arrowRain',
    name: '箭雨',
    icon: 'assets/skills/icon-arrow.svg',
    hint: '在最近的怪物头顶标出一片区域，片刻后群箭落下（冷却 8 秒起，可被卡与箭袋缩短）',
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

  // ---- 第 10 件法器「傀儡术」（第 107 块，用户定案） ----
  // 商店里买到傀儡术（第十关起上架）后出现。按下：真暂停 → 铁 / 雪二选一 → 召出。
  // 铁傀儡不拉仇恨、两秒一拳（主力级输出）；雪傀儡拉仇恨（怪改追它）、雪球纯击退。
  // 冷却 40 秒，同时最多一只（传说卡「上限 +1」后两只）；傀儡碎了等 CD 再召。
  // ⚠️ press 里只负责把「二选一」面板叫出来（ctx.openGolemPick），真正的召唤
  //    在玩家点完卡之后 —— 所以按下就返回 true（音效照放，暂停立刻生效）。
  {
    id: 'golem',
    name: '傀儡术',
    // 内联 SVG：一只铁傀儡的脸（灰方块 + 红眼睛 + 藤蔓），一眼 MC
    art: '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<rect x="7" y="7" width="26" height="26" rx="2" fill="#c8ccc8"/>'
      + '<rect x="7" y="7" width="26" height="26" rx="2" fill="none" stroke="#8f9a93" stroke-width="2"/>'
      + '<rect x="13" y="16" width="4" height="3" fill="#a03a2e"/>'
      + '<rect x="23" y="16" width="4" height="3" fill="#a03a2e"/>'
      + '<rect x="15" y="25" width="10" height="2.4" fill="#8f9a93"/>'
      + '<path d="M9 10 Q14 6 19 10" stroke="#5f8f5a" stroke-width="1.8" fill="none"/>'
      + '<path d="M24 31 Q29 27 33 30" stroke="#5f8f5a" stroke-width="1.8" fill="none"/>'
      + '</svg>',
    hint: '召一只傀儡并肩作战：铁的不拉仇恨但会重拳，雪的替你挨打、雪球击退。冷却 40 秒（速召卡可缩短）',
    key: '4',
    cd: 40.0,
    cdNow: (ctx) => (ctx.golems ? ctx.golems.cdTotal() : 40.0),
    desc: '傀儡术：按下后整个世界暂停，在铁傀儡和雪傀儡里选一只召在脚下。'
      + '铁傀儡不拉仇恨，站在原地两秒一拳，一拳是你攻击的 1.5 倍；'
      + '雪傀儡拉仇恨 —— 追你的怪改去围殴它（贴脸的怪持续磨它的血），它扔雪球把怪推开但一点伤害都没有。'
      + '同时最多站一只（传说卡「傀儡上限 +1」后两只），碎了要等 40 秒冷却才能再召。'
      + '雪傀儡嘲讽的是「追着人跑」的怪：弓手、投手这些保持距离打你的，它管不着。',
    unlockNote: '夜行商店买到「傀儡术」（第十关起上架）后拥有',
    visible: (ctx) => ctx.playing && !!ctx.golems && ctx.golems.owned,
    state: (ctx) => {
      if (!ctx.golems || !ctx.golems.owned) return 'lock';
      if (ctx.golems.count() >= ctx.golems.cap()) return 'full';
      return ctx.golems.ready() ? 'ready' : 'cd';
    },
    ready: (ctx) => !!ctx.golems && ctx.golems.owned && ctx.playing && ctx.golems.ready(),
    progress: (ctx) => (ctx.golems ? 1 - ctx.golems.cdLeft() / ctx.golems.cdTotal() : 0),
    cdText: (ctx) => (!ctx.golems || !ctx.golems.owned || ctx.golems.ready())
      ? '' : fmtCd(ctx.golems.cdLeft()),
    press(ctx) {
      if (!ctx.golems) return false;
      ctx.openGolemPick();          // 真暂停 + 二选一（main.js 里实现）
      return true;
    },
  },

  // ---- 第 11 件法器「墨丸」（第 114 块，用户定案） ----
  // 用户原话：「获得之后解锁技能按钮，按下一次就放下一个地雷，被怪物踩到
  // 瞬间触发范围伤害」。夜行商店买到墨丸后出现，按下在脚下留一枚，
  // 怪踩到就炸。同屏上限 / 半径 / 冷却 / 伤害各有独立通道，三选一卡和
  // 商店两件货都往这几个通道里灌（见 mine.js）。
  {
    id: 'mine',
    name: '墨丸',
    // 内联 SVG：一颗墨点 + 一圈墨晕 —— 和「账簿」这件法器一样不用外链图
    art: '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<circle cx="20" cy="21" r="7.2" fill="#2a2038"/>'
      + '<circle cx="17.6" cy="18.6" r="2.2" fill="#6a55a0" opacity=".85"/>'
      + '<circle cx="20" cy="21" r="12.4" fill="none" stroke="#8f7cf0" stroke-width="1.6" opacity=".55"/>'
      + '<circle cx="20" cy="21" r="16.4" fill="none" stroke="#8f7cf0" stroke-width="1" opacity=".25"/>'
      + '</svg>',
    ring: true,
    hint: '在脚下留一枚墨丸，怪踩到就炸（半径 2.6、伤害吃武器攻击）；同屏 3 枚、冷却 8 秒',
    key: '5',
    cd: 8.0,
    cdNow: (ctx) => (ctx.mines ? ctx.mines.cdMax : 8.0),
    desc: '墨丸：按一下在脚下留一颗雷，站上去的怪立刻吃一次范围爆炸（半径 2.6 格，伤害 = 武器攻击 ×2.5，吃暴击与护甲）。'
      + '同屏最多 3 枚（法器等级 / 卡 / 商店都能加），冷却 8 秒。'
      + '它不挑目标、不用瞄 —— 雾里看不见的时候先把路口铺上，让它们自己走过来。'
      + '地上永远留一圈很淡的墨痕，所以你自己也不会忘了布在哪。',
    unlockNote: '夜行商店买到「墨丸」（第十一关起上架）后拥有',
    visible: (ctx) => ctx.playing && !!ctx.mines && ctx.mines.owned,
    state: (ctx) => {
      if (!ctx.mines || !ctx.mines.owned) return 'lock';
      if (ctx.mines.count >= ctx.mines.cap) return 'full';
      return ctx.mines.ready ? 'ready' : 'cd';
    },
    ready: (ctx) => !!ctx.mines && ctx.mines.owned && ctx.playing && ctx.mines.ready,
    progress: (ctx) => (ctx.mines ? ctx.mines.progress : 0),
    cdText: (ctx) => {
      if (!ctx.mines || !ctx.mines.owned) return '';
      if (ctx.mines.count >= ctx.mines.cap) return '满';
      return ctx.mines.ready ? '' : fmtCd(ctx.mines.cdLeft);
    },
    press(ctx) {
      if (!ctx.mines) return false;
      return ctx.mines.drop(ctx.playerPos);   // 冷却中 / 满场地：返回 false，不播音效
    },
  },

  // ---- 第 12 件法器「苔藓拿铁」（第 116 块，用户定案） ----
  // 用户定案：「在当前位置放下一杯拿铁，形成持续约 5 秒的区域。玩家在区域内
  // 获得攻速、移速提升；敌人进入则被减速」。夜行商店买到拿铁后出现，
  // 按下在脚下放一杯咖啡。持续 / 半径 / 攻速 / 减速 / 冷却 / 同屏各有独立通道，
  // 三选一卡和商店两件货都往这几个通道里灌（见 latte.js）。
  {
    id: 'latte',
    name: '苔藓拿铁',
    // 内联 SVG：一杯咖啡 + 一圈奶泡 —— 和「墨丸」一样不用外链图
    art: '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<path d="M12 14 h14 v7 a7 7 0 0 1 -14 0 z" fill="#6d4424"/>'
      + '<ellipse cx="19" cy="14" rx="7" ry="2" fill="#9fc36a"/>'
      + '<path d="M26 17 h4 a3 3 0 0 1 0 6 h-3" fill="none" stroke="#e8dcc2" stroke-width="2.4" stroke-linecap="round"/>'
      + '<path d="M10 31 q8 -3 18 0" fill="none" stroke="#9fc36a" stroke-width="1.8" opacity=".6"/>'
      + '</svg>',
    ring: true,
    hint: '在脚下放一杯咖啡：圈里你加攻速 / 移速、怪被减速。持续 5 秒、冷却 30 秒、同屏 1 杯',
    key: '6',
    cd: 30.0,
    cdNow: (ctx) => (ctx.latte ? ctx.latte.cdMax : 30.0),
    desc: '苔藓拿铁：按一下在脚下放一杯咖啡，形成一个圈 —— 你在圈里加攻速 / 移速，'
      + '怪进圈被减速（移速打折）。持续 5 秒、冷却 30 秒、同屏最多 1 杯（卡 / 商店能加）。'
      + '它和第十二关的车流是绝配：在车道边放一杯，把怪留在危险区，再借车收割。'
      + '地上永远留一圈很淡的奶泡，所以你自己也不会忘了放在哪。',
    unlockNote: '夜行商店买到「苔藓拿铁」（第十二关起上架）后拥有',
    visible: (ctx) => ctx.playing && !!ctx.latte && ctx.latte.owned,
    state: (ctx) => {
      if (!ctx.latte || !ctx.latte.owned) return 'lock';
      if (ctx.latte.count >= ctx.latte.cap) return 'full';
      return ctx.latte.ready ? 'ready' : 'cd';
    },
    ready: (ctx) => !!ctx.latte && ctx.latte.owned && ctx.playing && ctx.latte.ready,
    progress: (ctx) => (ctx.latte ? ctx.latte.progress : 0),
    cdText: (ctx) => {
      if (!ctx.latte || !ctx.latte.owned) return '';
      if (ctx.latte.count >= ctx.latte.cap) return '满';
      return ctx.latte.ready ? '' : fmtCd(ctx.latte.cdLeft);
    },
    press(ctx) {
      if (!ctx.latte) return false;
      return ctx.latte.drop(ctx.playerPos);   // 冷却中 / 满场地：返回 false，不播音效
    },
  },

  // ---- 第 13 件法器「守夜烛」（第 118 块，第十一关专属） ----
  // 用户 2026-10-29：「完善第十一关，考虑设计多样法器配套技能」。
  // 墨丸是「你写、怪来踩」，守夜烛是「你点、雾退开」：放下后圈里怪被灼烧 / 减速，
  // 而且圈内的雾会被照散（fog.cut）—— 第十一关唯一能主动改视野的法器。
  {
    id: 'candle',
    name: '守夜烛',
    // 内联 SVG：半截蜡烛 + 一簇火苗 + 一圈暖光
    art: '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<rect x="16.5" y="17" width="7" height="15" rx="1.6" fill="#f0e2c0"/>'
      + '<rect x="14" y="31.5" width="12" height="3" rx="1.4" fill="#8a6a44"/>'
      + '<path d="M20 8 q4.4 5 4.4 8.4 a4.4 4.4 0 0 1 -8.8 0 Q15.6 13 20 8 z" fill="#ffc873"/>'
      + '<path d="M20 11.6 q2.2 3 2.2 4.8 a2.2 2.2 0 0 1 -4.4 0 Q17.8 14.6 20 11.6 z" fill="#fff2c8" opacity=".9"/>'
      + '<circle cx="20" cy="22" r="14" fill="none" stroke="#ffd79b" stroke-width="1.2" opacity=".45"/>'
      + '</svg>',
    ring: true,
    hint: '在脚下点一盏烛：圈里怪被灼烧并减速，圈内的雾被照散。持续 6 秒、冷却 22 秒',
    key: '7',
    cd: 22.0,
    cdNow: (ctx) => (ctx.candle ? ctx.candle.cdMax : 22.0),
    desc: '守夜烛：按一下在脚下点亮一盏蜡烛，持续 6 秒。圈里的怪每半秒被灼烧一次并减速；'
      + '更关键的是，圈内的雾会被照散 —— 第十一关的雾里看不见路，这盏烛就是你能主动开出的那块空地。'
      + '同屏一盏，冷却 22 秒。它不是输出装，是「把路还给你」的那件东西。',
    unlockNote: '夜行商店买到「守夜烛」（第十一关起上架）后拥有',
    visible: (ctx) => ctx.playing && !!ctx.candle && ctx.candle.owned,
    state: (ctx) => {
      if (!ctx.candle || !ctx.candle.owned) return 'lock';
      if (ctx.candle.count >= ctx.candle.cap) return 'full';
      return ctx.candle.ready ? 'ready' : 'cd';
    },
    ready: (ctx) => !!ctx.candle && ctx.candle.owned && ctx.playing && ctx.candle.ready,
    progress: (ctx) => (ctx.candle ? ctx.candle.progress : 0),
    cdText: (ctx) => {
      if (!ctx.candle || !ctx.candle.owned) return '';
      if (ctx.candle.count >= ctx.candle.cap) return '满';
      return ctx.candle.ready ? '' : fmtCd(ctx.candle.cdLeft);
    },
    press(ctx) {
      if (!ctx.candle) return false;
      return ctx.candle.drop(ctx.playerPos);
    },
  },

  // ---- 第 14 件法器「落款」（第 118 块，第十一关专属） ----
  // 第十一关讲「谁记得谁」：空白在划掉名字，你能做的就是把名字写回去。
  // 按下给最近的怪盖一枚「落款」，持续掉血，死时名字炸开（范围伤害）。
  {
    id: 'mark',
    name: '落款',
    // 内联 SVG：一枚红色印章 + 一个「名」字形的竖笔
    art: '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<rect x="9" y="8" width="22" height="17" rx="2.4" fill="none" stroke="#ff6b5a" stroke-width="2.2"/>'
      + '<path d="M20 11.4 v10.4" stroke="#ff6b5a" stroke-width="2.4" stroke-linecap="round"/>'
      + '<path d="M15.4 16.6 h9.2" stroke="#ff8a6a" stroke-width="1.8" stroke-linecap="round"/>'
      + '<rect x="13" y="27.4" width="14" height="4.4" rx="1.6" fill="#c0453a"/>'
      + '<circle cx="20" cy="29.6" r="0.9" fill="#ffe6c0" opacity=".9"/>'
      + '</svg>',
    ring: true,
    hint: '给最近的怪盖印：持续掉血，死亡时墨爆（半径 1.8）。目标 1 个、冷却 14 秒',
    key: '8',
    cd: 14.0,
    cdNow: (ctx) => (ctx.mark ? ctx.mark.cdMax : 14.0),
    desc: '落款：按一下给最近的怪盖上一枚你的名字。被盖印的怪会持续掉血，'
      + '它死的时候名字炸开一次墨爆（半径 1.8，伤害 = 武器攻击 ×1.5，范围内所有怪一起吃）。'
      + '冷却 14 秒；法器等级 / 卡可以一次落好几个款。雾里点名一个最烦的，它走不出这一页。',
    unlockNote: '夜行商店买到「落款」（第十一关起上架）后拥有',
    visible: (ctx) => ctx.playing && !!ctx.mark && ctx.mark.owned,
    state: (ctx) => {
      if (!ctx.mark || !ctx.mark.owned) return 'lock';
      return ctx.mark.ready ? 'ready' : 'cd';
    },
    ready: (ctx) => !!ctx.mark && ctx.mark.owned && ctx.playing && ctx.mark.ready,
    progress: (ctx) => (ctx.mark ? ctx.mark.progress : 0),
    cdText: (ctx) => {
      if (!ctx.mark || !ctx.mark.owned || ctx.mark.ready) return '';
      return fmtCd(ctx.mark.cdLeft);
    },
    press(ctx) {
      if (!ctx.mark) return false;
      return ctx.mark.press(ctx.playerPos);   // 场上没怪：返回 false，不播音效
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
