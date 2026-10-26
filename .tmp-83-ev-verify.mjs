import { ALL_EVENTS, eventChoices } from './js/events.js?v=94';

// 独立实现一遍「应该显示成什么」，只用来对账（不做修改）
const PCT = new Set(['attackSpeed', 'critRate', 'critDamage', 'lifesteal', 'goldRate', 'swordOrbit', 'swordDamage']);
const TOK = {
  countScale: ['怪物数量'], speedScale: ['怪物移速'], attackRange: ['攻击范围'],
  attackSpeed: ['攻速', '攻击速度'], critDamage: ['暴击伤害'], critRate: ['暴击'],
  hpRegen: ['生命回复', '每秒回血'], maxHp: ['最大生命', '生命上限'], armor: ['防御'],
  moveSpeed: ['移速', '移动速度'], goldRate: ['金币掉落'], swordOrbit: ['剑转速'],
  swordDamage: ['剑伤害'], attack: ['攻击'], lifesteal: ['吸血'], luck: ['幸运'],
};
const txt = (v, p) => (v >= 0 ? '+' : '-') + (p ? `${Math.round(Math.abs(v) * 100)}%` : Math.abs(v).toFixed(1));
function specs(fx) {
  const out = [];
  if (fx.level?.countScale != null) out.push(['countScale', txt(fx.level.countScale - 1, true)]);
  if (fx.level?.speedScale != null) out.push(['speedScale', txt(fx.level.speedScale - 1, true)]);
  for (const m of fx.mods || []) {
    const p = m.pct != null;
    out.push([m.stat, txt(p ? m.pct : m.flat, p || PCT.has(m.stat))]);
  }
  return out;
}
const problems = [];
const notMentioned = [];
let checked = 0;
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    const brs = c.effects && c.effects.roll;
    const groups = brs ? brs.map((b) => b.effects) : (c.effects ? [c.effects] : []);
    for (const g of groups) {
      if (!g || (!g.mods && !g.level)) continue;
      checked++;
      for (const [stat, want] of specs(g)) {
        const toks = TOK[stat] || [];
        // 文案里提了这个属性，就必须出现新值
        if (toks.some((t) => (c.hint || '').includes(t))) {
          if (!(c.hint || '').includes(want)) {
            problems.push(`${ev.id} | ${c.label} | ${stat} 应为 ${want} | ${c.hint}`);
          }
        } else {
          notMentioned.push(`${ev.id} | ${c.label} | ${stat} ${want} | ${c.hint}`);
        }
      }
    }
  }
}
console.log('检查分组:', checked);
console.log('\n== 数字对不上（必须修）', problems.length);
console.log(problems.join('\n'));
console.log('\n== 文案没提这个属性（多半是「属性大涨」这类文学描述，可接受）', notMentioned.length);
console.log(notMentioned.slice(0, 30).join('\n'));
