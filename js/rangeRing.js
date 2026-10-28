// ============================================================
// rangeRing.js —— 脚下的「攻击范围」显示环
//
// 常驻对象（不是特效）：一个贴地的发光圆环，半径 = 该角色的近战范围。
// 主角用属性里的 attackRange，战士用它自己的 attackRange，小兵用
// 「主角半径 + contactRange」算出的接触自爆圈 —— 凡是会对主角造成
// 近战/接触伤害的角色，脚下都能看到「它能够到你多远」。
//
// 视觉：一张 256² 的 canvas 环贴图（内圈淡填充 + 亮环 + 外发光），
// 加色混合贴地，外围有一点点呼吸感，不会盖住草地纹理。
// ============================================================
import * as THREE from '../lib/three.module.js?v=123';

// 所有环共用同一张环贴图与同一块平面（半径 1，靠 scale 改大小）
let TEX = null;
const GEO = new THREE.PlaneGeometry(2, 2);

function ringTexture() {
  if (TEX) return TEX;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  // 内圈极淡的填充：让范围有「一块地」的感觉，又不挡地面
  grad.addColorStop(0.00, 'rgba(255,255,255,0.055)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.055)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.10)');
  // 环线本体
  grad.addColorStop(0.885, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.925, 'rgba(255,255,255,1.00)');
  // 外发光，柔和收尾
  grad.addColorStop(0.960, 'rgba(255,255,255,0.30)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();

  TEX = new THREE.CanvasTexture(cv);
  TEX.colorSpace = THREE.SRGBColorSpace;
  TEX.minFilter = THREE.LinearFilter;
  TEX.generateMipmaps = false;
  return TEX;
}

// radius 初始半径；color 环色；opacity 基础不透明度；
// pulse 呼吸幅度（0 = 完全静止）；y 贴地高度（别和地面抢深度）
export function createRangeRing({
  radius = 1, color = 0x8ef7c8, opacity = 0.5, pulse = 0.05, y = 0.028,
} = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(GEO, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 1;
  mesh.scale.setScalar(radius);
  mesh.frustumCulled = false;

  let cur = radius;
  let t = Math.random() * Math.PI * 2;   // 相位错开，一群怪的呼吸不会同步

  return {
    mesh,
    mat,
    get radius() { return cur; },
    // 半径变了才动 transform（属性升级、换目标时每帧调也不会有额外开销）
    setRadius(r) {
      const v = Math.max(0.01, r);
      if (Math.abs(v - cur) < 1e-4) return;
      cur = v;
      mesh.scale.setScalar(v);
    },
    setColor(hex) { mat.color.setHex(hex); },
    setOpacity(v) { mat.opacity = v; },
    setVisible(v) { mesh.visible = v; },
    update(dt) {
      if (pulse <= 0) return;
      t += dt;
      mat.opacity = opacity * (1 - pulse + pulse * Math.sin(t * 2));
    },
    dispose() { mat.dispose(); },
  };
}
