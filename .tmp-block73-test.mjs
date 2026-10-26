// 第 73 块契约测试：局内三选一卡池「一条属性三档」
// 用法：node .tmp-block73-test.mjs
import { readFileSync } from 'node:fs';
import {
  UPGRADES, FAMILIES, TIERS, TAG_NAMES,
  weightOf, poolOf, rollChoices, chanceTable, rarityOdds,
  applyUpgrade, previewUpgrade,
} from './js/upgrade.js';
import { RARITIES, rarityWeight } from './js/rarity.js';
import { createStats } from './js/stats.js';
import { createWeaponStats } from './js/weaponStats.js';
import { codexSummary } from './js/codex.js';

let pass = 0; const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; } else { fails.push(name + (extra ? `（${extra}）` : '')); }
};
const sec = (t) => console.log(`\n— ${t} —`);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ============================================================
sec('一、族与三档的结构');
// ============================================================
ok('导出 TIERS 三档', Array.isArray(TIERS) && TIERS.length === 3);
ok('三档 key 是 s/m/l', TIERS.map((t) => t.key).join() === 's,m,l');
ok('三档名字是 小/中/大', TIERS.map((t) => t.name).join() === '小,中,大');
ok('三档权重系数递减', TIERS[0].wf > TIERS[1].wf && TIERS[1].wf > TIERS[2].wf);
ok('三档权重系数和为 1', near(TIERS.reduce((a, t) => a + t.wf, 0), 1, 1e-9),
  String(TIERS.reduce((a, t) => a + t.wf, 0)));

ok('导出 FAMILIES', Array.isArray(FAMILIES) && FAMILIES.length === 22, `实际 ${FAMILIES && FAMILIES.length}`);
ok('每族都有三档数值', FAMILIES.every((f) => Array.isArray(f.vals) && f.vals.length === 3));
ok('每族都有 stat 与 mode', FAMILIES.every((f) => f.stat && (f.mode === 'flat' || f.mode === 'pct')));
ok('每族都有 title/desc 生成函数', FAMILIES.every((f) => typeof f.title === 'function' && typeof f.desc === 'function'));
ok('族 id 不重复', new Set(FAMILIES.map((f) => f.id)).size === FAMILIES.length);

// 22 族 × 3 + 5 张拆不动的整卡 = 71
ok('卡池 71 张', UPGRADES.length === 71, `实际 ${UPGRADES.length}`);
ok('id 不重复', new Set(UPGRADES.map((u) => u.id)).size === UPGRADES.length);
ok('每族恰好生成 3 张', FAMILIES.every((f) => UPGRADES.filter((u) => u.family === f.id).length === 3));
ok('整卡 family 为 null（拆不成档）', UPGRADES.filter((u) => u.family === null).length === 5);
// 拆不成三档的 5 张：给的是「+1 只 / +1 把 / +1 层 / 一组效果」这种结构性的东西
const UNIQ = UPGRADES.filter((u) => u.family === null).map((u) => u.id).sort().join(',');
ok('整卡就是那 5 张结构卡',
  UNIQ === 'aegisUp,doublePalm,luckStar,swordArray,undying', UNIQ);
ok('整卡都给「结构」而非一个可缩放的数值',
  UPGRADES.filter((u) => u.family === null).every((u) => u.sword || u.extra || u.extras
    || u.stat === 'multiHit' || u.stat === 'aegis'));

// 小档沿用旧 id —— 老存档、老测试、老统计照旧认得
const OLD_IDS = ['edge', 'haste', 'reach', 'eye', 'fang', 'fortune', 'luckUp', 'luckStar',
  'swordEdge', 'swordCrit', 'swordFang', 'swordArray', 'swordSpin', 'swordForge',
  'venom', 'chill', 'volt', 'spring',
  'hide', 'shell', 'regen', 'vamp', 'aegisUp', 'undying',
  'doublePalm', 'step', 'cross'];
const missing = OLD_IDS.filter((id) => !UPGRADES.some((u) => u.id === id));
ok('旧版 27 个 id 全部还在（小档沿用）', missing.length === 0, `缺 ${missing.join(',')}`);
ok('旧 id 都是各自族的小档', OLD_IDS.every((id) => {
  const u = UPGRADES.find((x) => x.id === id);
  return u.family === null || u.tier === 's';
}));
ok('「疾风」已合并进「轻功」（同属性重复两条）', !UPGRADES.some((u) => u.id === 'wind'));
ok('中/大档 id 带 M / B 后缀',
  UPGRADES.filter((u) => u.tier === 'm').every((u) => u.id.endsWith('M'))
  && UPGRADES.filter((u) => u.tier === 'l').every((u) => u.id.endsWith('B')));

// ============================================================
sec('二、数值：中 ≈ 1.8 倍、大 ≈ 3.2 倍，且严格递增');
// ============================================================
for (const f of FAMILIES) {
  const [s, m, l] = f.vals.map(Math.abs);
  ok(`${f.name} 三档绝对值递增`, s < m && m < l, `${s} / ${m} / ${l}`);
  ok(`${f.name} 中档 ≈ 小档 1.8 倍`, m / s >= 1.6 && m / s <= 2.0, `实际 ${(m / s).toFixed(2)}`);
  // 整数取整后落在 2.6~4.2 都算「≈3.2 倍」（锋利是 1→4，取了整数好看）
  ok(`${f.name} 大档 ≈ 小档 3.2 倍`, l / s >= 2.6 && l / s <= 4.2, `实际 ${(l / s).toFixed(2)}`);
}
// 剑匣是「减秒数」，方向相反但递增的是效果
const forge = FAMILIES.find((f) => f.id === 'swordForge');
ok('剑匣三档越往上减得越多',
  forge.vals[0] > forge.vals[1] && forge.vals[1] > forge.vals[2], forge.vals.join(' / '));

// 标题里的数字必须和实际数值对得上（防「写 +60% 但 pct 是 0.3」）
const TITLE_CASES = [
  ['edge', '攻击力 +1'], ['haste', '攻击速度 +18%'], ['reach', '攻击范围 +0.4'],
  ['eye', '暴击率 +15%'], ['fang', '暴击伤害 +50% · 暴击率 +6%'],
  ['fortune', '金币掉落率 +10%'], ['luckUp', '幸运 +1'],
  ['swordEdge', '剑伤害 +60%'], ['swordCrit', '剑暴击率 +16%'],
  ['swordFang', '剑暴击伤害 +80%'], ['swordSpin', '剑转速 +50%'],
  ['venom', '毒伤 +0.12/秒'], ['chill', '冰冻 +0.6 秒'],
  ['volt', '闪电伤害 +20%'], ['spring', '血剑回血 +10%'],
  ['hide', '生命上限 +3'], ['shell', '防御 +0.3'], ['regen', '生命回复 +0.05/秒'],
  ['vamp', '近战吸血 +3%'], ['step', '移动速度 +10%'], ['cross', '移速 +8% · 攻速 +8%'],
];
for (const [id, title] of TITLE_CASES) {
  const u = UPGRADES.find((x) => x.id === id);
  ok(`「${id}」标题是「${title}」`, u && u.title === title, `实际「${u && u.title}」`);
}
ok('中/大档标题带上了新数值',
  UPGRADES.find((u) => u.id === 'edgeM').title === '攻击力 +2'
  && UPGRADES.find((u) => u.id === 'edgeB').title === '攻击力 +4');
ok('名字带 Ⅱ / Ⅲ 标记',
  UPGRADES.find((u) => u.id === 'edge').name === '锋利'
  && UPGRADES.find((u) => u.id === 'edgeM').name === '锋利Ⅱ'
  && UPGRADES.find((u) => u.id === 'edgeB').name === '锋利Ⅲ');

// ============================================================
sec('三、品质：数值越大品质越高，五档都在');
// ============================================================
ok('所有卡的 rarity 都是 0~4', UPGRADES.every((u) => Number.isInteger(u.rarity) && u.rarity >= 0 && u.rarity <= 4));
for (const f of FAMILIES) {
  const cards = UPGRADES.filter((u) => u.family === f.id);
  ok(`${f.name} 品质随档位单调不降`,
    cards[0].rarity < cards[1].rarity && cards[1].rarity <= cards[2].rarity,
    cards.map((u) => u.rarity).join('/'));
  ok(`${f.name} 小档是普通（灰）`, cards[0].rarity === 0);
  ok(`${f.name} 大档是史诗（金）`, cards[2].rarity === 3);
}
const byTier = RARITIES.map((_, i) => UPGRADES.filter((u) => u.rarity === i));
ok('五档都有卡', byTier.every((l) => l.length > 0), byTier.map((l) => l.length).join('/'));
ok('普通明显多于传说', byTier[0].length >= byTier[4].length * 3,
  `${byTier[0].length} vs ${byTier[4].length}`);
// 每系都要有高有低，否则三张摆一起品质就没意义
const perTag = {};
for (const u of UPGRADES) (perTag[u.tag] = perTag[u.tag] || new Set()).add(u.rarity);
ok('三系都有卡', Object.keys(perTag).length === 3);
ok('每系至少 3 档品质', Object.values(perTag).every((s) => s.size >= 3),
  Object.entries(perTag).map(([k, v]) => TAG_NAMES[k] + ':' + v.size).join(' '));
// 用户（第 73 块）：「幸运 +1 数值一般，品质不该那么高」
ok('「好运 幸运 +1」降回普通档', UPGRADES.find((u) => u.id === 'luckUp').rarity === 0);
ok('好运中/大档才给 2 / 3 点',
  UPGRADES.find((u) => u.id === 'luckUpM').flat === 2
  && UPGRADES.find((u) => u.id === 'luckUpB').flat === 3);

// ============================================================
sec('四、概率：小档最常见、大档真稀罕，幸运能抬上去');
// ============================================================
for (const f of FAMILIES) {
  const cards = UPGRADES.filter((u) => u.family === f.id);
  const w = cards.map((u) => u.w0 * rarityWeight(u, 0));
  const tot = w.reduce((a, x) => a + x, 0);
  const p = w.map((x) => x / tot);
  ok(`${f.name}：小 > 中 > 大`, p[0] > p[1] && p[1] > p[2],
    p.map((x) => (x * 100).toFixed(1) + '%').join(' / '));
  ok(`${f.name}：小档仍是主力（60%~80%）`, p[0] >= 0.60 && p[0] <= 0.80, (p[0] * 100).toFixed(1) + '%');
  ok(`${f.name}：大档够稀罕（2%~8%）`, p[2] >= 0.02 && p[2] <= 0.08, (p[2] * 100).toFixed(1) + '%');
  // 期望收益：相对「只给小档」的倍数，整体控制在 1.15~1.45（约 1.3 倍）
  const vals = f.vals.map(Math.abs);
  const exp = p.reduce((a, x, i) => a + x * vals[i], 0) / vals[0];
  ok(`${f.name}：期望收益 ≈ 1.3 倍旧数值`, exp >= 1.15 && exp <= 1.45, exp.toFixed(2));
}
// 幸运抬高高品质那一头
const pBig = (luck) => {
  const cards = UPGRADES.filter((u) => u.family === 'edge');
  const w = cards.map((u) => u.w0 * rarityWeight(u, luck));
  return w[2] / w.reduce((a, x) => a + x, 0);
};
ok('幸运 0 时大档 ≈ 4.4%', pBig(0) > 0.03 && pBig(0) < 0.06, (pBig(0) * 100).toFixed(2) + '%');
ok('幸运 5 时大档明显变多', pBig(5) > pBig(0) * 1.8,
  `${(pBig(0) * 100).toFixed(2)}% → ${(pBig(5) * 100).toFixed(2)}%`);
// 整体品质分布：五档概率都要参与，且和为 1
for (const r of [1, 5, 10, 20]) {
  for (const hasWeapon of [false, true]) {
    const odds = rarityOdds(r, { hasWeapon, luck: 0 });
    ok(`第 ${r} 回合（${hasWeapon ? '有剑' : '无剑'}）品质概率和为 1`,
      near(odds.reduce((a, o) => a + o.p, 0), 1, 1e-9));
    ok(`第 ${r} 回合（${hasWeapon ? '有剑' : '无剑'}）五档都 > 0`, odds.every((o) => o.p > 0),
      odds.map((o) => (o.p * 100).toFixed(1)).join('/'));
  }
}
ok('无剑时池子里没有武器卡',
  poolOf('atk', 10, { hasWeapon: false }).every((x) => !x.up.needsWeapon));
ok('有剑时武器卡进池子',
  poolOf('atk', 10, { hasWeapon: true }).some((x) => x.up.needsWeapon));
ok('武器卡权重看 needsWeapon',
  weightOf(UPGRADES.find((u) => u.id === 'swordEdge'), 10, { hasWeapon: false }) === 0
  && weightOf(UPGRADES.find((u) => u.id === 'swordEdge'), 10, { hasWeapon: true }) > 0);

// ============================================================
sec('五、抽卡与应用：三系各一、预览与实得一致');
// ============================================================
let seed = 20261024;
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < 60; i++) {
  const picks = rollChoices(rng, { round: (i % 20) + 1, hasWeapon: i > 10, luck: i % 5 });
  ok(`第 ${i} 次抽到 3 张`, picks.length === 3 && picks.every(Boolean));
  const tags = picks.map((u) => u.tag).sort().join();
  ok(`第 ${i} 次是三系各一张`, tags === 'atk,def,mov', tags);
}
ok('chanceTable 每系概率和为 1',
  chanceTable(10, { hasWeapon: true }).every((g) =>
    near(g.items.reduce((a, x) => a + x.p, 0), 1, 1e-9)));
ok('chanceTable 里的 rarity 和卡一致',
  chanceTable(10, { hasWeapon: true }).every((g) =>
    g.items.every((i) => i.rarity === UPGRADES.find((u) => u.id === i.id).rarity)));

// 71 张卡逐张：预览数字 === 选完之后的数字
{
  const wstats = createWeaponStats();
  const weapon = { count: 0, addSword() { this.count++; }, granted: true };
  let bad = 0;
  for (const up of UPGRADES) {
    const s = createStats();
    const w = createWeaponStats();
    const wp = up.sword ? { count: 0, addSword() { this.count++; } } : null;
    const pre = previewUpgrade(s, up, w, wp);
    const res = applyUpgrade(s, up, 1, w, wp);
    for (let i = 0; i < pre.length; i++) {
      if (!near(pre[i].to, res.changes[i].to, 1e-9)) bad++;
      if (!near(res.changes[i].to, w.get(pre[i].key), 1e-9) && up.scope !== 'weapon') {
        // 主角表的卡：apply 之后 stats.get 必须等于 changes.to
        if (!near(res.changes[i].to, s.get(pre[i].key), 1e-9)) bad++;
      }
    }
  }
  ok('71 张卡的「卡片预览」与「选完实际值」完全一致', bad === 0, `${bad} 处不一致`);
}
// 生命上限档位要同步补血
{
  const s = createStats();
  const before = s.hp.cur;
  applyUpgrade(s, UPGRADES.find((u) => u.id === 'hideB'), 1, createWeaponStats(), null);
  // 第 88 块：厚皮三档 2/4/7 → 3/6/10
  ok('厚皮Ⅲ 上限 +10 且立刻回满这 10 点',
    near(s.get('maxHp'), before + 10) && near(s.hp.cur, s.get('maxHp')),
    `${before} → ${s.hp.cur}/${s.get('maxHp')}`);
}
// 副属性（致命 / 游刃）三档也要跟着涨
{
  const fangCards = UPGRADES.filter((u) => u.family === 'fang');
  const rates = fangCards.map((u) => u.extra.flat);
  ok('致命的附带暴击率三档递增', rates[0] < rates[1] && rates[1] < rates[2], rates.join('/'));
  const crossCards = UPGRADES.filter((u) => u.family === 'cross');
  ok('游刃的附带攻速三档递增',
    crossCards[0].extra.pct < crossCards[1].extra.pct && crossCards[1].extra.pct < crossCards[2].extra.pct);
}

// ============================================================
sec('六、图鉴与版本号');
// ============================================================
ok('图鉴「升级卡」汇总跟着卡池走', codexSummary().cards === UPGRADES.length,
  `${codexSummary().cards} vs ${UPGRADES.length}`);
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const vm = html.match(/main\.js\?v=(\d+)/);
const upSrc = readFileSync(new URL('./js/upgrade.js', import.meta.url), 'utf8');
ok('upgrade.js 的 import 版本 = index.html', upSrc.includes(`?v=${vm[1]}`), `${vm[1]}`);
ok('卡池是生成式的（源码里不再手写一大串卡）',
  /export const UPGRADES = buildUpgrades\(\);/.test(upSrc));

console.log(`\n结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
