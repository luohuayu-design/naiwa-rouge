// 第 123 块 · 第十三关「焦土操场」+ 纸立牌 —— 契约测试（Node，不开浏览器）
//   ① board.js：等级表 / 冷却 / 判定几何 / 卡片 / 商店买断 / 清场
//   ② LEVEL_13 数据：名字 / 场地 / 缩放 / 跑道 / 20 回合 / 每回合有 tip
//   ③ 两只新怪：立牌（正面减伤 + 慢转身）/ 取景的（锥形快门）
//   ④ 模型资产：六份新 glb 在盘上、零复用、不再有程序化怪
//   ⑤ 接线：main 的 LEVELS 有 12 和 13、combatCtx.blockShot、enemy 的两处判定
//   ⑥ 法器 / 技能 / 商店 / 抽卡 四处都认识 board
//   ⑦ 文案与版本号
// 运行：node .tmp-block123-test.mjs
import { readFileSync, existsSync } from 'node:fs';
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
const boardSrc = src('js/board.js');
const relicsSrc = src('js/relics.js');
const skillsSrc = src('js/skills.js');
const shopSrc = src('js/shop.js');
const upgSrc = src('js/upgrade.js');

const B = await import(`./js/board.js?v=${VER}`);
const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ============================================================
sec('① board.js —— 纸立牌本体');
// ============================================================
// 极简 stub：牌的系统只碰 scene.add/remove 和 fx.ring，不碰 DOM。
const scene = { add() {}, remove() {} };
const rings = [];
const fx = { ring: (p, o) => rings.push({ p, o }) };
const mk = () => B.createBoardSystem({ scene, fx });

const b1 = mk();
ok(!b1.owned(), '没买之前 owned = false');
ok(b1.drop({ x: 0, z: 0 }, 0) === false, '没买之前按下去立不出牌');
ok(b1.lastFail() === 'lock', '失败原因写的是 lock（不是静默 false）');

ok(near(B.BOARD_LEVELS.life[0], 6) && near(B.BOARD_LEVELS.life[2], 10),
  '等级表：持续 6 / 8 / 10 秒', B.BOARD_LEVELS.life.join('/'));
ok(near(B.BOARD_LEVELS.cd[0], 26) && near(B.BOARD_LEVELS.cd[2], 18),
  '等级表：冷却 26 / 22 / 18 秒', B.BOARD_LEVELS.cd.join('/'));
ok(B.BOARD_LEVELS.count.join() === '1,1,2', '等级表：三级一次立两块', B.BOARD_LEVELS.count.join('/'));

b1.setRelicLevel(1);
ok(b1.owned() && b1.count() === 0 && b1.ready(), '买 1 级：0 块牌 / 可用');
ok(near(b1.cap(), 1) && near(b1.life(), 6) && near(b1.cdMax(), 26),
  '1 级：上限 1 块 / 持续 6 秒 / 冷却 26 秒');
ok(rings.length === 0, '落地前不打任何特效');

ok(b1.drop({ x: 0, z: 0 }, 0) === true, '按下能立起来');
ok(b1.count() === 1, '场上 1 块');
ok(rings.length === 1, '立起来打了一圈落地环（视觉反馈）');
ok(near(b1.cdLeft(), b1.cdMax()), '立完立刻进冷却');
ok(!b1.ready(), '冷却中不能立第二块');
ok(b1.drop({ x: 0, z: 0 }, 0) === false && b1.lastFail() === 'cd',
  '冷却中再按：回 false 且原因是 cd');

// 判定几何：牌立在 yaw=0 的前方 2 格 → 世界坐标 (0, 2)，法线朝 ±Z
ok(b1.hitAt(0, 2) === true, '牌心判定命中');
ok(b1.hitAt(0, 2.3) === true, '前向 0.35 格内仍算撞上（弹体不会穿纸）');
ok(b1.hitAt(0, 3.6) === false, '离牌 1.6 格不命中');
ok(b1.hitAt(1.3, 2) === false, '横向超出半宽不命中');
ok(b1.hitAt(0.9, 2) === true, '横向半宽内命中（1.15 的一半以上都算）');
ok(b1.blockShot === b1.hitAt || b1.blockShot(0, 2) === true, 'blockShot 是给 enemy 用的同一个判定');
ok(b1.list().length === 1 && near(b1.list()[0].yaw, 0), 'list() 回得出点位与朝向');

// 到期：牌消失，但冷却还在走
b1.update(6.4);
ok(b1.count() === 0, '6 秒后牌自己塌了');
ok(!b1.ready(), '这时候冷却还没转完（26 秒）');
b1.update(20);
ok(b1.ready(), '冷却转完又可用');

// 三级：一次两块，错开 90°
const b3 = mk();
b3.setRelicLevel(3);
ok(near(b3.life(), 10) && near(b3.cdMax(), 18) && near(b3.cap(), 2), '3 级：10 秒 / 18 秒 / 2 块');
b3.drop({ x: 0, z: 0 }, 0);
ok(b3.count() === 2, '3 级按下立两块');
const ys = b3.list().map((b) => +b.yaw.toFixed(3)).sort((a, b) => a - b);
ok(near(ys[0], 0, 1e-3) && near(ys[1], Math.PI / 2, 1e-2), '两块错开 90°（一块正面、一块侧面）', ys.join('/'));
ok(b3.ready() === false, '两块都在场 → 满，不能再立');

// 卡片：宽度 / 持续 / 同时几块
const b4 = mk();
b4.setRelicLevel(1);
const w0 = b4.width();
b4.applyCard({ width: 0.25 });
ok(near(b4.width(), w0 + 0.25), '「糊宽一点」真的把判定放宽了');
b4.applyCard({ duration: 1.5 });
ok(near(b4.life(), 7.5), `「多糊一层」把持续加到 ${b4.life()} 秒`);
b4.applyCard({ count: 1 });
ok(near(b4.cap(), 2), '「再来一块」把上限加到 2');
b4.applyCard({ cd: 2.5 });
ok(near(b4.cdMax(), 23.5), `「随手一撕」把冷却压到 ${b4.cdMax()} 秒`);
// 冷却下限：卡叠再多也不会变成永动机
for (let i = 0; i < 20; i++) b4.applyCard({ cd: 5 });
ok(b4.cdMax() >= 10, `冷却有 10 秒下限（实 ${b4.cdMax()}）`);

// 商店两件买断（各自只生效一次）
const b5 = mk();
b5.setRelicLevel(2);
const life20 = b5.life();
ok(b5.buyOil() === true, '油纸能买');
ok(b5.buyOil() === false, '油纸买不了第二次');
ok(b5.hasOil() && near(b5.life(), life20 + 2), '油纸：持续 +2 秒');
ok(b5.width() > 1.15, `油纸：牌面更宽（${b5.width()}）`);
const cap20 = b5.cap();
ok(b5.buyBrace() === true && b5.buyBrace() === false, '三角支架买一次就锁');
ok(near(b5.cap(), cap20 + 1), '三角支架：上限 +1');

// 清场 / 重开
b5.drop({ x: 1, z: 1 }, 0);
ok(b5.count() > 0, '清场前场上有牌');
b5.clearField();
ok(b5.count() === 0, 'clearField 只清场（等级还在）');
ok(b5.owned(), 'clearField 之后仍然拥有这件法器');
b5.drop({ x: 1, z: 1 }, 0);
b5.reset();
ok(!b5.owned() && b5.count() === 0, 'reset 把等级 / 牌 / 卡片加成一起清掉');

// 存档快照
const b6 = mk();
b6.setRelicLevel(2);
b6.applyCard({ width: 0.5 });
b6.buyOil();
const snap = b6.snapshot();
const b7 = mk();
b7.setRelicLevel(2);
b7.restore(snap);
ok(near(b7.width(), b6.width()) && b7.hasOil(), '快照 / 恢复把卡片与买断原样带回来');

// ============================================================
sec('② 第十三关「焦土操场」');
// ============================================================
const L13 = W.LEVELS_BY_ID[13];
ok(!!L13, 'LEVELS_BY_ID 里有第 13 关');
ok(L13 && /焦土操场/.test(L13.name), `关名 = ${L13 && L13.name}`);
ok(Object.keys(W.LEVELS_BY_ID).length === 14, `一共 14 关（实 ${Object.keys(W.LEVELS_BY_ID).length}）`);
ok(L13.theme === 'campus', '主题是校园（campus）');
ok(near(L13.arena, 19.5), `场地半径 19.5（实 ${L13.arena}）`);
ok(L13.rounds.length === 20, `20 回合（实 ${L13.rounds.length}）`);
ok(L13.rounds.every((r) => typeof r.tip === 'string' && r.tip.length >= 8),
  '每回合都有剧情 / 提示（不只是数值）');
ok(L13.rounds.every((r) => !/[<>]/.test(r.tip) && !/\*\*/.test(r.tip)),
  'tip 里没有 HTML / markdown（提示条走 textContent）');
ok(near(L13.scale.hpMul, 1.6) && near(L13.scale.dmgMul, 1.95),
  '第 1 档数值：生命 ×1.60 / 伤害 ×1.95');

// 跑道
const T = L13.track;
ok(!!T, '带 track 配置（环形跑道）');
ok(T && near(T.playerMul, 1.35) && near(T.enemyMul, 1.25),
  '玩家 ×1.35 / 怪 ×1.25（怪也吃，否则跑道就是白捡的加速带）');
ok(T && near(T.inner, 5.4) && near(T.outer, 7.6) && T.outer < L13.arena,
  `跑道 5.4~7.6，落在场地内（arena ${L13.arena}）`);
ok(T && near(T.push, 0.42) && T.push < 0.5, `切向推力很轻（${T && T.push}，不会把单摇杆推着走）`);
ok(T && (T.dir === 1 || T.dir === -1), '跑道有方向（流光要往一个方向跑）');
ok(waveSrc.includes('track: {') && src('js/track.js').includes('export function createTrackSystem'),
  'track.js 是独立引擎（零业务 import）');
ok(!/import .* from '\.\/enemy\.js/.test(src('js/track.js')), 'track.js 不反向 import 怪物（只被注入）');
ok(mainSrc.includes('trackMul: (x, z) => track.enemyMulAt(x, z)'),
  'combatCtx.trackMul 把跑道加速接到怪物身上');

// 怪种表：新怪在 order 里，老怪也带着
const types13 = L13.order.map(([t]) => t);
ok(types13.includes('standee') && types13.includes('camera'), 'order 里有两只新怪');
ok(types13.includes('clerk') && types13.includes('addressee') && types13.includes('charger'),
  '同时带了三只老怪（新关不是「只用新面孔」）');
ok(types13.length === 16, `order 16 种（实 ${types13.length}）`);
ok(L13.rounds.every((r) => types13.every((t) => typeof r[t] === 'number')),
  '每回合表都把 16 种怪写全（缺键 = 静默少刷一种）');
ok(L13.rounds.some((r) => r.standee > 0) && L13.rounds.some((r) => r.camera > 0),
  '两只新怪在回合表里都真的会刷');

// ============================================================
sec('③ 两只新怪');
// ============================================================
const ST = E.ENEMY_TYPES.standee;
const CM = E.ENEMY_TYPES.camera;
ok(!!ST && ST.name === '立牌', '立牌（standee）在');
ok(!!CM && CM.name === '取景的', '取景的（camera）在');
ok(Object.keys(E.ENEMY_TYPES).length === 31, `怪种 31 只（实 ${Object.keys(E.ENEMY_TYPES).length}）`);

ok(ST && ST.faceGuard && ST.faceGuard.arc > 0 && ST.faceGuard.reduce > 0,
  `立牌：正面减伤 ${ST && ST.faceGuard && ST.faceGuard.reduce}`);
ok(ST && ST.faceGuard.reduce <= 0.8, '立牌减伤不超过 80%（不能变成打不动）');
ok(ST && ST.turnRate > 0 && ST.turnRate < 1.2, `立牌转身很慢（${ST && ST.turnRate} 弧度/秒）—— 绕后才有意义`);
ok(ST && ST.hp >= 8, `立牌血不薄（${ST && ST.hp}）`);
ok(ST && !!ST.file, '立牌有模型文件（不手搓）');

ok(CM && CM.snap && CM.snap.arc > 0 && CM.snap.arc < Math.PI / 2,
  `取景的：锥形判定 ±${CM && CM.snap && CM.snap.arc} 弧度（小于 90°，侧移就能出框）`);
ok(CM && CM.snap.missCd > 0, '空拍只冷却很短（躲掉一次不能赚翻）');
ok(CM && CM.keepDistance > 4, `取景的站得远（${CM && CM.keepDistance} 格）`);
ok(CM && CM.snap.range >= CM.keepDistance, '取景距离覆盖站位（不然它永远拍不到）');
ok(CM && CM.windup >= 1.0, `前摇够长看得见（${CM && CM.windup} 秒）`);

// 立牌的转向必须走 turnRate（否则「转身慢」只是文案）
ok(enemySrc.includes('cfg.turnRate'), '通用转向支持 turnRate');
// 正面减伤必须落到 red 叠乘链上，不能自己另开一套减伤
ok(/faceArmor/.test(enemySrc) && /const red = Math\.min\([\s\S]{0,140}faceArmor/.test(enemySrc),
  '正面减伤折进既有的 red 叠乘链（和冰缓 / 记名同一条）');

// ============================================================
sec('④ 模型资产');
// ============================================================
const FILES = {
  addressee: E.ENEMY_TYPES.addressee.file,
  clerk: E.ENEMY_TYPES.clerk.file,
  collector: E.ENEMY_TYPES.collector.file,
  kangaroo: E.ENEMY_TYPES.kangaroo.file,
  standee: ST.file,
  camera: CM.file,
};
for (const [k, f] of Object.entries(FILES)) {
  ok(!!f && existsSync(path.join(ROOT, f)) && f.endsWith('.glb'), `${k} 的 glb 在盘上（${f}）`);
}
const allMonsterFiles = Object.values(E.ENEMY_TYPES).filter((t) => !t.planned && t.file).map((t) => t.file);
ok(new Set(allMonsterFiles).size === allMonsterFiles.length,
  `零复用：${allMonsterFiles.length} 只怪 / ${new Set(allMonsterFiles).size} 个文件`);
ok(!Object.values(E.ENEMY_TYPES).some((t) => t.proc), '一只程序化模型都不剩');
ok(!/function buildProcModel/.test(enemySrc), 'buildProcModel 已从源码里删掉');
// 名字只允许留在「已删」的注释里 —— 不能还有 function 定义
ok(!/function build(Slip|Quill|Book|Kangaroo|Proc)Model/.test(enemySrc),
  '四只手搓模型的函数一个都不剩（注释里留了「已删」说明）');

// 平摊模型（纸 / 书）的归一化必须用包围盒最大边，不能用高度
ok(/sourceHeight:\s*58\.88/.test(enemySrc), '收件人 sourceHeight = 58.88（纸的包围盒最大边，不是厚度）');
ok(/sourceHeight:\s*0\.93/.test(enemySrc), '收账人 sourceHeight = 0.93（摊开的书同理）');
ok(/tiltX/.test(enemySrc) && /tiltX:\s*-1\.45/.test(enemySrc) && /tiltX:\s*-0\.92/.test(enemySrc),
  '两只平摊模型都加了 tiltX（45° 俯视下会塌成一条线）');
ok((enemySrc.match(/tiltX/g) || []).length >= 4, 'tiltX 在预览与 spawn 两处都生效（两处 × 两种模型）');
ok(existsSync(path.join(ROOT, 'assets/props/paper-board.glb')), '纸立牌的道具模型在盘上');
ok(!/new THREE\.PlaneGeometry\([^)]*\)[\s\S]{0,80}paper-board/.test(boardSrc),
  '纸立牌用的是下载的 glb，不是一块自造的板');

// ============================================================
sec('⑤ 接线契约');
// ============================================================
ok(new RegExp(`from './track\\.js\\?v=${VER}'`).test(mainSrc), `main 导入 track.js（v=${VER}）`);
ok(new RegExp(`from './board\\.js\\?v=${VER}'`).test(mainSrc), `main 导入 board.js（v=${VER}）`);
ok(mainSrc.includes('const track = createTrackSystem({ scene })'), 'main 建了跑道系统');
ok(mainSrc.includes('const board = createBoardSystem({ scene, fx })'), 'main 建了纸立牌系统');
ok(mainSrc.includes('track.build(level.level.track || null)'), '换关时重建跑道');
ok(mainSrc.includes('board.clearField()'), '换关时清掉场上的牌');
ok(mainSrc.includes('board.reset()'), '重开时 reset 纸立牌');
ok(mainSrc.includes('board.update(dt)'), '每帧更新牌（冷却 + 到期）');
ok(mainSrc.includes('blockShot: (x, z) => board.hitAt(x, z)'), 'combatCtx.blockShot 接到纸立牌判定');

// 第 12 关的老 bug：加关卡必须改两处（wave.js 的 LEVELS_BY_ID + main.js 的 LEVELS）
ok(/\{ id: 12, /.test(mainSrc) && /\{ id: 13, /.test(mainSrc),
  'main.js 的 LEVELS 选关表里有第 12、13 关（第 12 关当年就是漏了这一处）');
ok(/LEVEL_13, LEVEL_14, LEVELS_BY_ID/.test(mainSrc), 'main 把 LEVEL_14 一起 import 了');

// 弹道：必须在移动之后、命中判定之前问一句
const shotBlock = enemySrc.slice(enemySrc.indexOf('function updateShots'), enemySrc.indexOf('function updateShots') + 1800);
ok(/ctx\.blockShot/.test(shotBlock), '弹道循环里会问 blockShot');
ok(shotBlock.indexOf('ctx.blockShot') < shotBlock.indexOf('if (hit)'),
  '先问牌、再判命中（否则等于没挡）');
ok(/s\.x \+= s\.vx \* dt/.test(shotBlock.slice(0, shotBlock.indexOf('ctx.blockShot'))),
  '判定在移动之后（否则高速弹体会整格跨过薄牌）');
const snapBlock = enemySrc.slice(enemySrc.indexOf('function handleSnapCaster'), enemySrc.indexOf('function handleSnapCaster') + 2600);
ok(/shielded/.test(snapBlock), '取景的快门也会问一句牌');
ok(/Math\.ceil\(dist \/ 0\.5\)/.test(snapBlock), '沿视线按 0.5 格采样（两端取点会整块漏过去）');
ok(/inFrame && !shielded/.test(snapBlock), '被挡下来就不掉血（算它空拍）');

// 技能栏
const skBoard = SK.SKILLS.find((s) => s.id === 'board');
ok(!!skBoard, '技能栏里有 board 这一格');
ok(SK.SKILLS.length === 10, `技能一共 10 个（实 ${SK.SKILLS.length}）`);
ok(skBoard && skBoard.key === '9', '按键是 9');
ok(skBoard && !SK.SKILLS.filter((s) => s.key).some((s) => s !== skBoard && s.key === skBoard.key),
  '按键没和别人撞');
ok(skBoard && typeof skBoard.visible === 'function' && typeof skBoard.ready === 'function'
  && typeof skBoard.progress === 'function' && typeof skBoard.press === 'function',
  '技能契约四件套齐全');
ok(skBoard && typeof skBoard.press({ playerPos: { x: 0, z: 0 } }) === 'boolean',
  '没有法器时按下去回 false（不崩）');
ok(mainSrc.includes('playerYaw: () => yaw'), 'main 把「朝向」以函数形式交给技能栏（传值会拿到上一次渲染的朝向）');

// 法器表 / 商店 / 抽卡
ok(!!R.RELIC_DEFS.board && R.RELIC_DEFS.board.maxLevel === 3, '法器表里有 board，最多 3 级');
ok(Object.keys(R.RELIC_DEFS).length === 16, `法器 16 件（实 ${Object.keys(R.RELIC_DEFS).length}）`);
const shopBoard = S.SHOP_ITEMS.find((i) => i.relic === 'board');
ok(!!shopBoard && shopBoard.needLevel === 13, '商店的纸立牌从第 13 关起上架');
ok(S.SHOP_ITEMS.filter((i) => i.type === 'board').length === 2, '两件买断货（油纸 / 三角支架）');
ok(S.SHOP_ITEMS.length === 46, `商店 46 件（实 ${S.SHOP_ITEMS.length}）`);
ok(S.itemLocked({ type: 'board', board: 'oil', needRound: 5 }, { level: 13, round: 9, boardLevel: 0 })
  === '要先拥有「纸立牌」', '没学会纸立牌之前，两件买断货是灰的');
ok(S.itemLocked({ type: 'board', board: 'oil', needRound: 5 }, { level: 13, round: 9, boardLevel: 1, boardOil: true })
  === '这一局已经买过了', '买断货一局只卖一次');

const cards = U.UPGRADES.filter((u) => u.board);
ok(cards.length === 4, `纸立牌 4 张专属卡（实 ${cards.length}）`);
ok(cards.every((c) => c.board && c.board.stat && c.board.flat > 0), '每张卡走单一通道（预览才说得清）');
ok(cards.some((c) => c.board.stat === 'width') && cards.some((c) => c.board.stat === 'count'),
  '宽度与「多一块」两个通道都有卡');
ok(U.weightOf(cards[0], 10, { boardOwned: false }) === 0, '没买纸立牌时这些卡权重 0（不进池子）');
ok(U.weightOf(cards[0], 10, { boardOwned: true }) > 0, '买了之后才进池子');

// 预览 = 实得（第 73 块那条一致性的老坑，这里单独守一遍）
{
  const sys = B.createBoardSystem({ scene, fx });
  sys.setRelicLevel(1);
  for (const c of cards) {
    const s2 = B.createBoardSystem({ scene, fx });
    s2.setRelicLevel(1);
    const pre = U.previewUpgrade({}, c, null, null, null, null, null, null, null, null, null, s2);
    const res = U.applyUpgrade({}, c, 1, null, null, null, null, null, null, null, null, s2);
    ok(near(pre[0].to, res.changes[0].to, 1e-9),
      `「${c.name}」预览值 = 实得值（${pre[0].text}）`);
  }
}

// ============================================================
sec('⑥ 文案与版本号');
// ============================================================
const userText = [R.RELIC_DEFS.board, skBoard, shopBoard, ...cards.map((c) => ({ desc: c.desc, title: c.title }))];
ok(userText.every((o) => !o || !/\*\*/.test((o.desc || '') + (o.hint || '') + (o.title || ''))),
  '纸立牌的文案里没有 markdown 加粗（textContent 不认）');
// 说清「挡什么」—— 别写成「挡一切弹道」，实际上只有投掷物与快门
ok(skBoard && /投掷物/.test(skBoard.desc), '技能说明点明挡的是「投掷物」（没吹成挡一切）');
ok(skBoard && /取景的/.test(skBoard.desc), '技能说明点了「取景的」的快门（这是本关真实收益）');
ok(R.RELIC_DEFS.board.desc.every((d) => d.length >= 20), '三级说明都写满了（不是占位）');
ok(shopSrc.includes('纸立牌') && upgSrc.includes('纸立牌'), '商店与卡片文案都对得上名字');
ok(mainSrc.includes('kicker: \'新法器 · 纸立牌\''), '买到后有一张首次教程卡');

const jsFiles = ['main.js', 'board.js', 'track.js', 'enemy.js', 'wave.js', 'relics.js', 'skills.js', 'shop.js', 'upgrade.js'];
const badVer = jsFiles.filter((f) => {
  const s = src(`js/${f}`);
  return s.includes('?v=') && !s.includes(`?v=${VER}`);
});
ok(badVer.length === 0, `全仓版本号一致（v=${VER}）`, badVer.join(','));
ok(+VER >= 143, `版本号至少到 143（实 ${VER}）`);
ok(indexHtml.includes(`js/main.js?v=${VER}`), 'index.html 指的就是这个版本');

// ============================================================
console.log(`\n===== block123: ${pass} ok / ${fail} fail =====`);
if (fail) { console.log(fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
