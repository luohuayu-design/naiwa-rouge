// ============================================================
// hazards.js —— 场上的周期性危险区（第 63 块，第六关「漏电地板」）
//
// 骨塔地下机房的地板是拆下来的机柜格栅，年头久了会漏电：
// 每隔几秒某一块「通电」，站上去就掉血。它不是怪，打不掉，只能躲。
//
// 设计要点（和「怪在地上留一片火」的区别）：
//   1. **位置固定**： pyro 的火是打完才出现、随便落；漏电地板从回合一开始
//      就在那儿，玩家可以提前规划「哪条路能走」。
//   2. **周期可读**： 通电前 0.8 秒开始闪（预警），通电 1.4 秒，然后灭 2.6 秒。
//      会看节奏的玩家可以踩着「灭」的窗口穿过去 —— 这是走位，不是运气。
//   3. **只伤玩家**：怪是机房的「自己人」，电流不认它们。所以它逼你走位，
//      但不会替你把怪清掉 —— 收益全在你自己身上。
//
// 通电状态对外暴露 `isPowered(x, z)`：法器的「绝缘斗篷」靠它决定要不要把电引出去。
//
// 第 71 块新增第二种 hazard：`kind:'drip'` 井底滴水落点。
//   和漏电地板一样是「关卡固有机制，不依赖某只怪在场」—— 但它是**落点型**：
//   某处先亮一圈青蓝预警（呼吸闪烁，告诉你「这里要落水了」），到时间「啪」溅一下，
//   站在圈里才掉血。落点可以是固定点（x,z），也可以每轮随机落在 (cx,cz) 周围
//   spread 内（random:true）—— 井底的水是从上面滴下来的，你没法预判每一滴。
//   drip 走的是和漏电地板完全独立的一条分支，互不影响：
//   `isPowered` 仍然只服务于漏电地板（绝缘斗篷的判定照旧）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=137';

export function createHazards({ scene, fx, playerPos, playerRadius = 0.32, hurtPlayer }) {
  // 漏电地板 def: { x, z, r, cycle, on, warm, damage }
  //   cycle  一整轮多少秒（灭 → 预警 → 通电 → 灭）
  //   on     通电持续多少秒
  //   warm   通电前多少秒开始预警闪
  //   damage 通电时每 0.6 秒掉多少血
  // 滴水落点 def: { kind:'drip', r, cycle, on, warm, damage, x,z | random,cx,cz,spread }
  //   random:true 时每轮在 (cx,cz) 周围 spread 内随机挑落点，否则落在固定 (x,z)
  let defs = [];
  let nodes = [];
  let drips = [];           // 第 71 块：井底滴水落点（kind:'drip'）
  let wells = [];           // 第 107 块：第十关「井口」（kind:'well'，塔顶那口井）
  let clock = 0;
  let tickT = 0;
  let playerHurt = 0;       // 本次「站在电上」累计时间（离开就清零）
  let currentOn = false;

  const geoDisc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const geoRim = new THREE.RingGeometry(0.9, 1, 56).rotateX(-Math.PI / 2);
  // 落点预警环（drip 用）：空心环，预警阶段呼吸闪烁，告诉你「这一滴会落在这」
  const geoWarn = new THREE.RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2);

  function clear() {
    for (const n of nodes) {
      scene.remove(n.disc, n.rim);
      n.disc.material.dispose();
      n.rim.material.dispose();
    }
    nodes = [];
    for (const d of drips) {
      if (d.warn) { scene.remove(d.warn); d.warn.material.dispose(); }
    }
    drips = [];
    for (const w of wells) {
      scene.remove(w.disc, w.rim);
      w.disc.material.dispose();
      w.rim.material.dispose();
    }
    wells = [];
  }

  function build(list) {
    clear();
    const src = list || [];
    defs = [];
    drips = [];
    for (const d of src) {
      // ---- 第 107 块：井口（kind:'well'）----
      // 和另外两种都不一样：它**没有通电/断电循环**，从开局到关底一直在；
      // 而且它不是「站在上面持续掉血」，而是掉进去一次疼一下、然后被吐回井沿。
      if (d.kind === 'well') {
        const w = {
          x: d.x || 0, z: d.z || 0,
          r: d.r || 2.4,
          damage: d.damage != null ? d.damage : 3,
          cd: 0,          // 掉血节流：被吐回去的那一瞬间不该连着掉
          cdMax: d.cd != null ? d.cd : 1.2,
        };
        // 井里是真的黑（井水不反光，s10 原话「黑得像一块没有内容物的屏幕」）
        const disc = new THREE.Mesh(geoDisc, new THREE.MeshBasicMaterial({
          color: 0x04080a, transparent: true, opacity: 0.96, depthWrite: false,
        }));
        disc.scale.setScalar(w.r);
        disc.position.set(w.x, 0.02, w.z);
        // 井沿：一圈石头，看得见边界才敢贴着走
        const rim = new THREE.Mesh(geoRim, new THREE.MeshBasicMaterial({
          color: 0x8a9aa4, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
        }));
        rim.scale.setScalar(w.r * 1.08);
        rim.position.set(w.x, 0.03, w.z);
        scene.add(disc, rim);
        w.disc = disc; w.rim = rim;
        wells.push(w);
        continue;
      }
      if (d.kind === 'drip') {
        // ---- 滴水落点：固定点(d.x,d.z) 或 随机落在 (cx,cz) 周围 spread 内 ----
        const dd = {
          kind: 'drip',
          r: d.r || 1.6,
          cycle: d.cycle || 3.2,
          on: d.on || 0.5,
          warm: d.warm || 1.0,
          damage: d.damage != null ? d.damage : 1,
          random: !!d.random,
          cx: d.cx != null ? d.cx : (d.x || 0),
          cz: d.cz != null ? d.cz : (d.z || 0),
          x: d.x || 0,
          z: d.z || 0,
          spread: d.spread || 0,
          off: d.off != null ? d.off : Math.random() * (d.cycle || 3.2),
          t: 0,
          _wasWarm: false,
          _splashed: false,
        };
        const warn = new THREE.Mesh(geoWarn, new THREE.MeshBasicMaterial({
          color: 0x9fe8ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
        }));
        warn.position.set(dd.x, 0.05, dd.z);
        warn.scale.setScalar(dd.r);
        warn.visible = false;
        warn.frustumCulled = false;
        scene.add(warn);
        dd.warn = warn;
        drips.push(dd);
      } else {
        // ---- 漏电地板（老逻辑，原样保留）----
        const fd = { cycle: 4.8, on: 1.4, warm: 0.8, damage: 1, ...d };
        const disc = new THREE.Mesh(geoDisc, new THREE.MeshBasicMaterial({
          color: 0x2a6a7a, transparent: true, opacity: 0.16, depthWrite: false,
        }));
        disc.position.set(fd.x, 0.035, fd.z);
        disc.scale.setScalar(fd.r);
        disc.frustumCulled = false;
        const rim = new THREE.Mesh(geoRim, new THREE.MeshBasicMaterial({
          color: 0x6fd8e0, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide,
        }));
        rim.position.set(fd.x, 0.042, fd.z);
        rim.scale.setScalar(fd.r);
        rim.frustumCulled = false;
        scene.add(disc, rim);
        nodes.push({ disc, rim });
        defs.push(fd);
      }
    }
    clock = 0;
    tickT = 0;
    playerHurt = 0;
    currentOn = false;
  }

  // 每一块的相位（0~1）：0~0.45 灭 / 0.45~0.62 预警 / 0.62~0.91 通电 / 其余收尾
  function phaseOf(i) {
    const d = defs[i];
    const cyc = Math.max(0.5, d.cycle);
    const p = ((clock + i * (cyc / Math.max(1, defs.length))) % cyc) / cyc;
    return p;
  }

  // 某一块此刻是不是通电（预警不算）
  function poweredNow(i) {
    const d = defs[i];
    const onFrac = Math.min(0.9, d.on / Math.max(0.5, d.cycle));
    const warmFrac = Math.min(0.9 - onFrac, d.warm / Math.max(0.5, d.cycle));
    const p = phaseOf(i);
    return p >= 0.45 + warmFrac && p < 0.45 + warmFrac + onFrac;
  }

  function warnNow(i) {
    const d = defs[i];
    const onFrac = Math.min(0.9, d.on / Math.max(0.5, d.cycle));
    const warmFrac = Math.min(0.9 - onFrac, d.warm / Math.max(0.5, d.cycle));
    const p = phaseOf(i);
    return p >= 0.45 && p < 0.45 + warmFrac;
  }

  // 点位是否踩在**通电**的地板上（法器「绝缘斗篷」用这个）
  function isPowered(x, z) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (!poweredNow(i)) continue;
      if (Math.hypot(x - d.x, z - d.z) <= d.r) return true;
    }
    return false;
  }

  function update(dt, extra = {}) {
    // 第 107 块：第十关只有井（没有通电地板 / 滴水），井也算「有活儿」——
    // 不然这个守卫把整个 update 拦死，井口的推开 / 掉血一帧都不会跑
    if (!defs.length && !drips.length && !wells.length) return;
    clock += dt;
    const pp = extra.playerPos || playerPos;
    let onMe = false;
    let dmg = 1;

    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const n = nodes[i];
      const on = poweredNow(i);
      const warn = warnNow(i);
      // 视觉：灭 = 暗青 / 预警 = 橙红快闪 / 通电 = 亮青
      const t = performance.now() / 1000;
      if (on) {
        n.disc.material.color.setHex(0x2fb8c8);
        n.disc.material.opacity = 0.34;
        n.rim.material.color.setHex(0x9ff4ff);
        n.rim.material.opacity = 0.62;
      } else if (warn) {
        const k = 0.5 + 0.5 * Math.sin(t * 22);
        n.disc.material.color.setHex(0x8a4a2a);
        n.disc.material.opacity = 0.14 + 0.12 * k;
        n.rim.material.color.setHex(0xff9a5c);
        n.rim.material.opacity = 0.28 + 0.34 * k;
      } else {
        n.disc.material.color.setHex(0x2a6a7a);
        n.disc.material.opacity = 0.13;
        n.rim.material.color.setHex(0x6fd8e0);
        n.rim.material.opacity = 0.26;
      }
      if (on && Math.hypot(pp.x - d.x, pp.z - d.z) <= d.r + playerRadius * 0.5) {
        onMe = true;
        dmg = Math.max(dmg, d.damage);
        // 电弧：通电期间偶发，站在上面会明显变密
        if (fx && Math.random() < dt * 6) {
          fx.burst({ x: pp.x, z: pp.z }, {
            color: 0x9ff4ff, count: 3, speed: 2.2, life: 0.22, size: 0.07, y: 0.25, up: 1.6,
          });
        }
      }
    }

    // ---- 第 107 块：井口 ----
    // 掉进去 = 掉 damage 点血（无视防御，走 'hazard' 那条 damageTrue 通道）
    // + 当场被吐回井沿。节流 cdMax 秒：不然贴着边走会每帧掉一次。
    // ⚠️ 怪也会绕开井（enemy.js 的 moveToward 问 ctx.wellAt），所以井对玩家
    // 不只是减益 —— 它是场上唯一的**实体掩体**，可以拿来把追兵甩到对面。
    for (const w of wells) {
      if (w.cd > 0) w.cd -= dt;
      const dx = pp.x - w.x, dz = pp.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d >= w.r) continue;
      // 吐回井沿（沿「井心 → 玩家」方向推到 r 外一点点）
      const k = d > 0.001 ? (w.r + 0.18) / d : 0;
      if (k > 0) {
        pp.x = w.x + dx * k;
        pp.z = w.z + dz * k;
      } else {
        pp.x = w.x + w.r + 0.18;
        pp.z = w.z;
      }
      if (w.cd <= 0) {
        w.cd = w.cdMax;
        // ⚠️ 掉井是「瞬间一下」，不能走底下 onMe 那条 0.6 秒 tick —— 人第一帧
        // 就被吐回井沿了，onMe 立刻变 false，tick 一辈子攒不满 0.6 秒。
        // 所以这里直接结算（'hazard' 通道无视无敌帧 / 无视防御，和漏电地板同待遇）。
        hurtPlayer?.(w.damage, 'hazard');
        if (fx) {
          fx.ring({ x: w.x, z: w.z }, { from: w.r * 0.5, to: w.r * 1.15, color: 0x6fd8e8, life: 0.4, opacity: 0.7, y: 0.06 });
          fx.text({ x: w.x, z: w.z }, '掉进去了', { color: '#9fe8ff', y: 1.2, size: 0.7 });
        }
      }
    }

    // ---- 第 71 块：井底滴水落点（不依赖某只怪在场，是关卡固有机制）----
    // 每个 drip 自己一整轮：暖相（亮预警环 + 呼吸闪烁）→ 溅相（落一下，圈内掉血）→ 空相
    for (const d of drips) {
      const cyc = Math.max(0.8, d.cycle);
      d.t = (d.t + dt) % cyc;
      const p = d.t / cyc;
      const warmFrac = Math.min(0.45, d.warm / cyc);
      const onFrac = Math.min(0.5, d.on / cyc);
      const inWarm = p < warmFrac;
      const inSplash = p >= warmFrac && p < warmFrac + onFrac;

      if (inWarm) {
        // 进暖相那一刻定落点（随机落点每次重挑，固定点用初始值）
        if (!d._wasWarm) {
          if (d.random) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.random() * d.spread;
            d.x = d.cx + Math.cos(a) * rr;
            d.z = d.cz + Math.sin(a) * rr;
            d.warn.position.set(d.x, 0.05, d.z);
            d.warn.scale.setScalar(d.r);
          }
          d._splashed = false;     // 新一轮，溅击待发
        }
        const k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(performance.now() / 110));
        d.warn.visible = true;
        d.warn.material.color.setHex(0x9fe8ff);
        d.warn.material.opacity = 0.18 + 0.4 * k;
      } else if (inSplash) {
        d.warn.visible = false;
        if (!d._splashed) {
          d._splashed = true;
          if (fx) {
            fx.ring({ x: d.x, z: d.z }, { from: 0.2, to: d.r, color: 0x9fe8ff, life: 0.3, opacity: 0.8, y: 0.06 });
            fx.burst({ x: d.x, z: d.z }, { color: 0x8fdcff, count: 8, speed: 2.4, life: 0.3, size: 0.09, y: 0.3, up: 2.4 });
          }
          if (Math.hypot(pp.x - d.x, pp.z - d.z) <= d.r + playerRadius * 0.5) {
            hurtPlayer?.(d.damage, 'hazard');
          }
        }
      } else {
        d.warn.visible = false;
        d._splashed = false;
      }
      d._wasWarm = inWarm;
    }

    // 站在通电地板上：每 0.6 秒结算一次（不是每帧扣，掉血数字才看得清）
    if (onMe) {
      playerHurt += dt;
      tickT += dt;
      if (tickT >= 0.6) {
        tickT = 0;
        hurtPlayer?.(dmg, 'hazard');
        if (fx) fx.ring(pp, { from: 0.2, to: 1.1, color: 0x9ff4ff, life: 0.28, opacity: 0.7, y: 0.06 });
      }
    } else {
      tickT = 0;
    }
    currentOn = onMe;
  }

  return {
    build, update, clear, isPowered,
    // 第 107 块：怪要绕开井口 —— 给 enemy.js 的 moveToward 问（和 depositHub 一个用法）
    wellAt: () => (wells.length ? { x: wells[0].x, z: wells[0].z, r: wells[0].r } : null),
    get wells() { return wells.map((w) => ({ x: w.x, z: w.z, r: w.r, damage: w.damage })); },
    get count() { return defs.length; },
    get onPlayer() { return currentOn; },
    get defs() { return defs.map((d) => ({ ...d })); },
    // 调试/测试：把时钟调到某个相位（0~1），立刻停在那一帧
    setPhase(p) {
      let cyc = 1;
      for (const d of defs) cyc = Math.max(cyc, d.cycle);
      clock = Math.max(0, Math.min(0.999, p)) * cyc;
    },
    // 测试用：某一块现在通不通电
    stateOf(i) { return { on: poweredNow(i), warn: warnNow(i), phase: +phaseOf(i).toFixed(3) }; },
  };
}
