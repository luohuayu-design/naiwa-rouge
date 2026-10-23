// ============================================================
// scene.js —— 深夜场景（两套皮肤）
//
// 只负责「看起来像什么」这一件事：地面、月光、雾、萤火虫、边界石圈。
// 第 20 块加了第二关的主题：同样是深夜，但换成骨塔庭院的紫雾与枯土，
// 一进关就能感觉到「这已经不是荒草地了」。
//
// 两套配色集中在 THEMES 里，buildNightScene({ theme }) 建哪套，
// 局中要换就调返回的 setTheme('crypt')（不改几何，只改颜色和贴图）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=64';

export const THEMES = {
  // 第一关 · 荒草地：冷月光 + 青绿边圈 + 萤火虫
  meadow: {
    bg: 0x0b1319,
    fog: 0x0d1f2b, fogDensity: 0.0175,
    hemiSky: 0x4a6f96, hemiGround: 0x112218, hemiIntensity: 1.15,
    moon: 0xc7dcff, moonIntensity: 2.95, moonBase: 2.7,
    rim: 0x3f7f74, rimIntensity: 0.62,
    edge: 0x7be6bd, edgeOpacity: 0.30,
    stone: 0x35473f,
    tuft: 0x437a56, tuftVisible: true,
    fly: 0xe6ff9e, flyCount: 90,
    ground: 'grass',
  },
  // 第二关 · 骨塔庭院：紫雾 + 枯土 + 游魂火星，边圈是咒术的紫色
  // 第 53 块（用户反馈「二关太暗」）：底色、雾色、天光、月光整条提亮，
  // 雾也放淡了一档 —— 之前紫雾压到 0.0152，远处石头和怪几乎糊进背景里。
  crypt: {
    bg: 0x191327,
    fog: 0x2a1c46, fogDensity: 0.0122,
    hemiSky: 0x8f6cc4, hemiGround: 0x2a2040, hemiIntensity: 1.55,
    moon: 0xdcc9ff, moonIntensity: 3.30, moonBase: 3.10,
    rim: 0x7a3fa0, rimIntensity: 0.95,
    edge: 0xa96bff, edgeOpacity: 0.34,
    stone: 0x39324a,
    tuft: 0x3a3050, tuftVisible: false,   // 骨塔的院子不长草
    fly: 0xc08cff, flyCount: 72,          // 换成飘着的游魂火星
    ground: 'crypt',
  },
  // 第三关 · 焦土钟楼：暗红余烬 + 铁灰，边圈是没灭的残火（第 29 块）
  // 第 53 块：和 crypt 一起提亮（炭红本来就吃光，不提的话整屏是黑的）。
  ash: {
    bg: 0x1d1311,
    fog: 0x3d2118, fogDensity: 0.0132,
    hemiSky: 0xb06a52, hemiGround: 0x3a201a, hemiIntensity: 1.55,
    moon: 0xffc9a8, moonIntensity: 3.30, moonBase: 3.10,
    rim: 0x9a4a24, rimIntensity: 0.95,
    edge: 0xff8a3c, edgeOpacity: 0.34,
    stone: 0x4a3a34,
    tuft: 0x4a3630, tuftVisible: false,   // 焦土上不长草
    fly: 0xffb066, flyCount: 78,         // 飘着的火星
    ground: 'ash',
  },
  // 第四关 · 雾堤服务区：青灰霜面 + 浓雾，边圈是路灯没关的那盏（第 35 块）
  fog: {
    bg: 0x0c1214,
    fog: 0x1a2a30, fogDensity: 0.0205,    // 雾堤：四关里最浓的一层
    hemiSky: 0x5a8a96, hemiGround: 0x0f1a1e, hemiIntensity: 1.02,
    moon: 0xbfe4e8, moonIntensity: 2.45, moonBase: 2.25,
    rim: 0x3f8a96, rimIntensity: 0.66,
    edge: 0x6fd8e0, edgeOpacity: 0.32,
    stone: 0x33474a,
    tuft: 0x3a5a58, tuftVisible: true,    // 霜打过的枯草还立着
    fly: 0x9fe8e0, flyCount: 110,         // 雾珠
    ground: 'fog',
  },
};

export function buildNightScene({ arenaRadius = 15, theme = 'meadow' } = {}) {
  const TH = THEMES[theme] || THEMES.meadow;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TH.bg);
  scene.fog = new THREE.FogExp2(TH.fog, TH.fogDensity);

  // ---------------- 灯光：冷月光 + 环境天光 ----------------
  const hemi = new THREE.HemisphereLight(TH.hemiSky, TH.hemiGround, TH.hemiIntensity);
  scene.add(hemi);

  const moonLight = new THREE.DirectionalLight(TH.moon, TH.moonIntensity);
  moonLight.position.set(-11, 17, 9);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 48;
  const S = arenaRadius + 8;
  moonLight.shadow.camera.left = -S;
  moonLight.shadow.camera.right = S;
  moonLight.shadow.camera.top = S;
  moonLight.shadow.camera.bottom = -S;
  moonLight.shadow.bias = -0.0006;
  moonLight.shadow.normalBias = 0.02;
  scene.add(moonLight);
  scene.add(moonLight.target);

  // 一点点偏青的补光，避免背光面死黑
  const rim = new THREE.DirectionalLight(TH.rim, TH.rimIntensity);
  rim.position.set(9, 6, -12);
  scene.add(rim);

  // ---------------- 地面 ----------------
  const groundMat = new THREE.MeshStandardMaterial({ map: makeGroundTexture(TH.ground), roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------- 边界：发光草圈 + 石头 ----------------
  const ringGeo = new THREE.RingGeometry(arenaRadius - 0.22, arenaRadius + 0.02, 160);
  const ringMat = new THREE.MeshBasicMaterial({
    color: TH.edge, transparent: true, opacity: 0.42,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  scene.add(ring);

  // 石头沿边界一圈：给「走到头了」一个明确的视觉反馈
  const stoneGeo = new THREE.IcosahedronGeometry(0.45, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: TH.stone, roughness: 0.95, flatShading: true });
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
  // 摆放逻辑抽成函数（第 33 块）：第三关场地更大，setArena 时按新半径重摆一遍
  function placeStones(radius) {
    for (let i = 0; i < STONES; i++) {
      const a = (i / STONES) * Math.PI * 2 + rnd() * 0.08;
      const r = radius + 0.55 + rnd() * 0.3;
      p.set(Math.cos(a) * r, 0.18 + rnd() * 0.1, Math.sin(a) * r);
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      q.setFromEuler(e);
      const s = 0.7 + rnd() * 0.9;
      sc.set(s * 1.2, s * 0.8, s);
      m4.compose(p, q, sc);
      stones.setMatrixAt(i, m4);
    }
    stones.instanceMatrix.needsUpdate = true;
  }
  placeStones(arenaRadius);
  scene.add(stones);

  // ---------------- 草丛（细锥体，纯粹是地面细节） ----------------
  const tuftGeo = new THREE.ConeGeometry(0.055, 0.34, 4, 1, true);
  const tuftMat = new THREE.MeshStandardMaterial({
    color: TH.tuft, roughness: 1, side: THREE.DoubleSide, flatShading: true,
  });
  const TUFTS = 900;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  function placeTufts(radius) {
    for (let i = 0; i < TUFTS; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * (radius + 5);
      p.set(Math.cos(a) * r, 0.14 + rnd() * 0.06, Math.sin(a) * r);
      e.set((rnd() - 0.5) * 0.45, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.45);
      q.setFromEuler(e);
      const s = 0.6 + rnd() * 1.1;
      sc.set(s, s * (0.8 + rnd() * 0.6), s);
      m4.compose(p, q, sc);
      tufts.setMatrixAt(i, m4);
    }
    tufts.instanceMatrix.needsUpdate = true;
  }
  placeTufts(arenaRadius);
  tufts.visible = TH.tuftVisible;   // 骨塔庭院不长草
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
    color: TH.fly, size: 0.13, transparent: true, opacity: 0.8,
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

  // ---------------- 主题切换（第 20 块：一关/二关两套皮肤） ----------------
  // 只改颜色、雾和地面贴图，不重建几何 —— 开局切一次，开销可以忽略。
  let edgeBase = TH.edgeOpacity;
  let moonBase = TH.moonBase;
  const texCache = { [TH.ground]: groundMat.map };

  function setTheme(name) {
    const t = THEMES[name] || THEMES.meadow;
    scene.background.set(t.bg);
    scene.fog.color.set(t.fog);
    scene.fog.density = t.fogDensity;
    hemi.color.set(t.hemiSky);
    hemi.groundColor.set(t.hemiGround);
    hemi.intensity = t.hemiIntensity;
    moonLight.color.set(t.moon);
    moonLight.intensity = t.moonIntensity;
    moonBase = t.moonBase;
    rim.color.set(t.rim);
    rim.intensity = t.rimIntensity;
    ringMat.color.set(t.edge);
    edgeBase = t.edgeOpacity;
    stoneMat.color.set(t.stone);
    tuftMat.color.set(t.tuft);
    tufts.visible = t.tuftVisible;
    flyMat.color.set(t.fly);
    if (!texCache[t.ground]) texCache[t.ground] = makeGroundTexture(t.ground);
    groundMat.map = texCache[t.ground];
    groundMat.needsUpdate = true;
    return name;
  }

  // ---------------- 场地半径（第 33 块）：第三关场地更大 ----------------
  // 只重摆边界圈、石头、草丛和萤火虫的分布；灯光 / 雾 / 地面（半径 90 的大圆）不动。
  function setArena(radius) {
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(radius - 0.22, radius + 0.02, 160);
    placeStones(radius);
    placeTufts(radius);
    for (let i = 0; i < FLIES; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * (radius + 2);
      const d = flyData[i];
      d.bx = Math.cos(a) * r;
      d.bz = Math.sin(a) * r;
      flyPos[i * 3] = d.bx;
      flyPos[i * 3 + 2] = d.bz;
    }
    flyGeo.attributes.position.needsUpdate = true;
    return radius;
  }

  // ---------------- 每帧动画 ----------------
  const clock = { t: 0 };
  function update(dt) {
    clock.t += dt;
    const t = clock.t;

    // 边界呼吸
    ringMat.opacity = edgeBase + Math.sin(t * 1.6) * 0.10;

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
    moonLight.intensity = moonBase + Math.sin(t * 0.35) * 0.15;
  }

  return { scene, update, moonLight, setTheme, setArena };
}

// ------------------------------------------------------------
// 地面贴图：按主题选一套（都平铺 16×16）
// ------------------------------------------------------------
function makeGroundTexture(kind) {
  if (kind === 'crypt') return makeCryptTexture();
  if (kind === 'ash') return makeAshTexture();
  if (kind === 'fog') return makeFogTexture();
  return makeGrassTexture();
}

// 雾堤服务区的地面：青灰霜面 + 霜斑 + 老裂缝（第 35 块）。
// 火烧过的地方霜来得最早：底色是冷的青灰，霜是一块块发白的补丁。
function makeFogTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#1e2a2c';
  g.fillRect(0, 0, S, S);

  let seed = 552019;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 大块明暗：压实的沥青 / 霜厚的水泥面
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 80;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.42;
    rad.addColorStop(0, dark ? 'rgba(8,14,16,0.44)' : 'rgba(120,168,172,0.22)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 颗粒：霜屑 + 沥青渣
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.7 + rnd() * 1.6;
    const a = 0.10 + rnd() * 0.22;
    if (rnd() > 0.90) {
      g.fillStyle = `rgba(206,238,240,${0.16 + rnd() * 0.26})`;   // 霜屑
    } else {
      g.fillStyle = rnd() > 0.5 ? `rgba(96,120,124,${a})` : `rgba(8,12,14,${a + 0.10})`;
    }
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 一块块发白的霜斑（服务区水泥地化霜化了一半的样子）
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 34;
    g.fillStyle = `rgba(190,226,230,${0.05 + rnd() * 0.09})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // 老裂缝：比焦土细、发白（霜塞进缝里了）
  g.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.strokeStyle = `rgba(150,190,196,${0.14 + rnd() * 0.18})`;
    g.lineWidth = 0.8 + rnd() * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 4 + (rnd() * 4 | 0);
    for (let k = 0; k < steps; k++) {
      x += (rnd() - 0.5) * 54;
      y += (rnd() - 0.5) * 54;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 焦土钟楼的地面：暗红褐土 + 烧裂的缝 + 余烬亮点（第 29 块）。
// 和枯土同一套做法（大块明暗 + 细碎颗粒 + 裂缝），只是配色走炭红。
function makeAshTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  // 第 53 块：炭红底色提一档（#2a1c18 → #3b2822），不然整屏只有边圈是亮的
  g.fillStyle = '#3b2822';
  g.fillRect(0, 0, S, S);

  let seed = 771203;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 大块明暗：踩实的焦土 / 冷却下来的灰坑
  for (let i = 0; i < 170; i++) {
    const x = rnd() * S, y = rnd() * S, r = 22 + rnd() * 78;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.46;
    rad.addColorStop(0, dark ? 'rgba(14,8,7,0.46)' : 'rgba(96,52,34,0.26)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 颗粒：灰色灰烬 + 少数还亮着的余烬
  for (let i = 0; i < 2800; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.7 + rnd() * 1.7;
    const a = 0.10 + rnd() * 0.24;
    if (rnd() > 0.965) {
      g.fillStyle = `rgba(255,138,60,${0.22 + rnd() * 0.30})`;   // 余烬
    } else {
      g.fillStyle = rnd() > 0.45 ? `rgba(150,132,120,${a})` : `rgba(12,7,6,${a + 0.12})`;
    }
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 烧裂的缝：比枯土更直更硬（像被火烧开的地面）
  g.lineCap = 'round';
  for (let i = 0; i < 30; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.strokeStyle = `rgba(10,5,4,${0.20 + rnd() * 0.24})`;
    g.lineWidth = 0.9 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 26;
      y += (rnd() - 0.5) * 16;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 骨塔庭院的枯土：灰紫石地 + 碎骨渣，一点绿色都没有。
// 和草地贴图一样，细节做在平铺接缝里，看不出格子。
function makeCryptTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  // 第 53 块：底色提一档（#2b2338 → #3a3050），配合天光提亮，枯土不再糊成一片
  g.fillStyle = '#3a3050';
  g.fillRect(0, 0, S, S);

  let seed = 424271;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 大块明暗：被踩实的土 / 积灰的洼地
  for (let i = 0; i < 170; i++) {
    const x = rnd() * S, y = rnd() * S, r = 22 + rnd() * 78;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.48;
    rad.addColorStop(0, dark ? 'rgba(16,11,24,0.45)' : 'rgba(74,63,96,0.30)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 碎石与骨渣：细小的亮点/暗点，是「枯」的关键细节
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.7 + rnd() * 1.7;
    const a = 0.10 + rnd() * 0.26;
    g.fillStyle = rnd() > 0.42 ? `rgba(150,138,175,${a})` : `rgba(14,9,20,${a + 0.12})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 几道干裂的缝
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.strokeStyle = `rgba(12,8,18,${0.18 + rnd() * 0.22})`;
    g.lineWidth = 0.9 + rnd() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    let len = 4;
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 22;
      y += (rnd() - 0.5) * 22;
      len += 4;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
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
