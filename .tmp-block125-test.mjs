// 第 125 块 · 删「等的那个」+ 连杀不封顶 —— 契约测试（Node，不开浏览器）
//   ① 等的那个彻底消失：ENEMY_TYPES / 第十关 rounds 与 order / 成就 / 图鉴分支 / 埋点 / 资产文件
//   ② 第十关的坑位补给了 warrior（不是直接抹掉，难度别塌）
//   ③ 连杀不封顶：30 连杀 heat = 30，移速 / 攻速继续按同一斜率涨（×10 不再是墙）
//   ④ 手感没被改坏：断连照样掉点、归零照样通知 UI
//   ⑤ 攻速这次**真的接进攻击冷却**（以前只写在浮现文案里）
// 运行：node .tmp-block125-test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? `  [${extra}]` : ''}`); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log(`  XX  ${name}${extra ? `  [${extra}]` : ''}`); }
}
function sec(t) { console.log(`\n---- ${t} ----`); }

const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];
const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const enemySrc = src('js/enemy.js');
const waveSrc = src('js/wave.js');
const achSrc = src('js/achievements.js');
const codexSrc = src('js/codex.js');
const mainSrc = src('js/main.js');
const heatSrc = src('js/heat.js');

const E = await import(`./js/enemy.js?v=${VER}`);
const W = await import(`./js/wave.js?v=${VER}`);
const A = await import(`./js/achievements.js?v=${VER}`);
const H = await import(`./js/heat.js?v=${VER}`);

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const L10 = W.LEVELS_BY_ID[10];

// ============================================================
sec('① 等的那个：彻底删干净');
// ============================================================
ok(!E.ENEMY_TYPES.waiter, 'ENEMY_TYPES 里没有 waiter');
ok(Object.keys(E.ENEMY_TYPES).length === 31, '怪物总数 31 只', String(Object.keys(E.ENEMY_TYPES).length));

// 机制代码（不是注释）必须一起消失 —— 只删 cfg 会留下一条永远进不来的分支
const enemyCode = enemySrc.replace(/^\s*\/\/.*$/gm, '');
ok(!/handleWaiter/.test(enemyCode), '没有残留 handleWaiter');
ok(!/wakeWaiter/.test(enemyCode), '没有残留 wakeWaiter');
ok(!/cfg\.wait\b/.test(enemyCode), '没有残留 cfg.wait 分支');
ok(!/onWaiterWake/.test(enemyCode), '没有残留 onWaiterWake 回调');
ok(!/waitT|waitCalls/.test(enemyCode), '没有残留 waitT / waitCalls 状态字段');
// raged / waitRing 是别人在用的，不能连带删掉
ok(/raged:\s*false/.test(enemyCode), 'raged 字段留着（看守暴怒还在用）');
ok(/e\.waitRing\.dispose\(\)/.test(enemyCode), 'waitRing 的释放留着（收账人 / 袋鼠 / 校对的在用）');
ok(/if \(cfg\.collect\)/.test(enemyCode) && /if \(cfg\.rush\)/.test(enemyCode) && /if \(cfg\.proof\)/.test(enemyCode),
  '三只共用 waitRing 的怪都还在');

// 关卡数据
const keys = (o) => Object.keys(o);
ok(L10.rounds.every((r) => !('waiter' in r)), '第十关 20 回合里已经没有 waiter 键');
ok(!L10.order.some((x) => x[0] === 'waiter'), 'order（模型预加载表）里没有 waiter');
const types10 = new Set();
for (const r of L10.rounds) for (const k of keys(r)) if (k !== 'gap' && k !== 'tip' && r[k] > 0) types10.add(k);
ok(types10.size === 14, '第十关实际出场 14 种怪', String(types10.size));
ok(!types10.has('waiter'), '实际出场表里也没有');
ok(L10.rounds.every((r) => r.mirror >= 0 && r.echo >= 0 && r.addressee >= 0), '三只新怪都还在');
ok(L10.rounds[3].addressee === 1 && L10.rounds[9].echo === 1, '收件人 R4 / 回声 R10 的上场节奏没被打乱');

// 文案里不能再提「等」这套机制
const tips10 = L10.rounds.map((r) => r.tip).join('');
ok(!/等的那个|金环|活过来|二十二血/.test(tips10), '第十关的回合提示里没有「等的那个」的字眼');
ok(L10.rounds.every((r) => r.tip && r.tip.length >= 10), '每回合仍有提示语（没被删空）');

// 成就 / 图鉴 / 埋点 / 资产
ok(!A.ACHS.some((a) => a.id === 'waiter_5'), '成就 waiter_5 已删');
ok(A.ACH_COUNT === 117, '成就总数 117', String(A.ACH_COUNT));
ok(A.ACHS.every((a) => !a.prog || a.prog.id !== 'waiter'), '没有别的成就还在统计 waiter');
ok(!/waiter/.test(codexSrc), '图鉴的数值行没有 waiter 分支');
ok(!/tryAch\('waiter_5'\)/.test(mainSrc), 'main 里没有 waiter_5 的埋点');
ok(!existsSync(path.join(ROOT, 'assets/monsters/goleling.glb')), '只给它用的 goleling.glb 已从盘上删掉');
ok(!existsSync(path.join(ROOT, 'assets/codex/waiter.webp')), '图鉴缩略图 waiter.webp 已删');

// ============================================================
sec('② 坑位补给 warrior（不是直接抹掉）');
// ============================================================
// 原来 waiter 的份额并进了 warrior：总数不该塌下来（waiter 血厚站桩，换 warrior 是减负，
// 但至少不能连数量都少一截）
const totalCount = (r) => keys(r).filter((k) => k !== 'gap' && k !== 'tip').reduce((n, k) => n + r[k], 0);
ok(L10.rounds[7].warrior === 5, 'R8 的 warrior 4 → 5（吃掉原来的 waiter 位）', String(L10.rounds[7].warrior));
ok(totalCount(L10.rounds[7]) === 21, 'R8 总只数与删之前一致（21）', String(totalCount(L10.rounds[7])));
ok(totalCount(L10.rounds[19]) === 65, 'R20 总只数 65（waiter 3 并进 warrior）', String(totalCount(L10.rounds[19])));
ok(L10.rounds[19].warrior === 11, 'R20 warrior 8 → 11', String(L10.rounds[19].warrior));

// ============================================================
sec('③ 连杀数字不封顶、属性加成封顶（第 127 块二次定案）');
// ============================================================
{
  const h = H.createHeat({ now: () => 0 });
  for (let i = 0; i < 30; i++) h.onKill();
  ok(h.heat === 30, '30 连杀 → 数字 30（计数不封顶）', String(h.heat));
  // 加成到 10 连杀就停：+12% 移速 / +18% 攻速
  ok(near(h.speedMul(), 1.12, 1e-9), '移速加成封顶在 +12%', h.speedMul().toFixed(3));
  ok(near(h.atkMul(), 1.18, 1e-9), '攻速加成封顶在 +18%', h.atkMul().toFixed(3));
  ok(h.bonusCapped === true, 'bonusCapped = true（UI 能写「已满」）');
  ok(h.ratio === 1, 'ratio 钳在 1（不会被当成进度条宽度溢出）');
  ok(H.HEAT_MAX === 10 && H.HEAT_BONUS_CAP === 10, 'HEAT_MAX 基础满格 / HEAT_BONUS_CAP 加成上限');
  ok(H.HEAT_SPEED_PER_KILL === 0.012 && H.HEAT_ATK_PER_KILL === 0.018, '每点增益导出成常量，UI 与逻辑同源');

  // 未到上限时仍然线性：9 杀 = +10.8%
  const h9 = H.createHeat({ now: () => 0 });
  for (let i = 0; i < 9; i++) h9.onKill();
  ok(near(h9.speedMul(), 1 + 9 * 0.012, 1e-9), '9 连杀 = +10.8%（未到顶仍线性）', h9.speedMul().toFixed(3));
  ok(h9.bonusCapped === false, '9 连杀 bonusCapped = false');

  // 只钳下限，不钳计数上限
  ok(!/Math\.min\(HEAT_MAX/.test(heatSrc), 'setHeat 里没有把上限钳回 HEAT_MAX');
  ok(/Math\.max\(0, v\)/.test(heatSrc), '仍然只兜底到 0');
  ok(/Math\.min\(heat, HEAT_BONUS_CAP\)/.test(heatSrc), 'speedMul / atkMul 读的时候才钳加成');

  // 和第 124 块之前的版本对一遍：10 点时数值必须严格相同（手感不能漂）
  const h10 = H.createHeat({ now: () => 0 });
  for (let i = 0; i < 10; i++) h10.onKill();
  ok(near(h10.speedMul(), 1.12, 1e-9) && near(h10.atkMul(), 1.18, 1e-9),
    '10 连杀仍然正好是 +12% / +18%（老手感一比一）',
    `${h10.speedMul().toFixed(3)} / ${h10.atkMul().toFixed(3)}`);
}

// ============================================================
sec('④ 断连照旧：会掉，不会被「不封顶」带坏');
// ============================================================
{
  let t = 0;
  const changes = [];
  const h = H.createHeat({ now: () => t, onChange: (v) => changes.push(v) });
  for (let i = 0; i < 25; i++) h.onKill();
  ok(h.heat === 25, '先攒到 25');
  t = 3.0 + 1.2 * 5 + 0.01;      // 超阈值 3 秒后每 1.2 秒掉 1 点
  h.tick(0.016);
  ok(h.heat === 20, '断连 5 个 tick → 掉到 20', String(h.heat));
  ok(changes[changes.length - 1] === 20, 'onChange 有通知（UI 会跟着掉）');
  t += 100; h.tick(0.016);
  ok(h.heat === 0, '久到掉光归零', String(h.heat));
  h.reset();
  ok(h.heat === 0 && h.ratio === 0, 'reset 之后干净');
}

// ============================================================
sec('⑤ 攻速这次真的接进了攻击冷却');
// ============================================================
// 第 117 块起 UI 一直在说「攻速 +N%」，但那时只算了文案，没乘进 attackCd。
ok(/attackCd = 1 \/ Math\.max\(0\.2, stats\.get\('attackSpeed'\) \* heat\.atkMul\(\)\)/.test(mainSrc),
  'attackCd 里乘了 heat.atkMul()');
ok((mainSrc.match(/heat\.atkMul\(\)/g) || []).length >= 2, '攻速倍率至少两处：攻击冷却 + 浮现文案');
ok(/const spd = Math\.round\(\(heat\.speedMul\(\) - 1\) \* 100\)/.test(mainSrc)
  && /const atk = Math\.round\(\(heat\.atkMul\(\) - 1\) \* 100\)/.test(mainSrc), '浮现文案读的是同一对函数');
ok(/heat\.speedMul\(\) \* weather\.playerMult\('move'\)/.test(mainSrc), '移速那条链没被改动');

// ============================================================
sec('⑥ 版本号');
// ============================================================
ok(+VER >= 144, '版本号至少到 144（第 127 块）', VER);
const stale = ['index.html', 'js/main.js', 'js/enemy.js', 'js/wave.js', 'js/achievements.js', 'js/heat.js']
  .filter((f) => src(f).includes('?v=143'));
ok(stale.length === 0, '没有残留 ?v=143', stale.join(','));

console.log('\n====================================================');
console.log(`第 125 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log(' - ' + f); }
process.exit(fail ? 1 : 0);
