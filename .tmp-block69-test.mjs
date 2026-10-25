// ============================================================
// 第 69 块 Node 契约测试：擦名者「别在背后偷」三改（起手距离 / 读条 / 移速）
//
// 跑法：node .tmp-block69-test.mjs
// 这一套只测「纯数据 + 源码结构 + 文案同步」，不需要浏览器。
// 运行时行为（7 格内才起手 / 偷完愣 1.4 秒 / 逃跑速度不变）在 .tmp-block69-cdp.js。
//
// 用户原话（2026-10-24）：
//   「玩家还没找到擦名者就被偷了。第一个，只有擦名者在玩家视线范围内才能触发。
//     第二个，降低擦名速度。第三个，大幅降低它的移动速度。」
//   追问后拍板：视线 = 「距离比较近」；读条中离开画面 → 照常读完；
//   读条 4.5 秒 / 移速 0.55；另外补一条「名字擦除后，擦名者等一段时间才能继续行走」。
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

const enemy = await import('./js/enemy.js');
const ER = enemy.ENEMY_TYPES.eraser;

// ============================================================
sec('一、起手距离：只在「比较近」的地方才读条');
// ============================================================
ok(!!ER, '图鉴里还有擦名者');
ok(ER.attackRange === 7.0, '起手距离 7.0 格（原 9.0）', String(ER.attackRange));
// 第 75 块：用户要求「它会自主向主角移动」→ 3.0 改成 4.2，靠到身边来缠
ok(ER.keepDistance === 4.2, '保持距离 4.2 格（第 75 块：主动靠到身边）', String(ER.keepDistance));
// 攻击窗口必须够宽，否则它会在「前进 / 后退」之间反复横跳、永远不起手
ok(ER.attackRange - ER.keepDistance >= 1.5,
  '起手窗口 ≥1.5 格（不会在前进/后退之间来回抖）', String(ER.attackRange - ER.keepDistance));
// 起手距离还得比玩家一次「判定圈」大，否则贴脸怪没意义
ok(ER.attackRange > 5.0, '起手距离仍大于判定圈（不会贴着脸读条）');
// 「视线」是投影判定：光看距离挡不住横向屏幕外的 7 格
const enemySrc = read('js/enemy.js');
ok(/const viz = ctx\.onScreen \? ctx\.onScreen\(e\.pos\) : true/.test(enemySrc),
  'chase 分支每帧问一次「玩家看得见吗」');
// 第 77 块把「看不见 → 靠近」从合并条件里拆出来、提到最前面了：
// 原来 (dist > keep+0.45 || !viz) 和后面的死区会互相夹死，它卡在视野边缘永不读条。
ok(/if \(!viz && dist > 2\.0\)/.test(enemySrc),
  '看不见就往玩家身边挪（第 77 块：这条判断提到最前，先靠近再谈死区）');
ok(enemySrc.indexOf('if (!viz && dist > 2.0)') < enemySrc.indexOf('if (dist > keep + 0.45)'),
  '「看不见就靠近」排在「够远就靠近」之前（不然两条打架）');
const mainSrc0 = read('js/main.js');
ok(/function onScreen\(at, margin = 0\.9\)/.test(mainSrc0), 'main.js 有 onScreen 投影判定');
ok(/\.project\(camera\)/.test(mainSrc0), 'onScreen 真的用 camera.project 投到屏幕坐标');
ok(/onScreen, +\/\/ 第 69 块/.test(mainSrc0), 'combatCtx 把 onScreen 注入给敌人');
ok(/block69: \{[\s\S]{0,200}onScreen: \(x, z\)/.test(mainSrc0), '有 block69 调试钩子（截图/测试用）');

// ============================================================
sec('二、读条速度：2.6 → 4.5 秒');
// ============================================================
ok(ER.windup === 4.5, '读条 4.5 秒（原 2.6）', String(ER.windup));
// ⚠️ 这是本块最容易踩的坑：attack 状态的退出条件是 e.t >= attackDuration，
//    如果它比 windup 小，读条还没到就切回 chase，偷剑永远不触发。
ok(ER.attackDuration > ER.windup,
  'attackDuration 必须大于 windup（否则读条被提前切断）',
  `${ER.attackDuration} vs ${ER.windup}`);
ok(ER.attackDuration - ER.windup <= 2.0,
  '读满后收尾不超过 2 秒（不偷到剑时也不会站着发呆太久）',
  String(ER.attackDuration - ER.windup));
// 玩家 4.4 格/秒：读条期间能跑 19.8 格，从场地任何位置都够赶到 7 格内
ok(ER.windup * 4.4 > ER.attackRange * 2,
  '读条时间里玩家能跑的距离远大于起手距离（一定赶得及）',
  (ER.windup * 4.4).toFixed(1) + ' 格');

// ============================================================
sec('三、移速：大幅降低，但逃跑速度要补回来');
// ============================================================
// 第 75 块：0.55 太慢（从场边走 7 格要 12 秒，玩家只看见它最后才慢慢挪过来）
ok(Math.abs(ER.speed - 1.35) < 1e-6, '平时移速 1.35（第 75 块：玩家的三成，看得见它在走）', String(ER.speed));
ok(4.4 / ER.speed >= 3, '玩家仍比它快 3 倍以上（追得上）', (4.4 / ER.speed).toFixed(1) + '×');
const flee = ER.speed * ER.erase.fleeSpeed;
ok(flee > 1.6 && flee < 2.8,
  '逃跑绝对速度仍在 1.6~2.8（和原来 ~2.15 相当，「偷到就跑」的手感不变）', flee.toFixed(2));
ok(flee < 4.4, '逃跑速度仍慢于玩家（追得上）');

// ============================================================
sec('四、擦完名字先愣一会儿（用户补充）');
// ============================================================
ok(ER.erase.holdAfterSteal === 1.4, '得手后原地僵住 1.4 秒', String(ER.erase.holdAfterSteal));
ok(ER.erase.holdAfterSteal > 1.0 && ER.erase.holdAfterSteal < 2.2,
  '僵住时长在 1~2.2 秒之间（够玩家冲上来砍一刀，又不至于傻站着）');

const src = read('js/enemy.js');
const fleeBlock = src.slice(src.indexOf("if (e.state === 'flee')"), src.indexOf("if (e.state === 'flee')") + 1400);
ok(/holdAfterSteal/.test(fleeBlock), 'flee 分支里读 holdAfterSteal');
ok(fleeBlock.indexOf('holdAfterSteal') < fleeBlock.indexOf('Math.atan2'),
  '僵住判断排在位移之前（真停住，不是边跑边等）');
ok(/e\.fleeT \+= dt/.test(fleeBlock), 'fleeT 仍在累加（僵住和逃跑共用同一个计时）');
ok(!/e\.state = 'flee';\s*\n\s*e\.t = 0;\s*\n\s*e\.fleeT = 0;[\s\S]{0,80}fx\.ring/.test(fleeBlock),
  '得手瞬间仍然挂紫环 + 纸屑（原地僵住不吞掉那一下特效）');

// ============================================================
sec('五、文案同步（读条 2.6 秒的地方全改）');
// ============================================================
const codexSrc = read('js/codex.js');
ok(/读条 4\.5 秒/.test(codexSrc), '图鉴写的是 4.5 秒');
ok(!/读条 2\.6 秒/.test(codexSrc), '图鉴里没有残留 2.6 秒');
const waveSrc = read('js/wave.js');
ok(/读条 4\.5 秒/.test(waveSrc), '第五关波次提示写的是 4.5 秒');
const mainSrc = read('js/main.js');
ok(/7 格内/.test(mainSrc) && /读满 4\.5 秒/.test(mainSrc), '首次读条讲解卡写了「7 格内 / 4.5 秒」');
ok(!/只在远处站定读条/.test(mainSrc), '讲解卡里「只在远处」的旧说法已改');

// ============================================================
sec('六、版本号一致');
// ============================================================
const html = read('index.html');
const vm = html.match(/main\.js\?v=(\d+)/);
ok(!!vm, 'index.html 的 main.js 带版本号');
const v = vm ? vm[1] : '';
// 第 70 块起不再写死：只要还在 v=80 之后（每发一块都会 bump）
ok(Number(v) >= 80, '版本号 ≥ v=80（本块上线时的基线）', v);
const files = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
const bad = [];
for (const f of files) {
  const t = read(f);
  const re = /\?v=(\d+)/g;
  let m;
  while ((m = re.exec(t))) if (m[1] !== v) bad.push(f + ' → ' + m[1]);
}
ok(bad.length === 0, 'js/*.js 的 import 全跟 index.html 同版本', bad.slice(0, 5).join(', '));

// ============================================================
console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) { console.log('失败项：\n  - ' + fails.join('\n  - ')); process.exitCode = 1; }
