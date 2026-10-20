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
import { createStats, mitigate, pct, num1 } from './stats.js';

export const WEAPON_STAT_DEFS = [
  // ---------------- 剑本体 ----------------
  // 基础伤害 1.6 + 基础暴击 10%：主角加成撤掉后，用略高的底线把
  // 手感维持在原来的水平（用户定案「提到 1.6 + 10% 基础暴击」）。
  { key: 'swordDamage',  name: '剑伤害',     base: 1.60,  fmt: num1, group: '剑本体', desc: '每把剑命中一次的基础伤害，与主角攻击力无关' },
  { key: 'swordCrit',    name: '剑暴击率',   base: 0.10,  fmt: pct,  group: '剑本体', desc: '环剑自己的暴击概率，不吃主角暴击率' },
  { key: 'swordCritMul', name: '剑暴击伤害', base: 1.50,  fmt: pct,  group: '剑本体', desc: '剑暴击时的伤害倍率' },
  { key: 'swordOrbit',   name: '剑转速',     base: 0.55,  fmt: (v) => v.toFixed(2) + ' 圈/秒', group: '剑本体', desc: '环剑绕主角旋转的速度' },
  { key: 'swordRegen',   name: '剑回复',     base: 3.0,   fmt: (v) => v.toFixed(1) + ' 秒/把', group: '剑本体', desc: '被消耗后恢复一把剑所需的时间，越小越快' },
  // ---------------- 元素（毒 / 冰 / 雷 / 血 见 swordKinds.js） ----------------
  { key: 'poisonDps',    name: '毒伤',       base: 0.10,  fmt: (v) => v.toFixed(2) + '/秒', group: '元素', desc: '毒剑命中后每秒扣的血' },
  { key: 'poisonTime',   name: '毒持续',     base: 5.0,   fmt: (v) => v.toFixed(1) + ' 秒',  group: '元素', desc: '中毒状态的持续时间' },
  { key: 'frostSlow',    name: '冰缓',       base: 0.35,  fmt: pct,  group: '元素', desc: '冰剑命中后降低的移动速度比例' },
  { key: 'frostTime',    name: '冰缓持续',   base: 2.5,   fmt: (v) => v.toFixed(1) + ' 秒',  group: '元素', desc: '减速状态的持续时间' },
  { key: 'chainCount',   name: '雷链数',     base: 1,     fmt: num1, group: '元素', desc: '雷剑命中时额外连锁的目标数' },
  { key: 'leechRate',    name: '血剑回血',   base: 0.15,  fmt: pct,  group: '元素', desc: '血剑命中时按造成伤害的比例回血' },
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
