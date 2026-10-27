// 第 105 块 Node 契约测试：盲盒属性幅度统一系数 + 四条新属性
// 覆盖：BOX_ATTR_SCALE / boxMag / 价格一分没动 / 奖池行文本按缩放后的数值 /
//       新四条进池（含档位与负面配对）/ 三组概率仍各自合计 100% /
//       rollBox 实际掷出来的值走的是缩放后的 mag / 注入后属性能真读到变化
import fs from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const VER = (fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  .match(/main\.js\?v=(\d+)/) || [])[1] || '';
const { resetAll, metaShopState, metaAddMod } = await import(`./js/profile.js?v=${VER}`);
const {
  BOXES, BOX_BY_ID, BOX_ATTR_SCALE, boxMag, boxPoolEntries, rollBox,
  boxCost, BOX_PRICE_STEP, metaApplyStats,
} = await import(`./js/metaShop.js?v=${VER}`);
const { createStats } = await import(`./js/stats.js?v=${VER}`);
const { createWeaponStats } = await import(`./js/weaponStats.js?v=${VER}`);

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function fresh() { store.clear(); resetAll(); }
const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;
const rowOf = (entries, name) => entries.rows.filter((r) => r.name === name);

// 0) 统一系数与「价格不动」
console.log('[0] 属性系数 / 价格');
{
  ok(BOX_ATTR_SCALE === 0.88, '统一系数 0.88（整体 −12%）', String(BOX_ATTR_SCALE));
  ok(near(boxMag('wood'), 0.88) && near(boxMag('silver'), 1.408) && near(boxMag('gold'), 2.112),
    '三档实际强度 0.88 / 1.408 / 2.112',
    [boxMag('wood'), boxMag('silver'), boxMag('gold')].map((v) => v.toFixed(3)).join(' / '));
  ok(boxMag(BOX_BY_ID.gold) === boxMag('gold') && boxMag('nope') === 0, 'boxMag 传对象 / 未知 id 都安全');
  ok(BOXES.map((b) => b.cost).join(',') === '30,100,280', '首价没动 30 / 100 / 280', BOXES.map((b) => b.cost).join(','));
  ok(BOX_PRICE_STEP === 0.03, '加价步长还是 3%');
  ok(boxCost('wood', 0) === 30 && boxCost('wood', 10) === 39 && boxCost('gold', 20) === 448,
    '加价曲线没动（木匣 10 次 39 / 金匣 20 次 448）',
    `${boxCost('wood', 10)} / ${boxCost('gold', 20)}`);
}

// 1) 奖池文本里的数值 = 缩放后的值
console.log('[1] 奖池数值（缩放后）');
{
  const wood = boxPoolEntries('wood');
  const gold = boxPoolEntries('gold');
  const atkW = wood.rows.find((r) => r.name === '锋锐');
  const atkG = gold.rows.find((r) => r.name === '锋锐');
  ok(atkW && /攻击力 \+5\.3%/.test(atkW.sub), '木匣攻击力 +5.3%（旧值 6.0%）', atkW && atkW.sub);
  ok(atkG && /攻击力 \+12\.7%/.test(atkG.sub), '金匣攻击力 +12.7%（旧值 14.4%）', atkG && atkG.sub);
  const hpW = wood.rows.find((r) => r.name === '强健');
  ok(hpW && /生命上限 \+1/.test(hpW.sub), '整数型生命上限仍是 +1（不能被缩放成 0）', hpW && hpW.sub);
  const hpG = gold.rows.find((r) => r.name === '强健');
  ok(hpG && /生命上限 \+2/.test(hpG.sub), '金匣生命上限 +2（2.112 向下取整）', hpG && hpG.sub);
  const regW = wood.rows.find((r) => r.name === '回春');
  ok(!regW, '木匣仍没有回春（minTier 1）');
}

// 2) 四条新属性进池
console.log('[2] 新四条');
{
  const wood = boxPoolEntries('wood');
  const silver = boxPoolEntries('silver');
  const gold = boxPoolEntries('gold');
  const posNames = (e) => e.rows.filter((r) => r.kind === 'pos').map((r) => r.name);
  const negNames = (e) => e.rows.filter((r) => r.kind === 'neg').map((r) => r.name);

  ok(posNames(wood).includes('远臂'), '木匣能开「攻击范围」');
  ok(posNames(wood).includes('锋线'), '木匣能开「剑暴击率」');
  ok(!posNames(wood).includes('环绕') && !posNames(wood).includes('扩散'), '木匣没有转速 / 元素波及（银金才有）');
  ok(posNames(gold).includes('环绕') && posNames(gold).includes('扩散'), '金匣四条全在');
  ok(posNames(silver).includes('环绕') && posNames(silver).includes('扩散'), '银匣也四条全在');

  ok(negNames(wood).includes('短臂') && negNames(wood).includes('钝锋'), '木匣诅咒池有两条对应负面');
  ok(!negNames(wood).includes('滞环'), '木匣诅咒池没有滞环（对应正向也是银金才有）');
  ok(negNames(gold).includes('滞环') && negNames(gold).includes('收束'), '金匣诅咒池四条对应负面全在');

  const rangeW = wood.rows.find((r) => r.name === '远臂');
  ok(rangeW && /攻击范围 \+0\.09/.test(rangeW.sub), '木匣攻击范围 +0.09 格', rangeW && rangeW.sub);
  const critW = wood.rows.find((r) => r.name === '锋线');
  ok(critW && /剑暴击率 \+0\.02/.test(critW.sub), '木匣剑暴击率 +0.02', critW && critW.sub);
  const orbitG = gold.rows.find((r) => r.name === '环绕');
  ok(orbitG && /剑转速 \+12\.7%/.test(orbitG.sub), '金匣剑转速 +12.7%', orbitG && orbitG.sub);
  const elemG = gold.rows.find((r) => r.name === '扩散');
  ok(elemG && /元素波及 \+1\.06/.test(elemG.sub), '金匣元素波及 +1.06 格', elemG && elemG.sub);
  const negW = wood.rows.find((r) => r.name === '短臂');
  ok(negW && /攻击范围 −0\.09/.test(negW.sub), '负面项方向相反、幅度一致', negW && negW.sub);
}

// 3) 概率仍然各自合计 100%
console.log('[3] 概率');
{
  for (const b of BOXES) {
    const e = boxPoolEntries(b.id);
    ok(near(e.sum, 1, 0.0005), `${b.name}三组概率合计 100%`, (e.sum * 100).toFixed(3) + '%');
  }
  // 新条目把权重摊薄了一点：木匣三路（诅咒 / 稀有 / 普通正面）仍要凑满 100%
  const wood = boxPoolEntries('wood');
  ok(near(wood.curse + wood.rare + wood.pos, 1, 0.0005), '木匣三路分配仍是 100%',
    `${wood.curse} + ${wood.rare} + ${wood.pos}`);
  ok(near(wood.curse, 0.35), '诅咒率没动（木匣 35%）', String(wood.curse));
}

// 4) rollBox 掷出来的值确实走了缩放
console.log('[4] rollBox 实掷');
{
  // 按「正向 / 诅咒」分开收：同一条属性的正负幅度本来就不同（攻 6% vs 5%），
  // 混在一起断言会分不清是缩放没生效还是踩了负面池。
  const pos = { attack: new Set(), swordCrit: new Set(), attackRange: new Set(), elementRadius: new Set(), orb: new Set() };
  const neg = { attack: new Set(), swordCrit: new Set(), attackRange: new Set(), elementRadius: new Set(), orb: new Set() };
  const put = (bag, k, v) => { if (bag[k]) bag[k].add(+Math.abs(v).toFixed(4)); };
  for (let i = 0; i < 4000; i++) {
    for (const id of ['wood', 'gold']) {
      const r = rollBox(id);
      if (!r || r.kind !== 'stat') continue;
      const bag = r.cursed ? neg : pos;
      if (r.stat === 'attack') put(bag, 'attack', r.pct);
      else if (r.stat === 'swordCrit') put(bag, 'swordCrit', r.flat);
      else if (r.stat === 'attackRange') put(bag, 'attackRange', r.flat);
      else if (r.stat === 'elementRadius') put(bag, 'elementRadius', r.flat);
      else if (r.stat === 'swordOrbit') put(bag, 'orb', r.pct);
    }
  }
  const only = (set, want) => set.size > 0 && [...set].every((v) => near(v, want, 0.0006));
  // 正向：木匣 ×0.88 / 金匣 ×2.112 之后的原值（scaleMod 小数保留 4 位）
  ok([...pos.attack].every((v) => near(v, 0.0528, 0.0006) || near(v, 0.1267, 0.0006)),
    '正向攻击力只有 5.28% / 12.67%（旧的 6% / 14.4% 绝不出现）', [...pos.attack].join(','));
  ok([...neg.attack].every((v) => near(v, 0.044, 0.0006) || near(v, 0.1056, 0.0006)),
    '诅咒攻击力 −4.4% / −10.56%（同样缩过）', [...neg.attack].join(','));
  ok([...pos.swordCrit].every((v) => near(v, 0.02, 0.0006) || near(v, 0.04, 0.0006)),
    '剑暴击率 0.02 / 0.04（flat 保留两位）', [...pos.swordCrit].join(','));
  ok([...pos.attackRange].every((v) => near(v, 0.09, 0.0006) || near(v, 0.21, 0.0006)),
    '攻击范围 0.09 / 0.21', [...pos.attackRange].join(','));
  ok([...pos.elementRadius].every((v) => near(v, 0.44, 0.0006) || near(v, 1.06, 0.0006)),
    '元素波及 0.44 / 1.06', [...pos.elementRadius].join(','));
  ok([...pos.orb].every((v) => near(v, 0.0528, 0.0006) || near(v, 0.1267, 0.0006)),
    '剑转速 5.28% / 12.67%', [...pos.orb].join(','));
  ok(pos.swordCrit.size > 0 && pos.attackRange.size > 0 && pos.elementRadius.size > 0 && pos.orb.size > 0,
    '四条新属性都能被真的抽到',
    `crit ${pos.swordCrit.size} / range ${pos.attackRange.size} / elem ${pos.elementRadius.size} / orb ${pos.orb.size}`);
  ok(neg.swordCrit.size > 0 && neg.attackRange.size > 0 && neg.elementRadius.size > 0,
    '四条新属性的诅咒面也都会出现',
    `crit ${neg.swordCrit.size} / range ${neg.attackRange.size} / elem ${neg.elementRadius.size}`);
}

// 5) 落账后属性真能读到变化（新 key 不是写着好看的）
console.log('[5] 注入生效');
{
  fresh();
  const stats = createStats();
  const wstats = createWeaponStats();
  const r0 = stats.get('attackRange');
  const c0 = wstats.get('swordCrit');
  const o0 = wstats.get('swordOrbit');
  const e0 = wstats.get('elementRadius');
  metaAddMod({ stat: 'attackRange', flat: 0.09, pct: 0 });
  metaAddMod({ stat: 'swordCrit', flat: 0.02, pct: 0, scope: 'weapon' });
  metaAddMod({ stat: 'swordOrbit', pct: 0.0528, scope: 'weapon' });
  metaAddMod({ stat: 'elementRadius', flat: 0.44, scope: 'weapon' });
  metaApplyStats(stats, wstats);
  ok(near(stats.get('attackRange'), r0 + 0.09, 1e-6), '攻击范围 2.1 → 2.19', String(stats.get('attackRange')));
  ok(near(wstats.get('swordCrit'), c0 + 0.02, 1e-6), '剑暴击 10% → 12%', String(wstats.get('swordCrit')));
  ok(near(wstats.get('swordOrbit'), o0 * 1.0528, 1e-6), '剑转速按百分比叠加', String(wstats.get('swordOrbit')));
  ok(near(wstats.get('elementRadius'), e0 + 0.44, 1e-6), '元素波及 7.0 → 7.44', String(wstats.get('elementRadius')));
  // 只注入 weapon 作用域的那三条不该污染主角表
  ok(near(stats.get('swordCrit'), stats.get('swordCrit'), 0) && !stats.get('elementRadius'),
    '武器项没有漏进主角属性表');
  ok(metaShopState().mods.length === 4, '四条都落进了存档');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
