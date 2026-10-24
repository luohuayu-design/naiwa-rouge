// ============================================================
// 第 66 块 Node 契约测试
//   一、收起的卡片不再参与命中测试（「事件 / 三选一按钮很迟钝」的根因）
//   二、卡片里的按钮统一「只有 .on 时才能点」（防止第三次踩同一个坑）
//   三、箭雨教程不再卡死（场上没怪时补靶子 + wtTick 推进）
//   四、新手教程期间技能栏可见（第 5 步讲技能栏时有东西可看）
//   五、箭雨空地按不动但会说明原因（lastFail / hasTarget）
//   六、箭雨冷却不跨局残留（resetCd）
//   七、版本号一致
//
// 跑法：node .tmp-block66-test.mjs（运行时行为在 .tmp-block66-cdp.js）
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

const cssSrc = read('style.css');
const htmlSrc = read('index.html');
const mainSrc = read('js/main.js');
const rainSrc = read('js/arrowRain.js');

// 取一个选择器的基础规则块（第一个 `sel{...}`，不含后代组合规则）
function ruleBlock(src, sel) {
  const re = new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'm');
  const m = src.match(re);
  return m ? m[2] : null;
}

// ============================================================
sec('一、收起的卡片不再参与命中测试');
// ============================================================
const tutBase = ruleBlock(cssSrc, '.tut-card');
ok(tutBase != null, '.tut-card 基础规则还在');
ok(/visibility\s*:\s*hidden/.test(tutBase || ''), '.tut-card 收起时 visibility:hidden（连命中测试都不参加）', tutBase);
ok(/pointer-events\s*:\s*none/.test(tutBase || ''), '.tut-card 本身也不吃点击');
const tutOn = ruleBlock(cssSrc, '.tut-card.on');
ok(tutOn != null, '.tut-card.on 规则还在');
ok(/visibility\s*:\s*visible/.test(tutOn || ''), '打开时 visibility:visible', tutOn);
// 收起要有延迟，否则淡出动画会被"瞬间消失"顶掉
ok(/visibility\s+0s\s+linear\s+\.22s/.test(tutBase || ''),
  '收起的 visibility 延迟 .22s（保住淡出动画）', tutBase);
ok(/transition/.test(tutOn || '') && !/linear\s+\.22s/.test(tutOn || ''),
  '打开时 visibility 立即生效（transition 里没有 .22s 延迟）', tutOn);

// ============================================================
sec('二、卡片里的按钮只有 .on 时才能点');
// ============================================================
ok(/\.tut-card button\{[^}]*pointer-events\s*:\s*none/.test(cssSrc),
  '兜底：卡片里所有 button 默认不吃点击');
ok(/\.tut-card\.on button\{[^}]*pointer-events\s*:\s*auto/.test(cssSrc),
  '兜底：卡片亮着时所有 button 都能点');
ok(/\.tut-card\.hint-card\.on\{[^}]*pointer-events\s*:\s*auto/.test(cssSrc),
  '提示卡亮着时整块可点（点空白也能关）',
  ruleBlock(cssSrc, '.tut-card.hint-card.on'));
// 上次就是这一条在 .hi-ok 上写死了 auto，才把整个屏幕中间变成隐形按钮
const hiOk = ruleBlock(cssSrc, '.hint-card .hi-ok');
ok(hiOk != null, '.hi-ok 规则还在');
ok(!/pointer-events\s*:\s*auto/.test(hiOk || ''),
  '「知道了」不再写死 pointer-events:auto（第 65 块的老毛病）', hiOk);
// .tc-skip / .wt-next 的基础规则仍应是 none
ok(/\.tc-skip\{[^}]*pointer-events\s*:\s*none/.test(cssSrc), '「跳过教程」默认不吃点击');
ok(/\.wt-next\{[^}]*pointer-events\s*:\s*none/.test(cssSrc.replace(/\n\s*/g, '')),
  '「下一步」默认不吃点击');
// 结构上：说明卡里只有一个按钮，且是 button 元素（能被兜底规则管到）
ok((htmlSrc.match(/id="hiOk"[^>]*type="button"|type="button"[^>]*id="hiOk"/) || []).length === 1,
  '「知道了」是 <button type="button">');

// ============================================================
sec('三、箭雨教程不再卡死');
// ============================================================
ok(/function ensureRainTargets\(dt\)/.test(mainSrc), '有 ensureRainTargets(dt)');
ok(/arrowRain\.hasTarget\(pos\)/.test(mainSrc), '补靶子前先问「射程内还有没有活怪」');
ok(/enemies\.spawn\('warrior'/.test(mainSrc), '靶子用 warrior（不是会自爆的 minion）');
ok(/rainTargetCd\s*=\s*1\.6/.test(mainSrc), '补靶子节流 1.6s（留够 spawn 动画时间）');
ok(/function wtTick\(dt\)/.test(mainSrc), 'wtTick 拿到 dt');
ok(/if \(gameState === 'wtut'\) wtTick\(dt\);/.test(mainSrc), '主循环传 dt 进去');
ok(/s\.wait === 'rain'\)\s*\{[\s\S]{0,200}?ensureRainTargets\(dt\)/.test(mainSrc),
  '只有「按一次箭雨」那一步才补靶子');
ok(!/s\.wait === 'rain' && arrowRain\.strikeCount > 0\)\s*\{\s*wtFired = true;\s*wtAdvance\(\);\s*\}\s*else if/.test(mainSrc),
  '旧的「等不到就干等」结构已经改掉');

// ============================================================
sec('四、新手教程期间技能栏可见');
// ============================================================
const ctxLine = (mainSrc.match(/function skillCtx\(\)[\s\S]*?return \{ playing:[^\n]*/) || [''])[0];
ok(/gameState === 'tutorial'/.test(ctxLine), 'skillCtx().playing 含 tutorial', ctxLine.slice(0, 120));
ok(/gameState === 'wtut'/.test(ctxLine), '仍然含 wtut（武器教程要求真放一次技能）');
ok(/gameState === 'playing'/.test(ctxLine), '仍然含 playing');
// 教程第 5 步讲的就是技能栏，得有东西可看
ok(/title: '右下角：技能栏'/.test(mainSrc), '八步教程里确实有一讲讲技能栏');
// 开局初始化（prefillRing / healSkill.setUnlocked）原先全在 endTutorial → startPlay 里，
// 教程期间世界还是 boot 时的样子 → 讲技能栏时栏里是空的。教程入口要静默预置。
const tutFn = (mainSrc.match(/function startTutorial\(\)[\s\S]*?\n  \}/) || [''])[0];
ok(/prefillRing\(\{ quiet: true \}\)/.test(tutFn), 'startTutorial 里静默预置环剑', tutFn.slice(0, 80));
ok(/healSkill\.setUnlocked\(healUnlocked\(\)\)/.test(tutFn), 'startTutorial 里也预置回血键');
ok(/arrowRain\.resetCd\(\)/.test(tutFn), '教程开局也清箭雨 CD');
ok(/function prefillRing\(\{ quiet = false \} = \{\}\)/.test(mainSrc), 'prefillRing 支持 quiet');
// quiet 时不能弹 toast / 排队武器教程（那时正开着新手教程卡）
const quietBlock = (mainSrc.match(/if \(quiet\) return;/) || []).length;
ok(quietBlock === 1, 'quiet 分支在弹 toast 之前 return', String(quietBlock));

// ============================================================
sec('五、箭雨空地按不动但要说明原因');
// ============================================================
ok(/let lastFail = ''/.test(rainSrc), 'arrowRain 记录上次失败原因');
ok(/lastFail = 'notarget'/.test(rainSrc), "没目标时记 'notarget'");
ok(/lastFail = 'cd'/.test(rainSrc), "冷却中记 'cd'");
ok(/get lastFail\(\) \{ return lastFail; \}/.test(rainSrc), '对外暴露 lastFail');
ok(/hasTarget\(p\) \{/.test(rainSrc), '对外暴露 hasTarget(p)');
ok(/arrowRain\.lastFail === 'notarget'/.test(mainSrc), 'pressSkill 里按这个原因给提示');
ok(/fx\.text\(pos, '附近没有怪'/.test(mainSrc), '提示文案是「附近没有怪」');
// 空地仍然不放 —— 这是刻意的设计，不能被"修 bug"顺手改掉
ok(/if \(!best\) \{ lastFail = 'notarget'; return false; \}/.test(rainSrc),
  '没有目标时仍然返回 false（不白扔 CD）');
ok(/if \(!unlocked\) \{ lastFail = 'lock'; return false; \}/.test(rainSrc), '没解锁也不放');

// ============================================================
sec('五·补、技能元数据完整（锁态文案从 block64-cdp 搬过来）');
// ============================================================
const skillsSrc = read('js/skills.js');
ok((skillsSrc.match(/unlockNote:/g) || []).length >= 3, '每条技能都写着解锁条件（锁态才有内容）',
  String((skillsSrc.match(/unlockNote:/g) || []).length));
const skillIds = (skillsSrc.match(/^ {4}id: '/gm) || []).length;   // 只数真正的条目，不数注释示例
ok(skillIds === (skillsSrc.match(/unlockNote:/g) || []).length,
  '技能条数与 unlockNote 条数一致', skillIds + ' 条');

// ============================================================
sec('六、箭雨冷却不跨局残留');
// ============================================================
ok(/function resetCd\(\) \{ cd = 0; \}/.test(rainSrc), 'arrowRain 有 resetCd()');
ok(/unlock, reset, resetCd, restore/.test(rainSrc), 'resetCd 已导出');
ok(/arrowRain\.resetCd\(\);/.test(mainSrc), 'beginGame 里调用了 resetCd()');
ok(!/arrowRain\.reset\(\);\s*\n\s*prefillRing\(\)/.test(mainSrc),
  '没有直接 reset()（它会清掉 unlocked，箭雨就回不来了）');
// 顺序：resetCd 必须在 prefillRing 之前（prefillRing 会重新 unlock，但 cd 不能被写回）
const idxCd = mainSrc.indexOf('arrowRain.resetCd()');
const idxPrefill = mainSrc.lastIndexOf('prefillRing();', idxCd + 30);
ok(idxCd > 0 && idxCd < idxPrefill, 'resetCd 在 prefillRing 之前', idxCd + ' vs ' + idxPrefill);

// ============================================================
sec('七、版本号');
// ============================================================
const ver = (htmlSrc.match(/main\.js\?v=(\d+)/) || [])[1];
ok(!!ver, `index.html 带版本号（v=${ver}）`);
// 第 67 块起改成版本无关：只要求 js/*.js 的 import 跟 index.html 一致
// （写死数字每发一版都要来改一次，纯噪声；真正的风险是「只 bump 了一半」）
const jsFiles2 = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const badVer2 = jsFiles2.filter((f) => new RegExp('\\?v=(?!' + ver + ')\\d+').test(read('js/' + f)));
ok(badVer2.length === 0, `js/*.js 与 index.html 同版本（v=${ver}）`, badVer2.join(',') || '一致');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const badVer = jsFiles.filter((f) => new RegExp('\\?v=(?!' + ver + ')\\d+').test(read('js/' + f)));
ok(badVer.length === 0, `js/*.js 的 import 全跟 index.html 同版本（${badVer.length ? badVer.join(',') : '一致'}）`);

// ============================================================
console.log(`\n结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); }
process.exit(fails.length ? 1 : 0);
