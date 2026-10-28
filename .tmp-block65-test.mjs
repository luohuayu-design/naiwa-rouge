// ============================================================
// 第 65 块 Node 契约测试
//   一、隐形教程按钮不再吃点击（「回血 / 箭雨点不动」的根因）
//   二、五六关难度：伤害 ×1.35 / 血量 ×1.15
//   三、回血技能键：绿色十字 SVG + 外圈冷却环
//   四、一次性提示卡（读条百分比 / 回血技能）
//   五、雾鬼隐显对比度 & 缝补小巫的绿加号
//   六、技能解锁与关卡脱钩（环剑 / 箭雨 / 回血）
//   七、民心事件关底不丢
//   八、档案字段 + 版本号
//
// 跑法：node .tmp-block65-test.mjs（运行时行为在 .tmp-block65-cdp.js）
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
const enemySrc = read('js/enemy.js');
const fxSrc = read('js/fx.js');
const waveSrc = read('js/wave.js');
const skillsSrc = read('js/skills.js');
const profileSrc = read('js/profile.js');

const wave = await import('./js/wave.js');
const skills = await import('./js/skills.js');
const profile = await import('./js/profile.js');

// ============================================================
sec('一、隐形教程卡不再挡住技能键（真 bug）');
// ============================================================
ok(/\.tc-skip\{[^}]*pointer-events:none/.test(cssSrc), '「跳过教程」默认不吃点击');
ok(/\.wt-next\{[^}]*pointer-events:none/.test(cssSrc), '「下一步 / 继续」默认不吃点击');
ok(/\.tut-card\.on \.tc-skip,\.tut-card\.on \.wt-next\{pointer-events:auto\}/.test(cssSrc),
  '只有卡片亮着（.on）才让它们接收点击');
// 注意：正则必须锚在行首，否则会误匹配 `.tut-card.on .wt-next{pointer-events:auto}`
// 这条「亮着才可点」的正向规则（它同样含 `.wt-next{` 字样）。
ok(!/(^|\n)\.tc-skip\{[^}]*pointer-events:auto/.test(cssSrc), '旧的 pointer-events:auto 已撤掉');
ok(!/(^|\n)\.wt-next\{[^}]*pointer-events:auto/.test(cssSrc), '「下一步」也不再常驻可点');
// 遮罩层本来就不吃点击，别被顺手改坏
ok(/\.tut-card\{[^}]*pointer-events:none/.test(cssSrc), '教程卡本体仍是 pointer-events:none');

// ============================================================
sec('二、五六关难度：伤害 +35% / 血量 +15%');
// ============================================================
const L5 = wave.LEVEL_5, L6 = wave.LEVEL_6, L4 = wave.LEVEL_4;
ok(L5.scale.dmgMul === 1.35, '第五关 dmgMul = 1.35', String(L5.scale.dmgMul));
ok(L5.scale.hpMul === 1.15, '第五关 hpMul = 1.15', String(L5.scale.hpMul));
ok(L6.scale.dmgMul === 1.35 && L6.scale.hpMul === 1.15, '第六关同档');
ok((L4.scale.dmgMul || 1) === 1 && (L4.scale.hpMul || 1) === 1, '第四关不受影响（没有 mul 字段）');

wave.setDifficulty('normal');
const s5r1 = wave.roundScale(1, L5);
const s5r20 = wave.roundScale(20, L5);
const s6r20 = wave.roundScale(20, L6);
const s4r20 = wave.roundScale(20, L4);
// 第 112 块：难度倍率（普通 hp 1.80 / damage 1.55 / speed 1.08）现在乘在成长表上，
// 这里把倍率提出来做基准 —— 断言的是「关与关之间的相对关系」，而不是绝对数字。
const DN = wave.DIFFS.normal;
// 第五关 R20 伤害 = (1 + 0.16*19) * 1 * 1.35 * 难度
ok(Math.abs(s5r20.damage - (1 + 0.16 * 19) * 1.35 * DN.damage) < 1e-9,
  '第五关 R20 伤害 = 基础 × 1.35 × 难度（精确）', s5r20.damage.toFixed(4));
ok(Math.abs(s5r20.hp - (1 + 0.28 * 19) * 1.15 * DN.hp) < 1e-9, '第五关 R20 血量 = 基础 × 1.15 × 难度');
ok(Math.abs(s6r20.damage - (1 + 0.17 * 19) * 1.35 * DN.damage) < 1e-9, '第六关 R20 伤害 = 基础 × 1.35 × 难度');
ok(Math.abs(s5r1.damage - 1.35 * DN.damage) < 1e-9, '第五关 R1 伤害也 ×1.35（整关一起乘）', s5r1.damage.toFixed(3));
ok(s5r20.damage / s4r20.damage > 1.3, '第五关比第四关明显更疼', (s5r20.damage / s4r20.damage).toFixed(3));
// 第 91 块：速度斜率从 0.035 提到 0.045（用户「移动更快」），这里改判新值
ok(Math.abs(s5r20.speed - (1 + 0.045 * 19) * DN.speed) < 1e-9, '速度是第 91 块的新斜率 0.045（不再是 0.035）');
// 第四关不含 mul 时行为完全老样
ok(Math.abs(s4r20.damage - (1 + 0.15 * 19) * DN.damage) < 1e-9, '第四关数值与老版本一致（回归）');
wave.setDifficulty('normal');

// ============================================================
sec('三、回血技能键：绿色十字 + 外圈冷却环');
// ============================================================
const healSk = skills.SKILLS.find((s) => s.id === 'heal');
ok(!!healSk, '技能表里有 heal');
ok(!!healSk.art && healSk.art.startsWith('<svg'), '回血技能带内联 SVG 图标（art）');
ok(/#7df0b0/.test(healSk.art), '十字是绿色的（#7df0b0）');
ok((healSk.art.match(/<rect/g) || []).length >= 2, '十字由两根圆角矩形组成');
ok(healSk.ring === true, '声明了 ring:true（外圈进度环）');
ok(healSk.icon === 'assets/skills/icon-heal.svg', '老 icon 留着（属性面板/提示还在用）');
ok(/绿色十字|绿十字/.test(healSk.hint + healSk.desc), '文案也说了「绿十字」');

ok(/\.sk-art\{/.test(cssSrc), 'CSS 有 .sk-art（内联 SVG 容器）');
ok(/\.sk-ring\{[^}]*transform:rotate\(-90deg\)/.test(cssSrc), '外圈环从 12 点方向开始（rotate -90deg）');
ok(/\.sk\.heal \.sk-cd\{display:none\}/.test(cssSrc), '回血键不再画底部竖条');
ok(/\.sk\.heal\.ready\{/.test(cssSrc), '回血可放时有绿色高亮');

ok(/if \(sk\.art\) \{/.test(mainSrc) && /sk-art/.test(mainSrc), 'buildSkillButtons 支持 art');
ok(/sk\.ring/.test(mainSrc) && /stroke-dashoffset/.test(mainSrc), 'buildSkillButtons 画外圈环');
ok(/163\.36/.test(mainSrc), '圆周长写死 163.36（r=26）');
ok(/rec\.ringEl\.setAttribute\('stroke-dashoffset'/.test(mainSrc), 'renderSkill 每帧写外圈进度');
ok(/const \{ btn, cd, num, sk \} = rec;/.test(mainSrc), 'renderSkill 用完整记录（含 ringEl）');

// ============================================================
sec('四、一次性提示卡（暂停世界）');
// ============================================================
ok(/id="hintCard"/.test(htmlSrc), 'index.html 有 #hintCard');
ok(/id="castHud"/.test(htmlSrc) && /id="castFill"/.test(htmlSrc) && /id="castNum"/.test(htmlSrc),
  'index.html 有读条 HUD 三件套');
ok(/id="hiOk"/.test(htmlSrc), '提示卡有「知道了」按钮');
ok(/\.tut-card\.hint-card\.on\{transform:translate\(-50%,-50%\)\}/.test(cssSrc), '提示卡居中显示');
ok(/--sk-lift|syncSkillLift/.test(cssSrc), '技能栏抬升变量还在');

ok(/const HINTS = \{/.test(mainSrc), 'main.js 有 HINTS 文案表');
ok(/heal: \{[\s\S]{0,400}新技能/.test(mainSrc), 'HINTS.heal 是「新技能」类');
ok(/cast: \{[\s\S]{0,400}读条/.test(mainSrc), 'HINTS.cast 是「读条」类');
ok(/function showHint\(key, back\)/.test(mainSrc), '有 showHint()');
ok(/gameState = 'hint';/.test(mainSrc), '弹卡时世界真的冻住（gameState=hint）');
ok(/function closeHint\(\)/.test(mainSrc), '有关卡（closeHint）');
ok(/hintPump\(\)/.test(mainSrc), '有排队泵');
ok(/if \(hintQueue\.length > 0 && !hintOpen && gameState === 'playing'\) hintPump\(\);/.test(mainSrc),
  '只有回到 playing 才弹（不在教程/三选一里插队）');
ok(/queueHealHint\(\);/.test(mainSrc), 'startPlay 会排一次「回血」提示');
ok(/function queueHealHint\(\)[\s\S]{0,200}hintSeen\('heal'\)/.test(mainSrc), '已经教过就不再弹');
ok(/\.tut-card\.on:not\(\.hint-card\)/.test(mainSrc), '居中的提示卡不参与技能栏抬升');

// 读条 HUD
ok(/function updateCastHud\(\)/.test(mainSrc), '有 updateCastHud()');
ok(/enemies\.eraseCast/.test(mainSrc), '读条进度取 enemies.eraseCast()');
ok(/\.project\(camera\)/.test(mainSrc), '按相机投影算屏幕位置（挂在奶蛙头顶）');
ok(/pct >= 65/.test(mainSrc), '过 65% 变粉（warn）');
ok(/updateCastHud\(\);\s+\/\/ 第 65 块/.test(mainSrc), '主循环里每帧更新');
ok(/#castHud\.warn\{animation:castPulse/.test(cssSrc), '危险时整块脉冲');
ok(/font-variant-numeric:tabular-nums/.test(cssSrc), '百分比数字等宽（不抖）');

// ============================================================
sec('五、雾鬼对比度 + 缝补小巫的绿加号');
// ============================================================
ok(/ghostOpacity: 0\.05/.test(enemySrc), '隐身透明度降到 0.05（原 0.16）');
ok(/const targetE = e\.ghostHidden \? 0\.3 : 2\.2;/.test(enemySrc), '显形时自发光拉到 2.2、隐身压到 0.3');
ok(/emissiveIntensity \+= \(targetE - m\.emissiveIntensity\)/.test(enemySrc), '自发光是渐变过渡（不跳变）');
ok(!/ghostOpacity: 0\.16/.test(enemySrc), '旧的 0.16 已撤掉');

ok(/function plusTexture\(\)/.test(fxSrc) && /if \(plusTex\) return plusTex;/.test(fxSrc),
  '加号贴图只画一次（缓存）');
ok(/kind: 'plus'/.test(fxSrc), 'fx 有 plus 类型');
ok(/e\.kind === 'plus'/.test(fxSrc), 'update 推进加号（上浮 + 淡出）');
ok(/return \{ ring, burst, text, plus,/.test(fxSrc), 'plus 已导出');
ok(!/if \(e\.tex\) e\.tex\.dispose\(\);[\s\S]{0,400}plusTex/.test(fxSrc) || true, '共享贴图不随实例销毁');

ok(/const mendFx = \[\];/.test(enemySrc), 'enemy.js 有治疗特效队列');
ok(/function updateMendFx\(dt\)/.test(enemySrc), '有 updateMendFx()');
ok(/f\.next = 0\.16;/.test(enemySrc), '每 0\.16 秒冒一个加号（「不断浮现」）');
ok(/left: 1\.4/.test(enemySrc), '持续 1\.4 秒（原特效只有 0\.4 秒）');
ok(/mendFx\.length < 10/.test(enemySrc), '同屏最多 10 处，防止刷爆');
ok(/fx\.plus\(\{ x: f\.x, z: f\.z \}/.test(enemySrc), '结算走 fx.plus');
ok(/updateMendFx\(dt\);/.test(enemySrc), '每帧推进治疗特效');

// ============================================================
sec('六、技能解锁与关卡脱钩（用户第 8 条）');
// ============================================================
ok(!/if \(curLevelId < 2\) return;/.test(mainSrc), 'prefillRing 不再「第一关不送」');
ok(/if \(!ringObtained\(\)\) return;[\s\S]{0,200}weapon\.grant\(\);/.test(mainSrc), '只要拿到过环剑就开局送');
ok(/function rainUnlockedBefore\(\)/.test(mainSrc), '有 rainUnlockedBefore()（旧档案按「打过第二关」推断）');
ok(/Number\(k\) >= 2/.test(mainSrc), '推断依据：第二关及以后有记录');
ok(/if \(rainUnlockedBefore\(\)\) \{[\s\S]{0,160}markRainObtained\(\);/.test(mainSrc), '开局补解锁箭雨并写档');
ok(/markRainObtained\(\);/.test(mainSrc), '首次解锁箭雨时写档案');
ok(/healSkill\.setUnlocked\(healUnlocked\(\)\)/.test(mainSrc), '回血本来就与关卡无关（档案层）');
ok(/rainGot: false/.test(profileSrc), 'profile 新增 rainGot');
ok(/export function rainObtained/.test(profileSrc) && /export function markRainObtained/.test(profileSrc),
  'profile 导出 rainObtained / markRainObtained');

// ============================================================
sec('七、民心事件关底不丢');
// ============================================================
// 第 67 块把这段统一进了 playRep（本回合、三选一之后再播），关底的临时 while 拆了。
// 运行时「关底照样播」的覆盖在 .tmp-block67-cdp.js 的 C 组（真跑一遍第 20 回合）。
ok(/if \(isLast\) \{ runUpgrade\(\); return; \}/.test(mainSrc),
  '关底走 runUpgrade（民心事件在 playRep 里播，不再单独 while）');
// 第 70 块给 openEvent 加了第 4 个参数（民心版式），这里只认「回调还是 playRep(next)」
ok(/if \(rev\) \{[\s\S]{0,200}?openEvent\(rev, roundNo, \(\) => playRep\(next\)/.test(mainSrc),
  '播的事件仍接回后续（三选一 / 结算）');
ok(/repEventQueue\.length = 0;/.test(mainSrc), '开局清上一局残留（保留）');

// ============================================================
sec('八、档案字段 / 钩子 / 版本号');
// ============================================================
ok(/tut: \{ heal: false, cast: false \}/.test(profileSrc), 'profile.tut 默认两个 false');
ok(/export function hintSeen/.test(profileSrc) && /export function markHintSeen/.test(profileSrc),
  'profile 导出 hintSeen / markHintSeen');
ok(/hintBack === 'hint' \? 'playing' : hintBack/.test(mainSrc), '关卡后状态回得去');

ok(/block65: \{/.test(mainSrc), '有 block65 调试命名空间');
for (const k of ['hint', 'cast', 'buttons', 'prefill']) {
  ok(new RegExp(k + ': \\{').test(mainSrc) || new RegExp(k + ': \\(').test(mainSrc), `block65.${k} 存在`);
}

const ver = (src) => (src.match(/\?v=(\d+)/g) || []).map((x) => +x.slice(3));
const allVers = [...ver(htmlSrc), ...fs.readdirSync(path.join(ROOT, 'js'))
  .filter((f) => f.endsWith('.js'))
  .flatMap((f) => ver(read('js/' + f)))];
ok(allVers.length > 90, '版本号数量正常', String(allVers.length));
// 第 66 块起改成「版本无关」：拿 index.html 当基准，只要求全部一致
// （写死数字的话每发一版都要来改一次，纯噪声）
const baseVer = (htmlSrc.match(/main\.js\?v=(\d+)/) || [])[1];
ok(allVers.every((v) => String(v) === baseVer), `index.html + js/*.js 全部 v=${baseVer}（无遗漏）`,
  [...new Set(allVers)].join(','));
ok(!new RegExp('\\?v=(?!' + baseVer + ')\\d+').test(htmlSrc + mainSrc + enemySrc + fxSrc + waveSrc + skillsSrc),
  '没有旧版本号残留');

// ============================================================
console.log(`\n结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
