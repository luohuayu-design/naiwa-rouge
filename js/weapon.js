// ============================================================
// weapon.js —— 武器系统（环剑 · 多元素）
//
// 玩法（用户定案）：
//   · 第 5 回合打完自动获得 3 把铁剑环绕主角旋转，各有自己的判定。
//     第 56 块起：第一关拿到过之后，**之后的关卡开局就送这 3 把**（见 main.js prefillRing）。
//   · 剑碰到怪物 → 造成伤害并消失（少一把）；
//   · 被消耗的剑按「整环补满」制恢复：swordRefill 秒内无论缺几把全部补满**数量不设上限**（第 9 块定案）：
//     拥有几把就上环几把，买多少把都能同时转，没有「闲置的剑」。
//   · 技能「万剑齐发」（第 56 块重做，用户定案）：**有冷却**（FIRE_CD 秒）。
//     按一下向四周辐射出 n 把剑，**n = 拥有的总剑数**（最初 3 把 + 商店买的），
//     与环上此刻恢复了几把无关；辐射的是额外的剑（走对象池），
//     **不碰环上正在转的** —— 放完技能环上一把不少。
//     （旧版是把环上 n 把全射出去、每两把之间再插一把 = 2n 且无冷却，
//       放完环就秃了，和整环补满制叠在一起手感很堵，用户要求改成 CD 制。）
//
// 元素剑（见 swordKinds.js）：每把剑有一种元素，命中触发附加效果——
//   第 64 块（用户定案）起**五种元素全部群体化**：
//   thunder 雷：全场连锁（唯一不限距离的，每道 chainRatio 伤害）；
//   poison 毒 / frost 冰 / leech 血 / quake 震：在命中点炸开一圈，
//     半径内所有怪吃 elementRatio 溅射伤害 + 各自元素效果（中毒 / 冰冻 / 震退打断 /
//     按总伤害回血）。视觉上各有一圈对应颜色的扩散环。
//   iron 铁：无附加，但便宜、可以叠数量。
//   商店可以买新剑（addSword），买到就立刻上环。
//
// 数值全部走**武器自己的属性表** wstats（weaponStats.js）：
//   swordDamage / swordCrit / swordCritMul / swordOrbit / swordRefill
//   + elementRadius / elementRatio（第 64 块：群体波及半径与溅射比例）
//   + poisonDps / poisonTime / frostTime / chainRatio / leechRate
// ⚠️ 第 6 块起武器与主角彻底解耦：剑的伤害、暴击、吸血都不吃主角属性，
//    stats 在武器系统里只剩一个用途 —— 给主角回血（血剑/吸血）。
//
// 模型：Kenney《Mini Dungeon》weapon-sword.glb（CC0），刃口朝 +Y，9KB。
//       五种元素共用同一模型，克隆后改材质 color/emissive 染色区分；
//       图标用 assets/weapons/icon-*.svg。加载失败时用双盒拼占位剑。
// ============================================================
import * as THREE from '../lib/three.module.js?v=144';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=144';
import { withV } from './assetUrl.js?v=144';   // 第 80 块：glb 带版本号，SW 才走缓存优先
import { SWORD_KINDS, KIND_ORDER } from './swordKinds.js?v=144';
import { rollSwordDamage } from './weaponStats.js?v=144';
import audio from './audio.js?v=144';
// 第 106 块：环剑命中数 / 累计伤害两条成就的记账。
// profile.js 不反向依赖 weapon.js，这里加导入不会成环。
import { bumpStat } from './profile.js?v=144';

// 轨道半径（世界单位）：贴着主角攻击范围环内侧转，视觉上「护体剑气」
const ORBIT_R = 1.7;
const SWORD_LEN = 1.25;        // 剑的世界长度（模型原始 ~0.45）
const SWORD_TILT = 0.62;       // 剑刃上翘角（弧度，≈35°）：顶视角下平躺的剑只剩一条线，翘起来才看得见
const SWORD_SCALE = 1.4;       // 剑身整体放大倍率（用户：命中太困难，体积放大 1.4 倍）
const SWORD_HIT_R = 0.55 * SWORD_SCALE;  // 剑刃判定半径（0.77；再加怪的碰撞半径）
const FLY_SPEED = 15;          // 射出的飞行速度
const FLY_MAX_DIST = 30;       // 飞行最大距离（出场地就散掉）
const FLY_Y = 0.85;            // 飞行/环绕高度
const HIT_Y = 0.8;             // 判定高度基准（怪都是贴地的，只算水平面）
// 雷剑连锁（第 56 块起）：目标是场上所有怪，不限只数也不限距离 —— 见 applyKind 的 thunder 分支
const FIRE_CD = 6.0;           // 万剑齐发冷却（秒，第 56 块用户定案：技能改成有 CD 的）
const MAX_BOLT_VIS = 8;        // 一帧最多画几道闪电线：雷剑连锁全场，线只画最近的几条，别把屏幕糊满

// 第 64 块：从「owned 减 环上」的差集里**随机**挑一种剑补回环上。
// 抽出来导出是为了让 Node 测试能直接验分布（不用起浏览器），逻辑本身只此一份。
//   owned     总库存（按获得顺序，可能有重复）
//   ringKinds 环上此刻的剑（按环上的顺序）
// 返回 null = 不缺口。
export function pickMissingKind(owned, ringKinds, rng = Math.random) {
  const have = new Map();
  for (const k of ringKinds) have.set(k, (have.get(k) || 0) + 1);
  const pool = [];
  for (const k of owned) {
    const c = have.get(k) || 0;
    if (c > 0) { have.set(k, c - 1); continue; }
    pool.push(k);         // 这一把在库存里、但不在环上
  }
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, (rng() * pool.length) | 0)];
}

export function createWeaponSystem({ scene, stats, wstats, fx, enemies, onElementHit }) {
  let granted = false;         // 是否已获得（第 5 回合 grant；第 56 块起后续关卡开局也送）
  let owned = [];              // 拥有的剑（kind 字符串数组，按获得顺序）
  let regenT = 0;              // 恢复计时器（按 swordRefill 总时长推进）
  let fireCd = 0;              // 万剑齐发冷却剩余秒数（第 56 块）
  let cdMul = 1;              // 局外商店「技能CD缩短」倍率（第 58 块，默认 1）
  let orbitAngle = Math.random() * Math.PI * 2;
  // 第 85 块（用户）：「被木鱼灵的泡命中时，环剑停转」。
  // 只冻**角度**，不冻别的 —— 剑停在原地依然会碰伤怪物（它还是利器，只是不转了），
  // 恢复补剑的计时、飞剑、雷链全都照常跑。这样「停转」是纯削弱，不是「环剑消失」。
  let orbitHold = 0;           // >0 = 环剑停转剩余秒数
  // 第 122 块：「断剑挑战」用 —— 整把剑都失效（不转、不补、不打、不能放技能），
  // 和 orbitHold 的削弱完全不同：那是「剑还在，只是停住」，这是「剑根本不存在」。
  // 单独一个开关而不是直接改 granted：challenge 结束后要原样还回来，
  // granted / owned 是整局的资产，动它们等于把玩家的剑偷走。
  let muted = false;
  let t = 0;                   // 总时间（浮动动画用）

  const orbiting = [];         // 环上的剑：{ kind, holder, spawnT }
  const flyers = [];           // 射出去的剑：{ kind, holder, a, ox, oz, dist, spin }
  const bolts = [];            // 雷剑连锁的闪电：{ line, geo, mat, t, life }
  let template = null;         // 克隆源（未染色的原始模型）
  const protos = new Map();    // kind → 染色后的原型 Group
  const pools = new Map();     // kind → 空闲 holder 数组
  const disposables = [];      // 兜底几何/材质，reset 时释放

  // ---------------- 兜底剑（加载失败时） ----------------
  function buildFallbackSword() {
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdfe9ef });
    const hiltMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3f });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.8, 0.03), bladeMat);
    blade.position.y = 0.5;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.08), hiltMat);
    guard.position.y = 0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), hiltMat);
    grip.position.y = -0.05;
    g.add(blade, guard, grip);
    disposables.push(bladeMat, hiltMat, blade.geometry, guard.geometry, grip.geometry);
    return g;
  }

  // ---------------- 加载 ----------------
  async function preload() {
    try {
      const gltf = await new GLTFLoader().loadAsync(withV('assets/weapons/weapon-sword.glb'));
      template = gltf.scene;
      template.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.frustumCulled = false;
      });
    } catch (err) {
      console.warn('[武器] 剑模型加载失败，用几何体占位：', err);
      template = buildFallbackSword();
    }
    // 归一化：模型长度 → SWORD_LEN；模型刃口朝 +Y，几何中心不在原点，摆正到握把处
    const box = new THREE.Box3().setFromObject(template);
    const len = Math.max(0.01, box.max.y - box.min.y);
    const s = SWORD_LEN / len;
    template.scale.setScalar(s);
    template.position.y = -box.min.y * s;   // 握把底端贴着 holder 原点
  }

  // 某元素的染色原型：克隆模板 → 每个网格独立材质 → 按 SWORD_KINDS 调色
  function protoFor(kind) {
    let p = protos.get(kind);
    if (p) return p;
    const kc = SWORD_KINDS[kind] || SWORD_KINDS.iron;
    p = template.clone(true);
    p.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if ('color' in o.material) o.material.color = new THREE.Color(kc.color).multiplyScalar(0.85);
      if ('emissive' in o.material) {
        o.material.emissive = new THREE.Color(kc.emissive);
        o.material.emissiveIntensity = 2.2;   // 深夜 + ACES 色调映射会吃掉饱和度，给足自发光才看得出元素
      }
    });
    protos.set(kind, p);
    return p;
  }

  function acquire(kind) {
    const k = SWORD_KINDS[kind] ? kind : 'iron';
    const pool = pools.get(k);
    if (pool && pool.length) {
      const h = pool.pop();
      h.visible = true;
      return h;
    }
    const holder = new THREE.Group();
    const model = protoFor(k).clone(true);
    model.scale.multiplyScalar(SWORD_SCALE);   // 剑身放大 1.4 倍（与判定半径同步）
    // 刃口 +Y → 转到 +X 再上翘 SWORD_TILT（顶视角下平躺的剑只有一条线）
    model.rotation.z = -Math.PI / 2 + SWORD_TILT;
    holder.add(model);
    holder.userData.kind = k;
    scene.add(holder);
    return holder;
  }

  function release(holder) {
    holder.visible = false;
    holder.scale.setScalar(1);
    const k = holder.userData.kind || 'iron';
    if (!pools.has(k)) pools.set(k, []);
    pools.get(k).push(holder);
  }

  // ---------------- 获得（第 5 回合：3 把铁剑） ----------------
  function grant() {
    if (granted) return;
    granted = true;
    owned = ['iron', 'iron', 'iron'];
    regenT = 0;
    for (let i = 0; i < owned.length; i++) {
      orbiting.push({ kind: owned[i], holder: acquire(owned[i]), spawnT: t });
    }
    if (fx) fx.ring({ x: 0, z: 0 }, { from: 0.4, to: ORBIT_R + 0.6, color: 0x9fe8ff, life: 0.6, opacity: 0.8, y: 0.06 });
  }

  // 商店买新剑：加入 owned 并立刻上环（数量不设上限）
  function addSword(kind) {
    const k = SWORD_KINDS[kind] ? kind : 'iron';
    if (!granted) return { ok: false, onRing: false };
    owned.push(k);
    orbiting.push({ kind: k, holder: acquire(k), spawnT: t });
    if (fx) fx.ring({ x: 0, z: 0 }, { from: 0.3, to: ORBIT_R, color: SWORD_KINDS[k].emissive, life: 0.5, opacity: 0.8, y: 0.06 });
    return { ok: true, onRing: true };
  }

  // 环上应有多少把剑 = 拥有多少把（不设上限，用户第 9 块定案）
  function targetCount() { return owned.length; }

  // ============================================================
  // 擦名者偷剑（第 63 块）
  // ============================================================
  // takeSword()：从环上摘走一把（优先摘最便宜的铁剑 —— 玩家丢一把铁剑
  //   还会心疼，但不会当场崩盘；铁剑没有了才轮到元素剑）。
  //   返回被摘走的 kind，没剑可摘返回 null。
  // returnSword(kind)：杀死擦名者后还回来，位置、染色、判定全部按原样复原。
  // 注意：**不动 flyers**（飞行中的剑是技能打出去的，跟环上的库存是两回事）。
  function takeSword() {
    if (!granted || owned.length === 0) return null;
    // 优先铁剑：同种取环上最后一把，摘掉它就等于「数量 -1」
    let idx = owned.lastIndexOf('iron');
    if (idx < 0) idx = owned.length - 1;
    const kind = owned[idx];
    owned.splice(idx, 1);
    for (let i = orbiting.length - 1; i >= 0; i--) {
      if (orbiting[i].kind === kind) {
        release(orbiting[i].holder);
        orbiting.splice(i, 1);
        break;
      }
    }
    if (fx) fx.ring({ x: 0, z: 0 }, { from: ORBIT_R + 0.2, to: 0.4, color: 0x8a5cff, life: 0.45, opacity: 0.8, y: 0.07 });
    return kind;
  }

  function returnSword(kind) {
    const k = SWORD_KINDS[kind] ? kind : 'iron';
    if (!granted) return false;
    owned.push(k);
    orbiting.push({ kind: k, holder: acquire(k), spawnT: t });
    if (fx) fx.ring({ x: 0, z: 0 }, { from: 0.4, to: ORBIT_R, color: SWORD_KINDS[k].emissive, life: 0.5, opacity: 0.85, y: 0.06 });
    return true;
  }

  // 环上还缺哪种剑：owned 里有、环上没有的（多把取第一把）
  // 第 64 块（用户报「恢复顺序有问题」）：以前这里按 owned 的**获得顺序**返回，
  //   于是先买到的铁剑永远排在最前 —— 玩家一旦处在「剑不停被消耗」的节奏里，
  //   补回来的总是那几把铁剑，后面买的属性剑几乎轮不上环，属性剑在环上的比例
  //   被稀释得越来越小。
  //   现在改成**在差集里随机挑一种**：缺几把就每把独立随机，长期看每种剑上环的
  //   概率严格等于它占库存的比例。整环补满制不受影响（缺多少补多少）。
  function missingKind() {
    return pickMissingKind(owned, orbiting.map((o) => o.kind));
  }

  // ---------------- 技能：万剑齐发（第 56 块重做） ----------------
  // 新版规则（用户定案）：
  //   · **有冷却**（FIRE_CD 秒），冷却中按不动；
  //   · 不管环上此刻恢复了几把，一律向四周辐射出 **n = 拥有的总剑数**把
  //     （最初 3 把 + 商店买的；不再是旧版的 2n，n 的定义也换了）；
  //   · 辐射的是「额外的剑」（从对象池取），**不改变环上正在环绕的数量** ——
  //     放完技能环上一把不少，该转的转、该补的照补。
  // 辐射的剑飞完/命中就回池，和环绕的剑共用一套 holder 池，互不干扰。
  function fire(getPlayerPos) {
    if (!granted || muted || fireCd > 0) return false;
    const n = owned.length;
    if (n === 0) return false;
    const p = getPlayerPos();
    const step = (Math.PI * 2) / n;
    // 原点记发射瞬间的位置，之后与主角移动无关。
    for (let i = 0; i < n; i++) {
      const a = orbitAngle + i * step;
      flyers.push({ kind: owned[i], holder: acquire(owned[i]), a, ox: p.x, oz: p.z, dist: 0, spin: -a });
    }
    fireCd = FIRE_CD * cdMul;
    if (fx) {
      fx.ring(p, { from: 0.3, to: ORBIT_R + 1.2, color: 0x9fe8ff, life: 0.4, opacity: 0.9, y: 0.07 });
      fx.burst(p, { color: 0xbff2ff, count: 24, speed: 6.5, life: 0.5, size: 0.14, y: FLY_Y, up: 1.2, gravity: 3 });
    }
    return true;
  }

  // ---------------- 命中判定与伤害 ----------------
  const _tmp = new THREE.Vector3();
  // 震剑要「把怪从主角身边推出去」，所以记一份最近一帧的主角位置（第 29 块）
  const _playerAt = { x: 0, z: 0 };
  const QUAKE_CHANCE = 0.35;
  const QUAKE_KNOCK = 1.4;

  function aliveEnemies() {
    // 雾鬼隐身时不进候选名单（第 35 块）—— 环剑不会对着空气空转
    // 第 97 块：判据收到 enemies.hittable()。原来只排 dead / spawn，漏了重启体躺尸的
    // 'down' 态 —— 那 4 秒里它打不动，但环剑照样会为它再转一圈，白耗一节电量。
    return enemies.list.filter((e) => enemies.hittable(e) && !e.ghostHidden);
  }

  // 元素附加效果（第 64 块用户定案：五种元素剑全部群体化）
  //   · thunder（雷剑）：**全场连锁** —— 不限距离、不限只数，每道 chainRatio 伤害。
  //     这是它的独占地位，所以它不看 elementRadius。
  //   · poison / frost / leech / quake：**在命中点炸开一圈** —— 半径内所有怪
  //     吃 elementRatio 比例的溅射伤害（直接命中的那只已经吃过全额，不重复），
  //     并全部附上各自的元素效果（中毒 / 冰冻 / 震退打断 / 按总伤害吸血）。
  //   视觉上每种元素都有自己的颜色和音效：毒雾绿、寒气蓝、血环红、震波金。
  const ELEMENT_FX = {
    poison: { color: 0x53d418, sfx: 'poison' },
    frost: { color: 0x2fb8ff, sfx: 'ice' },
    leech: { color: 0xff2e55, sfx: 'heal' },
    quake: { color: 0xffb03c, sfx: null },
  };

  // 命中点 radius 内的活怪（隐身雾鬼照旧打不到 —— 反隐是路口灯的活）
  function aroundPoint(at, radius) {
    const r2 = radius * radius;
    return enemies.list.filter((o) => {
      // 第 97 块：躺尸重启体（state==='down'）不再算作可打目标 ——
      // 以前环剑会为它白转一圈、连元素特效都放出来
      if (!enemies.hittable(o) || o.ghostHidden) return false;
      const dx = o.pos.x - at.x, dz = o.pos.z - at.z;
      return dx * dx + dz * dz <= r2;
    });
  }

  function applyKind(kind, e, dmg) {
    if (!e || kind === 'iron' || !SWORD_KINDS[kind]) return;

    // 第 115 块：元素反应钩子 —— 直接命中的这只怪挂元素印记（main.js 注入）。
    if (onElementHit) onElementHit(kind, e);

    if (kind === 'thunder') {
      // 雷剑（第 56 块重做，用户定案）：连锁到**场上所有怪**（不再限只数/距离），
      // 每道闪电的伤害比例走 chainRatio（第 64 块 45% 起，可升级）。怪越密越是清场技。
      // 视觉上只画最近的几道线（MAX_BOLT_VIS）—— 三十只怪同时链会糊满屏。
      const targets = enemies.chainTargets(e, Infinity, Infinity);
      if (targets.length) audio.sfx('thunder');
      const ratio = wstats.get('chainRatio');
      let vis = 0;
      for (const tgt of targets) {
        const cd = dmg * ratio;
        enemies.takeDamage(tgt, cd, false, { quiet: true, cls: 'elem' });
        enemies.hitBubbles(tgt.pos.x, tgt.pos.z, 0.9, cd);   // 第 82 块：雷也能打到泡
        if (vis < MAX_BOLT_VIS) { bolt(e.pos, tgt.pos); vis++; }
      }
      return;
    }

    // ---- 下面四种：一圈溅射 ----
    const R = Math.max(1.0, wstats.get('elementRadius'));
    const ratio = Math.max(0, wstats.get('elementRatio'));
    const splash = dmg * ratio;
    const around = aroundPoint(e.pos, R);
    const fxInfo = ELEMENT_FX[kind] || ELEMENT_FX.quake;

    // 溅射伤害：直接命中的那只跳过（它在 hitEnemy 里已经吃过全额伤害）
    let totalDmg = dmg;                       // 血剑按「这一剑打出的总伤害」回血
    for (const o of around) {
      if (o === e) continue;
      enemies.takeDamage(o, splash, false, { quiet: true, cls: 'elem' });
      totalDmg += splash;
    }
    // 第 82 块：元素波及**（这一圈也扫得到泡）** —— 判定半径 R 和 aroundPoint
    // 同源，玩家在属性页看到的那个数字对泡一样生效。
    enemies.hitBubbles(e.pos.x, e.pos.z, R, splash);

    // 一圈元素视觉：贴地扩散环 + 少量粒子（不新开贴图，控制 draw call）
    if (fx) {
      fx.ring(e.pos, { from: 0.35, to: R, color: fxInfo.color, life: 0.34, opacity: 0.62, y: 0.055 });
      fx.ring(e.pos, { from: 0.2, to: R * 0.72, color: fxInfo.color, life: 0.24, opacity: 0.42, y: 0.075 });
      fx.burst(e.pos, {
        color: fxInfo.color, count: 12, speed: R * 1.35, life: 0.34,
        size: 0.11, y: 0.7, up: 0.9, gravity: 5, radius: 0.1,
      });
    }
    if (fxInfo.sfx) audio.sfx(fxInfo.sfx);

    if (kind === 'poison') {
      // 毒：范围内全部中毒（可叠时间，不叠层）——怪挤在一起时收益最高
      const dot = { dps: wstats.get('poisonDps'), time: wstats.get('poisonTime') };
      for (const o of around) enemies.applyDot(o, dot);
    } else if (kind === 'frost') {
      // 冰：范围内全部冻住（第 56 块起是「完全定身」，不是减速）
      const fz = { time: wstats.get('frostTime') };
      for (const o of around) enemies.applyFreeze(o, fz);
    } else if (kind === 'leech') {
      // 血：按「这一剑对圈内所有怪造成的总伤害」回血 —— 一圈扫到五只就按五只算
      const r = wstats.get('leechRate');
      if (r > 0 && totalDmg > 0) stats.heal(totalDmg * r);
    } else if (kind === 'quake') {
      // 震：圈内每只怪各自 35% 概率被震退 + 打断蓄力/读条（逐只独立判定）
      for (const o of around) {
        if (o.state === 'dead' || Math.random() >= QUAKE_CHANCE) continue;
        enemies.interrupt(o);
        enemies.knockback(o, _playerAt.x, _playerAt.z, QUAKE_KNOCK);
      }
    }
  }

  // 剑命中：伤害与暴击全部来自剑自己（rollSwordDamage），
  // 不再叠加主角攻击/暴击，也不再按主角吸血回血（用户：两者没有任何关系）
  function hitEnemy(e, at, kind) {
    const roll = rollSwordDamage(wstats, { targetArmor: e.cfg.armor });
    const dmg = roll.damage;
    enemies.takeDamage(e, dmg, roll.crit, { cls: 'phys' });
    // 第 106 块：环剑命中数 + 累计伤害（成就 sword_5000 / dmg_*）。
    // 只记**直接命中**这一次，元素溅射不重复计 —— 不然「命中 5000 次」
    // 会被毒/冰那圈溅射灌水，和玩家体感的「挥了多少剑」对不上。
    bumpStat('swordHits');
    if (dmg > 0) bumpStat('dmgDealt', dmg);
    // 第 82 块：剑扫过的地方也把木鱼灵的泡削一下（泡不在 enemies.list 里，
    // 走不到 takeDamage —— 得单独喂一遍）
    enemies.hitBubbles(at.x, at.z, SWORD_HIT_R + 0.35, dmg);
    audio.sfx('swordHit');
    applyKind(kind, e, dmg);
    if (fx) fx.hit(at, roll.crit ? 0xffe9a8 : 0xbff2ff);
    return dmg;
  }

  // 水平面剑-怪判定（剑在半空，怪贴地，Y 不参与）
  function findHit(x, z, list) {
    for (const e of list) {
      const dx = e.pos.x - x, dz = e.pos.z - z;
      const r = SWORD_HIT_R + e.cfg.radius;
      if (dx * dx + dz * dz <= r * r) return e;
    }
    return null;
  }

  // ---------------- 雷剑连锁的闪电（一条淡紫直线，0.22 秒淡出） ----------------
  function bolt(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, 1.0, from.z),
      new THREE.Vector3(to.x, 1.0, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xb08cff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    bolts.push({ line, geo, mat, t: 0, life: 0.22 });
  }

  // ---------------- 每帧 ----------------
  function update(dt, { playerPos, onHudChange } = {}) {
    if (!granted || muted) return;
    t += dt;
    // 万剑齐发冷却（第 56 块）：走表，归零就可再放
    if (fireCd > 0) fireCd = Math.max(0, fireCd - dt);

    const target = targetCount();
    const list = aliveEnemies();
    const p = playerPos || { x: 0, z: 0 };
    _playerAt.x = p.x; _playerAt.z = p.z;   // 震剑击退要用（第 29 块）

    // 0) 雷剑闪电淡出
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += dt;
      if (b.t >= b.life) {
        scene.remove(b.line);
        b.geo.dispose();
        b.mat.dispose();
        bolts.splice(i, 1);
      } else {
        b.mat.opacity = 0.95 * (1 - b.t / b.life);
      }
    }

    // 1) 恢复：整环补满制 —— 不管缺几把，都在 swordRefill 秒内均匀补满。
    //    每把的间隔 = 总时长 ÷ 拥有的剑数（5 把 → 2 秒/把，4 把 → 2.5 秒/把）。
    //    owned 是总库存，环上少的那几把一定是被消耗掉的，missingKind 直接找得到。
    if (orbiting.length < target) {
      regenT += dt;
      const need = Math.max(0.2, wstats.get('swordRefill') / Math.max(1, owned.length));
      while (orbiting.length < target && regenT >= need) {
        regenT -= need;
        const kind = missingKind() || 'iron';
        orbiting.push({ kind, holder: acquire(kind), spawnT: t });
        if (fx) fx.ring({ x: p.x, z: p.z }, { from: ORBIT_R * 0.4, to: ORBIT_R, color: SWORD_KINDS[kind].emissive, life: 0.45, opacity: 0.7, y: 0.06 });
      }
      if (orbiting.length >= target) regenT = 0;
      onHudChange?.();
    }

    // 2) 环上的剑：绕主角旋转 + 轻微上下浮动 + 碰怪即消耗
    //    第 85 块：被泡命中后会有一段 orbitHold —— 那段时间角度冻结（剑停在原处）。
    if (orbitHold > 0) {
      orbitHold = Math.max(0, orbitHold - dt);
    } else {
      // 剑阵反向已删除（第 117 块），环剑恒定正转
      orbitAngle += Math.PI * 2 * Math.max(0.05, wstats.get('swordOrbit')) * dt;
    }
    for (let i = orbiting.length - 1; i >= 0; i--) {
      const s = orbiting[i];
      const a = orbitAngle + (i * Math.PI * 2) / Math.max(1, orbiting.length);
      const x = p.x + Math.cos(a) * ORBIT_R;
      const z = p.z + Math.sin(a) * ORBIT_R;
      const h = s.holder;
      h.position.set(x, FLY_Y + Math.sin(t * 3 + i * 2.1) * 0.07, z);
      h.rotation.y = -a;
      // 刚长出来的剑 0.25 秒放大登场
      const age = t - s.spawnT;
      h.scale.setScalar(age < 0.25 ? 0.25 + 0.75 * (age / 0.25) : 1);

      const hit = findHit(x, z, list);
      if (hit) {
        hitEnemy(hit, _tmp.set(x, HIT_Y, z), s.kind);
        release(h);
        orbiting.splice(i, 1);
        regenT = 0;                 // 被消耗后重新计时
        onHudChange?.();
      }
    }

    // 3) 飞出去的剑：从发射点直线飞行 + 自转，命中怪物造成伤害后消失，出界直接散掉
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.dist += FLY_SPEED * dt;
      f.spin += dt * 14;
      const x = f.ox + Math.cos(f.a) * f.dist;
      const z = f.oz + Math.sin(f.a) * f.dist;
      f.holder.position.set(x, FLY_Y, z);
      f.holder.rotation.y = f.spin;
      f.holder.scale.setScalar(1);

      const hit = findHit(x, z, list);
      const out = f.dist > FLY_MAX_DIST
        || Math.hypot(x, z) > 17.5;   // 场地半径 15 + 石圈，出界就没
      if (hit) {
        hitEnemy(hit, _tmp.set(x, HIT_Y, z), f.kind);
        release(f.holder);
        flyers.splice(i, 1);
      } else if (out) {
        if (fx) fx.burst({ x, z }, { color: 0x9fd8e8, count: 6, speed: 1.6, life: 0.3, size: 0.09, y: FLY_Y, up: 0.8, gravity: 4 });
        release(f.holder);
        flyers.splice(i, 1);
      }
    }
  }

  // ---------------- 环剑停转（第 85 块） ----------------
  // 木鱼灵的追踪泡命中时调这个。取 max 而不是相加：连着挨两颗泡不该叠成 2.4 秒，
  // 那会把玩家锁在原地等死；只要「这段时间里一直有泡打中你」就不会恢复旋转，也够了。
  function holdOrbit(sec) {
    const s = Math.max(0, Number(sec) || 0);
    orbitHold = Math.max(orbitHold, s);
    return orbitHold;
  }

  // ---------------- 显示开关（结算后隐藏） ----------------
  function setVisible(v) {
    for (const s of orbiting) s.holder.visible = v;
    for (const f of flyers) f.holder.visible = v;
  }

  // 第 122 块：整把剑的开关（断剑挑战）。true = 剑彻底失效，并立刻藏起来。
  // 解禁时把手上还挂着的剑重新亮出来 —— 不清任何计数，等于「暂停」而不是「重置」。
  function setMuted(v) {
    muted = !!v;
    setVisible(!muted);
  }

  function reset() {
    for (const s of orbiting) release(s.holder);
    for (const f of flyers) release(f.holder);
    orbiting.length = 0;
    flyers.length = 0;
    for (const b of bolts) {
      scene.remove(b.line);
      b.geo.dispose();
      b.mat.dispose();
    }
    bolts.length = 0;
    owned = [];
    regenT = 0;
    fireCd = 0;
    orbitHold = 0;
    muted = false;              // 第 122 块：断剑挑战的开关不能跨局残留
    granted = false;
  }

  // 存档续玩（第 17 块）：按存档重建剑环。不走 grant()，避免触发获得特效与音效；
  // 武器属性加成（商店买的剑油等）在存档里是 wstats 的 mods 列表，这里重放。
  function restore(saved) {
    reset();
    if (!saved || !saved.granted) return;
    granted = true;
    owned = (Array.isArray(saved.owned) ? saved.owned : []).filter((k) => SWORD_KINDS[k]);
    if (!owned.length) owned = ['iron', 'iron', 'iron'];
    regenT = 0;
    for (let i = 0; i < owned.length; i++) {
      orbiting.push({ kind: owned[i], holder: acquire(owned[i]), spawnT: t });
    }
    if (Array.isArray(saved.mods)) wstats.loadMods(saved.mods);
  }

  // 技能栏 / 结算用的「每种剑各有几把」（只列拥有的，顺序按 KIND_ORDER）
  function kindCounts() {
    const m = new Map();
    for (const k of owned) m.set(k, (m.get(k) || 0) + 1);
    return KIND_ORDER.filter((k) => m.has(k)).map((k) => ({ kind: k, n: m.get(k) }));
  }

  return {
    preload, grant, fire, update, reset, restore, setVisible, addSword, kindCounts, applyKind,
    setMuted,                   // 第 122 块：断剑挑战（整把剑失效）
    get muted() { return muted; },
    // 第 85 块：木鱼灵的泡命中 → 环剑停转（停的是角度，剑还在原处照常砍）
    holdOrbit,
    get orbitHold() { return orbitHold; },
    // 第 63 块：擦名者可以摘走一把、杀死后还回来
    takeSword, returnSword,
    wstats,                     // 武器属性表（测试/调试用）
    get granted() { return granted; },
    get count() { return orbiting.length; },
    get owned() { return owned.slice(); },
    get max() { return owned.length; },        // 已不再限制，保留字段给旧调用/测试
    get target() { return targetCount(); },
    get orbitingCount() { return orbiting.length; },
    get flyingCount() { return flyers.length; },
    get orbitAngle() { return orbitAngle; },   // 调试/测试用
    // 第 64 块：环上此刻每种剑的顺序表（测试「恢复顺序随机化」用）
    get ringKinds() { return orbiting.map((s) => s.kind); },
    // 万剑齐发冷却（第 56 块）：ready = 冷却走完；cdLeft 剩余秒数；progress 0→1 填满
    get fireReady() { return granted && fireCd <= 0; },
    get fireCdLeft() { return fireCd; },
    get fireCdTotal() { return FIRE_CD * cdMul; },
    get fireCdProgress() { return granted ? Math.max(0, Math.min(1, 1 - fireCd / (FIRE_CD * cdMul))) : 0; },
    // 第 58 块：局外商店技能CD缩短 —— 直接乘倍率（下限 0.1，防止 CD 被刷到 0）
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (fireCd > 0) fireCd = Math.min(fireCd, FIRE_CD * cdMul);
    },
    // 技能栏恢复进度条：0（刚消耗）→ 1（下一把剑就绪）；满剑时恒为 0
    get regenProgress() {
      if (orbiting.length >= targetCount()) return 0;
      const need = Math.max(0.2, wstats.get('swordRefill') / Math.max(1, owned.length));
      return Math.max(0, Math.min(1, regenT / need));
    },
  };
}
