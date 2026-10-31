// ============================================================
// weaponStats.js —— 武器（环剑）自己的属性表
//
// 用户定案（第 6 块）：「武器的属性和主角属性没有任何关系，
// 伤害、暴击都是自己的数据」。所以这里是一套**完全独立**的数值：
//   · 剑的伤害 / 暴击 / 暴伤 / 吸血 全在剑自己身上，主角的攻击力、
//     暴击、吸血一点也吃不到；
//   · **剑的数量不设上限**（用户第 9 块定案）：拥有几把就上环几把，
//     所以属性表里没有 swordMax 这一项；
//   · 元素效果（毒 / 冰 / 雷 / 血）也归剑，不归主角；
//   · 升级（三选一的剑系）、商店（剑油 / 磨剑石）、事件 buff 都能改这里，
//     作用域由 scope:'weapon' 标出，见 upgrade.js / shop.js / events.js。
//
// 数值怎么算：与 stats.js 完全同一套 (base + Σflat) × (1 + Σpct)。
// 面板分组：'剑本体' / '元素'。
// ============================================================
import { createStats, mitigate, pct, num1 } from './stats.js?v=147';

export const WEAPON_STAT_DEFS = [
  // ---------------- 剑本体 ----------------
  // 基础伤害 1.6 + 基础暴击 10%：主角加成撤掉后，用略高的底线把
  // 手感维持在原来的水平（用户定案「提到 1.6 + 10% 基础暴击」）。
  { key: 'swordDamage',  name: '剑伤害',     base: 1.60,  fmt: num1, group: '剑本体', desc: '每把剑命中一次的基础伤害，与主角攻击力无关' },
  { key: 'swordCrit',    name: '剑暴击率',   base: 0.10,  fmt: pct,  group: '剑本体', desc: '环剑自己的暴击概率，不吃主角暴击率' },
  { key: 'swordCritMul', name: '剑暴击伤害', base: 1.50,  fmt: pct,  group: '剑本体', desc: '剑暴击时的伤害倍率' },
  { key: 'swordOrbit',   name: '剑转速',     base: 0.55,  fmt: (v) => v.toFixed(2) + ' 圈/秒', group: '剑本体', desc: '环剑绕主角旋转的速度' },
  // 用户定案（第 27 块）：整环补满制 —— 不管环上有几把剑，都在 swordRefill 秒内
  // 全部补满（5 把 → 2 秒/把，4 把 → 2.5 秒/把）。买剑不再拖慢恢复节奏。
  { key: 'swordRefill',  name: '剑匣补满',   base: 10.0,  fmt: (v) => v.toFixed(1) + ' 秒',  group: '剑本体', desc: '整环剑补满所需的总时间（与剑数无关），越小越快' },
  // ---------------- 元素（毒 / 冰 / 雷 / 血 / 震 见 swordKinds.js） ----------------
  // 第 64 块（用户定案）：除了雷剑，其余元素剑也全部改成**群体效果**——
  // 命中后波及命中点周围 elementRadius 格内的所有怪（雷剑是全场连锁，不看这个半径）。
  // 同时元素剑的基础值整体抬了一档（毒 0.10→0.15/秒、冰冻 1.2→1.6 秒、闪电 35%→45%），
  // 因为它们现在要吃「一个卡位、一把剑」的预算。
  // 第 68 块（用户：「毒剑和冰这些的范围太小了，至少扩大两倍」）：3.5 → 7.0 格。
  // 判定圈和视觉圈同源（weapon.js 的 aroundPoint + fx.ring 都用这个值），改一处两边一起变大。
  { key: 'elementRadius', name: '元素波及',  base: 7.0,   fmt: (v) => v.toFixed(1) + ' 格', group: '元素', desc: '毒/冰/血/震命中时波及的半径（雷剑是全场连锁，不受这个数影响）' },
  { key: 'elementRatio',  name: '元素溅射',  base: 0.5,   fmt: pct,  group: '元素', desc: '毒/冰/血/震波及到的怪吃到的伤害比例（直接命中的那只仍是全额）' },
  { key: 'poisonDps',    name: '毒伤',       base: 0.15,  fmt: (v) => v.toFixed(2) + '/秒', group: '元素', desc: '毒剑命中后，波及范围内每只怪每秒扣的血' },
  { key: 'poisonTime',   name: '毒持续',     base: 5.0,   fmt: (v) => v.toFixed(1) + ' 秒',  group: '元素', desc: '中毒状态的持续时间' },
  // 冰剑（第 56 块重做）：不再是减速，是**冰冻** —— 命中的怪直接定住 frostTime 秒，
  // 不能移动也不能攻击。1.2 秒是定身的底线：再短就只是「顿一下」，再长boss没得打。
  // 第 64 块：改成群体后 1.2 秒冻一片太短，基础值抬到 1.6 秒。
  { key: 'frostTime',    name: '冰冻持续',   base: 1.6,   fmt: (v) => v.toFixed(1) + ' 秒',  group: '元素', desc: '冰剑命中后把波及范围内的怪全部定住的时间（不能移动也不能攻击）' },
  // 雷剑（第 56 块重做）：连锁目标是**场上所有怪**（不再限只数与距离），
  // 每道闪电的伤害比例走这里（第 64 块：35% → 45%，用户「雷剑伤害翻倍」的诉求
  // 主要靠升级卡翻倍 + 这个基础值抬一档来兑现）。
  { key: 'chainRatio',   name: '闪电伤害',   base: 0.45,  fmt: pct,  group: '元素', desc: '雷剑连锁时每道闪电的伤害比例（连锁目标为场上所有怪）' },
  { key: 'leechRate',    name: '血剑回血',   base: 0.15,  fmt: pct,  group: '元素', desc: '血剑命中时按「这一剑打出的总伤害」回血（群体后按波及到的所有怪合计）' },
];

export const WEAPON_GROUPS = ['剑本体', '元素'];

// 武器属性实例（main.js 里只造一个，注入 weapon / upgrade / shop / events）
export function createWeaponStats() {
  return createStats(WEAPON_STAT_DEFS);
}

// 一次剑击的伤害：剑自己的暴击 → 剑自己的暴伤 → 目标防御减伤
// ⚠️ 与 stats.rollDamage 的区别只在取值来源，公式一模一样（共用 mitigate）
export function rollSwordDamage(wstats, { targetArmor = 0, rng = Math.random } = {}) {
  const crit = rng() < wstats.get('swordCrit');
  const raw = wstats.get('swordDamage') * (crit ? wstats.get('swordCritMul') : 1);
  return { damage: mitigate(raw, targetArmor), crit };
}
