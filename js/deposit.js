// ============================================================
// deposit.js —— 第八关「寄存柜」（第 81 块立，第 83 块重做）
// ============================================================
// 剧情接 s08《一百层台阶》：第七十层平台边上有间木柜，柜面上是九格寄存格。
// 这一层的骷髅胸前都挂着木牌，牌子上本来刻着名字 —— 被雾吹过之后只剩一道划痕。
// 它们死后，牌子会被这间柜子收进去。
//
// 【第 83 块改成了什么】用户原话：「那个一起移动的问题太大，直接换掉」。
// 旧机制（八块牌子凑满 → 放出一支新队伍）连着队形系统一起删了。新循环是：
//
//   ① **任何一只怪死，柜里 +1 块牌子**（不再是某两种怪专属）。
//   ② 攒满 8 块 → **立刻封柜**（不能再清），屏幕提示「寄存柜满了」，
//      地上亮一圈金环倒数 **5 秒**。
//   ③ 5 秒一到，柜门打开 —— **寄存处看守**走出来。那是一只三套攻击、
//      半血狂暴的硬怪，玩家本可以不让它出现。
//   ④ 想清柜只有一条路：走到柜子旁边按「取牌」，屏幕上会给出一个**四位数字**，
//      用游戏内置键盘在限时内输对 → **柜里所有牌子一起取走**（计数归零）。
//
// 所以这关真正的操作是「算账」：8 块之前去清一次，别让它封柜。
// 为什么不做站桩取牌（旧机制）：站着不动 1.1 秒在手机上是纯粹的罚站，
// 而「看一眼数字、按四下」是一件事先有准备就能几秒钟解决的事 —— 手感完全不同。
//
// 视觉全部程序化（一个柜体 + 一张 canvas 柜面），零新资产：
// 柜面 4×2 八个格子，每进一块牌子填一格；封柜时整面转红金并写「封柜」。
//
// 【第 84 块：掉牌不再是必然】用户原话：「每个怪死后只有 50% 左右的概率生成
// 牌子进柜」。于是这里多了一张概率表 TAG_SEAL —— 表里第 0 位是「没买法器」，
// 后三位是法器「镇牌铃」的 1~3 级。**概率的真相源就在这张表**，
// relics.js 的镇牌铃描述文案也从这里取数字，两边不会漂移。
// 判定放在 main.js 的死亡钩子里（deposit 只管收牌，不掷骰）。
// 买了铃以后柜子上会挂铜铃（挂几个 = 几级），柜面左上角多一个「镇」字。
// ============================================================
import * as THREE from '../lib/three.module.js?v=107';

// 没有法器时：一半的怪会留牌子（用户定的 50%）。
export const TAG_BASE = 0.50;
// 镇牌铃 0~3 级对应的掉牌概率（第 0 位必须等于 TAG_BASE）。
export const TAG_SEAL = [TAG_BASE, 0.34, 0.22, 0.13];

// 给定铃的等级，返回这一发掉牌的概率。
export function tagChance(sealLv = 0) {
  const lv = Math.max(0, Math.min(TAG_SEAL.length - 1, Math.round(sealLv) || 0));
  return TAG_SEAL[lv];
}

export function createDeposit({ scene, fx, playerPos, playerRadius = 0.32, hurtPlayer }) {
  const CAP = 8;           // 满柜需要几块牌子
  const LOCK_DELAY = 5.0;  // 封柜后到开门（看守出场）的秒数
  const RANGE = 3.6;       // 站到这么近才能按「取牌」

  let def = null;
  let root = null;
  let faceTex = null;
  let faceCanvas = null;
  let glowMat = null;
  let lockRing = null;

  let count = 0;
  let locked = false;      // 已封柜：不能再加牌，也不能再清
  let lockT = 0;           // 封柜倒计时（>0 表示正在倒数）
  let flashT = 0;

  // 第 84 块：镇牌铃的等级（0 = 没买）。铃铛挂在柜门上方，挂几个就是几级。
  // ⚠️ 这个值**不随 build()/reset() 清零** —— 它是法器状态，属于整局，
  //    不属于这一关的柜子；重进第八关时柜子是新的，铃还得在。
  let sealLv = 0;
  let sealGroup = null;    // 柜门上方那串铜铃（三个，按等级显示）

  // ---------------- 柜面（canvas） ----------------
  // 4×2 的八格：填满的格子放一块木牌（和骷髅胸前那块同款），空格子黑着。
  // 右下角写「5 / 8」，让玩家一眼知道还差几块。
  function redraw() {
    if (!faceCanvas) return;
    const W = faceCanvas.width, H = faceCanvas.height;
    const g = faceCanvas.getContext('2d');
    // 柜体木色底
    g.fillStyle = locked ? '#4a2b1c' : '#3c2f21';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = locked ? 'rgba(255,190,90,0.85)' : 'rgba(20,14,9,0.9)';
    g.lineWidth = locked ? 12 : 10;
    g.strokeRect(6, 6, W - 12, H - 12);

    const cols = 4, rows = 2;
    const padX = 40, padY = 40, gap = 16;
    const cw = (W - padX * 2 - gap * (cols - 1)) / cols;
    const ch = (H - padY * 2 - gap * (rows - 1)) / rows;

    for (let i = 0; i < cols * rows; i++) {
      const cx = padX + (i % cols) * (cw + gap);
      const cy = padY + Math.floor(i / cols) * (ch + gap);
      // 格子凹槽
      g.fillStyle = '#17110b';
      g.fillRect(cx, cy, cw, ch);
      g.strokeStyle = 'rgba(90,68,44,0.55)';
      g.lineWidth = 2;
      g.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);

      if (i < count) {
        // 一块木牌：刚好填满这个格子
        g.fillStyle = locked ? '#b07a3e' : '#8a6b45';
        g.fillRect(cx + 5, cy + 6, cw - 10, ch - 12);
        g.strokeStyle = 'rgba(58,40,24,0.8)';
        g.lineWidth = 2;
        g.strokeRect(cx + 5, cy + 6, cw - 10, ch - 12);
        // 牌子上那道划痕 —— 名字被擦掉之后留下的
        g.strokeStyle = 'rgba(226,214,190,0.45)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx + cw * 0.26, cy + ch * 0.62);
        g.lineTo(cx + cw * 0.74, cy + ch * 0.44);
        g.stroke();
      }
    }

    // 第 84 块：挂了镇牌铃 → 左上角一个「镇」字（暗金，不抢 8 格的视觉）
    if (sealLv > 0) {
      g.fillStyle = 'rgba(255,214,138,0.92)';
      g.font = 'bold 34px system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText('镇', 16, 12);
    }

    // 计数（右下角）：封柜时写「封柜」
    g.fillStyle = locked ? '#ffd98a' : (count >= CAP - 2 ? '#ffcf8a' : 'rgba(220,210,186,0.85)');
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(locked ? '封柜' : `${count} / ${CAP}`, W - 18, H - 8);

    if (faceTex) faceTex.needsUpdate = true;
  }

  // ---------------- 建造 ----------------
  function build(d) {
    reset();
    if (!d || typeof document === 'undefined') {
      def = d ? { x: d.x, z: d.z, r: d.r || 1.5 } : null;
      return;
    }
    def = { x: d.x, z: d.z, r: d.r || 1.5 };
    count = 0;
    locked = false;
    lockT = 0;
    flashT = 0;

    root = new THREE.Group();
    root.position.set(def.x, 0, def.z);
    // 柜子永远朝向场地中心（第八关的柜子在场地一侧，正面要朝里）
    root.rotation.y = Math.atan2(-def.x, -def.z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x463422, roughness: 0.92, metalness: 0.02 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.20, 1.0), woodMat);
    body.position.y = 1.10;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    // 顶檐（比柜体宽一点，像个寄存处的雨棚）
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 1.35), woodMat);
    cap.position.set(0, 2.30, 0.10);
    cap.castShadow = true;
    root.add(cap);

    // 两侧立柱
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.30), woodMat);
      col.position.set(sx * 1.55, 1.10, 0.38);
      col.castShadow = true;
      root.add(col);
    }

    // 柜面（canvas 贴图）：正面朝 +z（root 已经转过，指向场地中心）
    faceCanvas = document.createElement('canvas');
    faceCanvas.width = 512;
    faceCanvas.height = 300;
    faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    glowMat = new THREE.MeshStandardMaterial({
      map: faceTex, roughness: 0.86, metalness: 0.02,
      emissive: new THREE.Color(0xffb84a), emissiveIntensity: 0,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.72, 1.60), glowMat);
    face.position.set(0, 1.14, 0.512);
    root.add(face);

    // 柜子顶上挂一盏小灯：夜里隔着半个场地也看得出「那边有个柜子」
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffca6a, transparent: true, opacity: 0.85 })
    );
    lamp.position.set(0, 2.44, 0.42);
    root.add(lamp);

    // 封柜倒计时的地面金环（平时透明，倒数时收紧 —— 「它马上要开了」）
    lockRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1.0, 56).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    lockRing.position.set(0, 0.05, 0);
    lockRing.visible = false;
    root.add(lockRing);

    // 第 84 块：柜门上方那串镇牌铃（买了法器才有；挂几个 = 几级）。
    // 挂在这里而不是跟着主角走 —— 铃管的是柜子，让它在柜子上才说得通。
    sealGroup = new THREE.Group();
    {
      const cordMat = new THREE.MeshBasicMaterial({ color: 0x6b5330 });
      const cord = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.035, 0.035), cordMat);
      cord.position.y = 0.17;
      sealGroup.add(cord);
      const bellMat = new THREE.MeshStandardMaterial({
        color: 0xc9952f, roughness: 0.42, metalness: 0.55,
        emissive: new THREE.Color(0x6a3f08), emissiveIntensity: 0.6,
      });
      const clapMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
      const bells = [];
      const bx = [0, -0.31, 0.31];        // 1 级挂中间，2 级添左，3 级添右
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Group();
        const cup = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bellMat);
        cup.scale.set(1, 1.15, 1);
        const clap = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), clapMat);
        clap.position.y = -0.085;
        b.add(cup, clap);
        b.position.set(bx[i], 0.07 - Math.abs(bx[i]) * 0.06, 0);
        sealGroup.add(b);
        bells.push(b);
      }
      sealGroup.userData.bells = bells;
      sealGroup.position.set(0, 2.08, 0.60);
      sealGroup.visible = false;
    }
    root.add(sealGroup);
    applySeal();

    scene.add(root);
    redraw();
  }

  // 第 84 块：按铃的等级显示 0~3 个铜铃
  function applySeal() {
    if (!sealGroup) return;
    sealGroup.visible = sealLv > 0;
    const bells = sealGroup.userData.bells || [];
    for (let i = 0; i < bells.length; i++) bells[i].visible = i < sealLv;
  }

  // 由 main.js 在「买到 / 读档 / 换关重建柜子」三个时刻调用。
  // ⚠️ 等级没变也要走一遍 applySeal()：build() 每次都造了新的柜子，
  //    新柜子的铃铛默认是藏着的，只比等级会让铃「消失」。
  function setSeal(lv) {
    const n = Math.max(0, Math.min(3, Math.round(lv) || 0));
    if (n !== sealLv) {
      sealLv = n;
      redraw();
    }
    applySeal();
    return sealLv;
  }

  function clearRoot() {
    if (root) {
      scene.remove(root);
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map && o.material.map !== faceTex) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    root = null;
    lockRing = null;
    sealGroup = null;      // 铃铛跟着柜子一起拆了；等级 sealLv 保留（下一关重建时补回来）
    if (faceTex) { faceTex.dispose(); faceTex = null; }
    faceCanvas = null;
    glowMat = null;
  }

  function reset() {
    clearRoot();
    def = null;
    count = 0;
    locked = false;
    lockT = 0;
    flashT = 0;
  }

  // ---------------- 入库 ----------------
  // 任何一只怪死都调它。满了就封柜，返回当前数量。
  function addTag(n = 1) {
    if (!def) return count;
    if (locked) return count;          // 封柜之后不再收牌（玩家只能等它开门）
    count = Math.min(CAP, count + n);
    flashT = 0.45;
    redraw();
    if (fx) {
      fx.burst({ x: def.x, z: def.z }, {
        color: 0xf0e2b8, count: 5, speed: 1.1, life: 0.45, size: 0.07, y: 1.6, up: 0.6, gravity: 2.4,
      });
    }
    if (count >= CAP) {
      locked = true;
      lockT = LOCK_DELAY;
      redraw();
      if (lockRing) lockRing.visible = true;
      if (fx) fx.ring({ x: def.x, z: def.z }, { from: 0.4, to: 3.6, color: 0xffb347, life: 0.7, opacity: 0.85, y: 0.1 });
    }
    return count;
  }

  // 清空所有牌子（输入四位数字正确时调）。返回清掉了几块。
  function takeAll() {
    if (!def || locked) return 0;
    const n = count;
    count = 0;
    redraw();
    if (n > 0 && fx) {
      fx.burst({ x: def.x, z: def.z }, {
        color: 0xbfe8ff, count: 14, speed: 1.6, life: 0.5, size: 0.09, y: 1.4, up: 1.2, gravity: 2.6,
      });
      fx.ring({ x: def.x, z: def.z }, { from: 0.4, to: 3.0, color: 0xbfe8ff, life: 0.5, opacity: 0.8, y: 0.08 });
    }
    return n;
  }

  // 只清计数（重置一局用 reset，那个会把柜子整个拆掉重建；
  // 调试 / 测试里想「把牌子清空但柜子还在」用这个）
  function clearTags() {
    count = 0;
    locked = false;
    lockT = 0;
    redraw();
    if (lockRing) lockRing.visible = false;
    return count;
  }

  // ---------------- 每帧 ----------------
  // ctx: { onSummon() —— 封柜 5 秒到了，把看守放出来 }
  function update(dt, ctx = {}) {
    if (!def) return;
    const dx = playerPos.x - def.x;
    const dz = playerPos.z - def.z;
    const d = Math.hypot(dx, dz);

    // 柜子是实体：把人挡在外面（圆形碰撞，柜子 3 格宽，r 给 1.5 刚好）
    const minD = def.r + playerRadius;
    if (d < minD && d > 1e-4) {
      const k = (minD - d) / d;
      playerPos.x += dx * k;
      playerPos.z += dz * k;
    }

    if (flashT > 0) flashT -= dt;
    if (glowMat) {
      const pulse = locked ? 0.65 + Math.sin(performance.now() * 0.009) * 0.3 : 0;
      glowMat.emissiveIntensity = Math.max(pulse, flashT > 0 ? flashT * 1.6 : 0);
    }

    // ---- 封柜 → 5 秒倒数 → 放看守 ----
    if (locked) {
      lockT -= dt;
      if (lockRing) {
        const k = Math.max(0, Math.min(1, lockT / LOCK_DELAY));
        lockRing.visible = true;
        lockRing.scale.setScalar(2.6 + k * 2.4);      // 环从外往里收：看着就知道还剩多久
        lockRing.material.opacity = 0.28 + (1 - k) * 0.5;
      }
      if (lockT <= 0) {
        locked = false;
        lockT = 0;
        count = 0;
        redraw();
        if (lockRing) { lockRing.visible = false; lockRing.scale.setScalar(1); }
        if (ctx.onSummon) ctx.onSummon(def);
        if (fx) {
          fx.ring({ x: def.x, z: def.z }, { from: 0.5, to: 6.0, color: 0xffca6a, life: 0.8, opacity: 0.95, y: 0.08 });
          fx.burst({ x: def.x, z: def.z }, {
            color: 0xf0e2b8, count: 30, speed: 4.2, life: 0.9, size: 0.15, y: 1.4, up: 2.4,
          });
        }
      }
    }
  }

  return {
    build, update, reset, addTag, takeAll, clearTags, setSeal,
    pos: () => (def ? { x: def.x, z: def.z, r: def.r } : null),
    // 玩家是不是站在可以按「取牌」的范围内
    near: () => {
      if (!def) return false;
      return Math.hypot(playerPos.x - def.x, playerPos.z - def.z) <= RANGE;
    },
    range: () => RANGE,
    count: () => count,
    cap: () => CAP,
    locked: () => locked,
    lockLeft: () => (locked ? Math.max(0, lockT) : 0),
    // 调试 / 测试口
    state: () => ({
      count, cap: CAP, locked, lock: +Math.max(0, lockT).toFixed(2),
      seal: sealLv, chance: tagChance(sealLv),
      x: def ? def.x : 0, z: def ? def.z : 0, r: def ? def.r : 0,
      near: !!(def && Math.hypot(playerPos.x - def.x, playerPos.z - def.z) <= RANGE),
    }),
  };
}
