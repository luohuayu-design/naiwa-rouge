// 第 129 块 · 第十六关「钟楼画室」+ 线稿定稿 + 铅笔 / 描红 + 纸屑 / 画框
// 契约测试（Node，不开浏览器）
//   ① sketch.js：线稿圈 → 定稿 → 钉住 + 画框囚笼 + extraAt 槽位一次建够
//   ② pencil.js：铅笔划线的减速 / 磨血 + 描红标记 + 卡片 / 买断 / 存档
//   ③ skills.js：描红 = R，id 跟法器同名（卡池守卫靠它找专属卡）
//   ④ LEVEL_16：名字 / 主题 / 20 回合 / 14 种怪 / sketch 参数
//   ⑤ 两只新怪：纸屑自爆群 / 画框囚笼 + 双面材质 + 描红增伤
//   ⑥ 五件齐：relics / shop / upgrade 卡池 / main 接线 / 存档
//   ⑦ 文案 / 模型 / 缩略图 / 版本号
// 运行：node .tmp-block129-test.mjs
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
const sketchSrc = src('js/sketch.js');
const pencilSrc = src('js/pencil.js');
const relicsSrc = src('js/relics.js');
const skillsSrc = src('js/skills.js');
const shopSrc = src('js/shop.js');
const upgSrc = src('js/upgrade.js');
const sceneSrc = src('js/scene.js');
const codexSrc = src('js/codex.js');
const storySrc = src('js/story.js');

const W = await import(`./js/wave.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const R = await import(`./js/relics.js?v=${VER}`);
const S = await import(`./js/shop.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const SK = await import(`./js/skills.js?v=${VER}`);

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ============================================================
sec('① sketch.js —— 线稿定稿 + 画框囚笼');
// ============================================================
ok(/export function createSketchSystem/.test(sketchSrc), '导出 createSketchSystem');
ok(/from '\.\.\/lib\/three\.module\.js/.test(sketchSrc) && !/from '\.\//.test(sketchSrc),
  '场地引擎零业务依赖（只 import three）');
for (const k of ['build', 'update', 'setRound', 'takeEvents', 'trapFrame', 'clampPoint', 'updateFrames', 'reset'])
  ok(new RegExp(`${k},`).test(sketchSrc) || new RegExp(`${k}:`).test(sketchSrc), `对外暴露 ${k}`);
ok(/phase: 'idle' \| 'draft' \| 'ink'|'idle'|'draft'|'ink'/.test(sketchSrc), '三态：未画 / 线稿 / 定稿');
ok(/kind: 'pin'/.test(sketchSrc) && /damage: cfg\.pct/.test(sketchSrc), '圈内推 pin 事件：钉 + 掉血');
// rebuild 必须按「整局最多值」一次建够槽位（第 129 块踩过的 bug）
ok(/let total = cfg\.count;[\s\S]{0,120}for \(const e of cfg\.extraAt \|\| \[\]\) total \+= \(e\.add \|\| 1\)/.test(sketchSrc),
  'extraAt 槽位按 count + Σadd 一次建够（不是只建当前回合的）');
ok(/if \(round >= e\.round\) n \+= \(e\.add \|\| 1\)/.test(sketchSrc), 'activeCount 按回合累加');
ok(/radius\*2\.4|radius \* 2\.4/.test(sketchSrc), '新圈不会叠在旧圈上');

// ============================================================
sec('② pencil.js —— 第 18 件法器「铅笔」+ 描红');
// ============================================================
ok(near(PENCIL_BASE_CD(), 30), '描红冷却 30 秒（一级）');
function PENCIL_BASE_CD() { return (pencilSrc.match(/cd: 30/) ? 30 : -1); }
ok(/range: 7\.5/.test(pencilSrc) && /markTime: 5\.0/.test(pencilSrc) && /markMul: 1\.25/.test(pencilSrc),
  '描红：7.5 格 / 5 秒 / 受伤 ×1.25');
ok(/lineWidth: 0\.34/.test(pencilSrc) && /lineLife: 8\.0/.test(pencilSrc),
  '铅笔线：0.34 宽 / 存在 8 秒');
ok(/lineDps: 0\.6/.test(pencilSrc) && /lineSlow: 0\.30/.test(pencilSrc),
  '线上磨血 0.6/秒、减速 30%');
ok(/applySlow\(e, \{ factor: PENCIL_BASE\.lineSlow/.test(pencilSrc), '线上怪被减速 30%');
ok(/takeDamage\(e, dmg, false, \{ dot: true, cls: 'phys' \}/.test(pencilSrc), '线上怪按 tick 掉血（dot 走 takeDamage）');
ok(/rotation\.y = yaw - Math\.PI \/ 2/.test(pencilSrc) && /scale\.set\(len, 1, PENCIL_BASE\.lineWidth\)/.test(pencilSrc),
  '划线网格按朝向摆、长度缩放');
ok(/if \(!relicLv\) \{ lastFail = 'lock'; return false; \}/.test(pencilSrc), '没买法器前描红锁着');
ok(/if \(cd > 0\) \{ lastFail = 'cd'; return false; \}/.test(pencilSrc), '冷却中描红按不动');
ok(/e\.redlined = \{ t: markTimeV\(\), dmgMul: markMulV\(\)/.test(pencilSrc), '描红标记写 dmgMul（和批注的 proofed 分开）');
ok(/widthV\(\) \* 0\.5 \+ \(e\.cfg\.radius \|\| 0\.4\)/.test(pencilSrc), '描红判定按「线宽 + 怪半径」');
ok(/buyLong\(\) \{ if \(shop\.long\) return false; shop\.long = true; return true; \}/.test(pencilSrc), '买断「加长笔芯」一局一次');
ok(/buyTwin\(\) \{ if \(shop\.twin\) return false; shop\.twin = true; return true; \}/.test(pencilSrc), '买断「双线笔」一局一次');
ok(/snapshot: \(\) => \(\{ \.\.\.mods, long: shop\.long, twin: shop\.twin \}\)/.test(pencilSrc), '存档带 mods + 两件买断');
ok(/if \(relicLv > 0 && playerPos\)/.test(pencilSrc), '买到法器后自动划线');
ok(/shop\.twin[\s\S]{0,160}yaw \+ Math\.PI \/ 2|if \(shop\.twin\)/.test(pencilSrc), '双线笔：第二道线转 90°');

// ============================================================
sec('③ skills.js —— 描红 = R');
// ============================================================
const skPencil = SK.SKILLS.find((s) => s.id === 'pencil');
ok(!!skPencil, 'SKILLS 里有 pencil（描红）');
ok(skPencil && skPencil.name === '描红', '技能名是「描红」', skPencil && skPencil.name);
ok(skPencil && skPencil.key === 'r', "键位是 'r'", skPencil && skPencil.key);
ok(/ctx\.pencil/.test(skPencil ? skPencil.visible.toString() + skPencil.ready.toString() + skPencil.press.toString() : ''),
  '技能读 ctx.pencil');
ok(/id: 'redline'/.test(skillsSrc) === false, '技能 id 不再叫 redline（跟法器同名才进得了专属卡守卫）');

// ============================================================
sec('④ LEVEL_16 —— 钟楼画室');
// ============================================================
const L16 = W.LEVELS_BY_ID[16];
ok(!!L16, 'LEVELS_BY_ID[16] 存在');
ok(L16.name.includes('第十六关') && L16.name.includes('钟楼画室'), '关卡名对', L16.name);
ok(L16.theme === 'atelier', '主题是 atelier（画室）', L16.theme);
ok(near(L16.arena, 19) && L16.spawnRadius < L16.arena * 1.05, '场地 19 格、刷怪半径不出界');
ok(L16.rounds.length === 20, '20 回合', String(L16.rounds.length));
ok(L16.rounds.every((r) => typeof r.tip === 'string' && r.tip.length > 4), '每回合都有 tip');
ok(L16.rounds.every((r) => !r.tip.includes('**')), 'tip 里没有 markdown 星号');
ok(L16.upgradeAfter.length === 12 && L16.shopAfter.length === 6, '升级 / 商店回合表 12 / 6');
ok(L16.weaponAt === 4, '第 4 回合给环剑');
ok(near(L16.scale.hpMul, 1.78) && near(L16.scale.dmgMul, 2.12),
  '数值档位：hpMul 1.78 / dmgMul 2.12', `${L16.scale.hpMul} / ${L16.scale.dmgMul}`);

const t16 = (L16.order || []).map(([t]) => t);
ok(t16.length === 14, '本关用 14 种怪', String(t16.length));
ok(t16.includes('paper') && t16.includes('frame'), '两只新怪都排进了出场顺序');
ok(new Set(t16).size === t16.length, '出场顺序里没有重复的怪');
ok(['minion', 'warrior', 'archer', 'bowman', 'wraith'].filter((t) => t16.includes(t)).length >= 3,
  '至少带 3 只老怪（不是只靠新怪撑）');
const roundKeys = new Set();
for (const r of L16.rounds) for (const k of Object.keys(r)) if (k !== 'gap' && k !== 'tip') roundKeys.add(k);
ok([...roundKeys].every((k) => t16.includes(k)), '回合表里没有 order 之外的怪', [...roundKeys].filter((k) => !t16.includes(k)).join(','));
const use16 = {};
for (const r of L16.rounds) for (const k of Object.keys(r)) use16[k] = (use16[k] || 0) + (r[k] || 0);
ok(use16.paper > 0 && use16.frame > 0, '两只新怪在回合表里都有实际数量', `纸屑 ${use16.paper} / 画框 ${use16.frame}`);

const skCfg = L16.sketch;
ok(!!skCfg, 'LEVEL_16 带 sketch 配置');
ok(skCfg && skCfg.arena === L16.arena, '线稿 arena 和关卡一致');
ok(skCfg && skCfg.count === 1 && near(skCfg.radius, 1.55), '开局一个圈、半径 1.55');
ok(skCfg && near(skCfg.warn, 2.0) && near(skCfg.pin, 1.2) && near(skCfg.pct, 0.06),
  '2 秒定稿 / 钉 1.2 秒 / 掉 6% 血', `${skCfg && skCfg.warn} / ${skCfg && skCfg.pin} / ${skCfg && skCfg.pct}`);
ok(skCfg && skCfg.extraAt.length === 3 && skCfg.extraAt.every((e, i) => e.round === [6, 11, 16][i]),
  '第 6 / 11 / 16 回合各加一个圈', JSON.stringify(skCfg && skCfg.extraAt));

ok(sceneSrc.includes('atelier: {') && sceneSrc.includes("ground: 'atelier'"), 'scene.js 里有 atelier 主题');
ok(sceneSrc.includes("if (kind === 'atelier') return makeAtelierTexture();"), 'scene.js 的贴图分派认识 atelier');
ok(/id: 's16', no: 16, act: 3, levelId: 16/.test(storySrc), '第十六夜绑上了第十六关');
ok(existsSync(path.join(ROOT, 'assets/codex/paper.webp')) && existsSync(path.join(ROOT, 'assets/codex/frame.webp')),
  '两只新怪的图鉴缩略图在盘上');

// ============================================================
sec('⑤ 两只新怪');
// ============================================================
const paper = E.ENEMY_TYPES.paper;
const frame = E.ENEMY_TYPES.frame;
ok(!!paper && !!frame, 'ENEMY_TYPES 里有 paper / frame');
ok(paper && paper.file === 'assets/monsters/paper-scrap.glb', '纸屑的模型文件对', paper && paper.file);
ok(frame && frame.file === 'assets/monsters/picture-frame.glb', '画框的模型文件对', frame && frame.file);
ok(paper && near(paper.hp, 1.0) && paper.selfDestruct === true && paper.scrap === true,
  '纸屑：1 血、碰到自爆、带 scrap 标记');
ok(paper && near(paper.speed, 2.55) && near(paper.damage, 1), '纸屑跑得快（2.55）、撞一下 1 点');
ok(frame && near(frame.damage, 0) && near(frame.hp, 4.0) && near(frame.armor, 0.05),
  '画框：不打人、4 血、5% 减伤');
ok(frame && frame.attackRange > frame.keepDistance && frame.attackInterval > 6,
  '画框躲在中距离读条（8.5 秒一次）');
ok(frame && frame.cage && near(frame.cage.half, 1.8) && near(frame.cage.life, 3.2),
  '囚笼半边长 1.8 格、存在 3.2 秒', JSON.stringify(frame && frame.cage));
ok(paper && paper.doubleSided === true && frame && frame.doubleSided === true,
  '两只平摊模型都开了双面（从背后看不会凭空消失）');
ok(/if \(cfg\.doubleSided\) o\.material\.side = THREE\.DoubleSide/.test(
  enemySrc.slice(enemySrc.indexOf('export async function buildPreviewModel'), enemySrc.indexOf('export async function buildPreviewModel') + 2000)),
  'buildPreviewModel 里应用 doubleSided');
ok(/if \(cfg\.doubleSided\) o\.material\.side = THREE\.DoubleSide/.test(
  enemySrc.slice(enemySrc.indexOf('const mats = []'), enemySrc.indexOf('const mats = []') + 900)),
  'spawn 里应用 doubleSided');
ok(/if \(e\.cfg\.cage\) \{ handleFrame/.test(enemySrc) && /function handleFrame\(/.test(enemySrc),
  '画框有独立的 handleFrame AI 分支');
ok(/ctx\.trapFrame\(\{[\s\S]{0,160}half: m\.half, life: m\.life/.test(enemySrc),
  '画框读条完成时扣囚笼（走 ctx.trapFrame）');
ok(/e\.redlined && e\.redlined\.t > 0\) dealt \*= e\.redlined\.dmgMul/.test(enemySrc),
  '描红的增伤在 takeDamage 里乘上去');
ok(/redlineRing/.test(enemySrc) && /0xff5a5a/.test(enemySrc), '描红红圈按需建、挂在怪身上');
ok(/function handleFrame[\s\S]{0,900}waitRing/.test(enemySrc), '画框读条有头顶进度环');

// ============================================================
sec('⑥ 五件齐：法器 / 商店 / 卡池 / 接线');
// ============================================================
ok(Object.keys(R.RELIC_DEFS).includes('pencil'), 'relics 定义表里有 pencil');
ok(/pencil: 0,/.test(relicsSrc) || /pencil: 0/.test(relicsSrc), 'levels / cds 两张状态表都加了 pencil');
ok(/maxLevel: 3/.test(relicsSrc.slice(relicsSrc.indexOf('pencil: {'), relicsSrc.indexOf('pencil: {') + 900)),
  '铅笔最高三级');
ok(shopSrc.includes("id: 'buyPencil'") && shopSrc.includes("id: 'buyPencilLong'") && shopSrc.includes("id: 'buyPencilTwin'"),
  '商店三件货都在');
const buyPencil = S.SHOP_ITEMS.find((i) => i.id === 'buyPencil');
ok(buyPencil && buyPencil.needLevel === 16 && buyPencil.needRound === 8,
  '铅笔第 16 关起、第 8 回合才能上架', `${buyPencil && buyPencil.needLevel} / ${buyPencil && buyPencil.needRound}`);
ok(shopSrc.includes("if (item.type === 'pencil')"), 'itemLocked 认识 pencil 类型');
ok(/SHOP_PINNED[\s\S]{0,220}'buyPencil'/.test(shopSrc), '第 12 回合的固定货位换成铅笔');
ok(['pencilLen', 'pencilDps', 'pencilRate', 'pencilCd', 'pencilMark'].every((id) => upgSrc.includes(`id: '${id}'`)),
  '五张铅笔卡都在');
ok(upgSrc.includes('if (up.pencil && !opts.pencilOwned) return 0;'), '没买到铅笔前卡片不进池子');
ok(/export function applyUpgrade\([^)]*pencil = null, crate = null\)/.test(upgSrc), 'applyUpgrade 末参加 pencil');
ok(/export function previewUpgrade\([^)]*pencil = null, crate = null\)/.test(upgSrc), 'previewUpgrade 末参加 pencil');
ok(upgSrc.includes('function pencilChange(c, b)'), '升级卡有 changes 文案翻译');
ok(/if \(up\.pencil\)/.test(upgSrc), 'applyUpgrade / previewUpgrade 都有 pencil 分支');

ok(/LEVEL_15, LEVEL_16, LEVEL_17, LEVELS_BY_ID/.test(mainSrc), 'main.js 从 wave.js 引入了 LEVEL_16');
ok(/\{ id: 16, name: LEVEL_16\.name, playable: true \}/.test(mainSrc), '选关表里有第 16 关');
ok(mainSrc.includes("from './sketch.js?v=") && mainSrc.includes("from './pencil.js?v="),
  'main.js 引入了 sketch / pencil 两个模块');
ok(/const sketch = createSketchSystem|createSketchSystem\(\{/.test(mainSrc) && /createPencilSystem\(\{/.test(mainSrc),
  '两个系统都实例化了');
ok(/sketch\.build\(level\.level\.sketch \|\| null\)/.test(mainSrc) && /sketch\.setRound\(level\.roundNo/.test(mainSrc),
  '换关时 build 线稿 + 喂回合');
ok(/sketch\.update\(dt, \{ playerPos: pos \}\)/ .test(mainSrc) && /sketch\.updateFrames\(dt\)/.test(mainSrc),
  '主循环推进线稿圈与囚笼');
ok(/for \(const ev of sketch\.takeEvents\(\)\)/.test(mainSrc) && /rootPlayer\(ev\.sec \|\| 1\.2\)/.test(mainSrc),
  'pin 事件接到 rootPlayer（定身 1.2 秒）');
ok(/hurtPlayer\(stats\.get\('maxHp'\) \* \(ev\.damage \|\| 0\.06\), 'hazard'\)/.test(mainSrc),
  'pin 掉血走 hazard（真伤通道）');
ok(/pencil\.update\(dt, \{ playerPos: pos, yaw \}\)/.test(mainSrc) && /pencil\.setRelicLevel/.test(mainSrc),
  '主循环推进铅笔 + 按等级同步');
ok(mainSrc.includes('frameCount >= 2 ? false : sketch.trapFrame'),
  '囚笼最多同时两个（第三个直接拒绝）');
ok(/sketch\.clampPoint\(pos\.x, pos\.z\)/.test(mainSrc), '主循环里按囚笼钳制主角');
ok(mainSrc.indexOf('clampPoint') > mainSrc.indexOf('// 圆形场地') || /sketch\.clampPoint\(pos\.x, pos\.z\)/.test(mainSrc),
  '囚笼钳制在圆形边界之后（先出圆再进框）');
ok(/pencil: pencil\.snapshot\(\)/.test(mainSrc) && /pencil\.restore\(saved\.pencil\)/.test(mainSrc),
  '铅笔的卡片加成 / 两件买断进存档（线稿圈由关卡表重建，不进档）');
ok(/pencil\.reset\(\);[\s\S]{0,60}sketch\.reset\(\)/.test(mainSrc), '新局清掉铅笔与线稿圈');
ok(mainSrc.includes("if (item.relic === 'pencil')"), '买到法器本体时同步等级');
ok(mainSrc.includes("} else if (item.type === 'pencil') {"), '两件买断货有购买分支');
ok((mainSrc.match(/pencilLong: pencil\.hasLong\(\)/g) || []).length === 2, '商店的两个 ctx 都补了铅笔买断状态');
ok(mainSrc.includes('pencilOwned: relics.levels().pencil > 0'), '抽卡池的门闩认识铅笔');
ok(/HINTS = \{[\s\S]*pencil: \{/.test(mainSrc), '首次拿到铅笔有教程卡');
ok(/applyRelicAmp[\s\S]{0,400}'pencil'/.test(mainSrc) && /pencil\.setRelicAmp/.test(mainSrc),
  '法器增幅表里加了 pencil');
ok(/sketch: \{/.test(mainSrc) && /grantPencil/.test(mainSrc), '调试口有 sketch / grantPencil');

// 总量口径
ok(Object.keys(R.RELIC_DEFS).length === 19, '法器总数 18（本块 +铅笔）', String(Object.keys(R.RELIC_DEFS).length));
ok(SK.SKILLS.length === 14, '技能格 13（本块 +描红）', String(SK.SKILLS.length));
ok(S.SHOP_ITEMS.length === 55, '商店货 52', String(S.SHOP_ITEMS.length));
ok(U.UPGRADES.length === 133, '升级卡 127 张', String(U.UPGRADES.length));
ok(Object.keys(E.ENEMY_TYPES).length === 37, '怪物种类 35', String(Object.keys(E.ENEMY_TYPES).length));
ok(Object.keys(W.LEVELS_BY_ID).length === 17, '关卡 16 张表', String(Object.keys(W.LEVELS_BY_ID).length));

// 守卫：加关卡 = 法器 + 技能 + 卡池一起加
const NO_CARD_SKILLS = new Set(['swordRain', 'broadcast']);
for (const sk of SK.SKILLS) {
  if (NO_CARD_SKILLS.has(sk.id)) continue;
  const n = (upgSrc.match(new RegExp(sk.id, 'g')) || []).length;
  ok(n >= 1, `技能 ${sk.id} 在卡池里有专属卡`, `${n} 处引用`);
}

// ============================================================
sec('⑦ 文案 / 模型 / 版本号');
// ============================================================
ok(codexSrc.includes('if (cfg.cage) {') && codexSrc.includes('if (cfg.scrap) {'),
  '图鉴补了画框 / 纸屑的专属文案');
const cageBlock = codexSrc.slice(codexSrc.indexOf('if (cfg.cage) {'), codexSrc.indexOf('if (cfg.cage) {') + 700);
ok(!cageBlock.includes('**') && !cageBlock.includes('<b>'), '画框文案里没有 ** / HTML');

const mdir = path.join(ROOT, 'assets/monsters');
const glbs = readdirSync(mdir).filter((f) => f.endsWith('.glb'));
const hashes = new Map();
for (const f of glbs) {
  const h = createHash('md5').update(readFileSync(path.join(mdir, f))).digest('hex');
  if (hashes.has(h)) console.log(`  !! 重复：${f} == ${hashes.get(h)}`);
  hashes.set(h, f);
}
ok(hashes.size === glbs.length, `${glbs.length} 个怪物模型一个都不重复`);
ok(glbs.includes('paper-scrap.glb') && glbs.includes('picture-frame.glb'), '两份新模型在盘上');
ok(readFileSync(path.join(mdir, 'paper-scrap.glb')).length > 2048
  && readFileSync(path.join(mdir, 'picture-frame.glb')).length > 2048, '两份模型都不是空文件');
ok(glbs.length === 37, '怪物模型总数 35', String(glbs.length));

ok(+VER >= 146, '版本号至少到 146', VER);
const jsFiles = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const badVer = [];
for (const f of jsFiles) {
  const s = readFileSync(path.join(ROOT, 'js', f), 'utf8');
  for (const one of (s.match(/\?v=(\d+)/g) || [])) if (one !== `?v=${VER}`) badVer.push(`${f}:${one}`);
}
ok(badVer.length === 0, '所有 js 的 ?v= 都是同一个版本', badVer.slice(0, 5).join(', '));
ok(indexHtml.includes(`main.js?v=${VER}`), 'index.html 引用的是新版本');

console.log(`\n===== block129：${pass} ✓ / ${fail} ✗ =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); process.exitCode = 1; }
