// 第 128 块 · 第十五关「钟楼直播间」+ 补光曝光区 + 环形灯 + 开播 + 超管/弹幕
// 契约测试（Node，不开浏览器）
//   ① spotlight.js：默认值 / 开关 / 回合加灯 / 漂移 / 三个查询函数 / reset
//   ② ringlight.js：等级表 / 冷切 / 灯圈跟人 / 减速 / 打赏 / 卡片 / 商店买断 / 存档
//   ③ broadcast.js：临时属性 mod 加得上也撤得干净 / 打赏 / 受伤倍率 / 冷却 / 存档
//   ④ skills.js：环形灯 = Q、开播 = E，且两个都读 ctx
//   ⑤ LEVEL_15：名字 / 主题 / 缩放 / spotlight 参数 / 20 回合 / 18 种怪
//   ⑥ 两只新怪：超管禁言 / 弹幕字牌 / 模型与图鉴缩略图都在盘上
//   ⑦ 五件齐：relics / shop / upgrade 卡池 / skills / main 接线
//   ⑧ 文案与版本号
// 运行：node .tmp-block128-test.mjs
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
const spotSrc = src('js/spotlight.js');
const ringSrc = src('js/ringlight.js');
const bcsSrc = src('js/broadcast.js');
const relicsSrc = src('js/relics.js');
const skillsSrc = src('js/skills.js');
const shopSrc = src('js/shop.js');
const upgSrc = src('js/upgrade.js');
const sceneSrc = src('js/scene.js');
const codexSrc = src('js/codex.js');
const storySrc = src('js/story.js');

const SP = await import(`./js/spotlight.js?v=${VER}`);
const RL = await import(`./js/ringlight.js?v=${VER}`);
const BC = await import(`./js/broadcast.js?v=${VER}`);
const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);

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
    applySlow: (e, o) => { e.slows = (e.slows || 0) + 1; e.lastSlow = o; },
    add(x, z, hp = 10) {
      const e = { id: list.length + 1, pos: { x, z }, cfg: { radius: 0.4 }, maxHp: hp, hp, state: 'chase' };
      list.push(e);
      return e;
    },
  };
}

// ============================================================
sec('① spotlight.js —— 第十五关的补光曝光区');
// ============================================================
const sp = SP.createSpotlightSystem({ scene, arena: 19 });
ok(sp.enabled === false, '没 build 之前整片光是关的');
ok(sp.inLight(0, 0) === false && sp.coinAt(0, 0) === 0, '关着的时候查询一律不生效');
ok(sp.takenMulAt(0, 0) === 1 && sp.enemyMulAt(0, 0) === 1, '关着的时候倍率都是 1');
sp.update(1);   // 不该崩、也不该动
ok(sp.enabled === false, '没启用时 update 不改开关');

const L15 = W.LEVELS_BY_ID[15];
ok(!!L15, 'LEVELS_BY_ID[15] 存在');
sp.build(L15.spotlight);
ok(sp.enabled === true, 'build(LEVEL_15.spotlight) 之后启用');
ok(near(sp.spec.coinKill, 3), '光里击杀 +3 金币（用户选「更贪」）', String(sp.spec.coinKill));
ok(near(sp.spec.playerTakenMul, 1.30), '光里受伤 ×1.30', String(sp.spec.playerTakenMul));
ok(near(sp.spec.enemyMul, 1.20), '光里怪移速 ×1.20', String(sp.spec.enemyMul));
ok(near(sp.spec.radius, 2.8) && near(sp.spec.count, 2), '开局两盏、半径 2.8 格',
  `${sp.spec.count} 盏 / ${sp.spec.radius} 格`);

sp.setRound(1);
ok(sp.count === 2, '第 1 回合亮 2 盏', String(sp.count));
sp.setRound(6);
ok(sp.count === 3, '第 6 回合亮 3 盏', String(sp.count));
sp.setRound(11);
ok(sp.count === 4, '第 11 回合亮 4 盏', String(sp.count));
sp.setRound(16);
ok(sp.count === 5, '第 16 回合亮 5 盏', String(sp.count));
const spots16 = sp.list();
ok(spots16.length === 5, 'list() 跟盏数一致', String(spots16.length));

// 查询：站在第一盏灯的正中心
const s0 = spots16[0];
ok(sp.inLight(s0.x, s0.z) === true, '灯心算「在光里」');
ok(sp.inLight(s0.x + s0.r + 0.2, s0.z) === false, '出半径就不算（判定和画面同一个 radius）');
ok(near(sp.coinAt(s0.x, s0.z), 3), '光里击杀 → 3 币', String(sp.coinAt(s0.x, s0.z)));
ok(near(sp.coinAt(s0.x + s0.r + 1, s0.z), 0), '光外击杀 → 0 币');
ok(near(sp.takenMulAt(s0.x, s0.z), 1.30), '光里受伤倍率 1.30', String(sp.takenMulAt(s0.x, s0.z)));
ok(near(sp.enemyMulAt(s0.x, s0.z), 1.20), '光里怪移速倍率 1.20', String(sp.enemyMulAt(s0.x, s0.z)));

// 漂移：推进几秒之后灯位置必须变了（否则就是「钉在地上」的假光斑）
const before = sp.list()[0];
sp.update(3.0);
const after = sp.list()[0];
ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.01,
  'update(dt) 会让光斑漂起来', `${before.x.toFixed(2)},${before.z.toFixed(2)} → ${after.x.toFixed(2)},${after.z.toFixed(2)}`);
// 后期漂得更快（同一段时间位移更大）
sp.setRound(1);
const p1 = sp.list()[0];
sp.update(2);
const q1 = sp.list()[0];
sp.setRound(16);
const p2 = sp.list()[0];
sp.update(2);
const q2 = sp.list()[0];
const d1 = Math.hypot(q1.x - p1.x, q1.z - p1.z);
const d2 = Math.hypot(q2.x - p2.x, q2.z - p2.z);
ok(d2 > d1, '后期漂移比开局快（灯越亮转得越急）', `${d1.toFixed(3)} → ${d2.toFixed(3)}`);

sp.reset();
ok(sp.count === 2, 'reset() 回到开局两盏', String(sp.count));
ok(sp.enabled === true, 'reset 不关灯（关灯是 build(null) 的事）');
sp.build(null);
ok(sp.enabled === false, 'build(null) 关掉整片光（别的关不受影响）', '');

// ============================================================
sec('② ringlight.js —— 第 17 件法器「环形灯」');
// ============================================================
ok(near(RL.RING_BASE.cd, 24) && near(RL.RING_BASE.duration, 6) && near(RL.RING_BASE.radius, 3.6),
  '基础：冷却 24 秒 / 持续 6 秒 / 半径 3.6 格',
  `${RL.RING_BASE.cd}/${RL.RING_BASE.duration}/${RL.RING_BASE.radius}`);
ok(near(RL.RING_BASE.slow, 0.30) && near(RL.RING_BASE.coin, 1), '基础：减速 30% / 灯下打赏 +1');

const enemies = makeEnemies();
const ring = RL.createRingLightSystem({ scene, fx, enemies });
ok(!ring.owned, '没买之前 owned = false');
ok(ring.drop({ x: 0, z: 0 }) === false && ring.lastFail === 'lock', '没买之前开不了灯');

ring.setRelicLevel(1);
ok(ring.owned && near(ring.cdMax, 24), '一级：owned 且冷却 24 秒', String(ring.cdMax));
const b1 = ring.bonuses();
ok(near(b1.duration, 6) && near(b1.radius, 3.6) && near(b1.slow, 0.30) && b1.coin === 1,
  '一级 bonuses：6 秒 / 3.6 格 / 30% / +1', JSON.stringify(b1));

ok(ring.drop({ x: 0, z: 0 }) === true, '开灯成功');
ok(ring.active === true && ring.count === 1 && ring.cap === 1, '同屏只有一圈灯（cap = 1）');
ok(ring.drop({ x: 0, z: 0 }) === false && ring.lastFail === 'cd', '开着的灯再按也按不动（冷却还没走）');
ok(near(ring.cdLeft, 24), '开灯即进入冷却', String(ring.cdLeft));
ok(ring.inLight(0, 0) === true && ring.inLight(5, 0) === false, '灯圈跟随中心判定（3.6 格内）');
ok(near(ring.coinAt(0, 0), 1) && near(ring.coinAt(5, 0), 0), '灯圈里击杀 +1 币 / 圈外 0');

// 灯圈跟着玩家走
ring.update(0.4, { playerPos: { x: 6, z: 6 } });
ok(ring.inLight(6, 6) === true && ring.inLight(0, 0) === false, '灯圈跟着玩家移动（不是钉在原地）');
ring.update(0.4, { playerPos: { x: 2, z: 2 } });
// 圈里的怪被减速
const inMob = enemies.add(2.2, 2.1);
const outMob = enemies.add(9, 9);
ring.update(0.5, { playerPos: { x: 2, z: 2 } });
ok(inMob.slows === 1 && near(inMob.lastSlow.factor, 0.30), '圈里的怪被减速 30%',
  `${inMob.slows} 次 / ${inMob.lastSlow && inMob.lastSlow.factor}`);
ok(!outMob.slows, '圈外的怪不受影响');
ok(inMob.lastSlow && inMob.lastSlow.time <= 0.6, '减速是短时刷新（不是永久 debuff）', String(inMob.lastSlow && inMob.lastSlow.time));

// 到期自动收灯
ring.update(10, { playerPos: { x: 2, z: 2 } });
ok(ring.active === false && ring.count === 0, '6 秒后灯圈自动收起');
ok(ring.ready === false && ring.cdLeft > 0, '收灯后仍在冷却（不能连开）');

// 卡片
ring.applyCard({ stat: 'duration', flat: 1.5 });
ok(near(ring.bonuses().duration, 7.5), '卡「多开一会儿」持续 +1.5 秒', String(ring.bonuses().duration));
ring.applyCard({ stat: 'radius', flat: 0.4 });
ok(near(ring.bonuses().radius, 4.0), '卡「换大灯罩」半径 +0.4 格', String(ring.bonuses().radius));
ring.applyCard({ stat: 'slow', flat: 0.04 });
ok(near(ring.bonuses().slow, 0.34), '卡「调暗一点」减速 +4%', String(ring.bonuses().slow));
ring.applyCard({ stat: 'cd', flat: 2.5 });
ok(near(ring.bonuses().cdMax, 21.5), '卡「快换电池」冷却 −2.5 秒', String(ring.bonuses().cdMax));
ring.applyCard({ stat: 'coin', flat: 1, extra: [{ stat: 'radius', flat: 0.4 }, { stat: 'duration', flat: 1.5 }] });
ok(ring.bonuses().coin === 2 && near(ring.bonuses().radius, 4.4) && near(ring.bonuses().duration, 9.0),
  '卡「打赏翻倍」= 币 +1 且同时 +半径 +持续（extra 生效）',
  `${ring.bonuses().coin} 币 / ${ring.bonuses().radius} 格 / ${ring.bonuses().duration} 秒`);

// 商店买断
ok(ring.buyBulb() === true && ring.hasBulb() === true, '买断「强光灯管」成功');
ok(ring.buyBulb() === false, '「强光灯管」一局一次');
ring.setRelicLevel(1);
const withBulb = ring.bonuses();
ok(near(withBulb.radius, 5.0) && near(withBulb.slow, 0.39), '灯管：半径 +0.6 / 减速 +5%',
  `${withBulb.radius} 格 / ${withBulb.slow}`);
ok(ring.buyStand() === true && ring.hasStand() === true, '买断「落地支架」成功');
const withStand = ring.bonuses();
ok(near(withStand.duration, 11.0) && near(withStand.cdMax, 17.5), '支架：持续 +2 秒 / 冷却 −4 秒',
  `${withStand.duration} 秒 / ${withStand.cdMax} 秒`);
// 冷却下限 12 秒
ring.applyCard({ stat: 'cd', flat: 20 });
ok(near(ring.bonuses().cdMax, 12), '冷却不会低于 12 秒（cdMin 兜底）', String(ring.bonuses().cdMax));

// 存档
ring.reset();
ring.setRelicLevel(2);
ring.applyCard({ stat: 'radius', flat: 0.4 });
ring.buyBulb();
ring.update(5);
const snap = ring.snapshot();
ok(snap && near(snap.radius, 0.4) && snap.bulb === true, 'snapshot() 带卡片 mod 与买断', JSON.stringify(snap));
const ring2 = RL.createRingLightSystem({ scene, fx, enemies });
// restore() 内部会先 reset()（等级归零），main.js 读档顺序也是「restore → 再设等级」
ring2.restore(snap);
ring2.setRelicLevel(2);
ok(near(ring2.bonuses().radius, 5.2), 'restore 后半径 = 二级 4.2 + 卡片 0.4 + 灯管 0.6（5.2）',
  String(ring2.bonuses().radius));
ok(ring2.hasBulb() === true, 'restore 后买断状态也回来了');
ok(ring2.ready === true, 'restore 后冷却为 0（存档只存加成，不存开着的灯）');

ring2.reset();
ok(!ring2.owned && ring2.hasBulb() === false, 'reset() 清掉等级 / 卡片 / 买断');

// ============================================================
sec('③ broadcast.js —— 技能「开播」');
// ============================================================
ok(near(BC.BROADCAST_BASE.duration, 6) && near(BC.BROADCAST_BASE.cd, 45) && near(BC.BROADCAST_BASE.haste, 0.20),
  '基础：6 秒 / 冷却 45 秒 / 攻速 +20%',
  `${BC.BROADCAST_BASE.duration}/${BC.BROADCAST_BASE.cd}/${BC.BROADCAST_BASE.haste}`);
ok(near(BC.BROADCAST_BASE.move, 0.15) && near(BC.BROADCAST_BASE.dmgTaken, 0.10) && BC.BROADCAST_BASE.coin === 1,
  '基础：移速 +15% / 受伤 +10% / 击杀 +1 币');

const statsLog = [];
const stats = {
  addMod: (m) => statsLog.push({ k: 'add', m }),
  removeBySource: (s) => statsLog.push({ k: 'remove', s }),
};
let bcStarted = 0;
const bc = BC.createBroadcastSystem({ stats, fx, onStart: () => { bcStarted++; } });
ok(bc.owned === true, 'owned 恒为 true（「有没有」由通关记录决定）');
ok(bc.ready === true && bc.active === false, '初始 ready');
ok(bc.cast({ x: 0, z: 0 }) === true, '开播成功');
ok(bc.active === true && near(bc.remain, 6), '持续 6 秒', String(bc.remain));
ok(near(bc.cdLeft, 45) && near(bc.cdMax, 45), '开播即进 45 秒冷却');
ok(bcStarted === 1, 'onStart 回调被叫了一次');
const adds = statsLog.filter((x) => x.k === 'add');
ok(adds.length === 2, '加了两个临时属性', String(adds.length));
ok(adds.some((x) => x.m.stat === 'attackSpeed' && near(x.m.pct, 0.20) && x.m.src === 'broadcast'),
  '攻速 +20% 且带 src（到期要能撤干净）');
ok(adds.some((x) => x.m.stat === 'moveSpeed' && near(x.m.pct, 0.15) && x.m.src === 'broadcast'),
  '移速 +15% 且带 src');
ok(bc.takenMul() === 1.1, '开播期间受伤 ×1.1（直播不设防）', String(bc.takenMul()));
ok(bc.coinBonus() === 1, '开播期间击杀 +1 打赏');
ok(bc.cast({ x: 0, z: 0 }) === false, '冷却中开不了播');

bc.update(6.2);
ok(bc.active === false && near(bc.remain, 0), '6 秒后自动下播');
ok(statsLog.some((x) => x.k === 'remove' && x.s === 'broadcast'), '到期用 removeBySource 撤掉全部临时属性');
ok(bc.takenMul() === 1 && bc.coinBonus() === 0, '下播后受伤 / 打赏回到原值');
ok(bc.progress >= 0 && bc.progress <= 1, 'progress 在 0~1', String(bc.progress));
bc.update(50);
ok(bc.ready === true, '45 秒后冷却好了');
bc.setCdMul(0.5);
ok(near(bc.cdMax, 45 * 0.5) || near(bc.cdMax, 24), 'setCdMul(0.5) 缩短冷却（下限 24 秒）', String(bc.cdMax));
bc.reset();
ok(bc.active === false && bc.cdLeft === 0 && bc.ready === true, 'reset = 下播 + 清冷却');
const bs = bc.snapshot();
ok(bs && typeof bs.cd === 'number', 'snapshot() 只有冷却', JSON.stringify(bs));
const bc2 = BC.createBroadcastSystem({ stats, fx });
bc2.restore({ cd: 12 });
ok(near(bc2.cdLeft, 12) && bc2.ready === false, 'restore() 把冷却读回来', String(bc2.cdLeft));
bc2.restore(null);
ok(bc2.cdLeft === 0 && bc2.ready === true, 'restore(null) 等价于清场');

// ============================================================
sec('④ skills.js —— 键位 Q / E');
// ============================================================
const skRing = SK.SKILLS.find((s) => s.id === 'ringlight');
const skBc = SK.SKILLS.find((s) => s.id === 'broadcast');
ok(!!skRing && !!skBc, 'SKILLS 里有 ringlight / broadcast');
ok(skRing && skRing.key === 'q', "环形灯的键位是 'q'", skRing && skRing.key);
ok(skBc && skBc.key === 'e', "开播的键位是 'e'", skBc && skBc.key);
ok(skRing && /ctx\.ringlight/.test(skRing.visible.toString() + skRing.ready.toString()),
  '环形灯读 ctx.ringlight');
ok(skBc && /ctx\.broadcast/.test(skBc.visible.toString() + skBc.ready.toString()),
  '开播读 ctx.broadcast');
// 开播不需要法器：visible 只认 playing + broadcast
const fakeCtx = { playing: true, broadcast: { ready: true, active: false, remain: 0, cdLeft: 0, cdMax: 45, progress: 1 }, ringlight: null };
ok(skBc.visible(fakeCtx) === true && skBc.ready(fakeCtx) === true, '通关第十四关后，不用买法器也能开播');
ok(skRing.visible(fakeCtx) === false, '没买环形灯时不显示那一格');

// ============================================================
sec('⑤ LEVEL_15 —— 钟楼直播间');
// ============================================================
ok(L15.name.includes('第十五关') && L15.name.includes('钟楼直播间'), '关卡名对', L15.name);
ok(L15.theme === 'studio', '主题是 studio（新开的直播间）', L15.theme);
ok(near(L15.scale.hpMul, 1.70) && near(L15.scale.dmgMul, 2.05),
  '数值档位：hpMul 1.70 / dmgMul 2.05', `${L15.scale.hpMul} / ${L15.scale.dmgMul}`);
ok(L15.rounds.length === 20, '20 回合', String(L15.rounds.length));
ok(L15.rounds.every((r) => typeof r.tip === 'string' && r.tip.length > 4), '每回合都有 tip');
ok(L15.rounds.every((r) => !r.tip.includes('**')), 'tip 里没有 markdown 星号（textContent 不认）');
ok(L15.upgradeAfter.length === 12 && L15.shopAfter.length === 6, '升级 / 商店回合表沿用 12 / 6');
ok(L15.weaponAt === 4, '第 4 回合给环剑');
ok(near(L15.arena, 19) && L15.spawnRadius < L15.arena * 1.05, '场地 19 格、刷怪半径不出界',
  `${L15.arena} / ${L15.spawnRadius}`);

const l15types = (L15.order || []).map(([t]) => t);
ok(l15types.length === 18, '本关用 18 种怪', String(l15types.length));
ok(l15types.includes('danmaku') && l15types.includes('moderator'), '两只新怪都排进了出场顺序');
ok(new Set(l15types).size === l15types.length, '出场顺序里没有重复的怪');
const roundKeys = new Set();
for (const r of L15.rounds) for (const k of Object.keys(r)) if (k !== 'gap' && k !== 'tip') roundKeys.add(k);
const unexpected = [...roundKeys].filter((k) => !l15types.includes(k));
ok(unexpected.length === 0, '回合表里没有 order 之外的怪', unexpected.join(','));
const usage = {};
for (const r of L15.rounds) for (const k of Object.keys(r)) usage[k] = (usage[k] || 0) + (r[k] || 0);
ok(usage.danmaku > 0 && usage.moderator > 0, '两只新怪在回合表里都有实际数量',
  `弹幕 ${usage.danmaku} / 超管 ${usage.moderator}`);
ok(l15types.indexOf('danmaku') < l15types.indexOf('moderator'),
  '弹幕比超管先出场（先学躲字牌，再学防禁言）');
ok(usage.minion > 0 && usage.warrior > 0 && usage.archer > 0, '基本功三种怪也在场（不是只靠新怪撑）');

const spCfg = L15.spotlight;
ok(!!spCfg, 'LEVEL_15 带 spotlight 配置');
ok(spCfg && spCfg.arena === L15.arena, '光斑 arena 和关卡一致（灯绕着场地中心转）',
  `${spCfg.arena} / ${L15.arena}`);
ok(spCfg && spCfg.extraAt.length === 3, '三次加灯（第 6 / 11 / 16 回合）', String(spCfg.extraAt.length));
ok(spCfg && spCfg.extraAt.every((e, i) => e.round === [6, 11, 16][i]), '加灯回合是 6 / 11 / 16',
  JSON.stringify(spCfg.extraAt));

// 主题真的接进了 scene.js
ok(sceneSrc.includes('studio: {') && sceneSrc.includes("ground: 'studio'"), 'scene.js 里有 studio 主题');
ok(sceneSrc.includes("if (kind === 'studio') return makeStudioTexture();"), 'scene.js 的贴图分派认识 studio');

// ============================================================
sec('⑥ 两只新怪');
// ============================================================
const mod = E.ENEMY_TYPES.moderator;
const dmk = E.ENEMY_TYPES.danmaku;
ok(!!mod && !!dmk, 'ENEMY_TYPES 里有 moderator / danmaku');
ok(mod && mod.file === 'assets/monsters/yeti.glb', '超管的模型文件对', mod && mod.file);
ok(dmk && dmk.file === 'assets/monsters/glub.glb', '弹幕的模型文件对', dmk && dmk.file);
ok(mod && near(mod.damage, 0), '超管一下都不打人（damage 0）');
ok(mod && near(mod.mute.duration, 3.0), '禁言 3 秒', mod && String(mod.mute.duration));
ok(mod && mod.attackRange > mod.keepDistance, '超管躲在中距离（射程 > 保持距离）');
ok(dmk && dmk.projectile && dmk.projectile.word === true, '弹幕吐的是「字牌」（word = true）');
ok(dmk && dmk.damage === 1 && near(dmk.hp, 3.0), '弹幕脆（3 血）且伤害 1', `${dmk && dmk.hp} 血`);
ok(dmk && near(dmk.projectile.speed, 4.6), '字牌飞得慢（比骨刀慢，才躲得掉）', dmk && String(dmk.projectile.speed));
ok(enemySrc.includes("const WORD_TEXTS = ['就这?', '下播吧', '刷屏了', '菜'];"), '四种字牌文案都在');
ok(/spinRate: cfg\.word \? 0 : 16/.test(enemySrc), '字牌不翻滚（翻了看不清字）');
ok(/function handleModerator\(/.test(enemySrc), '有 handleModerator 的 AI 分支');
ok(/if \(e\.cfg\.mute\) \{ handleModerator/.test(enemySrc), 'AI 分派认识 cfg.mute');
ok(/ctx\.silenceSkills/.test(enemySrc), '超管通过 ctx.silenceSkills 锁技能栏（不直接碰 main 的变量）');
ok(/ctx\.lightMul/.test(enemySrc), '怪移动读 ctx.lightMul（光斑决定倍率）');

// 图鉴缩略图 + 图鉴文案
ok(existsSync(path.join(ROOT, 'assets/codex/danmaku.webp')), '图鉴缩略图 danmaku.webp 在');
ok(existsSync(path.join(ROOT, 'assets/codex/moderator.webp')), '图鉴缩略图 moderator.webp 在');
ok(codexSrc.includes('if (cfg.mute) {') && codexSrc.includes('if (cfg.projectile && cfg.projectile.word) {'),
  '图鉴补了两只新怪的专属文案');
const modDescBlock = codexSrc.slice(codexSrc.indexOf('禁言压力'), codexSrc.indexOf('禁言压力') + 500);
ok(!modDescBlock.includes('**') && !modDescBlock.includes('<b>'),
  '禁言文案里没有 ** / HTML（textContent 会显示字面符号）');

// ============================================================
sec('⑦ 五件齐：法器 / 技能 / 卡池 / 商店 / 接线');
// ============================================================
// 法器定义
ok(relicsSrc.includes('ringlight: {') && relicsSrc.includes('ringlight: 0'), 'relics 的定义表 + 两张状态表都有');
ok(relicsSrc.includes('ringlight: {') && /maxLevel: 3/.test(relicsSrc), '环形灯最高三级');
// 商店上架
ok(shopSrc.includes("id: 'buyRinglight'") && shopSrc.includes("id: 'buyRingBulb'") && shopSrc.includes("id: 'buyRingStand'"),
  '商店三件货都在');
const buyRing = S.SHOP_ITEMS.find((i) => i.id === 'buyRinglight');
ok(buyRing && buyRing.needLevel === 15 && buyRing.needRound === 8, '环形灯第 15 关起、第 8 回合才能上架',
  `${buyRing && buyRing.needLevel} / ${buyRing && buyRing.needRound}`);
ok(shopSrc.includes("if (item.type === 'ringlight')"), 'itemLocked 认识 ringlight 类型');
// 卡池
ok(['ringDur', 'ringRad', 'ringSlow', 'ringCd', 'ringSet'].every((id) => upgSrc.includes(`id: '${id}'`)),
  '五张环形灯卡都在');
ok(upgSrc.includes('if (up.ringlight && !opts.ringlightOwned) return 0;'), '没买到法器前卡片不进池子');
ok(/export function applyUpgrade\([^)]*ringlight = null, pencil = null, crate = null\)/.test(upgSrc), 'applyUpgrade 末参加 ringlight（第 129 块尾随 pencil）');
ok(/export function previewUpgrade\([^)]*ringlight = null, pencil = null, crate = null\)/.test(upgSrc), 'previewUpgrade 末参加 ringlight（第 129 块尾随 pencil）');
ok(upgSrc.includes('function ringlightChange(c, b)'), '升级卡有 changes 文案翻译');
// 技能名与卡池门闩
ok(/if \(up\.ringlight && !opts\.ringlightOwned\) return 0;/.test(upgSrc), '专属卡带「没买到本体就不进池」门控');
// 接线
ok(/LEVEL_14, LEVEL_15, LEVEL_16, LEVEL_17, LEVELS_BY_ID/.test(mainSrc), 'main.js 从 wave.js 引入了 LEVEL_15（第 129 块尾随 LEVEL_16）');
ok(/\{ id: 15, name: LEVEL_15\.name, playable: true \}/.test(mainSrc), '选关表里有第 15 关');
ok(mainSrc.includes("from './spotlight.js?v=") && mainSrc.includes("from './ringlight.js?v=")
  && mainSrc.includes("from './broadcast.js?v="), 'main.js 引入了三个新模块');
ok(/spotlight\.build\(level\.level\.spotlight \|\| null\)/.test(mainSrc), '换关时 build 补光光斑');
ok(/spotlight\.setRound\(level\.roundNo\)/.test(mainSrc) && mainSrc.includes('spotlight.update(dt)'),
  '主循环喂回合 + 推进光斑');
ok(mainSrc.includes('ringlight.update(dt, { playerPos: pos })'), '主循环推进环形灯');
ok(mainSrc.includes('broadcast.update(dt)'), '主循环推进开播');
ok(/const tip = spotlight\.coinAt\(e\.pos\.x, e\.pos\.z\)/.test(mainSrc)
  && /\+ ringlight\.coinAt\(e\.pos\.x, e\.pos\.z\)/.test(mainSrc)
  && /\+ broadcast\.coinBonus\(\);/.test(mainSrc), '三处打赏在 onDeath 里叠起来');
ok(/const lightMul = spotlight\.takenMulAt\(pos\.x, pos\.z\) \* broadcast\.takenMul\(\);/.test(mainSrc),
  '受伤入口乘上曝光倍率 + 开播倍率');
ok(/lightMul: \(x, z\) => spotlight\.enemyMulAt\(x, z\)/.test(mainSrc), '战斗上下文给怪传 lightMul');
ok(/silenceSkills: \(sec\) => \{/.test(mainSrc) && /if \(silenceT > 0\) \{/.test(mainSrc),
  '禁言：写入 + pressSkill 拦截都在');
ok(/if \(silenceT > 0\) silenceT = Math\.max\(0, silenceT - dt\)/.test(mainSrc), '主循环倒数禁言');
ok(/ringlight: ringlight\.snapshot\(\),/.test(mainSrc) && /broadcast: broadcast\.snapshot\(\)/.test(mainSrc)
  && /ringlight\.restore\(saved\.ringlight\)/.test(mainSrc) && /broadcast\.restore\(saved\.broadcast\)/.test(mainSrc),
  '存档写入 + 读档恢复');
ok(mainSrc.includes("if (item.relic === 'ringlight')"), '买到法器本体时同步等级');
ok(mainSrc.includes("} else if (item.type === 'ringlight') {"), '两件买断货有购买分支');
ok((mainSrc.match(/ringBulb: ringlight\.hasBulb\(\)/g) || []).length === 2,
  '商店的两个 ctx 都补了环形灯买断状态');
ok(mainSrc.includes('ringlightOwned: relics.levels().ringlight > 0'), '抽卡池的门闩认识环形灯');
ok(/HINTS = \{[\s\S]*ringlight: \{/.test(mainSrc), '首次拿到环形灯有教程卡');
ok(mainSrc.includes('spotlight: {') && mainSrc.includes('grantRinglight'), '调试口有 spotlight / grantRinglight');
ok(/id: 's15', no: 15, act: 3, levelId: 15/.test(storySrc), '第十五夜绑上了第十五关');

// 总量口径
const relicCount = Object.keys(R.RELIC_DEFS).length;
ok(relicCount === 19, '法器总数 18（第 129 块 +铅笔）', String(relicCount));
ok(SK.SKILLS.length === 14, '技能格 13（第 129 块 +描红）', String(SK.SKILLS.length));
ok(S.SHOP_ITEMS.length === 55, '商店货 52', String(S.SHOP_ITEMS.length));
ok(U.UPGRADES.length === 133, '升级卡 127 张', String(U.UPGRADES.length));
ok(Object.keys(E.ENEMY_TYPES).length === 37, '怪物种类 35', String(Object.keys(E.ENEMY_TYPES).length));
ok(Object.keys(W.LEVELS_BY_ID).length === 17, '关卡 16 张表', String(Object.keys(W.LEVELS_BY_ID).length));

// 守卫：加关卡 = 法器 + 技能 + 卡池一起加（用户 2026-10-31 定下的铁律）
const NO_CARD_SKILLS = new Set(['swordRain', 'broadcast']);
for (const sk of SK.SKILLS) {
  if (NO_CARD_SKILLS.has(sk.id)) continue;
  const n = (upgSrc.match(new RegExp(sk.id, 'g')) || []).length;
  ok(n >= 1, `技能 ${sk.id} 在卡池里有专属卡（加技能必须同时加卡）`, `${n} 处引用`);
}
ok(upgSrc.includes('if (up.ringlight && !opts.ringlightOwned) return 0;'),
  '专属卡带「没买到本体就不进池」门控');
const relicKeys = new Set(Object.keys(R.RELIC_DEFS));
ok(['ringlight', 'guillotine', 'board', 'mark'].every((k) => relicKeys.has(k)), '卡池用到的法器名都在 RELIC_DEFS 里');

// ============================================================
sec('⑧ 模型资产 / 文案 / 版本号');
// ============================================================
const mdir = path.join(ROOT, 'assets/monsters');
const glbs = readdirSync(mdir).filter((f) => f.endsWith('.glb'));
const hashes = new Map();
for (const f of glbs) {
  const h = createHash('md5').update(readFileSync(path.join(mdir, f))).digest('hex');
  if (hashes.has(h)) console.log(`  !! 重复：${f} == ${hashes.get(h)}`);
  hashes.set(h, f);
}
ok(hashes.size === glbs.length, `${glbs.length} 个怪物模型一个都不重复（第 11 关之后不许撞脸）`, `${hashes.size} 个唯一哈希`);
ok(glbs.includes('glub.glb') && glbs.includes('yeti.glb'), '两份新模型在盘上');
ok(readFileSync(path.join(mdir, 'glub.glb')).length > 2048 && readFileSync(path.join(mdir, 'yeti.glb')).length > 2048,
  '两份模型都不是空文件',
  `${Math.round(readFileSync(path.join(mdir, 'glub.glb')).length / 1024)}KB / ${Math.round(readFileSync(path.join(mdir, 'yeti.glb')).length / 1024)}KB`);
ok(glbs.length === 37, '怪物模型总数 35', String(glbs.length));

// textContent 渲染的文案不许有 ** 或 HTML
ok(!/desc: '[^']*\*\*/.test(shopSrc.slice(shopSrc.indexOf("id: 'buyRinglight'"), shopSrc.indexOf("id: 'buyRinglight'") + 900)),
  '商店文案里没有 ** 加粗');
ok(!/hint: '[^']*\*\*/.test(skillsSrc.slice(skillsSrc.indexOf("id: 'ringlight'"), skillsSrc.indexOf("id: 'ringlight'") + 900)),
  '环形灯 hint 里没有 ** 加粗');
ok(!/hint: '[^']*\*\*/.test(skillsSrc.slice(skillsSrc.indexOf("id: 'broadcast'"), skillsSrc.indexOf("id: 'broadcast'") + 900)),
  '开播 hint 里没有 ** 加粗');
ok(/<b>/.test(mainSrc.slice(mainSrc.indexOf('ringlight: {'), mainSrc.indexOf('ringlight: {') + 900)),
  '教程卡允许用 <b>（它是 innerHTML 渲染，和商店 desc 的 textContent 不同）');

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

console.log(`\n===== block128：${pass} ✓ / ${fail} ✗ =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); process.exitCode = 1; }
