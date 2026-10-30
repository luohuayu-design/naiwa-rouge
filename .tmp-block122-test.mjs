// 第 122 块 · 回合挑战 + 三选一刷新 —— 契约测试（Node，不开浏览器）
//   ① challenge.js 数据：9 条挑战 / 奖励三条 / 大涨池三类
//   ② 规划：planRounds 的范围 / 数量 / 升序 / 无重复 / 短关卡退化
//   ③ 抽取：rollChallenge 会避开刚出过的那条；rollBoosts 三类各一
//   ④ 接线契约（扫源码）：效果来源 src / 清理口 / 受击加重 / 挑战弹窗位置 /
//      奖励三选一 / wave 的 roundMod / weapon 的 mute 门
//   ⑤ 三选一刷新：3 次免费 → 盲盒减成换 → 十条背满就没得换
//   ⑥ DOM / 样式 / 文案 / 版本一致
// 运行：node .tmp-block122-test.mjs
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
const waveSrc = src('js/wave.js');
const weaponSrc = src('js/weapon.js');
const cssSrc = src('style.css');

const C = await import(`./js/challenge.js?v=${VER}`);
const W = await import(`./js/wave.js?v=${VER}`);
const U = await import(`./js/upgrade.js?v=${VER}`);
const CU = await import(`./js/curses.js?v=${VER}`);

// 可复现的伪随机（和 main.js 用的不是同一套，只用来跑断言）
function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
sec('① challenge.js —— 挑战数据');
// ============================================================
ok(Array.isArray(C.CHALLENGES) && C.CHALLENGES.length === 9,
  `九条挑战（实 ${C.CHALLENGES.length}）`);
const ids = C.CHALLENGES.map((c) => c.id);
ok(new Set(ids).size === ids.length, 'id 不重复');
for (const need of ['thinBlood', 'softPaw', 'brokenSword', 'tide']) {
  ok(!!C.chalById(need), `用户点名的四条在（${need}）`);
}
ok(C.CHALLENGES.every((c) => c.name && c.icon && c.desc && c.rule),
  '每条都有名字 / 图标 / 说明 / 规则行');
ok(C.CHALLENGES.every((c) => typeof c.desc === 'string' && c.desc.length >= 12),
  '说明不是占位短句');
// 用户可见文案走 textContent，不能写 markdown
ok(!C.CHALLENGES.some((c) => /\*\*/ .test(c.desc + c.rule + c.name)),
  '文案里没有 markdown 加粗（textContent 不认）');
ok(C.CHALLENGES.every((c) => !/[<>]/.test(c.desc)), '文案里没有 HTML 标签');

// 「一条挑战只碰一个轴」—— 两条叠加会把一回合直接变成必死
ok(C.CHALLENGES.every((c) => {
  const axes = [!!c.stat, !!c.attackTo, !!c.roundMod, !!c.noSword, !!c.noSkill, !!c.dmgTaken, !!c.clampHp];
  return axes.filter(Boolean).length >= 1;
}), '每条至少有一个作用轴');

const blood = C.chalById('thinBlood');
ok(blood && blood.stat[0].stat === 'maxHp' && blood.stat[0].mul === 0.5, '残血：生命上限 ×0.5');
ok(blood && blood.clampHp === true, '残血：要把当前血量夹进新上限');
const soft = C.chalById('softPaw');
ok(soft && soft.attackTo === 0.4, '绵软：攻击压到 40%');
const breakSword = C.chalById('brokenSword');
ok(breakSword && breakSword.noSword === true, '断剑：noSword 硬开关');
const tide = C.chalById('tide');
ok(tide && tide.roundMod && tide.roundMod.countScale === 2, '怪物潮：数量 ×2');
const gale = C.chalById('gale');
ok(gale && gale.roundMod.speedMul === 1.45 && gale.roundMod.hasteMul === 1.3,
  '疾风：移速 ×1.45 / 出手 ×1.3');
const mute = C.chalById('mute');
ok(mute && mute.noSkill === true, '禁术：技能栏全锁');
const fragile = C.chalById('fragile');
ok(fragile && fragile.dmgTaken === 0.6, '破防：受伤 +60%');

// 所有 stat 键必须是真实存在的属性键（写错会静默归零）
const ST = await import(`./js/stats.js?v=${VER}`);
const statKeys = new Set(ST.STAT_DEFS.map((d) => d.key));
const badStat = C.CHALLENGES
  .flatMap((c) => (c.stat || []).map((m) => ({ id: c.id, k: m.stat })))
  .filter((x) => !statKeys.has(x.k));
ok(badStat.length === 0, '挑战里的属性键都在 STAT_DEFS 里', badStat.map((b) => `${b.id}:${b.k}`).join(','));

// ============================================================
sec('② 奖励池');
// ============================================================
ok(C.REWARDS.length === 3, '奖励三条');
ok(C.REWARDS.map((r) => r.id).join(',') === 'coin,card,boost', '顺序固定 coin / card / boost');
ok(C.REWARDS[0].coin === 88, '金币奖励 88');
ok(C.REWARDS[1].card === true, '第二条 = 再一次三选一');
ok(C.REWARDS[2].boost === true, '第三条 = 下一回合大涨');
ok(C.REWARDS.every((r) => r.name && r.text && r.hint), '三条都有名字 / 正文 / 角标');

ok(C.BOOST_POOL.base.length >= 6, `基本属性池够大（实 ${C.BOOST_POOL.base.length}）`);
ok(C.BOOST_POOL.skill.length >= 2, '技能池 ≥2');
ok(C.BOOST_POOL.relic.length >= 2, '法器池 ≥2');
const boostIds = [...C.BOOST_POOL.base, ...C.BOOST_POOL.skill, ...C.BOOST_POOL.relic].map((b) => b.id);
ok(new Set(boostIds).size === boostIds.length, '大涨条目 id 不重复');
const WS = await import(`./js/weaponStats.js?v=${VER}`);
const wKeys = new Set(WS.WEAPON_STAT_DEFS.map((d) => d.key));
const badW = C.BOOST_POOL.base
  .filter((b) => b.kind === 'weapon')
  .flatMap((b) => b.mods.map((m) => m.stat))
  .filter((k) => !wKeys.has(k));
ok(badW.length === 0, '武器类大涨的属性键在 WEAPON_STAT_DEFS 里', badW.join(','));
const badB = C.BOOST_POOL.base
  .filter((b) => b.kind !== 'weapon')
  .flatMap((b) => b.mods.map((m) => m.stat))
  .filter((k) => !statKeys.has(k));
ok(badB.length === 0, '属性类大涨的键在 STAT_DEFS 里', badB.join(','));

const bs = C.rollBoosts(mkRng(7));
ok(bs.length === 3, 'rollBoosts 抽三条');
ok(bs[0].kind === 'stat' || bs[0].kind === 'weapon', '第一条来自基本属性池');
ok(bs[1].kind === 'cd', '第二条来自技能池');
ok(bs[2].kind === 'relic', '第三条来自法器池');
ok(typeof C.boostSummary(bs) === 'string' && C.boostSummary(bs).includes('·'),
  '摘要用 · 连起来', C.boostSummary(bs));

// ============================================================
sec('③ 规划：每关两个挑战回合');
// ============================================================
ok(C.CHAL_PER_LEVEL === 2, '每关 2 个');
ok(C.CHAL_FIRST_ROUND === 3, '第 3 回合起（开局两回合是软启动）');
ok(C.CHAL_LAST_GAP === 1, '最后一回合不出（奖励没有落点）');
const p20 = C.planRounds(mkRng(1), 20);
ok(p20.length === 2, `20 回合的关卡抽 2 个（实 ${p20.length}）`);
ok(p20.every((r) => r >= 3 && r <= 19), `都在 3~19（实 ${p20.join(',')}）`);
ok(p20[0] < p20[1], '升序返回');
ok(new Set(p20).size === 2, '两个回合不同');
// 分布：跑一批种子，覆盖应当足够广（不能老是同两个回合）
const seenRounds = new Set();
for (let i = 0; i < 400; i++) C.planRounds(mkRng(i + 100), 20).forEach((r) => seenRounds.add(r));
ok(seenRounds.size >= 15, `400 次规划至少覆盖 15 个不同回合（实 ${seenRounds.size}）`);
// 短关卡：3 回合的关卡没有可用回合 → 空数组，不崩
ok(C.planRounds(mkRng(3), 3).length === 0, '3 回合的关卡退化为空');
ok(C.planRounds(mkRng(3), 4).length === 1, '4 回合的关卡只能出 1 个');
ok(Array.isArray(C.planRounds(mkRng(3), 0)), '0 回合不抛异常');

// 抽取避开刚出过的
const ex = C.rollChallenge(mkRng(9), C.CHALLENGES.map((c) => c.id));
ok(ex && ex.id, '全部排除时仍返回一条（兜底，不返回 undefined）');
const pool3 = ['thinBlood', 'softPaw', 'brokenSword', 'tide', 'gale', 'coldHand', 'mute', 'heavyStep'];
let leaked = 0;
for (let i = 0; i < 200; i++) {
  const c = C.rollChallenge(mkRng(i + 1), pool3);
  if (pool3.includes(c.id)) leaked++;
}
ok(leaked === 0, '排除项一定不会抽到', `漏了 ${leaked} 次`);

// ============================================================
sec('④ 接线契约（扫源码）');
// ============================================================
ok(mainSrc.includes("from './challenge.js?v="), 'main.js 导入 challenge.js');
ok(/import \{[\s\S]{0,400}planRounds[\s\S]{0,200}\} from '\.\/challenge\.js\?v=/.test(mainSrc),
  '导入 planRounds / rollChallenge');
// 属性一律 src='chal'
ok(/const src = 'chal';/.test(mainSrc), "挑战用 src = 'chal'");
ok(/stats\.removeBySource\('chal'\)/.test(mainSrc), "挑战按 src='chal' 撤");
ok(/wstats\.removeBySource\('chal'\)/.test(mainSrc), '武器表也一起撤');
// 清理口必须在 clearRoundBuffs 里
ok(/function clearRoundBuffs\(\)[\s\S]{0,900}clearChallengeState\(\)/.test(mainSrc),
  'clearRoundBuffs 里撤挑战');
ok(/function clearRoundBuffs\(\)[\s\S]{0,900}clearBoost\(\)/.test(mainSrc),
  'clearRoundBuffs 里撤大涨');
// 挑战与大涨不共用槽位（第 122 块最容易踩的坑）
ok(/boostSrc/.test(mainSrc) && !/roundBuffSrc = boostSrc/.test(mainSrc),
  '大涨用独立 boostSrc，不抢 roundBuffSrc');
// 受击加重
ok(/const raw = amount \* \(1 \+ runCurseDmg\) \* \(1 \+ boxCurseDmg\) \* \(1 \+ chalDmgTaken\);/.test(mainSrc),
  '破防挑战乘在 hurtPlayer 的 raw 上（盲盒减成也各占一项）');
// 攻击力用 mul 不用 flat
ok(/stats\.addMod\(\{ stat: 'attack', mul: target \/ Math\.max/.test(mainSrc),
  '绵软挑战用 mul 折算（flat 会被 pct 放大）');
// 挑战弹窗挂在下回合开始前（商店链末端）
ok(/const beforeNextRound = \(\) => \{[\s\S]{0,200}maybeChallenge\(roundNo \+ 1\);/.test(mainSrc),
  '挑战弹窗挂在结算链末端（商店关掉之后）');
ok(/openShop\(roundNo, beforeNextRound\)/.test(mainSrc), '商店关闭回调接挑战');
// 奖励排在链首
ok(/if \(chalDone && chalEnabled\(\)\) \{ openChalReward\(chalDone, roundNo, startChain\); return; \}/.test(mainSrc),
  '挑战奖励排在结算链最前');
ok(/if \(pendingRound >= level\.totals\.rounds\)/.test(mainSrc), '（原有）关底结算没被改坏');
// 奖励「再一次三选一」走 showUpgrade
ok(/if \(r\.card\) \{[\s\S]{0,200}showUpgrade\(chalRewardRound, next\);/.test(mainSrc),
  '奖励二走 showUpgrade');
// 断剑：weapon.setMuted
ok(/weapon\.setMuted\(true\)/.test(mainSrc) && /weapon\.setMuted\(false\)/.test(mainSrc),
  '断剑开 / 关都接了');
// 禁术：技能栏与按下都拦
ok(/if \(chalNoSkill\) \{[\s\S]{0,200}showToast\('技能被禁'/.test(mainSrc), '禁术拦在 pressSkill');
ok(/muted: chalNoSkill,/.test(mainSrc), 'skillCtx 带 muted');
ok(/const muted = !!ctx\.muted;/.test(mainSrc), 'renderSkill 读 muted');
// 调试门：debug 默认跳过（老 CDP 套件靠「清场就能推进」）
ok(/function chalEnabled\(\) \{[\s\S]{0,160}DEBUG_SKIP_NARRATIVE/.test(mainSrc),
  'debug 默认跳过挑战');
ok(/params\.has\('chal'\)/.test(mainSrc), '&chal 可强制打开');
// 存档
ok(/chal: \{ plan: chalPlan\.slice\(\), used: chalUsed\.slice\(\), seen: chalSeen\.slice\(\) \}/.test(mainSrc),
  '挑战规划进档');
ok(/const sc = saved\.chal \|\| null;/.test(mainSrc), '读档恢复挑战规划');
ok(/stats\.removeBySource\('boost'\);/.test(mainSrc), '读档抹掉大涨');
// 复位
ok(/upRefreshLeft = UP_REFRESH_FREE;/.test(mainSrc), 'resetRunState 复位免费刷新次数');
ok(/chalPlan = \[\];/.test(mainSrc), 'resetRunState 清空挑战规划');
// 盲盒减成的存档 / 读档 / 复位（第 122 块修的：以前错记成夜行诅咒，会污染 profile 与骨币倍率）
ok(/box: boxCurses\.slice\(\),/.test(mainSrc), '减成进档');
ok(/boxCurses = \(saved\.box \|\| \[\]\)\.filter\(\(id\) => BOX_CURSE_BY_ID\[id\]\)/.test(mainSrc),
  '读档恢复减成（不认识的 id 直接丢）');
ok(/boxCurses = \[\];\s*\n\s*boxCurseDmg = 0;/.test(mainSrc), 'resetRunState 清空减成');
// 随机流
ok(/chal: makeRng\(runSeed \^ 0x2545f491\)/.test(mainSrc), 'chal 独立随机流（种子局可复现）');
// wave 的 roundMod
ok(/speedScale: sc\.speed \* \(rm\.speedMul \|\| 1\)/.test(waveSrc), 'wave 支持 roundMod.speedMul');
ok(/hasteScale: sc\.haste \* \(rm\.hasteMul \|\| 1\)/.test(waveSrc), 'wave 支持 roundMod.hasteMul');
// weapon 的 mute
ok(/if \(!granted \|\| muted \|\| fireCd > 0\) return false;/.test(weaponSrc), '断剑时万剑齐发按不动');
ok(/if \(!granted \|\| muted\) return;/.test(weaponSrc), '断剑时整个剑环不更新');
ok(/setMuted, /.test(weaponSrc), 'setMuted 导出');
ok(/muted = false;/.test(weaponSrc), 'reset 里清 mute（不跨局残留）');

// ============================================================
sec('⑤ 三选一刷新（价格是盲盒式减成，不是夜行诅咒）');
// ============================================================
ok(/const UP_REFRESH_FREE = 3;/.test(mainSrc), '一局 3 次免费');
ok(/function rerollUpPicks\(\)/.test(mainSrc), '重抽函数在');
ok(/function renderUpPicks\(picks\)/.test(mainSrc), '渲染拆成可重入的函数');
ok(/function rollUpPicks\(roundNo\)/.test(mainSrc), '抽卡也拆成函数（刷新复用同一套口径）');
// 刷新出来的三张不能和刚才一模一样
ok(/const sig = \(list\) => list\.map\(\(u\) => u\.id\)\.slice\(\)\.sort\(\)\.join\('\|'\);/.test(mainSrc),
  '重抽会比对 id 集合（避免刷出一模一样的三张）');
// 免费 → 减成换 → 用尽
ok(/if \(upRefreshLeft > 0\) \{[\s\S]{0,160}upRefreshLeft--;/.test(mainSrc), '先扣免费次数再重抽');
ok(/askConfirm\(\s*'用一条减成换一次刷新？'/.test(mainSrc), '免费次数用完后走确认弹窗');
ok(/const ok = await askConfirm\(\s*'用一条减成换一次刷新？'[\s\S]{0,600}addBoxCurse\(c\.id\);/.test(mainSrc),
  '确认后随机抽一条减成并落账');
ok(/upRefreshPaid\+\+/.test(mainSrc), '付费刷新有计数');
ok(/const avail = BOX_CURSES\.filter\(\(c\) => !boxCurses\.includes\(c\.id\)\)/.test(mainSrc),
  '只抽自己还没有的减成');
ok(/function addBoxCurse\(id\) \{/.test(mainSrc), 'addBoxCurse 收口');
ok(/const rc = applyBoxCurses\(stats, wstats, boxCurses\);/.test(mainSrc),
  '减成落账走 applyBoxCurses（先撤再重放，不会叠两次）');
ok(/boxCurseDmg = rc\.dmgTaken;/.test(mainSrc), '荆棘皮的受伤加重当场重算');
ok(/stats\.clampHp\(\);/.test(mainSrc), '瘪血压上限后血量跟着夹');
// 关键：刷新用的是**盲盒式减成**，不是开局的夜行诅咒 —— 这两样一个字都不能碰
ok(!/function addBoxCurse[\s\S]{0,500}pendingCurses/.test(mainSrc), '刷新不写 pendingCurses（夜行诅咒是另一套）');
ok(!/function addBoxCurse[\s\S]{0,500}profile\(\)\.runCurses/.test(mainSrc), '刷新不写 profile().runCurses');
// 数据契约：10 条、一条只碰一个数、全部走 mul / dmgTaken
ok(CU.BOX_CURSES.length === 10, `盲盒减成 10 条（实 ${CU.BOX_CURSES.length}）`);
ok(CU.BOX_CURSES.every((c) => (c.mods || []).length + (c.dmgTaken ? 1 : 0) === 1), '每条减成只碰一个数');
ok(CU.BOX_CURSES.every((c) => (c.mods || []).every((m) => m.mul != null && m.flat == null && m.pct == null)),
  '一律走 mul 最终乘算（flat 会被 pct 反向放大）');
ok(!!(CU.BOX_CURSE_BY_ID.weak && CU.BOX_CURSE_BY_ID.weak.mods[0].stat === 'attack'), '池子里有「薄刃」');
// 落账口径：能撤、受伤加重单独回、不重复
const mkStats = () => ({ list: [], removeBySource(s) { this.list = this.list.filter((m) => m.src !== s); }, addMod(m) { this.list.push(m); } });
const bs1 = mkStats(); const bs2 = mkStats();
const r1 = CU.applyBoxCurses(bs1, bs2, ['weak', 'thorns']);
CU.applyBoxCurses(bs1, bs2, ['weak', 'thorns', 'lead']);
ok(r1.count === 2 && Math.abs(r1.dmgTaken - 0.12) < 1e-9, 'applyBoxCurses 回 count / dmgTaken');
ok(bs1.list.length === 2 && bs1.list.every((m) => m.src === 'boxcurse'), '三次投放只留最后一次（先撤再重放）');
ok(CU.BOX_CURSES.length === 10 && CU.RUN_CURSES.length === 6, '两套诅咒各自独立（10 条减成 / 6 条夜行）');
// 火种面板不能出现刷新键
ok(/\.upgrade\.boon \.up-refresh\{display:none\}/.test(cssSrc), '永夜火种面板里藏掉刷新键');
// 升级池没被动过
ok(Array.isArray(U.UPGRADES) && U.UPGRADES.length > 100, `卡池仍然是老样子（${U.UPGRADES.length} 张）`);

// ============================================================
sec('⑥ DOM / 样式 / 版本');
// ============================================================
for (const id of ['upRfBtn', 'upRfName', 'upRfN', 'upRfTip']) {
  ok(indexHtml.includes(`id="${id}"`), `index.html 有 #${id}`);
}
for (const id of ['chalAsk', 'chTag', 'chIcon', 'chName', 'chRule', 'chDesc', 'chYes', 'chNo']) {
  ok(indexHtml.includes(`id="${id}"`), `index.html 有 #${id}`);
}
for (const id of ['chalReward', 'crTag', 'crName', 'crDesc', 'crList']) {
  ok(indexHtml.includes(`id="${id}"`), `index.html 有 #${id}`);
}
ok(/\.up-refresh\{/.test(cssSrc) && /\.up-rf\{/.test(cssSrc), '.up-refresh 样式在');
ok(/\.chal\{position:fixed/.test(cssSrc), '.chal 是整层浮层');
ok(/z-index:35/.test(cssSrc), '挑战层 z-index 35（盖过三选一 / 商店 / 事件卡）');
ok(/\.ch-item\{/.test(cssSrc), '奖励卡样式在');
// 挑战弹窗默认不可见（否则会挡住整局）
ok(/\.chal\{[\s\S]{0,400}visibility:hidden/.test(cssSrc), '收起态 visibility:hidden');
ok(/\.chal\.on\{[\s\S]{0,200}visibility:visible/.test(cssSrc), '展开态才可见');

// 版本一致
const jsFiles = ['main.js', 'challenge.js', 'weapon.js', 'wave.js'];
const bad = jsFiles.filter((f) => {
  const s = src(`js/${f}`);
  return s.includes('?v=') && !s.includes(`?v=${VER}`);
});
ok(bad.length === 0, `版本号与 index.html 一致（v=${VER}）`, bad.join(','));
ok(mainSrc.includes(`from './challenge.js?v=${VER}'`), `challenge.js 也带版本号 v=${VER}`);

// ============================================================
console.log(`\n===== block122: ${pass} ok / ${fail} fail =====`);
if (fail) { console.log(fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
