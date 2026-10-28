// 第 114 块 · 第十一关「钟楼雾原」——契约测试（Node，不开浏览器）
//   ① 关卡数据：LEVEL_11 / 注册 / 难度 / 雾参数 / 20 回合
//   ② 两只新怪：誊录员（墨线）与收账人（收走）
//   ③ 新法器「墨丸」：mine.js 的四个通道 + 商店两件货 + 6 张三选一卡
//   ④ 雾：FOG_LEVELS 注册 + main.js 的接线（build / update / setOnTop / 摇晃）
//   ⑤ 收账人「收走」子系统：STEAL_TIME / 属性池 / 技能池 / 只在 playing 收尾
//   ⑥ 成就 / 图鉴 / 剧情 s11 / 存档快照
// 运行：node .tmp-block114-test.mjs
import { readFileSync } from 'node:fs';
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

// 版本号从 index.html 动态读（铁律：测试不写死 ?v=N）
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];
const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const mainSrc = src('js/main.js');
const enemySrc = src('js/enemy.js');
const shopSrc = src('js/shop.js');

const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const F = await import(`./js/fog.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);
const A = await import(`./js/achievements.js?v=${VER}`);
const M = await import(`./js/mine.js?v=${VER}`);
const ST = await import(`./js/story.js?v=${VER}`);

// ============================================================
sec('① 关卡数据：第十一关 · 钟楼雾原');
// ============================================================
const L11 = W.LEVEL_11;
ok(!!L11, 'LEVEL_11 存在');
ok(L11 && L11.id === 11, 'id = 11');
ok(L11 && L11.name === '第十一关 · 钟楼雾原', `名字 = ${L11 && L11.name}`);
ok(L11 && L11.theme === 'fogfield', '主题皮肤 fogfield（新场景，不复用旧关）');
ok(L11 && L11.rounds.length === 20, `20 回合（实 ${L11 && L11.rounds.length}）`);
ok(W.LEVELS_BY_ID[11] === L11, '在 LEVELS_BY_ID 里注册');
ok(L11 && L11.fog && L11.fog.arena === 18, '雾参数 arena = 18（和场地半径一致）');
ok(L11 && L11.fog.max === 4 && L11.fog.gap === 12, '同屏 4 团 / 每 12 秒一批');
ok(L11 && L11.fog.warn === 1.6, '起雾前 1.6 秒地面预警');
ok(L11 && Math.abs(L11.fog.drift - 0.35) < 1e-6, '漂移 0.35 格/秒（慢慢走，不是瞬移）');
ok(L11 && L11.scale.hpMul === 1.55 && L11.scale.dmgMul === 1.95,
  `难度略高于第十关（hpMul 1.55 / dmgMul 1.95，第十关 1.42/1.8）`,
  L11 && `${L11.scale.hpMul}/${L11.scale.dmgMul}`);
const order = Object.fromEntries((L11 && L11.order) || []);
ok(!!order.clerk, '波次表里有誊录员');
ok(!!order.collector, '波次表里有收账人');
ok(order.collector > order.clerk, '收账人比誊录员晚出场（先教墨线，再教收走）');
ok(/11:\s*LEVEL_11/.test(src('js/wave.js')), 'wave.js 里显式注册');
ok(/\{ id: 11, name: LEVEL_11\.name, playable: true \}/.test(mainSrc), 'main.js 的 LEVELS 加了第 11 项');

// ============================================================
sec('② 两只新怪');
// ============================================================
const clerk = E.ENEMY_TYPES.clerk;
const col = E.ENEMY_TYPES.collector;
ok(Object.keys(E.ENEMY_TYPES).length === 28, `怪种 28 只（25 + 2 + 1，实 ${Object.keys(E.ENEMY_TYPES).length}）`);
ok(!!clerk && clerk.name === '誊录员', 'clerk = 誊录员');
ok(!!col && col.name === '收账人', 'collector = 收账人');
// 模型：两只都是程序化生成（不抢别人的 glb —— 第 97 块的教训）
ok(clerk.proc === 'quill' && !clerk.file, '誊录员 = proc:quill（程序化羽笔，零 glb 复用）');
ok(col.proc === 'book' && !col.file, '收账人 = proc:book（程序化账簿，零 glb 复用）');
ok(/function buildProcModel/.test(enemySrc), 'buildProcModel 是 proc 模型的唯一入口');
// 誊录员：墨线
ok(clerk.ink && clerk.ink.len === 13 && clerk.ink.half === 0.62, '墨线长 13 / 半宽 0.62');
ok(clerk.ink.dmg === clerk.damage, '墨线伤害 = 本体的伤害口径（同一份倍率）');
ok(clerk.ink.bandLife === 7 && clerk.ink.maxBands === 5, '墨痕留 7 秒 / 最多 5 道');
ok(clerk.ink.slow < 1, '踩在墨痕上会变慢');
ok(clerk.attackRange > clerk.keepDistance, '它站在远处画（画得到的地方比它想站的地方远）');
// 收账人：不伤害，只收东西
ok(col.damage === 0, '收账人不造成伤害（damage 0）—— 它的威胁是「失去」而不是「掉血」');
ok(col.collect && col.collect.cast === col.windup, '读条时长和配置一致（前摇就是读条）');
ok(col.collect.range > 0 && col.collect.flee > 0, '收完会往远处退（不给玩家立刻打死它的机会？不 —— 退 2.6 格）');
ok(/function handleClerk/.test(enemySrc) && /function handleCollector/.test(enemySrc), '两只怪各有独立的状态机');
ok(/if \(e\.cfg\.ink\)/.test(enemySrc) && /if \(e\.cfg\.collect\)/.test(enemySrc), '分派在通用近战/术士 AI 之前');
ok(/function startInkCast/.test(enemySrc) && /function fireInk/.test(enemySrc), '墨线：预警 → 落下 → 留痕三段');
ok(/depthTest: !onTop/.test(enemySrc) && /onTop \? 850 : 6/.test(enemySrc),
  '墨线预警穿雾（depthTest:!onTop + renderOrder 850）');
ok(/ctx\.stealFromPlayer/.test(enemySrc), '收账人走 ctx.stealFromPlayer 收口（不在 enemy.js 里改玩家属性）');

// ============================================================
sec('③ 墨丸：mine.js 四个通道 + 商店两件货 + 6 张卡');
// ============================================================
ok(!!R.RELIC_DEFS.mine && R.RELIC_DEFS.mine.name === '墨丸', 'RELIC_DEFS.mine 已注册');
ok(R.RELIC_DEFS.mine.maxLevel === 3 && R.RELIC_DEFS.mine.cap.join(',') === '3,4,5', '三级上限 3/4/5');
ok(R.RELIC_DEFS.mine.desc.length === 3, '三级各有文案');

// 用一套最小的桩跑真系统
const scene = { add() {}, remove() {} };
const fx = { ring() {}, burst() {}, text() {} };
const hitList = [];
const enemiesStub = {
  list: hitList,
  hittable: (e) => e.state !== 'dead',
  takeDamage(e, dmg, crit) { e.hp -= dmg; e.lastDmg = dmg; e.lastCrit = !!crit; },
};
const wstatsStub = {
  get: (k) => ({ swordDamage: 10, swordCrit: 0, swordCritMul: 2 })[k] ?? 0,
};
const mines = M.createMineSystem({ scene, fx, enemies: enemiesStub, wstats: wstatsStub });

ok(mines.owned === false, '没买法器时 owned = false');
ok(mines.drop({ x: 0, z: 0 }) === false && mines.lastFail === 'lock', '没买时按键直接拒（lock）');
mines.setRelicLevel(1);
ok(mines.owned === true, '买到 lv1 后 owned');
ok(mines.cap === 3, `lv1 同屏上限 3（实 ${mines.cap}）`);
ok(Math.abs(mines.cdMax - 8) < 1e-6, `lv1 冷却 8 秒（实 ${mines.cdMax}）`);
ok(Math.abs(mines.radius() - 2.6) < 1e-6, 'lv1 半径 2.6');
ok(Math.abs(mines.bonuses().dmgMul - 2.5) < 1e-6, 'lv1 伤害倍率 ×2.5');

ok(mines.drop({ x: 1, z: 0 }) === true, '放下一枚');
ok(mines.count === 1, '场上 1 枚');
ok(mines.drop({ x: 2, z: 0 }) === false && mines.lastFail === 'cd', '冷却中放不下（cd）');
ok(mines.list().length === 1 && Math.abs(mines.list()[0].x - 1) < 1e-6, '位置就是这个点');

// 起爆延迟：刚放下 0.1 秒还不炸（不然自己刚站上去就吃伤害）
hitList.push({ pos: { x: 1, z: 0 }, cfg: { radius: 0.4, armor: 0 }, state: 'chase', hp: 100 });
mines.update(0.1, { playerPos: { x: 0, z: 0 } });
ok(hitList[0].hp === 100, '落地 0.3 秒内不炸（起爆延迟）');
mines.update(0.25, { playerPos: { x: 0, z: 0 } });
ok(hitList[0].hp === 75, `踩上就炸：10 攻击 ×2.5 = 25 伤害（实 ${100 - hitList[0].hp}）`);
ok(mines.count === 0, '炸完这枚消失');
ok(mines.blastCount() === 1, '留一团墨渍收尾（视觉）');

// 冷却与上限（每放一枚都要把冷却走完 —— 不然测到的是 cd 不是 cap）
hitList.length = 0;                                  // 清场：别让刚放的雷被旧靶子引爆
const dropAll = () => {
  let n = 0;
  while (mines.drop({ x: 0, z: 0 })) { n++; mines.update(9, { playerPos: { x: 0, z: 0 } }); if (n > 20) break; }
  return n;
};
mines.update(9, { playerPos: { x: 0, z: 0 } });     // 走完冷却
ok(mines.ready === true, '冷却走完 ready');
const n1 = dropAll();
ok(n1 === 3, `同屏上限真的卡住（放了 ${n1} 枚）`);
ok(mines.lastFail === 'full', '满了以后 lastFail = full（技能键显示「满」）');
mines.setRelicLevel(2);
ok(mines.cap === 4, 'lv2 上限 4');
mines.setRelicLevel(3);
ok(mines.cap === 5, 'lv3 上限 5');
ok(Math.abs(mines.bonuses().dmgMul - 3.75) < 1e-6, 'lv3 伤害 ×1.5（2.5 → 3.75）');

// 三选一卡：四个通道各自生效
mines.reset();
mines.setRelicLevel(1);
const before = mines.bonuses();
mines.applyCard({ stat: 'dmg', flat: 0.2 });
mines.applyCard({ stat: 'max', flat: 1 });
mines.applyCard({ stat: 'radius', flat: 0.4 });
mines.applyCard({ stat: 'cd', flat: 1.5 });
const after = mines.bonuses();
ok(after.dmgMul > before.dmgMul + 0.4, `伤害卡生效（${before.dmgMul} → ${after.dmgMul}）`);
ok(after.cap === before.cap + 1, `上限卡生效（${before.cap} → ${after.cap}）`);
ok(after.radius > before.radius + 0.35, `范围卡生效（${before.radius} → ${after.radius}）`);
ok(after.cdMax < before.cdMax - 1.4, `冷却卡生效（${before.cdMax} → ${after.cdMax}）`);

// 商店两件货
mines.reset();
mines.setRelicLevel(1);
mines.buySac();
ok(Math.abs(mines.bonuses().dmgMul - 2.875) < 1e-6, '墨囊 +15% 伤害（2.5 → 2.875）');
mines.buyThick();
ok(mines.bonuses().radius > 3.0 && mines.cdMax < 7.0,
  `厚墨：范围 +0.5 / 冷却 −1.5（${mines.bonuses().radius} / ${mines.cdMax}）`);
ok(mines.buySac() === false && mines.buyThick() === false, '两件货各只能买一次');

// 存档快照
const snap = mines.snapshot();
mines.reset();
mines.restore(snap);
ok(mines.bonuses().dmgMul > 2.8 && mines.cdMax < 6.6, 'snapshot → restore 无损');

// 商店表
const buyMine = S.SHOP_ITEMS.find((i) => i.id === 'buyMine');
const inkSac = S.SHOP_ITEMS.find((i) => i.id === 'buyInkSac');
const inkThick = S.SHOP_ITEMS.find((i) => i.id === 'buyInkThick');
ok(!!buyMine && buyMine.type === 'relic' && buyMine.relic === 'mine', 'buyMine 是法器货');
ok(buyMine.needLevel === 11, '墨丸只在第十一关起上架');
ok(!!inkSac && !!inkThick && inkSac.type === 'ink' && inkThick.type === 'ink', '两件墨货 type = ink');
ok(S.SHOP_ITEMS.length === 34, `商店货 34 件（28 + 3 + 3，实 ${S.SHOP_ITEMS.length}）`);
ok(S.itemLocked(inkSac, {}) === '要先拥有「墨丸」', '没墨丸时墨货锁着');
ok(S.itemLocked(inkSac, { mineLevel: 1, round: 9, level: 11 }) === null,
  '有墨丸 + 够了回合/关卡后解锁');
ok(!!S.itemLocked(inkSac, { mineLevel: 1, round: 9, level: 11, inkSac: true }), '买过就锁（一局一次）');
ok(S.SHOP_PINNED[9].includes('buyMine'), '第 9 回合的货架必定摆墨丸');

// 三选一
const mineCards = U.UPGRADES.filter((u) => u.mine);
ok(mineCards.length === 6, `墨丸卡 6 张（实 ${mineCards.length}）`);
ok(mineCards.filter((u) => u.tag === 'atk').length >= 3, '至少 3 张进攻向');
const one = mineCards[0];
ok(U.weightOf(one, 1, {}) === 0, '没墨丸时权重 0（抽不到废牌）');
ok(U.weightOf(one, 1, { mineOwned: true }) > 0, '有墨丸后进池子');
const pv = U.previewUpgrade(
  { get: () => 0, addMod() {}, dumpMods: () => [] },
  one, null, null, null, null, mines,
);
ok(Array.isArray(pv) && pv.length === 1 && pv[0].fromText && pv[0].toText,
  'previewUpgrade 能给出「原值 → 新值」（不会崩）',
  JSON.stringify(pv && pv[0]));
ok(U.UPGRADES.length === 99, `卡池 99 张（87 + 6 + 6，实 ${U.UPGRADES.length}）`);

// 技能栏
const mineSkill = SK.SKILLS.find((s) => s.id === 'mine');
ok(!!mineSkill, '技能栏注册了 mine');
ok(mineSkill.key === '5', '快捷键 5（第 4 格）');
ok(mineSkill.visible({ playing: true, mines: null }) === false, '没墨丸时这一格不出现');
ok(mineSkill.visible({ playing: true, mines: { owned: true } }) === true, '有墨丸后出现');
ok(mineSkill.state({ mines: { owned: true, count: 3, cap: 3, ready: true } }) === 'full',
  '满场地时 state = full（显示「满」）');
ok(mineSkill.state({ mines: { owned: true, count: 0, cap: 3, ready: false } }) === 'cd', '冷却中 state = cd');

// ============================================================
sec('④ 雾：注册 + 接线');
// ============================================================
ok(F.FOG_LEVELS[11] === true, 'FOG_LEVELS 注册第 11 关');
ok(F.levelHasFog(11) === true && F.levelHasFog(10) === false, 'levelHasFog 只认第十一关');
ok(/fog\.build\(level\.level\.fog \|\| null\)/.test(mainSrc), 'setLevel 里按关卡数据 build 雾');
ok(/fog\.update\(dt, \{ playerPos: pos \}\)/.test(mainSrc), '主循环每帧更新雾');
ok(/playerRing\.setOnTop\(!!level\.level\.fog\)/.test(mainSrc), '有雾的关卡把判定环置顶（没雾的还原）');
ok(/fog\.densityAt\(pos\.x, pos\.z\)/.test(mainSrc), '镜头摇晃读的是「这点的雾有多浓」');
ok(/fog\.inside\(e\.pos\.x, e\.pos\.z\)/.test(mainSrc), '「雾里击杀」按倒下那一刻的位置算');
ok(/const VIEW_K = 0\.862/.test(src('js/fog.js')), '雾面位置按相机做投影补偿（VIEW_K）');

// 雾系统本身：没有 document 也能建实例（纹理是懒加载的）
const fogScene = { add() {}, remove() {} };
const fog = F.createFogSystem({ scene: fogScene });
ok(fog.on === false && fog.count === 0, '没 build 之前是关的');
fog.build(null);
ok(fog.on === false, 'build(null) = 关掉（别的关传的就是 undefined）');

// ============================================================
sec('⑤ 收账人「收走」子系统');
// ============================================================
ok(/const STEAL_TIME = 8\.0/.test(mainSrc), '收走 8 秒');
ok(/stolenSkills = new Map\(\)/.test(mainSrc), '技能用一个计时表记（到点自动还）');
ok(/stats\.removeBySource\(stealStatSrc\)/.test(mainSrc), '属性走 removeBySource 收口');
ok(/STEAL_ATTRS\s*=\s*\[/.test(mainSrc), '属性池是白名单表');
for (const k of ['attack', 'attackSpeed', 'moveSpeed', 'critRate', 'armor']) {
  ok(mainSrc.includes(`key: '${k}'`) || mainSrc.includes(`key: '${k}'`), `属性池含 ${k}`);
}
ok(/when: \(\) => stats\.get\('critRate'\) >= 0\.05/.test(mainSrc),
  '暴击为 0 时不进池子（不给人「收走一个你没有的东西」）');
ok(/STEAL_SKILL_NAMES = \{ arrowRain: '箭雨', heal: '回血', golem: '傀儡术', mine: '墨丸' \}/.test(mainSrc),
  '技能池 = 四个有键的技能');
ok(/function skillOwnedById/.test(mainSrc), '只从真正拥有的技能里抽');
ok(/function clearSteal/.test(mainSrc), '同一时刻只挂一条（新的先清旧的）');
ok(/updateSteal\(dt\)/.test(mainSrc), '每帧收尾（到点还回去）');
ok(/stealFromPlayer: \(e\) => stealFromPlayer\(e\)/.test(mainSrc), 'combatCtx 里有 stealFromPlayer');
ok(/clearSteal\(\);\s*\/\/ 第 114 块/.test(mainSrc), 'resetRunState 清掉收走状态');
ok(/stolenSkill\(sk\.id\)/.test(mainSrc), '被收走的技能按不动');
ok(/classList\.toggle\('stolen', stolen\)/.test(mainSrc), '技能键有独立灰态（和冷却区分开）');
ok(/\.sk\.stolen\{/.test(src('style.css')), 'style.css 里有 .sk.stolen');

// ============================================================
sec('⑥ 成就 / 图鉴 / 剧情 / 存档');
// ============================================================
for (const id of ['clear_11', 'clerk_10', 'collector_5', 'fog_20']) {
  ok(!!A.achById(id), `成就 ${id} 已注册`);
}
ok(A.achById('clear_all').name === '十二关皆通', 'clear_all 改名「十二关皆通」');
ok(A.achById('fog_20').prog && A.achById('fog_20').prog.key === 'fogKills', 'fog_20 读 fogKills');
ok(A.ACH_COUNT === 118, `成就总数 118（实 ${A.ACH_COUNT}）`);
ok(/tryAch\('clear_11'\)/.test(mainSrc), '通关第十一关发 clear_11');

const codexSrc = src('js/codex.js');
ok(/cfg\.ink/.test(codexSrc) && /cfg\.collect/.test(codexSrc), '图鉴给两只新怪各写了条目');
const storySrc = src('js/story.js');
ok(/id: 's11'[\s\S]{0,120}levelId: 11/.test(storySrc), '剧情 s11 绑到第 11 关');
ok(/mines: mines\.snapshot\(\)/.test(mainSrc), '存档里带墨丸的局内成长');
ok(/mines\.restore\(saved\.mines\)/.test(mainSrc), '读档还原墨丸');
ok(/mines\.reset\(\)/.test(mainSrc), 'resetRunState 清场地上的墨丸');

// 版本号一致性
ok((indexHtml.match(/\?v=131/g) || []).length === 2, 'index.html 两处 ?v=131');
ok(!/\?v=128/.test(indexHtml) && !/\?v=128/.test(mainSrc), '没有残留的 ?v=128');
const imports = [...mainSrc.matchAll(/from '\.\/[^']*\?v=(\d+)'/g)].map((m) => m[1]);
ok(imports.length > 30 && imports.every((v) => v === VER), `main.js 的 ${imports.length} 条 import 全是 v=${VER}`);

// ============================================================
console.log(`\n===== block114-test: ${pass} pass / ${fail} fail =====`);
if (fails.length) console.log('失败清单:\n - ' + fails.join('\n - '));
process.exit(fail ? 1 : 0);
