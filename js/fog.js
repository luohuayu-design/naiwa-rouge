// ============================================================
// fog.js —— 第十一关「钟楼外 · 雾里」的雾（第 114 块）
//
// 剧情接 s11「空白的账簿」：空白第一次主动现身，不带雾、不吓人 ——
// 「它就站在焦土上」「雾退了一点，露出一小块焦土」。所以这一关的场地
// 就是**空白的本体**：一大片会走、会吞东西的雾。
//
// 设计要点（用户 2026-10-28 定案）：
//   ① 雾不是全屏滤镜，是**真的挡视线**：几片半透明云挂在 y≈1.35 / 2.05，
//      相机在上方 10.6 高俯视，所以它们真的是「挡在镜头和场地之间」——
//      蛙、怪、投掷物、地面圈全都被盖住。深度缓冲干这件事，不是调透明度。
//   ② **只留主角判定环**（+ 一层极淡的轮廓微光，用户追加）：雾里完全看不见
//      自己会很难受，环是唯一的锚点。环由 main.js 调 rangeRing.setOnTop(true)
//      置顶，微光在本文件里（halo）。
//   ③ **预警穿雾**：怪的身体被遮，但它的出手预警（红圈 / 读条 / 墨线）必须
//      穿出来。理由是本作的老铁律「前摇永远不能被遮蔽」—— 看不见的偷袭
//      玩家只会觉得判定坏了，不会觉得难。穿雾由各系统自己 depthTest=false，
//      本文件只提供 `punch` 查询（这一关到底有没有雾）。
//   ④ 起雾前 1.6 秒有**地面预警圈**（穿雾可见），可以提前跑出去。
//   ⑤ 雾里移动 → 镜头轻摇（main.js 读 inside()，尊重设置里的摇晃开关）。
//
// ⚠️ 视觉位置补偿：雾面挂在 h 高度，而相机是从上方斜着看的，所以一张
//   平行于地面的面如果摆在 (x, h, z)，它在屏幕上看起来会**往远处偏**
//   0.86×h 那么多。所以每层的实际位置是 (x, h, z + VIEW_K*h)，让它的
//   屏幕投影正好落在脚下的那个圆上。VIEW_K 由相机常量算出：
//   camOffset(0, 10.6, 9.2) → 视线方向 (0, -0.757, -0.653) →
//   沿视线把地面点抬到 h 高度，z 要加 h×0.653/0.757 = 0.862h。
// ============================================================
import * as THREE from '../lib/three.module.js?v=133';

const VIEW_K = 0.862;        // 见文件头（相机常量算出来的，改相机要一起改）
// 雾层的渲染顺序：实体 / 投掷物 / 地面圈都 ≤ 7，穿雾的东西都在 850 以上
const FOG_ORDER = 700;

const DEF = {
  max: 4,                    // 同屏最多几团（多了会把整片场地糊死）
  radiusMin: 4.4,            // 单团半径（直径 8.8~13）
  radiusMax: 6.5,
  gap: 12.0,                 // 每多少秒起一批
  life: 8.0,                 // 单团活多久
  warn: 1.6,                 // 起雾前的地面预警（穿雾可见）
  fadeIn: 0.55,              // 淡入时长
  fadeOut: 1.8,              // 淡出时长
  drift: 0.35,               // 漂移速度（世界单位/秒）
  peak: 0.88,                // 单层最高不透明度（两层叠起来仍然看不见下面）
};

// 一层雾要用的贴图：径向渐变 + 几团歪掉的圆，边缘才不是「一张光盘」
let TEX = null;
function fogTexture() {
  if (TEX) return TEX;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;
  // 主体：中心几乎不透光，向外柔和收干净
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.00, 'rgba(255,255,255,0.98)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.88)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.46)');
  grad.addColorStop(0.90, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
  // 叠几个偏心的软圆：边缘变得不规则，一眼不是几何图形
  const blobs = [
    [0.34, 0.30, 0.26], [0.70, 0.40, 0.22], [0.46, 0.70, 0.24],
    [0.24, 0.60, 0.18], [0.78, 0.72, 0.16],
  ];
  for (const [bx, by, br] of blobs) {
    const rg = g.createRadialGradient(bx * S, by * S, 0, bx * S, by * S, br * S);
    rg.addColorStop(0, 'rgba(255,255,255,0.34)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(bx * S, by * S, br * S, 0, Math.PI * 2);
    g.fill();
  }
  // 撒一层极淡的颗粒：避免大面积纯色渐变出现色带
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * c;
    g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
    g.beginPath();
    g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + Math.random() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  TEX = new THREE.CanvasTexture(cv);
  TEX.colorSpace = THREE.SRGBColorSpace;
  TEX.minFilter = THREE.LinearFilter;
  TEX.generateMipmaps = false;
  return TEX;
}

// 主角微光：中心最亮的软点，加色混合 → 雾里看着像「身上有一点光」
let HALO_TEX = null;
function haloTex() {
  if (HALO_TEX) return HALO_TEX;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.00, 'rgba(150,255,205,0.30)');
  grad.addColorStop(0.45, 'rgba(120,240,190,0.11)');
  grad.addColorStop(0.78, 'rgba(90,220,170,0.04)');
  grad.addColorStop(1.00, 'rgba(90,220,170,0.00)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
  HALO_TEX = new THREE.CanvasTexture(cv);
  HALO_TEX.colorSpace = THREE.SRGBColorSpace;
  HALO_TEX.minFilter = THREE.LinearFilter;
  HALO_TEX.generateMipmaps = false;
  return HALO_TEX;
}

export function createFogSystem({ scene }) {
  let on = false;
  let opts = { ...DEF };
  let patches = [];        // 每团：{ x, z, r, a, age, vx, vz, layers:[{mesh,mat,h,spin}], warn }
  let spawnT = 0;          // 距离下一批还有多久
  let clock = 0;
  let halo = null;         // 主角微光（只在有雾的关卡显示）
  let haloPos = { x: 0, z: 0 };

  const geo = new THREE.PlaneGeometry(2, 2);   // 共享几何：半径靠 scale
  const geoWarn = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);

  function makeLayer(h, scale, spin) {
    const mat = new THREE.MeshBasicMaterial({
      map: fogTexture(),
      color: 0xaebbc6,       // 冷灰蓝：暗场里像雾，纯白会变成一束追光
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // ⚠️ 别用 depthTest:true 「让深度缓冲去挡」—— 实测（.tmp-114-fogshot.js 的
      // f3b 对照图）雾面会被判定在怪后面，怪整只浮在雾上面，等于雾没用。
      // 原因是雾面为了补偿俯视投影被挪到 z+0.862h，几何深度和屏幕位置不是一回事，
      // 靠深度缓冲去比「谁在前」不可靠。改成**纯渲染顺序**：depthTest:false +
      // renderOrder 700 —— 实体 / 投掷物 / 地面圈（renderOrder ≤ 7）全被它盖住，
      // 而所有「必须穿雾」的东西都排在 700 之后：
      //   850 墨线预警 · 860 起雾预警圈 · 880 主角轮廓微光 · 900 主角判定环。
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;   // 平躺，朝上
    mesh.frustumCulled = false;
    mesh.renderOrder = FOG_ORDER;     // 700：盖住一切实体，只让「穿雾」的排在它后面
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, h, scale, spin };
  }

  // 起一团：先出预警圈（穿雾可见），warn 秒后才真的上雾
  function startPatch(force) {
    const R = opts.arena || 15;                             // 场地半径由关卡通过 opts.arena 给
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * Math.max(0, R - 4.5);
    const p = {
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      r: opts.radiusMin + Math.random() * (opts.radiusMax - opts.radiusMin),
      a: 0,                     // 当前强度 0~1（乘到每层 opacity 上）
      age: 0,
      born: force ? -opts.warn : 0,   // force = 跳过预警直接起雾（读档 / 测试用）
      vx: 0, vz: 0,
      driftT: 0,
      cutT: 0,                  // 第 118 块：守夜烛照过来时，这团雾加速散掉
      layers: [],
      warn: null,
    };
    // 漂移方向：随机给一个，每隔几秒微调一次（走直线会太机械）
    const da = Math.random() * Math.PI * 2;
    p.vx = Math.cos(da) * opts.drift;
    p.vz = Math.sin(da) * opts.drift;

    p.layers.push(makeLayer(1.35, 1.00, 0.06));
    p.layers.push(makeLayer(2.05, 0.82, -0.05));

    const wmat = new THREE.MeshBasicMaterial({
      color: 0xe6eef2, transparent: true, opacity: 0,
      depthWrite: false, depthTest: false,          // ← 预警穿雾
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const wmesh = new THREE.Mesh(geoWarn, wmat);
    wmesh.position.set(p.x, 0.075, p.z);
    wmesh.scale.setScalar(p.r);
    wmesh.renderOrder = 860;
    wmesh.frustumCulled = false;
    scene.add(wmesh);
    p.warn = { mesh: wmesh, mat: wmat };
    patches.push(p);
    return p;
  }

  function killPatch(i) {
    const p = patches[i];
    for (const L of p.layers) {
      scene.remove(L.mesh);
      L.mat.dispose();
    }
    if (p.warn) {
      scene.remove(p.warn.mesh);
      p.warn.mat.dispose();
    }
    patches.splice(i, 1);
  }

  // def: { gap, life, warn, drift, max, arena } —— 关卡通过 level.fog 传
  function build(def) {
    clear();
    if (!def) { on = false; return; }
    on = true;
    opts = { ...DEF, ...def };
    spawnT = 0.8;              // 开局稍等一下，别一进场就被糊住
    clock = 0;
    // 主角微光：只在有雾的关卡挂上
    if (!halo) {
      const mat = new THREE.MeshBasicMaterial({
        map: haloTex(), transparent: true, opacity: 0.85,
        depthWrite: false, depthTest: false,      // ← 雾里也要看得见「我在哪」
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      halo = new THREE.Mesh(geo, mat);
      halo.rotation.x = -Math.PI / 2;
      halo.scale.setScalar(1.15);
      halo.renderOrder = 880;
      halo.frustumCulled = false;
      scene.add(halo);
    }
    halo.visible = true;
  }

  // 只清场上的雾团，**不动开关**（换一批雾 / 测试用）。
  // ⚠️ 别把「清场」和「关掉系统」混成一个入口：调试口要是调 clear()，
  // 系统会被一起关掉，之后再 spawn 出来的雾团永远不更新（看不见、也没判定）。
  function clearPatches() {
    for (let i = patches.length - 1; i >= 0; i--) killPatch(i);
    patches = [];
    spawnT = 0;
    clock = 0;
  }

  // 整关关掉雾（build(null) 走这里）：清场 + 收起主角微光 + 熄开关
  function clear() {
    clearPatches();
    if (halo) halo.visible = false;
    on = false;
  }

  // 点在不在雾里（地面圆判定，不算高度）
  function inside(x, z, pad = 0) {
    for (const p of patches) {
      if (p.a < 0.25) continue;                 // 还没起雾 / 正在散：不算
      if (Math.hypot(x - p.x, z - p.z) <= p.r * 0.94 + pad) return true;
    }
    return false;
  }

  // 当时雾有多浓（0~1）：镜头摇晃 / 视觉强度都用它，比布尔值细腻
  function densityAt(x, z) {
    let d = 0;
    for (const p of patches) {
      if (p.a <= 0.02) continue;
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist > p.r) continue;
      const k = 1 - dist / p.r;                 // 越靠中心越浓
      d = Math.max(d, p.a * (0.45 + 0.55 * k));
    }
    return Math.min(1, d);
  }

  // 守夜烛（第 118 块）：把一块地上的雾照散 —— 和半径相交的雾团原地加速消散。
  // 注意只改「散得快」，不直接 killPatch：删掉会立刻被 spawn 补一团，反而更密。
  function cut(x, z, r) {
    let n = 0;
    for (const p of patches) {
      if (Math.hypot(x - p.x, z - p.z) > p.r * 0.9 + r) continue;
      p.cutT = Math.max(p.cutT || 0, 0.5);
      n++;
    }
    return n;
  }

  function update(dt, extra = {}) {
    if (!on) return;
    clock += dt;
    const pp = extra.playerPos;
    const R = opts.arena || 15;

    // ---- 主角微光（跟着人走，只在雾关）----
    if (halo && pp) {
      haloPos.x = pp.x; haloPos.z = pp.z;
      const d = densityAt(pp.x, pp.z);
      // 高度 0.95（正好在蛙身上半截）+ 投影补偿：屏幕上看就在蛙脚那一圈
      halo.position.set(pp.x, 0.95, pp.z + VIEW_K * 0.95);
      halo.material.opacity = 0.10 + 0.30 * d;   // 雾越浓越亮，但始终「极淡」：它只说「我在这儿」
      halo.visible = true;
    }

    // ---- 生雾节拍 ----
    if (patches.length < opts.max) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = opts.gap;
        startPatch(false);
        // 后期偶尔一次起两团（有一团会盖住上一团，视觉上更"雾"）
        if (Math.random() < 0.35 && patches.length < opts.max) startPatch(false);
      }
    }

    for (let i = patches.length - 1; i >= 0; i--) {
      const p = patches[i];
      p.age += dt;
      const t = p.age + p.born;                 // born<0 = 还在预警期

      // ---- 强度曲线：预警期 0 → 淡入 → 满 → 淡出 ----
      let a = 0;
      if (t < 0) a = 0;
      else if (t < opts.fadeIn) a = t / opts.fadeIn;
      else if (t < opts.life - opts.fadeOut) a = 1;
      else a = Math.max(0, (opts.life - t) / opts.fadeOut);
      p.a = Math.min(1, a);

      // 第 118 块：被烛光照到 → 半秒内散开（每秒被刷新一次；烛灭了雾会回来）
      if (p.cutT > 0) {
        p.cutT -= dt;
        p.a = Math.min(p.a, Math.max(0, p.cutT) / 0.5);
      }

      // ---- 预警圈：只在起雾之前显示，越临近越亮 ----
      if (p.warn) {
        if (t < 0) {
          const k = 1 + t / opts.warn;           // 1 → 0
          p.warn.mesh.visible = true;
          p.warn.mat.opacity = 0.08 + 0.24 * (0.5 + 0.5 * Math.sin(clock * 14));
          p.warn.mesh.scale.setScalar(p.r * (0.72 + 0.28 * (1 - k)));
        } else {
          p.warn.mesh.visible = false;
        }
      }

      // ---- 漂移（撞到场地边就换向）+ 贴地投影补偿 ----
      if (p.a > 0.05) {
        p.driftT -= dt;
        if (p.driftT <= 0) {
          p.driftT = 3.2 + Math.random() * 2.6;
          const da = Math.random() * Math.PI * 2;
          p.vx = Math.cos(da) * opts.drift;
          p.vz = Math.sin(da) * opts.drift;
        }
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const d = Math.hypot(p.x, p.z);
        const lim = Math.max(2, R - p.r * 0.5);
        if (d > lim) {
          const nx = p.x / d, nz = p.z / d;
          p.x = nx * lim;
          p.z = nz * lim;
          const out = p.vx * nx + p.vz * nz;
          if (out > 0) { p.vx -= nx * out * 2; p.vz -= nz * out * 2; }
        }
      }

      for (const L of p.layers) {
        L.mesh.visible = p.a > 0.01;
        // 每层自己呼吸一点点，三层错开相位 → 有体积感而不是一张纸
        const wob = 0.94 + 0.06 * Math.sin(clock * 0.9 + L.h * 3.1);
        L.mat.opacity = p.a * opts.peak * wob * (L.scale < 1 ? 0.82 : 1);
        L.mesh.position.set(p.x, L.h, p.z + VIEW_K * L.h);
        L.mesh.scale.setScalar(p.r * L.scale);
        L.mesh.rotation.z += L.spin * dt;       // 面朝上时 z 就是「原地慢转」
      }

      if (p.age > opts.life + opts.warn + 0.4) killPatch(i);
    }
  }

  return {
    build, update, clear, clearPatches, inside, densityAt, cut,
    get on() { return on; },
    get count() { return patches.length; },
    get max() { return opts.max; },
    // 调试 / 测试：场上每团的现场
    list: () => patches.map((p) => ({
      x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +p.r.toFixed(2),
      a: +p.a.toFixed(3), age: +p.age.toFixed(2),
      warn: !!(p.warn && p.warn.mesh.visible),
    })),
    // 测试用：强制起一团（force = 跳过预警）
    spawn(force) { return startPatch(!!force) ? patches.length : 0; },
    // 测试用：把某一团直接拔到「满强度」（省得等 2 秒）
    heat(idx) {
      const p = patches[idx || 0];
      if (!p) return false;
      p.age = opts.fadeIn + 0.4;
      p.born = 0;
      return true;
    },
    get haloVisible() { return !!(halo && halo.visible); },
    get haloPos() { return { x: +haloPos.x.toFixed(2), z: +haloPos.z.toFixed(2) }; },
  };
}

// 给外面（main / enemy）问一句：这一关有没有雾。
// 单独导出一个常量式的表，免得每个模块都要拿着 fog 实例。
export const FOG_LEVELS = { 11: true };
export function levelHasFog(id) { return !!FOG_LEVELS[id]; }
