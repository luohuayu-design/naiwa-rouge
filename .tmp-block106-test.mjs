// 第 106 块 Node 契约测试：成就 67 → 106（删「一线生机」+ 补 40 条）+ 主页面瘦身 / 新「据点」页
// 覆盖：
//   ① 一线生机彻底消失（表里没有、main.js 里没有埋点）
//   ② 106 条的分布、档位、骨币合计、id 不重复、八类之和 = 总数
//   ③ 每条成就在 main.js 里都有 tryAch 埋点（没有埋点的成就永远不会亮）
//   ④ prog 的八种口径合法 + stat 型的新计数键真的有人 bumpStat
//   ⑤ main.js 认得三种新 prog（story / camp / swords）
//   ⑥ index.html：四个 tab + 据点面板八个入口 + 主页面只剩属性横卡
//   ⑦ 版本号全站一致（数字由 index.html 说了算，不写死）
import fs from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const idx = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const VER = (idx.match(/main\.js\?v=(\d+)/) || [])[1] || '';
const mainSrc = fs.readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
const cssSrc = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const achSrc = fs.readFileSync(new URL('./js/achievements.js', import.meta.url), 'utf8');
const weaponSrc = fs.readFileSync(new URL('./js/weapon.js', import.meta.url), 'utf8');

const { resetAll, bumpStat, profile } = await import(`./js/profile.js?v=${VER}`);
const {
  ACHS, ACH_CATS, ACH_COUNT, achById, achsByCat, achTier,
} = await import(`./js/achievements.js?v=${VER}`);

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
function fresh() { store.clear(); resetAll(); }

// ============================================================ 0. 版本号
console.log('[0] 版本号');
{
  // ⚠️ 别写死版本号（第 105 块的教训：block104 硬编码 v=118，全站 bump 后立刻假红）。
  // 这里只钉「是个正整数」「style.css 与 main.js 同一个号」，数字由 index.html 说了算。
  ok(/^\d+$/.test(VER) && Number(VER) > 0, 'index.html 里读得到 main.js 的版本号', VER);
  ok(idx.includes(`style.css?v=${VER}`), `style.css 带 ?v=${VER}`);
  // 全站 import 都跟着 bump（漏一个 = SW 缓存优先下拿到旧模块）
  const files = ['main.js', 'achievements.js', 'weapon.js', 'profile.js', 'metaShop.js', 'dailyQuest.js'];
  for (const f of files) {
    const src = fs.readFileSync(new URL(`./js/${f}`, import.meta.url), 'utf8');
    const bad = [...src.matchAll(/from '\.\/([a-zA-Z0-9]+)\.js\?v=(\d+)'/g)].filter((m) => m[2] !== VER);
    ok(bad.length === 0, `js/${f} 的所有相对 import 都带 ?v=${VER}`,
      bad.map((m) => `${m[1]}=${m[2]}`).join(','));
  }
}

// ============================================================ 1. 一线生机已删除
console.log('\n[1] 「一线生机」彻底删干净');
{
  ok(!achById('low_hp_win'), '成就表里没有 low_hp_win');
  ok(!/tryAch\(\s*'low_hp_win'\s*\)/.test(mainSrc), 'main.js 里没有它的埋点（留着埋点就是死代码）');
  // 注释里出现「一线生机」是**故意的**（说明为什么删），所以只查「成就定义与判定」这一层
  ok(!/\{\s*id:\s*'low_hp_win'/.test(achSrc), 'achievements.js 里没有这条定义了');
  ok(!/一线生机/.test(idx), 'index.html 里不出现（面板是运行时建的，但别留静态文案）');
  // 只是删掉，不是藏起来：注释里要写明为什么删
  ok(/一线生机/.test(achSrc) && /太难|太苛刻|运气/.test(achSrc),
    'achievements.js 里留了「为什么删」的说明（下一个人不会又加回来）');
  // 生存类里那条 hp 上限型的还在（删的是「压血通关」这一条，不是整类）
  ok(!!achById('hp_30') && !!achById('hp_50'), '「血牛 / 血肉城墙」这两条没被连坐');
}

// ============================================================ 2. 106 条的账
console.log('\n[2] 106 条 · 八类 · 三档');
{
  ok(ACH_COUNT === 110, '总数 110（111 - 删除「电光石火」）', String(ACH_COUNT));
  ok(ACHS.length === ACH_COUNT, 'ACHS 长度 = ACH_COUNT');
  const ids = ACHS.map((a) => a.id);
  ok(new Set(ids).size === ids.length, 'id 不重复');
  const sum = ACH_CATS.reduce((n, c) => n + achsByCat(c.id).length, 0);
  ok(sum === ACH_COUNT, '八类之和 = 总数', String(sum));
  // 八类各自的条数（面板上分组标题旁边就是这个数，改一条就会漂）
  // 第 107 块：level 24 → 29（clear_10 + 四只新怪里程碑）
  const want = { battle: 21, survive: 11, build: 15, level: 29, challenge: 14, story: 5, meta: 10, secret: 5 };
  for (const c of ACH_CATS) {
    ok(achsByCat(c.id).length === want[c.id], `${c.name} ${want[c.id]} 条`, String(achsByCat(c.id).length));
  }
  const byTier = [0, 1, 2].map((t) => ACHS.filter((a) => a.tier === t).length);
  ok(byTier.join('/') === '22/59/29', '档位分布 寻常 22 / 不易 59 / 罕见 29（删「电光石火」后 -1 罕见）', byTier.join('/'));
  const total = ACHS.reduce((n, a) => n + achTier(a.tier).bones, 0);
  ok(total === 7680, '全清 7680 骨币（删「电光石火」后 -120）', String(total));
  ok(ACHS.every((a) => !!a.name && !!a.desc && !!a.icon), '每条都有名字 / 描述 / 图标');
  ok(ACHS.every((a) => !/[*_`]/.test(a.desc)), '描述里没有 markdown（面板是 textContent 渲染）');
}

// ============================================================ 3. 埋点齐不齐
console.log('\n[3] 每条成就都有埋点');
{
  const called = new Set([...mainSrc.matchAll(/tryAch\(\s*'([a-zA-Z0-9_]+)'\s*\)/g)].map((m) => m[1]));
  const noHook = ACHS.filter((a) => !called.has(a.id));
  ok(noHook.length === 0, '没有「永远亮不了」的成就', noHook.map((a) => a.id).join(','));
  const ghost = [...called].filter((i) => !achById(i));
  ok(ghost.length === 0, '也没有埋了但表里没有的 id（老埋点要跟着删）', ghost.join(','));
}

// ============================================================ 4. prog 口径
console.log('\n[4] prog 的八种口径');
{
  const KINDS = ['stat', 'enemy', 'events', 'meta', 'enemies', 'story', 'camp', 'swords'];
  const bad = ACHS.filter((a) => a.prog && !KINDS.includes(a.prog.k));
  ok(bad.length === 0, 'prog.k 只用了 main.js 认得的八种', bad.map((a) => a.id + ':' + a.prog.k).join(','));
  ok(ACHS.filter((a) => a.prog).every((a) => a.prog.need > 0), '带 prog 的 need 都 > 0（不然 0 除）');
  for (const k of KINDS) {
    ok(mainSrc.includes(`p.k === '${k}'`), `achProgress 里认得 '${k}'`);
  }
  // stat 型的计数键必须真的有人在 bumpStat（weapon.js 也算）
  const keys = [...new Set(ACHS.filter((a) => a.prog && a.prog.k === 'stat').map((a) => a.prog.key))];
  const noBump = keys.filter((k) => !new RegExp(`bumpStat\\('${k}'`).test(mainSrc + weaponSrc));
  ok(noBump.length === 0, 'stat 型每个键都有 bumpStat 埋点', noBump.join(','));
  // 第 106 块新开的八个计数键
  for (const k of ['crits', 'dmgDealt', 'swordHits', 'deaths', 'rounds', 'signDays', 'gifts', 'dailyRuns']) {
    ok(keys.includes(k), `新计数键 ${k} 有成就在用`);
  }
  // 老存档这些键是 undefined —— bumpStat 必须能自造（不能 NaN）
  fresh();
  bumpStat('crits'); bumpStat('dmgDealt', 12.5); bumpStat('swordHits');
  const st = profile().stats;
  ok(st.crits === 1 && st.swordHits === 1 && Math.abs(st.dmgDealt - 12.5) < 1e-6,
    '老存档缺键时 bumpStat 从 0 起（不会变 NaN）', JSON.stringify({ c: st.crits, d: st.dmgDealt, s: st.swordHits }));
}

// ============================================================ 5. 单局口径三条
console.log('\n[5] 「整局干净」三条（跟着一局走，不是跟着存档走）');
{
  ok(/let runCrits = 0/.test(mainSrc) && /let runPotions = 0/.test(mainSrc) && /let runDmgTaken = 0/.test(mainSrc),
    '三个单局计数器声明在闭包里');
  // 必须跟着 resetRunState 清，否则上一局攒的会带进新局（第 86 块那条教训）
  const i = mainSrc.indexOf('function resetRunState');
  const body = mainSrc.slice(i, mainSrc.indexOf('\n  }', i));
  ok(/runCrits = 0/.test(body) && /runPotions = 0/.test(body) && /runDmgTaken = 0/.test(body),
    'resetRunState 里三个都归零（开新局不会带上一局的数）');
  ok(/if \(runPotions === 0\) tryAch\('no_potion_win'\)/.test(mainSrc), 'no_potion_win 判的是本局 0 瓶');
  ok(/if \(runDmgTaken === 0\) tryAch\('flawless_win'\)/.test(mainSrc), 'flawless_win 判的是本局 0 次挨打');
  ok(/runDmgTaken \+= 1/.test(mainSrc), '挨打计的是「真的掉了血」那一下（金钟罩挡下不算）');
}

// ============================================================ 6. index.html：四 tab + 据点
console.log('\n[6] index.html · 四个 tab 与据点面板');
{
  for (const id of ['ttPaneMain', 'ttPaneQuest', 'ttPaneAch', 'ttPaneBase',
    'ttTabMain', 'ttTabQuest', 'ttTabAch', 'ttTabBase',
    'bpBones', 'ttStatVals']) {
    ok(idx.includes(`id="${id}"`), `index.html 里有 #${id}`);
  }
  ok(/class="tt-pane on" id="ttPaneMain"/.test(idx), '默认落在主页面');
  ok(/class="tt-tab on" id="ttTabMain"/.test(idx), '默认亮「主页面」那个 tab');
  // 搬过去的八个入口：DOM 在据点面板里，id 一个都不能改（监听靠 id 挂的）
  const moved = ['btnCodex', 'btnStory', 'btnRecords', 'btnBoons',
    'btnGift', 'btnSettings', 'btnNotice', 'btnPromo'];
  const base = idx.slice(idx.indexOf('id="ttPaneBase"'), idx.indexOf('id="ttTabs"'));
  for (const id of moved) {
    ok(base.includes(`id="${id}"`), `${id} 已经搬进据点面板`);
    ok(mainSrc.includes(`getElementById('${id}')`), `${id} 在 main.js 里还挂着监听`);
  }
  // 主页面不该再有它们
  const mainPane = idx.slice(idx.indexOf('id="ttPaneMain"'), idx.indexOf('id="ttPaneQuest"'));
  for (const id of moved) {
    ok(!mainPane.includes(`id="${id}"`), `主页面里已经没有 ${id}`);
  }
  // 主页面剩下的：开打 + 三个日常 + 商店 + 属性横卡
  for (const id of ['btnStart', 'btnResume', 'btnDaily', 'btnSeed', 'btnSign', 'btnShop', 'btnStats']) {
    ok(mainPane.includes(`id="${id}"`), `主页面还留着 ${id}`);
  }
  ok(mainPane.includes('class="tt-statbar"') && mainPane.includes('id="ttStatVals"'),
    '属性改成一条横卡（带数值，不是原来的小按钮）');
  // 三行按钮删掉后，那两个只给它们用的 CSS 类也该一起走（别留死样式）
  ok(!/tt-row-w2|tt-row-w4/.test(idx), 'tt-row-w2 / tt-row-w4 没有残留（那两行没了）');
  ok(!/\.tt-row-w2|\.tt-row-w4/.test(cssSrc), 'style.css 里也没有那两行的样式');
}

// ============================================================ 7. 样式与窄屏
console.log('\n[7] 样式 / 窄屏不溢出');
{
  ok(/\.tt-statbar\{/.test(cssSrc) && /\.ts-v\{/.test(cssSrc), '属性横卡有样式（.tt-statbar / .ts-v）');
  ok(/\.bp-grid\{[^}]*grid-template-columns:1fr 1fr/.test(cssSrc), '据点是 2×2 网格');
  ok(/\.bp-it\{/.test(cssSrc) && /\.bp-ic\{/.test(cssSrc), '据点条目与图标有样式');
  // 单色 SVG 必须走 mask（第 94 块的血泪：外链 <img> 吃不到 currentColor）
  ok(/\.bp-ic\{?[^}]*mask:var\(--ic\)/.test(cssSrc) || /\.bp-ic,\{/.test(cssSrc)
    || /\.bp-ic\b/.test(cssSrc.match(/\.ac-it-b i,[^{]*\{/)?.[0] || ''),
    '据点图标进了 mask 着色那条选择器列表');
  // 四个 tab 比三个窄：内边距和字距必须收过一档
  const tab = (cssSrc.match(/\.tt-tab\{[^}]*\}/) || [''])[0];
  ok(/padding:8px 9px/.test(tab) && /letter-spacing:\.04em/.test(tab),
    'tab 内边距收到 8px 9px（四个才装得下 375 的屏）', tab.slice(0, 80));
  ok(/@media \(max-width:360px\)/.test(cssSrc), '360 以下还有一档更窄的兜底');
  // 新图标文件都在
  for (const f of ['base.svg', 'io-codex.svg', 'io-story.svg', 'io-records.svg', 'io-boon.svg',
    'io-gift.svg', 'io-cog.svg', 'io-megaphone.svg', 'io-share.svg']) {
    ok(fs.existsSync(new URL(`./assets/icons/${f}`, import.meta.url)), `图标存在：${f}`);
    const s = fs.readFileSync(new URL(`./assets/icons/${f}`, import.meta.url), 'utf8');
    ok(!/M0 0h512v512H0z/.test(s) && /currentColor/.test(s), `${f} 去掉了黑底板且是 currentColor`);
  }
}

// ============================================================ 8. main.js 接线
console.log('\n[8] main.js 接线');
{
  ok(/ttTabBase\.addEventListener/.test(mainSrc), '据点 tab 挂了点击');
  ok(/ttPaneBase\.classList\.toggle\('on', which === 'base'\)/.test(mainSrc), '切面板会切到据点');
  ok(/if \(which === 'base'\) renderBasePane\(\)/.test(mainSrc), '切过去会刷一遍（骨币数）');
  ok(/function renderTitleStatBar/.test(mainSrc), '有 renderTitleStatBar（主页属性横卡）');
  ok(/renderTitleStatBar\(\)/.test(mainSrc), '回标题页会刷那条横卡');
  // 横卡的口径必须和属性页一致：局外三份加成都要算进去
  const f = mainSrc.indexOf('function renderTitleStatBar');
  const body = mainSrc.slice(f, mainSrc.indexOf('\n  }', f));
  ok(/campApply/.test(body) && /applyBoons/.test(body) && /metaApplyStats/.test(body),
    '横卡把篝火 / 火种 / 夜行商店三份局外加成都算进去（不然主页和属性页两个数）');
  ok(/getStatAdmin\(\)/.test(body), '横卡也吃管理员模式二改的最终值');
  // 剧情中途落点要在「读」的那一刻判，不能等结算
  ok(/function checkStoryAchs/.test(mainSrc), '有 checkStoryAchs');
  ok((mainSrc.match(/checkStoryAchs\(\)/g) || []).length >= 2,
    '两处 markStoryRead 之后都判了一次（局内撞见 + 主菜单回看）');
}

console.log(`\n${'='.repeat(52)}`);
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (fails.length) {
  console.log('\n  失败清单：');
  for (const f of fails) console.log('   - ' + f);
}
process.exit(fail ? 1 : 0);
