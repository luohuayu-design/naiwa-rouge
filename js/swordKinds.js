// ============================================================
// swordKinds.js —— 环剑的种类（元素剑）
//
// 玩家拥有的每把剑都有一种元素；同一把剑模型（weapon-sword.glb），
// 用不同颜色 / 自发光染色区分，图标用 assets/weapons/icon-*.svg。
//
// 效果规则（命中怪物时触发，见 weapon.js 的 applyKindEffects）：
//   iron    铁剑  无附加，稳定输出
//   poison  毒剑  中毒：poisonDps/秒 持续 poisonTime 秒（可叠加刷新）
//   frost   冰剑  冰缓：移速 ×(1 - frostSlow)，持续 frostTime 秒
//   thunder 雷剑  连锁：对 chainCount 只附近怪各弹一次 60% 伤害
//   leech   血剑  吸血：按造成伤害的 leechRate 回血（近战吸血之外的独立来源）
// ============================================================

export const SWORD_KINDS = {
  iron: {
    name: '铁剑',
    color: 0xe8eef2,       // 剑身颜色（材质 map 调色）
    emissive: 0x9fd8ff,    // 自发光（深夜里能看清）
    icon: 'assets/weapons/icon-iron.svg',
    tagline: '稳定输出',
    desc: '没有附加效果，但便宜、可靠，商店里可以多买几把加厚剑阵。',
  },
  poison: {
    name: '毒剑',
    color: 0x8fe06a,
    emissive: 0x53d418,
    icon: 'assets/weapons/icon-poison.svg',
    tagline: '命中后中毒',
    desc: '命中后中毒：每秒 0.1 毒伤持续 5 秒（属性可升级）。中毒能叠时间。',
  },
  frost: {
    name: '冰剑',
    color: 0x9cdcff,
    emissive: 0x2fb8ff,
    icon: 'assets/weapons/icon-frost.svg',
    tagline: '命中后减速',
    desc: '命中后冰缓：怪物移速 ×0.65 持续 2.5 秒（属性可升级）。躲投手的好帮手。',
  },
  thunder: {
    name: '雷剑',
    color: 0xcdb2ff,
    emissive: 0x8a5cff,
    icon: 'assets/weapons/icon-thunder.svg',
    tagline: '闪电连锁',
    desc: '命中时对附近 1 只怪连锁一道闪电，造成 60% 伤害（雷链数可升级）。',
  },
  leech: {
    name: '血剑',
    color: 0xff8f9d,
    emissive: 0xff2e55,
    icon: 'assets/weapons/icon-leech.svg',
    tagline: '命中回血',
    desc: '命中时按伤害的 15% 回血，和吸血属性叠乘，站撸的底气。',
  },
  quake: {
    name: '震剑',
    color: 0xffe0a8,
    emissive: 0xffb03c,
    icon: 'assets/weapons/icon-quake.svg',   // 金铜色剑身 + 两侧震波线（第 29 块）
    tagline: '命中震退',
    desc: '命中时 35% 概率把怪震退 1.4 格，并打断它的蓄力 / 读条。第三关的骨骑与孵骨最怕它。',
  },
};

// 环上混合多种剑时的显示顺序（技能栏 / 商店 / 结算都用这个顺序）
export const KIND_ORDER = ['iron', 'poison', 'frost', 'thunder', 'leech', 'quake'];
