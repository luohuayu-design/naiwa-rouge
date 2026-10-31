// ============================================================
// golem.js —— 法器「傀儡术」的傀儡系统（第 107 块）
//
// 用户定案（原话）：
//   「拥有之后技能 UI 多一个，有冷却时间，点击之后游戏暂停，要求选择卡片
//    铁傀儡或雪傀儡，铁傀儡不拉仇恨，但是会攻击，雪傀儡拉仇恨，优先级高于主角，
//    攻击会击退怪物，但是不会伤害，贴图就用MC的」
//   「同时一只，死了可再召」＋「三选一卡池加入傀儡相关内容（提高生命攻击），
//    神话级别（传说卡）允许场上同时两只」
//
// 职责拆分（谁管什么）：
//   · relics.js 只管「买到没有 / 几级」—— 傀儡的属性随法器等级走（hpMul/atkMul）；
//   · skills.js 只管那颗按钮（可见 / 冷却显示 / 按下时叫 main 打开二选一）；
//   · upgrade.js 的傀儡卡通过 applyCard() 把加成打进来（生命 flat / 攻击 pct / 上限）；
//   · 本文件管傀儡本体：建模（MC 官方贴图 + 方块拼装）、战斗、嘲讽、死亡。
//
// 嘲讽的实现（这一块改动面最大的地方，刻意不动 enemy.js 的 25 套行为）：
//   1. **走路重定向**：enemy.js 的 moveToward 顶部加了一层 —— 怪如果**正朝玩家走**
//      （移动方向与「怪→玩家」同向），就改成朝场上那只雪傀儡走；逃跑向的怪
//      （擦名者等）方向与「怪→玩家」相反，dot < 0，不受影响。一处改动覆盖全部怪。
//   2. **贴脸磨血**：怪的出手判定全都对着玩家（contactRange / attackRange vs
//      playerPos），围到雪傀儡身边的怪永远不会触发那套代码 —— 所以「怪在打它」
//      由本文件模拟：任何活怪贴到雪傀儡 1.05 格内，就持续按它自己的伤害
//      （e.damage × 0.8/秒）磨傀儡的血。雪傀儡死光血就碎，仇恨立刻回到主角。
//   3. 远程怪（弓手/投手）保持距离的行为也是对着玩家的，它们**不被嘲讽** ——
//      该射主角还是射主角。这正是 MC 里「雪傀儡顶在前面」的用法：它挡的是
//      追过来的近战，不是狙击枪。
//
// 模型版权说明（用户知情并拍板）：方块模型是程序化拼的，贴图取自 Minecraft
// 官方资源（iron_golem.png / snow_golem.png，版权归 Mojang）。这是用户明确
// 要求的（「贴图就用MC的」），风险已知。
// ============================================================
import * as THREE from '../lib/three.module.js?v=141';
import { distance2D } from './stats.js?v=141';
import audio from './audio.js?v=141';

// ---- 数值（用户定案 + 我的拍板，都写在这里方便改） ----
const CD_TOTAL = 40;        // 技能冷却：召出（或傀儡阵亡）后要等这么久才能再召
const IRON_BASE_HP = 14;    // 铁傀儡基础生命
const SNOW_BASE_HP = 10;    // 雪傀儡基础生命
const IRON_ATK_RATIO = 1.5; // 铁傀儡一拳 = 主角此刻攻击 × 1.5（用户：主力级输出）
const IRON_ATK_CD = 2.0;    // 两秒一拳
const IRON_REACH = 2.1;     // 铁傀儡的胳膊够得着多远
const IRON_SPEED = 1.65;    // 第 110 块：铁傀儡追怪的移速（比主角慢半档，追得上但甩得开）
const IRON_LEASH = 7.5;     // 追击半径：最近的怪在这个距离内才去追（太远的不追，跟着主角走）
const IRON_FOLLOW = 2.2;    // 没怪可打时，离主角超过这么远就走回去待命
const SNOW_ATK_CD = 1.4;    // 雪傀儡扔雪球间隔
const SNOW_REACH = 9.0;     // 雪傀儡的雪球射程
const SNOW_KNOCK = 2.2;     // 雪球击退距离（格）
const SNOWBALL_SPEED = 12;  // 雪球飞行速度
const TAUNT_ABSORB_R = 1.05; // 怪离雪傀儡这么近就算「正在打它」
const ABSORB_MUL = 0.8;     // 贴脸怪每秒磨掉 倍率 × 它自己的伤害

const CD_MIN = 16;          // 召唤冷却下限（速召卡叠多了兜底）
const IRON_ATK_CD_MIN = 0.8; // 铁傀儡出手间隔下限（连击卡叠多了兜底）

// 法器等级加成（relics.puppet 1~3 级）
const RELIC_HP_MUL = [1, 1.3, 1.6];
const RELIC_ATK_MUL = [1, 1.25, 1.5];

// ---- MC 方块 UV：把一张 MC 皮肤按「盒面展开图」贴到 BoxGeometry 上 ----
// BoxGeometry 的面顺序：+x / -x / +y / -y / +z / -z，每个面 4 个顶点，
// uv 依次是 (0,1)(1,1)(0,0)(1,0)。MC 的盒面展开：上/下两行 + 四面一行。
function mcBox(wPx, hPx, dPx, u, v, TW, TH, tex) {
  const geo = new THREE.BoxGeometry(wPx / 16, hPx / 16, dPx / 16);
  // 六个面的矩形（MC 约定）：右 / 左 / 上 / 下 / 前 / 后
  const rects = [
    [u, v + dPx, dPx, hPx],               // +x
    [u + dPx + wPx, v + dPx, dPx, hPx],   // -x
    [u + dPx, v, wPx, dPx],               // +y
    [u + dPx + wPx, v, wPx, dPx],         // -y
    [u + dPx, v + dPx, wPx, hPx],         // +z（脸在这一面）
    [u + dPx + wPx + dPx, v + dPx, wPx, hPx], // -z
  ];
  const uvA = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = rects[f];
    const u0 = rx / TW, u1 = (rx + rw) / TW;
    const v1 = 1 - ry / TH, v0 = 1 - (ry + rh) / TH;   // flipY = true，v 要翻
    const o = f * 4;
    uvA.setXY(o + 0, u0, v1);
    uvA.setXY(o + 1, u1, v1);
    uvA.setXY(o + 2, u0, v0);
    uvA.setXY(o + 3, u1, v0);
  }
  uvA.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  return new THREE.Mesh(geo, mat);
}

// 血条：一块小画布贴 Sprite（自动朝向相机）。只在血量变化时重画。
function makeHpBar(top) {
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 6;
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  spr.scale.set(0.72, 0.09, 1);
  spr.position.y = top;
  let lastPct = -1;
  function draw(pct) {
    const p = Math.max(0, Math.min(1, pct));
    if (Math.abs(p - lastPct) < 0.01 && lastPct >= 0) return;
    lastPct = p;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 48, 6);
    g.fillStyle = 'rgba(6,10,12,0.78)';
    g.fillRect(0, 0, 48, 6);
    // 绿 → 黄 → 红，随血量走
    g.fillStyle = p > 0.5 ? '#67d06c' : (p > 0.25 ? '#e8c25a' : '#e05a4e');
    g.fillRect(1, 1, Math.round(46 * p), 4);
    tex.needsUpdate = true;
  }
  draw(1);
  return { spr, draw };
}

export function createGolemSystem({ scene, fx, enemies }) {
  const list = [];            // 场上傀儡
  let cd = 0;                 // 技能冷却剩余（0 = 可用）
  let capBonus = 0;           // 传说卡「上限 +1」
  const hpBonus = { iron: 0, snow: 0 };   // 三选一卡：生命 flat
  let atkBonus = 0;           // 三选一卡：铁傀儡攻击 pct（0.3 = +30%）
  let relicLv = 0;            // 法器等级（main 每帧喂，或 buy 时喂）
  let playerAttack = () => 1; // 主角此刻攻击（main 喂）
  // 第 118 块：火种（傀儡那一簇）/ 盲盒的法器增幅 —— dmg 同时乘生命与攻击
  let amp = { dmg: 1 };
  const snowballs = [];       // 飞行中的雪球
  // 第 108 块：傀儡卡第二批（召唤CD / 铁傀儡出手 / 雪球击退 / 雪球减速）
  let cdCut = 0;              // Σ 召唤 CD 缩短（秒），下限 CD_MIN
  let ironSpdPct = 0;         // Σ 铁傀儡出手加速（乘在 IRON_ATK_CD 上，下限 IRON_ATK_CD_MIN）
  let snowKnockFlat = 0;      // Σ 雪球击退加值（格）
  let snowSlowT = 0;          // 雪球命中减速时长（秒；>0 才生效）
  const SNOW_SLOW_FACTOR = 0.45; // 减速幅度（固定 45%，卡叠的是时长）

  const texIron = new THREE.TextureLoader().load('assets/golems/iron_golem.png');
  texIron.magFilter = THREE.NearestFilter;   // MC 像素风：绝不双线性糊掉
  texIron.minFilter = THREE.NearestFilter;
  const texSnow = new THREE.TextureLoader().load('assets/golems/snow_golem.png');
  texSnow.magFilter = THREE.NearestFilter;
  texSnow.minFilter = THREE.NearestFilter;

  const cap = () => 1 + capBonus;
  const ready = () => cd <= 0 && list.length < cap();

  // ---- 模型：铁傀儡（MC 比例，1px = 1/16 格，整体再 ×1.15 拉到 2.4 高） ----
  // 头 8×10×8@(0,0) · 身 18×12×10@(0,40) · 臂 4×30×4@(60,40) · 腿 4×12×4@(0,80)
  function buildIron() {
    const g = new THREE.Group();
    const P = 1 / 16;                       // 一个 MC 像素的世界尺寸
    const legL = mcBox(4, 12, 4, 0, 80, 128, 128, texIron);
    const legR = mcBox(4, 12, 4, 0, 80, 128, 128, texIron);
    legL.position.set(-6 * P, 6 * P, 0);
    legR.position.set(6 * P, 6 * P, 0);
    const body = mcBox(18, 12, 10, 0, 40, 128, 128, texIron);
    body.position.set(0, (12 + 6) * P, 0);
    const head = mcBox(8, 10, 8, 0, 0, 128, 128, texIron);
    head.position.set(0, (24 + 5) * P, -0.04);
    // 手臂挂在肩膀上（Group 做 pivot，甩臂才绕肩转）
    const mkArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 11 * P, 22 * P, 0);
      const arm = mcBox(4, 30, 4, 60, 40, 128, 128, texIron);
      arm.position.y = -15 * P;          // 网格重心下移：从肩上垂下来
      pivot.add(arm);
      return pivot;
    };
    const armL = mkArm(-1), armR = mkArm(1);
    g.add(legL, legR, body, head, armL, armR);
    g.scale.setScalar(1.15);
    g.userData.baseScale = 1.15;
    g.userData.parts = { armL, armR, head };
    return g;
  }

  // ---- 模型：雪傀儡（头 8×8×8@(0,0) 带南瓜脸 · 身 12×12×12@(0,20)） ----
  function buildSnow() {
    const g = new THREE.Group();
    const P = 1 / 16;
    const body = mcBox(12, 12, 12, 0, 20, 64, 64, texSnow);
    body.position.set(0, 6 * P, 0);
    const head = mcBox(8, 8, 8, 0, 0, 64, 64, texSnow);
    head.position.set(0, (12 + 4) * P, 0);
    g.add(body, head);
    g.scale.setScalar(1.3);
    g.userData.baseScale = 1.3;
    g.userData.parts = { head };
    return g;
  }

  function summon(kind, at) {
    if (!ready() || (kind !== 'iron' && kind !== 'snow')) return null;
    const lv = Math.max(1, relicLv);
    const baseHp = kind === 'iron' ? IRON_BASE_HP : SNOW_BASE_HP;
    const maxHp = Math.round((baseHp * RELIC_HP_MUL[lv - 1] + hpBonus[kind]) * amp.dmg);
    const root = kind === 'iron' ? buildIron() : buildSnow();
    root.position.set(at.x, 0, at.z);
    const bar = makeHpBar(kind === 'iron' ? 2.6 : 1.75);
    root.add(bar.spr);
    scene.add(root);
    const g = {
      kind, hp: maxHp, maxHp, root, bar,
      x: at.x, z: at.z,
      atkT: 0.6,          // 落地半秒多后才出手（给玩家看清它站哪）
      swing: 0,           // 出手动画计时
      born: 0,            // 落地小动画计时
    };
    list.push(g);
    cd = Math.max(CD_MIN, CD_TOTAL - cdCut);
    if (fx) {
      fx.ring({ x: at.x, z: at.z }, { from: 0.3, to: 1.5, color: kind === 'iron' ? 0xd8dade : 0xbfe8ff, life: 0.5, opacity: 0.8, y: 0.05 });
      fx.burst(root.position, { color: kind === 'iron' ? 0xd8dade : 0xffffff, count: 14, speed: 1.6, life: 0.4, size: 0.09, y: 1.0, up: 1.2 });
    }
    audio.sfx(kind === 'iron' ? 'upgrade' : 'card');
    return g;
  }

  function die(g) {
    const ix = list.indexOf(g);
    if (ix >= 0) list.splice(ix, 1);
    scene.remove(g.root);
    g.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    if (fx) {
      fx.burst(new THREE.Vector3(g.x, 0.9, g.z), { color: 0xd8dade, count: 18, speed: 2.0, life: 0.5, size: 0.1, y: 1.0, up: 1.4 });
      fx.text({ x: g.x, z: g.z }, g.kind === 'iron' ? '铁傀儡碎了' : '雪傀儡化了', { color: '#e8ecf0', y: 1.6, size: 0.7 });
    }
    audio.sfx('die');
  }

  function hurt(g, dmg) {
    g.hp -= dmg;
    g.bar.draw(g.hp / g.maxHp);
    if (g.hp <= 0) die(g);
  }

  // ---- 每帧 ----
  // anchor：{ x, z, r } 主角位置 + 当前场地半径（第 110 块传入 ——
  // 铁傀儡没怪可打时要用它走回来、并夹在场地内；不传就站桩，行为同旧版）
  function update(dt, anchor) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    // 雪球飞行
    for (let i = snowballs.length - 1; i >= 0; i--) {
      const b = snowballs[i];
      b.t += dt;
      const k = Math.min(1, b.t * SNOWBALL_SPEED / b.dist);
      b.mesh.position.set(
        b.x0 + (b.x1 - b.x0) * k,
        0.9 + Math.sin(Math.PI * k) * 0.5,     // 一条小抛物线
        b.z0 + (b.z1 - b.z0) * k,
      );
      if (k >= 1) {
        scene.remove(b.mesh);
        snowballs.splice(i, 1);
        // 落点击退：目标还活着才退（雪球不伤害，用户原话）
        if (b.target && enemies.hittable(b.target)) {
          enemies.knockback(b.target, b.x0, b.z0, SNOW_KNOCK + snowKnockFlat);
          // 第 108 块：「彻骨寒雪」卡 —— 被雪球砸中的怪减速（只降移速，不冻结）
          if (snowSlowT > 0) enemies.applySlow(b.target, { factor: SNOW_SLOW_FACTOR, time: snowSlowT });
          if (fx) fx.ring({ x: b.x1, z: b.z1 }, { from: 0.2, to: 0.9, color: 0xeaf6ff, life: 0.35, opacity: 0.7, y: 0.5 });
        }
      }
    }

    for (const g of [...list]) {
      if (g.born < 1) {
        g.born = Math.min(1, g.born + dt * 3);
        const base = g.root.userData.baseScale || 1;
        g.root.scale.setScalar(base * (0.4 + 0.6 * g.born));
      }
      const parts = g.root.userData.parts || {};
      // 出手挥手动画
      if (g.swing > 0) {
        g.swing = Math.max(0, g.swing - dt * 3.4);
        if (parts.armL) {
          parts.armL.rotation.x = -Math.sin(g.swing * Math.PI) * 1.9;
          parts.armR.rotation.x = -Math.sin(g.swing * Math.PI) * 1.9;
        }
      } else if (parts.armL) {
        parts.armL.rotation.x = Math.sin(g.born * 8 + g.x) * 0.06;   // 待机轻摆
        parts.armR.rotation.x = -Math.sin(g.born * 8 + g.x) * 0.06;
      }
      if (parts.head) parts.head.rotation.y = Math.sin(g.born * 3 + g.z) * 0.12;

      // ---- 铁傀儡：不拉仇恨，nearest 敌人两秒一拳（主力级输出）。
      //      第 110 块修复「站着干等怪走近」：追击半径内有怪就**主动走过去**，
      //      没怪可打就走回主角身边待命；甩臂动画期间站定不滑步。 ----
      if (g.kind === 'iron') {
        g.atkT -= dt;
        let near = null, nd = Infinity;
        for (const e of enemies.list) {
          if (!enemies.hittable(e)) continue;
          const d = distance2D(e.pos, g) - (e.cfg.radius || 0);
          if (d < nd) { nd = d; near = e; }
        }
        const hunting = !!near && nd <= IRON_LEASH;   // 太远的怪不追（那是主角的事）
        let dirX = 0, dirZ = 0, moved = false;
        if (g.swing <= 0) {
          if (hunting && nd > IRON_REACH * 0.85) {
            // 朝目标走：到拳距的 85% 就停下出拳（贴太脸反而被怪群围住）
            const d = Math.max(0.0001, Math.hypot(near.pos.x - g.x, near.pos.z - g.z));
            const step = Math.min(IRON_SPEED * dt, d);
            dirX = (near.pos.x - g.x) / d; dirZ = (near.pos.z - g.z) / d;
            g.x += dirX * step; g.z += dirZ * step;
            moved = true;
          } else if (!hunting && anchor) {
            // 没怪可打：回到主角身边待命（跟紧一点，下一波怪刷出来就近）
            const da = Math.max(0.0001, Math.hypot(anchor.x - g.x, anchor.z - g.z));
            if (da > IRON_FOLLOW) {
              const step = Math.min(IRON_SPEED * dt, da);
              dirX = (anchor.x - g.x) / da; dirZ = (anchor.z - g.z) / da;
              g.x += dirX * step; g.z += dirZ * step;
              moved = true;
            }
          }
          if (moved) {
            // 夹回场地（追怪别追出界；井口对傀儡无害，不用绕）
            if (anchor && anchor.r) {
              const lim = anchor.r - 0.7;
              const dc = Math.hypot(g.x, g.z);
              if (dc > lim) { g.x = (g.x / dc) * lim; g.z = (g.z / dc) * lim; }
            }
            g.root.position.set(g.x, 0, g.z);
          }
          // 朝向（项目约定 rotY = atan2(dx, dz)）：走哪看哪；站定有怪就面向怪
          if (hunting) g.root.rotation.y = Math.atan2(near.pos.x - g.x, near.pos.z - g.z);
          else if (moved) g.root.rotation.y = Math.atan2(dirX, dirZ);
        } else if (near) {
          g.root.rotation.y = Math.atan2(near.pos.x - g.x, near.pos.z - g.z);
        }
        if (near && nd <= IRON_REACH && g.atkT <= 0) {
          g.atkT = Math.max(IRON_ATK_CD_MIN, IRON_ATK_CD * (1 - ironSpdPct));
          g.swing = 1;
          const dmg = Math.max(1, Math.round(IRON_ATK_RATIO * playerAttack() * RELIC_ATK_MUL[(relicLv || 1) - 1] * (1 + atkBonus) * amp.dmg));
          enemies.takeDamage(near, dmg, false, { cls: 'phys' });
        }
      } else {
        // ---- 雪傀儡：拉仇恨（走路重定向在 enemy.js）+ 雪球纯击退。
        //      它**站桩不挪窝** —— 仇恨锚点挪来挪去会把拉怪的阵型搅乱（第 110 块）。 ----
        g.atkT -= dt;
        let near = null, nd = SNOW_REACH;
        for (const e of enemies.list) {
          if (!enemies.hittable(e)) continue;
          const d = distance2D(e.pos, g);
          if (d < nd) { nd = d; near = e; }
        }
        if (near && g.atkT <= 0) {
          g.atkT = SNOW_ATK_CD;
          g.swing = 1;
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xf2f8ff }),
          );
          const dist = Math.max(0.1, Math.hypot(near.pos.x - g.x, near.pos.z - g.z));
          mesh.position.set(g.x, 0.9, g.z);
          scene.add(mesh);
          snowballs.push({ mesh, x0: g.x, z0: g.z, x1: near.pos.x, z1: near.pos.z, dist, t: 0, target: near });
        }
        // ---- 贴脸磨血：怪不会真的「出手打」傀儡（它们的所有判定都对着玩家），
        //      所以贴到脸上的怪由这里模拟输出。每帧按伤害 ×0.8/秒 磨。 ----
        let grind = 0;
        for (const e of enemies.list) {
          if (!enemies.hittable(e)) continue;
          if (distance2D(e.pos, g) <= TAUNT_ABSORB_R + (e.cfg.radius || 0)) grind += (e.damage || 1) * ABSORB_MUL;
        }
        if (grind > 0) hurt(g, grind * dt);
      }
    }
  }

  // ---- 三选一卡入口（upgrade.js 的 up.golem 卡走这里） ----
  // card: { stat:'hp', kind:'iron'|'snow', flat:N } / { stat:'atk', flat:0.3 } / { stat:'cap', flat:1 }
  // 第 108 块新增：cdCut（召唤CD-秒）/ ironSpd（铁傀儡出手+pct）/ snowKnock（雪球击退+格）/
  //                snowSlow（雪球减速：首张点亮，时长 +flat 秒）
  function applyCard(card) {
    if (card.stat === 'hp' && hpBonus[card.kind] != null) hpBonus[card.kind] += card.flat;
    else if (card.stat === 'atk') atkBonus += card.flat;
    else if (card.stat === 'cap') capBonus += card.flat;
    else if (card.stat === 'cdCut') cdCut += card.flat;
    else if (card.stat === 'ironSpd') ironSpdPct += card.flat;
    else if (card.stat === 'snowKnock') snowKnockFlat += card.flat;
    else if (card.stat === 'snowSlow') snowSlowT += card.flat;
    // 上限卡是唯一要立刻生效在**活着的**傀儡身上的（生命卡对已召出的不追补，
    // 下一只才吃 —— 和「厚皮」不追补旧血是同一个口径）；
    // 召唤 CD 卡只影响下一次冷却（正在转的那段不追改）。
  }

  function reset() {
    for (const g of [...list]) {
      scene.remove(g.root);
      g.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    list.length = 0;
    for (const b of snowballs) scene.remove(b.mesh);
    snowballs.length = 0;
    cd = 0;
    capBonus = 0;
    hpBonus.iron = 0; hpBonus.snow = 0;
    atkBonus = 0;
    relicLv = 0;
    cdCut = 0; ironSpdPct = 0; snowKnockFlat = 0; snowSlowT = 0;
  }

  return {
    summon, update, reset, applyCard, ready,
    // main 每帧喂的输入
    setRelicLevel: (lv) => { relicLv = lv || 0; },
    setPlayerAttack: (fn) => { playerAttack = fn || (() => 1); },
    // 第 118 块：法器增幅（生命与攻击一起乘，取值 1 = 不增幅）
    setRelicAmp: (a) => { amp = { dmg: 1, ...(a || {}) }; },
    // ---- 观测口（main / 测试 / ?debug=1 用） ----
    tauntAt: () => {
      const g = list.find((x) => x.kind === 'snow');
      return g ? { x: g.x, z: g.z } : null;
    },
    count: () => list.length,
    cap,
    cdLeft: () => +cd.toFixed(2),
    cdTotal: () => Math.max(CD_MIN, CD_TOTAL - cdCut),
    info: () => list.map((g) => ({
      kind: g.kind, hp: +g.hp.toFixed(2), maxHp: g.maxHp, x: +g.x.toFixed(2), z: +g.z.toFixed(2),
    })),
    bonuses: () => ({
      cap: cap(), hp: { ...hpBonus }, atk: atkBonus,
      cdCut, ironSpd: ironSpdPct, snowKnock: snowKnockFlat, snowSlowT,
      cdTotal: Math.max(CD_MIN, CD_TOTAL - cdCut),
      ironAtkCd: Math.max(IRON_ATK_CD_MIN, IRON_ATK_CD * (1 - ironSpdPct)),
    }),
    hasIron: () => list.some((g) => g.kind === 'iron'),
    hasSnow: () => list.some((g) => g.kind === 'snow'),
  };
}
