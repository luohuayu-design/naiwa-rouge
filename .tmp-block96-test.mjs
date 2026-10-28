// 第 96 块契约（纯 Node，不起浏览器）
//   ① 寄存处看守从三招扩到五招：扇形木牌雨（唯一有方向的招）+ 砸柜放小怪
//   ② 投牌改成「会拐一次弯」：有转向速率上限，也有转向预算上限（拐完就直飞）
//   ③ 出手加密：gap 2.4 → 2.0，而且补上以前漏掉的 e.haste（第 91 块传了没用）
//   ④ 扇面几何/角度换算与 root.rotation.y 同一套约定（画在这、判在那会出人命）
//   ⑤ 文案：图鉴 / 波次提示 / 引导页都说五套，且图鉴 desc 里不许出现 HTML 或 **
//   ⑥ 版本号同步
// 跑法：node .tmp-block96-test.mjs（cwd = naiwa-rouge）
import { readFileSync } from 'node:fs';
import { ENEMY_TYPES } from './js/enemy.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const enemySrc = read('./js/enemy.js');
const codexSrc = read('./js/codex.js');
const waveSrc = read('./js/wave.js');
const mainSrc = read('./js/main.js');
const htmlSrc = read('./index.html');

const W = ENEMY_TYPES.warden.warden;

// ---------------------------------------------------------------- ① 五招参数
sec('① 五招参数齐备');

ok(!!ENEMY_TYPES.warden, 'warden 仍然存在');
for (const k of ['sweepR', 'sweepMul', 'slamR', 'slamMul', 'slamDelay',
  'tagMul', 'tagSpeed', 'chaseKeep', 'gap', 'rageAt', 'color']) {
  ok(W[k] != null, `老参数没丢：${k} = ${W[k]}`);
}
for (const k of ['fanR', 'fanHalf', 'fanMul', 'fanWindup', 'fanTags',
  'cabWindup', 'cabCount', 'cabCap', 'cabCd', 'cabFirst']) {
  ok(W[k] != null && Number.isFinite(W[k]), `新参数存在：${k} = ${W[k]}`);
}

// 扇形：90° 正面扇面、半径要够到中距带的上沿（9 格），否则「中距」那一档永远选不到它
ok(Math.abs(W.fanHalf - Math.PI / 4) < 1e-9,
  `扇面半角 = π/4（正面 90°），实际 ${W.fanHalf.toFixed(4)}`);
ok(W.fanR > W.sweepR && W.fanR >= 8.0,
  `扇面半径 ${W.fanR} 覆盖「中距」带（> ${W.sweepR} 且 ≥ 8）`);
ok(W.fanMul > W.slamMul && W.fanMul < W.sweepMul,
  `扇形伤害 ${W.fanMul} 夹在砸地 ${W.slamMul} 与横扫 ${W.sweepMul} 之间（新招不该比贴脸更疼）`);
ok(W.fanWindup > ENEMY_TYPES.warden.windup,
  `扇形前摇 ${W.fanWindup} > 基础前摇 ${ENEMY_TYPES.warden.windup}（有方向要求，必须给更长的反应时间）`);

// 砸柜：一次性召唤，必须有护栏
ok(W.cabCap >= W.cabCount,
  `召唤护栏成立：一次 ${W.cabCount} 只 ≤ 上限 ${W.cabCap} 只`);
ok(W.cabCd > 8, `砸柜独立冷却 ${W.cabCd} 秒（不占常规出手节奏，也不能连砸）`);
ok(W.cabFirst > 0, `出场 ${W.cabFirst} 秒后才会砸第一次（不让人一出门就被围）`);

// ---------------------------------------------------------------- ② 追踪牌
sec('② 追踪牌：有转向速率，也有转向预算');

ok(W.tagHome > 0 && W.tagHome < 12, `转向速率 ${W.tagHome} rad/s 是有限的（不是瞬移对准）`);
ok(W.tagTurn > 0 && W.tagTurn < Math.PI / 2,
  `转向预算 ${W.tagTurn.toFixed(2)} rad ≈ ${Math.round(W.tagTurn * 180 / Math.PI)}°（< 90°，所以「拐一次就直」）`);
ok(W.tagLife > 0 && W.tagLife <= 4, `最长飞行 ${W.tagLife} 秒（防止绕圈到天荒地老）`);
ok(W.tagSpeed > 0, `飞行速度仍是 ${W.tagSpeed} 格/秒（没跟着改造变快）`);
ok(W.tagFuse > 0 && W.tagR > 0 && W.tagR <= 2.2,
  `引爆：靠到 ${W.tagFuse} 格内引爆，半径 ${W.tagR}（原来 2.2，改小了因为现在更难躲）`);

// 源码层面确认真的是「按预算转」而不是「每帧对准玩家」
ok(/turnLeft/.test(enemySrc) && /tagTurn/.test(enemySrc),
  '源码里存在转向预算 turnLeft（由 cfg.tagTurn 初始化）');
ok(/Math\.min\(tg\.home \* dt, tg\.turnLeft\)/.test(enemySrc),
  '每帧转角取 min(速率×dt, 剩余预算) —— 两道限制都生效');
ok(!/tg\.to\.x/.test(enemySrc),
  '旧版「直奔出手瞬间那个点」的写法已彻底移除（不再有 tg.to）');

// ---------------------------------------------------------------- ③ 出手加密
sec('③ 出手加密 + 补上 haste');

ok(Math.abs(W.gap - 2.0) < 1e-9, `出手间隔 2.4 → ${W.gap}（用户要「全程加密」）`);
ok(/gap: 2\.0,/.test(enemySrc), 'cfg 里写的就是 2.0，不是运行时再乘');
ok(/cdOf\(e, cfg\.gap \* \(e\.raged \? cfg\.rageGap : 1\), 1\.1\)/.test(enemySrc),
  '出手间隔改走 cdOf（第 91 块立的规矩），floor 1.1 秒留出走位缝隙');
ok(!/e\.wdGap = Math\.max\(0\.5,/.test(enemySrc),
  '旧的 e.wdGap = Math.max(0.5, ...) 赋值已移除（那个写法完全没吃 e.haste）');

// 验证 cdOf 的语义：base / haste，且不低于 floor
function cdOfLike(base, haste, floor = 0.2) { return Math.max(floor, base / haste); }
ok(cdOfLike(2.0, 1.0) === 2.0, '无 haste 时 2.0 → 2.0');
ok(Math.abs(cdOfLike(2.0, 1.15) - 1.739) < 0.01,
  `haste 1.15 时 2.0 → ${cdOfLike(2.0, 1.15).toFixed(2)}（回合越后越密，这是第 91 块的本意）`);
ok(Math.abs(cdOfLike(2.0 * 0.45, 1.15, 1.1) - 1.1) < 0.01,
  `暴怒 + haste 1.15 → ${cdOfLike(2.0 * 0.45, 1.15, 1.1).toFixed(2)} 秒（第 110 块 rageGap 0.45，已贴 floor）`);
ok(cdOfLike(2.0 * 0.45, 1.6, 1.1) === 1.1,
  `再密也被 floor 夹在 ${cdOfLike(2.0 * 0.45, 1.6, 1.1)} 秒 —— 永远留得出一条走位缝隙`);

// ---------------------------------------------------------------- ④ 扇面角度一致性
sec('④ 扇面角度：画面上和判定上必须同源');

// 约定：root.rotation.y = atan2(dx, dz)，方向向量 = (sin φ, cos φ)
// 扇面用 CircleGeometry(r, seg, -half, 2half) 再 rotateX(-90°) → 局部朝 +X
// 要让 +X 转到 (sin φ, cos φ)，绕 Y 需要转 (φ - π/2)
function dirOf(phi) { return { x: Math.sin(phi), z: Math.cos(phi) }; }
function fanRotY(phi) { return phi - Math.PI / 2; }
function rotYOf(x, z) {
  // 绕 Y 转 b 把局部 (1,0,0) 映射到 (cos b, -sin b)
  return { x: Math.cos(fanRotY(Math.atan2(x, z))), z: -Math.sin(fanRotY(Math.atan2(x, z))) };
}
for (const deg of [0, 45, 90, 135, 180, -135, -90]) {
  const phi = (deg * Math.PI) / 180;
  const d = dirOf(phi);
  const r = rotYOf(d.x, d.z);
  ok(Math.abs(r.x - d.x) < 1e-9 && Math.abs(r.z - d.z) < 1e-9,
    `φ=${deg}° 时扇面朝向与朝向向量一致（${r.x.toFixed(3)},${r.z.toFixed(3)}）`);
}

// 判定用同一个 atan2(x,z) 约定：站在扇面正前方算命中，站在背后不算
function inFan(px, pz, ex, ez, phi, half, r) {
  const dx = px - ex, dz = pz - ez;
  const dist = Math.hypot(dx, dz);
  let diff = Math.atan2(dx, dz) - phi;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return dist <= r && Math.abs(diff) <= half;
}
const H = W.fanHalf, R = W.fanR;
ok(inFan(0, 5, 0, 0, 0, H, R), '正前方 5 格：命中');
ok(!inFan(0, -5, 0, 0, 0, H, R), '正后方 5 格：不命中（这就是「往后退没用」的反面 —— 背后是安全区）');
ok(!inFan(5, 0, 0, 0, 0, H, R), '侧面 90°、5 格：不命中（必须绕到侧面）');
ok(inFan(2, 3, 0, 0, 0, H, R), `约 34° 斜前方（扇面内）：命中`);
ok(!inFan(3, 1, 0, 0, 0, H, R), `约 72° 斜前方（超出 45° 半角）：不命中 —— 边缘没有虚胖`);
ok(!inFan(0, R + 0.5, 0, 0, 0, H, R), `正前方 ${R + 0.5} 格（超出半径）：不命中`);
ok(inFan(0, -3, 0, 0, Math.PI, H, R), '它转身朝后（φ=180°）时，(0,-3) 才是正面 —— 方向真的是锁定的');
ok(!inFan(0, 3, 0, 0, Math.PI, H, R), '同一时刻 (0,3) 落在它背后：不命中');

// 源码里两处必须用同一套换算
ok(/Math\.atan2\(pp\.x - st\.x, pp\.z - st\.z\)/.test(enemySrc),
  '判定用的是 atan2(dx, dz)');
ok(/mesh\.rotation\.y = angle - Math\.PI \/ 2/.test(enemySrc),
  '画面用的是 angle - π/2，与判定同源');
ok(/Math\.atan2\(pp\.x - e\.pos\.x, pp\.z - e\.pos\.z\)/.test(enemySrc),
  '扇形出手时锁定的方向也是 atan2(dx, dz)');

// ---------------------------------------------------------------- ⑤ 文案
sec('⑤ 文案同步');

const codexSub = /满柜召唤 · 五套攻击 · 半血暴怒/.test(codexSrc);
ok(codexSub, '图鉴数值行写「五套攻击」');
ok(/木牌雨/.test(codexSrc), '图鉴说明里提到木牌雨');
ok(/会拐一次弯/.test(codexSrc), '图鉴说明里提到投牌会拐弯');
ok(/砸开寄存柜/.test(codexSrc), '图鉴说明里提到砸柜放小怪');
ok(/扇形/.test(codexSrc), '图鉴说明里点明「扇形」这个形状');
ok(/往后退没用/.test(codexSrc), '图鉴说清扇形怎么躲（往后退没用）');
ok(!/三套攻击/.test(codexSrc), '图鉴里不再有「三套攻击」');
// 图鉴 desc 是 textContent 渲染 —— HTML 标签和 markdown 都会原样显示成字面量
// 只取「看守」那一段 desc（最后一个 cfg.warden 分支），并先剥掉 // 注释 ——
// 注释里为了说明这个坑，本身就写着 `<b>` 和 `**`。
const descCode = codexSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const wardenDescBlock = (descCode.split('if (cfg.warden) {').pop() || '').split('if (cfg.arc)')[0];
ok(wardenDescBlock.length > 200, `取到看守 desc 源码（${wardenDescBlock.length} 字符）`);
ok(!/<b>|<\/b>|<br>|<span/.test(wardenDescBlock),
  '图鉴 desc 里没有 HTML 标签（textContent 会把它当字面量显示）');
ok(!/\*\*/.test(wardenDescBlock), '图鉴 desc 里没有 ** 加粗标记（同一个坑）');

ok(/看守有五套攻击/.test(waveSrc), '第八关波次提示改成五套');
ok(!/三套攻击/.test(waveSrc), 'wave.js 里不再有「三套攻击」');
ok(/五套攻击/.test(mainSrc), '引导页第 4 段说「五套攻击」');
ok(/扇形木牌雨/.test(mainSrc), '引导页点名扇形木牌雨');
ok(!/三套攻击/.test(enemySrc), 'enemy.js 注释里也不再写三套');

// ---------------------------------------------------------------- ⑥ 版本号
sec('⑥ 版本号');
const vHtml = (htmlSrc.match(/\?v=(\d+)/) || [])[1];
ok(!!vHtml, `index.html 版本号可读：v=${vHtml}`);
const stale = ['js/enemy.js', 'js/codex.js', 'js/wave.js', 'js/main.js']
  .filter((f) => {
    const m = read('./' + f).match(/\?v=(\d+)/);
    return m && m[1] !== vHtml;
  });
ok(stale.length === 0, `js/*.js 与 index.html 版本号一致（${stale.join(',') || '全部一致'}）`);

// ---------------------------------------------------------------- 汇总
console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
