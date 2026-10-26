// 第 87 块契约（纯 Node，不起浏览器）—— 用户三件事：
//   ①「属性选择中，把每秒生命恢复选项数值提升变为原来的四分之一左右」
//   ②「把回复血量的选项全部统一为提高生命上限的同时补生命」
//   ③「把近战攻击吸血量的选择提升全部变为原来的三分之一左右」
// 另外用户追加：药水不改消耗品定位，但**取消购买上限、降低价格**。
// 跑法：node .tmp-block87-test.mjs
import { readFileSync } from 'node:fs';
import { UPGRADES } from './js/upgrade.js';
import { ALL_EVENTS, effectLines, eventChoices, choiceHint } from './js/events.js';
import { SHOP_ITEMS } from './js/shop.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const mainSrc = readFileSync('js/main.js', 'utf8');
const statsSrc = readFileSync('js/stats.js', 'utf8');
const shopSrc = readFileSync('js/shop.js', 'utf8');
const upgSrc = readFileSync('js/upgrade.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

// 卡的档位顺序：小 / 中 / 大
const tiersOf = (family) => UPGRADES
  .filter((u) => u.family === family)
  .map((u) => (u.tier === 's' ? 0 : u.tier === 'm' ? 1 : 2))
  .reduce((a, ix, i, arr) => { a[ix] = UPGRADES.filter((u) => u.family === family)[i]; return a; }, []);

// ============================================================
sec('一、再生（hpRegen）：0.2 / 0.36 / 0.65 → 原来的 1/4');
// ============================================================
const regen = UPGRADES.filter((u) => u.family === 'regen');
ok(regen.length === 3, `再生还是三档（${regen.length}）`, String(regen.length));
const regenVals = regen.map((u) => u.flat).sort((a, b) => a - b);
ok(JSON.stringify(regenVals) === JSON.stringify([0.05, 0.09, 0.16]),
  `三档数值 ${regenVals.join(' / ')}（旧 0.2 / 0.36 / 0.65）`, JSON.stringify(regenVals));
ok(regenVals.every((v) => v <= 0.17), '每一档都不超过旧最小档的量级', String(Math.max(...regenVals)));
// 文案跟着改，别出现旧数字
for (const u of regen) {
  ok(!/0\.2\/秒|0\.36|0\.65/.test(u.title + u.desc), `${u.name} 文案没有旧数值`, u.title);
}
ok(/生命回复 \+0\.05\/秒/.test(regen[0].title), '小档卡片写着 +0.05/秒', regen[0].title);
// 文件头注释同步（免得后人照注释里的量级调）
ok(!/回复 \+0\.2\/秒/.test(upgSrc), 'upgrade.js 头注释里的量级也改了');
// 不灭（传说卡）的附赠 hpRegen 跟着同一口径
const undying = UPGRADES.filter((u) => u.id === 'undying');
ok(undying.length === 1, '不灭卡还在');
ok(/生命回复 \+0\.08\/秒/.test(undying[0].title), '不灭的附赠回血 0.08/秒', undying[0].title);

// ============================================================
sec('二、吸血（lifesteal）：0.10 / 0.18 / 0.32 → 原来的 1/3');
// ============================================================
const vamp = UPGRADES.filter((u) => u.family === 'vamp');
ok(vamp.length === 3, `吸血还是三档（${vamp.length}）`, String(vamp.length));
const vampVals = vamp.map((u) => u.flat).sort((a, b) => a - b);
ok(JSON.stringify(vampVals) === JSON.stringify([0.03, 0.06, 0.11]),
  `三档数值 ${vampVals.join(' / ')}（旧 0.10 / 0.18 / 0.32）`, JSON.stringify(vampVals));
ok(vampVals.every((v) => v <= 0.12), '最大档不超过 12%（旧 32%）', String(Math.max(...vampVals)));
ok(vamp.every((u) => /近战吸血/.test(u.title)), '卡面仍然写「近战吸血」');
// 血剑的活血（spring / leechRate）是另一条属性，这次**不动**（用户说的是近战吸血）
const spring = UPGRADES.filter((u) => u.family === 'spring');
ok(spring.length === 3 && spring.every((u) => u.flat === 0.10 || u.flat === 0.18 || u.flat === 0.32),
  '血剑「活血」保持原值（不在这次范围内）', spring.map((u) => u.flat).join(','));

// ============================================================
sec('三、事件回血 → 生命上限 +N 且补 N');
// ============================================================
// 3.1 数据面：所有事件的 hint / 效果行里，不该再有「生命 +N」这种纯回血说法
let hintBad = [];
let hpPos = 0;
let healFullCnt = 0;
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    const h = choiceHint(c);
    // 「生命 +」= 纯回血写法（「生命回复」「生命上限」「生命 -」都不匹配）
    if (/生命 \+/.test(h)) hintBad.push(c.label + ' :: ' + h);
    const walk = (ef) => {
      if (!ef) return;
      if (ef.roll) for (const b of ef.roll) walk(b.effects);
      if (ef.hp > 0) hpPos++;
      if (ef.healFull) healFullCnt++;
    };
    walk(c.effects);
  }
}
ok(hpPos >= 40, `正向回血的选项还有 ${hpPos} 处（都要靠同一段逻辑管）`, String(hpPos));
ok(hintBad.length === 0, '没有「生命 +N」的旧文案残留', hintBad.slice(0, 3).join(' | '));
ok(healFullCnt >= 2, `「生命回满」的选项 ${healFullCnt} 处`, String(healFullCnt));

// 3.2 文案面：effectLines 说清「上限 + 补满」
const L1 = effectLines({ hp: 2 }).join(' · ');
ok(/生命上限 \+2\.0（补满）/.test(L1), 'effectLines({hp:2}) → 生命上限 +2.0（补满）', L1);
const L2 = effectLines({ healFull: true }).join(' · ');
ok(/生命上限 \+2 · 生命回满/.test(L2), 'effectLines({healFull}) → 生命上限 +2 · 生命回满', L2);
const L3 = effectLines({ hp: -1 }).join(' · ');
ok(/生命 -1\.0/.test(L3), '扣血文案不受影响（生命 -1.0）', L3);

// 3.3 结算面：main.js 里正向 hp 必须走 maxHp + syncHp，而不是纯 heal
const hpBlock = (mainSrc.match(/if \(effects\.hp > 0\) \{[\s\S]{0,420}?\n    \}/) || [''])[0];
ok(!!hpBlock, 'main.js 找到 effects.hp > 0 的分支');
ok(/stat: 'maxHp'/.test(hpBlock), '正向回血改成加 maxHp');
ok(/syncHp\(effects\.hp\)/.test(hpBlock), '加完上限立刻补同样多的血（syncHp）');
ok(/hpgain:/.test(hpBlock), '上限走独立 src（hpgain:），不会被回合清理撤掉');
ok(!/stats\.heal\(effects\.hp\)/.test(mainSrc), '不再有裸的 stats.heal(effects.hp)');
ok(/HEALFULL_UP/.test(mainSrc), '「生命回满」有独立的上限增量常量');
ok(/const HEALFULL_UP = 2/.test(mainSrc), 'HEALFULL_UP = 2');
// 「回满」也要抬上限
const fullBlock = (mainSrc.match(/if \(effects\.healFull\) \{[\s\S]{0,320}?\n    \}/) || [''])[0];
ok(/stat: 'maxHp'/.test(fullBlock), '「回满」也先抬上限');

// ============================================================
sec('四、药水：不售罄 + 降价');
// ============================================================
const potion = SHOP_ITEMS.find((s) => s.id === 'potion');
const big = SHOP_ITEMS.find((s) => s.id === 'bigPotion');
ok(!!potion && !!big, '两瓶药还在');
ok(potion.price === 5, `小药价格 8 → ${potion.price}`, String(potion.price));
ok(big.price === 12, `大药价格 18 → ${big.price}`, String(big.price));
ok(potion.type === 'heal' && potion.amount === 3, '小药还是回 3 点（消耗品定位不变）');
ok(big.type === 'healFull', '大药还是回满');
ok(/反复买/.test(potion.desc) && /反复买/.test(big.desc), '说明里写了同店可反复买');
// 售罄：药水类跳过
ok(/if \(item\.type !== 'heal' && item\.type !== 'healFull'\) \{[\s\S]{0,160}?shopSoldOut\.add/.test(mainSrc),
  '买药不再挂售罄（只有非药水才 shopSoldOut.add）');

// ============================================================
sec('五、面板精度：0.05/0.09 不能被抹成「0.1」');
// ============================================================
ok(/v > 0 && v < 0\.1 \? v\.toFixed\(2\)/.test(statsSrc), 'hpRegen 小于 0.1 时显示两位小数');

// ============================================================
sec('六、版本号：index.html 与所有 js 一致');
// ============================================================
const V = (htmlSrc.match(/\?v=(\d+)/) || [])[1];
ok(Number(V) >= 98, `index.html 版本号 v=${V}`, V);
const jsFiles = ['main.js', 'upgrade.js', 'events.js', 'eventsExtra.js', 'eventsSide.js', 'repEvents.js', 'shop.js', 'stats.js'];
let vBad = [];
for (const f of jsFiles) {
  const s = readFileSync('js/' + f, 'utf8');
  for (const m of s.matchAll(/\?v=(\d+)/g)) if (m[1] !== V) vBad.push(f + ':' + m[1]);
}
ok(vBad.length === 0, `js 里的 ?v= 全是 ${V}`, vBad.slice(0, 3).join(','));

// ============================================================
console.log('\n' + '─'.repeat(52));
console.log(`通过 ${pass} · 失败 ${fail}`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
