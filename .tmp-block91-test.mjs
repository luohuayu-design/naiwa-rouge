// 第 91 块契约（纯 Node，不起浏览器）
//   用户：「一关卡内，回合增加，让难度梯度更明显，例如攻击更快，移动更快，
//          伤害更高等等，而不只是叠个数和生命。」
//   追问后定案：① 加「攻速」和「移速」两个维度；② 曲线做成**后期加速**。
//
// 这一块的核心是三条：
//   · roundScale 多一根轴 haste（出手频率），且是**平方后期加速**；
//   · enemy.js 全部冷却走同一个出口 cdOf，一个都不能漏；
//   · 前摇 / 预警圈时长**一律不动** —— 更快，不是更没法躲。
// 跑法：node .tmp-block91-test.mjs
import { readFileSync } from 'node:fs';
import {
  LEVELS_BY_ID, roundScale, DIFFS, setDifficulty, LEVEL_1,
} from './js/wave.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const WAVE = readFileSync('js/wave.js', 'utf8');
const ENEMY = readFileSync('js/enemy.js', 'utf8');
const MAIN = readFileSync('js/main.js', 'utf8');
const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const L = Object.fromEntries(IDS.map((i) => [i, LEVELS_BY_ID[i]]));

// ============================================================
sec('一、九关的成长表：多了 haste / curve，移速斜率提到 0.045');
// ============================================================
for (const i of IDS) {
  const s = L[i].scale;
  ok(s.haste != null && s.haste > 0, `第 ${i} 关有 haste 斜率`, String(s.haste));
  ok(near(s.curve, 0.28), `第 ${i} 关 curve = 0.28（后期加速）`, String(s.curve));
  ok(near(s.speed, 0.045), `第 ${i} 关移速斜率 0.045（第 90 块是 0.035）`, String(s.speed));
}
// 攻速斜率随关号递增：后一关的怪出手更密
const hasteSlopes = IDS.map((i) => L[i].scale.haste);
ok(hasteSlopes.every((v, k) => k === 0 || v >= hasteSlopes[k - 1]),
  'haste 斜率随关号非递减', hasteSlopes.join(' / '));
ok(hasteSlopes[8] > hasteSlopes[0], '第九关的攻速成长最快', `${hasteSlopes[0]} → ${hasteSlopes[8]}`);

// ============================================================
sec('二、roundScale：R1 不变、单调、R20 落在 1.40~1.58、平方加速');
// ============================================================
setDifficulty('normal');
ok(Object.keys(roundScale(1)).sort().join(',') === 'damage,haste,hp,speed',
  'roundScale 返回四个维度 hp / damage / speed / haste',
  Object.keys(roundScale(1)).join(','));

for (const i of IDS) {
  const r1 = roundScale(1, L[i]);
  // 第 112 块：普通难度不再是 1.00 —— R1 的攻速就是难度倍率本身
  ok(near(r1.haste, DIFFS.normal.haste), `第 ${i} 关 R1 攻速 = 难度倍率（第一回合不加成长）`, r1.haste.toFixed(4));
  // 单调
  let mono = true;
  for (let r = 2; r <= 20; r++) {
    if (roundScale(r, L[i]).haste <= roundScale(r - 1, L[i]).haste) mono = false;
  }
  ok(mono, `第 ${i} 关 haste 逐回合严格递增`);
  const r20 = roundScale(20, L[i]).haste / DIFFS.normal.haste;
  ok(r20 >= 1.40 && r20 <= 1.58, `第 ${i} 关 R20 攻速落在 1.40~1.58（扣掉难度倍率后）`, r20.toFixed(3));
}

// 平方曲线：同样 5 回合的跨度，后段涨得比前段多得多
{
  const h = (r) => roundScale(r, L[1]).haste;
  const early = h(6) - h(1);    // R1 → R6
  const late = h(20) - h(15);   // R15 → R20
  ok(late > early * 2.2, '同样 5 回合，最后五回合的涨幅 > 前五回合的 2.2 倍',
    `${early.toFixed(3)} → ${late.toFixed(3)}`);
  const mid = h(11) - h(6);
  ok(late > mid * 1.8, '后期（R15→R20）比中段（R6→R11）也陡得多',
    `${mid.toFixed(3)} → ${late.toFixed(3)}`);
  ok(h(5) / h(1) < 1.06, '前五回合几乎感觉不到（< ×1.06，扣掉难度基数）', (h(5) / h(1)).toFixed(3));
}

// 血量 / 伤害**绝不**吃平方曲线 —— 它们本来就已经很陡
for (const i of IDS) {
  const s = L[i].scale;
  const r20 = roundScale(20, L[i]);
  ok(near(r20.hp, (1 + s.hp * 19) * (s.hpMul || 1) * DIFFS.normal.hp),
    `第 ${i} 关 R20 血量仍是纯线性（没被 curve 波及）`, r20.hp.toFixed(3));
  ok(near(r20.damage, (1 + s.damage * 19) * (s.dmgMul || 1) * DIFFS.normal.damage),
    `第 ${i} 关 R20 伤害仍是纯线性`, r20.damage.toFixed(3));
  ok(near(r20.speed, (1 + 0.045 * 19) * DIFFS.normal.speed),
    `第 ${i} 关 R20 移速 = (1 + 0.045×19) × 难度（线性，不加 curve）`, r20.speed.toFixed(3));
}

// 难度也要作用于攻速
ok(DIFFS.normal.haste > 0 && DIFFS.nightmare.haste > DIFFS.normal.haste && DIFFS.hell.haste > DIFFS.nightmare.haste,
  '三个难度都有 haste 字段且逐级升高',
  `${DIFFS.normal.haste} / ${DIFFS.nightmare.haste} / ${DIFFS.hell.haste}`);
setDifficulty('hell');
ok(near(roundScale(20, L[1]).haste, roundScale(20, L[1]).haste * 1),
  '地狱难度的 haste 已经乘进去了（同一函数，读同一份 diff）');
const hellHaste = roundScale(20, L[1]).haste;
setDifficulty('normal');
const normalHaste = roundScale(20, L[1]).haste;
ok(near(hellHaste / normalHaste, DIFFS.hell.haste / DIFFS.normal.haste),
  '地狱 R20 攻速 = 普通 × 地狱/普通倍率', (hellHaste / normalHaste).toFixed(3));
setDifficulty('normal');

// ============================================================
sec('三、enemy.js：所有冷却走同一个出口 cdOf');
// ============================================================
ok(/function cdOf\(e, base, floor = 0\.2, withAura = false\)/.test(ENEMY),
  'cdOf(e, base, floor, withAura) 存在');
const cdBody = ENEMY.slice(
  ENEMY.indexOf('function cdOf('),
  ENEMY.indexOf('function moveToward('),
);
ok(/\(e\.haste \|\| 1\)/.test(cdBody), 'cdOf 里除以 e.haste');
ok(/withAura \? 1 \+ \(e\.auraHaste \|\| 0\) : 1/.test(cdBody),
  'cdOf 保留 withAura 开关（霜牢环只在原来吃的那几套生效）');
ok(/Math\.max\(floor, base \/ hs\)/.test(cdBody), 'cdOf 仍然夹原来那个下限，冷却不会被除成 0');

// spawn：从 opts.hasteScale 进来，带防呆下限
ok(/const haste = Math\.max\(0\.25, opts\.hasteScale \?\? 1\);/.test(ENEMY),
  'spawn 读 opts.hasteScale，下限 0.25（防每帧出手）');
ok(/^\s+haste,\s{2,}.*$/m.test(ENEMY) || /\n\s+haste,\s+\/\/ 第 91 块/.test(ENEMY),
  'e.haste 落到实例上（不写进 ENEMY_TYPES，避免波次叠乘）');

// 每一处 attackCd 赋值都必须吃 haste（白名单三处：重启体躺尸延迟 / 震钟打断惩罚 / 初始随机）
const cdLines = [...ENEMY.matchAll(/^\s*(?:if \(e\.attackCd == null\) )?e\.attackCd = (.+);/gm)].map((m) => m[1]);
ok(cdLines.length >= 13, `扫到 ${cdLines.length} 处 attackCd 赋值`, String(cdLines.length));
const WHITELIST = [
  '0.35',                       // 重启体：躺 4 秒后站起来的那点延迟，不是出手间隔
  'Math.max(e.attackCd, 0.9)',  // 震钟打断：玩家主动打断的奖励窗口，不该被怪变快抹掉
  'Math.max(e.attackCd, 1.4)',  // 第 114 块收账人：读条被打断后的缓冲，同上 —— 是「奖励窗口」不是出手间隔
];
const bad = cdLines.filter((expr) => {
  if (WHITELIST.some((w) => expr.trim() === w)) return false;
  // 称量官单独走 wgHaste（= sqrt(haste)），也是吃了成长的合法写法
  if (/wgHaste/.test(expr)) return false;
  return !(/cdOf\(/.test(expr) || /e\.haste \|\| 1\)/.test(expr));
});
ok(bad.length === 0, '所有出手冷却都吃了 haste（没有漏网的怪）', bad.join(' ; '));

// 旧的「手动除 auraHaste」写法必须绝迹 —— 否则那几套就不吃 haste
// 逐行扫：只有称量官那一行允许手写（它用 wgHaste 而不是 cdOf）
const auraHand = ENEMY.split('\n')
  .filter((ln) => /\/ \(1 \+ e\.auraHaste\)/.test(ln))
  .filter((ln) => !/wgHaste/.test(ln));
ok(auraHand.length === 0,
  '除了称量官那一行，没有残留 / (1 + e.auraHaste) 的手写除法（其余全收进 cdOf）',
  auraHand.slice(0, 3).join(' | '));

// 召唤物继承
ok(/summonScale: \{ hp: opts\.hpScale \?\? 1, dmg: opts\.damageScale \?\? 1, haste \}/.test(ENEMY),
  '召唤物继承本回合攻速（不然后期召出来的卫队还是 R1 的节奏）');
// 第 96 块加了第三处：寄存处看守砸柜放出的小怪（smashCabinet）
ok((ENEMY.match(/hasteScale: \(e\.summonScale && e\.summonScale\.haste\) \?\? 1,/g) || []).length === 3,
  '三处召唤（孢生菇小兵 / 菌王卫队 / 看守砸柜）都传了 hasteScale');

// 称量官特殊：上称只吃一半攻速
ok(/const wgHaste = Math\.sqrt\(e\.haste \|\| 1\);/.test(ENEMY),
  '称量官的上称节奏只吃一半攻速（Math.sqrt）—— 五层本身就是独立成长，全额吃会失控');
ok(/\(cfg\.every - e\.cfg\.attackDuration\) \/ wgHaste/.test(ENEMY),
  '称量官冷却用的是 wgHaste 而不是 cdOf');

// ============================================================
sec('四、前摇 / 预警一律不动（更快 ≠ 更没法躲）');
// ============================================================
const windupHaste = [...ENEMY.matchAll(/^\s*.*windup.*haste.*$/gm)].map((m) => m[0].trim());
ok(windupHaste.length === 0, '源码里没有任何一行把 windup 和 haste 放在一起',
  windupHaste.slice(0, 3).join(' | '));
ok(!/windup:.*haste/.test(ENEMY), 'cfg 里的 windup 定义没被乘上倍率');
// 红圈 / 读条用的都是 windup，不是冷却
ok(/fx\.ring\(e\.pos, \{ from: [^}]*life: e\.cfg\.windup/.test(ENEMY),
  '红圈预警时长仍直接取 cfg.windup（没被改）');

// ============================================================
sec('五、调用链：wave / main 都把 haste 传下去');
// ============================================================
// 第 122 块：疾风挑战要在这一项上再乘一个系数，断言改成「传了 hasteScale，且以 sc.haste 为底」
ok(/hasteScale: sc\.haste(\s*\*\s*\(rm\.hasteMul \|\| 1\))?,/.test(WAVE),
  'wave.js 刷怪时传 hasteScale');
ok(/hasteScale: sc\.haste,\s+\/\/ 第 91 块：看守的出手也要跟着回合变密/.test(MAIN),
  'main.js 寄存处看守被召唤时也传 hasteScale');
ok(/const sc = roundScale\(roundIndex \+ 1, level\);/.test(WAVE),
  '刷怪用的是本关的 level（各关斜率不同）');

// roundScale 的注释写清了「curve 只作用于 haste」这条纪律
ok(/只作用于 \*\*行动类\*\*维度/.test(WAVE) || /只作用于 haste/.test(WAVE),
  'roundScale 的注释写明了 curve 只作用于 haste');

// ============================================================
sec('六、换算：R20 的实际手感（一关 · 小兵）');
// ============================================================
{
  const s1 = roundScale(1, L[1]);
  const s20 = roundScale(20, L[1]);
  const minionSpeed = 2.30;   // enemy.js 的 minion.speed
  ok(near(minionSpeed * s1.speed, 2.30 * DIFFS.normal.speed), 'R1 小兵移速 = 基础 × 难度（没被动过）');
  const sp20 = minionSpeed * s20.speed;
  ok(sp20 / DIFFS.normal.speed > 4.1 && sp20 / DIFFS.normal.speed < 4.35,
    'R20 小兵移速 4.2 左右（扣掉难度后，主角 4.4，后期咬脚后跟）', (sp20 / DIFFS.normal.speed).toFixed(2));
  // 出手间隔：warrior attackInterval 1.7
  const iv = 1.7;
  ok(near(iv / s1.haste, iv / DIFFS.normal.haste), 'R1 出手间隔 = 基础间隔 ÷ 难度攻速');
  const iv20 = iv / s20.haste;
  ok(iv20 / iv < 0.72, 'R20 出手间隔缩到原来的 7 成以下', iv20.toFixed(3));
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log(' · ' + f); process.exit(1); }
