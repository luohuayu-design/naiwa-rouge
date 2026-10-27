// 第 95 块契约（纯 Node，不起浏览器）
//   ① 并联体两两实时最小间距 8.0 → 16.0（用户「放大到原来的二倍」），
//      且 16 格在第六关 arena 19 的场地里仍容得下 4 只
//   ② 并联体生命 12 → 8（用户「现在太高了，适当降低」）
//   ③ 管理员模式二改成「填最终值」：stats.sumMods 暴露加成合计，反解 base 的数学成立
//   ④ 密码门：没开管理员模式一时整栏隐藏
//   ⑤ 生效时机：新开一局 + 读档续玩两条路都 applyBases
//   ⑥ 版本号同步
// 跑法：node .tmp-block95-test.mjs（cwd = naiwa-rouge）
import { readFileSync } from 'node:fs';
import { ENEMY_TYPES } from './js/enemy.js';
import { createStats, STAT_DEFS } from './js/stats.js';
import { LEVEL_6 } from './js/wave.js';
import { getStatBases, setStatBase, resetStatBases } from './js/profile.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const enemySrc = read('./js/enemy.js');
const mainSrc = read('./js/main.js');
const htmlSrc = read('./index.html');
const cssSrc = read('./style.css');

// ---------------------------------------------------------------- ① 并联体间距
sec('① 并联体间距翻倍 8.0 → 16.0');
const arcCfg = ENEMY_TYPES.arc;
ok(!!arcCfg && !!arcCfg.arc, '存在 arc（并联体）配置');
ok(arcCfg.arc.minGap === 16.0, `arc.minGap = ${arcCfg.arc.minGap}（原 8.0，要求二倍）`, String(arcCfg.arc.minGap));
ok(/minGap: 16\.0/.test(enemySrc), 'enemy.js 里写的是 minGap: 16.0（不是运行时算出来的）');
// separateArcs / seatArc 的兜底值必须跟着改，否则配置漏传时又回到 16/8 混用
ok(/const gap = nodes\[0\]\.cfg\.arc\.minGap \|\| 16\.0;/.test(enemySrc), 'separateArcs 兜底 gap = 16.0');
ok(/const gap = \(e\.cfg\.arc && e\.cfg\.arc\.minGap\) \|\| 16\.0;/.test(enemySrc), 'seatArc 兜底 gap = 16.0');
ok(!/\|\| 8\.0;/.test(enemySrc), 'enemy.js 里已经没有 8.0 的旧兜底');

// 场地容得下：4 只两两 ≥ 16 格，正方形边长 16 的外接圆半径 = 16/√2 ≈ 11.3
const lv6 = LEVEL_6;
ok(!!lv6 && lv6.arena === 19, `第六关 arena = ${lv6 && lv6.arena}（格子半径）`);
const needR = 16 / Math.SQRT2;
const usableR = lv6.arena - 0.6 - 0.55;   // 夹边留 0.6，怪自身半径 0.55
ok(needR < usableR, `正方形摆法外接半径 ${needR.toFixed(2)} < 可用半径 ${usableR.toFixed(2)}，4 只摆得开`);

// ---------------------------------------------------------------- ② 血量
sec('② 并联体生命 12 → 8');
ok(arcCfg.hp === 8, `hp = ${arcCfg.hp}（原 12，仍高于同期普通怪）`, String(arcCfg.hp));
ok(/hp: 8,/.test(enemySrc), 'enemy.js 里写的是 hp: 8');
ok(!/hp: 12,\s*\/\/ 第 82 块：3\.2 → 12/.test(enemySrc), '旧的 hp: 12 注释行已替换');

// ---------------------------------------------------------------- ③ 反解数学
sec('③ 管理员模式二「填最终值」的数学');
const s = createStats(STAT_DEFS);
ok(typeof s.sumMods === 'function', 'stats 实例暴露 sumMods(key)');
let sum = s.sumMods('attack');
ok(sum.flat === 0 && sum.pct === 0, `空加成时 {flat:${sum.flat}, pct:${sum.pct}}`);
s.addMod({ stat: 'attack', flat: 3, src: 'test' });
s.addMod({ stat: 'attack', pct: 0.5, src: 'test' });
sum = s.sumMods('attack');
ok(sum.flat === 3 && Math.abs(sum.pct - 0.5) < 1e-9, `合计 {flat:${sum.flat}, pct:${sum.pct}}`);
// get: (base 1 + 3) * 1.5 = 6
ok(Math.abs(s.get('attack') - 6) < 1e-9, `基础 1 +3 攻 +50% = ${s.get('attack')}`);

// 与 main.js 里 submitStatFinal 完全一致的公式
function solveBase(target, sum) {
  const den = 1 + sum.pct;
  return (den > 1e-4 ? target / den : target) - sum.flat;
}
const target = 100;
const b = solveBase(target, sum);
const s2 = createStats(STAT_DEFS, { attack: b });
s2.addMod({ stat: 'attack', flat: 3, src: 'test' });
s2.addMod({ stat: 'attack', pct: 0.5, src: 'test' });
ok(Math.abs(s2.get('attack') - target) < 1e-9,
  `填最终值 ${target} → 反解 base ${b.toFixed(4)} → 面板回读 ${s2.get('attack').toFixed(4)}`);
// 反解出来的 base 存回去再渲染，面板必须还是 100（不会每渲染一次漂一点）
const sum2 = s2.sumMods('attack');
const b2 = solveBase(100, sum2);
ok(Math.abs(b2 - b) < 1e-9, `二次反解稳定（${b2.toFixed(6)} vs ${b.toFixed(6)}），不会越改越漂`);

// 「之后抽到加成照旧往上叠」—— 这是用户第 3 问的补充要求
s2.addMod({ stat: 'attack', flat: 20, src: 'upg:test' });
// (63.667 + 3 + 20) × 1.5 = 130 —— flat 也吃 pct，这是引擎本来的公式，不改
ok(Math.abs(s2.get('attack') - 130) < 1e-9,
  `改完 100 之后抽到 +20 攻击 → ${s2.get('attack')}（老规则继续叠，不是锁死）`);
s2.addMod({ stat: 'attack', pct: 0.5, src: 'upg:test2' });
ok(Math.abs(s2.get('attack') - 173.333333) < 1e-6,
  `再加 +50% → ${s2.get('attack').toFixed(2)}（(63.67+3+20)×2）`);

// pct 为 -100% 的极端值不能算出 Infinity
ok(Number.isFinite(solveBase(10, { flat: 0, pct: -1 })), 'pct = -1 时不会算出 Infinity');

// ---------------------------------------------------------------- ④ 密码门
sec('④ 属性页那一栏跟「管理员模式一」共用密码');
ok(/if \(!adminOn && statAdmin2\) statAdmin2 = false;/.test(mainSrc), '没开沙盒时强制关掉编辑态');
ok(/stAdminBar\.hidden = !adminOn;/.test(mainSrc), '没开沙盒时整栏 hidden');
ok(/<div class="st-admin" id="stAdminBar" hidden>/.test(htmlSrc), 'HTML 初始就带 hidden（进页面前不可见）');
ok(/\.st-admin\[hidden\]\{display:none\}/.test(cssSrc), 'hidden 时确实不占位（flex 容器会被 hidden 覆盖）');

// ---------------------------------------------------------------- ⑤ 生效时机
sec('⑤ 生效时机：新开一局 + 读档续玩');
const applyCalls = (mainSrc.match(/stats\.applyBases\(getStatBases\(\)\)/g) || []).length;
ok(applyCalls >= 2, `applyBases(getStatBases()) 出现 ${applyCalls} 次（resetRunState + resumeGame）`);
const resumeAt = mainSrc.indexOf('async function resumeGame');
const resumeSeg = mainSrc.slice(resumeAt, resumeAt + 4000);
ok(/stats\.applyBases\(getStatBases\(\)\);/.test(resumeSeg), 'resumeGame 里确实调了（读档吃新值）');
ok(resumeSeg.indexOf('stats.applyBases') < resumeSeg.indexOf('stats.loadMods(saved.playerMods'),
  'applyBases 在 loadMods 之前（先定 base 再叠加成）');

// ---------------------------------------------------------------- 存档往返
sec('⑥ statBases 存档往返');
resetStatBases();
ok(Object.keys(getStatBases()).length === 0, '初始为空');
setStatBase('attack', 12.5);
ok(getStatBases().attack === 12.5, `写进档案：${getStatBases().attack}`);
setStatBase('armor', '3');
ok(getStatBases().armor === 3, '字符串输入被转成数字');
resetStatBases();
ok(Object.keys(getStatBases()).length === 0, '恢复默认清空');

// ---------------------------------------------------------------- 版本号
sec('⑦ 版本号同步');
const v = (htmlSrc.match(/\?v=(\d+)/) || [])[1];
ok(!!v, `index.html 版本号 v=${v}`);
const jsFiles = ['main.js', 'stats.js', 'enemy.js', 'profile.js', 'statView.js'];
for (const f of jsFiles) {
  const src = read('./js/' + f);
  const vs = new Set((src.match(/\?v=(\d+)/g) || []).map((x) => x.slice(3)));
  const bad = [...vs].filter((x) => x !== v);
  ok(bad.length === 0, `js/${f} 的 import 版本号都是 ${v}`, bad.join(','));
}
const allJs = ['main.js', 'stats.js', 'enemy.js', 'profile.js', 'statView.js', 'wave.js', 'metaShop.js', 'achievements.js'];
let stale = 0;
for (const f of allJs) {
  const src = read('./js/' + f);
  stale += (src.match(/\?v=(?!\d+)/g) || []).length;
  stale += (src.match(/\?v=(\d+)/g) || []).filter((x) => x.slice(3) !== v).length;
}
ok(stale === 0, `抽查 ${allJs.length} 个模块，没有残留旧版本号`);

// ---------------------------------------------------------------- 汇总
console.log('\n' + '='.repeat(46));
console.log(`第 95 块契约：通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);
