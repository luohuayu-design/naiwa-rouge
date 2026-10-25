// 第 81 块契约（纯 Node，不起浏览器）：
//   A 关卡表：第八关 · 骨塔寄存层（arena 18 / 20 回合 / 5 幕 / ossuary 主题）
//   B 两只新怪：无名者（不追人）+ 旗手（死了整队散架）
//   C 队形系统：槽位间距 > 2×radius / 同队不参与分离 / 旗手死亡触发散架
//   D 寄存柜：收牌子 / 站桩取牌 / 满了放人 / 溢出放电
//   E 接线：关卡列表 / setLevel 重建 / 死亡回调 / pushPlayer / 剧情接关
//   F 文案：图鉴把「不追人」「散架 4 秒」讲清楚
//   G 缩略图：ranker.webp / bearer.webp 真的在
//   H 版本号：index.html 与所有 js 一致
// 跑法：node .tmp-block81-test.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { LEVELS_BY_ID, levelTypes, levelStats } from './js/wave.js';

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
const depositSrc = readFileSync('js/deposit.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

const L8 = LEVELS_BY_ID[8];

// ============================================================
sec('一、关卡表：第八关 · 骨塔寄存层');
// ============================================================
ok(!!L8, 'LEVELS_BY_ID[8] 存在');
ok(L8 && L8.id === 8, 'id = 8');
ok(L8 && L8.name.includes('寄存层'), '关卡名是「骨塔寄存层」', L8 && L8.name);
ok(L8 && L8.theme === 'ossuary', '主题是 ossuary（新增的第八套皮肤）', L8 && L8.theme);
ok(L8 && L8.arena === 18, 'arena 18（比第七关的窄井 13 宽，比机房 19 小）', L8 && L8.arena);
ok(L8 && L8.rounds.length === 20, '20 回合', L8 && L8.rounds.length);
ok(L8 && L8.scale && L8.scale.hpMul > 1.20 && L8.scale.dmgMul > 1.45,
  '整关系数比第七关更硬（hpMul 1.28 / dmgMul 1.55）', L8 && JSON.stringify(L8.scale));
ok(L8 && L8.spawnRadius < L8.arena, '出生半径小于场地半径', L8 && `${L8.spawnRadius}/${L8.arena}`);
ok(L8 && L8.upgradeAfter.length >= 10 && L8.shopAfter.length >= 5, '升级 / 商店节奏齐全');
ok(L8 && L8.weaponAt === 4, '第 4 回合给武器');

// 每回合都要有队伍的人，否则「队伍」这个机制在某些回合会消失
const roundsWithSquad = L8.rounds.filter((r) => (r.ranker || 0) + (r.bearer || 0) > 0).length;
ok(roundsWithSquad >= 19, `几乎每回合都有队伍（${roundsWithSquad}/20）`);
// 任何回合只要有队伍，就必须有旗手（没旗手的队伍不会散架 = 无法清场）
const noLeader = L8.rounds.filter((r) => (r.ranker || 0) > 0 && !(r.bearer > 0));
ok(noLeader.length === 0, '有无名者的回合一定有旗手（不然那队打不散）', noLeader.length + ' 回合缺旗手');
// 一队最多 6 只（含旗手），所以 ranker 至少要给到能组出 declared 的队伍
const maxRanker = Math.max(...L8.rounds.map((r) => r.ranker || 0));
ok(maxRanker >= 9, `后期有 9 只以上无名者（${maxRanker}）`);

// 怪种表
const types = levelTypes(L8);
ok(types.includes('ranker'), 'levelTypes 含 ranker');
ok(types.includes('bearer'), 'levelTypes 含 bearer');
ok(types.includes('mender') && types.includes('reboot'), '老怪混编（奶妈 / 重启体）');
const stats = levelStats(L8);
ok(stats.ranker > 100, `无名者总量可观（${stats.ranker} 只）`);

// ============================================================
sec('二、两只新怪');
// ============================================================
const rankerBlock = enemySrc.slice(enemySrc.indexOf('ranker: {'), enemySrc.indexOf('bearer: {'));
const bearerBlock = enemySrc.slice(enemySrc.indexOf('bearer: {'), enemySrc.indexOf('bearer: {') + 1800);
ok(enemySrc.includes('ranker: {') && enemySrc.includes("name: '无名者'"), 'ranker 名字是无名者');
ok(enemySrc.includes("name: '旗手'"), 'bearer 名字是旗手');
ok(/skeleton-minion\.glb/.test(rankerBlock), '无名者复用 skeleton-minion（零新资产）');
ok(/skeleton-rogue\.glb/.test(bearerBlock), '旗手复用 skeleton-rogue');
ok(/squad:\s*\{/.test(rankerBlock), 'ranker 有 squad 配置');
ok(/gap:\s*1\.0/.test(rankerBlock), '槽位间距 1.0');
ok(/leader: true/.test(bearerBlock), 'bearer 标了 leader');
ok(/stun:\s*4\.0/.test(bearerBlock), '旗手死了散架 4 秒');
ok(/stunDamageMul:\s*2\.0/.test(bearerBlock), '散架期间受双倍伤害');
ok(/tag:\s*'board'/.test(rankerBlock), '无名者挂胸牌');
ok(/tag:\s*'pole'/.test(bearerBlock), '旗手举牌子');
// 配置层面的硬约束：槽位间距必须大于 2×radius，否则分离和对齐会打架
const rRadius = Number((rankerBlock.match(/radius:\s*([\d.]+)/) || [])[1]);
ok(rRadius > 0 && 1.0 > 2 * rRadius, `间距 1.0 > 2×radius(${rRadius}) —— 不抖的前提`);

// ============================================================
sec('三、队形系统');
// ============================================================
ok(/const SQUAD_SLOTS = \[-2\.5, -1\.5, -0\.5, 0\.5, 1\.5, 2\.5\]/.test(enemySrc), '六个固定槽位');
ok(/function updateSquads\(dt, ctx\)/.test(enemySrc), '有 updateSquads');
ok(/updateSquads\(dt, ctx\);\s*\/\/ 第 81 块/.test(enemySrc), 'update() 每帧调它');
ok(/function joinSquad\(e, forceNew, ref\)/.test(enemySrc), 'joinSquad 支持强制新建队伍');
ok(/if \(cfg\.squad\) joinSquad\(e, opts\.newSquad, opts\.squadRef\)/.test(enemySrc), 'spawn 时自动编队');
// 一批 spawn 必须共用同一个 ref：否则「放出一支队伍」会变成「放出六支单人队」
ok(/if \(ref\) ref\.squad = target;/.test(enemySrc), '同批 spawn 共用 ref（第一只建队，后面几只跟着进）');
ok(/if \(e\.cfg\.squad\) \{ handleSquadMember\(e, dt, ctx\); return; \}/.test(enemySrc),
  '队伍成员走专属分支（不进通用近战 AI）');
// 法线对齐：这是队形不散的机制核心
ok(/const rel = \(m\.pos\.x - c\.x\) \* nx \+ \(m\.pos\.z - c\.z\) \* nz/.test(enemySrc), '法线对齐算出横向偏移');
ok(/const diff = \(slot - rel\) \* Math\.min\(1, dt \* 6\)/.test(enemySrc), '按槽位拉回');
// 分离要跳过同队
ok(/if \(a\.squad && a\.squad === b\.squad\) continue;/.test(enemySrc), '同队成员不参与物理分离');
// 旗手死亡 → 散架
ok(/if \(e\.cfg\.squad && e\.cfg\.squad\.leader && e\.squad\)/.test(enemySrc), 'die() 里判旗手');
ok(/s\.stunT = e\.cfg\.squad\.stun \|\| 4\.0/.test(enemySrc), '旗手死亡写入 stunT');
ok(/const stunMul = e\.squadStunMul \|\| 1/.test(enemySrc), 'takeDamage 里乘散架倍率');
// 撞人沿法线推开，不是径向顶着走
ok(/const sign = \(ddx \* nx \+ ddz \* nz\) >= 0 \? 1 : -1/.test(enemySrc), '撞人时按法线判断玩家在队形哪一侧');
ok(/ctx\.pushPlayer\(nx \* sign, nz \* sign/.test(enemySrc), '沿法线把玩家挤开');
// 朝向锁定队伍方向，不朝玩家
ok(/const yaw = Math\.atan2\(s\.dir\.x, s\.dir\.z\)/.test(enemySrc), '朝向跟着队伍方向（不是玩家）');
// reset 清空
ok(/squads\.length = 0;/.test(enemySrc), 'reset 清空队伍');
// 观测口
ok(/squadState: \(\) => squads\.map/.test(enemySrc), '导出 squadState（测试用）');
ok(/squadAlive: \(\) => list\.filter/.test(enemySrc), '导出 squadAlive（寄存柜判上限用）');

// ------------------------------------------------------------
// 木牌「看得见」的四条硬约束（本轮真踩过：牌在场景树里、缩放位置全对，
// 就是画面上没有 —— 查了三轮投影才定位到「材质被 tint 冲成深棕近黑」）
// ------------------------------------------------------------
ok(/new THREE\.MeshBasicMaterial\(\{\s*map: makeTagTexture\(\)/.test(enemySrc),
  '木牌用 Basic 材质（不吃光，不会被 tint / glow 压成近黑）');
ok(/new THREE\.BoxGeometry\(0\.84, 0\.54, 0\.06\)/.test(enemySrc),
  '旗手牌子是有厚度的 Box（零厚度 Plane 侧身对着镜头就是一条线）');
ok(/new THREE\.BoxGeometry\(0\.42, 0\.28, 0\.05\)/.test(enemySrc),
  '无名者胸牌也是 Box');
ok((enemySrc.match(/o\.userData\.isTag\) return;/g) || []).length >= 3,
  'spawn 与 buildPreviewModel 里的 tint / 材质 clone 都要跳过木牌',
  (enemySrc.match(/o\.userData\.isTag\) return;/g) || []).length);

// ============================================================
sec('四、寄存柜');
// ============================================================
ok(existsSync('js/deposit.js'), 'js/deposit.js 存在');
ok(/export function createDeposit/.test(depositSrc), '导出 createDeposit');
ok(/const CAP = 8/.test(depositSrc), '满柜 8 块');
ok(/const TAKE = 2/.test(depositSrc), '一次取 2 块');
ok(/const HOLD = 1\.1/.test(depositSrc), '站桩 1.1 秒');
ok(/const RANGE = 3\.4/.test(depositSrc), '取牌范围 3.4');
ok(/const SQUAD_MAX = 12/.test(depositSrc), '场上队伍上限 12（防滚雪球）');
ok(/const ZAP_DMG = 3/.test(depositSrc), '溢出放电 3 伤');
ok(/if \(alive >= SQUAD_MAX\)/.test(depositSrc), '超上限改放电');
ok(/const moved = Math\.hypot\(playerPos\.x - lastX, playerPos\.z - lastZ\)/.test(depositSrc),
  '取牌要求「站住不动」（挪一步就断）');
ok(/const moving = moved > 0\.035/.test(depositSrc), '移动阈值 0.035');
ok(/ctx\.onRelease\(def\.headcount/.test(depositSrc), '满柜回调放人');
ok(/3×3|const cols = 3, rows = 3/.test(depositSrc), '柜面 3×3 寄存格');
// 关卡数据里必须有柜子，位置要在场地外
ok(L8.deposit && Number.isFinite(L8.deposit.x) && Number.isFinite(L8.deposit.z), '关卡数据带 deposit');
ok(L8.deposit && Math.hypot(L8.deposit.x, L8.deposit.z) > L8.arena,
  '柜子立在场地边界之外（队伍换向点在 16.1，永远碰不到它）',
  L8.deposit && Math.hypot(L8.deposit.x, L8.deposit.z).toFixed(1));

// ============================================================
sec('五、接线');
// ============================================================
ok(/\{ id: 8, name: LEVEL_8\.name, playable: true \}/.test(mainSrc), '选关列表有第八关');
ok(/import \{ createDeposit \} from '\.\/deposit\.js/.test(mainSrc), 'main 导入 createDeposit');
ok(/LEVEL_8, LEVEL_9, LEVELS_BY_ID/.test(mainSrc), 'main 导入 LEVEL_8 / LEVEL_9（第 82 块加第九关）');
ok(/deposit\.build\(level\.level\.deposit \|\| null\)/.test(mainSrc), 'setLevel 重建寄存柜');
ok(/deposit\.update\(dt, \{/.test(mainSrc), '主循环更新寄存柜');
ok(/if \(e\.type === 'ranker' \|\| e\.type === 'bearer'\) deposit\.addTag\(1\)/.test(mainSrc),
  '死亡回调把木牌送进柜子');
ok(/pushPlayer: \(dx, dz, amount\) =>/.test(mainSrc), 'combatCtx 提供 pushPlayer');
ok(/get depositHub\(\) \{ return deposit\.pos\(\); \}/.test(mainSrc), 'combatCtx 提供 depositHub');
ok(/enemies\.spawn\(isLeader \? 'bearer' : 'ranker', at, \{ newSquad: isLeader, squadRef: ref \}\)/.test(mainSrc),
  '柜子放人时新队伍自带旗手（且只有第一只 forceNew、六只共用一个 ref）');
ok(/deposit: \{\s*state: \(\) => deposit\.state\(\)/.test(mainSrc), '调试口暴露 deposit.state');
// 剧情接关
ok(/id: 's08', no: 8, act: 2, levelId: 8, atRound: 2/.test(storySrc), 's08 接上第八关');
// 场景主题
ok(/ossuary: \{/.test(sceneSrc), 'scene.js 有 ossuary 主题');
ok(/if \(kind === 'ossuary'\) return makeOssuaryTexture\(\)/.test(sceneSrc), '地面贴图分支');
ok(/function makeOssuaryTexture\(\)/.test(sceneSrc), 'makeOssuaryTexture 存在');

// ============================================================
sec('六、文案');
// ============================================================
ok(/cfg\.squad && cfg\.squad\.leader/.test(codexSrc), '图鉴：旗手有专属文案');
ok(/全场唯一不追你的敌人/.test(codexSrc), '图鉴：写清「不追人」');
ok(/散架 4 秒/.test(codexSrc), '图鉴：写清散架 4 秒');
ok(/队列移速/.test(codexSrc), '数值行把「速度」写成「队列移速」（它不追人）');
ok(/撞到墙才转向/.test(codexSrc), '图鉴：写清撞墙转向');
ok(/受双倍伤害/.test(codexSrc), '图鉴：写清双倍伤害');

// ============================================================
sec('七、缩略图');
// ============================================================
for (const t of ['ranker', 'bearer']) {
  const p = `assets/codex/${t}.webp`;
  const has = existsSync(p);
  const sz = has ? statSync(p).size : 0;
  ok(has, `${p} 存在`);
  ok(sz > 3000, `${p} 不是空图（${sz}B，第 75 块漏出过 2KB 的小方块）`);
}

// ============================================================
sec('八、版本号一致');
// ============================================================
const versions = new Set();
for (const m of htmlSrc.matchAll(/\?v=(\d+)/g)) versions.add(m[1]);
const jsFiles = ['main', 'enemy', 'wave', 'codex', 'scene', 'deposit', 'story'];
for (const f of jsFiles) {
  const src = readFileSync(`js/${f}.js`, 'utf8');
  for (const m of src.matchAll(/\?v=(\d+)/g)) versions.add(m[1]);
}
ok(versions.size === 1, `所有 ?v= 版本号一致（${[...versions].join(',')}）`);

// ============================================================
console.log(`\n=== 第 81 块契约：通过 ${pass} / 失败 ${fail} ===`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); process.exitCode = 1; }
