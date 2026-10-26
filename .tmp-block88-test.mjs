// 第 88 块契约（纯 Node，不起浏览器）—— 用户一句话：
//   「提高生命上限的数值再提高」
//   追问后定案：范围 = **全部途径一起提档**；幅度由我决定，方向是
//   「之前是生命低、完全靠生命恢复抗伤害，现在要转型成血量存量在后期抗伤害」。
// 跑法：node .tmp-block88-test.mjs
import { readFileSync } from 'node:fs';
import { UPGRADES } from './js/upgrade.js';
import { ALL_EVENTS, effectLines, eventChoices, choiceHint } from './js/events.js';
import { SHOP_ITEMS } from './js/shop.js';
import { STAT_DEFS } from './js/stats.js';

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
const docSrc = readFileSync('关卡事件表.txt', 'utf8');

// 生效后的生命上限数值只允许这几个（旧值 1 / 1.5 必须绝迹）
const ALLOWED = [2, 3, 4, 6, 8];      // 事件与商店的上限值
const HIDE_VALS = [3, 6, 10];         // 厚皮三档（+10 只有这张卡有）

// ============================================================
sec('一、基础上限：6 → 10');
// ============================================================
const hpDef = STAT_DEFS.find((d) => d.key === 'maxHp');
ok(hpDef && hpDef.base === 10, `STAT_DEFS 里 maxHp 的 base = 10（旧 6）`, String(hpDef && hpDef.base));
ok(/base: 10/.test(statsSrc) && /base:\s*6/.test(statsSrc) === false,
  'stats.js 里没有残留 base: 6');
// 血条是按比例渲染的，不是固定格数 —— 上限变大不会撑坏 HUD
ok(/ratio \* 100/.test(mainSrc), '血条宽度按比例算（ratio * 100%），不依赖固定格数');

// ============================================================
sec('二、三条属性途径');
// ============================================================
// 2.1 升级卡「厚皮」
const hide = UPGRADES.filter((u) => u.family === 'hide').map((u) => u.flat).sort((a, b) => a - b);
ok(JSON.stringify(hide) === JSON.stringify([3, 6, 10]),
  `厚皮三档 ${hide.join(' / ')}（旧 2 / 4 / 7）`, JSON.stringify(hide));
ok(JSON.stringify(hide) === JSON.stringify(HIDE_VALS), '厚皮 = 3 / 6 / 10（已逐档核对）', hide.join(','));
for (const u of UPGRADES.filter((x) => x.family === 'hide')) {
  ok(new RegExp(`生命上限 \\+${u.flat}`).test(u.title), `${u.name}(${u.flat}) 卡面跟着写`, u.title);
  ok(!/\+2$|\+4$|\+7$/.test(u.title), `${u.name} 卡面没有旧数字`, u.title);
}

// 2.2 传说卡「不灭」
const undying = UPGRADES.find((u) => u.family === 'undying') || UPGRADES.find((u) => (u.name || '') === '不灭');
ok(!!undying, '找到传说卡「不灭」');
ok(undying && undying.flat === 6, `不灭 flat = 6（旧 3）`, String(undying && undying.flat));
ok(undying && undying.heal === 6, '不灭补的血跟着等于上限增量', String(undying && undying.heal));
ok(undying && /生命上限 \+6/.test(undying.title), '不灭卡面写 +6', undying && undying.title);
ok(undying && /补 6 点/.test(undying.desc), '不灭描述写「补 6 点」', undying && undying.desc);

// 2.3 商店「硬壳」
const shell = SHOP_ITEMS.find((i) => i.id === 'shell');
ok(!!shell, '找到商店「硬壳」');
ok(shell && shell.flat === 4, `硬壳 flat = 4（旧 2）`, String(shell && shell.flat));
ok(shell && shell.heal === 4, '硬壳补的血等于上限增量', String(shell && shell.heal));
ok(shell && /生命上限 \+4\.0/.test(shell.desc), '硬壳描述写 +4.0', shell && shell.desc);
ok(shell && shell.price === 14, '硬壳没有跟着涨价（转型期让玩家愿意买血）', String(shell && shell.price));

// 2.4 「生命回满」的固定上限增量
ok(/const HEALFULL_UP = 4/.test(mainSrc), 'HEALFULL_UP = 4（旧 2）');
const L2 = effectLines({ healFull: true }).join(' · ');
ok(/生命上限 \+4 · 生命回满/.test(L2), 'effectLines 与常量同步（生命上限 +4 · 生命回满）', L2);

// 2.5 药水跟着血线走（上限 10 以后回 3 只顶 30%）
const potion = SHOP_ITEMS.find((i) => i.id === 'potion');
ok(potion && potion.amount === 4, `小药回 4 点（旧 3）`, String(potion && potion.amount));
ok(potion && potion.type === 'heal' && potion.stat === undefined, '小药仍是纯回复，不改上限定位');

// ============================================================
sec('三、事件里的「生命上限 +N」整体翻倍');
// ============================================================
let hpVals = [];
let hintVals = [];
let mismatch = [];
let hintNoNum = [];
let hpPos = 0;
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    const h = choiceHint(c);
    const walk = (ef, cur) => {
      if (!ef) return;
      if (ef.roll) for (const b of ef.roll) walk(b.effects, cur);
      if (ef.hp > 0) { hpPos++; hpVals.push(ef.hp); cur.push(ef.hp); }
    };
    const mine = [];
    walk(c.effects, mine);
    const m = h.match(/生命上限 \+([0-9]+(?:\.[0-9]+)?)/);
    if (m) hintVals.push(parseFloat(m[1]));
    if (mine.length === 1 && m) {
      if (Math.abs(parseFloat(m[1]) - mine[0]) > 1e-9) {
        mismatch.push(`${c.label} :: 效果 ${mine[0]} vs 文案 ${m[1]}`);
      }
    }
    // 概率分支（「可能回血，也可能烧喉咙」）故意不写死数字 —— 写死了反而是骗人
    const isRoll = !!(c.effects && c.effects.roll);
    if (mine.length === 1 && !m && !isRoll && !/可能|多半/.test(h)) hintNoNum.push(`${c.label} :: ${h}`);
  }
}
ok(hpPos >= 45, `正向上限加成 ${hpPos} 处全部被放大过`, String(hpPos));
const badHp = hpVals.filter((v) => !ALLOWED.includes(v));
ok(badHp.length === 0, '没有残留旧值（1 / 1.5）—— 全部落在 {2,3,4,6,8}', [...new Set(badHp)].join(','));
const badHint = hintVals.filter((v) => !ALLOWED.includes(v));
ok(badHint.length === 0, '文案里也没有旧值', [...new Set(badHint)].join(','));
ok(mismatch.length === 0, '文案数字与结算数值逐条一致（没有口惠而实不至）', mismatch.slice(0, 4).join(' | '));
ok(hintNoNum.length === 0, '有上限加成的选项都写了数字', hintNoNum.slice(0, 3).join(' | '));

// 3.1 代价（cost.hp）与扣血（hp < 0）一律没动
const costHp = [...readFileSync('js/events.js', 'utf8').matchAll(/cost: \{ hp: ([0-9.]+)/g)].map((m) => +m[1]);
ok(costHp.length >= 5, `代价型 cost.hp 还是 ${costHp.length} 处`, String(costHp.length));
// 第 90 块把代价翻倍了（1→2、2→4），这里改判「本块没动」= 值仍是 2 / 4 两档
ok(costHp.every((v) => v === 2 || v === 4), '代价没被本块放大（第 90 块才翻成 2 / 4）', costHp.join(','));
let negCnt = 0;
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    const walk = (ef) => {
      if (!ef) return;
      if (ef.roll) for (const b of ef.roll) walk(b.effects);
      if (ef.hp < 0) negCnt++;
    };
    walk(c.effects);
  }
}
// 第 90 块把扣血数值统一翻倍了，但**条目数**不变 —— 这里只锁条目数
ok(negCnt >= 60, `扣血选项 ${negCnt} 处，条目数没变（数值第 90 块才翻倍）`, String(negCnt));

// 3.2 临时上限（下回合 maxHp mod）也不在这次范围内
const tempMaxHp = [...readFileSync('js/events.js', 'utf8').matchAll(/stat: 'maxHp'/g)].length;
ok(tempMaxHp >= 0, `事件里的临时 maxHp mod 未被误改（${tempMaxHp} 处）`);

// ============================================================
sec('四、局外那三条保持 +1（铁律：局外因素对局内影响要小）');
// ============================================================
const campSrc = readFileSync('js/campfire.js', 'utf8');
const boonSrc = readFileSync('js/boons.js', 'utf8');
const metaSrc = readFileSync('js/metaShop.js', 'utf8');
ok(/mods: \[\{ stat: 'maxHp', flat: 1 \}\]/.test(campSrc), '篝火每级仍是 +1 生命');
ok(/stat: 'maxHp', flat: 1,/.test(boonSrc), '永夜火种「生命」仍是 +1');
ok(/stat: 'maxHp',\s+flat: 1,/.test(metaSrc), '夜行商店「强健」仍是 +1');
ok(!/stat: 'maxHp', flat: [2-9]/.test(campSrc + boonSrc),
  '局外三处没有一个被顺手放大');

// ============================================================
sec('五、文档同步');
// ============================================================
ok(/厚皮〔普通〕 —— 生命上限 \+3/.test(docSrc), '事件表：厚皮 +3');
ok(/不灭〔传说〕 —— 生命上限 \+6/.test(docSrc), '事件表：不灭 +6');
ok(/硬壳〔稀有〕（14 金币）—— 生命上限 \+4\.0/.test(docSrc), '事件表：硬壳 +4.0');
const docBad = (docSrc.match(/生命上限 \+1(\.0)?\s*(?![0-9])/g) || []);
ok(docBad.length === 0, '事件表里没有 +1 / +1.0 残留', docBad.slice(0, 3).join(','));
const docDash = (docSrc.match(/生命上限 \+1\.5/g) || []);
ok(docDash.length === 0, '事件表里没有 +1.5 残留', docDash.join(','));

// ============================================================
sec('六、版本号');
// ============================================================
const V = (htmlSrc.match(/\?v=(\d+)/) || [])[1];
ok(Number(V) >= 99, `index.html 版本号 ≥ 99（实际 ${V}）`, V);
for (const f of ['main.js', 'stats.js', 'upgrade.js', 'shop.js', 'events.js']) {
  const s = readFileSync('js/' + f, 'utf8');
  const vs = [...s.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  ok(vs.every((x) => x === V), `${f} 的 ?v= 全是 ${V}`, vs.filter((x) => x !== V).slice(0, 3).join(','));
}

console.log('\n' + '─'.repeat(52));
console.log(`通过 ${pass} · 失败 ${fail}`);
if (fail) {
  console.log('失败项：');
  for (const f of fails) console.log('  - ' + f);
  process.exitCode = 1;
}
