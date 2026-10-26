import { ALL_EVENTS, eventChoices } from './js/events.js?v=94';
for (const id of ['boneField', 'memoryPawn', 'skullLost']) {
  const ev = ALL_EVENTS.find((e) => e.id === id);
  for (const c of eventChoices(ev)) {
    console.log('---', id, '|', c.label);
    console.log('  hint :', JSON.stringify(c.hint));
    console.log('  fx   :', JSON.stringify(c.effects));
  }
}
