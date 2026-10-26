import { ALL_EVENTS, eventChoices } from './js/events.js?v=94';
let rollMods = 0, noHint = 0, hintNoTurn = 0;
const samples = [];
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    const groups = [];
    const collect = (ef) => {
      if (!ef) return;
      if (ef.roll) for (const b of ef.roll) collect(b.effects);
      if (ef.mods || ef.level || ef.drain) groups.push(ef);
    };
    collect(c.effects);
    if (!groups.length) continue;
    if (c.effects.roll) { rollMods++; if (samples.length < 8) samples.push([ev.id, c.label, c.hint]); }
    if (!c.hint) noHint++;
    // hint 里有没有「下回合」之外的表述
    for (const g of groups) {
      for (const m of g.mods || []) {
        if (c.hint && !c.hint.includes('下回合') && !c.hint.includes('移速') && !c.hint.includes('攻击')) hintNoTurn++;
      }
    }
  }
}
console.log('带 roll 的临时效果选项:', rollMods, JSON.stringify(samples, null, 1));
console.log('没有 hint 的:', noHint);
