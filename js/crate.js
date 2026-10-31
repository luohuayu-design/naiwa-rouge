// ============================================================
// crate.js —— 第 19 件法器「空箱子」（第 130 块，第十七关专属）
//
// 钟楼顶那口钟底下的空木箱。它只有一件事，但有两个口子：
//
//   ① 自动装箱（被动）：每隔 7 / 6 / 5 秒（按等级），把身边 6 格内**最近的一只怪**
//      收进箱子。被收走的怪从场上消失、打不到、也不动（enemy.js 的 box()）。
//   ② 倒箱（装满时自动）：箱子能装 1 / 2 / 3 只。装满的那一秒「哗」地倒出来 ——
//      箱里的怪被倒在主角脚边（2.0~2.6 格的环上），每只：
//        · 摔掉自己 25% / 30% / 35% 的最大生命
//        · 被木屑定住 0.9 秒（普通冻结，不是钟声，所以铜壳也会被钉住）
//        · 落点砸出 2.2 格的一圈木箱冲击，把周围的怪也砸一下
//      这就是「攒着再打」：先把烦人的几只收走，清完身边的，再让箱子把它们摔回来。
//
//   ③ 装箱（主动技能，键位 F）：朝身边 5 格范围一次收走最多 3 只（按距离由近到远），
//      收满就直接倒箱。冷却 26 秒（法器三级 20 秒）。它是「手动攒」的口子 ——
//      自动装箱只装一只，这个能一口气把围你的三只全收进来。
//
// 为什么箱子会跟着你走：它被主角拎在手里（悬在身后半步，木箱带铜箍）。
// 装了东西会晃、装满会亮 —— 不看技能栏也能知道箱子满没满。
//
// 骨架照 pencil.js / ringlight.js：等级 / 卡 / 商店两件买断各有独立通道，
// 临时属性 mod 全带 src（这里没有玩家属性），到期 / reset 必须撤掉。
// 唯一要小心的：reset / 换关时**先把箱里的怪放出来**（unbox），否则它们会
// 以 visible=false 的状态留到下一关（clearField 就是为了这件事）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=147';

export const CRATE_BASE = {
  cd: [26.0, 23.0, 20.0],      // 装箱技能冷却
  autoRange: 6.0,              // 自动装箱的索敌半径
  castRange: 5.0,              // 手动装箱的索敌半径
  castCount: 3,                // 手动一次最多收几只
  capOf: [1, 2, 3],            // 箱子容量（按法器等级）
  intervalOf: [7.0, 6.0, 5.0], // 自动装箱间隔（按法器等级）
  impactR: 2.2,                // 倒箱落点的冲击半径
  impactDmg: [1.5, 2.1, 2.8],  // 落点冲击伤害（按法器等级）
  fallPct: [0.25, 0.30, 0.35], // 被倒出来的怪摔掉多少最大生命（按法器等级）
  stun: 0.9,                   // 倒出来的怪被定住的秒数
  dropRadius: [2.0, 2.6],      // 倒出来时散在主角脚边的半径范围
  lidTime: 0.55,               // 倒箱时箱盖翻开的动画时长
};

// 木箱外观：厚木板 + 两道铜箍 + 一条麻绳，盖子绕后沿翻开。
// 不用 glb：这只是一只箱子，程序化几何既省一次下载，也和场上的木箱道具同一路。
const WOOD = 0x6b4b2e;
const WOOD_DARK = 0x4b3320;
const BRASS = 0xb08d4a;

export function createCrateSystem({ scene, fx, enemies, onCast, onDump }) {
  const mods = { interval: 0, cap: 0, impact: 0, range: 0, fall: 0, cdCut: 0 };
  const shop = { lid: false, rope: false };
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0, coin: 0 };
  let serial = 0;
  let autoT = 0;          // 自动装箱的节拍
  let lidT = 0;           // 箱盖翻开的剩余动画时间
  let lastFail = '';
  const records = [];     // 箱子里的怪：[{ e }]

  // ---------------- 外观 ----------------
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const bodyMat = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.92, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 1.0, metalness: 0.02 });
  const brassMat = new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.55, metalness: 0.55 });

  // 箱体：四面木板围起来（不封顶，方便「倒」的时候看得出是空的）
  const plankGeo = new THREE.BoxGeometry(0.94, 0.62, 0.06);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(plankGeo, bodyMat);
    const a = (i / 4) * Math.PI * 2;
    p.position.set(Math.sin(a) * 0.47, 0.31, Math.cos(a) * 0.47);
    p.rotation.y = a;
    p.castShadow = true;
    root.add(p);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.94), darkMat);
  floor.position.y = 0.03;
  root.add(floor);

  // 两道铜箍：一圈薄薄的方环（四面各一条），比箱子略大一点点
  const strapGeo = new THREE.BoxGeometry(0.98, 0.07, 0.05);
  for (const y of [0.10, 0.52]) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(strapGeo, brassMat);
      const a = (i / 4) * Math.PI * 2;
      s.position.set(Math.sin(a) * 0.48, y, Math.cos(a) * 0.48);
      s.rotation.y = a;
      root.add(s);
    }
  }

  // 箱盖：绕后沿（-Z 边）翻开
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.62, -0.47);
  root.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.07, 0.98), bodyMat);
  lid.position.set(0, 0.03, 0.47);
  lid.castShadow = true;
  lidPivot.add(lid);
  const lidStrap = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.98), brassMat);
  lidStrap.position.set(0, 0.03, 0.47);
  lidPivot.add(lidStrap);

  // 装满时的铜光（Additive 的一圈，跟着箱子里几只怪变亮）
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffd86b, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  root.add(glow);

  // ---------------- 数值 ----------------
  const lvIdx = () => Math.max(0, Math.min(2, relicLv - 1));
  const capV = () => (relicLv ? (CRATE_BASE.capOf[lvIdx()] + mods.cap + (shop.lid ? 1 : 0)) : 0);
  const intervalV = () => Math.max(2.6, (relicLv ? CRATE_BASE.intervalOf[lvIdx()] : 7.0) - mods.interval);
  const impactV = () => ((relicLv ? CRATE_BASE.impactDmg[lvIdx()] : 1.5) + mods.impact) * amp.dmg * (shop.rope ? 1.5 : 1);
  const fallV = () => (relicLv ? CRATE_BASE.fallPct[lvIdx()] : 0.25) + mods.fall;
  const cdMaxV = () => Math.max(10.0, Math.max(0, (relicLv ? CRATE_BASE.cd[lvIdx()] : 26.0) - mods.cdCut) * cdMul * amp.cd);
  const autoRangeV = () => CRATE_BASE.autoRange + mods.range + amp.radius;
  const castRangeV = () => CRATE_BASE.castRange + mods.range + amp.radius;
  const impactRV = () => CRATE_BASE.impactR + amp.radius;
  const stunV = () => CRATE_BASE.stun + (amp.dur || 0);

  const yawOf = (p, y) => {
    if (typeof y === 'number') return y;
    if (y && typeof y === 'object' && typeof y.yaw === 'number') return y.yaw;
    return (p && p.yaw) || 0;
  };

  // 范围内的活怪，按距离由近到远
  function nearby(p, range) {
    const out = [];
    for (const e of enemies.list) {
      if (!enemies.hittable(e)) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d <= range) out.push({ e, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  function full() { return records.length >= capV(); }

  // 收一只进箱子（成功返回 true）。已经满了就不收。
  function boxOne(e, time = 4.0) {
    if (!e || full()) return false;
    if (!enemies.box(e, { time })) return false;
    records.push({ e });
    serial++;
    if (fx) fx.text(e.pos, '装箱', { color: '#e8d4a0', size: 0.42, life: 0.75, y: (e.cfg.height || 1.0) + 0.5 });
    return true;
  }

  // 倒箱：把箱里的怪倒在主角脚边，摔一下，顺便砸周围的怪
  function dump(p) {
    if (!records.length) return 0;
    const src = p || { x: 0, z: 0 };
    const n = records.length;
    const cap = Math.max(1, capV());
    let kills = 0;

    // 先全部从箱子里放出来（必须 unbox 之后才打得到 —— 箱内的怪不在 hittable 里）
    const placed = [];
    for (let i = 0; i < n; i++) {
      const e = records[i].e;
      const a = (i / n) * Math.PI * 2 + Math.PI * 0.25;
      const r = CRATE_BASE.dropRadius[0] + (CRATE_BASE.dropRadius[1] - CRATE_BASE.dropRadius[0]) * (i / Math.max(1, n - 1));
      const at = { x: src.x + Math.sin(a) * r, z: src.z + Math.cos(a) * r };
      if (!enemies.unbox(e, at)) continue;
      placed.push(e);
    }
    records.length = 0;
    lidT = CRATE_BASE.lidTime;

    // 每只摔一下：按最大生命的比例 + 定住一小会儿（给玩家补刀的时间）
    for (const e of placed) {
      if (!enemies.hittable(e)) continue;
      const fall = Math.max(1, Math.round((e.maxHp || e.cfg.hp || 1) * fallV()));
      enemies.takeDamage(e, fall, false, { dot: true, cls: 'phys' });
      if (enemies.hittable(e)) enemies.applyFreeze(e, { time: stunV(), color: 0xd8b46a });
      if (e.state === 'dead') kills++;
      // 落点冲击：砸它周围一圈（不含它自己 —— 它已经吃了摔伤）
      const r = impactRV();
      const dmg = impactV();
      for (const o of enemies.list) {
        if (o === e || !enemies.hittable(o)) continue;
        if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) > r) continue;
        enemies.takeDamage(o, dmg, false, { quiet: true, cls: 'phys' });
      }
      if (fx) fx.ring({ x: e.pos.x, z: e.pos.z }, { from: 0.3, to: r, color: 0xc8a86a, life: 0.38, opacity: 0.7, y: 0.06 });
    }

    if (fx) {
      fx.ring(src, { from: 0.6, to: CRATE_BASE.dropRadius[1] + 0.4, color: 0xffd86b, life: 0.44, opacity: 0.65, y: 0.07 });
      fx.text(src, `倒箱 ×${n}`, { color: '#ffd86b', size: 0.5, life: 0.95, y: 1.9 });
    }
    if (onDump) onDump(n, kills, cap);
    return n;
  }

  /** 装箱（主动技能 F）：范围内一次收最多 3 只，收满就当场倒箱 */
  function cast(p, yaw) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    const src = p || { x: 0, z: 0 };
    const targets = nearby(src, castRangeV());
    if (!targets.length && !full()) { lastFail = 'notarget'; return false; }
    const y = yawOf(src, yaw);
    let got = 0;
    for (const t of targets) {
      if (full() || got >= CRATE_BASE.castCount) break;
      if (boxOne(t.e)) got++;
    }
    cd = cdMaxV();
    lastFail = '';
    // 收满的那一秒直接倒 —— 技能按下就该看得见结果，不用再等被动
    if (full()) dump(src);
    if (onCast) onCast(got, y);
    if (fx) fx.ring(src, { from: 0.5, to: castRangeV(), color: 0xffd86b, life: 0.36, opacity: 0.6, y: 0.07 });
    return true;
  }

  let cx = 0, cz = 0, firstPos = true;

  function update(dt, { playerPos, yaw } = {}) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    if (lidT > 0) lidT = Math.max(0, lidT - dt);
    if (!relicLv || !playerPos) { root.visible = false; return; }

    // 箱子跟在主角身后半步（平滑跟随，转身时会甩一下）
    const y = yawOf(playerPos, yaw);
    const bx = playerPos.x - Math.sin(y) * 0.92;
    const bz = playerPos.z - Math.cos(y) * 0.92;
    if (firstPos) { cx = bx; cz = bz; firstPos = false; }
    const k = 1 - Math.exp(-9.0 * dt);
    cx += (bx - cx) * k;
    cz += (bz - cz) * k;
    root.position.set(cx, 0.02 + Math.sin(serial + performance.now() / 700) * 0.008, cz);
    root.rotation.y = y;
    root.visible = true;

    // 箱盖：平时盖着（0），倒箱那一下翻到 -1.25 弧度再慢慢合上
    lidPivot.rotation.x = -1.25 * Math.min(1, lidT / CRATE_BASE.lidTime);
    // 装了东西会晃：越满晃得越厉害
    const fill = capV() ? records.length / capV() : 0;
    if (fill > 0) {
      root.rotation.z = Math.sin(performance.now() / 130 + serial) * 0.03 * fill;
    } else {
      root.rotation.z = 0;
    }
    glowMat.opacity = 0.10 + fill * 0.55;

    // 箱内怪自己的 4 秒存活到期（enemy.js 会在 updateOne 里自动放出来）
    for (let i = records.length - 1; i >= 0; i--) {
      const e = records[i].e;
      if (!e || !e.boxed || e.state === 'dead') records.splice(i, 1);
    }

    // 自动装箱：时间到就收身边最近的一只；收满立刻倒
    autoT -= dt;
    if (autoT <= 0) {
      autoT = intervalV();
      if (!full()) {
        const near = nearby(playerPos, autoRangeV());
        if (near.length) boxOne(near[0].e, 4.0);
      }
    }
    if (full()) dump(playerPos);
  }

  // 把箱里的怪全放出来（换关 / 一局结束 / 读档前）—— 不能带着 hidden 的怪走
  function clearField() {
    for (const rec of records) {
      if (rec.e) enemies.unbox(rec.e);
    }
    records.length = 0;
    cd = 0;
    autoT = 0;
    lidT = 0;
    firstPos = true;
    root.visible = false;
  }

  function reset() {
    clearField();
    for (const k of Object.keys(mods)) mods[k] = 0;
    shop.lid = false;
    shop.rope = false;
    relicLv = 0;
    lastFail = '';
    amp = { dmg: 1, radius: 0, cd: 1, dur: 0, coin: 0 };
    cdMul = 1;
  }

  return {
    update, cast, reset, clearField, dump,
    get owned() { return relicLv > 0; },
    get count() { return records.length; },
    get cap() { return capV(); },
    get ready() { return relicLv > 0 && cd <= 0; },
    get cdLeft() { return cd; },
    get cdMax() { return cdMaxV(); },
    get progress() { return relicLv ? 1 - cd / cdMaxV() : 0; },
    get lastFail() { return lastFail; },
    setRelicLevel(n) { relicLv = Math.max(0, Math.min(3, Number(n) || 0)); },
    applyCard(card) {
      const put = (c) => {
        if (!c) return;
        if (c.stat === 'interval') mods.interval += c.flat;
        else if (c.stat === 'cap') mods.cap += c.flat;
        else if (c.stat === 'impact') mods.impact += c.flat;
        else if (c.stat === 'range') mods.range += c.flat;
        else if (c.stat === 'fall') mods.fall += c.flat;
        else if (c.stat === 'cd') mods.cdCut += c.flat;
      };
      put(card);
      for (const ex of (card.extra || [])) put(ex);
    },
    buyLid() { if (shop.lid) return false; shop.lid = true; return true; },
    buyRope() { if (shop.rope) return false; shop.rope = true; return true; },
    hasLid: () => shop.lid,
    hasRope: () => shop.rope,
    bonuses: () => ({
      ...mods,
      cap: capV(),
      interval: +intervalV().toFixed(2),
      impact: +impactV().toFixed(2),
      fall: +fallV().toFixed(3),
      cdMax: +cdMaxV().toFixed(2),
      autoRange: +autoRangeV().toFixed(2),
      castRange: +castRangeV().toFixed(2),
      lid: shop.lid,
      rope: shop.rope,
      level: relicLv,
    }),
    snapshot: () => ({ ...mods, lid: shop.lid, rope: shop.rope }),
    restore(saved) {
      reset();
      if (!saved) return;
      for (const k of Object.keys(mods)) mods[k] = Number(saved[k]) || 0;
      shop.lid = !!saved.lid;
      shop.rope = !!saved.rope;
    },
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    list: () => records.map((r) => ({
      type: r.e && r.e.type,
      x: r.e ? +r.e.pos.x.toFixed(2) : 0,
      z: r.e ? +r.e.pos.z.toFixed(2) : 0,
      t: r.e && r.e.boxed ? +r.e.boxed.t.toFixed(2) : 0,
    })),
    // 调试：直接收一只 / 直接倒箱（都不扣冷却）
    debugBox: (x = 0, z = 0) => {
      const keep = relicLv;
      if (!keep) relicLv = 1;
      const near = nearby({ x, z }, 99);
      const ok = near.length ? boxOne(near[0].e) : false;
      relicLv = keep;
      return ok ? records.length : 0;
    },
    debugDump: (x = 0, z = 0) => dump({ x, z }),
  };
}
