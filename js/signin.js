// ============================================================
// signin.js —— 每日签到（第 59 块 / 第 105 块改版）
//
// 规则（第 105 块用户定案）：
//   · 以周为大单位、日为小单位：周一 00:00 起新的一周，周日 23:59 收尾；
//   · 每天签到发 **随机 0~100 骨币**（闭区间整数、均匀），一天只算一次；
//   · 一周内累计签到 3 / 5 / 7 天 → +100 骨币 / +150 骨币 / **永夜火种 ×1**
//     （**不要求连续**，断签不清零；这是用户在「真连续」与「周内累计」里选的后者）；
//   · 跨周自动清零 —— 本周攒的进度不带到下周。
//
// 第 7 天给的是「一次抽取永夜火种的机会」，也就是首次通关后那三次三选一的同一种东西：
// 直接调 boons.js 的 grantBoons(1) 写进 profile().boonPending，
// 回标题页（或关掉签到面板）时由 main.js 的 showBoons 接上，关网页也不会丢。
//
// 存在 profile().signin：{ week:'2026-10-19'(本周一日期), days:['2026-10-19',...], got:{3,5,7} }
// 存「本周一的日期」而不是 ISO 周序号：跨年跨月都不会算错，也方便人直接读档。
// got 用「天数 → true」的对象而不是 got3/got5/got7 三个字段：
// 第 105 块里程碑从 2 档变 3 档，写死的字段名每加一档就要改一遍读写两处。
// 老档的 got3 会在 signState 里一次性迁移进 got['3']（3 天 +100 这一档语义没变）。
// 所有奖励只在 signToday() 里发，重复调用当天第二次直接返回 signed。
// ============================================================
import { profile, save, addBones, bones } from './profile.js?v=138';
import { grantBoons } from './boons.js?v=138';

export const SIGN_BONES_MIN = 0;    // 每天签到的最少骨币（真的可能是 0）
export const SIGN_BONES_MAX = 100;  // 每天签到的最多骨币

// 周内累计里程碑（不要求连续）。bones 与 boons 二选一：
//   bones → 直接进骨币（走 addBones）
//   boons → 换一次永夜火种抽取（走 grantBoons，回标题页弹三选一）
export const WEEK_TIERS = [
  { days: 3, bones: 100 },
  { days: 5, bones: 150 },
  { days: 7, boons: 1 },
];
export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const DAY_MS = 86400000;

function pad2(n) { return String(n).padStart(2, '0'); }

// 今天随机的骨币（闭区间 [MIN, MAX] 的整数）。
// rng 可注入 —— 测试要能钉死「0 骨币」和「100 骨币」两个边界。
export function rollSignBones(rng = Math.random) {
  const span = SIGN_BONES_MAX - SIGN_BONES_MIN + 1;
  let r = Number(rng());
  if (!Number.isFinite(r)) r = 0;
  // 归一：外部传 1 / 1.0000001 / 负数都不会越界（Math.random 本身 < 1）
  r = Math.min(0.9999999, Math.max(0, r));
  return SIGN_BONES_MIN + Math.floor(r * span);
}

// 本地时区的「YYYY-MM-DD」
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 本周一 00:00（本地时区）。JS 的 getDay() 是周日=0，先 +6 取模挪成周一=0。
export function weekStartOf(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - wd);
  return t;
}

export function weekKeyOf(d = new Date()) { return dayKey(weekStartOf(d)); }

// 读签到状态（顺带处理跨周清零 + 脏数据过滤 + 老档迁移）。
// 注意：这是**唯一**会对 profile().signin 做结构修正的地方，UI 只读它。
export function signState(now = new Date()) {
  const p = profile();
  if (!p.signin || typeof p.signin !== 'object') {
    p.signin = { week: '', days: [], got: {} };
  }
  const s = p.signin;
  if (!Array.isArray(s.days)) s.days = [];

  // 第 105 块：里程碑记录从 got3/got6 两个字段改成 got 对象。
  // 老档里 got3（3 天 +100）语义没变，直接搬过来；got6（6 天 +200）这一档
  // 已经被「7 天换火种」取代，丢掉 —— 一周只影响一次，跨周反正清零。
  if (!s.got || typeof s.got !== 'object') {
    s.got = {};
    if (s.got3) s.got['3'] = true;
  }
  delete s.got3;
  delete s.got6;

  const wk = weekKeyOf(now);
  if (s.week !== wk) {
    // 跨周（或第一次用）：整条重置，上周的进度不保留
    s.week = wk;
    s.days = [];
    s.got = {};
    save();
  }
  // 防御：只留本周内的日期。改过手机时间 / 存档被手改都会在这里被清掉，
  // 免得「周内天数」虚高导致 3/5/7 天奖励白拿。
  const start = weekStartOf(now).getTime();
  const end = start + 7 * DAY_MS;
  s.days = s.days.filter((k) => {
    const t = new Date(`${k}T00:00:00`).getTime();
    return Number.isFinite(t) && t >= start && t < end;
  });
  return s;
}

// 本周 7 天的格子数据，UI 直接照着画
export function weekCells(now = new Date()) {
  const s = signState(now);
  const start = weekStartOf(now);
  const today = dayKey(now);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const k = dayKey(d);
    out.push({
      name: WEEKDAY_NAMES[i],
      key: k,
      day: d.getDate(),
      signed: s.days.includes(k),
      today: k === today,
      future: d.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    });
  }
  return out;
}

export function signedToday(now = new Date()) {
  return signState(now).days.includes(dayKey(now));
}

// 状态快照：面板头部、按钮文案、里程碑条都读它。
// tiers 是「本周三档 + 各自的 done」，UI 直接遍历 —— 别在 UI 里按天数 hardcode
// 哪个字段对应哪档，第 105 块就是从 2 档扩到 3 档时那样改出来的。
export function signSummary(now = new Date()) {
  const s = signState(now);
  const n = new Set(s.days).size;
  const tiers = WEEK_TIERS.map((t) => ({
    days: t.days,
    bones: t.bones || 0,
    boons: t.boons || 0,
    done: !!s.got[String(t.days)],
  }));
  return {
    week: s.week,
    days: n,
    signedToday: s.days.includes(dayKey(now)),
    tiers,
    // 还差几天到下一档（都拿满了返回 null）
    next: tiers.find((t) => n < t.days) || null,
  };
}

// 今天签到（落账）。返回：
//   { ok:true, days, roll, gained:[{kind,bones|boons,label}], total }   签到成功
//   { ok:false, reason:'signed' }                                      今天已经签过
// gained 里 kind='bones' 的进骨币，kind='boon' 的是一次永夜火种抽取。
export function signToday(now = new Date(), rng = Math.random) {
  const s = signState(now);
  const k = dayKey(now);
  if (s.days.includes(k)) return { ok: false, reason: 'signed', days: s.days.length };

  s.days.push(k);
  const roll = rollSignBones(rng);
  const gained = [{ kind: 'bones', bones: roll, label: '今日签到' }];
  addBones(roll);

  const n = new Set(s.days).size;
  for (const t of WEEK_TIERS) {
    if (n < t.days || s.got[String(t.days)]) continue;
    s.got[String(t.days)] = true;
    const label = `本周累计 ${t.days} 天`;
    if (t.bones) {
      addBones(t.bones);
      gained.push({ kind: 'bones', bones: t.bones, label });
    }
    if (t.boons) {
      // 第 105 块：第 7 天换的是一次永夜火种抽取（写进 boonPending，关网页也不丢）
      grantBoons(t.boons);
      gained.push({ kind: 'boon', boons: t.boons, label });
    }
  }
  save();
  return { ok: true, days: n, roll, gained, total: bones() };
}
