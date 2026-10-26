import { ALL_EVENTS } from './js/events.js?v=94';
const rows = [];
function walk(ev, list, where) {
  for (const c of list) {
    const ef = c.effects; if (!ef) continue;
    if (!(ef.mods || ef.level || ef.drain)) continue;
    const mods = (ef.mods || []).map((m) => `${m.scope === 'weapon' ? 'w:' : ''}${m.stat}${m.pct != null ? ':' + m.pct : ':' + m.flat}`);
    rows.push([ev.id, where, c.label, c.hint || '(无 hint)', mods.join(','), ef.level ? JSON.stringify(ef.level) : '', ef.drain || ''].join(' | '));
  }
}
for (const ev of ALL_EVENTS) {
  if (ev.choices) walk(ev, ev.choices, 'c');
  if (ev.talk) ev.talk.forEach((b, i) => walk(ev, b.replies || [], 't' + i));
}
console.log(rows.join('\n'));
