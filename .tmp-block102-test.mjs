// 第 102 块契约（纯 Node，不起浏览器）
// 用户：在公告里添加 QQ 群号 1132440548（支持一键复制）。
//   · 公告弹窗（#noticeOv）加一行「👥 QQ 群」+ 数字 + 📋 复制按钮，样式复用 .cp-row
//   · 「宣传有礼」弹层（#promoOv）里也有同一套联系方式块，一起加上保持两处信息一致
//   · 复制走现成的 delegation（.notice-copy + data-copy），不另写逻辑
//   · 公告/宣传有礼都有「日期 + 版本」本机记录，改内容必须把 NOTICE_VER / PROMO_VER +1，
//     否则今天勾过「今日不再弹出」的老玩家永远看不到新增的群号
// 跑法：node .tmp-block102-test.mjs（cwd = naiwa-rouge）
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const htmlSrc = read('./index.html');
const cssSrc = read('./style.css');
const mainSrc = read('./js/main.js');
const VER = (htmlSrc.match(/js\/main\.js\?v=(\d+)/) || [, ''])[1];

const GROUP = '1132440548';

// 切块：按注释锚点／相邻弹层的 id 取片段
function block(startPat, endPat) {
  const i = htmlSrc.search(startPat);
  if (i < 0) return '';
  const j = htmlSrc.indexOf(endPat, i);
  return htmlSrc.slice(i, j < 0 ? i + 4000 : j);
}
const noticeHtml = block(/<div id="noticeOv"/, '<div id="signOv"');
const promoHtml = block(/<div id="promoOv"/, '<div id="packGet"');

// ============================================================
sec('① 公告里有群号，且挂着一键复制');
// ============================================================
ok(noticeHtml.length > 0, '切到了 #noticeOv 区块', String(noticeHtml.length));
ok(noticeHtml.includes(`data-copy="${GROUP}"`), '公告里有 data-copy="' + GROUP + '" 的复制按钮');
ok(new RegExp(`<span class="cp-val">${GROUP}</span>`).test(noticeHtml), '群号写在同一行的 .cp-val 里（一眼能看到，不用点）');
ok(/QQ 群/.test(noticeHtml), '标签文案写了「QQ 群」');
// 标签必须能跟「本人 QQ」「本站网址」一样单行放得下（太长会把群号挤到第三行，几行高矮不齐）
{
  const label = (noticeHtml.match(/<span class="cp-label">([^<]*QQ 群[^<]*)<\/span>/) || [, ''])[1];
  ok(label.length <= 16 && !/[（(]/.test(label), '标签够短（能单行放下，不把群号挤到下一行）', `${label} · ${label.length} 字符`);
}
ok((noticeHtml.match(/class="notice-copy"/g) || []).length === 3,
  '公告里共 3 个复制按钮（本人 QQ / QQ 群 / 本站网址）',
  String((noticeHtml.match(/class="notice-copy"/g) || []).length));
ok((noticeHtml.match(/class="cp-row"/g) || []).length === 3, '三行联系方式结构一致（.cp-row）');

// ============================================================
sec('② 宣传有礼弹层同步（同一套联系方式，两处不许打架）');
// ============================================================
ok(promoHtml.length > 0, '切到了 #promoOv 区块', String(promoHtml.length));
ok(promoHtml.includes(`data-copy="${GROUP}"`), '宣传有礼里也有群号复制按钮');
ok(new RegExp(`<span class="cp-val">${GROUP}</span>`).test(promoHtml), '宣传有礼里的群号同样直接显示');
ok((promoHtml.match(/class="cp-row"/g) || []).length === 3, '宣传有礼里也是三行联系方式');

// 全页只许这两处，避免复制粘贴出一堆重复行
ok((htmlSrc.match(new RegExp(GROUP, 'g')) || []).length === 4,
  '全页群号共 4 处 = 2 个 .cp-val + 2 个 data-copy（没有多余拷贝）',
  String((htmlSrc.match(new RegExp(GROUP, 'g')) || []).length));

// ============================================================
sec('③ 复制逻辑复用现成的 delegation（不另起一套）');
// ============================================================
ok(/noticeOv\.addEventListener\('click', async \(e\) => \{[\s\S]{0,200}?closest\('\.notice-copy'\)/.test(mainSrc),
  '公告弹窗上有 .notice-copy 的事件委托');
ok(/promoOv\.addEventListener\('click', async \(e\) => \{[\s\S]{0,200}?closest\('\.notice-copy'\)/.test(mainSrc),
  '宣传有礼弹窗上也有同样的委托');
ok(/copyText\(b\.dataset\.copy \|\| ''\)/.test(mainSrc), '复制取的是按钮上的 data-copy');
ok((mainSrc.match(/copyText\(/g) || []).length >= 2, 'copyText 有 clipboard + execCommand 兜底（老 WebView 也能复制）');
ok(/function copyText/.test(mainSrc) && /execCommand\('copy'\)/.test(mainSrc), '兜底路径真的存在');

// ============================================================
sec('④ 版本号 +1（否则今天勾过「不再弹出」的人看不到新群号）');
// ============================================================
const nVer = (mainSrc.match(/const NOTICE_VER = '(\d+)'/) || [, ''])[1];
const pVer = (mainSrc.match(/const PROMO_VER = '(\d+)'/) || [, ''])[1];
ok(nVer === '3', 'NOTICE_VER = 3（v3 加了群号）', nVer);
ok(pVer === '2', 'PROMO_VER = 2（v2 加了群号）', pVer);
ok(/NOTICE_VER/.test(mainSrc) && /noticeToday\(\)\}\|\$\{NOTICE_VER\}/.test(mainSrc),
  '公告的「日期 + 版本」还是同一个键（换版 = 重新弹一次）');
ok(/noticeHideToday/.test(mainSrc) && /noticeHideToday\.checked/.test(mainSrc),
  '「今日内不再弹出」的勾选逻辑没被改动');

// ============================================================
sec('⑤ 样式没新加一套（复用 .cp-row / .cp-val / .notice-copy）');
// ============================================================
ok(/\.cp-row\{/.test(cssSrc), '.cp-row 样式存在');
ok(/\.cp-val\{/.test(cssSrc), '.cp-val 样式存在');
ok(/\.notice-copy\{/.test(cssSrc), '.notice-copy 样式存在');
ok(!/cp-row-group|qq-group-row|notice-group/.test(cssSrc), '没有为群号新造一个样式类');

// ============================================================
sec('⑥ 版本号：全站同一版（从 index.html 读，不写死）');
// ============================================================
ok(/^\d+$/.test(VER), 'index.html 里读得到 main.js?v=N', VER);
{
  const bad = [];
  for (const f of readdirSync(new URL('./js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    for (const m of read('./js/' + f).matchAll(/from\s+'\.\/[a-zA-Z0-9_.-]+\.js\?v=(\d+)'/g)) {
      if (m[1] !== VER) bad.push(`${f}:${m[1]}`);
    }
  }
  ok(bad.length === 0, `js/ 里的 import 版本号全是 v=${VER}`, bad.join(','));
  const htmlVers = [...htmlSrc.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  ok(htmlVers.every((v) => v === VER), `index.html 的 ${htmlVers.length} 处版本号统一`, [...new Set(htmlVers)].join(','));
}

console.log(`\n通过 ${pass} / ${pass + fail}`);
if (fails.length) { console.log('失败项：\n  ' + fails.join('\n  ')); process.exitCode = 1; }
