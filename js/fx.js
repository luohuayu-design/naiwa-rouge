// ============================================================
// fx.js —— 战斗特效（地面冲击环、碎裂粒子、飘字）
//
// 全部是「用完就扔」的轻量对象：创建时挂到场景，播完自动移除并释放
// 材质/几何。不做对象池，因为同屏特效数量很少（每秒个位数）。
//
// 对外：
//   swing(pos, range)     主角近战拍地的冲击环
//   hit(pos, color)       命中敌人的小碎屑
//   death(pos, color)     怪物死亡爆散
//   spawnRing(pos, color) 怪物从地里钻出来的传送圈
//   text(pos, str, opts)  伤害飘字
//   update(dt)            每帧推进
// ============================================================
import * as THREE from '../lib/three.module.js?v=109';

export function createFx(scene) {
  const live = [];
  // 圆环几何只造一次，所有冲击环共用（半径为 1，靠 scale 缩放）
  const ringGeo = new THREE.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2);
  const dotGeo = new THREE.OctahedronGeometry(0.5, 0);

  // ---------------- 地面圆环 ----------------
  function ring(pos, {
    from = 0.4, to = 2, color = 0x8ef7c8, life = 0.35,
    opacity = 0.85, y = 0.05, additive = true,
  } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(pos.x, y, pos.z);
    mesh.scale.setScalar(from);
    mesh.renderOrder = 2;
    scene.add(mesh);
    live.push({ kind: 'ring', obj: mesh, mat, t: 0, life, from, to });
  }

  // ---------------- 碎屑粒子（Points，加色混合） ----------------
  function burst(pos, {
    color = 0xa8ffd8, count = 14, speed = 3.4, life = 0.55,
    size = 0.13, y = 0.55, gravity = 7, up = 1.6, radius = 0.15,
  } = {}) {
    const arr = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = (Math.random() - 0.35) * radius * 1.4;
      arr[i * 3 + 2] = Math.sin(a) * r;

      const sa = Math.random() * Math.PI * 2;
      const sp = speed * (0.45 + Math.random() * 0.75);
      vel[i * 3] = Math.cos(sa) * sp;
      vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.9);
      vel[i * 3 + 2] = Math.sin(sa) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(pos.x, y, pos.z);
    pts.frustumCulled = false;
    scene.add(pts);
    live.push({ kind: 'burst', obj: pts, mat, geo, vel, t: 0, life, gravity });
  }

  // ---------------- 伤害飘字（canvas 贴图的 Sprite） ----------------
  function text(pos, str, {
    color = '#eafff4', size = 0.5, life = 0.7, rise = 1.15,
    y = 1.25, crit = false,
  } = {}) {
    const pad = 12;
    const font = `700 ${crit ? 58 : 46}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const w = Math.ceil(probe.measureText(str).width) + pad * 2;
    const h = crit ? 84 : 68;

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(2,10,8,0.85)';
    g.strokeText(str, w / 2, h / 2);
    g.fillStyle = color;
    g.fillText(str, w / 2, h / 2);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.NormalBlending,
    });
    const spr = new THREE.Sprite(mat);
    const k = size / h;                     // 让文字高度约等于 size
    spr.scale.set(w * k, h * k, 1);
    spr.position.set(pos.x, y, pos.z);
    spr.renderOrder = 6;
    scene.add(spr);
    live.push({ kind: 'text', obj: spr, mat, tex, t: 0, life, rise, y0: y });
  }

  // ---------------- 绿色加号（第 65 块） ----------------
  // 缝补小巫给怪回血时要「绿色加号不断浮现」，用户明确要求这个观感。
  // 和 text() 的区别：这里只画一个「＋」，所以**贴图缓存一份**就够 ——
  // 一个加号一次 canvas 绘制的话，八只怪一起被奶会瞬间造几十张贴图。
  // 颜色靠 SpriteMaterial.color 乘上去（贴图本身画成白色）。
  let plusTex = null;
  function plusTexture() {
    if (plusTex) return plusTex;
    const S = 96;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, S, S);
    // 描边一圈深色，暗场里压得住；主体纯白，靠材质 color 染成绿色
    const draw = (w, color) => {
      g.fillStyle = color;
      g.fillRect(S / 2 - w / 2, S * 0.16, w, S * 0.68);
      g.fillRect(S * 0.16, S / 2 - w / 2, S * 0.68, w);
    };
    draw(38, 'rgba(2,26,16,0.9)');
    draw(28, '#ffffff');
    plusTex = new THREE.CanvasTexture(cv);
    plusTex.colorSpace = THREE.SRGBColorSpace;
    return plusTex;
  }

  // 一朵往上飘的加号。size 是世界尺寸（加号的高度）。
  function plus(pos, {
    color = 0x7df0b0, size = 0.42, life = 0.85, rise = 0.95,
    y = 0.9, spread = 0.45,
  } = {}) {
    const mat = new THREE.SpriteMaterial({
      map: plusTexture(), transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.NormalBlending,
    });
    mat.color.setHex(color);
    const spr = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    spr.scale.set(size, size, 1);
    spr.position.set(pos.x + Math.cos(a) * r, y, pos.z + Math.sin(a) * r);
    spr.renderOrder = 7;
    scene.add(spr);
    // kind:'plus' —— 只丢材质，贴图是共享的，千万别 dispose
    live.push({ kind: 'plus', obj: spr, mat, t: 0, life, rise, y0: y, size });
  }

  // ---------------- 常用组合 ----------------
  // 主角近战：两圈从身前扩散开，像拍了一掌
  function swing(pos, range) {
    ring(pos, { from: range * 0.28, to: range, color: 0xa9ffd8, life: 0.26, opacity: 0.7, y: 0.07 });
    ring(pos, { from: range * 0.12, to: range * 0.62, color: 0x5fe0ae, life: 0.18, opacity: 0.9, y: 0.09 });
  }

  function hit(pos, color = 0xbfffdc) {
    burst(pos, { color, count: 9, speed: 3.0, life: 0.42, size: 0.11, y: 0.8, up: 2.0 });
  }

  function death(pos, color = 0xffd9a0) {
    burst(pos, { color, count: 20, speed: 4.2, life: 0.7, size: 0.15, y: 0.6, up: 2.6 });
    ring(pos, { from: 0.2, to: 1.5, color, life: 0.4, opacity: 0.75, y: 0.06 });
  }

  function spawnRing(pos, color = 0x9dffd0) {
    ring(pos, { from: 0.15, to: 1.15, color, life: 0.6, opacity: 0.9, y: 0.05 });
    burst(pos, { color, count: 8, speed: 1.4, life: 0.5, size: 0.1, y: 0.2, up: 1.2, gravity: 2 });
  }

  // ---------------- 每帧推进 ----------------
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += dt;
      const k = e.t / e.life;

      if (k >= 1) {
        scene.remove(e.obj);
        e.mat.dispose();
        if (e.geo) e.geo.dispose();
        if (e.tex) e.tex.dispose();
        live.splice(i, 1);
        continue;
      }

      if (e.kind === 'ring') {
        const s = e.from + (e.to - e.from) * (1 - Math.pow(1 - k, 2.2));
        e.obj.scale.setScalar(s);
        e.mat.opacity = (1 - k) * (1 - k) * 0.9;
      } else if (e.kind === 'burst') {
        const p = e.obj.geometry.attributes.position.array;
        for (let j = 0; j < e.vel.length; j += 3) {
          e.vel[j + 1] -= e.gravity * dt;
          p[j] += e.vel[j] * dt;
          p[j + 1] += e.vel[j + 1] * dt;
          p[j + 2] += e.vel[j + 2] * dt;
          if (p[j + 1] < 0.02) { p[j + 1] = 0.02; e.vel[j + 1] *= -0.35; }
        }
        e.obj.geometry.attributes.position.needsUpdate = true;
        e.mat.opacity = 1 - k;
      } else if (e.kind === 'text') {
        e.obj.position.y = e.y0 + e.rise * k;
        e.mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      } else if (e.kind === 'plus') {
        // 加号：一边升一边轻轻放大，前 60% 实心、后面淡出
        e.obj.position.y = e.y0 + e.rise * k;
        const sc = 1 + 0.25 * k;
        e.obj.scale.setScalar(e.size * sc);
        e.mat.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      }
    }
  }

  // dotGeo 目前没用到，先留着给后续 Boss 碎裂用；显式引用避免被打包器当成死代码
  void dotGeo;

  // 第 65 块：counts() 给测试用 —— 只看「绿加号」有几张在屏上，
  // 免得被同屏的伤害数字/粒子把总数搅浑。
  function counts() {
    let plus = 0;
    for (const e of live) if (e.kind === 'plus') plus++;
    return { total: live.length, plus };
  }

  return { ring, burst, text, plus, swing, hit, death, spawnRing, update, count: () => live.length, counts };
}
