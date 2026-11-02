// 第 147 块契约（纯 Node，不起浏览器）
// 用户 2026-11-02：公告的全部内容（QQ 号 / QQ 群 / 本站网址）全部删去，改成「每次更新的内容」。
//   · #noticeOv 正文换成更新日志（.nt-rel + .nt-ver），不再有任何联系方式与复制按钮
//   · 公告弹窗上那套 .notice-copy 委托一并删掉；copyText 保留（宣传有礼还在用）
//   · 改内容必须把 NOTICE_VER +1，否则今天勾过「今日不再弹出」的老玩家看不到新版
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

// 切块：按注释锚点／相邻弹层的 id 取片段
function block(startPat, endPat) {
  const i = htmlSrc.search(startPat);
  if (i < 0) return '';
  const j = htmlSrc.indexOf(endPat, i);
  return htmlSrc.slice(i, j < 0 ? i + 4000 : j);
}
const noticeHtml = block(/<div id="noticeOv"/, '<div id="signOv"');

// ============================================================
sec('① 公告里不再有任何联系方式');
// ============================================================
ok(noticeHtml.length > 0, '切到了 #noticeOv 区块', String(noticeHtml.length));
ok(!/3829845261/.test(noticeHtml), '没有本人 QQ 号');
ok(!/1132440548/.test(noticeHtml), '没有 QQ 群号');
ok(!/github\.io/.test(noticeHtml), '没有本站网址');
ok(!/data-copy=|class="notice-copy"|class="cp-row"/.test(noticeHtml), '复制按钮 / 联系方式行全部移除');
ok(!/QQ|群号|网址/.test(noticeHtml), '正文里不再出现 QQ / 群 / 网址字样');

// ============================================================
sec('② 公告正文 = 每次更新的内容');
// ============================================================
ok(/notice-hd">📢 更新日志/.test(noticeHtml), '标题改成「更新日志」');
ok((noticeHtml.match(/class="nt-rel"/g) || []).length >= 3, '至少三条版本更新',
  String((noticeHtml.match(/class="nt-rel"/g) || []).length));
ok((noticeHtml.match(/class="nt-ver"/g) || []).length >= 3, '每条都带版本号');
ok(/35%/.test(noticeHtml), '写了防秒护栏这一版');
ok(/鸿蒙|荣耀/.test(noticeHtml), '写了鸿蒙 / 荣耀错位修复这一版');
ok(/奶蛙|改名/.test(noticeHtml), '写了改名换图标这一版');
ok(/nb-note/.test(noticeHtml) && /存档备份/.test(noticeHtml), '保留存档提示（不是联系方式）');

// ============================================================
sec('③ 公告的复制委托已删，copyText 仍给宣传有礼用');
// ============================================================
ok(!/noticeOv\.addEventListener\('click'/.test(mainSrc), '公告弹窗不再绑 .notice-copy 委托');
ok(/promoOv\.addEventListener\('click', async \(e\) => \{[\s\S]{0,200}?closest\('\.notice-copy'\)/.test(mainSrc),
  '宣传有礼仍保留复制委托（另一处内容没动）');
ok(/function copyText/.test(mainSrc) && /execCommand\('copy'\)/.test(mainSrc), 'copyText 与兜底路径都还在');

// ============================================================
sec('④ 版本号 +1（否则今天勾过「不再弹出」的人看不到新内容）');
// ============================================================
const nVer = (mainSrc.match(/const NOTICE_VER = '(\d+)'/) || [, ''])[1];
ok(nVer === '4', 'NOTICE_VER = 4（正文改成更新日志）', nVer);
ok(/noticeToday\(\)\}\|\$\{NOTICE_VER\}/.test(mainSrc), '公告的「日期 + 版本」还是同一个键（换版 = 重新弹一次）');
ok(/noticeHideToday/.test(mainSrc) && /noticeHideToday\.checked/.test(mainSrc),
  '「今日内不再弹出」的勾选逻辑没被改动');

// ============================================================
sec('⑤ 样式');
// ============================================================
ok(/\.notice-bd \.nt-rel\{/.test(cssSrc), '更新日志条目样式在');
ok(/\.notice-bd \.nt-ver\{/.test(cssSrc), '版本号样式在');
ok(/\.cp-row\{/.test(cssSrc), '宣传有礼在用的 .cp-row 没被误删');

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
