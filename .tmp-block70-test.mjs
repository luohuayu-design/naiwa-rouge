// ============================================================
// 第 70 块 Node 契约测试：民心专属事件的**独立外观**
//   用户原话：「民心事件的提示框风格和随机事件完全一致，这个导致有点混，
//              可以换一种样式吗」
//   一、民心事件不再借用「居中暖黄木门卡」的样子，改成贴顶的青绿横幅
//   二、横幅上有「民」字印章 + 标题 + 民心数值徽章（民心 +2 → 62）
//   三、掉民心那一档换暗红（同一版式两种色调）
//   四、玩法逻辑不复制：仍然复用 #eventCard 的选项 / 读秒 / 结果页
//   五、随机事件完全不受影响（不带 .rep 时一律还原）
//   六、队列里带 delta / total 快照（跨档那刻抓，播的时候不算）
//   七、版本号一致、全页零重复 id
//
// 跑法：node .tmp-block70-test.mjs（真实渲染在 .tmp-block70-cdp.js）
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra != null ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra != null ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const htmlSrc = read('index.html');
const mainSrc = read('js/main.js');
const cssSrc = read('style.css');

sec('一、HTML：横幅头栏的 DOM');

ok(/<div class="rep-bar" id="repBar">/.test(htmlSrc), '有 #repBar 容器');
ok(/id="rbTitle"/.test(htmlSrc), '有 #rbTitle（标题）');
ok(/id="rbDelta"/.test(htmlSrc), '有 #rbDelta（民心数值徽章）');
ok(/<span class="rb-seal"[^>]*>民<\/span>/.test(htmlSrc), '有「民」字印章');
ok(/class="ev-foot" id="evFoot"/.test(htmlSrc), '#evFoot 有 id（民心版式要换脚注文案）');

// 头栏必须在 ev-box 里、在 ev-icon 之前（否则会和居中卡片挤在一起）
const boxAt = htmlSrc.indexOf('class="ev-box"');
const repBarAt = htmlSrc.indexOf('id="repBar"');
const iconAt = htmlSrc.indexOf('id="evIcon"');
ok(boxAt > 0 && repBarAt > boxAt && iconAt > repBarAt, '头栏在 .ev-box 内、ev-icon 之前');

sec('二、CSS：默认隐藏，只有 .rep 才出现');

ok(/\.rep-bar\{display:none\}/.test(cssSrc), '默认 .rep-bar 隐藏（随机事件看不到它）');
ok(/\.event-card\.rep \.rep-bar\{display:flex/.test(cssSrc), '.event-card.rep 时才显示');
ok(/\.event-card\.rep \.ev-icon,\s*\n\s*\.event-card\.rep \.ev-title\{display:none\}/.test(cssSrc),
  '民心版式里藏掉原图标与居中大标题（换成横幅头栏）');

sec('三、CSS：贴顶 + 青绿，跟居中暖黄卡分开');

ok(/\.event-card\.rep\{align-items:flex-start/.test(cssSrc), '民心版式贴顶（flex-start，不再垂直居中）');
ok(/\.event-card\.rep \.ev-box\{[^}]*width:min\(94vw,460px\)/.test(cssSrc), '横幅比事件卡更宽（460 vs 430）');
ok(/\.event-card\.rep \.ev-box\{[^}]*text-align:left/.test(cssSrc), '横幅左对齐（事件卡是居中）');
ok(/\.event-card\.rep \.ev-box\{[^}]*rgba\(16,40,36/.test(cssSrc), '底色是深青绿（事件卡是暖黄 30,28,18）');
ok(/\.event-card\.rep \.ev-box\{[^}]*rgba\(224,196,120,\.85\)/.test(cssSrc), '顶部一道金线');
ok(/\.event-card\.rep \.ev-box\{[^}]*transform:translateY\(-18px\)/.test(cssSrc), '从上方滑下（事件卡是从下往上浮）');
ok(/\.event-card\.rep\.on \.ev-box\{transform:none\}/.test(cssSrc), '打开后归位');

sec('四、CSS：掉民心那档换暗红');

ok(/\.event-card\.rep\.bad \.ev-box\{[^}]*rgba\(228,126,116,\.4\)/.test(cssSrc), '.rep.bad 用暗红描边');
ok(/\.event-card\.rep\.bad \.ev-box\{[^}]*rgba\(44,22,22/.test(cssSrc), '.rep.bad 底色是暗红');
ok(/\.event-card\.rep\.bad \.rb-seal\{/.test(cssSrc), '.rep.bad 印章也换色（不是只有底变了）');

sec('五、CSS：徽章与按钮跟着青绿走');

ok(/\.rb-delta\{[^}]*border-radius:999px/.test(cssSrc), '徽章是胶囊形');
ok(/\.rb-delta b\{color:#8ff0c6/.test(cssSrc), '数值用青绿高亮');
ok(/\.event-card\.rep \.ev-btn\{/.test(cssSrc), '选项按钮跟着换青绿');
ok(/\.event-card\.rep \.ev-btn\.primary\{/.test(cssSrc), '主按钮（继续）也换色');
ok(!/\.event-card\.rep[^{]*\{[^}]*!important/.test(cssSrc), '没用 !important 硬压（靠选择器权重）');

sec('六、main.js：只换皮，不复制事件逻辑');

ok(/function applyRepSkin\(ev, rep\)/.test(mainSrc), '有 applyRepSkin()');
ok(/evCard\.classList\.toggle\('rep', !!rep\)/.test(mainSrc), '按 rep 参数切 class');
ok(/evCard\.classList\.toggle\('bad', !!\(rep && rep\.delta < 0\)\)/.test(mainSrc),
  'delta 为负 → 加 .bad（掉民心换暗红）');
ok(/evCard\.classList\.remove\('rep', 'bad'\)/.test(mainSrc), '关掉卡片时清掉版式（不带到下一张）');
ok(/function openEvent\(ev, endedRound, next, opts\)/.test(mainSrc), 'openEvent 多了 opts 参数');
ok(/applyRepSkin\(ev, opts && opts\.rep \? opts : null\)/.test(mainSrc), 'openEvent 里调 applyRepSkin');

// 关键：不能为了换皮再写一套渲染
const chooseFn = mainSrc.slice(mainSrc.indexOf('function chooseEventOption'), mainSrc.indexOf('evNext.addEventListener'));
ok(chooseFn.length > 200, 'chooseEventOption 还在（复用，不是另写一套）');
ok((mainSrc.match(/function renderEventUI/g) || []).length === 1, 'renderEventUI 只有一份');
ok((mainSrc.match(/function chooseEventOption/g) || []).length === 1, 'chooseEventOption 只有一份');
ok((mainSrc.match(/id="eventCard"/g) || []).length === 0, 'main.js 里没有另起一个事件卡');

sec('七、数值：跨档那一刻抓快照');

ok(/function queueRepEvent\(t0, t1, delta\)/.test(mainSrc), 'queueRepEvent 收 delta');
ok(/const item = \{\s*\n\s*id: pick\.id,\s*\n\s*delta: Math\.round\(delta \|\| 0\),\s*\n\s*total: Math\.round\(reputation\),/.test(mainSrc),
  '队列项 = { id, delta, total }');
ok(/queueRepEvent\(t0, t1, reputation - before\)/.test(mainSrc), '实际涨幅 = reputation - before');
ok(/openEvent\(rev, roundNo, \(\) => playRep\(next\), \{\s*\n\s*rep: true, delta: item\.delta, total: item\.total/.test(mainSrc),
  'playRep 把快照交给 openEvent');
ok(/rbDeltaEl\.innerHTML = d === 0/.test(mainSrc), 'delta 为 0 时不打「+0」');
ok(/d > 0 \? '\+' : '−'/.test(mainSrc), '负数用减号「−」而不是连字符');
ok(/民心记在村里的账上/.test(mainSrc), '民心版式换了一句脚注');

sec('八、调试钩子');

ok(/queue: \(\) => repEventQueue\.map\(\(q\) => q\.id\)/.test(mainSrc), 'repEv.queue() 仍返回 id 数组（老测试不受影响）');
ok(/queueFull: \(\) => repEventQueue\.map\(\(q\) => \(\{ \.\.\.q \}\)\)/.test(mainSrc), 'repEv.queueFull() 返回带数值的副本');
ok(/push: \(id, delta = 0, total = reputation\)/.test(mainSrc), 'repEv.push 可以塞数值');
ok(/trigger: \(id, endedRound = level\.roundNo, opts = null\)/.test(mainSrc), 'event.trigger 可以传 opts');

sec('八·五、层级：横幅不能被「第 N 回合」飘字压住');

const cardZ = Number((cssSrc.match(/\.event-card\{position:fixed;inset:0;z-index:(\d+)/) || [])[1]);
const toastZ = Number((cssSrc.match(/#waveToast\{[^}]*z-index:(\d+)/) || [])[1]);
ok(cardZ > toastZ, `事件卡（${cardZ}）高于回合飘字（${toastZ}）`, cardZ + ' vs ' + toastZ);

sec('九、版本号 与 id 唯一性');

const ver = (htmlSrc.match(/main\.js\?v=(\d+)/) || [])[1];
ok(!!ver, 'index.html 里有版本号', ver);
const files = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
const bad = [];
for (const f of files) {
  const s = read(f);
  const m = s.match(/\?v=(\d+)/g) || [];
  for (const one of m) if (one !== '?v=' + ver) bad.push(f + ' ' + one);
}
ok(bad.length === 0, '所有 ?v= 都等于 ' + ver, bad.slice(0, 4).join(' '));

// v=61 的教训：复制面板 HTML 忘改 id → 全页重复 id
const ids = [...htmlSrc.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
ok(dup.length === 0, '全页零重复 id', dup.join(','));

console.log('\n============================');
console.log('  结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) { console.log('  失败项：'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('============================');
process.exit(fails.length ? 1 : 0);
