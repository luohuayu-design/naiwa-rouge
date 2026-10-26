import { ALL_EVENTS } from './js/events.js?v=94';

// 只关心「只作用于下一回合」的三类效果：mods / level / drain
const rows = [];
function walkChoices(ev, list, where) {
  for (const c of list) {
    const ef = c.effects;
    if (!ef) continue;
    const has = ef.mods || ef.level || ef.drain;
    if (!has) continue;
    rows.push({
      ev: ev.id, where,
      label: c.label,
      hint: c.hint || '',
      mods: (ef.mods || []).map((m) => ({ stat: m.stat, flat: m.flat, pct: m.pct, scope: m.scope })),
      level: ef.level || null,
      drain: ef.drain || 0,
      other: Object.keys(ef).filter((k) => !['mods', 'level', 'drain', 'roll'].includes(k)),
    });
  }
}
for (const ev of ALL_EVENTS) {
  if (ev.choices) walkChoices(ev, ev.choices, 'choices');
  if (ev.talk) ev.talk.forEach((beat, i) => walkChoices(ev, beat.replies || [], 'talk' + i));
}
console.log('命中选项：', rows.length);
const byStat = {};
for (const r of rows) for (const m of r.mods) {
  const k = m.stat + (m.pct != null ? '(pct)' : '(flat)');
  byStat[k] = byStat[k] || [];
  byStat[k].push(m.pct != null ? m.pct : m.flat);
}
for (const k of Object.keys(byStat).sort()) {
  const v = byStat[k].map(Math.abs).sort((a, b) => a - b);
  console.log(k.padEnd(22), 'n=' + String(v.length).padStart(3),
    'min=' + v[0], 'mid=' + v[Math.floor(v.length / 2)], 'max=' + v[v.length - 1]);
}
const lv = rows.filter((r) => r.level);
console.log('\nlevel 效果：', lv.length);
const cs = lv.filter((r) => r.level.countScale != null).map((r) => r.level.countScale).sort();
const ss = lv.filter((r) => r.level.speedScale != null).map((r) => r.level.speedScale).sort();
console.log(' countScale', JSON.stringify(cs));
console.log(' speedScale', JSON.stringify(ss));
console.log(' drain', rows.filter((r) => r.drain).map((r) => r.drain));
