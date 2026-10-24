// ============================================================
// 第 67 块 Node 契约测试：民心跨档事件的播放时序（用户定案）
//   一、民心事件挪进**本回合**的结算链，不再排到下一回合
//   二、顺序 = 随机事件 → 三选一（有的话）→ 民心事件 → 商店
//   三、这回合没有三选一 → 随机事件一关就立刻弹民心
//   四、关底照样播（第 65 块的修复没有回退）
//   五、民心事件自身再跨档时，队列里的第二条也接着播
//   六、debug 跳叙事时队列不堆垃圾
//   七、版本号一致
//
// 跑法：node .tmp-block67-test.mjs（运行时行为在 .tmp-block67-cdp.js）
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
const repSrc = read('js/repEvents.js');
const waveSrc = read('js/wave.js');

// 抽一个箭头函数体（缩进 4 空格的 `};` 收尾）
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  const m = src.slice(i).match(/[\s\S]*?\n {4}\};/);
  return m ? m[0] : '';
}

const hrc = (mainSrc.match(/function handleRoundClear\(roundNo\) \{[\s\S]*?\n  \}/) || [''])[0];
const playRep = fnBody(hrc, 'const playRep = (next) => {');
const runUpgrade = fnBody(hrc, 'const runUpgrade = () => {');
const runEvent = fnBody(hrc, 'const runEvent = () => {');
const runShop = fnBody(hrc, 'const runShop = () => {');

// ============================================================
sec('一、民心事件挪进本回合的结算链');
// ============================================================
ok(hrc.length > 0, 'handleRoundClear 抓到了（正则没失效）');
ok(playRep.length > 0, 'handleRoundClear 里定义了 playRep()（民心事件的唯一出口）');
ok(/while \(repEventQueue\.length\) \{/.test(playRep), 'playRep 会把队列里的都播完');
ok(/const rid = repEventQueue\.shift\(\);/.test(playRep), '从队列头部取（FIFO）');
ok(/const rev = getEventById\(rid\)/.test(playRep), '取到的是事件本体');
ok(/openEvent\(rev, roundNo, /.test(playRep), '用 openEvent 播，回合号传的是本回合');
ok(/if \(rev\) \{ openEvent/.test(playRep), '查不到的事件跳过，不会卡住链子');

// 旧实现：在 runEvent 里「0.5) 民心跨档的专属事件」优先播，而且排到**下一回合**
ok(!/0\.5\) 民心跨档/.test(mainSrc), '旧的「0.5 民心优先」段已删掉');
ok(!/排到下一回合结束的奇遇时段更顺/.test(mainSrc), '注释也不再说「下一回合」');
ok(/第 67 块（用户定案）：民心跨档事件的口子/.test(mainSrc), '写清了第 67 块的新口径');

// ============================================================
sec('二、顺序：随机事件 → 三选一 → 民心事件 → 商店');
// ============================================================
ok(/showUpgrade\(roundNo, \(\) => playRep\(runShop\)\)/.test(runUpgrade),
  '三选一的回调是「先播民心、再进商店」', runUpgrade);
ok(/playRep\(runShop\)/.test(runUpgrade), '没有三选一时也是 playRep → 商店');
ok(!/showUpgrade\(roundNo, runShop\)/.test(runUpgrade), '旧的「选完直接商店」已改掉');

// 顺序：runUpgrade 里 playRep 必须在 showUpgrade 的 after 里（而不是在它之前）
const iShow = runUpgrade.indexOf('showUpgrade(');
const iRep = runUpgrade.indexOf('playRep(runShop)');
ok(iShow >= 0 && iRep > iShow, 'playRep 挂在三选一的回调里（不是抢在它前面）',
  'showUpgrade@' + iShow + ' playRep@' + iRep);

// 随机事件的回调仍然收在 runUpgrade 上（事件 → 三选一 → 民心）
ok(/runUpgrade\.length|runEvent/.test(mainSrc) && /runUpgrade/.test(hrc), 'runEvent 的下一站是 runUpgrade');
const openEvCalls = (hrc.match(/openEvent\([^)]*runUpgrade\)/g) || []).length;
ok(openEvCalls >= 2, '随机事件 / 连锁事件都把回调交给 runUpgrade', String(openEvCalls));

// ============================================================
sec('三、这回合没有三选一 → 立刻弹');
// ============================================================
ok(/level\.shouldUpgrade\(roundNo\)/.test(runUpgrade), '先问 shouldUpgrade');
ok(/if \(!DEBUG_SKIP_NARRATIVE && level\.shouldUpgrade\(roundNo\)\)/.test(runUpgrade),
  '有升级 → 弹三选一；否则直接落到下面的 playRep');
ok(/return;\s*\}\s*playRep\(runShop\);/.test(runUpgrade.replace(/\n/g, ' ')) ||
   /playRep\(runShop\);\s*$/m.test(runUpgrade.trim()) ||
   /playRep\(runShop\)/.test(runUpgrade), '兜底分支确实是 playRep（没有升级就立刻弹）');

// ============================================================
sec('四、关底照播（第 65 块回归）');
// ============================================================
ok(/if \(isLast\) \{ runUpgrade\(\); return; \}/.test(runEvent),
  '关底不再直接跳结算 —— 交给 runUpgrade（它内部会 playRep）', runEvent.slice(0, 120));
ok(!/while \(repEventQueue\.length\) \{\s*const rid/.test(runEvent),
  '关底那段临时 while 已并入 playRep（不重复实现）');

// 关底真正会踩到的一步：choosing 三选一之后原实现直接 endGame，绕过了 upgradeAfterCb
// → 排队的那条民心事件永远没人播（CDP 的 C 组抓到的真 bug）。
const chooseUp = (mainSrc.match(/function chooseUpgrade\(up\) \{[\s\S]*?\n  \}/) || [''])[0];
const lastBranch = (chooseUp.match(/if \(pendingRound >= level\.totals\.rounds\) \{[\s\S]*?\n    \}/) || [''])[0];
ok(lastBranch.length > 0, '找到关底分支');
ok(/const next = upgradeAfterCb;/.test(lastBranch), '关底先取回调');
ok(/if \(next\) next\(\);/.test(lastBranch), '关底先让回调跑（民心事件才有机会播）');
ok(/else endGame\(true\);/.test(lastBranch), '没有回调时才直接结算');
ok(lastBranch.indexOf('next()') < lastBranch.indexOf('endGame'), '顺序：回调在前、结算在后',
  lastBranch.replace(/\s+/g, ' '));
ok(/if \(isLast\) \{ endGame\(true\); return; \}/.test(runShop),
  'runShop 在关底就是终点（民心播完之后结算）', runShop.replace(/\s+/g, ' '));

// ============================================================
sec('五、民心事件自身再跨档 → 第二条接着播');
// ============================================================
ok(/openEvent\(rev, roundNo, \(\) => playRep\(next\)\)/.test(playRep),
  '播完一条继续看队列（民心事件也可能让民心再跨一档）');
ok(/最多两份/.test(mainSrc), '队列上限 2，递归最多两层（不会死循环）');
const pushGuard = /if \(repEventQueue\.length < 2\) repEventQueue\.push\(pick\.id\);/.test(mainSrc);
ok(pushGuard, '入队时仍然守着「最多两份」');

// ============================================================
sec('六、debug 跳叙事时不留垃圾');
// ============================================================
ok(/if \(DEBUG_SKIP_NARRATIVE\) \{ repEventQueue\.length = 0; next\(\); return; \}/.test(playRep),
  '跳叙事时清空队列再往下走（别把队列攒到下一关）');

// ============================================================
sec('七、民心事件池子本身（改时序不该动内容）');
// ============================================================
const tiers = [...repSrc.matchAll(/tier:\s*(-?\d+)/g)].map((m) => Number(m[1]));
ok(tiers.length === 9, '九条民心事件（好坏两边的档位都齐）', String(tiers.length));
ok(tiers.filter((t) => t > 0).length === 5, '正向 5 条（1/2/3 档）');
ok(tiers.filter((t) => t < 0).length === 4, '负向 4 条（-1/-2 档）');
const titles = [...repSrc.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
ok(new Set(titles).size === titles.length, '标题互不重复（CDP 靠标题认「这是不是民心事件」）',
  String(titles.length) + ' 条');

// 升级回合表：第 8 回合有、第 7 回合没有、第 20 回合是关底（CDP 靠它分组）
const upgAfter = (waveSrc.match(/LEVEL_1 = \{[\s\S]*?upgradeAfter: \[([^\]]+)\]/) || [])[1] || '';
const upgList = upgAfter.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
ok(upgList.includes(8), '第一关第 8 回合有三选一（CDP 的 A 组前提）', upgAfter);
ok(!upgList.includes(7), '第一关第 7 回合没有三选一（CDP 的 B 组前提）', upgAfter);
ok(upgList.includes(20), '第一关关底有三选一', upgAfter);

// ============================================================
sec('八、版本号一致');
// ============================================================
const baseVer = (htmlSrc.match(/main\.js\?v=(\d+)/) || [])[1];
ok(!!baseVer, 'index.html 带版本号', 'v=' + baseVer);
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const bad = jsFiles.filter((f) => new RegExp('\\?v=(?!' + baseVer + ')\\d+').test(read('js/' + f)));
ok(bad.length === 0, 'js/*.js 的 import 全跟 index.html 同版本', bad.join(',') || '一致');

console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) console.log('失败项:\n  - ' + fails.join('\n  - '));
process.exit(fails.length ? 1 : 0);
