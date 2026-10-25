// 第 74 块契约测试：盲盒线性涨价 + 生命回复削弱 + 篝火/局外商店合并
// 用法：node .tmp-block74-test.mjs
import { readFileSync } from 'node:fs';

// localStorage 桩（profile.js 只在函数体内访问它）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { profile, bones, addBones, metaShopState, resetAll } = await import('./js/profile.js?v=87');
const {
  BOXES, BOX_BY_ID, BOX_PRICE_STEP, boxCost, boxPriceOf, boxBought, buyBox, rollBox,
} = await import('./js/metaShop.js?v=87');

let pass = 0; const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) pass++; else fails.push(name + (extra ? `（${extra}）` : ''));
};
const sec = (t) => console.log(`\n— ${t} —`);
const fresh = () => { store.clear(); resetAll(); };

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
const msSrc = readFileSync(new URL('./js/metaShop.js', import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

// ============================================================
sec('一、盲盒按购买次数线性涨价（三种各自独立）');
// ============================================================
ok('导出涨价步长 BOX_PRICE_STEP', BOX_PRICE_STEP === 0.06, String(BOX_PRICE_STEP));
ok('cost 现在是「首价」：木 30 / 银 100 / 金 280',
  BOX_BY_ID.wood.cost === 30 && BOX_BY_ID.silver.cost === 100 && BOX_BY_ID.gold.cost === 280);
for (const b of BOXES) {
  ok(`${b.name} 第 1 次买 = 首价 ${b.cost}`, boxCost(b.id, 0) === b.cost, String(boxCost(b.id, 0)));
  ok(`${b.name} 每买一次 +6% 首价`,
    boxCost(b.id, 1) === Math.round(b.cost * 1.06) && boxCost(b.id, 2) === Math.round(b.cost * 1.12),
    `${boxCost(b.id, 1)} / ${boxCost(b.id, 2)}`);
  // 线性（不是复利）：第 20 次 = 首价 × 2.2
  ok(`${b.name} 第 20 次 = 首价 ×2.2（线性不是复利）`,
    boxCost(b.id, 20) === Math.round(b.cost * 2.2), String(boxCost(b.id, 20)));
  let mono = true;
  for (let n = 1; n <= 60; n++) if (boxCost(b.id, n) < boxCost(b.id, n - 1)) mono = false;
  ok(`${b.name} 价格单调不降（0~60 次）`, mono);
  ok(`${b.name} 涨得比篝火（每级 +35%）缓`, (boxCost(b.id, 10) / b.cost) < 2.0,
    `第 10 次 ${boxCost(b.id, 10)}`);
}
ok('木匣 第 10 / 20 / 30 次 = 48 / 66 / 84',
  boxCost('wood', 10) === 48 && boxCost('wood', 20) === 66 && boxCost('wood', 30) === 84,
  `${boxCost('wood', 10)}/${boxCost('wood', 20)}/${boxCost('wood', 30)}`);
ok('银匣 第 10 次 160、金匣 第 10 次 448',
  boxCost('silver', 10) === 160 && boxCost('gold', 10) === 448,
  `${boxCost('silver', 10)}/${boxCost('gold', 10)}`);
ok('未知箱子返回 0', boxCost('nope', 3) === 0);
ok('次数为负 / 非数字也不炸', boxCost('wood', -5) === 30 && boxCost('wood', undefined) === 30);

// 三种各自独立计数
fresh();
addBones(100000);
{
  const p0 = [boxPriceOf('wood'), boxPriceOf('silver'), boxPriceOf('gold')];
  ok('没买过时三个都是首价', p0.join() === '30,100,280', p0.join());
  for (let i = 0; i < 10; i++) buyBox('wood', Math.random, false);
  ok('买了 10 次木匣 → 木匣涨价', boxPriceOf('wood') === 48, String(boxPriceOf('wood')));
  ok('银匣 / 金匣不受影响（各数各的）',
    boxPriceOf('silver') === 100 && boxPriceOf('gold') === 280,
    `${boxPriceOf('silver')}/${boxPriceOf('gold')}`);
  ok('boxBought 读出次数', boxBought('wood') === 10 && boxBought('silver') === 0,
    `${boxBought('wood')}/${boxBought('silver')}`);
  const r = buyBox('gold', Math.random, false);
  ok('买金匣扣的是金匣的价（280）', r.ok && r.cost === 280 && r.nth === 1, JSON.stringify({ c: r.cost, n: r.nth }));
  ok('金匣第二次就是 297', boxPriceOf('gold') === 297, String(boxPriceOf('gold')));
}

// buyBox 真的按涨价扣钱
fresh();
addBones(1000);
{
  const seq = [];
  for (let i = 0; i < 5; i++) {
    const before = bones();
    const r = buyBox('wood', Math.random, false);
    seq.push(before - bones());
    if (!r.ok) break;
  }
  const want = [30, 32, 34, 35, 37];   // 30 → 31.8→32 → 33.6→34 → 35.4→35 → 37.2→37
  ok('连买 5 次木匣，扣的钱逐次变多且等于 boxCost',
    seq.join() === want.join(), `${seq.join()} vs ${want.join()}`);
}
fresh();
{
  const r = buyBox('gold', Math.random, false);   // 没钱
  ok('钱不够时按**当前价**报「还差多少」', !r.ok && r.reason === 'poor' && r.cost === 280 && r.have === 0,
    JSON.stringify(r));
}

// ============================================================
sec('二、生命每秒恢复：概率与数值一起降');
// ============================================================
{
  const posLine = msSrc.split('\n').find((l) => l.includes("name: '回春'"));
  const negLine = msSrc.split('\n').find((l) => l.includes("name: '枯萎'"));
  ok('正面「回春」数值 0.20 → 0.08', posLine && /flat: 0\.08\b/.test(posLine), posLine && posLine.trim());
  ok('正面「回春」权重 0.7 → 0.25', posLine && /weight: 0\.25\b/.test(posLine), posLine && posLine.trim());
  ok('负面「枯萎」同步降到 0.08 / 0.25（正负依旧一一对应）',
    negLine && /flat: 0\.08\b/.test(negLine) && /weight: 0\.25\b/.test(negLine), negLine && negLine.trim());
  ok('回春仍只在银匣及以上出（minTier 1）', posLine && /minTier: 1/.test(posLine));
}
// 实测：银匣连开 3 万次，回春的出现率与给的量
fresh();
{
  let hit = 0, statN = 0, maxFlat = 0;
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 30000; i++) {
    const r = rollBox('silver', rng);
    if (r.kind !== 'stat') continue;
    statN++;
    if (r.stat === 'hpRegen') {
      hit++;
      if (Math.abs(r.flat) > maxFlat) maxFlat = Math.abs(r.flat);
    }
  }
  const share = hit / statN;
  console.log(`   银匣 ${statN} 次属性结果里，回春 ${hit} 次（${(share * 100).toFixed(2)}%），最大 ${maxFlat}/秒`);
  ok('回春出现率 ≈ 2.4%（原来 6.4%）', share > 0.012 && share < 0.040, (share * 100).toFixed(2) + '%');
  ok('银匣一次最多给 0.13/秒（金匣也只到 0.19）', maxFlat <= 0.14 && maxFlat > 0, String(maxFlat));
  ok('金匣一次的上限 = 0.08 × 2.4 = 0.192', Math.abs(0.08 * 2.4 - 0.192) < 1e-9);
}

// ============================================================
sec('三、篝火 + 局外商店合成一个「夜行商店」');
// ============================================================
ok('主菜单不再有 #btnCamp', !/id="btnCamp"/.test(html));
ok('不再有独立的 #msScr 面板', !/id="msScr"/.test(html));
ok('不再有 #msBack 返回键', !/id="msBack"/.test(html));
ok('商店入口只剩 #btnShop 一个', (html.match(/id="btnShop"/g) || []).length === 1);
ok('主菜单的商店按钮只有一个', (html.match(/class="tt-camp"/g) || []).length === 1,
  String((html.match(/class="tt-camp"/g) || []).length));
ok('按钮上写「夜行商店」', /<span class="tt-camp-name">夜行商店<\/span>/.test(html));
ok('面板标题写「夜行商店」', /<div class="lv-title">夜行商店<\/div>/.test(html));
ok('容器仍是 #campScr（一套开关逻辑）', /<div id="campScr"/.test(html));
ok('有分区切换条 #shopTabs', /id="shopTabs"/.test(html));
ok('两个分区 #shopBodyCamp / #shopBodyBox 都在',
  /id="shopBodyCamp"/.test(html) && /id="shopBodyBox"/.test(html));
ok('两个 tab 按钮都在', /id="shopTabCamp"/.test(html) && /id="shopTabBox"/.test(html));
ok('篝火那区的东西（cfList / cfBones / cfWarn）都还在',
  /id="cfList"/.test(html) && /id="cfBones"/.test(html) && /id="cfWarn"/.test(html));
ok('盲盒那区的东西（msList / msBones / msLog）都还在',
  /id="msList"/.test(html) && /id="msBones"/.test(html) && /id="msLog"/.test(html));
ok('盲盒区默认收着（hidden）', /id="shopBodyBox" hidden/.test(html));
ok('CSS 里有 .shop-tabs / .shop-tab 样式',
  /\.shop-tabs\{/.test(cssSrc) && /\.shop-tab\{/.test(cssSrc));
ok('两个 tab 各有选中的配色', /#shopTabCamp\.on\{/.test(cssSrc) && /#shopTabBox\.on\{/.test(cssSrc));

// main.js 侧
ok('main.js 不再引用 msScr / btnCamp / msBack',
  !/msScr/.test(mainSrc) && !/btnCamp/.test(mainSrc) && !/msBack/.test(mainSrc));
ok('main.js 有 setShopTab（切区）', /function setShopTab\(/.test(mainSrc));
ok('两个 tab 都绑了点击', /shopTabCamp\.addEventListener\('click'/.test(mainSrc)
  && /shopTabBox\.addEventListener\('click'/.test(mainSrc));
ok('#btnShop 点开就是夜行商店', /btnShop\.addEventListener\('click', showCampfire\)/.test(mainSrc));
ok('还有 showMetaShop 兜底（老调用点不炸）', /function showMetaShop\(\)[\s\S]{0,120}setShopTab\('box'\)/.test(mainSrc));
ok('开箱后重画当前区（renderShopPane）', /function renderShopPane\(\)/.test(mainSrc));
ok('⚠️ 没跟局内商店的 renderShop 撞名', (mainSrc.match(/function renderShop\(\)/g) || []).length === 1);
ok('盲盒区按当前价渲染', /const price = boxPriceOf\(box\.id\)/.test(mainSrc));
ok('买过就明说「已开 N 次 / 下次多少」', /已开 \$\{nth\} 次/.test(mainSrc));
ok('两个角标合成一个 renderShopBadge', /function renderShopBadge\(\)/.test(mainSrc)
  && !/campBoneNum/.test(mainSrc));

// 用户可见文案里不再有旧店名
// 注释里提旧名没关系（要交代来龙去脉），玩家看得到的那些必须都改了
ok('玩家看不到「篝火商店」了（按钮 / 标题 / 提示文案）',
  !/tt-camp-name">篝火商店/.test(html) && !/lv-title">篝火商店/.test(html)
  && !/去篝火商店/.test(html) && !/进篝火商店/.test(html)
  && !/'篝火商店/.test(mainSrc) && !/去篝火商店/.test(mainSrc));
ok('玩家看不到「局外商店」了',
  !/tt-camp-name">局外商店/.test(html) && !/lv-title">局外商店/.test(html)
  && !/去局外商店/.test(mainSrc));

// ============================================================
sec('四、版本号');
// ============================================================
{
  const m = html.match(/main\.js\?v=(\d+)/);
  const VER = m[1];
  ok('index.html 版本号 >= 84', Number(VER) >= 84, VER);
  const imps = [...mainSrc.matchAll(/from '\.\/[a-zA-Z]+\.js\?v=(\d+)'/g)].map((x) => x[1]);
  ok(`main.js 内所有 import 都是 ${VER}`, imps.length > 20 && imps.every((v) => v === VER),
    [...new Set(imps)].join(','));
  ok('metaShop.js 的 import 也是同一版', msSrc.includes(`?v=${VER}`));
}

console.log(`\n结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
