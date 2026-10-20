// ============================================================
// events.js —— 随机事件（夜行奇遇）
//
// 规则（用户定案）：
//   · 每回合开始前触发一次，有好事也有坏事，还有要做选择的；
//   · 效果只生效一回合（回合结束由 main.js 清掉临时加成）；
//   · 伏笔类（乞丐报恩）延迟几回合回来兑现。
//
// effects 字段（main.js 负责落地）：
//   mods   [{stat, flat?, pct?}]  本回合临时属性（回合结束自动撤销）
//   gold   ±n                     立刻结算金币
//   hp     ±n                     立刻结算生命（负数保底 0.5，不会一口咬死）
//   drain  n                      本回合每秒流失生命（可以磨死人，危险）
//   level  {countScale, speedScale} 本回合怪物数量 / 移速倍率（wave.js）
//   pledge {delay, icon, title, story, effects}  伏笔：delay 回合后回来兑现
//                        （pledge 里的 mods 是**永久**的，不算回合 buff）
//   roll   [{p, effects}, ...]    选项内部的概率分支（两瓶药水 / 老井）
//
// 出现规则：加权随机；同一事件 3 回合内不重复；cond 不满足的跳过。
// ============================================================
import { STAT_DEFS } from './stats.js';

export const EVENTS = [
  // ---------------- 纯坏 ----------------
  {
    id: 'coldWave', icon: '❄', title: '寒潮来袭',
    story: '夜里下了霜，草地结出一层白皮。奶蛙的脚掌粘在泥上，每一步都又冷又滑。',
    effects: { mods: [{ stat: 'moveSpeed', pct: -0.10 }] },
  },
  {
    id: 'swamp', icon: '🪵', title: '雾里的沼泽',
    story: '这段草地泡了水，泥浆没过脚踝。你挥掌都觉得被泥拽着，怪倒是不介意——它们没有脚。',
    effects: { mods: [{ stat: 'attackRange', flat: -0.3 }, { stat: 'moveSpeed', pct: -0.05 }] },
  },
  {
    id: 'thief', icon: '🐀', title: '草丛里的手',
    story: '一只戴头巾的骷髅从草里探出来，冲你咧嘴一笑，手里攥着你钱袋的一角。等你追上去，它已经钻进土里了。',
    effects: { gold: -6 },
  },
  {
    id: 'drummer', icon: '🥁', title: '骷髅鼓手',
    story: '不知哪里传来咚咚的鼓点。骷髅们踩着节奏前进，明显比平时来劲——原来它们也有排练。',
    effects: { level: { speedScale: 1.15 } },
  },
  // ---------------- 纯好 ----------------
  {
    id: 'drunkBanquet', icon: '🍺', title: '骷髅营地的庆功宴',
    story: '对面营地传来划拳声。几只骷髅已经喝趴下了，剩下的东倒西歪。这一波，能少打不少。',
    effects: { level: { countScale: 0.7 } },
  },
  {
    id: 'moonlight', icon: '🌙', title: '今晚月亮很好',
    story: '月光把骷髅的影子拉得很长。你突然能看清它们骨头缝里的空隙——出手知道往哪拍了。',
    effects: { mods: [{ stat: 'critRate', flat: 0.15 }] },
  },
  {
    id: 'fireflies', icon: '✨', title: '萤火虫群',
    story: '一群萤火虫围着你打转，微微的暖意渗进皮肤。伤口的痒意回来了——是愈合的痒。',
    effects: { mods: [{ stat: 'hpRegen', flat: 0.4 }] },
  },
  {
    id: 'wallet', icon: '💰', title: '遗落的钱袋',
    story: '草丛里躺着一只鼓鼓的钱袋，上面绣着骷髅头。你犹豫了半秒——死人是不会回来找钱的。',
    effects: { gold: 8 },
  },
  {
    id: 'dew', icon: '🌿', title: '带露的青草',
    story: '你顺手嚼了两根草叶上的露水，清凉直冲天灵盖。感觉又能多挨两下。',
    effects: { hp: 1.5 },
  },
  {
    id: 'caravan', icon: '🐫', title: '迷路的商队',
    story: '一支商队误入了骷髅地界，正手忙脚乱地卸货逃跑。散落一地的货物里，金子闪着光。',
    effects: { mods: [{ stat: 'goldRate', flat: 0.25 }] },
  },
  {
    id: 'wind', icon: '🌬', title: '夜风顺了',
    story: '一阵夜风从背后推来，你的剑转得飞快，快得只剩一圈残影。',
    cond: (ctx) => ctx.hasWeapon,
    effects: { mods: [{ stat: 'swordOrbit', pct: 0.40 }] },
  },
  {
    id: 'breeze', icon: '🍃', title: '顺风',
    story: '风从背后推着你，脚步都轻快了几分。',
    cond: (ctx) => !ctx.hasWeapon,
    effects: { mods: [{ stat: 'moveSpeed', pct: 0.06 }] },
  },
  // ---------------- 要做选择的 ----------------
  {
    id: 'beggar', icon: '🧎', title: '路边的老乞丐',
    story: '一只缺了半边下颚的老骷髅瘫在路边，碗里只有一颗石子。它抬起头看你，眼窝深处好像有光。',
    choices: [
      {
        label: '施舍 5 金币',
        desc: '它朝你深深鞠了一躬，消失在雾里。',
        effects: {
          gold: -5,
          pledge: {
            delay: 3, icon: '🫱',
            title: '老乞丐回来了',
            story: '雾里走出一个熟悉的身影——还是那只缺了半边下颚的骷髅。它捧着一袋金币和一把磨得发亮的骨刀，郑重地放在你面前，又鞠了一躬。',
            ok: '收下这份心意',
            effects: { gold: 12, mods: [{ stat: 'attack', flat: 1 }] },
          },
        },
      },
      {
        label: '摇头走开',
        desc: '它盯着你的背影看了很久，然后朝你脚边啐了一口。',
        effects: { drain: 0.1 },
      },
    ],
  },
  {
    id: 'potions', icon: '⚗', title: '两瓶可疑的药水',
    story: '树桩上摆着两瓶药水，标签早就烂没了。红的那瓶在冒泡，蓝的那瓶特别安静。远处传来骷髅的脚步声。',
    choices: [
      {
        label: '喝红的',
        desc: '颜色像草莓，也像油漆。',
        roll: [
          { p: 0.7, effects: { hp: 2 } },
          { p: 0.3, effects: { hp: -1 } },
        ],
      },
      {
        label: '喝蓝的',
        desc: '安静得可疑。',
        roll: [
          { p: 0.6, effects: { mods: [{ stat: 'attackSpeed', pct: 0.25 }] } },
          { p: 0.4, effects: { mods: [{ stat: 'moveSpeed', pct: -0.15 }] } },
        ],
      },
      { label: '都不喝', desc: '小心驶得万年船。', effects: {} },
    ],
  },
  {
    id: 'oldWell', icon: '🪣', title: '荒废的老井',
    story: '场地中央有口老井，井沿长满青苔。往里看黑漆漆的，隐约有金光，也隐约有别的东西在动。',
    choices: [
      {
        label: '探头看看',
        desc: '深呼吸，把头伸过去。',
        roll: [
          { p: 0.5, effects: { gold: 15 } },
          { p: 0.5, effects: { hp: -2 } },
        ],
      },
      { label: '绕着走', desc: '井里的东西也是要面子的。', effects: {} },
    ],
  },
  {
    id: 'lostSkull', icon: '💀', title: '迷路的小骷髅',
    story: '一只巴掌大的小骷髅在石头间打转，抱着一根比自己还高的木棍。它看见你，吓了一跳，木棍都拿反了。',
    choices: [
      {
        label: '给它指路',
        desc: '它朝你挥挥木棍，蹦蹦跳跳地走了。今晚也许会少几只怪。',
        effects: { level: { countScale: 0.8 } },
      },
      {
        label: '拍碎它',
        desc: '它碎成一堆骨头，眼窝里掉出三枚金币。',
        effects: { gold: 3 },
      },
    ],
  },
];

// ---------------- 抽取 ----------------
// ctx: { round, hasWeapon, gold }；recentIds：最近出现过的（3 回合内不重复）
export function pickEvent(ctx = {}, recentIds = [], rng = Math.random) {
  const recent = new Set(recentIds.slice(-3));
  const pool = EVENTS.filter((ev) => {
    if (recent.has(ev.id)) return false;
    if (ev.cond && !ev.cond(ctx)) return false;
    return true;
  });
  if (!pool.length) return null;
  const total = pool.reduce((a, e) => a + (e.weight ?? 1), 0);
  let r = rng() * total;
  for (const ev of pool) {
    r -= (ev.weight ?? 1);
    if (r < 0) return ev;
  }
  return pool[pool.length - 1];
}

// ---------------- 文案 ----------------
// 把 effects 翻译成事件卡上能直接展示的几行字
function modLine(m) {
  const def = STAT_DEFS.find((d) => d.key === m.stat);
  const name = def ? def.name : m.stat;
  if (m.pct != null) return `${name} ${(m.pct >= 0 ? '+' : '')}${(m.pct * 100).toFixed(1)}%（本回合）`;
  return `${name} ${(m.flat >= 0 ? '+' : '')}${m.flat.toFixed(1)}（本回合）`;
}

export function effectLines(effects = {}) {
  const lines = [];
  for (const m of effects.mods || []) lines.push(modLine(m));
  if (effects.gold > 0) lines.push(`金币 +${effects.gold}`);
  if (effects.gold < 0) lines.push(`金币 ${effects.gold}`);
  if (effects.hp > 0) lines.push(`生命 +${effects.hp.toFixed(1)}`);
  if (effects.hp < 0) lines.push(`生命 ${effects.hp.toFixed(1)}`);
  if (effects.drain > 0) lines.push(`每秒生命 -${effects.drain.toFixed(1)}（本回合）`);
  if (effects.level?.countScale != null) lines.push(`本回合怪物数量 ×${effects.level.countScale}`);
  if (effects.level?.speedScale != null) lines.push(`本回合怪物移速 ×${effects.level.speedScale}`);
  return lines;
}
