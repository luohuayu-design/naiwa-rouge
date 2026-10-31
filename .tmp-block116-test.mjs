// 第 116 块 · 第十二关「三幻神驿站」——契约测试（Node，不开浏览器）
//   ① 关卡数据：LEVEL_12 / 注册 / 难度 / 车流参数 / 20 回合
//   ② 新怪「加急袋鼠」：rush 配置 / 不打人 / 中距离
//   ③ 车流 traffic.js：TRAFFIC_DEFAULTS / 碰撞判定 / 生命期
//   ④ 拿铁 latte.js：LATTE_BASE / 六通道 / 两件商店货
//   ⑤ 新法器「苔藓拿铁」：relics 定义 / 技能第 6 格 / 6 张三选一卡 / 商店货
//   ⑥ 成就 / 图鉴 / 剧情 s12 / 版本一致
// 运行：node .tmp-block116-test.mjs
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

const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];
const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const mainSrc = src('js/main.js');

const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const T = await import(`./js/traffic.js?v=${VER}`);
const L = await import(`./js/latte.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);
const A = await import(`./js/achievements.js?v=${VER}`);
const ST = await import(`./js/story.js?v=${VER}`);

// ============================================================
sec('① 关卡数据：第十二关 · 三幻神驿站');
// ============================================================
const L12 = W.LEVEL_12;
ok(!!L12, 'LEVEL_12 存在');
ok(L12 && L12.id === 12, 'id = 12');
ok(L12 && L12.name === '第十二关 · 三幻神驿站', `名字 = ${L12 && L12.name}`);
ok(L12 && L12.theme === 'highway', '主题皮肤 highway（新场景，不复用旧关）');
ok(L12 && L12.arena === 19, `场地 19 格（实 ${L12 && L12.arena}）`);
ok(L12 && L12.rounds.length === 20, `20 回合（实 ${L12 && L12.rounds.length}）`);
ok(W.LEVELS_BY_ID[12] === L12, '在 LEVELS_BY_ID 里注册');
ok(L12 && L12.traffic && L12.traffic.lanes.join(',') === '-4.5,4.5', '两条平行车道 -4.5 / 4.5');
ok(L12 && L12.traffic.warn === 2.2, '预警 2.2 秒');
ok(L12 && L12.traffic.damage === 2.0, '撞玩家伤害 2.0（不秒杀）');
ok(L12 && L12.traffic.doubleFrom === 13, '第 13 回合起错时双车');
ok(L12 && L12.scale.hpMul === 1.55 && L12.scale.dmgMul === 1.85,
  `难度（hpMul 1.55 / dmgMul 1.85，血量持平十一关、伤害略降）`,
  L12 && `${L12.scale.hpMul}/${L12.scale.dmgMul}`);
const order = Object.fromEntries((L12 && L12.order) || []);
ok(!!order.kangaroo, '波次表里有新怪加急袋鼠');
ok(!!order.addressee, '波次表里有回归旧怪收件人');
ok(!!order.clerk, '波次表里有回归旧怪誊录员');
ok(!!order.charger, '波次表里有回归旧怪蛮牛');
ok(!order.collector, '第十一关的收账人不带来（避免机制串味）');
ok(!L12.fog, '第十一关的雾不带来（fog 字段缺省）');
// 20 回合里袋鼠 / 收件人 / 誊录员 / 蛮牛都有出场
const sum = (k) => L12.rounds.reduce((a, r) => a + (r[k] || 0), 0);
ok(sum('kangaroo') > 0, `袋鼠全关出场 ${sum('kangaroo')} 只`);
ok(sum('addressee') > 0, `收件人全关出场 ${sum('addressee')} 只`);
ok(sum('clerk') > 0, `誊录员全关出场 ${sum('clerk')} 只`);
ok(sum('charger') > 0, `蛮牛全关出场 ${sum('charger')} 只`);

// ============================================================
sec('② 新怪「加急袋鼠」');
// ============================================================
const K = E.ENEMY_TYPES.kangaroo;
ok(!!K, 'ENEMY_TYPES.kangaroo 存在');
ok(K && K.name === '加急袋鼠', `名字 = ${K && K.name}`);
// 第 123 块：袋鼠改用 Poly by Google 的 Kangaroo（不再是程序化模型）
ok(K && !K.proc && /^assets\/monsters\/.+\.glb$/.test(K.file || ''), `袋鼠用下载的 glb（${K && K.file}）`);
ok(K && K.damage === 0, '它自己一下都不打人（damage 0）');
ok(K && K.keepDistance === 4.5, '保持中距离（keepDistance 4.5）');
ok(K && K.rush && K.rush.time === 6.0, '加急持续 6 秒');
ok(K && K.rush.hasteMul === 1.5, '出手频率 ×1.5');
ok(K && K.rush.speedMul === 1.3, '移速 ×1.3');
ok(K && K.windup === 1.2, '读条 1.2 秒（可打断）');
ok(K && K.hp === 4.5, `较脆（hp ${K.hp}）—— 优先击杀目标`);

// ============================================================
sec('③ 车流 traffic.js');
// ============================================================
ok(!!T.TRAFFIC_DEFAULTS, 'TRAFFIC_DEFAULTS 存在');
ok(T.TRAFFIC_DEFAULTS.lanes.join(',') === '-4.5,4.5', '默认两条车道');
ok(T.TRAFFIC_DEFAULTS.warn === 2.2, '默认预警 2.2');
ok(T.TRAFFIC_DEFAULTS.damage === 2.0, '默认撞人伤害 2.0');
ok(T.TRAFFIC_DEFAULTS.enemyPct === 0.36, '撞怪伤害 = max(10+round*1.5, 血*0.36)');
ok(T.TRAFFIC_DEFAULTS.doubleFrom === 13, '默认第 13 回合起双车');
ok(typeof T.trafficLaneHit === 'function', 'trafficLaneHit 碰撞判定导出');
ok(typeof T.createTrafficSystem === 'function', 'createTrafficSystem 导出');
// 碰撞判定：在车道中心、宽度内 = 命中
ok(T.trafficLaneHit(0, -4.5, 0, -4.5, 2.4, 0) === true, '车道中心命中');
ok(T.trafficLaneHit(0, -4.5 + 1.1, 0, -4.5, 2.4, 0) === true, '宽度内命中（1.1 < 1.2）');
ok(T.trafficLaneHit(0, -4.5 + 2.0, 0, -4.5, 2.4, 0) === false, '宽度外不命中（2.0 > 1.2）');

// ============================================================
sec('④ 拿铁 latte.js');
// ============================================================
ok(!!L.LATTE_BASE, 'LATTE_BASE 存在');
ok(L.LATTE_BASE.cd === 30.0, '初始冷却 30 秒');
ok(L.LATTE_BASE.cdMin === 14.0, '冷却硬下限 14 秒');
ok(L.LATTE_BASE.duration === 5.0, '持续 5 秒');
ok(L.LATTE_BASE.radius === 3.2, '半径 3.2');
ok(L.LATTE_BASE.cap === 1, '同屏最多 1 杯（基础）');
ok(L.LATTE_BASE.capMax === 3, '同屏硬上限 3 杯');
ok(L.LATTE_BASE.haste === 0.2, '攻速 +20%');
ok(L.LATTE_BASE.move === 0.15, '移速 +15%');
ok(L.LATTE_BASE.slow === 0.28, '减速 28%');
ok(typeof L.createLatteSystem === 'function', 'createLatteSystem 导出');

// ============================================================
sec('⑤ 法器 / 技能 / 卡 / 商店');
// ============================================================
ok(!!R.RELIC_DEFS.latte && R.RELIC_DEFS.latte.name === '苔藓拿铁', 'RELIC_DEFS.latte 已注册');
ok(R.RELIC_DEFS.latte.maxLevel === 3, '三级法器');
ok(R.RELIC_DEFS.latte.desc.length === 3, '三级各有文案');
const latteSkill = SK.SKILLS.find((s) => s.id === 'latte');
ok(!!latteSkill, '技能栏有「拿铁」');
ok(latteSkill && latteSkill.key === '6', '占用第 6 格');
const latteCards = U.UPGRADES.filter((u) => u.latte);
ok(latteCards.length === 6, `拿铁卡 6 张（实 ${latteCards.length}）`);
const cardStats = latteCards.map((u) => u.latte.stat);
ok(['duration', 'radius', 'haste', 'slow', 'cd', 'radius'].every((s) => cardStats.includes(s)),
  '六通道齐全（持续/半径/攻速/减速/冷却/传说）');
// 第 118 块：卡池 93 + 拿铁 6 + 守夜烛 5 + 落款 5 = 109
ok(U.UPGRADES.length === 122, `卡池 122 张（93 + 6 + 10 + 4 + 4 + 5，实 ${U.UPGRADES.length}）`);
const buyLatte = S.SHOP_ITEMS.find((i) => i.id === 'buyLatte');
const buyFoam = S.SHOP_ITEMS.find((i) => i.id === 'buyLatteFoam');
const buyThermos = S.SHOP_ITEMS.find((i) => i.id === 'buyLatteThermos');
ok(!!buyLatte && buyLatte.type === 'relic' && buyLatte.relic === 'latte', '商店有买「苔藓拿铁」');
ok(!!buyFoam && buyFoam.type === 'latte' && buyFoam.latte === 'foam', '商店一次性强化「奶泡」');
ok(!!buyThermos && buyThermos.type === 'latte' && buyThermos.latte === 'thermos', '商店一次性强化「保温杯」');
ok(buyLatte.needLevel === 12, '第十二关起上架');
// 第 118 块：31 + 拿铁 3 + 守夜烛 / 落款 6 = 40
ok(S.SHOP_ITEMS.length === 49, `商店货 49 件（31 + 3 + 6 + 3 + 3 + 3，实 ${S.SHOP_ITEMS.length}）`);
ok(S.SHOP_PINNED[9].includes('buyLatte'), '第 9 回合商店常驻摆拿铁');

// ============================================================
sec('⑥ 成就 / 图鉴 / 剧情 / 版本');
// ============================================================
ok(!!A.achById('clear_12'), '成就「通关十二关」');
ok(!!A.achById('kangaroo_10'), '成就「击倒袋鼠」');
ok(!!A.achById('traffic_50'), '成就「车辆撞怪」');
ok(!!A.achById('traffic_run_20'), '成就「单局借车击杀」');
ok(A.ACH_COUNT === 117, `成就总数 117（第 125 块 -1，实 ${A.ACH_COUNT}）`);
ok(ST.STORY_CHAPTERS.find((c) => c.id === 's12')?.levelId === 12, '剧情 s12 已绑定第十二关');
// 图鉴 desc 有袋鼠的说明
const codexSrc = src('js/codex.js');
ok(codexSrc.includes('cfg.rush'), '图鉴有袋鼠（rush）的 desc 分支');
// 版本一致：main.js 的 import 全 v=VER
const imports = [...mainSrc.matchAll(/from '\.\/[^']*\?v=(\d+)/g)].map((m) => m[1]);
ok(imports.length > 30 && imports.every((v) => v === VER), `main.js 的 ${imports.length} 条 import 全是 v=${VER}`);
// 无残留 v=130（上一版）
const stale = [...mainSrc.matchAll(/v=130/g)].length;
ok(stale === 0, 'main.js 无残留 v=130');

console.log(`\n===== block116-test: ${pass} pass / ${fail} fail =====`);
if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
