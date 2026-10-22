// ============================================================
// frog.js —— 奶蛙角色
//
// 模型 rigged.glb 是【单块网格、没有骨骼、没有动画】，
// 所以这里沿用蛙步 dancer.js 的思路：按顶点位置程序化造 7 根骨，
// 再用「顶点到骨段距离」算蒙皮权重。区别只有一处：
//   蛙步的腿骨挂在脚底（跳舞是踢腿，绕脚转没问题），
//   这里腿骨挂在胯部两侧（走路要像钟摆一样绕胯摆），否则走路会像在原地跺脚。
//
// 对外只暴露一个 Frog 对象：
//   root     —— 世界坐标下的根节点（直接设 position 就是角色位置）
//   yaw      —— 朝向组（rotation.y = 面朝方向，模型正面是 +Z）
//   update(dt, speed01) —— speed01 = 当前速度 / 最大速度，0 待机、1 全速
// ============================================================
import * as THREE from '../lib/three.module.js?v=54';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=54';

// 切分点与蛙步 dancer.js 的 SPLIT 保持一致（换模型时对照这里调）
const RIG = {
  HEAD_YN : 0.62,   // 脖子高度：身高的 62%（蛙头大）
  HIP_YN  : 0.33,   // 胯部高度
  SPINE_YN: 0.50,   // 脊柱中节高度（手臂挂这里）
  LEG_YN  : 0.30,   // 腿 / 身体分界
  ARM_XN  : 0.42,   // 手臂 / 身体左右分界
  TARGET_H: 2.28,    // 归一化后的身高（世界单位）
  HIP_SPREAD: 0.13, // 胯部两侧腿骨的水平偏移（× 身高）
  LEG_R_MAX: 0.17,  // 腿骨蒙皮半径上限（× 身高），防止权重糊到肚子上
};

// 模型自身朝向修正：0 = 模型正面朝 +Z（和蛙步舞台一致）。
// 如果哪天换了模型发现角色倒着走，把这里改成 Math.PI。
export const MODEL_YAW = 0;

// 攻击动作参数：一次「单臂拍击」= 抬手 → 拍下 → 回收。
// dur 要小于攻击间隔（攻速 1.2 次/秒 = 0.83 秒），否则连击时会互相打断。
// 用户反馈「动作幅度小、持续时间短」→ 时长 0.34 → 0.52，各段幅度整体加约 30~90%。
const ATK = {
  dur: 0.52,
  windup: 0.34,        // 抬手在整段动作里的占比（0.52 × 0.34 ≈ 0.18 秒蓄力）
  strike: 0.20,        // 拍下占比（占比小 = 出手快，约 0.10 秒甩出去）
  armUp: -2.00,        // 抬手角度（负 = 往后抬）
  armSwing: 2.75,      // 拍下时手臂最前角度
  lean: 0.20,          // 抬手时后仰
  leanDown: -0.48,     // 拍下时前倾
  twist: 0.85,         // 躯干扭转幅度
  lunge: 0.30,         // 出手时往前顶的距离
};

// k: 0→1 的动作进度，返回这一帧的叠加姿态
function attackPose(k) {
  const w = ATK.windup, s = ATK.strike;
  if (k < w) {                                  // 抬手：慢慢蓄力
    const e = Math.pow(k / w, 2);
    return {
      arm: ATK.armUp * e,
      lean: ATK.lean * e,
      twist: -ATK.twist * 0.5 * e,
      lunge: -ATK.lunge * 0.3 * e,
    };
  }
  if (k < w + s) {                              // 拍下：一口气甩出去
    const e = 1 - Math.pow(1 - (k - w) / s, 3);
    return {
      arm: ATK.armUp + (ATK.armSwing - ATK.armUp) * e,
      lean: ATK.lean + (ATK.leanDown - ATK.lean) * e,
      twist: -ATK.twist * 0.5 + ATK.twist * e,
      lunge: -ATK.lunge * 0.3 + ATK.lunge * 1.3 * e,
    };
  }
  const e = 1 - Math.pow(1 - (k - w - s) / (1 - w - s), 2);   // 回收：慢慢收回
  const back = 1 - e;
  return {
    arm: ATK.armSwing * back,
    lean: ATK.leanDown * back,
    twist: ATK.twist * back,
    lunge: ATK.lunge * back,
  };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function pct(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
}

function distToSeg(px, py, pz, ax, ay, az, bx, by, bz) {
  _v1.set(bx - ax, by - ay, bz - az);
  _v2.set(px - ax, py - ay, pz - az);
  const len2 = _v1.lengthSq();
  let t = len2 > 0 ? _v2.dot(_v1) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return _v2.distanceTo(_v1.multiplyScalar(t));
}

// ------------------------------------------------------------
// 加载
// ------------------------------------------------------------
export function loadFrog(url, onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        try { resolve(buildFrog(gltf)); }
        catch (err) { reject(err); }
      },
      (ev) => {
        if (!onProgress || !ev || !ev.loaded) return;
        // 手机浏览器 / 部分代理拿不到 Content-Length（total 为 0），
        // 这里按 rigged.glb 的实际大小估个进度，免得进度条一直停在 0%。
        const total = ev.total > 0 ? ev.total : 740000;
        onProgress(Math.min(1, ev.loaded / total));
      },
      (err) => reject(err)
    );
  });
}

// ------------------------------------------------------------
// 单网格 → 7 骨蒙皮
// ------------------------------------------------------------
function buildFrog(gltf) {
  let srcMesh = null;
  gltf.scene.traverse((n) => { if (!srcMesh && n.isMesh) srcMesh = n; });
  if (!srcMesh) throw new Error('rigged.glb 里没找到网格');

  const box = new THREE.Box3().setFromObject(gltf.scene);
  srcMesh.updateWorldMatrix(true, false);
  const mw = srcMesh.matrixWorld.clone();

  const size = box.getSize(new THREE.Vector3());
  const H = size.y, W = size.x;
  const cx = (box.min.x + box.max.x) / 2;
  const midz = (box.min.z + box.max.z) / 2;

  const srcGeo = srcMesh.geometry;
  const sp = srcGeo.attributes.position;
  const VN = sp.count;

  // 顶点烘到世界坐标（模型节点带缩放/旋转，量化顶点不能直接用）
  const baked = new Float32Array(VN * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < VN; i++) {
    tmp.fromBufferAttribute(sp, i).applyMatrix4(mw);
    baked[i * 3] = tmp.x; baked[i * 3 + 1] = tmp.y; baked[i * 3 + 2] = tmp.z;
  }
  const geo = srcGeo.clone();
  geo.setAttribute('position', new THREE.BufferAttribute(baked, 3));

  const sn = srcGeo.attributes.normal;
  if (sn) {
    const nm = new Float32Array(VN * 3);
    const nMat = new THREE.Matrix3().getNormalMatrix(mw);
    const nv = new THREE.Vector3();
    for (let i = 0; i < VN; i++) {
      nv.fromBufferAttribute(sn, i).applyMatrix3(nMat).normalize();
      nm[i * 3] = nv.x; nm[i * 3 + 1] = nv.y; nm[i * 3 + 2] = nv.z;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
  }

  const pos = geo.attributes.position;

  // ---- 按高度/横向位置给顶点分区，用来估算关节位置和蒙皮半径 ----
  const xs = new Float32Array(VN);
  const ys = new Float32Array(VN);
  const armLV = [], armRV = [], legLV = [], legRV = [], headV = [], bellyV = [];
  for (let i = 0; i < VN; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const yn = (y - box.min.y) / H;
    const xn = (x - cx) / (W / 2);
    xs[i] = x; ys[i] = y;

    if (yn >= RIG.HEAD_YN) headV.push(i);
    else if (yn <= RIG.LEG_YN) { if (xn < 0) legLV.push(i); else legRV.push(i); }
    else bellyV.push(i);

    if (yn > RIG.LEG_YN - 0.04 && yn < RIG.HEAD_YN + 0.02) {
      if (xn < -RIG.ARM_XN + 0.06) armLV.push(i);
      if (xn > RIG.ARM_XN - 0.06) armRV.push(i);
    }
    if (yn < RIG.LEG_YN + 0.06) { if (xn < 0) legLV.push(i); else legRV.push(i); }
  }

  const hipY = box.min.y + H * RIG.HIP_YN;
  const spineY = box.min.y + H * RIG.SPINE_YN;
  const neckY = box.min.y + H * RIG.HEAD_YN;

  function shoulderPoint(ids, side) {
    if (ids.length < 4) return new THREE.Vector3(cx + side * H * 0.16, neckY - H * 0.06, midz);
    const oxs = ids.map((i) => Math.abs(xs[i] - cx));
    const yys = ids.map((i) => ys[i]);
    const zzs = ids.map((i) => pos.getZ(i));
    return new THREE.Vector3(cx + side * pct(oxs, 0.25), pct(yys, 0.8), zzs.reduce((a, b) => a + b, 0) / zzs.length);
  }
  function handPoint(ids, side) {
    if (ids.length < 4) return new THREE.Vector3(cx + side * H * 0.3, spineY - H * 0.22, midz);
    const oxs = ids.map((i) => Math.abs(xs[i] - cx));
    const yys = ids.map((i) => ys[i]);
    return new THREE.Vector3(cx + side * pct(oxs, 0.9), pct(yys, 0.12), midz);
  }
  function footPoint(ids, side) {
    if (ids.length < 4) return new THREE.Vector3(cx + side * H * 0.07, box.min.y + 0.01, midz);
    return new THREE.Vector3(pct(ids.map((i) => xs[i]), 0.5), pct(ids.map((i) => ys[i]), 0.02), midz);
  }

  const shL = shoulderPoint(armLV, -1), shR = shoulderPoint(armRV, 1);
  const handL = handPoint(armLV, -1), handR = handPoint(armRV, 1);
  const footL = footPoint(legLV, -1), footR = footPoint(legRV, 1);

  // 腿骨枢轴放在胯部两侧（不是脚底），走路才会绕胯摆动
  const hipL = new THREE.Vector3(cx - H * RIG.HIP_SPREAD, hipY, midz);
  const hipR = new THREE.Vector3(cx + H * RIG.HIP_SPREAD, hipY, midz);

  // ---- 骨骼 ----
  const pelvis = new THREE.Bone(); pelvis.position.set(cx, hipY, midz);
  const spine = new THREE.Bone(); spine.position.set(0, spineY - hipY, 0);
  const head = new THREE.Bone(); head.position.set(0, neckY - spineY, 0);
  const armL = new THREE.Bone(); armL.position.set(shL.x - cx, shL.y - spineY, shL.z - midz);
  const armR = new THREE.Bone(); armR.position.set(shR.x - cx, shR.y - spineY, shR.z - midz);
  const legL = new THREE.Bone(); legL.position.set(hipL.x - cx, 0, hipL.z - midz);
  const legR = new THREE.Bone(); legR.position.set(hipR.x - cx, 0, hipR.z - midz);

  pelvis.add(spine);
  spine.add(head); spine.add(armL); spine.add(armR);
  pelvis.add(legL); pelvis.add(legR);

  const boneArr = [pelvis, spine, head, armL, armR, legL, legR];

  // ---- 蒙皮半径 ----
  function limbRadius(ids, a, b, cap) {
    if (ids.length < 4) return H * 0.06;
    const ds = ids.map((i) => distToSeg(pos.getX(i), pos.getY(i), pos.getZ(i), a.x, a.y, a.z, b.x, b.y, b.z));
    return Math.min(cap, Math.max(H * 0.02, pct(ds, 0.7) * 1.5));
  }
  const rArmL = limbRadius(armLV, shL, handL, H * 0.13);
  const rArmR = limbRadius(armRV, shR, handR, H * 0.13);
  const rLegL = limbRadius(legLV, hipL, footL, H * RIG.LEG_R_MAX);
  const rLegR = limbRadius(legRV, hipR, footR, H * RIG.LEG_R_MAX);

  let rHead = H * 0.16;
  if (headV.length) {
    const ds = headV.map((i) => Math.max(Math.abs(pos.getX(i) - cx), Math.abs(pos.getZ(i) - midz)));
    rHead = pct(ds, 0.8) * 1.3;
  }
  let rBelly = H * 0.22;
  if (bellyV.length) {
    const ds = bellyV.map((i) => {
      _v1.set(pos.getX(i) - cx, 0, pos.getZ(i) - midz);
      return _v1.length();
    });
    rBelly = pct(ds, 0.8) * 1.2;
  }

  const segs = [
    [cx, hipY, midz, cx, spineY, midz, rBelly * 1.15],   // pelvis
    [cx, spineY, midz, cx, neckY, midz, rBelly],         // spine
    [cx, neckY, midz, cx, box.max.y, midz, rHead],       // head
    [shL.x, shL.y, shL.z, handL.x, handL.y, handL.z, rArmL],
    [shR.x, shR.y, shR.z, handR.x, handR.y, handR.z, rArmR],
    [hipL.x, hipL.y, hipL.z, footL.x, footL.y, footL.z, rLegL],
    [hipR.x, hipR.y, hipR.z, footR.x, footR.y, footR.z, rLegR],
  ];

  // ---- 逐顶点权重：取距离最近的 4 根骨，按 (1-d/r)^2 归一 ----
  const skinIdx = new Uint16Array(VN * 4);
  const skinW = new Float32Array(VN * 4);
  const ws = new Array(boneArr.length);
  let fallback = 0;

  for (let i = 0; i < VN; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let sum = 0, best = -1, bestW = 1e-6;
    for (let b = 0; b < boneArr.length; b++) {
      const s = segs[b];
      const d = distToSeg(px, py, pz, s[0], s[1], s[2], s[3], s[4], s[5]);
      let w = 1 - d / s[6];
      if (w < 0) w = 0;
      w = w * w;
      ws[b] = w; sum += w;
      if (w > bestW) { bestW = w; best = b; }
    }
    if (sum < 1e-4) {
      fallback++;
      skinIdx[i * 4] = best < 0 ? 0 : best;
      skinW[i * 4] = 1;
      continue;
    }
    const order = ws.map((w, bi) => [w / sum, bi]).sort((a, b) => b[0] - a[0]).slice(0, 4);
    for (let k = 0; k < 4; k++) {
      skinIdx[i * 4 + k] = order[k][1];
      skinW[i * 4 + k] = order[k][0];
    }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));

  // ---- 层级：root → yaw（朝向）→ tilt（起伏/侧倾）→ rig（把模型脚底对到原点）----
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const tilt = new THREE.Group();
  const rig = new THREE.Group();
  root.add(yaw); yaw.add(tilt); tilt.add(rig);
  rig.position.set(-cx, -box.min.y, -midz);

  const mat = srcMesh.material.clone();
  mat.side = THREE.DoubleSide;   // 模型不密封，双面渲染避免破面

  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;    // 蒙皮包围盒会算错，关掉剔除防闪
  rig.add(mesh);
  rig.add(pelvis);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneArr);
  skeleton.calculateInverses();
  mesh.bind(skeleton);

  const scale = RIG.TARGET_H / H;
  root.scale.setScalar(scale);

  // 原始场景只是借几何用，解析完就释放
  gltf.scene.traverse((n) => { if (n.isMesh) n.geometry.dispose(); });

  const bones = { pelvis, spine, head, armL, armR, legL, legR };
  console.log(`[奶蛙] 顶点 ${VN}，7 骨，兜底顶点 ${fallback}，身高 ${RIG.TARGET_H}`);

  return makeFrogObject({ root, yaw, tilt, mesh, bones });
}

// ------------------------------------------------------------
// 动作：待机呼吸 + 走路循环
// ------------------------------------------------------------
function makeFrogObject(parts) {
  const { root, yaw, tilt, mesh, bones } = parts;
  const { spine, head, armL, armR, legL, legR } = bones;

  const st = { phase: 0, t: 0, speed: 0 };
  let atkT = 0;    // 攻击动作剩余时间

  return {
    root, yaw, tilt, mesh, bones,
    // 出手瞬间调用：重播一次拍击，不排队（连击就是重新起手）
    playAttack() { atkT = ATK.dur; },
    get attacking() { return atkT > 0; },
    update(dt, speed01) {
      st.t += dt;
      // 速度做二次平滑：起步/刹车不会瞬间切换动画
      st.speed += (Math.max(0, Math.min(1, speed01)) - st.speed) * Math.min(1, dt * 9);
      const b = st.speed;                      // 走路权重
      const idle = 1 - b;                      // 待机权重

      // 步频：全速约 1.7 个循环/秒（= 3.4 步/秒）
      st.phase += dt * Math.PI * 2 * (0.8 + 0.9 * b) * b;

      const swing = Math.sin(st.phase);
      const swing2 = Math.sin(st.phase * 2);

      // 腿：绕胯前后摆
      legL.rotation.x = swing * 0.62 * b;
      legR.rotation.x = -swing * 0.62 * b;
      // 手臂反向摆 + 待机时微微张开
      // 摆臂幅度 0.42 → 0.86：顶视角下原本几乎看不出来，加大才「看得出在跑」
      armL.rotation.x = -swing * 0.86 * b;
      armR.rotation.x = swing * 0.86 * b;
      armL.rotation.z = -0.06 - 0.03 * idle + Math.sin(st.t * 1.1) * 0.02 * idle - Math.abs(swing) * 0.10 * b;
      armR.rotation.z = 0.06 + 0.03 * idle - Math.sin(st.t * 1.1) * 0.02 * idle + Math.abs(swing) * 0.10 * b;

      // 身体：上下起伏（每步一次）+ 左右轻摆 + 前倾
      tilt.position.y = Math.abs(swing2) * 0.055 * b + Math.sin(st.t * 1.6) * 0.015 * idle;
      tilt.rotation.z = swing * 0.045 * b;
      tilt.rotation.x = -0.07 * b;

      // 脊柱/头：抵消一部分起伏，保持视线水平
      spine.rotation.x = 0.04 * b;
      // 躯干跟着摆臂反向扭一点：手臂 + 躯干一起动，跑起来才「有劲」
      spine.rotation.y = Math.sin(st.t * 0.55) * 0.05 * idle - swing * 0.09 * b;
      head.rotation.x = -0.03 * b + Math.sin(st.t * 1.3) * 0.02 * idle;
      head.rotation.y = Math.sin(st.t * 0.8) * 0.07 * idle;
      head.rotation.z = -swing * 0.05 * b;

      // ---- 攻击覆盖层：叠在走/待机之上，所以放在最后加 ----
      if (atkT > 0) {
        atkT = Math.max(0, atkT - dt);
        const p = attackPose(1 - atkT / ATK.dur);
        armR.rotation.x += p.arm;
        armL.rotation.x += p.arm * 0.40;          // 另一只手跟着甩一点，别太僵
        armR.rotation.z += Math.sin((1 - atkT / ATK.dur) * Math.PI) * 0.26;
        tilt.rotation.x += p.lean;
        tilt.position.z = p.lunge;
        spine.rotation.y += p.twist;
        head.rotation.x -= p.lean * 0.45;         // 头稳住，别整个栽下去
        head.rotation.y -= p.twist * 0.3;
      } else {
        tilt.position.z = 0;
      }
    },
  };
}

// ------------------------------------------------------------
// 兜底：模型加载失败时用几何体拼一只，保证页面还能走
// ------------------------------------------------------------
export function buildFallbackFrog() {
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const tilt = new THREE.Group();
  const rig = new THREE.Group();
  root.add(yaw); yaw.add(tilt); tilt.add(rig);

  const skin = new THREE.MeshStandardMaterial({ color: 0x7fd6a8, roughness: 0.75, metalness: 0.05 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xd9f5cf, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), skin);
  body.position.y = 0.65; body.scale.set(1, 1.12, 0.92);
  body.castShadow = true; rig.add(body);

  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 14), belly);
  tummy.position.set(0, 0.6, 0.28); tummy.scale.set(1, 1.05, 0.55);
  rig.add(tummy);

  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), skin);
  headM.position.y = 1.42; headM.castShadow = true; rig.add(headM);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf7fff9 }));
    eye.position.set(s * 0.18, 1.55, 0.36); rig.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0x121a18 }));
    pupil.position.set(s * 0.18, 1.55, 0.44); rig.add(pupil);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, 6, 12), skin);
    arm.position.set(s * 0.52, 0.72, 0); arm.castShadow = true; rig.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 6, 12), skin);
    leg.position.set(s * 0.24, 0.22, 0); leg.castShadow = true; rig.add(leg);
  }
  root.scale.setScalar(1);

  const bones = {};
  let atkT = 0;
  return {
    root, yaw, tilt, mesh: body, bones, fallback: true,
    playAttack() { atkT = ATK.dur; },
    get attacking() { return atkT > 0; },
    // 兜底角色没有骨骼，只有整体起伏，但接口保持一致
    update(dt, speed01) {
      const b = Math.max(0, Math.min(1, speed01));
      fallbackT += dt * Math.PI * 2 * (0.8 + 0.9 * b) * b;
      tilt.position.y = Math.abs(Math.sin(fallbackT * 2)) * 0.06 * b;
      tilt.rotation.x = -0.06 * b;
      tilt.rotation.z = Math.sin(fallbackT) * 0.05 * b;
      // 攻击：没有手臂可动，整体往前一扑
      if (atkT > 0) {
        atkT = Math.max(0, atkT - dt);
        const push = Math.sin((1 - atkT / ATK.dur) * Math.PI);
        tilt.position.z = push * 0.34;
        tilt.rotation.x -= push * 0.46;
      } else {
        tilt.position.z = 0;
      }
    },
  };
}
let fallbackT = 0;
