import { ALL_EVENTS, eventChoices } from './js/events.js?v=94';
const fmt = (ef) => {
  const o = [];
  if (ef.mods) o.push(ef.mods.map((m) => `${m.stat}${m.pct != null ? ':' + m.pct : ':' + m.flat}`).join('+'));
  if (ef.level) o.push(JSON.stringify(ef.level));
  if (ef.drain) o.push('drain' + ef.drain);
  if (ef.rep) o.push('rep' + ef.rep);
  if (ef.gold) o.push('gold' + ef.gold);
  if (ef.hp) o.push('hp' + ef.hp);
  if (ef.permanent) o.push('perm' + JSON.stringify(ef.permanent));
  return o.join(' ');
};
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    if (!c.effects || !c.effects.roll) continue;
    const hasTemp = c.effects.roll.some((b) => b.effects && (b.effects.mods || b.effects.level || b.effects.drain));
    if (!hasTemp) continue;
    console.log(`${ev.id} | ${c.label}\n  hint: ${c.hint}\n  ${c.effects.roll.map((b) => `${b.p}: ${fmt(b.effects)}`).join('\n  ')}`);
  }
}
