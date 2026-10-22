// ============================================================
// wave.js —— 关卡编排与刷怪位置（第一关 · 荒草地 / 第二关 · 骨塔庭院）
//
// 【第 20 块改造】原来的 createLevel1 把 LEVEL_1 写死在里面，加第二关就要复制
// 一整份 200 行的回合机器。现在改成 createLevel(def, deps)：关卡只是数据，
// 回合机器只有一份。createLevel1 保留成薄包装（老测试和旧代码不用改）。
// LEVEL_1 的数值一个字没动 —— 加 order 表只是为了通用化刷怪顺序，
// 顺序与段间隔和原来完全等价（见 buildSpawns 注释）。
//
// 关卡设计（数值都在这一个文件里，改这里就能调节奏）：
//   第一关 · 荒草地：20 回合，小兵 + 战士 + 投手 + 弓手（两种远程），合计 273 只
//   清空一回合后停 2.6 秒进下一回合；**必须清完**才推进（不设超时跳过，
//   否则会带着上一回合的怪滚雪球，也没法在回合结束时弹升级）
//
// 回合成长（用户要求「怪物不止数目变多，属性也适当提高」）：
//   数量：3 → 25 只/回合（见 rounds）
//   生命：每回合 +16%（第 20 回合 ×4.06，战士 3 → 12 血）
//   伤害：每回合 +10%（第 20 回合 ×2.90，1 → 2~6 点）
//   速度：每回合 +3.5%（第 20 回合 ×1.67，小兵 2.15 → 3.58，主角 4.4 仍能拉开但很紧）
//   小兵基础 1 血，四舍五入后第 5 回合起变 2 血（R1~R4 仍是一刀一只）；
//   战士 3 血，第 5 回合 5 血、第 10 回合 7 血、第 15 回合 10 血、第 20 回合 12 血。
//
// 第三种怪：骷髅投手（远程弹道）第 11 回合登场，见 enemy.js 的 archer 配置。
// 第四种怪：骷髅弓手（红圈落箭）第 12 回合登场，见 enemy.js 的 bowman 配置。
//   第 16~20 回合（第 13 块）是两种远程怪的「毕业考」：数量与混编密度全面抬升，
//   撑过去的奖励是三选一继续在 17/19 回合出现，商店 15/18 回合补货。
//
// 升级：第 1/2/3/4/5/8/10/12/15/17/19 回合清空后弹三选一（见 upgrade.js），
//       第 5 回合清空时先弹「获得环剑」卡片，再进三选一。
// 商店：第 3/6/9/12/15/18 回合清空后弹（三选一之后），见 shop.js；
//       第 20 回合是最后一关，清完直接结算不弹商店。
//
// 回合修正（随机事件写入，见 applyRoundMod / events.js）：
//   countScale  本回合怪物数量倍率（骷髅喝多了 → 0.7）
//   speedScale  本回合怪物移速倍率（鼓手 → 1.15）
//   注意 onRound 回调先于刷怪表展开（spawns 延迟到 update 才 build），
//   所以事件卡里选完才应用修正也来得及。
//
// 刷怪位置规则（用户要求的「生成位置」）：
//   1. 只从场地边缘的圆环上出现（半径 13.2 ± 0.5），不会凭空出现在脚下
//   2. 与主角的距离必须 ≥ 7，主角贴边时近侧不刷，改从对面来
//   3. 相邻两次刷怪至少隔 2 个单位，避免一坨怪叠在一起出生
// ============================================================

export const LEVEL_1 = {
  id: 1,
  name: '第一关 · 荒草地',
  theme: 'meadow',         // 场景皮肤（scene.js 的 THEMES）
  // 刷怪顺序 + 段内间隔系数（乘以本回合的 gap）：近身先来，远程后到。
  // 与改造前硬编码的 minion→warrior→archer→bowman（1/1.6/2.0/2.2，段间 0.35s）
  // 完全等价；数量为 0 的段会被跳过（原实现在那种情况下加了 0.35s 但后面没有怪，无影响）。
  order: [['minion', 1], ['warrior', 1.6], ['archer', 2.0], ['bowman', 2.2]],
  spawnRadius: 13.2,       // 刷怪圆环半径
  spawnJitter: 0.5,        // 半径随机浮动
  minPlayerDistance: 7.0,  // 离主角至少这么远
  minSpawnGap: 2.0,        // 两次刷怪的最小间距
  gap: 2.6,                // 清场后到下一回合的间隔（秒）
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],  // 打完这些回合弹三选一（最后一回合也有：选完直接结算）
  shopAfter: [3, 6, 9, 12, 15, 18],                      // 打完这些回合弹商店（在三选一之后）
  weaponAt: 5,                       // 打完这回合获得第一件武器「环剑」
  // 属性随回合成长：1 + k × (回合 - 1)
  scale: { hp: 0.16, damage: 0.10, speed: 0.035 },
  rounds: [
    { minion: 3,  warrior: 0, archer: 0, gap: 0.90, tip: '小兵从草里钻出来了' },
    { minion: 4,  warrior: 0, archer: 0, gap: 0.80, tip: '数量多起来了，边走边拍' },
    { minion: 5,  warrior: 1, archer: 0, gap: 0.80, tip: '战士会抬手，看到红圈就躲' },
    { minion: 5,  warrior: 1, archer: 0, gap: 0.75, tip: '它们变硬了一点，别硬顶' },
    { minion: 6,  warrior: 2, archer: 0, gap: 0.70, tip: '两个战士，先点掉它们' },
    { minion: 6,  warrior: 2, archer: 0, gap: 0.65, tip: '小兵开始要两下了，稳住节奏' },
    { minion: 7,  warrior: 2, archer: 0, gap: 0.60, tip: '别贪刀，血留着' },
    { minion: 8,  warrior: 3, archer: 0, gap: 0.55, tip: '这一波很凶，绕圈拉扯' },
    { minion: 8,  warrior: 3, archer: 0, gap: 0.50, tip: '撑住，马上就到最后了' },
    { minion: 9,  warrior: 4, archer: 0, gap: 0.50, tip: '最后一回合，全部拍碎' },
    { minion: 9,  warrior: 4, archer: 1, gap: 0.55, tip: '远处有人拉弓了，别站着不动' },
    { minion: 9,  warrior: 4, archer: 2, bowman: 1, gap: 0.55, tip: '骨刀是直的，横着走能躲；脚下的红圈必须挪出去' },
    { minion: 10, warrior: 4, archer: 2, bowman: 1, gap: 0.50, tip: '脚下出红圈就往外走 —— 那是箭' },
    { minion: 10, warrior: 5, archer: 2, bowman: 1, gap: 0.48, tip: '混编队：躲圈、躲刀、还要防贴脸' },
    { minion: 10, warrior: 5, archer: 3, bowman: 2, gap: 0.45, tip: '两个弓手了，别站在圈里硬打' },
    // ---- 第 16~20 回合（第 13 块）：毕业考。两种远程 + 近身全面混编，密度抬升 ----
    { minion: 10, warrior: 5, archer: 3, bowman: 2, gap: 0.45, tip: '第 16 回合：真正的夜行从现在开始' },
    { minion: 10, warrior: 5, archer: 3, bowman: 2, gap: 0.45, tip: '弹道和红圈一起来，先躲圈再躲刀' },
    { minion: 11, warrior: 5, archer: 3, bowman: 2, gap: 0.42, tip: '小兵也快追上你了，别原地恋战' },
    { minion: 11, warrior: 6, archer: 3, bowman: 3, gap: 0.40, tip: '三个弓手，脚下要一直留着空地' },
    { minion: 12, warrior: 6, archer: 4, bowman: 3, gap: 0.38, tip: '最后一波，全部拍碎' },
  ],
};

// ============================================================
// 第二关 · 骨塔庭院（第 20 块）
//
// 和一关的区别不是「数值更高」，而是**压力的形状变了**：
//   一关是密度逐渐堆高，玩家靠走位 + 输出就能推过去；
//   二关场上永远站着几种「不打就难受」的巫师，逼玩家判断该先切谁。
//
// 三位巫师各带一件事（enemy.js 里一人一个技能，绝不叠在同一个人身上）：
//   骨咒师 hexer   —— 读条在你脚下钉紫阵，落地掉血 + 减速。躲得掉，但连发就烦。
//   火焚巫祝 pyro  —— 读条留一片灼地，站上去持续掉血 4 秒。不许站桩。
//   霜牢主祭 hierarch —— 霜牢环钉在玩家脚下跟着走，环里的怪加攻速 & 减伤泛青光；
//                        自己还会放石刺、召卫队。血最厚，站最后排，优先点掉。
//
// 登场节奏：R6 骨咒师 → R10 火焚 → R13 霜牢。每次只放一位新面孔，
// 玩家有四五回合去适应，再混编。第 16~20 回合三种同时在场的「骨塔议会」
// 是这一关的毕业考。
//
// 数值比一关狠一档：每回合 +20% 生命 / +12% 伤害（一关是 16% / 10%），
// 第 20 回合 ×4.80 血 / ×3.28 伤害。速度成长不变（还是 +3.5%），
// 因为二关的威胁来自技能，不该靠「追得上你」来制造压力。
// 武器提前到第 4 回合给（一关是 5）—— 一开场就有投手，不给武器太难受。
// ============================================================
export const LEVEL_2 = {
  id: 2,
  name: '第二关 · 骨塔庭院',
  theme: 'crypt',
  order: [
    ['minion', 1], ['warrior', 1.6], ['archer', 2.0], ['bowman', 2.2],
    ['hexer', 2.6], ['pyro', 2.6], ['hierarch', 3.2],
  ],
  spawnRadius: 13.2,
  spawnJitter: 0.5,
  minPlayerDistance: 7.0,
  minSpawnGap: 2.0,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.20, damage: 0.12, speed: 0.035 },
  rounds: [
    // ---- 第一幕（R1~R5）：骨塔的院子。先认路，投手提前登场 ----
    { minion: 3,  warrior: 0, archer: 0, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.90, tip: '骨塔的院子，草都不长' },
    { minion: 4,  warrior: 1, archer: 0, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.80, tip: '还是老规矩：边走边拍' },
    { minion: 4,  warrior: 1, archer: 1, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.80, tip: '一上来就有投手了，横着走躲骨刀' },
    { minion: 5,  warrior: 2, archer: 1, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.75, tip: '这一波之后，你会有新武器' },
    { minion: 5,  warrior: 2, archer: 1, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.70, tip: '院子深处有灯亮着 —— 有人在等你' },
    // ---- 第二幕（R6~R10）：三位巫师依次登场 ----
    { minion: 6,  warrior: 2, archer: 1, bowman: 0, hexer: 1, pyro: 0, hierarch: 0, gap: 0.65, tip: '戴尖帽的那个在念咒：脚下出紫圈就赶紧走' },
    { minion: 6,  warrior: 2, archer: 2, bowman: 0, hexer: 1, pyro: 0, hierarch: 0, gap: 0.60, tip: '被它的咒打中会走不动路，别硬吃' },
    { minion: 6,  warrior: 2, archer: 2, bowman: 1, hexer: 1, pyro: 0, hierarch: 0, gap: 0.58, tip: '骨咒师血厚，值得专门冲一趟' },
    { minion: 7,  warrior: 3, archer: 2, bowman: 1, hexer: 1, pyro: 0, hierarch: 0, gap: 0.55, tip: '两只骨咒师了，紫圈会叠' },
    { minion: 7,  warrior: 3, archer: 2, bowman: 1, hexer: 2, pyro: 1, hierarch: 0, gap: 0.55, tip: '新面孔：橙眼的会在地上留火，别站着不动' },
    // ---- 第三幕（R11~R15）：混编加压，霜牢主祭登场 ----
    { minion: 7,  warrior: 3, archer: 2, bowman: 1, hexer: 2, pyro: 1, hierarch: 0, gap: 0.50, tip: '火是留在地上的，踩上去一直掉血' },
    { minion: 7,  warrior: 3, archer: 2, bowman: 2, hexer: 2, pyro: 1, hierarch: 0, gap: 0.50, tip: '紫圈、火地、红圈，三样一起来' },
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 2, pyro: 1, hierarch: 1, gap: 0.48, tip: '后排戴骨冠的那个：脚下青圈里的怪会变凶，它自己还会放石刺' },
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 2, pyro: 2, hierarch: 1, gap: 0.46, tip: '先砍主祭 —— 它一死，跟着它的卫队也会散架' },
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 2, pyro: 2, hierarch: 1, gap: 0.45, tip: '别站在青圈里打，石刺是从主祭那边吐过来的' },
    // ---- 第四幕（R16~R20）：骨塔议会。三种巫师同场 ----
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 3, pyro: 2, hierarch: 1, gap: 0.45, tip: '第 16 回合：骨塔议会开始点名' },
    { minion: 9,  warrior: 5, archer: 3, bowman: 2, hexer: 3, pyro: 2, hierarch: 2, gap: 0.42, tip: '两个主祭 = 两圈青光，先点掉一个，卫队会跟着散' },
    { minion: 9,  warrior: 5, archer: 4, bowman: 3, hexer: 3, pyro: 2, hierarch: 2, gap: 0.40, tip: '别贪输出，脚下先留一条退路' },
    { minion: 9,  warrior: 5, archer: 4, bowman: 3, hexer: 3, pyro: 2, hierarch: 2, gap: 0.40, tip: '还差两回合，撑住' },
    { minion: 9,  warrior: 5, archer: 4, bowman: 3, hexer: 3, pyro: 2, hierarch: 2, gap: 0.38, tip: '最后一波：把塔里的人全拍碎' },
  ],
};

// ============================================================
// 第三关 · 焦土钟楼（第 29 块）
//
// 一关考「密度」，二关考「站位与技能躲避」，三关换成**打断与目标优先级**：
// 场上永远有一只「放着不管就滚雪球」的怪，玩家得在怪堆里挑目标。
//
// 三只新怪（enemy.js 一人一套行为）：
//   charger  骨骑冲锋兵 —— 蓄力 0.85 秒（地上画直线）→ 直线冲 6.5 格，撞上 2 伤，
//                          撞完僵直 1.1 秒。**必须横向侧移**，这是三关唯一的硬走位要求。
//   shielder 骸盾兵     —— 举盾 1.6 秒（减伤 70%、不动）↔ 放盾 1.6 秒（正常挨打）。
//                          输出窗口是自己给的，急着打只会浪费伤害。
//   brood    孵骨巫祝   —— 每 7 秒孵 2 只小兵（她名下最多 6 只存活）。
//                          不点掉她，这回合永远清不完。
//
// 登场节奏：R4 骨骑 → R9 骸盾兵 → R13 孵骨巫祝，每次只放一位新面孔；
// 第 16~20 回合三者混编的「钟楼残响」是毕业考。
//
// 数值比二关再硬一档（用户定案）：每回合 +24% 生命 / +14% 伤害（二关 20% / 12%），
// 第 20 回合 ×5.56 血 / ×3.74 伤害；速度成长仍是 +3.5% —— 三关的威胁来自
// 「冲锋 + 盾 + 孵兵」三件事，不该靠跑得比你快来制造压力。
// 武器仍然第 4 回合给（骨骑第一次登场就有武器可用）。
// ============================================================
export const LEVEL_3 = {
  id: 3,
  name: '第三关 · 焦土钟楼',
  theme: 'ash',
  // 顺序：近身先来 → 远程 → 支援（骸盾/孵骨最后）—— 先清贴脸的，再决定先切谁
  order: [
    ['minion', 1], ['warrior', 1.6], ['charger', 1.8],
    ['archer', 2.0], ['bowman', 2.2], ['shielder', 2.4], ['brood', 2.6],
  ],
  spawnRadius: 13.2,
  spawnJitter: 0.5,
  minPlayerDistance: 7.0,
  minSpawnGap: 2.0,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.24, damage: 0.14, speed: 0.035 },
  rounds: [
    // ---- 第一幕（R1~R4）：焦土院子 ----
    { minion: 3,  warrior: 0, charger: 0, archer: 0, bowman: 0, shielder: 0, brood: 0, gap: 0.90, tip: '钟楼的院子里全是灰，踩上去像雪' },
    { minion: 4,  warrior: 1, charger: 0, archer: 0, bowman: 0, shielder: 0, brood: 0, gap: 0.80, tip: '还是老规矩：边走边拍' },
    { minion: 4,  warrior: 1, charger: 0, archer: 1, bowman: 0, shielder: 0, brood: 0, gap: 0.80, tip: '这次一上来就有投手了' },
    // ---- 第二幕（R4~R8）：骨骑登场 ----
    { minion: 5,  warrior: 2, charger: 1, archer: 0, bowman: 0, shielder: 0, brood: 0, gap: 0.75, tip: '铁灰的那只会冲：地上出红线就往侧面走' },
    { minion: 5,  warrior: 2, charger: 1, archer: 1, bowman: 0, shielder: 0, brood: 0, gap: 0.72, tip: '冲锋躲开之后它会僵一下 —— 那时候打' },
    { minion: 5,  warrior: 2, charger: 2, archer: 1, bowman: 1, shielder: 0, brood: 0, gap: 0.70, tip: '两只骨骑：别站在它们和你的连线上' },
    { minion: 6,  warrior: 3, charger: 2, archer: 1, bowman: 1, shielder: 0, brood: 0, gap: 0.66, tip: '新面孔：弓手的红圈，得挪出去' },
    { minion: 6,  warrior: 3, charger: 2, archer: 2, bowman: 1, shielder: 0, brood: 0, gap: 0.62, tip: '红线 + 红圈一起出现时，先躲圈' },
    // ---- 第三幕（R9~R12）：骸盾兵 ----
    { minion: 6,  warrior: 3, charger: 2, archer: 2, bowman: 1, shielder: 1, brood: 0, gap: 0.60, tip: '举盾的那只打不动：等它放下盾再打' },
    { minion: 7,  warrior: 3, charger: 3, archer: 2, bowman: 1, shielder: 1, brood: 0, gap: 0.58, tip: '盾放下的一瞬间，它反而走得更快' },
    { minion: 7,  warrior: 4, charger: 3, archer: 2, bowman: 2, shielder: 2, brood: 0, gap: 0.55, tip: '两头盾兵：别把输出全花在盾上' },
    { minion: 7,  warrior: 4, charger: 3, archer: 3, bowman: 2, shielder: 2, brood: 0, gap: 0.54, tip: '灰里已经有钟声了 —— 塔上有人' },
    // ---- 第四幕（R13~R15）：孵骨巫祝 ----
    { minion: 7,  warrior: 4, charger: 3, archer: 3, bowman: 2, shielder: 2, brood: 1, gap: 0.52, tip: '绿眼睛那个会孵小兵 —— 先冲过去砍她' },
    { minion: 8,  warrior: 4, charger: 3, archer: 3, bowman: 2, shielder: 2, brood: 1, gap: 0.50, tip: '她孵出来的小兵会自己走，别追着打' },
    { minion: 8,  warrior: 4, charger: 4, archer: 3, bowman: 2, shielder: 2, brood: 1, gap: 0.48, tip: '骨骑四只：留一条横向的空地' },
    // ---- 第五幕（R16~R20）：钟楼残响。三者混编的毕业考 ----
    { minion: 8,  warrior: 5, charger: 4, archer: 3, bowman: 2, shielder: 3, brood: 2, gap: 0.46, tip: '第 16 回合：钟楼残响，三样一起来了' },
    { minion: 9,  warrior: 5, charger: 4, archer: 3, bowman: 3, shielder: 3, brood: 2, gap: 0.44, tip: '两只孵骨 = 十二只小兵上限，先拆一只' },
    { minion: 9,  warrior: 5, charger: 4, archer: 4, bowman: 3, shielder: 3, brood: 2, gap: 0.42, tip: '盾兵打不动就先绕开，别在它身上耗' },
    { minion: 9,  warrior: 6, charger: 5, archer: 4, bowman: 3, shielder: 3, brood: 2, gap: 0.40, tip: '还差两回合：横向走位不要停' },
    { minion: 10, warrior: 6, charger: 5, archer: 4, bowman: 3, shielder: 4, brood: 2, gap: 0.38, tip: '最后一波：把钟楼里的人全拍碎' },
  ],
};

export const LEVELS_BY_ID = { 1: LEVEL_1, 2: LEVEL_2, 3: LEVEL_3 };

// 第 roundNo 回合（从 1 开始）的怪物属性倍率
// 难度（第 18 块）：乘在每回合的成长倍率上。普通 = 原版数值，一局一选，
// 不进设置面板（难度是「这一局玩多狠」的选择，不是机器偏好）。
export const DIFFS = {
  normal: { name: '普通', hp: 1, damage: 1, speed: 1, desc: '原汁原味的荒草地' },
  nightmare: { name: '噩梦', hp: 1.35, damage: 1.25, speed: 1.04, desc: '怪更硬更疼，脚程也快一点' },
  hell: { name: '地狱', hp: 1.8, damage: 1.55, speed: 1.08, desc: '一步走错就倒下，给头铁的蛙' },
};
let diff = DIFFS.normal;
export function setDifficulty(key) {
  if (DIFFS[key]) diff = DIFFS[key];
  return diff;
}
export function getDifficulty() { return diff; }

// 第 roundNo 回合的怪物属性倍率。
// 第二关各传自己的 level（成长更陡），第一关不传 = 老行为，老测试与旧调用都不用动。
export function roundScale(roundNo, level = LEVEL_1) {
  const s = level.scale || LEVEL_1.scale;
  const k = Math.max(0, roundNo - 1);
  return {
    hp: (1 + s.hp * k) * diff.hp,
    damage: (1 + s.damage * k) * diff.damage,
    speed: (1 + s.speed * k) * diff.speed,
  };
}

// 关卡里出现过的怪种全部汇总（不再写死四种：第二关多了三位巫师）。
// 怪种清单以 order 为准 —— 不能只看第 1 回合，弓手是第 12 回合才登场的。
export function levelStats(level = LEVEL_1) {
  const KEYS = level.order.map(([t]) => t);
  const sum = { total: 0, rounds: level.rounds.length };
  for (const k of KEYS) sum[k] = 0;
  for (const r of level.rounds) {
    for (const k of KEYS) sum[k] += r[k] || 0;
  }
  sum.total = KEYS.reduce((a, k) => a + sum[k], 0);
  return sum;
}

// 把一回合的怪表展开成带延迟的生成列表。
// 顺序与段间隔完全由关卡的 order 决定：
//   近身先到 → 远程后到 → 巫师最后（先把贴脸的清掉，再面对后排的吟唱）。
//   每段之前隔 0.35 秒，数量为 0 的段直接跳过（不白占时间）。
// 第一关的 order 就是老代码里写死的 minion→warrior→archer→bowman（1/1.6/2.0/2.2），
// 展开结果与改造前逐条一致。
// mod：本回合修正（随机事件写入），数量按 mod.countScale 缩放。
function buildSpawns(roundNo, mod = {}, level = LEVEL_1) {
  const cfg = level.rounds[roundNo - 1];
  const cs = mod.countScale != null ? Math.max(0, mod.countScale) : 1;
  const n = (v) => Math.max(0, Math.round((v || 0) * cs));
  const out = [];
  let t = 0.75;
  let first = true;
  for (const [type, gapMul] of level.order) {
    const count = n(cfg[type]);
    if (count <= 0) continue;
    if (!first) t += 0.35;
    first = false;
    for (let i = 0; i < count; i++) {
      out.push({ type, delay: t });
      t += cfg.gap * gapMul;
    }
  }
  return out;
}

export function createLevel(level, { enemies, fx, getPlayerPos, onRound, onRoundClear, onVictory, onKill }) {
  const recentSpawns = [];
  let roundIndex = -1;      // 0 基：0 = 第 1 回合
  let phase = 'idle';       // idle | spawning | gap | done
  let t = 0;
  let spawns = null;        // 延迟展开：onRound（事件卡）跑完、update 第一次跑到才 build
  let spawnIdx = 0;
  let gapT = 0;
  let spawned = 0;
  let roundMod = {};        // 本回合修正（事件写入：countScale / speedScale）

  function pickSpawn() {
    const p = getPlayerPos();
    const R = level.spawnRadius;

    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R + (Math.random() - 0.5) * level.spawnJitter * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // 规则 2：不能刷在主角脸上
      if (Math.hypot(x - p.x, z - p.z) < level.minPlayerDistance) continue;

      // 规则 3：不能和最近的出生点重叠
      let ok = true;
      for (const q of recentSpawns) {
        if (Math.hypot(x - q.x, z - q.z) < level.minSpawnGap) { ok = false; break; }
      }
      if (!ok) continue;

      return remember({ x, z });
    }

    // 兜底：从主角的正对面来
    const a = Math.atan2(p.z, p.x) + Math.PI;
    const r = R - 0.4;
    return remember({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  function remember(at) {
    recentSpawns.push(at);
    if (recentSpawns.length > 6) recentSpawns.shift();
    return at;
  }

  function start() {
    reset();
    nextRound();
  }

  // 存档续玩（第 17 块）：直接从第 no 回合开局，不重放前面的回合。
  // savedMod 是读档时恢复的「本回合修正」（上一回合的事件写的），传 null 就当没有。
  function startAt(no, savedMod) {
    reset();
    roundIndex = Math.max(0, Math.min(level.rounds.length - 1, (no | 0) - 1));
    roundMod = savedMod && typeof savedMod === 'object' ? { ...savedMod } : {};
    const roundNo = roundIndex + 1;
    const cfg = level.rounds[roundIndex];
    phase = 'spawning';
    t = 0;
    spawnIdx = 0;
    gapT = 0;
    spawns = null;          // 与 nextRound 一致：延迟到 update 展开
    onRound?.(roundNo, level.rounds.length, cfg.tip);
  }

  function nextRound() {
    roundIndex++;
    if (roundIndex >= level.rounds.length) {
      phase = 'done';
      onVictory?.();
      return;
    }
    const roundNo = roundIndex + 1;
    const cfg = level.rounds[roundIndex];
    phase = 'spawning';
    t = 0;
    spawnIdx = 0;
    gapT = 0;
    // 第 7 块：事件改到「回合结束」触发，写的是**下一回合**的修正，
    // 所以这里不能再无条件清空 —— 只有第 1 回合（还没有任何事件）才从空开始。
    if (roundIndex === 0) roundMod = {};
    spawns = null;          // 延迟到 update 才展开：修正改变后仍来得及生效
    onRound?.(roundNo, level.rounds.length, cfg.tip);
  }

  function applyRoundMod(mod) {
    if (mod && typeof mod === 'object') roundMod = { ...roundMod, ...mod };
  }

  // 跳过本回合（第 30 块，管理员模式）：
  // 不另开一条路径 —— 把「还没生成的怪」全部划掉，下一帧 update 走的是
  // 普通的清场判断，所以回合结算（三选一 / 商店 / 事件）和正常打完完全一致。
  // 场上现存的怪由调用方（main.js）先 killAll 清掉。
  function skipRound() {
    if (phase === 'gap') { gapT = level.gap; return true; }   // 空档里点：直接催下一回合
    if (phase !== 'spawning') return false;
    if (spawns == null) spawns = [];   // 还停在延迟展开阶段：给个空表即可
    spawnIdx = spawns.length;
    return true;
  }

  function update(dt) {
    if (phase === 'spawning') {
      if (spawns == null) spawns = buildSpawns(roundIndex + 1, roundMod, level);
      t += dt;
      while (spawnIdx < spawns.length && t >= spawns[spawnIdx].delay) {
        const sp = spawns[spawnIdx++];
        const at = pickSpawn();
        const sc = roundScale(roundIndex + 1, level);
        const e = enemies.spawn(sp.type, at, {
          hpScale: sc.hp, damageScale: sc.damage, speedScale: sc.speed,
        });
        if (e) spawned++;
      }

      // 必须全部清掉才算这回合结束（含刚钻出来、还没死的）
      if (spawnIdx >= spawns.length && enemies.aliveCount() === 0) {
        phase = 'gap';
        gapT = 0;
        // 本回合（由上一回合结束的事件写入）的修正到此为止，
        // 紧接着 onRoundClear 里会为下一回合写新的
        roundMod = {};
        onRoundClear?.(roundIndex + 1, level.rounds.length);
      }
    } else if (phase === 'gap') {
      gapT += dt;
      if (gapT >= level.gap) nextRound();
    }
  }

  function reset() {
    roundIndex = -1;
    phase = 'idle';
    t = 0; spawnIdx = 0; gapT = 0; spawned = 0;
    spawns = null;
    roundMod = {};
    recentSpawns.length = 0;
  }

  return {
    start, startAt, update, reset,
    skipRound,
    level,
    applyRoundMod,
    // waveIndex 是 0 基的历史名字，按「第几回合」用时读 roundNo
    get waveIndex() { return roundIndex; },
    get roundIndex() { return roundIndex; },
    get roundNo() { return roundIndex + 1; },
    get phase() { return phase; },
    get spawned() { return spawned; },
    get roundMod() { return roundMod; },
    totals: levelStats(level),
    shouldUpgrade(roundNo) { return level.upgradeAfter.includes(roundNo); },
    shouldShop(roundNo) { return level.shopAfter.includes(roundNo); },
    onKill,
  };
}

// ---- 兼容包装：老代码/老测试调 createLevel1(deps) 就是第一关 ----
export function createLevel1(deps) { return createLevel(LEVEL_1, deps); }
export function createLevel2(deps) { return createLevel(LEVEL_2, deps); }
export function createLevel3(deps) { return createLevel(LEVEL_3, deps); }

// 按关卡号创建（主流程用这个）。未知关卡回落到第一关。
export function createLevelById(id, deps) {
  return createLevel(LEVELS_BY_ID[id] || LEVEL_1, deps);
}
