"""第 83 块：把寄存处看守的行为（三招 + 狂暴 + 落点系统）插进 enemy.js"""
import io

P = 'js/enemy.js'
s = io.open(P, 'r', encoding='utf-8', newline='').read()

ANCHOR = """  // ---------------- 第七关 · 木鱼灵：吐追踪泡（第 82 块）----------------"""
assert ANCHOR in s

BLOCK = r"""  // ============================================================
  // 第八关 · 寄存处看守（第 83 块）：三套距离带攻击
  // ============================================================
  // 它是本关唯一由**玩法**召唤出来的怪（柜子满 8 块 → 封柜 5 秒 → 走出来），
  // 所以设计目标不是「更硬的骷髅」，而是「三种完全不同的躲法」——
  // 玩家每换一次距离，就换一套动作去应对：
  //
  //   ① 横扫  dist ≤ 3.6      前摇 0.55s + 脚下一圈橙光 → 3.6 格内重伤 + 击飞
  //   ② 砸地  3.6 < dist ≤ 9  在你**当时站的位置**钉三个金圈，1.35 秒后落锤
  //   ③ 投牌  dist > 9        抡起一摞木牌砸过来（有实体飞行物，能看见、能躲）
  //
  // 三招都不是「必中」：横扫退一步、砸地走开两步、投牌横移就行。
  // 反过来，站着不动吃三招是一定会死的 —— 这正是「不让柜子满」的意义。
  //
  // 半血狂暴：移速 ×1.4、出手间隔 ×0.72、自发光转暗金，只触发一次。
  const wardenStrikes = [];   // 落点预警：{ x, z, t, delay, dmg, r, mesh, owner }
  const wardenTags = [];      // 飞行中的木牌：{ mesh, from, to, t, dur, dmg, owner }

  function clearWardenFx() {
    for (const st of wardenStrikes) {
      if (st.mesh) {
        scene.remove(st.mesh);
        st.mesh.geometry.dispose();
        st.mesh.material.dispose();
      }
    }
    wardenStrikes.length = 0;
    for (const tg of wardenTags) {
      scene.remove(tg.mesh);
      tg.mesh.geometry.dispose();
      tg.mesh.material.dispose();
    }
    wardenTags.length = 0;
  }

  function addWardenStrike(x, z, delay, dmg, r, color, owner) {
    let mesh = null;
    if (typeof document !== 'undefined') {
      mesh = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.84, r, 44).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
        })
      );
      mesh.position.set(x, 0.055, z);
      scene.add(mesh);
    }
    wardenStrikes.push({ x, z, t: 0, delay, dmg, r, mesh, owner: owner || null });
  }

  function updateWardenStrikes(dt, ctx) {
    const pp = ctx.playerPos;
    for (let i = wardenStrikes.length - 1; i >= 0; i--) {
      const st = wardenStrikes[i];
      st.t += dt;
      const k = Math.min(1, st.t / Math.max(0.01, st.delay));
      if (st.mesh) {
        st.mesh.material.opacity = 0.16 + k * 0.46;
        st.mesh.scale.setScalar(0.92 + k * 0.14);
      }
      if (st.t < st.delay) continue;
      if (st.mesh) {
        scene.remove(st.mesh);
        st.mesh.geometry.dispose();
        st.mesh.material.dispose();
        st.mesh = null;
      }
      const d = Math.hypot(pp.x - st.x, pp.z - st.z);
      if (d <= st.r) {
        ctx.hurtPlayer(st.dmg, st.owner && st.owner.state !== 'dead' ? st.owner : null);
        if (ctx.pushPlayer) {
          const nx = d > 1e-4 ? (pp.x - st.x) / d : 1;
          const nz = d > 1e-4 ? (pp.z - st.z) / d : 0;
          ctx.pushPlayer(nx, nz, Math.min(1.5, st.r * 0.38));
        }
      }
      if (fx) {
        fx.ring({ x: st.x, z: st.z }, {
          from: st.r * 0.3, to: st.r, color: 0xffe0a0, life: 0.32, opacity: 0.85, y: 0.07,
        });
        fx.burst({ x: st.x, z: st.z }, {
          color: 0xf0d8a8, count: 14, speed: 3.2, life: 0.45, size: 0.12, y: 0.2, up: 1.7,
        });
      }
      wardenStrikes.splice(i, 1);
    }
  }

  // 投牌：一块实体木牌从它手边飞向「你按下出手那一刻站的位置」——
  // 所以看到它抡起来就走开，牌子会砸在你刚才的脚印上。
  function throwWardenTag(e, ctx) {
    const cfg = e.cfg.warden;
    const pp = ctx.playerPos;
    const from = { x: e.pos.x, z: e.pos.z };
    const to = { x: pp.x, z: pp.z };
    const d = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    let mesh = null;
    if (typeof document !== 'undefined') {
      const tex = makeTagTexture();
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.48, 0.07),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      );
      mesh.position.set(from.x, 1.35, from.z);
      scene.add(mesh);
    }
    wardenTags.push({
      mesh, from, to, t: 0,
      dur: Math.max(0.35, d / Math.max(1, cfg.tagSpeed)),
      dmg: e.damage * cfg.tagMul,
      owner: e,
    });
  }

  function updateWardenTags(dt, ctx) {
    const pp = ctx.playerPos;
    for (let i = wardenTags.length - 1; i >= 0; i--) {
      const tg = wardenTags[i];
      tg.t += dt;
      const k = Math.min(1, tg.t / tg.dur);
      if (tg.mesh) {
        // 抛物线：水平线性、竖直按 sin 拱起（看着像「抡过去」而不是「滑过去」）
        tg.mesh.position.set(
          tg.from.x + (tg.to.x - tg.from.x) * k,
          1.35 + Math.sin(k * Math.PI) * 2.2,
          tg.from.z + (tg.to.z - tg.from.z) * k
        );
        tg.mesh.rotation.x += dt * 9;
        tg.mesh.rotation.z += dt * 5;
      }
      if (k < 1) continue;
      if (tg.mesh) {
        scene.remove(tg.mesh);
        tg.mesh.geometry.dispose();
        tg.mesh.material.dispose();
        tg.mesh = null;
      }
      const d = Math.hypot(pp.x - tg.to.x, pp.z - tg.to.z);
      if (d <= 2.2) {
        ctx.hurtPlayer(tg.dmg, tg.owner && tg.owner.state !== 'dead' ? tg.owner : null);
        if (ctx.pushPlayer) {
          const nx = d > 1e-4 ? (pp.x - tg.to.x) / d : 1;
          const nz = d > 1e-4 ? (pp.z - tg.to.z) / d : 0;
          ctx.pushPlayer(nx, nz, 0.8);
        }
      }
      if (fx) {
        fx.ring({ x: tg.to.x, z: tg.to.z }, {
          from: 0.4, to: 2.2, color: 0xe8c98a, life: 0.28, opacity: 0.8, y: 0.07,
        });
        fx.burst({ x: tg.to.x, z: tg.to.z }, {
          color: 0xd8b98a, count: 10, speed: 2.4, life: 0.4, size: 0.1, y: 0.3, up: 1.4,
        });
      }
      wardenTags.splice(i, 1);
    }
  }

  function performWardenMove(e, ctx, move) {
    const cfg = e.cfg.warden;
    const pp = ctx.playerPos;
    const base = e.damage;

    if (move === 'sweep') {
      if (fx) {
        fx.ring(e.pos, { from: 0.5, to: cfg.sweepR, color: cfg.color, life: 0.3, opacity: 0.9, y: 0.07 });
        fx.burst(e.pos, {
          color: 0xffd8a0, count: 18, speed: 4.2, life: 0.4, size: 0.12, y: 0.5, up: 1.2,
        });
      }
      const d = Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z);
      if (d <= cfg.sweepR) {
        ctx.hurtPlayer(base * cfg.sweepMul, e);
        if (ctx.pushPlayer) {
          const nx = d > 1e-4 ? (pp.x - e.pos.x) / d : 1;
          const nz = d > 1e-4 ? (pp.z - e.pos.z) / d : 0;
          ctx.pushPlayer(nx, nz, 1.6);
        }
      }
      return;
    }

    if (move === 'slam') {
      // 三个圈：你现在站的位置 + 垂直于「它→你」方向的两侧
      // （只钉一个圈的话，往旁边挪半步就白给了；三个圈才逼出「走两步」）
      const ang = Math.atan2(pp.z - e.pos.z, pp.x - e.pos.x) + Math.PI / 2;
      const ox = Math.cos(ang) * 2.4;
      const oz = Math.sin(ang) * 2.4;
      const lim = ctx.arenaRadius - 1.0;
      for (const sgn of [0, 1, -1]) {
        let x = pp.x + ox * sgn;
        let z = pp.z + oz * sgn;
        const r = Math.hypot(x, z);
        if (r > lim) { x = (x / r) * lim; z = (z / r) * lim; }
        addWardenStrike(x, z, cfg.slamDelay, base * cfg.slamMul, cfg.slamR, cfg.color, e);
      }
      if (fx) {
        fx.ring(e.pos, { from: 0.5, to: 2.4, color: cfg.color, life: 0.35, opacity: 0.7, y: 0.06 });
      }
      return;
    }

    throwWardenTag(e, ctx);
  }

  function handleWarden(e, dt, ctx, dx, dz, dist) {
    const cfg = e.cfg.warden;
    if (e.wdGap == null) e.wdGap = cfg.gap * 0.6;

    // ---- 半血狂暴（只触发一次）----
    if (!e.raged && e.hp / e.maxHp <= cfg.rageAt) {
      e.raged = true;
      e.speed *= cfg.rageSpeed;
      for (const m of e.mats) {
        if (!m.emissive) continue;
        m.emissive.setHex(0x8a3a12);
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.95);
      }
      if (fx) {
        fx.ring(e.pos, { from: 0.5, to: 4.6, color: 0xff7a3c, life: 0.62, opacity: 0.9, y: 0.06 });
        fx.text(e.pos, '暴怒', { color: '#ff9a5a', size: 0.95, y: e.cfg.height + 1.0 });
        fx.burst(e.pos, { color: 0xff9a5a, count: 26, speed: 3.6, life: 0.6, size: 0.14, y: 0.6, up: 2.0 });
      }
    }

    if (e.state === 'attack') {
      const move = e.wdMove || 'sweep';
      if (!e.hitDone && e.t >= e.cfg.windup) {
        e.hitDone = true;
        performWardenMove(e, ctx, move);
      }
      if (e.t >= (e.wdDur || e.cfg.attackDuration)) {
        e.state = 'chase';
        e.t = 0;
        e.hitDone = false;
        e.wdGap = Math.max(0.5, cfg.gap * (e.raged ? cfg.rageGap : 1));
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.2 });
      }
      return;
    }

    // 走得慢，但冷却照常在走 —— 拉开距离反而更容易吃到「投牌」
    e.wdGap -= dt;
    if (dist > cfg.chaseKeep) {
      moveToward(e, dx, dz, dist, dt, ctx);
      if (e.currentAnim !== e.cfg.anim.walk) {
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.2 });
      }
    } else if (e.currentAnim !== e.cfg.anim.idle) {
      e.currentAnim = e.cfg.anim.idle;
      e.play(e.cfg.anim.idle, { fade: 0.2 });
    }
    if (e.wdGap > 0) return;

    // 按距离带选招：贴脸横扫 / 中距砸地 / 远处投牌
    const move = dist > 9.0 ? 'tag' : (dist > cfg.sweepR ? 'slam' : 'sweep');
    e.state = 'attack';
    e.t = 0;
    e.hitDone = false;
    e.wdMove = move;
    e.wdDur = move === 'slam' ? 1.55 : (move === 'tag' ? 1.05 : 1.0);
    e.currentAnim = e.cfg.anim.attack;
    e.play(e.cfg.anim.attack, { once: true, fade: 0.1, duration: e.wdDur });
    if (fx) {
      // 前摇提示：横扫/砸地都是脚下一圈暗金脉冲，投牌多一道抬手光
      fx.ring(e.pos, {
        from: 0.4, to: move === 'sweep' ? cfg.sweepR : 2.6,
        color: cfg.color, life: e.cfg.windup, opacity: 0.5, y: 0.06,
      });
    }
  }

"""

s = s.replace(ANCHOR, BLOCK + ANCHOR, 1)

# 分派：放在称量官之前（三个都是「自己占一条分支」的怪）
DISP = """    // ---- 第九关 · 称量官：给全场记账（第 82 块）----"""
NEW_DISP = """    // ---- 第八关 · 寄存处看守：三套距离带攻击（第 83 块）----
    if (e.cfg.warden) { handleWarden(e, dt, ctx, dx, dz, dist); return; }

    // ---- 第九关 · 称量官：给全场记账（第 82 块）----"""
assert DISP in s
s = s.replace(DISP, NEW_DISP, 1)

# 每帧更新飞行中的木牌
OLD_UPD = """    updateWardenStrikes(dt, ctx);  // 第 83 块：看守的落点预警 / 落锤结算"""
NEW_UPD = """    updateWardenStrikes(dt, ctx);  // 第 83 块：看守的落点预警 / 落锤结算
    updateWardenTags(dt, ctx);     // 第 83 块：看守扔出去的木牌"""
assert OLD_UPD in s
s = s.replace(OLD_UPD, NEW_UPD, 1)

# reset 里清干净
OLD_RESET = """    weighTier = 0;              // 第 82 块：记名层数也得跟着清（换关重来）"""
NEW_RESET = """    weighTier = 0;              // 第 82 块：记名层数也得跟着清（换关重来）
    clearWardenFx();            // 第 83 块：看守的预警圈 / 飞行木牌（换关重来不能留在场上）"""
assert OLD_RESET in s
s = s.replace(OLD_RESET, NEW_RESET, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('inserted, lines =', s.count('\n') + 1)
