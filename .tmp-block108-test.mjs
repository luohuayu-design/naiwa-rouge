// 第 108 块 Node 契约测试：傀儡卡第二批（4 维度）+ 箭雨卡 8 张 + 商店「强化箭袋」
// 覆盖：
//   §1 卡池：87 张 / 12 张新卡 id / 箭雨卡结构（arrow 字段四 stat）/ 傀儡卡新 stat
//   §2 weightOf 门控：傀儡卡仍走 puppetOwned / 箭雨卡不需要门控
//   §3 golem.js 源码契约：cdCut/ironSpd/snowKnock/snowSlow 四通道 + 下限 + reset 清零
//   §4 arrowRain.js 源码契约：mods 四通道 + cdMax 动态 + reset 清 mods + quiver
//   §5 preview/apply 一致性：golem 新 stat 与箭雨卡（真 import，用桩 golems/arrowRain）
//   §6 商店 buyQuiver：定义 / itemLocked 一局一次
//   §7 main.js 接线：preview/apply 传 arrowRain / shopCtx.quiver / quiver 购买分支
//   §8 skills/guide 文案不再写死「冷却 8 秒」单值
//   §9 版本号 123（以 index.html 为基准动态比对）
import fs from 'node:fs';
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
const golemSrc = src('golem.js');
const arrowSrc = src('arrowRain.js');
const skillsSrc = src('skills.js');
const shopSrc = src('shop.js');
const guideSrc = src('guide.js');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const { UPGRADES, weightOf, applyUpgrade, previewUpgrade } = await import(`./js/upgrade.js?v=${VER}`);
const { SHOP_ITEMS, itemLocked } = await import(`./js/shop.js?v=${VER}`);

// ============================================================ §1 卡池
console.log('[§1] 卡池与 12 张新卡');
{
  ok(UPGRADES.length === 113, '卡池 113 张（75 + 4 傀儡 + 8 箭雨 + 6 墨丸 + 6 拿铁 + 10 守夜烛/落款 + 4 纸立牌）', `实际 ${UPGRADES.length}`);
  const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
  const NEW = ['golemCd', 'golemIronSpd', 'golemSnowKnock', 'golemSnowSlow',
    'arrowCountS', 'arrowCountL', 'arrowDmgS', 'arrowDmgL', 'arrowZoneS', 'arrowZoneL', 'arrowCdS', 'arrowCdL'];
  ok(NEW.every((id) => byId[id]), '12 张新卡全部存在', NEW.filter((id) => !byId[id]).join(','));
  ok(NEW.every((id) => byId[id] && byId[id].family === null), '12 张全是结构卡（family null）');
  // 傀儡卡四个新 stat 与幅度（用户：幅度大一些）
  ok(byId.golemCd?.golem?.stat === 'cdCut' && byId.golemCd.golem.flat === 8, '傀儡速召：召唤 CD −8s');
  ok(byId.golemIronSpd?.golem?.stat === 'ironSpd' && byId.golemIronSpd.golem.flat === 0.20, '铁腕连击：出手 +20%');
  ok(byId.golemSnowKnock?.golem?.stat === 'snowKnock' && byId.golemSnowKnock.golem.flat === 1.0, '重型雪球：击退 +1.0 格');
  ok(byId.golemSnowSlow?.golem?.stat === 'snowSlow' && byId.golemSnowSlow.golem.flat === 1.2, '彻骨寒雪：减速时长 +1.2s/张');
  // 箭雨 8 张 = 4 方向 × 两档
  const arrowCards = UPGRADES.filter((u) => u.arrow);
  ok(arrowCards.length === 8, '箭雨卡恰好 8 张', `实际 ${arrowCards.length}`);
  const statOf = (s) => arrowCards.filter((u) => u.arrow.stat === s);
  ok(statOf('arrows').length === 2 && statOf('dmg').length === 2
    && statOf('zone').length === 2 && statOf('cd').length === 2, '四方向各两档');
  ok(['arrowCountS', 'arrowDmgS'].every((id) => byId[id].rarity === 0), '普通档：箭数 +3 / 伤害 +6%');
  ok(['arrowCdS', 'arrowDmgL'].every((id) => byId[id].rarity === 2), '精良档：CD −0.8s / 伤害 +12%');
  ok(['arrowZoneS'].every((id) => byId[id].rarity === 1), '稀有档：范围 +0.4');
  ok(['arrowCountL', 'arrowZoneL', 'golemIronSpd', 'golemSnowSlow'].every((id) => byId[id].rarity === 3), '史诗档四张');
  ok(['arrowCdL'].every((id) => byId[id].rarity === 4), '传说档：CD −1.6s');
  ok(statOf('arrows').map((u) => u.arrow.flat).sort((a, b) => a - b).join(',') === '3,6', '箭数两档 +3/+6');
  ok(statOf('cd').map((u) => u.arrow.flat).sort((a, b) => a - b).join(',') === '0.8,1.6', 'CD 两档 0.8/1.6');
  // 全档位都放（用户定案）：12 张新卡的 rarity 覆盖 0~4
  ok(new Set(NEW.map((id) => byId[id].rarity)).size === 5, '新卡覆盖全部五个品质档');
  ok(NEW.every((id) => byId[id].title && byId[id].desc), '每张新卡都有 title + desc（textContent 文案）');
}

// ============================================================ §2 门控
console.log('[§2] weightOf 门控');
{
  const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
  ok(weightOf(byId.golemCd, 10, {}) === 0, '没买傀儡术：新傀儡卡不进池');
  ok(weightOf(byId.golemCd, 10, { puppetOwned: true }) > 0, '买了傀儡术：傀儡速召进池');
  ok(weightOf(byId.arrowCountS, 1, {}) > 0, '箭雨卡第 1 回合就进池（无需门控）');
  ok(weightOf(byId.arrowCountL, 1, {}) > 0, '箭雨史诗/传说卡也不需要前置');
}

// ============================================================ §3 golem.js 源码契约
console.log('[§3] golem.js 四条新通道');
{
  ok(/const CD_MIN = 16;/.test(golemSrc) && /const IRON_ATK_CD_MIN = 0\.8;/.test(golemSrc),
    '两条下限常量（召唤 CD 16s / 铁傀儡出手 0.8s）');
  ok(/cd = Math\.max\(CD_MIN, CD_TOTAL - cdCut\);/.test(golemSrc), '召唤 CD 吃 cdCut 且有下限');
  ok(/g\.atkT = Math\.max\(IRON_ATK_CD_MIN, IRON_ATK_CD \* \(1 - ironSpdPct\)\);/.test(golemSrc),
    '铁傀儡出手吃 ironSpdPct 且有下限');
  ok(/enemies\.knockback\(b\.target, b\.x0, b\.z0, SNOW_KNOCK \+ snowKnockFlat\);/.test(golemSrc),
    '雪球击退吃 snowKnockFlat');
  ok(/if \(snowSlowT > 0\) enemies\.applySlow\(b\.target, \{ factor: SNOW_SLOW_FACTOR, time: snowSlowT \}\);/.test(golemSrc)
    && /SNOW_SLOW_FACTOR = 0\.45/.test(golemSrc), '雪球命中走 applySlow（45% 固定幅度，卡叠时长）');
  ok(/else if \(card\.stat === 'cdCut'\) cdCut \+= card\.flat;/ .test(golemSrc)
    && /else if \(card\.stat === 'ironSpd'\) ironSpdPct \+= card\.flat;/.test(golemSrc)
    && /else if \(card\.stat === 'snowKnock'\) snowKnockFlat \+= card\.flat;/.test(golemSrc)
    && /else if \(card\.stat === 'snowSlow'\) snowSlowT \+= card\.flat;/.test(golemSrc),
    'applyCard 认四个新 stat');
  ok(/cdCut = 0; ironSpdPct = 0; snowKnockFlat = 0; snowSlowT = 0;/.test(golemSrc), 'reset 清零四通道');
  ok(/cdTotal: \(\) => Math\.max\(CD_MIN, CD_TOTAL - cdCut\),/.test(golemSrc), 'cdTotal 改动态 getter（吃卡）');
  ok(/cdCut, ironSpd: ironSpdPct, snowKnock: snowKnockFlat, snowSlowT,/.test(golemSrc)
    && /ironAtkCd: Math\.max\(IRON_ATK_CD_MIN, IRON_ATK_CD \* \(1 - ironSpdPct\)\),/.test(golemSrc),
    'bonuses() 暴露新通道（preview 文案要用）');
  // skills.js 的进度条与技能面板把 cdTotal 当函数用
  ok(/ctx\.golems\.cdTotal\(\)/.test(skillsSrc), 'skills.js 把 cdTotal 当函数调用');
}

// ============================================================ §4 arrowRain.js 源码契约
console.log('[§4] arrowRain.js 四条新通道 + 箭袋');
{
  ok(/const mods = \{ arrows: 0, dmgPct: 0, zone: 0, cdCut: 0, quiver: false \};/.test(arrowSrc), 'mods 五字段');
  ok(/const zoneR = \(\) => ZONE_R \+ mods\.zone;/.test(arrowSrc)
    && /const arrowsN = \(\) => ARROWS \+ mods\.arrows;/.test(arrowSrc)
    && /const dmgMul = \(\) => ARROW_DMG_MUL \* \(1 \+ mods\.dmgPct\);/.test(arrowSrc)
    && /const cdMaxV = \(\) => Math\.max\(CD_MIN, \(CD_MAX - mods\.cdCut\) \* cdMul\);/.test(arrowSrc),
    '四个动态取值函数（下限 CD_MIN=3s）');
  ok(/const CD_MIN = 3\.0;/.test(arrowSrc), '箭雨冷却下限 3 秒');
  ok(/for \(let i = 0; i < arrowsN\(\); i\+\+\)/.test(arrowSrc), '每次施放箭数走 arrowsN()');
  ok(/Math\.sqrt\(Math\.random\(\)\) \* zoneR\(\) \* 0\.94/.test(arrowSrc), '落点分布半径走 zoneR()');
  ok(/wstats\.get\('swordDamage'\) \* dmgMul\(\)/.test(arrowSrc), '每箭伤害走 dmgMul()');
  ok(/cd = cdMaxV\(\);/.test(arrowSrc), '施放后冷却走 cdMaxV()');
  ok(/ring\.scale\.setScalar\(zoneR\(\) \/ ZONE_R\)/.test(arrowSrc), '警告环随范围等比缩放（不重建共享几何）');
  ok(/mods\.arrows = 0; mods\.dmgPct = 0; mods\.zone = 0; mods\.cdCut = 0; mods\.quiver = false;/.test(arrowSrc),
    'reset() 清 mods（局内加成不跨局）');
  ok(/applyCard\(card\) \{/.test(arrowSrc)
    && /else if \(card\.stat === 'dmg'\) mods\.dmgPct \+= card\.flat;/.test(arrowSrc)
    && /else if \(card\.stat === 'zone'\) mods\.zone \+= card\.flat;/.test(arrowSrc)
    && /else if \(card\.stat === 'cd'\) mods\.cdCut \+= card\.flat;/.test(arrowSrc),
    'applyCard 认箭雨四 stat');
  ok(/applyQuiver\(\) \{/.test(arrowSrc) && /mods\.arrows \+= 5;/.test(arrowSrc) && /mods\.dmgPct \+= 0\.15;/.test(arrowSrc)
    && /if \(mods\.quiver\) return false;/.test(arrowSrc),
    'applyQuiver：+5 箭 +15%，重复调用返回 false');
  ok(/get cdMax\(\) \{ return cdMaxV\(\); \}/.test(arrowSrc)
    && /get progress\(\) \{ return unlocked \? 1 - cd \/ cdMaxV\(\) : 0; \}/.test(arrowSrc)
    && /cd = Math\.min\(cd, cdMaxV\(\)\);/.test(arrowSrc),
    'cdMax/progress/setCdMul 全部走动态 cdMaxV()（skills.js 的 ctx.arrowRain.cdMax 是 getter，不用改）');
}

// ============================================================ §5 preview/apply 一致性（真 import + 桩）
console.log('[§5] 新卡 preview 与 apply 完全一致');
{
  const golemsStub = () => ({
    bonuses: () => ({ cap: 1, hp: { iron: 0, snow: 0 }, atk: 0, cdCut: 0, ironSpd: 0, snowKnock: 0, snowSlowT: 0, cdTotal: 40, ironAtkCd: 2.0 }),
    applyCard() {},
  });
  const arrowStub = () => ({
    bonuses: () => ({ arrows: 0, dmgPct: 0, zone: 0, cdCut: 0, quiver: false, arrowsN: 14, zoneR: 2.3, dmgMul: 0.55, cdMax: 8 }),
    applyCard() {},
  });
  let bad = 0;
  const checked = [];
  for (const up of UPGRADES) {
    if (!up.golem && !up.arrow) continue;
    const isGolem = !!up.golem;
    const g = isGolem ? golemsStub() : null;
    const a = isGolem ? null : arrowStub();
    const pre = previewUpgrade(null, up, null, null, g, a);
    const res = applyUpgrade(null, up, 1, null, null, g, a);
    if (pre.length !== res.changes.length) { bad++; continue; }
    for (let i = 0; i < pre.length; i++) {
      if (pre[i].key !== res.changes[i].key) bad++;
      // preview 用「before」值、apply 用同一「before」→ 文案数字必须一致
      if (pre[i].text !== res.changes[i].text) bad++;
    }
    checked.push(up.id);
  }
  ok(checked.length === 16, '16 张结构卡（儀8 + 箭8）全部过一致性检查', `实际 ${checked.length}`);
  ok(bad === 0, 'preview 与 apply 的 changes 完全一致', `${bad} 处不一致`);
  // 没传桩时不炸（老调用兼容）
  const up = UPGRADES.find((u) => u.id === 'arrowCountS');
  let threw = false;
  try { applyUpgrade(null, up, 1); previewUpgrade(null, up); } catch { threw = true; }
  ok(!threw, '不传 golems/arrowRain 也不炸（老调用兼容）');
}

// ============================================================ §6 商店
console.log('[§6] 商店「强化箭袋」');
{
  const q = SHOP_ITEMS.find((i) => i.id === 'buyQuiver');
  ok(!!q, 'buyQuiver 存在');
  ok(q.type === 'quiver' && q.price === 26 && q.needRound === 5, 'type quiver / 26 币 / 第 5 回合起');
  ok(itemLocked(q, { round: 5, quiver: false }) === null, '没买过：不锁');
  ok(itemLocked(q, { round: 5, quiver: true }) === '这一局已经强化过了', '买过：一局一次锁死');
  ok(itemLocked(q, { round: 3, quiver: false }) !== null, '第 3 回合还看不到（needRound 5）');
}

// ============================================================ §7 main.js 接线
console.log('[§7] main.js 接线');
{
  // 第 114 块起尾部还接了 mines，别写死收尾的 )
  ok(/previewUpgrade\(stats, up, wstats, weapon, golems, arrowRain[^)]*\)/.test(mainSrc), '卡片预览把 arrowRain 递给 previewUpgrade');
  ok(/applyUpgrade\(stats, up, upSerial, wstats, weapon, golems, arrowRain[^)]*\)/.test(mainSrc), '选卡把 arrowRain 递给 applyUpgrade');
  ok(/quiver: arrowRain\.hasQuiver\(\)/.test(mainSrc), 'shopCtx / buyItem 都带箭袋标记');
  ok(/item\.type === 'quiver'/.test(mainSrc) && /arrowRain\.applyQuiver\(\)/.test(mainSrc), 'quiver 购买分支调 applyQuiver');
}

// ============================================================ §8 文案
console.log('[§8] 文案不写死单值');
{
  ok(/冷却 8 秒起，可被卡与箭袋缩短/.test(skillsSrc), 'skills.js 箭雨 hint 改「8 秒起」');
  ok(/冷却 8 秒起/.test(guideSrc) && /强化箭袋/.test(guideSrc), 'guide.js 箭雨页提成长线');
}

// ============================================================ §9 版本号
console.log('[§9] 版本号');
{
  ok(Number(VER) >= 125, 'index.html 版本 ≥ 125（不写死）', `实际 ${VER}`);
  const stale = ['main.js', 'upgrade.js', 'golem.js', 'arrowRain.js', 'shop.js', 'skills.js']
    .filter((f) => !src(f).includes(`?v=${VER}`));
  ok(stale.length === 0, '七个改动文件的 import 全部带新版本号', stale.join(','));
}

console.log(`\n====================================================`);
console.log(`第 108 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败清单：'); for (const f of fails) console.log(' - ' + f); process.exit(1); }
