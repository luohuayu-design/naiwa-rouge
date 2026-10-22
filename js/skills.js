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
// ctx 由 main.js 每帧拼好传进来：{ playing, weapon, playerPos, stats, coins }
// ============================================================
import audio from './audio.js?v=54';

export const SKILLS = [
  {
    id: 'swordRain',
    name: '万剑齐发',
    icon: 'assets/weapons/icon-sword.png',
    hint: '把环上的剑一次全射出去（每两把之间再补一把）',
    key: '1',
    requiresWeapon: true,
    // 有剑才能放：剑全射出去之后就等它们一把把补回来
    ready: (ctx) => ctx.playing && ctx.weapon.granted && ctx.weapon.count > 0,
    progress: (ctx) => (ctx.weapon.granted ? ctx.weapon.regenProgress : 0),
    press(ctx) {
      if (!ctx.weapon.fire(() => ctx.playerPos)) return false;
      audio.sfx('swordFire');
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
