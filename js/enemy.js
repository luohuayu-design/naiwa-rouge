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
import * as THREE from '../lib/three.module.js?v=120';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=120';
import { clone as cloneSkinned } from '../lib/jsm/utils/SkeletonUtils.js?v=120';
import { distance2D } from './stats.js?v=120';
import { createRangeRing } from './rangeRing.js?v=120';
import { withV } from './assetUrl.js?v=120';

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
//   鱼形   Swimming_Normal / Swimming_Fast / Swimming_Impulse / Attack / Death / Out_Of_Water（第 77 块）
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
  // 第 77 块：Quaternius 的鱼（木鱼灵）。只有 6 段，全是「游」相关，
  // 没有站立/走路的概念 —— 所以 walk 也映射成游泳，cast 借 Attack（一个前冲咬）。
  fish: {
    idle: 'Swimming_Normal', walk: 'Swimming_Normal', run: 'Swimming_Fast',
    attack: 'Attack', cast: 'Attack', death: 'Death',
    hit: 'Swimming_Impulse', spawn: 'Swimming_Normal',
  },
  // 第 83 块：Quaternius 的「看守」骨架（EnemyArmature，7 段）。
  // 名字被包了三层前缀 —— `EnemyArmature|EnemyArmature|EnemyArmature|Attack`，
  // resolveClipAliases 取最后一段就对了（和 CharacterArmature 那批同一个写法）。
  // cast 借 Jump：它「起手」= 抬脚预备，砸下来那一下正好接 Attack。
  brute: {
    idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Attack', cast: 'Jump',
    death: 'Death', hit: 'HitRecieve', spawn: 'Idle',
  },
  // 第 97 块：Quaternius 的「国王」骨架（24 段，CharacterArmature 那批前缀）。
  // 它没有 Punch / Weapon 这些通用名，得单开一族：
  //   attack 借 Sword_Slash（挥袖那一下正好当近身拍打）
  //   cast   借 Interact（抬手翻看手里的东西 —— 称量官「翻开簿子」就是它）
  royal: {
    idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Sword_Slash', cast: 'Interact',
    death: 'Death', hit: 'HitRecieve', spawn: 'Idle',
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
  // 它**一次都不伤人**，它的威胁在别的地方：读条 4.5 秒后，把你环上的
  // **一把剑擦掉**（挂在它自己身上），愣一下才转身往场地外跑 ——
  // 它跑出去了，那把剑这一局就永远没了。
  // 所以玩家面对的是一道选择题：先杀眼前的怪，还是先追那个偷东西的。
  //
  // 第 69 块（用户实测：「玩家还没找到擦名者就被偷了」）三条改动：
  //   ① 起手距离 9.0 → **7.0 格**（保持距离 6.0 → 5.0）—— 它在离你比较近的
  //      地方才开始读条，屏幕上一定看得见那一圈紫黑环，不会「没找到就被偷」；
  //   ② 读条 2.6 → **4.5 秒**（attackDuration 3.4 → 5.4，必须大于 windup，
  //      否则 `e.t >= attackDuration` 会先把它切回 chase，读条永远读不完）；
  //   ③ 移速 1.15 → **0.55**（约玩家 4.4 的 1/8，追得上）。逃跑速度按倍率补回来
  //      （fleeSpeed 1.85 → 3.9，绝对速度仍是 ~2.15），「偷到就跑」的压迫感不变。
  //
  // 反制手段（都能打断它的算盘）：
  //   冰剑冻住 → 它跑不动，站着等你来砍
  //   震剑击退 → 推一下打断读条，这次擦名白读
  //   任何位移类效果都行 —— 它只有 5 点血，冲过去两下就死
  //
  // 模型：KayKit《Character Pack: Adventurers》的 Rogue_Hooded（CC0），
  // 76 段动画裁到 5 段（见 .tmp-shrink-glb.py），3.6MB → 532KB。
  // 第 75 块（用户实测：「生成靠后，最后只剩它」「它应该自主向主角移动」）：
  //   原来 speed 0.55 是玩家（4.4）的 1/8 —— 从 18 格外的场边走 7 格要 12 秒，
  //   等它磨蹭到玩家身边，别的怪都死光了，观感就是「最后只剩一个慢吞吞的」。
  //   现在 speed 1.35（玩家的三成）：看得见它在走、也追得上，但它依旧杀不了人。
  //   keepDistance 3.0 → 4.2：它会**主动靠到 4 格左右**缠着你，而不是在 7 格外
  //   站着不动（chase 的靠近条件也改了，见 updateOne 的擦名者分支）。
  //   fleeSpeed 按绝对速度折算：0.55×3.9 ≈ 2.15 → 1.35×1.6 ≈ 2.16，逃跑手感不变。
  eraser: {
    name: '擦名者',
    file: 'assets/monsters/hooded-scribe.glb',
    sourceHeight: 2.652,   // 实测（Idle 渲染身高，.tmp-block63-calib.js）
    height: 1.95,          // 比战士高半头：兜帽长袍本来就显个儿
    radius: 0.55,
    hp: 5,
    armor: 0,
    speed: 1.35,           // 第 75 块：0.55 → 1.35（能看见它在向主角移动）
    // 故意不写 damage：它从不还手（图鉴会显示「从不还手」）。它靠偷东西吃饭。
    attackRange: 7.0,      // 第 69 块：9.0 → 7.0（起手距离上限）
    // 第 69 块：6.0 → 5.0 → 3.0。第 75 块：3.0 → 4.2（主动靠到你身边来缠）
    keepDistance: 4.2,
    attackInterval: 8.5,
    windup: 4.5,           // 第 69 块：2.6 → 4.5 秒，冲过去完全来得及
    attackDuration: 5.4,   // 必须 > windup，否则读条中被提前切回 chase
    castTime: 1.0,
    // 只为了让 update 走「施法者」那条骨架（保持距离 + 读条），
    // 真正的效果在下面的 e.cfg.erase 分支里，spawnSpell 不会收到这个 kind。
    spell: { kind: 'erase' },
    erase: {
      fleeSpeed: 1.6,      // 第 75 块：按新移速折算，绝对速度仍是 ~2.16（和原来一样快）
      holdAfterSteal: 1.4, // 第 69 块（用户）：擦完名字先愣 1.4 秒才开跑，给你追上来的窗口
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
      times: 1,            // 第 75 块（用户）：2 → 1。最多重启 1 次，第 2 次真死
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

  // ============================================================
  // 第六关 · 骨塔机房（第 75 块 / 第 80 块重做）—— 并联体
  // ============================================================
  // 机房里两台并在一起供电的旧发电机。夜行把它叫醒之后，它**离地浮起来**，
  // 和同伙之间拉出一条青白色的电弧 —— 人从线上过，就是一次电击。
  //
  // 【机制·一句话】场上**只要有 2 只或以上**，每两只之间就连一条悬空电弧，
  // 不设距离上限、也不要求成对（3 只 = 3 条，4 只 = 6 条，n 只 = C(n,2) 条）。
  // 所以它不是「一个敌人」，而是「一片会移动的禁区」：场上每多一只，
  // 可站的空地就少几条缝。解法只有一个 —— 把并联体本身拆掉，它牵的线整片跟着断。
  //
  // 【间距】它们之间会被一股「同性相斥」的力推开，**两两实时距离不小于
  // minGap**（第 80 块 3.0 格 → 第 82 块 8.0 格）。
  // 第 82 块用户原话：「两个电箱之间距离还是太近，要求两两之间距离足够大
  // （说的是实时距离，不是生成距离）」—— 3.0 之所以看着还是近，不是配置小，
  // 是**软推**：每帧只补 15% 的差额，而追击每帧把两只压近 0.05+ 格，
  // 稳态距离实际落在 2.6~2.7。现在改成硬约束（见 separateArcs）+ 8.0 格，
  // 一条电弧横跨小半个场地，缝够宽、线够长，禁区才像「网」而不是「点」。
  //
  // 它自己也会近战（蹭到就电一下），但那不是重点；重点是那张网。
  // 生命值（第 82 块用户要求「大幅提高」）：3.2 → 12（约 3.8 倍）。
  // 禁区必须「拆得起但拆得慢」—— 一刀就断的话，网等于不存在。
  //
  // 模型：Kenney《Space Kit》的 machine_generator（CC0，28KB）——
  // 静态网格、没有骨骼动画，所以不写 animFamily（resolveClipAliases 会安全地返回空表）。
  // 「活着」的感觉靠程序化悬停 + 轻微机械摆动 + 电弧抖动（见 updateOne 的 arc 分支）。
  // ⚠️ 第 80 块删掉了**整圈自转**：root 在朝玩家平滑转、model 又在自己转，
  // 两层叠加看起来「线在稳稳走、铁疙瘩在原地乱转」—— 玩家会以为是两个东西。
  arc: {
    name: '并联体',
    file: 'assets/monsters/parallel-cell.glb',
    sourceHeight: 0.40,    // 实测包围盒最高点（Kenney 的 1 单位 ≈ 1 格）
    height: 1.30,          // 放大到近人高：一块浮在半空的铁疙瘩
    radius: 0.55,
    hp: 8,                 // 第 82 块：3.2 → 12（用户「大幅提高」）；第 95 块 12 → 8
    //                        （用户「现在太高了，适当降低」）。8 仍是全关第二厚，
    //                         拆一只 ≈ 四秒：禁区拆得起但拆得慢，网才有意义。
    armor: 0,
    speed: 1.75,
    damage: 0.9,
    attackRange: 1.6,
    attackInterval: 1.7,
    windup: 0.40,
    attackDuration: 0.80,
    hover: 0.55,           // 离地高度（悬浮）
    sway: 0.16,            // 左右机械摆动幅度（弧度）；不是自转，见 updateOne
    previewHover: false,   // 图鉴里不抬 hover（原点在底部，抬了构图会散）
    arc: {
      color: 0x3fc4ff,     // 青蓝电弧（原来是 0x7ad8ff，additive 叠加后直接过曝成白色）
      // 第 80 块实机调参（截图对比出来的）：
      //   0.075 宽 + 0.18 抖动 + 6 段 → 两格长的线上全是碎方块，远看像「虚线」；
      //   加宽到 0.11、抖到 0.10、段数降到 5，线才连成一条会扭的电流。
      width: 0.145,        // 基准粗细（每帧再抖）
      hitR: 0.42,          // 判定半径（再加主角自己的半径）
      damage: 1,
      cd: 0.70,            // 全局节流：同一刻只吃一次
      minGap: 16.0,        // 两两**实时**最小间距（格）—— 小于它立刻被推到 16.0
      // 第 82 块：分离改成硬约束之后，这个值就是真实距离，不再是「软推的期望值」。
      // 16.0 格 ≈ 场地直径（38）的 42%：一条电弧横跨大半个机房（用户要求放大到 2 倍）。
      // 注意：场地上最多 4 只并联体，半径 19 的场地里彼此 ≥16 格仍可容下。
      segs: 4,             // 一条电弧折成几段（锯齿感）
      jitter: 0.10,        // 折线横向抖动幅度（格）
      dots: 2,             // 沿线流动的光点数（电流在流的感觉全靠它）
      // 线的离地高度 = hover + height × 这个比例。
      // 第 80 块：0.55（模型半腰）从俯视角会被 1.3 格高的铁疙瘩挡住靠近它的那半截，
      // 只看得见中间一小段 —— 抬到 0.95（贴着模型顶部）才整条可见，
      // 而且端点落在模型上边缘，正好读成「从顶部电极吐出来的」。
      yFrac: 1.02,
    },
    spawnTime: 0.8,
    deathTime: 1.2,
    selfDestruct: false,
    color: 0x7ad8ff,
    tint: 0x5aa8d0,        // 压一层冷青：和机房的蓝绿微光同调
    glow: { color: 0x2a8ac8, intensity: 0.9 },
    anim: { walk: 'walk', idle: 'idle', attack: 'attack', death: 'death', spawn: 'spawn' },
  },

  // ============================================================
  // 第七关 · 骨塔井底（第 71 块）—— 井蛙
  // ============================================================
  // 模型（第 77 块换真模型）：Quaternius《Animated Easy Enemies》的 Frog，CC0 1.0，
  // 经 poly.pizza 下载（https://poly.pizza/m/37wofOCOzG）。
  // 骨架是 KayKit 同款 CharacterArmature，14 段动画（Idle/Walk/Run/Punch/Jump/Death/HitReact…），
  // 所以直接用人形族；吐舌借用 Punch（伸胳膊那一下正好当「弹舌头」）。
  // 身世：直立的蛙人，不是四足趴地的 —— 刚好配它「站桩吐舌」的定位。
  // 行为：站桩「吐舌头」—— 瞬向主角位置吐舌、把主角往自己方向拉，舌头有独立血量，
  // 需砍断（舌头伸出期间对井蛙的挥击先扣舌头血量，逻辑见 updateOne 的 handleTongue）。
  wellfrog: {
    name: '井蛙',
    file: 'assets/monsters/frog.glb',
    sourceHeight: 2.50,    // 第 77 块实测（正交相机读像素：2.500，和 fox/tribal 同口径）
    footY: -0.078,         // 实测身体最低点在原点下 0.078，抬回来才真正踩地
    height: 1.70,
    radius: 0.55,
    hp: 8,                 // 第 82 块：5 → 8（用户「井蛙血再厚一点」，但不像并联体那样翻几倍 ——
                           // 它站在场边占桩，本来就该是能抽空点掉的目标）
    armor: 0,
    // 占桩施法：不主动贴脸，保持距离好吐舌
    attackRange: 9.0,       // 舌头的最大够得到距离
    keepDistance: 6.0,      // 比这个近就后退
    attackInterval: 4.5,    // 两次吐舌之间的间隔基准（收回后的冷却见 tongue.recover）
    tongue: {
      hp: 4,                // 舌头的独立血量（需砍断）
      range: 9.0,           // 和 attackRange 一致：够得到才吐
      keepDistance: 6.0,
      pull: 4.5,            // 第 82 块：3.0 → 4.5（用户「提高舌头拖拽强度」）—— 每秒拉 4.5 格
      extend: 1.6,          // 伸出持续 1.6 秒（到点没砍断就收回）
      recover: 2.2,         // 收回（没砍断）后的冷却
      stun: 1.3,            // 被砍断后的硬直（冰冻式定身）
      radius: 0.16,         // 舌头视觉粗细
      color: 0x8fd86a,      // 舌头青绿
    },
    spawnTime: 1.0,
    deathTime: 1.6,
    selfDestruct: false,
    color: 0x4fae6a,        // 蛙身绿（UI/血条/伤害数字用）
    animFamily: 'humanoid',
    glow: { color: 0x1f6a3a, intensity: 0.5 },
    anim: {
      walk: 'walk', idle: 'idle', attack: 'attack',
      death: 'death', spawn: 'spawn',
    },
  },

  // ============================================================
  // 第七关 · 骨塔井底（第 71 块）—— 木鱼灵
  // ============================================================
  // 模型（第 77 块换真模型）：Quaternius《Animated Cute Fish》的河豚，CC0 1.0，
  // 经 poly.pizza 下载（https://poly.pizza/m/UKHtgpxTOk）。
  // 骨架是 Fish_Armature，6 段动画（Swimming_Normal/Fast/Impulse、Attack、Death、Out_Of_Water），
  // 所以单独开一族 fish（见 CLIP_FAMILIES.fish）。
  // ⚠️ 这只模型的原点在身体正中（实测身体 −1.289 ~ +1.367），直接放会有一半埋进地里，
  // 所以不按脚落地，而是靠 hover 抬成「浮空灵体」（见 updateOne 的 hover 分支）。
  // 行为（第 82 块重写）：**吐追踪泡**。
  //   · 一颗实体泡从它嘴里出来，缓慢地追着你跑（2.6 格/秒，你 4.4）；
  //   · 泡有自己的血量（4），打爆就没了 —— 站着不打它，它会一直跟；
  //   · 追上就扣血，并把你**定住 1.2 秒**（连走都走不动，不只是减速）。
  // 它给的压力是「解一个追着你的东西」，而不是「离开一片地」——
  // 和咒面图腾那种「脚下读条圈，走出去就好」完全不是一回事。
  woodfish: {
    name: '木鱼灵',
    file: 'assets/monsters/puffer-fish.glb',
    sourceHeight: 2.656,   // 第 77 块实测（正交相机读像素）
    height: 2.25,          // 河豚圆胖、还有一圈刺，同样身高比人形「显大」，收到 2.25 才不压 UI
    hover: 1.10,           // 浮空高度（配合 updateOne 的呼吸浮动）—— 不写 footY，靠 hover 抬
                           // 缩放 0.847 后身体是 −1.09 ~ +1.16，抬 1.10 正好贴着地面浮起
    radius: 0.60,
    hp: 4,
    armor: 0,
    speed: 1.05,
    attackRange: 8.0,      // 够得到就吐（泡自己会接着追，所以这个距离不是安全线）
    keepDistance: 5.0,
    damage: 1,
    attackInterval: 2.6,   // 第 85 块：3.4 → 2.6（用户「吐气泡的频率上调」）
    windup: 0.7,           // 吸气 —— 看到它鼓起来就是吐泡的前摇
    attackDuration: 1.2,
    bubble: {
      hp: 4,               // 泡的独立血量（打爆就散）
      speed: 2.6,          // 飞行速度：比主角（4.4）慢得多，横向拉开就甩得掉
      turn: 1.2,           // 每秒最多转 1.2 弧度 —— 拐弯很笨，绕圈能把它遛晕
      life: 6.0,           // 最长存活（追不到就自己散）
      r: 0.62,             // 第 85 块：0.42 → 0.62（用户「体积扩大」，看着是一颗真的泡）
      root: 1.2,           // 命中把你定住多久（秒）
      orbitStop: 1.2,      // 第 85 块：命中同时让**环剑停转**这么久（用户要求）
      damage: 1,
      color: 0x57e6d0,     // 青色，和它的自发光同色
      y: 1.00,             // 悬浮高度（正好在奶蛙胸口高度）
      count: 2,            // 第 85 块：一次吐两颗（左右扇形夹过来）
      max: 8,              // 同场同时存在的泡上限 —— 多只木鱼灵也不会糊一屏
    },
    spawnTime: 1.0,
    deathTime: 1.6,
    selfDestruct: false,
    color: 0x57e6d0,
    animFamily: 'fish',
    // 自发光往青色偏：河豚本体是橄榄绿，和井蛙撞色；压一层青才像「灵」
    glow: { color: 0x2ec8b8, intensity: 0.72 },
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },

  // ============================================================
  // 第八关 · 骨塔寄存层（第 83 块）—— 寄存处看守
  // ============================================================
  // 这一关的循环是「杀 → 掉牌 → 柜子满 → 封柜 5 秒 → 看守走出来」。
  // 所以它不是「又一只更硬的骷髅」，而是**一只你本可以不让它出现的东西**：
  // 该做的正事是趁柜子没满去把牌子清掉（四位数字的小游戏），
  // 清不掉，就得跟它打。
  //
  // 【五招各占一个距离带 / 一层玩法】这是「多样」的落点 —— 不是五个换皮技能，
  // 而是五套完全不同的躲法，逼你一直在两种距离之间切换：
  //   ① 横扫（≤3.4 格）  0.55 秒前摇 + 脚下一圈橙光 → 3.6 格内重伤 + 击飞
  //   ② 砸地（3.4~9 格） 在**你现在站的位置**钉三个金圈，1.35 秒后落锤 → 圈里重伤
  //   ③ 投牌（>9 格）    抡起一块木牌砸过来；第 96 块起它会**拐一次弯**追你
  //   ④ 木牌雨（中距）   第 96 块：正面张开 90° 扇面撒一排牌 —— 唯一有方向的招
  //   ⑤ 砸柜（任意距离） 第 96 块：砸开身后的寄存柜，放出小怪
  // 五招都由 handleWarden 自己调度，不走通用近战 AI。
  //
  // 【半血狂暴】hp ≤ 45% 时移速 ×1.4、出手间隔 ×0.72、身上转成暗金自发光 ——
  // 打它打到一半会发现「它变快了」，这一段是给玩家的第二次提醒：
  // 要么现在就解决它，要么先跑开换血。
  //
  // 模型：Quaternius《Ultimate Monsters》的 Skeleton（poly.pizza /m/DM4QScSmbS，
  // **CC0 1.0**，484KB）。方头方脑、奶白骨、钢盔红缨 —— 和 KayKit 那批细长骷髅
  // 一眼能分开，正好当「看柜子的那个」。骨架是 EnemyArmature（新开 brute 族）。
  // 胸口那块大木牌是程序化的（attachTag 的 'board'，尺寸走 cfg.tagBox）。
  warden: {
    name: '寄存处看守',
    file: 'assets/monsters/deposit-warden.glb',
    sourceHeight: 2.99,    // 实测（.tmp-83-calib.js 正交相机读像素：Idle 高 2.988、脚 0.012）
    height: 3.05,          // 全场最高的怪：比战士（1.90）高一截，站在柜门口像一扇门
    radius: 0.80,          // 实测宽 1.90 / 厚 1.68 —— 台子宽，碰撞不能只给 0.7
    hp: 20,                // 第 8~15 回合 ×4~6 倍 ≈ 90~120：拆得掉，但绝对不是一只普通怪
    armor: 0.08,           // 骨甲：硬一点
    speed: 1.02,           // 慢 —— 它的威胁来自五套攻击，不是脚步
    damage: 0.95,          // 基础伤害（各招在上面的倍率里放大）
    attackRange: 12.0,
    attackInterval: 2.4,   // 两次出手之间的间隔（狂暴后 ×0.72）
    windup: 0.55,          // 必须 < attackDuration
    attackDuration: 1.0,
    boss: true,
    // 五招的手感参数全收在一处，改数值只改这里
    warden: {
      sweepR: 3.6,         // 横扫半径
      sweepMul: 1.30,
      slamR: 5.2,          // 砸地单圈半径（三圈扇形铺开）
      slamMul: 1.00,
      slamDelay: 1.35,     // 预警到落锤的时间：够走开一步，不够走两步
      tagMul: 0.80,        // 投牌伤害
      tagSpeed: 7.5,       // 木牌飞行速度（格/秒）
      // 第 96 块：投牌改成**会拐一次的追踪牌**。
      // 只给一次转向预算（tagTurn 弧度）而不是「无限追踪」—— 拐完就拉直，
      // 所以躲法从「横移一步」变成「横移 → 看它拐 → 再横移」。无限追踪会让
      // 玩家只能靠无敌帧/硬吃完，那是猜谜不是走位。
      tagHome: 3.2,        // 最大转向速率（弧度/秒）
      tagTurn: 1.15,       // 总共能拐多少弧度（≈66°），拐完就直飞
      tagLife: 2.8,        // 最久飞多久（防止绕圈到天荒地老）
      tagFuse: 1.25,       // 离主角这么近就引爆
      tagR: 1.9,           // 引爆半径
      // 第 96 块新招①：扇形木牌雨 —— 唯一一招**有方向**的（前四招全是圆形，
      // 躲法永远是「离中心远点」；扇形往后退没用，必须绕到侧面或背后）。
      fanR: 8.6,           // 扇面半径
      fanHalf: Math.PI / 4, // 扇面半角（45° → 正面张开 90°）
      fanMul: 1.05,        // 伤害倍率（介于砸地 1.0 与横扫 1.3 之间）
      fanWindup: 0.95,     // 前摇：看到扇面亮起来还来得及绕
      fanTags: 7,          // 落几块牌（纯视觉，判定是整块扇面一次结算）
      // 第 96 块新招②：砸开寄存柜放小怪 —— 独立冷却，不占常规出手
      cabWindup: 1.20,
      cabCount: 2,         // 一次放出几只
      cabCap: 3,           // 它名下最多同时活几只（滚雪球护栏）
      cabCd: 16.0,         // 用完再过这么久才可能再砸
      cabFirst: 6.0,       // 出场后多久才允许第一次砸柜
      chaseKeep: 2.9,      // 追到这么近就停下准备出手
      gap: 2.0,            // 出手间隔（第 96 块：2.4 → 2.0，用户要「出手更密」）
      rageAt: 0.45,        // 血量低于这个比例进入狂暴
      rageSpeed: 1.40,
      rageGap: 0.72,
      color: 0xffc76a,     // 预警圈 / 落点的统一色（暗金）
    },
    tag: 'board',
    tagBox: [0.70, 0.46, 0.07],
    tagY: 1.30,
    tagZ: 0.52,
    spawnTime: 1.5,
    deathTime: 2.2,
    selfDestruct: false,
    color: 0xf2e6c8,
    glow: { color: 0x6a5a30, intensity: 0.35 },
    animFamily: 'brute',
    anim: {
      walk: 'walk', idle: 'idle', attack: 'attack',
      death: 'death', spawn: 'spawn',
    },
  },

  // ============================================================
  // 第九关 · 骨塔登记庭（第 82 块）—— 称量官
  // ============================================================
  // 剧情接 s09《名字的重量》：第九十九层的门上嵌着一本簿子，门卫 047 说
  // 「到这儿就得上称了，这道门认字」。所以这一层的核心不是某只怪有多凶，
  // 而是**全场一起变凶**：称量官每隔一阵把簿子翻开一次，把那种台的个数叠一层。
  //
  // 【机制·一句话】它自己几乎不打人（它的职责不是输出），活儿是**给全场记账**：
  //   每完成一次「上称」，场上**所有**存活的怪都加一层「记名」——
  //   移速 +7% / 伤害 +9% / 减伤 +5%，最多 5 层。
  // 也就是说：它每活着念一次簿子，整关的难度就往上抬一格；它念到第 5 次，
  // 场上就是一群快三分之一、疼一半还多、还更耐打的骷髅。
  //
  // 【怎么破】只有一条路 —— **把它先拆了**。它一倒，场上所有层立刻掉光
  // （脚下的金环一起碎掉），整关立刻回到原难度。所以它站得很靠后
  // （keepDistance 7.0，比你还快地躲），而且每次上称都要站定 2.2 秒 ——
  // 那 2.2 秒是这一关唯一的输出窗口。
  //
  // 【为什么做「全场」而不是「点一只」】用户定的：「给全场怪物都加 buff，
  // 显示明显特效」。点名只有一只是可以无视的（打别的就行），全场叠层没法绕，
  // 只能把它拆掉 —— 压力直接指到它身上。
  //
  // 模型：**故意复用** `hooded-scribe.glb`（第五关擦名者那只，CC0）——
  // 第八关的无名者/旗手已经开过这个先例（换皮肤 + 换行为 ≠ 换模型），
  // 因为兜帽长袍 + 抱一本台账（程序化 prop，见 attachTag 的 'ledger'）
  // 正好就是「记账的」。它这身鎏金和第五关那身紫黑一眼能分开。
  weigher: {
    name: '称量官',
    // 第 97 块（用户）：**换掉模型** —— 原来复用第五关擦名者的兜帽书记官，
    // 一眼就是同一只怪染了个色。现在换成 Quaternius 的「国王」（CC0）：
    // 戴冠、披袍、瘦高的审判者，站在台阶尽头给名字上秤。
    file: 'assets/monsters/ledger-king.glb',
    sourceHeight: 1.887,   // 实测（Idle 渲染身高，.tmp-97-calib.js）
    footY: 0.0,            // 实测落地面就在原点
    height: 2.15,          // 比擦名者（1.95）高一头：它站在正厅的台阶上，该有个仰望的姿势
    radius: 0.55,
    hp: 12,                // 第 97 块（用户）：16 → 12。它每 9 秒叠一层全场记名，太肉等于机制被拖成磨血
    armor: 0,
    speed: 1.25,           // 比擦名者慢一点点（它也躲，但躲不利索 —— 毕竟抱着一本簿子）
    attackRange: 10.0,     // 够得到就念（它没有近距离的概念，离多远都一样念）
    keepDistance: 7.0,
    damage: 1,             // 它自己几乎不打人：这个值只在贴脸近战的那一下才用
    attackInterval: 9.0,   // 上称节奏：放任四五次，场上就全是强化版的骷髅了
    windup: 1.6,           // 翻开簿子的前摇 —— 这一秒半就是信号
    attackDuration: 2.2,   // 必须 > windup（第 69 块的教训），否则读条中被提前切回 chase
    weigh: {
      cap: 5,              // 最多叠五层
      every: 9.0,
      radius: Infinity,    // 全场：不看距离，场另一头的骷髅也躲不掉
      color: 0xffd86b,
      per: {
        speed: 0.07,       // 每层：移速 +7%
        damage: 0.09,      // 每层：伤害 +9%
        armor: 0.05,       // 每层：减伤 +5%（乘法叠加，见 takeDamage）
      },
    },
    tag: 'ledger',         // 手里的台账（程序化贴图，零资产）
    spawnTime: 1.0,
    deathTime: 1.9,        // 倒得慢一点：这一下值得多看一眼
    selfDestruct: false,
    color: 0xffd86b,       // 鎏金（血条 / 死亡碎屑 / 金环都用它）
    tint: 0xd9c9a0,        // 整体压一层旧金：国王本来的深蓝袍 → 登记庭的制服
    glow: { color: 0x8a6a1e, intensity: 0.85 },
    animFamily: 'royal',
    anim: {
      walk: 'walk', idle: 'idle', cast: 'cast',
      death: 'death', spawn: 'spawn',
    },
  },

  // ============================================================
  // 第九关 · 骨塔登记庭（第 97 块）—— 盖章人
  // ============================================================
  // 【为什么加它】用户：「第九关目前太单调了」。这一关原只有称量官一个机制怪，
  // 其余全是别关的熟脸，而且所有威胁的答案都是同一句「走过去砍了它」。
  // 盖章人是这一关第一个**不靠伤害、靠限制你走位**的怪。
  //
  // 【机制·一句话】它是登记庭里负责「核销」的小吏：抬印 → 在你**当时的脚下**
  // 盖下一枚方印（1.15 秒预警，方框从大收到小）→ 落印时你还站在框里，
  // 就被「封步」3 秒：移速砍一半，人像被钉在案上。
  // 它自己不疼（伤害只有 0.9），可它每 3 秒就来一次 —— 站着输出就会一直被盖。
  //
  // 【和紫阵（第六关咒面图腾）的区别】紫阵是**铺在地上等你踩**，
  // 盖章人是**追着你此刻站的地方盖**：落点跟着你走，方框、红印、更短的引信，
  // 逼你一直保持「移动中输出」；紫阵可以绕开，它绕不开 —— 只能走。
  //
  // 【怎么破】它血只有 2.6：顺手拍两下就没了。它真正的作用是让你
  // **没法站在称量官面前安心打那 2.2 秒** —— 你只要停手，印就落下来。
  // 于是这一关的节奏变成「边跑边打」，而不是「站桩输出」。
  //
  // 模型：Quaternius 的哥布林（CC0，poly.pizza，7 段 EnemyArmature 动画，
  // 和寄存处看守同一套骨架 → 直接吃 brute 动画族）。绿皮小吏混在骷髅堆里
  // 一眼就能认出来，手里那枚程序化的印章（tag: 'stamp'）是它的身份。
  stamper: {
    name: '盖章人',
    file: 'assets/monsters/stamp-goblin.glb',
    sourceHeight: 2.953,   // 实测（Idle 渲染身高，.tmp-97-calib.js）
    footY: 0.0,
    height: 1.62,          // 矮：一眼能看出它和骷髅不是一类东西
    radius: 0.55,
    hp: 2.6,               // 脆：两下就没。它的价值是干扰，不是耗你的输出
    armor: 0,
    speed: 1.62,           // 快：追得上你，也躲得开近战
    attackRange: 6.6,
    keepDistance: 4.4,     // 贴太近就退 —— 它要的是「看得见你站哪」
    damage: 0.9,           // 落印命中的伤害（真正疼的是封步）
    attackInterval: 3.4,
    windup: 1.15,          // 抬印 → 落印：1.15 秒够你走三步
    attackDuration: 1.65,  // 必须 > windup
    // 落印（方框）参数：见 spawnSeal
    seal: {
      radius: 1.55,        // 方框半宽（判定用「切比雪夫距离」，所以这是个方）
      color: 0xd8553f,
      slow: 0.5,           // 封步：移速砍半
      time: 3.0,           // 封步持续
    },
    tag: 'stamp',          // 手里的印章（程序化，零资产）
    spawnTime: 0.9,
    deathTime: 1.3,
    selfDestruct: false,
    color: 0xd8553f,       // 印泥红（血条 / 碎屑）
    glow: { color: 0x6a221a, intensity: 0.55 },
    animFamily: 'brute',
    anim: {
      walk: 'walk', idle: 'idle', cast: 'attack',
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
// ---- 胸前的空木牌（程序化，全队共用一张贴图，零新资产）----
// s08 里那些骷髅的木牌本来刻着名字，被雾吹过只剩划痕。这块牌子就是「无名」——
// 也是寄存柜收集的东西。不用贴图文件：一张 64×40 的 canvas 画木纹 + 划痕 + 半截偏旁。
let tagTex = null;
function makeTagTexture() {
  if (tagTex) return tagTex;
  const W = 64, H = 40;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#8a6b45';
  g.fillRect(0, 0, W, H);
  let seed = 810081;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  // 木纹
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = `rgba(${70 + rnd() * 30 | 0},${50 + rnd() * 24 | 0},30,${0.12 + rnd() * 0.18})`;
    g.lineWidth = 0.8 + rnd();
    const y = rnd() * H;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (rnd() - 0.5) * 4, W * 0.7, y + (rnd() - 0.5) * 4, W, y);
    g.stroke();
  }
  // 木框
  g.strokeStyle = 'rgba(58,40,24,0.75)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  // 被擦掉的那道划痕（斜的，像真的拿布抹过）
  g.strokeStyle = 'rgba(226,214,190,0.42)';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(W * 0.24, H * 0.62);
  g.lineTo(W * 0.76, H * 0.44);
  g.stroke();
  // 一个没刻完的偏旁：横、竖各一笔就停了
  g.strokeStyle = 'rgba(240,232,208,0.34)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(W * 0.33, H * 0.28); g.lineTo(W * 0.33, H * 0.40);
  g.moveTo(W * 0.28, H * 0.32); g.lineTo(W * 0.39, H * 0.32);
  g.stroke();
  tagTex = new THREE.CanvasTexture(cv);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  return tagTex;
}

let ledgerTex = null;
// 台账的封面（第 82 块）：暗棕皮面 + 烫金边 + 一道歪着的划痕（有人在这里划掉过一行）。
// 和木牌同一套思路（Basic 材质 + isTag 摘出去），夜里不会有「看不见」的情况。
function makeLedgerTexture() {
  if (ledgerTex) return ledgerTex;
  if (typeof document === 'undefined') return null;
  const W = 128, H = 160;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a2a1a';
  g.fillRect(0, 0, W, H);
  // 皮纹
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(${90 + Math.random() * 30 | 0},${64 + Math.random() * 24 | 0},38,0.20)`;
    g.lineWidth = 0.8 + Math.random();
    const y = Math.random() * H;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.35, y + (Math.random() - 0.5) * 5, W * 0.7, y + (Math.random() - 0.5) * 5, W, y);
    g.stroke();
  }
  // 烫金边 + 烫金标题条
  g.strokeStyle = 'rgba(226,188,102,0.85)';
  g.lineWidth = 3;
  g.strokeRect(2.5, 2.5, W - 5, H - 5);
  g.fillStyle = 'rgba(226,188,102,0.55)';
  g.fillRect(W * 0.22, H * 0.20, W * 0.56, 5);
  g.fillRect(W * 0.30, H * 0.62, W * 0.40, 3);
  // 被划掉的那一行
  g.strokeStyle = 'rgba(240,226,190,0.40)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(W * 0.20, H * 0.52);
  g.lineTo(W * 0.82, H * 0.47);
  g.stroke();
  ledgerTex = new THREE.CanvasTexture(cv);
  ledgerTex.colorSpace = THREE.SRGBColorSpace;
  return ledgerTex;
}

// 把木牌挂到模型上。
// ⚠️ 挂在 model 里要**反向缩放**：model.scale 是 (height/sourceHeight) ≈ 1.5，
// 直接挂一块 0.38 的牌子会被放大成 0.57，而且位置也会跟着放大。
// 套一层 1/s 的 holder，里面就能按世界单位写尺寸和高度。
function attachTag(model, kind, s, cfg) {
  if (!kind || typeof document === 'undefined') return;
  // ⚠️ 用 MeshBasicMaterial（不吃光），不是 MeshStandardMaterial。
  // 踩过的坑：Standard 材质会被下面 spawn 里的 `cfg.tint` 整片覆盖颜色、
  // 又被 `cfg.glow` 盖一层自发光，木牌最后渲染成一块深棕近黑的小方片 ——
  // 夜里压在深灰地面上，肉眼和「没画出来」完全一样（为了这个查了三轮）。
  // Basic 不受灯光与 tint 影响，贴图什么色就出什么色，远看也认得出。
  const mat = new THREE.MeshBasicMaterial({
    map: makeTagTexture(), side: THREE.DoubleSide, toneMapped: false,
  });
  const holder = new THREE.Group();
  holder.scale.setScalar(1 / s);

  if (kind === 'board') {
    // ⚠️ 这里必须显式判 'board'，不能写 else ——
    // 第 82 块加 'ledger' 时写成 else，称量官身上就同时挂了「胸牌 + 台账」两块板，
    // 图鉴缩略图上表现为「背后多出一块莫名其妙的木片」，而且完全不报错。
    // 第 83 块起这条分支只服务寄存处看守：它胸前挂着**一大块**收来的木牌，
    // 尺寸 / 高度从 cfg.tagBox / tagY / tagZ 读（默认值是旧的胸牌尺寸）。
    const box = (cfg && cfg.tagBox) || [0.42, 0.28, 0.05];
    const board = new THREE.Mesh(new THREE.BoxGeometry(box[0], box[1], box[2]), mat);
    board.position.set(0, (cfg && cfg.tagY) || 0.96, (cfg && cfg.tagZ) || 0.56);
    board.frustumCulled = false;
    holder.add(board);
  }
  if (kind === 'ledger') {
    // 称量官手里的台账（第 82 块）：抱在胸前偏左、封面朝镜头。
    // 位置按 hooded-scribe 的身形量的（height 1.95）：胸口在 1.1 上下，
    // 再往左偏一点能被兜帽和袖子衬出来 —— 放在正中间会被长袍整件糊住。
    const cover = makeLedgerTexture();
    // 第 97 块换模型后又收了一档：国王比兜帽书记官瘦一圈（宽 0.63 对 1.86），
    // 原来那块 0.52 宽的簿子会挂到身体外面去，像举着一块牌子。
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.56, 0.09),
      cover
        ? new THREE.MeshBasicMaterial({ map: cover, toneMapped: false })
        : new THREE.MeshBasicMaterial({ color: 0x6b4a2e, toneMapped: false }),
    );
    // 高度 1.06 → 0.94：1.06 正好压在兜帽檐上、把半张脸挡住，看着像「举着一块牌子」；
    // 0.94 落在胸口，兜帽的阴影衬着它，才像抱在怀里。
    book.position.set(-0.24, 0.96, 0.40);
    book.rotation.set(-0.18, 0.26, 0.10);
    book.frustumCulled = false;
    holder.add(book);
    // 金色的捆绳（两道横线）：一眼分清「这不是那块木牌」
    for (const dy of [-0.14, 0.14]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.462, 0.045, 0.098),
        new THREE.MeshBasicMaterial({ color: 0xe2bc66, toneMapped: false }),
      );
      band.position.set(-0.24, 0.96 + dy, 0.40);
      band.rotation.copy(book.rotation);
      band.frustumCulled = false;
      holder.add(band);
    }
  }
  if (kind === 'stamp') {
    // 盖章人手里的印章（第 97 块）：印面朝下的一块红方头 + 一截木柄。
    // 它得在**任何**配色下都读得出来是「章」——所以用 Basic 材质（不受 tint/glow 影响），
    // 印面用最饱和的印泥红，柄压深棕，远看就是一块红疙瘩举在手里。
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.17, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xc0392b, toneMapped: false }),
    );
    head.position.set(0.44, 0.72, 0.30);
    head.frustumCulled = false;
    holder.add(head);
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.052, 0.30, 8),
      new THREE.MeshBasicMaterial({ color: 0x5a3a24, toneMapped: false }),
    );
    handle.position.set(0.44, 0.95, 0.30);
    handle.frustumCulled = false;
    holder.add(handle);
    // 印面底下那道浅红，像刚蘸过印泥
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.012, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xff6a4a, toneMapped: false }),
    );
    pad.position.set(0.44, 0.632, 0.30);
    pad.frustumCulled = false;
    holder.add(pad);
  }
  // 打个标记：spawn 里那几个「遍历所有 mesh 改材质」的段落要跳过木牌
  // （tint / glow / ghost 都会把它的颜色冲掉）。
  holder.traverse((o) => { if (o.isMesh) o.userData.isTag = true; });
  model.add(holder);
}

export async function buildPreviewModel(type) {
  const cfg = ENEMY_TYPES[type];
  if (!cfg) return null;
  let gltf = previewGltf.get(cfg.file);
  if (!gltf) {
    gltf = await new GLTFLoader().loadAsync(withV(cfg.file));
    previewGltf.set(cfg.file, gltf);
  }
  const model = cloneSkinned(gltf.scene);
  const s = cfg.height / cfg.sourceHeight;
  model.scale.setScalar(s);
  // 脚底对齐（同 spawn）：实测脚底在原点以下的模型要往上抬一点，不然缩略图会「陷」进影子
  if (cfg.footY != null && cfg.footY < 0) model.position.y = -cfg.footY * s;
  // 浮空怪（并联体 / 木鱼灵）：局内是靠 root 抬高 hover，缩略图也照抬，
  // 否则原点在身体正中的模型会在图鉴里半截埋进影子（第 77 块一并修掉）。
  // 第 80 块：previewHover:false —— 并联体的原点在**底部**（sourceHeight 是包围盒
  // 最高点），本来就不需要抬。照抬的话它会在图鉴里悬在影子上面一大截，
  // 自动取景又要把影子一起框进去，结果模型缩成一个小蓝盒（生成出来只有 2KB）。
  if (cfg.hover && cfg.previewHover !== false) model.position.y += cfg.hover;
  // 第 81 块：无名者胸前的木牌 / 旗手举的牌子 —— 图鉴里没有这块牌子，
  // 这两只就只是「两只骷髅」，玩家分不出该先打谁。
  if (cfg.tag) attachTag(model, cfg.tag, s, cfg);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    if (o.userData.isTag) return;   // 木牌保持自己的 Basic 材质（第 81 块）
    o.material = o.material.clone();
  });
  if (cfg.skin) applyWizardSkin(model, cfg.skin);
  if (cfg.tint) {
    const tc = new THREE.Color(cfg.tint);
    model.traverse((o) => {
      if (o.userData.isTag) return;   // 木牌不被整体压色（第 81 块）
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
  // 第 80 块：把模型摆到几何中心上，并用一层 pivot 承担旋转。
  // Kenney 这类模型的顶点离原点很远（并联体实测中心在 x≈2 / z≈1.5 格，
  // 乘 3.25 倍就是 6 格多），而图鉴的影子、自动取景都以**原点**为基准 ——
  // 不修的话影子会飞出画面、模型被挤到边角，出图只有 2KB 的「一小块蓝盒子」。
  // 只影响离线出图（图鉴运行时只读 webp），不进局内热路径。
  let pivot = model;
  let center = null;
  try {
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    if (Number.isFinite(box.min.x) && Number.isFinite(box.max.x)) {
      const c = box.getCenter(new THREE.Vector3());
      // 第 83 块：**蒙皮包围盒不可信**。寄存处看守（deposit-warden，Quaternius 骨架）
      // 的 Box3 量出来 minY -83 / maxY 49、中心 z ≈ -129 —— 按它摆的模型会被挪到
      // 相机外面，缩略图只剩一片 3KB 的糊影。判据：中心离原点超过 4 个身高就是量错了，
      // 直接退回「原点即中心」，别再折腾。
      const sane = Math.hypot(c.x, c.z) <= cfg.height * 4;
      if (sane) {
        center = { x: c.x, z: c.z, minY: box.min.y, maxY: box.max.y };
        // 偏移小于 2cm 的不用折腾（绝大多数模型原点就是中心）
        if (Math.hypot(c.x, c.z) > 0.02) {
          pivot = new THREE.Group();
          pivot.position.set(c.x, 0, c.z);
          model.position.x -= c.x;
          model.position.z -= c.z;
          pivot.add(model);
        }
      }
    }
  } catch (_) {}
  return { model, pivot, height: cfg.height, center };
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
    const gltf = await new GLTFLoader().loadAsync(withV(cfg.file));

    const clips = {};
    for (const c of gltf.animations) clips[c.name] = c;

    // ---- 第 80 块：静态模型的「原点离几何体很远」补偿 ----
    // 用户原话：「感觉目前并联体和节点是两个实体啊，节点在稳定移动，并联体乱转」。
    // 根因就在这里：Kenney 的 generator 顶点离原点约 2 格（原始尺度），
    // 放大 3.25 倍后几何中心离 root 有 6 格多 —— 电弧按 e.pos 画在脚下，
    // 铁疙瘩却飘在六格开外，两者当然像两个东西（而且玩家砍的是空气）。
    // 只在**没有动画**的静态网格上量（蒙皮模型的 Box3 不可信，见 HANDOFF），
    // 量出来存进 assets，spawn 时按缩放比补回（不能直接改 gltf.scene.position ——
    // 那是缩放前的坐标，乘上 s 才是局内的真实位移）。
    let offset = null;
    if (!gltf.animations.length) {
      try {
        gltf.scene.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (Number.isFinite(box.min.x) && Number.isFinite(box.max.x)) {
          const cx = (box.min.x + box.max.x) / 2;
          const cz = (box.min.z + box.max.z) / 2;
          if (Math.hypot(cx, cz) > 0.05) offset = { x: cx, z: cz };
        }
      } catch (_) { /* 量不出来就当没有偏移，行为跟以前一样 */ }
    }

    // 语义键（idle/walk/attack…）→ 真实 clip 名，见 CLIP_FAMILIES
    const data = { scene: gltf.scene, clips, aliases: resolveClipAliases(gltf, cfg), offset };
    assets.set(type, data);
    return data;
  }

  // 第 80 块：预载改成**并发**（用户第二次反馈「每一关的加载还是很慢」）。
  // 原来是 `for + await` 纯串行：第六关 11 只怪合计约 5MB，一只一只排队，
  // 手机上光下载就十几秒。现在默认 4 路并发，同样的量大约 1/3 时间。
  // 另外一个坑一起修了：原来某一只失败就整段 reject，main.js 判成「本关模型加载失败」，
  // 后面几只全不下 —— 现在单只失败记一条 warn 继续下一只。
  //   · types 里已经有的类型直接跳过（loadType 是幂等的，差集在这里再算一次也不亏）；
  //   · limit 给 idle 预载用（预载不该和战斗抢主线程，GLTF 解析是同步的）。
  async function preload(types, onProgress, opts = {}) {
    const all = types.filter((t) => ENEMY_TYPES[t] && !ENEMY_TYPES[t].planned && !assets.has(t));
    if (!all.length) {
      if (onProgress) onProgress(1);
      return;
    }
    const limit = Math.max(1, Math.min(opts.limit || 4, all.length));
    let done = 0;
    let next = 0;
    const worker = async () => {
      while (next < all.length) {
        const t = all[next++];
        try {
          await loadType(t);
        } catch (err) {
          console.warn('[怪物] 模型加载失败（跳过这一只）：', t, err);
        }
        done++;
        if (onProgress) onProgress(done / all.length);
      }
    };
    await Promise.all(Array.from({ length: limit }, worker));
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
    // 第 91 块：**出手频率**（新维度）。冷却一律除以它 → 数值越大出手越密。
    // 下限 0.25 是防呆：任何倍率事故都不该让冷却变成 0（那会每帧出手）。
    // 注意这里只管「间隔」，前摇 / 预警圈时长一律不动 —— 见 cdOf 的注释。
    const haste = Math.max(0.25, opts.hasteScale ?? 1);

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
    // 第 81 块：无名者胸前的空木牌 / 旗手举的牌子（程序化，零新资产）
    if (cfg.tag) attachTag(model, cfg.tag, s, cfg);
    // 脚底对齐（第 52 块）：新模型的脚底不完全在原点（实测 -0.08 ~ +0.49），
    // 负的要抬起来（不然半个身子陷进土里），正的是天生浮空（雾鬼/焚火魔），照原样飘。
    if (cfg.footY != null && cfg.footY < 0) model.position.y = -cfg.footY * s;

    const mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;        // 蒙皮包围盒不准，关掉剔除防闪
      // 第 81 块：木牌不进 mats —— 它不吃受击闪白 / 自发光 / 半透明，
      // 否则 tint 一覆盖就渲染成深棕近黑的小方片（= 等于没挂）。
      if (o.userData.isTag) return;
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
        if (o.userData.isTag) return;   // 木牌不被整体压色（第 81 块）
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
    // 第 80 块：给「原点离几何体很远」的静态模型加一层 pivot。
    // Three 的变换顺序是 T×R×S —— 直接给 model.position 打偏移、再设 rotation，
    // 模型会绕**那个偏移点**打转：并联体原始偏 2 格，放大 3.25 倍就是 6 格多，
    // 摆动 0.16 弧度会甩出 ±1 格，看起来就是「铁疙瘩在原地乱转」（用户原话）。
    // 加一层摆在 root 原点的 pivot，把偏移吃在 pivot 内部：几何中心重新落回
    // pivot 原点，pivot 的 rotation 才是真正绕中心转。没有 offset 的怪不套壳。
    let pivot = model;
    if (src.offset) {
      pivot = new THREE.Group();
      model.position.x = -src.offset.x * s;
      model.position.z = -src.offset.z * s;
      pivot.add(model);
    }
    root.add(pivot);

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
      dmg0: damage,      // 第 82 块：伤害的**原始值**（称量官的记名层要在这里叠，不能叠在自己身上）
      named: 0,          // 第 82 块：被记过几层（0 = 无名）
      namedArmor: 0,
      namedRing: null,
      speed,
      haste,             // 第 91 块：本只怪的出手频率倍率（见 cdOf）
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
      // 卫队 / 孵兵继承主祭本局的成长倍率（第 28 块）：召唤时按这个落账。
      // 第 91 块补 haste —— 不然后期的菌王召出来的卫队还是 R1 的出手频率。
      summonScale: { hp: opts.hpScale ?? 1, dmg: opts.damageScale ?? 1, haste },
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
      // ---- 第七关 · 井蛙的舌头状态（第 71 块）----
      tongueState: 'idle',   // 'idle' | 'out'
      tongueT: 0,            // 舌头伸出计时
      tongueHp: 0,           // 舌头当前血量（伸出时有效）
      tongueMesh: null,      // 舌头网格（按需创建）
      tongueTip: null,       // 舌头末端小球
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

    // 第 80 块：sway 要转的是 pivot（几何中心），不是 model 本身
    e.modelPivot = pivot !== model ? pivot : null;

    // 出生：先播从地里钻出来的动画
    bar.draw(1, maxHp, maxHp);
    e.currentAnim = cfg.anim.spawn;
    play(cfg.anim.spawn, { once: true, fade: 0.05, duration: cfg.spawnTime });
    if (fx) fx.spawnRing(e.pos, cfg.color);

    list.push(e);
    // 第 82 块：称量官已经在场上叠过层的话，新上场的人一样是「记过名的」——
    // 这一层的规矩不认「你刚来」。（放在 push 之后：dressWeigh 要挂金环到 root 上）
    if (weighTier > 0) dressWeigh(e);
    // 第 82 块：并联体一落地就摆到离每一台都 ≥ minGap 的位置（见 seatArc）。
    // 放在 push 之后、onSpawn 之前：新怪信息卡弹出来时它已经在正确位置上了。
    if (cfg.arc) seatArc(e);
    // 第 55 块：新怪第一次上场时通报一声 —— main.js 据此冻结世界、弹「它怎么打人」的信息卡。
    // 放在 push 之后：回调里就看得见这只怪已经在场上了（测试也靠这点断言）。
    if (onSpawn) onSpawn(e);
    return e;
  }

  // ---------------- 受伤 / 死亡 ----------------
  // 第 97 块：**现在打得到吗**（真 bug 修复）。
  // 重启体躺尸那 4 秒是 `state === 'down'`：`takeDamage` 里早就 return false 了，
  // 可**选目标**的地方只排除了 dead / spawn —— 于是主角会为一块废铁抬手转身、
  // 环剑会为它再转一圈、炮台会为它射一发、箭雨会为它落一片，全是白给。
  // 现在把判据收成一个函数，凡是「挑目标 / 圈范围」的地方都走它。
  // 雾鬼隐身不在这里判：有些地方（地刺、火地）故意要能碰到隐身目标，
  // 由调用方各自加 `!e.ghostHidden`。
  function hittable(e) {
    return !!e && e.state !== 'dead' && e.state !== 'spawn' && e.state !== 'down';
  }

  // opts:
  //   dot   中毒跳伤 —— 不闪白、绿色小字（每 0.5 秒一次，别和普攻特效混在一起）
  //   quiet 只扣血不播命中碎屑（连锁闪电等批量伤害用）
  function takeDamage(e, amount, crit = false, opts = {}) {
    if (!hittable(e)) return false;
    // 雾鬼隐身（第 35 块）：无形之物不受击 —— 近战、剑、炮台、法器全部打空。
    // 想打它只有两条路：等它显形，或者贴脸逼它显形。
    if (e.ghostHidden) return false;
    // 第七关 · 井蛙：舌头伸出期间，对井蛙的挥击先扣「舌头」的独立血量（需砍断）。
    // 舌头没断之前井蛙本体打不动 —— 逼玩家先处理舌头。
    if (e.cfg.tongue && e.tongueState === 'out' && e.tongueHp > 0) {
      e.tongueHp -= amount;
      if (fx) fx.hit(new THREE.Vector3(e.pos.x, e.height * 0.55, e.pos.z), e.cfg.tongue.color);
      if (e.tongueHp <= 0) severTongue(e);
      return false;   // 井蛙本体此刻不受击
    }
    // 减伤有三个来源，乘法叠加：
    //   auraArmor  —— 主祭霜牢环（第 28 块）
    //   shieldUp   —— 盾斧兽人举盾（第 29 块，举盾时减伤 70%）
    //   namedArmor —— 第九关称量官的「记名」叠层（第 82 块，每层 per.armor）
    const red = Math.min(0.95, (e.auraArmor || 0) + (e.namedArmor || 0)
      + (e.shieldUp && e.cfg.shield ? e.cfg.shield.reduce : 0));
    const dealt = (red > 0 ? amount * (1 - red) : amount);
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
    // 第 82 块：称量官一倒，**全场层数立刻清零** —— 这是第九关唯一的解，
    // 反馈必须发生在这一瞬间（没有「等一句 UI 提示」的余地）。
    if (e.cfg.weigh) clearWeigh(e);
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

  // ---------------- 并联体的电弧网（第 75 块；第 80 块整体重做） ----------------
  // 用户定案：「场上的并联体两两之间连一条持续电流，碰到就掉血」。
  // 所以这不是「配对连线」，是**组合数**：场上 n 只并联体 → C(n,2) 条电弧。
  // **不要求成对**（第 80 块用户确认）：2 只 = 1 条、3 只 = 3 条、4 只 = 6 条，任意 n≥2 都成网。
  //
  // 三条规则：
  //   ① 不设距离上限。两只在场地两头也连着（不然「4 只 = 6 条」就不成立了），
  //      玩家唯一的解法是把并联体本身清掉；
  //   ② 伤害走全局节流（arcZapCd）：同一刻有几条线压在身上，也只掉一次血，
  //      否则站在交叉点会瞬间暴毙 —— 那是 bug，不是难度；
  //   ③ 线悬在模型半腰（hover + height×0.55），不是地上的一道缝。
  //
  // 第 80 块为什么要重做视觉（用户原话：「电线更清晰，带动效」「感觉并联体和
  // 节点是两个实体，节点在稳定移动，并联体乱转」）：
  //   · 线**从模型边缘起步**（按 radius 内缩），端点就在铁疙瘩身上 —— 不再是
  //     「一根悬空的线碰巧经过它旁边」；
  //   · 线在模型半腰的高度，而不在模型下半截；
  //   · 一条线折成 segs 段锯齿（每帧相位在动）+ 沿线跑 dots 个光点 + 咬人时爆闪；
  //   · 模型取消整圈自转（见 cfg.sway 的注释），只留一点机械摆动。
  // 实现：**一条线 = 一个 InstancedMesh**（段 + 光点全在里面），6 条线 6 个 draw call。
  // 每帧只更新 instanceMatrix，不 new 任何东西。
  // 第 80 块：用**球**而不是方块做实例。
  // 方块段在接头处一粗一细，远看是一串「白色小方块」，完全不像电流；
  // 球拉长成椭球后，相邻段在拐角处自然叠成圆润的胶囊 —— 才连得成一条会扭的光。
  // 光点也直接用同一套几何（缩成小球），一条线仍然只有一个 InstancedMesh。
  const arcGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const arcPool = [];          // i -> InstancedMesh（null = 该槽已废弃，等重建）
  let arcZapCd = 0;            // 掉血节流（秒）
  let arcFlow = 0;             // 流光沿线的推进量（0~1 循环）
  let arcPhase = 0;            // 锯齿抖动相位（每帧推进 → 电流在扭）
  let arcFlash = 0;            // 刚咬到人的爆闪（1 → 0 衰减）

  const _arcM4 = new THREE.Matrix4();
  const _arcQ = new THREE.Quaternion();
  const _arcP = new THREE.Vector3();
  const _arcS = new THREE.Vector3();
  const _arcD = new THREE.Vector3();
  const ARC_Z = new THREE.Vector3(0, 0, 1);

  function arcMeshAt(i, color, instCount, segs) {
    let m = arcPool[i];
    if (m && m.count !== instCount) {
      // 段数变了（配置改动）：这个槽作废重建，别拿旧缓冲硬塞
      scene.remove(m);
      m.material.dispose();
      m.dispose();
      m = null;
      arcPool[i] = null;
    }
    if (!m) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      m = new THREE.InstancedMesh(arcGeo, mat, instCount);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.renderOrder = 3;
      // 段用「电弧色」，光点用近白 —— 白底材质 × instanceColor 才亮得起来
      const c = new THREE.Color(color || 0x7ad8ff);
      const d = new THREE.Color(0xeaffff);
      for (let k = 0; k < instCount; k++) m.setColorAt(k, k < segs ? c : d);
      scene.add(m);
      arcPool[i] = m;
    }
    m.visible = true;
    return m;
  }

  // 点到线段的最短距离（电弧判定用）
  function distToSeg(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const wx = px - ax, wz = pz - az;
    const L2 = vx * vx + vz * vz;
    let t = L2 > 1e-6 ? (wx * vx + wz * vz) / L2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  }

  // 「同性相斥」：两只并联体靠得太近就互相推开（第 80 块，用户要求）。
  // 不做成转向力 —— 直接位移最稳：追击再猛也压不到 minGap 以内。
  //
  // 第 82 块改成**硬约束**（用户：「距离还是太近，要实时距离够大」）：
  //   旧写法 push = (gap-d) * 0.5 * k，k ≈ 1-exp(-10dt) ≈ 0.15/帧 —— 每帧只补
  //   15% 的差额，而追击每帧把两只压近 0.05+ 格。收支平衡时稳态距离比 minGap
  //   小 0.3，三只互相抵消还要再打折，用户量到的「实时距离」就是 2.6 出头。
  //   现在每帧把差额**补满**，只有单帧位移限速（怕出生时瞬移）。
  //   限速 9.5 格/秒是追击速度（1.75）的五倍多 —— 每帧补得比压得快，压不下来。
  const ARC_PUSH_MAX = 9.5;      // 分离时的位移速度上限（格/秒）

  function separateArcs(nodes, dt) {
    if (nodes.length < 2) return;
    const gap = nodes[0].cfg.arc.minGap || 16.0;
    const maxStep = ARC_PUSH_MAX * Math.min(dt, 0.05);
    // 4 轮：三只挤成一坨时，一轮推完会互相抵消；夹回边界之后也得再审一遍
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.pos.x - a.pos.x;
          let dz = b.pos.z - a.pos.z;
          let d = Math.hypot(dx, dz);
          const need = gap - d;
          if (need <= 1e-4) continue;
          if (d < 1e-3) {
            // 出生点完全重叠：按序号挑一个确定的方向拆开（不能用随机会抖）
            const ang = i * 2.399 + j * 1.618;
            dx = Math.cos(ang); dz = Math.sin(ang); d = 0;
          } else {
            dx /= d; dz /= d;
          }
          const push = Math.min(need * 0.5, maxStep);
          a.pos.x -= dx * push; a.pos.z -= dz * push;
          b.pos.x += dx * push; b.pos.z += dz * push;
          moved = true;
        }
      }
      // 推开之后可能出界：夹回来（不然它们会站在场地外面放电）。
      // 夹回会让距离缩一点 —— 所以放在轮内、下一轮接着补。
      const lim = arenaR - 0.6;
      for (const e of nodes) {
        const r = Math.hypot(e.pos.x, e.pos.z);
        if (r > lim) { e.pos.x = (e.pos.x / r) * lim; e.pos.z = (e.pos.z / r) * lim; }
      }
      if (!moved) break;
    }
  }

  // 出生落座（第 82 块）：新并联体一落地就直接摆到「离每一台都 ≥ gap」的位置。
  // spawn 状态的节点被 updateArcNet 排除（不画线），所以不能等分离力慢慢推 ——
  // 否则刚升起来那 0.8 秒是贴在一起的两块铁疙瘩，玩家第一眼看到的就是「太近」。
  // 这里允许一次到位（spawn 动画期间位移看不出来）。
  function seatArc(e) {
    const gap = (e.cfg.arc && e.cfg.arc.minGap) || 16.0;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const o of list) {
        if (o === e || !o.cfg.arc || o.state === 'dead') continue;
        let dx = e.pos.x - o.pos.x;
        let dz = e.pos.z - o.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= gap) continue;
        if (d < 1e-3) {
          const ang = (list.indexOf(e) + list.indexOf(o)) * 2.399;
          dx = Math.cos(ang); dz = Math.sin(ang); d = 0;
        } else {
          dx /= d; dz /= d;
        }
        e.pos.x += dx * (gap - d);
        e.pos.z += dz * (gap - d);
        moved = true;
      }
      const lim = arenaR - 0.6;
      const r = Math.hypot(e.pos.x, e.pos.z);
      if (r > lim) { e.pos.x = (e.pos.x / r) * lim; e.pos.z = (e.pos.z / r) * lim; }
      if (!moved) break;
    }
    // 位置是自己挪的，root 还停在原来的出生点 —— 这里补一次，不然会「瞬移」一下
    e.root.position.x = e.pos.x;
    e.root.position.z = e.pos.z;
  }

  function updateArcNet(dt, ctx) {
    const nodes = [];
    for (const e of list) {
      if (!e.cfg.arc) continue;
      if (e.state === 'dead' || e.state === 'spawn') continue;
      nodes.push(e);
    }
    if (arcZapCd > 0) arcZapCd -= dt;
    if (arcFlash > 0) arcFlash = Math.max(0, arcFlash - dt * 3.2);
    arcPhase += dt * 11.0;
    arcFlow = (arcFlow + dt * 1.55) % 1;

    separateArcs(nodes, dt);

    let n = 0;
    let zapped = false;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const cfg = a.cfg.arc;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.3) continue;          // 贴一起了就别画（分离开会处理）

        const segs = Math.max(2, cfg.segs || 6);
        const dots = Math.max(0, cfg.dots ?? 2);
        const ux = dx / len, uz = dz / len;

        // 线的高度跟着模型走：两端各取自己的 hover + 身高比例
        const ya = a.root.position.y + a.cfg.height * (cfg.yFrac ?? 0.55);
        const yb = b.root.position.y + b.cfg.height * (cfg.yFrac ?? 0.55);
        // 端点从模型边缘起步 —— 「线长在铁疙瘩身上」全靠这一下
        const ia = Math.min(len * 0.30, a.cfg.radius * 0.85);
        const ib = Math.min(len * 0.30, b.cfg.radius * 0.85);
        const sx = a.pos.x + ux * ia, sz = a.pos.z + uz * ia;
        const ex = b.pos.x - ux * ib, ez = b.pos.z - uz * ib;
        const nx = -uz, nz = ux;          // 水平法线：锯齿沿这个方向甩

        const m = arcMeshAt(n, cfg.color, segs + dots, segs);
        const jit = cfg.jitter || 0.18;
        // ---- 1) 折线顶点：两端收拢（taper=0），中间抖得最狠 ----
        const pts = [];
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const taper = Math.sin(t * Math.PI);
          const off = taper * (
            Math.sin(t * 7.3 + arcPhase) * 0.62 +
            Math.sin(t * 17.1 - arcPhase * 1.37) * 0.38
          ) * jit;
          const wobY = taper * Math.sin(t * 11.0 + arcPhase * 0.8) * 0.04;
          pts.push({
            x: sx + (ex - sx) * t + nx * off,
            y: ya + (yb - ya) * t + wobY,
            z: sz + (ez - sz) * t + nz * off,
          });
        }
        // ---- 2) 段：每一段是一个拉长的方块，首尾相接 ----
        for (let s = 0; s < segs; s++) {
          const p0 = pts[s], p1 = pts[s + 1];
          _arcD.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
          const sl = _arcD.length();
          _arcP.set((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5, (p0.z + p1.z) * 0.5);
          // 段宽**固定**：每段随机的话接头处一粗一细，远看是一串珠子而不是一条电流
          const w = cfg.width || 0.11;
          if (sl < 1e-5) {
            _arcQ.identity();
            _arcS.set(1e-4, 1e-4, 1e-4);
          } else {
            _arcD.divideScalar(sl);
            _arcQ.setFromUnitVectors(ARC_Z, _arcD);
            // 35% 重叠：椭球两端本来就细，只叠 12% 会在每个接缝处露出「腰」，
            // 远看还是一串珠子。叠够之后相邻段糊成一条连续的粗光带。
            _arcS.set(w, w, sl * 1.35);
          }
          _arcM4.compose(_arcP, _arcQ, _arcS);
          m.setMatrixAt(s, _arcM4);
        }
        // ---- 3) 光点：沿着折线往 b 跑，看起来像电流在流 ----
        for (let k = 0; k < dots; k++) {
          const u = (arcFlow + k / Math.max(1, dots)) % 1;
          const ft = u * segs;
          const si = Math.min(segs - 1, Math.floor(ft));
          const lt = ft - si;
          const p0 = pts[si], p1 = pts[si + 1];
          _arcP.set(
            p0.x + (p1.x - p0.x) * lt,
            p0.y + (p1.y - p0.y) * lt,
            p0.z + (p1.z - p0.z) * lt,
          );
          _arcQ.identity();
          // 流光比线本身粗一倍多：远看是一颗亮点在线上跑
          const ds = (cfg.width || 0.145) * (1.7 + Math.sin(arcPhase * 0.9 + k * 2.1) * 0.3);
          _arcS.set(ds, ds, ds);
          _arcM4.compose(_arcP, _arcQ, _arcS);
          m.setMatrixAt(segs + k, _arcM4);
        }
        m.instanceMatrix.needsUpdate = true;
        // 整体亮度：平时轻微呼吸，咬到人瞬间拉满 —— 这一下比掉血数字更有说服力
        // additive 混合下太亮会「过曝成白色」，青色就没了 —— 压到 0.5 上下才看得出是青光
        m.material.opacity = 0.62 + Math.random() * 0.22 + arcFlash * 0.30;
        n++;

        // 命中：主角到线段的距离 < 判定半径
        if (!zapped && arcZapCd <= 0) {
          const d = distToSeg(ctx.playerPos.x, ctx.playerPos.z, a.pos.x, a.pos.z, b.pos.x, b.pos.z);
          if (d <= (cfg.hitR || 0.42) + ctx.playerRadius) {
            zapped = true;
            arcZapCd = cfg.cd || 0.7;
            arcFlash = 1;
            // 第 82 块（用户）：「电路伤害无视无敌时段」—— source 传 'arc'，
            // main.js 的 hurtPlayer 见到它就跳过无敌帧判定（跟漏电地板同等待遇）。
            ctx.hurtPlayer(cfg.damage || 1, 'arc');
            if (fx && ctx.playerPos) {
              fx.burst(ctx.playerPos, { color: 0x9ee8ff, count: 10, speed: 1.8, life: 0.32, size: 0.08, y: 0.8, up: 1.1 });
            }
          }
        }
      }
    }

    // 多出来的线收起来（不 dispose，下一帧还要用）
    for (let i = n; i < arcPool.length; i++) {
      if (arcPool[i]) arcPool[i].visible = false;
    }
    // 没有节点时把节流也清掉，下次接上立刻能咬人
    if (!nodes.length) arcZapCd = 0;
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
  // 第七关 · 木鱼灵吐的追踪泡（第 82 块）
  // ============================================================
  // 为什么做成一个**实体**而不是又一个地面圈：到第七关为止，「地上先画个圈、
  // 圈亮了掉血」已经有四种了（咒面图腾紫阵 / 焚火魔灼地 / 弓手红圈 / 井底滴水），
  // 玩家练的是「读地面」。再叠一个同类的只会让人麻木 —— 而木鱼灵原本就是照抄
  // 咒面图腾那套（spell.kind:'hex' 换个颜色，连数值都一样）。用户：「换一种」。
  //
  // 追踪泡换个维度：它是一个**会跟着你走的东西**，该处理而不是该躲开。
  // 三条手感线（都在 cfg.bubble 里）：
  //   · 追得上但追得慢：2.6 格/秒（你 4.4），转向也只有 1.2 弧度/秒 ——
  //     贴着它绕半圈它就甩到后面去了（骨头... 证据见 block82 CDP 用例）；
  //   · 能被打爆：4 血，一记结实的近战就没 —— 但那一下你得站着打，
  //     而那一下的时间里别的怪在逼近；
  //   · 打不掉就吃亏：追上就是一格血，并把你**定住 1.2 秒**（彻底挪不动，
  //     比咒面图腾的减速狠：减速还能挪，定住是连拉都拉不开）。
  // ============================================================
  const bubbles = [];
  let bubbleGeo = null, bubbleMatBase = null;

  function bubbleAssets() {
    if (bubbleGeo) return;
    // 第 85 块：泡从 0.42 放大到 0.62 后，14×10 的球面看得出棱角 —— 提到 20×14
    // （每颗 560 面，同屏最多 8 颗，代价可以忽略）
    bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
    bubbleMatBase = new THREE.MeshBasicMaterial({
      color: 0x57e6d0, transparent: true, opacity: 0.34,
      depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  // 吐泡：从它身前冒出来，初始方向 = 「那一刻玩家所在的方向」（不预判，
  // 所以它一吐出来方向就是歪的 —— 你一直动它就一直在后面追）
  function spawnBubble(e, ctx, idx = 0) {
    const cfg = e.cfg.bubble;
    // 第 85 块：一次吐两颗 + 吐得更勤，场上可能堆起来 —— 给个硬上限，
    // 只挡「再多一颗」，不改已经飞着的那些（不然会出现凭空消失的泡）。
    if (bubbles.length >= (cfg.max ?? 10)) return;
    bubbleAssets();
    const dx = ctx.playerPos.x - e.pos.x;
    const dz = ctx.playerPos.z - e.pos.z;
    const base = Math.atan2(dx, dz);
    // 一次吐好几颗时扇形分开（第 85 块：0.34 → 0.55）
    const spread = cfg.count > 1 ? (idx - (cfg.count - 1) / 2) * 0.55 : 0;
    const a = base + spread;
    const sp = cfg.speed;
    // 第 85 块：光靠角度错开，在「刚出嘴」这点距离（≈0.85 格）上最多只分开 0.2 格 ——
    // 两颗大泡会整个叠在一起（同色 additive 只会更亮，数不出是两颗）。
    // 所以出生点本身也沿**垂直于朝向**的方向错开，一边一颗（球心距 ≈ 两半径之和，刚好相切）。
    const side = cfg.count > 1 ? (idx - (cfg.count - 1) / 2) * (e.cfg.radius + (cfg.r ?? 0.42)) : 0;
    const x = e.pos.x + Math.sin(a) * (e.cfg.radius + 0.25) + Math.cos(a) * side;
    const z = e.pos.z + Math.cos(a) * (e.cfg.radius + 0.25) - Math.sin(a) * side;
    const y = cfg.y ?? 1.0;
    const mat = bubbleMatBase.clone();
    mat.color.setHex(cfg.color ?? 0x57e6d0);
    const mesh = new THREE.Mesh(bubbleGeo, mat);
    mesh.frustumCulled = false;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(cfg.r ?? 0.42);
    mesh.renderOrder = 2;
    scene.add(mesh);
    bubbles.push({
      mesh, mat, x, z, y,
      vx: Math.sin(a) * sp, vz: Math.cos(a) * sp,
      turn: cfg.turn ?? 1.2,
      hp: cfg.hp, maxHp: cfg.hp,
      r: cfg.r ?? 0.42,
      dmg: cfg.damage ?? 1,
      root: cfg.root ?? 1.2,
      orbitStop: cfg.orbitStop ?? 1.2,
      life: cfg.life ?? 6,
      t: 0, phase: Math.random() * 6.28, flash: 0,
    });
    if (fx) {
      fx.burst({ x, z }, {
        color: cfg.color ?? 0x57e6d0, count: 6, speed: 1.3,
        life: 0.3, size: 0.09, y, up: 0.8, gravity: 3,
      });
    }
  }

  function removeBubble(i) {
    const b = bubbles[i];
    if (!b) return;
    scene.remove(b.mesh);
    b.mat.dispose();
    bubbles.splice(i, 1);
  }

  // 泡消失的统一出口（被打爆 vs 到寿，视觉不一样：爆得响一点）
  function popBubble(i, byPlayer) {
    const b = bubbles[i];
    if (!b) return;
    const color = b.mat.color.getHex();
    if (fx) {
      fx.burst({ x: b.x, z: b.z }, {
        color, count: byPlayer ? 14 : 7, speed: byPlayer ? 2.6 : 1.3,
        life: 0.4, size: 0.11, y: b.y, up: 1.2, gravity: 4,
      });
      fx.ring({ x: b.x, z: b.z }, {
        from: b.r * 0.6, to: b.r * 2.8, color, life: 0.26, opacity: 0.6, y: 0.08,
      });
    }
    removeBubble(i);
  }

  // 从外面进来的伤害（主角近战 / 环剑 / 雷剑连锁……凡是「在 (x,z) 打出了伤害」）
  // 都顺手糊一下泡。返回打爆了几颗 —— 测试和成就都读得到。
  function hitBubbles(x, z, r, dmg) {
    let popped = 0;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > r + b.r) continue;
      b.hp -= dmg;
      if (b.hp > 0) {
        b.flash = 1;
        if (fx) fx.hit({ x: b.x, z: b.z }, b.mat.color.getHex());
        continue;
      }
      popBubble(i, true);
      popped++;
    }
    return popped;
  }

  function updateBubbles(dt, ctx) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life -= dt;
      b.t += dt;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 6);

      // ---- 转向：每秒最多转 turn 弧度。拐弯笨是它唯一的破绽 ----
      const dx = ctx.playerPos.x - b.x;
      const dz = ctx.playerPos.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = Math.hypot(b.vx, b.vz) || 1e-4;
      const cur = Math.atan2(b.vx, b.vz);
      const want = Math.atan2(dx, dz);
      let diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const na = cur + Math.min(Math.abs(diff), b.turn * dt) * Math.sign(diff);
      b.vx = Math.sin(na) * sp;
      b.vz = Math.cos(na) * sp;
      b.x += b.vx * dt;
      b.z += b.vz * dt;

      // 第 85 块：一次吐两颗 + 泡变大，两颗泡很容易叠成一坨（同色 additive 叠起来
      // 只会更亮，看不出「有两颗」）—— 给一点横向软分离，让它们各自绕出小弧。
      for (let j = 0; j < bubbles.length; j++) {
        const o = bubbles[j];
        if (o === b) continue;
        const sx = b.x - o.x, sz = b.z - o.z;
        const sd = Math.hypot(sx, sz);
        const minD = b.r + o.r;
        if (sd < 0.001 || sd >= minD) continue;
        const push = Math.min(minD - sd, minD * 0.5) * dt * 3.0;
        b.x += (sx / sd) * push;
        b.z += (sz / sd) * push;
      }

      // ---- 视觉：椭球呼吸 + 上下浮动 + 挨打闪一下；血少了壳就变薄（看得出快碎了）----
      const wob = 1 + Math.sin(b.t * 6.5 + b.phase) * 0.08;
      b.mesh.position.set(b.x, b.y + Math.sin(b.t * 3.1 + b.phase) * 0.07, b.z);
      b.mesh.scale.set(b.r * wob, b.r / wob, b.r * wob);
      const frac = Math.max(0, b.hp / b.maxHp);
      // 第 85 块：泡从 0.42 放到 0.62，同样的不透明度会糊住半个屏幕 —— 压薄一点
      b.mat.opacity = 0.14 + 0.15 * frac + b.flash * 0.5;

      // ---- 命中：一格血 + 定住 + **环剑停转**（无敌帧里擦过去的都不算）----
      if (d <= b.r + ctx.playerRadius) {
        const inv = ctx.isInvincible ? ctx.isInvincible() : false;
        ctx.hurtPlayer(b.dmg, null);
        if (!inv && ctx.rootPlayer) ctx.rootPlayer(b.root);
        if (!inv && ctx.stopOrbit) ctx.stopOrbit(b.orbitStop);
        if (fx) {
          fx.burst({ x: b.x, z: b.z }, {
            color: 0x9ff5ea, count: 20, speed: 3.0, life: 0.45, size: 0.16, y: b.y, up: 1.6,
          });
        }
        removeBubble(i);
        continue;
      }
      // ---- 飞出场地 / 到寿：安静地散掉 ----
      const rr = Math.hypot(b.x, b.z);
      if (rr > ctx.arenaRadius + 1.5 || b.life <= 0) {
        if (fx) {
          fx.burst({ x: b.x, z: b.z }, {
            color: b.mat.color.getHex(), count: 5, speed: 1.2,
            life: 0.26, size: 0.08, y: b.y, up: 0.6, gravity: 5,
          });
        }
        removeBubble(i);
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
  let zoneSquareGeo = null, zoneSquareRingGeo = null;   // 第 97 块：方印
  let arrowGeo = null, arrowMat = null;

  // 三种圈用三套配色：红=箭、紫=咒、橙=火。玩家看颜色就知道该防什么。
  const ZONE_PALETTES = {
    arrow: { disc: 0xff3a28, rim: 0xff5c46, tick: 0xffb0a0 },
    hex:   { disc: 0x5a2bb8, rim: 0xa96bff, tick: 0xd9c4ff },
    burn:  { disc: 0xc23a12, rim: 0xff8a3c, tick: 0xffd08a },
    // 第 97 块：盖章人的方印 —— 印泥红 + 干掉的暗红边框
    seal:  { disc: 0x8a1f18, rim: 0xd8553f, tick: 0xffc2a8 },
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
    // 第 97 块：方印的两块几何 —— 实心方 + 方框。
    // 用 Shape + Path 挖空做边框（RingGeometry 只有圆的），旋转到 XZ 平面。
    zoneSquareGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    {
      const outer = new THREE.Shape();
      outer.moveTo(-1, -1); outer.lineTo(1, -1); outer.lineTo(1, 1); outer.lineTo(-1, 1); outer.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-0.9, -0.9); hole.lineTo(-0.9, 0.9); hole.lineTo(0.9, 0.9); hole.lineTo(0.9, -0.9); hole.closePath();
      outer.holes.push(hole);
      zoneSquareRingGeo = new THREE.ShapeGeometry(outer).rotateX(-Math.PI / 2);
    }
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

    // 第 97 块：extra.square —— 方印走方形几何，其它一律还是圆
    const gDisc = extra.square ? zoneSquareGeo : zoneGeo;
    const gRim = extra.square ? zoneSquareRingGeo : zoneRimGeo;
    const gTick = extra.square ? zoneSquareRingGeo : zoneTickGeo;
    const disc = new THREE.Mesh(gDisc, mats.disc);
    disc.position.set(x, 0.052, z);
    disc.scale.setScalar(r);
    disc.frustumCulled = false;
    const rim = new THREE.Mesh(gRim, mats.rim);
    rim.position.set(x, 0.058, z);
    rim.scale.setScalar(r);
    rim.frustumCulled = false;
    const tick = new THREE.Mesh(gTick, mats.tick);
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

  // 盖章人（第 97 块）：在你**此刻脚下**盖一枚方印。
  // ⚠️ 和巫师那套「读完条才钉圈」不一样：这里**起手就钉**，圈的引信本来就是
  // cfg.windup —— 于是从抬印到落印只有 1.15 秒，看得见、也来得及走开，
  // 但站着打输出就一定会被盖。判定用「切比雪夫距离」，所以它是个方框不是圆。
  function spawnSeal(e, ctx) {
    const se = e.cfg.seal;
    makeZone('seal', e, ctx, se.radius, {
      square: true,
      color: se.color,
      seal: se,
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
        hasteScale: (e.summonScale && e.summonScale.haste) ?? 1,
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
      if (!hittable(o)) continue;   // 第 97 块：不给躺尸的重启体白奶（它站起来只会回到 55%）
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

      // 方印（第 97 块）：判定是**方框**（切比雪夫距离），不是你站在圆心附近。
      // 命中 → 伤害 + 封步（移速砍半，走 cursePlayer 那套，和紫阵共用一个减速槽，
      // 但红印落在脚下、还会弹一个「封印」字样，和老远飘过来的紫圈一眼分得开）。
      if (v.kind === 'seal') {
        const qx = ctx.playerPos.x - v.x, qz = ctx.playerPos.z - v.z;
        const sq = Math.max(Math.abs(qx), Math.abs(qz));
        if (sq <= v.r) {
          ctx.hurtPlayer(v.dmg, null);
          if (ctx.cursePlayer) ctx.cursePlayer({ factor: v.seal.slow, duration: v.seal.time });
          if (fx) {
            fx.ring({ x: v.x, z: v.z }, { from: 0.2, to: v.r * 1.15, color: 0xd8553f, life: 0.34, opacity: 0.85, y: 0.07 });
            fx.burst({ x: v.x, z: v.z }, { color: 0xff6a4a, count: 18, speed: 3.4, life: 0.55, size: 0.13, y: 0.28, up: 1.5, gravity: 4 });
            fx.text({ x: v.x, z: v.z }, '封印', { color: '#ff8a6a', y: 1.5, size: 0.62 });
          }
          // 音效不用在这儿放：cursePlayer 第一次上减速时自己会播（main.js）
        } else if (fx) {
          // 走开了也给个「印盖空」的反馈，玩家才知道这一步躲对了
          fx.ring({ x: v.x, z: v.z }, { from: 0.2, to: v.r, color: 0xa8503e, life: 0.26, opacity: 0.35, y: 0.06 });
        }
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

  // ------------------------------------------------------------
  // 第七关 · 井蛙的舌头（第 71 块）
  // 伸出期间：把主角朝井蛙方向拉（combatCtx.pullPlayer）、舌头有独立血量、
  // 被砍断后井蛙短硬直。舌头网格从「嘴」连到主角，逐帧更新。
  // ------------------------------------------------------------
  const _tongueUp = new THREE.Vector3(0, 1, 0);
  const _tongueMat = new THREE.MeshBasicMaterial({ color: 0x8fd86a, transparent: true, opacity: 0.92, depthWrite: false });
  function ensureTongueMesh(e) {
    if (e.tongueMesh) return;
    const geo = new THREE.CylinderGeometry(0.14, 0.18, 1, 8);
    e.tongueMesh = new THREE.Mesh(geo, _tongueMat);
    e.tongueMesh.frustumCulled = false;
    e.tongueTip = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), _tongueMat);
    e.tongueTip.frustumCulled = false;
    scene.add(e.tongueMesh, e.tongueTip);
  }
  function updateTongueMesh(e, pp) {
    if (!e.tongueMesh) return;
    const ax = e.pos.x, ay = e.height * 0.55, az = e.pos.z;   // 嘴（井蛙身上约一半高）
    const bx = pp.x, by = 0.7, bz = pp.z;                     // 末端（主角胸口）
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = Math.max(0.01, dir.length());
    e.tongueMesh.position.copy(mid);
    e.tongueMesh.scale.set(1, len, 1);
    e.tongueMesh.quaternion.setFromUnitVectors(_tongueUp, dir.clone().normalize());
    e.tongueTip.position.set(bx, by, bz);
  }
  function removeTongueMesh(e) {
    if (e.tongueMesh) {
      scene.remove(e.tongueMesh, e.tongueTip);
      e.tongueMesh.geometry.dispose();
      e.tongueMesh = null; e.tongueTip = null;
    }
  }
  function extendTongue(e, ctx) {
    const tg = e.cfg.tongue;
    e.tongueState = 'out';
    e.tongueT = 0;
    e.tongueHp = tg.hp;
    ensureTongueMesh(e);
    e.tongueMesh.visible = true;
    e.tongueTip.visible = true;
    updateTongueMesh(e, ctx.playerPos);
  }
  function retractTongue(e) {
    e.tongueState = 'idle';
    if (e.tongueMesh) { e.tongueMesh.visible = false; e.tongueTip.visible = false; }
    e.bar.spr.visible = false;     // 舌头血量条收掉（回到井蛙本体不显示）
  }
  function severTongue(e) {
    // 被砍断：收回 + 短硬直（冰冻式定身）+ 较长冷却
    retractTongue(e);
    const tg = e.cfg.tongue;
    e.freezeT = Math.max(e.freezeT, tg.stun);
    e.attackCd = (tg.recover + tg.stun) / (e.haste || 1);
    if (fx) {
      fx.ring(e.pos, { from: 0.3, to: e.radius + 1.4, color: 0x8fd86a, life: 0.4, opacity: 0.7, y: 0.06 });
      fx.burst(e.pos, { color: 0x8fd86a, count: 12, speed: 2.4, life: 0.5, size: 0.12, y: 0.5, up: 1.5 });
    }
  }
  function handleTongue(e, dt, ctx) {
    const tg = e.cfg.tongue;
    if (e.tongueState === 'out') {
      e.tongueT += dt;
      if (ctx.pullPlayer) ctx.pullPlayer(e.pos.x, e.pos.z, tg.pull * dt);
      updateTongueMesh(e, ctx.playerPos);
      // 舌头伸出期间：井蛙本体那根血条复用语为「舌头血量」提示
      e.bar.spr.visible = true;
      e.bar.draw(e.tongueHp / tg.hp, e.tongueHp, tg.hp);
      if (e.tongueT >= tg.extend) { retractTongue(e); e.attackCd = tg.recover / (e.haste || 1); }
      return;
    }
    // idle：靠近到 keepDistance 再站定；冷却好了且主角在射程内就吐舌
    e.attackCd -= dt;
    const dx = ctx.playerPos.x - e.pos.x;
    const dz = ctx.playerPos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > tg.keepDistance) {
      moveToward(e, dx, dz, dist, dt, ctx);
    }
    if (dist > 0.001) e.root.rotation.y = lerpAngle(e.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-9 * dt));
    if (e.attackCd <= 0 && dist <= tg.range) extendTongue(e, ctx);
  }
  function updateOne(e, dt, ctx) {
    e.mixer.update(dt);
    e.t += dt;

    // ---- 并联体（第六关，第 75 块；第 80 块改运动） ----
    // Kenney 的模型没有骨骼动画（clip 表是空的，play() 会安全地什么都不做），
    // 所以「在动」这件事只能自己写：离地悬停 + 上下呼吸 + **一点左右机械摆动**。
    //
    // ⚠️ 第 80 块删掉了原来的整圈自转（`model.rotation.y = t * spin`）：
    // root 已经在朝玩家平滑转向（updateOne 的通用分支），模型再自己转一圈，
    // 两层叠起来就是「线在稳稳地走、铁疙瘩在原地乱转」—— 玩家会以为
    // 电弧和机体是两个东西。现在模型只在自己的朝向上左右摆 ±sway 弧度，
    // 幅度小到不会和移动方向打架，但足够让静态网格「不像贴图」。
    if (e.cfg.arc && e.state !== 'dead') {
      e.root.position.y = (e.cfg.hover || 0) + Math.sin(e.t * 2.2) * 0.055;
      // 有 pivot 的（原点补偿过的模型）转 pivot —— 它才绕几何中心
      const rig = e.modelPivot || e.model;
      rig.rotation.y = ENEMY_MODEL_YAW
        + Math.sin(e.t * 1.7 + e.driftPhase) * (e.cfg.sway || 0.16);
    } else if (e.cfg.hover && e.state !== 'dead') {
      // ---- 木鱼灵（第 77 块）：鱼型灵体只浮空、不自转 ----
      // 河豚模型的原点在身体正中，不抬就有一半埋进地里；这里纯粹上下呼吸。
      e.root.position.y = e.cfg.hover + Math.sin(e.t * 2.2) * 0.10;
    }

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

    // 第 82 块：记名金环（第九关称量官叠的层）。它一直呼吸，层数越大环越大 ——
    // 「这一层现在记到第几层」看一眼场面就知道。
    if (e.namedRing) e.namedRing.update(dt);

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
        e.root.position.y = (e.cfg.hover || 0) - 0.45 * k;
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

    // ---- 第七关 · 井蛙：吐舌头拉人（第 71 块）----
    if (e.cfg.tongue) { handleTongue(e, dt, ctx); return; }

    const dx = ctx.playerPos.x - e.pos.x;
    const dz = ctx.playerPos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);

    // 朝向玩家（平滑转身，避免瞬间打转）
    if (dist > 0.001) {
      e.root.rotation.y = lerpAngle(e.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-9 * dt));
    }

    // ---- 第七关 · 木鱼灵：吐追踪泡（第 82 块）----
    // 必须排在「巫师 spell」分支之前（见 handleBubbleCaster）。
    if (e.cfg.bubble) { handleBubbleCaster(e, dt, ctx, dx, dz, dist); return; }

    // ---- 第八关 · 寄存处看守：三套距离带攻击（第 83 块）----
    if (e.cfg.warden) { handleWarden(e, dt, ctx, dx, dz, dist); return; }

    // ---- 第九关 · 盖章人：抬印 / 落印（第 97 块）----
    if (e.cfg.seal) { handleStamper(e, dt, ctx, dx, dz, dist); return; }

    // ---- 第九关 · 称量官：给全场记账（第 82 块）----
    // 它没有 spell / projectile / volley，占不到「施法者」那条骨架，所以自己开一条。
    if (e.cfg.weigh) { handleWeigher(e, dt, ctx, dx, dz, dist); return; }

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
          e.attackCd = cdOf(e, e.cfg.attackInterval - lp.recover, 0.6);
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
          e.attackCd = cdOf(e, e.cfg.attackInterval - ch.recover, 0.4);
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
    // 四段状态，比别的怪都简单，但压迫感来自「它在偷东西」而不是「它在打我」：
    //   chase  保持 5 格距离绕着你走，冷却好了开始读条（只在 7 格内才起手）
    //   attack 读条 4.5 秒（脚下一圈紫黑环）→ 到点把你环上一把剑擦掉
    //   flee   先原地愣 1.4 秒，再径向朝场地外跑；跑出去了那把剑这一局就没了
    // 它一次都不伤人 —— 它的伤害记在你那本账上。
    if (e.cfg.erase) {
      const er = e.cfg.erase;

      // ---------- 逃跑 ----------
      if (e.state === 'flee') {
        e.fleeT += dt;
        // 第 69 块（用户）：刚擦完名字先僵住一小会儿 —— 动画停在原地，
        // 玩家看得见「它得手了」，也真的有机会冲上来砍它一刀。
        if (e.fleeT <= (er.holdAfterSteal || 0)) {
          if (e.currentAnim !== e.cfg.anim.idle) {
            e.currentAnim = e.cfg.anim.idle;
            e.play(e.cfg.anim.idle, { fade: 0.15 });
          }
          return;
        }
        const ang = Math.atan2(e.pos.z, e.pos.x);   // 径向朝外，最短路线出界
        const sp = e.speed * er.fleeSpeed;
        e.pos.x += Math.cos(ang) * sp * dt;
        e.pos.z += Math.sin(ang) * sp * dt;
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
          // 越接近读完越密：4.5 秒里从 0.5 秒一粒加到 0.12 秒一粒
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
          e.attackCd = cdOf(e, e.cfg.attackInterval - e.cfg.attackDuration, 0.5);
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.18 });
        }
        return;
      }

      // ---------- 追 / 退 ----------
      e.attackCd -= dt;
      const keep = e.cfg.keepDistance;
      // 第 69 块（用户「还没找到它就被偷了」的根治）：起手之前先问一句
      // 「玩家现在看得见它吗」。看不见就继续朝玩家挪，而不是在屏幕外偷偷读条。
      const viz = ctx.onScreen ? ctx.onScreen(e.pos) : true;
      // 第 77 块：把「看不见 → 靠近」提到最前面，并给后退留一条足够低的底线。
      // 原来的顺序是死区（dist < keep-0.35 就退）在前、「!viz 就靠近」在后，
      // 这两条在「刚好卡在视野边缘」时会互相夹死：靠近一步 → 进入死区 → 后退一步 →
      // 又出死区 → 再靠近 …… 它就在 ~3.85 格原地左右抖，永远轮不到读条。
      // 竖屏横向可见只有约 4 格（`onScreen` 还留了 0.9 的余量），keep 又是 4.2，
      // 所以这个夹缝真的会被踩到 —— 表现是「擦名者整局站在那儿不动，一把剑都没擦」。
      // 现在两条规则不再重叠：要么一路靠近到看得见，要么真的贴太近（< keep-1.5）才退。
      if (!viz && dist > 2.0) {
        moveToward(e, dx, dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }
      if (dist < keep - 1.5) {
        moveToward(e, -dx, -dz, dist, dt, ctx);
        if (e.currentAnim !== e.cfg.anim.walk) {
          e.currentAnim = e.cfg.anim.walk;
          e.play(e.cfg.anim.walk, { fade: 0.2 });
        }
        return;
      }
      if (dist > keep + 0.45) {
        // 第 75 块：靠近条件从 attackRange（7）改成 keep（4.2）——
        // 它会一路走到你身边 4 格处才停，而不是在 7 格外站着等读条。
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
              hasteScale: (e.summonScale && e.summonScale.haste) ?? 1,
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
          e.attackCd = cdOf(e, e.cfg.attackInterval - e.cfg.attackDuration, 0.3, true);
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
          e.attackCd = cdOf(e, e.cfg.attackInterval - e.cfg.attackDuration, 0.3, true);
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
          e.attackCd = cdOf(e, e.cfg.attackInterval - e.cfg.attackDuration, 0.2, true);
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
          e.attackCd = cdOf(e, e.cfg.attackInterval - e.cfg.attackDuration, 0.2, true);
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

  // ============================================================
  // 第九关 · 称量官的「上称」（第 82 块）：**全场**叠层
  // ============================================================
  // 一句话：**每完成一次上称，场上所有怪一起强一层** —— 不是给某只怪贴个标签。
  //
  // 三个数值落脚点（都在 cfg.weigh.per 里）：
  //   移速 —— moveToward 里乘上去（所有受益的怪都变快）；
  //   伤害 —— 写在 e.damage 上（它本来就是每只怪自己的实例字段）；
  //   减伤 —— 写在 e.namedArmor 上，走 takeDamage 那套乘法叠加。
  //
  // ⚠️ 伤害必须留一份**原始值**（e.dmg0）：e.damage 是按回合倍率算出来的实例值，
  // 而层数是「清零 → 再叠回去」两步走的 —— 没有原始值，每次 +9% 的对象就是
  // 上一次已经加过的那个数，来回几次就离谱了。
  //
  // 视觉三条一起上（用户要「明显特效」）：
  //   ① 前摇：一圈金色大环从它脚下扩到整个场地 —— 看到就该往它那边挤；
  //   ② 结算：每只被记账的怪脚底炸一朵金花，并长出一只金环（环随层数长大）；
  //   ③ 常驻：记过名的怪**一直带着那只环** —— 一眼能数出这层记到第几层。
  //   它倒下时所有金环同时炸开 —— 那一碎是这一关最好的一帧。
  const WEIGH = () => (ENEMY_TYPES.weigher && ENEMY_TYPES.weigher.weigh) || null;
  let weighTier = 0;

  // 给一只怪套上「当前层数」的账（伤害/减伤落到实例上，移速在 moveToward 里实时读）
  function dressWeigh(e) {
    const cfg = WEIGH();
    if (!cfg) return;
    const t = Math.min(cfg.cap, weighTier);
    e.named = t;
    e.namedArmor = cfg.per.armor * t;
    if (e.dmg0 != null) e.damage = e.dmg0 * (1 + cfg.per.damage * t);
    updateNamedRing(e);
  }

  // 每只「记过名」的怪脚下一只金环（半径随层数长大：第 5 层的环几乎有两人宽）
  function updateNamedRing(e) {
    const cfg = WEIGH();
    if (!cfg) return;
    const t = e.named || 0;
    if (t <= 0) {
      if (e.namedRing) { e.root.remove(e.namedRing.mesh); e.namedRing.dispose(); e.namedRing = null; }
      return;
    }
    const want = 0.60 + t * 0.18;
    if (e.namedRing) {
      e.namedRing.setRadius(want);
      e.namedRing.baseR = want;
      return;
    }
    const ring = createRangeRing({
      radius: want, color: cfg.color, opacity: 0.55, pulse: 0.06, y: 0.045,
    });
    e.namedRing = ring;
    e.namedRing.baseR = want;
    e.root.add(ring.mesh);
  }

  // 上称：升一层 + 全场上
  function performWeigh(e) {
    const cfg = WEIGH();
    if (!cfg) return;
    weighTier = Math.min(cfg.cap, weighTier + 1);
    for (const o of list) {
      if (o.state === 'dead' || o.state === 'down') continue;
      dressWeigh(o);
      if (fx) {
        fx.burst(o.pos, {
          color: cfg.color, count: 9, speed: 2.2, life: 0.5, size: 0.11,
          y: 0.5, up: 1.6, gravity: 3,
        });
      }
    }
    if (fx) {
      // 全场铺过去的一圈金光 —— 这一下就是「全都记上了」
      fx.ring(e.pos, { from: 0.6, to: arenaR, color: cfg.color, life: 0.85, opacity: 0.7, y: 0.05 });
      fx.ring(e.pos, { from: 0.4, to: arenaR * 0.72, color: 0xfff0c4, life: 0.5, opacity: 0.5, y: 0.07 });
      fx.text(e.pos, `第 ${weighTier} 层`, { color: '#ffe08a', size: 0.8, y: e.cfg.height + 0.9 });
    }
  }

  // 称量官倒下：**所有层一起掉**（这是这一关唯一的解，必须给足反馈）
  function clearWeigh(e) {
    const cfg = WEIGH();
    if (!cfg || weighTier <= 0) return;
    weighTier = 0;
    for (const o of list) {
      if (!o.named) continue;
      o.named = 0;
      o.namedArmor = 0;
      if (o.dmg0 != null) o.damage = o.dmg0;
      if (o.namedRing) {
        if (fx) {
          fx.burst(o.pos, {
            color: cfg.color, count: 6, speed: 1.8, life: 0.4, size: 0.09, y: 0.4, up: 1.2, gravity: 4,
          });
        }
        o.root.remove(o.namedRing.mesh);
        o.namedRing.dispose();
        o.namedRing = null;
      }
    }
    if (fx && e) {
      fx.ring(e.pos, { from: 0.5, to: arenaR * 0.95, color: 0xf2e6c8, life: 0.7, opacity: 0.55, y: 0.06 });
    }
  }

  // 称量官的行为：和巫师同一套「躲远 + 站定 + 读条」骨架，
  // 但读条结束不是掷法术，而是 performWeigh（给全场叠一层）。
  // 它没有 spell / projectile / volley，所以要自己占一条分支。
  // ============================================================
  // 第九关 · 盖章人（第 97 块）
  // ============================================================
  // 三档站位，和看守那套「距离带」同构，但只有一招：
  //   贴太近（< keepDistance 4.4）→ 后退。它要的是「看得见你站在哪」，
  //                                 被贴脸就没有落点可言了。
  //   射程内（≤ 6.6）           → 抬印，**起手就把方印钉在你脚下**，1.15 秒后落。
  //   太远                      → 走过去。
  // 它没有前摇读条的第二段判定（不像巫师那样"读完条才钉圈"）：起手即钉，
  // 所以从看见红方块到落印只有 1.15 秒 —— 够走开，不够打完一套站桩。
  function handleStamper(e, dt, ctx, dx, dz, dist) {
    if (e.state === 'attack') {
      if (e.t >= e.cfg.attackDuration) {
        e.state = 'chase';
        e.t = 0;
        e.attackCd = cdOf(e, e.cfg.attackInterval, 1.0, true);
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.16 });
      }
      return;
    }

    if (dist < e.cfg.keepDistance) {
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

    e.attackCd -= dt;
    if (e.attackCd <= 0) {
      e.state = 'attack';
      e.t = 0;
      e.hitDone = true;          // 方印在起手这一帧就钉下去了，不再走「读完条再钉」
      e.currentAnim = e.cfg.anim.cast;
      e.play(e.cfg.anim.cast, { once: true, fade: 0.1, duration: e.cfg.attackDuration });
      spawnSeal(e, ctx);
      return;
    }
    if (e.currentAnim !== e.cfg.anim.idle) {
      e.currentAnim = e.cfg.anim.idle;
      e.play(e.cfg.anim.idle, { fade: 0.2 });
    }
  }

  function handleWeigher(e, dt, ctx, dx, dz, dist) {
    const cfg = e.cfg.weigh;
    // 第 91 块：它的上称节奏只吃**一半**的攻速成长（开方）。
    // 五层记名本来就是一份独立的、全场叠加的成长；再全额吃回合攻速
    // 等于两套成长相乘 —— R20 会 5.8 秒上一次称，29 秒叠满，这一关直接失控。
    // 开方之后仍然「越到后面越急」（R20 上称间隔 9 → 7.2 秒），但不至于失去控制。
    const wgHaste = Math.sqrt(e.haste || 1);
    if (e.attackCd == null) e.attackCd = 0.55 * cfg.every / wgHaste;   // 上场后不用等满一个周期
    if (e.state === 'attack') {
      if (!e.hitDone && e.t >= e.cfg.windup) {
        e.hitDone = true;
        performWeigh(e);
      }
      if (e.t >= e.cfg.attackDuration) {
        e.state = 'chase';
        e.t = 0;
        e.attackCd = Math.max(0.3, (cfg.every - e.cfg.attackDuration) / wgHaste / (1 + e.auraHaste));
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.18 });
      }
      return;
    }

    // 太近就退开（它躲得比谁都积极 —— 拆不掉它，这一关就一直在叠）
    if (dist < e.cfg.keepDistance) {
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

    e.attackCd -= dt;
    if (e.attackCd <= 0) {
      e.state = 'attack';
      e.t = 0;
      e.hitDone = false;
      e.currentAnim = e.cfg.anim.cast;
      e.play(e.cfg.anim.cast, { once: true, fade: 0.12, duration: e.cfg.attackDuration });
      // 前摇那条金环扩到整个场地 —— 这是「马上要全员加强」的信号，看到就该往它那边挤
      if (fx) {
        fx.ring(e.pos, {
          from: 0.5, to: arenaR, color: cfg.color,
          life: e.cfg.windup, opacity: 0.42, y: 0.05,
        });
      }
      return;
    }
    if (e.currentAnim !== e.cfg.anim.idle) {
      e.currentAnim = e.cfg.anim.idle;
      e.play(e.cfg.anim.idle, { fade: 0.2 });
    }
  }

  // ============================================================
  // 第八关 · 寄存处看守（第 83 块）：三套距离带攻击
  // ============================================================
  // 它是本关唯一由**玩法**召唤出来的怪（柜子满 8 块 → 封柜 5 秒 → 走出来），
  // 所以设计目标不是「更硬的骷髅」，而是「三种完全不同的躲法」——
  // 玩家每换一次距离，就换一套动作去应对：
  //
  //   ① 横扫  dist ≤ 3.6      前摇 0.55s + 脚下一圈橙光 → 3.6 格内重伤 + 击飞
  //   ② 砸地  3.6 < dist ≤ 9  在你**当时站的位置**钉三个金圈，1.35 秒后落锤
  //   ③ 投牌  dist > 9        抡起一摞木牌砸过来（有实体飞行物，能看见、能躲）
  //
  // 三招都不是「必中」：横扫退一步、砸地走开两步、投牌横移就行。
  // 反过来，站着不动吃三招是一定会死的 —— 这正是「不让柜子满」的意义。
  //
  // 半血狂暴：移速 ×1.4、出手间隔 ×0.72、自发光转暗金，只触发一次。
  const wardenStrikes = [];   // 落点预警：{ x, z, t, delay, dmg, r, mesh, owner, fan?, angle?, half? }
  const wardenTags = [];      // 飞行中的木牌：{ mesh, x, z, vx, vz, t, dur, turnLeft, dmg, owner }

  // 第 96 块：扇面几何缓存。
  // 半径和半角都是 cfg 里的常量，所以整局只需要一份几何 —— 但**注意别 dispose**，
  // 销毁时只释放材质。跟前面的圈不同（那个每次新建、随手 dispose 没问题）。
  let fanGeoCache = null;
  let fanGeoKey = '';
  function fanGeo(r, half) {
    const key = `${r.toFixed(2)}|${half.toFixed(3)}`;
    if (fanGeoCache && fanGeoKey === key) return fanGeoCache;
    if (fanGeoCache) fanGeoCache.dispose();
    // CircleGeometry 的扇区在 XY 平面上以 +X 为中心张开，rotateX(-90°) 之后
    // 就落在 XZ 平面、仍然以 +X 为中心 —— 于是只需要 mesh.rotation.y 转一次
    // 就能指到任意方向（角度换算见 addWardenFan）。
    fanGeoCache = new THREE.CircleGeometry(r, 40, -half, half * 2).rotateX(-Math.PI / 2);
    fanGeoKey = key;
    return fanGeoCache;
  }

  function clearWardenFx() {
    for (const st of wardenStrikes) {
      if (st.mesh) {
        scene.remove(st.mesh);
        if (!st.fan) st.mesh.geometry.dispose();   // 扇面几何是共享的，不能在这儿拆
        st.mesh.material.dispose();
      }
    }
    wardenStrikes.length = 0;
    for (const tg of wardenTags) {
      scene.remove(tg.mesh);
      tg.mesh.geometry.dispose();
      tg.mesh.material.dispose();
    }
    wardenTags.length = 0;
  }

  function addWardenStrike(x, z, delay, dmg, r, color, owner) {
    let mesh = null;
    if (typeof document !== 'undefined') {
      mesh = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.84, r, 44).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
        })
      );
      mesh.position.set(x, 0.055, z);
      scene.add(mesh);
    }
    wardenStrikes.push({ x, z, t: 0, delay, dmg, r, mesh, owner: owner || null });
  }

  // 第 96 块：扇形木牌雨的预警。angle 用和 root.rotation.y 同一套约定
  // （atan2(dx, dz)），所以判定和画面永远同源 —— 别再各写一遍。
  function addWardenFan(x, z, angle, half, delay, dmg, r, color, owner) {
    let mesh = null;
    if (typeof document !== 'undefined') {
      mesh = new THREE.Mesh(fanGeo(r, half), new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
      }));
      mesh.position.set(x, 0.055, z);
      // 扇面局部朝向是 +X；绕 Y 转 (angle - π/2) 正好转到世界方向 (sin angle, cos angle)
      mesh.rotation.y = angle - Math.PI / 2;
      scene.add(mesh);
    }
    wardenStrikes.push({
      x, z, t: 0, delay, dmg, r, mesh, owner: owner || null,
      fan: true, angle, half,
    });
  }

  function updateWardenStrikes(dt, ctx) {
    const pp = ctx.playerPos;
    for (let i = wardenStrikes.length - 1; i >= 0; i--) {
      const st = wardenStrikes[i];
      st.t += dt;
      const k = Math.min(1, st.t / Math.max(0.01, st.delay));
      if (st.mesh) {
        st.mesh.material.opacity = 0.16 + k * 0.46;
        st.mesh.scale.setScalar(0.92 + k * 0.14);
      }
      if (st.t < st.delay) continue;
      if (st.mesh) {
        scene.remove(st.mesh);
        if (!st.fan) st.mesh.geometry.dispose();   // 扇面几何是共享的
        st.mesh.material.dispose();
        st.mesh = null;
      }
      const d = Math.hypot(pp.x - st.x, pp.z - st.z);
      let hit;
      if (st.fan) {
        // 扇形：距离在半径内 **且** 方位角落在扇面里。
        // 角度用和 root.rotation.y / addWardenFan 同一套 atan2(dx, dz) 约定。
        let diff = Math.atan2(pp.x - st.x, pp.z - st.z) - st.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        hit = d <= st.r && Math.abs(diff) <= st.half;
      } else {
        hit = d <= st.r;
      }
      if (hit) {
        ctx.hurtPlayer(st.dmg, st.owner && st.owner.state !== 'dead' ? st.owner : null);
        if (ctx.pushPlayer) {
          const nx = d > 1e-4 ? (pp.x - st.x) / d : 1;
          const nz = d > 1e-4 ? (pp.z - st.z) / d : 0;
          ctx.pushPlayer(nx, nz, Math.min(1.5, st.r * 0.38));
        }
      }
      if (fx) {
        if (st.fan) {
          // 木牌雨：沿扇面撒几处落点，比一个整圈更像「一排牌子砸下来」
          fx.ring({ x: st.x, z: st.z }, {
            from: st.r * 0.25, to: st.r, color: 0xffe0a0, life: 0.3, opacity: 0.6, y: 0.07,
          });
          for (let n = 0; n < 5; n++) {
            const a = st.angle + (Math.random() * 2 - 1) * st.half;
            const rr = st.r * (0.28 + Math.random() * 0.62);
            fx.burst({ x: st.x + Math.sin(a) * rr, z: st.z + Math.cos(a) * rr }, {
              color: 0xf0d8a8, count: 9, speed: 2.6, life: 0.42, size: 0.11, y: 0.2, up: 1.5,
            });
          }
        } else {
          fx.ring({ x: st.x, z: st.z }, {
            from: st.r * 0.3, to: st.r, color: 0xffe0a0, life: 0.32, opacity: 0.85, y: 0.07,
          });
          fx.burst({ x: st.x, z: st.z }, {
            color: 0xf0d8a8, count: 14, speed: 3.2, life: 0.45, size: 0.12, y: 0.2, up: 1.7,
          });
        }
      }
      wardenStrikes.splice(i, 1);
    }
  }

  // 投牌（第 96 块改版）：一块实体木牌从它手边抡出去，**会拐一次弯**再拉直。
  // 动作分两段读：刚出手时朝你「此刻」的位置飞（能看见、能预判），
  // 你一闪它就跟着拐一次（转向预算 tagTurn，拐完就锁死方向），所以躲法变成
  // 「横移 → 看它拐 → 再横移」。无限追踪会让这招只能靠硬吃，那是猜谜不是走位。
  function throwWardenTag(e, ctx) {
    const cfg = e.cfg.warden;
    const pp = ctx.playerPos;
    const from = { x: e.pos.x, z: e.pos.z };
    const d = Math.hypot(pp.x - from.x, pp.z - from.z) || 1;
    // 初始朝向：直奔玩家当前所在
    const ang = Math.atan2(pp.x - from.x, pp.z - from.z);
    let mesh = null;
    if (typeof document !== 'undefined') {
      const tex = makeTagTexture();
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.48, 0.07),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      );
      mesh.position.set(from.x, 1.35, from.z);
      scene.add(mesh);
    }
    wardenTags.push({
      mesh,
      x: from.x, z: from.z,
      vx: Math.sin(ang) * cfg.tagSpeed,
      vz: Math.cos(ang) * cfg.tagSpeed,
      ang,                            // 当前朝向（弧度，atan2(dx,dz) 约定）
      turnLeft: cfg.tagTurn,          // 还能拐多少度（用完就直飞）
      dur: Math.max(0.35, d / Math.max(1, cfg.tagSpeed)),   // 只用来算拱起的弧高
      t: 0, life: 0,
      // 参数在出手那一刻拷一份到牌上：守卫可能中途被打死，那时 owner.cfg 就
      // 不该再被读了（牌已经飞出去了，它自己的物理不该跟着主人一起消失）
      home: cfg.tagHome, speed: cfg.tagSpeed, maxLife: cfg.tagLife,
      fuse: cfg.tagFuse, r: cfg.tagR,
      dmg: e.damage * cfg.tagMul,
      owner: e,
    });
  }

  function updateWardenTags(dt, ctx) {
    const pp = ctx.playerPos;
    for (let i = wardenTags.length - 1; i >= 0; i--) {
      const tg = wardenTags[i];
      tg.t += dt;
      tg.life += dt;

      // ---- 追踪：朝玩家转，但受「转向速率」和「总转向预算」双重限制 ----
      if (tg.turnLeft > 1e-4) {
        let diff = Math.atan2(pp.x - tg.x, pp.z - tg.z) - tg.ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = Math.min(tg.home * dt, tg.turnLeft);
        const step = Math.max(-maxTurn, Math.min(maxTurn, diff));
        tg.ang += step;
        tg.turnLeft -= Math.abs(step);
      }
      const sp = tg.speed;
      tg.vx = Math.sin(tg.ang) * sp;
      tg.vz = Math.cos(tg.ang) * sp;
      tg.x += tg.vx * dt;
      tg.z += tg.vz * dt;

      if (tg.mesh) {
        // 拱起：按「初始预判飞行时长」走一条抛物线，拐弯的时候高度不会突然跳
        const k = Math.min(1, tg.t / tg.dur);
        tg.mesh.position.set(tg.x, 1.35 + Math.sin(k * Math.PI) * 2.0, tg.z);
        tg.mesh.rotation.x += dt * 9;
        tg.mesh.rotation.z += dt * 5;
      }

      // ---- 落地条件：贴近主角引爆 / 飞太久 / 出界 ----
      const pd = Math.hypot(pp.x - tg.x, pp.z - tg.z);
      const lim = (ctx.arenaRadius || 20) + 2;
      const out = Math.hypot(tg.x, tg.z) > lim;
      if (pd > tg.fuse && tg.life < tg.maxLife && !out) continue;

      if (tg.mesh) {
        scene.remove(tg.mesh);
        tg.mesh.geometry.dispose();
        tg.mesh.material.dispose();
        tg.mesh = null;
      }
      if (pd <= tg.r && !out) {
        ctx.hurtPlayer(tg.dmg, tg.owner && tg.owner.state !== 'dead' ? tg.owner : null);
        if (ctx.pushPlayer) {
          const nx = pd > 1e-4 ? (pp.x - tg.x) / pd : 1;
          const nz = pd > 1e-4 ? (pp.z - tg.z) / pd : 0;
          ctx.pushPlayer(nx, nz, 0.8);
        }
      }
      if (fx) {
        fx.ring({ x: tg.x, z: tg.z }, {
          from: 0.4, to: tg.r, color: 0xe8c98a, life: 0.28, opacity: 0.8, y: 0.07,
        });
        fx.burst({ x: tg.x, z: tg.z }, {
          color: 0xd8b98a, count: 10, speed: 2.4, life: 0.4, size: 0.1, y: 0.3, up: 1.4,
        });
      }
      wardenTags.splice(i, 1);
    }
  }

  function performWardenMove(e, ctx, move) {
    const cfg = e.cfg.warden;
    const pp = ctx.playerPos;
    const base = e.damage;

    if (move === 'sweep') {
      if (fx) {
        fx.ring(e.pos, { from: 0.5, to: cfg.sweepR, color: cfg.color, life: 0.3, opacity: 0.9, y: 0.07 });
        fx.burst(e.pos, {
          color: 0xffd8a0, count: 18, speed: 4.2, life: 0.4, size: 0.12, y: 0.5, up: 1.2,
        });
      }
      const d = Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z);
      if (d <= cfg.sweepR) {
        ctx.hurtPlayer(base * cfg.sweepMul, e);
        if (ctx.pushPlayer) {
          const nx = d > 1e-4 ? (pp.x - e.pos.x) / d : 1;
          const nz = d > 1e-4 ? (pp.z - e.pos.z) / d : 0;
          ctx.pushPlayer(nx, nz, 1.6);
        }
      }
      return;
    }

    if (move === 'slam') {
      // 三个圈：你现在站的位置 + 垂直于「它→你」方向的两侧
      // （只钉一个圈的话，往旁边挪半步就白给了；三个圈才逼出「走两步」）
      const ang = Math.atan2(pp.z - e.pos.z, pp.x - e.pos.x) + Math.PI / 2;
      const ox = Math.cos(ang) * 2.4;
      const oz = Math.sin(ang) * 2.4;
      const lim = ctx.arenaRadius - 1.0;
      for (const sgn of [0, 1, -1]) {
        let x = pp.x + ox * sgn;
        let z = pp.z + oz * sgn;
        const r = Math.hypot(x, z);
        if (r > lim) { x = (x / r) * lim; z = (z / r) * lim; }
        addWardenStrike(x, z, cfg.slamDelay, base * cfg.slamMul, cfg.slamR, cfg.color, e);
      }
      if (fx) {
        fx.ring(e.pos, { from: 0.5, to: 2.4, color: cfg.color, life: 0.35, opacity: 0.7, y: 0.06 });
      }
      return;
    }

    // 第 96 块：扇形木牌雨的**判定与画面都在出手那一刻就铺好了**
    // （见 handleWarden 里的 addWardenFan，delay = 前摇），这里什么都不用做。
    if (move === 'fan') return;

    // 第 96 块：砸开寄存柜 —— 这一招自己不打人，产出的是「场面」
    if (move === 'cabinet') { smashCabinet(e, ctx); return; }

    throwWardenTag(e, ctx);
  }

  // ============================================================
  // 第 96 块 · 砸开寄存柜（新招⑤）
  // ============================================================
  // 剧情上最贴的一招：柜子本来就是它的地盘。打不动你了就回身一锤，
  // 把柜门砸开，放里头「没人来领的寄存物」出来帮你按手按脚。
  //
  // ⚠️ 三条护栏，缺一条就会滚雪球：
  //   ① cabCap —— 它名下最多同时活 3 只（`summonedBy` 记账，和孢生菇同一套）；
  //   ② cabCd  —— 砸完要有 16 秒冷却，不能连砸；
  //   ③ 继承本回合倍率 —— 第 15 回合砸出来的小怪必须也是第 15 回合的强度，
  //      否则后期砸出来的是一群纸片人，这一招等于白占一个出手位。
  function smashCabinet(e, ctx) {
    const cfg = e.cfg.warden;
    // 柜子位置从 combatCtx 拿（第 81 块就为了「队伍绕开柜子」开过这个口子）。
    // 拿不到（沙盒/非第八关）就退化成「在自己脚边砸」，不让招式直接失效。
    const hub = ctx.depositHub || e.pos;
    const cx = hub.x, cz = hub.z;

    const alive = list.filter((m) => m.summonedBy === e && m.state !== 'dead').length;
    const n = Math.min(cfg.cabCount, Math.max(0, cfg.cabCap - alive));
    const kinds = ['warrior', 'archer'];
    for (let i = 0; i < n; i++) {
      // 从柜门口往外散开一格，别三只叠在同一个点上（会被并排推挤算法挤飞）
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.9;
      const rr = 1.1;
      const m = spawn(kinds[i % kinds.length], {
        x: cx + Math.cos(a) * rr,
        z: cz + Math.sin(a) * rr,
      }, {
        hpScale: ((e.summonScale && e.summonScale.hp) ?? 1) * 0.8,
        damageScale: (e.summonScale && e.summonScale.dmg) ?? 1,
        hasteScale: (e.summonScale && e.summonScale.haste) ?? 1,
      });
      if (m) m.summonedBy = e;
    }
    if (fx) {
      fx.ring({ x: cx, z: cz }, { from: 0.4, to: 3.2, color: 0xffd9a0, life: 0.5, opacity: 0.85, y: 0.08 });
      fx.burst({ x: cx, z: cz }, { color: 0xd8b98a, count: 20, speed: 3.4, life: 0.55, size: 0.13, y: 0.4, up: 1.8 });
      if (n === 0) fx.text({ x: cx, z: cz }, '空了', { color: '#c9b48a', size: 0.7, y: 2.2 });
    }
  }

  function handleWarden(e, dt, ctx, dx, dz, dist) {
    const cfg = e.cfg.warden;
    if (e.wdGap == null) e.wdGap = cfg.gap * 0.6 / (e.haste || 1);

    // ---- 半血狂暴（只触发一次）----
    if (!e.raged && e.hp / e.maxHp <= cfg.rageAt) {
      e.raged = true;
      e.speed *= cfg.rageSpeed;
      for (const m of e.mats) {
        if (!m.emissive) continue;
        m.emissive.setHex(0x8a3a12);
        m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.95);
      }
      if (fx) {
        fx.ring(e.pos, { from: 0.5, to: 4.6, color: 0xff7a3c, life: 0.62, opacity: 0.9, y: 0.06 });
        fx.text(e.pos, '暴怒', { color: '#ff9a5a', size: 0.95, y: e.cfg.height + 1.0 });
        fx.burst(e.pos, { color: 0xff9a5a, count: 26, speed: 3.6, life: 0.6, size: 0.14, y: 0.6, up: 2.0 });
      }
    }

    if (e.state === 'attack') {
      const move = e.wdMove || 'sweep';
      if (!e.hitDone && e.t >= (e.wdWindup ?? e.cfg.windup)) {
        e.hitDone = true;
        performWardenMove(e, ctx, move);
      }
      if (e.t >= (e.wdDur || e.cfg.attackDuration)) {
        e.state = 'chase';
        e.t = 0;
        e.hitDone = false;
        // 第 96 块：原来这里是 `Math.max(0.5, cfg.gap * 狂暴倍率)` —— 完全没吃
        // `e.haste`，而 main.js 召唤它时明明传了 `hasteScale`（注释写着「看守的
        // 出手也要跟着回合变密」）。所以第 15 回合的看守和第 1 回合一样从容。
        // 统一走 cdOf（第 91 块立的规矩），floor 1.1 秒：再密也要留出走位缝隙。
        e.wdGap = cdOf(e, cfg.gap * (e.raged ? cfg.rageGap : 1), 1.1);
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.2 });
      }
      return;
    }

    // 走得慢，但冷却照常在走 —— 拉开距离反而更容易吃到「投牌」
    e.wdGap -= dt;
    if (e.wdCabinetCd == null) e.wdCabinetCd = cfg.cabFirst;
    e.wdCabinetCd -= dt;
    if (dist > cfg.chaseKeep) {
      moveToward(e, dx, dz, dist, dt, ctx);
      if (e.currentAnim !== e.cfg.anim.walk) {
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.2 });
      }
    } else if (e.currentAnim !== e.cfg.anim.idle) {
      e.currentAnim = e.cfg.anim.idle;
      e.play(e.cfg.anim.idle, { fade: 0.2 });
    }
    if (e.wdGap > 0) return;

    // ---- 第 96 块：五招轮换 ----
    // 距离带只决定「哪些招能选」，招本身在带内随机 —— 五招里三招有距离要求，
    // 所以玩家换距离仍然在换招，但同一距离不再固定一招（原来中距永远是砸地，
    // 站住不动就能背下来）。
    // 砸柜优先级最高（它有自己的 16 秒冷却，不吃常规间隔），但贴脸时不砸：
    // 那时先横扫把玩家推开来，砸柜才有产出场面的余地。
    const pp = ctx.playerPos;
    let move;
    if (e.wdCabinetCd <= 0 && dist > cfg.sweepR + 0.6) {
      move = 'cabinet';
    } else if (dist > 9.0) {
      move = 'tag';
    } else if (dist > cfg.sweepR) {
      // 中距：砸地（三圈、延迟落）和木牌雨（扇面、必须绕后）各一半
      move = (dist <= cfg.fanR && Math.random() < 0.5) ? 'fan' : 'slam';
    } else {
      move = 'sweep';
    }

    e.state = 'attack';
    e.t = 0;
    e.hitDone = false;
    e.wdMove = move;
    e.wdWindup = move === 'fan' ? cfg.fanWindup
      : (move === 'cabinet' ? cfg.cabWindup : e.cfg.windup);
    e.wdDur = move === 'slam' ? 1.55
      : (move === 'tag' ? 1.05
        : (move === 'fan' ? 1.30
          : (move === 'cabinet' ? 1.70 : 1.0)));
    if (move === 'cabinet') e.wdCabinetCd = cfg.cabCd;
    e.currentAnim = e.cfg.anim.attack;
    e.play(e.cfg.anim.attack, { once: true, fade: 0.1, duration: e.wdDur });

    // 扇形木牌雨：**画面和判定一起在出手这一帧铺好**（delay = 前摇），
    // 方向锁定在出手那一刻 —— 这样「看到扇面亮起来还来得及绕到侧面」成立。
    // 如果等前摇结束才铺，玩家就没有反应的余地了。
    if (move === 'fan') {
      const ang = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
      addWardenFan(e.pos.x, e.pos.z, ang, cfg.fanHalf, e.wdWindup,
        e.damage * cfg.fanMul, cfg.fanR, cfg.color, e);
    }
    if (fx) {
      // 前摇提示：横扫/砸地都是脚下一圈暗金脉冲，投牌多一道抬手光
      fx.ring(e.pos, {
        from: 0.4, to: move === 'sweep' ? cfg.sweepR : 2.6,
        color: cfg.color, life: e.wdWindup, opacity: 0.5, y: 0.06,
      });
    }
  }

  // ---------------- 第七关 · 木鱼灵：吐追踪泡（第 82 块）----------------
  // 骨架和巫师一样（保持距离 → 站定 → 前摇 → 出手），但出手吐的是**实体泡**。
  //
  // ⚠️ 为什么不能继续走 spell 那套：咒面图腾是「读条 → 脚下圈 → 掉血 + 减速」，
  // 木鱼灵照抄一遍（kind 都是 'hex'，只是颜色不同、连 windup/attackInterval
  // 都一样）就成了「换个颜色的同一只怪」——用户：「攻击模式和咒面图腾有重合」。
  // 现在它吐出去的是一个会自己追的东西，读的是另一个维度的信息（速度差、
  // 拐弯半径、血量），和紫阵那一套不撞车。
  function handleBubbleCaster(e, dt, ctx, dx, dz, dist) {
    const cfg = e.cfg.bubble;
    if (e.attackCd == null) e.attackCd = e.cfg.attackInterval / (e.haste || 1);

    if (e.state === 'attack') {
      if (!e.hitDone && e.t >= e.cfg.windup) {
        e.hitDone = true;
        for (let i = 0; i < (cfg.count || 1); i++) spawnBubble(e, ctx, i);
      }
      if (e.t >= e.cfg.attackDuration) {
        e.state = 'chase';
        e.t = 0;
        e.attackCd = cdOf(e, e.cfg.attackInterval - e.cfg.attackDuration, 0.3, true);
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.18 });
      }
      return;
    }

    // 太近就往后退（它不是近战法师，吐泡也得一口气）
    if (dist < e.cfg.keepDistance) {
      moveToward(e, -dx, -dz, dist, dt, ctx);
      if (e.currentAnim !== e.cfg.anim.walk) {
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.2 });
      }
      return;
    }
    // 太远就慢慢挪进来（比主角慢，追不上正跑的你）
    if (dist > e.cfg.attackRange) {
      moveToward(e, dx, dz, dist, dt, ctx);
      if (e.currentAnim !== e.cfg.anim.walk) {
        e.currentAnim = e.cfg.anim.walk;
        e.play(e.cfg.anim.walk, { fade: 0.2 });
      }
      return;
    }

    e.attackCd -= dt;
    if (e.attackCd <= 0) {
      e.state = 'attack';
      e.t = 0;
      e.hitDone = false;
      e.currentAnim = e.cfg.anim.cast;
      e.play(e.cfg.anim.cast, { once: true, fade: 0.12, duration: e.cfg.attackDuration });
      // 起手提示：脚下一圈青色脉冲（和投手蓄力环一个意思）
      if (fx) {
        fx.ring(e.pos, {
          from: 0.3, to: 1.6, color: cfg.color ?? 0x57e6d0,
          life: e.cfg.windup, opacity: 0.46, y: 0.055,
        });
      }
      return;
    }
    if (e.currentAnim !== e.cfg.anim.idle) {
      e.currentAnim = e.cfg.anim.idle;
      e.play(e.cfg.anim.idle, { fade: 0.2 });
    }
  }

  // ============================================================
  // 第 91 块：出手冷却的唯一出口
  // ============================================================
  // 为什么要有这个函数：出手机制有九套（近战 / 投手 / 弓手 / 法术 / 跳劈 /
  // 冲锋 / 井蛙舌头 / 木鱼灵 / 称量官上称），每套各自算 attackCd。要做
  // 「越到后面出手越密」，只能在**同一个地方**把时效除进去，否则迟早漏一套
  // （漏掉的那只会变成「只有它不吃成长」，玩家反而觉得那只是 BUG）。
  //
  // 语义：
  //   base   本来的间隔余量（cfg.attackInterval - 收势 / 僵直 ……）
  //   floor  原来各处写死的下限（0.2~0.6 秒），防止连成每帧一次
  //   withAura  是否吃霜牢环加成（原本只有四套远程/近战吃，别顺手改成全都吃）
  //
  // ⚠️ 前摇（cfg.windup）、红圈预警、弹道飞行时间**一律不在这里**。
  // 用户要的是「攻击更快」，不是「更没法躲」—— 后者会把走位游戏变成猜谜。
  function cdOf(e, base, floor = 0.2, withAura = false) {
    const hs = (e.haste || 1) * (withAura ? 1 + (e.auraHaste || 0) : 1);
    return Math.max(floor, base / hs);
  }

  function moveToward(e, dx, dz, dist, dt, ctx) {
    if (dist < 0.0001) return;
    // 冰缓：被冰剑命中后移速打折（slowFactor = 减速比例）
    // 第 82 块：第九关「记名」叠层也给移速（每层 per.speed，见 cfg.weigh）
    const namedBoost = 1 + (e.named || 0) * ((WEIGH() && WEIGH().per.speed) || 0);
    const sp = e.speed * (e.slowT > 0 ? (1 - Math.min(0.9, e.slowFactor || 0)) : 1) * namedBoost;
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
      // 第 97 块：躺尸的重启体（'down'）不该继续给周围发光环 —— 它这会儿连被打都免疫
      if (e.cfg.aura && hittable(e)) sources.push(e);
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
    updateWardenStrikes(dt, ctx);  // 第 83 块：看守的落点预警 / 落锤结算
    updateWardenTags(dt, ctx);     // 第 83 块：看守扔出去的木牌
    updateMendFx(dt);
    updateShots(dt, ctx);
    updateBubbles(dt, ctx);   // 第 82 块：木鱼灵吐的追踪泡（会自己拐弯追人）
    updateZones(dt, ctx);
    updateArrows(dt, ctx);
    updateSpikes(dt, ctx);
    updateArcNet(dt, ctx);      // 第 75 块：并联体的电弧网

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
      if (e.tongueMesh) removeTongueMesh(e);
      scene.remove(e.root);
      for (const m of e.mats) m.dispose();
      e.bar.tex.dispose();
      e.bar.mat.dispose();
      if (e.ring) e.ring.dispose();
      if (e.auraRing) e.auraRing.dispose();
      if (e.namedRing) e.namedRing.dispose();   // 第 82 块：称量官的金环
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
      if (o === e || !hittable(o) || o.ghostHidden) continue;
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
      if (e.tongueMesh) removeTongueMesh(e);
      scene.remove(e.root);
      for (const m of e.mats) m.dispose();
      e.bar.tex.dispose();
      e.bar.mat.dispose();
      if (e.ring) e.ring.dispose();
      if (e.auraRing) e.auraRing.dispose();
      if (e.namedRing) e.namedRing.dispose();   // 第 82 块：称量官的金环
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
    for (const b of bubbles) { scene.remove(b.mesh); b.mat.dispose(); }   // 第 82 块：追踪泡
    bubbles.length = 0;
    for (const a of arrows) scene.remove(a.mesh);
    arrows.length = 0;
    spikesQ.length = 0;
    for (const s of spikesFx) scene.remove(s.mesh);
    spikesFx.length = 0;
    pendingHits.length = 0;
    weighTier = 0;              // 第 82 块：记名层数也得跟着清（换关重来）
    clearWardenFx();            // 第 83 块：看守的预警圈 / 飞行木牌（换关重来不能留在场上）
  }

  // 战士/投手的攻击时长：没单独写就默认 0.9 秒（动画按比例加速/减速），
  // 写了就以配置为准（投手 0.85）—— 前摇 windup 必须小于它。
  for (const t of Object.values(ENEMY_TYPES)) {
    if (t.attackRange != null && t.windup != null && t.attackDuration == null) t.attackDuration = 0.9;
  }

  return {
    preload, spawn, update, reset,
    // 第 72 块：已经把模型拉进内存的类型（loadType 幂等，按关预载靠它算差集）
    loaded: () => [...assets.keys()],
    setArenaRadius: (r) => { arenaR = r; return arenaR; },   // 换关时同步可走半径（第 33 块）
    list,
    aliveCount,
    hittable,          // 第 97 块：选目标 / 圈范围统一判据（排除 dead / spawn / down）
    takeDamage,
    applyDot, applySlow, applyFreeze, chainTargets,
    shotCount: () => shots.length,
    zoneCount: () => zones.length,      // 场上正在倒计时的圈（三种法术都算）
    // 第 82 块：木鱼灵吐的追踪泡 —— 几颗在飞、每颗在哪还有多少血。
    // 打爆一颗的上报走 hitBubbles()，由主角近战 / 环剑 / 连锁调用。
    bubbleCount: () => bubbles.length,
    bubbles: () => bubbles.map((b) => ({
      x: +b.x.toFixed(2), z: +b.z.toFixed(2),
      hp: +b.hp.toFixed(2), maxHp: b.maxHp,
      life: +b.life.toFixed(2), root: b.root,
      r: b.r, orbitStop: b.orbitStop,     // 第 85 块：体积 / 停环剑时长
    })),
    hitBubbles,
    arrowCount: () => arrows.length,    // 正在下落/插在地上的箭
    spikeCount: () => spikesQ.length + spikesFx.length,   // 石刺（待爆+视觉，测试用）
    guardCount: () => list.filter((e) => e.guard && e.state !== 'dead').length,
    pendingCount: () => pendingHits.length,
    // 巫师/法术的观测口（测试与 ?debug=1 用）
    zones: () => zones.map((v) => ({
      kind: v.kind, phase: v.phase, x: +v.x.toFixed(2), z: +v.z.toFixed(2), r: v.r,
      t: +v.t.toFixed(2), dmg: v.dmg,
    })),
    auraCount: () => list.filter((e) => e.cfg.aura && hittable(e)).length,
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
    // 第 82 块：第九关称量官的「记名」层 —— 现在第几层、场上有几只被记过名。
    // 「几只」比「多少层」更能说明问题：层是全场的一份，每只怪都叠着同样的数。
    weighTier: () => weighTier,
    namedCount: () => list.filter((e) => (e.named || 0) > 0 && e.state !== 'dead').length,
    namedRingCount: () => list.filter((e) => e.namedRing && e.state !== 'dead').length,
    menderCount: () => list.filter((e) => e.cfg.spell && e.cfg.spell.kind === 'mend' && e.state !== 'dead').length,
    // 第 63 块：
    //   擦名者 —— 场上还有几只（含正在逃跑的）；stolenCount = 一共被偷走几把剑还没还
    eraserCount: () => list.filter((e) => e.cfg.erase && e.state !== 'dead').length,
    //   第 75 块：并联体的电弧网 —— 场上几只节点、现在画了几条线。
    //   n 只节点应该正好 C(n,2) 条线（4 只 = 6 条），测试和调试都靠这两个数。
    arcNodes: () => list.filter((e) => e.cfg.arc && e.state !== 'dead' && e.state !== 'spawn').length,
    arcLines: () => arcPool.filter((m) => m.visible).length,
    //   第 82 块：并联体**实时**两两间距 —— 用户明确要求「实时距离」而不是生成距离，
    //   所以断言必须读这个（每帧分离之后的值），不能读 spawn 时的落点。
    arcGaps: () => {
      const ns = list.filter((e) => e.cfg.arc && e.state !== 'dead');
      const out = [];
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          out.push(+Math.hypot(ns[j].pos.x - ns[i].pos.x, ns[j].pos.z - ns[i].pos.z).toFixed(2));
        }
      }
      return out;
    },
    //   第 81 块：无名者的队伍。每队给出人数、朝向、状态和每只的实际槽位，
    //   测试要断言「一排站得直」和「旗手死了整队散架」都靠它。
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
    // 第七关 · 井蛙：当前伸出舌头的井蛙数量（测试用）
    tongueOut: () => list.filter((e) => e.cfg.tongue && e.tongueState === 'out').length,
    // 第 83 块 · 寄存处看守：在场的看守状态 + 场上的落点预警 / 飞行木牌
    // （测试要断言「半血狂暴只触发一次」「砸地真的钉了三个圈」都靠它）
    wardenState: () => list.filter((e) => e.cfg.warden && e.state !== 'dead').map((e) => ({
      hp: +e.hp.toFixed(2), maxHp: +e.maxHp.toFixed(2),
      raged: !!e.raged, move: e.wdMove || null,
      state: e.state, gap: e.wdGap == null ? null : +e.wdGap.toFixed(2),
      speed: +e.speed.toFixed(2),
      x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2),
      // 第 96 块：五招之后要能看见「砸柜冷却还剩多久」「这一下吃没吃 haste」
      cabCd: e.wdCabinetCd == null ? null : +e.wdCabinetCd.toFixed(2),
      haste: +(e.haste || 1).toFixed(3),
      windup: e.wdWindup == null ? null : +e.wdWindup.toFixed(2),
    })),
    wardenStrikes: () => wardenStrikes.map((st) => ({
      x: +st.x.toFixed(2), z: +st.z.toFixed(2), r: st.r, t: +st.t.toFixed(2), delay: st.delay,
      // 第 96 块：扇形与圆形要能分开断言
      fan: !!st.fan,
      angle: st.fan ? +st.angle.toFixed(3) : null,
      half: st.fan ? +st.half.toFixed(3) : null,
    })),
    wardenTags: () => wardenTags.length,
    // 第 96 块：追踪牌的细节（朝向 / 剩余转向预算 / 位置）——
    // 只给个数验不了「它会拐一次弯」，得看得见 ang 和 turnLeft 在动。
    wardenTagList: () => wardenTags.map((tg) => ({
      x: +tg.x.toFixed(2), z: +tg.z.toFixed(2),
      ang: +tg.ang.toFixed(3), turnLeft: +tg.turnLeft.toFixed(3),
      vx: +tg.vx.toFixed(2), vz: +tg.vz.toFixed(2),
      life: +tg.life.toFixed(2), dmg: +tg.dmg.toFixed(2),
    })),
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
