// 第 85 块契约（纯 Node，不起浏览器）—— 用户三件事：
//   ①「木鱼灵吐出的气泡体积扩大」
//   ②「被命中时要求环剑停转」
//   ③「吐气泡的个数和频率上调」
//   A 泡的数值：r 变大 / 一次两颗 / 同场上限
//   B 频率：attackInterval 下调（前摇 windup 不砍 —— 那是玩家的反应窗）
//   C 环剑停转：weapon 有 holdOrbit + 只冻角度、enemy 命中时调、main 接上 combatCtx
//   D 无敌帧擦过去不算（不会顺手把环剑冻住）
//   E 文案：图鉴跟着改
//   F 版本号：index.html 与所有 js 一致
// 跑法：node .tmp-block85-test.mjs
import { readFileSync } from 'node:fs';
import { ENEMY_TYPES } from './js/enemy.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const enemySrc = readFileSync('js/enemy.js', 'utf8');
const weaponSrc = readFileSync('js/weapon.js', 'utf8');
const mainSrc = readFileSync('js/main.js', 'utf8');
const codexSrc = readFileSync('js/codex.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

const wd = ENEMY_TYPES.woodfish;
const B = wd.bubble;

// ============================================================
sec('一、泡的体积：0.42 → 0.62');
// ============================================================
ok(!!B, 'woodfish 还是走 cfg.bubble');
ok(B.r >= 0.55, `判定/视觉半径 ${B.r}（原来 0.42）`, String(B.r));
ok(B.r <= 0.8, `没大到离谱（${B.r} ≤ 0.8，别糊半屏）`, String(B.r));
// 视觉和判定必须同一个数：mesh.scale 用 cfg.r，命中判定用 b.r
ok(/mesh\.scale\.setScalar\(cfg\.r \?\? 0\.42\)/.test(enemySrc), '出生时 mesh.scale = cfg.r（视觉 = 判定半径）');
ok(/b\.mesh\.scale\.set\(b\.r \* wob, b\.r \/ wob, b\.r \* wob\)/.test(enemySrc), '每帧椭球呼吸也按 b.r 走');
ok(/if \(d <= b\.r \+ ctx\.playerRadius\)/.test(enemySrc), '命中判定用的是 b.r + 主角半径');
// 泡变大 → 不透明度压薄（不然 additive 会糊住半个屏幕）
const op = (enemySrc.match(/b\.mat\.opacity = ([0-9.]+) \+ ([0-9.]+) \* frac/) || []);
ok(op.length === 3 && Number(op[1]) <= 0.16, `透明度压薄了（基础 ${op[1]}，原来 0.18）`, op[0] || '未匹配');

// ============================================================
sec('二、个数与频率');
// ============================================================
ok(B.count === 2, `一次吐 ${B.count} 颗（原来 1 颗）`, String(B.count));
ok(B.max >= 6 && B.max <= 12, `同场上限 ${B.max}（多只木鱼灵也不糊屏）`, String(B.max));
ok(/if \(bubbles\.length >= \(cfg\.max \?\? 10\)\) return;/.test(enemySrc), 'spawnBubble 有硬上限（只挡新增，不改已经飞着的）');
ok(wd.attackInterval <= 2.8, `吐泡间隔 ${wd.attackInterval} 秒（原来 3.4）`, String(wd.attackInterval));
ok(wd.attackInterval > 2.0, `没快到看不过来（${wd.attackInterval} > 2.0）`, String(wd.attackInterval));
ok(wd.windup === 0.7, `前摇还是 0.7 秒（那是玩家的反应窗，不能被"调频率"顺手砍掉）`, String(wd.windup));
ok(wd.attackDuration === 1.2, '出手时长没动');
// 两颗必须真的分开，不然就是"一颗更亮"
ok(/const spread = cfg\.count > 1 \? \(idx - \(cfg\.count - 1\) \/ 2\) \* 0\.55 : 0;/.test(enemySrc),
  '两颗按 ±0.275 弧度扇形分开（0.34 → 0.55）');
ok(/for \(let j = 0; j < bubbles\.length; j\+\+\)/.test(enemySrc) && /const minD = b\.r \+ o\.r;/.test(enemySrc),
  '泡之间软分离（挨太近会叠成一坨，看不出是两颗）');
// 其余手感线不动：能甩掉 / 能打爆 / 定住
ok(B.speed === 2.6, '泡速仍是 2.6（慢于主角 4.4，横向能甩）');
ok(B.hp === 4, '泡还是 4 血（砍两下炸）');
ok(B.root === 1.2, '定住仍是 1.2 秒');

// ============================================================
sec('三、环剑停转');
// ============================================================
ok(B.orbitStop === 1.2, `泡命中会让环剑停转 ${B.orbitStop} 秒`, String(B.orbitStop));
ok(/orbitStop: cfg\.orbitStop \?\? 1\.2,/.test(enemySrc), 'spawnBubble 把 orbitStop 带到每颗泡上');
ok(/let orbitHold = 0;/.test(weaponSrc), 'weapon 有 orbitHold 状态');
ok(/if \(orbitHold > 0\) \{[\s\S]*?orbitHold = Math\.max\(0, orbitHold - dt\);[\s\S]*?\} else \{[\s\S]*?orbitAngle \+=/.test(weaponSrc),
  '停转只冻 orbitAngle（补剑 / 飞剑 / 雷链照常跑）');
ok(/function holdOrbit\(sec\)/.test(weaponSrc) && /orbitHold = Math\.max\(orbitHold, s\);/.test(weaponSrc),
  'holdOrbit 用 max 而不是相加（连着挨两颗不叠成 2.4 秒）');
ok(/orbitHold = 0;[\s\S]{0,120}granted = false;/.test(weaponSrc), 'reset 清掉停转');
ok(/holdOrbit,/.test(weaponSrc) && /get orbitHold\(\) \{ return orbitHold; \}/.test(weaponSrc), '导出 holdOrbit + orbitHold 读数（测试/调试用）');
// 停转 ≠ 停手：剑还在原处，照样碰伤怪
ok(/const hit = findHit\(x, z, list\);/.test(weaponSrc), '停转期间环剑仍然参与命中判定');
ok(/stopOrbit: \(sec\) => \{\s*weapon\.holdOrbit\(sec\);/.test(mainSrc), 'combatCtx.stopOrbit 接到 weapon.holdOrbit');
ok(/if \(!inv && ctx\.stopOrbit\) ctx\.stopOrbit\(b\.orbitStop\);/.test(enemySrc), '泡命中时才调（和定住同一个条件分支）');

// ============================================================
sec('四、无敌帧擦过去不算');
// ============================================================
const hitBlock = (enemySrc.match(/if \(d <= b\.r \+ ctx\.playerRadius\) \{[\s\S]{0,700}?\n      \}/) || [''])[0];
ok(/const inv = ctx\.isInvincible \? ctx\.isInvincible\(\) : false;/.test(hitBlock), '命中处先问无敌帧');
ok(/if \(!inv && ctx\.rootPlayer\)/.test(hitBlock) && /if \(!inv && ctx\.stopOrbit\)/.test(hitBlock),
  '定住和停转都被 !inv 挡住（无敌里擦过去不停环剑）');

// ============================================================
sec('五、文案');
// ============================================================
const desc = (codexSrc.match(/if \(cfg\.bubble\) return `([^`]+)`/) || [, ''])[1];
ok(desc.includes('一次吐'), '图鉴说清「一次吐几颗」', desc.slice(0, 40));
ok(desc.includes('环上的剑也跟着停转'), '图鉴说清「环剑会停转」');
ok(!desc.includes('**'), '图鉴文案没混进 markdown（textContent 不认）');
ok(mainSrc.includes('环剑也跟着停转'), '首次被泡住的那条提示也说了环剑停转');

// ============================================================
sec('六、版本号：全站一致');
// ============================================================
const base = (htmlSrc.match(/index\.html\?v=(\d+)|\.css\?v=(\d+)|\.js\?v=(\d+)/) || []).filter(Boolean);
const V = (htmlSrc.match(/\?v=(\d+)/) || [, ''])[1];
ok(!!V, 'index.html 里有版本号', V);
const { readdirSync } = await import('node:fs');
let bad = [];
for (const f of readdirSync('js')) {
  if (!f.endsWith('.js')) continue;
  const src = readFileSync('js/' + f, 'utf8');
  for (const m of src.matchAll(/\?v=(\d+)/g)) if (m[1] !== V) bad.push(f + ':' + m[1]);
}
ok(bad.length === 0, `js/*.js 里的 ?v= 全部 = ${V}`, bad.slice(0, 5).join(', '));
ok(Number(V) >= 96, `版本号 ≥ 96（实际 ${V}）`, V);

// ============================================================
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
