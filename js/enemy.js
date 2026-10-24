// ============================================================
// enemy.js —— 怪物系统（模型加载 / 克隆 / AI / 血条 / 死亡）
//
// 模型两个来源（都是 CC0，资产铁律：先找现成的，不手写几何）：
//   第一关四只（minion/warrior/archer/bowman）—— KayKit《Skeletons》
//   第二~四关九只 —— Quaternius《Ultimate Monsters》（经 Dallolz/moorfall-assets 分发）
// 第 52 块换掉的就是「一个模型被 6 只怪共用」的老毛病：13 只怪现在各自一个模型。
//
// 两家的动画名完全不同（KayKit 是 Walking_A / Spellcast_Shoot，
// Quaternius 是 Walk / Weapon / Bite_Front / Flying_Idle），所以新模型不写死
// 动画名，改用「动作家族」表（CLIP_FAMILIES）在加载时翻译成真实 clip 名。
//
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
// 第二关三只（hexer/pyro/hierarch，第 14~17 块，第 52 块换模型）、
// 第三关三只（charger/shielder/brood，第 29 块，第 52 块换模型）、
// 第四关三只（wraith/leaper/mender，第 35 块，第 52 块换模型），
// 各自在下面 ENEMY_TYPES 里有详细注释。
// ============================================================
import * as THREE from '../lib/three.module.js?v=76';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=76';
import { clone as cloneSkinned } from '../lib/jsm/utils/SkeletonUtils.js?v=76';
import { distance2D } from './stats.js?v=76';
import { createRangeRing } from './rangeRing.js?v=76';

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

// ------------------------------------------------------------
// 动作家族（第 52 块）
// ------------------------------------------------------------
// Quaternius 那批模型每只只带自己那几段动画，名字还带 `CharacterArmature|` 前缀：
//   人形   Idle / Walk / Run / Punch / Weapon / Jump / Death / HitReact
//   飞行   Flying_Idle / Fast_Flying / Headbutt / Punch / Death / HitReact
//   团块   Idle / Walk / Jump / Bite_Front / Death / HitRecieve
//   四足   Idle / Walk / Gallop / Attack / Death / Idle_HitReact_Left
// 这里把「玩家能感知的动作」抽象成 idle/walk/attack/cast/... 几个语义键，
// 由加载时翻译成该模型真实存在的 clip 名。缺哪段就退到 idle（不会出现 T pose 定格）。
const CLIP_FAMILIES = {
  humanoid: {
    idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Punch', cast: 'Weapon',
    death: 'Death', hit: 'HitReact', spawn: 'Idle',
  },
  flying: {
    idle: 'Flying_Idle', walk: 'Fast_Flying', run: 'Fast_Flying', attack: 'Headbutt',
    cast: 'Punch', death: 'Death', hit: 'HitReact', spawn: 'Flying_Idle',
  },
  blob: {
    idle: 'Idle', walk: 'Walk', run: 'Walk', attack: 'Bite_Front', cast: 'Jump',
    death: 'Death', hit: 'HitRecieve', spawn: 'Idle',
  },
  quad: {
    idle: 'Idle', walk: 'Walk', run: 'Gallop', attack: 'Attack', cast: 'Walk',
    death: 'Death', hit: 'Idle_HitReact_Left', spawn: 'Idle',
  },
  // 第 63 块：RobotExpressive（three.js 示例里的机器人）自带的 14 段动画，
  // 名字是普通英文，没有前缀也没有编号 —— 单独一族。
  robot: {
    idle: 'Idle', walk: 'Walking', run: 'Running', attack: 'Punch', cast: 'Wave',
    death: 'Death', hit: 'No', spawn: 'Idle',
  },
};

// 把 gltf 里的动画按「短名 → clip」建表（去掉 CharacterArmature| 这类前缀），
// 再按 cfg.animFamily / cfg.clipOverrides 解析出语义键 → 真实 clip 名。
// 返回的 value 是 clip.name，也就是 actions 表里的键。
function resolveClipAliases(gltf, cfg) {
  const byName = new Map();
  for (const c of gltf.animations) {
    byName.set(c.name, c);
    const short = c.name.split('|').pop();
    if (short && !byName.has(short)) byName.set(short, c);
  }
  const fam = CLIP_FAMILIES[cfg.animFamily];
  if (!fam) return {};
  const aliases = {};
  for (const [key, def] of Object.entries(fam)) {
    const want = (cfg.clipOverrides && cfg.clipOverrides[key]) || def;
    const clip = byName.get(want);
    if (clip) aliases[key] = clip.name;
  }
  // 兜底：家族里缺 idle 就退到第一段动画，别让怪站着张牙舞爪
  if (!aliases.idle && gltf.animations[0]) aliases.idle = gltf.animations[0].name;
  return aliases;
}

// 按名字找骨骼：KayKit 是 handslot.r / hand.l / head（小写），
// Quaternius 是 UpperArm.L / LowerArm.L / Head（首字母大写、没手骨），
// 所以一律「小写 + 去掉点」比对，并允许「找不到手就退到小臂」。
// ⚠️ GLTFLoader 会把名字里的 '.' 洗掉（LowerArm.L → LowerArmL），
// 第 52 块第一次挂盾就栽在这上面：只做了小写化，点还在，于是永远找不到。
function findBone(model, names) {
  const norm = (s) => s.toLowerCase().replace(/\./g, '');
  const map = new Map();
  model.traverse((o) => { if (o.name) map.set(norm(o.name), o); });
  for (const n of names) {
    const o = map.get(norm(n));
    if (o) return o;
  }
  return null;
}

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
  // 第二关：三位「塔里的东西」（第 20 块定案，第 52 块换模型）
  //
  // 【设计定案 · 第 20 块】用户明确要求：**一个巫师只带一个招牌技能**，
  // 不许出现「一个人又会减速又会灼地还带光环」的全能法师。
  // 所以三人各只负责一种压力，逼玩家换应对方式：
  //
  //   hexer    咒面图腾 —— 时间压力。紫阵钉在脚下，落地掉血 + 减速。
  //                       躲得掉，但两只以上会连发，被粘住就走不动。
  //   pyro     焚火魔   —— 空间压力。地上留一片灼地烧 4 秒，好位置被一片片烧掉。
  //                       不许站桩，输出节奏被迫切碎。
  //   hierarch 孢冠菌王 —— 目标选择压力。血最厚、站最后排。
  //                       第 28 块重做：霜牢环钉在主角脚下跟随（环里怪提速减伤泛青光）、
  //                       周期召 4 名卫队、朝主角放一串石刺（尽头钻小兵）。
  //
  // 【第 52 块：模型不再共用一套巫师骨架】
  // 以前三人共用 skeleton-mage.glb，只靠帽子/眼睛颜色区分 —— 六只怪长一个样。
  // 现在换成 Quaternius《Ultimate Monsters》的三个不同模型（CC0，见文件头）：
  //   hexer    → 图腾面具（tribal，会飘，自带羽冠，读条时飘在原地最像在念咒）
  //   pyro     → 蝙蝠小恶魔（demon，脚离地 0.49，天生浮空 = 火球托着它）
  //   hierarch → 菌王（mushroom-king，最高最壮，一顶大菌盖当"冠"）
  // ============================================================
  hexer: {
    name: '咒面图腾',
    file: 'assets/monsters/tribal.glb',
    // sourceHeight = 正交相机实测的 Idle 渲染身高（.tmp-mob-calib.js，单位同世界）
    sourceHeight: 4.238,
    // 第 53 块（用户反馈「图腾太小」）：1.40 → 2.52（×1.8）。
    // 图腾是根柱子，站着比人高一截才对；原来的 1.40 在怪群里像个路标。
    height: 2.52,
    radius: 0.60,
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
    footY: 0.246,          // 模型本体悬浮在原点上方（实测），照原样飘着
    animFamily: 'flying',
    clipOverrides: { cast: 'Punch' },   // 飞行家族没有读条动画，抬手挥一下代替
    glow: { color: 0x5a2a9a, intensity: 0.55 },   // 一圈紫气，对应它的紫阵
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },

  pyro: {
    name: '焚火魔',
    file: 'assets/monsters/demon.glb',
    sourceHeight: 2.352,   // 实测（含翅膀高度）
    // 第 53 块（用户反馈「蝙蝠有点小」）：1.22 → 1.464（×1.2）
    height: 1.464,
    radius: 0.48,
    hp: 3,
    armor: 0,
    speed: 1.35,           // 三个里最灵活，追它容易被灼地拖住
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
    footY: 0.492,          // 蝙蝠恶魔天生浮空，别把它按到地上
    animFamily: 'flying',
    clipOverrides: { cast: 'Punch' },
    glow: { color: 0x8c1a06, intensity: 0.85 },   // 暗红余烬，远处也能看见它在烧
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },

  hierarch: {
    name: '孢冠菌王',
    file: 'assets/monsters/mushroom-king.glb',
    sourceHeight: 3.527,   // 实测（含菌盖）
    // 第 53 块（用户要求「菌王放大两倍、周围四个卫队缩到 0.7」）：
    // 1.62 → 3.24。它是这一关的「老大」，站在四个小卫队中间得像座塔。
    // 卫队的缩放走 summon.scale（spawn 的 opts.scale），不改 warrior 本体 ——
    // 第一关还在用同一个 warrior 配置。
    height: 3.24,
    radius: 0.78,          // 身子大了碰撞半径跟着放，不然会和主角/小怪穿模
    hp: 5,                 // 血最厚（第 20 回合 24 血，得专门冲一趟）
    armor: 0,
    speed: 0.95,           // 最慢，跑不掉
    damage: 1,             // 石刺的伤害（第 28 块起它出手了）
    attackRange: 8.0,      // 石刺的读条距离
    keepDistance: 5.6,
    attackInterval: 5.4,
    windup: 1.2,
    attackDuration: 2.4,
    castTime: 1.2,         // 有它就说明「这个远程不画脚下范围环」
    // 石刺：从菌王身前起，朝主角方向延伸 count 段、每段间隔 step，
    // 每段 eruption 半径 radius，尽头钻出一只骷髅小兵
    spell: { kind: 'spikes', count: 6, step: 1.15, radius: 1.0, gap: 0.16, color: 0x9ee8ff },
    // 卫队：菌王放大到 3.24 之后，四只战士缩到 0.7 才像「老大 + 跟班」。
    // 轨道也跟着放大到 1.9（原来 1.45 现在会贴着菌王的腿）。
    summon: { kind: 'warrior', count: 4, every: 9.0, first: 4.5, orbit: 1.9, scale: 0.7 },
    // 霜牢环（第 28 块）：不再以菌王为中心 —— followPlayer 让环钉在主角脚下，
    // 走到哪跟到哪；环里的怪吃加成且泛青光。环小了（4.6 → 2.6），压的是站位。
    aura: { radius: 2.6, haste: 0.35, armor: 0.25, followPlayer: true },
    spawnTime: 1.1,
    deathTime: 1.8,
    selfDestruct: false,
    color: 0x9ee8ff,
    animFamily: 'humanoid',
    glow: { color: 0x1d5f70, intensity: 0.7 },    // 霜气：菌盖底下透青
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },
  // ============================================================
  // 第三关：焦土钟楼的三只怪（第 29 块；第 52 块换模型）
  //
  // 一二关已经把「密度」和「站位躲避」用掉了，三关必须换一种压力：
  //   **打断与目标优先级**。三只怪都带「放着不管就滚雪球」的性质，
  //   逼玩家在怪群里挑出该先处理的那一只 —— 这也是给新装备（震钟 / 棘甲 /
  //   震剑）留出的解法空间：它们全都围绕「打断 + 击退」。
  //
  //   charger  冲锋蛮牛 —— 机动压力。蓄力 0.85 秒（地上一道直线预警），
  //                       然后沿直线冲 6.5 格；撞上就是 2 点伤害。侧移能躲，
  //                       站桩必吃；撞完有 1.1 秒僵直，是输出窗口。
  //   shielder 盾斧兽人 —— 节奏压力。举盾 1.6 秒（减伤 70%、不移动）↔
  //                       放盾 1.6 秒（正常受伤、加速追人）。要挑窗口打。
  //   brood    孢生菇   —— 目标优先级压力。每 7 秒脚下孵 2 只小兵（上限 6 只），
  //                       不点掉它，这一回合永远清不完。
  //
  // 第 52 块换模型（原来三只共用战士/法师骨架，只靠染铁灰和加骨盾区分）：
  //   charger  → 黑牛（bull，Gallop + Attack_Headbutt，四足冲锋比人形更对味）
  //   shielder → 兽人（orc，自带一把钉头骨棒，左手挂程序化骨盾）
  //   brood    → 尖刺菌（mushnub-evolved，一团孢子，孵小兵变成"吐孢子"）
  // ============================================================
  charger: {
    name: '冲锋蛮牛',
    file: 'assets/monsters/bull.glb',
    sourceHeight: 4.594,   // 实测（含犄角与尾巴）
    height: 1.55,          // 四足但块头大：一眼能认出「这只最壮」
    radius: 0.66,          // 牛身长，碰撞半径比人形宽
    hp: 4,
    armor: 0,
    speed: 1.05,           // 慢慢逼近，威胁全在冲锋那一下
    damage: 2,             // 冲锋撞上 2 点（比普通战士疼）
    attackRange: 5.4,      // 进入这个距离开始蓄力
    attackInterval: 3.6,   // 两次冲锋之间至少隔这么久
    windup: 0.85,          // 蓄力 = 地上那条直线的显示时间（躲的窗口）
    attackDuration: 0.85,  // 蓄力阶段总时长（和 windup 一致，动画按它播）
    // 冲锋本体：沿蓄力时锁定的方向直线推进；撞到主角结算一次伤害
    charge: {
      dashSpeed: 9.0,      // 冲刺速度（主角 4.4 —— 跑是跑不掉的，只能侧移）
      dashTime: 0.62,      // 冲多久（9 × 0.62 ≈ 5.6 格）
      hitRadius: 1.05,     // 冲过主角身边这么近就算撞上
      recover: 1.10,       // 撞完 / 冲完的僵直（输出窗口）
      lineLen: 6.5,        // 预警线长度（比实际冲刺略长，给玩家余量）
      lineW: 1.15,         // 预警线宽度（视觉上等于「撞到的判定宽度」）
      color: 0xff5a3c,     // 预警线 / 冲锋拖影颜色
    },
    spawnTime: 1.0,
    deathTime: 1.5,
    selfDestruct: false,
    color: 0xff8a6a,
    // ⚠️ 不设 ringColor：它 5.4 的「起手距离」画成范围环会把半个战场染红，
    // 玩家要看的预警是蓄力时地上那条直线（见 showChargeLine）。
    animFamily: 'quad',
    clipOverrides: { attack: 'Attack_Headbutt' },   // 低头顶人，正好是冲锋那一下
    glow: { color: 0x3a1006, intensity: 0.9 },      // 黑牛在焦土场景里就是一团黑，给点余烬红描边
    anim: {
      walk: 'walk', idle: 'idle', death: 'death', spawn: 'spawn',
      attack: 'attack',
    },
  },

  shielder: {
    name: '盾斧兽人',
    file: 'assets/monsters/orc.glb',
    sourceHeight: 3.117,   // 实测
    // 尺寸来回调过两轮：1.46（太小）→ 3.80（太大）→ 现在 1.90。
    // 2026-10-24 用户定案：**战士的 1.4 倍**，看着是壮汉，但不再是 boss 块头。
    // 碰撞半径跟着 1.9/3.8 缩回（0.83 → 0.62），不堵路。
    height: 1.90,
    radius: 0.62,
    hp: 5,                 // 比同期的战士厚一点，逼玩家挑窗口打
    armor: 0,
    speed: 1.18,
    damage: 1,
    // 近战距离按视觉边缘对齐：模型水平半径 1.33×(1.9/3.8)≈0.67 + 主角 0.65 ≈ 1.32，
    // 留一点余量到 1.45（贴脸打得到，但不会隔着空气挨揍）。
    attackRange: 1.45,
    attackInterval: 1.9,
    windup: 0.5,
    attackDuration: 0.78,
    // 举盾循环：举 1.6 秒（减伤 70%、原地不动）↔ 放 1.6 秒（正常受伤、追人）
    shield: { up: 1.6, down: 1.6, reduce: 0.70, firstUp: 0.6 },
    spawnTime: 1.0,
    deathTime: 1.5,
    selfDestruct: false,
    color: 0xa9c8d8,
    ringColor: 0x8fbfd8,
    animFamily: 'humanoid',
    clipOverrides: { attack: 'Weapon' },   // 兽人自带钉头骨棒，挥棒比空手拳好看
    anim: {
      walk: 'walk', idle: 'idle', death: 'death', spawn: 'spawn',
      attack: 'attack',
    },
  },

  brood: {
    name: '孢生菇',
    file: 'assets/monsters/mushnub-evolved.glb',
    sourceHeight: 4.457,   // 实测（含头顶一圈尖刺）
    // 和盾斧兽人同一条线：1.26（太小）→ 3.28（太大）→ 现在 1.90。
    // 2026-10-24 用户定案：和战士比「壮一圈」但不压屏。远程召唤型，射程不变。
    height: 1.90,
    radius: 0.55,
    hp: 4,                 // 血不厚：设计上就是「你肯冲进去就能拆掉」
    armor: 0,
    speed: 1.12,
    damage: 1,
    attackRange: 7.0,
    keepDistance: 5.0,
    attackInterval: 4.6,
    windup: 1.2,
    attackDuration: 1.9,
    castTime: 1.2,         // 有它就说明「这个远程不画脚下范围环」
    // 召唤：在它脚下孵出小兵（cap 是「同一只 brood 名下的存活上限」）
    spell: { kind: 'brood', count: 2, cap: 6, radius: 1.25, color: 0x8ef07a },
    spawnTime: 1.0,
    deathTime: 1.6,
    selfDestruct: false,
    color: 0xaef08a,
    footY: -0.082,         // 实测：脚底略低于原点，按脚落地（不然会陷进土里）
    animFamily: 'blob',
    clipOverrides: { cast: 'Jump' },   // 团块家族没有读条，原地一蹦 = 喷孢子
    glow: { color: 0x1d6b22, intensity: 0.6 },
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },
  // ============================================================
  // 第四关：雾堤服务区的三只怪（第 35 块；第 52 块换模型）
  //
  // 三关已经把「打断与目标优先级」用掉了，四关换一种压力：
  //   **信息差与持续战**。浓雾里看不清、打不着、打不死：
  //   wraith  雾鬼     —— 信息差压力。周期隐身（隐身时无敌、打不着），
  //                       贴到玩家 1.2 内强制显形。逼玩家留一手范围技。
  //   leaper  雾猎狼   —— 空间压力。蓄力后跳向玩家**当时**的位置，
  //                       落点红圈预警，落地小范围震荡。和蛮牛的「直线」
  //                       区分：它跳的是点，必须离开那个点。
  //   mender  缝补小巫 —— 续航压力。周期给周围怪回血（对立于孢生菇的加人），
  //                       不先拆它，前面打的血全白打。逼切后排。
  //
  // 第 52 块换模型（原来三只共用投手/法师骨架）：
  //   wraith → 幽灵（ghost，天生半透明 + 脚离地 0.22，隐身淡出最自然）
  //   leaper → 狼（wolf，四足扑咬，跳劈那一下最像野兽扑过来）
  //   mender → 尖帽小巫（wizard，一顶绿尖帽的团块，奶人的小怪物）
  // ============================================================
  wraith: {
    name: '雾鬼',
    file: 'assets/monsters/ghost.glb',
    sourceHeight: 3.145,   // 实测（含两只耳朵）
    // 2026-10-24 用户定案：太小 → 1.85（和另外两只四关怪同档）。
    height: 1.85,
    radius: 0.52,
    hp: 2,
    armor: 0,
    speed: 1.45,
    damage: 1,
    attackRange: 1.55,     // 近战（第 61 块起隐身也能打人，见下面 ghost 注释）
    attackInterval: 1.9,
    windup: 0.4,
    attackDuration: 0.75,
    // 隐身循环：显 3 秒 → 隐 2.5 秒。
    // 2026-10-24 用户定案（第 62 块）：
    //   ① **取消「贴到脸上强制显形」** —— 那条规则等于给玩家一个免费的破解手段，
    //      把隐身这套机制削没了；
    //   ② **隐身时照样能打人**（原来一出手就露脸，等于隐身只敢不打）；
    //   ③ 隐身时玩家打不到它（takeDamage 里直接 return false），只能等它自己显形。
    //   于是它的定位变成「会咬人的雾」：血月数着秒数躲，别硬站。
    ghost: {
      hidden: 2.5,         // 隐身时长
      visible: 3.0,        // 显形时长
      firstHidden: 1.4,    // 出生后多久第一次隐身
      // 第 65 块（用户：现身状态和隐身差别太小）：
      //   隐身 0.16 → **0.05**（几乎只剩一点轮廓，看得见「有东西」但看不清它）
      //   显形同时把自发光拉到 2.2（见 update 里的 ghost 分支）——
      //   在雾里，亮起来比「变不透明」更容易被一眼认出。
      ghostOpacity: 0.05,
    },
    spawnTime: 1.0,
    deathTime: 1.4,
    selfDestruct: false,
    color: 0x9fd8d0,
    ringColor: 0x9fd8d0,   // 脚下近战圈（隐身时圈也一起藏）
    footY: 0.219,          // 天生浮空
    animFamily: 'flying',
    glow: { color: 0x1c4c52, intensity: 1.0 },   // 雾里的青灰冷光：模型本身很黑，不发光看不见
    anim: {
      walk: 'walk', idle: 'idle', death: 'death', spawn: 'spawn',
      attack: 'attack',
    },
  },

  leaper: {
    name: '雾猎狼',
    file: 'assets/monsters/wolf.glb',
    sourceHeight: 2.707,   // 实测（站立时头顶高度）
    // 2026-10-24 用户定案：太小 → 1.85。
    height: 1.85,
    radius: 0.62,          // 狼身长，碰撞半径宽一些
    hp: 3,
    armor: 0,
    speed: 1.30,
    damage: 2,             // 落地震荡 2 点（和蛮牛冲锋同档）
    attackRange: 5.8,      // 进入这个距离开始蓄力起跳
    attackInterval: 4.2,
    windup: 0.8,           // 蓄力 = 落点红圈的显示时间（走位窗口）
    attackDuration: 0.8,   // 蓄力阶段总时长（和 windup 一致）
    // 跳跃本体：跳向**蓄力那一刻**玩家的位置（落点不追人，红圈就是答案），
    // 抛物线跳过去，落地对 landRadius 内结算一次震荡。
    leap: {
      jumpTime: 0.55,      // 滞空时间
      arcH: 1.7,           // 跳多高（视觉抛物线）
      landRadius: 1.7,     // 落地震荡半径
      recover: 1.0,        // 落地后的僵直（输出窗口）
      color: 0xd8a04a,     // 落点红圈 / 落地震荡的颜色
    },
    spawnTime: 1.0,
    deathTime: 1.5,
    selfDestruct: false,
    color: 0xc8d89a,
    // ⚠️ 不设 ringColor：起手距离画环会染半个战场，玩家要看的是落点红圈
    animFamily: 'quad',
    glow: { color: 0x24414a, intensity: 0.5 },   // 一圈雾色描边，暗处不至于糊成一团
    anim: {
      walk: 'walk', idle: 'idle', death: 'death', spawn: 'spawn',
      attack: 'attack',
    },
  },

  mender: {
    name: '缝补小巫',
    file: 'assets/monsters/wizard.glb',
    sourceHeight: 2.625,   // 实测（含尖帽）
    // 2026-10-24 用户定案：太小 → 1.85（和另外两只四关怪同档）。
    height: 1.85,
    radius: 0.52,
    hp: 4,                 // 血不厚：设计上就是「肯冲进去就能拆掉」
    armor: 0,
    speed: 1.10,
    // 故意不写 damage：它一次都不伤人（图鉴会显示「从不还手」），
    // 威胁全在那顶帽子里 —— 不拆它，前排的怪永远打不死。
    attackRange: 7.0,
    keepDistance: 5.0,
    attackInterval: 4.8,
    windup: 1.0,
    attackDuration: 1.7,
    castTime: 1.0,         // 有它就说明「这个远程不画脚下范围环」
    // 回血：每读一次条给 radius 内所有掉血的怪回 heal × 本局伤害成长，
    // 满血的怪不浪费。回合越往后奶量越大（跟着 damageScale 走）。
    // 2026-10-24 用户反馈「范围是不是很小」→ 3.2 确实只够照顾脚边几只，
    // 改成 8.0（跨半场奶）。**不画判定圈**（那么大一个圈会把战场糊满），
    // 改为在每一只被治疗的怪身上冒绿色治疗特效 —— 玩家一眼看出哪儿在回血。
    spell: { kind: 'mend', radius: 8.0, heal: 1.2 },
    spawnTime: 1.0,
    deathTime: 1.6,
    selfDestruct: false,
    color: 0x9ef0b8,
    animFamily: 'blob',
    clipOverrides: { cast: 'Jump' },   // 蹦一下 = 撒药
    glow: { color: 0x1a6b48, intensity: 0.8 },
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },

  // ============================================================
  // 第五关 · 草甸路口（第 63 块）—— 擦名者
  // ============================================================
  // 蛙爷的册子上，名字被擦掉的人「人还在，魂没了」。这只怪就是那把橡皮。
  //
  // 它**一次都不伤人**，它的威胁在别的地方：读条 2.6 秒后，把你环上的
  // **一把剑擦掉**（挂在它自己身上），然后转身就往场地外跑 ——
  // 它跑出去了，那把剑这一局就永远没了。
  // 所以玩家面对的是一道选择题：先杀眼前的怪，还是先追那个偷东西的。
  //
  // 反制手段（都能打断它的算盘）：
  //   冰剑冻住 → 它跑不动，站着等你来砍
  //   震剑击退 → 推一下打断读条，这次擦名白读
  //   任何位移类效果都行 —— 它只有 5 点血，冲过去两下就死
  //
  // 模型：KayKit《Character Pack: Adventurers》的 Rogue_Hooded（CC0），
  // 76 段动画裁到 5 段（见 .tmp-shrink-glb.py），3.6MB → 532KB。
  eraser: {
    name: '擦名者',
    file: 'assets/monsters/hooded-scribe.glb',
    sourceHeight: 2.652,   // 实测（Idle 渲染身高，.tmp-block63-calib.js）
    height: 1.95,          // 比战士高半头：兜帽长袍本来就显个儿
    radius: 0.55,
    hp: 5,
    armor: 0,
    speed: 1.15,
    // 故意不写 damage：它从不还手（图鉴会显示「从不还手」）。它靠偷东西吃饭。
    attackRange: 9.0,      // 站得很远就动手，你得先跑过去
    keepDistance: 6.0,     // 你一靠近它就退
    attackInterval: 8.5,
    windup: 2.6,           // 读条 2.6 秒：这段时间冲过去还来得及
    attackDuration: 3.4,
    castTime: 1.0,
    // 只为了让 update 走「施法者」那条骨架（保持距离 + 读条），
    // 真正的效果在下面的 e.cfg.erase 分支里，spawnSpell 不会收到这个 kind。
    spell: { kind: 'erase' },
    erase: {
      fleeSpeed: 1.85,     // 得手后逃跑时的移速倍率（比玩家 4.4 慢，追得上）
      knockGap: 0.5,       // 擦下来的剑在它身上挂多久才「掉」——其实一直挂着，这只是冷却
    },
    spawnTime: 1.0,
    deathTime: 1.6,
    selfDestruct: false,
    color: 0x6a4f9a,       // 紫黑兜帽：草甸的油灯下最不显眼的那种颜色
    animFamily: 'humanoid',
    clipOverrides: { cast: 'Spellcast_Long', death: 'Death_A', hit: 'Hit_A' },
    glow: { color: 0x3a1a6a, intensity: 0.75 },
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },

  // ============================================================
  // 第六关 · 骨塔机房（第 63 块）—— 重启体
  // ============================================================
  // 报废服务器机房里还在跑的巡检机器人。打死了不算完：4 秒后它原地重启，
  // 半血站起来，而且比上一次更快。**最多重启 2 次**，第 3 次才是真死。
  //
  // 它把「清场」这件事变贵了：你以为这一波打完了，转身发现地上那个铁块
  // 又站起来了。想彻底拆掉它，就得多花 4 秒在它旁边守着（补刀）。
  //
  // 模型：three.js 官方示例的 RobotExpressive（CC0 by Tomás Laulhé /
  // 改动 by Don McCurdy），464KB，14 段动画全留（重启用的是 Jump）。
  reboot: {
    name: '重启体',
    file: 'assets/monsters/reboot-unit.glb',
    sourceHeight: 4.457,   // 实测（Idle 渲染身高，.tmp-block63-calib.js）
    height: 1.85,
    radius: 0.62,
    hp: 3.4,
    armor: 0,
    speed: 1.30,
    damage: 1.1,           // 见 spawn 时的 damageScale 乘算
    attackRange: 1.55,
    attackInterval: 1.5,
    windup: 0.42,
    attackDuration: 0.85,
    reboot: {
      times: 2,            // 最多重启 2 次（第 3 次真死）
      delay: 4.0,          // 躺尸 4 秒再站起来
      hpRatio: 0.55,       // 重启后血量 = 上限 × 0.55
      speedMul: 1.15,      // 每重启一次快 15%（叠乘）
    },
    spawnTime: 0.9,
    deathTime: 1.4,
    selfDestruct: false,
    color: 0xb8c4cc,
    animFamily: 'robot',   // 见 CLIP_FAMILIES.robot（RobotExpressive 自己的动画名）
    glow: { color: 0x2a6a8a, intensity: 0.7 },
    anim: {
      walk: 'walk', idle: 'idle', attack: 'attack',
      death: 'death', spawn: 'spawn',
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
// 法杖（程序化，不额外占下载体积）
//
// ⚠️ 第 52 块换模型后**暂时没有怪在用**：新模型（Quaternius）自带武器/配件，
// 而且骨架没有手骨。代码留着是因为它已经处理了「骨骼轴任意 → 杖身竖直」的反解，
// 将来想让某只怪重新拿杖，只要在 cfg 里写 skin.staff = 'bone' 就能挂上。
// 挂点顺序见 attachStaff：手骨 → 小臂（新模型只有到小臂）。
// ------------------------------------------------------------
const STAFF_STYLES = {
  bone:    { rod: 0xcfc9b8, tip: 0xa96bff, len: 1.00, orb: 0.075 },   // 咒面图腾：短骨杖 + 紫晶
  torch:   { rod: 0x8a5a34, tip: 0xff7a2a, len: 0.82, orb: 0.062 },   // 焚火魔：短炬 + 橙火
  crystal: { rod: 0xa9d8ee, tip: 0x7ef0ff, len: 1.42, orb: 0.085 },   // 孢冠菌王：长杖 + 青晶
  brood:   { rod: 0x6b7a52, tip: 0x8ef07a, len: 0.66, orb: 0.055 },   // 孢生菇：短骨篮 + 绿卵光（第 29 块）
  mend:    { rod: 0xd8d2c0, tip: 0x8ef0b8, len: 0.74, orb: 0.045 },   // 缝补小巫：一根白骨针 + 针尖绿光（第 35 块）
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
  // 第 52 块：新模型没有手骨（Quaternius 的骨架只到 LowerArm），
  // findBone 逐个试、找不到手就挂小臂，实在没有就不挂（返回 null，不报错）。
  const slot = findBone(model, [
    'handslot.r', 'handslotr', 'hand.r', 'handr',
    'lowerarm.r', 'forearm.r', 'upperarm.r',
  ]);
  if (!slot) return null;
  const staff = makeStaff(kind);
  model.updateMatrixWorld(true);
  slot.updateWorldMatrix(true, false);   // 同上：祖先链也要强制更新（骨骼可能带巨大缩放）
  const qb = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  slot.getWorldQuaternion(qb);
  root.getWorldQuaternion(qr);
  staff.quaternion.copy(qb.invert().multiply(qr));
  // 杖身几何是按「骨骼缩放 ≈ 1」做的（长 1.0 世界单位），骨骼带 ×100 时按 1/ws 缩回来
  const ws = new THREE.Vector3();
  slot.getWorldScale(ws);
  staff.scale.setScalar(ws.x > 1e-6 ? 1 / ws.x : 1);
  staff.position.set(0, 0, 0);
  slot.add(staff);
  return staff;
}

// ------------------------------------------------------------
// 盾斧兽人的骨盾（第 29 块，程序化）
// 挂在左手骨骼上；举盾时盾牌抬到胸前并发青光，放盾时垂下。
// 材质一起进 mats，受击闪白时盾也闪（不然会出现「人白盾不白」的割裂感）。
// ------------------------------------------------------------
function makeShield() {
  const g = new THREE.Group();
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.62, metalness: 0.18 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x6f8c9a, roughness: 0.5, metalness: 0.45 });

  // 盾面：略扁的六棱柱，看起来像一块拼起来的厚骨板
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 6), boneMat);
  face.rotation.x = Math.PI / 2;
  face.castShadow = true;
  face.frustumCulled = false;
  g.add(face);

  // 盾沿：一圈略大的六棱柱当边框
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.028, 4, 6), rimMat);
  rim.frustumCulled = false;
  g.add(rim);

  // 中间一颗骨钉
  const stud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), rimMat);
  stud.position.z = 0.05;
  stud.frustumCulled = false;
  g.add(stud);

  g.userData.mats = [boneMat, rimMat];
  g.userData.boneMat = boneMat;
  return g;
}

function attachShield(root, model, worldRadius = 0.34) {
  // 同上：新模型没有手骨，退到小臂（兽人的盾就是挂在小臂上的）
  const slot = findBone(model, [
    'handslot.l', 'handslotl', 'hand.l', 'handl',
    'lowerarm.l', 'forearm.l', 'upperarm.l',
  ]);
  if (!slot) return null;
  const shield = makeShield();
  model.updateMatrixWorld(true);
  // ⚠️ 必须强制把祖先链也更新一遍（updateWorldMatrix(true, false)）：
  // 兽人的 CharacterArmature 自带 ×100 缩放，只更新 model 子树时骨骼矩阵还是旧值，
  // 于是下面量到的世界缩放是 1.29 而不是 47 —— 盾牌当场被放大四十倍糊满屏幕。
  slot.updateWorldMatrix(true, false);
  const qb = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  slot.getWorldQuaternion(qb);
  root.getWorldQuaternion(qr);
  shield.quaternion.copy(qb.invert().multiply(qr));
  // 第 52 块：挂件尺寸按「世界半径」反推 —— 骨骼可能自带巨大缩放，
  // 直接塞局部尺寸会变成一面城墙。盾牌几何半径 0.34，k = 世界半径 / (0.34 × 骨骼世界缩放)。
  const ws = new THREE.Vector3();
  slot.getWorldScale(ws);
  const k = ws.x > 1e-6 ? worldRadius / (0.34 * ws.x) : 1;
  shield.scale.setScalar(k);
  shield.position.set(0.04 / ws.x, 0.06 / ws.x, 0.02 / ws.x);
  // 举盾动画要用的基准（见「盾斧兽人：举盾 ↔ 放盾」那段）：记 k 与骨骼缩放，
  // 动画里只按比例乘，绝不再写死局部坐标（旧写法 0.17 在 ×47 的骨骼下等于 8 格）。
  shield.userData.k = k;
  shield.userData.ws = ws.x;
  slot.add(shield);
  return shield;
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
    const head = findBone(model, ['head']);   // KayKit 是 head，Quaternius 是 Head
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

// ------------------------------------------------------------
// 图鉴缩略图（第 51 块）：给图鉴用的「跟局内长得一样」的静态模型
// ------------------------------------------------------------
// 图鉴不需要整只怪（血条 / 接触环 / AI 全用不上），只借 spawn() 里那套
// 「克隆 → 按 sourceHeight 归一 → 换肤 / 染色 / 转半透明」的打扮流程，
// 再摆一个 Idle 姿势。打扮走的是**同一段代码**，缩略图才不会和游戏里长得不一样。
// 换模型后要重新生成缩略图：`node .tmp-codex-shots.js`。
const previewGltf = new Map();   // file -> gltf（同一个 glb 只解析一次）
export async function buildPreviewModel(type) {
  const cfg = ENEMY_TYPES[type];
  if (!cfg) return null;
  let gltf = previewGltf.get(cfg.file);
  if (!gltf) {
    gltf = await new GLTFLoader().loadAsync(cfg.file);
    previewGltf.set(cfg.file, gltf);
  }
  const model = cloneSkinned(gltf.scene);
  const s = cfg.height / cfg.sourceHeight;
  model.scale.setScalar(s);
  // 脚底对齐（同 spawn）：实测脚底在原点以下的模型要往上抬一点，不然缩略图会「陷」进影子
  if (cfg.footY != null && cfg.footY < 0) model.position.y = -cfg.footY * s;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    o.material = o.material.clone();
  });
  if (cfg.skin) applyWizardSkin(model, cfg.skin);
  if (cfg.tint) {
    const tc = new THREE.Color(cfg.tint);
    model.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material.color.copy(tc);
    });
  }
  // 自带微光（雾鬼 / 焚火魔这类深色或半透明模型，不给一点自发光在暗场景里看不见）
  if (cfg.glow) {
    const gc = new THREE.Color(cfg.glow.color ?? 0xffffff);
    model.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive.copy(gc);
        o.material.emissiveIntensity = cfg.glow.intensity ?? 0.6;
      }
    });
  }
  // 雾鬼：局内是「半透明 + 隐身淡出」，缩略图给个 0.75 让它在图鉴里也像一缕雾
  if (cfg.ghost) {
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material.transparent = true;
      o.material.opacity = 0.75;
    });
  }
  // 配件（第 52 块）：盾 / 弓 / 法杖也挂上 —— 图鉴里盾斧兽人没盾就说不通了。
  // 这里 model 既是 root 也是模型（预览模型的旋转是 0，和局内一致的挂法）。
  if (cfg.shield) attachShield(model, model, cfg.height * 0.26);
  if (cfg.volley) attachBow(model, model);
  if (cfg.skin && cfg.skin.staff) attachStaff(model, model, cfg.skin.staff);
  // 绑定姿态是张牙舞爪的 T pose，不能直接用 —— 先推进 Idle 半拍再定格。
  // 第 52 块：新模型的 idle 叫 Flying_Idle / 带 CharacterArmature| 前缀，走别名表解析。
  const aliases = resolveClipAliases(gltf, cfg);
  const idleName = aliases.idle || ANIM.idle;
  const clip = gltf.animations.find((c) => c.name === idleName) || gltf.animations[0];
  if (clip) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play();
    mixer.update(0.45);
  }
  return { model, height: cfg.height };
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ------------------------------------------------------------
// 怪物血条：一张 168×42 的 canvas 贴图 + Sprite，受伤才显示
// 第 56 块（用户定案）：**所有怪的血条统一大小**。以前宽随身高走，第 53 块
// 又把放大/缩小的怪连带缩放（卫队缩到 0.7、菌王放到 3.24 倍时血条差 4 倍多），
// 一大一小很难看。现在世界宽度固定 BAR_W，谁都不特殊；只有「挂多高」仍按
// 这一只的实际头顶高度算（缩放过的怪脑袋在别的高度，不跟会飘/会埋）。
// ------------------------------------------------------------
const BAR_W = 1.5;        // 血条世界宽度：全怪统一（≈ 普通怪身高×1.18 的老观感）
const BAR_LIFT = 0.95;    // 头顶上方抬升：俯视 45° 相机下贴太近会被怪自己的头挡住

function createBar(cfg, scale = 1) {
  const W = 168, H = 42;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const spr = new THREE.Sprite(mat);
  // 头顶常驻血条：宽固定（见上），高按画布比例折算。
  // ⚠️ 必须抬到头顶上方约 0.95 —— 相机是俯视 45°，贴得太近会被怪自己的头挡住。
  // 挂多高仍按实际身高：卫队 0.7 倍、菌王 3.24 倍的脑袋不在这里，血条得跟着挪。
  const hh = cfg.height * scale;
  spr.scale.set(BAR_W, BAR_W * (H / W), 1);
  spr.position.y = hh + BAR_LIFT;
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
export function createEnemySystem({ scene, fx, arenaRadius = 15, onDeath, onSpawn }) {
  let arenaR = arenaRadius;   // 可走半径，随关卡变（第三关 19，第 33 块）—— setArenaRadius 改
  const assets = new Map();   // type -> { scene, clips, height, minY }
  const list = [];            // 场上所有怪（含正在消散的）
  let uid = 0;

  // ---------------- 加载 ----------------
  async function loadType(type) {
    if (assets.has(type)) return assets.get(type);
    const cfg = ENEMY_TYPES[type];
    // 同一个 glb 只解析一次（同文件的怪共用一份模型与动画）。
    // 第 52 块换模型后 13 只怪已经各用各的文件，这条只对「以后又复用」的怪有用。
    for (const [k, v] of assets) {
      if (ENEMY_TYPES[k] && ENEMY_TYPES[k].file === cfg.file) {
        assets.set(type, v);
        return v;
      }
    }
    const gltf = await new GLTFLoader().loadAsync(cfg.file);

    const clips = {};
    for (const c of gltf.animations) clips[c.name] = c;

    // 语义键（idle/walk/attack…）→ 真实 clip 名，见 CLIP_FAMILIES
    const data = { scene: gltf.scene, clips, aliases: resolveClipAliases(gltf, cfg) };
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

    // 数值兜底：孢冠菌王这类「不出手」的怪没有 damage 字段，
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
    // opts.scale：同一个模型可以按实例缩放（第 53 块，菌王的四个卫队用 0.7）——
    // 只改这一只，不动 ENEMY_TYPES 里 warrior 本体的身高（第一关还在用）。
    const scaleMul = opts.scale ?? 1;
    const s = (cfg.height / cfg.sourceHeight) * scaleMul;
    model.scale.setScalar(s);
    model.rotation.y = ENEMY_MODEL_YAW;
    // 脚底对齐（第 52 块）：新模型的脚底不完全在原点（实测 -0.08 ~ +0.49），
    // 负的要抬起来（不然半个身子陷进土里），正的是天生浮空（雾鬼/焚火魔），照原样飘。
    if (cfg.footY != null && cfg.footY < 0) model.position.y = -cfg.footY * s;

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
    // 第三关的重涂（第 29 块）：非巫师怪没有 skin 表，用 tint 整体压一层色。
    // KayKit 的骨贴图偏白，乘一层颜色就是新色调 —— 和巫师换肤同一条思路。
    if (cfg.tint) {
      const tc = new THREE.Color(cfg.tint);
      model.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) o.material.color.copy(tc);
      });
    }
    // 自带微光（第 52 块）：雾鬼/焚火魔这类深色模型在暗场景里就是一团黑，
    // 给点自发光才看得见。受击闪白后 baseEmissive 会把这个颜色还回来。
    if (cfg.glow) {
      const gc = new THREE.Color(cfg.glow.color ?? 0xffffff);
      for (const m of mats) {
        if (!m.emissive) continue;
        m.emissive.copy(gc);
        m.emissiveIntensity = cfg.glow.intensity ?? 0.6;
      }
    }
    // 雾鬼（第 35 块）：整套材质转半透明，隐身时靠 opacity 淡出。
    // 必须在 clone 之后做 —— 材质已经是独立的，改这里不影响别的怪。
    if (cfg.ghost) {
      for (const m of mats) {
        m.transparent = true;
        m.opacity = 1;
      }
    }
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

    // 主祭的霜牢环：半径就是加成范围。第 28 块起 followPlayer —— 环不挂在主祭
    // 身上，而是挂到场景里、每帧贴到主角脚下（像弓手的红圈一样跟着人走）；
    // 玩家一眼能看出「我现在拖着谁在变凶」。其余怪不画（远程的范围环会盖住半个战场）。
    const auraFollow = !!(cfg.aura && cfg.aura.followPlayer);
    const auraRing = cfg.aura
      ? createRangeRing({
          radius: cfg.aura.radius,
          color: cfg.color,
          opacity: 0.24,
          pulse: 0.07,
          y: 0.026,
        })
      : null;
    if (auraRing) {
      if (auraFollow) scene.add(auraRing.mesh);
      else root.add(auraRing.mesh);
    }

    const bar = createBar(cfg, scaleMul);
    root.add(bar.spr);
    scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(src.clips)) {
      actions[name] = mixer.clipAction(clip);
    }
    // 语义键别名（第 52 块）：新模型的 cfg.anim 写的是 'idle'/'walk'/'attack'，
    // 这里把它们指向真实 clip 的动作实例。同一个 action 挂两个键是安全的。
    for (const [key, real] of Object.entries(src.aliases || {})) {
      if (actions[real]) actions[key] = actions[real];
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
      height: cfg.height * scaleMul,   // 这一只的实际身高（卫队 0.7 倍，特效/文字按它定位）
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
      freezeT: 0,      // 冰冻剩余时间（第 56 块，冰剑）：>0 时完全定住，不动也不打
      freezeFxT: 0,    // 冰冻指示圈的发出计时
      // 第 63 块：
      reboots: 0,      // 重启体：已经重启过几次（见 cfg.reboot.times）
      rebootFxT: 0,    // 重启体躺尸时那圈红光的闪动计时
      stolen: null,    // 擦名者：从环上擦下来的那把剑（kind 字符串；杀死它才还）
      fleeT: 0,        // 擦名者：逃跑已经跑了多久
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
      guard: opts.guard || null,   // 霜牢卫队：{ master, angle, radius }（第 28 块）
      auraHaste: 0,      // 本帧站在谁的霜牢环里（由 update 里的 collectAuras 写）
      auraArmor: 0,
      glowT: 0,          // 被霜牢环加成的发光过渡（0~1，样貌改变用）
      // 卫队继承主祭本局的成长倍率（第 28 块）：召唤时按这个落账
      summonScale: { hp: opts.hpScale ?? 1, dmg: opts.damageScale ?? 1 },
      baseEmissive: mats.map((m) => (m.emissive ? m.emissive.clone() : null)),
      currentAnim: '',
      // ---- 第三关（第 29 块）----
      shieldUp: false,                                    // 盾斧兽人此刻举没举盾
      shieldT: cfg.shield ? cfg.shield.firstUp : 0,        // 距离下次翻转盾的时间
      chargeDirX: 0, chargeDirZ: 0,                        // 骨骑冲锋锁定的方向
      chargeLine: null,                                    // 蓄力预警线（网格，按需创建）
      chargeDone: false, chargeHitDone: false,
      summonedBy: null,                                    // 孵出来的小兵记着「谁生的」
      // ---- 第四关（第 35 块）----
      ghostHidden: false,                                  // 雾鬼此刻隐没没隐身
      ghostT: cfg.ghost ? cfg.ghost.firstHidden : 0,        // 距离下次隐身/显形翻转的时间
      leapRing: null,                                      // 雾猎狼的落点红圈（按需创建）
      leapFromX: 0, leapFromZ: 0, leapToX: 0, leapToZ: 0,   // 起跳点 / 锁定的落点
      leapHitDone: false,
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

    // 盾斧兽人：左手一面骨盾（第 29 块）。材质同样进 mats，受击时盾一起闪白。
    // 第 52 块：盾的世界半径跟身高走（0.30×身高），骨架缩放再大也不会变形。
    if (cfg.shield) {
      const sh = attachShield(root, model, cfg.height * 0.30);
      if (sh) {
        e.shieldMesh = sh;
        e.mats.push(...sh.userData.mats);
        e.baseEmissive.push(...sh.userData.mats.map((m) => (m.emissive ? m.emissive.clone() : null)));
      }
    }

    // 出生：先播从地里钻出来的动画
    bar.draw(1, maxHp, maxHp);
    e.currentAnim = cfg.anim.spawn;
    play(cfg.anim.spawn, { once: true, fade: 0.05, duration: cfg.spawnTime });
    if (fx) fx.spawnRing(e.pos, cfg.color);

    list.push(e);
    // 第 55 块：新怪第一次上场时通报一声 —— main.js 据此冻结世界、弹「它怎么打人」的信息卡。
    // 放在 push 之后：回调里就看得见这只怪已经在场上了（测试也靠这点断言）。
    if (onSpawn) onSpawn(e);
    return e;
  }

  // ---------------- 受伤 / 死亡 ----------------
  // opts:
  //   dot   中毒跳伤 —— 不闪白、绿色小字（每 0.5 秒一次，别和普攻特效混在一起）
  //   quiet 只扣血不播命中碎屑（连锁闪电等批量伤害用）
  function takeDamage(e, amount, crit = false, opts = {}) {
    if (e.state === 'dead' || e.state === 'spawn') return false;
    // 重启体躺尸重启中（第 63 块）：这 4 秒里它是块铁，打不动 ——
    // 你要做的是**守着**它，等它站起来那一下再补刀。
    if (e.state === 'down') return false;
    // 雾鬼隐身（第 35 块）：无形之物不受击 —— 近战、剑、炮台、法器全部打空。
    // 想打它只有两条路：等它显形，或者贴脸逼它显形。
    if (e.ghostHidden) return false;
    // 减伤有两个来源，乘法叠加：
    //   auraArmor —— 主祭霜牢环（第 28 块）
    //   shieldUp  —— 盾斧兽人举盾（第 29 块，举盾时减伤 70%）
    const red = Math.min(0.95, (e.auraArmor || 0) + (e.shieldUp && e.cfg.shield ? e.cfg.shield.reduce : 0));
    const dealt = red > 0 ? amount * (1 - red) : amount;
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
          y: e.height * 0.95,
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
    // ---- 第 63 块：重启体 —— 打死 ≠ 拆掉 ----
    // 血量归零时先看还有没有重启次数：有就转成 'down'（躺尸 4 秒），
    // 不给 onDeath 回调（不算击杀、不掉金币），4 秒后原地半血站起来。
    // 'down' 不是 'dead'，所以 aliveCount 也算它 —— 这一波清不掉，逼你补刀。
    if (e.cfg.reboot && e.reboots < e.cfg.reboot.times) {
      e.reboots++;
      e.state = 'down';
      e.t = 0;
      e.deathT = 0;
      e.hp = 0;
      e.bar.spr.visible = false;
      hideChargeLine(e);
      hideLeapRing(e);
      // 倒地：一圈红色 ERROR 光斑 + 一簇电弧，玩家一眼看出「这个还会起来」
      if (fx) {
        fx.ring(e.pos, { from: 0.2, to: 1.9, color: 0xff4a3c, life: 0.45, opacity: 0.8, y: 0.05 });
        fx.burst(e.pos, { color: 0xff7a55, count: 14, speed: 2.6, life: 0.5, size: 0.11, y: 0.3, up: 1.6 });
      }
      e.currentAnim = e.cfg.anim.death;
      e.play(e.cfg.anim.death, { once: true, fade: 0.08, duration: 0.5 });
      return;
    }

    e.state = 'dead';
    e.t = 0;
    e.deathT = 0;
    e.hp = 0;
    e.bar.spr.visible = false;
    // 跟随玩家的霜牢环：主祭一倒环就消（不挂在它身上，得手动收）
    if (e.auraRing && e.cfg.aura && e.cfg.aura.followPlayer) e.auraRing.mesh.visible = false;
    hideChargeLine(e);   // 骨骑死在蓄力里：预警线立刻收掉（第 29 块）
    hideLeapRing(e);     // 雾猎狼死在蓄力里：落点红圈立刻收掉（第 35 块）
    if (e.cfg.leap) e.root.position.y = 0;   // 滞空时被打死：尸体落回地面
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

  // ---------------- 骨骑的蓄力预警线（第 29 块） ----------------
  // 地上一道红色长条：长度 = 冲刺距离 + 余量，方向在起手那一刻锁定。
  // 玩家看到它就知道该往哪一侧侧移 —— 这是三关唯一「必须横向走位」的提示。
  const chargeLineGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  let chargeLineMatBase = null;
  function showChargeLine(e) {
    const ch = e.cfg.charge;
    if (!chargeLineMatBase) {
      chargeLineMatBase = new THREE.MeshBasicMaterial({
        color: ch.color, transparent: true, opacity: 0.34,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
    }
    if (!e.chargeLine) {
      e.chargeLine = new THREE.Mesh(chargeLineGeo, chargeLineMatBase.clone());
      e.chargeLine.renderOrder = 2;
      e.chargeLine.frustumCulled = false;
      scene.add(e.chargeLine);
    }
    const L = ch.lineLen;
    e.chargeLine.visible = true;
    e.chargeLine.position.set(
      e.pos.x + e.chargeDirX * L * 0.5, 0.045,
      e.pos.z + e.chargeDirZ * L * 0.5
    );
    e.chargeLine.rotation.y = Math.atan2(e.chargeDirX, e.chargeDirZ);
    e.chargeLine.scale.set(ch.lineW, 1, L);
  }

  function hideChargeLine(e) { if (e.chargeLine) e.chargeLine.visible = false; }

  function disposeChargeLine(e) {
    if (!e.chargeLine) return;
    scene.remove(e.chargeLine);
    if (e.chargeLine.material) e.chargeLine.material.dispose();
    e.chargeLine = null;
  }

  // ---------------- 雾猎狼的落点红圈（第 35 块） ----------------
  // 蓄力时钉在「玩家当时站的位置」：红圈 + 一层淡红填充，跟弓手的红圈一个语言。
  // 落点在起手那一刻就锁死 —— 红圈出现 → 走出去，就是这么直白的应对。
  const leapRingGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  const leapDiscGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  let leapMatBase = null;
  function showLeapRing(e, ctx) {
    const lp = e.cfg.leap;
    if (!leapMatBase) {
      leapMatBase = {
        rim: new THREE.MeshBasicMaterial({
          color: lp.color, transparent: true, opacity: 0.8,
          depthWrite: false, side: THREE.DoubleSide,
        }),
        disc: new THREE.MeshBasicMaterial({
          color: lp.color, transparent: true, opacity: 0.17,
          depthWrite: false, side: THREE.DoubleSide,
        }),
      };
    }
    if (!e.leapRing) {
      const rim = new THREE.Mesh(leapRingGeo, leapMatBase.rim.clone());
      const disc = new THREE.Mesh(leapDiscGeo, leapMatBase.disc.clone());
      rim.renderOrder = disc.renderOrder = 2;
      rim.frustumCulled = disc.frustumCulled = false;
      e.leapRing = new THREE.Group();
      e.leapRing.add(disc, rim);
      scene.add(e.leapRing);
    }
    e.leapRing.visible = true;
    e.leapRing.position.set(e.leapToX, 0.05, e.leapToZ);
    e.leapRing.scale.setScalar(lp.landRadius);
  }

  function hideLeapRing(e) { if (e.leapRing) e.leapRing.visible = false; }

  function disposeLeapRing(e) {
    if (!e.leapRing) return;
    scene.remove(e.leapRing);
    for (const c of e.leapRing.children) {
      if (c.material) c.material.dispose();
    }
    e.leapRing = null;
  }

  // ---------------- 雾鬼的隐身 / 显形（第 35 块） ----------------
  // 隐身 = 无敌 + 不可索敌 + 外观淡出（材质透明度过渡到 ghostOpacity）。
  // 显形只有一条路：等它自己的循环翻转（第 61 块删掉了「贴脸强制显形」）。
  function hideGhost(e) {
    e.ghostHidden = true;
    e.ghostT = e.cfg.ghost.hidden;
    if (e.ring) e.ring.mesh.visible = false;
    if (e.bar) e.bar.spr.visible = false;
  }

  function revealGhost(e) {
    if (!e.ghostHidden) return;
    e.ghostHidden = false;
    e.ghostT = e.cfg.ghost.visible;
    if (e.ring) e.ring.mesh.visible = true;
    if (e.bar) e.bar.spr.visible = e.hp < e.maxHp;
    if (fx) {
      fx.ring(e.pos, { from: 0.25, to: 1.15, color: e.cfg.color, life: 0.3, opacity: 0.6, y: 0.06 });
      fx.burst(e.pos, { color: 0xd8f0ea, count: 10, speed: 2.2, life: 0.4, size: 0.1, y: 0.6, up: 1.2 });
    }
  }

  // 霜牢加成的发光色（第 28 块）：环里的怪泛青光，一眼认出「这只变凶了」
  const AURA_GLOW = new THREE.Color(0x2fd8f0);
  const _glowColor = new THREE.Color();
  const _glowBlack = new THREE.Color(0x000000);

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
  const zones = [];      // 正在倒计时的地面圈（弓手红圈 / 咒面图腾紫阵 / 火焚灼地）
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
    // 第 28 块：孢冠菌王的石刺 —— 不走「圈」系统，是一串沿线爆发的地刺
    if (sp.kind === 'spikes') { spawnSpikes(e, ctx); return; }
    // 第 29 块：孢生菇 —— 在脚下孵小兵（同一只名下存活上限 cap，否则会无限滚雪球）
    if (sp.kind === 'brood') { spawnBroodlings(e); return; }
    // 第 35 块：缝补小巫 —— 给周围怪回血（不走「圈」系统，作用对象是怪不是地）
    if (sp.kind === 'mend') { mendWounds(e); return; }
    makeZone(sp.kind, e, ctx, sp.radius, {
      color: sp.color,
      debuff: e.cfg.debuff || null,
      burnLeft: sp.burnTime || 0,
      burnTick: sp.tick || 0.75,
      burnT: 0,
      burnTicker: 0,
    });
  }

  // ============================================================
  // 孢生菇 · 孵小兵（第 29 块）
  // 每读一次条孵 count 只，但「她名下存活的」不超过 cap —— 想让她停手
  // 只有一条路：把她本人打掉。孵出来的小兵带 `summonedBy` 便于计数。
  // ============================================================
  function spawnBroodlings(e) {
    const sp = e.cfg.spell;
    const alive = list.filter((m) =>
      m.summonedBy === e && m.state !== 'dead').length;
    const room = Math.max(0, (sp.cap || 6) - alive);
    const n = Math.min(sp.count || 2, room);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (sp.radius || 1.2) * (0.45 + Math.random() * 0.55);
      const m = spawn('minion', {
        x: e.pos.x + Math.cos(a) * r,
        z: e.pos.z + Math.sin(a) * r,
      }, {
        hpScale: (e.summonScale && e.summonScale.hp) ?? 1,
        damageScale: (e.summonScale && e.summonScale.dmg) ?? 1,
      });
      if (m) m.summonedBy = e;
    }
    if (fx) {
      fx.ring(e.pos, { from: 0.3, to: (sp.radius || 1.2) + 0.8, color: sp.color, life: 0.45, opacity: 0.55, y: 0.05 });
      fx.burst(e.pos, { color: sp.color, count: 14, speed: 2.6, life: 0.5, size: 0.13, y: 0.3, up: 1.6 });
    }
  }

  // ============================================================
  // 缝补小巫 · 回血（第 35 块）
  // 每读一次条，给半径内所有**掉血的**怪回 heal × 本局伤害成长
  // （满血的怪不浪费，血条即时刷新）。对立于孵骨的「加人」：
  //   孵骨逼你比谁清得快，缝补小巫逼你比谁拆得快 —— 不先拆它，血全白打。
  // 奶量随回合成长（跟着生成时的 damageScale 走），后期一口奶小半管。
  // ============================================================
  // 治疗特效的「加号雨」（第 65 块）：{ x,z,h,left,next }
  //   left 还剩多久、next 距下一个加号还有多久 —— 由 update 每帧推进
  const mendFx = [];

  function updateMendFx(dt) {
    for (let i = mendFx.length - 1; i >= 0; i--) {
      const f = mendFx[i];
      f.left -= dt;
      f.next -= dt;
      if (f.next <= 0) {
        f.next = 0.16;
        if (fx) {
          fx.plus({ x: f.x, z: f.z }, {
            color: 0x7df0b0, size: 0.44, life: 0.8, rise: 1.05,
            y: f.h * 0.55, spread: 0.42,
          });
        }
      }
      if (f.left <= 0) mendFx.splice(i, 1);
    }
  }

  function mendWounds(e) {
    const sp = e.cfg.spell;
    const amt = sp.heal * ((e.summonScale && e.summonScale.dmg) ?? 1);
    let n = 0;
    for (const o of list) {
      if (o.state === 'dead' || o.state === 'spawn') continue;
      if (o.hp >= o.maxHp) continue;
      if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) > sp.radius) continue;
      o.hp = Math.min(o.maxHp, o.hp + amt);
      o.bar.draw(o.hp / o.maxHp, o.hp, o.maxHp);
      o.bar.spr.visible = true;
      n++;
      if (fx) {
        // 回血绿字（伤害数字是白/黄/绿字里的毒绿，这里用更亮的青绿区分）
        fx.text({ x: o.pos.x, z: o.pos.z }, `+${amt.toFixed(1)}`, {
          color: '#7df0b0', y: o.height * 0.95, size: 0.4,
        });
        // 2026-10-24（用户要求）：范围放到 8.0 之后**不再画判定圈** ——
        // 那么大一个圈横在战场上比什么都乱。改为「谁被治，谁身上冒绿光」：
        // 脚下一圈收束的绿环 + 几点上浮的绿孢子，玩家一眼看出哪儿在回血。
        fx.ring(o.pos, { from: 0.1, to: 0.85, color: 0x7df0b0, life: 0.42, opacity: 0.75, y: 0.05 });
        fx.burst({ x: o.pos.x, z: o.pos.z }, {
          color: 0x8ef0b8, count: 6, speed: 1.2, life: 0.5, size: 0.09, y: 0.25, up: 1.5,
        });
        // 第 65 块（用户：治疗特效太短、不明显）：改成**一串绿加号不断往上浮**，
        // 持续 1.4 秒、每 0.16 秒冒一个 —— 一秒钟里连着七八个加号往上走，
        // 隔半个场地说也能一眼看出「那只在回血」。数量按被奶的怪封顶 10 只，
        // 防止小巫一奶半场时刷出上百个精灵。
        if (mendFx.length < 10) {
          mendFx.push({ x: o.pos.x, z: o.pos.z, h: o.height, left: 1.4, next: 0 });
        }
      }
    }
    // 施法者自己身上只冒一点点（表示「它在施法」，不要大圈）
    if (fx && n) {
      fx.burst(e.pos, { color: sp.color, count: 8, speed: 1.6, life: 0.45, size: 0.1, y: 0.4, up: 1.4 });
    }
    return n;
  }

  // ============================================================
  // 孢冠菌王 · 石刺（第 28 块）
  // 朝主角方向放一串石头刺：从主祭身前 1.4 格起，每隔 step 爆一段，
  // 共 count 段（延伸范围有限）；每段落地时玩家在半径内就吃一刀，
  // 最后一段的尽头钻出一只骷髅小兵 —— 把「躲技能」变成「清小兵」的连锁。
  // ============================================================
  const spikesQ = [];      // 待爆发的刺段 { x, z, t, r, dmg, color, last }
  const spikesFx = [];     // 正在伸缩的石刺锥 { mesh, t }
  let spikeGeo = null, spikeMat = null;

  function spikeAssets() {
    if (spikeGeo) return;
    spikeGeo = new THREE.ConeGeometry(0.17, 0.85, 5);
    spikeMat = new THREE.MeshStandardMaterial({
      color: 0x8f9aa6, roughness: 0.85, metalness: 0.1,
      emissive: 0x2a6d80, emissiveIntensity: 0.35,
    });
  }

  function spawnSpikes(e, ctx) {
    spikeAssets();
    const sp = e.cfg.spell;
    const dx = ctx.playerPos.x - e.pos.x;
    const dz = ctx.playerPos.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    for (let i = 0; i < sp.count; i++) {
      const dist = 1.4 + sp.step * i;
      spikesQ.push({
        x: e.pos.x + nx * dist,
        z: e.pos.z + nz * dist,
        t: sp.gap * i,                 // 从近到远一节节爆
        r: sp.radius,
        dmg: e.damage,
        color: sp.color,
        last: i === sp.count - 1,
        scales: e.summonScale || null,   // 尽头小兵继承主祭本局的成长倍率
      });
    }
  }

  function eruptSpike(v, ctx) {
    if (fx) {
      fx.ring({ x: v.x, z: v.z }, { from: 0.15, to: v.r, color: v.color, life: 0.3, opacity: 0.6, y: 0.05 });
      fx.burst({ x: v.x, z: v.z }, { color: 0xaebac6, count: 8, speed: 2.4, life: 0.35, size: 0.1, y: 0.15, up: 2.0, gravity: 6 });
    }
    // 视觉：一撮石刺锥从地里顶出来，停一拍再缩回去
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * v.r * 0.65;
      const mesh = new THREE.Mesh(spikeGeo, spikeMat);
      mesh.frustumCulled = false;
      mesh.position.set(v.x + Math.cos(a) * rr, -0.45, v.z + Math.sin(a) * rr);
      mesh.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
      scene.add(mesh);
      spikesFx.push({ mesh, t: 0 });
    }
    const d = Math.hypot(ctx.playerPos.x - v.x, ctx.playerPos.z - v.z);
    if (d <= v.r) ctx.hurtPlayer(v.dmg, null);
    // 尽头：钻出一只骷髅小兵（把「躲技能」变成「清小兵」的连锁）
    if (v.last) {
      const sc = v.scales || {};
      spawn('minion', { x: v.x, z: v.z }, {
        hpScale: sc.hp ?? 1,
        damageScale: sc.dmg ?? 1,
      });
      if (fx) fx.spawnRing({ x: v.x, z: v.z }, 0x9ee8ff);
    }
  }

  function updateSpikes(dt, ctx) {
    for (let i = spikesQ.length - 1; i >= 0; i--) {
      const v = spikesQ[i];
      v.t -= dt;
      if (v.t <= 0) {
        spikesQ.splice(i, 1);
        eruptSpike(v, ctx);
      }
    }
    for (let i = spikesFx.length - 1; i >= 0; i--) {
      const s = spikesFx[i];
      s.t += dt;
      // 升（0~0.12s）→ 停（0.25s）→ 缩（0.25s），共约 0.6 秒
      const y = s.t < 0.12
        ? -0.45 + (s.t / 0.12) * 0.42
        : s.t < 0.37 ? -0.03
        : Math.max(-0.5, -0.03 - ((s.t - 0.37) / 0.25) * 0.5);
      s.mesh.position.y = y;
      if (s.t > 0.62) {
        scene.remove(s.mesh);
        spikesFx.splice(i, 1);
      }
    }
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
    // 主祭的霜牢环：一直呼吸。followPlayer 的每帧贴到主角脚下（第 28 块），
    // 死亡后不再更新位置（die 里已隐藏）。
    if (e.auraRing) {
      if (e.cfg.aura && e.cfg.aura.followPlayer) {
        e.auraRing.mesh.position.x = ctx.playerPos.x;
        e.auraRing.mesh.position.z = ctx.playerPos.z;
      }
      e.auraRing.update(dt);
    }

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

    // 霜牢加成的「样貌改变」：环里的怪浑身泛起青光（第 28 块）。
    // glowT 平滑过渡，进环渐亮、出环渐暗；受击闪白优先（闪完再回到发光态）。
    {
      const buffed = e.auraHaste > 0 && e.state !== 'dead' && e.state !== 'spawn';
      e.glowT = Math.max(0, Math.min(1, e.glowT + (buffed ? dt * 6 : -dt * 4)));
      if (e.flashT <= 0) {
        for (let i = 0; i < e.mats.length; i++) {
          const m = e.mats[i];
          if (!m.emissive) continue;
          const base = e.baseEmissive[i];
          if (e.glowT > 0) {
            _glowColor.copy(base || _glowBlack).lerp(AURA_GLOW, e.glowT);
            m.emissive.copy(_glowColor);
          } else if (base) m.emissive.copy(base);
        }
      }
    }

    // ---- 冰冻（第 56 块，冰剑）：冻住的怪完全定住 —— 不动、不打、动画也停 ----
    // 放在 AI 之前、卫队公转之前：冰封期间连光环/闪白都照常走（挨打还是要看得见），
    // 但移动、攻击、蓄力、冲锋、公转全停。解冻后从原姿态继续（状态机没被清）。
    // ⚠️ 死亡消散不受冰冻影响（state==='dead' 的怪照样往下走消散计时）——
    //    否则冰里死掉的怪会永远僵在场上，回收循环收不走。
    if (e.freezeT > 0 && e.state !== 'dead') {
      e.freezeT -= dt;
      e.mixer.timeScale = 0;      // 动画一起冻住（解冻时恢复 1）
      // 冰封指示：脚底淡蓝圈，每 0.45 秒冒一个（复用冰缓那个颜色）
      e.freezeFxT -= dt;
      if (e.freezeFxT <= 0) {
        e.freezeFxT = 0.45;
        if (fx) fx.ring(e.pos, { from: 0.25, to: 0.8, color: 0x9fdcff, life: 0.4, opacity: 0.55, y: 0.05 });
      }
      if (e.freezeT <= 0) {
        e.freezeT = 0;
        e.mixer.timeScale = 1;
        if (fx) fx.ring(e.pos, { from: 0.3, to: 1.0, color: 0x9fdcff, life: 0.3, opacity: 0.6, y: 0.05 });
      }
      return;
    }
    if (e.mixer.timeScale === 0) e.mixer.timeScale = 1;   // 解冻后恢复（兜底：没走上面的归零分支）

    // ---- 主祭的霜牢卫队：环绕主祭站位、不自主动（第 28 块）----
    // 位置完全由主祭决定；主祭一死，卫队当场散架（霜牢断了，傀儡失去支撑）。
    if (e.guard) {
      const m = e.guard.master;
      if (!m || m.state === 'dead') {
        // 主祭一倒，卫队当场散架。这里**不能直接 return**：
        // 卫队已经死了之后再进来会一直卡在这个分支，走不到下面的消散计时，
        // 于是 corpse 永远停在原地（deathT 不涨、回收循环也永远收不走）。
        if (e.state !== 'dead') takeDamage(e, 99999, false, { quiet: true });
      } else {
        e.guard.angle += dt * 0.55;   // 慢慢公转，像仪仗队
        e.pos.x = m.pos.x + Math.cos(e.guard.angle) * e.guard.radius;
        e.pos.z = m.pos.z + Math.sin(e.guard.angle) * e.guard.radius;
      }
    }

    // ---- 重启体：躺尸 4 秒（第 63 块）----
    // 放在 'dead' 之前：'down' 不算死，所以 aliveCount 把它算进去 —— 这一波清不掉，
    // 玩家必须守着它站起来那一下补刀。地上那圈红光就是倒计时。
    if (e.state === 'down') {
      const rb = e.cfg.reboot;
      e.t += dt;
      const k = Math.min(1, e.t / rb.delay);
      // 红光呼吸：越快站起来闪得越急（0.45s → 0.15s）
      e.rebootFxT -= dt;
      if (e.rebootFxT <= 0) {
        e.rebootFxT = 0.45 - 0.3 * k;
        if (fx) {
          fx.ring(e.pos, {
            from: 0.9 - 0.5 * k, to: 1.9 - 0.6 * k,
            color: k > 0.75 ? 0x6fe8ff : 0xff4a3c,
            life: 0.35, opacity: 0.35 + 0.4 * k, y: 0.05,
          });
        }
      }
      if (e.t >= rb.delay) {
        // 站起来：半血、更快
        e.state = 'chase';
        e.t = 0;
        e.hp = Math.max(1, Math.round(e.maxHp * rb.hpRatio));
        e.damage = Math.max(1, Math.round(e.damage * 1.06));
        e.speed *= rb.speedMul;
        e.attackCd = 0.35;
        e.bar.spr.visible = true;
        e.bar.draw(e.hp / e.maxHp, e.hp, e.maxHp);
        e.currentAnim = e.cfg.anim.spawn;
        e.play(e.cfg.anim.spawn, { once: true, fade: 0.1, duration: 0.5 });
        if (fx) {
          fx.ring(e.pos, { from: 0.3, to: 2.1, color: 0x6fe8ff, life: 0.45, opacity: 0.9, y: 0.06 });
          fx.burst(e.pos, { color: 0xbfe8ff, count: 16, speed: 3.0, life: 0.5, size: 0.11, y: 0.4, up: 1.5 });
        }
      }
      return;
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

    // ---- 雾鬼：隐身 / 显形循环（第 35 块；第 61 块改规则）----
    // 隐身时不可被索敌、打不着；**但贴脸不再强制显形**，只能等它自己露头。
    // 材质透明度逐帧过渡，隐身不是「啪一下消失」而是慢慢淡进雾里。
    if (e.cfg.ghost && e.state !== 'dead' && e.state !== 'spawn') {
      const g = e.cfg.ghost;
      e.ghostT -= dt;
      if (e.ghostT <= 0) {
        if (e.ghostHidden) revealGhost(e);
        else hideGhost(e);
      }
      const targetO = e.ghostHidden ? g.ghostOpacity : 1;
      const k = Math.min(1, dt * 7);
      for (const m of e.mats) {
        if (m.transparent) m.opacity += (targetO - m.opacity) * k;
      }
      // 第 65 块：显形时把自发光拉亮（1.0 → 2.2），隐身时压到 0.3。
      // 光靠 opacity 在浓雾里分不清「它出来了」还是「雾动了一下」；
      // 亮度差比透明度差更容易在余光里被抓住。霜牢光环只改 emissive 颜色，
      // 不改 intensity，两边不打架。
      const targetE = e.ghostHidden ? 0.3 : 2.2;
      for (const m of e.mats) {
        if (!m.emissive) continue;
        m.emissiveIntensity += (targetE - m.emissiveIntensity) * Math.min(1, dt * 6);
      }
    }

    // ---- 盾斧兽人：举盾 ↔ 放盾 循环（第 29 块）----
    // 举盾 1.6 秒（减伤 70%、不移动、不打人）↔ 放盾 1.6 秒（正常挨打、追人）。
    // 出手（attack）期间不翻转 —— 打到一半突然举盾会显得很假。
    if (e.cfg.shield) {
      if (e.state !== 'attack') {
        e.shieldT -= dt;
        if (e.shieldT <= 0) {
          e.shieldUp = !e.shieldUp;
          e.shieldT = e.shieldUp ? e.cfg.shield.up : e.cfg.shield.down;
          if (e.shieldMesh) {
            // 第 52 块：只按比例缩放，不写死局部坐标 —— 骨骼世界缩放可能是 47，
            // 旧写法 position.y = 0.17 会让盾牌飞出八个身位（换模型当天就踩了）。
            const sh = e.shieldMesh;
            const k = sh.userData.k || 1;
            sh.scale.setScalar(k * (e.shieldUp ? 1.12 : 1));
          }
          if (fx) {
            fx.ring(e.pos, {
              from: 0.3, to: 1.05, life: 0.28, opacity: 0.5, y: 0.06,
              color: e.shieldUp ? 0x9fd8ff : 0x8a9aa2,
            });
          }
        }
      }
    }

    // ---- 随机休息：走一阵子就站着喘口气（第 6 块）----
    // 作用：一群怪不会再像列队一样踩着同一个节拍压过来。
    // 正在出手（attack）的不歇；歇 0.7~1.5 秒，然后重新走 3~6 秒。
    if (e.state === 'attack' || e.state === 'jump') {
      e.restT = 0;                 // 打人/滞空的时候不算休息
    } else if (e.guard) {
      // 卫队是傀儡：不会喘气、不会走神，只有站位和攻击
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

    // ---- 雾猎狼（第四关，第 35 块）----
    // 四种状态：attack（蓄力，落点红圈钉在玩家**当时**的位置）
    //           → jump（抛物线跳过去，滞空期间不可打断）
    //           → recover（落地僵直，就是输出窗口）→ chase
    // 和骨骑的区别：骨骑冲一条线（侧移躲），雾猎狼跳一个点（必须离开那个点）。
    if (e.cfg.leap) {
      const lp = e.cfg.leap;

      if (e.state === 'attack') {
        // 红圈呼吸：读条越接近尾声，圈越亮越实
        if (e.leapRing && e.leapRing.visible) {
          const k = Math.min(1, e.t / Math.max(0.01, e.cfg.windup));
          const rim = e.leapRing.children[1];
          const disc = e.leapRing.children[0];
          if (rim && rim.material) rim.material.opacity = 0.55 + 0.4 * k;
          if (disc && disc.material) disc.material.opacity = 0.12 + 0.16 * k;
          e.leapRing.scale.setScalar(lp.landRadius * (1.04 - 0.04 * k));
        }
        if (e.t >= e.cfg.windup) {
          e.state = 'jump';
          e.t = 0;
          hideLeapRing(e);
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.06 });
          if (fx) {
            fx.burst(e.pos, { color: lp.color, count: 8, speed: 1.8, life: 0.3, size: 0.1, y: 0.2, up: 1.0 });
          }
        }
        return;
      }

      if (e.state === 'jump') {
        const k = Math.min(1, e.t / lp.jumpTime);
        e.pos.x = e.leapFromX + (e.leapToX - e.leapFromX) * k;
        e.pos.z = e.leapFromZ + (e.leapToZ - e.leapFromZ) * k;
        e.root.position.y = Math.sin(Math.PI * k) * lp.arcH;   // 抛物线：落地时正好 0
        if (k >= 1) {
          e.root.position.y = 0;
          // 落地震荡：整段跳跃只结算一次，圈心不在你脚下就没事
          if (!e.leapHitDone) {
            e.leapHitDone = true;
            const pd = Math.hypot(ctx.playerPos.x - e.pos.x, ctx.playerPos.z - e.pos.z);
            if (pd <= lp.landRadius + ctx.playerRadius) ctx.hurtPlayer(e.damage, e);
          }
          if (fx) {
            fx.ring(e.pos, { from: 0.3, to: lp.landRadius, color: lp.color, life: 0.3, opacity: 0.7, y: 0.06 });
            fx.burst(e.pos, { color: 0xcfae7a, count: 16, speed: 3.2, life: 0.45, size: 0.14, y: 0.15, up: 1.2 });
          }
          e.state = 'recover';
          e.t = 0;
          e.currentAnim = e.cfg.anim.idle;
          e.play(e.cfg.anim.idle, { fade: 0.18 });
        }
        return;
      }

      if (e.state === 'recover') {
        if (e.currentAnim !== e.cfg.anim.idle) {
          e.currentAnim = e.cfg.anim.idle;
          e.play(e.cfg.anim.idle, { fade: 0.18 });
        }
        if (e.t >= lp.recover) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = Math.max(0.6, e.cfg.attackInterval - lp.recover);
        }
        return;
      }

      // chase：进了起跳距离就锁点，否则慢慢逼近
      e.attackCd -= dt;
      if (dist <= e.cfg.attackRange && e.attackCd <= 0) {
        e.state = 'attack';
        e.t = 0;
        e.leapHitDone = false;
        e.leapFromX = e.pos.x;
        e.leapFromZ = e.pos.z;
        // 落点 = 玩家**此刻**的位置（不追人）；夹在场地边界内，别跳到界外
        const lim = Math.max(0, ctx.arenaRadius - e.cfg.radius - 0.3);
        let tx = ctx.playerPos.x;
        let tz = ctx.playerPos.z;
        const tr = Math.hypot(tx, tz);
        if (tr > lim && tr > 0.001) { tx = (tx / tr) * lim; tz = (tz / tr) * lim; }
        e.leapToX = tx;
        e.leapToZ = tz;
        e.currentAnim = e.cfg.anim.attack;
        e.play(e.cfg.anim.attack, { once: true, fade: 0.08, duration: e.cfg.windup });
        showLeapRing(e, ctx);
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

    // ---- 冲锋蛮牛（第三关，第 29 块）----
    // 三种状态：attack（蓄力，地上画直线）→ dash（直线推进，撞人一次）→ recover（僵直）。
    // 侧移就能躲开：方向在蓄力开始那一刻锁定，冲到一半不会拐弯。
    if (e.cfg.charge) {
      const ch = e.cfg.charge;

      if (e.state === 'attack') {
        // 预警线跟着呼吸，读条越接近尾声越亮
        if (e.chargeLine) {
          const k = Math.min(1, e.t / Math.max(0.01, e.cfg.windup));
          e.chargeLine.material.opacity = 0.22 + 0.26 * k;
        }
        if (!e.chargeDone && e.t >= e.cfg.windup) {
          e.chargeDone = true;
          e.state = 'dash';
          e.t = 0;
          hideChargeLine(e);
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.06 });
          if (fx) fx.ring(e.pos, { from: 0.2, to: ch.lineW, color: ch.color, life: 0.2, opacity: 0.6, y: 0.06 });
        }
        return;
      }

      if (e.state === 'dash') {
        const step = ch.dashSpeed * dt;
        e.pos.x += e.chargeDirX * step;
        e.pos.z += e.chargeDirZ * step;
        // 撞墙就停（场地边界）
        const lim = ctx.arenaRadius - e.cfg.radius;
        const rr = Math.hypot(e.pos.x, e.pos.z);
        let stop = rr > lim;
        if (stop) {
          e.pos.x = (e.pos.x / rr) * lim;
          e.pos.z = (e.pos.z / rr) * lim;
        }
        // 撞人：整段冲刺只结算一次
        if (!e.chargeHitDone) {
          const pd = Math.hypot(ctx.playerPos.x - e.pos.x, ctx.playerPos.z - e.pos.z);
          if (pd <= ch.hitRadius + ctx.playerRadius) {
            e.chargeHitDone = true;
            ctx.hurtPlayer(e.damage, e);
            if (fx) {
              fx.burst(e.pos, { color: ch.color, count: 16, speed: 4.4, life: 0.45, size: 0.16, y: 0.8, up: 1.8 });
            }
          }
        }
        if (e.chargeHitDone) stop = true;
        if (stop || e.t >= ch.dashTime) {
          e.state = 'recover';
          e.t = 0;
          e.currentAnim = e.cfg.anim.idle;
          e.play(e.cfg.anim.idle, { fade: 0.18 });
        }
        return;
      }

      if (e.state === 'recover') {
        if (e.currentAnim !== e.cfg.anim.idle) {
          e.currentAnim = e.cfg.anim.idle;
          e.play(e.cfg.anim.idle, { fade: 0.18 });
        }
        if (e.t >= ch.recover) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = Math.max(0.4, e.cfg.attackInterval - ch.recover);
        }
        return;
      }

      // chase：进起手距离就蓄力，否则慢慢逼近
      e.attackCd -= dt;
      if (dist <= e.cfg.attackRange && e.attackCd <= 0) {
        e.state = 'attack';
        e.t = 0;
        e.chargeDone = false;
        e.chargeHitDone = false;
        if (dist > 0.001) {
          e.chargeDirX = dx / dist;
          e.chargeDirZ = dz / dist;
        } else {
          e.chargeDirX = 0; e.chargeDirZ = 1;
        }
        e.currentAnim = e.cfg.anim.attack;
        e.play(e.cfg.anim.attack, { once: true, fade: 0.08, duration: e.cfg.windup });
        showChargeLine(e);
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

    // ---- 擦名者（第五关，第 63 块）----
    // 三段状态，比别的怪都简单，但压迫感来自「它在偷东西」而不是「它在打我」：
    //   chase  保持 6 格距离绕着你走，冷却好了开始读条
    //   attack 读条 2.6 秒（脚下一圈紫黑环）→ 到点把你环上一把剑擦掉
    //   flee   得手后径向朝场地外跑；跑出去了那把剑这一局就没了
    // 它一次都不伤人 —— 它的伤害记在你那本账上。
    if (e.cfg.erase) {
      const er = e.cfg.erase;

      // ---------- 逃跑 ----------
      if (e.state === 'flee') {
        const ang = Math.atan2(e.pos.z, e.pos.x);   // 径向朝外，最短路线出界
        const sp = e.speed * er.fleeSpeed;
        e.pos.x += Math.cos(ang) * sp * dt;
        e.pos.z += Math.sin(ang) * sp * dt;
        e.fleeT += dt;
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.12 });
        }
        // 尾迹：紫黑色的「纸屑」一路掉，玩家隔半个场地也能看见它往哪跑
        e.paperFxT = (e.paperFxT || 0) - dt;
        if (e.paperFxT <= 0) {
          e.paperFxT = 0.16;
          if (fx) fx.burst(e.pos, { color: 0x9a7ad0, count: 3, speed: 0.7, life: 0.5, size: 0.07, y: 0.5, up: 0.8 });
        }
        if (Math.hypot(e.pos.x, e.pos.z) >= ctx.arenaRadius + 0.8) {
          // 跑出场地：剑永久丢失。不算击杀，所以没有 onDeath（不掉钱、不计图鉴）。
          ctx.onEraseEscape?.(e, e.stolen);
          e.stolen = null;
          e.root.visible = false;
          e.bar.spr.visible = false;
          if (e.ring) { try { e.ring.dispose(); } catch (_) {} e.ring = null; }
          e.state = 'dead';
          e.deathT = e.cfg.deathTime;   // 下一帧回收循环直接收走
        }
        return;
      }

      // ---------- 读条 ----------
      if (e.state === 'attack') {
        e.paperFxT = (e.paperFxT || 0) - dt;
        if (e.paperFxT <= 0) {
          // 越接近读完越密：2.6 秒里从 0.5 秒一粒加到 0.12 秒一粒
          const k = Math.min(1, e.t / Math.max(0.01, e.cfg.windup));
          e.paperFxT = 0.5 - 0.38 * k;
          if (fx) fx.burst(e.pos, { color: 0xb59ce8, count: 2, speed: 0.6, life: 0.55, size: 0.06, y: 0.9, up: 0.5 });
        }
        if (!e.hitDone && e.t >= e.cfg.windup) {
          e.hitDone = true;
          const kind = ctx.stealSword ? ctx.stealSword() : null;
          if (kind) {
            e.stolen = kind;
            e.state = 'flee';
            e.t = 0;
            e.fleeT = 0;
            if (fx) {
              fx.ring(e.pos, { from: 0.2, to: 2.2, color: 0x8a5cff, life: 0.5, opacity: 0.85, y: 0.06 });
              fx.burst(e.pos, { color: 0xd8c8ff, count: 18, speed: 2.4, life: 0.6, size: 0.12, y: 0.8, up: 1.4 });
            }
            ctx.onErase?.(e, kind);
          } else {
            // 环上一把剑都没有（还没拿到武器 / 已经被擦光）：这次白读
            if (fx) fx.ring(e.pos, { from: 0.2, to: 1.2, color: 0x5a4a6a, life: 0.4, opacity: 0.5, y: 0.06 });
          }
        }
        if (e.t >= e.cfg.attackDuration) {
          e.state = 'chase';
          e.t = 0;
          e.attackCd = Math.max(0.5, e.cfg.attackInterval - e.cfg.attackDuration);
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.18 });
        }
        return;
      }

      // ---------- 追 / 退 ----------
      e.attackCd -= dt;
      const keep = e.cfg.keepDistance;
      if (dist < keep) {
        moveToward(e, -dx, -dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }
      if (dist > e.cfg.attackRange) {
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
        e.paperFxT = 0;
        e.currentAnim = e.cfg.anim.cast;
        e.play(e.cfg.anim.cast, { once: true, fade: 0.15, duration: e.cfg.windup });
        // 前摇：脚下一圈紫黑环从里扩到 2.4 格 —— 看到就开始冲过去
        if (fx) fx.ring(e.pos, { from: 0.25, to: 2.4, color: 0x8a5cff, life: e.cfg.windup, opacity: 0.55, y: 0.055 });
        return;
      }
      if (e.currentAnim !== e.cfg.anim.idle) {
        e.currentAnim = e.cfg.anim.idle;
        e.play(e.cfg.anim.idle, { fade: 0.2 });
      }
      return;
    }

    // ---- 巫师（第二关）：三人共用一套「保持距离 + 读条」的骨架 ----
    // 区别只在 cfg.spell 的 kind，以及有没有 cfg.aura：
    //   hexer / pyro   有 spell → 站到射程里读条放法术
    //   hierarch       霜牢环跟随主角 + 定时召卫队 + 石刺（第 28 块起它是主动怪）
    if (e.cfg.spell || e.cfg.aura) {
      // 主祭的召唤计时：到点在身边召出 4 名霜牢卫队（第 28 块）。
      // 已有的卫队不叠加 —— 先数一圈，缺几个补几个。
      if (e.cfg.summon) {
        e.summonCd = (e.summonCd == null) ? e.cfg.summon.first : e.summonCd - dt;
        if (e.summonCd <= 0 && e.state !== 'attack') {
          e.summonCd = e.cfg.summon.every;
          const alive = list.filter((g) => g.guard && g.guard.master === e && g.state !== 'dead').length;
          for (let i = alive; i < e.cfg.summon.count; i++) {
            const a = (i / e.cfg.summon.count) * Math.PI * 2 + Math.random() * 0.6;
            spawn(e.cfg.summon.kind, {
              x: e.pos.x + Math.cos(a) * e.cfg.summon.orbit,
              z: e.pos.z + Math.sin(a) * e.cfg.summon.orbit,
            }, {
              guard: { master: e, angle: a, radius: e.cfg.summon.orbit },
              hpScale: (e.summonScale && e.summonScale.hp) ?? 1,
              damageScale: (e.summonScale && e.summonScale.dmg) ?? 1,
              scale: e.cfg.summon.scale ?? 1,   // 第 53 块：卫队 0.7 倍，衬出菌王的块头
            });
            if (fx) fx.spawnRing(e.pos, 0x9ee8ff);
          }
        }
      }

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

      if (e.cfg.spell) e.attackCd -= dt;   // 冷却在站定时走
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

      // 没写 spell 的 aura 怪兜底：站定（现在 hierarch 有 spell，走不到这里）
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
      // 盾斧兽人举盾时原地不动、也不打人（第 29 块）—— 这是玩家的输出窗口，
      // 盾一举起来就打它只是浪费输出（减伤 70%）。
      if (e.cfg.shield && e.shieldUp && e.state !== 'attack') {
        if (e.currentAnim !== e.cfg.anim.idle) {
          e.currentAnim = e.cfg.anim.idle;
          e.play(e.cfg.anim.idle, { fade: 0.2 });
        }
        return;
      }
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
        // 第 61 块（用户定案）：**隐身也能打人**。原来一出手就强制露脸，
        // 等于「隐身只敢不打」，把它的威胁削掉了。现在它藏在雾里咬人，
        // 只有脚下那圈前摇红环会透出来一点，躲不躲看反应。
        e.state = 'attack';
        e.t = 0;
        e.hitDone = false;
        e.currentAnim = e.cfg.anim.attack;
        e.play(e.cfg.anim.attack, { once: true, fade: 0.08, duration: e.cfg.attackDuration });
        // 前摇提示：红色圆环从脚下扩到攻击范围，看到就该躲
        if (fx) fx.ring(e.pos, { from: 0.25, to: e.cfg.attackRange, color: 0xff6a52, life: e.cfg.windup, opacity: 0.35, y: 0.055 });
        return;
      }

      // 卫队不追人：站错位也只是绕着主祭转，玩家主动凑上来才挨打
      if (!e.guard && dist > e.cfg.attackRange) {
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
  // 霜牢环：每帧先收一遍所有存活主祭，再给每只怪算「站没站在谁的环里」。
  // 第 28 块：环以**主角脚下**为中心（followPlayer），跟着人走 —— 玩家拖着一群
  // 怪走进环里，环里的就变凶；把怪引出环，它们立刻恢复普通数值。
  // 巫师不吃环（包括主祭自己）：几个法爷互相叠 buff 会滚雪球。
  function collectAuras(ctx) {
    const sources = [];
    for (const e of list) {
      if (e.cfg.aura && e.state !== 'dead' && e.state !== 'spawn') sources.push(e);
    }
    for (const e of list) {
      // 巫师不吃霜牢环（包括环源自己）
      if (e.cfg.aura || e.cfg.spell || !sources.length) { e.auraHaste = 0; e.auraArmor = 0; continue; }
      let haste = 0, armor = 0;
      for (const s of sources) {
        const cx = s.cfg.aura.followPlayer ? ctx.playerPos.x : s.pos.x;
        const cz = s.cfg.aura.followPlayer ? ctx.playerPos.z : s.pos.z;
        if (Math.hypot(e.pos.x - cx, e.pos.z - cz) <= s.cfg.aura.radius) {
          haste = Math.max(haste, s.cfg.aura.haste);
          armor = Math.max(armor, s.cfg.aura.armor);
        }
      }
      e.auraHaste = haste;
      e.auraArmor = armor;
    }
  }

  function update(dt, ctx) {
    collectAuras(ctx);
    for (const e of list) updateOne(e, dt, ctx);
    updateMendFx(dt);
    updateShots(dt, ctx);
    updateZones(dt, ctx);
    updateArrows(dt, ctx);
    updateSpikes(dt, ctx);

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
      disposeChargeLine(e);
      disposeLeapRing(e);
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

  // 冰冻（第 56 块，冰剑重做）：直接把怪定住 time 秒 —— 不能移动也不能攻击。
  // 与冰缓是两套东西：冰缓只是砍移速（上限 90%），冰冻是 100% 定身，
  // 投手的骨刀、战士的贴脸、骨骑的冲锋全都得停。时长取更强的（后命中刷新）。
  function applyFreeze(e, { time }) {
    if (!e || e.state === 'dead' || e.state === 'spawn') return;
    e.freezeT = Math.max(e.freezeT, time);
    e.freezeFxT = 0.2;
    // 冰冻指示：比冰缓更亮一圈，一眼看出「这只动不了了」
    if (fx) fx.ring(e.pos, { from: 0.25, to: 1.0, color: 0x9fdcff, life: 0.4, opacity: 0.65, y: 0.05 });
  }

  // 连锁闪电的目标：e 之外最近的 count 只活怪（距离 ≤ maxDist）
  function chainTargets(e, count, maxDist = 4.5) {
    const out = [];
    for (const o of list) {
      if (o === e || o.state === 'dead' || o.state === 'spawn' || o.ghostHidden) continue;
      const d = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z);
      if (d <= maxDist) out.push({ e: o, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, Math.max(0, Math.round(count))).map((x) => x.e);
  }

  // ---------------- 击退 / 打断（第 29 块：震钟法器、震剑） ----------------
  // 击退：沿「远离来源」的方向推 dist 格，撞到场地边界就贴着边界停。
  // 只推位置、不改状态 —— 被推开的小兵会自己再走回来（这就是它的价值：
  // 把贴脸的怪从身上扒开，抢一口输出的空间）。
  function knockback(e, fromX, fromZ, dist) {
    if (!e || e.state === 'dead' || e.state === 'spawn') return;
    let dx = e.pos.x - fromX;
    let dz = e.pos.z - fromZ;
    let d = Math.hypot(dx, dz);
    if (d < 0.001) { dx = 0; dz = 1; d = 1; }
    e.pos.x += (dx / d) * dist;
    e.pos.z += (dz / d) * dist;
    const lim = arenaR - e.cfg.radius;
    const r = Math.hypot(e.pos.x, e.pos.z);
    if (r > lim) {
      e.pos.x = (e.pos.x / r) * lim;
      e.pos.z = (e.pos.z / r) * lim;
    }
    // 站得太近的判定体：推开后立刻更新血条/环的位置（下一帧也会跟上）
    if (e.chargeLine) hideChargeLine(e);
  }

  // 打断：读条 / 蓄力 / 冲锋全部退回追击状态，并给一段起手惩罚。
  // 返回是否真的打断了一件事（震钟拿它决定要不要响音效）。
  function interrupt(e) {
    if (!e || e.state === 'dead' || e.state === 'spawn') return false;
    if (e.state !== 'attack' && e.state !== 'dash') return false;
    hideChargeLine(e);
    e.state = 'chase';
    e.t = 0;
    e.hitDone = true;          // 别让「同一次施法」在退回追击时又结算一次
    e.chargeDone = true;
    e.attackCd = Math.max(e.attackCd, 0.9);
    e.currentAnim = e.cfg.anim.idle;
    e.play(e.cfg.anim.idle, { fade: 0.16 });
    if (fx) fx.ring(e.pos, { from: 0.2, to: 1.1, color: 0xa8f0ff, life: 0.3, opacity: 0.6, y: 0.06 });
    return true;
  }

  function aliveCount() {
    let n = 0;
    for (const e of list) if (e.state !== 'dead') n++;
    return n;
  }

  // 一键清场（第 30 块，管理员模式跳回合用）：
  // 和被打死不一样 —— 不掉金币、不算击杀、不进图鉴、不触发成就，
  // 直接把死亡计时推满，下一帧的回收循环就把它们连模型一起清掉。
  function killAll() {
    let n = 0;
    for (const e of list) {
      if (e.state === 'dead') continue;
      e.state = 'dead';
      e.hp = 0;
      e.t = 0;
      e.deathT = e.cfg.deathTime;     // 已经「烂完」，回收循环立刻收走
      e.bar.spr.visible = false;
      if (e.auraRing && e.cfg.aura && e.cfg.aura.followPlayer) e.auraRing.mesh.visible = false;
      hideChargeLine(e);
      e.root.visible = false;
      n++;
    }
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
      disposeChargeLine(e);
      disposeLeapRing(e);
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
    spikesQ.length = 0;
    for (const s of spikesFx) scene.remove(s.mesh);
    spikesFx.length = 0;
    pendingHits.length = 0;
  }

  // 战士/投手的攻击时长：没单独写就默认 0.9 秒（动画按比例加速/减速），
  // 写了就以配置为准（投手 0.85）—— 前摇 windup 必须小于它。
  for (const t of Object.values(ENEMY_TYPES)) {
    if (t.attackRange != null && t.windup != null && t.attackDuration == null) t.attackDuration = 0.9;
  }

  return {
    preload, spawn, update, reset,
    setArenaRadius: (r) => { arenaR = r; return arenaR; },   // 换关时同步可走半径（第 33 块）
    list,
    aliveCount,
    takeDamage,
    applyDot, applySlow, applyFreeze, chainTargets,
    shotCount: () => shots.length,
    zoneCount: () => zones.length,      // 场上正在倒计时的圈（三种法术都算）
    arrowCount: () => arrows.length,    // 正在下落/插在地上的箭
    spikeCount: () => spikesQ.length + spikesFx.length,   // 石刺（待爆+视觉，测试用）
    guardCount: () => list.filter((e) => e.guard && e.state !== 'dead').length,
    pendingCount: () => pendingHits.length,
    // 巫师/法术的观测口（测试与 ?debug=1 用）
    zones: () => zones.map((v) => ({
      kind: v.kind, phase: v.phase, x: +v.x.toFixed(2), z: +v.z.toFixed(2), r: v.r,
      t: +v.t.toFixed(2), dmg: v.dmg,
    })),
    auraCount: () => list.filter((e) => e.cfg.aura && e.state !== 'dead' && e.state !== 'spawn').length,
    buffedCount: () => list.filter((e) => e.auraHaste > 0).length,
    // 第三关的观测口（第 29 块）
    shieldedCount: () => list.filter((e) => e.shieldUp && e.state !== 'dead').length,
    // 冰冻观测口（第 56 块，冰剑）：场上被冻住的怪数
    frozenCount: () => list.filter((e) => e.freezeT > 0 && e.state !== 'dead').length,
    chargingCount: () => list.filter((e) => e.cfg.charge && (e.state === 'attack' || e.state === 'dash')).length,
    broodlingCount: (parent) => list.filter((e) => e.summonedBy && (!parent || e.summonedBy === parent) && e.state !== 'dead').length,
    // 第四关的观测口（第 35 块）
    wraithCount: () => list.filter((e) => e.cfg.ghost && e.state !== 'dead').length,
    hiddenCount: () => list.filter((e) => e.ghostHidden && e.state !== 'dead').length,
    leaperCount: () => list.filter((e) => e.cfg.leap && e.state !== 'dead').length,
    jumpingCount: () => list.filter((e) => e.cfg.leap && e.state === 'jump').length,
    menderCount: () => list.filter((e) => e.cfg.spell && e.cfg.spell.kind === 'mend' && e.state !== 'dead').length,
    // 第 63 块：
    //   擦名者 —— 场上还有几只（含正在逃跑的）；stolenCount = 一共被偷走几把剑还没还
    eraserCount: () => list.filter((e) => e.cfg.erase && e.state !== 'dead').length,
    //   擦名者读条进度（第 65 块）：给「奶蛙头顶百分比」用。
    //   返回 null = 现在没有人在读条；否则 { progress 0~1, who }。
    //   多只同时读条取进度最高的那只 —— 最危险的那一只才该占着头顶。
    eraseCast: () => {
      let best = 0, who = null;
      for (const e of list) {
        if (!e.cfg.erase || e.state !== 'attack') continue;
        const p = Math.max(0, Math.min(1, e.t / Math.max(0.01, e.cfg.windup)));
        if (p >= best) { best = p; who = e; }
      }
      return who ? { progress: best, who } : null;
    },
    fleeingCount: () => list.filter((e) => e.state === 'flee').length,
    stolenCount: () => list.filter((e) => e.stolen).length,
    //   重启体 —— 正躺在地上等重启的数量（>0 时这一波清不掉）
    downCount: () => list.filter((e) => e.state === 'down').length,
    rebootCount: () => list.filter((e) => e.cfg.reboot && e.state !== 'dead').length,
    //   反隐（第 63 块，路口灯）：强行把一圈里的隐身雾鬼点亮，返回点亮了几只
    revealInRadius: (at, radius) => {
      let n = 0;
      for (const e of list) {
        if (!e.ghostHidden || e.state === 'dead') continue;
        if (distance2D(at, e.pos) > radius) continue;
        revealGhost(e);
        n++;
      }
      return n;
    },
    knockback, interrupt, killAll,
    get: (type) => ENEMY_TYPES[type],
    // 调试/测试用
    all: () => list,
    _dbgCtx: _ctxTmp,
  };
}
