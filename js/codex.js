// ============================================================
// codex.js —— 图鉴（第 18 块）
//
// 五个页签：怪物 / 武器 / 法器 / 升级卡 / 奇遇。
// 数据全部来自各表（唯一真相源），这里只做渲染：
//   怪物   —— ENEMY_TYPES（planned 的隐藏）+ 本机击杀计数
//   武器   —— SWORD_KINDS 5 种
//   法器   —— RELIC_DEFS（地刺/霜环）+ 弩炮台
//   升级卡 —— UPGRADES 28 张（含品质色）
//   奇遇   —— ALL_EVENTS（遇到过的显示，没遇到的是 ??? 剪影）
//
// 「遇到过」的计数存在 profile.codex，埋点在 main.js
// （击杀 / 弹事件卡 / 选升级卡）。
// ============================================================

import { ENEMY_TYPES } from './enemy.js?v=71';
import { SWORD_KINDS } from './swordKinds.js?v=71';
import { RELIC_DEFS } from './relics.js?v=71';
import { UPGRADES } from './upgrade.js?v=71';
import { ALL_EVENTS } from './events.js?v=71';
import { RARITIES } from './rarity.js?v=71';
import { codexAll, codexCount } from './profile.js?v=71';

export const CODEX_TABS = [
  { id: 'enemies', name: '怪物' },
  { id: 'swords', name: '武器' },
  { id: 'relics', name: '法器' },
  { id: 'cards', name: '升级卡' },
  { id: 'events', name: '奇遇' },
];

// 数值格式化。**必须容错**：孢冠菌王按设计没有 damage 字段
// （它一次都不还手），旧写法 undefined.toFixed() 会让整个图鉴面板崩掉。
const NUM = (v) =>
  typeof v === 'number' && !Number.isNaN(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : null;

// 把有值的项拼成「生命 5 · 速度 0.9」，跳过 null，避免出现「伤害 —」这种噪音
const statLine = (pairs) =>
  pairs.filter(([, v]) => NUM(v) !== null).map(([k, v]) => `${k} ${NUM(v)}`).join(' · ');

// 怪物数值行。没有 damage 的（孢冠菌王）显式写「不还手」，
// 不然玩家会以为是数值漏填。
function enemySub(cfg) {
  const line = statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]]);
  return Number.isFinite(cfg.damage) ? line : `${line} · 从不还手`;
}

// 怪物一句话说明：按「它给你什么压力」分类，第二关三个巫师各有专属文案
function enemyDesc(cfg) {
  if (cfg.charge) return '机动压力：地上一道直线就是它的冲锋路线 —— 横向侧移能躲，撞完它会僵一下（那就是输出窗口）';
  if (cfg.leap) return '空间压力：蓄力后跳向你**当时**站的那个点，地上的红圈就是落点 —— 离开那个点，它在僵直里等你打';
  if (cfg.ghost) return '信息压力：平时半透明、隐身时无敌且打不着；显形 3 秒、隐身 2.5 秒，贴到它脸上能逼它现形';
  if (cfg.shield) return '节奏压力：举盾时减伤 70% 且不移动，放下盾才正常挨打 —— 挑窗口再打';
  if (cfg.spell && cfg.spell.kind === 'mend') return '续航压力：定时给周围一圈怪回血（回合越往后奶得越多）—— 不先拆它，前面的血全白打';
  if (cfg.spell && cfg.spell.kind === 'brood') return '兵源压力：每几秒在脚下孵 2 只小兵（名下最多 6 只）—— 不点掉她，这回合永远清不完';
  if (cfg.selfDestruct) return '追到脚边就自爆 —— 别让它贴太近';
  if (cfg.contactRange != null) return '近战型，脚下的圈就是它的攻击范围';
  if (cfg.spell && cfg.spell.kind === 'hex') return '时间压力：紫阵钉在脚下，落地掉血并减速 —— 看圈就走';
  if (cfg.spell && cfg.spell.kind === 'burn') return '空间压力：地上留一片灼地烧几秒 —— 好位置会被一点点烧掉';
  if (cfg.aura) return '目标选择压力：霜牢环钉在你脚下跟着你走，环里的怪加攻速、减伤还泛青光 —— 它还会放石刺、召卫队，优先点掉它';
  if (cfg.volley) return '远程型：钉住你脚下的红圈，倒计时结束落箭';
  return '远程型：躲在后面朝你扔东西';
}

// 每个页签产出 [{ title, sub, desc, meta, seen, count, color }]
export function codexEntries(tab) {
  if (tab === 'enemies') {
    return Object.entries(ENEMY_TYPES)
      .filter(([, cfg]) => !cfg.planned)
      .map(([id, cfg]) => ({
        id,
        title: cfg.name,
        sub: enemySub(cfg),
        desc: enemyDesc(cfg),
        meta: `击倒 ${codexCount('enemies', id)} 只`,
        // 第 51 块：怪物缩略图。PNG 都是离线渲染好的（.tmp-codex-shots.js），
        // 运行时只读图、不加载模型 —— 图鉴打开不该再多拉 2.7MB 的骨架。
        thumb: `assets/codex/${id}.webp`,
        seen: true,
        count: codexCount('enemies', id),
      }));
  }
  if (tab === 'swords') {
    return Object.entries(SWORD_KINDS).map(([id, k]) => ({
      id,
      title: k.name,
      sub: k.tagline,
      desc: k.desc,
      icon: k.icon,
      meta: '环剑 · 每 3 秒补一把',
      seen: true,
    }));
  }
  if (tab === 'relics') {
    const relicEntries = Object.entries(RELIC_DEFS).map(([id, d]) => ({
      id,
      title: d.name,
      sub: `${d.maxLevel} 级 · 伤害随等级成长`,
      desc: d.desc[d.maxLevel - 1],
      meta: '商店有售 · 按解锁回合出现',
      seen: true,
    }));
    relicEntries.push({
      id: 'turret',
      title: '弩炮台',
      sub: '上限 3 台 · 放下就永久存在',
      desc: '自动索敌射击，弩箭直线飞行 —— 摆好位置帮你守一路',
      meta: '商店有售 · 史诗',
      seen: true,
    });
    return relicEntries;
  }
  if (tab === 'cards') {
    return UPGRADES.map((up) => {
      const r = RARITIES[up.rarity] || RARITIES[0];
      return {
        id: up.id,
        title: up.name,
        sub: up.title,
        desc: up.desc,
        meta: `${r.name} · ${up.tag === 'atk' ? '进攻' : up.tag === 'def' ? '生存' : up.tag === 'agi' ? '机动' : '剑系'}`,
        seen: true,
        color: r.color,
      };
    });
  }
  // events：遇到过的显示全文标题，没遇到的是 ??? 剪影
  const seen = codexAll('events');
  return ALL_EVENTS.map((ev) => {
    const n = codexCount('events', ev.id);
    return {
      id: ev.id,
      title: n > 0 ? `${ev.icon || '❔'} ${ev.title}` : '？？？',
      sub: n > 0 ? ev.who : '还没遇上过',
      desc: n > 0 ? (ev.story || '').split('\n')[0] : '在荒草地里走下去，总会碰上的',
      meta: n > 0 ? `遇到 ${n} 次` : '',
      seen: n > 0,
    };
  });
}

// 汇总数字（面板页脚）
export function codexSummary() {
  return {
    enemies: Object.keys(ENEMY_TYPES).filter((k) => !ENEMY_TYPES[k].planned).length,
    swords: Object.keys(SWORD_KINDS).length,
    relics: Object.keys(RELIC_DEFS).length + 1,
    cards: UPGRADES.length,
    events: ALL_EVENTS.length,
    eventsSeen: ALL_EVENTS.filter((ev) => codexCount('events', ev.id) > 0).length,
  };
}
