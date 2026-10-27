// 第 98 块契约（纯 Node，不起浏览器）
// 用户：「改属性那里，怎么改之后把基础也变了，基础值不要变啊，只是改最终值，
//        之后再变化还是改后最终值 + 改动率 × 基础值」
//   ① 存的不是 base，而是一个**追加项**：基础值一个字节都不动
//   ② 追加项挂在公式末尾、**不参与百分比乘法**
//      最终值 = (base + Σflat) × (1 + Σpct) + 追加项
//      ⇒ 之后加百分比 p：新最终值 = 改后最终值 + p × 基础值（正是用户那句话）
//   ③ 老字段 statBases（第 95 块的「反解 base」）必须被丢掉，否则「基础」永远显示错的
//   ④ 面板显示的「基础」读的是代码里的原值
//   ⑤ 生效时机：新开一局 + 读档续玩
//   ⑥ 版本号同步
// 跑法：node .tmp-block98-test.mjs（cwd = naiwa-rouge）
import { readFileSync } from 'node:fs';
import { createStats, STAT_DEFS } from './js/stats.js';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');
const eq = (a, b, name) => ok(a === b, name, `${a} !== ${b}`);

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const statsSrc = read('./js/stats.js');
const mainSrc = read('./js/main.js');
const profSrc = read('./js/profile.js');
const htmlSrc = read('./index.html');

const BASE = (k) => STAT_DEFS.find((d) => d.key === k).base;

// localStorage 桩（profile.js 要用）
class LS {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
globalThis.localStorage = new LS();
const prof = await import('./js/profile.js');

// ============================================================
sec('① 基础值永远不动');
// ============================================================
{
  const s = createStats(STAT_DEFS, { attack: 99, maxHp: -40 });
  for (const d of STAT_DEFS) {
    eq(s.base[d.key], d.base, `传了乱七八糟的追加项，${d.key} 的基础值仍是 ${d.base}`);
  }
  ok(Array.isArray(s.adj) === false && typeof s.adj === 'object', 'adj 是独立的一张表，不混进 base');
  eq(s.adj.attack, 99, '追加项原样挂在 adj 上');
}
{
  // base 是只读语义：改 adj 不该带动 base
  const s = createStats(STAT_DEFS);
  const b0 = s.base.attack;
  s.applyAdmin({ attack: 55 });
  eq(s.base.attack, b0, `applyAdmin 之后基础值没变（${b0}）`);
  eq(s.adj.attack, 55, 'applyAdmin 只动追加项');
  s.applyAdmin({});
  eq(s.adj.attack, 0, 'applyAdmin({}) = 清空追加项');
}

// ============================================================
sec('② 追加项不参与百分比乘法');
// ============================================================
{
  const s = createStats(STAT_DEFS);
  const nat0 = s.natural('maxHp');
  eq(nat0, BASE('maxHp'), `空加成时 natural 就是基础值（${nat0}）`);

  const adj = 100 - nat0;                 // 用户想填 100
  const t = createStats(STAT_DEFS, { maxHp: adj });
  ok(Math.abs(t.get('maxHp') - 100) < 1e-9, `填 100 → 面板读回 ${t.get('maxHp')}`);

  // ★ 用户原话：之后的变化 = 改后最终值 + 改动率 × 基础值
  t.addMod({ stat: 'maxHp', pct: 0.2, src: 'camp' });
  const want = 100 + 0.2 * BASE('maxHp');
  ok(Math.abs(t.get('maxHp') - want) < 1e-9,
    `再 +20% → ${t.get('maxHp')}（期望 ${want} = 100 + 0.2 × 基础 ${BASE('maxHp')}；第 95 块会变成 120）`);
  ok(Math.abs(t.get('maxHp') - 120) > 1e-6, '确实不是「100 直接乘 1.2」');
  eq(t.base.maxHp, BASE('maxHp'), `加完百分比基础值仍是 ${t.base.maxHp}`);

  // 追加项恒定：get − natural 永远等于 adj，跟加成怎么加无关
  for (const pct of [0, 0.15, 0.5, 1.2, 3]) {
    const x = createStats(STAT_DEFS, { maxHp: adj });
    if (pct) x.addMod({ stat: 'maxHp', pct, src: 't' });
    ok(Math.abs((x.get('maxHp') - x.natural('maxHp')) - adj) < 1e-9,
      `pct=${pct} 时 追加项 恒定`);
  }
  // flat 也是加在末尾的绝对值（注意 flat 本身仍吃引擎老公式的 pct，与本块无关）
  const y = createStats(STAT_DEFS, { maxHp: adj });
  const before = y.get('maxHp');
  y.addMod({ stat: 'maxHp', flat: 7, src: 'upg' });
  ok(Math.abs(y.get('maxHp') - (before + 7)) < 1e-9,
    `无 pct 时 +7 生命 → +7（${before} → ${y.get('maxHp')}）`);
}

sec('②-b preview 与 get 同一套公式');
{
  const adj = 40;
  const s = createStats(STAT_DEFS, { attack: adj });
  s.addMod({ stat: 'attack', flat: 2, src: 'x' });
  const got = s.get('attack');
  s.addMod({ stat: 'attack', flat: 3, src: 'y' });
  const pv = s.preview('attack', { flat: 0 });        // 不新加任何东西
  ok(Math.abs(pv - s.get('attack')) < 1e-9, '不新加时 preview === get');
  ok(Math.abs(pv - (got + 3)) < 1e-9, `preview 把之前的 +3 也算进去了（${pv}）`);
}

// ============================================================
sec('③ 老字段 statBases 必须被丢掉');
// ============================================================
{
  // 模拟第 95 块留下的老存档
  localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify({
    v: 1, bones: 50,
    statBases: { attack: 63.6667, maxHp: 88 },
  }));
  prof.reloadFromStorage();
  const adm = prof.getStatAdmin();
  eq(Object.keys(adm).length, 0, '老的 statBases 不会变成追加项（语义不同，不能换算）');
  const dump = JSON.parse(JSON.stringify(prof.profile()));
  ok(!('statBases' in dump), '老字段已从档案里消失');
  prof.save();
  const disk = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1'));
  ok(!('statBases' in disk), '落盘之后磁盘上也没有了');
  eq(disk.bones, 50, '其它字段不受影响（骨币还在）');
}

sec('③-b statAdmin 存档往返');
{
  prof.resetStatAdmin();
  eq(Object.keys(prof.getStatAdmin()).length, 0, '初始为空');
  prof.setStatAdmin('attack', 12.5);
  eq(prof.getStatAdmin().attack, 12.5, '写进档案');
  prof.setStatAdmin('armor', '3');
  eq(prof.getStatAdmin().armor, 3, '字符串被转成数字');
  prof.setStatAdmin('armor', 0);
  ok(!('armor' in prof.getStatAdmin()), '写 0 = 删键（没有追加项）');
  prof.setStatAdmin('armor', null);
  ok(!('armor' in prof.getStatAdmin()), 'null = 删键');
  prof.resetStatAdmin();
  eq(Object.keys(prof.getStatAdmin()).length, 0, '恢复默认清空');
  // 往返：清 cache 再从磁盘读
  prof.setStatAdmin('attack', -8);
  prof.reloadFromStorage();
  eq(prof.getStatAdmin().attack, -8, '负追加项也能往返（有些属性确实要往下压）');
  prof.resetStatAdmin();
}

// ============================================================
sec('④ 接线：不许再有第二条路');
// ============================================================
ok(!/applyBases/.test(mainSrc), 'main.js 里没有 applyBases 了');
{ // 注释里留着「为什么废弃」的说明是好事，只看**代码**有没有再碰它
  const codeOnly = mainSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/statBases/.test(codeOnly), 'main.js 的代码里不再碰 statBases');
}
ok((mainSrc.match(/stats\.applyAdmin\(getStatAdmin\(\)\)/g) || []).length >= 2,
  'applyAdmin 在 resetRunState + resumeGame 两处都调');
ok(/createStats\(STAT_DEFS, getStatAdmin\(\)\)/.test(mainSrc), '开局注入的是追加项');
ok(/stats\.applyAdmin\(getStatAdmin\(\)\)/.test(mainSrc.slice(mainSrc.indexOf('async function resumeGame'),
  mainSrc.indexOf('async function resumeGame') + 4000)), '读档续玩也吃追加项');
ok(/setStatAdmin\(key, v - s\.natural\(key\)\)/.test(mainSrc.replace(/\s+/g, ' ')) ||
  /setStatAdmin\(key, v - nat\)/.test(mainSrc), 'submitStatFinal 用「目标 − 自然最终值」算追加项');
ok(/const nat = s\.natural\(key\)/.test(mainSrc), 'submitStatFinal 拿的是 natural 而不是 sumMods 反解');
ok(!/const den = 1 \+ sum\.pct/.test(mainSrc), '老的「除法反解」彻底没了');

sec('④-b 面板显示的「基础」是代码原值');
ok(/const effectiveBase = d\.base;/.test(mainSrc), 'effectiveBase 直接取 d.base（不再取 ov）');
ok(!/const effectiveBase = edited \? ov\[d\.key\] : d\.base;/.test(mainSrc), '旧的「已改就显示改后基础」没了');
ok(/const edited = Math\.abs\(ov\[d\.key\] \|\| 0\) > 1e-9;/.test(mainSrc), '「已改」标记看追加项是否为 0');
ok(/基础 \$\{d\.fmt\(effectiveBase\)\}/.test(mainSrc), '编辑态仍标出「基础 X」');

// ============================================================
sec('⑤ 文案');
// ============================================================
ok(/基础值不变/.test(htmlSrc), '面板上的说明写了「基础值不变」');
ok(/只乘基础值/.test(htmlSrc), '也写了「之后的加成只乘基础值」');
ok(/基础值永远不许变/.test(mainSrc), 'main.js 顶部注释写死了这条语义');

// ============================================================
sec('⑥ 版本号：index.html 与所有 js 完全一致');
// ============================================================
import { readdirSync } from 'node:fs';
const jsFiles = readdirSync(new URL('./js', import.meta.url)).filter((x) => x.endsWith('.js'));
const vs = [...htmlSrc.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
const base = vs[0];
ok(!!base, `index.html 版本号 v=${base}`);
ok(vs.every((v) => v === base), `index.html 内一致（${vs.length} 处）`);
const bad = [];
for (const f of jsFiles) {
  const s = readFileSync(new URL('./js/' + f, import.meta.url), 'utf8');
  for (const m of s.matchAll(/\?v=(\d+)/g)) if (m[1] !== base) bad.push(f + ' → ' + m[1]);
}
eq(bad.length, 0, `js 里所有 ?v= 都是 ${base}`, bad.slice(0, 3).join(' | '));

// ============================================================
console.log('\n------------------------------');
if (fail === 0) console.log(`第 98 块契约：全绿 ${pass}/${pass + fail}`);
else {
  console.log(`第 98 块契约：${pass} 通过 / ${fail} 失败`);
  for (const f of fails) console.log('  - ' + f);
}
process.exit(fail === 0 ? 0 : 1);
