// 第 81 块契约 —— **已于第 83 块退役**
//
// 第 81 块做的是「第八关 · 无名者列队推进 + 旗手 + 寄存柜站桩取牌」。
// 第 83 块用户明确要求「那个一起移动的怪物移动逻辑问题太大，直接换掉」，
// 于是：队形系统（ranker / bearer / squads / 槽位）整块删除，
// 寄存柜改成「满 8 封柜 → 5 秒 → 召唤寄存处看守 → 三位数取牌小游戏」。
//
// 这个文件里原本 91 条断言全都指向已删除的实现，留着只会天天报 56 条红。
// 所以这里只保留「第八关还在、骨架没坏、队形确实删干净」这三件事，
// 新机制的完整契约在 .tmp-block83-test.mjs（59 条）+ .tmp-83-smoke.js（45 条，起浏览器）。
//
// 跑法：node .tmp-block81-test.mjs —— 应当全绿。
import { readFileSync } from 'node:fs';
import { LEVELS_BY_ID, levelTypes } from './js/wave.js';
import { ENEMY_TYPES } from './js/enemy.js';

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}

const enemySrc = readFileSync('js/enemy.js', 'utf8');
const waveSrc = readFileSync('js/wave.js', 'utf8');
const storySrc = readFileSync('js/story.js', 'utf8');
const L8 = LEVELS_BY_ID[8];

console.log('\n一、第八关骨架（第 81 块建立，仍然有效）');
ok(!!L8 && L8.theme === 'ossuary', '第八关 + ossuary 主题');
ok(!!L8 && L8.rounds.length === 20, '20 回合');
ok(!!L8 && L8.deposit && L8.deposit.summon === 'warden', '寄存柜还在，召唤物是 warden（第 83 块换的）');
ok(levelTypes(L8).includes('warden'), '召唤物进了预载清单');
ok(/s08/.test(storySrc), '剧情 s08 接关还在');

console.log('\n二、队形系统确实删干净了（第 83 块换掉的）');
ok(!ENEMY_TYPES.ranker && !ENEMY_TYPES.bearer, 'ranker / bearer 两个条目没了');
ok(!/squad/i.test(enemySrc), 'enemy.js 里没有 squad');
ok(!/ranker|bearer/.test(enemySrc) && !/ranker|bearer/.test(waveSrc), '代码里不再出现这两只的名字');

console.log(`\n（退役套件）通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
