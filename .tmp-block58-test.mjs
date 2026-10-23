// 第 58 块 Node 契约测试：局外商店依赖的 profile 持久层
// （metaShop.js 的 rollBox/buyBox/applyMeta 走 CDP 真机验证，这里只验存档层）
import { profile, save, metaShopState, metaAddMod, metaGrantRelic,
  metaGrantSkillCd, metaBought, metaLog, metaSummary, resetAll } from './js/profile.js';

// localStorage 桩（profile.js 只在函数体内访问它，调用前装好即可）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

// 每次用例前清档，保证互不干扰
function fresh() { store.clear(); resetAll(); }

// 1) 默认字段
fresh();
{
  const s = metaShopState();
  ok(s && typeof s === 'object', 'metaShopState 返回对象');
  ok(typeof s.bought === 'object' && s.opened === 0, '默认 bought={} opened=0');
  ok(Array.isArray(s.mods) && typeof s.relics === 'object' && s.skillCdMul === 1 && Array.isArray(s.log), '默认 mods=[] relics={} skillCdMul=1 log=[]');
}

// 2) metaAddMod：属性加成落账
fresh();
{
  metaAddMod({ stat: 'attack', pct: 0.06, scope: null });
  metaAddMod({ stat: 'swordDamage', pct: 0.04, scope: 'weapon' });
  const s = metaShopState();
  ok(s.mods.length === 2, '两次 metaAddMod → mods 长度 2', String(s.mods.length));
  ok(s.mods[0].stat === 'attack' && Math.abs(s.mods[0].pct - 0.06) < 1e-9, '第一条是 attack +6%');
  ok(s.mods[1].scope === 'weapon', '第二条 scope=weapon（环剑伤害）');
  ok(metaSummary().mods === 2, 'metaSummary().mods = 2');
}

// 3) metaGrantRelic：封顶 3 级，超了返回 null
fresh();
{
  let lv = null;
  for (let i = 0; i < 3; i++) lv = metaGrantRelic('spikes', 3);
  ok(lv === 3, '连续 grant 3 次到顶 → 3 级', String(lv));
  ok(metaShopState().relics.spikes === 3, 'relics.spikes = 3');
  ok(metaGrantRelic('spikes', 3) === null, '已满级再 grant 返回 null（调用方据此回退）');
}

// 4) metaGrantSkillCd：连乘 + 下限 0.3
fresh();
{
  let m = metaGrantSkillCd(0.88);
  ok(Math.abs(m - 0.88) < 1e-9, '第一次 ×0.88 → 0.88', String(m));
  m = metaGrantSkillCd(0.88);
  ok(Math.abs(m - 0.88 * 0.88) < 1e-9, '第二次再 ×0.88 → 0.7744', String(m));
  // 反复乘到下限
  for (let i = 0; i < 30; i++) m = metaGrantSkillCd(0.5);
  ok(Math.abs(m - 0.3) < 1e-9, `狂乘后封底 0.3（实际 ${m}）`);
}

// 5) metaBought：计数 + 累计开箱
fresh();
{
  metaBought('wood');
  metaBought('wood');
  metaBought('gold');
  const s = metaShopState();
  ok(s.bought.wood === 2 && s.bought.gold === 1, 'bought 计数正确', JSON.stringify(s.bought));
  ok(s.opened === 3, 'opened 累计 3', String(s.opened));
}

// 6) metaLog：保留最近 20 条
fresh();
{
  for (let i = 0; i < 25; i++) metaLog({ n: i });
  const s = metaShopState();
  ok(s.log.length === 20, 'log 截断到 20 条', String(s.log.length));
  ok(s.log[0].n === 24, '最新的在最前（n=24）', String(s.log[0].n));
}

// 7) 持久化往返：save 后重新读档字段还在
fresh();
{
  metaAddMod({ stat: 'luck', flat: 0.15 });
  metaGrantRelic('frost', 3);
  metaGrantSkillCd(0.88);
  save();
  // 重新构造 profile 缓存（模拟「关网页再开」）
  const raw = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1'));
  ok(raw.metaShop.mods.length === 1 && raw.metaShop.relics.frost === 1 && Math.abs(raw.metaShop.skillCdMul - 0.88) < 1e-9, '落盘后字段齐全');
}

console.log(`\nNode 契约：${pass} 通过 / ${fail} 失败`);
if (fails.length) { console.log('失败：'); fails.forEach((f) => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
