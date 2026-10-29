// .tmp-handfeel-test.mjs —— 手感三件套（冲刺/热度/遗言）契约测试
// 注：剑阵反向（swordReverse.js）已在第 117 块按用户要求删除。
import { existsSync } from 'node:fs';
import { createDash, DASH_WINDOW, DASH_DIST, DASH_T, DASH_CD } from './js/dash.js';
import { createHeat, HEAT_MAX } from './js/heat.js';
import { pickLastWords, winLine } from './js/lastwords.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name); }
}
function okEq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`  FAIL: ${name} —— 期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}`); }
}

// ---------- 剑阵反向（第 117 块已删除）----------
{
  ok('swordReverse.js 已删除', !existsSync('js/swordReverse.js'));
}

// ---------- 冲刺斩 ----------
{
  let t = 1000;
  let dashDir = null;
  const d = createDash({
    now: () => t,
    onDash: (v) => { dashDir = v; },
  });

  // 第一次推：不触发
  d.push(1, 0);
  ok('第一次推不冲刺', !d.dashing);
  // 松开
  d.push(0, 0);
  // 短时间后同方向第二次推 → 触发
  t += 0.2;
  d.push(1, 0);
  ok('双推触发冲刺', d.dashing);
  ok('冲刺方向正确', dashDir && dashDir.x > 0 && Math.abs(dashDir.z) < 1e-6);

  // step 产生位移
  const mv = d.step(0.08);
  ok('冲刺中产生位移', mv && mv.x > 0);
  // 冲刺总时长后结束
  for (let i = 0; i < 20; i++) d.step(0.05);
  ok('冲刺结束', !d.dashing);

  // 冷却中双推不触发
  d.push(0, 0);
  d.push(1, 0);
  ok('冷却中双推不触发', !d.dashing);

  // 不同方向双推不触发
  const d2 = createDash({ now: () => 0 });
  d2.push(1, 0); d2.push(0, 0); d2.push(0, 1);
  ok('不同方向双推不触发', !d2.dashing);
}

// ---------- 热度条 ----------
{
  let t = 1000;
  const changes = [];
  const h = createHeat({ now: () => t, onChange: (v) => changes.push(v) });

  okEq('初始热度 0', h.heat, 0);
  for (let i = 0; i < HEAT_MAX; i++) h.onKill();
  okEq('连续击杀到满热度', h.heat, HEAT_MAX);
  okEq('满热度 ratio=1', h.ratio, 1);
  ok('满热度移速加成>1', h.speedMul() > 1);
  ok('满热度攻速加成>移速加成', h.atkMul() > h.speedMul());

  // 断连掉热度
  t += 5;
  h.tick(1);
  ok('断连后热度掉落', h.heat < HEAT_MAX);

  // 击杀刷新，不立即掉
  const h2 = createHeat({ now: () => 0 });
  h2.onKill();
  ok('击杀后热度 1', h2.heat === 1);
  h2.reset();
  okEq('reset 归零', h2.heat, 0);
}

// ---------- 遗言 ----------
{
  okEq('无剑遗言', pickLastWords({ swordKinds: 0 }), '一把剑都没拿到……连影子都没来得及挥出去。');
  okEq('早死遗言', pickLastWords({ swordKinds: 1, round: 1 }), '第一夜还没亮就倒下了。草地会替我记住这声蛙鸣吗？');
  okEq('多残片遗言', pickLastWords({ swordKinds: 2, round: 5, shards: 5 }), '夜行残片撒了一地。空白会捡走它们，把我彻底抹掉。');
  okEq('深轮次遗言', pickLastWords({ swordKinds: 2, round: 16, shards: 0, kills: 50 }), '撑到了这么远……只差一点，就能让钟楼记住我的脚印。');
  // 默认兜底
  const def = pickLastWords({ swordKinds: 3, round: 8, shards: 1, kills: 20, coins: 30, relicCount: 1 });
  ok('默认遗言非空', def.length > 0);
  okEq('通关文案', winLine(), '夜色里的骷髅被清干净了，奶蛙的名字，今晚被记住了。');
}

console.log(`\n=== 手感三件套测试结果：${pass} 通过 / ${fail} 失败 ===`);
if (fail > 0) process.exit(1);
