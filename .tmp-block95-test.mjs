// 第 95 块契约（纯 Node，不起浏览器）
//   ① 并联体两两实时最小间距 8.0 → 16.0（用户「放大到原来的二倍」），
//      且 16 格在第六关 arena 19 的场地里仍容得下 4 只
//   ② 并联体生命 12 → 8（用户「现在太高了，适当降低」）
//   ③ 管理员模式二「填最终值」的数学（第 98 块改版：存**追加项**，基础值不动）
//   ④ 密码门：没开管理员模式一时整栏隐藏
//   ⑤ 生效时机：新开一局 + 读档续玩两条路都 applyAdmin
//   ⑥ 版本号同步
// 跑法：node .tmp-block95-test.mjs（cwd = naiwa-rouge）
import { readFileSync } from 'node:fs';
import { ENEMY_TYPES } from './js/enemy.js';
import { createStats, STAT_DEFS } from './js/stats.js';
import { LEVEL_6 } from './js/wave.js';
import { getStatAdmin, setStatAdmin, resetStatAdmin } from './js/profile.js';

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
sec('③ 管理员模式二「填最终值」的数学（第 98 块：基础值不动）');
const s = createStats(STAT_DEFS);
ok(typeof s.sumMods === 'function', 'stats 实例暴露 sumMods(key)');
ok(typeof s.natural === 'function', 'stats 实例暴露 natural(key)（不含手改项的自然最终值）');
let sum = s.sumMods('attack');
ok(sum.flat === 0 && sum.pct === 0, `空加成时 {flat:${sum.flat}, pct:${sum.pct}}`);
s.addMod({ stat: 'attack', flat: 3, src: 'test' });
s.addMod({ stat: 'attack', pct: 0.5, src: 'test' });
sum = s.sumMods('attack');
ok(sum.flat === 3 && Math.abs(sum.pct - 0.5) < 1e-9, `合计 {flat:${sum.flat}, pct:${sum.pct}}`);
// get: (base 1 + 3) * 1.5 = 6
ok(Math.abs(s.get('attack') - 6) < 1e-9, `基础 1 +3 攻 +50% = ${s.get('attack')}`);

// 与 main.js 里 submitStatFinal 完全一致的算法：追加项 = 目标最终值 − 自然最终值
const solveAdj = (target, st) => target - st.natural('attack');
const ATK_BASE = STAT_DEFS.find((d) => d.key === 'attack').base;
const target = 100;
const adj = solveAdj(target, s);
const s2 = createStats(STAT_DEFS, { attack: adj });
s2.addMod({ stat: 'attack', flat: 3, src: 'test' });
s2.addMod({ stat: 'attack', pct: 0.5, src: 'test' });
ok(Math.abs(s2.get('attack') - target) < 1e-9,
  `填最终值 ${target} → 追加项 ${adj.toFixed(4)} → 面板回读 ${s2.get('attack').toFixed(4)}`);
// ★ 用户的核心诉求：基础值一个字节都没动
ok(s2.base.attack === ATK_BASE,
  `基础值没被改（仍是 ${s2.base.attack}，第 95 块会变成 ${adj.toFixed(2)}）`);
// 再渲染一次不能漂（追加项是固定值，跟加成无关）
ok(Math.abs(solveAdj(100, s2) - adj) < 1e-9, `二次换算稳定（${solveAdj(100, s2).toFixed(6)} vs ${adj.toFixed(6)}）`);

// 之后抽到 flat 加成：加在改后最终值上。
// 注意 flat 仍然吃引擎原有的百分比（(base+Σflat)×(1+Σpct) 是第 1 块就定下的公式，
// 这轮不动它）—— 所以在**没有 pct** 的属性上才能看到干净的「+N 就是 +N」。
const s5 = createStats(STAT_DEFS);
const adj5 = 100 - s5.natural('attack');
const s6 = createStats(STAT_DEFS, { attack: adj5 });
s6.addMod({ stat: 'attack', flat: 20, src: 'upg:test' });
ok(Math.abs(s6.get('attack') - 120) < 1e-9,
  `（无 pct）改完 100 后抽到 +20 攻击 → ${s6.get('attack')}（= 100 + 20）`);
// 有 pct 时 flat 照旧被放大 —— 这是引擎老规则，不是追加项引入的
s2.addMod({ stat: 'attack', flat: 20, src: 'upg:test' });
ok(Math.abs(s2.get('attack') - (100 + 20 * 1.5)) < 1e-9,
  `（有 +50%）+20 攻击 → +30 → ${s2.get('attack')}（flat 吃 pct 是老公式，追加项不受影响）`);

// 之后抽到 pct 加成：只乘**基础值**，不乘改后的值（用户原话「改后最终值 + 改动率 × 基础值」）
const s3 = createStats(STAT_DEFS);
const HP_BASE = STAT_DEFS.find((d) => d.key === 'maxHp').base;
const adj3 = 100 - s3.natural('maxHp');
const s4 = createStats(STAT_DEFS, { maxHp: adj3 });
ok(Math.abs(s4.get('maxHp') - 100) < 1e-9, `生命填 100 → ${s4.get('maxHp')}`);
s4.addMod({ stat: 'maxHp', pct: 0.2, src: 'camp' });
ok(Math.abs(s4.get('maxHp') - (100 + 0.2 * HP_BASE)) < 1e-9,
  `再加 +20% → ${s4.get('maxHp')}（= 100 + 0.2 × 基础 ${HP_BASE}，不是 100×1.2=120）`);
ok(s4.base.maxHp === HP_BASE, `加完百分比后基础值仍是 ${s4.base.maxHp}`);
// flat 也一样：只加绝对值，不吃百分比
// 追加项本身绝对不参与乘法：不管怎么加 pct，get − natural 恒等于追加项
for (const p of [0.2, 0.5, 1.0]) {
  const t = createStats(STAT_DEFS, { maxHp: adj3 });
  t.addMod({ stat: 'maxHp', pct: p, src: 'camp' });
  ok(Math.abs((t.get('maxHp') - t.natural('maxHp')) - adj3) < 1e-9,
    `pct=${p} 时 追加项 恒定（${(t.get('maxHp') - t.natural('maxHp')).toFixed(4)}）`);
}

// 追加项本身不产生 Infinity / NaN
ok(Number.isFinite(createStats(STAT_DEFS, { attack: 1e6 }).get('attack')), '极大追加项不会算出 Infinity');
ok(createStats(STAT_DEFS, {}).get('attack') === createStats(STAT_DEFS).get('attack'),
  '空 map 与不传第二参完全等价');

// ---------------------------------------------------------------- ④ 密码门
sec('④ 属性页那一栏跟「管理员模式一」共用密码');
ok(/if \(!adminOn && statAdmin2\) statAdmin2 = false;/.test(mainSrc), '没开沙盒时强制关掉编辑态');
ok(/stAdminBar\.hidden = !adminOn;/.test(mainSrc), '没开沙盒时整栏 hidden');
ok(/<div class="st-admin" id="stAdminBar" hidden>/.test(htmlSrc), 'HTML 初始就带 hidden（进页面前不可见）');
ok(/\.st-admin\[hidden\]\{display:none\}/.test(cssSrc), 'hidden 时确实不占位（flex 容器会被 hidden 覆盖）');

// ---------------------------------------------------------------- ⑤ 生效时机
sec('⑤ 生效时机：新开一局 + 读档续玩');
const applyCalls = (mainSrc.match(/stats\.applyAdmin\(getStatAdmin\(\)\)/g) || []).length;
ok(applyCalls >= 2, `applyAdmin(getStatAdmin()) 出现 ${applyCalls} 次（resetRunState + resumeGame）`);
const resumeAt = mainSrc.indexOf('async function resumeGame');
const resumeSeg = mainSrc.slice(resumeAt, resumeAt + 4000);
ok(/stats\.applyAdmin\(getStatAdmin\(\)\);/.test(resumeSeg), 'resumeGame 里确实调了（读档吃新值）');
ok(resumeSeg.indexOf('stats.applyAdmin') < resumeSeg.indexOf('stats.loadMods(saved.playerMods'),
  'applyAdmin 在 loadMods 之前（先定基准再叠加成）');
ok(!/stats\.applyBases/.test(mainSrc), '老入口 applyBases 已经彻底删掉（不会两条路各管一半）');

// ---------------------------------------------------------------- 存档往返
sec('⑥ statAdmin 存档往返');
resetStatAdmin();
ok(Object.keys(getStatAdmin()).length === 0, '初始为空');
setStatAdmin('attack', 12.5);
ok(getStatAdmin().attack === 12.5, `写进档案：${getStatAdmin().attack}`);
setStatAdmin('armor', '3');
ok(getStatAdmin().armor === 3, '字符串输入被转成数字');
setStatAdmin('armor', 0);
ok(!('armor' in getStatAdmin()), '写 0 = 删掉这个键（没有追加项）');
setStatAdmin('armor', '');
ok(!('armor' in getStatAdmin()), '空字符串 = 删掉这个键');
resetStatAdmin();
ok(Object.keys(getStatAdmin()).length === 0, '恢复默认清空');
// 老字段必须被清掉，否则「基础」永远显示成被放大的值
ok(!('statBases' in JSON.parse(JSON.stringify((await import('./js/profile.js')).profile()))),
  '老字段 statBases 不再出现在档案里');

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
