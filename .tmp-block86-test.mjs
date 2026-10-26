// 第 86 块契约（纯 Node，不起浏览器）—— 用户报的 bug：
//   「上一关卡没打完就存档退出，进入另一关卡时会携带上次已经获得的属性和武器」
// 根因：beginGame → startPlay 只做「局外加成的落账」，从来没撤过局内的东西。
//   A resetRunState 存在，且清的是**局内**那一整套（属性 / 武器 / 计数 / 场地）
//   B beginGame 里在 startTutorial / startPlay 之前调它
//   C resumeGame（读档）**不能**调它 —— 那条路是用存档覆盖当前值
//   D 局外那三份（篝火 / 夜行商店 / 永夜火种）必须仍然在 startPlay 里重放
//   E 镇牌铃的视觉在 applyMeta 之后要补挂一次（局外法器是那一步才重放的）
//   F 版本号：index.html 与所有 js 一致
// 跑法：node .tmp-block86-test.mjs
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const mainSrc = readFileSync('js/main.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

// 取出三个函数的正文：从 function 名到下一个同缩进的 function 之前
function bodyOf(name) {
  const i = mainSrc.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = mainSrc.indexOf('\n  function ', i + 10);
  return mainSrc.slice(i, j > 0 ? j : mainSrc.length);
}
const resetBody = bodyOf('resetRunState');
const beginBody = bodyOf('beginGame');
const playBody = bodyOf('startPlay');
const resumeBody = bodyOf('resumeGame');

// ============================================================
sec('一、resetRunState 真的清掉了局内那一整套');
// ============================================================
ok(resetBody.length > 200, 'main.js 里有 resetRunState');
ok(/stats\.loadMods\(\[\]\)/.test(resetBody), '主角属性表清空（mods 是累加的，不清就一直叠）');
ok(/wstats\.loadMods\(\[\]\)/.test(resetBody), '武器属性表也清空');
ok(/stats\.hp\.cur = stats\.get\('maxHp'\)/.test(resetBody), '血按（清空后的）新上限回满');
ok(/weapon\.reset\(\)/.test(resetBody), '剑环 / 库存 / granted 一起清零');
ok(/arrowRain\.reset\(\)/.test(resetBody), '箭雨解锁与冷却重置（随后 prefillRing 按档案补）');
ok(/healSkill\.reset\(\)/.test(resetBody), '回血技能冷却重置');
ok(/turrets\.reset\(\)/.test(resetBody), '炮台清场');
ok(/relics\.reset\(\)/.test(resetBody), '局内买的法器清空');
ok(/coins = adminOn \? ADMIN_GOLD : 0/.test(resetBody), '金币归零（管理员模式仍给无限）');
ok(/kills = 0/.test(resetBody), '击杀数归零');
ok(/reputation = REP_START/.test(resetBody), '民心回到起始值');
ok(/upgradesTaken = 0/.test(resetBody), '升级计数归零');
ok(/upSerial = 0/.test(resetBody) && /shopSerial = 0/.test(resetBody), '升级 / 商店的 src 序号归零');
ok(/nextShopDiscount = 0/.test(resetBody), '一次性折扣归零');
ok(/bag\.potion = 0/.test(resetBody) && /bag\.bigPotion = 0/.test(resetBody), '背包药水清空');
ok(/enemies\.reset\(\)/.test(resetBody), '场上的怪清场（中途退出时它们还站着）');
ok(/gold\.reset\(\)/.test(resetBody), '地上的金币清掉');
ok(/deposit\.setSeal\(0\)/.test(resetBody), '柜子上的铃铛视觉复位');
ok(/if \(!dailyMode && !customSeed\) diffOverride = null/.test(resetBody),
  '每日挑战 / 种子局的临时难度不漏进普通局');
ok(/pendingClearUid != null && pendingClearUid !== runUid/.test(resetBody),
  '上一局「首通待领火种」的待清存档不会卡住新局的存档');

// elapsed 只能有一处归零（第 55 块契约），且那一处在 startPlay 里
ok(!/elapsed = 0/.test(resetBody), 'resetRunState 不碰 elapsed（归零只留在 startPlay 一处）');
ok((mainSrc.match(/(?<!let )elapsed = 0;/g) || []).length === 1, 'elapsed = 0 全文件只有一处');

// ============================================================
sec('二、beginGame 调它，且在建关之前');
// ============================================================
ok(/resetRunState\(\)/.test(beginBody), 'beginGame 里调了 resetRunState()');
const iReset = beginBody.indexOf('resetRunState()');
const iTut = beginBody.indexOf('startTutorial()');
const iPlay = beginBody.indexOf('startPlay()');
ok(iReset > 0 && iReset < iTut && iReset < iPlay, '顺序：reset → startTutorial / startPlay',
  `${iReset} / ${iTut} / ${iPlay}`);
ok(beginBody.indexOf('ensureLevelAssets') < iReset, '在按关补模型之后才清（加载期间不动世界）');

// ============================================================
sec('三、读档那条路不许清（用存档覆盖才是对的）');
// ============================================================
ok(resumeBody.length > 500, '拿到 resumeGame 正文');
ok(!/resetRunState\(\)/.test(resumeBody), 'resumeGame 里没有 resetRunState');
ok(/stats\.loadMods\(saved\.playerMods, saved\.hp\)/.test(resumeBody), '读档仍然用 loadMods 整表覆盖');
ok(/weapon\.restore\(saved\.weapon\)/.test(resumeBody), '读档仍然 restore 剑环');
ok(/relics\.restore\(saved\.relics\)/.test(resumeBody), '读档仍然 restore 法器');

// ============================================================
sec('四、局外那三份加成还在 startPlay 里重放（别把永久成长一起清了）');
// ============================================================
ok(/applyCampfire\(\)/.test(playBody), 'startPlay 仍调 applyCampfire（篝火）');
ok(/applyMeta\(stats, wstats/.test(playBody), 'startPlay 仍调 applyMeta（夜行商店）');
ok(/applyBoons\(stats, wstats\)/.test(playBody), 'startPlay 仍调 applyBoons（永夜火种）');
// applyCampfire / applyMeta / applyBoons 都得是「先撤再加」，否则清完还会重复叠
const campSrc = bodyOf('applyCampfire');
ok(/stats\.removeBySource\('camp'\)/.test(campSrc) && /wstats\.removeBySource\('camp'\)/.test(campSrc),
  'applyCampfire 先撤 camp 再加');

// ============================================================
sec('五、镇牌铃：局外法器在 applyMeta 才重放，铃铛得补挂一次');
// ============================================================
const iMeta = playBody.indexOf('applyMeta(stats, wstats');
const iSeal = playBody.indexOf('deposit.setSeal(relics.sealLevel())');
ok(iSeal > iMeta, 'startPlay 里 deposit.setSeal 在 applyMeta 之后', `${iSeal} vs ${iMeta}`);
ok(/deposit\.setSeal\(relics\.sealLevel\(\)\)/.test(mainSrc), 'setLevel 里那次也还在（服务读档链路）');

// ============================================================
sec('六、版本号');
// ============================================================
const V = (htmlSrc.match(/\?v=(\d+)/) || [])[1];
ok(Number(V) >= 97, `版本号 ≥ 97（实际 ${V}）`, V);
const jsFiles = ['main.js', 'enemy.js', 'weapon.js', 'deposit.js', 'relics.js', 'shop.js'];
for (const f of jsFiles) {
  const s = readFileSync('js/' + f, 'utf8');
  const vs = [...s.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  ok(vs.every((x) => x === String(V)), `${f} 的 ?v= 全是 ${V}`,
    vs.filter((x) => x !== String(V)).slice(0, 3).join(','));
}

console.log(`\n=== 第 86 块契约：通过 ${pass} / 失败 ${fail} ===`);
if (fail) { console.log('失败项：\n- ' + fails.join('\n- ')); process.exit(1); }
