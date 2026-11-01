// 第 139 块 · 第十八关「天亮之前」+ 名字被收 + 第 20 件法器镇纸锤
// 契约测试（Node，不开浏览器）
//   ① blank.js 零业务依赖（只有 three）
//   ② 八招表 / 名字牌 / 名字板 / 抢回 / 飘走 / 存档
//   ③ 空白本体：招表排除已封印 / 通用五式兜底 / 护卫 / 小空白
//   ④ 镇纸锤：等级表 / 自动抡 / 砸地 / 破甲 / 空白族 ×1.5 / 卡片 / 商店买断 / 存档
//   ⑤ 五件齐：relics / shop / upgrade 卡池 / skills(G) / main 接线
//   ⑥ LEVEL_18 数据：名字 / 主题 / 20 回合 / 八只残影登场 / 第 20 回合 BOSS
//   ⑦ 九只新怪 + 模型 + 图鉴缩略图 + 终章剧情 + 成就 + 骨币倍率
//   ⑧ 总量口径与版本号
// 运行：node .tmp-block139-test.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
const blankSrc = src('js/blank.js');
const mainSrc = src('js/main.js');
const enemySrc = src('js/enemy.js');
const waveSrc = src('js/wave.js');
const skillsSrc = src('js/skills.js');
const shopSrc = src('js/shop.js');
const upgSrc = src('js/upgrade.js');
const relicsSrc = src('js/relics.js');
const storySrc = src('js/story.js');
const achSrc = src('js/achievements.js');
const campfireSrc = src('js/campfire.js');
const styleSrc = src('style.css');

const B = await import(`./js/blank.js?v=${VER}`);
const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);
const A = await import(`./js/achievements.js?v=${VER}`);
const CF = await import(`./js/campfire.js?v=${VER}`);

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const scene = { add() {}, remove() {} };
const fxLog = [];
const fx = {
  burst: (p, o) => fxLog.push({ k: 'burst', p, o }),
  ring: (p, o) => fxLog.push({ k: 'ring', p, o }),
  text: (p, t, o) => fxLog.push({ k: 'text', p, t, o }),
};

function makeEnemies() {
  const list = [];
  return {
    list,
    hittable: (e) => !!e && e.state !== 'dead' && e.state !== 'spawn',
    takeDamage: (e, amount) => {
      e.hits = (e.hits || 0) + 1;
      e.taken = (e.taken || 0) + amount;
      if (e.taken >= e.hp) { e.hp = 0; e.state = 'dead'; }
      return e.state === 'dead';
    },
    knockback: (e) => { e.knocked = (e.knocked || 0) + 1; },
    applyFreeze: (e, o) => { e.froze = (e.froze || 0) + 1; e.freezeArg = o; },
    spawn: (type, at, o) => {
      const e = { id: 900 + list.length, type, pos: { ...at }, cfg: { radius: 0.4 }, maxHp: 10, hp: 10, state: 'chase', root: { rotation: { y: 0 } }, speed: 1 };
      e.options = o;
      list.push(e);
      return e;
    },
    add(type, x, z, hp = 100) {
      const e = { id: list.length + 1, type, pos: { x, z }, cfg: { radius: 0.4 }, maxHp: hp, hp, state: 'chase', root: { rotation: { y: 0 } }, speed: 1, height: 1 };
      list.push(e);
      return e;
    },
  };
}

const hurtLog = [];
const hurtPlayer = (amount, source) => hurtLog.push({ amount, source });

// ============================================================
sec('① blank.js 零业务依赖');
// ============================================================
const imports = blankSrc.match(/^import .*$/gm) || [];
ok(imports.length === 1 && imports[0].includes("'../lib/three.module.js?v="),
  '只 import three 一个外部模块（零业务依赖）', imports.join(' | '));
ok(!/from '\.\/[a-z]/i.test(blankSrc), '没有 import 任何 js/ 下的业务模块');

// ============================================================
sec('② 八招 / 名字牌 / 名字板');
// ============================================================
ok(B.BLANK_MOVES.length === 8, '名字板八格 = 八招', String(B.BLANK_MOVES.length));
ok(BLANK_MOVES_DUP(B.BLANK_MOVES) === false, '八招 key 互不重复');
function BLANK_MOVES_DUP(list) { return new Set(list.map((m) => m.key)).size !== list.length; }
ok(B.BLANK_MOVES.every((m) => m.name && m.short && m.text), '每招都有名字 / 短标 / 说明');
ok(B.BLANK_STEAL_ORDER.length === 6 && B.BLANK_STEAL_ORDER.includes('skill'),
  '「收走一样」是固定六项轮转（可预判）', B.BLANK_STEAL_ORDER.join(','));
ok(near(B.BLANK_BASE.plateLife, 5.0) && near(B.BLANK_BASE.pickRadius, 1.2) && near(B.BLANK_BASE.coinPerName, 30),
  '名字牌：5 秒 / 1.2 格 / 30 金币',
  `${B.BLANK_BASE.plateLife}/${B.BLANK_BASE.pickRadius}/${B.BLANK_BASE.coinPerName}`);
ok(B.BLANK_BASE.totalNames === 8, '名字板总格 8');

const enemies = makeEnemies();
const sys = B.createBlankSystem({ scene, fx, enemies });
ok(sys.enabled() === false, '没 build 之前是关的');
ok(sys.dropPlate({ cfg: { blankMove: 'scatter' }, pos: { x: 0, z: 0 } }) === false, '没启用时不掉牌');

const L18blank = W.LEVELS_BY_ID[18].blank;
sys.build(L18blank);
ok(sys.enabled() === true && sys.state().moves.length === 8, 'build(LEVEL_18.blank) 启用八格名字板');
ok(sys.names.size === 0, '开局一个名字都没抢回来');

const avatar = enemies.add('blankScatter', 3, 0, 10);
avatar.cfg.blankMove = 'scatter';
avatar.cfg.blankAvatar = true;
ok(sys.dropPlate(avatar) === true, '带 blankMove 的残影死后掉名字牌');
ok(sys.state().plates.length === 1 && sys.state().plates[0].key === 'scatter', '地上躺着散名的名字牌');
ok(sys.dropPlate(avatar) === false, '同一枚还在地上时不会掉第二枚');
ok(sys.dropPlate({ cfg: {}, pos: { x: 0, z: 0 } }) === false, '普通怪（没有 blankMove）不掉牌');

// 站远了不捡
sys.update(0.2, { playerPos: { x: 10, z: 0 }, playerRadius: 0.34 });
ok(sys.state().plates.length === 1 && sys.names.size === 0, '离 1.2 格之外捡不到');
// 走近就捡
sys.update(0.2, { playerPos: { x: 3.5, z: 0 }, playerRadius: 0.34 });
ok(sys.names.size === 1 && sys.names.has('scatter'), '走进 1.2 格内就抢回');
ok(sys.state().moves.find((m) => m.key === 'scatter').sealed === true, '抢回的那一格的 sealed 变 true');
ok(sys.state().moves.filter((m) => m.sealed).length === 1, '其余七格仍是灰的');
const evs = sys.takeEvents();
ok(evs.length === 1 && evs[0].kind === 'name' && evs[0].coin === 30 && evs[0].got === 1 && evs[0].total === 8,
  '抢回事件带 金币 / 进度 / 总数', JSON.stringify(evs[0]));
ok(sys.dropPlate(avatar) === false, '已经抢回来的招不会再掉牌');

// 没人捡：5 秒后飘走，6.1 秒后从场上清掉
const avatar2 = enemies.add('blankArm', 10, 0, 10);
avatar2.cfg.blankMove = 'arm';
avatar2.cfg.blankAvatar = true;
sys.dropPlate(avatar2);
sys.update(5.4, { playerPos: { x: 0, z: 0 } });
ok(sys.state().plates.length === 1 && sys.state().plates[0].t > 5, '过了 5 秒还在飘（淡出 1.1 秒）');
sys.update(1.2, { playerPos: { x: 0, z: 0 } });
ok(sys.state().plates.length === 0, '飘满之后从场上清掉');
ok(sys.names.size === 1, '飘走的名字不算抢回');

// 存档
const snap = sys.serialize();
ok(Array.isArray(snap.names) && snap.names.includes('scatter'), 'serialize() 只记已抢回的名字');
const sys2 = B.createBlankSystem({ scene, fx, enemies });
sys2.build(L18blank);
sys2.restore(snap);
ok(sys2.names.size === 1 && sys2.state().moves.find((m) => m.key === 'scatter').sealed, 'restore 后名字板仍然亮着那一格');
sys2.restore({ names: ['nope', 'scatter'] });
ok(sys2.names.size === 1, 'restore 会丢掉不认识的招名');
sys2.restore(null);
ok(sys2.names.size === 0, 'restore(null) 清空名字板');

// clampPoint：没有纸墙时原样返回
const cp = sys2.clampPoint(1, 2);
ok(near(cp.x, 1) && near(cp.z, 2) && !cp.xClamped && !cp.zClamped, '没有纸墙时 clampPoint 不动人');

// ============================================================
sec('③ 空白本体：招表 / 封印 / 护卫 / 小空白');
// ============================================================
const realRand = Math.random;
const ctx = { playerPos: { x: 0, z: 0 }, playerMaxHp: 10, playerRadius: 0.34, hurtPlayer };

function bossTick(sysX, enX, secs, dt = 0.1) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) sysX.tick(enX, dt, ctx);
}

// 3a) 只剩「散名」没封印 → 本体这一招是 8 道弹幕（分身只有 4 道）
{
  Math.random = () => 0;
  const en = makeEnemies();
  const b = B.createBlankSystem({ scene, fx, enemies: en });
  b.build(L18blank);
  const boss = en.add('blank', 0, 0, 100);
  boss.cfg.blankBoss = true;
  boss.cfg.radius = 1;
  b.restore({ names: ['homing', 'arm', 'steal', 'copy', 'spot', 'wall', 'stroke'] });
  b.tick(boss, 1.1, ctx);
  ok(b.state().shots === 8, '本体「散名」= 8 道字牌', String(b.state().shots));
  // 站在中心：第一帧就会被 8 道里至少一道扫到
  hurtLog.length = 0;
  b.update(0.1, ctx);
  ok(hurtLog.length >= 1 && near(hurtLog[0].amount, 10 * 0.06),
    '字牌伤害 = 最大生命 6%（不吃回合倍率）', String(hurtLog[0] && hurtLog[0].amount));

  // 分身版：4 道 / 3%
  const en2 = makeEnemies();
  const b2 = B.createBlankSystem({ scene, fx, enemies: en2 });
  b2.build(L18blank);
  const av = en2.add('blankScatter', 0, 0, 100);
  av.cfg.blankAvatar = true;
  av.cfg.blankMove = 'scatter';
  b2.tick(av, 1.1, ctx);
  ok(b2.state().shots === 4, '残影「散名」= 4 道（约一半）', String(b2.state().shots));
}

// 3b) 封印之后本体不会再放那一招；只剩通用五式
{
  Math.random = () => 0;
  const en = makeEnemies();
  const b = B.createBlankSystem({ scene, fx, enemies: en });
  b.build(L18blank);
  const boss = en.add('blank', 0, 0, 100);
  boss.cfg.blankBoss = true;
  b.restore({ names: [...B.BLANK_MOVES.map((m) => m.key)] });
  b.tick(boss, 1.1, ctx);
  const evsX = b.takeEvents();
  ok(evsX.every((e) => e.kind !== 'stealWarn'), '八招全封印：不会再有「收走一样」的预告');
  ok(evsX.every((e) => e.kind !== 'minion'), '八招全封印：不会再撕小空白');
  // 护卫：全封印时退化成小空白（2 只）
  ok(en.list.filter((o) => o.type === 'blankMinion').length >= 2, '决战一上台就有 2 只护卫',
    String(en.list.filter((o) => o.type === 'blankMinion').length));
}

// 3c) 「收走一样」可预判：预告先来，伤害按当前生命 15%
{
  Math.random = () => 0;
  const en = makeEnemies();
  const b = B.createBlankSystem({ scene, fx, enemies: en });
  b.build(L18blank);
  const boss = en.add('blank', 0, 0, 100);
  boss.cfg.blankBoss = true;
  // 只留「收走一样」没封印 → 本体每次只会放这一招，才能验证轮转表
  b.restore({ names: B.BLANK_MOVES.map((m) => m.key).filter((k) => k !== 'steal') });
  const cleared = { n: 0 };
  b.tick(boss, 1.1, ctx);
  const evsY = b.takeEvents();
  const warn = evsY.find((e) => e.kind === 'stealWarn');
  ok(!!warn && warn.what === 'ground', '第一发预告是「地上的东西」（固定轮转的第一项）', warn && warn.what);
  b.update(2.5, { ...ctx, clearGround: () => { cleared.n++; } });
  ok(cleared.n === 1, '读条 2.4 秒后真的把地面物清掉');
  // 第二发是「技能」
  b.tick(boss, 3.6, ctx);
  const evsZ = b.takeEvents().filter((e) => e.kind === 'stealWarn');
  ok(evsZ.length === 1 && evsZ[0].what === 'skill', '下一发固定轮到「技能栏」', evsZ[0] && evsZ[0].what);
}

// 3d) 「照着我造」：读条后撕一只小空白
{
  Math.random = () => 0;
  const en = makeEnemies();
  const b = B.createBlankSystem({ scene, fx, enemies: en });
  b.build(L18blank);
  const boss = en.add('blank', 0, 0, 100);
  boss.cfg.blankBoss = true;
  b.restore({ names: ['scatter', 'homing', 'arm', 'steal'] });
  b.tick(boss, 1.1, ctx);
  b.update(2.0, ctx);
  const minions = en.list.filter((o) => o.type === 'blankMinion');
  ok(minions.length >= 1, '「照着我造」撕出一只小空白', String(minions.length));
  ok(b.takeEvents().some((e) => e.kind === 'minion'), '召唤事件有出口（main 用来埋点）');
}

// 3e) 「这里没有东西」：白斑 2 块；「合上这一页」：纸墙 1 道
{
  Math.random = () => 0;
  const en = makeEnemies();
  const b = B.createBlankSystem({ scene, fx, enemies: en });
  b.build(L18blank);
  const boss = en.add('blank', 0, 0, 100);
  boss.cfg.blankBoss = true;
  b.restore({ names: ['scatter', 'homing', 'arm', 'steal', 'copy'] });
  b.tick(boss, 1.1, ctx);
  ok(b.state().patches === 2, '本体「这里没有东西」= 2 块白斑', String(b.state().patches));
  b.restore({ names: ['scatter', 'homing', 'arm', 'steal', 'copy', 'spot'] });
  b.update(1.0, ctx);
  // 上一招（白斑）刚放完，本体下一招要等 3.5 秒（一阶间隔），这里一次推够
  b.tick(boss, 3.6, ctx);
  ok(b.state().walls.length === 1, '本体「合上这一页」= 1 道纸墙', String(b.state().walls.length));
  const wall = b.state().walls[0];
  ok(wall && near(wall.life, 3.5), '纸墙持续 3.5 秒', wall && String(wall.life));
}

// 3f) 白斑会把怪直接收走（不是只对玩家生效）
{
  Math.random = () => 0;
  const en = makeEnemies();
  const b = B.createBlankSystem({ scene, fx, enemies: en });
  b.build(L18blank);
  const boss = en.add('blank', 0, 0, 100);
  boss.cfg.blankBoss = true;
  const mob = en.add('minion', 0, 0, 100);
  b.restore({ names: ['scatter', 'homing', 'arm', 'steal', 'copy'] });
  b.tick(boss, 1.1, ctx);
  b.update(0.1, ctx);
  ok(mob.hits >= 1 && mob.state === 'dead', '白斑里的怪被直接收走', `${mob.hits} 次 / ${mob.state}`);
}

Math.random = realRand;

// ============================================================
sec('④ 镇纸锤');
// ============================================================
ok(near(B.HAMMER_BASE.interval[0], 6.5) && near(B.HAMMER_BASE.interval[2], 4.5),
  '自动抡：6.5 / 5.5 / 4.5 秒', B.HAMMER_BASE.interval.join('/'));
ok(near(B.HAMMER_BASE.dmg[0], 3.2) && near(B.HAMMER_BASE.dmg[2], 5.6), '伤害 3.2 / 4.4 / 5.6', B.HAMMER_BASE.dmg.join('/'));
ok(near(B.HAMMER_BASE.cd[0], 26) && near(B.HAMMER_BASE.cd[2], 20) && near(B.HAMMER_BASE.cdMin, 15),
  '砸地冷却 26 / 23 / 20（下限 15）', `${B.HAMMER_BASE.cd.join('/')} min ${B.HAMMER_BASE.cdMin}`);
ok(near(B.HAMMER_BASE.castRadius, 4.0) && near(B.HAMMER_BASE.castPct, 0.25) && near(B.HAMMER_BASE.castMin, 8),
  '砸地：4 格 / 最大生命 25% / 至少 8 点',
  `${B.HAMMER_BASE.castRadius}/${B.HAMMER_BASE.castPct}/${B.HAMMER_BASE.castMin}`);

{
  const en = makeEnemies();
  const smashLog = [];
  const h = B.createHammerSystem({ scene, fx, enemies: en, onSmash: (n, k) => smashLog.push({ n, k }) });
  ok(!h.owned, '没买之前 owned = false');
  ok(h.cast({ x: 0, z: 0 }, 0, 40) === false && h.lastFail === 'lock', '没买之前砸不了（lock）');
  h.setRelicLevel(1);
  ok(h.owned && near(h.cdMax(), 26) && near(h.interval(), 6.5) && near(h.radius(), 2.0) && near(h.damage(), 3.2),
    '一级：冷 26 / 间 6.5 / 半 2.0 / 伤 3.2',
    `${h.cdMax()}/${h.interval()}/${h.radius()}/${h.damage()}`);

  // 自动抡：第一次 update 就砸身前 2.4 格
  const warrior = en.add('warrior', 0, 2.4, 100);
  const blankGuy = en.add('blank', 0, 2.4, 100);
  h.update(0.01, { playerPos: { x: 0, z: 0 }, yaw: 0 });
  ok(warrior.hits === 1 && near(warrior.taken, 3.2), '自动抡：普通怪吃 3.2', String(warrior.taken));
  ok(blankGuy.hits === 1 && near(blankGuy.taken, 3.2 * 1.5), '对空白族 ×1.5（4.8）', String(blankGuy.taken));
  ok(warrior.armorBreak && near(warrior.armorBreak.add, 0.20) && near(warrior.armorBreak.t, 3.0),
    '命中破甲 20% / 3 秒', warrior.armorBreak && JSON.stringify(warrior.armorBreak));
  ok(warrior.knocked === 1, '自动抡有击退');

  // 砸地：4 格内、25% 最大生命、钉 1 秒
  const near1 = en.add('warrior', 1.5, 0, 100);
  const far1 = en.add('warrior', 5.5, 0, 100);
  hurtLog.length = 0;
  ok(h.cast({ x: 0, z: 0 }, 0, 40) === true, '砸地放得出来');
  ok(near(near1.taken, 40 * 0.25), '砸地伤害 = 最大生命 25%（10）', String(near1.taken));
  ok(near1.froze >= 1 && near1.freezeArg.time, '被砸中的怪被钉住 1 秒', near1.freezeArg && String(near1.freezeArg.time));
  ok(!far1.hits, '4 格外的怪吃不到砸地');
  ok(near(h.cdLeft, 26), '砸地立刻进入冷却（26 秒）', String(h.cdLeft));
  ok(h.progress < 0.01 || h.progress === 0, '冷却刚走时 progress ≈ 0', String(h.progress));
  ok(h.cast({ x: 0, z: 0 }, 0, 40) === false && h.lastFail === 'cd', '冷却中再按 = cd');
  h.update(10, { playerPos: { x: 0, z: 0 }, yaw: 0 });
  ok(near(h.cdLeft, 16), '10 秒后冷却剩 16', String(h.cdLeft));
  ok(h.cast({ x: 0, z: 0 }, 0, 40) === false, '还没走完仍然按不动');
  h.update(7, { playerPos: { x: 0, z: 0 }, yaw: 0 });

  // 卡片（applyCard 收的是卡片里的 hammer 描述，不是整张卡）
  h.applyCard({ stat: 'dmg', flat: 1.1 });
  ok(near(h.damage(), 4.3), '卡「加厚的锤头」伤害 +1.1', String(h.damage()));
  h.applyCard({ stat: 'interval', flat: 0.6 });
  ok(near(h.interval(), 5.9), '卡「抡得更勤」间隔 −0.6 秒', String(h.interval()));
  h.applyCard({ stat: 'radius', flat: 0.4 });
  ok(near(h.radius(), 2.4), '卡「换根长柄」半径 +0.4 格', String(h.radius()));
  h.applyCard({ stat: 'brk', flat: 0.08 });
  ok(near(h.bonuses().break, 0.28), '卡「铁砧底」破甲 +8%', String(h.bonuses().break));
  h.applyCard({ stat: 'cd', flat: 3.0 });
  ok(near(h.bonuses().cd, 23), '卡「磨薄的锤座」冷却 −3 秒', String(h.bonuses().cd));

  // 商店两件买断
  h.setShop('head');
  // 设计稿：本体破甲 20% → 35%（+15 点）。上面已经吃过 +8% 的卡，所以这里是 0.43
  ok(near(h.bonuses().radius, 2.8) && near(h.bonuses().break, 0.43), '「加重锤头」半径 +0.4 / 破甲 20→35%（叠卡后 0.43）',
    `${h.bonuses().radius}/${h.bonuses().break}`);
  h.setShop('grip');
  ok(near(h.bonuses().cd, 18.4) && near(h.bonuses().born, 1.75), '「握柄」冷却 −20% / 空白族 1.75',
    `${h.bonuses().cd}/${h.bonuses().born}`);
  // 冷却下限
  for (let i = 0; i < 4; i++) h.applyCard({ stat: 'cd', flat: 3.0 });
  ok(near(h.bonuses().cd, 15), '冷却不会低于 15 秒（cdMin 兜底）', String(h.bonuses().cd));

  // 法器伤害倍率（伤害高光 / 诅咒）。一级锤基础 3.2，已吃 +1.1 的卡 → 4.3 × 2
  h.setRelicAmp({ dmg: 2 });
  ok(near(h.damage(), (3.2 + 1.1) * 2), 'setRelicAmp(dmg) 会乘到锤击伤害上', String(h.damage()));
  // amp 是主循环每帧从法器等级推出来的，不进存档 —— 存/读档前先复原
  h.setRelicAmp({ dmg: 1 });

  // 存档
  const hs = h.snapshot();
  const h2 = B.createHammerSystem({ scene, fx, enemies: makeEnemies() });
  h2.restore(hs);
  h2.setRelicLevel(1);
  ok(near(h2.damage(), h.damage()) && near(h2.bonuses().radius, h.bonuses().radius),
    'snapshot / restore 把卡片与买断都带回来', `${h2.damage()} vs ${h.damage()}`);
  h.clearField();
  ok(near(h.cdLeft, 0) && h.state().relicLv === 1, 'clearField 只清冷却与挥锤动画，不掉等级');
}

// ============================================================
sec('⑤ 五件齐：relics / shop / upgrade / skills / main');
// ============================================================
const REL = R.RELIC_DEFS.hammer;
ok(!!REL && REL.maxLevel === 3 && REL.desc.length === 3, 'relics 里镇纸锤 3 级 3 段说明');
ok(relicsSrc.includes('hammer: 0'), 'relics 的 levels / cds 两张表都带 hammer');

const items = S.SHOP_ITEMS.filter((x) => x.relic === 'hammer' || x.hammer);
ok(items.length === 3, '商店三件：本体 + 锤头 + 握柄', String(items.length));
const body = S.SHOP_ITEMS.find((x) => x.id === 'buyHammer');
ok(body && body.price === 38 && body.needLevel === 18 && body.needRound === 8,
  '本体 38 金 / 第 18 关起 / 第 8 回合', body && `${body.price}/${body.needLevel}/${body.needRound}`);
ok(S.SHOP_ITEMS.find((x) => x.id === 'buyHammerHead')?.price === 20, '「加重锤头」20 金');
ok(S.SHOP_ITEMS.find((x) => x.id === 'buyHammerGrip')?.price === 24, '「握柄」24 金');
ok(Array.isArray(S.SHOP_PINNED[12]) && S.SHOP_PINNED[12].includes('buyHammer'), '第 12 回合固定货位里有镇纸锤');

const HAMMER_IDS = ['hammerDmg', 'hammerRate', 'hammerRange', 'hammerArmor', 'hammerCd'];
ok(HAMMER_IDS.every((id) => U.UPGRADES.some((u) => u.id === id)), '五张锤卡都在卡池里');
ok(U.UPGRADES.filter((u) => u.hammer).length === 5, '锤卡恰好 5 张（不多不少）', String(U.UPGRADES.filter((u) => u.hammer).length));
ok(HAMMER_IDS.every((id) => U.weightOf(U.UPGRADES.find((u) => u.id === id), 20, {}) === 0),
  '没买到镇纸锤之前五张卡权重都是 0');
ok(U.weightOf(U.UPGRADES.find((u) => u.id === 'hammerDmg'), 20, { hammerOwned: true }) > 0,
  '买到之后 hammerDmg 才进池子');
ok(upgSrc.includes('hammerChange'), '卡片文案翻译 hammerChange 在');
ok(/export function applyUpgrade\([^)]*crate = null, hammer = null\)/.test(upgSrc), 'applyUpgrade 末参带 hammer');
ok(/export function previewUpgrade\([^)]*crate = null, hammer = null\)/.test(upgSrc), 'previewUpgrade 末参带 hammer');
{
  const stats = { get: () => 1 };
  const h = B.createHammerSystem({ scene, fx, enemies: makeEnemies() });
  h.setRelicLevel(1);
  const card = U.UPGRADES.find((u) => u.id === 'hammerDmg');
  // 位置写在注释里，少一格/多一格都会静默失效（hammer 收不到卡片）
  const pre = U.previewUpgrade(stats, card,
    /* 3 */ null, /* 4 */ null, /* 5 */ null, /* 6 */ null, /* 7 */ null, /* 8 */ null,
    /* 9 */ null, /* 10 */ null, /* 11 */ null, /* 12 */ null, /* 13 */ null, /* 14 */ null,
    /* 15 */ null, /* 16 hammer */ h);
  const res = U.applyUpgrade(stats, card, /* 3 serial */ 1,
    /* 4 */ null, /* 5 */ null, /* 6 */ null, /* 7 */ null, /* 8 */ null, /* 9 */ null,
    /* 10 */ null, /* 11 */ null, /* 12 */ null, /* 13 */ null, /* 14 */ null, /* 15 */ null,
    /* 16 */ null, /* 17 hammer */ h);
  ok(near(h.damage(), 4.3), 'applyUpgrade 真的把卡片喂给了 hammer.applyCard', String(h.damage()));
  ok(pre.length === res.changes.length && near(pre[0].to, res.changes[0].to),
    '预览与实得一致（都写「3.2 → 4.3」）', `${pre[0] && pre[0].to} / ${res.changes[0] && res.changes[0].to}`);
}

const gsk = SK.getSkill('hammer');
ok(!!gsk && gsk.name === '砸地' && gsk.key === 'g' && gsk.ring === true, '技能「砸地」绑定 G 键、带外圈冷却');
ok(gsk.visible({ playing: true, hammer: { owned: true } }) === true, '有锤子且局内时可见');
ok(gsk.visible({ playing: true, hammer: { owned: false } }) === false, '没锤子时整格隐藏');
ok(gsk.visible({ playing: false, hammer: { owned: true } }) === false, '不在局内时隐藏');
ok(gsk.state({ hammer: { owned: false } }) === 'lock' && gsk.state({ hammer: { owned: true, ready: false } }) === 'cd'
  && gsk.state({ hammer: { owned: true, ready: true } }) === 'ready', '三态 lock / cd / ready');
ok(SK.skillForKey('g') && SK.skillForKey('g').id === 'hammer', '键盘 g 映射到砸地');
{
  const stats = { get: () => 40 };
  const castLog = [];
  const pressCtx = {
    playing: true,
    stats,
    playerPos: { x: 0, z: 0 },
    playerYaw: () => 0,
    hammer: { owned: true, ready: true, cast: (p, y, hp) => { castLog.push({ p, y, hp }); return true; } },
  };
  ok(gsk.press(pressCtx) === true && castLog[0].hp === 40 && castLog[0].y === 0,
    'press 把 位置 / 朝向 / 最大生命 递给了锤子系统', JSON.stringify(castLog[0]));
}

ok(mainSrc.includes("from './blank.js?v="), 'main.js 引入 blank.js');
ok(mainSrc.includes('createBlankSystem') && mainSrc.includes('createHammerSystem'), 'main 两个系统都实例化');
ok(/blank\.build\(level\.level\.blank/.test(mainSrc), 'setLevel 里 blank.build(level.blank)');
ok(/blank\.setRound\(level\.roundNo/.test(mainSrc) && /blank\.update\(dt/.test(mainSrc), '主循环每帧 setRound + update');
ok(/for \(const ev of blank\.takeEvents\(\)\)/.test(mainSrc), '主循环读 blank 事件');
ok(/blank\.dropPlate\(e\)/.test(mainSrc), 'onDeath 调 dropPlate');
ok(/hammer\.update\(dt, \{ playerPos: pos, yaw \}\)/.test(mainSrc), '主循环每帧 hammer.update');
ok(/blank: blank\.serialize\(\)/.test(mainSrc) && /blank\.restore\(saved\.blank\)/.test(mainSrc), '存档 / 读档带 blank');
ok(/hammer: hammer\.snapshot\(\)/.test(mainSrc) && /hammer\.restore\(saved\.hammer\)/.test(mainSrc), '存档 / 读档带 hammer');
ok(/blank\.clampPoint\(pos\.x, pos\.z\)/.test(mainSrc), '纸墙在玩家移动里生效（clampPoint）');
ok(/\{ id: 18, name: LEVEL_18\.name, playable: true \}/.test(mainSrc), '选关表里有第十八关');
ok(/LEVEL_16, LEVEL_17, LEVEL_18, LEVELS_BY_ID/.test(mainSrc), 'main 从 wave.js 引入 LEVEL_18');
ok(mainSrc.includes('id="nameBoard"') === false && indexHtml.includes('id="nameBoard"'), '名字板 UI 在 index.html');
ok(indexHtml.includes('id="nbGrid"') && indexHtml.includes('id="nbCount"'), '名字板有 8 格容器与进度数字');
ok(/\.name-board/.test(styleSrc) && /\.nb-cell/.test(styleSrc), '名字板样式在 style.css');
ok(mainSrc.includes('它手里还剩') && mainSrc.includes('BLANK_MOVES.length - blank.names.size'),
  'BOSS 上台报「还剩几招」');
ok(/blank: \{[\s\S]{0,400}?drop:/.test(mainSrc) && /grantHammer/.test(mainSrc), '调试口有 blank / 锤子 / grantHammer');

// ============================================================
sec('⑥ LEVEL_18 数据');
// ============================================================
const L18 = W.LEVELS_BY_ID[18];
ok(!!L18 && L18.id === 18, 'LEVELS_BY_ID[18] 存在');
ok(L18.name === '第十八关 · 天亮之前', '关卡名 = 第十八关 · 天亮之前', L18.name);
ok(L18.theme === 'blank', "theme = 'blank'", L18.theme);
ok(L18.arena === 20, '舞台 20 格', String(L18.arena));
ok(L18.rounds.length === 20, '20 回合', String(L18.rounds.length));
ok(L18.scale.hpMul === 1.86 && L18.scale.dmgMul === 2.20, 'hpMul 1.86 / dmgMul 2.20',
  `${L18.scale.hpMul}/${L18.scale.dmgMul}`);
ok(/theme: 'blank'/.test(waveSrc) && /blank: 0xf6f2e6|blank:/.test(src('js/scene.js')),
  'scene.js 的 THEMES 里有 blank');

const r20 = L18.rounds[19];
ok(r20.boss === true, '第 20 回合标了 boss');
ok(r20.blank === 1, '第 20 回合只刷空白本体');
const r20monsters = Object.keys(r20).filter((k) => ['gap', 'tip', 'boss'].includes(k) === false);
ok(r20monsters.length === 1 && r20monsters[0] === 'blank', '第 20 回合不放任何普通小怪', r20monsters.join(','));
ok(L18.rounds.every((r) => typeof r.tip === 'string' && r.tip.length >= 10), '每回合都有 tip');

const DEBUT = { blankScatter: 2, blankHoming: 4, blankArm: 6, blankSteal: 8, blankCopy: 10, blankSpot: 12, blankWall: 14, blankStroke: 16 };
for (const [type, no] of Object.entries(DEBUT)) {
  const first = L18.rounds.findIndex((r) => (r[type] || 0) > 0) + 1;
  ok(first === no, `${type} 在第 ${no} 回合登场`, `实际 ${first}`);
  const cfg = E.ENEMY_TYPES[type];
  ok(!!cfg && cfg.blankAvatar === true && cfg.blankMove && B.BLANK_MOVES.some((m) => m.key === cfg.blankMove),
    `${type} 带 blankAvatar 与合法的 blankMove`, cfg && cfg.blankMove);
}
ok(E.ENEMY_TYPES.blank.blankBoss === true && near(E.ENEMY_TYPES.blank.hp, 36), '空白本体 hp 36 / blankBoss', String(E.ENEMY_TYPES.blank.hp));
ok(E.ENEMY_TYPES.blankMinion.planned === true && E.ENEMY_TYPES.blankMinion.blankMoves[0] === 'scatter',
  '小空白是隐藏图鉴、只会散名');
ok(enemySrc.includes('if (e.cfg.blankAvatar || e.cfg.blankBoss || e.cfg.blankMoves)'),
  'enemy.js 把空白族排在通用近战之前分派');

// 八招 ↔ 八只残影一一对应
for (const m of B.BLANK_MOVES) {
  const cfg = Object.values(E.ENEMY_TYPES).find((c) => c.blankMove === m.key);
  ok(!!cfg, `招「${m.name}」有对应的残影`, m.key);
}
ok(Object.values(E.ENEMY_TYPES).filter((c) => c.blankMove).length === 8, '恰好八只残影，一招一只');

// 模型 / 缩略图
const NEW_MONSTERS = ['blankScatter', 'blankHoming', 'blankArm', 'blankSteal', 'blankCopy', 'blankSpot', 'blankWall', 'blankStroke', 'blank'];
for (const k of NEW_MONSTERS) {
  const f = E.ENEMY_TYPES[k].file;
  ok(existsSync(path.join(ROOT, f)), `${k} 模型在盘上（${path.basename(f)}）`);
  ok(existsSync(path.join(ROOT, `assets/codex/${k}.webp`)), `${k} 图鉴缩略图在盘上`);
}

// 剧情 / 成就 / 骨币倍率
ok(/id: 's18', no: 18, act: 3, levelId: 18, atRound: 20/.test(storySrc), '剧情 s18 接第十八关第 20 回合');
ok(A.ACHS.some((a) => a.id === 'blank_names') && A.ACHS.some((a) => a.id === 'blank_flawless')
  && A.ACHS.some((a) => a.id === 'hammer_20'), '三条第十八关成就都在');
ok(A.ACHS.find((a) => a.id === 'clear_all').name === '十八关皆通', '「十八关皆通」已改口');
ok(near(CF.BONE.levelMul[18], 6.0), '骨币倍率第 18 关 = 6.0', String(CF.BONE.levelMul[18]));

// ============================================================
sec('⑦ 总量口径 / 版本号');
// ============================================================
ok(Object.keys(E.ENEMY_TYPES).length === 47, '怪物种类 47（46 可见 + 1 隐藏）', String(Object.keys(E.ENEMY_TYPES).length));
ok(Object.keys(E.ENEMY_TYPES).filter((k) => !E.ENEMY_TYPES[k].planned).length === 46, '可见图鉴 46 条');
ok(Object.keys(R.RELIC_DEFS).length === 20, '法器 20 件', String(Object.keys(R.RELIC_DEFS).length));
ok(S.SHOP_ITEMS.length === 58, '商店 58 件', String(S.SHOP_ITEMS.length));
ok(U.UPGRADES.length === 138, '升级卡 138 张', String(U.UPGRADES.length));
ok(SK.SKILLS.length === 15, '技能 15 格', String(SK.SKILLS.length));
ok(A.ACH_COUNT === 121, '成就 121 条', String(A.ACH_COUNT));
ok(Object.keys(W.LEVELS_BY_ID).length === 18, '关卡 18 张表', String(Object.keys(W.LEVELS_BY_ID).length));

const glbs = readdirSync(path.join(ROOT, 'assets/monsters')).filter((f) => f.endsWith('.glb'));
ok(glbs.length === 46, '怪物 glb 46 个', String(glbs.length));
const webps = readdirSync(path.join(ROOT, 'assets/codex')).filter((f) => f.endsWith('.webp'));
ok(webps.length === 46, '图鉴缩略图 46 张', String(webps.length));
const jsFiles = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
ok(jsFiles.length === 76, 'js 模块 76 个', String(jsFiles.length));

ok(+VER >= 156, '版本号至少到 156', VER);
const badVer = [];
for (const f of ['index.html', ...jsFiles.map((x) => `js/${x}`)]) {
  const s = src(f);
  for (const one of (s.match(/\?v=(\d+)/g) || [])) if (one !== `?v=${VER}`) badVer.push(`${f}:${one}`);
}
ok(badVer.length === 0, '所有 ?v= 都是同一个版本', badVer.slice(0, 5).join(', '));

// 文案里不能残留旧数字
ok(!/十二关皆通/.test(achSrc), '没有残留「十二关皆通」');
ok(indexHtml.includes(`main.js?v=${VER}`), 'index.html 引用的是新版本');

console.log('\n' + '='.repeat(52));
console.log(`第 139 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败清单：'); fails.forEach((f) => console.log('  ✗ ' + f)); }
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
