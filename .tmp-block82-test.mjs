// 第 82 块契约（纯 Node，不起浏览器）—— 四条用户反馈 + 第九关：
//   A 并联体：两两**实时**间距 ≥ minGap（硬约束）、血量大幅提高、电弧无视无敌时段
//   B 井蛙：hp 8 / 舌头拖拽 4.5（用户定「改到 8，4.5」）
//   C 盲盒涨价 6% → 5%（第 94 块又降到 3%，这里的断言跟着改成 3%）
//   D 木鱼灵：不再复用咒面图腾的 hex 圈，改成追踪泡（含定住 / 可打爆 / 主角的应对口）
//   E 第九关 · 骨塔登记庭 + 称量官（全场叠层 + 明显特效 + 死了清场）
//   F 文案：图鉴 / 回合提示都跟着改了
//   G 版本号：index.html 与所有 js 一致
// 跑法：node .tmp-block82-test.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { LEVELS_BY_ID, levelTypes } from './js/wave.js';
import { ENEMY_TYPES } from './js/enemy.js';
import { BOX_PRICE_STEP, boxCost } from './js/metaShop.js';

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
const sceneSrc = readFileSync('js/scene.js', 'utf8');
const storySrc = readFileSync('js/story.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');
const weaponSrc = readFileSync('js/weapon.js', 'utf8');

// ============================================================
sec('一、并联体：实时两两间距 / 血量 / 电弧无视无敌时段');
// ============================================================
const arc = ENEMY_TYPES.arc;
ok(arc.hp >= 12, `血量大幅提高（hp ${arc.hp}，原 3.2）`, String(arc.hp));
ok(arc.arc.minGap >= 8, `minGap ${arc.arc.minGap}（原 3.0）`, String(arc.arc.minGap));
// 实时距离要成立，分离必须**每帧补满差额**（不是补 15%）
ok(/let moved = false;/.test(enemySrc) && /ARC_PUSH_MAX/.test(enemySrc),
  'separateArcs 有硬约束循环 + 单帧位移限速');
ok(/const push = Math\.min\(need \* 0\.5, maxStep\);/.test(enemySrc),
  '每帧把差额补满（Math.min(need*0.5, maxStep)）');
ok(/function seatArc\(e\)/.test(enemySrc) && /if \(cfg\.arc\) seatArc\(e\);/.test(enemySrc),
  '新并联体落地即摆到合规位置（seatArc）');
ok(/for \(let pass = 0; pass < 4; pass\+\+\)/.test(enemySrc), '分离迭代 4 轮（多只互相抵消时收敛）');
// 出口：ignore iframe
ok(/ctx\.hurtPlayer\(cfg\.damage \|\| 1, 'arc'\)/.test(enemySrc), '电弧伤害 source 传 arc');
ok(/const isArc = source === 'arc';/.test(mainSrc) && /const noIframe = isHazard \|\| isArc;/.test(mainSrc),
  'main 的 hurtPlayer 把 arc 和 hazard 一起归入「无视无敌帧」');
ok(/if \(!noIframe\) iframe = IFRAME;/.test(mainSrc), '电路伤害不会顺手刷出无敌帧（也不能拿它刷无敌）');
ok(/if \(noIframe && relics\.thornsHit\)/.test(mainSrc) === false && /if \(!noIframe && relics\.thornsHit\)/.test(mainSrc),
  '电弧不触发棘甲反伤');
// 观测口
ok(/arcGaps: \(\) =>/.test(enemySrc), '暴露 arcGaps（实时间距，测试要读它）');
// 图鉴说法同步
const arcDesc = (codexSrc.match(/if \(cfg\.arc\) return '([^']+)'/) || [, ''])[1];
ok(arcDesc.includes('8 格'), '图鉴里写的是 8 格（不是旧的 3 格）');
ok(arcDesc.includes('无视无敌时段'), '图鉴说清无视无敌时段');

// ============================================================
sec('二、井蛙：hp 8 / 拖拽 4.5（用户定「改到 8，4.5」）');
// ============================================================
const frog = ENEMY_TYPES.wellfrog;
ok(frog.hp === 8, `井蛙 hp = 8（实际 ${frog.hp}）`);
ok(frog.tongue.pull === 4.5, `舌头拖拽 4.5（实际 ${frog.tongue.pull}）`);
ok(frog.tongue.hp === 4, '舌头还是 4 血（要有足够的时间砍，也不能太肉）');

// ============================================================
sec('三、盲盒涨价 6% → 5% → 3%');
// ============================================================
ok(BOX_PRICE_STEP === 0.03, `BOX_PRICE_STEP = ${BOX_PRICE_STEP}（第 94 块用户「涨得太快」再降一档）`);
ok(boxCost('wood', 20) === 48, `木匣第 20 次 48（原 66 → 60 → 48）`, String(boxCost('wood', 20)));
ok(boxCost('gold', 10) === 364, `金匣第 10 次 364（原 448 → 420 → 364）`, String(boxCost('gold', 10)));
ok(htmlSrc.includes('每买一次 +3% 首价'), '夜行商店的说明文案同步到 3%');
ok(!htmlSrc.includes('+6% 首价'), '页面里不再有 +6% 的旧文案');

// ============================================================
sec('四、木鱼灵：改吐追踪泡（不再和咒面图腾重合）');
// ============================================================
const wd = ENEMY_TYPES.woodfish;
ok(!wd.spell, '木鱼灵不再有 spell 圈（那是咒面图腾的机制）');
ok(!wd.debuff, '不再给「减速」这个 debuff（改成定住）');
ok(!!wd.bubble, '改成 cfg.bubble（吐泡）');
ok(wd.bubble.speed < 4.4, `泡比主角慢（${wd.bubble.speed} < 4.4），横向能甩掉`);
ok(wd.bubble.speed > 2.0, `泡也不至于慢到可以无视（${wd.bubble.speed}）`);
ok(wd.bubble.hp >= 3, `泡有独立血量 ${wd.bubble.hp}（可打爆）`);
ok(wd.bubble.root >= 1.0, `命中把你定住 ${wd.bubble.root} 秒`);
ok(wd.bubble.turn > 0 && wd.bubble.turn < 3, `拐弯笨（${wd.bubble.turn} 弧度/秒），绕圈能遛`);
// 实现：吐 / 更新 / 命中 / 可被打爆
ok(/function spawnBubble\(e, ctx, idx = 0\)/.test(enemySrc), '有 spawnBubble');
ok(/function updateBubbles\(dt, ctx\)/.test(enemySrc) && /updateBubbles\(dt, ctx\);/.test(enemySrc),
  '有 updateBubbles 并接进了 update()');
ok(/function hitBubbles\(x, z, r, dmg\)/.test(enemySrc), '有 hitBubbles（外部伤害入口）');
ok(/if \(e\.cfg\.bubble\) \{ handleBubbleCaster\(/.test(enemySrc), '木鱼灵走自己的 AI 分支');
ok(/const na = cur \+ Math\.min\(Math\.abs\(diff\), b\.turn \* dt\) \* Math\.sign\(diff\);/.test(enemySrc),
  '转向限速（Turn rate limited，不是瞬间掉头）');
ok(/if \(!inv && ctx\.rootPlayer\) ctx\.rootPlayer\(b\.root\);/.test(enemySrc),
  '命中先问无敌，无敌帧里不再被定住');
ok(/for \(const b of bubbles\) \{ scene\.remove\(b\.mesh\); b\.mat\.dispose\(\); \}/.test(enemySrc),
  'reset 里把泡也清干净');
// 被打爆的接线：近战 + 环剑 + 元素波及 + 雷链
ok(/enemies\.hitBubbles\(e\.pos\.x, e\.pos\.z, 1\.0, roll\.damage\)/.test(mainSrc), '主角近战能打泡');
ok(/enemies\.hitBubbles\(pos\.x, pos\.z, BODY_R \+ 0\.75, meleeDmg\)/.test(mainSrc), '贴在身上的泡也会被挥掉');
ok(/enemies\.hitBubbles\(at\.x, at\.z, SWORD_HIT_R \+ 0\.35, dmg\)/.test(weaponSrc), '环剑能打泡');
ok(/enemies\.hitBubbles\(e\.pos\.x, e\.pos\.z, R, splash\)/.test(weaponSrc), '元素波及能打泡');
ok(/enemies\.hitBubbles\(tgt\.pos\.x, tgt\.pos\.z, 0\.9, cd\)/.test(weaponSrc), '雷剑连锁能打泡');
// 主角侧的定住
ok(/let rootT = 0;/.test(mainSrc) && /function rootPlayer\(sec\)/.test(mainSrc), '主角侧有 rootT / rootPlayer');
ok(/function updateRoot\(dt\)/.test(mainSrc) && /updateRoot\(dt\);/.test(mainSrc), '每帧推进定住倒计时');
ok(/stats\.get\('moveSpeed'\) \* \(curseT > 0 \? curseFactor : 1\) \* \(rootT > 0 \? 0 : 1\)/.test(mainSrc),
  '定住期间移速归零（和减速是两条分支）');
ok(/isInvincible: \(\) => iframe > 0/.test(mainSrc), 'combatCtx 暴露 isInvincible（泡要问）');
ok(/clearRoot\(\);/.test(mainSrc), '换关 / 读档 / 结算都清掉定住');
const bubDesc = (codexSrc.match(/if \(cfg\.bubble\) return `([^`]+)`/) || [, ''])[1];
ok(bubDesc.includes('定住') && bubDesc.includes(' transversal') === false, '图鉴讲「定住」而不是「减速」');
ok(bubDesc.includes('砍两下就炸') || /砍.{0,4}就炸/.test(bubDesc), '图鉴说清可以打爆');

// ============================================================
sec('五、第九关 · 骨塔登记庭 + 称量官');
// ============================================================
const L9 = LEVELS_BY_ID[9];
ok(!!L9, 'LEVELS_BY_ID[9] 存在');
ok(L9 && L9.id === 9, 'id = 9');
ok(L9 && L9.name.includes('登记庭'), '关卡名是「骨塔登记庭」', L9 && L9.name);
ok(L9 && L9.theme === 'registry', '主题 registry（第 9 套皮肤）', L9 && L9.theme);
ok(sceneSrc.includes('registry: {') && /function makeRegistryTexture/.test(sceneSrc),
  'scene.js 里真的有这套皮肤和它的地面贴图');
ok(L9 && L9.arena === 17, 'arena 17', L9 && L9.arena);
ok(L9 && L9.rounds.length === 20, '20 回合', L9 && L9.rounds.length);
ok(L9 && L9.spawnRadius < L9.arena, '出生半径在国内', L9 && L9.spawnRadius);
ok(L9 && L9.upgradeAfter.length >= 10 && L9.shopAfter.length >= 5, '升级 / 商店节奏齐全');
ok(L9 && L9.weaponAt === 4, '第 4 回合给武器');
const roundsWithWeigher = L9.rounds.filter((r) => (r.weigher || 0) > 0).length;
ok(roundsWithWeigher >= 17, `几乎每回合都有称量官（${roundsWithWeigher}/20）`);
const t9 = levelTypes(L9);
ok(t9.includes('weigher'), 'levelTypes 含 weigher');
// 第九关不该整 Scandere 上的等差数列做得太猛：本关 hpMul 必须和第八关同档（压力来自 buff）
ok(L9 && L9.scale.hpMul <= 1.30 && L9.scale.dmgMul <= 1.60,
  '第九关不额外加数值（压力来自叠层）', L9 && JSON.stringify(L9.scale));

const w = ENEMY_TYPES.weigher;
ok(!!w, 'ENEMY_TYPES 里有 weigher');
ok(w && w.name === '称量官', '中文名是称量官', w && w.name);
ok(w && w.weigh && w.weigh.cap >= 3, `有 cap（${w && w.weigh.cap} 层封顶）`);
ok(w && w.weigh.per.speed > 0 && w.weigh.per.damage > 0 && w.weigh.per.armor > 0,
  '三种加成都写了（移速 / 伤害 / 减伤）');
ok(w && w.keepDistance >= 6, `站得远（keepDistance ${w && w.keepDistance}）—— 必须够得到才能玩`);
ok(w && w.attackDuration > w.windup, 'attackDuration > windup（第 69 块的坑）',
  w && `${w.attackDuration}/${w.windup}`);
ok(w && w.hp >= 12, `血量够厚（${w && w.hp}）—— 它是压力来源，不能一刀切掉`);
ok(w && w.tag === 'ledger', '抱着台账（程序化 prop，零新资产）');
// 实现
ok(/let weighTier = 0;/.test(enemySrc), '有全局层数字段 weighTier');
ok(/function dressWeigh\(e\)/.test(enemySrc), 'dressWeigh：把层数落到实例（伤害/减伤/金环）');
ok(/if \(e\.dmg0 != null\) e\.damage = e\.dmg0 \* \(1 \+ cfg\.per\.damage \* t\);/.test(enemySrc),
  '伤害叠在**原始值**上（不会越叠越离谱）');
ok(/e\.namedArmor = cfg\.per\.armor \* t;/.test(enemySrc), '减伤写进 namedArmor');
ok(/\+ \(e\.namedArmor \|\| 0\)/.test(enemySrc), 'takeDamage 的减伤里真的读了 namedArmor');
ok(/const namedBoost = 1 \+ \(e\.named \|\| 0\) \* \(\(WEIGH\(\) && WEIGH\(\)\.per\.speed\) \|\| 0\);/.test(enemySrc)
  && /\* namedBoost/.test(enemySrc), 'moveToward 里真的乘了移速加成');
ok(/function performWeigh\(e\)/.test(enemySrc), 'performWeigh：升层 + 全场上');
ok(/for \(const o of list\) \{\s*\n\s*if \(o\.state === 'dead' \|\| o\.state === 'down'\) continue;\s*\n\s*dressWeigh\(o\);/.test(enemySrc),
  '上称**全场**（遍历整个 list，不分距离）');
ok(/function clearWeigh\(e\)/.test(enemySrc) && /if \(e\.cfg\.weigh\) clearWeigh\(e\);/.test(enemySrc),
  '称量官一死就 clearWeigh（唯一的解）');
ok(/if \(weighTier > 0\) dressWeigh\(e\);/.test(enemySrc), '后上场的怪也算「记过名的」');
ok(/weighTier = 0;\s*\/\/ 第 82 块/.test(enemySrc), 'reset 里把层数字段清了');
ok(/function updateNamedRing\(e\)/.test(enemySrc) && /if \(e\.namedRing\) e\.namedRing\.update\(dt\);/.test(enemySrc),
  '每只被记名的怪有常驻金环（且每帧呼吸）');
ok(/const want = 0\.60 \+ t \* 0\.18;/.test(enemySrc), '环随层数长大（看得出现在第几层）');
ok(/weighTier: \(\) => weighTier/.test(enemySrc) && /namedCount: \(\) =>/.test(enemySrc),
  '暴露观测口 weighTier / namedCount');
// 接线
ok(/LEVEL_9, LEVELS_BY_ID/.test(mainSrc), 'main 导入 LEVEL_9');
ok(/\{ id: 9, name: LEVEL_9\.name, playable: true \}/.test(mainSrc), '选关列表里有第九关');
ok(/id: 's09', no: 9, act: 2, levelId: 9, atRound: 2,/.test(storySrc), '剧情 s09 接第九关第 2 回合');
const wDesc = (codexSrc.match(/if \(cfg\.weigh\) \{\s*\n\s*const p = cfg\.weigh\.per;\s*\n\s*return `([^`]+)`/) || [, ''])[1];
ok(wDesc.includes('全场'), '图鉴说清是**全场**加成', wDesc.slice(0, 20));
ok(/砍掉它，所有层当场清零/.test(wDesc), '图鉴把解法写在明面上（先拆它）');

// ============================================================
sec('六、版本号一致');
// ============================================================
const VER = Number((htmlSrc.match(/\?v=(\d+)/) || [, '0'])[1]);
ok(VER >= 93, `index.html 是 v=${VER}`, String(VER));
const jsFiles = readdirSync('js').filter((f) => f.endsWith('.js'));
const bad = jsFiles.filter((f) => {
  const s = readFileSync('js/' + f, 'utf8');
  const m = [...s.matchAll(/\?v=(\d+)/g)].map((x) => Number(x[1]));
  return m.some((n) => n !== VER);
});
ok(bad.length === 0, `js/ 里所有 ?v= 都是 v=${VER}`, bad.join(','));
ok(existsSync('js/scene.js'), 'scene.js 在');
ok(!/\?v=92/.test(htmlSrc + waveSrc + enemySrc), '没有残留的旧版本号');

console.log('\n' + '-'.repeat(50));
console.log(`第 82 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：');
  for (const f of fails) console.log('  - ' + f);
  process.exitCode = 1;
}
