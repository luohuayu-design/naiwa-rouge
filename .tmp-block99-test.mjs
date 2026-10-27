// 第 99 块契约（纯 Node，不起浏览器）
// 用户两条：
//  ① 「点分享文件直接弹这台设备不支持」+「点存档码分段没反应（其实是被设置页压住了），
//      而且足足几十段，还是直接删掉这个功能吧」
//     → 分享：**不用 canShare 当门闩**（手机上大量误判），三级回退 files → text → 下载
//     → 存档码：**分段列表整体删除**，回到「一键复制整串」
//  ② 「设置里面的速度感是不是默认打开更好一些」
//     → 新档默认本来就是 true，问题是**老档里存着 false**；按 uiRev 世代做一次性迁移
// 跑法：node .tmp-block99-test.mjs（cwd = naiwa-rouge）
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');
const eq = (a, b, name) => ok(a === b, name, `${a} !== ${b}`);

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ioPath = './js/saveIO.js' + (read('./index.html').match(/saveIO\.js\?v=(\d+)/) || [, ''])[1];
const mainSrc = read('./js/main.js');
const htmlSrc = read('./index.html');
const cssSrc = read('./style.css');
const profSrc = read('./js/profile.js');
const ioVer = (read('./index.html').match(/js\/saveIO\.js\?v=(\d+)/) || [, ''])[1];
const ioPathVer = './js/saveIO.js' + (ioVer ? '?v=' + ioVer : '');
const ioSrc = read(ioPathVer);

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
const KEY = 'naiwa_rouge_profile_v1';
const prof = await import('./js/profile.js');

// ============================================================
sec('① 存档码分段列表：整体删除（别让它长回来）');
// ============================================================
ok(!/CODE_CHUNK/.test(ioSrc), 'saveIO 没有 CODE_CHUNK');
ok(!/chunkCode/.test(ioSrc), 'saveIO 没有 chunkCode');
ok(!/codeStats/.test(ioSrc), 'saveIO 没有 codeStats');
ok(!/id="codeBox"/.test(htmlSrc) && !/id="codeList"/.test(htmlSrc) && !/id="codeBoxAll"/.test(htmlSrc),
  'index.html 没有分段弹窗（codeBox / codeList / codeBoxAll 全没了）');
ok(!/code-seg|code-list|md-card wide/.test(cssSrc), 'style.css 的分段样式已删干净');
ok(!/openCodeBox|closeCodeBox|lastCode/.test(mainSrc), 'main.js 没有分段弹窗的逻辑了');
ok(!/\.code-seg/.test(cssSrc) && !/class="code-list"/.test(htmlSrc), '没有残留的分段容器');

// ============================================================
sec('② 「复制存档码」= 一键整串');
// ============================================================
const exportCode = mainSrc.match(/ioExportCode'\)\.addEventListener\('click', async \(\) => \{[\s\S]{0,1200}?\n  \}\);/);
ok(!!exportCode, 'ioExportCode 有独立 handler');
if (exportCode) {
  const b = exportCode[0];
  ok(/saveIO\.payloadCode\(snap\)/.test(b), '取的是整串码（payloadCode）');
  ok(/copyText\(code\)/.test(b), '一次写进剪贴板（不经过输入框，不受字符数限制）');
  ok(/code\.length/.test(b), 'toast 里报字数（用户能看到复制到多少字）');
  ok(/openSaveCodeAsk\(\)/.test(b) && /saveCodeInput\.value = code/.test(b),
    '剪贴板被拦时把码填进粘贴框兜底（且先 open 再赋值，顺序不能反）');
  ok(!/chunk|seg/i.test(b.replace(/\/\/[\s\S]*/g, '')), 'handler 里没有任何分段逻辑');
}
ok(/存档码（分段）/.test(htmlSrc) === false, '按钮文案不再写「（分段）」');
ok(/id="ioExportCode"[^>]*>复制存档码</.test(htmlSrc), '按钮文案 = 复制存档码');

// ============================================================
sec('③ 分享文件：不用 canShare 当门闩，三级回退');
// ============================================================
const shareFn = mainSrc.match(/async function shareFree\(\) \{[\s\S]*?\n  \}\n/);
ok(!!shareFn, '有独立的 shareFree()（分享逻辑抽出来了）');
if (shareFn) {
  const b = shareFn[0];
  ok(/if \(!navigator\.share\) return false;/.test(b), '没有 navigator.share 才算真不支持');
  ok(!/if \(!canShare\)|canShare\s*&&/.test(b), '**没有**拿 canShare 结果当门闩（第 97 块的病根）');
  ok(/files: \[file\]/.test(b), '第一级：带文件分享');
  ok(/navigator\.share\(\{ title: SHARE_TITLE, text: SHARE_TEXT \+ '\\n\\n' \+ saveIO\.payloadCode\(snap\) \}\)/.test(b),
    '第二级：退成纯文本分享（整串码，内嵌 WebView 只支持这种）');
  ok(/err\.name === 'AbortError'/.test(b), '两级都认「用户取消不算失败」');
  ok((b.match(/AbortError/g) || []).length >= 2, '两级各拦一次 AbortError');
}
const shareBtn = mainSrc.match(/ioShareFile'\)\.addEventListener\('click', async \(\) => \{[\s\S]{0,600}?\n  \}\);/);
ok(!!shareBtn, 'ioShareFile 有 handler');
if (shareBtn) {
  ok(/await shareFree\(\)/.test(shareBtn[0]), '先走 shareFree');
  ok(/exportFile\(\)/.test(shareBtn[0]), '分享真的打不开才退回下载');
  ok(/这台设备没有分享面板/.test(shareBtn[0]), '兜底 toast 说的是「没有分享面板」而不是「不支持」');
}
ok(!/navigator\.canShare/.test(mainSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')),
  '代码里已经没有 navigator.canShare（只在注释里留了解释）');
ok(/navigator\.share/.test(mainSrc), '仍然走 Web Share API');
ok(/function exportFile/.test(mainSrc), 'exportFile 抽成函数，三级回退共用');

// ============================================================
sec('④ 速度感：新档默认开 + 老档一次性迁移');
// ============================================================
ok(/speedFov: true,/.test(profSrc), 'DEFAULT_SETTINGS.speedFov 默认 true');
ok(/uiRev: 0,/.test(profSrc), 'DEFAULT_PROFILE 有 uiRev 世代号');
ok(/const UI_REV = 1;/.test(profSrc), '当前界面世代 = 1');
ok(/function migrateUi\(p\)/.test(profSrc), '有 migrateUi()');
ok(/function profile\(\)[\s\S]{0,600}?migrateUi\(cache\)[\s\S]{0,80}?save\(\)/.test(profSrc),
  'profile() 读到老档会迁移并**当场落盘**');
ok(/function reloadFromStorage\(\)[\s\S]{0,600}?migrateUi\(cache\)/.test(profSrc),
  'reloadFromStorage() 也跑迁移（管理员退出回滚时不会把开关退回旧值）');

// —— 行为：老档（speedFov:false、没有 uiRev）→ 迁移成 true 并写盘
localStorage.clear();
localStorage.setItem(KEY, JSON.stringify({
  v: 1,
  settings: { sfx: 0.8, music: 0.55, quality: 'high', joySize: 'mid', joyHand: 'left', shake: true, speedFov: false },
  bones: 123,
}));
prof.reloadFromStorage();
ok(prof.settings().speedFov === true, '老档里的 speedFov:false → 迁移成 true');
ok(prof.profile().uiRev === 1, '世代号提到 1');
const disk = JSON.parse(localStorage.getItem(KEY));
ok(disk.settings.speedFov === true, '磁盘上那份也改成 true 了（不是只在内存里）');
ok(disk.bones === 123, '迁移只动 setting，骨币等其它数据一个字节不动');

// —— 玩家自己关掉之后，不许被再次重开
prof.setSetting('speedFov', false);
ok(prof.settings().speedFov === false, '玩家手动关掉 = false');
prof.reloadFromStorage();
ok(prof.settings().speedFov === false, '重新读盘不会把它重开（uiRev 已经是 1）');
ok(JSON.parse(localStorage.getItem(KEY)).settings.speedFov === false, '磁盘上也是 false');

// —— 全新档（空白 localStorage）默认就是开的
localStorage.clear();
prof.reloadFromStorage();
ok(prof.settings().speedFov === true, '全新档默认打开速度感');

// —— 设置面板的「开/关」读的就是这个值
const setRow = mainSrc.match(/\{ key: 'speedFov'[^}]*\}/);
ok(!!setRow && /'on', '开'/.test(setRow[0]), '面板上「开」是第一个选项（默认高亮）');
ok(/BOOL_SETTINGS = new Set\(\['shake', 'speedFov'\]\)/.test(mainSrc), 'speedFov 走布尔渲染');
ok(/speedFovOn = !!s\.speedFov;/.test(mainSrc), 'applySettings 会把值同步给相机');

// ============================================================
sec('⑤ 版本号同步');
// ============================================================
const ver = (htmlSrc.match(/js\/main\.js\?v=(\d+)/) || [, null])[1];
ok(!!ver, 'index.html 里读得到版本号');
const jsFiles = ['main.js', 'profile.js', 'saveIO.js', 'enemy.js', 'wave.js'];
const staleRe = new RegExp('\\?v=(?!' + ver + ')\\d+', 'g');
for (const f of jsFiles) {
  const s = read('./js/' + f);
  const bad = (s.match(staleRe) || []);
  ok(bad.length === 0, `${f} 里没有旧版本号`, bad.slice(0, 3).join(','));
}
ok(new RegExp('\\?v=' + ver).test(htmlSrc), 'index.html 与本块 bump 一致');

// ============================================================
console.log('');
if (fail) {
  console.log(`失败 ${fail} 项 / 共 ${pass + fail} 项`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`第 99 块契约：全绿 ${pass}/${pass + fail}`);
