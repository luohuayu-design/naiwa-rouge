// 第 104 块契约（纯 Node，不起浏览器）
// 用户三条：
//   ① 云端短码存档不要了（不做，代码里本来就没有 —— 只钉住别偷偷长回来）
//   ② 「导出文件和分享文件一个效果」→ 删掉「分享文件」
//   ③ 导出文件之后跳到 QQ 浏览器却没有自动下载 → 重写导出那条路
//
// 第 ③ 条的两个根因（都在真浏览器里验证）：
//   a. 老文件名带中文（「蛙步夜行-存档-20261027-2215.json」），安卓下载管理器对
//      URL 编码后的中文名处理不一致，最坏表现是「点了完全没反应」；
//   b. 老链接是 blob: —— 微信 / QQ 内嵌内核会把链接**移交给 QQ 浏览器**去开，
//      而 blob: 只活在发起它的页面进程里，移交之后就是死链：跳过去了但不下载。
//      所以会被移交的内核改用自包含的 data: URL。
// 跑法：node .tmp-block104-test.mjs（cwd = naiwa-rouge）
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
// 注释里允许出现「分享文件」（要写清楚为什么删），所以查文案时先把 HTML 注释剥掉
const htmlNoComment = htmlSrc.replace(/<!--[\s\S]*?-->/g, '');

// ============================================================
sec('① 旧的「分享文件」按钮不留；第 134 块改用系统分享面板');
// ============================================================
{
  ok(!/ioShareFile/.test(htmlSrc), 'index.html 里没有 id="ioShareFile"');
  ok(!/分享文件/.test(htmlNoComment), 'index.html 的可见文案里没有「分享文件」（注释里保留了删掉的理由）');
  ok(!/shareFree|SHARE_TITLE|SHARE_TEXT/.test(mainSrc), '第 104 块那套自建分享函数与文案没长回来');
  // 第 134 块（用户：「A 要做」）：手机内嵌内核里 <a download> 会被移交给下载器，
  // 只有 navigator.share + File 是系统给的正式通道 —— 这条必须有。
  ok(/navigator\.share/.test(mainSrc) && /navigator\.canShare/.test(mainSrc),
    '走 navigator.share + navigator.canShare（系统分享面板）');
  ok(/new File\(\[json\], name, \{ type: 'text\/plain' \}\)/.test(mainSrc),
    '把存档构造为 File 交给系统（第 135 块起用 text/plain / .txt）');
  ok(!/ioShareFile/.test(mainSrc), 'main.js 里也没有分享按钮的残骸');
}

// ============================================================
sec('② 存档区五颗按钮，提示语里有分段复制的入口');
// ============================================================
{
  const ioBox = htmlSrc.slice(htmlSrc.indexOf('class="set-io-btns"'), htmlSrc.indexOf('</div>', htmlSrc.indexOf('class="set-io-btns"')));
  const btns = [...ioBox.matchAll(/<button[^>]*id="(io[A-Za-z]+)"/g)].map((m) => m[1]);
  ok(JSON.stringify(btns) === JSON.stringify(['ioExportFile', 'ioExportCode', 'ioExportParts', 'ioImportFile', 'ioImportCode']),
    '五颗按钮、顺序 = 导出 / 复制码 / 分段复制 / 导入 / 粘贴码', btns.join(','));
  ok(/id="ioExportFile"[^>]*>导出文件</.test(ioBox), '「导出文件」文案没变');
  ok(/id="ioExportCode"[^>]*>复制存档码</.test(ioBox), '「复制存档码」文案没变（第 99 块定的）');
  ok(/id="ioExportParts"[^>]*>分段复制</.test(ioBox), '第 134 块新增「分段复制」');
  const ioAll = htmlSrc.slice(htmlSrc.indexOf('class="set-io"'), htmlSrc.indexOf('set-foot'));
  ok(/分段/.test(ioAll), '提示语里说明了「分段复制」的用途');
}

// ============================================================
sec('③ 手动保存兜底行：DOM / 默认隐藏 / CSS 都就位');
// ============================================================
{
  ok(/<div class="set-io-save" id="ioSaveRow" hidden>/.test(htmlSrc), '#ioSaveRow 存在且默认 hidden');
  ok(/<a class="set-io-btn mini" id="ioSaveLink" download>/.test(htmlSrc),
    '#ioSaveLink 是 <a download>（不是 button —— 按钮没法长按另存）');
  ok(/没看到下载/.test(htmlSrc), '兜底行有「没看到下载？」的引导字');
  ok(/\.set-io-save\[hidden\]\{display:none\}/.test(cssSrc), 'CSS 里有 .set-io-save[hidden]{display:none}');
  ok(/\.set-io-save a\{[^}]*text-decoration:none/.test(cssSrc), '链接去掉了下划线（和旁边按钮一个样）');
  ok(/getElementById\('ioSaveRow'\)/.test(mainSrc) && /getElementById\('ioSaveLink'\)/.test(mainSrc),
    'main.js 拿到了这两个元素');
}

// ============================================================
sec('④ 文件名：纯 ASCII（中文名只留在 toast 里）');
// ============================================================
{
  const fnSrc = (mainSrc.match(/function asciiFileName\(now\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok(!!fnSrc, '有 asciiFileName() 函数');
  let name = '';
  try {
    const fn = new Function('return (' + fnSrc + ')')();
    name = fn(new Date(2026, 9, 25, 9, 7));
  } catch (e) { name = 'ERR:' + e.message; }
  ok(name === 'wabu-save-20261025-0907.txt', `文件名形如 wabu-save-YYYYMMDD-HHMM.txt（实际 ${name}）`);
  ok(!/[^\x20-\x7e]/.test(name), '文件名全部是可打印 ASCII', JSON.stringify(name));
  ok(/\d{8}-\d{4}/.test(name), '日期与时分都在（同一个小时导出两次不会撞名到不可分辨）');
  // toast 里仍然给人看中文名
  ok(/showToast\('存档已导出', `\$\{saveIO\.fileName\(\)\}/.test(mainSrc),
    'toast 里显示的仍是中文名（saveIO.fileName()）—— 只改落盘名，不改给人看的字');
  ok(!/a\.download = saveIO\.fileName\(\)/.test(mainSrc), '没有直接把中文名塞进 a.download');
}

// ============================================================
sec('⑤ 会被「移交」的内核走 data: URL（blob: 跨进程就是死链）');
// ============================================================
{
  const m = mainSrc.match(/const HANDOFF_UA = \/(.+?)\/([a-z]*);/);
  ok(!!m, '有 HANDOFF_UA 正则');
  let re = null;
  let reErr = '';
  try { re = new RegExp(m[1], m[2]); } catch (err) { re = null; reErr = err.message; }
  ok(!!re, '正则能被重新构造', reErr);

  const cases = [
    ['微信 iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002832) NetType/WIFI Language/zh_CN', true],
    ['微信安卓', 'Mozilla/5.0 (Linux; Android 13; PGT-AN10 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/111.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.42.2460(0x28002A3B) WeChat/arm64', true],
    ['QQ 浏览器', 'Mozilla/5.0 (Linux; U; Android 12; zh-cn; Redmi K50) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.0.0 Mobile Safari/537.36 MQQBrowser/14.7', true],
    ['QQ 客户端', 'Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.211103.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/92.0.4515.105 Mobile Safari/537.36 QQ/8.9.63.11155', true],
    ['X5 内核', 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.116 Mobile Safari/537.36 TBS/045130 X5/1.0', true],
    ['安卓原生 Chrome', 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', false],
    ['iOS Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', false],
    ['桌面 Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', false],
  ];
  if (re) {
    for (const [name, ua, want] of cases) {
      const got = re.test(ua);
      ok(got === want, `${name} → ${want ? '走 data: URL' : '正常 blob: 下载'}`, `got=${got}`);
    }
  }

  ok(/function makeHref\(text, forceData\)/.test(mainSrc), '有 makeHref(text, forceData)');
  ok(/data:text\/plain;charset=utf-8,' \+ encodeURIComponent\(text\)/.test(mainSrc),
    'data: URL 用 text/plain + charset=utf-8（第 135 块按用户要求改成 TXT 口径）');
  ok(/return URL\.createObjectURL\(new Blob\(\[text\], \{ type: 'text\/plain' \}\)\)/.test(mainSrc),
    '不会被移交的内核仍走 blob:（大存档不吃 URL 长度）');
  ok(/ioSaveLink\.href = makeHref\(json, true\)/.test(mainSrc),
    '兜底链接**永远**用 data:（长按另存 / 跨 App 都不会死）');
  ok(/if \((url|href)\.startsWith\('blob:'\)\) setTimeout/.test(mainSrc),
    '只回收 blob: 的 objectURL（data: 的要留着给兜底行用）');
}

// ============================================================
sec('⑥ 导出流程：点一下必然有反馈，绝不停在「什么都没发生」');
// ============================================================
{
  const fn = (mainSrc.match(/async function exportFile\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok(!!fn, '有 async exportFile()');
  ok(/await shareSaveFile\(json, name\)/.test(fn), '先试系统分享面板');
  ok(/if \(shared === 'cancel'\) return 'cancel'/.test(fn), '玩家取消时不再硬撑下载');
  ok(/document\.body\.appendChild\(a\)/.test(fn), 'a 先挂进文档再 click（Firefox 要求）');
  ok(/a\.rel = 'noopener'/.test(fn), '带 rel=noopener');
  ok(/a\.remove\(\)/.test(fn), '点完把 a 摘掉');
  ok(/if \(ioSaveLink\)/.test(fn) && /ioSaveRow\.hidden = false/.test(fn), '点完把兜底行亮出来');
  ok(/showToast\('存档已导出'/.test(fn), '成功有 toast');
  const btn = (mainSrc.match(/getElementById\('ioExportFile'\)\.addEventListener\('click',[\s\S]{0,400}?\n  \}\);/) || [''])[0];
  ok(!!btn, '导出按钮有 handler');
  ok(/await exportFile\(\)/.test(btn), 'handler 等 async exportFile() 的结果');
  ok(/这个浏览器不让下载/.test(btn), '失败时给出去路（分段复制 / 复制存档码）而不是「分享文件」');
  ok(!/分享文件/.test(btn), '失败提示里不出现「分享文件」');
  // 「复制存档码」那条失败时也别再把人引向已删除的按钮
  const codeBtn = (mainSrc.match(/getElementById\('ioExportCode'\)\.addEventListener[\s\S]{0,1400}?\n  \}\);/) || [''])[0];
  ok(!/分享文件/.test(codeBtn), '「复制存档码」的兜底提示里也没有「分享文件」了');
}

// ============================================================
sec('⑨ 分段复制：每段 < 6000 字，拼回去一字不差');
// ============================================================
{
  const maxM = mainSrc.match(/const PART_MAX = (\d+);/);
  const max = maxM ? Number(maxM[1]) : 0;
  ok(!!maxM, '有 PART_MAX 常量');
  ok(max > 0 && max < 6000, `每段上限 ${max || '—'} 字（用户要求低于 6000，留余量）`);

  const fnSrc = (mainSrc.match(/function splitParts\(code\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok(!!fnSrc, '有 splitParts(code)');
  let pieces = [];
  let why = '';
  try {
    const make = new Function('PART_MAX', 'return ' + fnSrc);
    const split = make(max);
    const sample = 'NWSZ1:' + 'abcdefghij0123456789'.repeat(1000);   // 16007 字
    pieces = split(sample);
    if (pieces.join('') !== sample) why = '拼回去不一致';
  } catch (e) { why = 'ERR:' + e.message; }
  ok(pieces.length > 0 && why === '', '切开的段拼回去与原文一字不差', why);
  ok(pieces.length === 5, `20006 字 → ${pieces.length} 段（每段 ${max}）`);
  ok(Math.max(...pieces.map((p) => p.length)) <= max, `最长的一段 ${Math.max(...pieces.map((p) => p.length))} 字 ≤ ${max}`);
  ok(pieces[0].startsWith('NWSZ1:'), '第 1 段带着 NWSZ1: 前缀（导入靠它认出是存档码）');

  ok(/id="ioExportParts"[^>]*>分段复制</.test(htmlSrc), '设置页有「分段复制」按钮');
  ok(/ioExportParts\.addEventListener\('click'/.test(mainSrc), '按钮有 handler');
  ok(/getElementById\('partsAsk'\)/.test(mainSrc) && /getElementById\('partsList'\)/.test(mainSrc),
    'main.js 拿到了弹窗与列表');
  ok(/const ok = await copyText\(seg\)/.test(mainSrc), '每段用 copyText 写剪贴板');
  ok(/id="partsClose"/.test(htmlSrc) && /id="partsSub"/.test(htmlSrc), '弹窗有关闭按钮 / 段数说明');
  ok(/readOnly = true/.test(mainSrc), '每段还配只读框（长按兜底）');

  // 「讲清用法」是用户明确要求的：弹窗里必须说清顺序、别改字、恢复时粘回同一个框
  const how = (htmlSrc.match(/id="partsHow"[^>]*>([\s\S]*?)<\/div>/) || [, ''])[1];
  ok(/粘贴存档码/.test(how), '用法里说明恢复时走「粘贴存档码」');
  ok(/NWSZ1:/.test(how), '用法里点名第 1 段开头的 NWSZ1: 不能动');
  ok(/顺序/.test(how), '用法里说明段与段顺序无关');
  ok(/备忘录|文件传输助手/.test(how), '用法里给出了存到哪儿（备忘录 / 文件传输助手）');

  ok(/\.parts-list\{/.test(cssSrc) && /\.parts-row\{/.test(cssSrc) && /\.parts-copy\{/.test(cssSrc),
    '分段行的样式都在');
  ok(/#partsAsk\{z-index:40\}/.test(cssSrc), '弹窗层级抬到设置页之上');
}

// ============================================================
sec('⑩ 导出 .txt / 导入自动识别格式（第 135 块，用户要求）');
// ============================================================
{
  ok(/accept="\.json,\.txt,application\/json,text\/plain"/.test(htmlSrc),
    '文件选择器也认 .txt（老的 .json 备份照样能选）');
  const imp = (mainSrc.match(/function importFromText\(txt\) \{[\s\S]*?\n  \}/) || [''])[0];
  ok(!!imp, '有 importFromText()');
  ok(/saveIO\.parseAny\(txt\)/.test(imp), '导入走 parseAny：JSON / NWSZ1: 码全部自动识别');

  // 真跑一遍：同一份存档，JSON 全文与存档码两条都要能进
  const io = await import('./js/saveIO.js');
  const payload = {
    app: 'naiwa-rouge', kind: 'save', ver: 1,
    at: '2026-10-25T09:07:00Z', game: '151',
    data: { naiwa_rouge_profile_v1: JSON.stringify({ bones: 1234, camp: { a: 1 }, ach: {} }) },
  };
  const jr = io.parseAny(JSON.stringify(payload, null, 2));
  ok(jr.ok && /1234/.test(jr.payload.data.naiwa_rouge_profile_v1), '导出的 .txt（正文是 JSON）能被导入');
  const code = io.payloadCode(payload);
  const cr = io.parseAny(code);
  ok(cr.ok && /1234/.test(cr.payload.data.naiwa_rouge_profile_v1), 'NWSZ1: 存档码存成 txt 也能导入');
  const cr2 = io.parseAny(code.slice(0, 100) + '\n\n' + code.slice(100) + '\n');
  ok(cr2.ok, '折行 / 分段拼接的 txt 也能导入（空格换行会被吃掉）');
}

// ============================================================
sec('⑦ 云端短码存档：不做，也不许偷偷长回来');
// ============================================================
{
  const all = mainSrc + htmlSrc + readdirSync(new URL('./js/', import.meta.url))
    .filter((f) => f.endsWith('.js')).map((f) => read('./js/' + f)).join('\n');
  // 「短码」这个词项目里另有含义（礼包码 / 每日种子），只查云端存档专属的标识
  ok(!/云端存档|云存档|shortSaveCode|uploadSave|saveShortCode|supabase|firebase/i.test(all),
    '没有任何云端存档 / 后端上传的痕迹');
  ok(!/fetch\('https?:\/\/(?!luohuayu-design)/.test(mainSrc), '运行时不会往外发存档（除站点自身资源）');
}

// ============================================================
sec('⑧ 版本号：全站一致');
// ============================================================
{
  // ⚠️ 别把版本号写死在这里：每发一次版就要回来改一行，第 105 块就被它拦过一次
  // （`?v=118` 硬编码 → 全站 bump 到 119 后这条立刻假红）。
  // 真正要钉的是「有版本号」+「全站一致」，具体数字由 index.html 说了算。
  ok(/^\d+$/.test(VER) && Number(VER) > 0, `index.html 带版本号（v=${VER}）`);
  const bad = [];
  for (const f of readdirSync(new URL('./js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    for (const m of read('./js/' + f).matchAll(/\?v=(\d+)/g)) if (m[1] !== VER) bad.push(f + ' → ' + m[1]);
  }
  ok(bad.length === 0, 'js 里所有 ?v= 都是同一个版本', bad.slice(0, 3).join(' | '));
}

console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
process.exit(fail ? 1 : 0);
