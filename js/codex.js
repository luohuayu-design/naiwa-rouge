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

import { ENEMY_TYPES } from './enemy.js?v=114';
import { SWORD_KINDS } from './swordKinds.js?v=114';
import { RELIC_DEFS } from './relics.js?v=114';
import { UPGRADES } from './upgrade.js?v=114';
import { ALL_EVENTS } from './events.js?v=114';
import { RARITIES } from './rarity.js?v=114';
import { codexAll, codexCount } from './profile.js?v=114';

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
  // 寄存处看守（第 83 块，第 96 块补到五招）：它只在柜子满了才出场，所以数值行
  // 要带上「五套攻击」和「半血暴怒」—— 玩家在图鉴里得先知道这东西不是拿来硬顶的。
  if (cfg.warden) {
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ' · 满柜召唤 · 五套攻击 · 半血暴怒';
  }
  // 盖章人（第 97 块）：数值行要把「多久盖一次」写出来 ——
  // 它的生命/伤害都不吓人，吓人的是频率。
  if (cfg.seal) {
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ` · 每 ${cfg.attackInterval} 秒盖一次印 · 封印 ${cfg.seal.time} 秒`;
  }
  // 称量官（第 82 块）：它自己的数值不重要，重要的是「它叠的那一层」。
  // 写穿上称间隔和三层加成 —— 玩家得先知道「为什么突然都变快了」。
  if (cfg.weigh) {
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ` · 每 ${cfg.weigh.every} 秒上称一次`;
  }
  const line = statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]]);
  // 并联体（第 80 块）：真正伤人的是电弧，不从这条线上说清楚，玩家会拿它当普通近战
  if (cfg.arc) return `${line} · 电弧 1 伤 / 次`;
  return Number.isFinite(cfg.damage) ? line : `${line} · 从不还手`;
}

// 怪物一句话说明：按「它给你什么压力」分类，第二关三个巫师各有专属文案
function enemyDesc(cfg) {
  // 寄存处看守（第 83 块；第 96 块从三招扩到五招）：第八关唯一由玩法召唤出来的怪。
  // 文案要把「怎么来的」「五套攻击怎么躲」「半血会变凶」说全 —— 玩家第一眼
  // 看到它从柜子里走出来时，是没有时间读说明的（世界不暂停）。
  // ⚠️ 图鉴 desc 是 textContent 渲染的（见 main.js 的 cx-desc），**不能写 HTML 标签、
  // 也不能写**加粗**，否则玩家看到的是字面的 `<b>` 和星号。
  if (cfg.warden) {
    const w = cfg.warden;
    return `爆发压力：寄存柜攒满 8 块牌子就会把它放出来 —— 它不是刷出来的，是你没清柜的代价。`
      + `五套攻击：贴脸（${w.sweepR} 格内）横扫，前摇半秒、脚下一圈橙光；`
      + `中距在你脚下钉三个金圈，${w.slamDelay} 秒后落锤；`
      + `同一档还有木牌雨 —— 它正面张开一片扇形，往后退没用，必须绕到侧面或背后；`
      + `拉远到 9 格外它就抡木牌砸过来，而且那块牌会拐一次弯追你（闪一次它跟着拐，再闪才躲得掉）；`
      + `另外它还会回身砸开寄存柜放小怪出来（一次两只，最多同时三只）。`
      + `血量掉到 ${Math.round(w.rageAt * 100)}% 会暴怒：移速 ×${w.rageSpeed}、出手间隔 ×${w.rageGap}，自发光转暗金。`
      + `所以「贴脸站着换血」和「拉远了跑」都不安全 —— 它逼你一直在换距离，也逼你判断方向`;
  }
  // 并联体（第 75 块，第 80 块把机制写全）：这是唯一一个「危险不在它身上、
  // 在它们之间」的怪，不说清 n 只连几条、多久咬一次、缝在哪，玩家只会觉得莫名掉血。
  if (cfg.arc) return '区域压力：两只以上就成网 —— 场上每两只之间都拖着一条悬空电弧（2 只 1 条、3 只 3 条、4 只 6 条，不用成对出现），多远的都连。碰到电弧掉 1 点血，同一下之间隔 0.7 秒，站在交叉口不会瞬间连扣。电弧无视无敌时段（受击那一下的无敌挡不住它），所以别贴着线硬冲。它们之间会互相推开、两两保持 8 格以上 —— 中间那几段缝就是你唯一的活路；它很耐打，别想一刀断网，拆掉一只它牵的线整片跟着断';
  // 盖章人（第 97 块）：它和第六关的紫阵最容易混（都是"地上画一块"），
  // 所以文案必须把两者的区别说穿：紫阵是铺着等你踩，方印是追着你此刻的位置盖。
  if (cfg.seal) {
    const se = cfg.seal;
    return `走位压力：它只干一件事 —— 在你此刻站的脚下盖一枚红方印，${cfg.windup} 秒后落。`
      + `落印时人还在框里，就掉 ${cfg.damage} 点血并被「封印」${se.time} 秒：移速只剩 ${Math.round(se.slow * 100)}%，`
      + `想跑也跑不快。它自己很脆（${cfg.hp} 血，两下就没），但每 ${cfg.attackInterval} 秒就盖一枚 —— `
      + `站着输出会被连着盖，边打边挪它才盖不中。`
      + `和紫阵的区别：紫阵铺在地上等你踩，可以绕；方印钉的是你此刻的位置，绕不开，只能一直动。`
      + `所以第九关真正的节奏是「别在称量官面前站桩」—— 你一停手，印就落下来`;
  }
  // 称量官（第 82 块）：第九关唯一的正解是「先拆它」，文案必须把这句话说穿 ——
  // 它自己几乎不打人，玩家第一反应一定是「先打围上来的」，那就正好踩进机制里。
  if (cfg.weigh) {
    const p = cfg.weigh.per;
    return `记账压力：它自己几乎不打人，活儿是给全场叠层 —— 每 ${cfg.weigh.every} 秒翻一次簿子，场上所有存活的怪一起加：移速 +${Math.round(p.speed * 100)}%、伤害 +${Math.round(p.damage * 100)}%、减伤 +${Math.round(p.armor * 100)}%，最多 ${cfg.weigh.cap} 层（被记名的怪脚下会长出一只金环，层数越大环越大）。拖着不管，同一批骷髅会每九秒换一副更凶的面孔；砍掉它，所有层当场清零。所以它躲得比谁都远，也只在你够不到它的时候最快活 —— 它翻开簿子站定那 ${cfg.attackDuration} 秒，就是这一关的输出窗口`;
  }
  if (cfg.erase) return '损失压力：它从不还手，读条 4.5 秒后把你环上的一把剑「擦掉」，然后转身往场地外跑 —— 跑出去那把剑这一局就没了。冰剑冻住 / 震剑击退 / 冲过去砍死它，都行';
  if (cfg.reboot) return '耐心压力：打死不算完 —— 躺 4 秒后原地半血重启，而且比上一次更快（最多重启 2 次）。地上那圈红光就是倒计时，守着它补刀';
  if (cfg.charge) return '机动压力：地上一道直线就是它的冲锋路线 —— 横向侧移能躲，撞完它会僵一下（那就是输出窗口）';
  if (cfg.leap) return '空间压力：蓄力后跳向你「当时」站的那个点，地上的红圈就是落点 —— 离开那个点，它在僵直里等你打';
  if (cfg.ghost) return '信息压力：显形 3 秒、隐身 2.5 秒轮着来；隐身时打不着它，但它照样能咬你（第 61 块取消了「贴脸逼它现形」）—— 只能等它自己露头';
  if (cfg.shield) return '节奏压力：举盾时减伤 70% 且不移动，放下盾才正常挨打 —— 挑窗口再打';
  if (cfg.spell && cfg.spell.kind === 'mend') return '续航压力：定时给半场内的怪回血（回合越往后奶得越多）；它不画范围圈，但被治的怪身上会冒绿光 —— 顺着绿光找过去先拆它';
  if (cfg.spell && cfg.spell.kind === 'brood') return '兵源压力：每几秒在脚下孵 2 只小兵（名下最多 6 只）—— 不点掉她，这回合永远清不完';
  if (cfg.selfDestruct) return '追到脚边就自爆 —— 别让它贴太近';
  if (cfg.contactRange != null) return '近战型，脚下的圈就是它的攻击范围';
  // 木鱼灵（第 82 块重写）：原来是照抄咒面图腾的 hex 圈（连数值都一样），
  // 现在吐的是**会追人的实体泡** —— 要说清「能打爆」「绕圈能甩掉」「命中是定住 +
  // 环剑停转，不是减速」这几件事，不然玩家会拿躲紫阵的办法去躲泡（错了：躲不掉，得处理）。
  // 第 85 块：泡更大、一次两颗、吐得更勤，命中还会把环剑冻住 —— 文案跟着改。
  if (cfg.bubble) return `纠缠压力：一次吐 ${cfg.bubble.count || 1} 颗青泡慢慢追你（比你还慢，但会拐弯跟着你），追上是 ${cfg.bubble.damage ?? 1} 点伤害并把你定住 ${cfg.bubble.root} 秒 —— 那几秒一步都走不了，环上的剑也跟着停转，比咒面图腾的减速狠得多。泡有 ${cfg.bubble.hp} 点血，砍两下就炸，也可以靠横向绕圈把它甩掉（它拐弯很笨）。所以它不是「躲一片地」，而是「处理一个追着你的东西」`;
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
