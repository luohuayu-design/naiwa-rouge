// ============================================================
// signin.js —— 每日签到（第 59 块）
//
// 规则（用户定案）：
//   · 以周为大单位、日为小单位：周一 00:00 起新的一周，周日 23:59 收尾；
//   · 每天签到 +20 骨币，一天只算一次；
//   · 一周内累计签到 3 天 +100，累计 6 天 +200（**不要求连续**，断签不清零）；
//   · 跨周自动清零 —— 本周攒的 3/6 天进度不带到下周。
//
// 存在 profile().signin：{ week:'2026-10-19'(本周一日期), days:['2026-10-19',...], got3, got6 }
// 存「本周一的日期」而不是 ISO 周序号：跨年跨月都不会算错，也方便人直接读档。
// 所有奖励只在 signToday() 里发，重复调用当天第二次直接返回 signed。
// ============================================================
import { profile, save, addBones, bones } from './profile.js?v=111';

export const SIGN_BONES = 20;                 // 每天签到的基础骨币
export const WEEK_TIERS = [                   // 周内累计里程碑（不要求连续）
  { days: 3, bones: 100 },
  { days: 6, bones: 200 },
];
export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const DAY_MS = 86400000;

function pad2(n) { return String(n).padStart(2, '0'); }

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

// 读签到状态（顺带处理跨周清零 + 脏数据过滤）。
// 注意：这是**唯一**会对 profile().signin 做结构修正的地方，UI 只读它。
export function signState(now = new Date()) {
  const p = profile();
  if (!p.signin || typeof p.signin !== 'object') {
    p.signin = { week: '', days: [], got3: false, got6: false };
  }
  const s = p.signin;
  if (!Array.isArray(s.days)) s.days = [];
  const wk = weekKeyOf(now);
  if (s.week !== wk) {
    // 跨周（或第一次用）：整条重置，上周的进度不保留
    s.week = wk;
    s.days = [];
    s.got3 = false;
    s.got6 = false;
    save();
  }
  // 防御：只留本周内的日期。改过手机时间 / 存档被手改都会在这里被清掉，
  // 免得「周内天数」虚高导致 3/6 天奖励白拿。
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

// 状态快照：面板头部、按钮文案、里程碑条都读它
export function signSummary(now = new Date()) {
  const s = signState(now);
  const n = new Set(s.days).size;
  return {
    week: s.week,
    days: n,
    signedToday: s.days.includes(dayKey(now)),
    got3: !!s.got3,
    got6: !!s.got6,
    // 还差几天到下一档（都拿满了返回 0）
    next: WEEK_TIERS.find((t) => n < t.days && !(t.days === 3 ? s.got3 : s.got6)) || null,
  };
}

// 今天签到（落账）。返回：
//   { ok:true, days, gained:[{bones,label}], total }        签到成功
//   { ok:false, reason:'signed' }                           今天已经签过
export function signToday(now = new Date()) {
  const s = signState(now);
  const k = dayKey(now);
  if (s.days.includes(k)) return { ok: false, reason: 'signed', days: s.days.length };

  s.days.push(k);
  const gained = [{ bones: SIGN_BONES, label: '今日签到' }];
  addBones(SIGN_BONES);

  const n = new Set(s.days).size;
  if (n >= 3 && !s.got3) {
    s.got3 = true;
    addBones(WEEK_TIERS[0].bones);
    gained.push({ bones: WEEK_TIERS[0].bones, label: '本周累计 3 天' });
  }
  if (n >= 6 && !s.got6) {
    s.got6 = true;
    addBones(WEEK_TIERS[1].bones);
    gained.push({ bones: WEEK_TIERS[1].bones, label: '本周累计 6 天' });
  }
  save();
  return { ok: true, days: n, gained, total: bones() };
}
