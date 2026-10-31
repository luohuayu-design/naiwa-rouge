// 第 130 块 · 第十七关「钟楼顶」+ 整点钟声 + 空箱子 / 装箱 + 撞钟的 / 铜壳
// 契约测试（Node，不开浏览器）
//   ① bell.js：整点钟声 → 全场定身 + 余波震退
//   ② crate.js：自动装箱 / 倒箱摔伤 + 定身 + 落点冲击 / 卡片 / 买断 / 存档
//   ③ skills.js：装箱 = F，id 跟法器同名（卡池守卫靠它找专属卡）
//   ④ LEVEL_17：名字 / 主题 / 20 回合 / 15 种怪 / bell 参数
//   ⑤ 两只新怪：撞钟的局部定身 / 铜壳钟声免疫 + 装箱移除
//   ⑥ 五件齐：relics / shop / upgrade 卡池 / main 接线 / 存档
//   ⑦ 文案 / 模型 / 缩略图 / 版本号
// 运行：node .tmp-block130-test.mjs
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
const bellSrc = src('js/bell.js');
const crateSrc = src('js/crate.js');
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
sec('① bell.js —— 整点钟声 / 全场定身 / 余波震退');
// ============================================================
ok(/export function createBellSystem/.test(bellSrc), '导出 createBellSystem');
ok(/from '\.\.\/lib\/three\.module\.js/.test(bellSrc) && !/from '\.\//.test(bellSrc),
  '场地引擎零业务依赖（只 import three）');
for (const k of ['build', 'update', 'setRound', 'takeEvents', 'reset', 'state', 'debugToll'])
  ok(new RegExp(`${k},`).test(bellSrc) || new RegExp(`${k}:`).test(bellSrc), `对外暴露 ${k}`);
ok(/events\.push\(\{ kind: 'toll', hold: cfg\.hold, push: cfg\.push \}\)/.test(bellSrc),
  '钟响推 toll 事件（带 hold / push）');
ok(/const shrink = Math\.max\(0, round - 1\) \* 0\.32/.test(bellSrc)
  && /Math\.max\(cfg\.minInterval, cfg\.interval - shrink\)/.test(bellSrc),
  '钟响间隔随回合变密、有下限');
ok(/interval: 9\.0[\s\S]{0,260}minInterval: 6\.0[\s\S]{0,260}warn: 1\.0[\s\S]{0,260}hold: 0\.6[\s\S]{0,260}push: 3\.0/.test(bellSrc),
  '默认参数：9 秒 / 6 秒下限 / 预警 1 秒 / 定身 0.6 / 震退 3 格');
ok(/bronzeMat\.emissiveIntensity = 0\.25 \+ k \* 1\.35/.test(bellSrc), '响之前钟身会亮（预警）');
ok(/warnRing\.scale\.set\(s, s, 1\)/.test(bellSrc), '警示环往里收');
ok(/function build\(spec\)[\s\S]{0,240}group\.visible = false/.test(bellSrc), '别的关传 null 就整座钟架隐藏');

// ============================================================
sec('② crate.js —— 第 19 件法器「空箱子」+ 装箱');
// ============================================================
ok(/export function createCrateSystem/.test(crateSrc), '导出 createCrateSystem');
ok(/export const CRATE_BASE/.test(crateSrc), '导出 CRATE_BASE（测试要读数值）');
ok(/from '\.\.\/lib\/three\.module\.js/.test(crateSrc) && !/from '\.\//.test(crateSrc),
  '法器引擎零业务依赖（只 import three）');
ok(/cd: \[26\.0, 23\.0, 20\.0\]/.test(crateSrc), '装箱冷却 26 / 23 / 20 秒');
ok(/capOf: \[1, 2, 3\]/.test(crateSrc), '箱容量 1 / 2 / 3');
ok(/intervalOf: \[7\.0, 6\.0, 5\.0\]/.test(crateSrc), '自动装箱间隔 7 / 6 / 5 秒');
ok(/impactR: 2\.2/.test(crateSrc) && /impactDmg: \[1\.5, 2\.1, 2\.8\]/.test(crateSrc),
  '落点冲击 2.2 格 / 1.5~2.8 伤害');
ok(/fallPct: \[0\.25, 0\.30, 0\.35\]/.test(crateSrc) && /stun: 0\.9/.test(crateSrc),
  '倒箱摔 25%~35% 最大生命、定身 0.9 秒');
ok(/castRange: 5\.0/.test(crateSrc) && /castCount: 3/.test(crateSrc),
  '手动装箱：5 格内最多 3 只');
ok(/enemies\.box\(e, \{ time \}\)/.test(crateSrc) && /enemies\.unbox\(e, at\)/.test(crateSrc),
  '装箱 / 倒箱走 enemy.js 的 box / unbox');
ok(/enemies\.applyFreeze\(e, \{ time: stunV\(\), color: 0xd8b46a \}\)/.test(crateSrc),
  '倒出来的怪吃普通冻结（不是钟声，所以铜壳也会被钉住）');
ok(/if \(full\(\)\) dump\(src\);/.test(crateSrc), '手动装箱收满那一下直接倒');
ok(/if \(!e \|\| !e\.boxed \|\| e\.state === 'dead'\) records\.splice/.test(crateSrc),
  '箱里的怪到期 / 死亡后从记录里剔掉');
ok(/buyLid\(\) \{ if \(shop\.lid\) return false; shop\.lid = true; return true; \}/.test(crateSrc),
  '买断「厚箱盖」一局一次');
ok(/buyRope\(\) \{ if \(shop\.rope\) return false; shop\.rope = true; return true; \}/.test(crateSrc),
  '买断「麻绳捆扎」一局一次');
ok(/snapshot: \(\) => \(\{ \.\.\.mods, lid: shop\.lid, rope: shop\.rope \}\)/.test(crateSrc),
  '存档带 mods + 两件买断');
ok(/function clearField\(\)[\s\S]{0,200}enemies\.unbox\(rec\.e\)/.test(crateSrc),
  '换关 / 清场先把箱里的怪放出来（不带 hidden 的怪走）');
ok(/if \(!relicLv\) \{ lastFail = 'lock'; return false; \}/.test(crateSrc),
  '没买法器前装箱锁着');
ok(/if \(cd > 0\) \{ lastFail = 'cd'; return false; \}/.test(crateSrc), '冷却中装箱按不动');

// ============================================================
sec('③ skills.js —— 装箱 = F');
// ============================================================
const skCrate = SK.SKILLS.find((s) => s.id === 'crate');
ok(!!skCrate, 'SKILLS 里有 crate（装箱）');
ok(skCrate && skCrate.name === '装箱', '技能名是「装箱」', skCrate && skCrate.name);
ok(skCrate && skCrate.key === 'f', "键位是 'f'", skCrate && skCrate.key);
ok(skCrate && skCrate.ring === true, '技能键是 Ring 型（按住 / 点击都行）');
ok(/ctx\.crate/.test(skCrate ? skCrate.visible.toString() + skCrate.press.toString() : ''),
  '技能读 ctx.crate');

// ============================================================
sec('④ LEVEL_17 —— 钟楼顶');
// ============================================================
const L17 = W.LEVELS_BY_ID[17];
ok(!!L17, 'LEVELS_BY_ID[17] 存在');
ok(L17.name.includes('第十七关') && L17.name.includes('钟楼顶'), '关卡名对', L17.name);
ok(L17.theme === 'roof', '主题是 roof（钟楼顶层）', L17.theme);
ok(near(L17.arena, 19) && L17.spawnRadius < L17.arena * 1.05, '场地 19 格、刷怪半径不出界');
ok(L17.rounds.length === 20, '20 回合', String(L17.rounds.length));
ok(L17.rounds.every((r) => typeof r.tip === 'string' && r.tip.length > 4), '每回合都有 tip');
ok(L17.rounds.every((r) => !r.tip.includes('**')), 'tip 里没有 markdown 星号');
ok(L17.upgradeAfter.length === 12 && L17.shopAfter.length === 6, '升级 / 商店回合表 12 / 6');
ok(L17.weaponAt === 4, '第 4 回合给环剑');
ok(near(L17.scale.hpMul, 1.80) && near(L17.scale.dmgMul, 2.15),
  '数值档位（更贪）：hpMul 1.80 / dmgMul 2.15', `${L17.scale.hpMul} / ${L17.scale.dmgMul}`);

const t17 = (L17.order || []).map(([t]) => t);
ok(t17.length === 15, '本关用 15 种怪', String(t17.length));
ok(t17.includes('toll') && t17.includes('bronze'), '两只新怪都排进了出场顺序');
ok(new Set(t17).size === t17.length, '出场顺序里没有重复的怪');
ok(['minion', 'warrior', 'archer', 'bowman', 'paper'].filter((t) => t17.includes(t)).length >= 3,
  '至少带 3 只老怪（不是只靠新怪撑）');
const roundKeys = new Set();
for (const r of L17.rounds) for (const k of Object.keys(r)) if (k !== 'gap' && k !== 'tip') roundKeys.add(k);
ok([...roundKeys].every((k) => t17.includes(k)), '回合表里没有 order 之外的怪', [...roundKeys].filter((k) => !t17.includes(k)).join(','));
const use17 = {};
for (const r of L17.rounds) for (const k of Object.keys(r)) use17[k] = (use17[k] || 0) + (r[k] || 0);
ok(use17.toll > 0 && use17.bronze > 0, '两只新怪在回合表里都有实际数量', `撞钟的 ${use17.toll} / 铜壳 ${use17.bronze}`);

const bCfg = L17.bell;
ok(!!bCfg, 'LEVEL_17 带 bell 配置');
ok(bCfg && bCfg.arena === L17.arena, '钟架 arena 和关卡一致');
ok(bCfg && near(bCfg.interval, 9.0) && near(bCfg.minInterval, 6.0) && near(bCfg.warn, 1.0),
  '9 秒一响、最快 6 秒、预警 1 秒');
ok(bCfg && near(bCfg.hold, 0.6) && near(bCfg.push, 3.0), '全场定身 0.6 秒、余波震退 3 格');

ok(sceneSrc.includes('roof: {') && sceneSrc.includes("ground: 'roof'"), 'scene.js 里有 roof 主题');
ok(sceneSrc.includes("if (kind === 'roof') return makeRoofTexture();"), 'scene.js 的贴图分派认识 roof');
ok(/function makeRoofTexture/.test(sceneSrc), '青石板贴图 makeRoofTexture 在');
ok(/id: 's17', no: 17, act: 3, levelId: 17/.test(storySrc), '第十七夜绑上了第十七关');
ok(existsSync(path.join(ROOT, 'assets/codex/toll.webp')) && existsSync(path.join(ROOT, 'assets/codex/bronze.webp')),
  '两只新怪的图鉴缩略图在盘上');

// ============================================================
sec('⑤ 两只新怪');
// ============================================================
const toll = E.ENEMY_TYPES.toll;
const bronze = E.ENEMY_TYPES.bronze;
ok(!!toll && !!bronze, 'ENEMY_TYPES 里有 toll / bronze');
ok(toll && toll.file === 'assets/monsters/chapel-bell.glb', '撞钟的模型文件对', toll && toll.file);
ok(bronze && bronze.file === 'assets/monsters/bronze-knight.glb', '铜壳的模型文件对', bronze && bronze.file);
ok(toll && near(toll.hp, 3.5) && near(toll.damage, 0), '撞钟的：3.5 血、不打人');
ok(toll && near(toll.attackInterval, 6.5) && near(toll.windup, 0.7), '撞钟的：6.5 秒一次、读条 0.7 秒');
ok(toll && toll.toll && near(toll.toll.range, 2.8) && near(toll.toll.pin, 0.9),
  '局部定身：2.8 格内钉 0.9 秒', JSON.stringify(toll && toll.toll));
ok(toll && near(toll.sourceHeight, 0.236) && toll.animFamily === 'bell', '撞钟的：sourceHeight 0.236 / bell 动作家族');
ok(bronze && near(bronze.hp, 7.0) && near(bronze.armor, 0.25) && near(bronze.speed, 0.95) && near(bronze.damage, 2),
  '铜壳：7 血 / 25% 减伤 / 移速 0.95 / 2 点伤害');
ok(bronze && bronze.freezeImmune === true, '铜壳带 freezeImmune（钟声定身免疫）');
ok(bronze && near(bronze.sourceHeight, 1.215) && bronze.animFamily === 'knight', '铜壳：sourceHeight 1.215 / knight 动作家族');
ok(/if \(bell && e\.cfg\.freezeImmune\) return;/.test(enemySrc),
  'applyFreeze 只在 bell 这一路尊重 freezeImmune（冰剑等冻结照吃）');
ok(/function handleToller\(/.test(enemySrc), '撞钟的有独立的 handleToller AI 分支');
ok(/e\.boxed/.test(enemySrc) && /function box\(e, \{ time = 4\.0 \} = \{\}\)/.test(enemySrc)
  && /function unbox\(e, at = null\)/.test(enemySrc), 'enemy.js 有 box / unbox');
ok(/return !!e && !e\.boxed && e\.state !== 'dead'/.test(enemySrc), '箱里的怪不在 hittable 里（打不到）');

// ============================================================
sec('⑥ 五件齐：法器 / 商店 / 卡池 / 接线');
// ============================================================
ok(Object.keys(R.RELIC_DEFS).includes('crate'), 'relics 定义表里有 crate');
ok(/crate: 0,/.test(relicsSrc) || /crate: 0/.test(relicsSrc), 'levels / cds 两张状态表都加了 crate');
ok(/maxLevel: 3/.test(relicsSrc.slice(relicsSrc.indexOf('crate: {'), relicsSrc.indexOf('crate: {') + 900)),
  '空箱子最高三级');
ok(shopSrc.includes("id: 'buyCrate'") && shopSrc.includes("id: 'buyCrateLid'") && shopSrc.includes("id: 'buyCrateRope'"),
  '商店三件货都在');
const buyCrate = S.SHOP_ITEMS.find((i) => i.id === 'buyCrate');
ok(buyCrate && buyCrate.needLevel === 17 && buyCrate.needRound === 8,
  '空箱子第 17 关起、第 8 回合才能上架', `${buyCrate && buyCrate.needLevel} / ${buyCrate && buyCrate.needRound}`);
ok(shopSrc.includes("if (item.type === 'crate')"), 'itemLocked 认识 crate 类型');
ok(/SHOP_PINNED[\s\S]{0,260}'buyCrate'/.test(shopSrc), '第 9 回合的固定货位换成空箱子');
ok(['crateInterval', 'crateImpact', 'crateRange', 'crateCd', 'crateCap', 'crateFall'].every((id) => upgSrc.includes(`id: '${id}'`)),
  '六张空箱子卡都在');
ok(upgSrc.includes('if (up.crate && !opts.crateOwned) return 0;'), '没买到空箱子前卡片不进池子');
ok(/export function applyUpgrade\([^)]*crate = null\)/.test(upgSrc), 'applyUpgrade 末参加 crate');
ok(/export function previewUpgrade\([^)]*crate = null\)/.test(upgSrc), 'previewUpgrade 末参加 crate');
ok(upgSrc.includes('function crateChange(c, b)'), '升级卡有 changes 文案翻译');
ok(/if \(up\.crate\)/.test(upgSrc), 'applyUpgrade / previewUpgrade 都有 crate 分支');

ok(/LEVEL_16, LEVEL_17, LEVELS_BY_ID/.test(mainSrc), 'main.js 从 wave.js 引入了 LEVEL_17');
ok(/\{ id: 17, name: LEVEL_17\.name, playable: true \}/.test(mainSrc), '选关表里有第 17 关');
ok(mainSrc.includes("from './bell.js?v=") && mainSrc.includes("from './crate.js?v="),
  'main.js 引入了 bell / crate 两个模块');
ok(/createBellSystem\(\{/.test(mainSrc) && /createCrateSystem\(\{/.test(mainSrc), '两个系统都实例化了');
ok(/bell\.build\(level\.level\.bell \|\| null\)/.test(mainSrc) && /bell\.setRound\(level\.roundNo/.test(mainSrc),
  '换关时 build 钟架 + 喂回合');
ok(/bell\.update\(dt\);/.test(mainSrc) && /for \(const ev of bell\.takeEvents\(\)\)/.test(mainSrc),
  '主循环推进钟声并结算事件');
ok(/enemies\.applyFreeze\(e, \{ time: hold, bell: true, color: 0xffd86b \}\)/.test(mainSrc),
  '钟响：全场（含主角侧）吃钟声定身');
ok(/rootPlayer\(hold\)/.test(mainSrc), '钟响：主角也被定住 hold 秒');
ok(/enemies\.knockback\(e, pos\.x, pos\.z, push\)/.test(mainSrc), '钟响余波：把主角身边 push 格内的怪震退');
ok(/crate\.setRelicLevel\(relics\.levels\(\)\.crate\)/.test(mainSrc) && /crate\.update\(dt, \{ playerPos: pos, yaw \}\)/.test(mainSrc),
  '主循环推进空箱子 + 按等级同步');
ok(/crate: crate\.snapshot\(\)/.test(mainSrc) && /crate\.restore\(saved\.crate\)/.test(mainSrc),
  '空箱子的卡片加成 / 两件买断进存档');
ok(/crate\.reset\(\);/.test(mainSrc) && /crate\.clearField\(\);/.test(mainSrc), '新局清空箱子、换关放回箱里的怪');
ok(mainSrc.includes("if (item.relic === 'crate')"), '买到法器本体时同步等级');
ok(mainSrc.includes("} else if (item.type === 'crate') {"), '两件买断货有购买分支');
ok((mainSrc.match(/crateLid: crate\.hasLid\(\)/g) || []).length === 2, '商店的两个 ctx 都补了空箱子买断状态');
ok(mainSrc.includes('crateOwned: relics.levels().crate > 0'), '抽卡池的门闩认识空箱子');
ok(/HINTS = \{[\s\S]*crate: \{/.test(mainSrc), '首次拿到空箱子有教程卡');
ok(/applyRelicAmp[\s\S]{0,400}'crate'/.test(mainSrc) && /crate\.setRelicAmp/.test(mainSrc),
  '法器增幅表里加了 crate');
ok(/bell: \{/.test(mainSrc) && /crate: \{/.test(mainSrc) && /grantCrate/.test(mainSrc),
  '调试口有 bell / crate / grantCrate');
ok(/crate && lvCrate > 0/.test(mainSrc), '技能栏的 crate facade 按法器等级开关');

// 总量口径
ok(Object.keys(R.RELIC_DEFS).length === 19, '法器总数 19（本块 +空箱子）', String(Object.keys(R.RELIC_DEFS).length));
ok(SK.SKILLS.length === 14, '技能格 14（本块 +装箱）', String(SK.SKILLS.length));
ok(S.SHOP_ITEMS.length === 55, '商店货 55', String(S.SHOP_ITEMS.length));
ok(U.UPGRADES.length === 133, '升级卡 133 张', String(U.UPGRADES.length));
ok(Object.keys(E.ENEMY_TYPES).length === 37, '怪物种类 37', String(Object.keys(E.ENEMY_TYPES).length));
ok(Object.keys(W.LEVELS_BY_ID).length === 17, '关卡 17 张表', String(Object.keys(W.LEVELS_BY_ID).length));

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
ok(codexSrc.includes('if (cfg.toll) {') && codexSrc.includes('if (cfg.freezeImmune) {'),
  '图鉴补了撞钟的 / 铜壳的专属文案');
const tollBlock = codexSrc.slice(codexSrc.indexOf('if (cfg.toll) {'), codexSrc.indexOf('if (cfg.toll) {') + 700);
ok(!tollBlock.includes('**') && !tollBlock.includes('<b>'), '撞钟的文案里没有 ** / HTML');

const mdir = path.join(ROOT, 'assets/monsters');
const glbs = readdirSync(mdir).filter((f) => f.endsWith('.glb'));
const hashes = new Map();
for (const f of glbs) {
  const h = createHash('md5').update(readFileSync(path.join(mdir, f))).digest('hex');
  if (hashes.has(h)) console.log(`  !! 重复：${f} == ${hashes.get(h)}`);
  hashes.set(h, f);
}
ok(hashes.size === glbs.length, `${glbs.length} 个怪物模型一个都不重复`);
ok(glbs.includes('chapel-bell.glb') && glbs.includes('bronze-knight.glb'), '两份新模型在盘上');
ok(readFileSync(path.join(mdir, 'chapel-bell.glb')).length > 2048
  && readFileSync(path.join(mdir, 'bronze-knight.glb')).length > 2048, '两份模型都不是空文件');
ok(glbs.length === 37, '怪物模型总数 37', String(glbs.length));

ok(+VER >= 147, '版本号至少到 147', VER);
const jsFiles = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const badVer = [];
for (const f of jsFiles) {
  const s = readFileSync(path.join(ROOT, 'js', f), 'utf8');
  for (const one of (s.match(/\?v=(\d+)/g) || [])) if (one !== `?v=${VER}`) badVer.push(`${f}:${one}`);
}
ok(badVer.length === 0, '所有 js 的 ?v= 都是同一个版本', badVer.slice(0, 5).join(', '));
ok(indexHtml.includes(`main.js?v=${VER}`), 'index.html 引用的是新版本');
ok(jsFiles.length === 75, 'js 模块 75 个', String(jsFiles.length));

console.log(`\n===== block130：${pass} ✓ / ${fail} ✗ =====`);
if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); process.exitCode = 1; }
