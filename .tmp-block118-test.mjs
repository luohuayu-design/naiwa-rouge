// ============================================================
// .tmp-block118-test.mjs —— 第 118 块验收
//   ① 守夜烛 candle.js：参数 / 点亮 / 照散雾 / 灼烧减速 / 增幅
//   ② 落款 mark.js：点名 / 持续掉血 / 死亡墨爆 / 目标数
//   ③ 商店：骨币刷新计价（递增）、新货上架 / 买断 / 门槛
//   ④ 三选一卡：守夜烛 5 张 + 落款 5 张，没法器不进池
//   ⑤ 火种：核心九簇 vs 逐件法器簇；campRelicAmp 汇总
//   ⑥ 盲盒：法器三条 + metaRelicAmp 汇总
//   ⑦ 版本 / import 一致
// 运行：node .tmp-block118-test.mjs
// ============================================================
import { readFileSync } from 'node:fs';
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

// profile.js 在 Node 里要一个 localStorage（其它测试也是这么干的）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];
const mainSrc = src('js/main.js');

const C = await import(`./js/candle.js?v=${VER}`);
const M = await import(`./js/mark.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const CF = await import(`./js/campfire.js?v=${VER}`);
const MS = await import(`./js/metaShop.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);
const P = await import(`./js/profile.js?v=${VER}`);

// ---------------- 假场景 / 假怪物 ----------------
function fakeWstats(v = 10) {
  return { get: (k) => (k === 'swordDamage' ? v : k === 'swordCrit' ? 0 : k === 'swordCritMul' ? 2 : 0) };
}
function makeEnemy(x, z, hp = 100) {
  return { pos: { x, z }, hp, cfg: { radius: 0.5, armor: 0 }, state: 'alive' };
}
function makeEnemies(list) {
  const en = {
    list: () => list,
    hittable: (e) => e.state !== 'dead' && e.hp > 0,
    takeDamage: (e, dmg) => { e.hp -= dmg; if (e.hp <= 0) e.state = 'dead'; return e.hp; },
    applySlow: (e, arg) => { e.slow = arg; },
  };
  return en;
}
const fx = { ring: () => {}, text: () => {} };
const scene = { add: () => {}, remove: () => {} };

// ============================================================
sec('① 守夜烛 candle.js');
// ============================================================
{
  const list = [];
  const enemies = makeEnemies(list);
  const reveals = [];
  const sys = C.createCandleSystem({ scene, fx, enemies, wstats: fakeWstats(10), onReveal: (x, z, r) => reveals.push({ x, z, r }) });
  ok(!sys.owned(), '没买到时 owned = false');
  ok(sys.drop({ x: 0, z: 0 }) === false && sys.lastFail() === 'lock', '没买到时点亮失败（lock）');
  sys.setRelicLevel(1);
  ok(sys.owned(), 'Lv1 后 owned = true');
  ok(Math.abs(sys.radius() - 3.2) < 1e-6, `基础半径 3.2（实 ${sys.radius()}）`);
  ok(Math.abs(sys.duration() - 6.0) < 1e-6, `基础持续 6 秒（实 ${sys.duration()}）`);
  ok(Math.abs(sys.cdMax() - 22) < 1e-6, `基础冷却 22 秒（实 ${sys.cdMax()}）`);
  ok(sys.cap() === 1, '同屏 1 盏');
  ok(sys.drop({ x: 0, z: 0 }) === true, '点亮成功');
  ok(sys.count() === 1, '场上 1 盏');
  ok(sys.drop({ x: 0, z: 0 }) === false && sys.lastFail() === 'cd', '第二盏失败（冷却中）');

  const e = makeEnemy(1, 0, 100);
  list.push(e);
  sys.update(0.6, { playerPos: { x: 0, z: 0 } });
  ok(e.hp < 100, `圈内怪被灼烧（剩 ${e.hp.toFixed(1)}）`);
  ok(!!e.slow, '圈内怪被减速');
  ok(reveals.length > 0 && Math.abs(reveals[0].r - 3.2) < 1e-6, `照散雾回调过（${reveals.length} 次）`);

  // 增幅：伤害 ×1.2 / 半径 +0.5 / 冷却 ×0.8
  const dps0 = sys.dps();
  sys.setRelicAmp({ dmg: 1.2, radius: 0.5, cd: 0.8 });
  ok(sys.dps() > dps0, '法器伤害增幅生效');
  ok(Math.abs(sys.radius() - 3.7) < 1e-6, `范围增幅 +0.5（实 ${sys.radius()}）`);
  ok(Math.abs(sys.cdMax() - 17.6) < 1e-6, `冷却增幅 ×0.8（实 ${sys.cdMax()}）`);

  // 卡片 / 商店货
  sys.applyCard({ duration: 1.2, radius: 0.4, dps: 0.12 });
  ok(Math.abs(sys.duration() - 7.2) < 1e-6, `持续 +1.2（实 ${sys.duration()}）`);
  ok(sys.buyWax() === true && sys.hasWax(), '蜡油买断成功');
  ok(sys.buyWax() === false, '蜡油不能买第二次');
  ok(sys.buyShade() === true && sys.hasShade(), '灯罩买断成功');
  ok(Math.abs(sys.radius() - 4.7) < 1e-6, `灯罩 +0.6（实 ${sys.radius()}，含卡片 0.4）`);

  // 存档：卡片 / 买断跟着走；reset 清空
  const snap = sys.snapshot();
  sys.reset();
  ok(!sys.owned() && !sys.hasWax() && sys.count() === 0, 'reset 清空等级 / 买断 / 场上');
  sys.restore(snap);
  ok(sys.hasWax() && Math.abs(sys.duration() - 8.7) < 1e-6, 'restore 还原买断与卡片');
}

// ============================================================
sec('② 落款 mark.js');
// ============================================================
{
  const list = [makeEnemy(2, 0, 100), makeEnemy(6, 0, 100)];
  const enemies = makeEnemies(list);
  const sys = M.createMarkSystem({ scene, fx, enemies, wstats: fakeWstats(10) });
  ok(sys.press({ x: 0, z: 0 }) === false && sys.lastFail() === 'lock', '没买到时按印失败（lock）');
  sys.setRelicLevel(1);
  ok(sys.targets() === 1, 'Lv1 一次落 1 个');
  ok(Math.abs(sys.boomRadius() - 1.8) < 1e-6, `墨爆半径 1.8（实 ${sys.boomRadius()}）`);
  ok(Math.abs(sys.cdMax() - 14) < 1e-6, `冷却 14 秒（实 ${sys.cdMax()}）`);
  ok(sys.press({ x: 0, z: 0 }) === true, '落款成功');
  ok(sys.count() === 1, '1 个印记');
  const mark = list[0];
  const hp0 = mark.hp;
  sys.update(0.6);
  ok(mark.hp < hp0, `持续掉血（${hp0} → ${mark.hp.toFixed(1)}）`);

  // 目标死掉 → 下一次 update 墨爆，印记消失
  mark.hp = 0.01;
  const near = makeEnemy(2.4, 0, 100);
  list.push(near);
  sys.update(0.6);          // 这一下 DoT 把它打死
  sys.update(0.6);          // 下一下检测到 dead → 墨爆
  ok(sys.count() === 0, '目标死后印记消失（触发墨爆）');
  ok(near.hp < 100, `墨爆溅到旁边（剩 ${near.hp.toFixed(1)}）`);

  // 等级 3 一次落 3 个
  sys.setRelicLevel(3);
  ok(sys.targets() === 3, 'Lv3 一次落 3 个');
}

// ============================================================
sec('③ 商店：骨币刷新与新货');
// ============================================================
{
  ok(S.SHOP_REFRESH_BASE === 6, '首刷 6 骨币');
  const costs = [0, 1, 2, 3, 4].map((n) => S.shopRefreshCost(n));
  ok(costs.join(',') === '6,10,15,25,39', `递增计价（${costs.join(' / ')}）`);
  ok(S.shopRefreshCost(-3) === 6, '负数按 0 算');

  const buyCandle = S.SHOP_ITEMS.find((i) => i.id === 'buyCandle');
  const buyMark = S.SHOP_ITEMS.find((i) => i.id === 'buyMark');
  ok(!!buyCandle && buyCandle.type === 'relic' && buyCandle.relic === 'candle', '商店有「守夜烛」');
  ok(!!buyMark && buyMark.type === 'relic' && buyMark.relic === 'mark', '商店有「落款」');
  ok(buyCandle.needLevel === 11 && buyMark.needLevel === 11, '两件都从第十一关起上架');
  const ids = ['buyCandleWax', 'buyCandleShade', 'buyMarkCinnabar', 'buyMarkPaper'];
  ok(ids.every((id) => S.SHOP_ITEMS.some((i) => i.id === id)), '四件一次性强化都在货架里');
  ok(S.SHOP_ITEMS.length === 43, `商店货 43 件（实 ${S.SHOP_ITEMS.length}）`);

  const candleWax = S.SHOP_ITEMS.find((i) => i.id === 'buyCandleWax');
  ok(S.itemLocked(candleWax, { candleLevel: 0 }) === '要先拥有「守夜烛」', '没守夜烛时买蜡油被拦');
  ok(S.itemLocked(candleWax, { candleLevel: 1, candleWax: true }) === '这一局已经买过了', '蜡油买断后拦重复');
  ok(S.itemLocked(candleWax, { candleLevel: 1 }) === null, '有守夜烛且没买过 → 可买');

  // 第十关的货架里不该出现这两件（needLevel 11）
  const at10 = S.rollShopItems(() => 0.01, { round: 20, level: 10, count: 40 });
  ok(!at10.some((i) => i.id === 'buyCandle' || i.id === 'buyMark'), '第十关不摆第十一关的法器');
}

// ============================================================
sec('④ 三选一卡');
// ============================================================
{
  const candleCards = U.UPGRADES.filter((u) => u.candle);
  const markCards = U.UPGRADES.filter((u) => u.mark);
  ok(candleCards.length === 5, `守夜烛卡 5 张（实 ${candleCards.length}）`);
  ok(markCards.length === 5, `落款卡 5 张（实 ${markCards.length}）`);
  ok(candleCards.map((c) => c.candle).some((v) => v.duration) && candleCards.map((c) => c.candle).some((v) => v.cd), '通道齐全（持续 / 范围 / 灼烧 / 冷却 / 传说）');
  ok(markCards.map((c) => c.mark).some((v) => v.targets) && markCards.map((c) => c.mark).some((v) => v.boomR), '通道齐全（目标 / 掉血 / 墨爆 / 冷却 / 传说）');

  // 没买法器时权重 0（把所有池子都摇一遍）
  const picks = [];
  for (let i = 0; i < 60; i++) picks.push(...U.rollChoices(() => 0.37, { round: 20, candleOwned: false, markOwned: false }));
  ok(!picks.some((p) => p && (p.candle || p.mark)), '没买法器时卡片不进池子');

  // 卡真的改到引擎
  const sys = C.createCandleSystem({ scene, fx, enemies: makeEnemies([]), wstats: fakeWstats(10) });
  sys.setRelicLevel(1);
  U.applyUpgrade({}, candleCards.find((c) => c.candle.duration), 0, fakeWstats(10), null, [], null, null, null, sys, null);
  ok(Math.abs(sys.duration() - 7.2) < 1e-6, `卡片落账：持续 ${sys.duration()}`);
}

// ============================================================
sec('⑤ 火种：核心九簇 + 逐件法器簇');
// ============================================================
{
  ok(CF.CAMP_CORE.length === 9, `核心九簇（实 ${CF.CAMP_CORE.length}）`);
  ok(CF.CAMPFIRE.length === 23, `火种共 23 簇（实 ${CF.CAMPFIRE.length}）`);
  const relics = CF.CAMPFIRE.filter((c) => c.relicAmp).map((c) => c.relicAmp.relic);
  const want = ['spikes', 'frost', 'bell', 'thorns', 'stove', 'lantern', 'insulator', 'woodfish', 'seal', 'puppet', 'mine', 'latte', 'candle', 'mark'];
  ok(want.every((id) => relics.includes(id)), `14 件法器各一簇（实 ${relics.length}）`);

  // 直接改档案里的火焰等级，验证汇总口径
  P.profile().camp = { rel_candle: 2, rel_mark: 1, rel_spikes: 3 };
  const amp = CF.campRelicAmp();
  ok(Math.abs(amp.candle.dmg - 1.05 ** 2) < 1e-9, `守夜烛 2 级 → 伤害 ×${amp.candle.dmg.toFixed(3)}`);
  ok(Math.abs(amp.mark.dmg - 1.05) < 1e-9, `落款 1 级 → 伤害 ×${amp.mark.dmg.toFixed(3)}`);
  ok(Math.abs(amp.spikes.dmg - 1.05 ** 3) < 1e-9, `地刺 3 级 → 伤害 ×${amp.spikes.dmg.toFixed(3)}`);
}

// ============================================================
sec('⑥ 盲盒：法器三条 + metaRelicAmp');
// ============================================================
{
  const pos = src('js/metaShop.js');
  ok(/relicDmg/.test(pos) && /relicRadius/.test(pos) && /relicCd/.test(pos), '正面池有法器三条');
  ok(/器蚀/.test(pos) && /窄域/.test(pos) && /滞器/.test(pos), '负面池有对应三条');

  const s = P.metaShopState();
  s.mods = [
    { stat: 'relicDmg', pct: 0.10, flat: 0 },
    { stat: 'relicDmg', pct: 0.10, flat: 0 },
    { stat: 'relicRadius', flat: 0.12, pct: 0 },
    { stat: 'relicCd', pct: 0.10, flat: 0 },
  ];
  const amp = MS.metaRelicAmp();
  ok(Math.abs(amp.dmg - 1.21) < 1e-9, `两条器魂叠乘 ×${amp.dmg.toFixed(3)}`);
  ok(Math.abs(amp.radius - 0.12) < 1e-9, `广域相加 +${amp.radius.toFixed(2)}`);
  ok(Math.abs(amp.cd - 0.90) < 1e-9, `疾器 −10%（×${amp.cd.toFixed(3)}）`);
}

// ============================================================
sec('⑦ 接线 / 版本');
// ============================================================
{
  ok(/createCandleSystem\(/.test(mainSrc) && /createMarkSystem\(/.test(mainSrc), 'main.js 创建了两个引擎');
  ok(/candle\.update\(dt/.test(mainSrc) && /mark\.update\(dt/.test(mainSrc), 'main.js 每帧更新两个引擎');
  ok(/applyRelicAmp\(\)/.test(mainSrc), 'main.js 开局注入法器增幅');
  ok(/shopRefreshCost/.test(mainSrc) && /shRefresh/.test(mainSrc), 'main.js 接了刷新按钮');
  ok(mainSrc.includes("v=" + VER) && !mainSrc.includes('v=132'), `main.js import 全是 v=${VER}`);
  ok(/id="shRefresh"/.test(indexHtml), 'index.html 有刷新按钮');
  const shopIds = SK.SKILLS.filter((s) => s.id === 'candle' || s.id === 'mark').map((s) => s.key);
  ok(shopIds.join(',') === '7,8', `技能栏第 7 / 8 格（${shopIds.join(',')}）`);
}

console.log(`\n===== block118-test: ${pass} pass / ${fail} fail =====`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
