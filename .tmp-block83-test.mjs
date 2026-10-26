// 第 83 块契约（纯 Node，不起浏览器）：
//   A 关卡表：第八关还在（arena 18 / 20 回合 / ossuary / 整关系数）
//   B 队形系统彻底删干净（无名者 / 旗手 / squad* 一个不留）
//   C 寄存处看守 warden：配置 / 动画族 / 三招数值 / 模型文件
//   D 寄存柜新机制：cap 8 / 5 秒封柜 / 3.6 格按钮范围 / addTag · takeAll
//   E 接线：任何怪死亡都掉牌 / 召唤吃回合倍率 / 面板与按钮 / 离开 playing 收面板
//   F 任务 2：临时事件数值放大 + hint 数字与实际一致（全表核对）
//   G 版本号：index.html 与所有 js 一致
// 跑法：node .tmp-block83-test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { LEVELS_BY_ID, levelTypes } from './js/wave.js';
import { ENEMY_TYPES } from './js/enemy.js';
import { ALL_EVENTS, eventChoices } from './js/events.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const enemySrc = readFileSync('js/enemy.js', 'utf8');
const waveSrc = readFileSync('js/wave.js', 'utf8');
const mainSrc = readFileSync('js/main.js', 'utf8');
const codexSrc = readFileSync('js/codex.js', 'utf8');
const depositSrc = readFileSync('js/deposit.js', 'utf8');
const eventsSrc = readFileSync('js/events.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');
const cssSrc = readFileSync('style.css', 'utf8');

const L8 = LEVELS_BY_ID[8];

// ============================================================
sec('一、关卡表：第八关 · 骨塔寄存层');
// ============================================================
ok(!!L8, 'LEVELS_BY_ID[8] 存在');
ok(L8 && L8.name.includes('寄存层'), '关卡名是「骨塔寄存层」', L8 && L8.name);
ok(L8 && L8.theme === 'ossuary', '主题是 ossuary', L8 && L8.theme);
ok(L8 && L8.arena === 18, 'arena 18', L8 && L8.arena);
ok(L8 && L8.rounds.length === 20, '20 回合', L8 && L8.rounds.length);
ok(L8 && L8.scale.hpMul > 1.20 && L8.scale.dmgMul > 1.45, '整关系数 hpMul 1.28 / dmgMul 1.55', L8 && JSON.stringify(L8.scale));
ok(L8 && L8.deposit && L8.deposit.summon === 'warden', '柜子的召唤物点名 warden', L8 && JSON.stringify(L8.deposit));

// ============================================================
sec('二、队形系统彻底删干净（第 83 块用户要求：直接换掉）');
// ============================================================
ok(!ENEMY_TYPES.ranker, 'ENEMY_TYPES 里没有 ranker（无名者）');
ok(!ENEMY_TYPES.bearer, 'ENEMY_TYPES 里没有 bearer（旗手）');
ok(!/squad/i.test(enemySrc), 'enemy.js 里一个 squad 都不剩（队形整块删）');
ok(!/bearerPole|SQUAD_SLOTS|joinSquad|updateSquads/.test(enemySrc), '槽位 / 加入 / 更新 三个函数名都不在了');
ok(!/ranker|bearer/.test(enemySrc), 'enemy.js 里不再出现 ranker / bearer 字样');
ok(!/ranker|bearer/.test(waveSrc), 'wave.js 的第八关表也不再点名这两只');
ok(!/ranker|bearer/.test(codexSrc), '图鉴里没有残留的两条专属文案');

// ============================================================
sec('三、寄存处看守 warden（满柜召唤的 boss）');
// ============================================================
const W = ENEMY_TYPES.warden;
ok(!!W, 'ENEMY_TYPES.warden 存在');
ok(W && W.boss === true, '标了 boss');
ok(W && W.animFamily === 'brute', '用 brute 动画族（第 83 块新增）', W && W.animFamily);
ok(W && W.file === 'assets/monsters/deposit-warden.glb', '自己的模型 deposit-warden.glb', W && W.file);
ok(W && existsSync(W.file), '模型文件真的在磁盘上');
ok(W && W.hp === 20, '基础血量 20（还会再乘回合倍率）', W && W.hp);
ok(W && W.height === 3.05 && W.sourceHeight === 2.99, '身高 3.05（正交相机实测标定 2.99）', W && `${W.height}/${W.sourceHeight}`);
ok(W && W.warden && W.warden.sweepR >= 3 && W.warden.slamR > W.warden.sweepR, '横扫 / 砸地的半径分档（sweepR < slamR）',
  W && JSON.stringify(W.warden));
ok(W && W.warden.rageAt > 0 && W.warden.rageAt < 0.5, '半血暴怒阈值在 45%', W && W.warden.rageAt);
ok(W && W.warden.rageSpeed > 1 && W.warden.rageGap < 1, '暴怒 = 更快 + 更密的出手', W && `${W.warden.rageSpeed}/${W.warden.rageGap}`);
ok(/CHANNEL_KEYS|brute:/.test(enemySrc) || /brute: \{/.test(enemySrc), 'CLIP_FAMILIES 里有 brute 条目');
ok(/handleWarden/.test(enemySrc) && /performWardenMove/.test(enemySrc), '三招分派与执行都在');
ok(/function clearWardenFx/.test(enemySrc) && /wardenStrikes\.length = 0/.test(enemySrc), 'reset 会清掉落点圈与飞行木牌');

// ============================================================
sec('四、寄存柜：满 8 封柜 → 5 秒 → 召唤');
// ============================================================
const CAP = (depositSrc.match(/const CAP = (\d+)/) || [])[1];
const LOCK = (depositSrc.match(/const LOCK_DELAY = ([\d.]+)/) || [])[1];
const RANGE = (depositSrc.match(/const RANGE = ([\d.]+)/) || [])[1];
ok(CAP === '8', '容量 8', CAP);
ok(Number(LOCK) === 5, '封柜缓冲 5 秒', LOCK);
ok(Number(RANGE) >= 3.4 && Number(RANGE) <= 4, '按钮出现范围 3.6 格', RANGE);
ok(/export function addTag|addTag,/.test(depositSrc), '导出 addTag（任何怪死了都进柜）');
ok(/takeAll/.test(depositSrc), '导出 takeAll（输对四位数字全清）');
ok(!/export .*holdTake|HOLD/.test(depositSrc), '旧「站桩取牌 1.1 秒」的 HOLD 已经删掉');

// ============================================================
sec('五、接线：掉牌 / 召唤 / 面板');
// ============================================================
ok(/deposit\.addTag\(1\)/.test(mainSrc), '死亡钩子：任意怪倒下都 addTag(1)');
ok(/enemies\.spawn\('warden'/.test(mainSrc), '满柜后从柜门口召唤 warden');
ok(/roundScale\(level\.roundNo, level\.level\)/.test(mainSrc), '召唤物吃本回合倍率（不然第 15 回合同样 20 血）');
ok(/hpScale: sc\.hp, damageScale: sc\.damage, speedScale: sc\.speed/.test(mainSrc), '三档倍率都传进去了');
ok(/codeOpen && gameState !== 'playing'\) closeCode/.test(mainSrc), '离开 playing 立刻收面板');
ok(/if \(codeDone\) return;/.test(mainSrc), 'finishCode 只结一次（否则倒计时归零后每帧重置定时器，面板关不掉）');
ok(/const CP_TIME = 12/.test(mainSrc), '一次输入给 12 秒');
ok(/const CP_RETRY = 3/.test(mainSrc), '输错冷却 3 秒');
ok(/id="depositBtn"/.test(htmlSrc), 'index.html 有取牌按钮');
ok(/id="codePanel"/.test(htmlSrc) && /id="cpKeys"/.test(htmlSrc), 'index.html 有四位数字面板与内置键盘');
ok(/\.deposit-btn/.test(cssSrc) && /\.code-panel/.test(cssSrc), 'style.css 里两套样式都在');
ok(/HINTS[\s\S]{0,4000}deposit: \{/.test(mainSrc), 'HINTS 里有关卡开头的新手教程');
ok(/function queueDepositHint/.test(mainSrc) && /curLevelId !== 8/.test(mainSrc), '教程只挂在第八关、只弹一次');

// ============================================================
sec('六、任务 2：临时事件数值放大 + 文案跟着变');
// ============================================================
ok(/const TEMP_SCALE = \{/.test(eventsSrc) && /const TEMP_LEVEL = \{/.test(eventsSrc), '倍数表在 events.js 里（唯一真相源）');
ok(/drain 每秒掉血\*\*不动\*\*/.test(eventsSrc), 'drain 明确不放大（它本来就要命）');
ok(/function rebaseHint/.test(eventsSrc), 'hint 里的数字从新值反算');
ok(/const TEMP_BOOSTED = new Set\(\)/.test(eventsSrc), '同一个事件只放大一次（三个池子共用对象，不然叠乘）');

// 全表核对：文案提了这个属性，就必须出现实际生效的数字
const PCT_DISPLAY = new Set(['attackSpeed', 'critRate', 'critDamage', 'lifesteal', 'goldRate', 'swordOrbit', 'swordDamage']);
const TOKENS = {
  countScale: ['怪物数量'], speedScale: ['怪物移速'], attackRange: ['攻击范围'],
  attackSpeed: ['攻速', '攻击速度'], critDamage: ['暴击伤害'], critRate: ['暴击'],
  hpRegen: ['生命回复', '每秒回血'], maxHp: ['最大生命', '生命上限'], armor: ['防御'],
  moveSpeed: ['移速', '移动速度'], goldRate: ['金币掉落'], swordOrbit: ['剑转速'],
  swordDamage: ['剑伤害'], attack: ['攻击'], lifesteal: ['吸血'], luck: ['幸运'],
};
const txt = (v, p) => (v >= 0 ? '+' : '-') + (p ? `${Math.round(Math.abs(v) * 100)}%` : Math.abs(v).toFixed(1));
function wantLines(fx) {
  const out = [];
  if (fx.level && fx.level.countScale != null) out.push(['countScale', txt(fx.level.countScale - 1, true)]);
  if (fx.level && fx.level.speedScale != null) out.push(['speedScale', txt(fx.level.speedScale - 1, true)]);
  for (const m of fx.mods || []) {
    const p = m.pct != null;
    out.push([m.stat, txt(p ? m.pct : m.flat, p || PCT_DISPLAY.has(m.stat))]);
  }
  return out;
}
let bad = [];
let tempChoices = 0;
let drainKept = 0;
for (const ev of ALL_EVENTS) {
  for (const c of eventChoices(ev)) {
    const fx = c.effects;
    if (!fx) continue;
    const groups = fx.roll ? fx.roll.map((b) => b.effects) : [fx];
    for (const g of groups) {
      if (!g) continue;
      if (g.mods || g.level) tempChoices++;
      if (g.drain && g.drain <= 0.45) drainKept++;
      for (const [stat, want] of wantLines(g)) {
        const toks = TOKENS[stat] || [];
        if (!toks.some((t) => (c.hint || '').includes(t))) continue;      // 文案没提这项（文学描述）
        if (!(c.hint || '').includes(want)) bad.push(`${ev.id}/${c.label}/${stat}: 应为 ${want}，文案是「${c.hint}」`);
      }
    }
  }
}
ok(tempChoices > 150, `临时选项仍有一大批（${tempChoices} 组）`);
ok(bad.length === 0, 'hint 数字与 effects 逐个对得上', bad.slice(0, 3).join(' | '));
ok(drainKept >= 2, `drain 保持原值没有被放大（${drainKept} 处）`);

// 抽几条看一眼「确实变大了」
function findChoice(id, label) {
  const ev = ALL_EVENTS.find((e) => e.id === id);
  if (!ev) return null;
  return eventChoices(ev).find((c) => c.label === label) || null;
}
const c1 = findChoice('coldWave', '烧掉半垛干草');
ok(c1 && c1.effects.mods[0].flat <= -0.5, '寒潮：下回合攻击 -0.2 → -0.6（原来太轻）', c1 && JSON.stringify(c1.effects.mods));
ok(c1 && c1.hint.includes('-0.6'), '寒潮文案同步成 -0.6', c1 && c1.hint);
const c2 = findChoice('moonlight', '借着亮赶路');
ok(c2 && c2.effects.mods[0].pct >= 0.2, '月光：下回合移速 10% → 25%', c2 && JSON.stringify(c2.effects.mods));
const c3 = findChoice('threeRoads', '走中间的白路');
ok(c3 && c3.effects.level.countScale <= 0.72, '三岔路：怪物数量 -15% → -30%', c3 && JSON.stringify(c3.effects.level));

// ============================================================
sec('七、版本号一致');
// ============================================================
const V = (htmlSrc.match(/\?v=(\d+)/) || [])[1];
const jsFiles = ['main', 'enemy', 'wave', 'events', 'deposit', 'codex', 'scene'];
const mismatched = jsFiles.filter((f) => {
  const s = readFileSync(`js/${f}.js`, 'utf8');
  const vs = [...s.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  return vs.some((x) => x !== V);
});
// 第 84 块 bump 到 95：这里跟着改，断言仍然是「index.html 与所有 js 一致」
ok(V === '95', 'index.html 版本号 v=95', V);
ok(mismatched.length === 0, 'js 里的 ?v= 全部一致', mismatched.join(','));

console.log(`\n=== 第 83 块契约：通过 ${pass} / 失败 ${fail} ===`);
if (fails.length) console.log(fails.map((f) => '  · ' + f).join('\n'));
process.exit(fail ? 1 : 0);
