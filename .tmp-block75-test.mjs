// 第 75 块契约测试：擦名者的出场时机 + 第六关「并联体」电弧怪
// ⚠️ 测试里别写死版本号（HANDOFF 铁律），以 index.html 为基准
import { readFileSync } from 'node:fs';
import {
  buildSpawns, LEVEL_1, LEVEL_5, LEVEL_6, LEVELS_BY_ID, levelTypes,
} from './js/wave.js';
import { ENEMY_TYPES } from './js/enemy.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};
const sec = (t) => console.log('\n' + t);

// ============================================================
sec('一、擦名者：插在回合中段，而不是排到最后');
// ============================================================
for (const rn of [8, 12, 17, 20]) {
  const list = buildSpawns(rn, {}, LEVEL_5);
  const last = list[list.length - 1].delay;
  const er = list.filter((s) => s.type === 'eraser');
  ok(er.length > 0, `第 ${rn} 回合有擦名者`, String(er.length));
  for (const e of er) {
    const k = e.delay / last;
    ok(k >= 0.38 && k <= 0.62, `第 ${rn} 回合擦名者落在进度 ${(k * 100).toFixed(0)}%（40~60%）`);
  }
  // 关键回归：它不能再是「最后一只」
  ok(list[list.length - 1].type !== 'eraser' || er.length === list.length,
    `第 ${rn} 回合擦名者不是压轴的那只（压轴是 ${list[list.length - 1].type}）`);
}

sec('二、生成表必须严格递增（update 是按顺序消费的）');
for (const rn of [1, 5, 8, 13, 20]) {
  const list = buildSpawns(rn, {}, LEVEL_5);
  let mono = true;
  for (let i = 1; i < list.length; i++) {
    if (list[i].delay < list[i - 1].delay) mono = false;
  }
  ok(mono, `第 ${rn} 回合 delay 单调不减（${list.length} 只）`);
  ok(list.every((s) => Number.isFinite(s.delay) && s.delay > 0), `第 ${rn} 回合 delay 全是正数`);
}

sec('三、擦名者用更近的出生圈（near 标记）');
{
  const list = buildSpawns(20, {}, LEVEL_5);
  const er = list.filter((s) => s.type === 'eraser');
  ok(er.every((s) => s.near === true), '擦名者带 near 标记');
  const others = list.filter((s) => s.type !== 'eraser');
  ok(others.every((s) => !s.near), '别的怪没有 near 标记（行为不变）');
  // 出生半径系数：0.52 → 五关 18.2 × 0.52 ≈ 9.5 格，比 attackRange(7) 略远一点
  const mainSrc = readFileSync(new URL('./js/wave.js', import.meta.url), 'utf8');
  ok(/ERASER_NEAR\s*=\s*0\.52/.test(mainSrc), 'ERASER_NEAR = 0.52');
  ok(/pickSpawn\(sp\.near \?/.test(mainSrc), 'update 里按 near 传更近的半径');
}

sec('四、擦名者会主动走过来（移速 / 保持距离）');
{
  const cfg = ENEMY_TYPES.eraser;
  ok(cfg.speed >= 1.2, `移速 ${cfg.speed} ≥ 1.2（原来 0.55 太慢，走不到玩家身边）`);
  ok(cfg.speed <= 2.0, `移速 ${cfg.speed} ≤ 2.0（不能比玩家快）`);
  ok(Math.abs(cfg.keepDistance - 4.2) < 1e-6, `keepDistance = 4.2（主动靠到 4 格缠着）`);
  ok(!cfg.damage, '它仍然一次都不伤人');
  // 逃跑的绝对速度要和改之前一样（0.55 × 3.9 ≈ 2.15）
  const fleeAbs = cfg.speed * cfg.erase.fleeSpeed;
  ok(Math.abs(fleeAbs - 2.15) < 0.15, `逃跑绝对速度 ${fleeAbs.toFixed(2)} ≈ 2.15（手感不变）`);
  ok(cfg.windup > 0 && cfg.attackDuration > cfg.windup, 'attackDuration 必须大于 windup（第 69 块的坑）');

  const src = readFileSync(new URL('./js/enemy.js', import.meta.url), 'utf8');
  ok(/if \(dist > keep \+ 0\.45\)/.test(src), '靠近条件从 attackRange 改成 keep');
  // 第 77 块：死区底线从 keep-0.35 降到 keep-1.5 —— 原来的 0.35 会和
  // 「看不见就靠近」在视野边缘（竖屏横向约 4 格 vs keep 4.2）互相夹死。
  ok(/if \(dist < keep - 1\.5\)/.test(src), '后退留了死区（第 77 块降到 keep-1.5，不与靠近重叠）');
}

// ============================================================
sec('五、第六关新怪：并联体（成对 · 电弧网）');
// ============================================================
{
  const cfg = ENEMY_TYPES.arc;
  ok(!!cfg, '第六关第二只新怪存在（arc / 并联体）');
  ok(cfg.name === '并联体', `名字是「${cfg.name}」`);
  ok(typeof cfg.file === 'string' && cfg.file.startsWith('assets/monsters/'), '有自己的模型文件');
  ok(cfg.file !== ENEMY_TYPES.reboot.file, '模型不和重启体重复');
  ok(!cfg.animFamily, '静态模型不写 animFamily（resolveClipAliases 安全返回空表）');
  ok(cfg.arc && cfg.arc.damage > 0 && cfg.arc.cd > 0, '电弧有伤害与节流冷却');
  ok(cfg.arc.hitR > 0 && cfg.arc.hitR < 1, `判定半径 ${cfg.arc.hitR}（不吃满屏幕）`);
  ok(cfg.hp >= 8, `血厚（${cfg.hp}）—— 并联体比同期普通怪厚得多（第 82 块加到 12，第 95 块按用户要求降到 8），拆网要有成本`);

  const types = levelTypes(LEVEL_6);
  ok(types.includes('arc'), '第六关的预载表里有 arc');
  ok(types.includes('reboot') && types.includes('arc'),
    '第六关至少两种「本关新增」的怪（重启体 + 并联体）');

  // 第 80 块（用户定案）：「不需要成对出现，两个及两个以上就 OK」。
  // 所以这里不再要求偶数，改成断言「真的有奇数回合」—— 有奇数才证明成对限制真去掉了。
  let odd = 0, maxN = 0, appeared = 0;
  for (const r of LEVEL_6.rounds) {
    const n = r.arc || 0;
    if (n % 2 === 1) odd++;
    maxN = Math.max(maxN, n);
    if (n > 0) appeared++;
  }
  ok(odd >= 1, `至少一个回合的并联体是奇数（${odd} 个）—— 不必成对`);
  ok(maxN <= 4, `单回合最多 ${maxN} 只（4 只 = C(4,2) = 6 条电弧）`);
  ok(appeared >= 10, `${appeared} 个回合会出场（不是只露一次脸）`);
  ok(LEVEL_6.order.some(([t]) => t === 'arc'), 'order 里有 arc（会被刷出来）');
}

sec('六、电弧网：n 只 = C(n,2) 条线，碰到掉血');
{
  const src = readFileSync(new URL('./js/enemy.js', import.meta.url), 'utf8');
  ok(/function updateArcNet/.test(src), '有 updateArcNet');
  ok(/updateArcNet\(dt, ctx\)/.test(src), 'update 里每帧调用');
  ok(/for \(let j = i \+ 1; j < nodes\.length; j\+\+\)/.test(src), '两两组合（组合数，不是配对）');
  ok(/arcZapCd/.test(src), '有全局掉血节流');
  ok(/function distToSeg/.test(src), '用「点到线段距离」判定');
  ok(/ctx\.hurtPlayer\(cfg\.damage \|\| 1, 'arc'\)/.test(src), '命中走 hurtPlayer（第 82 块起 source 传 arc，无视无敌时段）');
  // C(4,2) = 6
  const n = 4;
  ok((n * (n - 1)) / 2 === 6, '4 只 = 6 条线');
}

sec('七、重启体重启次数改成 1 次（用户定案）');
{
  ok(ENEMY_TYPES.reboot.reboot.times === 1, `times = ${ENEMY_TYPES.reboot.reboot.times}`);
  const src = readFileSync(new URL('./js/enemy.js', import.meta.url), 'utf8');
  ok(/times: 1,\s+\/\/ 第 75 块/.test(src), '源码注释交代了为什么改');
}

sec('八、版本号（以 index.html 为基准）');
{
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const m = html.match(/main\.js\?v=(\d+)/);
  ok(!!m, 'index.html 里有版本号');
  const VER = m[1];
  ok(Number(VER) >= 85, `版本号 ${VER} ≥ 85`);
  const mainSrc = readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
  const imps = [...mainSrc.matchAll(/from '\.\/[a-zA-Z]+\.js\?v=(\d+)'/g)].map((x) => x[1]);
  ok(imps.length > 20 && imps.every((v) => v === VER),
    `main.js 所有 import 都是 ${VER}`, [...new Set(imps)].join(','));
  const waveSrc = readFileSync(new URL('./js/wave.js', import.meta.url), 'utf8');
  const wimps = [...waveSrc.matchAll(/from '\.\/[a-zA-Z]+\.js\?v=(\d+)'/g)].map((x) => x[1]);
  ok(wimps.every((v) => v === VER), 'wave.js 的 import 版本一致', [...new Set(wimps)].join(','));
}

console.log(`\n第 75 块契约：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
