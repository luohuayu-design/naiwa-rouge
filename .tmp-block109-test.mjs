// 第 109 块契约（纯 Node，不起浏览器）
//   ① 每日任务池扩容 24 → 39（休闲友好 + 新内容联动 + 高难挑战，各方向都有）
//   ② avail 门控：没解锁箭雨 / 没买傀儡术的玩家，抽到的做不了任务会被过滤
//   ③ 新计数器语义：deaths/nightmareWins/curse3Wins/fast5/arrowCasts/golemSummons = sum，
//      critRunMax/arrowRunMax = max
//   ④ main.js 埋点接线：pressSkill 收口（箭雨）、hintChoiceCb（傀儡）、结算 dqRun 新字段
//   ⑤ 抽签确定性不受影响（同一天同一批、每天 5 条、常驻必出）
//   ⑥ 版本号同步
// 跑法：node .tmp-block109-test.mjs
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const idxSrc = readFileSync('index.html', 'utf8');
const VER = (idxSrc.match(/\?v=(\d+)/) || [, '0'])[1];
const dqSrc = readFileSync('js/dailyQuest.js', 'utf8');
const mainSrc = readFileSync('js/main.js', 'utf8');

// ⚠️ profile 必须**带同一个 ?v= 导入**（Node 把带查询串和不带当两个模块实例）
const { profile } = await import('./js/profile.js?v=' + VER);
const {
  DQ_POOL, DQ_PINNED, dqTasks, dqPump, dqState, dqReset, dayKeyOf,
} = await import('./js/dailyQuest.js?v=' + VER);

// ============================================================ 1. 池子结构
sec('1. 池子扩容 24 → 39');
{
  const ids = DQ_POOL.map((t) => t.id);
  ok(new Set(ids).size === ids.length, '任务 id 不重复');
  ok(DQ_POOL.length === 39, '池子 39 条', String(DQ_POOL.length));

  const n = { easy: 0, mid: 0, hard: 0 };
  for (const t of DQ_POOL) n[t.tier]++;
  ok(n.easy === 19, `简单池 19 条（含常驻）`, String(n.easy));
  ok(n.mid === 11, `中等池 11 条`, String(n.mid));
  ok(n.hard === 9, `困难池 9 条`, String(n.hard));

  // 15 条新任务全在
  const NEW = ['dq_death_2', 'dq_shop_6', 'dq_potion_5', 'dq_runs_4', 'dq_arrow_20', 'dq_kill_100',
    'dq_m_arrow8', 'dq_m_golem2', 'dq_m_crit60', 'dq_m_flawless5', 'dq_m_kill200',
    'dq_h_nightmare', 'dq_h_curse3', 'dq_h_round20', 'dq_h_fast5'];
  for (const id of NEW) ok(ids.includes(id), `新任务在池：${id}`);

  ok(DQ_POOL.every((t) => t.need > 0), '每条任务的目标 > 0');
  ok(DQ_POOL.every((t) => !!t.metric && !!t.name && !!t.desc), '每条任务都有 metric / 名字 / 描述');

  // metric 必须在 AGG 里有语义，或者走 kT:（否则 dqPump 静默丢弃）
  const AGG_OK = ['sum', 'max'];
  for (const t of DQ_POOL) {
    const m = t.metric.match(/^AGG_KILL:(\w+)$/); // 不存在这种形态，纯防御
    void m;
    const inAgg = new RegExp(`\\b${t.metric.replace(':', '\\:')}:\\s*'(?:sum|max)'`).test(dqSrc)
      || t.metric.startsWith('kT:');
    ok(inAgg, `metric 有累计语义：${t.metric}`);
    void AGG_OK;
  }

  // avail 只出现在箭雨 / 傀儡任务上
  const availIds = DQ_POOL.filter((t) => t.avail).map((t) => t.id).sort().join(',');
  ok(availIds === 'dq_arrow_20,dq_m_arrow8,dq_m_golem2', 'avail 只挂 3 条内容联动任务', availIds);
  ok(dqSrc.includes("const arrowAvail = (p) => !!p.rainGot;"), '箭雨 avail 查 rainGot');
  ok(dqSrc.includes('p.relics && p.relics.puppet'), '傀儡 avail 查 relics.puppet');
}

// ============================================================ 2. avail 门控
sec('2. avail 门控（没解锁的内容任务不出现）');
{
  dqReset();
  const p = profile();
  p.rainGot = false;
  p.relics = { ...(p.relics || {}), puppet: 0 };
  const today = dayKeyOf(new Date());
  // 手工摆一天的任务（绕过抽签，直接测过滤），day 填今天防重掷
  p.dq = { day: today, picked: ['dq_clear_any', 'dq_m_golem2', 'dq_arrow_20', 'dq_m_arrow8'], c: {}, got: {} };
  let got = dqTasks().map((t) => t.id);
  ok(got.join(',') === 'dq_clear_any', '全都没解锁时只剩常驻', got.join(','));

  p.rainGot = true;
  // 注意：dqState 是**原地过滤** picked（不重抽、不存盘），上一步已经把数组剪短了，
  // 这里重摆一遍 —— 也顺便验证了「同一天内解锁不会自动补回」的设计。
  p.dq.picked = ['dq_clear_any', 'dq_m_golem2', 'dq_arrow_20', 'dq_m_arrow8'];
  got = dqTasks().map((t) => t.id);
  ok(got.includes('dq_arrow_20') && got.includes('dq_m_arrow8') && !got.includes('dq_m_golem2'),
    '解锁箭雨后箭雨任务回来、傀儡仍被滤掉', got.join(','));

  p.relics = { ...p.relics, puppet: 1 };
  p.dq.picked = ['dq_clear_any', 'dq_m_golem2', 'dq_arrow_20', 'dq_m_arrow8'];
  got = dqTasks().map((t) => t.id);
  ok(got.length === 4, '买了傀儡术后 4 条全在', got.join(','));

  // avail 在 rollTasks 里就排除（否则新玩家某天会只抽到 4 条）；dqState 只做兜底
  ok(/!DQ_PINNED\.includes\(t\.id\)\s*\n\s*&& \(!t\.avail \|\| t\.avail\(p\)\)/.test(dqSrc),
    'rollTasks 抽签时已按 avail 排除（每天保证满 5 条）');
  dqReset();
}

// ============================================================ 3. 新计数器语义
sec('3. 新计数器 sum / max 语义');
{
  dqReset();
  const d = new Date(2026, 9, 28, 10, 0, 0);
  // 强制摆上覆盖全部新计数器的任务（直接塞 picked，只测 dqPump 本身）
  const p = profile();
  p.dq = {
    day: dayKeyOf(d),
    picked: ['dq_death_2', 'dq_h_nightmare', 'dq_h_curse3', 'dq_h_fast5', 'dq_arrow_20',
      'dq_m_golem2', 'dq_m_crit60', 'dq_m_arrow8'],
    c: {}, got: {},
  };
  dqPump({ deaths: 1 }, d);
  dqPump({ deaths: 1 }, d);
  ok(Number(dqState(d).c.deaths) === 2, 'deaths 是 sum：两次 +1 = 2', String(dqState(d).c.deaths));

  dqPump({ nightmareWins: 1 }, d);
  dqPump({ curse3Wins: 1 }, d);
  dqPump({ fast5: 1 }, d);
  dqPump({ arrowCasts: 3 }, d);
  dqPump({ golemSummons: 2 }, d);
  const c = dqState(d).c;
  ok(Number(c.nightmareWins) === 1 && Number(c.curse3Wins) === 1 && Number(c.fast5) === 1,
    'nightmareWins / curse3Wins / fast5 都能累计');

  dqPump({ critRunMax: 30 }, d);
  dqPump({ critRunMax: 55 }, d);
  dqPump({ critRunMax: 40 }, d);   // 更小的值不该盖掉 55
  ok(Number(dqState(d).c.critRunMax) === 55, 'critRunMax 是 max：30→55→40 取 55', String(dqState(d).c.critRunMax));

  dqPump({ arrowRunMax: 5 }, d);
  dqPump({ arrowRunMax: 9 }, d);
  ok(Number(dqState(d).c.arrowRunMax) === 9, 'arrowRunMax 是 max：5→9 取 9', String(dqState(d).c.arrowRunMax));

  ok(Number(c.arrowCasts) === 3 && Number(c.golemSummons) === 2, 'arrowCasts / golemSummons 是 sum');
  dqReset();
}

// ============================================================ 4. main 埋点接线
sec('4. main.js 埋点接线（源码契约）');
{
  ok(/runArrowCasts \+= 1;[\s\S]{0,80}dqPump\(\{ arrowCasts: 1 \}\)/.test(mainSrc),
    'pressSkill 收口：箭雨真的放出去才 +1 并累计');
  ok(mainSrc.includes("dqPump({ golemSummons: 1 })"),
    'hintChoiceCb：真正召出傀儡才累计');
  ok(mainSrc.includes('runArrowCasts = 0;'), 'resetRunState 会清 runArrowCasts（单局口径）');
  for (const field of ['deaths: isWin ? 0 : 1', 'critRunMax: runCrits', 'arrowRunMax: runArrowCasts',
    'curse3Wins = 1', 'nightmareWins = 1', 'fast5 = 1']) {
    ok(mainSrc.includes(field), `结算 dqRun 喂新指标：${field}`);
  }
  // 噩梦口径：地狱也算（getDifficulty() !== DIFFS.normal）
  ok(/getDifficulty\(\) !== DIFFS\.normal\) dqRun\.nightmareWins/.test(mainSrc),
    'nightmareWins 口径 = 噩梦或地狱（不是 only nightmare）');
  // 诅咒口径：>= 3
  ok(/pendingCurses\.length >= 3\) dqRun\.curse3Wins/.test(mainSrc), 'curse3Wins 口径 = 带 ≥3 条');
}

// ============================================================ 5. 抽签确定性
sec('5. 抽签不受扩容影响（每天 5 条 / 常驻必出 / 同天同批）');
{
  dqReset();
  profile().rainGot = true;   // 打开全池
  const d1 = new Date(2026, 9, 28, 9, 0, 0);
  const d2 = new Date(2026, 9, 28, 21, 0, 0);
  const a = dqTasks(d1).map((t) => t.id);
  const b = dqTasks(d2).map((t) => t.id);
  ok(a.join(',') === b.join(','), '同一天早晚同一批');
  ok(a.length === 5, '每天仍 5 条', String(a.length));
  ok(a.includes('dq_clear_any'), '常驻必出');
  const tiers = a.map((id) => DQ_POOL.find((t) => t.id === id).tier);
  ok(tiers.filter((x) => x === 'easy').length === 3, '简单 3 条', tiers.join(','));
  ok(tiers.filter((x) => x === 'mid').length === 1, '中等 1 条');
  ok(tiers.filter((x) => x === 'hard').length === 1, '困难 1 条');
  // 连续 10 天不重样
  const many = new Set();
  for (let i = 0; i < 10; i++) many.add(dqTasks(new Date(2026, 9, 28 + i, 12, 0, 0)).map((t) => t.id).join(','));
  ok(many.size >= 8, '连着十天至少八天不重样', String(many.size));
  dqReset();
}

// ============================================================ 6. 版本
sec('6. 版本号同步');
{
  for (const f of ['js/dailyQuest.js', 'js/main.js']) {
    const src = readFileSync(f, 'utf8');
    ok(src.includes('?v=' + VER), `${f} 版本 = ${VER}`);
  }
}

console.log(`\n===== block109: ${pass} ok / ${fail} fail =====`);
if (fail) { console.log('FAILED:\n' + fails.map((s) => '  - ' + s).join('\n')); process.exit(1); }
