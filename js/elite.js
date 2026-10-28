// ============================================================
// elite.js —— 精英怪 + 掉落词条系统（第 115 块 · 设计见 DESIGN.md）
//
// 创意方向（用户 2026-10-28 选）：「随机精英怪带光环，掉落本局限定词条」。
//
//   精英怪：每回合随机概率刷一只，体型 ×1.3、金描边、带名字前缀。
//     带 1 个「光环」词条（4 选 1）：
//       狂暴 —— 周围怪攻速 +30%
//       哺育 —— 每 10 秒召 2 只普通怪
//       荆棘 —— 近战攻击它的怪反伤
//       迟缓 —— 周围玩家移速 −20%
//   打死精英必掉一件「本局词条」（局内生效，不进局外）：
//       迅猛 +15% 攻速 / 疾风 +12% 移速 / 嗜血 击杀回 1 血 / 磁铁 拾取 ×1.5
//
// ⚠️ 零 import 业务模块（同 crafting.js / elementReaction.js 约定）。
//   精英的「刷出 / 光环结算」由 main.js 在波次生成处接入，本文件只给
//   纯逻辑 + 数据表，之后接线只加「rollElite() / applyAura()」两处。
// ============================================================

// ---------------- 精英光环（4 选 1） ----------------
export const AURA_DEFS = {
  berserk: { name: '狂暴', desc: '周围怪攻速 +30%', aura: 'attackSpeed', value: 0.30 },
  nurture: { name: '哺育', desc: '每 10 秒在脚下召 2 只普通怪', aura: 'spawn', interval: 10, count: 2 },
  thorns:  { name: '荆棘', desc: '近战攻击它的怪反伤', aura: 'reflect' },
  slow:    { name: '迟缓', desc: '周围玩家移速 −20%', aura: 'slowPlayer', value: 0.20 },
};
export const AURA_IDS = Object.keys(AURA_DEFS);

// ---------------- 掉落词条（本局限定） ----------------
export const MOD_DEFS = {
  haste: { name: '迅猛', desc: '攻速 +15%', stat: 'attackSpeed', value: 0.15 },
  swift: { name: '疾风', desc: '移速 +12%', stat: 'moveSpeed', value: 0.12 },
  leech: { name: '嗜血', desc: '击杀回 1 点生命', stat: 'killHeal', value: 1 },
  magnet:{ name: '磁铁', desc: '拾取范围 ×1.5', stat: 'pickupRange', value: 1.5 },
};
export const MOD_IDS = Object.keys(MOD_DEFS);

// 精英概率：每回合刷一只精英的基础概率（用户定：随机 20%）
const ELITE_CHANCE = 0.20;

// ============================================================
// 系统本体
// ============================================================
export function createEliteSystem(deps = {}) {
  const { rng = Math.random, onElite = () => {}, onModDrop = () => {} } = deps;

  // 本局已掉落的词条（本局限定）
  const mods = {};

  // 每回合开始：roll 是否刷精英。返回精英配置或 null。
  function rollElite() {
    if (rng() >= ELITE_CHANCE) return null;
    const aura = AURA_IDS[Math.min(AURA_IDS.length - 1, (rng() * AURA_IDS.length) | 0)];
    const elite = { aura, def: AURA_DEFS[aura] };
    onElite(elite);
    return elite;
  }

  // 精英死亡：必掉一件词条。返回词条 id。
  function dropMod() {
    const id = MOD_IDS[Math.min(MOD_IDS.length - 1, (rng() * MOD_IDS.length) | 0)];
    mods[id] = (mods[id] || 0) + 1;
    onModDrop(id);
    return id;
  }

  // 查当前词条（本局限定）
  function hasMod(id) { return (mods[id] || 0) > 0; }
  function modSnapshot() { return { ...mods }; }

  function serialize() { return { mods: { ...mods } }; }
  function restore(saved) {
    if (saved && saved.mods) {
      for (const id of MOD_IDS) mods[id] = saved.mods[id] || 0;
    }
  }
  function reset() { for (const id of MOD_IDS) mods[id] = 0; }

  return {
    rollElite, dropMod, hasMod, modSnapshot, serialize, restore, reset,
    DEFS: { AURA_DEFS, MOD_DEFS, ELITE_CHANCE },
  };
}
