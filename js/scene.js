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
import * as THREE from '../lib/three.module.js?v=144';

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
  // 第五关 · 草甸路口：土黄路面 + 油灯的黄，边圈是蛙爷摊子那盏灯的暖色（第 63 块）
  // 和前四关最大的不同：这一关画**四条路**（见 buildLanes）—— 刷怪只从路上来。
  crossroad: {
    bg: 0x0e1410,
    fog: 0x1b2a22, fogDensity: 0.0162,
    hemiSky: 0x6a8f7a, hemiGround: 0x141d16, hemiIntensity: 1.14,
    moon: 0xd6e8d8, moonIntensity: 2.80, moonBase: 2.60,
    rim: 0x6a8a52, rimIntensity: 0.74,
    edge: 0xd8c46a, edgeOpacity: 0.34,      // 油灯黄，不是草圈的青
    stone: 0x4a4436,
    tuft: 0x4a6a3a, tuftVisible: true,
    fly: 0xffe08a, flyCount: 96,            // 灯蛾
    ground: 'crossroad',
    lanes: 4,                               // 画四条路 + 四盏路口灯
  },
  // 第六关 · 骨塔机房：冷灰格栅 + 服务器指示灯的蓝绿（第 63 块）
  // 这一关没有地表（一路往下都是铁），所以草丛关掉、石头换成机柜的灰。
  server: {
    bg: 0x0a0e12,
    fog: 0x16222a, fogDensity: 0.0148,
    hemiSky: 0x4a7a8a, hemiGround: 0x0c1216, hemiIntensity: 1.06,
    moon: 0xbfe8ff, moonIntensity: 2.60, moonBase: 2.40,
    rim: 0x2a6a8a, rimIntensity: 0.88,
    edge: 0x5fd8ff, edgeOpacity: 0.34,
    stone: 0x2a3238,
    tuft: 0x2a3238, tuftVisible: false,
    fly: 0x8ff0ff, flyCount: 84,            // 飘着的电尘
    ground: 'server',
  },
  // 第七关 · 骨塔井底（第 71 块）：深井蓝绿微光 + 湿壁 + 滴落水珠，纯配色零新几何
  well: {
    bg: 0x07131a,
    fog: 0x0c2630, fogDensity: 0.019,
    hemiSky: 0x3a7a86, hemiGround: 0x08171c, hemiIntensity: 1.0,
    moon: 0xbfeef0, moonIntensity: 2.4, moonBase: 2.2,
    rim: 0x2a7a86, rimIntensity: 0.70,
    edge: 0x57e6d0, edgeOpacity: 0.32,      // 井壁渗出的青绿微光
    stone: 0x2a3a40,
    tuft: 0x2a4a48, tuftVisible: false,
    fly: 0x8fe8e0, flyCount: 70,            // 井里的水珠 / 浮尘
    ground: 'well',
  },
  // 第八关 · 骨塔寄存层（第 81 块）：骨白 + 灰绿 + 白雾
  //
  // 前七关的色调是一条越走越冷的线：草地的青绿 → 庭院的紫 → 钟楼的炭红 →
  // 服务区的霜青 → 路口的暖黄 → 机房的蓝绿 → 井底的青蓝。
  // 这里第一次**没有颜色倾向**：骨塔七十层是存放牌位的地方，只有骨、灰、白，
  // 所以要「苍」—— 底色压成冷灰，天光偏骨白，雾是干燥的白雾（不是水汽）。
  // 第八关的压迫感全来自「队伍在动」，场景必须安静、寡淡，一点多余的光都不要。
  ossuary: {
    bg: 0x131519,
    fog: 0x2b3036, fogDensity: 0.0128,
    hemiSky: 0xa8b8bc, hemiGround: 0x2a2620, hemiIntensity: 1.50,
    moon: 0xeaf2e6, moonIntensity: 3.25, moonBase: 3.05,
    rim: 0x8aa08e, rimIntensity: 0.88,
    edge: 0xc8dcb8, edgeOpacity: 0.30,      // 平台边沿一圈褪色的骨白
    stone: 0x3a4046,
    tuft: 0x39443a, tuftVisible: false,     // 寄存层当然没有草
    fly: 0xdcecc8, flyCount: 64,            // 飘着的骨粉 / 纸灰
    ground: 'ossuary',
  },
  // 第九关 · 骨塔登记庭（第 82 块）：鎏金 + 墨。
  //
  // 前八关走过了一条很长的色调线：草地青绿 → 庭院紫 → 钟楼炭红 → 服务区霜青 →
  // 路口暖黄 → 机房蓝绿 → 井底青蓝 → 寄存层无色（骨白灰）。第九十九层是尽头，
  // 门认字、簿子在页码上堆着一整套规矩 —— 所以这里第一次出现**贵重的颜色**：
  // 暖金压在一层墨色石面上。这不是为了好看：称量官上称那一片金光、被记名的怪
  // 脚下的金环，都得和地面、边框是同一套金 —— 玩家才会把「金色」和「记账」绑在一起。
  registry: {
    bg: 0x14110d,
    fog: 0x2e2820, fogDensity: 0.0132,
    hemiSky: 0xc0a86a, hemiGround: 0x2a2418, hemiIntensity: 1.42,
    moon: 0xfff0c4, moonIntensity: 3.15, moonBase: 2.95,
    rim: 0x8a6a24, rimIntensity: 0.92,
    edge: 0xffd86b, edgeOpacity: 0.34,      // 九十九层平台的鎏金边
    stone: 0x4a4234,
    tuft: 0x4a4234, tuftVisible: false,     // 登记庭是石地，不长草
    fly: 0xffe08a, flyCount: 88,            // 飘着的金粉
    ground: 'registry',
  },
  // 第十关 · 塔顶井台（第 107 块）：夜空直接压在头顶，地面是**湿的**墨蓝石板。
  // 配色思路：整关只有两个颜色 —— 井水的冷青（边圈 / 萤火 / 月光都偏青）
  // 和井沿那一点暖黄（rim 用暖色，把中间的井口衬出来）。
  // 比第九关暗一档（fogDensity 0.0132 → 0.0152）：塔顶没有墙，光留不住。
  welltop: {
    bg: 0x070c12,
    fog: 0x0e1822, fogDensity: 0.0152,
    hemiSky: 0x5a7fa8, hemiGround: 0x0b121a, hemiIntensity: 1.28,
    moon: 0xcfe6ff, moonIntensity: 3.02, moonBase: 2.82,
    rim: 0x2a6a8a, rimIntensity: 0.80,
    edge: 0x6fd8e8, edgeOpacity: 0.32,      // 井水的青
    stone: 0x27333f,
    tuft: 0x27333f, tuftVisible: false,     // 塔顶是石头地，不长草
    fly: 0x9fe8ff, flyCount: 76,            // 飘着的是井里冒上来的水汽
    ground: 'welltop',
  },
  // 第十一关 · 钟楼雾原（第 114 块）：回到第三关那座焦土钟楼外面。
  // 配色思路：整关压到几乎没有颜色 —— 冷灰的雾把一切饱和度都吃掉，
  // 只留 rim 上一点焦土的橙，让「外面还有火在烧」这件事不至于断掉。
  // 场景雾浓度是全作最高（0.0195）：远处本来就该看不清，和场上的雾团叠在一起，
  // 玩家会有「四周全是雾」的包围感，而雾团只是其中更浓的那几块。
  fogfield: {
    bg: 0x0a0c10,
    fog: 0x2a3038, fogDensity: 0.0195,
    hemiSky: 0x8a9aa8, hemiGround: 0x12141a, hemiIntensity: 1.10,
    moon: 0xd8e0e8, moonIntensity: 2.42, moonBase: 2.30,
    rim: 0x8a4a24, rimIntensity: 0.62,      // 远处焦土的橙
    edge: 0xa8b8c0, edgeOpacity: 0.26,      // 场地边一圈灰白（雾里的界限）
    stone: 0x2a2e34,
    tuft: 0x2a2e34, tuftVisible: false,     // 烧过的地，不长草
    fly: 0xc8d4dc, flyCount: 64,            // 飘着的是雾粒 / 灰烬
    ground: 'fogfield',
  },
  // 第十二关 · 三幻神驿站（第 116 块）：焦土公路边的服务区。
  // 配色思路：整关压在「夜里的公路」上 —— 沥青的深灰 + 路缘的暖黄（路灯 /
  // 车灯），再掺一点服务区咖啡的焦糖色。车流（traffic.js）自己画路面和虚线，
  // 这里只负责底色与氛围：暖黄是这一关的「主角色」，和车、袋鼠、拿铁是同一套黄。
  highway: {
    bg: 0x0c0e10,
    fog: 0x1e2326, fogDensity: 0.0126,
    hemiSky: 0x8a949c, hemiGround: 0x1a160f, hemiIntensity: 1.28,
    moon: 0xf2e6c0, moonIntensity: 3.05, moonBase: 2.85,
    rim: 0x8a6a24, rimIntensity: 0.78,      // 路缘的暖黄
    edge: 0xf2c14e, edgeOpacity: 0.30,      // 服务区招牌的黄
    stone: 0x2e3236,
    tuft: 0x3a362c, tuftVisible: true,      // 路边枯草还立着
    fly: 0xffe08a, flyCount: 88,            // 飘着的车灯尘 / 飞蛾
    ground: 'highway',
  },
  // 第十三关 · 焦土操场（第 123 块）：夜里被烧过一次的大学操场。
  // 配色思路：足球场的草早烧没了，只剩干土与塑胶跑道的红渣；
  // 主光是球场上那两盏钠灯（暖橙），所以 rim/edge 都压成橙 ——
  // 和第十二关的「公路黄」是同一家人，但明显更暗、更旧。
  campus: {
    bg: 0x0a0e13,
    fog: 0x1a2027, fogDensity: 0.0140,
    hemiSky: 0x8e9cae, hemiGround: 0x1a1410, hemiIntensity: 1.30,
    moon: 0xdfe8f4, moonIntensity: 2.86, moonBase: 2.68,
    rim: 0x9a5a2a, rimIntensity: 0.72,      // 远处还在冒烟的焦土
    edge: 0xffc46a, edgeOpacity: 0.30,      // 钠灯的橙
    stone: 0x2c3238,
    tuft: 0x3a4432, tuftVisible: true,      // 跑道边的野草还活着
    fly: 0xffd08a, flyCount: 80,            // 灯下的飞蛾
    ground: 'campus',
  },
  // 第十四关 · 钟楼打样间（第 124 块）：钟楼一层，那台一直在吐纸的旧机器。
  // 配色思路：屋里没有天光，只有机器上一排冷青指示灯 + 纸堆反出来的白；
  // 地面是水泥 + 一地裁掉的纸边角，所以 tuft（草）直接关掉 —— 室内不长草。
  press: {
    bg: 0x090b0d,
    fog: 0x191e21, fogDensity: 0.0152,
    hemiSky: 0x8fa2b0, hemiGround: 0x140f0b, hemiIntensity: 1.24,
    moon: 0xdfeaf2, moonIntensity: 2.74, moonBase: 2.56,
    rim: 0x2e6f7a, rimIntensity: 0.68,      // 机器指示灯的青
    edge: 0x6fd4e0, edgeOpacity: 0.32,      // 电眼的冷青
    stone: 0x2a2f33,
    tuft: 0x333a3a, tuftVisible: false,     // 室内地上不长草
    fly: 0xcfe9f2, flyCount: 64,            // 光柱里飘的纸尘
    ground: 'press',
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

  // ---------------- 四向路口（第 63 块，第五关） ----------------
  // 一组「路」：从中心往四个方向铺出去的光带 + 路尽头的一盏油灯。
  // 它不是装饰 —— 第五关的怪**只从这四条路上来**（wave.js 的 lanes: 4），
  // 所以这四条光带就是「它们会从哪来」的预告。玩家看懂了就知道该背对哪边。
  let laneGroup = null;
  let laneTex = null;
  function makeLaneTexture() {
    // 沿路方向渐亮：路口（中心）最亮，越远越淡 —— 像一盏灯的余光铺在地上
    const W = 32, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');   // 远端
    grad.addColorStop(0.72, 'rgba(255,255,255,0.30)');
    grad.addColorStop(1, 'rgba(255,255,255,0.78)');   // 中心
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // 两侧压暗一点，光带中间亮、边缘散
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.55)');
    side.addColorStop(0.5, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildLanes(radius, TH) {
    if (laneGroup) {
      scene.remove(laneGroup);
      laneGroup.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      laneGroup = null;
    }
    const n = TH.lanes | 0;
    if (!n) return null;
    if (!laneTex) laneTex = makeLaneTexture();
    laneGroup = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: laneTex, transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, color: TH.edge, side: THREE.DoubleSide,
    });
    // 灯柱：一根细柱 + 顶端一颗发光的灯球（程序化，不额外下模型）
    const postGeo = new THREE.CylinderGeometry(0.055, 0.075, 3.0, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a352a, roughness: 0.9 });
    const bulbGeo = new THREE.SphereGeometry(0.20, 10, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: TH.edge });

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const g = new THREE.Group();
      g.rotation.y = a;
      // 路面：宽 5.4，从中心铺到场地边缘
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(5.4, radius * 1.04), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.028, -radius * 0.52);
      g.add(strip);
      // 灯柱立在路口外侧
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(0, 1.5, -radius - 0.4);
      post.castShadow = true;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0, 3.02, -radius - 0.4);
      g.add(post, bulb);
      laneGroup.add(g);
    }
    laneGroup.visible = true;
    scene.add(laneGroup);
    return laneGroup;
  }

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
  let curArena = arenaRadius;
  let curTheme = TH;

  function setTheme(name) {
    const t = THEMES[name] || THEMES.meadow;
    curTheme = t;
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
    // 第 63 块：只有第五关（TH.lanes）画四条路；切到别的关就藏起来
    if (t.lanes) buildLanes(curArena, t);
    else if (laneGroup) laneGroup.visible = false;
    return name;
  }

  // ---------------- 场地半径（第 33 块）：第三关场地更大 ----------------
  // 只重摆边界圈、石头、草丛和萤火虫的分布；灯光 / 雾 / 地面（半径 90 的大圆）不动。
  function setArena(radius) {
    curArena = radius;
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
    // 路是「铺到场地边缘」的，场地变大变小要重铺（第五关 arena 20）
    if (laneGroup && laneGroup.visible) buildLanes(radius, curTheme);
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

  return {
    scene, update, moonLight, setTheme, setArena,
    // 第 63 块：四向路口铺了几条路（0 = 这一关没有路口）
    get lanes() { return laneGroup && laneGroup.visible ? laneGroup.children.length : 0; },
  };
}

// ------------------------------------------------------------
// 地面贴图：按主题选一套（都平铺 16×16）
// ------------------------------------------------------------
// 焦土操场（第 123 块）：干裂的土 + 塑胶跑道的红渣。
// 三层：① 土底（灰褐，比公路暖）；② 裂缝（细长、分叉，操场被烧过之后地会裂）；
// ③ 红渣点（跑道的碎片，散得到处都是 —— 这块地以前是个操场）。
function makeCampusTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#2a2620';
  g.fillRect(0, 0, S, S);

  let seed = 123123;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 土粒：暖灰的细点，让地面有颗粒感
  for (let i = 0; i < 2400; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(${52 + rnd() * 26 | 0},${46 + rnd() * 22 | 0},${36 + rnd() * 18 | 0},${0.07 + rnd() * 0.13})`;
    g.beginPath(); g.arc(x, y, 0.3 + rnd() * 1.0, 0, Math.PI * 2); g.fill();
  }

  // ② 裂缝：又细又长，带一点分叉
  g.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    let x = rnd() * S, y = rnd() * S;
    let ang = rnd() * Math.PI * 2;
    g.strokeStyle = `rgba(14,12,10,${0.22 + rnd() * 0.22})`;
    g.lineWidth = 0.8 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    const segs = 4 + (rnd() * 6 | 0);
    for (let k = 0; k < segs; k++) {
      ang += (rnd() - 0.5) * 0.9;
      x += Math.cos(ang) * (8 + rnd() * 16);
      y += Math.sin(ang) * (8 + rnd() * 16);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // ③ 红渣：塑胶跑道的碎屑（这一片以前是操场）
  for (let i = 0; i < 520; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.7 + rnd() * 1.8;
    g.fillStyle = `rgba(${120 + rnd() * 40 | 0},${52 + rnd() * 24 | 0},${40 + rnd() * 20 | 0},${0.16 + rnd() * 0.22})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ④ 一道褪色的白线：留下的跑道分道线残影
  g.strokeStyle = 'rgba(210,200,180,0.10)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, S * 0.34);
  g.lineTo(S, S * 0.34);
  g.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 第十四关 · 打样间的水泥地（第 124 块）
// 铁灰水泥 + 一地被裁掉的纸边角 + 几滴干掉的墨 + 一道黄黑警戒线。
// 和第十三关的焦土是两个极端：那边全是暖橙的土，这边几乎是冷灰的石头，
// 玩家一进关就知道「这一次是在屋里」。
function makePressTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#24282c';
  g.fillRect(0, 0, S, S);

  let seed = 90817;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 水泥颗粒（冷灰细点）
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(${60 + rnd() * 30 | 0},${66 + rnd() * 30 | 0},${70 + rnd() * 32 | 0},${0.05 + rnd() * 0.12})`;
    g.beginPath(); g.arc(x, y, 0.3 + rnd() * 1.1, 0, Math.PI * 2); g.fill();
  }

  // ② 地板缝：四等分的浅暗线（水泥地浇出来的分块）
  g.strokeStyle = 'rgba(12,14,16,0.42)';
  g.lineWidth = 2.4;
  for (let k = 1; k < 4; k++) {
    g.beginPath(); g.moveTo((S / 4) * k, 0); g.lineTo((S / 4) * k, S); g.stroke();
    g.beginPath(); g.moveTo(0, (S / 4) * k); g.lineTo(S, (S / 4) * k); g.stroke();
  }

  // ③ 纸边角：浅色小方片，随机朝向（裁下来的废料）
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S, y = rnd() * S;
    const w = 3 + rnd() * 9, h = 2 + rnd() * 7;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI);
    g.fillStyle = `rgba(${218 + rnd() * 30 | 0},${214 + rnd() * 28 | 0},${198 + rnd() * 28 | 0},${0.20 + rnd() * 0.34})`;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  }

  // ④ 干掉的墨点：几团近黑的圆斑
  for (let i = 0; i < 12; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 3 + rnd() * 9;
    g.fillStyle = `rgba(10,12,14,${0.16 + rnd() * 0.22})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ⑤ 一道黄黑警戒线（裁切刀的起点，和 cutter.js 的端头夹具对得上）
  g.fillStyle = 'rgba(200,168,72,0.30)';
  g.fillRect(0, S * 0.70, S, 6);
  g.fillStyle = 'rgba(16,16,18,0.50)';
  for (let x = 0; x < S; x += 22) g.fillRect(x, S * 0.70, 11, 6);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(kind) {
  if (kind === 'crypt') return makeCryptTexture();
  if (kind === 'ash') return makeAshTexture();
  if (kind === 'fog') return makeFogTexture();
  if (kind === 'crossroad') return makeCrossroadTexture();
  if (kind === 'server') return makeServerTexture();
  if (kind === 'well') return makeWellTexture();
  if (kind === 'ossuary') return makeOssuaryTexture();
  if (kind === 'registry') return makeRegistryTexture();
  if (kind === 'welltop') return makeWelltopTexture();
  if (kind === 'fogfield') return makeFogfieldTexture();
  if (kind === 'highway') return makeHighwayTexture();
  if (kind === 'campus') return makeCampusTexture();
  if (kind === 'press') return makePressTexture();
  return makeGrassTexture();
}

// 钟楼外的雾原（第 114 块）：烧过一次、又被雾泡了几十年的焦土。
// 三层就够：① 焦土底 + 明暗斑；② 雾落下来的白霜（这是这张图的性格）；
// ③ 零星墨痕 —— 空白在这片地上翻账簿翻了很多年，地上有它写过又划掉的痕。
function makeFogfieldTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#26262a';
  g.fillRect(0, 0, S, S);

  let seed = 114114;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 焦土：冷暖交替的大斑（烧过的地一块深一块浅）
  for (let i = 0; i < 200; i++) {
    const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 92;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd() > 0.55;
    rad.addColorStop(0, warm ? 'rgba(62,44,32,0.34)' : 'rgba(12,14,18,0.40)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ② 白霜：雾泡久了，地面泛一层灰白。成片的比点状更像「潮」。
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, r = 12 + rnd() * 46;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `rgba(196,206,212,${0.05 + rnd() * 0.09})`);
    rad.addColorStop(1, 'rgba(196,206,212,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(206,214,218,${0.05 + rnd() * 0.16})`;
    g.beginPath(); g.arc(x, y, 0.4 + rnd() * 1.2, 0, Math.PI * 2); g.fill();
  }
  // 极少数没烧透的红点：远处还有火在烧
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(226,110,52,${0.10 + rnd() * 0.16})`;
    g.beginPath(); g.arc(x, y, 0.7 + rnd() * 1.4, 0, Math.PI * 2); g.fill();
  }

  // ③ 墨痕：细长的深紫黑笔划，方向和长短都散（排整齐就成图案了）
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, y = rnd() * S;
    const len = 10 + rnd() * 56;
    const ang = rnd() * Math.PI * 2;
    g.strokeStyle = `rgba(18,12,26,${0.12 + rnd() * 0.22})`;
    g.lineWidth = 1 + rnd() * 2.4;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 10,
      y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 10,
      x + Math.cos(ang) * len, y + Math.sin(ang) * len,
    );
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 三幻神驿站的地面（第 116 块）：公路服务区外头那片被车碾了几十年的柏油地。
// 底色是压实的沥青（深灰近黑），细节分两层：
//   ① 车辙 / 油渍：被轮胎磨亮的一道道浅痕 + 深色油斑；
//   ② 路缘的反光：一点暖黄的路灯反光点（这一关的主色是黄，地面要呼应它）。
function makeHighwayTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#202326';
  g.fillRect(0, 0, S, S);

  let seed = 116116;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 沥青颗粒：细密的灰点，让地面不是死黑一块
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(${44 + rnd() * 20 | 0},${46 + rnd() * 18 | 0},${50 + rnd() * 16 | 0},${0.06 + rnd() * 0.12})`;
    g.beginPath(); g.arc(x, y, 0.3 + rnd() * 0.9, 0, Math.PI * 2); g.fill();
  }

  // ② 车辙：一条条磨亮的浅痕（方向散，长度长，像被反复碾过）
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S;
    const len = 18 + rnd() * 70;
    const ang = rnd() * Math.PI;
    g.strokeStyle = `rgba(120,126,132,${0.03 + rnd() * 0.06})`;
    g.lineWidth = 2 + rnd() * 5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }

  // ③ 油渍：深色圆斑，边缘更黑（车漏的油渗进沥青）
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 34;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, 'rgba(8,10,12,0.28)');
    rad.addColorStop(1, 'rgba(8,10,12,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ④ 暖黄反光点：路灯 / 车灯在地面上的一点点暖色
  for (let i = 0; i < 320; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(242,193,78,${0.03 + rnd() * 0.08})`;
    g.beginPath(); g.arc(x, y, 0.5 + rnd() * 1.4, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 骨塔寄存层的地面（第 81 块）：压实的骨灰 + 碎骨渣 + 木牌压痕。
//
// 这一层的「地面」其实是被几十年的碎骨和骨灰填平的石板 —— 所以底色是中性的冷灰，
// 没有任何饱和色。细节分三层：
//   ① 大块明暗：几代人踩过的地方更亮（磨出来的）；
//   ② 骨渣：小白点 + 小白条，比例比其他场景的颗粒高得多，这是「骨灰」的关键；
//   ③ 木牌压痕：淡淡的矩形印子，暗示这里长年摆着牌子（但不排成整齐的网格，
//      否则平铺十六次会变成一张瓷砖图，一眼假）。
function makeOssuaryTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#2f3438';
  g.fillRect(0, 0, S, S);

  let seed = 710071;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 大块明暗：踩亮的石面 / 积灰的洼地
  for (let i = 0; i < 180; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 82;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.5;
    rad.addColorStop(0, dark ? 'rgba(9,11,13,0.42)' : 'rgba(122,132,134,0.28)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ② 骨渣：这是这张贴图和别的地面最不一样的一层
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * S, y = rnd() * S;
    const a = 0.10 + rnd() * 0.30;
    if (rnd() > 0.38) {
      // 骨白碎屑：小而亮，撒得密
      g.fillStyle = `rgba(214,220,206,${a})`;
      g.beginPath(); g.arc(x, y, 0.5 + rnd() * 1.5, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = `rgba(10,12,14,${a + 0.10})`;
      g.beginPath(); g.arc(x, y, 0.6 + rnd() * 1.6, 0, Math.PI * 2); g.fill();
    }
  }

  // 碎骨条：不是圆点，是细长的小骨头 —— 骨灰里永远有没烧透的那几根
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = rnd() * S, y = rnd() * S;
    const len = 2 + rnd() * 7;
    const ang = rnd() * Math.PI;
    g.strokeStyle = `rgba(206,212,198,${0.10 + rnd() * 0.20})`;
    g.lineWidth = 0.7 + rnd() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }

  // ③ 木牌压痕：淡矩形，位置散、角度微歪（排整齐就成了瓷砖）
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S;
    const w = 8 + rnd() * 16, h = 12 + rnd() * 22;
    g.save();
    g.translate(x, y);
    g.rotate((rnd() - 0.5) * 0.5);
    g.fillStyle = `rgba(58,46,36,${0.10 + rnd() * 0.12})`;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = `rgba(14,12,10,${0.10 + rnd() * 0.10})`;
    g.lineWidth = 1;
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
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

// 草甸路口的地面（第 63 块）：被踩了四十年的土路 + 车辙 + 路边的草。
// 和荒草地（草为主）的区别：这里是**土** —— 草只从裂缝里钻出来一点点。
function makeCrossroadTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#3a3324';       // 压实的黄土
  g.fillRect(0, 0, S, S);

  let seed = 632024;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 大块明暗：被踩实的地方发亮，草根处发暗
  for (let i = 0; i < 150; i++) {
    const x = rnd() * S, y = rnd() * S, r = 22 + rnd() * 76;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    rad.addColorStop(0, light ? 'rgba(120,104,70,0.26)' : 'rgba(14,18,10,0.34)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 车辙：两道压出来的深色带（横竖各一组，像被车碾过很多年）
  g.lineCap = 'round';
  const rut = (vert) => {
    for (const off of [-26, 26]) {
      g.strokeStyle = 'rgba(24,22,14,0.30)';
      g.lineWidth = 9 + rnd() * 4;
      g.beginPath();
      if (vert) { g.moveTo(S / 2 + off, 0); g.lineTo(S / 2 + off + (rnd() - 0.5) * 16, S); }
      else { g.moveTo(0, S / 2 + off); g.lineTo(S, S / 2 + off + (rnd() - 0.5) * 16); }
      g.stroke();
    }
  };
  rut(true);
  rut(false);

  // 颗粒：土渣 + 小石子
  for (let i = 0; i < 2800; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.6 + rnd() * 1.5;
    const a = 0.10 + rnd() * 0.22;
    if (rnd() > 0.93) g.fillStyle = `rgba(168,158,120,${0.20 + rnd() * 0.24})`;
    else g.fillStyle = rnd() > 0.5 ? `rgba(96,86,58,${a})` : `rgba(10,12,8,${a + 0.10})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 草根：从土缝里钻出来的短草（比荒草地稀、比焦土多）
  for (let i = 0; i < 130; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.strokeStyle = `rgba(74,108,54,${0.30 + rnd() * 0.34})`;
    g.lineWidth = 1 + rnd() * 1.4;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(x + k * 2 - 2, y);
      g.lineTo(x + k * 2 - 2 + (rnd() - 0.5) * 8, y - 4 - rnd() * 9);
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 骨塔机房的地面（第 63 块）：拆下来的机柜格栅 + 检修孔的蓝绿指示灯。
// 走「工业」路线：底色是冷灰，格栅是规整的方孔 —— 和前面四关的「土地」完全不同。
function makeServerTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#1b2226';
  g.fillRect(0, 0, S, S);

  let seed = 632025;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 格栅：一层方块阵列（孔是黑的，框是冷的金属灰）
  const cell = 16;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      g.fillStyle = 'rgba(10,14,16,0.55)';
      g.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      g.strokeStyle = 'rgba(88,104,110,0.20)';
      g.lineWidth = 1;
      g.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    }
  }

  // 大块明暗：油渍、被拖过的痕迹
  for (let i = 0; i < 120; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, rnd() > 0.5 ? 'rgba(6,10,12,0.42)' : 'rgba(78,110,120,0.16)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 指示灯：零星的蓝绿小点（机房地上那种「还在通电」的暗示）
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S;
    const r = 0.9 + rnd() * 1.6;
    const cyan = rnd() > 0.3;
    g.fillStyle = cyan
      ? `rgba(120,236,255,${0.20 + rnd() * 0.45})`
      : `rgba(255,140,90,${0.18 + rnd() * 0.34})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 线缆：几根贴着地面走的黑线
  g.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.strokeStyle = `rgba(6,8,10,${0.55 + rnd() * 0.3})`;
    g.lineWidth = 1.6 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 90;
      y += (rnd() - 0.5) * 90;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// 第七关 · 骨塔井底（第 71 块）：湿冷井底 —— 深青黑底 + 湿痕 + 同心水纹 + 细裂缝，
// 不画新几何，纯 canvas 程序化（和 server/crypt 同一套做法）。
function makeWellTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  let seed = 710241;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 湿冷井底：深青黑底
  g.fillStyle = '#0a1c20';
  g.fillRect(0, 0, S, S);

  // 不规则湿痕（更亮的青绿斑块，像渗水）
  for (let i = 0; i < 28; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(40,120,120,0.12)');
    rg.addColorStop(1, 'rgba(40,120,120,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 同心水纹：井底一圈圈荡开的涟漪
  g.strokeStyle = 'rgba(70,200,190,0.06)';
  g.lineWidth = 1.5;
  for (let i = 1; i <= 6; i++) {
    g.beginPath();
    g.arc(S / 2, S / 2, i * 38, 0, Math.PI * 2);
    g.stroke();
  }

  // 细裂缝
  g.strokeStyle = 'rgba(8,26,30,0.55)';
  g.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // 零星的青绿水光点（井壁渗出的微光）
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 1.8;
    g.fillStyle = `rgba(120,236,220,${0.12 + rnd() * 0.30})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
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

// 第九十九层 · 登记庭的地面（第 82 块）：墨色石板 + 鎏金oringadow 缝 + 纸灰。
//
// 第三层细节，全部为「这里有规矩」服务：
//   ① 大块明暗：灯底下磨亮的一块 / 角落积灰的一块；
//   ② 石板 + 鎏金缝：每块尺寸随机、位置微抖，缝里走的是**金色的勾线**
//      （不是灰缝）—— 九十九层的地是有主的地，多看一眼就知道；
//   ③ 纸屑：登记簿撕下来的角，纸黄带竖格，散得歪；
//   ④ 记数划痕：一小撮像「正」字那样数出来的浅口；
//   ⑤ 金粉：最细的一层，月下的星星点点。
// ⚠️ 石板**不能排成等距网格**：贴图要平铺 16 次，规整的网格会在十六次重复里
//    立刻露出周期（第 81 块骨堆那个坑）。
// 塔顶井台的地面（第 107 块）：被井水泡了几十年的墨蓝石板。
// 三层：① 大块明暗（湿一块干一块）② 石板缝 + 缝里渗出来的青 ③ 水渍与裂纹。
// 刻意**不画井** —— 井口是 hazard 自己画的（hazards.js 的 kind:'well'），
// 贴图上再画一个会和那个洞错位。
function makeWelltopTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#141b24';
  g.fillRect(0, 0, S, S);

  let seed = 424243;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 湿一块干一块：湿的地方反光偏青，干的地方发灰
  for (let i = 0; i < 140; i++) {
    const x = rnd() * S, y = rnd() * S, r = 26 + rnd() * 96;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const wet = rnd() > 0.42;
    rad.addColorStop(0, wet ? 'rgba(70,150,180,0.22)' : 'rgba(8,12,18,0.42)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // ② 石板：缝比登记庭宽（塔顶年久失修），缝里渗着一层青
  const ROW = 4;
  const step = S / ROW;
  for (let r = 0; r < ROW; r++) {
    for (let c = 0; c < ROW; c++) {
      const jx = (rnd() - 0.5) * 20;
      const jy = (rnd() - 0.5) * 20;
      const w = step - 10 - rnd() * 14;
      const h = step - 10 - rnd() * 14;
      const x = c * step + 5 + jx;
      const y = r * step + 5 + jy;
      const lum = 0.04 + rnd() * 0.07;
      g.fillStyle = `rgba(88,110,132,${lum})`;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(6,10,14,0.62)';
      g.lineWidth = 3.0;
      g.strokeRect(x, y, w, h);
      g.strokeStyle = `rgba(111,216,232,${0.10 + rnd() * 0.12})`;
      g.lineWidth = 1.0;
      g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
  }

  // ③ 裂纹：从缝里岔出去的细线（塔顶裂了，夜空是从裂缝里压下来的）
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S, y = rnd() * S;
    const a2 = rnd() * Math.PI * 2;
    const len = 14 + rnd() * 52;
    g.strokeStyle = `rgba(4,8,12,${0.30 + rnd() * 0.30})`;
    g.lineWidth = 0.8 + rnd() * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    let cx = x, cy = y, ang = a2;
    for (let k = 0; k < 4; k++) {
      ang += (rnd() - 0.5) * 0.9;
      cx += Math.cos(ang) * (len / 4);
      cy += Math.sin(ang) * (len / 4);
      g.lineTo(cx, cy);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeRegistryTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  g.fillStyle = '#262119';
  g.fillRect(0, 0, S, S);

  let seed = 990099;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // ① 大块明暗：灯底下磨亮的一块 / 角落积灰的一块
  for (let i = 0; i < 150; i++) {
    const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 88;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.45;
    rad.addColorStop(0, dark ? 'rgba(10,8,6,0.44)' : 'rgba(176,150,96,0.20)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // ② 石板 + 鎏金缝：每块尺寸随机、位置微抖，缝细但带一条金线
  const ROW = 4;
  const step = S / ROW;
  for (let r = 0; r < ROW; r++) {
    for (let c = 0; c < ROW; c++) {
      const jx = (rnd() - 0.5) * 16;
      const jy = (rnd() - 0.5) * 16;
      const w = step - 9 - rnd() * 12;
      const h = step - 9 - rnd() * 12;
      const x = c * step + 4 + jx;
      const y = r * step + 4 + jy;
      // 板面本身比底子亮一点点（磨过的石头）
      const lum = 0.05 + rnd() * 0.06;
      g.fillStyle = `rgba(92,80,58,${lum})`;
      g.fillRect(x, y, w, h);
      // 缝：深的一道 + 金色勾线
      g.strokeStyle = 'rgba(8,7,5,0.55)';
      g.lineWidth = 2.4;
      g.strokeRect(x, y, w, h);
      g.strokeStyle = `rgba(214,178,96,${0.20 + rnd() * 0.14})`;
      g.lineWidth = 0.9;
      g.strokeRect(x + 1.6, y + 1.6, w - 3.2, h - 3.2);
    }
  }

  // ③ 纸屑：撕下来的簿角，纸黄，带一点点歪
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S;
    const w = 7 + rnd() * 13, h = 5 + rnd() * 8;
    g.save();
    g.translate(x, y);
    g.rotate((rnd() - 0.5) * 1.1);
    g.fillStyle = `rgba(214,204,176,${0.10 + rnd() * 0.10})`;
    g.fillRect(0, 0, w, h);
    // 纸上那几道竖线（登记簿的格子）
    g.strokeStyle = `rgba(120,104,74,${0.10 + rnd() * 0.08})`;
    g.lineWidth = 0.7;
    for (let k = 1; k < 3; k++) {
      g.beginPath();
      g.moveTo((w / 3) * k, 1);
      g.lineTo((w / 3) * k, h - 1);
      g.stroke();
    }
    g.restore();
  }

  // ④ 记数划痕：一小撮「正」字那样的浅口，零散且歪
  g.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S, y = rnd() * S;
    const len = 5 + rnd() * 9;
    const rot = (rnd() - 0.5) * 0.5;
    g.strokeStyle = `rgba(232,206,140,${0.08 + rnd() * 0.10})`;
    g.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(x + k * 3.4, y + Math.sin(rot) * k * 2);
      g.lineTo(x + k * 3.4 + Math.cos(rot) * len * 0.4, y + Math.sin(rot) * k * 2 + Math.sin(rot + 1.2) * len);
      g.stroke();
    }
  }

  // ⑤ 金粉：最细的一层，让地面在月光下有星星点点的反光
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = `rgba(255,224,150,${0.05 + rnd() * 0.16})`;
    g.fillRect(x, y, 1 + rnd(), 1 + rnd());
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
