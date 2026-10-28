// ============================================================
// 第 63 块 Node 契约测试：第五关 / 第六关 / 擦名者 / 重启体 / 新法器 / 图标
//
// 跑法：node .tmp-block63-test.mjs
// 这一套只测「纯数据 + 纯函数 + 资产完整性」，不需要浏览器。
// 运行时行为（刷怪分路、偷剑、漏电掉血、重启循环）在 .tmp-block63-cdp.js。
//
// ⚠️ 第 63 块踩过的坑（写在这里，免得下次重犯）：
//   1. GLB 裁剪脚本漏了 images 的 bufferView 重映射 → 模型渲染成纯白，
//      运行时不报任何错。这里加一条「贴图 PNG 签名」断言兜住。
//   2. 用 Python 改 .js 时如果不带 newline=''，文件会被写成 CRLF，
//      老测试里那些 /a;\n    b;/ 的正则会集体假失败。改完要复跑全量。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra != null ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra != null ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

// 路径要解码：中文目录在 URL 里是 %E7%8F%AD...，直接用 pathname 会 ENOENT
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const wave = await import('./js/wave.js');
const campfire = await import('./js/campfire.js');
const shop = await import('./js/shop.js');
const guide = await import('./js/guide.js');
const story = await import('./js/story.js');
const ach = await import('./js/achievements.js');
const heal = await import('./js/healSkill.js');
const enemy = await import('./js/enemy.js');
const relics = await import('./js/relics.js');

// ============================================================
sec('A、关卡表：第五关 / 第六关');
// ============================================================
const L5 = wave.LEVEL_5;
const L6 = wave.LEVEL_6;
ok(!!L5 && L5.id === 5, 'LEVEL_5 存在且 id=5');
ok(!!L6 && L6.id === 6, 'LEVEL_6 存在且 id=6');
ok(L5.name.includes('第五关') && L5.name.includes('草甸路口'), '第五关叫「草甸路口」', L5.name);
ok(L6.name.includes('第六关') && L6.name.includes('骨塔机房'), '第六关叫「骨塔机房」', L6.name);
// 第 71 块加了第七关「骨塔井底」
// 第 81 块加了第八关「骨塔寄存层」
// 第 82 块加了第九关「骨塔登记庭」
// 第 107 块加了第十关「塔顶井台」
ok(wave.LEVELS_BY_ID[1] && wave.LEVELS_BY_ID[10] && Object.keys(wave.LEVELS_BY_ID).length === 10,
  'LEVELS_BY_ID 1~10 全在', Object.keys(wave.LEVELS_BY_ID).join(','));

for (const [tag, L] of [['五', L5], ['六', L6]]) {
  ok(L.rounds.length === 20, `${tag}关 20 回合`, L.rounds.length);
  // 每回合都要有全部怪种的键（缺键 = 少刷一种，静默变简单）
  const keys = L.order.map(([t]) => t);
  const bad = L.rounds.map((r, i) => (keys.every((k) => typeof r[k] === 'number') ? null : i + 1)).filter(Boolean);
  ok(bad.length === 0, `${tag}关每回合字段齐全（不缺点）`, bad.join(','));
  const gaps = L.rounds.every((r) => r.gap > 0.3 && r.gap <= 1.0);
  ok(gaps, `${tag}关每回合 gap 都在合理区间（0.3~1.0）`);
  const tips = L.rounds.every((r) => typeof r.tip === 'string' && r.tip.length >= 6);
  ok(tips, `${tag}关每回合都有提示文案`);
  const upOk = L.upgradeAfter.every((n) => n >= 1 && n <= 20) && L.shopAfter.every((n) => n >= 1 && n <= 20);
  ok(upOk, `${tag}关升级点 / 商店点都在 1~20 内`);
  ok(L.upgradeAfter.includes(20) && L.shopAfter.includes(18), `${tag}关最后一回合有升级点、18 回合有商店`);
  const st = wave.levelStats(L);
  ok(st.total >= 300, `${tag}关怪总量 ≥300（实际 ${st.total}）`);
  ok(L.scale.hp > wave.LEVEL_4.scale.hp, `${tag}关数值比第四关更硬`, L.scale.hp);
}

ok(L5.theme === 'crossroad', '第五关主题是 crossroad');
ok(L6.theme === 'server', '第六关主题是 server');
ok(L5.lanes === 4, '第五关是四向路口（lanes=4）');
ok(L5.order.some(([t]) => t === 'eraser'), '第五关的怪表里有擦名者');
ok(L6.order.some(([t]) => t === 'reboot'), '第六关的怪表里有重启体');
// 擦名者排最后一段（主菜不跟小兵一起挤）
const eraserIdx = L5.order.findIndex(([t]) => t === 'eraser');
ok(eraserIdx === L5.order.length - 1, '擦名者排在生成顺序最后', eraserIdx);

// 漏电地板：位置固定、互不重叠（重叠会变成一片大雷区，走位就没意义了）
ok(Array.isArray(L6.hazards) && L6.hazards.length === 6, '第六关有 6 块漏电地板', L6.hazards && L6.hazards.length);
const overlap = [];
for (let i = 0; i < L6.hazards.length; i++) {
  for (let j = i + 1; j < L6.hazards.length; j++) {
    const a = L6.hazards[i], b = L6.hazards[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + 0.5) overlap.push(`${i}-${j}`);
  }
}
ok(overlap.length === 0, '漏电地板互不重叠（留出走路缝）', overlap.join(','));
ok(L6.hazards.every((h) => h.cycle >= h.on + h.warm + 1.5), '每块地板都留了至少 1.5 秒「灭」的窗口');
ok(L5.hazards == null, '第五关没有漏电地板（不吃第六关的机制）');
ok(L5.arena >= 19 && L6.arena >= 18, '两关场地都不小于 18', `${L5.arena}/${L6.arena}`);

// ============================================================
sec('B、骨币倍率：越往后越值钱');
// ============================================================
const mul = [1, 2, 3, 4, 5, 6].map((n) => campfire.levelBoneMul(n));
ok(mul.every((v, i) => i === 0 || v > mul[i - 1]), '1~6 关倍率严格递增', mul.join(' < '));
ok(campfire.levelBoneMul(6) >= 2.5, '第六关倍率 ≥2.5', campfire.levelBoneMul(6));
ok(campfire.levelBoneMul(99) === 1, '未知关卡兜底 1 倍（不炸）');

// ============================================================
sec('C、商店：新法器只在对应关卡出现');
// ============================================================
const seenAt = (level, id, n = 300) => {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const items = shop.rollShopItems(Math.random, {
      hasWeapon: true, round: 20, level, turretCount: 0,
      relicLevels: {}, count: shop.SHOP_SHOW, luck: 0,
    });
    if (items.some((it) => it.id === id)) hit++;
  }
  return hit;
};
ok(seenAt(1, 'buyLantern') === 0, '第一关抽不到路口灯');
ok(seenAt(4, 'buyLantern') === 0, '第四关抽不到路口灯');
ok(seenAt(5, 'buyLantern') > 0, '第五关能抽到路口灯');
ok(seenAt(1, 'buyInsulator') === 0 && seenAt(5, 'buyInsulator') === 0, '第六关之前抽不到绝缘斗篷');
ok(seenAt(6, 'buyInsulator') > 0, '第六关能抽到绝缘斗篷');
const lanternItem = shop.SHOP_ITEMS.find((it) => it.id === 'buyLantern');
const insItem = shop.SHOP_ITEMS.find((it) => it.id === 'buyInsulator');
ok(lanternItem.needLevel === 5 && insItem.needLevel === 6, '两件新法器的 needLevel 分别是 5 / 6');
ok(/第 5 关起/.test(shop.itemLocked(lanternItem, { level: 4, round: 20, relicLevels: {} }) || ''),
  '没到关卡时给的理由是「第 5 关起」', shop.itemLocked(lanternItem, { level: 4, round: 20, relicLevels: {} }));
ok(shop.itemLocked(lanternItem, { level: 5, round: 20, relicLevels: {} }) === null, '满足条件后不再锁');
// 关门：老调用不传 level 时行为不变（不能被新门槛误伤）
ok(shop.itemLocked(lanternItem, { round: 20, relicLevels: {} }) === null, '不传 level 时按「不限制」处理（老调用不炸）');

// 法器表本身
ok(relics.RELIC_DEFS.lantern && relics.RELIC_DEFS.lantern.maxLevel === 3, '路口灯 3 级');
ok(relics.RELIC_DEFS.insulator && relics.RELIC_DEFS.insulator.maxLevel === 3, '绝缘斗篷 3 级');
ok(relics.RELIC_DEFS.lantern.desc.length === 3 && relics.RELIC_DEFS.insulator.desc.length === 3, '两件法器每级都有说明');
// 第 71 块 +木鱼
// 第 84 块 +镇牌铃（第八关寄存柜专用）→ 9 件
ok(Object.keys(relics.RELIC_DEFS).length === 10, '法器一共 10 件（第 107 块 +傀儡术）', Object.keys(relics.RELIC_DEFS).join(','));

// ============================================================
sec('D、怪物表：擦名者 / 重启体');
// ============================================================
const ER = enemy.ENEMY_TYPES.eraser;
const RB = enemy.ENEMY_TYPES.reboot;
ok(!!ER && ER.name === '擦名者', '图鉴里有擦名者');
ok(!!RB && RB.name === '重启体', '图鉴里有重启体');
ok(ER && ER.damage === undefined, '擦名者从不还手（没有 damage 字段）');
ok(ER && ER.erase && ER.speed * ER.erase.fleeSpeed > 1.6 && ER.speed * ER.erase.fleeSpeed < 2.8, '擦名者绝对逃跑速度合理（比玩家慢、追得上）', ER.speed * ER.erase.fleeSpeed);
ok(ER && ER.windup >= 2, '擦名者读条 ≥2 秒（来得及冲过去）', ER.windup);
ok(ER && ER.height >= 1.8 && ER.height <= 2.1, '擦名者身高 1.8~2.1', ER.height);
ok(RB && RB.reboot && RB.reboot.times === 1 && RB.reboot.delay === 4, '重启体：4 秒后重启、最多 1 次（第 75 块用户定案）');
ok(RB && RB.reboot.hpRatio >= 0.4 && RB.reboot.hpRatio <= 0.7, '重启后是半血左右', RB.reboot.hpRatio);
ok(RB && RB.height >= 1.8 && RB.height <= 2.0, '重启体身高 1.8~2.0', RB.height);
// 第 71 块 +井蛙 / 木鱼灵
// 第 81 块 +无名者 / 旗手
// 第 82 块 +称量官
// 第 83 块：删掉第八关的 ranker / bearer（队形整块不要了），加寄存处看守 warden
// 第 97 块：+盖章人 stamper → 21
// 第 107 块：+照影 / 收件人 / 等的那个 / 回声 → 25
ok(enemy.ENEMY_TYPES.minion && Object.keys(enemy.ENEMY_TYPES).filter((k) => !enemy.ENEMY_TYPES[k].planned).length === 25,
  '启用中的怪物 25 只');
// 第 62 块定下的尺寸（盾兵/孢生按战士 1.4 倍，三只小的统一 1.8~1.9）
const W = enemy.ENEMY_TYPES.warrior;
// 战士 1.38 × 1.4 = 1.93，用户拍板取整到 1.9 —— 容差放到 0.06 而不是 0.02
ok(Math.abs(enemy.ENEMY_TYPES.shielder.height - W.height * 1.4) < 0.06,
  '盾兵 ≈ 战士 1.4 倍高', `${enemy.ENEMY_TYPES.shielder.height} vs ${(W.height * 1.4).toFixed(2)}`);
ok(Math.abs(enemy.ENEMY_TYPES.brood.height - W.height * 1.4) < 0.06,
  '孢生菇 ≈ 战士 1.4 倍高', `${enemy.ENEMY_TYPES.brood.height} vs ${(W.height * 1.4).toFixed(2)}`);
for (const k of ['mender', 'leaper', 'wraith']) {
  const h = enemy.ENEMY_TYPES[k].height;
  ok(h >= 1.8 && h <= 1.95, `${k} 身高 1.8~1.95（第 62 块调大）`, h);
}

// ============================================================
sec('E、资产：GLB 贴图完整性 / 图鉴缩略图 / 技能图标');
// ============================================================
function glbInfo(file) {
  const d = fs.readFileSync(file);
  const magic = d.readUInt32LE(0);
  let off = 12, js = null, bin = null;
  while (off < d.length) {
    const len = d.readUInt32LE(off), type = d.readUInt32LE(off + 4);
    const body = d.subarray(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) js = JSON.parse(body.toString('utf8'));
    else if (type === 0x004E4942) bin = body;
    off += 8 + len;
  }
  return { magic, js, bin, size: d.length };
}
for (const [tag, f] of [['擦名者', 'assets/monsters/hooded-scribe.glb'], ['重启体', 'assets/monsters/reboot-unit.glb']]) {
  const p = path.join(ROOT, f);
  ok(fs.existsSync(p), `${tag}模型文件存在`, f);
  if (!fs.existsSync(p)) continue;
  const { magic, js, bin, size } = glbInfo(p);
  ok(magic === 0x46546C67, `${tag}是合法 GLB`);
  ok(size < 1024 * 1024, `${tag}模型 <1MB（加载快）`, (size / 1024).toFixed(0) + 'KB');
  ok(js.animations.length >= 4, `${tag}动画段数 ≥4`, js.animations.length);
  ok(js.animations.some((a) => /Idle/i.test(a.name)), `${tag}有 Idle 动画`);
  // 贴图：images → bufferView → BIN 里的 PNG 签名
  for (const im of js.images || []) {
    const bv = js.bufferViews[im.bufferView];
    const start = bv.byteOffset || 0;
    const head = bin.subarray(start, start + 8);
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
    const isJpg = head[0] === 0xFF && head[1] === 0xD8;
    ok(isPng || isJpg, `${tag}内嵌贴图是有效图片（不是被压坏的数据）`,
      [...head].map((b) => b.toString(16).padStart(2, '0')).join(' '));
  }
}
for (const k of ['eraser', 'reboot']) {
  const p = path.join(ROOT, 'assets', 'codex', k + '.webp');
  ok(fs.existsSync(p) && fs.statSync(p).size > 3000, `图鉴缩略图 ${k}.webp 存在且不是空图`,
    fs.existsSync(p) ? (fs.statSync(p).size / 1024).toFixed(1) + 'KB' : '缺文件');
}
ok(fs.existsSync(path.join(ROOT, 'assets', 'skills', 'icon-heal.svg')), '回血技能图标存在');

// ============================================================
sec('F、回血技能（第 62 块的技能，顺手守住）');
// ============================================================
ok(heal.HEAL_AMOUNT === 5 && heal.HEAL_CD === 25, '回血 5 点 / CD 25 秒');
const mkStats = () => {
  let hp = 20;
  return {
    get: (k) => (k === 'maxHp' ? 100 : 0),
    heal: (n) => { const before = hp; hp = Math.min(100, hp + n); return hp - before; },
    damage: (n) => { hp -= n; },
    get hpCur() { return hp; },
    set hpCur(v) { hp = v; },
    hp: { get cur() { return hp; }, set cur(v) { hp = v; } },
  };
};
let st = mkStats();
const sk = heal.createHealSkill({ stats: st, audio: { sfx() {} }, fx: null, playerPos: () => ({ x: 0, z: 0 }) });
ok(sk.unlocked === false, '默认没解锁');
sk.setUnlocked(true);
ok(sk.unlocked === true, '能解锁');
const healed = sk.fire();
ok(healed === 5 && sk.cdLeft > 24, '开火回 5 点并进 CD', `${healed} / ${sk.cdLeft}`);
const second = sk.fire();
ok(second === 0, '冷却中再按没有效果');
// 满血时按：不吃 CD（不然玩家会白白浪费 25 秒）
const st2 = mkStats();
st2.hpCur = 100;
const sk2 = heal.createHealSkill({ stats: st2, audio: { sfx() {} }, fx: null, playerPos: () => ({ x: 0, z: 0 }) });
sk2.setUnlocked(true);
ok(sk2.fire() === 0 && sk2.cdLeft === 0, '满血时按不掉 CD，给「满」状态', sk2.status);
ok(sk2.status === 'full', '满血状态文案是 full');
sk2.reset();
ok(sk2.cdLeft === 0 && sk2.unlocked === true, 'reset 清冷却但保留解锁');

// ============================================================
sec('G、攻略面板：分类 / 内容 / 覆盖新东西');
// ============================================================
const gs = guide.GUIDE_SECTIONS;
ok(gs.length === 3, '三组：武器 / 属性 / 技能', gs.length);
ok(gs.map((s) => s.id).join(',') === 'weapon,attr,skill', '顺序是 武器→属性→技能', gs.map((s) => s.id).join(','));
const weaponSec = gs.find((s) => s.id === 'weapon');
const swordNames = ['铁剑', '雷剑', '冰剑', '毒剑', '血剑', '震剑'];
ok(swordNames.every((n) => weaponSec.items.some((it) => it.name.includes(n))), '武器组覆盖 6 种剑');
ok(weaponSec.items.some((it) => it.name.includes('法器')), '武器组里有法器一条');
const relicItem = weaponSec.items.find((it) => it.name.includes('法器'));
ok(/路口灯/.test(relicItem.body) && /绝缘斗篷/.test(relicItem.body), '法器条目写了路口灯和绝缘斗篷的用法');
ok(relicItem.best && relicItem.best.length > 30 && relicItem.warn && relicItem.warn.length > 20,
  '法器条目有「什么时候带」和「什么时候别带」');
const attrSec = gs.find((s) => s.id === 'attr');
ok(attrSec.items.some((it) => it.name.includes('吸血')), '属性组里有吸血');
ok(attrSec.items.length >= 6, '属性组至少 6 条', attrSec.items.length);
const skillSec = gs.find((s) => s.id === 'skill');
ok(skillSec.items.some((it) => it.name.includes('万剑')), '技能组里有万剑齐发');
ok(skillSec.items.some((it) => it.name.includes('回血')), '技能组里有回血（第 62 块新增）');
const allItems = gs.flatMap((s) => s.items);
ok(allItems.every((it) => it.body && it.body.length >= 50), '每条都有 ≥50 字的介绍');
ok(allItems.every((it) => it.best && it.best.length >= 20), '每条都有「什么时候最好用」');
ok(allItems.every((it) => it.warn && it.warn.length >= 20), '每条都有「什么时候别指望它」');
ok(allItems.every((it) => it.sub && it.sub.length >= 4), '每条都有副标题（列表上就看得懂）');
const totalText = allItems.map((it) => it.body + (it.best || '') + (it.warn || '')).join('').length;
ok(totalText > 2800, '攻略正文总量够（不是占位空壳）', totalText + ' 字');

// ============================================================
sec('H、剧情：s05 / s06 接上第五、六关');
// ============================================================
const s05 = story.STORY_CHAPTERS.find((c) => c.id === 's05');
const s06 = story.STORY_CHAPTERS.find((c) => c.id === 's06');
ok(s05 && s05.levelId === 5 && s05.atRound === 2, 's05 绑第五关第 2 回合');
ok(s06 && s06.levelId === 6 && s06.atRound === 2, 's06 绑第六关第 2 回合');
ok(story.storyChapterAt(5, 2, {}) && story.storyChapterAt(5, 2, {}).id === 's05', '第五关第 2 回合能调度到 s05');
ok(story.storyChapterAt(6, 2, {}) && story.storyChapterAt(6, 2, {}).id === 's06', '第六关第 2 回合能调度到 s06');
ok(story.STORY_CHAPTERS.length === 18, '总共 18 夜（用户定：18 夜 = 18 关）', story.STORY_CHAPTERS.length);

// ============================================================
sec('I、成就');
// ============================================================
for (const [id, needle] of [['eraser_10', '擦名者'], ['reboot_10', '重启体'], ['lantern_50', '路口灯']]) {
  const a = ach.achById(id);
  ok(!!a && a.desc.includes(needle), `成就 ${id} 存在且描述对得上`, a && a.desc);
}
ok(ach.ACHS.length === 111, '成就总数 111（第 106 块 106 → 第 107 块 +5）', ach.ACHS.length);

// ============================================================
sec('J、版本号：所有模块同一个 ?v=');
// ============================================================
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const idxV = (idx.match(/js\/main\.js\?v=(\d+)/) || [])[1];
ok(!!idxV, 'index.html 里 main.js 带版本号', idxV);
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const wrongV = [];
for (const f of jsFiles) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  for (const m of src.matchAll(/\.\/[A-Za-z]+\.js\?v=(\d+)/g)) if (m[1] !== idxV) wrongV.push(`${f}:${m[1]}`);
  for (const m of src.matchAll(/\.\.\/lib\/[^'"]*\?v=(\d+)/g)) if (m[1] !== idxV) wrongV.push(`${f}:lib${m[1]}`);
}
ok(wrongV.length === 0, `所有 import 的版本号都是 v=${idxV}`, wrongV.slice(0, 5).join(','));
for (const f of ['hazards.js', 'guide.js', 'healSkill.js', 'repEvents.js']) {
  ok(fs.existsSync(path.join(ROOT, 'js', f)), `新模块 ${f} 在`);
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  ok(!/\.js'(?!\?v=)/.test(src.replace(/from '\.\/[A-Za-z]+\.js'/g, '')),
    `${f} 里没有漏写版本号的相对 import（缓存坑）`);
}

// ============================================================
console.log('\n-------------------------------');
console.log(`结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  · ' + f);
  process.exitCode = 1;
}
