// 第 107 块 Node 契约测试：第十关「塔顶井台」+ 法器「傀儡术」
// 覆盖：
//   §1 LEVEL_10 配表结构（20 回合 / 顺序 / 倍率 / 井口 hazard / shopAfter…）
//   §2 四只新怪 cfg（mirror / addressee / waiter / echo）+ 模型资产
//   §3 收件人免疫的源码契约（cls: phys/elem 标签全覆盖 + takeDamage 处理 filled）
//   §4 傀儡系统 golem.js（数值 / tauntAt 只认雪 / applyCard / reset）
//   §5 嘲讽重定向（enemy.js moveToward 顶部一层 + 只改走位不改出手）
//   §6 技能键（skills.js 第 4 条 / 键位不冲突 / 冷却 40）
//   §7 商店（buyPuppet / needLevel 10 / 第 12 回合常驻）
//   §8 三选一傀儡卡（4 张 / puppetOwned 才进池 / 上限卡一次 / applyUpgrade 转交）
//   §9 法器 puppet 定义（等级成长与 golem.js 的表一致 / reset / restore）
//   §10 main.js 接线（tauntAt / reset / update / 二选一 / 教程卡 / 里程碑埋点）
//   §11 story s10 绑第十关 + 贴图资产在盘上
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const ROOT = fileURLToPath(new URL('./', import.meta.url));
const idx = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const VER = (idx.match(/main\.js\?v=(\d+)/) || [])[1] || '';
const src = (f) => fs.readFileSync(new URL(`./js/${f}`, import.meta.url), 'utf8');
const mainSrc = src('main.js');
const enemySrc = src('enemy.js');
const golemSrc = src('golem.js');
const skillsSrc = src('skills.js');
const shopSrc = src('shop.js');
const relicsSrc = src('relics.js');
const upgradeSrc = src('upgrade.js');
const storySrc = src('story.js');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const { LEVELS_BY_ID, levelTypes } = await import(`./js/wave.js?v=${VER}`);
const { ENEMY_TYPES } = await import(`./js/enemy.js?v=${VER}`);
const { RELIC_DEFS } = await import(`./js/relics.js?v=${VER}`);
const { SKILLS } = await import(`./js/skills.js?v=${VER}`);
const { SHOP_ITEMS, SHOP_PINNED, itemLocked, rollShopItems } = await import(`./js/shop.js?v=${VER}`);
const { UPGRADES, weightOf, applyUpgrade, previewUpgrade } = await import(`./js/upgrade.js?v=${VER}`);
const { ACHS, achById } = await import(`./js/achievements.js?v=${VER}`);
const { STORY_CHAPTERS } = await import(`./js/story.js?v=${VER}`);

// ============================================================ §1 配表
console.log('[§1] LEVEL_10 配表');
{
  const L = LEVELS_BY_ID[10];
  ok(!!L, 'LEVELS_BY_ID[10] 存在');
  ok(L.id === 10 && /塔顶井台/.test(L.name), `id 10 · ${L.name}`);
  ok(L.arena === 17, 'arena 17');
  ok(L.rounds.length === 20, '20 回合', String(L.rounds.length));
  ok(L.scale.hpMul === 1.45 && L.scale.dmgMul === 1.80, '难度定案 hpMul 1.45 / dmgMul 1.80');
  ok(L.theme === 'welltop', 'theme welltop（scene.js 有这张皮）');
  // 井口 hazard
  const well = (L.hazards || []).find((h) => h.kind === 'well');
  ok(!!well && well.x === 0 && well.z === 0, '场地中央有一口井');
  ok(well && well.r === 2.4 && well.damage === 3, '井 r 2.4 / 掉进去 3 点');
  // 每一回合都有全部怪键（wave.js 的 round 表要求全键，方便测试直接读数）
  const keys = ['minion', 'warrior', 'mirror', 'addressee', 'waiter', 'echo', 'archer', 'bowman', 'leaper', 'wraith', 'shielder', 'brood', 'mender', 'reboot', 'hexer'];
  ok(L.rounds.every((r) => keys.every((k) => typeof r[k] === 'number')), '每回合 15 键全齐');
  ok(L.rounds.every((r) => r.tip), '每回合都有提示语');
  ok(L.rounds.slice(0, 3).every((r) => r.mirror >= 0) && L.rounds[0].mirror === 0, '第一回合还没有照影（先认井）');
  ok(L.rounds[3].addressee === 1, '第 4 回合收件人上场');
  ok(L.rounds[7].waiter === 1, '第 8 回合等的那个上场');
  ok(L.rounds[9].echo === 1, '第 10 回合回声上场');
  // 顺序表
  ok(L.order.some((x) => x[0] === 'mirror') && L.order.some((x) => x[0] === 'addressee')
    && L.order.some((x) => x[0] === 'waiter') && L.order.some((x) => x[0] === 'echo'), 'order 里有四只新怪');
  ok(levelTypes(L).length === 15, 'levelTypes(10) = 15 种', String(levelTypes(L).length));
  ok(L.shopAfter.length === 6 && L.upgradeAfter.length === 12, '6 次商店 / 12 次三选一');
}

// ============================================================ §2 四只新怪
console.log('[§2] 四只新怪 cfg');
{
  const M = ENEMY_TYPES.mirror;
  ok(M && M.mirror && M.mirror.hpRatio === 0.6, '照影：血 = 玩家上限 60%', M && M.mirror && M.mirror.hpRatio);
  ok(M.mirror.every >= 6 && M.mirror.every <= 10, `照影每 ${M.mirror.every} 秒重照一次`);
  ok(M.phantom === 0.62, '照影半透明（水影）');
  ok(!!M.file && fs.existsSync(path.join(ROOT, M.file)), '照影有 glb 且在盘上');

  const A = ENEMY_TYPES.addressee;
  ok(A && A.fill && A.fill.every > 0 && A.fill.time > 0, '收件人：fill 周期 / 免疫时长');
  ok(!A.file, '收件人没有 glb（程序化的纸）');
  ok(A.hp <= 8, `收件人血薄（${A.hp}，拆单子是解法）`);

  const W = ENEMY_TYPES.waiter;
  ok(W && W.wait && W.wait.time > 0 && W.rage && W.rage.dmgMul > 1, '等的那个：等待期 + 醒后狂暴');
  ok(W.speed === 0, '等的那个等待期一步不走');
  ok(!!W.file && fs.existsSync(path.join(ROOT, W.file)), '等的那个有 glb');

  const E = ENEMY_TYPES.echo;
  ok(E && E.echo && E.echo.every > 0 && E.echo.cap >= 2, '回声：周期 + 并存上限');
  ok(E.keepDistance >= 5, `回声站得远（${E.keepDistance} 格）`);
  ok(!!E.file && fs.existsSync(path.join(ROOT, E.file)), '回声有 glb');

  ok(Object.keys(ENEMY_TYPES).length === 25, 'ENEMY_TYPES 共 25 只');
}

// ============================================================ §3 收件人免疫契约
console.log('[§3] cls 伤害标签全覆盖');
{
  // 全部直接伤害入口都带了 cls —— 漏一个 = 收件人对那一路永远免不了
  ok(/takeDamage\([^)]*cls:\s*'phys'/.test(mainSrc), '主角近战 → phys（main.js）');
  ok(/takeDamage\([^)]*cls:\s*'phys'/.test(src('weapon.js')), '环剑直接命中 → phys（weapon.js）');
  ok(/takeDamage\([^)]*cls:\s*'elem'/.test(src('weapon.js')), '元素溅射 / 雷链 → elem（weapon.js）');
  ok(/takeDamage\([\s\S]{0,90}cls:\s*'phys'/.test(src('arrowRain.js')), '箭雨 → phys');
  ok(/takeDamage\([^)]*cls:\s*'phys'/.test(src('turret.js')), '炮台 → phys');
  ok((relicsSrc.match(/cls:\s*'elem'/g) || []).length >= 4, '法器四路 dot → elem（relics.js）');
  ok((relicsSrc.match(/cls:\s*'phys'/g) || []).length >= 1, '地刺 → phys（relics.js）');
  // takeDamage 里真的处理了 filled（免疫）与白框摘除
  ok(/filled/.test(enemySrc) && /cls/.test(enemySrc), 'enemy.js takeDamage 认 filled 与 cls');
  ok(/setFilledRing/.test(enemySrc), '白框挂 / 摘走 setFilledRing');
}

// ============================================================ §4 傀儡系统
console.log('[§4] golem.js 契约');
{
  ok(/export function createGolemSystem/.test(golemSrc), '导出 createGolemSystem');
  ok(/const CD_TOTAL = 40/.test(golemSrc), '冷却 40 秒');
  ok(/IRON_ATK_RATIO = 1\.5/.test(golemSrc) && /IRON_ATK_CD = 2\.0/.test(golemSrc), '铁傀儡：1.5×主角攻击 / 2 秒一拳');
  ok(/SNOW_KNOCK = 2\.2/.test(golemSrc), '雪球击退 2.2 格');
  ok(/tauntAt[^}]*kind === 'snow'/.test(golemSrc.replace(/\n/g, ' ')), 'tauntAt 只认雪傀儡');
  ok(/enemies\.knockback\(/.test(golemSrc) && !/takeDamage\([^)]*\)/.test(golemSrc.replace(/enemies\.takeDamage\(near/g, '')), '雪傀儡不伤害（只有铁傀儡出手）');
  ok(/applyCard/.test(golemSrc) && /stat === 'cap'/.test(golemSrc), 'applyCard 支持上限卡');
  ok(/ABSORB_MUL|0\.8/.test(golemSrc), '贴脸磨血通道存在');
  // 等级成长表与 relics 定义一致（两边写死，必须钉住）
  ok(JSON.stringify(RELIC_DEFS.puppet.hpMul) === JSON.stringify([1, 1.3, 1.6])
    && JSON.stringify(RELIC_DEFS.puppet.atkMul) === JSON.stringify([1, 1.25, 1.5]),
    'relics.puppet 成长表 1/1.3/1.6 · 1/1.25/1.5');
  ok(/RELIC_HP_MUL = \[1, 1\.3, 1\.6\]/.test(golemSrc) && /RELIC_ATK_MUL = \[1, 1\.25, 1\.5\]/.test(golemSrc),
    'golem.js 的成长表与 relics 一致');
  ok(fs.existsSync(path.join(ROOT, 'assets/golems/iron_golem.png'))
    && fs.existsSync(path.join(ROOT, 'assets/golems/snow_golem.png')), 'MC 贴图两张都在盘上');
}

// ============================================================ §5 嘲讽重定向
console.log('[§5] enemy.js 嘲讽层');
{
  ok(/ctx\.tauntAt/.test(enemySrc), 'moveToward 里有 tauntAt 层');
  ok(/dot > 0\.45/.test(enemySrc), '只重定向「正朝玩家走」的怪（dot 阈值）');
  // 源码扫描：嘲讽块只改 dx/dz/dist，绝不能动 hurtPlayer / attackRange
  const tauntBlock = (enemySrc.match(/if \(ctx && ctx\.tauntAt\)[\s\S]*?\n    \}\n    \/\/ 冰缓/) || [''])[0];
  ok(!!tauntBlock && !/hurtPlayer|attackRange|contactRange/.test(tauntBlock),
    '嘲讽块只改走位，不碰出手判定');
  ok(/tauntAt: \(\) => golems\.tauntAt\(\)/.test(mainSrc), 'main.js 把 tauntAt 接进战斗上下文');
}

// ============================================================ §6 技能键
console.log('[§6] skills.js 傀儡术');
{
  const g = SKILLS.find((s) => s.id === 'golem');
  ok(!!g, '有 id=golem 的技能');
  ok(g && g.key === '4', '键位 4（1/2/3 已被占）');
  ok(g && g.cd === 40, '面板 CD 40 秒');
  ok(new Set(SKILLS.map((s) => s.key)).size === SKILLS.length, '键位不冲突');
  ok(g && /art:/.test(JSON.stringify(g)) === false && typeof g.art === 'string' && g.art.includes('<svg'), '内联 SVG 图标（MC 风铁傀儡脸）');
  ok(g && String(g.visible).includes('owned'), 'visible 看 owned（买到才出现）');
  ok(g && String(g.press).includes('openGolemPick'), 'press 走 openGolemPick（真暂停二选一）');
  ok(/hi-choice/.test(mainSrc) && /hintChoices/.test(mainSrc), '提示卡支持选项按钮（choices）');
}

// ============================================================ §7 商店
console.log('[§7] 商店上架');
{
  const it = SHOP_ITEMS.find((x) => x.id === 'buyPuppet');
  ok(!!it && it.type === 'relic' && it.relic === 'puppet', 'buyPuppet 是法器货');
  ok(it && it.needLevel === 10, '第十关起上架');
  ok(it && it.needRound === 8 && it.price > 0, `needRound ${it.needRound} / 价格 ${it.price}`);
  ok((SHOP_PINNED[12] || []).includes('buyPuppet'), '第 12 回合商店常驻');
  ok(itemLocked(it, { level: 9 }) === '第 10 关起才会出现', '第九关锁');
  ok(itemLocked(it, { level: 10 }) === null, '第十关可买');
  // 抽签：第十关第 8 回合起能抽到
  const roll = rollShopItems(() => 0.999, { level: 10, round: 8, hasWeapon: true });
  ok(roll.length === 4, '第十关抽签正常出货');
}

// ============================================================ §8 三选一傀儡卡
console.log('[§8] 傀儡卡');
{
  const ids = ['golemSnowHp', 'golemIronHp', 'golemIronAtk', 'golemCap'];
  const cards = ids.map((id) => UPGRADES.find((u) => u.id === id));
  ok(cards.every(Boolean), '四张傀儡卡都在池子里');
  ok(cards.every((c) => !!c.golem), '四张都带 golem 字段（不走属性表）');
  ok(cards.every((c) => weightOf(c, 5, {}) === 0), '没买傀儡术：权重全 0');
  ok(cards.every((c) => weightOf(c, 5, { puppetOwned: true }) > 0), '买了傀儡术：都进池');
  ok(weightOf(cards[3], 5, { puppetOwned: true, golemCap: 1 }) === 0, '上限卡拿过一次就收摊');
  ok(weightOf(cards[3], 5, { puppetOwned: true, golemCap: 0 }) > 0, '上限卡没拿过还能出');
  // applyUpgrade 转交
  {
    const applied = [];
    const fake = { applyCard: (c) => applied.push(c), bonuses: () => ({ cap: 1, hp: { iron: 0, snow: 0 }, atk: 0 }) };
    const res = applyUpgrade({}, cards[0], 1, null, null, fake);
    ok(applied.length === 1 && applied[0].stat === 'hp' && applied[0].kind === 'snow' && applied[0].flat === 4,
      'applyUpgrade 把 golem 卡转给 golem.applyCard');
    ok(res.changes.length === 1 && /雪傀儡生命/.test(res.changes[0].name), '变更行说人话');
    const pre = previewUpgrade({}, cards[3], null, null, fake);
    ok(pre.length === 1 && pre[0].from === 1 && pre[0].to === 2, '上限卡预览 1 → 2');
  }
}

// ============================================================ §9 法器定义
console.log('[§9] relics.puppet');
{
  const d = RELIC_DEFS.puppet;
  ok(!!d && d.maxLevel === 3, '傀儡术 3 级');
  ok(d.desc.length === 3, '三级描述各一条');
  ok(/levels\.puppet = 0/.test(relicsSrc), 'reset 归零');
  ok(/kind === 'puppet'\) puppetGroup\.visible = true/.test(relicsSrc), '买到立刻显形（小木偶挂件）');
  ok(/levels\.puppet = 0;\n    cds/.test(relicsSrc) || /levels\.puppet = 0;/.test(relicsSrc), 'reset 有 puppet');
}

// ============================================================ §10 main.js 接线
console.log('[§10] main.js 接线');
{
  ok(/import \{ createGolemSystem \} from '\.\/golem\.js\?v=\d+'/.test(mainSrc), 'import golem.js');
  ok(/const golems = createGolemSystem\(\{ scene, fx, enemies \}\)/.test(mainSrc), '创建傀儡系统');
  ok(/golems\.reset\(\)/.test(mainSrc), 'resetRunState 里清傀儡（上一局不带过去）');
  ok(/golems\.setRelicLevel\(relics\.levels\(\)\.puppet\);\n      golems\.update\(dt\)/.test(mainSrc), '主循环：每帧对账 + 更新');
  ok(/golems\.setPlayerAttack/.test(mainSrc), '铁傀儡读主角此刻攻击');
  ok(/queueHint\('puppet'\)/.test(mainSrc), '第一次买到弹教程卡');
  ok(/puppet: \{/.test(mainSrc), 'HINTS 里有 puppet 教程');
  ok(/function openGolemPick/.test(mainSrc), 'openGolemPick 存在（真暂停二选一）');
  ok(/value: 'iron'[\s\S]*value: 'snow'|value: 'snow'[\s\S]*value: 'iron'/.test(mainSrc), '二选一：铁 / 雪两张卡');
  ok(/Math\.sin\(yaw\) \* 1\.5/.test(mainSrc), '召在主角面朝方向 1.5 格');
  ok(/tryAch\('clear_10'\)/.test(mainSrc) && /tryAch\('mirror_10'\)/.test(mainSrc)
    && /tryAch\('waiter_5'\)/.test(mainSrc), 'clear_10 与新怪里程碑埋点');
  ok(/puppetOwned: relics\.levels\(\)\.puppet > 0/.test(mainSrc), '三选一抽签带 puppetOwned');
  ok(/applyUpgrade\(stats, up, upSerial, wstats, weapon, golems(, arrowRain)?\)/.test(mainSrc),
    '选卡时把 golems 递给 applyUpgrade');
}

// ============================================================ §11 剧情 + 成就
console.log('[§11] 剧情 / 成就 / 版本');
{
  const s10 = STORY_CHAPTERS.find((c) => c.id === 's10');
  ok(s10 && s10.levelId === 10 && s10.atRound === 2, 's10 绑第十关第 2 回合');
  ok(ACHS.length === 111, '成就 111 条', String(ACHS.length));
  for (const id of ['clear_10', 'mirror_10', 'addressee_10', 'waiter_5', 'echo_10']) {
    const a = achById(id);
    ok(!!a, `成就 ${id} 存在`);
  }
  ok(achById('clear_all').desc.includes('十关'), '九关皆通改口径：十关全部通关');
  ok(/^\d+$/.test(VER) && idx.includes(`style.css?v=${VER}`), `版本号 ${VER} 两处一致`);
  for (const f of ['golem.js', 'skills.js', 'upgrade.js', 'shop.js', 'relics.js', 'enemy.js', 'main.js']) {
    ok(!src(f).includes('?v=' + (Number(VER) - 1)) && src(f).includes('?v=' + VER), `${f} 版本号跟随全站`);
  }
}

console.log(`\n====================================================`);
console.log(`第 107 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败清单：'); for (const f of fails) console.log(' - ' + f); process.exit(1); }
