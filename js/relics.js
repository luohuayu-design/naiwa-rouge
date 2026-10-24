// ============================================================
// relics.js —— 随身法器（第 13 块新武器类型：与环剑并存的独立系统）
//
// 环剑之外的第二/第三件「武器」：不占格子、不进技能栏，买下即常驻，
// 跟着主角走。数值不吃主角攻击力也不吃剑表 —— 每件法器自己一套，
// 再买 = 升一级（最多 3 级），只在商店里获得。
//
//   spikes 地刺   解锁回合 ≥ 8，28 币，史诗
//     每 1.3 秒主角周围 3.0 格刺出一圈石刺，对范围内**所有**怪造成
//     物理伤害（0.7 / 1.05 / 1.4 按等级），被围住时的解场手段。
//   frost  霜环   解锁回合 ≥ 11，30 币，史诗
//     主角周围 2.8 格的冰环：环内怪每 0.5 秒掉一点冰伤并减速
//     （30% / 40% / 50% 按等级），风筝投手/弓手的保命底牌。
//
// 平衡考虑：两者都是「站在怪堆里才有收益」的近距离法器，
// 与环剑（自动索敌、消耗制）和炮台（固定点位）互补；价格定在
// 商店里「买得起但要攒一攒」的档，让 9/12/15/18 回合的商店有取舍。
// ============================================================
import * as THREE from '../lib/three.module.js?v=76';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=76';
import { distance2D } from './stats.js?v=76';
import audio from './audio.js?v=76';

export const RELIC_DEFS = {
  spikes: {
    name: '地刺',
    maxLevel: 3,
    radius: [3.0, 3.0, 3.4],
    interval: 1.3,
    damage: [0.7, 1.05, 1.4],
    desc: ['主角周围刺出石刺，0.7 伤/1.3 秒',
      '石刺更疼：1.05 伤/1.3 秒', '范围更大更疼：1.4 伤、半径 3.4'],
  },
  frost: {
    name: '霜环',
    maxLevel: 3,
    radius: [2.8, 2.8, 3.2],
    slow: [0.30, 0.40, 0.50],
    dps: [0.36, 0.60, 0.90],
    desc: ['冰环减速 30%，0.36 伤/秒', '减速 40%，0.60 伤/秒', '减速 50%、0.90 伤/秒、半径 3.2'],
  },
  // ---------------- 第三关新增（第 29 块） ----------------
  // 震钟：定期一圈冲击波，**打断**读条/蓄力/冲锋 + 击退。三关的骨骑冲锋与
  // 孢生菇的召唤都怕它 —— 这是「打断」这一层的解法，前两关用不上。
  bell: {
    name: '震钟',
    maxLevel: 3,
    radius: [3.2, 3.4, 3.6],
    interval: [6.0, 5.4, 4.8],
    damage: [0.5, 0.75, 1.0],
    knock: [1.2, 1.4, 1.6],
    desc: ['每 6 秒一圈钟波：打断蓄力、击退 1.2 格、0.5 伤',
      '每 5.4 秒：半径 3.4、击退 1.4、0.75 伤',
      '每 4.8 秒：半径 3.6、击退 1.6、1.0 伤'],
  },
  // 棘甲：被动反伤。被打的瞬间对身边一圈怪结算一次伤害 —— 被围住时的解场，
  // 和地刺（主动周期）/霜环（减速）节奏不同，不需要玩家操作。
  thorns: {
    name: '棘甲',
    maxLevel: 3,
    radius: [2.2, 2.4, 2.6],
    reflect: [0.6, 0.9, 1.2],
    desc: ['每次挨打，身边 2.2 内的怪各吃 0.6 伤',
      '身边 2.4 内的怪各吃 0.9 伤', '身边 2.6 内的怪各吃 1.2 伤'],
  },
  // ---------------- 第四关新增（第 35 块） ----------------
  // 暖炉：废服务区捡来的汽油桶，锯开半截塞进炭火，推着走。
  // 每 1 秒对身边一圈怪结算一次灼烧 —— 和地刺同属「主动周期」，
  // 但它是**高频低伤**（地刺是 1.3 秒一次的高伤），专治雾里那种
  // 血少、量大、还爱隐身的怪；缝补小巫奶回来多少，它一秒就烧回去一点。
  stove: {
    name: '暖炉',
    maxLevel: 3,
    radius: [2.2, 2.4, 2.6],
    interval: 1.0,
    damage: [0.5, 0.7, 0.9],
    desc: ['每秒灼烧 2.2 内的怪 0.5 伤 —— 高频低伤，专门磨小怪',
      '每秒 0.7 伤、半径 2.4', '每秒 0.9 伤、半径 2.6 —— 站在炉边就是一片火'],
  },
  // ---------------- 第五关新增（第 63 块） ----------------
  // 路口灯：草甸路口摊子上那盏油灯，被蛙爷塞给你了。
  // 每 4.2 秒亮一次，把一圈里**隐身的雾鬼强行点亮** —— 这是全游戏唯一的反隐手段。
  // 雾鬼从第 61 块起「隐身也能咬你、你却打不着它」，只靠等它自己露头太被动了；
  // 有了灯，玩家第一次能主动把雾里的东西拽出来。
  // 顺带减速 35%（灯下它看不清路），伤害很低（它本来就不是输出装）。
  lantern: {
    name: '路口灯',
    maxLevel: 3,
    radius: [4.2, 4.8, 5.4],
    interval: [4.2, 3.8, 3.4],
    slow: [0.30, 0.38, 0.45],
    damage: [0.3, 0.45, 0.6],
    desc: ['每 4.2 秒亮一次：4.2 内的雾鬼被迫显形、怪减速 30%、0.3 伤',
      '每 3.8 秒：半径 4.8、减速 38%、0.45 伤',
      '每 3.4 秒：半径 5.4、减速 45%、0.6 伤 —— 灯下没有影子'],
  },
  // 绝缘斗篷：从机房报废机柜上拆下来的绝缘布。
  // 被动：站在漏电地板上不掉血（第六关的核心反制），而且电会顺着斗篷
  // 导到身边的怪身上 —— 你踩着电，周围的怪替你挨。这是**以毒攻毒**型法器：
  // 只有第六关（有漏电地板）它才真正发力，别的关等于一件薄披风。
  insulator: {
    name: '绝缘斗篷',
    maxLevel: 3,
    radius: [2.4, 2.7, 3.0],
    dps: [0.5, 0.7, 0.9],
    desc: ['站在漏电地板上不掉血；通电时身边 2.4 内的怪每 0.5 秒吃 0.5 伤',
      '半径 2.7、0.7 伤', '半径 3.0、0.9 伤 —— 你踩的那块地板就是你的武器'],
  },
};

export function createRelicSystem({ scene, fx, enemies, onLanternReveal }) {
  const levels = { spikes: 0, frost: 0, bell: 0, thorns: 0, stove: 0, lantern: 0, insulator: 0 };
  const cds = { spikes: 0, frost: 0, bell: 0, thorns: 0, stove: 0, lantern: 0, insulator: 0 };

  // ---------------- 视觉 ----------------
  // 地刺（第 24 块）：KayKit「尖刺地板」里只取尖刺部分（CC0，带手绘贴图），
  // 加载好之前先用程序化石锥顶着（外观稍简，逻辑一致）。
  const spikeGeo = new THREE.ConeGeometry(0.10, 0.55, 5);
  const spikeMat = new THREE.MeshLambertMaterial({ color: 0x9a86ff, emissive: 0x4a2fb8 });
  let spikeTpl = null;        // 克隆模板（整个场景根，只藏掉石砖 —— 保住根节点的朝向/缩放）
  (async () => {
    try {
      const gltf = await new GLTFLoader().loadAsync('assets/props/spikes-trap.glb');
      const root2 = gltf.scene.clone(true);
      // ⚠️ 这份模型的结构是「石砖网格」包着「尖刺网格」（尖刺是砖的子节点）：
      //    不管藏节点还是藏网格都会连刺一起藏掉。只能把尖刺摘出来挂到根上，再扔掉石砖。
      let spikesMesh = null;
      root2.traverse((o) => { if (o.isMesh && /spike/i.test(o.name || '')) spikesMesh = o; });
      let hasSpikes = !!spikesMesh;
      if (hasSpikes) {
        root2.attach(spikesMesh);                    // 保持世界变换挪到根下
        root2.traverse((o) => {                      // 其余（石砖）全部丢弃
          if (o.isMesh && o !== spikesMesh) o.visible = false;
        });
      }
      if (hasSpikes) {
        // 源模型是 4×4 大砖上的刺丛：整丛缩到约 2.2 宽
        spikeTpl = root2;
        spikeTpl.scale.setScalar(0.55);
        const box = new THREE.Box3().setFromObject(spikeTpl);
        spikeTpl.position.y -= box.min.y;      // 底部落地
        spikeTpl.traverse((o) => {
          if (o.isMesh && o.visible && o.material && 'emissive' in o.material) {
            o.material.emissive = new THREE.Color(0x2a1f4a);
            o.material.emissiveIntensity = 0.55;
          }
        });
      }
    } catch (e) {
      console.warn('[relics] 尖刺模型加载失败，用程序化石锥', e && e.message);
    }
  })();
  const eruptions = [];       // { cones:[mesh], t, life, h }

  // 棘甲：脚下一圈暗红棘环（第 29 块）。平时很淡，反伤触发时闪一下。
  const thornRim = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 56).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xff6a4a, transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  thornRim.visible = false;
  thornRim.renderOrder = 2;
  scene.add(thornRim);
  let thornPulse = 0;

  // 霜环：贴地的半透明冰盘 + 细环，跟着主角走
  const frostDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x7fd4ff, transparent: true, opacity: 0.13,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  const frostRim = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xa8e6ff, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  frostDisc.visible = frostRim.visible = false;
  frostDisc.renderOrder = frostRim.renderOrder = 2;
  scene.add(frostDisc, frostRim);

  // ---------------- 暖炉（第 35 块）----------------
  // 视觉：汽油桶锯半截 + 一圈炭火 + 三只炉脚，纯程序化（项目里没有合适的炉子模型，
  // 而「废服务区捡来的油桶」比任何一个不搭调的道具都更像这关的东西）。
  // 平时绕主角慢慢转，火光呼吸；灼烧命中时炭火闪一下、溅两点火星。
  const stoveGroup = new THREE.Group();
  const ironMat = new THREE.MeshLambertMaterial({ color: 0x585349, emissive: 0x120a04 });
  {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.46, 14, 1, true), ironMat);
    drum.position.y = 0.30;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.055, 14), ironMat);
    lid.position.y = 0.57;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.20, 0.08, 14), ironMat);
    base.position.y = 0.06;
    stoveGroup.add(drum, lid, base);
    // 炭火：顶面一块发光盘 + 一簇摆动的小火苗
    const emberMat = new THREE.MeshBasicMaterial({
      color: 0xff7a2a, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.21, 18).rotateX(-Math.PI / 2), emberMat);
    ember.position.y = 0.60;
    ember.renderOrder = 2;
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffb15a, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 8), flameMat);
    flame.position.y = 0.75;
    flame.renderOrder = 2;
    stoveGroup.add(ember, flame);
    stoveGroup.userData.ember = ember;
    stoveGroup.userData.flame = flame;
  }
  stoveGroup.visible = false;
  scene.add(stoveGroup);
  let stovePulse = 0;      // 命中后的火光脉冲（1 → 0）
  let stoveAngle = 0;      // 绕主角的相位

  // 暖炉的暖圈（贴地，跟着主角 —— 判定中心是人不是炉子：
  // 「推着炉子走」听起来顺，玩起来也必须是「炉子在我身边所以这一圈是暖的」）
  const warmRim = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffa04a, transparent: true, opacity: 0.16,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  warmRim.visible = false;
  warmRim.renderOrder = 2;
  scene.add(warmRim);

  // ---------------- 路口灯（第 63 块，第五关）----------------
  // 一盏提在手里的油灯：铁皮框 + 暖黄芯，绕主角慢慢转（和暖炉错开相位）。
  // 每次「点亮」在地上摊开一大圈暖光，把雾鬼拽出来 —— 灯下没有影子。
  const lanternGroup = new THREE.Group();
  {
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x4a4234, emissive: 0x1a1408 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 0.20, 8, 1, true), frameMat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 8), frameMat);
    cap.position.y = 0.115;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.085, 0.035, 8), frameMat);
    foot.position.y = -0.115;
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffd06a, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), coreMat);
    lanternGroup.add(body, cap, foot, core);
    lanternGroup.userData.core = core;
  }
  lanternGroup.visible = false;
  scene.add(lanternGroup);
  let lanternAngle = 0.9;   // 和暖炉的 0 相位错开
  let lanternPulse = 0;

  // 灯照范围（贴地暖圈）：只在「亮起来的那一下」看得见，平时很淡
  const lanternRim = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffd06a, transparent: true, opacity: 0.14,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  lanternRim.visible = false;
  lanternRim.renderOrder = 2;
  scene.add(lanternRim);

  function buy(kind) {
    const def = RELIC_DEFS[kind];
    if (!def || levels[kind] >= def.maxLevel) return levels[kind] || 0;
    levels[kind]++;
    if (kind === 'frost') {
      frostDisc.visible = frostRim.visible = true;
    }
    if (kind === 'thorns') thornRim.visible = true;
    if (kind === 'stove') {
      stoveGroup.visible = true;
      warmRim.visible = true;
    }
    if (kind === 'lantern') {
      lanternGroup.visible = true;
      lanternRim.visible = true;
    }
    return levels[kind];
  }

  // 地刺：范围内所有活怪一起掉血（不暴击、显示伤害数字）
  function eruptSpikes(lv, at) {
    const def = RELIC_DEFS.spikes;
    const radius = def.radius[lv - 1];
    const dmg = def.damage[lv - 1];
    const foes = enemies.list.filter((e) =>
      e.state !== 'dead' && e.state !== 'spawn'
      && distance2D(at, e.pos) <= radius
    );
    for (const e of foes) {
      enemies.takeDamage(e, dmg, false, { quiet: false });
    }
    if (foes.length) audio.sfx('spikes');   // 第 25 块：破土闷响（打不到怪就不响，免得空转吵）
    // 视觉：尖刺从地里冒出来（主角周围一圈随机点位；有模型用尖刺丛，没加载好用石锥）
    const cones = [];
    for (let i = 0; i < (spikeTpl ? 6 : 10); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius * 0.85;
      const m = spikeTpl ? spikeTpl.clone() : new THREE.Mesh(spikeGeo, spikeMat);
      const x = at.x + Math.cos(a) * d;
      const z = at.z + Math.sin(a) * d;
      m.position.set(x, spikeTpl ? -1.25 : 0, z);
      m.rotation.y = Math.random() * Math.PI;
      m.frustumCulled = false;
      scene.add(m);
      cones.push(m);
    }
    eruptions.push({ cones, t: 0, life: 0.5, h: spikeTpl ? 1.25 : 0.5 });
    if (fx) fx.ring(at, { from: 0.3, to: radius, color: 0x9a86ff, life: 0.3, opacity: 0.55, y: 0.06 });
  }

  // 霜环：每 0.5 秒一拍，环内怪掉血 + 减速（dot 静默结算，避免数字刷屏）
  function frostTick(lv, at) {
    const def = RELIC_DEFS.frost;
    const radius = def.radius[lv - 1];
    const dmg = def.dps[lv - 1] * 0.5;
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (distance2D(at, e.pos) > radius) continue;
      enemies.takeDamage(e, dmg, false, { dot: true });
      if (e.state !== 'dead') enemies.applySlow(e, { factor: def.slow[lv - 1], time: 0.7 });
    }
  }

  // 震钟（第 29 块）：一圈钟波 —— 打断 + 击退 + 小伤害。
  // 伤害用 quiet 结算（十几只怪同时跳数字太吵），打断单独统计返回给测试。
  function ringBell(lv, at) {
    const def = RELIC_DEFS.bell;
    const radius = def.radius[lv - 1];
    const dmg = def.damage[lv - 1];
    const knock = def.knock[lv - 1];
    let hit = 0, broke = 0;
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (distance2D(at, e.pos) > radius) continue;
      hit++;
      enemies.takeDamage(e, dmg, false, { quiet: true });
      if (enemies.interrupt(e)) broke++;
      if (e.state !== 'dead') enemies.knockback(e, at.x, at.z, knock);
    }
    if (fx) {
      fx.ring(at, { from: 0.4, to: radius, color: 0xffd48a, life: 0.34, opacity: 0.65, y: 0.07 });
      fx.ring(at, { from: 0.2, to: radius * 0.55, color: 0xfff0c0, life: 0.22, opacity: 0.5, y: 0.08 });
    }
    if (hit) audio.sfx('aegis');   // 借用金钟罩的钟声（素材包里没有第二口钟）
    return { hit, broke };
  }

  // 棘甲（第 29 块）：挨打时对身边一圈怪反伤。由 main.js 的 hurtPlayer 调，
  // 返回反到的怪数量（0 = 身边没人，不吭声）。
  function thornsHit(at) {
    const lv = levels.thorns;
    if (lv <= 0) return 0;
    const def = RELIC_DEFS.thorns;
    const radius = def.radius[lv - 1];
    const dmg = def.reflect[lv - 1];
    let n = 0;
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (distance2D(at, e.pos) > radius) continue;
      enemies.takeDamage(e, dmg, false, { quiet: true });
      n++;
    }
    if (n) {
      thornPulse = 1;
      if (fx) fx.ring(at, { from: 0.4, to: radius, color: 0xff8a5a, life: 0.26, opacity: 0.55, y: 0.07 });
    }
    return n;
  }

  // 暖炉（第 35 块）：每 1 秒对身边一圈怪结算一次灼烧。
  // 静默结算（dot:true）—— 一秒一次、一次一圈，跳数字会糊满屏幕；
  // 伤害不暴击、不吃攻击力（法器的老规矩：自己一套数值）。
  function stoveTick(lv, at) {
    const def = RELIC_DEFS.stove;
    const radius = def.radius[lv - 1];
    const dmg = def.damage[lv - 1];
    let n = 0;
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (distance2D(at, e.pos) > radius) continue;
      enemies.takeDamage(e, dmg, false, { dot: true });
      n++;
    }
    if (n) {
      stovePulse = 1;
      if (fx) {
        // 火星往上飘一点点，别搞成大爆炸（它只是个炉子）
        fx.burst({ x: at.x + Math.cos(stoveAngle) * 0.9, z: at.z + Math.sin(stoveAngle) * 0.9 }, {
          color: 0xffa04a, count: 4, speed: 0.9, life: 0.5, size: 0.07, y: 0.62, up: 1.1,
        });
      }
    }
    return n;
  }

  // ============================================================
  // 路口灯（第 63 块）：每几秒点亮一次
  //   · 强行让圈里的隐身雾鬼显形（全游戏唯一的反隐手段）
  //   · 圈里所有怪减速 + 少量伤害（灯下它们看不清路）
  // ============================================================
  function lanternFlare(lv, at) {
    const def = RELIC_DEFS.lantern;
    const radius = def.radius[lv - 1];
    const dmg = def.damage[lv - 1];
    let shown = 0;
    let hit = 0;
    if (enemies.revealInRadius) shown = enemies.revealInRadius(at, radius);
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (distance2D(at, e.pos) > radius) continue;
      hit++;
      enemies.takeDamage(e, dmg, false, { dot: true });
      if (e.state !== 'dead') enemies.applySlow(e, { factor: def.slow[lv - 1], time: 0.9 });
    }
    lanternPulse = 1;
    if (fx) {
      // 两圈暖光：一圈摊到边界，一圈更亮收在里面 —— 像灯芯炸了一下
      fx.ring(at, { from: 0.3, to: radius, color: 0xffd06a, life: 0.42, opacity: 0.75, y: 0.07 });
      fx.ring(at, { from: 0.2, to: radius * 0.6, color: 0xfff0c0, life: 0.3, opacity: 0.55, y: 0.08 });
    }
    if (shown) {
      audio.sfx('aegis');                      // 有东西被照亮才响（没鬼的时候不吵）
      onLanternReveal?.(shown);                // 成就用：累计照出多少只
    }
    return { shown, hit };
  }

  // ============================================================
  // 绝缘斗篷（第 63 块）：不是主动法器，是被动
  //   · 站上通电地板不掉血（这个由 main.js 在扣血前问 relic 拿到的减伤倍率）
  //   · 站在通电地板上时，把电导给身边一圈的怪（0.5 秒一拍）
  // 「以毒攻毒」：第六关的地板本来是惩罚，穿上它就是武器。
  // ============================================================
  function insulatorTick(lv, at) {
    const def = RELIC_DEFS.insulator;
    const radius = def.radius[lv - 1];
    const dmg = def.dps[lv - 1];
    let n = 0;
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (distance2D(at, e.pos) > radius) continue;
      enemies.takeDamage(e, dmg, false, { dot: true });
      n++;
    }
    if (n && fx) {
      fx.ring(at, { from: 0.3, to: radius, color: 0x9ff4ff, life: 0.26, opacity: 0.6, y: 0.06 });
    }
    return n;
  }

  function update(dt, { playerPos, hazards } = {}) {
    // 石刺起落动画（模型尖刺：整丛从地下顶出来再缩回去）
    for (let i = eruptions.length - 1; i >= 0; i--) {
      const er = eruptions[i];
      er.t += dt;
      const k = er.t / er.life;
      const H = er.h || 0.5;
      const y = k < 0.4 ? -H + (k / 0.4) * H : -Math.max(0, 1 - (k - 0.4) / 0.6) * H;
      for (const c of er.cones) c.position.y = y;
      if (k >= 1) {
        for (const c of er.cones) scene.remove(c);
        eruptions.splice(i, 1);
      }
    }

    // 霜环盘子跟人走、呼吸
    const fl = levels.frost;
    if (fl > 0) {
      const r = RELIC_DEFS.frost.radius[fl - 1];
      frostDisc.position.set(playerPos.x, 0.05, playerPos.z);
      frostRim.position.set(playerPos.x, 0.06, playerPos.z);
      frostDisc.scale.setScalar(r * (1 + Math.sin(performance.now() / 480) * 0.025));
      frostRim.scale.setScalar(r);
    }

    // 棘甲环：跟着人走；触发反伤时闪一下（thornPulse 从 1 衰减到 0）
    const tl = levels.thorns;
    if (tl > 0) {
      const r = RELIC_DEFS.thorns.radius[tl - 1];
      thornPulse = Math.max(0, thornPulse - dt * 2.2);
      thornRim.position.set(playerPos.x, 0.045, playerPos.z);
      thornRim.scale.setScalar(r * (1 + thornPulse * 0.06));
      thornRim.material.opacity = 0.16 + 0.34 * thornPulse + Math.sin(performance.now() / 620) * 0.03;
    }

    // 暖炉：绕人慢转 + 火光呼吸 + 暖圈跟着主角（第 35 块）
    const stl = levels.stove;
    if (stl > 0) {
      const r = RELIC_DEFS.stove.radius[stl - 1];
      stoveAngle += dt * 0.55;
      const ox = Math.cos(stoveAngle) * 0.95;
      const oz = Math.sin(stoveAngle) * 0.95;
      stoveGroup.position.set(playerPos.x + ox, 0, playerPos.z + oz);
      stovePulse = Math.max(0, stovePulse - dt * 2.4);
      const flick = 0.86 + Math.sin(performance.now() / 90) * 0.08 + stovePulse * 0.25;
      const flame = stoveGroup.userData.flame;
      const ember = stoveGroup.userData.ember;
      if (flame) {
        flame.scale.set(0.9 + stovePulse * 0.5, flick, 0.9 + stovePulse * 0.5);
        flame.material.opacity = 0.55 + 0.3 * flick;
      }
      if (ember) ember.material.opacity = 0.75 + 0.2 * flick;
      warmRim.position.set(playerPos.x, 0.048, playerPos.z);
      warmRim.scale.setScalar(r * (1 + Math.sin(performance.now() / 520) * 0.02));
      warmRim.material.opacity = 0.13 + 0.10 * stovePulse + Math.sin(performance.now() / 430) * 0.02;
    }

    // 路口灯（第 63 块）：提着绕人转；每次点亮后暖光呼吸一下
    const ll = levels.lantern;
    if (ll > 0) {
      const r = RELIC_DEFS.lantern.radius[ll - 1];
      lanternAngle += dt * 0.7;
      const sway = Math.sin(performance.now() / 700) * 0.05;
      lanternGroup.position.set(
        playerPos.x + Math.cos(lanternAngle) * 0.82,
        1.35 + sway,
        playerPos.z + Math.sin(lanternAngle) * 0.82,
      );
      lanternPulse = Math.max(0, lanternPulse - dt * 2.6);
      const core = lanternGroup.userData.core;
      if (core) {
        core.material.opacity = 0.62 + 0.3 * lanternPulse + Math.sin(performance.now() / 110) * 0.06;
        core.scale.setScalar(1 + lanternPulse * 0.5);
      }
      lanternRim.position.set(playerPos.x, 0.05, playerPos.z);
      lanternRim.scale.setScalar(r * (1 + Math.sin(performance.now() / 700) * 0.02));
      lanternRim.material.opacity = 0.10 + 0.32 * lanternPulse;
    }

    // 绝缘斗篷（第 63 块）：被动，只有踩在**通电**的地板上才发力
    const il = levels.insulator;
    if (il > 0 && hazards && hazards.isPowered && hazards.isPowered(playerPos.x, playerPos.z)) {
      cds.insulator -= dt;
      if (cds.insulator <= 0) {
        cds.insulator = 0.5;
        insulatorTick(il, playerPos);
      }
    } else {
      cds.insulator = 0;
    }

    // 冷却与触发
    const sl = levels.spikes;    if (sl > 0) {
      cds.spikes -= dt;
      if (cds.spikes <= 0) {
        cds.spikes = RELIC_DEFS.spikes.interval;
        eruptSpikes(sl, playerPos);
      }
    }
    if (fl > 0) {
      cds.frost -= dt;
      if (cds.frost <= 0) {
        cds.frost = 0.5;
        frostTick(fl, playerPos);
      }
    }
    const bl = levels.bell;
    if (bl > 0) {
      cds.bell -= dt;
      if (cds.bell <= 0) {
        cds.bell = RELIC_DEFS.bell.interval[bl - 1];
        ringBell(bl, playerPos);
      }
    }
    const st = levels.stove;
    if (st > 0) {
      cds.stove -= dt;
      if (cds.stove <= 0) {
        cds.stove = RELIC_DEFS.stove.interval;
        stoveTick(st, playerPos);
      }
    }
    const ltn = levels.lantern;
    if (ltn > 0) {
      cds.lantern -= dt;
      if (cds.lantern <= 0) {
        cds.lantern = RELIC_DEFS.lantern.interval[ltn - 1];
        lanternFlare(ltn, playerPos);
      }
    }
  }

  function reset() {
    levels.spikes = 0;
    levels.frost = 0;
    levels.bell = 0;
    levels.thorns = 0;
    levels.stove = 0;
    levels.lantern = 0;
    levels.insulator = 0;
    cds.spikes = 0;
    cds.frost = 0;
    cds.bell = 0;
    cds.thorns = 0;
    cds.stove = 0;
    cds.lantern = 0;
    cds.insulator = 0;
    thornPulse = 0;
    stovePulse = 0;
    stoveAngle = 0;
    for (const er of eruptions) for (const c of er.cones) scene.remove(c);
    eruptions.length = 0;
    frostDisc.visible = frostRim.visible = false;
    thornRim.visible = false;
    stoveGroup.visible = false;
    warmRim.visible = false;
    lanternGroup.visible = false;
    lanternRim.visible = false;
    lanternPulse = 0;
  }

  // 存档续玩（第 17 块）：按存档重放等级（buy 不扣钱，扣钱在外层）
  function restore(saved) {
    for (const k of Object.keys(levels)) levels[k] = 0;
    frostDisc.visible = frostRim.visible = false;
    thornRim.visible = false;
    stoveGroup.visible = false;
    warmRim.visible = false;
    lanternGroup.visible = false;
    lanternRim.visible = false;
    let n = 0;
    for (const [k, lv] of Object.entries(saved || {})) {
      for (let i = 0; i < (lv | 0); i++) { buy(k); n++; }
    }
    return n;
  }

  return {
    buy, update, reset, restore, thornsHit,
    levels: () => ({ ...levels }),
    DEF: RELIC_DEFS,
    // 调试（第 29 块）：手动敲一次钟（截图/测试用）
    debugBell: (at) => ringBell(Math.max(1, levels.bell), at),
    // 调试（第 35 块）：手动烧一次暖炉（测试灼烧半径/伤害用，不依赖 1 秒节拍）
    debugStove: (at) => stoveTick(Math.max(1, levels.stove), at),
    // 调试（第 63 块）：手动点亮一次路口灯 / 手动电一次绝缘斗篷
    debugLantern: (at) => lanternFlare(Math.max(1, levels.lantern), at),
    debugInsulator: (at) => insulatorTick(Math.max(1, levels.insulator), at),
    // 调试（第 24 块）：在指定位置常驻一丛尖刺，供截图/检查
    debugShow: (x = 1.5, z = 0) => {
      if (!spikeTpl) return 'tpl-not-ready';
      const m = spikeTpl.clone();
      m.position.set(x, 0, z);
      scene.add(m);
      return 'ok';
    },
  };
}
