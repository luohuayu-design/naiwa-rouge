// ============================================================
// enemy.js —— 怪物系统（模型加载 / 克隆 / AI / 血条 / 死亡）
//
// 模型来自 KayKit《Skeletons》（CC0），已裁剪成 7 段动画。
// 每只怪 = SkeletonUtils 克隆的蒙皮模型 + 独立 AnimationMixer。
//
// 第一关现在启用三种：
//   minion  小兵   —— 直线冲脸，碰到主角自毁并造成 1 伤害
//   warrior 战士   —— 追到近战距离后停下挥拳，攻击不扣自己的血
//   archer  投手   —— 远程：进射程拉弓 0.55 秒后掷出骨刀（有弹道，能靠横移躲开），
//                     主角贴太近会后退风筝（第 11 回合起登场）
//
// 第四种（mage）只写好了配置，暂不生成。
// ============================================================
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../lib/jsm/utils/SkeletonUtils.js';
import { distance2D } from './stats.js';
import { createRangeRing } from './rangeRing.js';

// KayKit 模型正面朝 +Z；如果哪天换模型发现怪倒着走，把这里改成 Math.PI
export const ENEMY_MODEL_YAW = 0;

// 动画名（裁剪时保留的 7 段，与 .tmp-shrink-glb.py 的 keep 列表一致）
const ANIM = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  hit: 'Hit_A',
  death: 'Death_A',
  spawn: 'Spawn_Ground',
  punch: 'Unarmed_Melee_Attack_Punch_A',
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
    speed: 2.15,           // 世界单位/秒（主角 4.4，能被拉开）
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
    speed: 1.32,
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
  // 行为：远远地绕着主角跑，进射程（7.0）就拉弓，前摇 0.55 秒后掷骨刀。
  // 骨刀是**实体弹道**（速度 8.5，飞 2.4 秒或出界消失）—— 主角移速 4.4，
  // 横向走两步就能躲开，所以伤害给到 2 也不算离谱。
  // 主角贴到 4.2 以内它会后退（风筝），但移速只有 1.55，跑不掉，追上去能秒。
  archer: {
    name: '骷髅投手',
    file: 'assets/monsters/skeleton-rogue.glb',
    sourceHeight: 1.10,    // 实测：蒙皮顶点法 + 三怪并排截图（投手比小兵高约 6%、比战士瘦，见 README「怪物身高标定」）
    height: 1.28,
    radius: 0.42,
    hp: 2,
    armor: 0,
    speed: 1.55,
    attackRange: 7.0,      // 射程：进了这个圈才开始拉弓
    keepDistance: 4.2,     // 比这个近就后退（不会站着被贴脸）
    damage: 2,             // 骨刀命中伤害（第 1 回合基准，之后按回合倍率成长）
    attackInterval: 2.6,   // 两次掷刀的间隔
    windup: 0.55,          // 前摇：拉弓到出手
    attackDuration: 0.85,  // 整段投掷动画时长（前摇 + 收势）
    projectile: {
      speed: 8.5,          // 骨刀飞行速度（世界单位/秒）
      radius: 0.30,        // 弹体判定半径
      life: 2.4,           // 最长存活时间（超时自散）
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

  // ---------------- 预案：巫师（暂不生成） ----------------
  // 魔法小怪：读条后放范围法术；光环给周围小怪加攻速/减伤，给主角上减速 debuff。
  mage: {
    name: '骷髅巫师', planned: true,
    file: 'assets/monsters/skeleton-mage.glb',
    sourceHeight: 1.20,    // 未标定（估算），启用前必须按原点诊断法重测
    height: 1.30, radius: 0.45, hp: 4, armor: 0, speed: 1.1,
    attackRange: 7.5, castTime: 1.6, damage: 1, attackInterval: 3.2,
    aura: { radius: 4.5, haste: 0.3 },        // 给范围内小怪 +30% 攻速
    debuff: { key: 'slow', factor: 0.55, duration: 3 },  // 主角移速 ×0.55
    spawnTime: 1.0, deathTime: 1.6, selfDestruct: false,
    color: 0xd7a8ff,
    anim: { walk: ANIM.walk, idle: ANIM.idle, death: ANIM.death, spawn: ANIM.spawn },
  },
};

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

    const maxHp = Math.max(1, Math.round(cfg.hp * (opts.hpScale ?? 1)));
    const damage = Math.max(1, Math.round(cfg.damage * (opts.damageScale ?? 1)));
    const speed = cfg.speed * (opts.speedScale ?? 1);

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
    root.add(model);

    // 脚下的范围环：只给「能近身伤到主角」的怪。
    // 远程（archer/mage）暂时不画，等第二关做射程提示时再上虚线环。
    const hasRing = cfg.ringColor != null && (
      cfg.contactRange != null
      || (cfg.attackRange != null && cfg.projectile == null && cfg.castTime == null)
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
      mats,
      bar,
      ring,
      baseEmissive: mats.map((m) => (m.emissive ? m.emissive.clone() : null)),
      currentAnim: '',
    };

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
    e.hp -= amount;
    if (!opts.dot) e.flashT = 0.1;
    e.bar.spr.visible = true;
    e.bar.draw(e.hp / e.maxHp, e.hp, e.maxHp);
    if (fx) {
      if (!opts.quiet && !opts.dot) {
        fx.hit(new THREE.Vector3(e.pos.x, 0.7, e.pos.z), crit ? 0xffe9a8 : e.cfg.color);
      }
      // 伤害统一保留 1 位小数（用户要求：所有数值都保留小数）
      if (!opts.noText) {
        fx.text({ x: e.pos.x, z: e.pos.z }, Math.max(0.1, amount).toFixed(1), {
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
          e.attackCd = Math.max(0.2, e.cfg.attackInterval - e.cfg.attackDuration);
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
          e.attackCd = e.cfg.attackInterval - e.cfg.attackDuration;
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
    e.pos.x += (dx / dist) * step;
    e.pos.z += (dz / dist) * step;

    // 场地边界
    const lim = ctx.arenaRadius - e.cfg.radius;
    const r = Math.hypot(e.pos.x, e.pos.z);
    if (r > lim) {
      e.pos.x = (e.pos.x / r) * lim;
      e.pos.z = (e.pos.z / r) * lim;
    }
  }

  // ---------------- 群体更新 ----------------
  function update(dt, ctx) {
    for (const e of list) updateOne(e, dt, ctx);
    updateShots(dt, ctx);

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
      e.mixer.stopAllAction();
      e.mixer.uncacheRoot(e.model);
    }
    list.length = 0;
    for (const s of shots) scene.remove(s.mesh);
    shots.length = 0;
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
    get: (type) => ENEMY_TYPES[type],
    // 调试/测试用
    all: () => list,
    _dbgCtx: _ctxTmp,
  };
}
