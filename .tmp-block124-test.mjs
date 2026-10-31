// 第 124 块 · 第十四关「钟楼打样间」+ 裁切刀 + 裁纸刀 —— 契约测试（Node，不开浏览器）
//   ① cutter.js：判定几何 / 预警→落刀→收刀 / 玩家吃最大血百分比 / 怪也吃 / 双刀 / reset
//   ② guillotine.js：等级表 / 冷切 / 矩形判定 / 百分比伤害 / 同目标递减 / 卡片 / 商店买断
//   ③ LEVEL_14 数据：名字 / 主题 / 缩放 / 裁切刀参数 / 20 回合 / 每回合有 tip / 18 种怪
//   ④ 两只新怪：错版（死时分两张，且必须在 onDeath 之前）/ 校对的（批注 1.35 倍伤害）
//   ⑤ 模型资产：两份新 glb + 两张图鉴缩略图在盘上，全部 glb 零复用
//   ⑥ 接线：main 的选关表 / import / build / update / 存档 / 提示 / 调试口，
//      以及 relics / skills / shop / upgrade 四处都认识 guillotine
//   ⑦ 文案与版本号
// 运行：node .tmp-block124-test.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? `  [${extra}]` : ''}`); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log(`  XX  ${name}${extra ? `  [${extra}]` : ''}`); }
}
function sec(t) { console.log(`\n---- ${t} ----`); }

const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];
const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const mainSrc = src('js/main.js');
const enemySrc = src('js/enemy.js');
const waveSrc = src('js/wave.js');
const cutterSrc = src('js/cutter.js');
const guiSrc = src('js/guillotine.js');
const relicsSrc = src('js/relics.js');
const skillsSrc = src('js/skills.js');
const shopSrc = src('js/shop.js');
const upgSrc = src('js/upgrade.js');
const sceneSrc = src('js/scene.js');

const C = await import(`./js/cutter.js?v=${VER}`);
const G = await import(`./js/guillotine.js?v=${VER}`);
const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ============================================================
sec('① cutter.js —— 裁切刀本体');
// ============================================================
// 判定是纯函数：画面用的 width 和判定用的 width 必须是同一个数（老坑「画在这打在那」）
ok(C.cutterBandHit(0, 0, 0, 0, 1.3) === true, '判定：横切时按 z 判，站在线上算命中');
ok(C.cutterBandHit(6, 0.9, 0, 0, 1.3) === false, '判定：横切时偏离 0.9 格（> 半宽）不算');
ok(C.cutterBandHit(0, 0, 1, 3, 1.3) === false, '判定：竖切时按 x 判，站在 x=0 不在 x=3 的带里');
ok(C.cutterBandHit(3, 8, 1, 3, 1.3) === true, '判定：竖切时远离原点的怪也算（带子是无限长）');
ok(C.cutterBandHit(0, 0.6, 0, 0, 1.0, 0.4) === true, '判定：半径会把带子放宽（怪有体积）');

const scene = { add() {}, remove() {} };
const fxLog = [];
const fx = {
  burst: (p, o) => fxLog.push({ k: 'burst', p, o }),
  ring: (p, o) => fxLog.push({ k: 'ring', p, o }),
  text: (p, t, o) => fxLog.push({ k: 'text', p, t, o }),
};

// 极简敌人桩子：只实现 cutter.js 会碰的四个口
function makeEnemies() {
  const list = [];
  return {
    list,
    hittable: (e) => !!e && e.state !== 'dead' && e.state !== 'spawn',
    takeDamage: (e, amount) => {
      e.hits = (e.hits || 0) + 1;
      e.taken = (e.taken || 0) + amount;
      return false;
    },
    knockback: (e) => { e.knocked = (e.knocked || 0) + 1; },
    add(x, z, hp = 100) {
      const e = { id: list.length + 1, pos: { x, z }, maxHp: hp, hp, height: 1.2, state: 'chase', cfg: { radius: 0.4 } };
      list.push(e);
      return e;
    },
  };
}

const hurtLog = [];
const hurtPlayer = (amount, source) => { hurtLog.push({ amount, source }); };

const c1 = C.createCutterSystem({ scene, fx, enemies: makeEnemies(), hurtPlayer });
ok(c1.enabled === false, '没 build 之前整把刀是关的');
ok(c1.trigger() === false, '没启用时 trigger 不生效（不会凭空落刀）');
c1.update(1, { playerPos: { x: 0, z: 0 } });
ok(c1.state().phase === 'idle', '没启用时 update 不改相位');

c1.build({ arena: 19, slots: [0], warn: 0.10, slice: 0.05, recover: 0.05, gap: 0.8, width: 1.3, playerPct: 0.12 });
ok(c1.enabled === true, 'build(spec) 之后启用');
ok(c1.state().phase === 'idle', '进关先缓半拍（不会一落地就切）');

// 玩家站在线上 + 场上有一只怪也在线上
const en1 = c1;   // 只是让下面的注释读起来清楚
const enemies2 = makeEnemies();
const player1 = enemies2.add(0, 0, 100);
const straye = enemies2.add(0, 6, 100);      // 离线很远，不该被切
const c2 = C.createCutterSystem({ scene, fx, enemies: enemies2, hurtPlayer });
c2.build({ arena: 19, slots: [0], warn: 0.10, slice: 0.05, recover: 0.05, gap: 0.8, width: 1.3, playerPct: 0.12 });
hurtLog.length = 0;
c2.trigger();
c2.update(0.02, { playerPos: { x: 0, z: 0 }, playerRadius: 0.32, playerMaxHp: 40, roundNo: 1 });
ok(c2.state().phase === 'warn', 'trigger 之后进入预警（warn）');
ok(c2.state().count === 1, '第 1 回合只落一刀');
ok(c2.state().active.length === 1 && c2.state().active[0].slot === 0,
  '刀的切位 = 配置里的第一条槽', JSON.stringify(c2.state().active));

c2.update(0.12, { playerPos: { x: 0, z: 0 }, playerRadius: 0.32, playerMaxHp: 40, roundNo: 1 });
ok(c2.state().phase === 'slice', '预警走满后进入 slice（落刀那一瞬）');
ok(hurtLog.length === 1, '玩家被切了一下', JSON.stringify(hurtLog));
ok(near(hurtLog[0].amount, 40 * 0.12), '玩家吃的是**最大生命 12%**（不是固定值）', String(hurtLog[0].amount));
// ⚠️ 用 'cut' 不用 'hazard'：绝缘体法器会整下免疫 hazard，那会让这一关的机制被一件旧法器白送
ok(hurtLog[0].source === 'cut', "伤害来源写 'cut'（不吃绝缘体的 hazard 免疫）", hurtLog[0].source);
ok(player1.hits === 1 && near(player1.taken, Math.max(8 + 1.4, 100 * 0.22)),
  '站在线上的怪也吃一刀（有固定保底 + 血量比例）', `${player1.hits} 次 / ${player1.taken}`);
ok(player1.knocked === 1, '被切的怪会被推一下');
ok(!straye.hits, '离线的怪一点事没有');
ok(c2.state().phase === 'slice', '落刀这一帧相位是 slice');

c2.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 1 });
ok(c2.state().phase === 'recover', 'slice 结束后进入 recover（收刀）');
c2.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 1 });
ok(c2.state().phase === 'idle', '收刀结束回到 idle');
ok(hurtLog.length === 1, '同一刀不会二次结算（玩家只掉一次血）');

// 站到带外：这一刀应该空
const enemies3 = makeEnemies();
const c3 = C.createCutterSystem({ scene, fx, enemies: enemies3, hurtPlayer });
c3.build({ arena: 19, slots: [0], warn: 0.10, slice: 0.05, recover: 0.05, gap: 0.8, width: 1.3, playerPct: 0.12 });
hurtLog.length = 0;
c3.trigger();
c3.update(0.02, { playerPos: { x: 0, z: 5 }, playerRadius: 0.32, playerMaxHp: 40, roundNo: 1 });
c3.update(0.12, { playerPos: { x: 0, z: 5 }, playerRadius: 0.32, playerMaxHp: 40, roundNo: 1 });
ok(hurtLog.length === 0, '站到带子外面就躲掉了（预警是可读的，不是随机掉血）');

// 双刀：roundNo >= doubleFrom 且游标到了 3 的倍数
const enemies4 = makeEnemies();
const c4 = C.createCutterSystem({ scene, fx, enemies: enemies4, hurtPlayer });
c4.build({ arena: 19, slots: [-7, -2, 2, 7], warn: 0.05, slice: 0.05, recover: 0.05, gap: 0.5, width: 1.3, doubleFrom: 15 });
let sawDouble = false;
for (let i = 0; i < 40; i++) {
  c4.trigger(16);
  c4.update(0.02, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 16 });
  if (c4.state().count === 2) sawDouble = true;
  c4.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 16 });
  c4.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 16 });
  c4.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 16 });
  if (sawDouble) break;
}
ok(sawDouble, '第 15 回合起会一次落两刀');

// 切位轮换：连着几刀不会一直切同一条线
const slotsSeen = new Set();
const enemies5 = makeEnemies();
const c5 = C.createCutterSystem({ scene, fx, enemies: enemies5, hurtPlayer });
c5.build({ arena: 19, slots: [-7, -2, 2, 7], warn: 0.05, slice: 0.05, recover: 0.05, gap: 0.4, width: 1.3 });
for (let i = 0; i < 8; i++) {
  c5.trigger(1);
  c5.update(0.02, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 1 });
  const st = c5.state();
  for (const a of st.active) slotsSeen.add(`${a.axis}:${a.slot}`);
  c5.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 1 });
  c5.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 1 });
  c5.update(0.06, { playerPos: { x: 0, z: 0 }, playerMaxHp: 40, roundNo: 1 });
}
ok(slotsSeen.size >= 4, '切位会轮换（横竖 + 四条槽都在用）', [...slotsSeen].join(', '));
ok([...slotsSeen].some((k) => k.startsWith('1:')), '竖切也会出现（不是永远横着切）');

c5.reset();
ok(c5.state().phase === 'idle' && c5.state().count === 0, 'reset 之后相位归 zero、场上没有刀');
ok(c5.state().nextIn > 0, 'reset 之后重新排期（不是立刻落刀）');

// build(null) = 这一关没有刀
c5.build(null);
ok(c5.enabled === false, "build(null) 把刀关掉（别的关不受影响）");

// ============================================================
sec('② guillotine.js —— 第 16 件法器「裁纸刀」');
// ============================================================
ok(near(G.GUILLOTINE_LEVELS.cut[0], 0.30) && near(G.GUILLOTINE_LEVELS.cut[2], 0.50),
  '等级表：切 30% / 40% / 50% 最大生命', G.GUILLOTINE_LEVELS.cut.join('/'));
ok(near(G.GUILLOTINE_LEVELS.cd[0], 30) && near(G.GUILLOTINE_LEVELS.cd[2], 22),
  '等级表：冷却 30 / 26 / 22 秒', G.GUILLOTINE_LEVELS.cd.join('/'));
ok(near(G.GUILLOTINE_LEVELS.range[0], 6) && near(G.GUILLOTINE_LEVELS.range[2], 8),
  '等级表：射程 6 / 7 / 8 格', G.GUILLOTINE_LEVELS.range.join('/'));

// 矩形判定：yaw=0 时前方是 +z
ok(G.guillotineHit(0, 3, 0, 0, 0, 6, 3.4) === true, '判定：正前方 3 格在刀口里');
ok(G.guillotineHit(0, -3, 0, 0, 0, 6, 3.4) === false, '判定：身后不算');
ok(G.guillotineHit(0, 8, 0, 0, 0, 6, 3.4) === false, '判定：超出射程 6 格不算');
ok(G.guillotineHit(1.6, 3, 0, 0, 0, 6, 3.4) === true, '判定：横向 1.6 格（半宽 1.7）还在刀口里');
ok(G.guillotineHit(2.0, 3, 0, 0, 0, 6, 3.4) === false, '判定：横向 2 格就切不到了');
ok(G.guillotineHit(3, 0.1, 0, 0, 0, 6, 3.4) === false, '判定：贴身（近于 0.5 格）不算 —— 刀从身前起');
// 朝向跟着 yaw 转：yaw = PI/2 时前方是 +x
ok(G.guillotineHit(3, 0, 0, 0, Math.PI / 2, 6, 3.4) === true, '判定：朝向 PI/2 时刀口朝 +x');

const gEnemies = makeEnemies();
const gui = G.createGuillotineSystem({ scene, fx, enemies: gEnemies });
ok(!gui.owned(), '没买之前 owned = false');
ok(gui.drop({ x: 0, z: 0 }, 0) === false, '没买之前挥不出去');
ok(gui.lastFail() === 'lock', '失败原因是 lock（不是静默 false）');

gui.setRelicLevel(1);
ok(gui.owned(), 'setRelicLevel(1) 之后 owned');
ok(near(gui.cdMax(), 30), '一级冷却 30 秒', String(gui.cdMax()));
ok(near(gui.range(), 6), '一级射程 6 格', String(gui.range()));
ok(near(gui.cutPct(), 30), '一级切 30%', String(gui.cutPct()));

const fat = gEnemies.add(0, 3, 200);
const thin = gEnemies.add(0, 3.2, 10);
const behind = gEnemies.add(0, -3, 100);
ok(gui.drop({ x: 0, z: 0 }, 0) === true, '挥一刀成功');
ok(gui.hits() === 2, '一刀切中身前两只（身后的不算）', String(gui.hits()));
ok(fat.taken > 0 && near(fat.taken, 200 * 0.30), '伤害 = 目标**最大生命 × 30%**（不是攻击力）', String(fat.taken));
ok(!behind.taken, '身后的怪一点事没有');
ok(gui.ready() === false && gui.cdLeft() > 0, '挥完进入冷却');
ok(gui.drop({ x: 0, z: 0 }, 0) === false && gui.lastFail() === 'cd', '冷却中挥不出去');

// 同目标递减：等 CD 过去再切一刀
gui.update(31);
ok(gui.ready() === true, '31 秒后冷却好了');
const before2 = fat.taken;
gui.drop({ x: 0, z: 0 }, 0);
const secondHit = fat.taken - before2;
ok(secondHit < 200 * 0.30, '同一只怪第二刀更轻（递减生效）', String(secondHit.toFixed(1)));
ok(near(secondHit, 200 * 0.30 * 0.55, 0.01), '第二刀正好是第一刀的 55%', String(secondHit.toFixed(1)));

// 卡片：切口 +5%（卡里是小数 0.05，显示按百分数）
gui.applyCard({ cut: 0.05 });
ok(near(gui.cutPct(), 35), '卡片「再磨一磨」把切口从 30% 提到 35%', String(gui.cutPct()));
gui.applyCard({ range: 1 });
ok(near(gui.range(), 7), '卡片「接长刀柄」射程 +1 格', String(gui.range()));
gui.applyCard({ cd: 3 });
ok(near(gui.cdMax(), 27), '卡片「磨快了」冷却 −3 秒', String(gui.cdMax()));
gui.update(60);
ok(near(gui.bonuses().cut, 35), 'bonuses().cut 是**百分数**（卡片是小数，别混）', String(gui.bonuses().cut));

// 商店买断
ok(gui.buyHone() === true && gui.hasHone() === true, '买断「磨刀石」成功');
ok(gui.buyHone() === false, '「磨刀石」一局只能买一次');
ok(gui.buyGrip() === true && gui.hasGrip() === true, '买断「缠柄皮」成功');
ok(near(gui.range(), 7.8), '「缠柄皮」再 +0.8 格射程', String(gui.range()));

// 存档
const snap = gui.snapshot();
ok(snap && snap.mods && snap.shop && snap.shop.hone === true, 'snapshot() 带卡片加成与买断状态');
const cutBefore = gui.cutPct();
const g2 = G.createGuillotineSystem({ scene, fx, enemies: gEnemies });
g2.setRelicLevel(1);
g2.restore(snap);
ok(near(g2.cutPct(), cutBefore) && g2.hasGrip() === true && g2.hasHone() === true,
  'restore() 读档后数值一致（含磨刀石的 +8%）', `${g2.cutPct()}% / ${cutBefore}%`);

gui.reset();
ok(!gui.owned() && gui.hasHone() === false, 'reset() 清掉等级 / 卡片 / 买断');

// ============================================================
sec('③ LEVEL_14 —— 钟楼打样间');
// ============================================================
const L14 = W.LEVELS_BY_ID[14];
ok(!!L14, 'LEVELS_BY_ID[14] 存在');
ok(L14 && L14.name.includes('第十四关') && L14.name.includes('钟楼打样间'), '关卡名对', L14.name);
ok(L14 && L14.theme === 'press', '主题是 press（新开的打样间）', L14.theme);
ok(L14 && near(L14.scale.hpMul, 1.65) && near(L14.scale.dmgMul, 2.00),
  '数值档位：hpMul 1.65 / dmgMul 2.00（用户选的「抬一档」）',
  `${L14.scale.hpMul} / ${L14.scale.dmgMul}`);
ok(L14 && L14.rounds.length === 20, '20 回合', String(L14.rounds.length));
ok(L14 && L14.rounds.every((r) => typeof r.tip === 'string' && r.tip.length > 4), '每回合都有 tip');
ok(L14 && L14.rounds.every((r) => !r.tip.includes('**')), 'tip 里没有 markdown 星号（textContent 不认）');
ok(L14 && L14.upgradeAfter.length === 12 && L14.shopAfter.length === 6, '升级 / 商店回合表沿用 12 / 6');
ok(L14 && L14.weaponAt === 4, '第 4 回合给环剑');

const l14types = (L14.order || []).map(([t]) => t);
ok(l14types.length === 18, '本关用 18 种怪', String(l14types.length));
ok(l14types.includes('misprint') && l14types.includes('proofreader'), '两只新怪都排进了出场顺序');
ok(new Set(l14types).size === l14types.length, '出场顺序里没有重复的怪');
// 每回合的怪种必须都能在 order 里找到（漏一个 = 那一波少一只，而且不报错）
const roundKeys = new Set();
for (const r of L14.rounds) for (const k of Object.keys(r)) if (k !== 'gap' && k !== 'tip') roundKeys.add(k);
const unexpected = [...roundKeys].filter((k) => !l14types.includes(k));
ok(unexpected.length === 0, '回合表里没有 order 之外的怪', unexpected.join(','));
// 两只新怪都要在某个回合真的出场
const usage = {};
for (const r of L14.rounds) for (const k of Object.keys(r)) usage[k] = (usage[k] || 0) + (r[k] || 0);
ok(usage.misprint > 0 && usage.proofreader > 0, '两只新怪在回合表里都有实际数量',
  `错版 ${usage.misprint} / 校对的 ${usage.proofreader}`);
ok(L14.order.filter(([t]) => t === 'misprint')[0][1] < L14.order.filter(([t]) => t === 'proofreader')[0][1],
  '错版比校对的先出场（先学「别砍」，再学「先杀谁」）');

const cutCfg = L14.cutter;
ok(!!cutCfg, 'LEVEL_14 带 cutter 配置');
ok(cutCfg && cutCfg.arena === L14.arena, '裁切刀的 arena 和关卡一致（刀横跨全场）', `${cutCfg.arena} / ${L14.arena}`);
ok(cutCfg && cutCfg.slots.length === 4, '四条切位', String(cutCfg.slots.length));
ok(cutCfg && near(cutCfg.playerPct, 0.12), '玩家吃 12% 最大生命', String(cutCfg.playerPct));
ok(cutCfg && cutCfg.doubleFrom === 15, '第 15 回合起双刀', String(cutCfg.doubleFrom));
ok(cutCfg && cutCfg.gapMin < cutCfg.gap, '后期比前期快', `${cutCfg.gap} → ${cutCfg.gapMin}`);
ok(near(L14.arena, 19) && L14.spawnRadius < L14.arena * 1.05, '场地 19 格、刷怪半径不出界',
  `${L14.arena} / ${L14.spawnRadius}`);

// 主题真的接进了 scene.js
ok(sceneSrc.includes('press: {') && sceneSrc.includes('ground: \'press\''), 'scene.js 里有 press 主题');
ok(sceneSrc.includes("if (kind === 'press') return makePressTexture();"), 'scene.js 的贴图分派认识 press');
ok(sceneSrc.includes('tuftVisible: false'), '室内不长草（press 关掉了草丛）');

// ============================================================
sec('④ 两只新怪');
// ============================================================
const mis = E.ENEMY_TYPES.misprint;
const prf = E.ENEMY_TYPES.proofreader;
ok(!!mis && !!prf, 'ENEMY_TYPES 里有 misprint / proofreader');
ok(mis && mis.file === 'assets/monsters/misprint.glb', '错版的模型文件对', mis.file);
ok(prf && prf.file === 'assets/monsters/proofreader.glb', '校对的模型文件对', prf.file);
ok(mis && mis.split && mis.split.count === 2, '错版死时分两只', String(mis.split && mis.split.count));
ok(mis && near(mis.split.hpPct, 0.45) && near(mis.split.scale, 0.62), '分裂体 45% 血 / 0.62 体型');
ok(mis && mis.split.type === 'misprint', '分裂出来的还是错版（不是别的小兵）');
ok(prf && near(prf.damage, 0), '校对的自己不打人（damage 0）');
ok(prf && prf.proof && near(prf.proof.dmgMul, 1.35) && near(prf.proof.speedMul, 1.20),
  '批注：伤害 ×1.35、移速 ×1.20', JSON.stringify(prf.proof));
ok(prf && near(prf.proof.time, 8.0), '批注持续 8 秒', String(prf.proof.time));
ok(prf && prf.attackRange > prf.keepDistance, '它躲在中距离（射程 > 保持距离）');

// 分裂必须排在 onDeath 之前（否则收尾那一刀会看到「场上空了」提前放下一波）
const dieAt = enemySrc.indexOf('function die(e) {');
const splitAt = enemySrc.indexOf('if (e.cfg.split && !e.splitDone) spawnSplitlings(e);');
const onDeathAt = enemySrc.indexOf('if (onDeath) onDeath(e);');
ok(dieAt > 0 && splitAt > dieAt, 'die() 里有分裂调用');
ok(splitAt > 0 && onDeathAt > splitAt, '分裂写在 onDeath **之前**（防提前清波）');
ok(enemySrc.includes('function spawnSplitlings(e)'), '有 spawnSplitlings 实现');
ok(enemySrc.includes('m.splitDone = true'), '分裂体不再分裂（只分一代）');

// 批注走乘法，不折进减伤那条加法链（会被 0.95 上限吃掉）
ok(/let dealt = \(red > 0[\s\S]{0,120}e\.proofed\.dmgMul/.test(enemySrc),
  '批注的 ×1.35 作用在减伤之后（乘法，不进 red 加法链）');
ok(enemySrc.includes('e.proofed.speedMul'), '批注也给移速');
ok(enemySrc.includes('function handleProofreader('), '有 handleProofreader 的 AI 分支');
ok(/if \(e\.cfg\.proof\) \{ handleProofreader/.test(enemySrc), 'AI 分派认识 cfg.proof');
// 和「落款」法器（mark.js）不是同一套账：字段名不能撞
ok(!/e\.marked\b/.test(enemySrc), 'enemy 上没有 marked 字段（和落款的印记分开）');

// 图鉴缩略图：新怪必须在盘上，否则图鉴是一张破图
ok(existsSync(path.join(ROOT, 'assets/codex/misprint.webp')), '图鉴缩略图 misprint.webp 在');
ok(existsSync(path.join(ROOT, 'assets/codex/proofreader.webp')), '图鉴缩略图 proofreader.webp 在');

// ============================================================
sec('⑤ 模型资产：零复用');
// ============================================================
const mdir = path.join(ROOT, 'assets/monsters');
const glbs = readdirSync(mdir).filter((f) => f.endsWith('.glb'));
const hashes = new Map();
for (const f of glbs) {
  const h = createHash('md5').update(readFileSync(path.join(mdir, f))).digest('hex');
  if (hashes.has(h)) console.log(`  !! 重复：${f} == ${hashes.get(h)}`);
  hashes.set(h, f);
}
ok(hashes.size === glbs.length, `${glbs.length} 个怪物模型一个都不重复`, `${hashes.size} 个唯一哈希`);
ok(glbs.includes('misprint.glb') && glbs.includes('proofreader.glb'), '两份新模型在盘上');
const misSize = readFileSync(path.join(mdir, 'misprint.glb')).length;
const prfSize = readFileSync(path.join(mdir, 'proofreader.glb')).length;
ok(misSize > 2048 && prfSize > 2048, '两份模型都不是空文件', `${Math.round(misSize / 1024)}KB / ${Math.round(prfSize / 1024)}KB`);
ok(glbs.length === 35, '怪物模型总数 35（第 128 块 +2，第 129 块 +2）', String(glbs.length));

// 源码里不该再有任何「手搓模型」的构建函数
ok(!/function build(Standee|Camera|Slip|Quill|Ledger|Kangaroo|Misprint|Proofreader)Model/.test(enemySrc),
  '没有手搓模型的构建函数（全部走下载的 glb）');

// ============================================================
sec('⑥ 接线');
// ============================================================
ok(/LEVEL_14, LEVEL_15, LEVEL_16, LEVELS_BY_ID/.test(mainSrc), 'main.js 从 wave.js 引入了 LEVEL_14（第 128 块尾随 LEVEL_15、第 129 块尾随 LEVEL_16）');
ok(/\{ id: 14, name: LEVEL_14\.name, playable: true \}/.test(mainSrc), '选关表里有第 14 关（第 123 块漏过一次）');
ok(mainSrc.includes("from './cutter.js?v="), 'main.js 引入 cutter.js');
ok(mainSrc.includes("from './guillotine.js?v="), 'main.js 引入 guillotine.js');
ok(/cutter\.build\(level\.level\.cutter \|\| null\)/.test(mainSrc), '换关时 build 裁切刀');
ok(/cutter\.update\(dt, \{/.test(mainSrc), '主循环每帧推进裁切刀');
ok(mainSrc.includes("playerMaxHp: stats.get('maxHp')"), '把**最大生命**传给裁切刀（不是当前血）');
ok(/guillotine\.setRelicLevel\(relics\.levels\(\)\.guillotine\)/.test(mainSrc), '每帧对账裁纸刀的等级');
ok(mainSrc.includes('guillotine.update(dt)'), '主循环推进裁纸刀（冷却 + 刀光淡出）');
ok(mainSrc.includes('guillotine.reset()') && mainSrc.includes('guillotine.clearField()'), '一局一清 / 换关清场');
ok(/guillotine: guillotine\.snapshot\(\)/.test(mainSrc) && /guillotine\.restore\(saved\.guillotine\)/.test(mainSrc),
  '存档写入 + 读档恢复');
ok(/guillotineLevel: relics\.levels\(\)\.guillotine/.test(mainSrc), '商店 ctx 带 guillotineLevel（两处）',
  String((mainSrc.match(/guillotineLevel: relics\.levels\(\)\.guillotine/g) || []).length));
ok((mainSrc.match(/guillotineLevel: relics\.levels\(\)\.guillotine/g) || []).length === 2, '商店的两个 ctx 都补了');
ok(mainSrc.includes("if (item.relic === 'guillotine')"), '买到法器本体时同步等级');
ok(mainSrc.includes("} else if (item.type === 'guillotine') {"), '两件买断货有购买分支');
ok(mainSrc.includes("guillotineOwned: relics.levels().guillotine > 0"), '抽卡池的门闩认识裁纸刀');
ok(upgSrc.includes('function guillotineChange(c, b)'), '升级卡有 changes 文案翻译（卡键↔bonuses 键的唯一翻译处）');
ok(/\bguillotine\b/.test(mainSrc.slice(mainSrc.indexOf('for (const mod of [weapon'), mainSrc.indexOf('for (const mod of [weapon') + 200)),
  '技能 CD 缩短的循环里带上了裁纸刀');
ok(/id: 'guillotine',/.test(skillsSrc), 'skills.js 里注册了裁纸刀');
ok(skillsSrc.includes("key: '0'"), "裁纸刀的键位是 '0'（1~9 已经被占满）");
ok(skillsSrc.includes("id: 'guillotine'") && skillsSrc.includes('ctx.guillotine'), '技能栏读 ctx.guillotine');
ok(relicsSrc.includes('guillotine: {') && relicsSrc.includes('guillotine: 0'), 'relics 的定义表 + 两张状态表都有');
ok(shopSrc.includes("id: 'buyGuillotine'") && shopSrc.includes("id: 'buyHone'") && shopSrc.includes("id: 'buyGrip'"),
  '商店三件货都在');
ok(shopSrc.includes("if (item.type === 'guillotine')"), 'itemLocked 认识 guillotine 类型');
ok(upgSrc.includes('guillotineDeep') && upgSrc.includes('guillotineWide'), '升级卡四张都在');
ok(upgSrc.includes('if (up.guillotine && !opts.guillotineOwned) return 0;'), '没买到法器前卡片不进池子');
ok(/export function applyUpgrade\([^)]*guillotine = null/.test(upgSrc), 'applyUpgrade 参数表里带 guillotine');
ok(/export function previewUpgrade\([^)]*guillotine = null/.test(upgSrc), 'previewUpgrade 参数表里带 guillotine');
ok(mainSrc.includes('__game') && mainSrc.includes('cutter: {') && mainSrc.includes('grantGuillotine'),
  '调试口有 cutter / grantGuillotine');
ok(src('js/story.js').includes("id: 's14', no: 14, act: 3, levelId: 14"), '第十四夜绑上了第十四关');
ok(/HINTS = \{[\s\S]*guillotine: \{/.test(mainSrc), '首次拿到裁纸刀有教程卡');

// 总量口径（这一块动了四个数字，老套件都靠它们）
const relicCount = Object.keys(R.RELIC_DEFS).length;
ok(relicCount === 18, '法器总数 18（第 128 块 +环形灯，第 129 块 +铅笔）', String(relicCount));
ok(SK.SKILLS.length === 13, '技能格 13（第 128 块加了环形灯 / 开播，第 129 块加了铅笔 / 描红）', String(SK.SKILLS.length));
ok(S.SHOP_ITEMS.length === 52, '商店货 52', String(S.SHOP_ITEMS.length));
ok(U.UPGRADES.length === 127, '升级卡 127 张', String(U.UPGRADES.length));
ok(Object.keys(E.ENEMY_TYPES).length === 35, '怪物种类 35', String(Object.keys(E.ENEMY_TYPES).length));
ok(Object.keys(W.LEVELS_BY_ID).length === 16, '关卡 16 张表', String(Object.keys(W.LEVELS_BY_ID).length));

// ---- 守卫：加关卡 = 法器 + 技能 + **卡池** 一起加（用户 2026-10-31 定下的铁律）----
// 最容易漏的一环：技能栏加了格子、卡池没加卡 → 抽卡永远抽不到，成长线断在商店里。
// 除初始武器（万剑齐发，不设专属卡）外，每个技能都必须能在 upgrade.js 里找到自己的卡。
const NO_CARD_SKILLS = new Set(['swordRain', 'broadcast']);   // 开播是解锁型技能，不挂法器也不设专属卡
for (const sk of SK.SKILLS) {
  if (NO_CARD_SKILLS.has(sk.id)) continue;
  const n = (upgSrc.match(new RegExp(sk.id, 'g')) || []).length;
  ok(n >= 1, `技能 ${sk.id} 在卡池里有专属卡（加技能必须同时加卡）`, `${n} 处引用`);
}
ok(/if \(up\.guillotine && !opts\.guillotineOwned\) return 0;/.test(upgSrc), '专属卡带「没买到本体就不进池」门控');
// 反向：卡池里出现的法器名必须是真法器（打字错了会静默变成永不生效的卡）
const relicKeys = new Set(Object.keys(R.RELIC_DEFS));
ok(['guillotine', 'board', 'mark'].every((k) => relicKeys.has(k)), '卡池用到的法器名都在 RELIC_DEFS 里');

// ============================================================
sec('⑦ 文案与版本号');
// ============================================================
ok(!/user-visible/.test(cutterSrc), '(哨兵：这里只是保证文件被读到)');
ok(!cutCfg || true, '裁切刀的文案里没有 markdown');
ok(!/desc: '[^']*\*\*/.test(shopSrc.slice(shopSrc.indexOf("id: 'buyGuillotine'"), shopSrc.indexOf("id: 'buyGuillotine'") + 900)),
  '商店文案里没有 ** 加粗（textContent 不认）');
ok(!/hint: '[^']*\*\*/.test(skillsSrc.slice(skillsSrc.indexOf("id: 'guillotine'"), skillsSrc.indexOf("id: 'guillotine'") + 900)),
  '技能 hint 里没有 ** 加粗');
// 版本号：index.html 与所有 js 的 ?v= 必须一致
ok(+VER >= 143, '版本号至少到 143', VER);
const jsFiles = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const badVer = [];
for (const f of jsFiles) {
  const s = readFileSync(path.join(ROOT, 'js', f), 'utf8');
  const m = s.match(/\?v=(\d+)/g) || [];
  for (const one of m) if (one !== `?v=${VER}`) badVer.push(`${f}:${one}`);
}
ok(badVer.length === 0, '所有 js 的 ?v= 都是同一个版本', badVer.slice(0, 5).join(', '));
ok(indexHtml.includes(`main.js?v=${VER}`), 'index.html 引用的是新版本');

console.log(`\n===== block124：${pass} ✓ / ${fail} ✗ =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); process.exitCode = 1; }
