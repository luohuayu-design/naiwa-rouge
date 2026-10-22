// ============================================================
// stats.js —— 属性表与数值计算（主角 / 武器通用）
//
// 三层结构：
//   基础值 base  —— 初始属性（这里就是调平衡的唯一入口）
//   加成 mods    —— 升级/道具/技能带来的加成，分 flat（加法）与 pct（百分比）
//   最终值 get() —— (base + Σflat) × (1 + Σpct)
//
// ⚠️ 第 6 块起**主角与武器是两套完全独立的属性表**：
//   · STAT_DEFS（这个文件）            = 奶蛙自己的生命/近战/机动/经济
//   · WEAPON_STAT_DEFS（weaponStats.js）= 环剑自己的伤害/暴击/元素
//   两套都用这里的 createStats(defs) 造实例，互不影响：
//   主角的攻击力只影响近战普攻，剑的伤害只由剑自己的数值决定。
//   面板按 defs 里的 group 字段分组显示（分页 + 页内分组）。
// ============================================================

// 百分比统一保留 1 位小数（用户要求「所有数值都保留小数」）
export const pct = (v) => (v * 100).toFixed(1) + '%';
// 数值统一 1 位小数：生命 / 攻击力 / 防御 / 金币这类都可能带小数
export const num1 = (v) => v.toFixed(1);

// 主角属性定义：name 显示名、base 初始值、fmt 显示格式、group 面板分组、desc 一句话说明
export const STAT_DEFS = [
  // ---- 生存 ----
  { key: 'maxHp',       name: '生命上限', base: 6,    fmt: num1, group: '生存', desc: '归零即本局失败；伤害按小数扣除' },
  { key: 'hpRegen',     name: '生命回复', base: 0,    fmt: (v) => v.toFixed(1) + '/秒',   group: '生存', desc: '每秒自动恢复的生命' },
  { key: 'armor',       name: '防御',     base: 0,    fmt: num1, group: '生存', desc: '每次挨打实际伤害 = 攻击 − 防御，最少打掉 1 点' },
  // 第 13 块：金钟罩。base 0 用 flat 获得；多拿一层周期缩短（见 main.js 的 AEGIS）。
  { key: 'aegis',       name: '金钟罩',   base: 0,    fmt: (v) => v >= 1 ? `每 ${Math.max(10, 15 - (Math.ceil(v) - 1) * 1.5).toFixed(1)}s 护体 3s` : '—',
    group: '生存', desc: '拥有后进入周期无敌：每 15 秒护体 3 秒、完全不受伤害；多拿一层周期缩短 1.5 秒（最快 10 秒）' },
  // ---- 近战（只作用于主角自己的自动普攻，不影响环剑）----
  { key: 'attack',      name: '攻击力',   base: 1,    fmt: num1, group: '近战', desc: '主角近战命中的基础伤害（环剑不吃这一项）' },
  { key: 'attackRange', name: '攻击范围', base: 2.1,  fmt: (v) => v.toFixed(2),           group: '近战', desc: '近战能打到的最远距离（世界单位）' },
  { key: 'attackSpeed', name: '攻击速度', base: 1.20, fmt: (v) => v.toFixed(2) + ' 次/秒', group: '近战', desc: '每秒自动攻击的次数' },
  { key: 'critRate',    name: '暴击率',   base: 0.00, fmt: pct,   group: '近战', desc: '近战命中时触发暴击的概率（环剑有自己的暴击）' },
  { key: 'critDamage',  name: '暴击伤害', base: 1.50, fmt: pct,   group: '近战', desc: '近战暴击时的伤害倍率' },
  { key: 'lifesteal',   name: '近战吸血', base: 0.00, fmt: pct,   group: '近战', desc: '近战伤害按此比例回血（环剑不吃这一项）' },
  // 第 12 块：一次出手同时拍几只（0 = 只打最近的一只，1 = 打两只不同的怪）。
  // 走 flat 加成（base 0，pct 对 0 无效），卡片「双拍」+1。
  { key: 'multiHit',    name: '同时命中', base: 0,    fmt: (v) => `${Math.round(1 + v)} 只`, group: '近战', desc: '一次出手同时拍中几只不同的怪（最近的先挨打）' },
  // ---- 机动 ----
  { key: 'moveSpeed',   name: '移动速度', base: 4.4,  fmt: (v) => v.toFixed(2),           group: '机动', desc: '每秒移动的世界单位' },
  // ---- 经济 ----
  { key: 'goldRate',    name: '金币掉落率', base: 0.45, fmt: pct,  group: '经济', desc: '每只怪死亡时掉出金币的概率（改造后上限 100%）' },
  // 第 11 块：幸运。不直接加伤害，只改「你能挑到什么东西」——
  // 三选一的高稀有卡权重、商店摆出来的好货比例，都由它放大（见 rarity.js）。
  { key: 'luck',        name: '幸运',     base: 0,    fmt: num1, group: '经济', desc: '每点幸运让三选一更容易出高稀有卡、商店更容易摆出好货' },
];

// 面板分组顺序（按 defs 里 group 首次出现的顺序排，这里只是兜底默认值）
export const PLAYER_GROUPS = ['生存', '近战', '机动', '经济'];


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

// 射程内最近的 count 个（按距离升序）—— 第 12 块「双拍」用它一次挑两只不同的怪。
// 距离相同也无所谓：排序稳定，谁先谁后只影响「先挨打」的顺序，不影响总量。
export function nearestNInRange(from, list, range, count = 1, isAlive = () => true) {
  const out = [];
  for (const it of list) {
    if (!isAlive(it)) continue;
    const d = distance2D(from, it.pos);
    if (d <= range) out.push({ target: it, distance: d });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, Math.max(1, Math.round(count)));
}

// 防御减伤（第 33 块改版）：**实际伤害 = 攻击 − 防御**，最少也要打掉 1 点。
// 旧的「防御 /(100+防御)」百分比公式被替换 —— 现在防御是实打实的减法，
// 每一点防御都把每一次受击砍掉一点伤害，堆叠收益是线性的。
// 抽成独立函数导出：主角近战、环剑、元素伤害都用同一套减伤公式
export function mitigate(raw, armor) {
  if (raw <= 0) return 0;
  return Math.max(1, raw - Math.max(0, armor));
}

// defs 可以换成武器自己的属性表（weaponStats.js），逻辑完全一样
export function createStats(defs = STAT_DEFS) {
  const base = {};
  const mods = new Map();   // key -> [{ flat, pct, src }]
  for (const d of defs) {
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

  // 预演一个加成「如果加上去会变成多少」，不改任何状态。
  // 公式与 get() 完全一致，所以三选一面板上显示的数字就是选完的真实数字。
  function preview(key, { flat = 0, pct: p = 0 } = {}) {
    const b = base[key] ?? 0;
    let f = 0, pp = 0;
    for (const m of mods.get(key) || []) {
      f += m.flat || 0;
      pp += m.pct || 0;
    }
    const v = (b + f + flat) * (1 + pp + p);
    return v < 0 ? 0 : v;
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
  // 说明：减伤逻辑用文件顶部的 mitigate()，实例上也挂一份，老调用照旧
  const mitigateFn = mitigate;

  // 一次命中的伤害：暴击判定 → 暴击倍率 → 目标防御减伤
  // rng 可注入，方便测试固定暴击结果
  function rollDamage({ targetArmor = 0, rng = Math.random } = {}) {
    const crit = rng() < get('critRate');
    const raw = get('attack') * (crit ? get('critDamage') : 1);
    return { damage: mitigateFn(raw, targetArmor), crit };
  }

  // ---------------- 存档续玩（第 17 块） ----------------
  // 把全部加成导出成普通数组（JSON 可存），读档时重放 —— src 保留，
  // 所以 clearRoundBuffs / removeBySource 这类按来源清除的逻辑照常工作。
  function dumpMods() {
    const out = [];
    for (const [key, list] of mods) {
      for (const m of list) out.push({ stat: key, flat: m.flat || 0, pct: m.pct || 0, src: m.src || '' });
    }
    return out;
  }

  function loadMods(list, hpCur) {
    for (const arr of mods.values()) arr.length = 0;
    for (const m of list || []) addMod(m);
    if (hpCur != null) hp.cur = Math.max(0, Number(hpCur) || 0);
    clampHp();
  }

  // 面板/日志用的快照（text 统一为字符串，避免数字/字符串混用）
  function snapshot() {
    return defs.map((d) => ({ ...d, value: get(d.key), text: String(d.fmt(get(d.key))) }));
  }

  // 按 group 分组返回（面板分页渲染用）：[{ group, rows: [{...def, value, text}] }]
  function grouped() {
    const out = [];
    const idx = new Map();
    for (const d of defs) {
      const g = d.group || '其他';
      if (!idx.has(g)) { idx.set(g, out.length); out.push({ group: g, rows: [] }); }
      out[idx.get(g)].rows.push({ ...d, value: get(d.key), text: String(d.fmt(get(d.key))) });
    }
    return out;
  }

  return {
    base, get, addMod, removeBySource, preview,
    hp, heal, damage, syncHp, clampHp,
    mitigate: mitigateFn, rollDamage, snapshot, grouped,
    dumpMods, loadMods,
    defs,
    // 近战判定入口：主角自动攻击时直接调用
    distanceTo: distance2D,
    inAttackRange(from, to) { return inRange2D(from, to, get('attackRange')); },
    findTarget(from, list, isAlive) { return nearestInRange(from, list, get('attackRange'), isAlive); },
    // 一次出手的全部目标（最近的在最前）；count 一般传 1 + multiHit
    findTargets(from, list, count, isAlive) {
      return nearestNInRange(from, list, get('attackRange'), count, isAlive);
    },
  };
}
