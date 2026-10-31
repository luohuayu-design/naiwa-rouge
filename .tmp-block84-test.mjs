// 第 84 块契约（纯 Node，不起浏览器）：
//   A 掉牌概率：50% 基准 / 表递减 / tagChance 夹边界
//   B 镇牌铃：配置 / 三级 / 概率表与 deposit.js 同源（同一份引用）
//   C 商店：常驻表（第 9 / 12 回合）/ 抽签含常驻 / 跨关不摆 / 满级不摆
//   D 接线：死亡钩子掷骰 + 每次进柜提示 + 挡回换骨币 + 每帧同步铃等级
//   E 视觉：柜门铜铃 / 柜面「镇」字 / 主角腰侧铃
//   F 版本号：index.html 与所有 js 一致（v=95）
// 跑法：node .tmp-block84-test.mjs
import { readFileSync } from 'node:fs';
import { RELIC_DEFS } from './js/relics.js';
import { TAG_BASE, TAG_SEAL, tagChance } from './js/deposit.js';
import { SHOP_ITEMS, SHOP_PINNED, rollShopItems, itemLocked, SHOP_SHOW } from './js/shop.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const mainSrc = readFileSync('js/main.js', 'utf8');
const depositSrc = readFileSync('js/deposit.js', 'utf8');
const relicsSrc = readFileSync('js/relics.js', 'utf8');
const shopSrc = readFileSync('js/shop.js', 'utf8');
const guideSrc = readFileSync('js/guide.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

// ============================================================
sec('一、掉牌概率：一半的怪留牌子');
// ============================================================
ok(Math.abs(TAG_BASE - 0.5) < 1e-9, '基准概率就是 50%', String(TAG_BASE));
ok(TAG_SEAL.length === 4, '概率表 4 档（0 = 没买铃 + 3 级）', String(TAG_SEAL.length));
ok(TAG_SEAL[0] === TAG_BASE, '表里第 0 位与基准一致');
ok(TAG_SEAL.every((v, i) => i === 0 || v < TAG_SEAL[i - 1]), '每升一级概率都更低', TAG_SEAL.join(' / '));
ok(TAG_SEAL.every((v) => v > 0 && v < 1), '全部落在 (0,1)');
ok(tagChance(0) === TAG_BASE, 'tagChance(0) = 50%');
ok(tagChance(1) === TAG_SEAL[1] && tagChance(2) === TAG_SEAL[2] && tagChance(3) === TAG_SEAL[3], 'tagChance 按级取');
ok(tagChance(99) === TAG_SEAL[3], '超出上界夹到最低概率（不会返 undefined）', String(tagChance(99)));
ok(tagChance(-5) === TAG_BASE, '负等级夹回基准');
ok(tagChance(1.6) === TAG_SEAL[2], '小数等级四舍五入', String(tagChance(1.6)));
ok(tagChance() === TAG_BASE, '不传参 = 没买铃');

// ============================================================
sec('二、镇牌铃：一件只压概率的法器');
// ============================================================
const seal = RELIC_DEFS.seal;
ok(!!seal, 'RELIC_DEFS.seal 存在');
ok(seal && seal.name === '镇牌铃', '名字是镇牌铃', seal && seal.name);
ok(seal && seal.maxLevel === 3, '最多 3 级');
// ⚠️ 这里**不能**比引用相等：测试用 `./js/deposit.js` 裸路径 import，
//    而 relics.js 里是 `./js/deposit.js?v=95` —— 在 Node 里两个 URL 是两个模块实例。
//    真正要保证的是「源码里直接把那张表挂上去」（不复制、不写字面量）。
ok(/tagChance: TAG_SEAL,/.test(relicsSrc), '源码里直接把 deposit 的概率表挂上去（不复制一份）');
ok(seal && seal.tagChance.length === TAG_SEAL.length
  && seal.tagChance.every((v, i) => v === TAG_SEAL[i]), '两边数值逐个一致');
ok(seal && seal.coinPer === 10, '每挡回 10 块牌子换一枚骨币', seal && String(seal.coinPer));
ok(seal && seal.desc.length === 3, '三级各有一段说明', seal && String(seal.desc.length));
ok(seal && seal.desc[0].includes('34%') && seal.desc[1].includes('22%') && seal.desc[2].includes('13%'),
  '说明里的数字与概率表对得上', seal && seal.desc.join(' | '));
ok(Object.keys(RELIC_DEFS).length === 15, '法器一共 15 件（第 107 块 +傀儡术 / 第 114 块 +墨丸 / 第 116 块 +拿铁 / 第 118 块 +守夜烛 / +落款 / 第 123 块 +纸立牌）', Object.keys(RELIC_DEFS).join(','));
ok(/levels\.seal = 0;/.test(relicsSrc), 'reset() 会把铃清回 0 级');
ok(/cds\.seal = 0;/.test(relicsSrc), '冷却表也带 seal（和其余法器保持一致）');
ok(/if \(kind === 'seal'\) sealGroup\.visible = true;/.test(relicsSrc), 'buy 之后腰侧的铃显示出来');
ok(/sealLevel: \(\) => levels\.seal/.test(relicsSrc), '导出 sealLevel() 给主循环对账');
ok(/sealChance: \(\) => RELIC_DEFS\.seal\.tagChance/.test(relicsSrc), '导出 sealChance()');

// ============================================================
sec('三、商店：第 9 / 12 回合常驻');
// ============================================================
const buySeal = SHOP_ITEMS.find((it) => it.id === 'buySeal');
ok(!!buySeal, 'SHOP_ITEMS 里有 buySeal');
ok(buySeal && buySeal.type === 'relic' && buySeal.relic === 'seal', '它是法器货');
ok(buySeal && buySeal.needRound === 9, '第 9 回合起才解锁', buySeal && String(buySeal.needRound));
ok(buySeal && buySeal.needLevel === 8, '只在第八关出现（没有寄存柜的关摆了也没用）', buySeal && String(buySeal.needLevel));
ok(buySeal && buySeal.price === 26, '定价 26 骨币', buySeal && String(buySeal.price));
ok(buySeal && buySeal.desc.includes('50%') && buySeal.desc.includes('34%'), '货架说明写清了概率变化', buySeal && buySeal.desc);
ok(Array.isArray(SHOP_PINNED[9]) && SHOP_PINNED[9].includes('buySeal'), '第 9 回合常驻');
ok(Array.isArray(SHOP_PINNED[12]) && SHOP_PINNED[12].includes('buySeal'), '第 12 回合常驻');
ok(Object.keys(SHOP_PINNED).length === 2, '只钉了这两个回合', Object.keys(SHOP_PINNED).join(','));

const fakeRng = () => 0.42;
const ctx8r9 = { hasWeapon: true, round: 9, level: 8, pinned: SHOP_PINNED[9] };
const a = rollShopItems(fakeRng, ctx8r9);
ok(a.some((it) => it.id === 'buySeal'), '第八关第 9 回合的架子上一定有它', a.map((i) => i.id).join(','));
ok(a.filter((it) => it.id === 'buySeal').length === 1, '而且只有一件（不重复）');
ok(a.length === SHOP_SHOW, '常驻不挤掉格子，还是摆满 4 件', String(a.length));
ok(a[0].id === 'buySeal', '常驻货摆在第一格（玩家一眼看到）', a[0] && a[0].id);

const ctx8r12 = { hasWeapon: true, round: 12, level: 8, pinned: SHOP_PINNED[12] };
const b = rollShopItems(fakeRng, ctx8r12);
ok(b.some((it) => it.id === 'buySeal'), '第八关第 12 回合也有');

// 跨关：needLevel 兜住，不许在别的关硬摆
const c = rollShopItems(fakeRng, { hasWeapon: true, round: 9, level: 3, pinned: SHOP_PINNED[9] });
ok(!c.some((it) => it.id === 'buySeal'), '第三关第 9 回合不会摆出来', c.map((i) => i.id).join(','));

// 满级：不硬摆
const d = rollShopItems(fakeRng, { hasWeapon: true, round: 12, level: 8, relicLevels: { seal: 3 }, pinned: SHOP_PINNED[12] });
ok(!d.some((it) => it.id === 'buySeal'), '铃满级后货架不再摆它', d.map((i) => i.id).join(','));
ok(d.length === SHOP_SHOW, '满级时照旧摆满 4 件', String(d.length));

// 第二级：relicLevels 给了 1 级，仍然可以买（未满级）
const e = rollShopItems(fakeRng, { hasWeapon: true, round: 12, level: 8, relicLevels: { seal: 1 }, pinned: SHOP_PINNED[12] });
ok(e.some((it) => it.id === 'buySeal'), '1 级时还能再买（升级）');

// 没给 pinned 的老调用不受影响
const f = rollShopItems(fakeRng, { hasWeapon: true, round: 9, level: 8 });
ok(f.length === SHOP_SHOW, '不传 pinned 仍然摆 4 件');
ok(!f.some((it) => it.id === 'buySeal'), '不传 pinned 时它是普通货（可以被抽中，也可能抽不到）',
  f.map((i) => i.id).join(','));

ok(itemLocked(buySeal, { round: 8, level: 8 }) !== null, '第 8 回合看它：锁定', itemLocked(buySeal, { round: 8, level: 8 }));
ok(itemLocked(buySeal, { round: 9, level: 7 }) !== null, '第七关看它：锁定', itemLocked(buySeal, { round: 9, level: 7 }));
ok(itemLocked(buySeal, { round: 9, level: 8 }) === null, '第八关第 9 回合：可买');

// ============================================================
sec('四、接线：掷骰 / 提示 / 挡回换币 / 每帧同步');
// ============================================================
ok(/if \(deposit\.pos\(\)\) \{/.test(mainSrc), '只有场上有柜子时才掷骰（别的关不白吃随机流）');
ok(/rngOf\('deposit'\)\(\) < tagChance\(relics\.sealLevel\(\)\)/.test(mainSrc), '死亡钩子按铃等级掷骰');
ok(/deposit: makeRng\(runSeed \^ 0x7feb352d\)/.test(mainSrc), '种子局里掉牌有自己的一条随机流');
ok(/柜子里已经有 \$\{n\} 个牌子了/.test(mainSrc), '进柜提示带当前块数');
ok(/满 8 个会释放 BOSS · 快去取出牌子/.test(mainSrc), '提示里写清「满 8 会放 BOSS、快去取」');
ok(/if \(n > before\)/.test(mainSrc), '封柜后不再收牌 → 也不刷提示（用前后数量判断）');
ok(/sealBlocked\+\+/.test(mainSrc), '镇牌铃挡回的牌子有计数');
ok(/coins \+= 1;[\s\S]{0,120}化出一枚骨币/.test(mainSrc), '攒够就把牌子换成骨币');
ok(/const per = relics\.sealCoinPer\(\)/.test(mainSrc), '换币比例从法器定义里取，不写死');
ok(/deposit\.setSeal\(relics\.sealLevel\(\)\)/.test(mainSrc), '主循环每帧对一次铃的等级（换关 / 读档 / 买到都覆盖）');
ok(/pinned: SHOP_PINNED\[roundNo\] \|\| \[\]/.test(mainSrc), 'openShop 把常驻表传给抽签');
ok(/SHOP_PINNED/.test(mainSrc.split('\n')[27] || ''), 'main.js 确实 import 了 SHOP_PINNED');

// ============================================================
sec('五、视觉：铜铃挂在柜门上，柜面多一个「镇」字');
// ============================================================
ok(/export function setSeal|setSeal,/.test(depositSrc), 'deposit 导出 setSeal');
ok(/let sealLv = 0;/.test(depositSrc), '柜子自己记着铃的等级');
ok(/sealGroup/.test(depositSrc) && /sealGroup\.userData\.bells/.test(depositSrc), '柜门上方那串铜铃有三个');
ok(/bells\[i\]\.visible = i < sealLv/.test(depositSrc), '挂几个 = 几级');
ok(/g\.fillText\('镇', 16, 12\)/.test(depositSrc), '柜面左上角写「镇」');
// reset 不许把铃的等级清掉（否则换关回来铃就没了）
const resetBody = depositSrc.slice(depositSrc.indexOf('  function reset() {'));
ok(!/sealLv = 0/.test(resetBody.slice(0, 400)), 'reset() 不清 sealLv（法器状态属于整局，不属于这一关的柜子）');
ok(/seal: sealLv, chance: tagChance\(sealLv\)/.test(depositSrc), '调试口 state() 能读到铃的等级和当前概率');
ok(/const sealGroup = new THREE\.Group\(\)/.test(relicsSrc), '主角身上也挂一枚');
ok(/sealGroup\.position\.set\(\s*playerPos\.x \+ 0\.34/.test(relicsSrc.replace(/\n\s*/g, ' ').replace(/\( /g, '(')), '主角那枚跟着人走');
ok(guideSrc.includes('镇牌铃'), '攻略面板的法器条目提到它');

// ============================================================
sec('六、版本号');
// ============================================================
const V = (htmlSrc.match(/main\.js\?v=(\d+)/) || [])[1];
const jsFiles = ['main', 'enemy', 'wave', 'events', 'deposit', 'shop', 'relics', 'codex', 'guide'];
const bad = jsFiles.filter((n) => {
  const s = readFileSync(`js/${n}.js`, 'utf8');
  return [...s.matchAll(/\?v=(\d+)/g)].some((m) => m[1] !== V);
});
ok(Number(V) >= 95, 'index.html 版本号 ≥ 95（第 84 块落地时是 95）', V);
ok(bad.length === 0, 'js 里的 ?v= 全部一致', bad.join(','));
ok(!/\?v=94/.test(mainSrc + shopSrc + relicsSrc + depositSrc), '没有漏掉的老 v=94');

console.log(`\n=== 第 84 块契约：通过 ${pass} / 失败 ${fail} ===`);
if (fails.length) console.log(fails.map((x) => '  · ' + x).join('\n'));
process.exit(fail ? 1 : 0);
