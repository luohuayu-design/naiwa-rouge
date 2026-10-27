// 第 59 块 Node 契约测试：每日签到（周为单位）
// ⚠️ 第 105 块改版后重写：固定 +20 → 随机 0~100；里程碑 3/6 天 → 3/5/7 天
//    （100 骨币 / 150 骨币 / 一次永夜火种）。下面的断言全部按新规则。
// 覆盖：默认态 / 随机边界与范围 / 单日签到 / 重复签到 / 三档里程碑 /
//       7 天换火种 / 断签不清零 / 跨周清零 / 老档迁移 / 脏数据过滤 / 七格标记
import fs from 'node:fs';

// localStorage 桩（profile.js 只在函数体内访问它）—— 必须在 import 之前装好
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// 版本号从 index.html 读，不写死：写死的话每次发版都要来改这一行；
// 而且一旦和模块内部的 ?v= 不一致，profile.js 会被当成两个模块各加载一次
// （骨币读写打在不同对象上，症状是「签到没加骨币」）。
const VER = (fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  .match(/main\.js\?v=(\d+)/) || [])[1] || '';
const { profile, resetAll, bones } = await import('./js/profile.js?v=' + VER);
const signMod = await import('./js/signin.js?v=' + VER);
const { boonPending } = await import('./js/boons.js?v=' + VER);
const {
  SIGN_BONES_MIN, SIGN_BONES_MAX, WEEK_TIERS, rollSignBones,
  weekCells, signSummary, signToday, signedToday, signState, weekKeyOf, weekStartOf, dayKey,
} = signMod;

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function fresh() { store.clear(); resetAll(); }
const D = (s) => new Date(`${s}T10:00:00`);   // 当天上午 10 点（本地时区）
const R0 = () => 0;          // 随机到 0 骨币
const R50 = () => 0.5;       // floor(0.5×101)=50
const RMAX = () => 0.999999; // 100

// 0) 常量
console.log('[0] 常量');
{
  ok(SIGN_BONES_MIN === 0 && SIGN_BONES_MAX === 100, '每日随机区间 0~100', `${SIGN_BONES_MIN}~${SIGN_BONES_MAX}`);
  ok(WEEK_TIERS.length === 3, '三档里程碑', String(WEEK_TIERS.length));
  ok(WEEK_TIERS[0].days === 3 && WEEK_TIERS[0].bones === 100, '3 天 → 100 骨币');
  ok(WEEK_TIERS[1].days === 5 && WEEK_TIERS[1].bones === 150, '5 天 → 150 骨币');
  ok(WEEK_TIERS[2].days === 7 && WEEK_TIERS[2].boons === 1 && !WEEK_TIERS[2].bones,
    '7 天 → 一次永夜火种（不再给骨币）', JSON.stringify(WEEK_TIERS[2]));
  ok(!('SIGN_BONES' in signMod), '旧的固定 20 常量已经删掉（别再长回来）');
  ok(dayKey(weekStartOf(D('2026-10-23'))) === '2026-10-19', '周五 → 本周一是 10-19');
  ok(dayKey(weekStartOf(D('2026-10-26'))) === '2026-10-26', '下周一 → 换周');
  ok(dayKey(weekStartOf(D('2027-01-01'))) === '2026-12-28', '跨年周起点不错');
}

// 1) 随机函数本身
console.log('[1] 随机 0~100');
{
  ok(rollSignBones(R0) === 0, 'rng=0 → 0', String(rollSignBones(R0)));
  ok(rollSignBones(RMAX) === 100, 'rng→1 → 100', String(rollSignBones(RMAX)));
  ok(rollSignBones(() => 1) === 100, 'rng=1 不越界', String(rollSignBones(() => 1)));
  ok(rollSignBones(() => -3) === 0, 'rng 负数不越界', String(rollSignBones(() => -3)));
  ok(rollSignBones(() => NaN) === 0, 'rng 脏值按 0 处理', String(rollSignBones(() => NaN)));
  // 全区间都能走到、且都是整数（每个整数取它区间中点，101 个值逐个打出来）
  const seen = new Set();
  for (let i = 0; i < 101; i++) seen.add(rollSignBones(() => (i + 0.5) / 101));
  ok(seen.size === 101 && [...seen].every((v) => Number.isInteger(v) && v >= 0 && v <= 100),
    '101 个取值全部落在 0~100 且为整数', String(seen.size));
  // 均匀性粗检（真随机 20000 次）：均值应贴着 50，且两端都能出现
  let sum = 0, lo = 0, hi = 0;
  for (let i = 0; i < 20000; i++) {
    const v = rollSignBones(Math.random);
    sum += v;
    if (v === 0) lo++;
    if (v === 100) hi++;
  }
  const avg = sum / 20000;
  ok(avg > 46 && avg < 54, '均值 ≈ 50（均匀）', avg.toFixed(2));
  ok(lo > 0 && hi > 0, '0 和 100 都真的会出现', `0:${lo} 100:${hi}`);
}

// 2) 默认态
console.log('[2] 默认态');
{
  fresh();
  const s = signSummary(D('2026-10-21'));
  ok(s.days === 0 && s.signedToday === false, '本周 0 天、今天未签');
  ok(s.tiers.length === 3 && s.tiers.every((t) => t.done === false), '三档都没领');
  ok(s.next && s.next.days === 3, 'next 指向 3 天档');
  ok(bones() === 0 && boonPending() === 0, '骨币 0、没有欠着的火种');
  const cells = weekCells(D('2026-10-21'));
  ok(cells.length === 7 && cells[0].name === '周一' && cells[6].name === '周日', '七格周一到周日');
  ok(cells[0].day === 19 && cells[6].day === 25, '日期对上 19~25');
  ok(cells[2].today === true && cells.filter((c) => c.today).length === 1, '只有今天带 today 标记');
}

// 3) 单日签到（随机值真的落账）
console.log('[3] 单日签到');
{
  fresh();
  const r = signToday(D('2026-10-21'), R50);
  ok(r.ok === true && r.days === 1, '签到成功、本周 1 天');
  ok(r.roll === 50, '这次随机到 50', String(r.roll));
  ok(bones() === 50, '骨币 +50（跟着随机值走）', String(bones()));
  ok(r.gained.length === 1 && r.gained[0].kind === 'bones' && r.gained[0].bones === 50, '只发了今日那一份');
  ok(signedToday(D('2026-10-21')) === true, '今天已签');
  ok(signedToday(D('2026-10-22')) === false, '明天还没签');
  ok(weekCells(D('2026-10-21'))[2].signed === true, '周三格子打勾');
}

// 4) 同一天重复签到（不能刷）
console.log('[4] 重复签到');
{
  fresh();
  signToday(D('2026-10-21'), R50);
  const r2 = signToday(D('2026-10-21'), R50);
  ok(r2.ok === false && r2.reason === 'signed', '第二次拒绝');
  ok(bones() === 50, '骨币没变', String(bones()));
  ok(signToday(new Date('2026-10-21T23:59:00'), R50).ok === false, '当天 23:59 还是同一天');
}

// 5) 三档里程碑（3 天 100 / 5 天 150 / 7 天火种）
console.log('[5] 里程碑');
{
  fresh();
  // 全程 rng=0 → 每天 0 骨币，骨币余额就是里程碑发出的量，读起来最干净
  signToday(D('2026-10-19'), R0);
  signToday(D('2026-10-20'), R0);
  ok(bones() === 0, '前两天全是 0 骨币（随机到 0 也算签到成功）', String(bones()));
  const r3 = signToday(D('2026-10-21'), R0);
  ok(r3.ok && r3.days === 3, '第三天签上');
  ok(bones() === 100, '第 3 天：+100 骨币', String(bones()));
  ok(r3.gained.some((g) => g.kind === 'bones' && g.bones === 100), '反馈里包含 +100');
  ok(signSummary(D('2026-10-21')).tiers[0].done === true, '3 天档置「已领」');

  signToday(D('2026-10-22'), R0);
  ok(bones() === 100, '第 4 天只发随机值（这里 0）', String(bones()));
  const r5 = signToday(D('2026-10-23'), R0);
  ok(bones() === 250, '第 5 天：+150 = 250', String(bones()));
  ok(r5.gained.some((g) => g.kind === 'bones' && g.bones === 150), '反馈里包含 +150');

  signToday(D('2026-10-24'), R0);
  const r7 = signToday(D('2026-10-25'), R0);
  ok(r7.ok && r7.days === 7, '第 7 天签上');
  ok(bones() === 250, '第 7 天不再给骨币（还是 250）', String(bones()));
  ok(boonPending() === 1, '换到 1 次永夜火种抽取', String(boonPending()));
  const boonLine = r7.gained.find((g) => g.kind === 'boon');
  ok(!!boonLine && boonLine.boons === 1, '反馈里有「火种 ×1」这一条', JSON.stringify(r7.gained));
  ok(signSummary(D('2026-10-25')).tiers.every((t) => t.done === true), '三档全部已领');
  ok(signSummary(D('2026-10-25')).next === null, '没有下一档了');
  // 同一天再签一次不会多给火种
  signToday(D('2026-10-25'), R0);
  ok(boonPending() === 1, '重复签到不会刷出第二次火种');
}

// 6) 断签不清零（周内累计，不要求连续）
console.log('[6] 断签');
{
  fresh();
  signToday(D('2026-10-19'), R0);   // 周一
  signToday(D('2026-10-21'), R0);   // 跳过周二
  const r = signToday(D('2026-10-24'), R0);
  ok(r.days === 3 && bones() === 100, '断签也能凑满 3 天拿 100', `${r.days}/${bones()}`);
}

// 7) 跨周清零（火种已经领到的不会退）
console.log('[7] 跨周清零');
{
  fresh();
  for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
    '2026-10-24', '2026-10-25']) signToday(D(d), R0);
  ok(boonPending() === 1 && bones() === 250, '满周：250 骨币 + 1 次火种', `${bones()}/${boonPending()}`);
  const s = signSummary(D('2026-10-26'));
  ok(s.days === 0, '新一周天数从 0 开始', String(s.days));
  ok(s.week === '2026-10-26', 'week 键换成本周一', s.week);
  ok(s.tiers.every((t) => !t.done), '里程碑也重置');
  ok(bones() === 250 && boonPending() === 1, '骨币与火种都不退', `${bones()}/${boonPending()}`);
  const r = signToday(D('2026-10-26'), R50);
  ok(r.ok && r.days === 1 && bones() === 300, '新一周能重新签（+50）', String(bones()));
}

// 8) 老档迁移：got3 → got['3']，got6 丢掉
console.log('[8] 老档迁移');
{
  fresh();
  const p = profile();
  p.signin = { week: weekKeyOf(D('2026-10-21')), days: ['2026-10-19', '2026-10-20', '2026-10-21'], got3: true, got6: false };
  const s = signState(D('2026-10-21'));
  ok(s.got && s.got['3'] === true, '旧的 got3 搬进 got 对象', JSON.stringify(s.got));
  ok(!('got3' in s) && !('got6' in s), '旧字段被清掉（不再读写它们）');
  ok(signSummary(D('2026-10-21')).tiers[0].done === true, '迁移后 3 天档仍显示已领');
  // 已签 3 天且 got3 已领 → 再签到不该重复发 100
  const b0 = bones();
  signToday(D('2026-10-21'), R0);
  ok(bones() === b0, '迁移不会导致重复发奖', `${b0} → ${bones()}`);
}

// 9) 脏数据过滤
console.log('[9] 脏数据');
{
  fresh();
  const p = profile();
  p.signin = { week: weekKeyOf(D('2026-10-21')), days: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-20'], got: {} };
  const s = signState(D('2026-10-21'));
  ok(s.days.length === 1 && s.days[0] === '2026-10-20', '上周的 3 条被滤掉，只剩本周 1 条', JSON.stringify(s.days));
  p.signin = { week: weekKeyOf(D('2026-10-21')), days: ['2026-10-20', '2026-10-20'], got: {} };
  ok(signSummary(D('2026-10-21')).days === 1, '重复日期去重');
  // got 是脏值（字符串）时兜底成对象，别让 UI 崩
  p.signin = { week: weekKeyOf(D('2026-10-21')), days: [], got: 'x' };
  ok(typeof signState(D('2026-10-21')).got === 'object', 'got 脏值兜底成对象');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
