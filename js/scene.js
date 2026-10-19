// ============================================================
// scene.js —— 深夜草地竞技场
//
// 只负责「看起来像深夜草地」这一件事：地面、月光、雾、萤火虫、
// 边界石圈。战斗/敌人都还没进来，所以这里没有任何逻辑，
// 只有 buildNightScene() 和每帧的 update()。
// ============================================================
import * as THREE from 'three';

export function buildNightScene({ arenaRadius = 15 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1319);
  scene.fog = new THREE.FogExp2(0x0d1f2b, 0.0175);

  // ---------------- 灯光：冷月光 + 环境天光 ----------------
  const hemi = new THREE.HemisphereLight(0x4a6f96, 0x112218, 1.15);
  scene.add(hemi);

  const moonLight = new THREE.DirectionalLight(0xc7dcff, 2.95);
  moonLight.position.set(-11, 17, 9);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 48;
  const S = arenaRadius + 4;
  moonLight.shadow.camera.left = -S;
  moonLight.shadow.camera.right = S;
  moonLight.shadow.camera.top = S;
  moonLight.shadow.camera.bottom = -S;
  moonLight.shadow.bias = -0.0006;
  moonLight.shadow.normalBias = 0.02;
  scene.add(moonLight);
  scene.add(moonLight.target);

  // 一点点偏青的补光，避免背光面死黑
  const rim = new THREE.DirectionalLight(0x3f7f74, 0.62);
  rim.position.set(9, 6, -12);
  scene.add(rim);

  // ---------------- 地面 ----------------
  const grassTex = makeGrassTexture();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(90, 96),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------- 边界：发光草圈 + 石头 ----------------
  const ringGeo = new THREE.RingGeometry(arenaRadius - 0.22, arenaRadius + 0.02, 160);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x7be6bd, transparent: true, opacity: 0.42,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  scene.add(ring);

  // 石头沿边界一圈：给「走到头了」一个明确的视觉反馈
  const stoneGeo = new THREE.IcosahedronGeometry(0.45, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x35473f, roughness: 0.95, flatShading: true });
  const STONES = 26;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, STONES);
  stones.castShadow = true;
  stones.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let seed = 20261019;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < STONES; i++) {
    const a = (i / STONES) * Math.PI * 2 + rnd() * 0.08;
    const r = arenaRadius + 0.55 + rnd() * 0.3;
    p.set(Math.cos(a) * r, 0.18 + rnd() * 0.1, Math.sin(a) * r);
    e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    q.setFromEuler(e);
    const s = 0.7 + rnd() * 0.9;
    sc.set(s * 1.2, s * 0.8, s);
    m4.compose(p, q, sc);
    stones.setMatrixAt(i, m4);
  }
  stones.instanceMatrix.needsUpdate = true;
  scene.add(stones);

  // ---------------- 草丛（细锥体，纯粹是地面细节） ----------------
  const tuftGeo = new THREE.ConeGeometry(0.055, 0.34, 4, 1, true);
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0x437a56, roughness: 1, side: THREE.DoubleSide, flatShading: true,
  });
  const TUFTS = 900;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  for (let i = 0; i < TUFTS; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (arenaRadius + 5);
    p.set(Math.cos(a) * r, 0.14 + rnd() * 0.06, Math.sin(a) * r);
    e.set((rnd() - 0.5) * 0.45, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.45);
    q.setFromEuler(e);
    const s = 0.6 + rnd() * 1.1;
    sc.set(s, s * (0.8 + rnd() * 0.6), s);
    m4.compose(p, q, sc);
    tufts.setMatrixAt(i, m4);
  }
  tufts.instanceMatrix.needsUpdate = true;
  scene.add(tufts);

  // ---------------- 萤火虫 ----------------
  const FLIES = 90;
  const flyPos = new Float32Array(FLIES * 3);
  const flyData = [];
  for (let i = 0; i < FLIES; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (arenaRadius + 2);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const by = 0.5 + rnd() * 1.9;
    flyData.push({ bx, by, bz, ph: rnd() * Math.PI * 2, sp: 0.4 + rnd() * 0.7, amp: 0.3 + rnd() * 0.7 });
    flyPos[i * 3] = bx; flyPos[i * 3 + 1] = by; flyPos[i * 3 + 2] = bz;
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flyMat = new THREE.PointsMaterial({
    color: 0xe6ff9e, size: 0.13, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const flies = new THREE.Points(flyGeo, flyMat);
  scene.add(flies);

  // ---------------- 星空 + 月亮 ----------------
  const starPos = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.12 + rnd() * 0.85;
    const r = 70;
    const h = Math.sqrt(Math.max(0, 1 - y * y));
    starPos[i * 3] = Math.cos(a) * h * r;
    starPos[i * 3 + 1] = y * r;
    starPos[i * 3 + 2] = Math.sin(a) * h * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfe2ff, size: 0.55, transparent: true, opacity: 0.75,
    depthWrite: false, fog: false, sizeAttenuation: true,
  }));
  scene.add(stars);

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeMoonTexture(), transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, opacity: 0.95,
  }));
  moon.position.set(-30, 30, -46);
  moon.scale.setScalar(20);
  scene.add(moon);

  // ---------------- 每帧动画 ----------------
  const clock = { t: 0 };
  function update(dt) {
    clock.t += dt;
    const t = clock.t;

    // 边界呼吸
    ringMat.opacity = 0.30 + Math.sin(t * 1.6) * 0.10;

    // 萤火虫：慢速游走 + 呼吸
    const arr = flyGeo.attributes.position.array;
    for (let i = 0; i < FLIES; i++) {
      const f = flyData[i];
      arr[i * 3] = f.bx + Math.sin(t * f.sp + f.ph) * f.amp;
      arr[i * 3 + 1] = f.by + Math.sin(t * f.sp * 0.8 + f.ph * 1.7) * 0.28;
      arr[i * 3 + 2] = f.bz + Math.cos(t * f.sp * 0.6 + f.ph) * f.amp;
    }
    flyGeo.attributes.position.needsUpdate = true;
    flyMat.opacity = 0.55 + Math.sin(t * 1.3) * 0.22;

    // 月光给个极慢的强弱变化，画面不至于死板
    moonLight.intensity = 2.7 + Math.sin(t * 0.35) * 0.15;
  }

  return { scene, update, moonLight };
}

// ------------------------------------------------------------
// 程序化草地贴图（512×512，平铺）
// ------------------------------------------------------------
function makeGrassTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#26402f';
  g.fillRect(0, 0, S, S);

  // 大块明暗斑（模拟草皮的深浅）
  let seed = 99173;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 150; i++) {
    const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 70;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.5;
    rad.addColorStop(0, dark ? 'rgba(12,26,17,0.42)' : 'rgba(66,116,74,0.32)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 草叶短线：把平铺接缝藏在细节里
  g.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * S, y = rnd() * S;
    const len = 3 + rnd() * 7;
    const lean = (rnd() - 0.5) * 4;
    const a = 0.10 + rnd() * 0.22;
    g.strokeStyle = rnd() > 0.35 ? `rgba(96,152,102,${a})` : `rgba(30,54,38,${a + 0.1})`;
    g.lineWidth = 0.8 + rnd() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + lean, y - len);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 月亮：一张径向渐变贴图，Sprite 永远面向相机，不需要额外几何
function makeMoonTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;

  const halo = g.createRadialGradient(c, c, S * 0.14, c, c, c);
  halo.addColorStop(0, 'rgba(226,240,255,0.95)');
  halo.addColorStop(0.22, 'rgba(198,220,255,0.55)');
  halo.addColorStop(0.55, 'rgba(150,185,240,0.16)');
  halo.addColorStop(1, 'rgba(120,160,220,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);

  g.fillStyle = 'rgba(244,249,255,0.98)';
  g.beginPath(); g.arc(c, c, S * 0.14, 0, Math.PI * 2); g.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
