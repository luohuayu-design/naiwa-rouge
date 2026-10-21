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
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';
import { distance2D } from './stats.js';
import audio from './audio.js';

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
};

export function createRelicSystem({ scene, fx, enemies }) {
  const levels = { spikes: 0, frost: 0 };
  const cds = { spikes: 0, frost: 0 };

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

  function buy(kind) {
    const def = RELIC_DEFS[kind];
    if (!def || levels[kind] >= def.maxLevel) return levels[kind] || 0;
    levels[kind]++;
    if (kind === 'frost') {
      frostDisc.visible = frostRim.visible = true;
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
    if (foes.length) audio.sfx('hit');
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

  function update(dt, { playerPos } = {}) {
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

    // 冷却与触发
    const sl = levels.spikes;
    if (sl > 0) {
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
  }

  function reset() {
    levels.spikes = 0;
    levels.frost = 0;
    cds.spikes = 0;
    cds.frost = 0;
    for (const er of eruptions) for (const c of er.cones) scene.remove(c);
    eruptions.length = 0;
    frostDisc.visible = frostRim.visible = false;
  }

  // 存档续玩（第 17 块）：按存档重放等级（buy 不扣钱，扣钱在外层）
  function restore(saved) {
    for (const k of Object.keys(levels)) levels[k] = 0;
    frostDisc.visible = frostRim.visible = false;
    let n = 0;
    for (const [k, lv] of Object.entries(saved || {})) {
      for (let i = 0; i < (lv | 0); i++) { buy(k); n++; }
    }
    return n;
  }

  return {
    buy, update, reset, restore,
    levels: () => ({ ...levels }),
    DEF: RELIC_DEFS,
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
