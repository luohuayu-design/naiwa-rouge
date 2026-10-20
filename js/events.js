// ============================================================
// events.js —— 夜行奇遇（回合结束的抉择）
//
// 规则（第 7 块，用户定案）：
//   · 每回合**结束**时弹一次，效果作用于**下一回合**（回合结束自动撤销）；
//   · 每个事件都有一个具体的人 + 一段处境 + 2~4 个各有代价的选项；
//   · 选择会改「民心」（0~100）：民心高，商店便宜、村民帮你；民心低，涨价、遭贼；
//   · 6 条连锁线会跨 2~3 回合兑现（报恩 / 报复 / 病情 / 商队 / 井神 / 俘虏）。
//
// 单个事件的结构：
//   { id, icon, title, who, story, weight?, cond?(ctx), chainOnly?,
//     choices: [{ label, hint, cost?, effects, say?, chain? }] }
//
// effects（main.js 负责落地，全部作用于**下一回合**）：
//   rep    ±n                      民心（永久，跨回合记住）
//   gold   ±n                      立刻结算金币
//   hp     ±n                      立刻结算生命（负数保底 0.5）
//   drain  n                       下一回合每秒流失生命
//   level  {countScale, speedScale} 下一回合怪物数量 / 移速倍率
//   mods   [{stat, flat?, pct?, scope?}] 下一回合临时属性
//   chain  { in, id }              在选项里写：in 回合后强制弹出 id 事件
//   roll   [{p, effects}, ...]     选项内部的概率分支
//
// ctx: { round, hasWeapon, gold, rep, hp, maxHp }
// ============================================================
import { STAT_DEFS } from './stats.js';
import { WEAPON_STAT_DEFS } from './weaponStats.js';

export const REP_MIN = 0;
export const REP_MAX = 100;
export const REP_START = 50;

export const EVENTS = [
  // ============================================================
  // 一、天气与地形
  // ============================================================
  {
    id: 'coldWave', icon: '❄', title: '寒潮', who: '牧羊女 · 苇',
    story: '北边的风一夜之间翻了脸。苇抱着最后一只羊羔站在坡下，嘴唇冻得比霜还白。\n「棚塌了，」她说，「剩下的羊都在发抖。」',
    choices: [
      {
        label: '烧掉半垛干草', hint: '金币 -4 · 民心 +7 · 下回合攻击 -0.2',
        cost: { gold: 4 },
        effects: { rep: 7, mods: [{ stat: 'attack', flat: -0.2 }] },
        say: '苇把羊羔塞进你怀里，自己扑到火边烤手。火光照得她脸上终于有了血色。',
      },
      {
        label: '指她坡背的避风洞', hint: '民心 +3',
        effects: { rep: 3 },
        say: '「……谢谢。」她抱着羊往坡背走，走了几步，又回头看了你一眼。',
      },
      {
        label: '让她走开，今晚有硬仗', hint: '民心 -7 · 下回合移速 +8%',
        effects: { rep: -7, mods: [{ stat: 'moveSpeed', pct: 0.08 }] },
        say: '她没说话，只是把羊羔抱得更紧，转身走进风里。',
      },
    ],
  },
  {
    id: 'swamp', icon: '🌫', title: '雾里的沼泽', who: '挑夫 · 跛脚阿岩',
    story: '雾从低洼处漫上来，泥水没过脚踝。阿岩的担子歪在一边，一只脚陷在泥里拔不出来。\n「这雾里有东西，」他喘着气，「它在拽我的脚。」',
    choices: [
      {
        label: '帮他把担子抬过去', hint: '民心 +6 · 下回合移速 -8%',
        effects: { rep: 6, mods: [{ stat: 'moveSpeed', pct: -0.08 }] },
        say: '担子比看上去重得多。他终于站上硬地，冲你弯腰，额头几乎碰到膝盖。',
      },
      {
        label: '绕远走草坡', hint: '下回合怪物数量 -10% · 攻击范围 -0.2',
        effects: { level: { countScale: 0.9 }, mods: [{ stat: 'attackRange', flat: -0.2 }] },
        say: '你踩着草坡绕过去。雾里的路看不清，但踩得更实。',
      },
      {
        label: '丢下他', hint: '民心 -8 · 下回合移速 +6%',
        effects: { rep: -8, mods: [{ stat: 'moveSpeed', pct: 0.06 }] },
        say: '身后的呼吸声越来越远，最后和雾一起消失了。',
      },
    ],
  },
  {
    id: 'bridge', icon: '🌉', title: '断桥', who: '村口的信使',
    story: '往村里去的小木桥塌了半边，桥下是黑得看不见底的水。信使站在桥头，脚边放着一袋粮食。\n「明早要送过去，」他说，「绕山得多走一整天。」',
    choices: [
      {
        label: '花钱请人连夜修', hint: '金币 -8 · 民心 +9',
        cost: { gold: 8 },
        effects: { rep: 9 },
        say: '天没亮，锤子声就停了。信使踩着新铺的木板过了桥，回头冲你挥了挥手。',
      },
      {
        label: '自己搭两根木头', hint: '生命 -1 · 民心 +5',
        cost: { hp: 1 }, effects: { rep: 5 },
        say: '木头压得你肩膀发麻，桥勉强能走人。信使说：「你这人，实在。」',
      },
      {
        label: '不管，绕山是他们的路', hint: '民心 -6 · 下回合怪物数量 +15%',
        effects: { rep: -6, level: { countScale: 1.15 } },
        say: '后半夜，有骷髅从断桥那边过来了——它们不需要桥。',
      },
    ],
  },

  // ============================================================
  // 二、骷髅营地（趁它们松懈）
  // ============================================================
  {
    id: 'drummer', icon: '🥁', title: '骷髅鼓手', who: '坡对面的营地',
    story: '鼓点从坡对面滚过来，三只骷髅围着一面破鼓，敲得摇头晃脑。草里的骨头跟着节奏抖。\n原来它们也有排练。',
    choices: [
      {
        label: '摸过去割了鼓皮', hint: '生命 -1 · 下回合怪物移速 -15%',
        effects: { hp: -1, level: { speedScale: 0.85 } },
        say: '刀尖挑开鼓皮的一瞬，鼓手愣了一下，然后茫然地看向自己的手。',
      },
      {
        label: '跟着节奏走', hint: '下回合移速 +5% · 怪物移速 +8%',
        effects: { mods: [{ stat: 'moveSpeed', pct: 0.05 }], level: { speedScale: 1.08 } },
        say: '脚步跟着鼓点，确实轻快。可对面的骨头也踩上了同一个拍子。',
      },
      {
        label: '不管，绕开走', hint: '无变化',
        idle: true, effects: {},
        say: '鼓点在你身后敲了一整夜，像谁在数着时间。',
      },
    ],
  },
  {
    id: 'drunkBanquet', icon: '🍺', title: '庆功宴', who: '骷髅营地',
    story: '营地那边飘来酒味和划拳声。十几只骷髅喝得东倒西歪，有两只已经抱着骨头睡着了，呼噜声像漏风的风箱。',
    choices: [
      {
        label: '摸进去偷酒', hint: '金币 +6 · 下回合怪物数量 -20%',
        effects: { gold: 6, level: { countScale: 0.8 } },
        say: '你抱走两坛酒，还顺走了它们压在石头下的钱袋。没有一只醒。',
      },
      {
        label: '趁醉放火', hint: '下回合怪物数量 -40% · 民心 -10',
        effects: { level: { countScale: 0.6 }, rep: -10 },
        say: '火烧得很旺。天亮时草地黑了一片，村里的孩子站在那里看了很久。',
      },
      {
        label: '悄悄退开，养精神', hint: '下回合攻击 +0.3',
        effects: { mods: [{ stat: 'attack', flat: 0.3 }] },
        say: '你退到坡背，闭上眼听了一会儿风。掌心的茧好像厚了一点。',
      },
    ],
  },
  {
    id: 'envoy', icon: '🕯', title: '骷髅使者的交易', who: '披斗篷的骷髅',
    story: '一只披着破斗篷的骷髅站在坡界外，双手摊开，掌心躺着一枚发绿的金币。\n「一晚上，」它说，「我们退到河边。你把西边的草坡让出来。」',
    choices: [
      {
        label: '收下金币，答应它', hint: '金币 +15 · 下回合怪物数量 +30%',
        effects: { gold: 15, level: { countScale: 1.3 } },
        say: '它把金币按进你掌心，指甲冰凉。转身时，你听见它轻轻笑了一声。',
      },
      {
        label: '把金币打掉', hint: '民心 +6 · 下回合怪物数量 -10%',
        effects: { rep: 6, level: { countScale: 0.9 } },
        say: '金币在石头上弹了两下，滚进草里。使者看了你很久，才慢慢退回去。',
      },
      {
        label: '收下，然后反悔', hint: '金币 +15 · 民心 -10 · 下回合怪物 +40%',
        effects: { gold: 15, rep: -10, level: { countScale: 1.4 } },
        say: '它没有生气，只是记下了。你能感觉到，整片草坡都记住了这件事。',
      },
    ],
  },
  {
    id: 'drunkWarrior', icon: '🍶', title: '醉倒的战士', who: '睡着的骷髅战士',
    story: '一只骷髅战士靠着石头睡着了，酒葫芦滚在脚边，斧头插在土里，握柄还缠着谁的红绳。\n它一条腿是断的，骨头上有旧的裂痕。',
    choices: [
      {
        label: '拿走斧头', hint: '下回合攻击 +1.0 · 民心 -2',
        effects: { mods: [{ stat: 'attack', flat: 1 }], rep: -2 },
        say: '斧头很沉，刃口磨得发亮。它醒来后大概会先摸斧头，再摸自己的手。',
      },
      {
        label: '一了百了', hint: '下回合怪物数量 -10% · 民心 -3',
        effects: { level: { countScale: 0.9 }, rep: -3 },
        say: '骨头散开的声音很轻。你注意到那条断腿，是接错的——它本来就回不了营地。',
      },
      {
        label: '把斧头踢远，走开', hint: '民心 +2',
        effects: { rep: 2 },
        say: '斧头落进草丛。它整晚都没醒，也没再拿起过什么。',
      },
    ],
  },
  {
    id: 'lostSkull', icon: '💀', title: '迷路的小骷髅', who: '巴掌大的小骷髅',
    story: '一只巴掌大的小骷髅抱着比它自己还高的木棍，在原地打转。它看见你，手一松，木棍啪地掉了。\n它没有跑，只是站在原地发抖，骨节磕得哒哒响。',
    choices: [
      {
        label: '指给它营地的方向', hint: '民心 +5 · 下回合怪物数量 -15%',
        effects: { rep: 5, level: { countScale: 0.85 } },
        say: '它捡起木棍，朝你举了举，然后一颠一颠地往坡那边跑，跑几步还回头。',
      },
      {
        label: '拍碎它', hint: '金币 +3 · 民心 -4 · 下回合攻击 +0.2',
        effects: { gold: 3, rep: -4, mods: [{ stat: 'attack', flat: 0.2 }] },
        say: '骨头散在草里，里面滚出三枚金币——是谁给它的？',
      },
      {
        label: '把它送到坡界', hint: '民心 +8 · 下回合移速 -5%',
        effects: { rep: 8, mods: [{ stat: 'moveSpeed', pct: -0.05 }] },
        say: '你走得很慢，它就跟着你的影子走。到坡界时，它拽了拽你的脚。',
      },
    ],
  },

  // ============================================================
  // 三、草原上的生灵
  // ============================================================
  {
    id: 'wallet', icon: '💰', title: '遗落的钱袋', who: '路口',
    story: '草里躺着一只钱袋，绣着磨坊的麦穗纹。袋口松着，露出几枚金币的边。\n不远处的草被踩倒了，像有人急匆匆地跑过。',
    choices: [
      {
        label: '收下', hint: '金币 +8 · 民心 -5',
        effects: { gold: 8, rep: -5 },
        say: '金币落进你自己的袋子里，声音很轻，也很清楚。',
      },
      {
        label: '送到磨坊', hint: '民心 +7 · 下回合金币掉落 +10%',
        effects: { rep: 7, mods: [{ stat: 'goldRate', flat: 0.10 }] },
        say: '磨坊主翻遍袋子，发现一枚都没少。他硬塞给你一小袋面粉，说夜里垫肚子。',
      },
      {
        label: '挂在路口等失主', hint: '民心 +3 · 下回合生命 +1',
        effects: { rep: 3, hp: 1 },
        say: '你把钱袋挂在高处。第二天路过时，袋子里多了两个烤土豆。',
      },
    ],
  },
  {
    id: 'crow', icon: '🐦', title: '会说话的乌鸦', who: '独眼乌鸦',
    story: '一只独眼乌鸦落在你头顶的枯枝上，歪着头看你，眼珠黑得发亮。\n「守夜的，」它开口了，声音像两块石头摩擦，「它们今晚要换路走。」',
    choices: [
      {
        label: '给它一块干粮，听下去', hint: '金币 -2 · 下回合怪物数量 -20%',
        cost: { gold: 2 },
        effects: { level: { countScale: 0.8 } },
        say: '它叼走干粮，咽得很费劲，然后一句一句地说完了。走时留下一根羽毛。',
      },
      {
        label: '赶走它', hint: '下回合暴击 +8%',
        effects: { mods: [{ stat: 'critRate', flat: 0.08 }] },
        say: '它扑棱棱飞走，在半空骂了一句你听不懂的话。你反而静下心来。',
      },
      {
        label: '拔它的羽毛', hint: '金币 +2 · 民心 -3',
        effects: { gold: 2, rep: -3 },
        say: '它挣扎得很凶，啄破了你的指节。羽毛在手里，还带着体温。',
      },
    ],
  },
  {
    id: 'trap', icon: '🪤', title: '猎人的陷阱', who: '猎户 · 灰背',
    story: '草丛里一副铁夹，夹住了一只白兔。夹子上刻着猎户的记号——三道横杠。\n兔子还在喘气，眼睛睁得很大。',
    choices: [
      {
        label: '掰开夹子放生', hint: '民心 +4 · 下回合移速 +5%',
        effects: { rep: 4, mods: [{ stat: 'moveSpeed', pct: 0.05 }] },
        say: '兔子窜出去几步，停下来回头看你。它的后腿有点瘸，但跑得很快。',
      },
      {
        label: '收下猎物', hint: '金币 +5 · 民心 -5',
        effects: { gold: 5, rep: -5 },
        say: '你把兔子塞进袋子里。灰背明天来收夹子时，会知道是谁先到的。',
      },
      {
        label: '把夹子拆了', hint: '民心 +2 · 下回合攻击 +0.2',
        effects: { rep: 2, mods: [{ stat: 'attack', flat: 0.2 }] },
        say: '铁夹被你拆成两半，弹簧弹进草里。灰背会骂一整夜，但兔子会少很多。',
      },
    ],
  },
  {
    id: 'sheep', icon: '🐑', title: '石缝里的羊', who: '牧羊女 · 苇的羊',
    story: '一只羊卡在石缝里，咩咩叫得嗓子都哑了。脖子上系着红绳——是苇的羊。\n石缝太窄，硬拽会伤到它的腿。',
    choices: [
      {
        label: '撬石头，把它弄出来', hint: '民心 +8 · 下回合移速 -5%',
        effects: { rep: 8, mods: [{ stat: 'moveSpeed', pct: -0.05 }] },
        say: '石头撬开时你手心磨破了。苇跑过来抱住羊，抬头看你，什么也没说。',
      },
      {
        label: '宰了带走', hint: '生命 +2 · 民心 -7',
        effects: { hp: 2, rep: -7 },
        say: '很安静，比你想的安静。红绳你解下来，塞进了口袋。',
      },
      {
        label: '留张条子让她自己来', hint: '民心 +2',
        effects: { rep: 2 },
        say: '你在石头上压了张字条。半夜听见她喊羊的名字，一声比一声近。',
      },
    ],
  },
  {
    id: 'campfire', icon: '🔥', title: '篝火边的故事', who: '村里的几个老人',
    story: '坡下有堆篝火，几个村民围着，火苗把他们的影子投在草上。\n有人朝你招手：「守夜的，过来讲两句？孩子们想听。」',
    // 民心冷淡时，没人会主动招呼你
    cond: (ctx) => (ctx.rep ?? 50) >= 55,
    choices: [
      {
        label: '坐下讲一段', hint: '民心 +7 · 下回合攻击 -0.2',
        effects: { rep: 7, mods: [{ stat: 'attack', flat: -0.2 }] },
        say: '你讲到拍碎第一只骷髅时，孩子们一起「哇」了一声。你讲到天亮才散。',
      },
      {
        label: '站着听一会儿', hint: '民心 +3 · 下回合生命回复 +0.3',
        effects: { rep: 3, mods: [{ stat: 'hpRegen', flat: 0.3 }] },
        say: '火烤得后背发暖。有人往你手里塞了半块饼，还热着。',
      },
      {
        label: '摆摆手走开', hint: '民心 -3 · 下回合暴击 +8%',
        effects: { rep: -3, mods: [{ stat: 'critRate', flat: 0.08 }] },
        say: '身后的笑声慢慢低下去。你走进黑里，掌心的力气攒得很足。',
      },
    ],
  },
  {
    id: 'fireflies', icon: '✨', title: '萤火虫', who: '坡上的草丛',
    story: '一群萤火虫绕着你的肩头转，像谁撒了一把碎星。它们停在你的手背上，翅膀凉凉的。\n坡下传来咳嗽声——草药婆家的孩子又咳了一夜。',
    choices: [
      {
        label: '让它们跟着你', hint: '下回合每秒回血 +0.4',
        effects: { mods: [{ stat: 'hpRegen', flat: 0.4 }] },
        say: '萤火虫跟着你走了一路，伤口痒痒的，是愈合的痒。',
      },
      {
        label: '装进罐子，送给孩子', hint: '民心 +5 · 下回合每秒回血 +0.2',
        effects: { rep: 5, mods: [{ stat: 'hpRegen', flat: 0.2 }] },
        say: '罐子亮起来的时候，孩子不咳了，睁大眼睛看着，忘了哭。',
      },
      {
        label: '一只只拍下来', hint: '金币 +3 · 民心 -2',
        effects: { gold: 3, rep: -2 },
        say: '萤火虫的粉沾在掌心，亮了一小会儿，就暗了。',
      },
    ],
  },

  // ============================================================
  // 四、夜色里的机会（属性向）
  // ============================================================
  {
    id: 'moonlight', icon: '🌙', title: '今晚月亮很好', who: '草原上空',
    story: '月亮低得像挂在草尖上，骷髅的影子被拉得又细又长，骨头缝里的空隙看得一清二楚。\n这样的夜不多。',
    choices: [
      {
        label: '借着月光磨掌', hint: '下回合暴击 +10%',
        effects: { mods: [{ stat: 'critRate', flat: 0.10 }] },
        say: '你对着月光一下一下地磨，掌心的纹路像被描了一遍。',
      },
      {
        label: '借着亮赶路', hint: '下回合移速 +10%',
        effects: { mods: [{ stat: 'moveSpeed', pct: 0.10 }] },
        say: '路看得清清楚楚，你几乎是小跑着穿过整片草坡。',
      },
      {
        label: '躺在草里看一会儿', hint: '下回合生命 +1.5 · 民心 +2',
        effects: { hp: 1.5, rep: 2 },
        say: '草有点湿，月亮很静。你已经很久没有这样躺过了。',
      },
    ],
  },
  {
    id: 'wind', icon: '🌬', title: '夜风顺了', who: '草坡的风',
    story: '一阵夜风从背后推来，草浪一层层压过去。你环上的剑开始嗡嗡作响，快得只剩一圈残影。',
    cond: (ctx) => ctx.hasWeapon,
    choices: [
      {
        label: '迎风站定，让剑转起来', hint: '下回合剑转速 +40%',
        effects: { mods: [{ stat: 'swordOrbit', pct: 0.40, scope: 'weapon' }] },
        say: '剑光被风扯成一条线。你几乎听不见自己的呼吸。',
      },
      {
        label: '逆风练步', hint: '下回合移速 +8% · 剑转速 -10%',
        effects: {
          mods: [{ stat: 'moveSpeed', pct: 0.08 }, { stat: 'swordOrbit', pct: -0.10, scope: 'weapon' }],
        },
        say: '顶着风走很吃力，但每一步都踩得极稳。剑在身后慢了半拍。',
      },
    ],
  },
  {
    id: 'breeze', icon: '🍃', title: '顺风', who: '草坡的风',
    story: '风从背后推着你，草叶都朝一个方向倒。脚步轻得像有人在托着你的后腿。',
    cond: (ctx) => !ctx.hasWeapon,
    choices: [
      {
        label: '借着风跑一段', hint: '下回合移速 +12%',
        effects: { mods: [{ stat: 'moveSpeed', pct: 0.12 }] },
        say: '你跑得比平时远得多，回头时才发现已经绕了半个草坡。',
      },
      {
        label: '停下来听风里的动静', hint: '下回合怪物数量 -10%',
        effects: { level: { countScale: 0.9 } },
        say: '风里有骨头碰撞的轻响，从很远的地方传来。你换了条路走。',
      },
    ],
  },
  {
    id: 'potions', icon: '⚗', title: '两瓶可疑的药水', who: '树桩上的瓶子',
    story: '树桩上摆着两瓶药水，标签早就烂没了。红的那瓶在冒泡，蓝的那瓶特别安静，静得像没人碰过。\n远处传来骷髅的脚步声。',
    choices: [
      {
        label: '喝红的', hint: '可能回血，也可能烧喉咙',
        effects: {
          roll: [
            { p: 0.7, effects: { hp: 2 } },
            { p: 0.3, effects: { hp: -1 } },
          ],
        },
        say: '味道像烧着的草莓。喉咙辣了一下，然后全身都热起来。',
      },
      {
        label: '喝蓝的', hint: '可能出手更快，也可能腿软',
        effects: {
          roll: [
            { p: 0.6, effects: { mods: [{ stat: 'attackSpeed', pct: 0.25 }] } },
            { p: 0.4, effects: { mods: [{ stat: 'moveSpeed', pct: -0.15 }] } },
          ],
        },
        say: '凉的，一直凉到指尖。你的手比脑子先动了。',
      },
      {
        label: '都不喝，走开', hint: '无变化，但稳妥',
        idle: true, effects: {},
        say: '你绕过树桩。身后传来「咕嘟」一声，像有谁在笑。',
      },
    ],
  },

  // ============================================================
  // 五、民心专属（高民心有人送东西，低民心有人来偷）
  // ============================================================
  {
    id: 'villageGift', icon: '🧺', title: '门口的东西', who: '不知名的村民',
    story: '回到草坡时，门槛上放着一只篮子：几个鸡蛋、一小袋盐，还有一块用叶子包好的腊肉。\n没有人留名字。',
    cond: (ctx) => (ctx.rep ?? 50) >= 70,
    choices: [
      {
        label: '收下', hint: '金币 +6 · 下回合生命 +1',
        effects: { gold: 6, hp: 1 },
        say: '篮子上还留着体温。你把它拎进屋，门帘晃了很久才停。',
      },
      {
        label: '分给坡下的孩子', hint: '民心 +5 · 下回合生命回复 +0.3',
        effects: { rep: 5, mods: [{ stat: 'hpRegen', flat: 0.3 }] },
        say: '孩子们抢鸡蛋时吵成一团。你靠着树看了一会儿，没让他们看见你在笑。',
      },
    ],
  },
  {
    id: 'nightTheft', icon: '🌑', title: '夜里的手', who: '不知是谁',
    story: '后半夜，你听见钱袋被拖过草地的声音。等你起身，影子已经翻过坡界，只留下一只磨破的草鞋。\n你认得这只鞋——前天它还在跟你道谢。',
    cond: (ctx) => (ctx.rep ?? 50) <= 30,
    choices: [
      {
        label: '追上去', hint: '金币 -4 · 民心 -2 · 下回合攻击 +0.3',
        effects: { gold: -4, rep: -2, mods: [{ stat: 'attack', flat: 0.3 }] },
        say: '你追到坡界，只抓到一把草。铜板撒了一路，捡回来的不到一半。',
      },
      {
        label: '算了，让他走', hint: '金币 -8 · 民心 +2',
        effects: { gold: -8, rep: 2 },
        say: '你坐回草里。远处的脚步声停了很久，才慢慢走远。',
      },
    ],
  },

  // ============================================================
  // 六、六条连锁线的起点
  // ============================================================
  {
    id: 'beggar', icon: '🧎', title: '路边的老乞丐', who: '缺了半边下颚的老骷髅',
    story: '一只老骷髅瘫在路边，碗里只有一颗石子。它的骨头被磨得发白，指节上还留着编草绳的痕迹。\n它抬起头看你，眼窝深处好像有光。',
    choices: [
      {
        label: '施舍他', hint: '金币 -5 · 民心 +6 · 三回合后……',
        cost: { gold: 5 },
        effects: { rep: 6 },
        say: '它朝你深深鞠了一躬，鞠得很慢，像在对待一件很重的东西。',
        chain: { in: 3, id: 'beggarReturn' },
      },
      {
        label: '给它一半干粮', hint: '民心 +3 · 下回合生命 -1',
        effects: { rep: 3, hp: -1 },
        say: '它接过干粮，先闻了闻，才小口小口地啃。你听见它喉咙里的声音。',
        chain: { in: 3, id: 'beggarReturn' },
      },
      {
        label: '摇头走开', hint: '民心 -4 · 下回合每秒生命 -0.1',
        effects: { rep: -4, drain: 0.1 },
        say: '它盯着你的背影看了很久，然后朝你脚边啐了一口。',
      },
    ],
  },
  {
    id: 'thief', icon: '🐀', title: '草丛里的手', who: '戴头巾的骷髅小偷',
    story: '一只戴头巾的骷髅蹲在你的钱袋边，手指已经伸进去了。你停下脚步，它也停下，抬头和你对视。\n它没有跑。它在等你的反应。',
    choices: [
      {
        label: '一把抓住它', hint: '下回合攻击 +0.4 · 两回合后它会带人来',
        effects: { mods: [{ stat: 'attack', flat: 0.4 }] },
        say: '它被你拎起来，骨头咯咯响，嘴里却还在笑：「你会后悔的，守夜的。」',
        chain: { in: 2, id: 'thiefRevenge' },
      },
      {
        label: '放它走', hint: '金币 -4 · 民心 +3 · 两回合后……',
        effects: { gold: -4, rep: 3 },
        say: '它抽出几张票子塞回你袋里，退了两步，然后消失在草里。',
        chain: { in: 2, id: 'thiefIntel' },
      },
      {
        label: '把整袋给它', hint: '金币 -12 · 民心 +5 · 三回合后……',
        cost: { gold: 12 },
        effects: { rep: 5 },
        say: '它捧着钱袋愣了很久，才小声说：「……你不怕我？」',
        chain: { in: 3, id: 'thiefGift' },
      },
    ],
  },
  {
    id: 'sickChild', icon: '🤒', title: '被骨刃划伤的孩子', who: '草药婆 · 蕨',
    story: '草药婆抱着一个孩子坐在门口，孩子的脚踝上有一圈青黑，正一点一点往上爬。\n「骨刃划的，」她说，声音很平，「我压不住。」',
    choices: [
      {
        label: '拿出你的药', hint: '金币 -6 · 民心 +8 · 两回合后见分晓',
        cost: { gold: 6 },
        effects: { rep: 8 },
        say: '药敷上去，孩子的呼吸先是急了一阵，然后慢慢平下来。',
        chain: { in: 2, id: 'childHealed' },
      },
      {
        label: '让她用土方', hint: '民心 +2 · 两回合后见分晓',
        effects: { rep: 2 },
        say: '她点点头，转身去煎药。灶火亮了一整夜，烟从窗缝里往外钻。',
        chain: { in: 2, id: 'childWorse' },
      },
      {
        label: '说你也没有办法', hint: '民心 -7',
        effects: { rep: -7 },
        say: '她没抬头，只是把孩子往怀里按了按。门在你身后关上了。',
      },
    ],
  },
  {
    id: 'caravan', icon: '🐫', title: '迷路的商队', who: '商队领队 · 胖胡',
    story: '一支商队误入草坡，骆驼抖得像筛子。领队的胖子拽着缰绳冲你喊：\n「守夜的！带我们出去，价钱好说！」',
    choices: [
      {
        label: '护送他们到河边', hint: '金币 +8 · 民心 +5 · 两回合后他们会回来',
        effects: { gold: 8, rep: 5 },
        say: '胖子一路上都在数货，到了河边才松口气，塞给你一袋钱，说「记着这份情」。',
        chain: { in: 2, id: 'caravanReturn' },
      },
      {
        label: '收双倍过路费', hint: '金币 +18 · 民心 -6',
        effects: { gold: 18, rep: -6 },
        say: '胖子数钱的手在抖，但没敢说什么。商队走后，草地上一片狼藉。',
      },
      {
        label: '让他们自己跑', hint: '金币 +3 · 民心 -4',
        effects: { gold: 3, rep: -4 },
        say: '他们跑得很乱，掉了一地东西。你捡了几枚滚到脚边的金币。',
      },
    ],
  },
  {
    id: 'oldWell', icon: '🪣', title: '荒废的老井', who: '场地中央的井',
    story: '场地中央有口老井，井沿长满青苔。往里看是黑漆漆的，隐约有金光，也隐约有别的东西在动。\n井壁上刻着一行字，被苔藓盖住了大半。',
    choices: [
      {
        label: '探头看看', hint: '可能捞到金币，也可能被咬一口',
        effects: {
          roll: [
            { p: 0.5, effects: { gold: 15 } },
            { p: 0.5, effects: { hp: -2 } },
          ],
        },
        say: '井底的水面晃了一下，映出的不是你的脸。',
        chain: { in: 3, id: 'wellGod' },
      },
      {
        label: '把井填了', hint: '民心 +4 · 下回合移速 -6%',
        effects: { rep: 4, mods: [{ stat: 'moveSpeed', pct: -0.06 }] },
        say: '石头一块块落下去，回声越来越浅。最后一颗石子落下去时，没有声音。',
      },
      {
        label: '绕着走', hint: '无变化',
        idle: true, effects: {},
        say: '你绕着井走了半圈。井里的东西没有动，但你知道它在看。',
      },
    ],
  },
  {
    id: 'captive', icon: '🦴', title: '草地里的俘虏', who: '断了腿的骷髅',
    story: '一只骷髅被你拍断了腿，躺在草里，眼窝里的蓝火一明一灭。\n它伸出一只手，掌心朝上——不是要打，是想让你拉它一把。',
    choices: [
      {
        label: '给它一个痛快', hint: '民心 -3 · 下回合攻击 +0.5',
        effects: { rep: -3, mods: [{ stat: 'attack', flat: 0.5 }] },
        say: '蓝火灭了。它的手还保持着伸出来的姿势，很久才落下去。',
      },
      {
        label: '放它走', hint: '民心 +4 · 两回合后它会带路',
        effects: { rep: 4 },
        say: '它拖着断腿往坡那边爬，回头看了你三次。',
        chain: { in: 2, id: 'captiveAlly' },
      },
      {
        label: '钉在地上当路标', hint: '民心 -8 · 下回合怪物数量 -15%',
        effects: { rep: -8, level: { countScale: 0.85 } },
        say: '第二天路过的骷髅都绕开了那片草。村民也绕开了。',
      },
    ],
  },
];

// ============================================================
// 七、连锁线的后续（不进随机池，只由 chain 触发）
// ============================================================
const CHAIN_EVENTS = [
  {
    id: 'beggarReturn', icon: '🫱', title: '老乞丐回来了', who: '缺了半边下颚的老骷髅',
    story: '雾里走出一个熟悉的身影——还是那只缺了半边下颚的骷髅。\n它捧着一袋金币和一把磨得发亮的骨刀，郑重地放在你面前，又鞠了一躬。',
    chainOnly: true,
    choices: [
      {
        label: '收下这份心意', hint: '金币 +12 · 攻击 +1.0（永久）',
        effects: { gold: 12, permanent: [{ stat: 'attack', flat: 1 }] },
        say: '它摆摆手，退进雾里。你听见它用漏风的嗓子说了句「守夜的，别死」。',
      },
      {
        label: '只收骨刀，金币还它', hint: '攻击 +1.0（永久）· 民心 +8',
        effects: { rep: 8, permanent: [{ stat: 'attack', flat: 1 }] },
        say: '它捧着金币站了很久，最后把袋子塞进你怀里，转身跑得比谁都快。',
      },
    ],
  },
  {
    id: 'thiefRevenge', icon: '🐀', title: '小偷带人回来了', who: '戴头巾的骷髅小偷',
    story: '那只戴头巾的骷髅站在坡界上，身后跟着七八只同类，手里都拎着家伙。\n它隔着老远冲你喊：「我说过你会后悔的！」',
    chainOnly: true,
    choices: [
      {
        label: '迎上去', hint: '下回合怪物数量 +25% · 下回合攻击 +0.5',
        effects: { level: { countScale: 1.25 }, mods: [{ stat: 'attack', flat: 0.5 }] },
        say: '它们冲上来时很乱。你站在中间，忽然觉得这样也挺好。',
      },
      {
        label: '扔一袋钱让它们散', hint: '金币 -10 · 下回合怪物数量 -10%',
        cost: { gold: 10 },
        effects: { level: { countScale: 0.9 } },
        say: '它们抢钱的样子像一群乌鸦。小偷捡起袋子，冲你挑了挑眉。',
      },
    ],
  },
  {
    id: 'thiefIntel', icon: '🗺', title: '小偷带来的消息', who: '戴头巾的骷髅小偷',
    story: '它蹲在石头上，用手指在土里画了几条线。\n「今晚它们从西边来，」它说，「东边是空的。别问我为什么知道。」',
    chainOnly: true,
    choices: [
      {
        label: '记下路线', hint: '下回合怪物数量 -20%',
        effects: { level: { countScale: 0.8 } },
        say: '它把线抹平，站起来拍拍屁股上的土：「两清了，守夜的。」',
      },
      {
        label: '给它几枚金币当谢礼', hint: '金币 -5 · 民心 +4 · 下回合怪物 -20%',
        cost: { gold: 5 },
        effects: { rep: 4, level: { countScale: 0.8 } },
        say: '它捏着金币看了半天，忽然说：「……下次还来找你。」',
      },
    ],
  },
  {
    id: 'thiefGift', icon: '🎁', title: '小偷送来的东西', who: '戴头巾的骷髅小偷',
    story: '它把一个布包放在你脚边，退后两步，像怕你反悔。\n布里裹着一枚旧护符，和十几枚金币——都擦得很干净。',
    chainOnly: true,
    choices: [
      {
        label: '收下', hint: '金币 +14 · 下回合防御 +2',
        effects: { gold: 14, mods: [{ stat: 'armor', flat: 2 }] },
        say: '它松了口气，转身要走，又回头说：「那袋子……我留了一个铜板，行吗？」',
      },
      {
        label: '把金币还它，只留护符', hint: '民心 +8 · 下回合防御 +2',
        effects: { rep: 8, mods: [{ stat: 'armor', flat: 2 }] },
        say: '它抱着钱袋，站在原地很久，最后什么也没说，走了。',
      },
    ],
  },
  {
    id: 'childHealed', icon: '🌿', title: '孩子退了烧', who: '草药婆 · 蕨',
    story: '草药婆站在坡下，手里捧着一只小布包。\n「青黑退了，」她说，「他今天早上喊饿了。」',
    chainOnly: true,
    choices: [
      {
        label: '收下她做的护身符', hint: '民心 +6 · 下回合防御 +2',
        effects: { rep: 6, mods: [{ stat: 'armor', flat: 2 }] },
        say: '护身符里塞着干草和孩子的乳牙。她说这样能挡住不好的东西。',
      },
      {
        label: '让她留着，给孩子补身子', hint: '民心 +9',
        effects: { rep: 9 },
        say: '她愣了一下，然后笑起来，眼角的褶子挤在一起。',
      },
    ],
  },
  {
    id: 'childWorse', icon: '🕯', title: '孩子没撑住', who: '草药婆 · 蕨',
    story: '草药婆家的窗子黑着。邻居说她抱着孩子坐了一夜，天亮时孩子的手凉了。\n她没哭，只是坐在门口，一直看着坡那边。',
    chainOnly: true,
    choices: [
      {
        label: '去陪她坐一会儿', hint: '民心 +3 · 下回合攻击 -0.3',
        effects: { rep: 3, mods: [{ stat: 'attack', flat: -0.3 }] },
        say: '你们一句话也没说。太阳升起来的时候，她说了句「谢谢你来」。',
      },
      {
        label: '留下些钱，走开', hint: '金币 -8 · 民心 -4',
        cost: { gold: 8 },
        effects: { rep: -4 },
        say: '钱放在门槛上。走出很远，你还能看见那个小小的、黑色的窗。',
      },
    ],
  },
  {
    id: 'caravanReturn', icon: '🐫', title: '商队回来了', who: '商队领队 · 胖胡',
    story: '胖胡的商队从河边回来了，骆驼上驮着比上次更多的货。\n他跳下来，笑得满脸是汗：「守夜的！这次我给你带了点好东西。」',
    chainOnly: true,
    choices: [
      {
        label: '收下他的谢礼', hint: '金币 +16 · 民心 +3',
        effects: { gold: 16, rep: 3 },
        say: '他往你怀里塞了一堆东西，还硬要你尝一口他的酒。',
      },
      {
        label: '请他给村里留点盐和布', hint: '民心 +10 · 金币 +4',
        effects: { gold: 4, rep: 10 },
        say: '胖胡愣了愣，然后大笑：「行！你这守夜的，会做生意！」',
      },
    ],
  },
  {
    id: 'wellGod', icon: '🌀', title: '井里的东西出来了', who: '井底的声音',
    story: '老井的方向传来水声，像有人在井底翻身。\n一个湿漉漉的声音顺着井壁爬上来：「你看了我一眼……那就得听我说一句话。」',
    chainOnly: true,
    choices: [
      {
        label: '听它说完', hint: '民心 +5 · 下回合攻击 +0.6',
        effects: { rep: 5, mods: [{ stat: 'attack', flat: 0.6 }] },
        say: '它说了一句很轻的话，你只记住了后半句：「……别让它们过河。」',
      },
      {
        label: '把井口封死', hint: '下回合怪物数量 -15% · 民心 -3',
        effects: { level: { countScale: 0.85 }, rep: -3 },
        say: '石板压上去的时候，井底传来一声很长的叹息。之后，再也没有声音。',
      },
    ],
  },
  {
    id: 'captiveAlly', icon: '🗺', title: '它回来带路了', who: '断了腿的骷髅',
    story: '那只拖着断腿的骷髅爬回来了，身后没有同伴。\n它用指骨在土里画出一条线：「西边……有条沟，它们不走那儿。」',
    chainOnly: true,
    choices: [
      {
        label: '按它说的走', hint: '下回合怪物数量 -25%',
        effects: { level: { countScale: 0.75 } },
        say: '沟里的草很高，正好藏住脚步。你回头时，它已经不见了。',
      },
      {
        label: '给它包一下断腿', hint: '民心 +6 · 下回合移速 -5% · 怪物 -25%',
        effects: { rep: 6, mods: [{ stat: 'moveSpeed', pct: -0.05 }], level: { countScale: 0.75 } },
        say: '布条缠上去的时候，它一动不动，蓝火轻轻晃了一下。',
      },
    ],
  },
];

// 全部事件（随机池 + 连锁），便于按 id 查找 / 文档生成
export const ALL_EVENTS = [...EVENTS, ...CHAIN_EVENTS];

// ---------------- 抽取 ----------------
// ctx: { round, hasWeapon, gold, rep }；recentIds：最近出现过的（3 回合内不重复）
export function pickEvent(ctx = {}, recentIds = [], rng = Math.random) {
  const recent = new Set(recentIds.slice(-3));
  const pool = EVENTS.filter((ev) => {
    if (ev.chainOnly) return false;
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

export function getEventById(id) {
  return ALL_EVENTS.find((e) => e.id === id) || null;
}

// ---------------- 文案 ----------------
// 把 effects 翻译成事件卡上能直接展示的几行字（统一说「下回合」）
function modLine(m) {
  // 两块属性表都查：武器项（剑转速等）在 WEAPON_STAT_DEFS 里
  const def = (m.scope === 'weapon' ? WEAPON_STAT_DEFS : STAT_DEFS).find((d) => d.key === m.stat)
    || STAT_DEFS.find((d) => d.key === m.stat)
    || WEAPON_STAT_DEFS.find((d) => d.key === m.stat);
  const name = def ? def.name : m.stat;
  if (m.pct != null) return `${name} ${(m.pct >= 0 ? '+' : '')}${(m.pct * 100).toFixed(1)}%（下回合）`;
  return `${name} ${(m.flat >= 0 ? '+' : '')}${m.flat.toFixed(1)}（下回合）`;
}

export function effectLines(effects = {}) {
  const lines = [];
  for (const m of effects.mods || []) lines.push(modLine(m));
  for (const m of effects.permanent || []) {
    const def = STAT_DEFS.find((d) => d.key === m.stat) || WEAPON_STAT_DEFS.find((d) => d.key === m.stat);
    lines.push(`${def ? def.name : m.stat} +${(m.flat ?? 0).toFixed(1)}（永久）`);
  }
  if (effects.rep > 0) lines.push(`民心 +${effects.rep}`);
  if (effects.rep < 0) lines.push(`民心 ${effects.rep}`);
  if (effects.gold > 0) lines.push(`金币 +${effects.gold}`);
  if (effects.gold < 0) lines.push(`金币 ${effects.gold}`);
  if (effects.hp > 0) lines.push(`生命 +${effects.hp.toFixed(1)}`);
  if (effects.hp < 0) lines.push(`生命 ${effects.hp.toFixed(1)}`);
  if (effects.drain > 0) lines.push(`每秒生命 -${effects.drain.toFixed(1)}（下回合）`);
  if (effects.level?.countScale != null) lines.push(`下回合怪物数量 ×${effects.level.countScale}`);
  if (effects.level?.speedScale != null) lines.push(`下回合怪物移速 ×${effects.level.speedScale}`);
  return lines;
}

// 选项按钮上的说明（hint 已经写好了就用它，否则从 effects 推）
export function choiceHint(choice) {
  if (choice.hint) return choice.hint;
  const lines = effectLines(choice.effects || {});
  return lines.length ? lines.join(' · ') : '无变化';
}

// 代价是否付得起（金币 / 生命）
export function canAfford(choice, { gold = 0, hp = 99 } = {}) {
  const c = choice.cost || {};
  if (c.gold != null && gold < c.gold) return false;
  if (c.hp != null && hp <= c.hp) return false;
  return true;
}

export function costShort(choice) {
  const c = choice.cost || {};
  const out = [];
  if (c.gold) out.push(`${c.gold} 金币`);
  if (c.hp) out.push(`${c.hp} 生命`);
  return out.join(' + ');
}
