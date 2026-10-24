// ============================================================
// swordKinds.js —— 环剑的种类（元素剑）
//
// 玩家拥有的每把剑都有一种元素；同一把剑模型（weapon-sword.glb），
// 用不同颜色 / 自发光染色区分，图标用 assets/weapons/icon-*.svg。
//
// 效果规则（命中怪物时触发，见 weapon.js 的 applyKind）：
//   ⚠️ 第 64 块（用户定案）：除雷剑外，其余元素剑**全部改成群体效果** ——
//      命中后波及命中点周围 elementRadius（基础 **7.0 格**，第 68 块从 3.5 翻倍）内的**所有**怪，
//      并各自带一圈对应的视觉特效（毒雾 / 冰环 / 血环 / 震波）。
//      雷剑仍然是「全场连锁」（比一圈更大，是它的独占地位）。
//   iron    铁剑  无附加，稳定输出
//   poison  毒剑  波及范围内所有怪中毒：poisonDps/秒 持续 poisonTime 秒（可叠加刷新）
//   frost   冰剑  波及范围内所有怪**直接冻住** frostTime 秒，不能移动也不能攻击
//   thunder 雷剑  连锁：闪电打到场上所有怪，每道 chainRatio 伤害
//   leech   血剑  按「这一剑对波及到的所有怪造成的总伤害 × leechRate」回血
//   quake   震剑  波及范围内每只怪 35% 概率被震退 + 打断蓄力/读条
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
    tagline: '一片中毒',
    desc: '命中后脚下冒出一圈毒雾：范围内每只怪都中毒，每秒 0.15 毒伤持续 5 秒（属性可升级）。中毒能叠时间，怪越挤越划算。',
  },
  frost: {
    name: '冰剑',
    color: 0x9cdcff,
    emissive: 0x2fb8ff,
    icon: 'assets/weapons/icon-frost.svg',
    tagline: '一片冻住',
    desc: '命中后炸开一圈寒气：范围内所有怪直接冻住 1.6 秒（属性可升级延长），定身期间不能移动也不能攻击。投手群、冲锋队一冻就是一整排。',
  },
  thunder: {
    name: '雷剑',
    color: 0xcdb2ff,
    emissive: 0x8a5cff,
    icon: 'assets/weapons/icon-thunder.svg',
    tagline: '全场连锁',
    desc: '命中时一道闪电打到场上「所有」怪（不限距离、不限只数），每道 45% 伤害（属性可升级）。范围比其它元素剑更大，是唯一的全场技。',
  },
  leech: {
    name: '血剑',
    color: 0xff8f9d,
    emissive: 0xff2e55,
    icon: 'assets/weapons/icon-leech.svg',
    tagline: '一片回血',
    desc: '命中时血色的环向外扫一圈：按「这一剑对周围所有怪造成的总伤害 × 15%」回血，一圈扫到五只就按五只的总伤害算。被围的时候最能续命。',
  },
  quake: {
    name: '震剑',
    color: 0xffe0a8,
    emissive: 0xffb03c,
    icon: 'assets/weapons/icon-quake.svg',   // 金铜色剑身 + 两侧震波线（第 29 块）
    tagline: '一片震退',
    desc: '命中时一圈金色震波向外扩：范围内每只怪 35% 概率被震退 1.4 格，并打断它的蓄力 / 读条。第三关的骨骑与孵骨、第五关的擦名者最怕它。',
  },
};

// 环上混合多种剑时的显示顺序（技能栏 / 商店 / 结算都用这个顺序）
export const KIND_ORDER = ['iron', 'poison', 'frost', 'thunder', 'leech', 'quake'];
