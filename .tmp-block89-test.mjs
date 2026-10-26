// 第 89 块契约（纯 Node，不起浏览器）—— 用户一句话：
//   「适当削弱暴击率的提升幅度」
//   追问后定案：范围 = **局内全部一起削**（主角三张卡 + 随机事件 + 商店磨剑石 + 剑锋），
//   幅度 = **约削 1/3**；局外（篝火 boons / 图鉴 metaShop）不动。
// 跑法：node .tmp-block89-test.mjs
import { readFileSync } from 'node:fs';
import { UPGRADES } from './js/upgrade.js';
import { ALL_EVENTS } from './js/events.js';
import { SHOP_ITEMS } from './js/shop.js';
import { BOONS } from './js/boons.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const upgSrc = readFileSync('js/upgrade.js', 'utf8');
const shopSrc = readFileSync('js/shop.js', 'utf8');
const evSrc = readFileSync('js/events.js', 'utf8');
const docSrc = readFileSync('关卡事件表.txt', 'utf8');
const readmeSrc = readFileSync('README.md', 'utf8');

// 三档的卡（按 tier 排 s/m/b）
const tiersOf = (fam, scope) => UPGRADES
  .filter((u) => u.family === fam && (!scope || u.scope === scope))
  .sort((a, b) => ({ s: 0, m: 1, b: 2 }[a.tier] - { s: 0, m: 1, b: 2 }[b.tier]));

// 每族旧值 → 新值。用来同时验「确实削了」和「没削过头」
const EXPECT = {
  eye:       { old: [0.15, 0.27, 0.48], now: [0.10, 0.18, 0.32] },
  swordCrit: { old: [0.16, 0.28, 0.50], now: [0.11, 0.19, 0.34] },
};

// ============================================================
sec('一、升级卡「锐目」（主角暴击率）三档各削约 1/3');
// ============================================================
const eye = tiersOf('eye');
ok(eye.length === 3, '锐目有三档', String(eye.length));
const eyeNow = eye.map((u) => u.flat);
ok(eyeNow.every((v, i) => near(v, EXPECT.eye.now[i])), '锐目 flat = 10% / 18% / 32%', JSON.stringify(eyeNow));
ok(eyeNow.every((v, i) => v < EXPECT.eye.old[i]), '三档都比旧值低（没有哪一档没改）', JSON.stringify(eyeNow));
// 削幅落在 25%~40%（「适当」的边界，别削成 1/2）
const eyeCut = eyeNow.map((v, i) => 1 - v / EXPECT.eye.old[i]);
ok(eyeCut.every((c) => c >= 0.25 && c <= 0.40), '削幅都在 25%~40%（约 1/3）', JSON.stringify(eyeCut.map((c) => c.toFixed(3))));
ok(eye.map((u) => u.title).join('|') === '暴击率 +10%|暴击率 +18%|暴击率 +32%',
  '卡面文案跟着改（10/18/32）', eye.map((u) => u.title).join('|'));
ok(eye.every((u) => u.stat === 'critRate'), '仍然改的是 critRate（没改错键名）');

// ============================================================
sec('二、升级卡「致命」附带的暴击率');
// ============================================================
const fang = tiersOf('fang');
const fangExtra = fang.map((u) => (u.extra || u.extras?.[0]));
ok(fangExtra.every((e) => e && e.stat === 'critRate'), '致命三档都带 critRate');
const fanNow = fangExtra.map((e) => e.flat);
ok(fanNow.every((v, i) => near(v, [0.04, 0.07, 0.12][i])), '附带暴击率 = 4% / 7% / 12%（旧 6/10/18）', JSON.stringify(fanNow));
ok(fang.every((u) => u.pct >= 0.50 - 1e-9), '暴击伤害本体没被顺手削（暴伤不归这次）', JSON.stringify(fang.map((u) => u.pct)));

// ============================================================
sec('三、传说卡「福星」');
// ============================================================
const star = UPGRADES.find((u) => u.id === 'luckStar');
ok(!!star, '福星还在（传说卡）');
const starCrit = (star.extras || []).find((e) => e.stat === 'critRate');
ok(starCrit && near(starCrit.flat, 0.03), '福星暴击 +5% → +3%', starCrit && String(starCrit.flat));
ok(/暴击 \+3%/.test(star.title), '标题写 +3%（不是 +5%）', star.title);
ok(/金币掉落率 \+10%/.test(star.title), '金币掉落率没被牵连');

// ============================================================
sec('四、武器升级卡「剑锋」（环剑暴击率）');
// ============================================================
const sc = tiersOf('swordCrit', 'weapon');
const scNow = sc.map((u) => u.flat);
ok(scNow.every((v, i) => near(v, EXPECT.swordCrit.now[i])), '剑锋 = 11% / 19% / 34%（旧 16/28/50）', JSON.stringify(scNow));
const scCut = scNow.map((v, i) => 1 - v / EXPECT.swordCrit.old[i]);
ok(scCut.every((c) => c >= 0.28 && c <= 0.40), '削幅 28%~40%', JSON.stringify(scCut.map((c) => c.toFixed(3))));
ok(sc.every((u) => u.stat === 'swordCrit' && u.scope === 'weapon'), '仍然只改武器表');
// 剑的基准暴击没动 —— 用户说的是「提升幅度」
const wsSrc = readFileSync('js/weaponStats.js', 'utf8');
ok(/key: 'swordCrit',\s+name: '剑暴击率',\s+base: 0\.10/.test(wsSrc), '剑本体基础暴击仍是 10%');

// ============================================================
sec('五、商店「磨剑石」');
// ============================================================
const grind = SHOP_ITEMS.find((i) => i.id === 'grindstone');
ok(!!grind, '磨剑石还在');
ok(near(grind.flat, 0.03), '磨剑石 +5% → +3%', String(grind.flat));
ok(grind.price === 18, '价格 22 → 18（数值削了价跟着降，和剑油同价）', String(grind.price));
ok(/\+3%/.test(grind.desc), '描述写 +3%', grind.desc);
// 剑油（剑伤害）是别的属性，不该顺手改
const oil = SHOP_ITEMS.find((i) => i.id === 'swordOil');
ok(oil && near(oil.pct, 0.15), '剑油 +15% 没动');

// ============================================================
sec('六、随机事件（临时暴击）跟着降 1/3');
// ============================================================
// 数据里写的原始值 × TEMP_SCALE 才是玩家实际吃的。
// 旧 k=3.0：8%/10%/12% → 24%/30%/36%；新 k=2.0 → 16%/20%/24%。
const rawCrit = [];
const scan = (ef) => {
  if (!ef) return;
  if (ef.roll) for (const b of ef.roll) scan(b.effects);
  for (const m of ef.mods || []) if (m.stat === 'critRate' && m.flat != null) rawCrit.push(m.flat);
};
for (const ev of ALL_EVENTS) {
  for (const c of (ev.choices || [])) scan(c.effects);
  if (ev.effects) scan(ev.effects);
}
ok(rawCrit.length >= 5, '扫到至少 5 处事件暴击加成', String(rawCrit.length));
const uniq = [...new Set(rawCrit.map((v) => +v.toFixed(4)))].sort((a, b) => a - b);
ok(uniq.every((v) => [0.16, 0.20, 0.24].some((t) => near(v, t))),
  '生效值只有 16% / 20% / 24% 三档（旧 24/30/36）', JSON.stringify(uniq));
ok(Math.max(...rawCrit) <= 0.24 + 1e-9, '没有哪条还停在 30%+', String(Math.max(...rawCrit)));
// 卡面文案也是重写出来的：新值三档 16/20/24（旧 24/30/36）。
// 注意 +24% 在新旧两版都存在（旧 = 8%×3，新 = 12%×2），所以判据是「集合只允许 16/20/24」。
const allHints = ALL_EVENTS.flatMap((ev) => (ev.choices || []).map((c) => c.hint || '')).join('\n');
const hintCritVals = [...allHints.matchAll(/暴击[^\d]{0,4}\+(\d+)%/g)].map((m) => +m[1]);
ok(hintCritVals.length >= 3, '卡面上能抓到至少 3 处暴击百分比', JSON.stringify(hintCritVals));
ok(hintCritVals.every((v) => [16, 20, 24].includes(v)),
  '卡面暴击只出现 16% / 20% / 24%', JSON.stringify(hintCritVals));
ok(!hintCritVals.includes(30) && !hintCritVals.includes(36), '「+30% / +36%」已绝迹');
const hasHint16 = ALL_EVENTS.some((ev) => (ev.choices || []).some((c) => /暴击[^\d]{0,4}\+16%/.test(c.hint || '')));
ok(hasHint16, '卡面已改写成「暴击 +16%」');
ok(/critRate:\s*\{ k: 2\.0/.test(evSrc), 'TEMP_SCALE.critRate 的 k = 2.0（旧 3.0）');
// 暴击伤害的临时倍率不归这次管
ok(/critDamage:\s*\{ k: 2\.0, cap: 1\.0 \}/.test(evSrc), 'TEMP_SCALE.critDamage 没动');

// ============================================================
sec('七、局外来源不动（第 87 块定下的边界）');
// ============================================================
const boonCrit = BOONS.find((b) => b.stat === 'critRate');
ok(boonCrit && near(boonCrit.flat, 0.06), '篝火暴击仍是 +6%', boonCrit && String(boonCrit.flat));
const metaSrc = readFileSync('js/metaShop.js', 'utf8');
const metaCrits = [...metaSrc.matchAll(/stat: 'critRate',\s+flat: ([0-9.]+)/g)].map((m) => +m[1]);
ok(metaCrits.length === 2 && metaCrits.every((v) => near(v, 0.03)), '图鉴两条暴击仍是 +3%', JSON.stringify(metaCrits));

// ============================================================
sec('八、源码里旧值绝迹');
// ============================================================
ok(!/vals: \[0\.15, 0\.27, 0\.48\]/.test(upgSrc), 'upgrade.js 没有残留 15/27/48');
ok(!/vals: \[0\.16, 0\.28, 0\.50\]/.test(upgSrc), 'upgrade.js 没有残留 16/28/50');
ok(!/critRate', mode: 'flat', vals: \[0\.06/.test(upgSrc), 'upgrade.js 没有残留 6/10/18');
ok(!/stat: 'swordCrit', flat: 0\.05/.test(shopSrc), 'shop.js 没有残留剑暴击 5%');

// ============================================================
sec('九、文档同步');
// ============================================================
ok(/暴击率 \+10%/.test(docSrc), '关卡事件表：锐目 +10%');
ok(/暴击伤害 \+50% · 暴击率 \+4%/.test(docSrc), '关卡事件表：致命 +4%');
ok(/剑暴击率 \+11%/.test(docSrc), '关卡事件表：剑锋 +11%');
ok(/暴击 \+3% · 金币掉落率 \+10%/.test(docSrc), '关卡事件表：福星 +3%');
ok(/剑暴击率 \+3%（永久）/.test(docSrc), '关卡事件表：磨剑石 +3%');
ok(/暴击 8%→16%/.test(readmeSrc), 'README：临时暴击 8%→16%');

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log(' · ' + f); process.exit(1); }
