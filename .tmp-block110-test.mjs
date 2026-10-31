// 第 110 块 · 用户实测反馈三连修 —— 契约测试
// ① 铁傀儡不会自己移动找怪打 → golem.js 追击 / 回锚 / 场地夹取 / 朝向
// ② 照影（复制玩家面板的怪）血量双倍缩放修复 + 模型缩小
// ③ 寄存处看守暴怒后攻速大幅增加（rageGap 0.45 + 前摇收招整体提速）
// 运行：node .tmp-block110-test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
function ok(cond, name, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? `  [${extra}]` : ''}`); }
  else { fail++; console.log(`  XX  ${name}${extra ? `  [${extra}]` : ''}`); }
}
function sec(t) { console.log(`\n---- ${t} ----`); }

// 版本号从 index.html 动态读（铁律：测试不写死 ?v=N）
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];

const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const golemSrc = src('js/golem.js');
const enemySrc = src('js/enemy.js');
const mainSrc = src('js/main.js');

const { ENEMY_TYPES } = await import(`./js/enemy.js?v=${VER}`);

// ---------------- ① 铁傀儡主动追怪 ----------------
sec('① 铁傀儡主动追怪（golem.js）');
ok(/const IRON_SPEED = 1\.65/.test(golemSrc), '追怪移速常量 1.65（比主角慢半档）');
ok(/const IRON_LEASH = 7\.5/.test(golemSrc), '追击半径 7.5 格 —— 太远的怪不追');
ok(/const IRON_FOLLOW = 2\.2/.test(golemSrc), '没怪可打时走回主角的跟随距离 2.2');
ok(/function update\(dt, anchor\)/.test(golemSrc), 'update 接收 anchor（主角位置 + 场地半径）');
ok(/anchor\.r/.test(golemSrc) && /lim = anchor\.r - 0\.7/.test(golemSrc),
  '追怪后夹回场地（anchor.r - 0.7）');
ok(/hunting && nd > IRON_REACH \* 0\.85/.test(golemSrc),
  '走到拳距 85% 就停下出拳（不贴脸送死）');
ok(/g\.swing <= 0/.test(golemSrc.split('铁傀儡：不拉仇恨')[1].split('雪傀儡：拉仇恨')[0]),
  '甩臂动画期间站定不滑步');
ok(/g\.root\.rotation\.y = Math\.atan2\(/.test(golemSrc),
  '朝向走项目约定 rotY = atan2(dx, dz)');
ok(/near && nd <= IRON_REACH && g\.atkT <= 0/.test(golemSrc),
  '出拳仍只在拳距内（nd <= IRON_REACH），移动不改变出手判定');
// 雪傀儡保持站桩（仇恨锚点不能乱挪）
const snowBlock = golemSrc.split('雪傀儡：拉仇恨')[1].split('---- 贴脸磨血')[0];
ok(!/g\.x \+=/.test(snowBlock), '雪傀儡不挪窝（拉仇恨锚点必须站得住）');
ok(/golems\.update\(dt, \{ x: pos\.x, z: pos\.z, r: ARENA_R \}\)/.test(mainSrc),
  'main 每帧把主角位置 + 场地半径喂给傀儡系统');

// ---------------- ② 照影：血量修复 + 模型缩小 ----------------
sec('② 照影血量修复 + 模型缩小（enemy.js）');
const M = ENEMY_TYPES.mirror;
ok(M.mirror.hpRatio === 0.6, '血量口径不变：玩家上限 ×0.6');
ok(M.mirror.hpCap === 60, 'hpCap 26 → 60（「你越强它越疼」在终盘成立）', M.mirror.hpCap);
ok(M.mirror.hpFloor === 6, 'hpFloor 6 不变（早期别秒碎）');
ok(!/want \* \(e\.spawnScale/.test(enemySrc.split('function reMirror')[1].split('function handleMirror')[0]),
  'reMirror 不再乘 spawnScale.hp（回合倍率把影子抬到比本尊还厚的双倍缩放已移除）');
// 第 126 块：照影换成主角模型（= frog.js 的 TARGET_H 2.28），第 110 块那次「放小到 1.22」
// 是针对原来那只四足蛙的，已随模型一起作废。
ok(M.height === 2.28, '和主角一样高：height = 2.28（frog.js 的 TARGET_H）', M.height);
ok(M.radius === 0.6, '碰撞半径 0.60（比主角 BODY_R 0.65 略窄）', M.radius);
ok(!!M.file && existsSync(path.join(ROOT, M.file)), 'glb 还在盘上');

// ---------------- ③ 看守暴怒攻速 ----------------
sec('③ 看守暴怒攻速大增（enemy.js）');
const W = ENEMY_TYPES.warden.warden;
ok(W.rageGap === 0.45, 'rageGap 0.72 → 0.45（间隔 2.0s → 0.9s，被 floor 1.1 夹住）', W.rageGap);
ok(W.rageGap < 1 && W.rageSpeed > 1, '仍然满足「更快 + 更密」（block83 的老断言语义）');
ok(/const rageHaste = e\.raged \? 0\.72 : 1;/.test(enemySrc),
  '狂暴时前摇 / 收招整体 ×0.72（不然每招还慢悠悠 1 秒多，体感不到攻速变化）');
ok(/e\.wdWindup = \(move === 'fan'.*?\* rageHaste;/s.test(enemySrc),
  'wdWindup 套上 rageHaste');
ok(/e\.wdDur = \(move === 'slam'.*?\* rageHaste;/s.test(enemySrc),
  'wdDur 套上 rageHaste');
ok(/cdOf\(e, cfg\.gap \* \(e\.raged \? cfg\.rageGap : 1\), 1\.1\)/.test(enemySrc),
  '出手间隔仍走 cdOf（block96 立的规矩没被破坏）');

// ---------------- 版本 ----------------
sec('版本');
ok(/^\d+$/.test(VER || ''), `index.html 版本 = ${VER}`);
const stale = ['js/main.js', 'js/golem.js', 'js/enemy.js'].filter((f) => !src(f).includes(`?v=${VER}`));
ok(stale.length === 0, '三个改动文件都带当前版本号', stale.join(',') || 'clean');

console.log(`\n===== block110: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);
