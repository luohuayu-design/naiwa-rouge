// 第 103 块契约（纯 Node，不起浏览器）
// 用户 bug：「兑换之后下面的兑换记录没有显示，（建群大典）」
//
// 根因（真浏览器复现过，见 .tmp-103-diag.js）：
//   renderGiftLog() 把 profile.gifts 按兑换时间**升序**排完再 slice(0, 8) ——
//   取的是「最早兑的 8 个」。玩家本机已兑满 8 个以后，再兑任何码：
//   记录确实写进了档案（标题「本机已兑换 9 个礼包」也在涨），
//   但下面画出来的永远是那 8 条最老的 → 看起来就是「这个码没兑上，记录没有」。
//   单条 / 少量记录的场景一直是好的（第 101 块 CDP 就是在全新档验的，所以没抓到）。
//
// 修法：排序改时间**降序**，取前 N，最新兑换永远在第一行；
//   超过 N 条时标题补一句「显示最近 N 个」，免得玩家以为老记录被吞了。
//
// 跑法：node .tmp-block103-test.mjs（cwd = naiwa-rouge）
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
// ⚠️ 本套签名是 ok(cond, name, extra) —— 和 block59/64/102 一致；
//    .tmp-102-cdp.js 里那套是 ok(name, cond, extra)，别串味。
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const htmlSrc = read('./index.html');
const mainSrc = read('./js/main.js');
const VER = (htmlSrc.match(/js\/main\.js\?v=(\d+)/) || [, ''])[1];

// 抠 renderGiftLog 整段（到下一个 function 定义为止）
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('\n  function ', i + 10);
  return src.slice(i, j < 0 ? src.length : j);
}
const render = fnBody(mainSrc, 'renderGiftLog');

// ============================================================
sec('① renderGiftLog 必须取「最新」的那几条');
// ============================================================
ok(render.length > 300, '抠到了 renderGiftLog 本体', String(render.length));
ok(/const GIFT_LOG_SHOW = (\d+);/.test(mainSrc), '有显式上限常量 GIFT_LOG_SHOW');
ok((mainSrc.match(/const GIFT_LOG_SHOW = (\d+);/) || [, ''])[1] === '8',
  '上限是 8 条', (mainSrc.match(/const GIFT_LOG_SHOW = (\d+);/) || [, ''])[1]);
ok(/\.sort\(\(a, b\) => b\.at - a\.at\)/.test(render),
  '按时间**降序**排（最新在前）—— 这是本 bug 的正解');
ok(!/\.sort\(\(a, b\) => a\.at - b\.at\)/.test(render),
  '没有残留升序排序（老的错误写法）');
ok(/slice\(0, GIFT_LOG_SHOW\)/.test(render), '截断用的是常量，不是裸写 8');
ok(!/slice\(0, 8\)/.test(render), '没有残留 slice(0, 8) 这种裸数字');

// ============================================================
sec('② 标题要说清「只画了最近几条」');
// ============================================================
ok(/rows\.length > GIFT_LOG_SHOW/.test(render), '超过上限时走单独分支');
ok(/显示最近 \$\{GIFT_LOG_SHOW\} 个/.test(render), '标题里写明「显示最近 N 个」');
ok(/本机已兑换 \$\{rows\.length\} 个礼包/.test(render), '标题照旧报总数');
ok(render.indexOf('显示最近') > render.indexOf('本机已兑换'), '总数在前、说明在后（读起来通顺）');

// ============================================================
sec('③ 语义复算：9 条记录时最新那条必须在画出来的 8 条里');
//     （纯数学复算，不依赖 DOM —— 把 renderGiftLog 的排序/截断规则原样搬过来）
// ============================================================
const SHOW = Number((mainSrc.match(/const GIFT_LOG_SHOW = (\d+);/) || [, '8'])[1]);
function visible(records) {
  return records
    .map((r) => ({ ...r }))
    .sort((a, b) => b.at - a.at)
    .slice(0, SHOW);
}
const t0 = 1793109000000;
const mk = (n) => Array.from({ length: n }, (_, i) => ({ h: 'h' + i, at: t0 + i * 1000, label: '第' + (i + 1) + '个' }));

const case9 = mk(9);
const vis9 = visible(case9);
ok(vis9.length === 8, '9 条记录只画 8 行', String(vis9.length));
ok(vis9[0].h === 'h8', '第一行就是**最新**那条（第 9 个）', vis9[0].h);
ok(vis9.some((r) => r.h === 'h8'), '第 9 个（新兑换的）在可见列表里');
ok(!vis9.some((r) => r.h === 'h0'), '被挤掉的是**最早**那条（第 1 个），不是最新那条');
ok(vis9.map((r) => r.at).every((v, i, arr) => i === 0 || arr[i - 1] >= v), '可见行严格按时间从新到旧');

const case8 = mk(8);
ok(visible(case8).length === 8, '正好 8 条时全都画出来');
ok(case8.length <= SHOW, '正好 8 条时不触发「显示最近」分支');

const case11 = mk(11);
const vis11 = visible(case11);
ok(vis11.length === 8, '11 条也只画 8 行');
ok(vis11[0].h === 'h10', '第一行仍是最新那条', vis11[0].h);
ok(vis11.map((r) => r.h).join(',') === 'h10,h9,h8,h7,h6,h5,h4,h3', '取的是最近 8 个（h3~h10）', vis11.map((r) => r.h).join(','));

// ============================================================
sec('④ 空档 / 重复兑换的既有行为没被带坏');
// ============================================================
ok(/if \(!rows\.length\) \{ giftLogBox\.classList\.remove\('on'\); return; \}/.test(render),
  '0 条时列表整块隐藏（不留一个空框）');
const doRedeem = fnBody(mainSrc, 'doRedeem');
ok(/if \(giftRedeemed\(hit\.hash\)\)/.test(doRedeem), '重复兑换还在进档案之前就被拦');
ok(doRedeem.indexOf('giftRedeemed(hit.hash)') < doRedeem.indexOf('addBones(hit.bones)'),
  '「用过了」的判断在加骨币之前（不会白给钱）');
ok(doRedeem.indexOf('markGift(hit.hash)') > doRedeem.indexOf('addBones(hit.bones)'),
  '先加骨币再记账（顺序和改动前一致）');
ok(/renderGiftLog\(\);/.test(doRedeem), '兑换成功之后立刻重画列表');

const profSrc = read('./js/profile.js');
ok(/if \(g\[hash\]\) return g\[hash\];/.test(profSrc),
  'markGift 对已存在的 hash 返回旧时间戳，不覆盖（顺序不会乱跳）');

// ============================================================
sec('⑤ 版本号全站一致');
// ============================================================
ok(/^\d+$/.test(VER), 'index.html 里的版本号读得到', VER);
const bad = [];
for (const f of readdirSync(new URL('./js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
  const src = read('./js/' + f);
  const re = /from\s+'([^']*?)\?v=(\d+)'/g;
  let m;
  while ((m = re.exec(src))) if (m[2] !== VER) bad.push(f + ' -> ' + m[2]);
}
ok(bad.length === 0, `js/*.js 里的 import 版本号全是 v${VER}`, bad.slice(0, 4).join(', '));
ok(new RegExp('js/main\\.js\\?v=' + VER).test(htmlSrc), 'index.html 引自己的 main.js 也是同一版');

// ============================================================
console.log('\n-------------------------------');
if (fail) {
  console.log(`通过 ${pass} / 失败 ${fail}`);
  for (const f of fails) console.log('  · ' + f);
  process.exit(1);
} else {
  console.log(`通过 ${pass} / 失败 0`);
}
