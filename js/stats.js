// ============================================================
// stats.js —— 主角属性表与数值计算
//
// 三层结构：
//   基础值 base  —— 奶蛙的初始属性（这里就是调平衡的唯一入口）
//   加成 mods    —— 升级/道具/技能带来的加成，分 flat（加法）与 pct（百分比）
//   最终值 get() —— (base + Σflat) × (1 + Σpct)
//
// 战斗系统还没做，但减伤公式与暴击判定已经在这里定好，
// 第 2 块直接调 rollDamage() 即可，不用再改属性逻辑。
// ============================================================

const pct = (v) => (v * 100).toFixed(0) + '%';

// 属性定义：name 显示名、base 初始值、fmt 显示格式、desc 面板里的一句话说明
export const STAT_DEFS = [
  { key: 'maxHp',       name: '生命上限', base: 6,    fmt: (v) => String(Math.round(v)),  desc: '归零即本局失败；受到伤害按整数扣' },
  { key: 'hpRegen',     name: '生命回复', base: 0,    fmt: (v) => v.toFixed(1) + '/秒',   desc: '每秒自动恢复的生命' },
  { key: 'moveSpeed',   name: '移动速度', base: 4.4,  fmt: (v) => v.toFixed(2),           desc: '每秒移动的世界单位' },
  { key: 'armor',       name: '防御',     base: 0,    fmt: (v) => String(Math.round(v)),  desc: '减伤率 = 防御 /(100 + 防御)' },
  { key: 'attack',      name: '攻击力',   base: 1,    fmt: (v) => String(Math.round(v)),  desc: '每次近战命中的基础伤害' },
  { key: 'attackRange', name: '攻击范围', base: 2.1,  fmt: (v) => v.toFixed(2),           desc: '近战能打到的最远距离（世界单位）' },
  { key: 'attackSpeed', name: '攻击速度', base: 1.20, fmt: (v) => v.toFixed(2) + ' 次/秒', desc: '每秒自动攻击的次数' },
  { key: 'critRate',    name: '暴击率',   base: 0.00, fmt: pct,                            desc: '命中时触发暴击的概率' },
  { key: 'critDamage',  name: '暴击伤害', base: 1.50, fmt: (v) => (v * 100).toFixed(0) + '%', desc: '暴击时的伤害倍率' },
  { key: 'lifesteal',   name: '吸血',     base: 0.00, fmt: pct,                            desc: '造成伤害按此比例回血' },
];

// ------------------------------------------------------------
// 距离：攻击范围判定、索敌都用这一组。
// 参数都是 { x, z }（Vector3 直接传进来也行），只算水平面距离，
// 不考虑高度 —— 角色和怪物都在地面上，Y 轴不参与手感。
// ------------------------------------------------------------
export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function inRange2D(a, b, range) {
  return distance2D(a, b) <= range;
}

// 在候选列表里找「射程内、距离最近」的一个，没找到返回 null。
// 幸存者类自动索敌就是这一句，主角与远程怪共用。
export function nearestInRange(from, list, range, isAlive = () => true) {
  let best = null;
  let bestD = Infinity;
  for (const it of list) {
    if (!isAlive(it)) continue;
    const d = distance2D(from, it.pos);
    if (d <= range && d < bestD) { bestD = d; best = it; }
  }
  return best ? { target: best, distance: bestD } : null;
}

export function createStats() {
  const base = {};
  const mods = new Map();   // key -> [{ flat, pct, src }]
  for (const d of STAT_DEFS) {
    base[d.key] = d.base;
    mods.set(d.key, []);
  }

  // 最终值：(base + Σflat) × (1 + Σpct)，下限 0（移速等不能为负）
  function get(key) {
    const b = base[key] ?? 0;
    let flat = 0, p = 0;
    for (const m of mods.get(key) || []) {
      flat += m.flat || 0;
      p += m.pct || 0;
    }
    const v = (b + flat) * (1 + p);
    return v < 0 ? 0 : v;
  }

  // 加成：stat 属性 key，flat 加法，pct 百分比（0.1 = +10%），src 来源标识（便于整批撤销）
  // ⚠️ 百分比是「乘在 (base + flat) 上」的，所以 base 为 0 的属性（暴击率、吸血、防御…）
  //    用 pct 不会生效 —— 这类属性一律用 flat 加绝对值。
  function addMod({ stat, flat = 0, pct: p = 0, src = '' }) {
    if (!mods.has(stat)) return;
    mods.get(stat).push({ flat, pct: p, src });
  }

  // 撤销某个来源的全部加成（升级重选、buff 到期用）
  function removeBySource(src) {
    for (const list of mods.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].src === src) list.splice(i, 1);
      }
    }
  }

  // ---------------- 生命值 ----------------
  const hp = { cur: 0 };
  hp.cur = get('maxHp');   // 初始满血

  function clampHp() {
    const max = get('maxHp');
    if (hp.cur > max) hp.cur = max;
    if (hp.cur < 0) hp.cur = 0;
    return max;
  }

  function heal(amount) {
    hp.cur = Math.min(get('maxHp'), hp.cur + Math.max(0, amount));
    return hp.cur;
  }

  // 受伤：先按防御减伤，再扣血。返回实际扣掉的血量（0 = 没破防）
  function damage(raw) {
    const taken = mitigate(raw, get('armor'));
    hp.cur = Math.max(0, hp.cur - taken);
    return taken;
  }

  // 每次调用 maxHp 变化后同步一次（升级加血上限时用）
  function syncHp(grow = 0) {
    hp.cur = Math.min(get('maxHp'), hp.cur + grow);
    clampHp();
  }

  // ---------------- 战斗用的纯函数 ----------------
  // 防御减伤：100 防御 = 50% 减伤，永远打不到 0，也不会为负
  function mitigate(raw, armor) {
    if (raw <= 0) return 0;
    return raw * 100 / (100 + Math.max(0, armor));
  }

  // 一次命中的伤害：暴击判定 → 暴击倍率 → 目标防御减伤
  // rng 可注入，方便测试固定暴击结果
  function rollDamage({ targetArmor = 0, rng = Math.random } = {}) {
    const crit = rng() < get('critRate');
    const raw = get('attack') * (crit ? get('critDamage') : 1);
    return { damage: mitigate(raw, targetArmor), crit };
  }

  // 面板/日志用的快照（text 统一为字符串，避免数字/字符串混用）
  function snapshot() {
    return STAT_DEFS.map((d) => ({ ...d, value: get(d.key), text: String(d.fmt(get(d.key))) }));
  }

  return {
    base, get, addMod, removeBySource,
    hp, heal, damage, syncHp, clampHp,
    mitigate, rollDamage, snapshot,
    defs: STAT_DEFS,
    // 近战判定入口：主角自动攻击时直接调用
    distanceTo: distance2D,
    inAttackRange(from, to) { return inRange2D(from, to, get('attackRange')); },
    findTarget(from, list, isAlive) { return nearestInRange(from, list, get('attackRange'), isAlive); },
  };
}
