// ============================================================
// enemy.js —— 怪物系统（模型加载 / 克隆 / AI / 血条 / 死亡）
//
// 模型来自 KayKit《Skeletons》（CC0），已裁剪成 7~9 段动画。
// 每只怪 = SkeletonUtils 克隆的蒙皮模型 + 独立 AnimationMixer。
//
// 第一关现在启用四种：
//   minion  小兵   —— 直线冲脸，碰到主角自毁并造成 1 伤害
//   warrior 战士   —— 追到近战距离后停下挥拳，攻击不扣自己的血
//   archer  投手   —— 远程：进射程拉弓 0.72 秒后掷出骨刀（有弹道，能靠横移躲开），
//                     主角贴太近会后退风筝（第 11 回合起登场）
//   bowman  弓手   —— 远程（第 12 块）：站在远处拉弓，把**红圈钉在你脚下**，
//                     1.15 秒后箭从天而降，圈里挨打、圈外没事（第 12 回合起登场）
//
// 第五种（mage）只写好了配置，暂不生成。
// ============================================================
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../lib/jsm/utils/SkeletonUtils.js';
import { distance2D } from './stats.js';
import { createRangeRing } from './rangeRing.js';

// KayKit 模型正面朝 +Z；如果哪天换模型发现怪倒着走，把这里改成 Math.PI
export const ENEMY_MODEL_YAW = 0;

// 动画名（裁剪时保留的几段，与 .tmp-shrink-glb.py / .tmp-shrink-bow.py 的 keep 列表一致）
const ANIM = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  hit: 'Hit_A',
  death: 'Death_A',
  spawn: 'Spawn_Ground',
  punch: 'Unarmed_Melee_Attack_Punch_A',
  aim: '1H_Ranged_Aiming',      // 举弓瞄准（裁剪时特意多留的两段弓类动画）
  shoot: '1H_Ranged_Shoot',     // 放箭
  cast: 'Spellcast_Shoot',      // 巫师读条（mage 模型自带，第 20 块）
};

export const ENEMY_TYPES = {
  // ---------------- 第一关：小兵 ----------------
  // sourceHeight 是【实测】的渲染身高（缩放 1.0、播放 Idle 时的头顶高度，
  // 单位：世界单位，脚底就在原点）。测量方法：模型放原点 + 1×1 网格 +
  // 0→2 参考线截图目测（见 .tmp-origin-check.html 的做法）。
  // ⚠️ 不能用几何包围盒代替 —— KayKit 模型的绑定姿态和实际渲染差得极远，
  // 也不能用 SkinnedMesh.boneTransform()（bindMatrixInverse 在这批模型上
  // 会算出全 0）。换模型时必须重新截图标定。
  minion: {
    name: '骷髅小兵',
    file: 'assets/monsters/skeleton-minion.glb',
    sourceHeight: 1.05,    // 实测：头顶 ≈1.05
    height: 1.14,          // 归一化后的身高（世界单位）
    radius: 0.38,          // 碰撞半径
    hp: 1,
    armor: 0,
    speed: 2.30,           // 世界单位/秒（主角 4.4，能被拉开）：小兵最快，追得凶
    contactRange: 0.62,    // 额外接触距离（主角半径 + 这个值即触发自爆）
    damage: 1,
    spawnTime: 0.9,        // 从地里钻出来的时间，期间无敌不动
    deathTime: 0.35,       // 自爆后的消散时间
    selfDestruct: true,
    color: 0xffd9a0,
    ringColor: 0xffc07a,   // 脚下接触圈的颜色（半径见 updateOne：主角半径 + contactRange）
    anim: { walk: ANIM.walk, idle: ANIM.idle, death: ANIM.death, spawn: ANIM.spawn },
  },

  // ---------------- 第一关：战士 ----------------
  warrior: {
    name: '骷髅战士',
    file: 'assets/monsters/skeleton-warrior.glb',
    sourceHeight: 1.15,    // 实测：头顶（含盔缨）≈1.15
    height: 1.38,
    radius: 0.50,
    hp: 3,
    armor: 0,
    speed: 1.15,           // 最慢的一只：穿着甲，一步一步挪过来（能绕到背后打）
    attackRange: 1.55,     // 近战范围（主角攻击范围 2.1，玩家可以先手）
    damage: 1,
    attackInterval: 1.7,   // 两次挥拳的间隔
    windup: 0.45,          // 前摇：抬手到命中，玩家可以躲开
    spawnTime: 1.0,
    deathTime: 1.5,
    selfDestruct: false,
    color: 0xa8e0ff,
    ringColor: 0xff8a6a,   // 脚下近战圈 = attackRange
    anim: {
      walk: ANIM.walk, idle: ANIM.idle, attack: ANIM.punch,
      death: ANIM.death, spawn: ANIM.spawn,
    },
  },

  // ---------------- 第三种：远程投手（第 11 回合起登场） ----------------
  // 行为：远远地绕着主角跑，进射程（7.0）就拉弓，前摇 0.72 秒后掷骨刀。
  // 骨刀是**实体弹道**（速度 5.6，飞 2.6 秒或出界消失）—— 主角移速 4.4，
  // 横着走两步就能躲开。第 6 块按用户反馈把伤害/频率/弹速都压下来了：
  // 伤害 2 → 1、攻击间隔 2.6 → 3.6 秒、弹速 8.5 → 5.6、前摇 0.55 → 0.72
  // （前摇变长 = 看得出来要出手，有反应时间）。
  archer: {
    name: '骷髅投手',
    file: 'assets/monsters/skeleton-rogue.glb',
    sourceHeight: 1.10,    // 实测：蒙皮顶点法 + 三怪并排截图（投手比小兵高约 6%、比战士瘦，见 README「怪物身高标定」）
    height: 1.28,
    radius: 0.42,
    hp: 2,
    armor: 0,
    speed: 1.50,           // 比小兵慢、比战士快（三种怪的速度刻意拉开，不再齐步走）
    attackRange: 7.0,      // 射程：进了这个圈才开始拉弓
    keepDistance: 4.2,     // 比这个近就后退（不会站着被贴脸）
    damage: 1,             // 骨刀命中伤害（第 1 回合基准，之后按回合倍率成长）
    attackInterval: 3.6,   // 两次掷刀的间隔
    windup: 0.72,          // 前摇：拉弓到出手
    attackDuration: 1.0,   // 整段投掷动画时长（前摇 + 收势）
    projectile: {
      speed: 5.6,          // 骨刀飞行速度（世界单位/秒）
      radius: 0.30,        // 弹体判定半径
      life: 2.6,           // 最长存活时间（超时自散）
      y: 0.85,             // 飞行高度
      color: 0xffc46a,
    },
    spawnTime: 0.95,
    deathTime: 1.4,
    selfDestruct: false,
    color: 0xffd08a,
    // 不画脚下圈：射程 7 的圈太大，会盖住半个战场（远程靠弹道和拉弓提示区分）
    anim: {
      walk: ANIM.walk, idle: ANIM.idle, attack: ANIM.punch,
      death: ANIM.death, spawn: ANIM.spawn,
    },
  },

  // ---------------- 第四种：骷髅弓手（第 12 块，第 12 回合起登场） ----------------
  // 行为：不掷弹道，而是**把红圈钉在你当下的位置**（圈不会再跟人走），
  // 1.15 秒后箭从天上落进圈里 —— 圈里挨一发、圈外完全没事。
  // 所以它惩罚的是「站着不动」和「被围住跑不掉」，跟投手的「直线弹道」互补：
  //   · 投手：横着走两步就躲开
  //   · 弓手：看到脚下红圈必须挪出去，站着输出就会被钉
  // 数值取向：血比投手厚一点（3）、射速更慢（4.6 秒一轮）、离得更远（射程 8、keep 5）。
  bowman: {
    name: '骷髅弓手',
    file: 'assets/monsters/skeleton-mage.glb',   // 长袍骷髅，和投手（皮甲游荡者）一眼能分开
    sourceHeight: 1.20,    // 估算值，启用后按原点参照物截图重标（README「怪物身高标定」）
    height: 1.44,
    radius: 0.45,
    hp: 3,
    armor: 0,
    speed: 1.25,           // 比战士快一点、比投手慢：追不上你，但会把你赶进圈里
    attackRange: 8.0,      // 进这个距离就站定拉弓
    keepDistance: 5.0,     // 比这个近就后退（红圈是远程手段，不跟你贴脸）
    damage: 1,
    attackInterval: 4.6,   // 一轮齐射的间隔（前摇 1.15 已经很长了，别太密）
    windup: 1.15,          // 红圈出现 → 箭落地的时间（这就是你的走位窗口）
    attackDuration: 1.85,  // 整段动画（瞄准 + 放箭 + 收势）
    volley: {
      radius: 1.9,         // 红圈半径（世界单位）—— 站在圈边也来得及走出去
      fall: 0.30,          // 箭从天上落到地面的时间（视觉）
      arrows: 7,           // 一次落几支（纯视觉，伤害只结算一次）
      color: 0xff5c46,     // 红圈 / 箭羽的颜色
      y: 6.2,              // 箭从多高落下
    },
    spawnTime: 1.05,
    deathTime: 1.5,
    selfDestruct: false,
    color: 0xc9f0a6,
    ringColor: 0xff5c46,   // 红圈是它的招牌，脚下不画常驻环（远程不画，见 hasRing）
    anim: {
      walk: ANIM.walk, idle: ANIM.idle, aim: ANIM.aim, attack: ANIM.shoot,
      death: ANIM.death, spawn: ANIM.spawn,
    },
  },

  // ============================================================
  // 第二关：三位巫师
  //
  // 【设计定案 · 第 20 块】用户明确要求：**一个巫师只带一个招牌技能**，
  // 不许出现「一个人又会减速又会灼地还带光环」的全能法师。
  // 所以三人共用一套 mage 骨架，但各自只负责一种压力，逼玩家换应对方式：
  //
  //   hexer    骨咒师   —— 时间压力。紫阵钉在脚下，落地掉血 + 减速。
  //                        躲得掉，但两只以上会连发，被粘住就走不动。
  //   pyro     火焚巫祝 —— 空间压力。地上留一片灼地烧 4 秒，好位置被一片片烧掉。
  //                        不许站桩，输出节奏被迫切碎。
  //   hierarch 霜牢主祭 —— 目标选择压力。自己不还手、血最厚、站最后排，
  //                        但给范围内小怪 +35% 攻速 +25% 减伤。不点它就全场变凶。
  //
  // 三者外观靠「帽子 / 眼睛发光色 / 手持法器 / 身高」四件事区分（见 skin）——
  // 素材库只有一套巫师骨架，程序化装备是这里唯一能做出三种模型的路径。
  // 将来若有独立 glb，只改各自的 file / sourceHeight 即可，其余代码不用动。
  //
  // sourceHeight 已验证（2026-10-21）：三个巫师与 minion 1.05 / warrior 1.15 同一把尺，
  // 并排截图 + 离线正交渲染剪影确认视觉比例与落脚正确（脚底 ≈ -0.01）。
  // 注意：骨架本身比骷髅兵矮，视觉高度主要靠帽子/骨冠/法杖撑起来，
  // 所以「含配件总高」的自动量法会得出乱数，改数值请走截图人眼比对。
  // ============================================================
  hexer: {
    name: '骨咒师',
    file: 'assets/monsters/skeleton-mage.glb',
    // sourceHeight 实测记录（2026-10-21）：三个巫师与 minion(1.05)/warrior(1.15) 同一把尺，
    // 并排截图比对（剪影图可用班级网站根的 .tmp-height-ortho.js 重出）确认视觉比例正确、
    // 脚底 footY ≈ -0.01 不浮不陷。⚠️ 不要用「逐顶点 applyBoneTransform / gl.readPixels
    // 量像素」去"精确标定"——两种自动量法都给出 2.2~3.4 的乱数（骨架本身比小兵矮、
    // 高度全靠帽子/法杖撑起来，剪影顶点根本不是头）。要动就先并排截图人眼比对。
    sourceHeight: 1.20,
    height: 1.32,
    radius: 0.45,
    hp: 4,
    armor: 0,
    speed: 1.05,           // 慢，但站得远：想杀它得主动冲进去
    attackRange: 8.0,      // 读条距离
    keepDistance: 5.0,     // 比这个近就后退
    damage: 1,
    attackInterval: 3.4,
    windup: 1.5,           // 读条 = 圈出现到落地，玩家有 1.5 秒走出去
    attackDuration: 2.0,
    castTime: 1.5,         // 有它就说明「这个远程不画脚下范围环」
    spell: { kind: 'hex', radius: 2.4, color: 0xa96bff },
    debuff: { factor: 0.62, duration: 2.6 },   // 主角移速 ×0.62，2.6 秒
    spawnTime: 1.0,
    deathTime: 1.6,
    selfDestruct: false,
    color: 0xd7a8ff,
    skin: { eye: 0xc08cff, hat: true, staff: 'bone', body: 0xcfc4e8 },
    anim: {
      walk: ANIM.walk, idle: ANIM.idle, cast: ANIM.cast,
      death: ANIM.death, spawn: ANIM.spawn,
    },
  },

  pyro: {
    name: '火焚巫祝',
    file: 'assets/monsters/skeleton-mage.glb',
    sourceHeight: 1.20,    // 实测记录见 hexer 处（并排截图比对，勿用自动量法）
    height: 1.22,          // 比骨咒师矮一点：摘了帽子，也更快
    radius: 0.42,
    hp: 3,
    armor: 0,
    speed: 1.35,           // 三个巫师里最灵活，追它容易被灼地拖住
    attackRange: 7.2,
    keepDistance: 4.6,
    damage: 1,
    attackInterval: 4.0,
    windup: 1.1,           // 读条更短，但威胁是留在地上的火而不是瞬间伤害
    attackDuration: 1.7,
    castTime: 1.1,
    spell: { kind: 'burn', radius: 2.0, color: 0xff8a3c, burnTime: 4.0, tick: 0.6 },
    spawnTime: 1.0,
    deathTime: 1.5,
    selfDestruct: false,
    color: 0xffb27a,
    skin: { eye: 0xff7a3a, hat: false, staff: 'torch', body: 0xe8b8a0 },
    anim: {
      walk: ANIM.walk, idle: ANIM.idle, cast: ANIM.cast,
      death: ANIM.death, spawn: ANIM.spawn,
    },
  },

  hierarch: {
    name: '霜牢主祭',
    file: 'assets/monsters/skeleton-mage.glb',
    sourceHeight: 1.20,    // 实测记录见 hexer 处（并排截图比对，勿用自动量法）
    height: 1.52,          // 最高的一只：戴骨冠、披着气场，一眼就能认出来
    radius: 0.52,
    hp: 5,                 // 不还手，换血最厚（第 20 回合 24 血，得专门冲一趟）
    armor: 0,
    speed: 0.95,           // 最慢，跑不掉
    keepDistance: 6.2,     // 没有 attackRange：它不进近战分支，也不会出手
    spawnTime: 1.1,
    deathTime: 1.8,
    selfDestruct: false,
    color: 0x9ee8ff,
    aura: { radius: 4.6, haste: 0.35, armor: 0.25 },   // 攻速 +35% / 减伤 25%
    skin: { eye: 0x7ef0ff, hat: false, crown: true, staff: 'crystal', body: 0xbfe0f0 },
    anim: {
      walk: ANIM.walk, idle: ANIM.idle,
      death: ANIM.death, spawn: ANIM.spawn,
    },
  },
};

// ------------------------------------------------------------
// 弓手手里的弓（程序化，不需要额外贴图/模型文件）
// 弧形用 TorusGeometry 取一段圆弧，弦用一条 Line。
// 挂到骨骼 handslot.r / hand.r 上 —— **朝向用「骨骼世界四元数 → 模型世界四元数」
// 反解**，这样不管 KayKit 的骨骼轴怎么摆，弓的 +X 永远对着角色正面。
// 想微调就改 BOW_TWEAK / BOW_POS（局部四元数与位置），不用碰别的。
// ------------------------------------------------------------
let bowGeoCache = null;
const BOW_TWEAK = new THREE.Quaternion();   // 需要转 90° 就 setFromAxisAngle(Y, ±PI/2)
const BOW_POS = new THREE.Vector3(0, 0, 0);

function makeBow() {
  if (!bowGeoCache) {
    const R = 0.40, tube = 0.02;
    const arc = new THREE.TorusGeometry(R, tube, 4, 18, Math.PI * 1.15);
    arc.rotateZ(-Math.PI * 0.575);              // 弧口朝 -X，两端在上/下
    const tipX = R * Math.cos(Math.PI * 0.575);
    const tipY = R * Math.sin(Math.PI * 0.575);
    const str = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(tipX, tipY, 0),
      new THREE.Vector3(tipX, -tipY, 0),
    ]);
    bowGeoCache = { arc, str };
  }
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.78, metalness: 0.06 });
  const arcMesh = new THREE.Mesh(bowGeoCache.arc, wood);
  arcMesh.castShadow = true;
  arcMesh.frustumCulled = false;
  const line = new THREE.Line(bowGeoCache.str, new THREE.LineBasicMaterial({ color: 0xe8dcc2 }));
  line.frustumCulled = false;
  g.add(arcMesh, line);
  g.userData.mats = [wood];
  return g;
}

// 把弓塞进右手：先求「骨骼世界朝向」与「模型世界朝向」的差，再补一个微调四元数
// ⚠️ GLTFLoader 会把骨骼名里的 '.' 洗掉（handslot.r → handslotr），所以要两个名字都试
function attachBow(root, model) {
  const slot = model.getObjectByName('handslot.r')
    || model.getObjectByName('handslotr')
    || model.getObjectByName('hand.r')
    || model.getObjectByName('handr');
  if (!slot) return null;
  const bow = makeBow();
  model.updateMatrixWorld(true);
  const qb = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  slot.getWorldQuaternion(qb);
  root.getWorldQuaternion(qr);
  bow.quaternion.copy(qb.invert().multiply(qr).multiply(BOW_TWEAK));
  bow.position.copy(BOW_POS);
  slot.add(bow);
  return bow;
}

// ------------------------------------------------------------
// 巫师的「三套装备」（程序化，不额外占下载体积）
//
// 素材库只有一套 mage 骨架，三位巫师是靠这里做出「三个模型」的：
//   帽子开关 + 眼睛发光色 + 手持法器 + 身高，四件事叠起来在游戏视角下足够分辨。
// 法杖挂右手骨骼，朝向用和弓一样的「骨骼世界四元数 → 模型世界四元数」反解，
// 所以不管 KayKit 的骨骼轴怎么摆，杖身都保持竖直。
//
// ⚠️ GLTFLoader 会把骨骼名里的 '.' 洗掉（handslot.r → handslotr），两个名字都要试。
// ------------------------------------------------------------
const STAFF_STYLES = {
  bone:    { rod: 0xcfc9b8, tip: 0xa96bff, len: 1.00, orb: 0.075 },   // 骨咒师：短骨杖 + 紫晶
  torch:   { rod: 0x8a5a34, tip: 0xff7a2a, len: 0.82, orb: 0.062 },   // 火焚巫祝：短炬 + 橙火
  crystal: { rod: 0xa9d8ee, tip: 0x7ef0ff, len: 1.42, orb: 0.085 },   // 霜牢主祭：长杖 + 青晶
};

function makeStaff(kind) {
  const st = STAFF_STYLES[kind] || STAFF_STYLES.bone;
  const g = new THREE.Group();
  const rodMat = new THREE.MeshStandardMaterial({ color: st.rod, roughness: 0.72, metalness: 0.12 });
  const glowMat = new THREE.MeshBasicMaterial({ color: st.tip });

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, st.len, 6), rodMat);
  rod.position.y = st.len * 0.30;
  rod.castShadow = true;
  rod.frustumCulled = false;
  g.add(rod);

  const tipY = st.len * 0.30 + st.len * 0.5 + 0.06;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(st.orb, 1), glowMat);
  orb.position.y = tipY;
  orb.frustumCulled = false;
  g.add(orb);

  if (kind === 'bone') {
    // 三根骨刺围住紫晶，像一只骨爪
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14, 4), rodMat);
      spike.position.set(Math.cos(a) * 0.065, tipY + 0.035, Math.sin(a) * 0.065);
      spike.rotation.z = -Math.cos(a) * 0.55;
      spike.rotation.x = Math.sin(a) * 0.55;
      spike.frustumCulled = false;
      g.add(spike);
    }
  } else if (kind === 'torch') {
    // 两侧各一颗小火球，看起来像举着火
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.042, 0), glowMat);
      s.position.set(i ? 0.085 : -0.085, tipY - 0.075, 0);
      s.frustumCulled = false;
      g.add(s);
    }
  } else {
    // 主祭：一圈悬浮的横环，气场感
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.011, 4, 20), glowMat);
    ring.position.y = tipY;
    ring.rotation.x = Math.PI / 2;
    ring.frustumCulled = false;
    g.add(ring);
  }

  g.userData.mats = [rodMat];
  return g;
}

function attachStaff(root, model, kind) {
  const slot = model.getObjectByName('handslot.r')
    || model.getObjectByName('handslotr')
    || model.getObjectByName('hand.r')
    || model.getObjectByName('handr');
  if (!slot) return null;
  const staff = makeStaff(kind);
  model.updateMatrixWorld(true);
  const qb = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  slot.getWorldQuaternion(qb);
  root.getWorldQuaternion(qr);
  staff.quaternion.copy(qb.invert().multiply(qr));
  staff.position.set(0, -0.03, 0);
  slot.add(staff);
  return staff;
}

// 换肤：帽子开合 / 眼睛发光色 / 骨体染色 / 骨冠
function applyWizardSkin(model, skin) {
  if (!skin) return;
  const body = new THREE.Color(skin.body ?? 0xffffff);
  const eye = new THREE.Color(skin.eye ?? 0xffffff);

  model.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || '';
    if (/Hat/i.test(n)) { o.visible = !!skin.hat; return; }   // 帽子是独立 mesh
    const m = o.material;
    if (!m) return;
    if (/Eyes/i.test(n)) {
      if (m.color) m.color.copy(eye);
      if (m.emissive) { m.emissive.copy(eye); m.emissiveIntensity = 2.4; }
      return;
    }
    if (m.color) m.color.copy(body);   // 骨体整体染色（贴图偏白，乘上去就是新色调）
  });

  // 骨冠：主祭专属。挂在 head 骨骼上，跟着动画一起动。
  if (skin.crown) {
    const head = model.getObjectByName('head');
    if (head) {
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0xd8f6ff, emissive: 0x1f5a70, emissiveIntensity: 0.9,
        roughness: 0.38, metalness: 0.55,
      });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.20, 4), crownMat);
        spike.position.set(Math.cos(a) * 0.175, 0.16, Math.sin(a) * 0.175);
        spike.rotation.z = -Math.cos(a) * 0.28;
        spike.rotation.x = Math.sin(a) * 0.28;
        spike.frustumCulled = false;
        head.add(spike);
      }
    }
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ------------------------------------------------------------
// 怪物血条：一张 96×12 的 canvas 贴图 + Sprite，受伤才显示
// ------------------------------------------------------------
function createBar(cfg) {
  const W = 168, H = 42;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const spr = new THREE.Sprite(mat);
  // 头顶常驻血条：宽随身高、高固定。
  // ⚠️ 必须抬到头顶上方约 0.95 —— 相机是俯视 45°，贴得太近会被怪自己的头挡住。
  const w = cfg.height * 1.18;
  spr.scale.set(w, w * (H / W), 1);
  spr.position.y = cfg.height + 0.95;
  spr.visible = true;
  spr.renderOrder = 5;

  // ratio：血量比例；hp/maxHp：条中间的数值（不传就只画条）
  function draw(ratio, hp, maxHp) {
    const r = Math.max(0, Math.min(1, ratio));
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(2,10,8,0.86)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = r > 0.5 ? '#8ef7c8' : r > 0.25 ? '#ffd166' : '#ff7a66';
    g.fillRect(3, 3, (W - 6) * r, H - 6);
    g.strokeStyle = 'rgba(190,255,230,0.55)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);

    if (hp != null && maxHp != null) {
      // 血量数值保留 1 位小数（伤害小数化后，取整会让玩家看不出来）
      const txt = `${Math.max(0, hp).toFixed(1)}/${maxHp.toFixed(1)}`;
      g.font = '700 23px ui-monospace,Menlo,Consolas,monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(2,12,10,0.85)';
      g.strokeText(txt, W / 2, H / 2 + 1);
      g.fillStyle = r > 0.25 ? '#06231c' : '#2a0b06';
      g.fillText(txt, W / 2, H / 2 + 1);
    }
    tex.needsUpdate = true;
  }
  draw(1);
  return { spr, draw, tex, mat };
}

// ------------------------------------------------------------
export function createEnemySystem({ scene, fx, arenaRadius = 15, onDeath }) {
  const assets = new Map();   // type -> { scene, clips, height, minY }
  const list = [];            // 场上所有怪（含正在消散的）
  let uid = 0;

  // ---------------- 加载 ----------------
  async function loadType(type) {
    if (assets.has(type)) return assets.get(type);
    const cfg = ENEMY_TYPES[type];
    // 同一个 glb 只解析一次：三位巫师共用 mage 骨架，
    // 不共用就会出现「一份模型在内存里存三份、动画也建三套」。
    for (const [k, v] of assets) {
      if (ENEMY_TYPES[k] && ENEMY_TYPES[k].file === cfg.file) {
        assets.set(type, v);
        return v;
      }
    }
    const gltf = await new GLTFLoader().loadAsync(cfg.file);

    const clips = {};
    for (const c of gltf.animations) clips[c.name] = c;

    const data = { scene: gltf.scene, clips };
    assets.set(type, data);
    return data;
  }

  async function preload(types, onProgress) {
    const all = types.filter((t) => !ENEMY_TYPES[t].planned);
    for (let i = 0; i < all.length; i++) {
      await loadType(all[i]);
      if (onProgress) onProgress((i + 1) / all.length);
    }
  }

  // ---------------- 生成 ----------------
  // opts 里是**本只怪**的属性倍率（按回合成长传进来，见 wave.js 的 roundScale）：
  //   hpScale / damageScale / speedScale
  // 注意倍率只落在实例上，绝不改 ENEMY_TYPES —— 否则后一波会叠乘前一波。
  function spawn(type, at, opts = {}) {
    const cfg = ENEMY_TYPES[type];
    const src = assets.get(type);
    if (!cfg || !src) {
      console.warn('[怪物] 未加载的类型：', type);
      return null;
    }

    // 数值兜底：霜牢主祭这类「不出手」的怪没有 damage 字段，
    // 直接乘会得到 NaN（Math.max(1, NaN) 依然是 NaN），存档/面板都可能带出脏值。
    const hpBase = Number.isFinite(cfg.hp) ? cfg.hp : 1;
    const dmgBase = Number.isFinite(cfg.damage) ? cfg.damage : 0;
    const spdBase = Number.isFinite(cfg.speed) ? cfg.speed : 1;
    const maxHp = Math.max(1, Math.round(hpBase * (opts.hpScale ?? 1)));
    const damage = Math.max(1, Math.round(dmgBase * (opts.damageScale ?? 1)));
    // 同一种怪也**不是同一个速度**：生成时在 ±15% 内随机（用户要求「浮动速率」）。
    // 这一条加上「各自随机休息」和「曲线接近」，是打散怪群的第一层手段。
    const speedMul = 0.85 + Math.random() * 0.30;
    const speed = spdBase * (opts.speedScale ?? 1) * speedMul;

    const root = new THREE.Group();
    root.position.set(at.x, 0, at.z);
    root.rotation.y = Math.atan2(-at.x, -at.z); // 出生时面朝场地中心（玩家大致方向）

    // 克隆蒙皮模型（SkeletonUtils 会重建骨骼绑定，普通 clone 会共享骨架）
    // 缩放按实测的 sourceHeight 归一（见 ENEMY_TYPES 顶部注释）
    const model = cloneSkinned(src.scene);
    const s = cfg.height / cfg.sourceHeight;
    model.scale.setScalar(s);
    model.rotation.y = ENEMY_MODEL_YAW;

    const mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;        // 蒙皮包围盒不准，关掉剔除防闪
      o.material = o.material.clone(); // 独立材质，受击闪光才不会全队一起亮
      mats.push(o.material);
    });
    // 巫师换肤（帽子/眼睛/骨体/骨冠）—— 必须在材质 clone 之后、渲染之前
    if (cfg.skin) applyWizardSkin(model, cfg.skin);
    root.add(model);

    // 脚下的范围环：只给「能近身伤到主角」的怪。
    // 远程（投手 projectile / 弓手 volley / mage castTime）不画 —— 弓手的招牌
    // 是钉在主角脚下的那片红圈，再画个 7 格射程环整个战场都是红的（第 15 块修）。
    const hasRing = cfg.ringColor != null && (
      cfg.contactRange != null
      || (cfg.attackRange != null && cfg.projectile == null && cfg.castTime == null && cfg.volley == null)
    );
    const ring = hasRing
      ? createRangeRing({
          radius: cfg.attackRange ?? 1,   // 接触圈要主角半径，updateOne 第一帧就会算准
          color: cfg.ringColor,
          opacity: 0.34,
          pulse: 0.04,
          y: 0.03,
        })
      : null;
    if (ring) root.add(ring.mesh);

    // 主祭的气场环：半径就是光环范围，玩家能一眼看出「站在这个圈里的小兵变凶了」。
    // 其余怪不画（远程的范围环会盖住半个战场，见 hasRing 的注释）。
    const auraRing = cfg.aura
      ? createRangeRing({
          radius: cfg.aura.radius,
          color: cfg.color,
          opacity: 0.20,
          pulse: 0.07,
          y: 0.026,
        })
      : null;
    if (auraRing) root.add(auraRing.mesh);

    const bar = createBar(cfg);
    root.add(bar.spr);
    scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(src.clips)) {
      actions[name] = mixer.clipAction(clip);
    }

    let current = null;
    function play(name, { once = false, fade = 0.16, timeScale = 1, duration = 0 } = {}) {
      const a = actions[name];
      if (!a) return;
      if (current === a && a.isRunning() && !once) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      a.clampWhenFinished = once;
      a.timeScale = duration > 0 && a.getClip().duration > 0
        ? (a.getClip().duration / duration)
        : timeScale;
      a.fadeIn(fade).play();
      if (current && current !== a) current.fadeOut(fade);
      current = a;
    }

    const e = {
      id: ++uid,
      type, cfg, root, model, mixer, actions, play,
      pos: root.position,
      hp: maxHp,
      maxHp,
      damage,
      speed,
      state: 'spawn',
      t: 0,
      attackCd: 0.4 + Math.random() * 0.5,
      hitDone: false,
      flashT: 0,
      deathT: 0,
      dot: null,       // 中毒：{ dps, t, tick }
      slowT: 0,        // 冰缓剩余时间
      slowFactor: 0,   // 冰缓减速比例
      // —— 打散怪群的三件套（第 6 块）——
      speedMul,        // 生成时随机出来的速度倍率（0.85~1.15，同种怪也不一样）
      restCd: 2.5 + Math.random() * 3.5,  // 再走多久开始歇（第一次 2.5~6 秒）
      restT: 0,        // 正在休息的剩余时间（0 = 在走）
      driftAmp: 0.10 + Math.random() * 0.20,   // 路线摆动幅度（弧度，约 6°~17°）
      driftFreq: 0.45 + Math.random() * 0.70,  // 摆动快慢（弧度/秒）
      driftPhase: Math.random() * Math.PI * 2, // 各自错开的相位
      mats,
      bar,
      ring,
      auraRing,
      auraHaste: 0,      // 本帧站在哪位主祭的光环里（由 update 里的 collectAuras 写）
      auraArmor: 0,
      baseEmissive: mats.map((m) => (m.emissive ? m.emissive.clone() : null)),
      currentAnim: '',
    };

    // 弓手：往右手塞一把弓（受击闪白要连弓一起，所以材质也进 mats）。
    // 顺手摘掉模型自带的法师帽 —— 弓手不戴帽子，和第二关的巫师共用一套模也能一眼分开。
    if (cfg.volley) {
      const hat = model.getObjectByName('Skeleton_Mage_Hat');
      if (hat) hat.visible = false;
      const bow = attachBow(root, model);
      if (bow) {
        e.bow = bow;
        e.mats.push(...bow.userData.mats);
        e.baseEmissive.push(...bow.userData.mats.map((m) => (m.emissive ? m.emissive.clone() : null)));
      }
    }

    // 巫师：右手一把法杖（三套样式见 STAFF_STYLES）。材质同样进 mats，受击一起闪。
    if (cfg.skin && cfg.skin.staff) {
      const staff = attachStaff(root, model, cfg.skin.staff);
      if (staff) {
        e.staff = staff;
        e.mats.push(...staff.userData.mats);
        e.baseEmissive.push(...staff.userData.mats.map((m) => (m.emissive ? m.emissive.clone() : null)));
      }
    }

    // 出生：先播从地里钻出来的动画
    bar.draw(1, maxHp, maxHp);
    e.currentAnim = cfg.anim.spawn;
    play(cfg.anim.spawn, { once: true, fade: 0.05, duration: cfg.spawnTime });
    if (fx) fx.spawnRing(e.pos, cfg.color);

    list.push(e);
    return e;
  }

  // ---------------- 受伤 / 死亡 ----------------
  // opts:
  //   dot   中毒跳伤 —— 不闪白、绿色小字（每 0.5 秒一次，别和普攻特效混在一起）
  //   quiet 只扣血不播命中碎屑（连锁闪电等批量伤害用）
  function takeDamage(e, amount, crit = false, opts = {}) {
    if (e.state === 'dead' || e.state === 'spawn') return false;
    // 主祭光环的减伤：站在圈里的小兵更耐打（乘法，不吃掉暴击的观感）
    const dealt = e.auraArmor > 0 ? amount * (1 - e.auraArmor) : amount;
    e.hp -= dealt;
    if (!opts.dot) e.flashT = 0.1;
    e.bar.spr.visible = true;
    e.bar.draw(e.hp / e.maxHp, e.hp, e.maxHp);
    if (fx) {
      if (!opts.quiet && !opts.dot) {
        fx.hit(new THREE.Vector3(e.pos.x, 0.7, e.pos.z), crit ? 0xffe9a8 : e.cfg.color);
      }
      // 伤害统一保留 1 位小数（用户要求：所有数值都保留小数）
      if (!opts.noText) {
        fx.text({ x: e.pos.x, z: e.pos.z }, Math.max(0.1, dealt).toFixed(1), {
          color: opts.dot ? '#9dff6a' : crit ? '#ffe066' : '#eafff4',
          crit: crit && !opts.dot,
          y: e.cfg.height * 0.95,
          size: opts.dot ? 0.40 : crit ? 0.85 : 0.62,
        });
      }
    }
    if (e.hp <= 0) {
      die(e);
      return true;
    }
    return false;
  }

  function die(e) {
    e.state = 'dead';
    e.t = 0;
    e.deathT = 0;
    e.hp = 0;
    e.bar.spr.visible = false;
    if (fx) fx.death(e.pos, e.cfg.color);
    if (onDeath) onDeath(e);

    if (e.cfg.selfDestruct) {
      // 小兵是「自爆」：不播倒地动画，直接缩小消失
      e.currentAnim = '';
      return;
    }
    e.currentAnim = e.cfg.anim.death;
    e.play(e.cfg.anim.death, { once: true, fade: 0.1, duration: Math.min(1.1, e.cfg.deathTime - 0.3) });
  }

  // ---------------- 单只更新 ----------------
  const _ctxTmp = new THREE.Vector3();

  // ============================================================
  // 远程弹道（骨刀）
  // 共享几何/材质：一次只造一份，弹体只是「同一个几何的多个 Mesh」，
  // 用完 scene.remove 即可（不能 dispose 共享资源）。
  // 判定在水平面上做（和近战、环剑一致），Y 轴只决定视觉高度。
  // ============================================================
  const shots = [];
  let shotGeo = null, shotMat = null;

  function shotAssets() {
    if (shotGeo) return;
    // 一根沿 Z 轴躺着的骨刀：胶囊默认沿 Y，转 90° 到 Z；朝向用 mesh.rotation.y
    shotGeo = new THREE.CapsuleGeometry(0.085, 0.62, 4, 8);
    shotGeo.rotateX(Math.PI / 2);
    shotMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d6, emissive: 0xffa94d, emissiveIntensity: 0.95,
      roughness: 0.45, metalness: 0.05,
    });
  }

  // 从投手身前朝「主角当前所在位置」掷出（不预判，所以玩家一直动就打不中）
  function throwBone(e, ctx) {
    const cfg = e.cfg.projectile;
    const dx = ctx.playerPos.x - e.pos.x;
    const dz = ctx.playerPos.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    const y = cfg.y ?? 0.85;

    shotAssets();
    const mesh = new THREE.Mesh(shotGeo, shotMat);
    mesh.frustumCulled = false;
    const x = e.pos.x + nx * (e.cfg.radius + 0.25);
    const z = e.pos.z + nz * (e.cfg.radius + 0.25);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(nx, nz);
    scene.add(mesh);

    shots.push({
      mesh, x, z,
      vx: nx * cfg.speed, vz: nz * cfg.speed,
      life: cfg.life ?? 2.4,
      dmg: e.damage,
      r: cfg.radius ?? 0.28,
      color: cfg.color ?? 0xffc46a,
      y, spin: 0,
    });
    if (fx) fx.burst({ x, z }, { color: cfg.color ?? 0xffc46a, count: 6, speed: 1.4, life: 0.28, size: 0.1, y, up: 0.7, gravity: 3 });
  }

  function updateShots(dt, ctx) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.spin += dt * 16;
      s.mesh.position.x = s.x;
      s.mesh.position.z = s.z;
      s.mesh.rotation.y = Math.atan2(s.vx, s.vz) + s.spin;

      const dx = ctx.playerPos.x - s.x;
      const dz = ctx.playerPos.z - s.z;
      const hit = Math.hypot(dx, dz) <= s.r + ctx.playerRadius;
      const gone = s.life <= 0 || Math.hypot(s.x, s.z) > ctx.arenaRadius + 1.5;

      if (hit) {
        ctx.hurtPlayer(s.dmg, null);
        if (fx) fx.burst({ x: s.x, z: s.z }, { color: s.color, count: 12, speed: 2.6, life: 0.4, size: 0.13, y: s.y, up: 1.6 });
      } else if (gone && fx) {
        fx.burst({ x: s.x, z: s.z }, { color: s.color, count: 4, speed: 1.2, life: 0.24, size: 0.08, y: s.y, up: 0.5, gravity: 5 });
      }
      if (hit || gone) {
        scene.remove(s.mesh);
        shots.splice(i, 1);
      }
    }
  }

  // ============================================================
  // 弓手：固定红圈 → 箭雨落地（第 12 块）
  //
  // 和骨刀弹道完全不同的思路：
  //   · 骨刀是「从怪身上飞出来的一条线」—— 横移就躲
  //   · 红圈是「钉在某个地面点的一片区域」—— 必须离开那片地
  // 圈的圆心在**放箭那一刻**就定死（不追人），所以玩家的应对很明确：
  // 看到脚下红圈 → 往外走；站在圈里硬打 → 吃伤害。
  //
  // 三件视觉一起上，都是共享几何/材质（一次只造一份）：
  //   disc  红雾填充（贴地）
  //   rim   圈边亮环（呼吸）
  //   tick  里面的细环从大缩到小 —— 缩到底就是箭落地
  // ============================================================
  const zones = [];      // 正在倒计时的地面圈（弓手红圈 / 骨咒师紫阵 / 火焚灼地）
  const arrows = [];     // 正在下落的箭（纯视觉；伤害在落地那一刻结算）
  let zoneGeo = null, zoneRimGeo = null, zoneTickGeo = null;
  let arrowGeo = null, arrowMat = null;

  // 三种圈用三套配色：红=箭、紫=咒、橙=火。玩家看颜色就知道该防什么。
  const ZONE_PALETTES = {
    arrow: { disc: 0xff3a28, rim: 0xff5c46, tick: 0xffb0a0 },
    hex:   { disc: 0x5a2bb8, rim: 0xa96bff, tick: 0xd9c4ff },
    burn:  { disc: 0xc23a12, rim: 0xff8a3c, tick: 0xffd08a },
  };
  const zoneMatSets = {};
  function zoneMatsFor(key) {
    if (zoneMatSets[key]) return zoneMatSets[key];
    const p = ZONE_PALETTES[key] || ZONE_PALETTES.arrow;
    zoneMatSets[key] = {
      disc: new THREE.MeshBasicMaterial({
        color: p.disc, transparent: true, opacity: 0.17,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      rim: new THREE.MeshBasicMaterial({
        color: p.rim, transparent: true, opacity: 0.85,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      tick: new THREE.MeshBasicMaterial({
        color: p.tick, transparent: true, opacity: 0.8,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    };
    return zoneMatSets[key];
  }

  function zoneAssets() {
    if (zoneGeo) return;
    zoneGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    zoneRimGeo = new THREE.RingGeometry(0.93, 1, 56).rotateX(-Math.PI / 2);
    zoneTickGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    // 箭：一根细杆 + 箭头，躺着朝下，落地时插在地上
    arrowGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.62, 5);
    arrowGeo.translate(0, -0.31, 0);           // 原点在箭尾，往下长
    arrowMat = new THREE.MeshStandardMaterial({
      color: 0xf2e6cf, emissive: 0xff7a55, emissiveIntensity: 0.5,
      roughness: 0.6, metalness: 0.05,
    });
  }

  // 在主角当前位置钉一个圈（三种法术共用这套外观：填充 + 呼吸边 + 收缩环）
  function makeZone(kind, e, ctx, r, extra = {}) {
    zoneAssets();
    const mats = zoneMatsFor(kind);
    const x = ctx.playerPos.x;
    const z = ctx.playerPos.z;

    const disc = new THREE.Mesh(zoneGeo, mats.disc);
    disc.position.set(x, 0.052, z);
    disc.scale.setScalar(r);
    disc.frustumCulled = false;
    const rim = new THREE.Mesh(zoneRimGeo, mats.rim);
    rim.position.set(x, 0.058, z);
    rim.scale.setScalar(r);
    rim.frustumCulled = false;
    const tick = new THREE.Mesh(zoneTickGeo, mats.tick);
    tick.position.set(x, 0.064, z);
    tick.scale.setScalar(r);
    tick.frustumCulled = false;
    scene.add(disc, rim, tick);

    const v = {
      kind, x, z, r,
      dmg: e.damage,
      t: e.cfg.windup,       // 还剩多少秒落地
      total: e.cfg.windup,
      disc, rim, tick, mats,
      phase: 'warn',
      ...extra,
    };
    zones.push(v);
    if (fx) fx.ring({ x, z }, { from: r * 0.55, to: r, color: extra.color ?? 0xff5c46, life: 0.3, opacity: 0.7, y: 0.06 });
    return v;
  }

  // 弓手：在主角当前位置钉一个红圈
  function spawnVolley(e, ctx) {
    const cfg = e.cfg.volley;
    makeZone('arrow', e, ctx, cfg.radius, {
      color: cfg.color,
      arrows: cfg.arrows ?? 7,
      fall: cfg.fall ?? 0.3,
      y0: cfg.y ?? 6.2,
    });
  }

  // 巫师：紫阵（落地一次性）或灼地（落地后持续燃烧）
  // 两者都是「圈先出现 1~1.5 秒，再落地」，区别是落地之后还留不留在场上。
  function spawnSpell(e, ctx) {
    const sp = e.cfg.spell;
    makeZone(sp.kind, e, ctx, sp.radius, {
      color: sp.color,
      debuff: e.cfg.debuff || null,
      burnLeft: sp.burnTime || 0,
      burnTick: sp.tick || 0.75,
      burnT: 0,
      burnTicker: 0,
    });
  }

  function updateZones(dt, ctx) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const v = zones[i];

      // ---- 灼地的持续阶段：先判是否站在火里，再走计时 ----
      if (v.phase === 'burn') {
        v.t -= dt;
        v.burnTicker -= dt;
        v.mats.rim.opacity = 0.5 + 0.28 * Math.sin(v.burnT * 11);
        v.mats.disc.opacity = 0.13 + 0.06 * Math.sin(v.burnT * 7 + 1.3);
        v.burnT += dt;
        if (v.burnTicker <= 0) {
          v.burnTicker += v.burnTick;
          const d = Math.hypot(ctx.playerPos.x - v.x, ctx.playerPos.z - v.z);
          if (d <= v.r) {
            // 灼地单跳只算半次伤害：踩满约 4 跳，不至于一脚就死
            ctx.hurtPlayer(Math.max(1, Math.round(v.dmg * 0.5)), null);
            if (fx) fx.burst({ x: v.x, z: v.z }, { color: 0xff7a2a, count: 4, speed: 1.6, life: 0.3, size: 0.09, y: 0.2, up: 1.2, gravity: 5 });
          }
        }
        if (v.t <= 0) {
          scene.remove(v.disc, v.rim, v.tick);
          zones.splice(i, 1);
        }
        continue;
      }

      // ---- 预警阶段：边呼吸边收缩，缩到底就是落地 ----
      v.t -= dt;
      const k = Math.max(0, Math.min(1, 1 - v.t / v.total));
      const pulse = 0.72 + 0.28 * Math.sin((v.total - v.t) * 12);
      v.mats.rim.opacity = 0.55 + 0.4 * pulse;
      v.tick.scale.setScalar(Math.max(0.12, v.r * (1 - k * 0.82)));
      v.mats.tick.opacity = 0.5 + 0.45 * k;

      if (v.t > 0) continue;

      if (v.kind === 'burn') {
        // 落地 → 转成地上的火，留在原地继续烧
        v.phase = 'burn';
        v.t = v.burnLeft;
        v.burnT = 0;
        v.burnTicker = 0;         // 落地立刻烧一下
        v.tick.visible = false;   // 收缩环收工
        v.mats.disc.opacity = 0.17;
        if (fx) {
          fx.burst({ x: v.x, z: v.z }, { color: 0xff8a3c, count: 18, speed: 3.2, life: 0.6, size: 0.14, y: 0.25, up: 1.8, gravity: 4 });
          fx.ring({ x: v.x, z: v.z }, { from: 0.2, to: v.r, color: 0xff8a3c, life: 0.32, opacity: 0.75, y: 0.07 });
        }
        continue;
      }

      scene.remove(v.disc, v.rim, v.tick);
      zones.splice(i, 1);

      const d = Math.hypot(ctx.playerPos.x - v.x, ctx.playerPos.z - v.z);
      const inside = d <= v.r;

      if (v.kind === 'arrow') {
        dropArrows(v);
        continue;
      }

      // 紫阵：只在你没走出去的时候生效 —— 掉血 + 减速
      if (inside) {
        ctx.hurtPlayer(v.dmg, null);
        if (v.debuff && ctx.cursePlayer) ctx.cursePlayer(v.debuff);
        if (fx) {
          fx.ring({ x: v.x, z: v.z }, { from: 0.2, to: v.r, color: 0xa96bff, life: 0.34, opacity: 0.8, y: 0.07 });
          fx.burst({ x: v.x, z: v.z }, { color: 0xc08cff, count: 16, speed: 3.4, life: 0.55, size: 0.13, y: 0.3, up: 1.6, gravity: 4 });
        }
      } else if (fx) {
        // 躲掉了也给个「咒语打空」的反馈，玩家才知道这一步走对了
        fx.ring({ x: v.x, z: v.z }, { from: 0.2, to: v.r * 1.05, color: 0x7a5aa8, life: 0.28, opacity: 0.4, y: 0.06 });
      }
    }
  }

  // 箭落地：视觉上一批箭从天而降，落地那一刻结算一次伤害
  const pendingHits = [];   // 等待结算的落点（箭落地时才扣血）
  function dropArrows(v) {
    zoneAssets();
    const n = v.arrows ?? 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * v.r * 0.92;
      const x = v.x + Math.cos(a) * d;
      const z = v.z + Math.sin(a) * d;
      const mesh = new THREE.Mesh(arrowGeo, arrowMat);
      mesh.frustumCulled = false;
      mesh.position.set(x, v.y0, z);
      mesh.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.22);
      scene.add(mesh);
      arrows.push({ mesh, x, z, y: v.y0, t: v.fall, max: v.fall, landed: false });
    }
    pendingHits.push({ x: v.x, z: v.z, r: v.r, dmg: v.dmg, landAt: v.fall });
  }

  function updateArrows(dt, ctx) {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.t -= dt;
      a.mesh.position.y = Math.max(0, a.y * (a.t / a.max));
      if (a.t <= 0) {
        if (!a.landed) {
          a.landed = true;
          if (fx) fx.burst({ x: a.x, z: a.z }, { color: 0xff9a78, count: 5, speed: 1.4, life: 0.25, size: 0.08, y: 0.1, up: 0.7, gravity: 6 });
        }
        // 插在地上留 0.5 秒再消失
        if (a.t < -0.5) {
          scene.remove(a.mesh);
          arrows.splice(i, 1);
        }
      }
    }

    for (let i = pendingHits.length - 1; i >= 0; i--) {
      const v = pendingHits[i];
      v.landAt -= dt;
      if (v.landAt > 0) continue;
      pendingHits.splice(i, 1);
      const d = Math.hypot(ctx.playerPos.x - v.x, ctx.playerPos.z - v.z);
      if (d <= v.r) {
        ctx.hurtPlayer(v.dmg, null);
        if (fx) fx.ring({ x: v.x, z: v.z }, { from: 0.2, to: v.r, color: 0xff6a52, life: 0.26, opacity: 0.6, y: 0.07 });
      }
    }
  }

  function updateOne(e, dt, ctx) {
    e.mixer.update(dt);
    e.t += dt;

    // ---- 冰缓：减速倒计时（移速在 moveToward 里按 slowT 折算） ----
    if (e.slowT > 0) e.slowT -= dt;

    // ---- 中毒：每 0.5 秒跳一次毒伤（绿色小字，不闪白）----
    // 钻地 / 死亡的怪不结算毒伤；毒死也走正常 die()（照样掉金币）
    if (e.dot && e.state !== 'dead' && e.state !== 'spawn') {
      e.dot.t -= dt;
      e.dot.tick -= dt;
      if (e.dot.tick <= 0) {
        e.dot.tick += 0.5;
        takeDamage(e, e.dot.dps * 0.5, false, { dot: true });
        if (e.state === 'dead') return;
      }
      if (e.dot.t <= 0) e.dot = null;
    }

    // 脚下范围环：小兵 = 主角半径 + 接触距离（它自爆能够到的圈），
    // 战士 = 自己的近战范围。半径每帧同步，改了配置立刻生效。
    if (e.ring) {
      e.ring.setRadius(e.cfg.contactRange != null
        ? ctx.playerRadius + e.cfg.contactRange
        : e.cfg.attackRange);
      e.ring.update(dt);
    }
    // 主祭的气场环：一直呼吸，就是这个怪的「存在感」
    if (e.auraRing) e.auraRing.update(dt);

    // 受击闪白（复制一份 emissive，闪完原样还回去）
    if (e.flashT > 0) {
      e.flashT -= dt;
      const on = e.flashT > 0;
      for (let i = 0; i < e.mats.length; i++) {
        const m = e.mats[i];
        if (!m.emissive) continue;
        if (on) m.emissive.setRGB(1.0, 0.92, 0.85);
        else if (e.baseEmissive[i]) m.emissive.copy(e.baseEmissive[i]);
      }
    }

    if (e.state === 'dead') {
      e.deathT += dt;
      const fadeStart = Math.max(0.1, e.cfg.deathTime - 0.45);
      if (e.cfg.selfDestruct) {
        // 自爆：快速缩小
        const k = Math.min(1, e.deathT / e.cfg.deathTime);
        e.root.scale.setScalar(Math.max(0.001, 1 - k));
      } else if (e.deathT > fadeStart) {
        const k = Math.min(1, (e.deathT - fadeStart) / 0.45);
        e.root.scale.setScalar(Math.max(0.001, 1 - k * 0.9));
        e.root.position.y = -0.45 * k;
      }
      return;
    }

    if (e.state === 'spawn') {
      if (e.t >= e.cfg.spawnTime) {
        e.state = 'chase';
        e.t = 0;
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;
    }

    const dx = ctx.playerPos.x - e.pos.x;
    const dz = ctx.playerPos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);

    // 朝向玩家（平滑转身，避免瞬间打转）
    if (dist > 0.001) {
      e.root.rotation.y = lerpAngle(e.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-9 * dt));
    }

    // ---- 随机休息：走一阵子就站着喘口气（第 6 块）----
    // 作用：一群怪不会再像列队一样踩着同一个节拍压过来。
    // 正在出手（attack）的不歇；歇 0.7~1.5 秒，然后重新走 3~6 秒。
    if (e.state === 'attack') {
      e.restT = 0;                 // 打人的时候不算休息
    } else if (e.restT > 0) {
      e.restT -= dt;
      if (e.currentAnim !== e.cfg.anim.idle) {
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;                      // 站定：不移动、不出手
    } else {
      e.restCd -= dt;
      if (e.restCd <= 0) {
        e.restT = 0.7 + Math.random() * 0.8;
        e.restCd = 3.0 + Math.random() * 3.0;
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
        return;
      }
    }

    // ---- 巫师（第二关）：三人共用一套「保持距离 + 读条」的骨架 ----
    // 区别只在 cfg.spell 的 kind，以及有没有 cfg.aura：
    //   hexer / pyro  有 spell → 站到射程里读条放法术
    //   hierarch      没有 spell → 只走位，靠光环施压（不还手是它的设计，不是漏写）
    if (e.cfg.spell || e.cfg.aura) {
      if (e.cfg.spell && e.state === 'attack') {
        // 读条 = 施法动画播完前摇的那一下，圈才钉到地上（圈用的是玩家**当时**的位置）
        if (!e.hitDone && e.t >= e.cfg.windup) {
          e.hitDone = true;
          spawnSpell(e, ctx);
        }
        if (e.t >= e.cfg.attackDuration) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = Math.max(0.3, (e.cfg.attackInterval - e.cfg.attackDuration) / (1 + e.auraHaste));
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.18 });
        }
        return;
      }

      if (e.cfg.spell) e.attackCd -= dt;   // 主祭不出手，冷却停着
      const keep = e.cfg.keepDistance;

      // 太近就一边后退一边念 —— 巫师不跟你贴身肉搏
      if (dist < keep) {
        moveToward(e, -dx, -dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }

      // 在射程外就慢慢挪进来（速度很慢，玩家有充足时间决定要不要去切它）
      if (e.cfg.attackRange != null && dist > e.cfg.attackRange) {
        moveToward(e, dx, dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }

      // 主祭：不出手，站定就是它的全部动作
      if (!e.cfg.spell) {
        if (e.currentAnim !== e.cfg.anim.idle) {
          e.currentAnim = e.cfg.anim.idle;
          e.play(e.cfg.anim.idle, { fade: 0.2 });
        }
        return;
      }

      if (e.attackCd <= 0) {
        e.state = 'attack';
        e.t = 0;
        e.hitDone = false;
        e.currentAnim = e.cfg.anim.cast;
        e.play(e.cfg.anim.cast, { once: true, fade: 0.12, duration: e.cfg.attackDuration });
        // 读条起手提示：脚下同色脉冲，和投手的蓄力环一个意思
        if (fx) fx.ring(e.pos, { from: 0.3, to: 1.6, color: e.cfg.spell.color, life: e.cfg.windup, opacity: 0.42, y: 0.055 });
        return;
      }
      if (e.currentAnim !== e.cfg.anim.idle) {
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;
    }

    // ---- 弓手：把红圈钉在你脚下 → 1.15 秒后箭雨落地 ----
    // 和投手一样有「保持距离 / 靠近 / 站定出手」三个动作，
    // 但出手不是弹道，而是 spawnVolley() 在地面钉一个固定圈。
    if (e.cfg.volley) {
      if (e.state === 'attack') {
        // 瞄准动画播完（= windup 结束）就放箭：红圈在起手那一刻已经钉好了
        if (!e.hitDone && e.t >= e.cfg.windup) {
          e.hitDone = true;
          e.currentAnim = e.cfg.anim.attack;
          e.play(e.cfg.anim.attack, { once: true, fade: 0.08, duration: Math.max(0.35, e.cfg.attackDuration - e.cfg.windup) });
        }
        if (e.t >= e.cfg.attackDuration) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = Math.max(0.3, (e.cfg.attackInterval - e.cfg.attackDuration) / (1 + e.auraHaste));
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.18 });
        }
        return;
      }

      e.attackCd -= dt;
      const keep = e.cfg.keepDistance;
      const reach = e.cfg.attackRange;

      if (dist < keep) {
        moveToward(e, -dx, -dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }
      if (dist > reach) {
        moveToward(e, dx, dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }

      if (e.attackCd <= 0) {
        e.state = 'attack';
        e.t = 0;
        e.hitDone = false;
        e.currentAnim = e.cfg.anim.aim;
        e.play(e.cfg.anim.aim, { once: true, fade: 0.12, duration: e.cfg.windup });
        spawnVolley(e, ctx);
        return;
      }
      if (e.currentAnim !== e.cfg.anim.idle) {
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;
    }

    // ---- 投手：拉弓 → 掷骨刀 → 收势 ----
    if (e.cfg.projectile) {
      if (e.state === 'attack') {
        if (!e.hitDone && e.t >= e.cfg.windup) {
          e.hitDone = true;
          throwBone(e, ctx);
        }
        if (e.t >= e.cfg.attackDuration) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = Math.max(0.2, (e.cfg.attackInterval - e.cfg.attackDuration) / (1 + e.auraHaste));
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.18 });
        }
        return;
      }

      e.attackCd -= dt;
      const keep = e.cfg.keepDistance;
      const reach = e.cfg.attackRange;

      // 贴太近就一边后退一边重新拉开距离（移速 1.55 跑不掉，玩家追两步就能拍）
      if (dist < keep) {
        moveToward(e, -dx, -dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }

      // 射程外 → 走近点
      if (dist > reach) {
        moveToward(e, dx, dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }

      // 射程内、距离够 → 站定拉弓
      if (e.attackCd <= 0) {
        e.state = 'attack';
        e.t = 0;
        e.hitDone = false;
        e.currentAnim = e.cfg.anim.attack;
        e.play(e.cfg.anim.attack, { once: true, fade: 0.1, duration: e.cfg.attackDuration });
        // 前摇提示：脚下一圈橙色脉冲蓄力，看到就开始走位
        if (fx) fx.ring(e.pos, { from: 0.3, to: 1.7, color: 0xffb46a, life: e.cfg.windup, opacity: 0.5, y: 0.055 });
        return;
      }
      if (e.currentAnim !== e.cfg.anim.idle) {
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;
    }

    // ---- 战士：近战攻击循环 ----
    if (e.type === 'warrior' || e.cfg.attackRange != null) {
      if (e.state === 'attack') {
        if (!e.hitDone && e.t >= e.cfg.windup) {
          e.hitDone = true;
          if (dist <= e.cfg.attackRange + 0.3) {
            ctx.hurtPlayer(e.damage, e);
            if (fx) fx.ring(e.pos, { from: 0.3, to: e.cfg.attackRange, color: 0xff9a78, life: 0.22, opacity: 0.6, y: 0.06 });
          }
        }
        if (e.t >= e.cfg.attackDuration) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = (e.cfg.attackInterval - e.cfg.attackDuration) / (1 + e.auraHaste);
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.18 });
        }
        return;
      }

      e.attackCd -= dt;
      if (dist <= e.cfg.attackRange + 0.15 && e.attackCd <= 0) {
        e.state = 'attack';
        e.t = 0;
        e.hitDone = false;
        e.currentAnim = e.cfg.anim.attack;
        e.play(e.cfg.anim.attack, { once: true, fade: 0.08, duration: e.cfg.attackDuration });
        // 前摇提示：红色圆环从脚下扩到攻击范围，看到就该躲
        if (fx) fx.ring(e.pos, { from: 0.25, to: e.cfg.attackRange, color: 0xff6a52, life: e.cfg.windup, opacity: 0.35, y: 0.055 });
        return;
      }

      if (dist > e.cfg.attackRange) {
        moveToward(e, dx, dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
      } else if (e.currentAnim !== e.cfg.anim.idle) {
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;
    }

    // ---- 小兵：贴脸自爆 ----
    const contact = ctx.playerRadius + e.cfg.contactRange;
    if (dist <= contact) {
      ctx.hurtPlayer(e.damage, e);
      if (fx) fx.burst(e.pos, { color: 0xffcf8a, count: 16, speed: 3.6, life: 0.5, size: 0.16, y: 0.55, up: 2.2 });
      die(e);
      return;
    }

    moveToward(e, dx, dz, dist, dt, ctx);
    if (e.currentAnim !== e.cfg.anim.walk) {
      e.currentAnim = e.cfg.anim.walk;
      e.play(e.cfg.anim.walk, { fade: 0.2 });
    }
  }

  function moveToward(e, dx, dz, dist, dt, ctx) {
    if (dist < 0.0001) return;
    // 冰缓：被冰剑命中后移速打折（slowFactor = 减速比例）
    const sp = e.speed * (e.slowT > 0 ? (1 - Math.min(0.9, e.slowFactor || 0)) : 1);
    const step = sp * dt;

    // 曲线接近：把「指向玩家」的方向绕竖轴旋转一个随时间摆动的角度，
    // 于是路径是一条轻轻摆动的弧线而不是笔直的冲锋线。
    // 越靠近主角摆幅越小（near 因子），否则最后会在主角身边绕圈打不到人。
    const amp = e.driftAmp || 0;
    const near = Math.min(1, Math.max(0.2, dist / 2.5));
    const w = amp * near * Math.sin(e.t * (e.driftFreq || 0) + (e.driftPhase || 0));
    const c = Math.cos(w), s = Math.sin(w);
    const ux = dx / dist, uz = dz / dist;
    e.pos.x += (ux * c - uz * s) * step;
    e.pos.z += (ux * s + uz * c) * step;

    // 场地边界
    const lim = ctx.arenaRadius - e.cfg.radius;
    const r = Math.hypot(e.pos.x, e.pos.z);
    if (r > lim) {
      e.pos.x = (e.pos.x / r) * lim;
      e.pos.z = (e.pos.z / r) * lim;
    }
  }

  // ---------------- 群体更新 ----------------
  // 主祭光环：每帧先收一遍所有存活主祭，再给每只怪算「站没站在谁的光环里」。
  // 同屏主祭最多 2~3 个、怪 30 只，O(n×m) 完全可忽略。
  // 主祭自己不受任何光环影响（不叠加，也不自肥）。
  function collectAuras() {
    const sources = [];
    for (const e of list) {
      if (e.cfg.aura && e.state !== 'dead' && e.state !== 'spawn') sources.push(e);
    }
    for (const e of list) {
      // 巫师不吃光环（包括光环源自己）：几个法爷互相叠 buff 会滚雪球
      if (e.cfg.aura || e.cfg.spell || !sources.length) { e.auraHaste = 0; e.auraArmor = 0; continue; }
      let haste = 0, armor = 0;
      for (const s of sources) {
        if (Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) <= s.cfg.aura.radius) {
          haste = Math.max(haste, s.cfg.aura.haste);
          armor = Math.max(armor, s.cfg.aura.armor);
        }
      }
      e.auraHaste = haste;
      e.auraArmor = armor;
    }
  }

  function update(dt, ctx) {
    collectAuras();
    for (const e of list) updateOne(e, dt, ctx);
    updateShots(dt, ctx);
    updateZones(dt, ctx);
    updateArrows(dt, ctx);

    // 分离：避免怪物叠成一个点（O(n²)，同屏最多十几只，开销可忽略）
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'dead' || a.state === 'spawn') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'dead' || b.state === 'spawn') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const minD = a.cfg.radius + b.cfg.radius;
        if (d2 > 1e-6 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
        }
      }
    }

    // 清理消散完毕的怪
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.state !== 'dead') continue;
      if (e.deathT < e.cfg.deathTime) continue;
      scene.remove(e.root);
      for (const m of e.mats) m.dispose();
      e.bar.tex.dispose();
      e.bar.mat.dispose();
      if (e.ring) e.ring.dispose();
      if (e.auraRing) e.auraRing.dispose();
      e.mixer.stopAllAction();
      e.mixer.uncacheRoot(e.model);
      list.splice(i, 1);
    }
  }

  // ---------------- 中毒 / 冰缓（元素剑命中时调用，见 weapon.js） ----------------
  // 中毒：叠时间也叠 dps（后命中的一层覆盖 dps 取较大值），最多持续到 time
  function applyDot(e, { dps, time }) {
    if (!e.dot) e.dot = { dps: 0, t: 0, tick: 0.25 };   // 首跳 0.25s 后到（手感更快）
    e.dot.dps = Math.max(e.dot.dps, dps);
    e.dot.t = Math.max(e.dot.t, time);
  }

  // 冰缓：刷新持续时间、取更强的减速
  function applySlow(e, { factor, time }) {
    if (e.state === 'dead' || e.state === 'spawn') return;
    e.slowT = Math.max(e.slowT, time);
    e.slowFactor = Math.max(e.slowFactor, factor);
    // 冰缓指示：脚下淡蓝圈提示「这只怪被冻着」
    if (fx) fx.ring(e.pos, { from: 0.2, to: 0.95, color: 0x6fd2ff, life: 0.35, opacity: 0.5, y: 0.05 });
  }

  // 连锁闪电的目标：e 之外最近的 count 只活怪（距离 ≤ maxDist）
  function chainTargets(e, count, maxDist = 4.5) {
    const out = [];
    for (const o of list) {
      if (o === e || o.state === 'dead' || o.state === 'spawn') continue;
      const d = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z);
      if (d <= maxDist) out.push({ e: o, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, Math.max(0, Math.round(count))).map((x) => x.e);
  }

  function aliveCount() {
    let n = 0;
    for (const e of list) if (e.state !== 'dead') n++;
    return n;
  }

  function reset() {
    for (const e of list) {
      scene.remove(e.root);
      for (const m of e.mats) m.dispose();
      e.bar.tex.dispose();
      e.bar.mat.dispose();
      if (e.ring) e.ring.dispose();
      if (e.auraRing) e.auraRing.dispose();
      e.mixer.stopAllAction();
      e.mixer.uncacheRoot(e.model);
    }
    list.length = 0;
    for (const s of shots) scene.remove(s.mesh);
    shots.length = 0;
    for (const v of zones) scene.remove(v.disc, v.rim, v.tick);
    zones.length = 0;
    for (const a of arrows) scene.remove(a.mesh);
    arrows.length = 0;
    pendingHits.length = 0;
  }

  // 战士/投手的攻击时长：没单独写就默认 0.9 秒（动画按比例加速/减速），
  // 写了就以配置为准（投手 0.85）—— 前摇 windup 必须小于它。
  for (const t of Object.values(ENEMY_TYPES)) {
    if (t.attackRange != null && t.windup != null && t.attackDuration == null) t.attackDuration = 0.9;
  }

  return {
    preload, spawn, update, reset,
    list,
    aliveCount,
    takeDamage,
    applyDot, applySlow, chainTargets,
    shotCount: () => shots.length,
    zoneCount: () => zones.length,      // 场上正在倒计时的圈（三种法术都算）
    arrowCount: () => arrows.length,    // 正在下落/插在地上的箭
    pendingCount: () => pendingHits.length,
    // 巫师/法术的观测口（测试与 ?debug=1 用）
    zones: () => zones.map((v) => ({
      kind: v.kind, phase: v.phase, x: +v.x.toFixed(2), z: +v.z.toFixed(2), r: v.r,
      t: +v.t.toFixed(2), dmg: v.dmg,
    })),
    auraCount: () => list.filter((e) => e.cfg.aura && e.state !== 'dead' && e.state !== 'spawn').length,
    buffedCount: () => list.filter((e) => e.auraHaste > 0).length,
    get: (type) => ENEMY_TYPES[type],
    // 调试/测试用
    all: () => list,
    _dbgCtx: _ctxTmp,
  };
}
