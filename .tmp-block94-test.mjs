// 第 94 块契约（纯 Node，不起浏览器）
//   ① 盲盒涨价曲线 5% → 3%
//   ② 盲盒奖池概率（三个匣子各自合计 100%，且与开箱判定顺序一致）
//   ③ 成就：八类 × 三档骨币，67 条，每条都有合法分类 / 档位 / prog
//   ④ 每日任务：简 3（含常驻）+ 中 1 + 难 1，日期哈希抽签，sum / max 语义
//   ⑤ 十个 FXYXGG01~10 礼包码，每个 3000 骨币
//   ⑥ 版本号同步
// 跑法：node .tmp-block94-test.mjs
import { readFileSync, existsSync } from 'node:fs';

import {
  BOXES, BOX_BY_ID, BOX_PRICE_STEP, boxCost, boxPoolEntries,
} from './js/metaShop.js';
import {
  ACHS, ACH_CATS, ACH_TIERS, ACH_COUNT, achById, achsByCat, achTier,
  achPending, achPendingBones, achClaim, achClaimAll, achClaimed, achMigrate,
} from './js/achievements.js';
import {
  DQ_TIERS, DQ_BONES, DQ_PINNED, DQ_POOL, dqTasks, dqPump, dqClaim, dqClaimAll,
  dqPending, dqGained, dqMsLeft, dayKeyOf, dqTier, dqTaskName, dqState, dqReset,
} from './js/dailyQuest.js';
import { codeHash, GIFT_COUNT, normalizeCode } from './js/gift.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const metaSrc = readFileSync('js/metaShop.js', 'utf8');
const idxSrc = readFileSync('index.html', 'utf8');
const achSrc = readFileSync('js/achievements.js', 'utf8');
const dqSrc = readFileSync('js/dailyQuest.js', 'utf8');

// ⚠️ profile 必须**带同一个 ?v= 导入**：achievements.js 里是 './profile.js?v=N'，
//    Node 会把带查询串和不带查询串当成两个不同模块（两份独立的 cache），
//    不带的话这里 unlockAch 解锁的成就、achPending 一个都看不到。
const { unlockAch, hasAch, bones, addBones, profile } = await import('./js/profile.js?v=' + (idxSrc.match(/\?v=(\d+)/) || [, '0'])[1]);

// ============================================================ 1. 盲盒降价
sec('1. 盲盒涨价曲线 5% → 3%（首价 +3%/次）');
ok(BOX_PRICE_STEP === 0.03, 'BOX_PRICE_STEP = 0.03', String(BOX_PRICE_STEP));
// 用户定的价目表：木匣 30→39→48→57；银匣 100→130→160；金匣 280→364→448
const TABLE = {
  wood: [[0, 30], [10, 39], [20, 48], [30, 57]],
  silver: [[0, 100], [10, 130], [20, 160]],
  gold: [[0, 280], [10, 364], [20, 448]],
};
for (const [id, rows] of Object.entries(TABLE)) {
  for (const [nth, want] of rows) {
    const got = boxCost(id, nth);
    ok(got === want, `${id} 第 ${nth} 次 = ${want} 骨币`, String(got));
  }
}
// 单调 + 每次涨幅递减？不，是线性：每 10 次涨 30%
{
  const a = boxCost('wood', 0), b = boxCost('wood', 1);
  ok(b >= a, '买过一次后价格不降（单调不减）', `${a} -> ${b}`);
  ok(boxCost('wood', 100) > boxCost('wood', 99), '第 100 次仍单调不减');
}
// 注释里的价目表也跟着改了（不然下一个人照着注释改回去）
ok(/木匣 30 → 第\s*10\s*次\s*39 → 第\s*20\s*次\s*48 → 第\s*30\s*次\s*57/.test(metaSrc),
  'metaShop.js 注释里的价目表改成 +3% 那一档');
ok(/银匣 100 → 第\s*10\s*次\s*130/.test(metaSrc), '注释里银匣价目表同步');
ok(/金匣 280 → 第\s*10\s*次\s*364/.test(metaSrc), '注释里金匣价目表同步');
ok(/6% → 5%。第 94 块再降到 \*\*3%\*\*/.test(metaSrc), '注释里写清了这次的改动（6%→5%→3%）');
ok(!/6% → 5%。第 94 块再降到 \*\*5%\*\*/.test(metaSrc), '注释里没有残留的 5%');
ok(/\+3% 首价/.test(idxSrc), 'index.html 里给玩家看的那句也改成 +3% 首价');
ok(!/\+5% 首价/.test(idxSrc), 'index.html 里没有残留的 +5% 首价');
// 三种各自独立计数：这条是结构性的（boxBought 按 id 存），只验入口存在
ok(/BOX_PRICE_STEP/.test(metaSrc), 'BOX_PRICE_STEP 是导出的唯一真相源');

// ============================================================ 2. 奖池概率
sec('2. 奖池概率（三个匣子各自合计 100%）');
for (const box of BOXES) {
  const e = boxPoolEntries(box.id);
  ok(!!e, `${box.name} 能取到奖池`);
  if (!e) continue;
  ok(near(e.sum, 1, 1e-9), `${box.name}：所有条目概率合计 = 100%`, (e.sum * 100).toFixed(4) + '%');

  const sumBy = (k) => e.rows.filter((r) => r.kind === k).reduce((a, r) => a + r.pct, 0);
  // 负面（诅咒）那一支必须正好是 box.curse —— 这就是开箱判定里第一个掷的骰子
  ok(near(sumBy('neg'), box.curse, 1e-9),
    `${box.name}：诅咒条目合计 = 诅咒率 ${(box.curse * 100).toFixed(0)}%`, (sumBy('neg') * 100).toFixed(3) + '%');
  // 稀有一支 = (1-curse) * specialW（木匣没有稀有）
  const wantRare = box.special ? (1 - box.curse) * box.specialW : 0;
  ok(near(sumBy('rare'), wantRare, 1e-9),
    `${box.name}：稀有条目合计 = ${(wantRare * 100).toFixed(2)}%`, (sumBy('rare') * 100).toFixed(3) + '%');
  // 正面一支 = (1-curse) * (1-specialW)
  const wantPos = (1 - box.curse) * (1 - box.special ? 1 : 1) * (box.special ? (1 - box.specialW) : 1);
  ok(near(sumBy('pos'), wantPos, 1e-9),
    `${box.name}：正面条目合计 = ${(wantPos * 100).toFixed(2)}%`, (sumBy('pos') * 100).toFixed(3) + '%');

  if (box.special) {
    const rares = e.rows.filter((r) => r.kind === 'rare');
    ok(rares.length === 2, `${box.name}：稀有分成两条（永久法器 / 技能CD）`, String(rares.length));
    ok(near(rares[0].pct, rares[1].pct, 1e-9), `${box.name}：两条稀有各占一半`, rares.map((r) => r.pct.toFixed(4)).join(' / '));
  } else {
    ok(e.rows.filter((r) => r.kind === 'rare').length === 0, '木匣没有稀有条目（不出法器）');
  }
  ok(e.rows.every((r) => ['pos', 'neg', 'rare'].includes(r.kind)), `${box.name}：条目类型只有三种`);
  ok(e.rows.every((r) => r.pct > 0), `${box.name}：没有 0% 的条目（画出来是噪音）`);
  ok(e.rows.filter((r) => r.kind === 'pos').length >= 5, `${box.name}：正面条目够多（≥5）`);
  ok(e.rows.every((r) => !!r.name && !!r.icon), `${box.name}：每条都有名字和图标`);
}
// 三个匣子的稀有率递增、诅咒率递减（贵的更值）
ok(BOX_BY_ID.gold.specialW > BOX_BY_ID.silver.specialW, '金匣的稀有率比银匣高');
ok(BOX_BY_ID.gold.curse < BOX_BY_ID.silver.curse && BOX_BY_ID.silver.curse < BOX_BY_ID.wood.curse,
  '越贵的箱子诅咒率越低');

// ============================================================ 3. 成就
sec('3. 成就（八类 × 三档）');
// 第 106 块：67 → 106（删掉「一线生机」+ 补 40 条）
ok(ACH_COUNT === 118, `共 118 条成就（第 113 块删「电光石火」、第 114 块 +4 条、第 116 块 +4 条）`, String(ACH_COUNT));
ok(ACHS.length === ACH_COUNT, 'ACHS 长度与 ACH_COUNT 一致');
ok(ACH_CATS.length === 8, '八个类别', String(ACH_CATS.length));
{
  const ids = ACHS.map((a) => a.id);
  ok(new Set(ids).size === ids.length, '成就 id 不重复');
  const catIds = new Set(ACH_CATS.map((c) => c.id));
  ok(ACHS.every((a) => catIds.has(a.cat)), '每条成就都归属一个存在的类别');
  ok(ACHS.every((a) => [0, 1, 2].includes(a.tier)), '每条成就的档位是 0 / 1 / 2');
  ok(ACHS.every((a) => !!a.name && !!a.desc && !!a.icon), '每条成就都有名字 / 描述 / 图标');
  for (const c of ACH_CATS) {
    const n = achsByCat(c.id).length;
    ok(n >= 3, `类别「${c.name}」至少 3 条（空组不该出现在面板上）`, String(n));
  }
  // 八个类别加起来 = 总数（没有漏网的成就）
  const sum = ACH_CATS.reduce((a, c) => a + achsByCat(c.id).length, 0);
  ok(sum === ACH_COUNT, '八类条目数之和 = 总数（没有成就落在类别之外）', String(sum));
}
sec('3b. 三档骨币');
ok(ACH_TIERS.length === 3, '三档');
ok(ACH_TIERS[0].bones === 30 && ACH_TIERS[1].bones === 60 && ACH_TIERS[2].bones === 120,
  '克制档：寻常 30 / 不易 60 / 罕见 120', ACH_TIERS.map((t) => t.bones).join('/'));
ok(achTier(0).bones === 30 && achTier(1).bones === 60 && achTier(2).bones === 120, 'achTier() 取得到档位');
ok(achTier(9).bones === 30, 'achTier 对越界档位回退到第一档（不会发 NaN 骨币）');
{
  const byTier = [0, 1, 2].map((t) => ACHS.filter((a) => a.tier === t).length);
  ok(byTier.every((n) => n >= 10), '三档都够多（没有哪一档只有孤零零几条）', byTier.join('/'));
  // 第 106 块：106 条里「不易」最多（22/55/29）。这里只钉「罕见不是最多」——
  // 「罕见比寻常多」是第 106 块补的那 40 条里有大量中后期目标造成的，不是档位写反。
  ok(byTier[2] <= byTier[1],
    '罕见档不是最多（档位真的代表难度）', byTier.join('/'));
  // 全清一共发多少骨币 —— 这是平衡口径，改档位会跟着变，必须钉住
  const totalBones = ACHS.reduce((a, x) => a + achTier(x.tier).bones, 0);
  ok(totalBones === 8280, `118 条全清共 ${totalBones} 骨币（约 29 个金匣，克制档）`, String(totalBones));
  ok(totalBones / 280 < 30, '全清骨币不到 30 个金匣（不会把盲盒那套成本平衡冲掉）',
    (totalBones / 280).toFixed(1));
}
sec('3c. prog 数据源合法');
{
  // 第 106 块：加了 story（夜行记忆读过几夜）/ camp（九簇篝火等级和）/ swords（元素剑图鉴）
  const KINDS = ['stat', 'enemy', 'events', 'meta', 'enemies', 'story', 'camp', 'swords'];
  const bad = ACHS.filter((a) => a.prog && !KINDS.includes(a.prog.k));
  ok(bad.length === 0, '所有 prog.k 都在 main.js 认得的八种里', bad.map((a) => a.id + ':' + a.prog.k).join(','));
  const noNeed = ACHS.filter((a) => a.prog && !(a.prog.need > 0));
  ok(noNeed.length === 0, '带 prog 的都有 need > 0（不然进度条 0 除）', noNeed.map((a) => a.id).join(','));
  const withProg = ACHS.filter((a) => a.prog).length;
  ok(withProg >= 20, '至少 20 条有真实进度条（不是全靠描述）', String(withProg));
  ok(achById('kills_500') && achById('kills_500').desc.includes('500'), 'achById 取得到条目');
  ok(!achById('nope_nope'), 'achById 对不存在的 id 返回 undefined');
}
sec('3d. 图标文件都在');
for (const c of ACH_CATS) {
  ok(existsSync(c.icon), `类别图标存在：${c.icon}`);
}
ok(existsSync('assets/icons/bone.svg'), '骨币图标存在');

// ============================================================ 3c/3d. 成就领奖
sec('3c. 成就骨币改成手动领（第 94-2 块：解锁 ≠ 发钱）');
{
  const p = profile();
  p.ach = {}; p.achGot = {}; p.bones = 0;
  ok(achPending().length === 0, '什么都没解锁时没有待领');
  ok(achClaim('first_blood').reason === 'locked', '没解锁的领不了');
  ok(achClaim('zzz_no_such').reason === 'nope', '不存在的成就 id 领不了');

  unlockAch('first_blood');                 // tier 0 = 30
  ok(hasAch('first_blood'), '解锁记下来了');
  ok(achPending().length === 1, '解锁后出现在待领里（tab 红点读这个）', String(achPending().length));
  ok(achPendingBones() === 30, '待领合计 30 骨币', String(achPendingBones()));
  ok(bones() === 0, '★ 解锁那一刻**不发**骨币（改成手动领了）', String(bones()));

  const r = achClaim('first_blood');
  ok(r.ok && r.bones === 30, '点「领取」拿到 30', JSON.stringify(r));
  ok(bones() === 30, '骨币真的到账了', String(bones()));
  ok(achClaimed('first_blood'), '标记为已领');
  ok(achClaim('first_blood').reason === 'got', '同一条不能领第二次（防刷）');
  ok(achPending().length === 0, '领完就不在待领里了（红点灭）', String(achPending().length));

  // 一键领取：三档各来一条
  unlockAch('kills_100');      // 30
  unlockAch('kills_500');      // 60
  unlockAch('kills_1500');     // 120
  ok(achPending().length === 3, '三条待领', String(achPending().length));
  ok(achPendingBones() === 210, '待领合计 30+60+120 = 210', String(achPendingBones()));
  const all = achClaimAll();
  ok(all.length === 3, '一键领走三条', String(all.length));
  ok(bones() === 30 + 210, '骨币合计正确', String(bones()));
  ok(achPending().length === 0, '领干净了');
  ok(achClaimAll().length === 0, '再点一键领取是空操作');
}

sec('3d. 老用户补发（v=105 之前成就不发骨币）');
{
  // 模拟老存档：ach 里一堆解锁记录，achGot 是空的（老存档根本没有这个键）
  const p = profile();
  p.ach = {}; p.achGot = {}; p.achMigrated = 0; p.bones = 0;
  unlockAch('first_blood');
  unlockAch('kills_500');
  ok(achPending().length === 2, '老存档「解锁过 + achGot 空」= 两条待补（补发不用搬数据）',
    String(achPending().length));
  ok(achPendingBones() === 90, '补发面额 30 + 60', String(achPendingBones()));

  const n1 = achMigrate();
  ok(n1 === 2, '第一次跑 achMigrate 报出 2 条待补', String(n1));
  ok(achMigrate() === 0, '第二次跑返回 0（闸门只开一次，不会每次进标题页都弹提示）');
  ok(achPending().length === 2, '★ 闸门本身不消费待领 —— 补发也要玩家自己点');
  ok(bones() === 0, '补发不是自动打款，还是要点');

  achClaimAll();
  ok(bones() === 90, '老用户一键补发到手 90 骨币', String(bones()));
  ok(achPending().length === 0, '补完就没有待领了');
}

// ============================================================ 4. 每日任务
sec('4. 每日任务');
{
  const ids = DQ_POOL.map((t) => t.id);
  ok(new Set(ids).size === ids.length, '任务 id 不重复');
  ok(DQ_TIERS.length === 3, '三档难度');
  ok(DQ_TIERS[0].bones === 30 && DQ_TIERS[1].bones === 80 && DQ_TIERS[2].bones === 150,
    '简单 30 / 中等 80 / 困难 150', DQ_TIERS.map((t) => t.bones).join('/'));
  ok(DQ_BONES.easy === 30 && DQ_BONES.mid === 80 && DQ_BONES.hard === 150, 'DQ_BONES 与 DQ_TIERS 一致');
  for (const t of DQ_TIERS) ok(existsSync(t.icon), `档位图标存在：${t.icon}`);

  const n = { easy: 0, mid: 0, hard: 0 };
  for (const t of DQ_POOL) n[t.tier]++;
  ok(n.easy >= 4, `简单池够大（抽 2 条不会重复）· ${n.easy} 条`, String(n.easy));
  ok(n.mid >= 4, `中等池够大 · ${n.mid} 条`, String(n.mid));
  ok(n.hard >= 4, `困难池够大 · ${n.hard} 条`, String(n.hard));
  ok(DQ_POOL.every((t) => t.need > 0), '每条任务的目标 > 0');
  ok(DQ_POOL.every((t) => !!t.metric && !!t.name && !!t.desc), '每条任务都有 metric / 名字 / 描述');
  // 常驻那条：每天都在简单任务里
  ok(DQ_PINNED.length === 1 && DQ_PINNED[0] === 'dq_clear_any', '常驻只有「完整通过任一关卡」一条');
  const pin = DQ_POOL.find((t) => t.id === 'dq_clear_any');
  ok(!!pin && pin.tier === 'easy', '常驻那条是简单档');
  ok(pin.metric === 'wins' && pin.need === 1, '常驻那条 = 通关 1 次');
  ok(DQ_POOL.some((t) => t.metric === 'kT:minion'), '池子里有「击倒 10 只骷髅小兵」（用户点名要的那条）');
}
sec('4b. 抽签（日期哈希，同一天刷新十次还是这一批）');
dqReset();
{
  const d1 = new Date(2026, 9, 27, 10, 0, 0);
  const d2 = new Date(2026, 9, 27, 22, 30, 0);
  const a = dqTasks(d1).map((t) => t.id);
  const b = dqTasks(d2).map((t) => t.id);
  ok(a.join(',') === b.join(','), '同一天早晚两次抽到同一批任务', `${a} vs ${b}`);

  const e = dqTasks(new Date(2026, 9, 28, 10, 0, 0)).map((t) => t.id);
  ok(e.join(',') !== a.join(','), '换一天换一批', `${a} vs ${e}`);

  for (const ids of [a, e]) {
    ok(ids.length === 5, `每天 5 条（简 3 + 中 1 + 难 1），实得 ${ids.length}`);
    ok(ids.includes('dq_clear_any'), '常驻那条每天都出');
    const tiers = ids.map((id) => DQ_POOL.find((t) => t.id === id).tier);
    ok(tiers.filter((x) => x === 'easy').length === 3, '简单 3 条', tiers.join(','));
    ok(tiers.filter((x) => x === 'mid').length === 1, '中等 1 条', tiers.join(','));
    ok(tiers.filter((x) => x === 'hard').length === 1, '困难 1 条', tiers.join(','));
    ok(new Set(ids).size === 5, '五条互不重复');
  }
  // 连续 7 天不会抽到一模一样的组合（哈希得真的在动）
  const week = [];
  for (let i = 0; i < 7; i++) week.push(dqTasks(new Date(2026, 9, 27 + i, 12, 0, 0)).map((t) => t.id).join(','));
  ok(new Set(week).size >= 6, '连着七天至少六天不重样', String(new Set(week).size));
}
sec('4c. 进度累计（sum / max 语义）');
dqReset();
{
  const d = new Date(2026, 9, 27, 10, 0, 0);
  const base = dqTasks(d);
  const killTask = base.find((t) => t.def.metric === 'kills');
  const maxTask = base.find((t) => t.def.metric === 'roundMax');
  // 第 109 块池子扩到 39 后，这一天抽到的组合不保证含 kills / roundMax ——
  // 放宽成「五条里至少一条的 metric 有 AGG 语义」（kT: 开头的按 sum 算）
  const hasCounter = base.some((t) => t.def.metric.startsWith('kT:')
    || /:\s*'(sum|max)'/.test(dqSrc.match(new RegExp(`\\b${t.def.metric.replace(':', '\\:')}:\\s*'(sum|max)'`))?.[0] || ''));
  ok(!!killTask || !!maxTask || hasCounter, '这一天的池子里有可测的计数器');

  // sum：一天内累计（杀两波各 1 只 = 2）
  dqPump({ kills: 1 }, d);
  dqPump({ kills: 1 }, d);
  ok(Number(dqState(d).c.kills) === 2, 'sum 语义：两次 +1 = 2', String(dqState(d).c.kills));

  // max：取单局最高（先打 15 回合，再打 8 回合，仍是 15）
  dqPump({ roundMax: 15 }, d);
  dqPump({ roundMax: 8 }, d);
  ok(Number(dqState(d).c.roundMax) === 15, 'max 语义：后来打得更差不回退', String(dqState(d).c.roundMax));

  // 未知键不写（防手滑把 'kill' 当 'kills'）
  const before = JSON.stringify(dqState(d).c);
  dqPump({ kill: 99, nope: 5 }, d);
  ok(JSON.stringify(dqState(d).c) === before, '不在 AGG 表里的键直接忽略（写错键不会污染存档）');
  dqPump({ 'kT:minion': 3 }, d);
  ok(Number(dqState(d).c['kT:minion']) === 3, '按怪种计数（kT:minion）走 sum', String(dqState(d).c['kT:minion']));
}
sec('4d. 达成 / 领取');
dqReset();
{
  const d = new Date(2026, 9, 27, 10, 0, 0);
  const b0 = dqGained(d);
  ok(b0 === 0, '今天还没领过', String(b0));

  const hits = dqPump({ wins: 1 }, d);      // 通关 → 常驻那条达成
  ok(hits.includes('dq_clear_any'), '开通关 1 次 → 「完整通过任一关卡」达成', hits.join(','));

  const st = dqTasks(d);
  const cl = st.find((t) => t.id === 'dq_clear_any');
  ok(cl.done && cl.cur === 1, '面板上这条显示 1 / 1 且已达成', `${cl.cur}/${cl.need} done=${cl.done}`);
  ok(!cl.got, '还没领');
  ok(dqPending(d) === 1, '有一条可领（tab 上的红点看这个）', String(dqPending(d)));

  const r1 = dqClaim('dq_clear_any', d);
  ok(r1.ok && r1.bones === 30, '领到 30 骨币（简单档）', JSON.stringify(r1));
  ok(dqGained(d) === 30, '今天已领 30', String(dqGained(d)));
  ok(dqClaim('dq_clear_any', d).reason === 'got', '同一条不能领第二次');
  ok(dqPending(d) === 0, '领完就没有可领的了');
  ok(dqTasks(d).find((t) => t.id === 'dq_clear_any').got, '面板上这条标记为已领');

  // 没达成不许领
  const hard = dqTasks(d).find((t) => t.tier === 'hard');
  ok(dqClaim(hard.id, d).reason === 'notdone', `没达成的领不了（${hard.id}）`);
  ok(dqClaim('nope_task', d).reason === 'notdone', '不存在的任务 id 领不了');

  // 一键领取只领已达成的
  const mid = dqTasks(d).find((t) => t.tier === 'mid');
  dqPump({ [mid.def.metric]: mid.need }, d);
  const all = dqClaimAll(d);
  ok(all.length === 1 && all[0].id === mid.id, '一键领取只收已达成且没领过的', JSON.stringify(all));
  ok(dqGained(d) === 30 + DQ_BONES[mid.tier], '一键领取后今日已领累加正确', String(dqGained(d)));
}
sec('4e. 跨天重掷');
dqReset();
{
  const d1 = new Date(2026, 9, 27, 23, 59, 0);
  const d2 = new Date(2026, 9, 28, 0, 5, 0);
  dqPump({ wins: 1 }, d1);
  ok(Number(dqState(d1).c.wins) === 1, '第一天记下了 1 次通关');
  const s2 = dqState(d2);
  ok(s2.day === '2026-10-28', 'day 键跟着日期变', s2.day);
  ok(Object.keys(s2.c).length === 0, '跨天计数器清零（换一批任务，进度不继承）');
  ok(s2.picked.length === 5, '跨天后重新抽了 5 条', String(s2.picked.length));
  ok(Object.keys(s2.got).length === 0, '没领的奖励不保留（跨天作废）');
  ok(dqMsLeft(d1) < 61000, '倒计时：23:59 距 0 点不到 61 秒', String(dqMsLeft(d1)));
  ok(dqMsLeft(d2) > 23 * 3600 * 1000, '倒计时：0:05 距明天还有 23 小时多', String(dqMsLeft(d2)));
  ok(dayKeyOf(new Date(2026, 0, 5, 9, 0)) === '2026-01-05', 'dayKeyOf 补零正确', dayKeyOf(new Date(2026, 0, 5, 9, 0)));
  ok(dqTier('mid').bones === 80, 'dqTier 取得到档位');
  ok(dqTaskName('dq_clear_any') === '完整通过任一关卡', 'dqTaskName 取得到任务名');
  ok(dqTaskName('zzz') === 'zzz', 'dqTaskName 对未知 id 回退成 id 本身');
}
dqReset();

// ============================================================ 5. 礼包码
sec('5. 十个夜行礼包码（FXYXGG01 ~ FXYXGG10，各 3000 骨币）');
{
  const want = [];
  for (let i = 1; i <= 10; i++) want.push('FXYXGG' + String(i).padStart(2, '0'));
  const src = readFileSync('js/gift.js', 'utf8');
  for (const code of want) {
    const h = codeHash(normalizeCode(code));
    const line = src.split('\n').find((l) => l.includes(`'${h}'`));
    ok(!!line, `${code} 的哈希在码表里`, h);
    if (line) {
      const m = line.match(/\['([0-9a-f]{16})',\s*(\d+)/);
      ok(!!m && Number(m[2]) === 3000, `${code} = 3000 骨币`, m ? m[2] : '?');
      ok(/3000 骨币/.test(src), '注释里写明面额 3000');
    }
  }
  const n3000 = (src.match(/, 3000, '夜行礼包'/g) || []).length;
  ok(n3000 === 10, '正好 10 条 3000 骨币的夜行礼包', String(n3000));
  ok(GIFT_COUNT === 51, '码表总数 51（老码 40 条 + 第 94 块新增 10 条 + 第 101 块建群大典 1 条）', String(GIFT_COUNT));
  // 十个码的哈希互不重复（不然只算一个）
  const hs = want.map((c) => codeHash(normalizeCode(c)));
  ok(new Set(hs).size === 10, '十个码的哈希互不重复', String(new Set(hs).size));
}

// ============================================================ 6. 版本号
sec('6. 版本号');
{
  const m = idxSrc.match(/\?v=(\d+)/);
  ok(!!m, 'index.html 里能读到版本号');
  const V = m ? m[1] : '?';
  ok(Number(V) >= 105, `版本号 >= 105（第 94 块 bump 到 105），实读 v=${V}`);
  const files = ['main.js', 'metaShop.js', 'achievements.js', 'dailyQuest.js', 'accordion.js', 'gift.js', 'profile.js'];
  for (const f of files) {
    const s = readFileSync('js/' + f, 'utf8');
    const vs = [...s.matchAll(/\?v=(\d+)/g)].map((x) => x[1]);
    ok(vs.every((x) => x === V), `${f} 内部 import 版本与 index.html 一致（v=${V}）`, vs.filter((x) => x !== V).join(','));
  }
  // 新模块必须从外面带上版本号，不然 SW 会拿旧缓存给它（第 80 块的坑）
  const mn = readFileSync('js/main.js', 'utf8');
  for (const f of ['accordion.js', 'achievements.js', 'dailyQuest.js']) {
    ok(new RegExp(`\\./${f}\\?v=${V}`).test(mn), `main.js import ./${f} 带 ?v=${V}（SW 缓存优先的前提）`);
  }
}

// ============================================================ 7. index.html 结构
sec('7. 主页三面板结构');
{
  for (const id of ['ttPaneMain', 'ttPaneQuest', 'ttPaneAch', 'ttTabMain', 'ttTabQuest', 'ttTabAch',
    'tabDotQuest', 'tabAchN', 'qpList', 'qpBones', 'qpDate', 'qpLeft', 'qpFoot', 'qpAll',
    'acRoot', 'acProg', 'acFill', 'acBones', 'boxPoolRoot',
    // 第 94-2 块：成就改成手动领 —— 红点 / 一键领取 / 说明行
    'tabDotAch', 'acSub2', 'acAll', 'acFoot']) {
    ok(idxSrc.includes(`id="${id}"`), `index.html 里有 #${id}`);
  }
  ok(/class="tt-pane on" id="ttPaneMain"/.test(idxSrc), '默认落在主页面那一格');
  ok(/class="tt-tab on" id="ttTabMain"/.test(idxSrc), '默认亮着「主页面」那个 tab');
  const css = readFileSync('style.css', 'utf8');
  // 第 65 / 66 块的血泪：只淡出的东西仍然吃点击
  ok(/\.tt-pane\{[^}]*visibility:hidden/.test(css), '收起的面板是 visibility:hidden（不是只 opacity:0）');
  ok(/\.ac-bd\{[^}]*visibility:hidden/.test(css), '收起的手风琴分组也是 visibility:hidden');
  // 老 WebView 兼容线（和 sw.js 同一条）：展开动画只能用 max-height
  const bd = (css.match(/\.ac-bd\{[^}]*\}/) || [''])[0];
  const bdOpen = (css.match(/\.ac-sec\.open \.ac-bd\{[^}]*\}/) || [''])[0];
  ok(/max-height:0/.test(bd) && /max-height:\d+px/.test(bdOpen),
    '手风琴展开动画用 max-height（不是要 Chrome 107+ 的 grid-template-rows）');
  ok(/max-height/.test(bd) && !/grid-template-rows/.test(bd + bdOpen), '.ac-bd 里没有 grid-template-rows');
  ok(/\.ac-pl\.pos/.test(css) && /\.ac-pl\.neg/.test(css) && /\.ac-pl\.rare/.test(css),
    '奖池条目三种类型三种颜色');
  // 领过骨币的才压暗（原来是「解锁就压暗」，手动领之后这条不对了）
  ok(/\.ac-it\.got\{[^}]*opacity/.test(css), '领过骨币的成就条目会压暗（.ac-it.got）');
  ok(/\.ac-it-btn/.test(css), '成就条目上的领取按钮有样式');
}

// ============================================================ 7b. 手动领取的接线
sec('7b. 成就手动领取（第 94-2 块：解锁 ≠ 发钱）');
{
  const mn = readFileSync('js/main.js', 'utf8');
  // tryAch 的函数体里**不能**再出现 addBones —— 解锁那一刻只该记解锁
  const i = mn.indexOf('function tryAch(id) {');
  ok(i > 0, 'main.js 里能定位到 tryAch');
  const body = i > 0 ? mn.slice(i, mn.indexOf('\n  }', i)) : '';
  ok(body.includes('unlockAch(id)'), 'tryAch 里写解锁');
  ok(!/addBones/.test(body), '★ tryAch 里没有 addBones（骨币改成手动领了）',
    (body.match(/addBones[^\n]*/) || [''])[0]);
  ok(/回标题页领/.test(body), 'toast 提示玩家回标题页领，而不是说「+N 骨币」');

  // 三个接线点
  ok(/achPending\(\)/.test(mn) && /tabDotAch/.test(mn), 'tab 红点读 achPending()');
  ok(/achClaim\(id\)/.test(mn) && /achClaimAll\(\)/.test(mn), '单条领取与一键领取都接上了');
  ok(/runAchMigrate\(\)/.test(mn), '回标题页跑一次老用户补发闸门');
  ok(/achMigrate/.test(mn) && /老用户补发/.test(mn), '补发这件事在代码里有名字（不是隐式行为）');

  // profile 里两张表分开存
  const pf = readFileSync('js/profile.js', 'utf8');
  ok(/achGot: \{\}/.test(pf), 'profile 有 achGot（领过骨币的记录）');
  ok(/achMigrated/.test(pf), 'profile 有 achMigrated 闸门字段');
  ok(/export function markAchGot/.test(pf), 'profile 导出 markAchGot');
}
console.log(`\n${'='.repeat(52)}`);
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (fails.length) {
  console.log('\n  失败清单：');
  for (const f of fails) console.log('   - ' + f);
}
process.exit(fail ? 1 : 0);
