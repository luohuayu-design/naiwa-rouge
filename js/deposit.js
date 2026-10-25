// ============================================================
// deposit.js —— 第八关「寄存柜」（第 81 块）
// ============================================================
// 剧情接 s08：第七十层平台上的骷髅胸前都挂着一块木牌，牌子上本来刻着名字，
// 被雾吹过之后只剩一道划痕。它们不知道自己是谁，也不知道该往哪儿走，
// 只能站成一排、面朝同一个方向等。
//
// 这一关的平台边上有一个**寄存柜**：死掉的骷髅，木牌会被它收进去。
//
// 【机制一 · 入库】场上每死一只无名者 / 旗手，柜子里的牌子 +1（柜面会看见）。
//   攒满 8 块，柜门打开 —— 它把这一沓牌子**放回场上**：从柜子里走出一支
//   新的队伍，接着排队。所以「杀」本身不是解，杀太快柜子就会溢出来。
//   （这也解释了为什么这层楼的队伍永远散不掉：牌子一直存在这儿。）
//
// 【机制二 · 取牌】站到柜子旁边（3.4 格内）**不动** 1.1 秒，可以取走 2 块。
//   一挪步子就断——这是本关唯一的「主动经营」，你要在队伍扫过来之前
//   赌一个空档，站着不动等进度条走完。
//   为什么不用按键：全程单摇杆，多一个键就多一层学习成本；"站住"本身就是代价。
//
// 【兜底 · 溢出】场上活着的队伍超过 12 只时，柜子不再放人（不然会滚雪球到卡帧），
//   改成**放电**：柜子周围 8 格，预警 1.5 秒，圈内掉 3 血。跑出去就能躲。
//
// 视觉全部程序化（一个柜体 + 一张 canvas 柜面），零新资产：
// 柜面画 3×3 的寄存格，每进一块牌子就填一格，满了整面发黄光。
// ============================================================
import * as THREE from '../lib/three.module.js?v=93';

export function createDeposit({ scene, fx, playerPos, playerRadius = 0.32, hurtPlayer }) {
  const CAP = 8;           // 满柜需要几块牌子
  const TAKE = 2;          // 一次取走几块
  const HOLD = 1.1;        // 站桩多久取一次
  const OPEN_DELAY = 3.0;  // 满柜后多久开门（留出跑过去取牌的时间）
  const RANGE = 3.4;       // 取牌距离
  const SQUAD_MAX = 12;    // 场上队伍活口上限（超过就改成放电）
  const ZAP_R = 8.0;       // 放电半径
  const ZAP_WARN = 1.5;    // 放电预警时长
  const ZAP_DMG = 3;

  let def = null;
  let root = null;
  let faceTex = null;
  let faceCanvas = null;
  let glowMat = null;

  let count = 0;
  let holdT = 0;           // 取牌进度
  let openT = 0;           // >0：满柜后正在倒计时开门
  let zapT = 0;            // >0：放电预警剩余
  let zapActive = false;
  let flashT = 0;
  let lastX = 0, lastZ = 0;
  let warnRing = null;
  let holdRing = null;
  let tagMesh = null;      // 「+1」飘字用不上 fx 时的小兜底（保留位）

  // ---------------- 柜面（canvas） ----------------
  // 3×3 的寄存格：填满的格子放一块木牌（和无名者胸口那块同款），空格子黑着。
  // 右边留一条窄栏写「5 / 8」，让玩家一眼知道还差几块。
  function redraw() {
    if (!faceCanvas) return;
    const W = faceCanvas.width, H = faceCanvas.height;
    const g = faceCanvas.getContext('2d');
    // 柜体木色底
    g.fillStyle = '#3c2f21';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(20,14,9,0.9)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);

    const cols = 3, rows = 3;
    const padX = 34, padY = 30, gap = 14;
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
        g.fillStyle = '#8a6b45';
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

    // 计数（右下角）：满柜时变黄
    const full = count >= CAP;
    g.fillStyle = full ? '#ffd98a' : 'rgba(220,210,186,0.85)';
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(`${count} / ${CAP}`, W - 16, H - 6);

    if (faceTex) faceTex.needsUpdate = true;
  }

  // ---------------- 建造 ----------------
  function build(d) {
    reset();
    if (!d || typeof document === 'undefined') {
      def = d ? { x: d.x, z: d.z, r: d.r || 1.5, headcount: d.headcount || 6 } : null;
      return;
    }
    def = { x: d.x, z: d.z, r: d.r || 1.5, headcount: d.headcount || 6 };
    count = 0;
    holdT = 0;
    openT = 0;
    zapT = 0;
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
    faceCanvas.height = 340;
    faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    glowMat = new THREE.MeshStandardMaterial({
      map: faceTex, roughness: 0.86, metalness: 0.02,
      emissive: new THREE.Color(0xffb84a), emissiveIntensity: 0,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.72, 1.80), glowMat);
    face.position.set(0, 1.14, 0.512);
    root.add(face);

    // 柜子顶上挂一盏小灯：夜里隔着半个场地也看得出「那边有个柜子」
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffca6a, transparent: true, opacity: 0.85 })
    );
    lamp.position.set(0, 2.44, 0.42);
    root.add(lamp);

    // 满柜时的地面光斑（平时透明）
    warnRing = new THREE.Mesh(
      new THREE.RingGeometry(ZAP_R * 0.94, ZAP_R, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff8a3c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    warnRing.position.set(0, 0.05, 0);
    warnRing.visible = false;
    root.add(warnRing);

    // 取牌进度环（画在玩家脚下，不挂在柜子上）
    holdRing = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.66, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false,
      })
    );
    holdRing.visible = false;
    scene.add(holdRing);

    scene.add(root);
    redraw();
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
    if (warnRing) warnRing = null;
    if (holdRing) { scene.remove(holdRing); holdRing.geometry.dispose(); holdRing.material.dispose(); holdRing = null; }
    if (faceTex) { faceTex.dispose(); faceTex = null; }
    faceCanvas = null;
    glowMat = null;
  }

  function reset() {
    clearRoot();
    def = null;
    count = 0;
    holdT = 0;
    openT = 0;
    zapT = 0;
    zapActive = false;
    flashT = 0;
  }

  // ---------------- 入库 ----------------
  function addTag(n = 1) {
    if (!def) return count;
    count = Math.min(CAP, count + n);
    flashT = 0.45;
    redraw();
    if (fx) {
      fx.burst({ x: def.x, z: def.z }, {
        color: 0xf0e2b8, count: 5, speed: 1.1, life: 0.45, size: 0.07, y: 1.6, up: 0.6, gravity: 2.4,
      });
    }
    return count;
  }

  // 只清计数（重置一局用 reset，那个会把柜子整个拆掉重建；
  // 调试 / 测试里想「把牌子清空但柜子还在」用这个）
  function clearTags() {
    count = 0;
    holdT = 0;
    openT = 0;
    zapT = 0;
    redraw();
    return count;
  }

  // ---------------- 每帧 ----------------
  // ctx: { squadAlive, onRelease(headcount) }
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
      const full = count >= CAP;
      const pulse = full ? 0.55 + Math.sin(performance.now() * 0.006) * 0.25 : 0;
      glowMat.emissiveIntensity = Math.max(pulse, flashT > 0 ? flashT * 1.6 : 0);
    }

    // ---- 满柜 → 倒计时开门 ----
    if (count >= CAP && openT <= 0 && zapT <= 0) {
      openT = OPEN_DELAY;
      if (fx) fx.ring({ x: def.x, z: def.z }, { from: 0.4, to: 3.4, color: 0xffca6a, life: 0.6, opacity: 0.8, y: 0.1 });
    }
    if (openT > 0) {
      openT -= dt;
      if (openT <= 0) {
        openT = 0;
        const alive = ctx.squadAlive ? ctx.squadAlive() : 0;
        if (alive >= SQUAD_MAX) {
          // 场上人太多：不再放人，改成放电（可躲）
          zapT = ZAP_WARN;
          if (warnRing) warnRing.visible = true;
        } else {
          count = 0;
          redraw();
          if (ctx.onRelease) ctx.onRelease(def.headcount || 6);
          if (fx) {
            fx.ring({ x: def.x, z: def.z }, { from: 0.5, to: 5.5, color: 0xffca6a, life: 0.7, opacity: 0.9, y: 0.08 });
            fx.burst({ x: def.x, z: def.z }, {
              color: 0xf0e2b8, count: 26, speed: 4.0, life: 0.8, size: 0.14, y: 1.4, up: 2.2,
            });
          }
        }
      }
    }

    // ---- 放电（预警 → 结算）----
    if (zapT > 0) {
      zapT -= dt;
      const k = 1 - Math.max(0, zapT) / ZAP_WARN;
      if (warnRing) {
        warnRing.visible = true;
        warnRing.material.opacity = 0.25 + Math.sin(performance.now() * 0.02) * 0.18;
        warnRing.scale.setScalar(1 - k * 0.10);
      }
      if (zapT <= 0) {
        // 结算：圈内掉血
        const inside = Math.hypot(playerPos.x - def.x, playerPos.z - def.z) <= ZAP_R;
        if (warnRing) { warnRing.visible = false; warnRing.scale.setScalar(1); }
        count = 0;
        redraw();
        if (inside && hurtPlayer) hurtPlayer(ZAP_DMG, null);
        if (fx) {
          fx.ring({ x: def.x, z: def.z }, { from: 0.4, to: ZAP_R, color: 0xff8a3c, life: 0.5, opacity: 0.85, y: 0.1 });
        }
      }
    }

    // ---- 取牌：站住不动 1.1 秒 ----
    const moved = Math.hypot(playerPos.x - lastX, playerPos.z - lastZ);
    const inRange = d <= RANGE;
    const moving = moved > 0.035;
    if (inRange && !moving && count > 0 && openT <= 0 && zapT <= 0) {
      holdT += dt;
      if (holdT >= HOLD) {
        holdT = 0;
        count = Math.max(0, count - TAKE);
        redraw();
        if (fx) fx.burst({ x: def.x, z: def.z }, {
          color: 0xbfe8ff, count: 6, speed: 1.2, life: 0.4, size: 0.07, y: 1.5, up: 0.8, gravity: 2.6,
        });
      }
    } else if (moving || !inRange) {
      holdT = 0;
    }
    lastX = playerPos.x;
    lastZ = playerPos.z;

    if (holdRing) {
      if (holdT > 0.001) {
        holdRing.visible = true;
        holdRing.position.set(playerPos.x, 0.06, playerPos.z);
        const k = holdT / HOLD;
        holdRing.scale.setScalar(0.6 + k * 0.5);
        holdRing.material.opacity = 0.35 + k * 0.55;
      } else {
        holdRing.visible = false;
      }
    }
  }

  return {
    build, update, reset, addTag, clearTags,
    pos: () => (def ? { x: def.x, z: def.z, r: def.r } : null),
    // 调试 / 测试口
    state: () => ({
      count, cap: CAP, hold: +holdT.toFixed(2), open: +openT.toFixed(2),
      zap: +zapT.toFixed(2), x: def ? def.x : 0, z: def ? def.z : 0, r: def ? def.r : 0,
    }),
    count: () => count,
    cap: () => CAP,
  };
}
