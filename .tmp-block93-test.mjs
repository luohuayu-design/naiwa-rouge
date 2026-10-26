// 第 93 块契约（纯 Node，不起浏览器）—— 用户一句话：
//   「我觉得可以无论防御多高，都最高减 30%，但是你必须在属性介绍里面写清楚」
// 定案：玩家受伤侧加 ARMOR_FLOOR = 0.30 保底（防御最多减 70%）；
//       打怪侧（rollDamage / rollSwordDamage / 箭雨 / 环剑）一律不传 floorPct，行为完全不变。
// 跑法：node .tmp-block93-test.mjs
import { readFileSync } from 'node:fs';
import { mitigate, ARMOR_FLOOR, createStats, STAT_DEFS } from './js/stats.js';
import { UPGRADES } from './js/upgrade.js';
import { BOONS } from './js/boons.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const statsSrc = readFileSync('js/stats.js', 'utf8');
const guideSrc = readFileSync('js/guide.js', 'utf8');
const boonSrc = readFileSync('js/boons.js', 'utf8');
const upgSrc = readFileSync('js/upgrade.js', 'utf8');

// ---------------------------------------------------------------- 1. 常量
sec('1. 保底系数');
ok(ARMOR_FLOOR === 0.30, 'ARMOR_FLOOR = 0.30（用户定的「最高减 30%」）', String(ARMOR_FLOOR));
ok(statsSrc.includes('export const ARMOR_FLOOR'), '常量导出给测试/外部读（能断言、也能在文案里引用）');

// ---------------------------------------------------------------- 2. mitigate 纯函数
sec('2. mitigate 三路行为');
// 2a 打怪侧：不传 floorPct -> 老行为，一点没变
ok(near(mitigate(7, 6), 1), '打怪侧不传 floorPct：7 伤 - 6 甲 = 1（旧行为不变）', String(mitigate(7, 6)));
ok(near(mitigate(10, 8), 2), '打怪侧不传 floorPct：10 - 8 = 2', String(mitigate(10, 8)));
ok(near(mitigate(5, 999), 1), '打怪侧不传 floorPct：防御爆表仍保底 1 点', String(mitigate(5, 999)));
// 2b 玩家侧：传 0.30 -> 至少吃 30%
ok(near(mitigate(7, 6, ARMOR_FLOOR), 2.1), '玩家侧：第九关 R20 伤害 7、防御 6 -> 2.1（原来 1）', String(mitigate(7, 6, ARMOR_FLOOR)));
ok(near(mitigate(7, 999, ARMOR_FLOOR), 2.1), '玩家侧：防御堆到 999 也只降到 2.1，不会免疫', String(mitigate(7, 999, ARMOR_FLOOR)));
ok(near(mitigate(10, 8, ARMOR_FLOOR), 3), '玩家侧：10 - 8 = 2 < 10×0.3 = 3 -> 取 3', String(mitigate(10, 8, ARMOR_FLOOR)));
// 2c 早期 / 裸防完全无感
ok(near(mitigate(2, 0, ARMOR_FLOOR), 2), '裸防完全无感：2 点伤害、0 防御 -> 还是 2', String(mitigate(2, 0, ARMOR_FLOOR)));
ok(near(mitigate(2, 5, ARMOR_FLOOR), 1), '早期伤害小：2 点伤害、5 防御 -> 仍保底 1（没被 30% 抬高到 0.6）', String(mitigate(2, 5, ARMOR_FLOOR)));
ok(near(mitigate(0, 5, ARMOR_FLOOR), 0), '0 伤害 = 0，不触发任何保底');
ok(near(mitigate(-3, 5, ARMOR_FLOOR), 0), '负伤害 = 0（不会因为 30% 变成负扣血回血）');
// 2d 单调性：防御越高越好，但永远递减趋平
const seq = [0, 1, 2, 3, 4, 5, 6, 8, 12].map((a) => mitigate(7, a, ARMOR_FLOOR));
ok(seq.every((v, i) => i === 0 || v <= seq[i - 1] + 1e-9), '防御越高实伤单调不增', JSON.stringify(seq));
ok(seq[seq.length - 1] === seq[seq.length - 2], '防御 8 之后收益归零（全被 0.3 压住）', JSON.stringify(seq));

// ---------------------------------------------------------------- 3. 实例 damage() 真的走保底
sec('3. stats.damage 走保底、rollDamage 不走');
{
  const st = createStats(STAT_DEFS);
  st.syncHp(100);                              // 撑高血量，免得一次打空读不出中间值
  st.addMod({ stat: 'maxHp', flat: 200, src: 'test:hp' });
  st.syncHp(200);
  st.addMod({ stat: 'armor', flat: 6, src: 'test:armor' });
  ok(near(st.get('armor'), 6), '防御注入成功 = 6', String(st.get('armor')));
  const taken = st.damage(7);
  ok(near(taken, 2.1), 'damage(7) 实际扣 2.1（保底 30%）', String(taken));
  const hpAfter = st.hp.cur;
  ok(near(hpAfter, st.get('maxHp') - 2.1), '血量按 2.1 扣（不是 1）', `${hpAfter} / ${st.get('maxHp')}`);

  // 打怪侧：同一个 armor 6，rollDamage 一定是 1，不受保底影响
  const r = st.rollDamage({ targetArmor: 6 });
  ok(near(r.damage, 1), 'rollDamage(targetArmor 6) 打 7 伤 -> 1（怪物减伤没被保底打穿）', String(r.damage));
  const r2 = st.rollDamage({ targetArmor: 0 });
  ok(near(r2.damage, 1) || r2.damage > 1, 'rollDamage 无甲时按自身攻击算（> 1 或至少 1，不受玩家防御干扰）', String(r2.damage));

  // 真实场景复核：第九关 R20 的 7 点伤害，防御从 0 堆到 8
  const st2 = createStats(STAT_DEFS);
  st2.addMod({ stat: 'maxHp', flat: 300, src: 'test:hp' });
  st2.syncHp(300);
  const curve = [];
  for (const a of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    st2.loadMods([]);                          // 只留 base
    st2.addMod({ stat: 'maxHp', flat: 300, src: 'test:hp' });
    if (a > 0) st2.addMod({ stat: 'armor', flat: a, src: 'test:armor' });
    curve.push(st2.damage(7));
  }
  ok(near(curve[0], 7), '无防御挨第九关 R20 = 7 点', String(curve[0]));
  ok(near(curve[6], 2.1), '防御 6 挨 = 2.1（改造前是 1，等于无敌）', String(curve[6]));
  ok(curve.every((v) => v >= 2.1 - 1e-9), '整条曲线都不低于 2.1 —— 不存在「免疫区」', JSON.stringify(curve));
  ok(curve[8] < curve[0], '堆满防御仍有意义（2.1 < 7），只是到不了 0', `${curve[8]} vs ${curve[0]}`);
}

// ---------------------------------------------------------------- 4. 文案必须写清楚
sec('4. 属性介绍写清楚 70% / 30%');
const armorDef = STAT_DEFS.find((d) => d.key === 'armor');
ok(!!armorDef, '属性表里有 armor 条目');
ok(/70%/.test(armorDef.desc), '属性面板：写了「最多减掉 70%」', armorDef.desc);
ok(/30%/.test(armorDef.desc), '属性面板：写了「至少吃 30%」', armorDef.desc);

const shell = UPGRADES.find((u) => u.id === 'shell');
ok(!!shell, '甲壳卡存在');
const shellDesc = String(shell.desc || '');
ok(/70%/.test(shellDesc) && /30%/.test(shellDesc), '甲壳卡描述写了 70%/30%', shellDesc);

const bHide = BOONS.find((b) => b.stat === 'armor' && /铜皮/.test(b.name));
ok(!!bHide, '铜皮祝福存在');
ok(/70%/.test(bHide.desc) && /30%/.test(bHide.desc), '铜皮描述写了 70%/30%', bHide.desc);

const bPlate = BOONS.find((b) => b.stat === 'armor' && /厚甲/.test(b.name));
ok(!!bPlate, '厚甲祝福存在');
ok(/70%/.test(bPlate.desc) && /30%/.test(bPlate.desc), '厚甲描述写了 70%/30%', bPlate.desc);

ok(/70%/.test(guideSrc), '引导页「防御」条目写了最多减 70%');
ok(/30%/.test(guideSrc), '引导页写了至少吃 30%');
ok(/最多减 70%/.test(guideSrc), '引导页副标题也点了上限（sub 行）');
ok(!/五点防御等于小兵全变成挠痒痒/.test(guideSrc), '删掉了过期的「五点防御全变挠痒痒」说法（保底后不成立）');

// ---------------------------------------------------------------- 5. 其他口径不许漂
sec('5. 口径一致性');
ok(!/export function mitigate\(raw, armor\)/.test(statsSrc), 'mitigate 签名已带 floorPct 三参（不是旧两参）');
ok(/mitigate\(raw, get\('armor'\), ARMOR_FLOOR\)/.test(statsSrc), 'damage() 是唯一传保底的调用点');
ok(/mitigateFn\(raw, targetArmor\)/.test(statsSrc), 'rollDamage 仍不传 floorPct（打怪侧不变）');

// 版本号
const idx = readFileSync('index.html', 'utf8');
const m = idx.match(/\?v=(\d+)/);
ok(!!m, 'index.html 里能读到版本号');
const V = m ? m[1] : '?';
const jsFiles = [
  'stats.js', 'upgrade.js', 'boons.js', 'guide.js', 'main.js', 'enemy.js', 'wave.js',
];
ok(Number(V) >= 104, `版本号 >= 104（本块 bump 到 104 或更高），实读 v=${V}`);
for (const f of jsFiles) {
  const s = readFileSync('js/' + f, 'utf8');
  const vs = [...s.matchAll(/\?v=(\d+)/g)].map((x) => x[1]);
  ok(vs.every((x) => x === V), `${f} 内部 import 版本与 index.html 一致（v=${V}）`, vs.filter((x) => x !== V).join(','));
}

// ---------------------------------------------------------------- 汇总
console.log(`\n${'='.repeat(52)}`);
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('  失败项：'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
