// ============================================================
// 第 111 块 Node 契约测试：关卡专属货只在对应关卡出现
//
// 用户反馈：绝缘斗篷（防电衣）应该只在第六关、镇牌铃（镇牌灵）只在第八关出现，
// 不能因为「第 N 关起」就在后面的关卡里继续摆。
//
// 跑法：node .tmp-block111-test.mjs
// ============================================================
import { SHOP_ITEMS, SHOP_PINNED, itemLocked, rollShopItems } from './js/shop.js';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra != null ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra != null ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const byId = (id) => SHOP_ITEMS.find((it) => it.id === id);
const ins = byId('buyInsulator');
const seal = byId('buySeal');

sec('A、配置：两件关卡专属货');
ok(ins && ins.onlyLevel === 6, '绝缘斗篷 onlyLevel = 6', ins && String(ins.onlyLevel));
ok(seal && seal.onlyLevel === 8, '镇牌铃 onlyLevel = 8', seal && String(seal.onlyLevel));
ok(ins && ins.needLevel === 6, '保留 needLevel 兼容旧数据（绝缘斗篷 6）');
ok(seal && seal.needLevel === 8, '保留 needLevel 兼容旧数据（镇牌铃 8）');

sec('B、itemLocked：离开本关就锁');
ok(itemLocked(ins, { level: 6, round: 20, relicLevels: {} }) === null, '第六关可买绝缘斗篷');
ok(itemLocked(ins, { level: '6', round: 20, relicLevels: {} }) === null, '第六关（字符串 id）也可买绝缘斗篷');
for (const lv of [1, 5, 7, 8, 9, 10]) {
  const why = itemLocked(ins, { level: lv, round: 20, relicLevels: {} });
  ok(why && why.includes('只在第 6 关'), `第 ${lv} 关锁住绝缘斗篷`, why);
}
ok(itemLocked(seal, { level: 8, round: 12, relicLevels: {} }) === null, '第八关第 12 回合可买镇牌铃');
for (const lv of [1, 7, 9, 10]) {
  const why = itemLocked(seal, { level: lv, round: 12, relicLevels: {} });
  ok(why && why.includes('只在第 8 关'), `第 ${lv} 关锁住镇牌铃`, why);
}

sec('C、抽签：只在对应关卡能抽到');
const hitAt = (level, id, round = 20, pinned = [], n = 400) => {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const items = rollShopItems(Math.random, {
      hasWeapon: true, round, level, turretCount: 0, relicLevels: {}, count: 4, luck: 0, pinned,
    });
    if (items.some((it) => it.id === id)) hit++;
  }
  return hit;
};
for (const lv of [1, 5, 7, 8, 9, 10]) {
  ok(hitAt(lv, 'buyInsulator') === 0, `第 ${lv} 关抽不到绝缘斗篷`);
}
ok(hitAt(6, 'buyInsulator') > 0, '第六关能抽到绝缘斗篷');
ok(hitAt('6', 'buyInsulator') > 0, '第六关（字符串 id）也能抽到绝缘斗篷');
for (const lv of [1, 5, 6, 7, 9, 10]) {
  ok(hitAt(lv, 'buySeal') === 0, `第 ${lv} 关抽不到镇牌铃`);
}
ok(hitAt(8, 'buySeal') > 0, '第八关能抽到镇牌铃');

sec('D、常驻货：不能把铃硬摆到别的关');
const stock = (level, round) => rollShopItems(() => 0, {
  hasWeapon: true, round, level, turretCount: 0, relicLevels: {},
  count: 4, luck: 0, pinned: SHOP_PINNED[round] || [],
});
const s8r9 = stock(8, 9);
const s8r12 = stock(8, 12);
ok(s8r9.some((it) => it.id === 'buySeal'), '第八关第 9 回合常驻镇牌铃', s8r9.map((i) => i.id).join(','));
ok(s8r12.some((it) => it.id === 'buySeal'), '第八关第 12 回合常驻镇牌铃');
for (const [lv, rd] of [[9, 9], [9, 12], [10, 9], [10, 12]]) {
  const st = stock(lv, rd);
  ok(!st.some((it) => it.id === 'buySeal'), `第 ${lv} 关第 ${rd} 回合不会硬摆镇牌铃`, st.map((i) => i.id).join(','));
}
ok(stock(10, 12).some((it) => it.id === 'buyPuppet'), '第十关第 12 回合常驻傀儡术不受影响');

sec('E、其他「从第 N 关起」的货保持原样');
ok(hitAt(6, 'buyLantern') > 0 && hitAt(10, 'buyLantern') > 0, '路口灯仍然第五关起都能抽到');
ok(hitAt(7, 'buyWoodfish') > 0 && hitAt(10, 'buyWoodfish') > 0, '木鱼仍然第七关起都能抽到');
ok(hitAt(9, 'buyPuppet') === 0 && hitAt(10, 'buyPuppet') > 0, '傀儡术仍然只在第十关');

console.log(`\n${pass} 通过 / ${fails.length} 失败`);
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
