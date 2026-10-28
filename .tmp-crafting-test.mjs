// ============================================================
// .tmp-crafting-test.mjs —— 合成台引擎契约测试（第 115 块）
//
// 纯 Node 跑，不依赖浏览器 / 其它模块。验证：
//   ① 残片掉落概率与加权分布
//   ② 配方匹配（含任意剑 / 任意法器 / 精确匹配）
//   ③ 合成结果权重（废 40 / 平 40 / 杰作 15 / 事故 5）
//   ④ 消耗残片正确
//   ⑤ 序列化 / 还原 / 重置
// 运行：node .tmp-crafting-test.mjs
// ============================================================
import { createCraftingSystem, matchesRecipe, RECIPES, SHARD_IDS, SHARD_DEFS } from './js/crafting.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ FAIL:', name); }
}
function okEq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`  ✗ FAIL: ${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`); }
}

// 固定随机源：依次返回给定值
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

console.log('=== 合成台引擎契约测试 ===\n');

// ---- ① 掉落概率 ----
{
  const sys = createCraftingSystem({ rng: () => 0.0 });   // 永远 < 掉率 → 必掉
  const dropped = [];
  for (let i = 0; i < 50; i++) dropped.push(sys.onKill(false));
  ok('基础掉率 rng=0 时 50 次全掉', dropped.every((d) => d !== null));
}
{
  const sys = createCraftingSystem({ rng: () => 0.99 });  // 永远 >= 掉率 → 永不掉
  let dropped = 0;
  for (let i = 0; i < 100; i++) if (sys.onKill(false) !== null) dropped++;
  okEq('掉率 rng=0.99 时 100 次 0 掉', dropped, 0);
}
{
  const sys = createCraftingSystem({ rng: () => 0.05 });
  const id = sys.onKill(false);
  ok('掉率 rng=0.05(<0.03?) 不该掉', id === null);   // 0.05 >= 0.03 → 不掉
}

// ---- ① 加权分布 ----
{
  // 验证 rollShard 权重单调：锈铁屑(rarity 60) 最可能，钟楼的霜(6) 最稀有
  const r = (n) => { let i = 0; return () => (i++ / n); };   // 0..1 均匀
  const sys = createCraftingSystem({ rng: r(1000) });
  const count = {};
  for (let i = 0; i < 1000; i++) {
    const id = sys.rollShard();
    count[id] = (count[id] || 0) + 1;
  }
  ok('锈铁屑掉最多', count.rust > count.moss && count.rust > count.frost);
  ok('钟楼的霜掉最少', count.frost < count.rust && count.frost < count.moss);
  // 理论比例 rust:frost ≈ 60:6 = 10:1
  const ratio = count.rust / Math.max(1, count.frost);
  ok(`锈铁屑/钟楼霜 比例≈10 (实际 ${ratio.toFixed(1)})`, ratio > 6 && ratio < 18);
}

// ---- ② 配方匹配 ----
{
  ok('锈铁屑+铁剑 匹配 rust_iron',
    matchesRecipe(RECIPES[0], { rust: 1 }, 'iron', undefined));
  ok('锈铁屑+毒剑 不匹配 rust_iron（要铁剑）',
    !matchesRecipe(RECIPES[0], { rust: 1 }, 'poison', undefined));
  ok('井水苔+霜环 匹配 moss_frost',
    matchesRecipe(RECIPES[1], { moss: 1 }, null, 'frost'));
  ok('井水苔+地刺 不匹配 moss_frost（要霜环）',
    !matchesRecipe(RECIPES[1], { moss: 1 }, null, 'spikes'));
  ok('空白的名字+任意剑 匹配 name_any',
    matchesRecipe(RECIPES[2], { name: 1 }, 'thunder', undefined));
  ok('空白的名字+无剑 不匹配 name_any',
    !matchesRecipe(RECIPES[2], { name: 1 }, null, undefined));
  ok('记忆的灰×2+傀儡术 匹配 memory_puppet',
    matchesRecipe(RECIPES[4], { memory: 2 }, null, 'puppet'));
  ok('记忆的灰×1+傀儡术 不匹配（要×2）',
    !matchesRecipe(RECIPES[4], { memory: 1 }, null, 'puppet'));
  ok('钟楼的霜+雷剑 匹配 frost_thunder',
    matchesRecipe(RECIPES[5], { frost: 1 }, 'thunder', undefined));
}

// ---- ③ 结果权重 ----
{
  const sys = createCraftingSystem({ rng: () => 0 });
  const counts = { junk: 0, normal: 0, master: 0, accident: 0 };
  for (let i = 0; i < 100; i++) {
    const o = sys.rollOutcome();
    counts[o]++;
  }
  okEq('rollOutcome rng=0 全是 junk', counts.junk, 100);
}
{
  // 均匀随机 → 权重分布近似 40/40/15/5
  let i = 0;
  const sys = createCraftingSystem({ rng: () => (i++ % 100) / 100 });
  const counts = { junk: 0, normal: 0, master: 0, accident: 0 };
  for (let n = 0; n < 100; n++) counts[sys.rollOutcome()]++;
  okEq('junk 权重 40', counts.junk, 40);
  okEq('normal 权重 40', counts.normal, 40);
  okEq('master 权重 15', counts.master, 15);
  okEq('accident 权重 5', counts.accident, 5);
}

// ---- ④ 合成消耗残片 + 结果 ----
{
  const sys = createCraftingSystem({ rng: () => 0 });   // rng=0 → junk
  // 先塞残片
  sys.restore({ shards: { rust: 2 }, crafted: [] });
  const rec = sys.craft({ shards: { rust: 1 }, weapon: 'iron', relic: undefined });
  ok('合成返回结果', rec && rec.result);
  okEq('rust_iron 合成后锈铁屑剩 1', sys.shardCount('rust'), 1);
  okEq('合成结果为 junk(坏)', rec.outcome, 'junk');
  okEq('坏结果是锈剑', rec.result.name, '锈剑');
}
{
  // 高随机 → master（杰作）
  const sys = createCraftingSystem({ rng: () => 0.95 });  // 0.95*100=95 → accident? 见 rollOutcome：95 落在 accident(90~95)
  sys.restore({ shards: { name: 1 }, crafted: [] });
  const rec = sys.craft({ shards: { name: 1 }, weapon: 'thunder', relic: undefined });
  ok('name_any 合成有结果', rec && rec.result);
  okEq('空白的名字合成后归零', sys.shardCount('name'), 0);
}
{
  // 事故档
  const sys = createCraftingSystem({ rng: () => 0.99 });
  sys.restore({ shards: { rust: 1 }, crafted: [] });
  const rec = sys.craft({ shards: { rust: 1 }, weapon: 'iron', relic: undefined });
  okEq('rng=0.99 → accident', rec.outcome, 'accident');
  okEq('事故结果=炸炉', rec.result.name, '炸炉');
}
{
  // 无匹配配方
  const sys = createCraftingSystem();
  sys.restore({ shards: { rust: 1, moss: 1 }, crafted: [] });
  const rec = sys.craft({ shards: { rust: 1, moss: 1 }, weapon: 'iron', relic: 'frost' });
  okEq('无配方 → no_recipe', rec.outcome, 'no_recipe');
}

// ---- ⑤ 序列化 / 还原 / 重置 ----
{
  const sys = createCraftingSystem({ rng: () => 0 });
  sys.restore({ shards: { rust: 3, frost: 1 }, crafted: [] });
  const snap = sys.serialize();
  okEq('序列化 shards.rust=3', snap.shards.rust, 3);
  okEq('序列化 shards.frost=1', snap.shards.frost, 1);

  const sys2 = createCraftingSystem();
  sys2.restore(snap);
  okEq('还原后 rust=3', sys2.shardCount('rust'), 3);

  sys2.reset();
  okEq('重置后 rust=0', sys2.shardCount('rust'), 0);
  okEq('重置后 crafted 清空', sys2.craftedList().length, 0);
}

// ---- 残片定义完整性 ----
{
  okEq('残片数量=6', SHARD_IDS.length, 6);
  ok('每种残片都有名字', SHARD_IDS.every((id) => SHARD_DEFS[id].name));
  ok('rarity 都是正数', SHARD_IDS.every((id) => SHARD_DEFS[id].rarity > 0));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
