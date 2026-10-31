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

import { ENEMY_TYPES } from './enemy.js?v=147';
import { SWORD_KINDS } from './swordKinds.js?v=147';
import { RELIC_DEFS } from './relics.js?v=147';
import { UPGRADES } from './upgrade.js?v=147';
import { ALL_EVENTS } from './events.js?v=147';
import { RARITIES } from './rarity.js?v=147';
import { codexAll, codexCount } from './profile.js?v=147';

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
      + ` · 每 ${cfg.attackInterval} 秒盖一次印 · 封步持续到它死亡`;
  }
  // 称量官（第 82 块）：它自己的数值不重要，重要的是「它叠的那一层」。
  // 写穿上称间隔和三层加成 —— 玩家得先知道「为什么突然都变快了」。
  if (cfg.weigh) {
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ` · 每 ${cfg.weigh.every} 秒上称一次`;
  }
  // ---- 第十关四只（第 107 块）----
  // 照影：数值行写的不是固定值 —— 它是照着玩家抄的，写固定值会骗人。
  if (cfg.mirror) {
    const m = cfg.mirror;
    return `生命 你上限的 ${Math.round(m.hpRatio * 100)}% · 伤害 你攻击的 ${Math.round(m.dmgRatio * 100)}%`
      + ` · 每 ${m.every} 秒重照一次 · 移速照抄`;
  }
  // 收件人：它不打人，数值行要把「多久填一个 / 免多久」写出来。
  if (cfg.fill) {
    return statLine([['生命', cfg.hp], ['伤害', 0], ['速度', cfg.speed]])
      + ` · 每 ${cfg.fill.every} 秒填一个名字 · 免疫 ${cfg.fill.time} 秒`;
  }
  // 回声：它站得远、只负责照，数值行要写周期。
  if (cfg.echo) {
    const c = cfg.echo;
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ` · 每 ${c.every} 秒照回一只（半血，最多 ${c.cap} 只）`;
  }
  // ---- 第十一关两只（第 114 块）----
  // 誊录员：它真正的威胁是「频率 × 留痕」，所以数值行必须把这两件事写出来。
  if (cfg.ink) {
    const k = cfg.ink;
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ` · 每 ${cfg.attackInterval} 秒划一道 ${k.len} 格长的线 · 墨痕留 ${k.bandLife} 秒`;
  }
  // 收账人：它一次都不打人（伤害恒 0），写「伤害 0」会像漏填，所以整行重写。
  if (cfg.collect) {
    const c = cfg.collect;
    return `生命 ${cfg.hp} · 速度 ${cfg.speed} · 从不还手`
      + ` · 每 ${c.cd} 秒来收一次 · 读条 ${c.cast} 秒`;
  }
  // ---- 第十五关两只（第 128 块）----
  // 超管：伤害是 0，直接写「伤害 0」会像漏填，所以整行重写并写出禁言周期 ——
  // 它真正吓人的是「技能栏被锁」的那段时间，不是血条。
  if (cfg.mute) {
    return `生命 ${cfg.hp} · 速度 ${cfg.speed} · 从不还手`
      + ` · 每 ${cfg.attackInterval} 秒禁言一次 · 读条 ${cfg.attackDuration} 秒`;
  }
  // 弹幕：脆、出手密，数值行要把「多久吐一块字牌」写出来。
  if (cfg.projectile && cfg.projectile.word) {
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ` · 每 ${cfg.attackInterval} 秒吐一块字牌`;
  }
  // ---- 第十六关两只（第 129 块）----
  // 画框：伤害恒 0（它不碰你，它框你），写「伤害 0」会像漏填，整行重写并写清周期。
  if (cfg.cage) {
    const c = cfg.cage;
    return `生命 ${cfg.hp} · 速度 ${cfg.speed} · 从不上手`
      + ` · 每 ${cfg.attackInterval} 秒框你一次 · 画框 ${c.half * 2} 格宽、留 ${c.life} 秒`;
  }
  // 纸屑：脆皮自爆群 —— 数值行要把「1 血」和速度写出来，玩家才知道该用范围伤害扫。
  if (cfg.scrap) {
    return statLine([['生命', cfg.hp], ['伤害', cfg.damage], ['速度', cfg.speed]])
      + ' · 碰到就自爆 · 永远一群一群来';
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
      + `落印时人还在框里，就掉 ${cfg.damage} 点血并被「封步」：移速只剩 ${Math.round(se.slow * 100)}%，`
      + `而且这次封步会一直挂到盖章人死亡才解除。它自己很脆（${cfg.hp} 血，两下就没），但每 ${cfg.attackInterval} 秒就盖一枚 —— `
      + `站着输出会被连着盖，边打边挪它才盖不中。`
      + `和紫阵的区别：紫阵铺在地上等你踩，可以绕；方印钉的是你此刻的位置，绕不开，只能一直动。`
      + `所以第九关真正的节奏是「别在称量官面前站桩」—— 你一停手，印就落下来`;
  }
  // 称量官（第 82 块）：第九关唯一的正解是「先拆它」，文案必须把这句话说穿 ——
  // 它自己几乎不打人，玩家第一反应一定是「先打围上来的」，那就正好踩进机制里。
  if (cfg.weigh) {
    const p = cfg.weigh.per;
    return `记账压力：它自己几乎不打人，活儿是给全场叠层 —— 每 ${cfg.weigh.every} 秒翻一次簿子，场上所有存活的怪一起加：生命上限与当前血 +${Math.round(p.hp * 100)}%、伤害 +${Math.round(p.damage * 100)}%、移速 +${Math.round(p.speed * 100)}%、攻速 +${Math.round(p.haste * 100)}%、减伤按剩余伤害 ×${(1 - p.armor).toFixed(1)} 连乘，没有层数上限（被记名的怪脚下会长出一只金环，层数越大环越大）。拖着不管，同一批骷髅会每八秒换一副更凶的面孔；砍掉它，所有层当场清零。所以它躲得比谁都远，也只在你够不到它的时候最快活 —— 它翻开簿子站定那 ${cfg.attackDuration} 秒，就是这一关的输出窗口`;
  }
  // ---- 第十关四只（第 107 块）----
  // ⚠️ desc 走 textContent：**不能写 HTML、不能写 ** 加粗**，写了玩家看到的就是字面符号。
  if (cfg.mirror) {
    const m = cfg.mirror;
    return `养成压力：它是井水照出来的那个你 —— 生成时把你此刻的攻击、移速、暴击率抄一份，`
      + `血是你生命上限的 ${Math.round(m.hpRatio * 100)}%（夹在 ${m.hpFloor} 到 ${m.hpCap} 之间）。`
      + `你堆得越高，它打得越疼；每 ${m.every} 秒重照一次，中途吃了三选一变强，它也跟着变强。`
      + `移速是照抄的，所以跑是跑不掉的 —— 只能靠定身、击退，或者干脆别堆那么高。`
      + `它是这一关唯一一只「你的养成会反过来打你」的怪：阿井说的「别拼命变强了」，机制版就是它`;
  }
  if (cfg.fill) {
    const f = cfg.fill;
    return `换手压力：它自己一下都不打人，飘在后面给人填名字 —— 每 ${f.every} 秒给离你最近的一只怪填上名字，`
      + `那只怪接下来 ${f.time} 秒免疫你环上占多数的那一类伤害（头上会挂一圈白框）。`
      + `环上铁剑多就是免物理（近战、环剑、箭雨、炮台、地刺全打不动），`
      + `元素剑多就是免元素（溅射、雷链、毒全打不动）。`
      + `两个解法：换一类武器打，或者先把它拆了 —— 它只有 ${cfg.hp} 血，而且是躲着你走的`;
  }
  if (cfg.wait) {
    const w = cfg.wait;
    const r = cfg.rage;
    return `取舍压力：井壁上刻着「第 70 层，等」。它从上场起站着不动，头上那圈金环一直在缩 —— `
      + `缩没了它就活过来：血回满、移速 ${r.speed}、伤害 ×${r.dmgMul}。`
      + `它 ${cfg.hp} 血、站着不动，是全场最好打的目标；问题只是你愿不愿意现在花这个时间。`
      + `${(w.callAt || []).join(' / ')} 秒它会各动一下提醒你。`
      + `所以这一关每一波都要做一个判断：先拆它，还是抢在它醒前把这一波清完`;
  }
  if (cfg.echo) {
    const c = cfg.echo;
    return `滚雪球压力：井水照出过去的东西 —— 它每 ${c.every} 秒从这一局已经死掉的怪里随机挑一种，`
      + `在脚边照出一只半血版（带着当前回合的倍率，不是第 1 回合的小兵）。`
      + `只要它活着就一直照，场上最多同时 ${c.cap} 只。`
      + `和重启体的区别：重启体是自己躺下再起来、最多一次；回声是把别人的捡回来，而且不限次数。`
      + `它只有 ${cfg.hp} 血，但站得极远（${cfg.keepDistance} 格外）—— 越晚拆它，场上的旧面孔越多`;
  }
  // ---- 第十一关两只（第 114 块）----
  // 誊录员：本作第一个**方向性直线**攻击。文案的重点不是伤害，而是
  // 「线是直的、只能横着躲」+「它划过的地会留七秒」，这两件事决定打法。
  if (cfg.ink) {
    const k = cfg.ink;
    return `方向压力：它站着不动，抬笔 ${cfg.windup} 秒，然后朝你此刻的方向划一道 ${k.len} 格长的直线。`
      + `落笔那一下站在线上就掉 ${cfg.damage} 点血，随后那道墨痕会在地上留 ${k.bandLife} 秒 —— `
      + `站在墨上每秒掉 ${k.bandDps} 点，移速只有 ${Math.round(k.slow * 100)}%。同屏最多 ${k.maxBands} 道，旧墨会先干掉。`
      + `关键：它是**直线**，不是圈 —— 横着走一步就出判定，所以别往后退、也别沿着线的方向跑。`
      + `它站在 ${cfg.keepDistance} 格外不肯靠近，你得主动过去把它拆了（${cfg.hp} 血，不算耐打）`;
  }
  // 收账人：全书唯一一只「不造成伤害」的怪 —— 它的压力在资源上。
  // 文案要把「怎么打断」写死，否则玩家只会觉得莫名变弱。
  if (cfg.collect) {
    const c = cfg.collect;
    return `资源压力：它一次都不打你，活儿是从你身上「收」走一样东西 —— `
      + `贴到 ${c.range} 格内就翻开账簿读条 ${c.cast} 秒（头顶那圈金环在缩），`
      + `读满就随机收走你身上的一样：一项属性（一段时间内打折）或者一个技能（这段时间按不动）。`
      + `收完它转身就退场，${c.cd} 秒后再来。打断很简单：走出 ${Math.round(c.range * 1.35)} 格外，或者砍它一刀 —— `
      + `它只有 ${cfg.hp} 血，全场最脆的怪之一。`
      + `所以它考的不是手，是判断：你正在打的那一群和它，先处理哪个`;
  }
  // ---- 第十二关 · 加急袋鼠（第 116 块）----
  // 它不打人，压力在被它「加急」的那一群上：拖着不管，同一批怪突然变快变凶。
  if (cfg.rush) {
    const r = cfg.rush;
    return `优先目标：它自己一下都不打你，活儿是给队友「加急」—— 站在中距离外读条 ${cfg.windup} 秒，`
      + `读满给离你最近的那只怪挂上（头上会浮一个「加急」黄标），接下来 ${r.time} 秒那只怪`
      + `移速 ×${r.speedMul.toFixed(2)}、出手频率 ×${r.hasteMul.toFixed(1)}。`
      + `它只有 ${cfg.hp} 血、躲在中距离（${cfg.keepDistance} 格外不肯靠近），杀掉会掉一杯短咖啡（给你一点移速）。`
      + `所以它是这一关的「优先击杀」：要么打断它的读条、要么先点掉它，别让整群怪一起被加急`;
  }
  // ---- 第十五关两只（第 128 块）----
  // 超管：它的压力不在血条上，在「技能栏被锁住的那 3 秒」——
  // 玩家第一反应一定是先打围上来的，所以文案必须把「先拆谁」说穿。
  if (cfg.mute) {
    const m = cfg.mute;
    return `禁言压力：它一下都不打你 —— 躲在中距离读条 ${cfg.attackDuration} 秒（头顶一圈紫环在缩），`
      + `读满你的整个技能栏黑 ${m.duration} 秒：Q 环形灯、E 开播全都按不出来，`
      + `技能位不显示冷却、只显示还剩几秒。`
      + `它 ${cfg.hp} 血带 ${Math.round(cfg.armor * 100)}% 减伤，不难拆；真正的代价是那 ${m.duration} 秒 —— `
      + `刚想开播的时候被禁言，整波就白等了。`
      + `打断很简单：走出 ${cfg.attackRange} 格外，或者给它一刀，读条立刻断。`
      + `它自己躲着你走（总保持在 ${cfg.keepDistance} 格左右），所以每回合都要先答一个问题：`
      + `先追超管，还是先把冲上来的清完`;
  }
  // 弹幕：它瞄的是你「当时」的位置、不预判，所以躲法是「一直在动」，
  // 而不是像躲紫阵那样看圈。这两点不说清，玩家会觉得这弹道在追踪。
  if (cfg.projectile && cfg.projectile.word) {
    return `压制压力：它飘在 ${cfg.attackRange} 格外朝你吐「字牌」—— 每 ${cfg.attackInterval} 秒一块，`
      + `牌面直着飞、不翻滚，比投手的骨刀慢一点，但来得更密。撞上掉 ${cfg.damage} 点血。`
      + `牌上写的就是直播间那些话（就这? / 下播吧），一排横着飞过来的时候会挡视线。`
      + `躲法只有一条：它瞄的是你「当时」的位置，不预判 —— 横着挪一步就错开，站着不动才挨打。`
      + `它只有 ${cfg.hp} 血，全场最脆之一，但会一直跟你保持 ${cfg.keepDistance} 格以上的距离 —— 想拆它就得主动追过去`;
  }
  if (cfg.erase) return '损失压力：它从不还手，读条 4.5 秒后把你环上的一把剑「擦掉」，然后转身往场地外跑 —— 跑出去那把剑这一局就没了。冰剑冻住 / 震剑击退 / 冲过去砍死它，都行';  if (cfg.reboot) return '耐心压力：打死不算完 —— 躺 4 秒后原地半血重启，而且比上一次更快（最多重启 2 次）。地上那圈红光就是倒计时，守着它补刀';
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
  // ---- 第十六关两只（第 129 块）----
  // 画框：它和第九关的盖章人最容易混（都是「在你脚下放一块东西」），
  // 但盖章人是扣血封步、它是**把你关起来**，文案必须把两者的区别说穿。
  if (cfg.cage) {
    const c = cfg.cage;
    return `位置压力：它一次都不打人，只在你此刻站的地方罩下一个画框 —— `
      + `${c.half * 2} 格见方、留 ${c.life} 秒，框消失前你一步都出不去。它抬手时头顶会亮一圈金环，`
      + `提示它要框哪里（就是你脚下）。框里照样有别的东西在打你，所以它不是伤害，是「关住」：`
      + `被框在怪堆正中，就等于站着挨三秒。看到金环先往开阔处走，或者干脆先把它点掉（4 血）。`
      + `和第九关盖章人的区别：盖章人是扣血 + 减速，绕不掉但还能挪；画框是彻底走不动。`;
  }
  // 纸屑：它便宜、快、脆 —— 三个词都要写出来，否则玩家会拿打战士的办法去追它。
  if (cfg.scrap) {
    return `数量压力：地上扫起来的一把纸屑 —— 1 血、移速快、碰到你就自爆。`
      + `它单个不吓人，但永远是一群一群倒下来：追着打只会被围住，范围伤害一次扫掉一片才是正解。`
      + `也正因为脆，它是第十六关最划算的「描红」目标 —— 一条线扫过去，整片纸屑一起变红。`;
  }
  // ---- 第十七关两只（第 130 块）----
  // 撞钟的：它的压力在「你站在它旁边的时候」—— 不是伤害，是把你的节奏打断。
  if (cfg.toll) {
    const t = cfg.toll;
    return `节奏压力：它走得慢、血也不多，活儿是替钟楼「敲钟」—— 每 ${cfg.attackInterval} 秒抬杆读条 ${cfg.windup} 秒，`
      + `读满那一下，如果你在它 ${t.range} 格内，会被钟声钉住 ${t.pin} 秒（一步都走不了，技能照放）。`
      + `它只有 ${cfg.hp} 血，真正的麻烦是你正想躲全场那口大钟的时候，它又给你补一下定身。`
      + `打法：要么离它 ${t.range} 格外打（它自己走得慢，追不上），要么先点掉它 —— 它读条时头上会亮一圈暖黄。`;
  }
  // 铜壳：全场钟响也定不住它 —— 它就是这一关「钟声定身」的反面教材。
  if (cfg.freezeImmune) {
    return `抗性压力：全场钟响那 0.6 秒所有怪都停住，只有它照走照打 —— 因为它就是那口钟的铜壳。`
      + `它 ${cfg.hp} 血、带 ${Math.round(cfg.armor * 100)}% 减伤、移速 ${cfg.speed}，一下 ${cfg.damage} 点，`
      + `不难打但很拖时间：别人被钟定住的时候，它正好贴到你脸上。`
      + `注意它只免疫「钟声」这一路定身 —— 冰剑的冻结、空箱子倒出来的木屑定身，照样钉得住它。`
      + `所以这一关的正确节奏是：钟响前先把它推开或点掉，别让它是全场唯一还能动的那只。`;
  }
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
