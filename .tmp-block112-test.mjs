// 第 112 块 Node 契约测试（纯 Node，不起浏览器）
// 用户这一轮五条：
//   ① 称量官：血量降、技能更快（每 8 秒一层）、全场所有属性 +10%、无层数上限、直到被杀
//   ② 盖章人：章边长 ×4、盖得更快、封步持续到盖章人死亡
//   ③ 整体难度：普通抬到旧地狱、新增简单（骨币少）、噩梦 / 地狱再往上加
//   ④ 诅咒改「最终乘算」：脆骨 = 最终生命 ×0.66（+3 实际只 +1.98）
//   ⑤ 所有诅咒的骨币倍率减半
// 跑法：node .tmp-block112-test.mjs（cwd = naiwa-rouge）
import { readFileSync, readdirSync } from 'node:fs';
import { DIFFS, setDifficulty, getDifficulty, roundScale, LEVELS_BY_ID } from './js/wave.js';
import { BONE, diffBoneMul, bonesFor } from './js/campfire.js';
import { ENEMY_TYPES } from './js/enemy.js';
import { createStats } from './js/stats.js';
import { RUN_CURSES, curseMul, applyRunCurses } from './js/curses.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra != null ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra != null ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const enemySrc = readFileSync('js/enemy.js', 'utf8');
const mainSrc = readFileSync('js/main.js', 'utf8');
const waveSrc = readFileSync('js/wave.js', 'utf8');
const codexSrc = readFileSync('js/codex.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

// ============================================================
sec('一、四档难度：普通 = 旧地狱，简单更低，噩梦 / 地狱再往上');
// ============================================================
const ORDER = ['easy', 'normal', 'nightmare', 'hell'];
ok(Object.keys(DIFFS).join(',') === ORDER.join(','), '四档顺序：简单 / 普通 / 噩梦 / 地狱', Object.keys(DIFFS).join(','));
ok(DIFFS.easy.name === '简单' && DIFFS.normal.name === '普通'
  && DIFFS.nightmare.name === '噩梦' && DIFFS.hell.name === '地狱', '四档中文名齐全');

const WANT = {
  easy:      { hp: 0.90, damage: 0.75, speed: 0.95, haste: 0.95 },
  normal:    { hp: 1.80, damage: 1.55, speed: 1.08, haste: 1.10 },
  nightmare: { hp: 2.30, damage: 1.90, speed: 1.14, haste: 1.16 },
  hell:      { hp: 2.90, damage: 2.30, speed: 1.20, haste: 1.22 },
};
for (const k of ORDER) {
  for (const dim of ['hp', 'damage', 'speed', 'haste']) {
    ok(near(DIFFS[k][dim], WANT[k][dim]), `${k}.${dim} = ${WANT[k][dim]}`, String(DIFFS[k][dim]));
  }
}
// 普通 = 旧地狱（第 91 块的旧值 1.80 / 1.55 / 1.08 / 1.10）
ok(DIFFS.normal.hp === 1.80 && DIFFS.normal.damage === 1.55,
  '普通抬到旧地狱标准（1.80 / 1.55）');
// 四档逐级递增（每一个维度都必须单调）
for (const dim of ['hp', 'damage', 'speed', 'haste']) {
  const seq = ORDER.map((k) => DIFFS[k][dim]);
  ok(seq.every((v, i) => i === 0 || v > seq[i - 1]), `${dim} 逐档递增`, seq.join(' / '));
}
// 简单必须真的更容易：四项都低于普通
for (const dim of ['hp', 'damage', 'speed', 'haste']) {
  ok(DIFFS.easy[dim] < DIFFS.normal[dim], `简单.${dim} 低于普通`);
}
// setDifficulty / getDifficulty 走同一份表
setDifficulty('hell');
ok(getDifficulty() === DIFFS.hell, 'setDifficulty 切到地狱');
setDifficulty('normal');
ok(getDifficulty() === DIFFS.normal, '切回普通');
ok(near(roundScale(1, LEVELS_BY_ID[1]).hp, DIFFS.normal.hp),
  'roundScale 真的乘了难度（R1 血量 = 难度 hp）', String(roundScale(1, LEVELS_BY_ID[1]).hp));

// ============================================================
sec('二、骨币难度倍率：简单 ×0.6，噩梦 / 地狱更高');
// ============================================================
ok(BONE.diffMul.easy === 0.6 && BONE.diffMul.normal === 1
  && BONE.diffMul.nightmare === 1.4 && BONE.diffMul.hell === 1.8,
  'diffMul = 简单 0.6 / 普通 1 / 噩梦 1.4 / 地狱 1.8', JSON.stringify(BONE.diffMul));
for (const k of ORDER) ok(near(diffBoneMul(k), BONE.diffMul[k]), `diffBoneMul('${k}') 对表`);
{
  const args = { roundShown: 20, kills: 273, isWin: true, coins: 100, levelId: 1 };
  const normal = bonesFor(args, 'normal');
  const easy = bonesFor(args, 'easy');
  const hell = bonesFor(args, 'hell');
  ok(Math.abs(easy / normal - 0.6) < 0.01, '简单档同一局骨币约 ×0.6', `${easy}/${normal}`);
  ok(Math.abs(hell / normal - 1.8) < 0.01, '地狱档同一局骨币约 ×1.8', `${hell}/${normal}`);
}

// ============================================================
sec('三、称量官：血 8 / 每 8 秒一层 / +10% / 无上限');
// ============================================================
const W = ENEMY_TYPES.weigher;
ok(!!W && !!W.weigh, '称量官与 weigh 配置都在');
ok(W.hp === 8, '血量 12 → 8', String(W.hp));
ok(W.attackInterval === 8.0, '上称节奏 9 → 8 秒', String(W.attackInterval));
ok(W.weigh.every === 8.0, 'weigh.every = 8（每 8 秒加一层）', String(W.weigh.every));
ok(W.weigh.cap === Infinity, '无层数上限（cap = Infinity）', String(W.weigh.cap));
ok(W.weigh.radius === Infinity, '作用范围 = 全场（radius = Infinity）', String(W.weigh.radius));
for (const dim of ['hp', 'damage', 'speed', 'haste', 'armor']) {
  ok(near(W.weigh.per[dim], 0.10), `每层 ${dim} +10%`, String(W.weigh.per[dim]));
}
// 实现：层数不封顶 / 生命与攻速按出生值算 / 减伤乘法
ok(/weighTier \+= 1;\s*\/\/ 第 112 块：无上限/.test(enemySrc), 'performWeigh 直接 +1，不再夹 cap');
ok(!/Math\.min\(cfg\.cap,\s*weighTier/.test(enemySrc), '旧的 cap 夹取写法已绝迹');
ok(/hp0: maxHp,/.test(enemySrc) && /haste0: haste,/.test(enemySrc), '实例记了出生基准 hp0 / haste0');
ok(/e\.maxHp = e\.hp0 \* \(1 \+ cfg\.per\.hp \* t\);/.test(enemySrc), '生命上限按出生值 ×(1 + 10% × 层)');
ok(/e\.haste = e\.haste0 \* \(1 \+ \(cfg\.per\.haste \|\| 0\) \* t\);/.test(enemySrc), '攻速按出生值 ×(1 + 10% × 层)');
ok(/e\.namedArmor = 1 - Math\.pow\(1 - \(cfg\.per\.armor \|\| 0\), t\);/.test(enemySrc), '减伤 = 1 − 0.9^层（乘法，不会免疫）');
ok(/const want = Math\.min\(4\.5, 0\.60 \+ t \* 0\.18\);/.test(enemySrc), '金环随层数长大但封顶 4.5（层数无上限）');
// 称量官自己也吃自己的层：dressWeigh 遍历整个 list，不跳过自己
ok(/for \(const o of list\) \{[\s\S]{0,200}if \(o\.state === 'dead' \|\| o\.state === 'down'\) continue;[\s\S]{0,120}dressWeigh\(o\);/.test(enemySrc),
  '上称遍历全场（包括称量官自己）');
// 文案
const wDesc = (codexSrc.match(/if \(cfg\.weigh\) \{\s*\n\s*const p = cfg\.weigh\.per;[\s\S]*?return `([^`]+)`/) || [, ''])[1];
ok(wDesc.includes('没有层数上限'), '图鉴写明「没有层数上限」');
ok(/每 \$\{cfg\.weigh\.every\} 秒上称一次/.test(codexSrc), '图鉴的数值行写的是 8 秒上称');

// ============================================================
sec('四、盖章人：章边长 ×4 / 更快 / 封步到它死亡');
// ============================================================
const S = ENEMY_TYPES.stamper;
ok(S.attackInterval === 2.4, '盖章间隔 3.4 → 2.4', String(S.attackInterval));
ok(S.windup === 1.0, '前摇 1.15 → 1.0', String(S.windup));
ok(S.seal.radius === 6.2, '方印半宽 1.55 → 6.2（边长 ×4）', String(S.seal.radius));
ok(S.seal.slow === 0.5, '封步系数仍是 0.5');
ok(S.seal.time === Infinity, '封步不再自然结束（time = Infinity）', String(S.seal.time));
// 实现：按来源 id 记账，盖章人死了才解除
ok(/const sealBySource = new Map\(\);/.test(mainSrc), 'main 用 sealBySource 按盖章人 id 记账');
ok(/function sealPlayer\(id, factor = 0\.5\)/.test(mainSrc), '有 sealPlayer');
ok(/function unsealPlayer\(id\)/.test(mainSrc), '有 unsealPlayer');
ok(/if \(e\.cfg\.seal\) unsealPlayer\(e\.id\);/.test(mainSrc), '盖章人 onDeath 时解除自己那份封步');
ok(/function moveDebuffMul\(\) \{[\s\S]{0,160\}sealMoveMul\(\)/.test(mainSrc.replace(/\n/g, ' ')) ||
  /moveDebuffMul\(\)[\s\S]{0,200}sealMoveMul\(\)/.test(mainSrc), '移速倍率合并了 sealMoveMul');
ok(/sealPlayer\(\s*src\.id, v\.seal\.slow\)/.test(enemySrc.replace(/\n/g, ' ')), '落印命中时把盖章人 id 交给 sealPlayer');
ok(/const srcAlive = !src \|\| \(src\.state !== 'dead' && src\.state !== 'down'\);/.test(enemySrc),
  '盖章人已死时印盖空、不再命中');
// 文案
ok(codexSrc.includes('盖章人死亡'), '图鉴写明封步持续到盖章人死亡');
ok(codexSrc.includes('${cfg.attackInterval} 秒'), '图鉴写明每 2.4 秒盖一次');

// ============================================================
sec('五、诅咒：最终乘算 + 骨币倍率减半');
// ============================================================
const BY = Object.fromEntries(RUN_CURSES.map((c) => [c.id, c]));
const WANT_MUL = { frail: 0.125, lead: 0.10, sluggish: 0.10, hunger: 0.10, thin: 0.075, thorn: 0.15 };
for (const [id, m] of Object.entries(WANT_MUL)) {
  ok(BY[id] && near(BY[id].mul, m), `${id} 骨币倍率 = ${m}（原值的一半）`, BY[id] && String(BY[id].mul));
}
ok(near(curseMul(Object.keys(WANT_MUL)), 1.65), '六条全选骨币倍率 = ×1.65（原来 ×2.30）', String(curseMul(Object.keys(WANT_MUL))));

{
  const stats = createStats();
  const wstats = createStats();
  applyRunCurses(stats, wstats, ['frail']);
  ok(near(stats.get('maxHp'), 6.6), '脆骨：生命上限 10 → 6.6（最终 ×0.66）', String(stats.get('maxHp')));
  stats.addMod({ stat: 'maxHp', flat: 3, src: 'test' });
  const after = stats.get('maxHp');
  ok(near(after, 8.58), '局中 +3 上限 → 8.58（实际只 +1.98）', String(after));
  ok(near(after - 6.6, 1.98), '+3 实际只兑现 1.98', String(after - 6.6));
}
{
  // 最终乘算必须排在 flat / pct 之后：(base + flat) × (1 + pct) × mul
  const stats = createStats();
  applyRunCurses(stats, createStats(), ['frail']);
  stats.addMod({ stat: 'maxHp', pct: 0.5, src: 'test' });
  ok(near(stats.get('maxHp'), 10 * 1.5 * 0.66), '+50% 后再 ×0.66（不是先乘 0.66 再 ×1.5）',
    String(stats.get('maxHp')));
}
for (const [id, key, base, mul] of [
  ['lead', 'moveSpeed', 4.4, 0.85],
  ['sluggish', 'attackSpeed', 1.2, 0.88],
  ['hunger', 'goldRate', 0.45, 0.65],
  ['thin', 'attack', 1.0, 0.88],
]) {
  const stats = createStats();
  applyRunCurses(stats, createStats(), [id]);
  ok(near(stats.get('' + key), base * mul, 1e-9), `${id}：${key} = ${base} × ${mul}`,
    String(stats.get(`${key}`)));
}
ok(BY.thorn.dmgTaken === 0.30, '荆棘：受到伤害 ×1.30（与原数值一致，只改结算方式）');
ok(/target\.addMod\(\{ stat: m\.stat, flat: m\.flat \|\| 0, pct: m\.pct \|\| 0, mul: m\.mul, src: 'curse' \}\);/.test(readFileSync('js/curses.js', 'utf8')),
  'applyRunCurses 把 mul 真的传进 addMod');
ok(/final = \(base \+ Σflat\) × \(1 \+ Σpct\) × Πmul \+ adminFlat/.test(readFileSync('js/stats.js', 'utf8')),
  'stats 注释写明最终公式含 Πmul');

// ============================================================
sec('六、版本号一致');
// ============================================================
const VER = Number((htmlSrc.match(/\?v=(\d+)/) || [, '0'])[1]);
ok(VER >= 127, `index.html 是 v=${VER}`, String(VER));
const jsFiles = readdirSync('js').filter((f) => f.endsWith('.js'));
const bad = jsFiles.filter((f) => {
  const s = readFileSync('js/' + f, 'utf8');
  return [...s.matchAll(/\?v=(\d+)/g)].some((x) => Number(x[1]) !== VER);
});
ok(bad.length === 0, `js/ 里所有 ?v= 都是 v=${VER}`, bad.join(','));
ok(!/\?v=(125|126)/.test(htmlSrc + waveSrc + enemySrc + mainSrc), '没有上一版的版本号残留');

console.log('\n' + '-'.repeat(50));
console.log(`第 112 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：');
  fails.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
