// 第 72 块契约测试：按关预载（加载变快）
import { readFileSync } from 'node:fs';
import { LEVELS_BY_ID, levelTypes } from './js/wave.js?v=84';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };

const waveSrc = readFileSync(new URL('./js/wave.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
const enemySrc = readFileSync(new URL('./js/enemy.js', import.meta.url), 'utf8');

// --- 1) levelTypes 覆盖与去重 ---
const seen = new Set();
for (const id of Object.keys(LEVELS_BY_ID)) {
  const t = levelTypes(LEVELS_BY_ID[id]);
  ok('第' + id + '关至少 3 种怪', t.length >= 3);
  ok('第' + id + '关无重复', new Set(t).size === t.length);
  for (const x of t) seen.add(x);
}
ok('全部 7 关合起来覆盖 17 种怪', seen.size === 17);
ok('第一关只有 4 种（首屏最小集）', levelTypes(LEVELS_BY_ID[1]).length === 4);
ok('第一关含 minion（教程要打一只）', levelTypes(LEVELS_BY_ID[1]).includes('minion'));
ok('第五关含 eraser', levelTypes(LEVELS_BY_ID[5]).includes('eraser'));
ok('第六关含 reboot', levelTypes(LEVELS_BY_ID[6]).includes('reboot'));
ok('第七关含 wellfrog', levelTypes(LEVELS_BY_ID[7]).includes('wellfrog'));
ok('第七关含 woodfish', levelTypes(LEVELS_BY_ID[7]).includes('woodfish'));
ok('第一关不含 hexer（二关才登场）', !levelTypes(LEVELS_BY_ID[1]).includes('hexer'));
ok('第三关不含 eraser', !levelTypes(LEVELS_BY_ID[3]).includes('eraser'));
// 整关一只都不出的种不该被拉进来（关卡表里只是占位 0）
for (const id of Object.keys(LEVELS_BY_ID)) {
  const lv = LEVELS_BY_ID[id];
  const t = levelTypes(lv);
  const bad = t.filter((x) => !(lv.rounds || []).some((r) => (r[x] || 0) > 0));
  ok('第' + id + '关没有「整关 0 只」的种', bad.length === 0);
}

// --- 2) 代码实现 ---
ok('wave.js 导出 levelTypes', /export function levelTypes/.test(waveSrc));
ok('enemy.js 暴露 loaded()', /loaded: \(\) => \[\.\.\.assets\.keys\(\)\]/.test(enemySrc));
ok('main.js 引入 levelTypes', /levelTypes/.test(mainSrc.slice(0, 3000)));
ok('main.js 引入 ENEMY_TYPES', /import \{ createEnemySystem, ENEMY_TYPES \}/.test(mainSrc));
ok('加载页只预载第一关（debug 例外）', /DEBUG \? Object\.keys\(ENEMY_TYPES\) : levelTypes\(LEVEL_1\)/.test(mainSrc));
ok('有 ensureLevelAssets', /async function ensureLevelAssets/.test(mainSrc));
ok('beginGame 是 async', /async function beginGame/.test(mainSrc));
ok('beginGame 里等预载', /await ensureLevelAssets\(pendingLevelId\)/.test(mainSrc));
ok('读档也补模型', /await ensureLevelAssets\(saved\.level \|\| 1\)/.test(mainSrc));
ok('resumeGame 是 async', /async function resumeGame/.test(mainSrc));
ok('没有写死 15 只怪的全量列表', !/\['minion', 'warrior', 'archer', 'bowman', 'hexer'/.test(mainSrc));
const bi = mainSrc.indexOf('async function beginGame');
const seg = mainSrc.slice(bi, bi + 1400);
ok('预载在标题页淡出之后（点了立刻有反馈）',
  seg.indexOf("titleScr.classList.add('off')") >= 0
  && seg.indexOf('ensureLevelAssets') > seg.indexOf("titleScr.classList.add('off')"));
ok('补载复用 #loading 而不是新造浮层', /loadingEl\.style\.display = 'flex'/.test(mainSrc));

// --- 3) 版本号 ---
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/main\.js\?v=(\d+)/);
ok('index.html 版本号存在', !!m);
// ⚠️ HANDOFF 铁律：测试里**别写死版本号**，一律以 index.html 为基准比对
const VER = m[1];
ok('index.html 版本号 >= 83', Number(VER) >= 83, VER);
const imps = [...mainSrc.matchAll(/from '\.\/[a-zA-Z]+\.js\?v=(\d+)'/g)].map((x) => x[1]);
ok(`main.js 内所有 import 都是 ${VER}（与 index.html 一致）`,
  imps.length > 20 && imps.every((v) => v === VER), [...new Set(imps)].join(','));

console.log('\n第 72 块契约：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
