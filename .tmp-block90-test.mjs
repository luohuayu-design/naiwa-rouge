// 第 90 块契约（纯 Node，不起浏览器）—— 用户：「减少生命值的随机事件数值也调大」
//   追问后定案：幅度 = **全部翻倍**；范围 = **事件结算扣血 + 选项代价 cost.hp**
//   （「每秒生命 -0.1」那种持续掉血不动 —— 它一回合本来就要掉 2 点）。
// 跑法：node .tmp-block90-test.mjs
import { readFileSync } from 'node:fs';
import { ALL_EVENTS, effectLines, eventChoices } from './js/events.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const FILES = ['js/events.js', 'js/eventsExtra.js', 'js/eventsSide.js', 'js/repEvents.js'];
const SRC = Object.fromEntries(FILES.map((f) => [f, readFileSync(f, 'utf8')]));
const DOC = readFileSync('关卡事件表.txt', 'utf8');

// 与 .tmp-90-count.py 同一套解析：只看最外层 effects / cost 块里的 hp
const BLOCK_PAT = /effects\s*:\s*\{/g;
const COST_PAT = /cost\s*:\s*\{/g;
const HP_PAT = /\bhp\s*:\s*(-?[0-9.]+)/g;

function blocks(src, pat) {
  const out = [];
  pat.lastIndex = 0;
  let m;
  while ((m = pat.exec(src))) {
    const i = m.index + m[0].length - 1;
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) { out.push([m.index, j + 1, src.slice(i + 1, j)]); break; }
      }
    }
  }
  return out;
}
function collect(pat) {
  const cnt = {};
  for (const f of FILES) {
    for (const [, , body] of blocks(SRC[f], pat)) {
      HP_PAT.lastIndex = 0;
      let m;
      while ((m = HP_PAT.exec(body))) {
        const v = +(+m[1]).toFixed(2);
        cnt[v] = (cnt[v] || 0) + 1;
      }
    }
  }
  return cnt;
}

// ============================================================
sec('一、事件结算扣血：整组翻倍');
// ============================================================
const eff = collect(BLOCK_PAT);
const neg = Object.fromEntries(Object.entries(eff).filter(([k]) => +k < 0).map(([k, v]) => [+k, v]));
const pos = Object.fromEntries(Object.entries(eff).filter(([k]) => +k > 0).map(([k, v]) => [+k, v]));
ok(neg[-1] === undefined && neg[-1.5] === undefined, '旧的 -1 / -1.5 已绝迹', JSON.stringify(neg));
ok(neg[-2] === 58, `-1 → -2：${neg[-2]} 处（原 58 处 -1）`, String(neg[-2]));
ok(neg[-3] === 2, `-1.5 → -3：${neg[-3]} 处`, String(neg[-3]));
ok(neg[-4] === 53, `-2 → -4：${neg[-4]} 处（原 53 处 -2）`, String(neg[-4]));
ok(neg[-6] === 2, `-3 → -6：${neg[-6]} 处`, String(neg[-6]));
const negTotal = Object.values(neg).reduce((a, b) => a + b, 0);
ok(negTotal === 115, `扣血条目总数不变（${negTotal}）`, String(negTotal));

// 正向的「生命上限 +N」是第 88 块翻过的，这次**一点都不能动**
ok(pos[2] === 15 && pos[4] === 37 && pos[6] === 7 && pos[8] === 3,
  '正向上限（+2 / +4 / +6 / +8）原样（第 88 块的结果没被二次放大）', JSON.stringify(pos));

// ============================================================
sec('二、选项代价 cost.hp');
// ============================================================
const cost = collect(COST_PAT);
ok(cost[1] === undefined, '旧的代价 1 点已绝迹', JSON.stringify(cost));
ok(cost[2] === 3, `代价 1 → 2：${cost[2]} 处`, String(cost[2]));
ok(cost[4] === 2, `代价 2 → 4：${cost[4]} 处`, String(cost[4]));

// ============================================================
sec('三、文案跟着翻，且没有连环放大');
// ============================================================
const allText = FILES.map((f) => SRC[f]).join('\n');
const txtVals = [...allText.matchAll(/生命 -([0-9.]+)/g)].map((m) => +(+m[1]).toFixed(2));
const txtSet = [...new Set(txtVals)].sort((a, b) => a - b);
ok(txtSet.every((v) => [0.1, 2, 3, 4, 6].includes(v)), '文案里只剩 2 / 3 / 4 / 6（0.1 是每秒掉血）', JSON.stringify(txtSet));
ok(txtVals.filter((v) => v === 2).length === 40, `「生命 -2」40 处`, String(txtVals.filter((v) => v === 2).length));
ok(txtVals.filter((v) => v === 4).length === 33, `「生命 -4」33 处`, String(txtVals.filter((v) => v === 4).length));
ok(txtVals.filter((v) => v === 6).length === 1, '「生命 -6」1 处', String(txtVals.filter((v) => v === 6).length));
ok(txtVals.filter((v) => v === 3).length === 1, '「生命 -3」1 处（原 -1.5）', String(txtVals.filter((v) => v === 3).length));
ok(txtVals.filter((v) => v === 0.1).length === 2, '「每秒生命 -0.1」还是 2 处（持续掉血不动）');
ok(!/下回合生命 -/.test(allText), '没有「下回合生命 -N」的错文案（立刻扣血不该说下回合）');

// ============================================================
sec('四、持续掉血 drain 保持原样');
// ============================================================
const drains = [...allText.matchAll(/drain:\s*([0-9.]+)/g)].map((m) => +m[1]).sort();
// 四个文件里原本就有四条：普通事件 0.1 / 0.1，民心专属 0.35 / 0.45 —— 本轮一个都不动
ok(JSON.stringify(drains) === JSON.stringify([0.1, 0.1, 0.35, 0.45]),
  'drain 仍是 0.1 / 0.1 / 0.35 / 0.45（持续掉血不翻倍）', JSON.stringify(drains));

// ============================================================
sec('五、运行时真的扣这么多（effectLines + 事件池）');
// ============================================================
ok(effectLines({ hp: -4 }).some((l) => /生命 -4/.test(l)), 'effectLines({hp:-4}) 写「生命 -4」',
  JSON.stringify(effectLines({ hp: -4 })));
ok(effectLines({ hp: -6 }).some((l) => /生命 -6/.test(l)), 'effectLines({hp:-6}) 写「生命 -6」',
  JSON.stringify(effectLines({ hp: -6 })));
// 事件池里能扫到的扣血值只能是这四个
const poolVals = new Set();
const walk = (ef) => {
  if (!ef) return;
  if (ef.roll) for (const b of ef.roll) walk(b.effects);
  if (typeof ef.hp === 'number' && ef.hp < 0) poolVals.add(+ef.hp.toFixed(2));
};
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) { walk(c.effects); if (c.cost && c.cost.hp) poolVals.add(-c.cost.hp); }
}
ok([...poolVals].every((v) => [-2, -3, -4, -6].includes(v)),
  '事件池里实际生效的扣血只有 -2 / -3 / -4 / -6', JSON.stringify([...poolVals].sort((a, b) => a - b)));
ok(poolVals.size === 4, '四档都在池子里（不是只剩小档）', String(poolVals.size));

// ============================================================
sec('六、文档同步');
// ============================================================
const docVals = [...DOC.matchAll(/生命 -([0-9.]+)/g)].map((m) => +(+m[1]).toFixed(2));
const docSet = [...new Set(docVals)].sort((a, b) => a - b);
ok(docSet.every((v) => [0.1, 2, 4].includes(v)), '关卡事件表里只剩 -2.0 / -4.0（-0.1 是每秒掉血）', JSON.stringify(docSet));
ok(!/生命 -1\.0/.test(DOC), '文档里旧的「生命 -1.0」已绝迹');
ok(docVals.filter((v) => v === 2).length === 28, '文档「生命 -2.0」28 处', String(docVals.filter((v) => v === 2).length));
ok(docVals.filter((v) => v === 4).length === 12, '文档「生命 -4.0」12 处', String(docVals.filter((v) => v === 4).length));

// ============================================================
sec('七、源码里旧值绝迹');
// ============================================================
for (const f of FILES) {
  ok(!/hp:\s*-1(?![.\d])/.test(SRC[f]), `${f} 没有残留 hp: -1`);
}
const staleFiles = FILES.filter((f) => /hp:\s*-1\.5(?![.\d])/.test(SRC[f]));
ok(staleFiles.length === 0, '四个事件文件里不再出现 hp: -1.5', staleFiles.join(','));

// ============================================================
sec('八、盲盒老存档：本来就按当前规则结算（这三轮一个字没动）');
// ============================================================
// 用户的第二个问题：「平衡性大改之前抽到的盲盒属性，能否按新规则结算」。
// 结论 = 能，而且不需要迁移：① 第 87/88/89 三轮都按「局外不动」，盲盒的属性表
// 一个数都没改；② 存档里存的是**开箱那一刻算好的最终数值**，注入时只读它、
// 不回查属性表（所以「改表不影响老档」是机制层面的必然，不是巧合）。
const META = readFileSync('js/metaShop.js', 'utf8');
const PROF = readFileSync('js/profile.js', 'utf8');
const fixed = [
  ['critRate', 'flat', 0.03], ['lifesteal', 'flat', 0.04], ['hpRegen', 'flat', 0.08],
  ['maxHp', 'flat', 1], ['attack', 'pct', 0.06], ['critDamage', 'pct', 0.10],
];
for (const [stat, mode, val] of fixed) {
  const re = new RegExp(`stat: '${stat}',\\s+${mode}: ${val}`);
  const hit = re.test(META);
  const got = (META.match(new RegExp(`stat: '${stat}'[^}]*`)) || [''])[0].trim();
  ok(hit, `盲盒 ${stat} 仍是 ${val}（没跟着第 87/89 块的局内削弱走）`, got);
}
ok(/s\.mods\.push\(\{ stat: m\.stat, flat: m\.flat \|\| 0, pct: m\.pct \|\| 0, scope: m\.scope \|\| null \}\)/.test(PROF),
  '存档里每条盲盒加成 =「最终数值快照」（只有 stat/flat/pct/scope，没有档位或来源 id）');
const applyBody = META.slice(
  META.indexOf('export function metaApplyStats'),
  META.indexOf('// ---------------- 开局注入（含实例'),
);
ok(applyBody.length > 200, '切到 metaApplyStats 的函数体', String(applyBody.length));
ok(!/\bPOS\b|\bNEG\b|BOX_BY_ID|\bmag\b/.test(applyBody),
  '注入时只读存档数值，不回查属性表 / 箱子倍率 → 老存档永远与「抽到那天的规则」一致');
ok(/function scaleMod\(e, mag\)/.test(META) && /metaAddMod\(res\.mod\)/.test(META),
  '倍率只在开箱那一刻算一次（rollBox → metaAddMod），之后不再重算');

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log(' · ' + f); process.exit(1); }