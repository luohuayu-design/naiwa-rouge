// 第 92 块 · 契约：结算页的出口改成「回主界面」，不再整页刷新
// 用户报的 bug：一关打完点「再来一次」网页会重新刷新，而不是直接回主页面。
// 这条 bug 的根因是「刷新」被当成了「把世界清干净」的手段 —— 第 86 块的
// resetRunState() 已经能原地清，所以结算出口只需要收浮层 + 回标题。
// 本套测试锁三件事：① 出口不再 reload；② 该收的浮层都收了；
// ③ 那些原来靠刷新复位的视觉状态（站位 / 侧倒姿势 / 攻击范围环）改成显式复位。
import fs from 'fs';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

const MAIN = fs.readFileSync('js/main.js', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');

// 括号配平取函数体（字符串/注释里的括号不影响这里的用法）
function bodyOf(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  return '';
}

console.log('\n[1] 按钮文案');
const htmlBtn = (HTML.match(/<button class="rs-btn" id="rsBtn"[^>]*>([^<]*)<\/button>/) || [])[1] || '';
ok(htmlBtn === '回到主界面', `index.html 的初始文案是「回到主界面」（实际：${htmlBtn}）`, htmlBtn);
ok(/rsBtn\.textContent = boonGain \? `领取 \$\{boonGain\} 次永夜火种` : '回到主界面'/.test(MAIN),
  '运行时的 fallback 文案也改成「回到主界面」');
const oldWord = MAIN.split('\n').filter((ln) => /再来一次/.test(ln) && !/^\s*\/\//.test(ln));
ok(oldWord.length === 0, 'main.js 里除了注释，没有残留「再来一次」', oldWord.join(' | '));
ok(!/再来一次/.test(HTML), 'index.html 里没有「再来一次」');

console.log('\n[2] 结算出口不再刷新');
const rsClick = MAIN.slice(MAIN.indexOf("document.getElementById('rsBtn').addEventListener"), MAIN.indexOf("document.getElementById('rsBtn').addEventListener") + 700);
ok(rsClick.length > 100, '找得到 rsBtn 的点击处理');
ok(!/location\.reload/.test(rsClick), 'rsBtn 的点击处理里没有 location.reload()', rsClick.slice(0, 160));
ok(/exitToTitle\(\)/.test(rsClick), '点按钮走新出口 exitToTitle()');
ok(/showBoons\(\{ after: 'title' \}\)/.test(rsClick), '火种待领时先开面板，after 传的是 title（不是 reload）');

const exitBody = bodyOf(MAIN, 'function exitToTitle()');
ok(exitBody.length > 100, 'exitToTitle() 已定义');
ok(/hideFailTip\(\)/.test(exitBody), 'exitToTitle 收掉失败提示');
ok(/resultEl\.classList\.remove\('on'\)/.test(exitBody), 'exitToTitle 收掉结算面板');
ok(/closeGuide\(\)/.test(exitBody), 'exitToTitle 收掉「查看攻略」面板');
ok(/closePackGet\(/.test(exitBody), 'exitToTitle 收掉首通弹的音效包卡（否则会糊在标题页上）');
ok(/showTitle\(\)/.test(exitBody), 'exitToTitle 最后回标题页');

const closeBoonsBody = bodyOf(MAIN, 'function closeBoons()');
ok(/after === 'reload'/.test(closeBoonsBody), 'closeBoons 仍兼容 after=reload（调试 / 其它入口还能用）');
ok(/after === 'title'/.test(closeBoonsBody) && /exitToTitle\(\)/.test(closeBoonsBody),
  "closeBoons 认 after='title' 并调 exitToTitle()");

// 全站还剩几处 reload：应只剩「导入存档后必须刷新」这一处
// （注释里提到 location.reload() 不算，那是给后来人看的说明）
const reloadLines = MAIN.split('\n').filter((ln) => /location\.reload\(\)/.test(ln) && !/^\s*(\/\/|\*|\/\*)/.test(ln));
ok(reloadLines.length === 2,
  'main.js 只剩 2 处真的 location.reload（导入存档 + closeBoons 的兼容分支）',
  reloadLines.map((l) => l.trim().slice(0, 40)).join(' | '));
ok(/导入完成/.test(MAIN) && /setTimeout\(\(\) => \{ try \{ location\.reload\(\); \}/.test(MAIN),
  '导入存档后那次 reload 保持原样（内存档案各模块自带缓存，只能刷新最干净）');

console.log('\n[3] 原来靠刷新复位的视觉状态，现在显式复位');
const visualBody = bodyOf(MAIN, 'function restoreRunVisuals()');
ok(visualBody.length > 80, 'restoreRunVisuals() 已定义');
ok(/frog\.root\.rotation\.z = 0/.test(visualBody), '扶正奶蛙（结算失败会侧倒 -π/2）');
ok(/frog\.root\.position\.copy\(pos\)/.test(visualBody), '奶蛙的 y 位置也回到 pos（侧倒时会下沉 0.12）');
ok(/playerRing\.setVisible\(true\)/.test(visualBody), '攻击范围环重新可见');

const resetBody = bodyOf(MAIN, 'function resetRunState()');
ok(/pos\.set\(0, 0, 0\)/.test(resetBody), '新一局把主角站位归零（否则从上一局死掉的地方开局）');
ok(/restoreRunVisuals\(\)/.test(resetBody), 'resetRunState 里调了 restoreRunVisuals()');

const startBody = bodyOf(MAIN, 'function startPlay()');
ok(/restoreRunVisuals\(\)/.test(startBody), 'startPlay 里也调一次（幂等，教程那条路也覆盖）');

const resumeBody = bodyOf(MAIN, 'async function resumeGame(uid)');
ok(/restoreRunVisuals\(\)/.test(resumeBody), '读档进战场前同样扶正（上一局可能刚结算过）');

console.log('\n[4] 死亡动画本身没被误删');
ok(/frog\.root\.rotation\.z = -Math\.PI \* 0\.5 \* k \* k/.test(MAIN),
  '结算时的侧倒动画还在（这条只解决「下一局躺着」，不是取消死亡表现）');

console.log('\n' + '─'.repeat(52));
console.log(`通过 ${pass} · 失败 ${fail}`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
