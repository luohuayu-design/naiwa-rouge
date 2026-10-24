import { UPGRADES, FAMILIES, rarityOdds } from './js/upgrade.js?v=84';
console.log('总卡数', UPGRADES.length, '族', FAMILIES.length);
const byTag = {}; for (const u of UPGRADES) byTag[u.tag] = (byTag[u.tag] || 0) + 1;
console.log('分系', byTag);
const byR = {}; for (const u of UPGRADES) byR[u.rarity] = (byR[u.rarity] || 0) + 1;
console.log('分品质', byR);
console.log('--- 锋利三档 ---');
for (const u of UPGRADES.filter((x) => x.family === 'edge')) console.log(u.id, u.name, 'r' + u.rarity, u.title, u.w0.toFixed(3), u.gw.toFixed(3), 'flat=' + u.flat);
console.log('--- 致命三档 ---');
for (const u of UPGRADES.filter((x) => x.family === 'fang')) console.log(u.id, u.name, 'r' + u.rarity, u.title, JSON.stringify(u.extra));
console.log('--- 锻造/毒/冰/雷电 ---');
for (const u of UPGRADES.filter((x) => ['swordForge', 'venom', 'chill', 'volt'].includes(x.family))) console.log(u.id, 'r' + u.rarity, u.title);
console.log('--- 机动 ---');
for (const u of UPGRADES.filter((x) => x.tag === 'mov')) console.log(u.id, u.name, 'r' + u.rarity, u.title);
console.log('--- 品质分布 ---');
for (const [r, o] of [[1, { hasWeapon: false }], [10, { hasWeapon: true }], [10, { hasWeapon: true, luck: 5 }]]) {
  console.log('回合' + r + JSON.stringify(o), rarityOdds(r, o).map((x) => x.name + ' ' + (x.p * 100).toFixed(1) + '%').join(' | '));
}
// 一个属性内部抽到哪一档
const edge = FAMILIES.find((f) => f.id === 'edge');
const cards = UPGRADES.filter((u) => u.family === 'edge');
const tot = cards.reduce((a, u) => a + u.w0, 0);
console.log('锋利族内三档（回合1）', cards.map((u) => u.name + ' ' + (u.w0 / tot * 100).toFixed(1) + '%').join(' | '));
