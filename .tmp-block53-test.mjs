// 第 53 块 —— 用户报的七条（事件概率无反馈 / 二三关太暗 / 三只怪尺寸 / 箭雨无教程 / 轮播太慢）
// 纯 Node 跑：`node .tmp-block53-test.mjs`（cwd = naiwa-rouge）
import fs from 'fs';
import { ALL_EVENTS, eventChoices, resolveRoll, effectLines } from './js/events.js';
import { ENEMY_TYPES } from './js/enemy.js';
import { THEMES } from './js/scene.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const mainSrc = fs.readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
const sceneSrc = fs.readFileSync(new URL('./js/scene.js', import.meta.url), 'utf8');

// ============================================================
// 一、概率分支（用户报：「很多概率事件点完都是『这一夜什么都没发生』」）
// ============================================================
sec('一、概率分支能真的摇出结果（第 53 块修的 bug）');

// 把全库带 roll 的选项摊平
const rollChoices = [];
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    if (c.effects && c.effects.roll) rollChoices.push({ ev, c });
  }
}
ok(rollChoices.length >= 40, `带概率分支的选项有 ${rollChoices.length} 个（够做样本）`);

// 1.1 每个 roll 的概率和是 1（否则末支会吃掉剩余概率，玩家看到的赔率是假的）
let badSum = [];
for (const { ev, c } of rollChoices) {
  const sum = c.effects.roll.reduce((a, b) => a + b.p, 0);
  if (Math.abs(sum - 1) > 0.011) badSum.push(`${ev.id}/${c.label}=${sum.toFixed(3)}`);
}
ok(badSum.length === 0, '每个概率分支的概率和都是 1', badSum.slice(0, 5).join(' '));

// 1.2 每支 effects 都是对象（写成 undefined 会让 resolveRoll 返回 undefined，
//     结果页直接崩/空 —— 这是最容易漏的写法）
let badBranch = [];
for (const { ev, c } of rollChoices) {
  for (const b of c.effects.roll) {
    if (!b.effects || typeof b.effects !== 'object') badBranch.push(`${ev.id}/${c.label}`);
  }
}
ok(badBranch.length === 0, '每支概率分支都写了 effects 对象', badBranch.slice(0, 5).join(' '));

// 1.3 每一支都能被摇出来，且摇出来的对象**不再含 roll**（否则会被摇两次）
let unreachable = [], stillRoll = [];
for (const { ev, c } of rollChoices) {
  for (let i = 0; i < c.effects.roll.length; i++) {
    // 构造一个必定命中第 i 支的 rng：p 前缀里塞一个 0.999 的偏移
    let acc = 0;
    for (let k = 0; k < i; k++) acc += c.effects.roll[k].p;
    const target = acc + c.effects.roll[i].p * 0.5;
    const got = resolveRoll(c.effects, () => target);
    if (!got || got === c.effects) unreachable.push(`${ev.id}/${c.label}#${i}`);
    if (got && got.roll) stillRoll.push(`${ev.id}/${c.label}#${i}`);
  }
}
ok(unreachable.length === 0, '每一支都摇得出来', unreachable.slice(0, 5).join(' '));
ok(stillRoll.length === 0, '摇完不再是 roll 对象（不会被摇两次）', stillRoll.slice(0, 5).join(' '));

// 1.4 至少有一批分支能产出「看得见的数值」，证明结果页有东西可写
let withLines = 0;
for (const { c } of rollChoices) {
  for (const b of c.effects.roll) {
    if (effectLines(resolveRoll(c.effects, () => 0)).length > 0) { withLines++; break; }
    if (effectLines(b.effects).length > 0) { withLines++; break; }
  }
}
ok(withLines >= rollChoices.length * 0.85,
  `九成以上的概率选项至少有一支能写出数值（${withLines}/${rollChoices.length}）`);

// 1.5 源码级防回退：普通选项必须先 resolveRoll 再结算、再显示
ok(/const eff = resolveRoll\(choice\.effects \|\| \{\}, rngOf\('event'\)\)/.test(mainSrc),
  'chooseEventOption 先用事件种子流摇开概率分支');
ok(/applyEffects\(eff, nextRound\)/.test(mainSrc), '结算用的是摇出来的那一支（不是原始 roll）');
ok(/const lines = effectLines\(eff\)/.test(mainSrc), '结果页列的也是摇出来的那一支');
ok(!/applyEffects\(choice\.effects, nextRound\)/.test(mainSrc),
  '没有残留「把 roll 原样丢给 applyEffects」的老写法');
ok(/这一把落空了，什么也没拿到/.test(mainSrc),
  '摇到空手有时间线文案（不再一律「这一夜什么也没发生」）');

// ============================================================
// 二、第二 / 三关亮度（用户报「太暗」）
// ============================================================
sec('二、第二关 / 第三关提亮');
const crypt = THEMES.crypt, ash = THEMES.ash, meadow = THEMES.meadow;
for (const [name, th, fogOld] of [['第二关 crypt', crypt, 0.0152], ['第三关 ash', ash, 0.0168]]) {
  ok(th.hemiIntensity >= 1.4, `${name} 天光强度 ≥ 1.4（实际 ${th.hemiIntensity}）`);
  ok(th.moonBase >= 3.0, `${name} 月光基准 ≥ 3.0（实际 ${th.moonBase}）`);
  ok(th.fogDensity < fogOld, `${name} 雾更淡了（${th.fogDensity} < 旧 ${fogOld}）`);
  // 亮度用「感知色值」比：底色 / 雾色的 RGB 求和必须比旧值高一截
  const lum = (hex) => ((hex >> 16) & 255) + ((hex >> 8) & 255) + (hex & 255);
  ok(lum(th.bg) >= 60, `${name} 底色不再接近纯黑（RGB 和 ${lum(th.bg)}）`);
  ok(lum(th.fog) >= 110, `${name} 雾色提亮了（RGB 和 ${lum(th.fog)}）`);
  ok(th.rimIntensity >= 0.9, `${name} 补光加强（实际 ${th.rimIntensity}）`);
}
// 别过头：二关不该比第一关还亮，否则「夜色」这个基调就没了
ok(crypt.moonBase <= meadow.moonBase + 0.6, '第二关没有亮过第一关（否则夜色基调丢了）');
ok(/g\.fillStyle = '#3a3050'/.test(sceneSrc), '枯土地面底色提亮到 #3a3050');
ok(/g\.fillStyle = '#3b2822'/.test(sceneSrc), '焦土地面底色提亮到 #3b2822');

// ============================================================
// 三、三只怪的尺寸 + 卫队缩小
// ============================================================
sec('三、模型尺寸（用户点名的三只）');
ok(Math.abs(ENEMY_TYPES.hexer.height - 1.40 * 1.8) < 0.001,
  `咒面图腾 ×1.8 → 2.52（实际 ${ENEMY_TYPES.hexer.height}）`);
ok(Math.abs(ENEMY_TYPES.pyro.height - 1.22 * 1.2) < 0.001,
  `焚火魔 ×1.2 → 1.464（实际 ${ENEMY_TYPES.pyro.height.toFixed(3)}）`);
ok(Math.abs(ENEMY_TYPES.hierarch.height - 1.62 * 2) < 0.001,
  `孢冠菌王 ×2 → 3.24（实际 ${ENEMY_TYPES.hierarch.height}）`);
ok(ENEMY_TYPES.hierarch.summon.scale === 0.7, '菌王的四个卫队缩到 0.7 倍');
ok(ENEMY_TYPES.hierarch.summon.orbit >= 1.7, '卫队轨道跟着放大（不再贴腿）');
// 卫队的缩放是**按实例**的：warrior 本体不能被改小（第一关还在用同一份配置）
ok(Math.abs(ENEMY_TYPES.warrior.height - 1.38) < 0.001,
  `第一关的战士身高没被动过（${ENEMY_TYPES.warrior.height}）`);
ok(/scale: e\.cfg\.summon\.scale \?\? 1/.test(fs.readFileSync(new URL('./js/enemy.js', import.meta.url), 'utf8')),
  '召唤时把 summon.scale 传给 spawn');
// 放大后碰撞半径也得跟上，不然大模型会和小怪穿模
ok(ENEMY_TYPES.hexer.radius >= 0.55, `图腾碰撞半径跟上（${ENEMY_TYPES.hexer.radius}）`);
ok(ENEMY_TYPES.hierarch.radius >= 0.7, `菌王碰撞半径跟上（${ENEMY_TYPES.hierarch.radius}）`);

// ============================================================
// 四、箭雨教程（用户报「拿到箭雨没提示没教程」）
// ============================================================
sec('四、箭雨教程卡');
ok(/arrowrain: \{/.test(mainSrc), 'WEAPON_TUT 里有 arrowrain 条目');
ok(/label: '技能教程'/.test(mainSrc), '箭雨卡标题是「技能教程」（不是武器教程）');
ok(/wait: 'rain'/.test(mainSrc), '最后一步要求真的放一次箭雨');
ok(/arrowRain\.strikeCount > 0/.test(mainSrc), 'wtTick 用 strikeCount 判定放没放出去');
ok(/queueWeaponTut\('arrowrain'/.test(mainSrc), '拿环剑时把箭雨教程排进队列');
ok(/const withRain = curLevelId >= 2/.test(mainSrc), '第一关不解锁箭雨（沿用第 47 块定案）');
ok(/withRain \? \(\) => queueWeaponTut\('arrowrain', next\) : next/.test(mainSrc),
  '教程顺序：环剑 → 箭雨 → 回合链（不是两个一起塞队列）');
ok(/t\.label \|\| '武器教程'/.test(mainSrc), '卡片顶部标题按条目自己的 label 走');

// ============================================================
// 五、加载轮播速度（用户报「切得太慢」）
// ============================================================
sec('五、加载轮播 1.8 倍速');
const m = mainSrc.match(/const LOAD_TIP_MS = (\d+)/);
ok(!!m, '轮播间隔是常量（好调）');
ok(m && Math.abs(+m[1] - 3200 / 1.8) < 3, `间隔 3200 → ${m && m[1]}ms（×1.8 速）`);
const cssSrc = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
ok(/\.ld-tip\{[^}]*transition:opacity \.2s/.test(cssSrc), '淡出过渡压到 0.2s（和切换节奏对齐）');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：\n  ' + fails.join('\n  ')); process.exit(1); }
