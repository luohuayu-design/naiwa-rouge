// 第 59 块 Node 契约测试：每日签到（周为单位）
// 覆盖：默认态 / 单日签到 / 重复签到 / 3 天与 6 天里程碑 / 跨周清零 /
//       脏数据过滤 / 一周封顶 / 七格与「今天」标记
import { profile, resetAll, bones } from './js/profile.js?v=72';
import {
  SIGN_BONES, WEEK_TIERS, SIGN_BONES as SB, weekCells, signSummary,
  signToday, signedToday, signState, weekKeyOf, weekStartOf, dayKey,
} from './js/signin.js?v=72';

// localStorage 桩（profile.js 只在函数体内访问它）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function fresh() { store.clear(); resetAll(); }
const D = (s) => new Date(`${s}T10:00:00`);   // 当天上午 10 点（本地时区）

// 0) 常量与周计算
console.log('[0] 常量 / 周起点');
{
  ok(SIGN_BONES === 20, '每天签到 20 骨币', SIGN_BONES);
  ok(WEEK_TIERS.length === 2 && WEEK_TIERS[0].days === 3 && WEEK_TIERS[0].bones === 100
    && WEEK_TIERS[1].days === 6 && WEEK_TIERS[1].bones === 200, '3 天 100 / 6 天 200');
  ok(dayKey(weekStartOf(D('2026-10-23'))) === '2026-10-19', '周五 → 本周一是 10-19', dayKey(weekStartOf(D('2026-10-23'))));
  ok(dayKey(weekStartOf(D('2026-10-19'))) === '2026-10-19', '周一 → 本周一是自己');
  ok(dayKey(weekStartOf(D('2026-10-25'))) === '2026-10-19', '周日 → 本周一还是 10-19');
  ok(dayKey(weekStartOf(D('2026-10-26'))) === '2026-10-26', '下周一 → 换周');
  ok(weekKeyOf(D('2026-10-25')) === '2026-10-19', '周日属于上一周');
  // 跨年：2027-01-01 是周五 → 本周一 2026-12-28
  ok(dayKey(weekStartOf(D('2027-01-01'))) === '2026-12-28', '跨年周起点不错', dayKey(weekStartOf(D('2027-01-01'))));
}

// 1) 默认态
console.log('[1] 默认态');
{
  fresh();
  const s = signSummary(D('2026-10-21'));
  ok(s.days === 0 && s.signedToday === false, '本周 0 天、今天未签');
  ok(s.got3 === false && s.got6 === false, '两个里程碑都没领');
  ok(bones() === 0, '骨币 0');
  const cells = weekCells(D('2026-10-21'));
  ok(cells.length === 7, '七格', cells.length);
  ok(cells[0].name === '周一' && cells[6].name === '周日', '周一到周日');
  ok(cells[0].day === 19 && cells[6].day === 25, '日期对上 19~25');
  ok(cells[2].today === true && cells.filter((c) => c.today).length === 1, '只有今天带 today 标记');
  ok(cells[3].future === true && cells[1].future === false, '周三之后算 future');
}

// 2) 单日签到
console.log('[2] 单日签到');
{
  fresh();
  const r = signToday(D('2026-10-21'));
  ok(r.ok === true && r.days === 1, '签到成功、本周 1 天');
  ok(bones() === 20, '拿到 20 骨币', bones());
  ok(r.gained.length === 1 && r.gained[0].bones === 20, '只发了基础 20');
  ok(signedToday(D('2026-10-21')) === true, '今天已签');
  ok(signedToday(D('2026-10-22')) === false, '明天还没签');
  ok(weekCells(D('2026-10-21'))[2].signed === true, '周三格子打勾');
}

// 3) 同一天重复签到（不能刷）
console.log('[3] 重复签到');
{
  fresh();
  signToday(D('2026-10-21'));
  const r2 = signToday(D('2026-10-21'));
  ok(r2.ok === false && r2.reason === 'signed', '第二次拒绝');
  ok(bones() === 20, '骨币没变', bones());
  // 同一天不同时刻也算同一天
  ok(signToday(new Date('2026-10-21T23:59:00')).ok === false, '当天 23:59 还是同一天');
}

// 4) 里程碑：3 天 +100、6 天 +200
console.log('[4] 里程碑');
{
  fresh();
  signToday(D('2026-10-19'));
  signToday(D('2026-10-20'));
  ok(bones() === 40, '两天 40 骨币', bones());
  const r3 = signToday(D('2026-10-21'));
  ok(r3.ok && r3.days === 3, '第三天签上');
  ok(bones() === 160, '第 3 天：20×3 + 100 = 160', bones());
  ok(r3.gained.some((g) => g.bones === 100), '反馈里包含 100');
  const s3 = signSummary(D('2026-10-21'));
  ok(s3.got3 === true && s3.got6 === false, 'got3 置真、got6 还假');

  // 第 4、5 天只拿 20
  signToday(D('2026-10-22'));
  signToday(D('2026-10-23'));
  ok(bones() === 200, '第 5 天：160 + 40 = 200', bones());

  // 第 6 天再补 200
  const r6 = signToday(D('2026-10-24'));
  ok(bones() === 420, '第 6 天：200 + 20 + 200 = 420', bones());
  ok(r6.gained.some((g) => g.bones === 200), '反馈里包含 200');

  // 第 7 天不再有额外奖励
  const r7 = signToday(D('2026-10-25'));
  ok(bones() === 440, '第 7 天只 +20 = 440', bones());
  ok(r7.gained.length === 1, '第 7 天只有基础奖励');
}

// 5) 断签不清零（周内累计，不要求连续）
console.log('[5] 断签');
{
  fresh();
  signToday(D('2026-10-19'));
  signToday(D('2026-10-21'));   // 跳过周二
  const r = signToday(D('2026-10-24'));
  ok(r.days === 3 && bones() === 160, '断签也能凑满 3 天拿 100', `${r.days}/${bones()}`);
}

// 6) 跨周清零
console.log('[6] 跨周清零');
{
  fresh();
  signToday(D('2026-10-23'));   // 周五
  signToday(D('2026-10-24'));
  ok(bones() === 40, '本周两条 40');
  // 下周一：进度清零，但骨币不退
  const s = signSummary(D('2026-10-26'));
  ok(s.days === 0, '新一周天数从 0 开始', s.days);
  ok(s.week === '2026-10-26', 'week 键换成本周一', s.week);
  ok(bones() === 40, '骨币保留', bones());
  const r = signToday(D('2026-10-26'));
  ok(r.ok && r.days === 1, '新一周可以重新签');
  ok(bones() === 60, '新一周第一天 +20', bones());
  // 上周的 3 天进度也没有带过来
  const s2 = signSummary(D('2026-10-26'));
  ok(s2.got3 === false, '里程碑也重置');
}

// 7) 脏数据过滤（存档里混进上周日期）
console.log('[7] 脏数据');
{
  fresh();
  const p = profile();
  p.signin = { week: weekKeyOf(D('2026-10-21')), days: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-20'], got3: false, got6: false };
  const s = signState(D('2026-10-21'));
  ok(s.days.length === 1 && s.days[0] === '2026-10-20', '上周的 3 条被滤掉，只剩本周的 1 条', JSON.stringify(s.days));
  // 同一天写了两遍也只算一天
  p.signin = { week: weekKeyOf(D('2026-10-21')), days: ['2026-10-20', '2026-10-20'], got3: false, got6: false };
  ok(signSummary(D('2026-10-21')).days === 1, '重复日期去重');
}

// 8) 面板/按钮读的是同一份状态
console.log('[8] 状态一致性');
{
  fresh();
  signToday(D('2026-10-22'));
  const a = signSummary(D('2026-10-22'));
  const b = signSummary(D('2026-10-22'));
  ok(a.days === b.days && a.signedToday === b.signedToday, '两次读一致');
  ok(a.next && a.next.days === 3, 'next 指向 3 天档', JSON.stringify(a.next));
  signToday(D('2026-10-23'));
  signToday(D('2026-10-24'));
  const c = signSummary(D('2026-10-24'));
  ok(c.next && c.next.days === 6, '3 天领完之后 next 指向 6 天档', JSON.stringify(c.next));
  signToday(D('2026-10-25'));
  signToday(D('2026-10-20'));   // 回头补周二
  const d = signSummary(D('2026-10-25'));
  ok(d.days === 5, '回头补一天也算（周内任意顺序）', d.days);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
