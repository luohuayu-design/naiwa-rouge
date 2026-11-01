// 第 140 块契约（纯 Node，不起浏览器）
//   ① 成就 121 → 152：+31 条（累计型 / 十三~十七关通关 / 十只新怪 / 空白 BOSS / 镇纸锤 / 名字牌）
//   ② 新增 enemy 类 prog 的 id 必须都在 ENEMY_TYPES 里（写错 = 永远不亮）
//   ③ 每日任务池 39 → 63：+24 条（名字牌 / 砸地 / 新怪 kT / 高关卡通关 / 单局口径）
//   ④ 新计数器 AGG 语义（names / hammerCasts = sum，*RunMax = max）+ metric 都能被 dqPump 认
//   ⑤ main.js 埋点：31 条 tryAch + 两个新计数器 + 单局清零 + 结算 dqRun
//   ⑥ 抽签仍是 简单 3（含常驻）+ 中 1 + 难 1；版本号同步
// 跑法：node .tmp-block140-test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const indexHtml = src('index.html');
const VER = (indexHtml.match(/\?v=(\d+)/) || [])[1];
const mainSrc = src('js/main.js');
const achSrc = src('js/achievements.js');
const dqSrc = src('js/dailyQuest.js');

const A = await import(`./js/achievements.js?v=${VER}`);
const D = await import(`./js/dailyQuest.js?v=${VER}`);
const E = await import(`./js/enemy.js?v=${VER}`);
const { profile } = await import(`./js/profile.js?v=${VER}`);

// ============================================================ 1. 成就
sec('1. 成就 121 → 152（+31）');
const NEW_ACH = [
  // 战斗 4
  'kills_5000', 'crit_5000', 'dmg_5m', 'sword_20000',
  // 生存 1
  'deaths_100',
  // 构筑 4（镇纸锤 + 名字牌）
  'hammer_casts_100', 'hammer_run_5', 'hammer_max', 'names_30',
  // 关卡 21（通关 5 + 累计 4 + 十只新怪 + 空白 2）
  'clear_13', 'clear_14', 'clear_15', 'clear_16', 'clear_17',
  'levels_12', 'levels_16', 'rounds_1000', 'wins_100',
  'standee_10', 'camera_10', 'misprint_10', 'proofreader_5', 'danmaku_10',
  'moderator_5', 'paper_20', 'frame_10', 'toll_10', 'bronze_5',
  'blank_boss_3', 'blank_avatars_50',
  // 局外 1
  'box_500',
];
ok(A.ACH_COUNT === 152, '成就总数 152', String(A.ACH_COUNT));
ok(A.ACHS.length === A.ACH_COUNT, 'ACHS 长度 = ACH_COUNT');
{
  const ids = A.ACHS.map((a) => a.id);
  const miss = NEW_ACH.filter((id) => !ids.includes(id));
  ok(miss.length === 0, '31 条新成就都在（数量 ' + NEW_ACH.length + '）', miss.join(','));
  ok(new Set(ids).size === ids.length, 'id 仍然不重复');
  const byTier = [0, 1, 2].map((t) => A.ACHS.filter((a) => a.tier === t).length);
  ok(byTier.join('/') === '22/81/49', '档位分布 22 / 81 / 49', byTier.join('/'));
  const bones = A.ACHS.reduce((n, a) => n + A.achTier(a.tier).bones, 0);
  ok(bones === 11400, '全清 11400 骨币', String(bones));
  ok(A.ACHS.every((a) => !!a.name && !!a.desc && !!a.icon), '每条都有名字 / 描述 / 图标');
  ok(A.ACHS.every((a) => !/[*_`]/.test(a.desc)), '描述里没有 markdown（面板是 textContent）');
  const catIds = new Set(A.ACH_CATS.map((c) => c.id));
  ok(A.ACHS.every((a) => catIds.has(a.cat)), '新条目的 cat 都合法');
}

sec('1b. 新怪 / 残影的 prog id 与 ENEMY_TYPES 对齐');
{
  const types = new Set(Object.keys(E.ENEMY_TYPES));
  const bad = A.ACHS
    .filter((a) => a.prog && a.prog.k === 'enemy' && !types.has(a.prog.id))
    .map((a) => a.id + ':' + a.prog.id);
  ok(bad.length === 0, '所有 enemy prog 的 id 都在怪表里（否则永远不亮）', bad.join(','));

  // 十三~十八关的新怪：每只都必须有里程碑（不然图鉴里点开是空的）
  const NEW_MOBS = ['standee', 'camera', 'misprint', 'proofreader', 'danmaku', 'moderator', 'paper', 'frame', 'toll', 'bronze'];
  const noMilestone = NEW_MOBS.filter((t) => !A.ACHS.some((a) => a.prog && a.prog.k === 'enemy' && a.prog.id === t));
  ok(noMilestone.length === 0, '十只新怪各自都有击倒成就', noMilestone.join(','));
  ok(E.ENEMY_TYPES.blank && A.achById('blank_boss_3').prog.id === 'blank', '「空白」本体走 blank 的击倒数');

  // 八种残影：main.js 里那八个 id 必须都在怪表里，且不含小空白
  const avatars = (mainSrc.match(/BLANK_AVATAR_IDS = \[([\s\S]*?)\]/) || [])[1] || '';
  const ids = [...avatars.matchAll(/'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
  ok(ids.length === 8, 'BLANK_AVATAR_IDS 正好 8 种', String(ids.length));
  const badAv = ids.filter((t) => !types.has(t));
  ok(badAv.length === 0, '八种残影都在怪表里', badAv.join(','));
  ok(!ids.includes('blankMinion'), '小空白不计入「残影清仓」');
  ok(!ids.includes('blank'), '「空白」本体不计入残影');
  ok(!A.achById('blank_avatars_50').prog, '残影清仓由 main.js 八种合计（不走单只图鉴）');
}

// ============================================================ 2. 每日任务
sec('2. 每日任务池 39 → 63（+24）');
const NEW_DQ = [
  // 简单 8
  'dq_e_names1', 'dq_e_hammer3', 'dq_e_standee', 'dq_e_paper',
  'dq_e_danmaku', 'dq_e_toll', 'dq_e_camera', 'dq_e_bronze',
  // 中等 8
  'dq_m_lv13', 'dq_m_lv15', 'dq_m_names3', 'dq_m_hammer10',
  'dq_m_hammer_run', 'dq_m_misprint', 'dq_m_frame', 'dq_m_moderator',
  // 困难 8
  'dq_h_lv18', 'dq_h_names8', 'dq_h_hammer30', 'dq_h_hammer_run5',
  'dq_h_blank', 'dq_h_proof', 'dq_h_round18', 'dq_h_kill300',
];
{
  const ids = D.DQ_POOL.map((t) => t.id);
  ok(D.DQ_POOL.length === 63, '池子 63 条', String(D.DQ_POOL.length));
  ok(new Set(ids).size === ids.length, '任务 id 不重复');
  const miss = NEW_DQ.filter((id) => !ids.includes(id));
  ok(miss.length === 0, '24 条新任务都在（数量 ' + NEW_DQ.length + '）', miss.join(','));
  const n = { easy: 0, mid: 0, hard: 0 };
  for (const t of D.DQ_POOL) n[t.tier]++;
  ok(n.easy === 27 && n.mid === 19 && n.hard === 17, '简单 27 / 中等 19 / 困难 17', `${n.easy}/${n.mid}/${n.hard}`);
  ok(D.DQ_POOL.every((t) => t.need > 0), '每条目标 > 0');
  ok(D.DQ_POOL.every((t) => !!t.metric && !!t.name && !!t.desc), '每条都有 metric / 名字 / 描述');
  ok(D.DQ_POOL.every((t) => !/[*_`]/.test(t.desc)), '描述里没有 markdown');
}

sec('2b. 新 metric 都能被 dqPump 认（否则静默丢进度）');
{
  const inAgg = (m) => new RegExp(`\\b${m}:\\s*'(?:sum|max)'`).test(dqSrc);
  for (const t of D.DQ_POOL) {
    const okMetric = inAgg(t.metric) || t.metric.startsWith('kT:');
    ok(okMetric, `metric 有累计语义：${t.metric}`);
  }
  ok(inAgg('names') && inAgg('namesRunMax'), 'names / namesRunMax 进了 AGG');
  ok(inAgg('hammerCasts') && inAgg('hammerRunMax'), 'hammerCasts / hammerRunMax 进了 AGG');
  ok(/"names": 'sum'|names: 'sum'/.test(dqSrc), 'names 是 sum（跨局累计）');
  ok(/namesRunMax: 'max'/.test(dqSrc), 'namesRunMax 是 max（取单局最高）');
  ok(/hammerCasts: 'sum'/.test(dqSrc), 'hammerCasts 是 sum');
  ok(/hammerRunMax: 'max'/.test(dqSrc), 'hammerRunMax 是 max');
  // 新怪的 kT 全部指向怪表里存在的种类
  const types = new Set(Object.keys(E.ENEMY_TYPES));
  const badK = D.DQ_POOL.filter((t) => t.metric.startsWith('kT:'))
    .map((t) => [t.id, t.metric.slice(3)])
    .filter(([, k]) => !types.has(k));
  ok(badK.length === 0, 'kT: 的怪种名都在怪表里', badK.map(([id, k]) => id + ':' + k).join(','));
}

sec('2c. 抽签仍是 简单 3（含常驻）+ 中 1 + 难 1');
{
  const p = profile();
  p.dq = { day: '', picked: [], c: {}, got: {} };
  const tasks = D.dqTasks();
  ok(tasks.length === 5, '一天 5 条', String(tasks.length));
  const n = { easy: 0, mid: 0, hard: 0 };
  for (const t of tasks) n[t.tier]++;
  ok(n.easy === 3 && n.mid === 1 && n.hard === 1, '简单 3 / 中等 1 / 困难 1', `${n.easy}/${n.mid}/${n.hard}`);
  ok(tasks.some((t) => t.id === 'dq_clear_any'), '常驻「完整通过任一关卡」必出');
  ok(D.DQ_PINNED.length === 1 && D.DQ_PINNED[0] === 'dq_clear_any', 'DQ_PINNED 只有那条常驻');
  // 同一天两次抽签结果一致（日期哈希，不是 Math.random）
  const a1 = D.dqTasks().map((t) => t.id).join(',');
  const a2 = D.dqTasks().map((t) => t.id).join(',');
  ok(a1 === a2, '同一天刷新两次是同一批', a1 + ' | ' + a2);
  ok(D.DQ_BONES.easy === 30 && D.DQ_BONES.mid === 80 && D.DQ_BONES.hard === 150,
    '奖励档位没动（30 / 80 / 150）', JSON.stringify(D.DQ_BONES));
  D.dqReset();
}

// ============================================================ 3. main.js 埋点
sec('3. main.js 埋点与单局口径');
{
  const called = new Set([...mainSrc.matchAll(/tryAch\(\s*'([a-zA-Z0-9_]+)'\s*\)/g)].map((m) => m[1]));
  const noHook = NEW_ACH.filter((id) => !called.has(id));
  ok(noHook.length === 0, '31 条新成就都有 tryAch 埋点', noHook.join(','));
  const noHookAll = A.ACHS.filter((a) => !called.has(a.id)).map((a) => a.id);
  ok(noHookAll.length === 0, '全部 152 条都有埋点（没有永远灰的）', noHookAll.slice(0, 8).join(','));

  ok(/bumpStat\('hammerCasts'\)/.test(mainSrc), '砸地成功 bumpStat(hammerCasts)');
  ok(/bumpStat\('namesTaken'\)/.test(mainSrc), '抢回名字牌 bumpStat(namesTaken)');
  ok(/dqPump\(\{ hammerCasts: 1, hammerRunMax: runHammerCasts \}\)/.test(mainSrc),
    '砸地即时喂每日任务（hammerCasts + hammerRunMax）');
  ok(/dqPump\(\{ names: 1, namesRunMax: runNames \}\)/.test(mainSrc),
    '名字牌即时喂每日任务（names + namesRunMax）');
  ok(/let runHammerCasts = 0;/.test(mainSrc) && /let runNames = 0;/.test(mainSrc),
    '两个单局计数器声明了');
  ok(/runHammerCasts = 0;[\s\S]{0,40}runNames = 0;/.test(mainSrc), 'resetRunState 里两个都清零');
  ok(/namesRunMax: runNames/.test(mainSrc) && /hammerRunMax: runHammerCasts/.test(mainSrc),
    '结算 dqRun 带两个 *_runMax');

  // 结算对表：通关类在 isWin 里，锤子两条在 isWin 之外（不通关也能亮）
  const wAt = mainSrc.indexOf('if (isWin) markLevelClear(curLevelId)');
  const winBlock = mainSrc.slice(wAt, wAt + 2500);
  ok(/tryAch\('clear_13'\)/.test(winBlock) && /tryAch\('clear_17'\)/.test(winBlock), 'clear_13~17 在通关分支里');
  ok(/tryAch\('levels_12'\)/.test(winBlock) && /tryAch\('levels_16'\)/.test(winBlock), 'levels_12 / 16 在通关分支里');
  ok(/tryAch\('hammer_max'\)/.test(mainSrc) && /tryAch\('hammer_run_5'\)/.test(mainSrc), '锤子两条在结算里（不看通关）');
  ok(/relics\.levels\(\)\.hammer >= 3/.test(mainSrc), '镇纸锤满级读的是真实等级');
  ok(/runHammerCasts >= 5/.test(mainSrc), '单局五锤读的是单局计数器');

  // 累计类都在 checkCumulativeAchs 里（不然只有通关才判）
  const cAt = mainSrc.indexOf('function checkCumulativeAchs');
  const cum = mainSrc.slice(cAt, cAt + 9000);
  for (const id of ['kills_5000', 'crit_5000', 'dmg_5m', 'sword_20000', 'deaths_100',
    'hammer_casts_100', 'names_30', 'rounds_1000', 'wins_100', 'box_500']) {
    ok(cum.includes(`tryAch('${id}')`), `累计类在 checkCumulativeAchs：${id}`);
  }

  // 十只新怪 + 空白两条的 onDeath 埋点在 codexCount 之后
  const deathBlock = mainSrc.slice(mainSrc.indexOf("if (e.type === 'standee'"), mainSrc.indexOf("if (e.type === 'standee'") + 1200);
  ok(/codexCount\('enemies', 'standee'\) >= 10/.test(deathBlock), '新怪里程碑读图鉴击倒数（不是本局）');
  ok(/codexCount\('enemies', 'blank'\) >= 3/.test(mainSrc), '空白 BOSS 读图鉴击倒数');
  ok(/e\.type\.startsWith\('blank'\) && e\.type !== 'blankMinion'/.test(mainSrc), '残影合计排除小空白');
}

// ============================================================ 4. 版本号
sec('4. 版本号同步');
{
  ok(+VER >= 158, '版本号至少到 158', VER);
  const jsFiles = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const bad = [];
  for (const f of ['index.html', ...jsFiles.map((x) => `js/${x}`)]) {
    for (const one of (src(f).match(/\?v=(\d+)/g) || [])) if (one !== `?v=${VER}`) bad.push(`${f}:${one}`);
  }
  ok(bad.length === 0, '所有 ?v= 都是同一个版本', bad.slice(0, 5).join(', '));
  ok(indexHtml.includes(`main.js?v=${VER}`), 'index.html 引用的是新版本');
  ok(!/121 条成就|成就 121/.test(achSrc), 'achievements.js 里没有残留 121');
}

console.log('\n' + '='.repeat(52));
console.log(`第 140 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败清单：'); fails.forEach((f) => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
