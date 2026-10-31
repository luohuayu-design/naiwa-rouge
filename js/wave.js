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
//   速度：每回合 +4.5%（第 20 回合 ×1.86，小兵 2.30 → 4.27，主角 4.4 —— 后期会咬到你脚后跟）
//   攻速：每回合 +0.70%，**再乘后期加速**（第 91 块）——
//          R1 ×1.00 → R5 ×1.04 → R10 ×1.13 → R15 ×1.27 → R20 ×1.45。
//          冷却除以它，前摇不动：出手更频繁，但仍然看得见红圈。
//   小兵基础 1 血，四舍五入后第 5 回合起变 2 血（R1~R4 仍是一刀一只）；
//   战士 3 血，第 5 回合 5 血、第 10 回合 7 血、第 15 回合 10 血、第 20 回合 12 血。
//
// 第 91 块为什么要加后两条轴：用户「让难度梯度更明显，例如攻击更快、移动更快、
// 伤害更高，而不只是叠个数和生命」。血量/伤害本来就很陡（4 倍 / 3 倍），
// 但那是「打得更久」，不是「更凶」—— 玩家在 R20 面对的还是同一批慢吞吞的骷髅，
// 只是更耐打。加出手频率 + 提高移速之后，后期的怪会**真的追上来、真的连打**，
// 这一关从「推」变成「跑」。
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
  scale: { hp: 0.16, damage: 0.10, speed: 0.045, haste: 0.0070, curve: 0.28 },
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
//   二关场上永远站着几种「不打就难受」的施法怪，逼玩家判断该先切谁。
//
// 三个施法怪各带一件事（enemy.js 里一人一个技能，绝不叠在同一个人身上）：
//   咒面图腾 hexer —— 读条在你脚下钉紫阵，落地掉血 + 减速。躲得掉，但连发就烦。
//   焚火魔 pyro    —— 读条留一片灼地，站上去持续掉血 4 秒。不许站桩。
//   孢冠菌王 hierarch —— 霜牢环钉在玩家脚下跟着走，环里的怪加攻速 & 减伤泛青光；
//                        自己还会放石刺、召卫队。血最厚，站最后排，优先点掉。
//
// 登场节奏：R6 图腾 → R10 焚火魔 → R13 菌王。每次只放一位新面孔，
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
  scale: { hp: 0.20, damage: 0.12, speed: 0.045, haste: 0.0075, curve: 0.28 },
  rounds: [
    // ---- 第一幕（R1~R5）：骨塔的院子。先认路，投手提前登场 ----
    { minion: 3,  warrior: 0, archer: 0, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.90, tip: '骨塔的院子，草都不长' },
    { minion: 4,  warrior: 1, archer: 0, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.80, tip: '还是老规矩：边走边拍' },
    { minion: 4,  warrior: 1, archer: 1, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.80, tip: '一上来就有投手了，横着走躲骨刀' },
    { minion: 5,  warrior: 2, archer: 1, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.75, tip: '这一波之后，你会有新武器' },
    { minion: 5,  warrior: 2, archer: 1, bowman: 0, hexer: 0, pyro: 0, hierarch: 0, gap: 0.70, tip: '院子深处有灯亮着 —— 有人在等你' },
    // ---- 第二幕（R6~R10）：三个新面孔依次登场 ----
    { minion: 6,  warrior: 2, archer: 1, bowman: 0, hexer: 1, pyro: 0, hierarch: 0, gap: 0.65, tip: '那个面具图腾在念咒：脚下出紫圈就赶紧走' },
    { minion: 6,  warrior: 2, archer: 2, bowman: 0, hexer: 1, pyro: 0, hierarch: 0, gap: 0.60, tip: '被它的咒打中会走不动路，别硬吃' },
    { minion: 6,  warrior: 2, archer: 2, bowman: 1, hexer: 1, pyro: 0, hierarch: 0, gap: 0.58, tip: '咒面图腾血厚，值得专门冲一趟' },
    { minion: 7,  warrior: 3, archer: 2, bowman: 1, hexer: 1, pyro: 0, hierarch: 0, gap: 0.55, tip: '两只图腾了，紫圈会叠' },
    { minion: 7,  warrior: 3, archer: 2, bowman: 1, hexer: 2, pyro: 1, hierarch: 0, gap: 0.55, tip: '新面孔：那只蝙蝠会在你脚下留火，别站着不动' },
    // ---- 第三幕（R11~R15）：混编加压，孢冠菌王登场 ----
    { minion: 7,  warrior: 3, archer: 2, bowman: 1, hexer: 2, pyro: 1, hierarch: 0, gap: 0.50, tip: '火是留在地上的，踩上去一直掉血' },
    { minion: 7,  warrior: 3, archer: 2, bowman: 2, hexer: 2, pyro: 1, hierarch: 0, gap: 0.50, tip: '紫圈、火地、红圈，三样一起来' },
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 2, pyro: 1, hierarch: 1, gap: 0.48, tip: '后排那顶菌盖：脚下青圈里的怪会变凶，它自己还会放石刺' },
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 2, pyro: 2, hierarch: 1, gap: 0.46, tip: '先砍菌王 —— 它一死，跟着它的卫队也会散架' },
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 2, pyro: 2, hierarch: 1, gap: 0.45, tip: '别站在青圈里打，石刺是从菌王那边吐过来的' },
    // ---- 第四幕（R16~R20）：骨塔议会。三个 Boss 同场 ----
    { minion: 8,  warrior: 4, archer: 3, bowman: 2, hexer: 3, pyro: 2, hierarch: 1, gap: 0.45, tip: '第 16 回合：骨塔议会开始点名' },
    { minion: 9,  warrior: 5, archer: 3, bowman: 2, hexer: 3, pyro: 2, hierarch: 2, gap: 0.42, tip: '两个菌王 = 两圈青光，先点掉一个，卫队会跟着散' },
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
// 三只新怪（enemy.js 一人一套行为；第 52 块换成牛/兽人/菇）：
//   charger  冲锋蛮牛 —— 蓄力 0.85 秒（地上画直线）→ 直线冲 6.5 格，撞上 2 伤，
//                          撞完僵直 1.1 秒。**必须横向侧移**，这是三关唯一的硬走位要求。
//   shielder 盾斧兽人 —— 举盾 1.6 秒（减伤 70%、不动）↔ 放盾 1.6 秒（正常挨打）。
//                          输出窗口是自己给的，急着打只会浪费伤害。
//   brood    孢生菇   —— 每 7 秒孵 2 只小兵（它名下最多 6 只存活）。
//                          不点掉她，这回合永远清不完。
//
// 登场节奏：R4 蛮牛 → R9 兽人 → R13 孢生菇，每次只放一位新面孔；
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
  arena: 19,               // 第 33 块：场地扩大（一/二关 15）—— 怪多，摊开打
  // 顺序：近身先来 → 远程 → 支援（骸盾/孵骨最后）—— 先清贴脸的，再决定先切谁
  order: [
    ['minion', 1], ['warrior', 1.6], ['charger', 1.8],
    ['archer', 2.0], ['bowman', 2.2], ['shielder', 2.4], ['brood', 2.6],
  ],
  spawnRadius: 17.4,       // 刷怪圆环跟着场地走（19 − 一点余量）
  spawnJitter: 0.5,
  minPlayerDistance: 8.0,  // 场大了，出生点离人也更远一点
  minSpawnGap: 2.4,        // 出生点之间铺得更开，不扎堆
  gapScale: 1.35,          // 第 33 块：段内生成间隔整体放慢 35%，怪不成堆
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.24, damage: 0.14, speed: 0.045, haste: 0.0080, curve: 0.28 },
  rounds: [
    // ---- 第一幕（R1~R4）：焦土院子 ----
    { minion: 3,  warrior: 0, charger: 0, archer: 0, bowman: 0, shielder: 0, brood: 0, gap: 0.90, tip: '钟楼的院子里全是灰，踩上去像雪' },
    { minion: 4,  warrior: 1, charger: 0, archer: 0, bowman: 0, shielder: 0, brood: 0, gap: 0.80, tip: '还是老规矩：边走边拍' },
    { minion: 4,  warrior: 1, charger: 0, archer: 1, bowman: 0, shielder: 0, brood: 0, gap: 0.80, tip: '这次一上来就有投手了' },
    // ---- 第二幕（R4~R8）：蛮牛登场 ----
    { minion: 5,  warrior: 2, charger: 1, archer: 0, bowman: 0, shielder: 0, brood: 0, gap: 0.75, tip: '那头黑牛会冲：地上出红线就往侧面走' },
    { minion: 5,  warrior: 2, charger: 1, archer: 1, bowman: 0, shielder: 0, brood: 0, gap: 0.72, tip: '冲锋躲开之后它会僵一下 —— 那时候打' },
    { minion: 5,  warrior: 2, charger: 2, archer: 1, bowman: 1, shielder: 0, brood: 0, gap: 0.70, tip: '两头牛：别站在它们和你的连线上' },
    { minion: 6,  warrior: 3, charger: 2, archer: 1, bowman: 1, shielder: 0, brood: 0, gap: 0.66, tip: '新面孔：弓手的红圈，得挪出去' },
    { minion: 6,  warrior: 3, charger: 2, archer: 2, bowman: 1, shielder: 0, brood: 0, gap: 0.62, tip: '红线 + 红圈一起出现时，先躲圈' },
    // ---- 第三幕（R9~R12）：盾斧兽人 ----
    { minion: 6,  warrior: 3, charger: 2, archer: 2, bowman: 1, shielder: 1, brood: 0, gap: 0.60, tip: '举盾的兽人打不动：等它放下盾再打' },
    { minion: 7,  warrior: 3, charger: 3, archer: 2, bowman: 1, shielder: 1, brood: 0, gap: 0.58, tip: '盾放下的一瞬间，它反而走得更快' },
    { minion: 7,  warrior: 4, charger: 3, archer: 2, bowman: 2, shielder: 2, brood: 0, gap: 0.55, tip: '两头盾兵：别把输出全花在盾上' },
    { minion: 7,  warrior: 4, charger: 3, archer: 3, bowman: 2, shielder: 2, brood: 0, gap: 0.54, tip: '灰里已经有钟声了 —— 塔上有人' },
    // ---- 第四幕（R13~R15）：孢生菇 ----
    { minion: 7,  warrior: 4, charger: 3, archer: 3, bowman: 2, shielder: 2, brood: 1, gap: 0.52, tip: '那颗尖刺菇在孵小兵 —— 先冲过去砍它' },
    { minion: 8,  warrior: 4, charger: 3, archer: 3, bowman: 2, shielder: 2, brood: 1, gap: 0.50, tip: '它孵出来的小兵会自己走，别追着打' },
    { minion: 8,  warrior: 4, charger: 4, archer: 3, bowman: 2, shielder: 2, brood: 1, gap: 0.48, tip: '蛮牛四头：留一条横向的空地' },
    // ---- 第五幕（R16~R20）：钟楼残响。三者混编的毕业考 ----
    { minion: 8,  warrior: 5, charger: 4, archer: 3, bowman: 2, shielder: 3, brood: 2, gap: 0.46, tip: '第 16 回合：钟楼残响，三样一起来了' },
    { minion: 9,  warrior: 5, charger: 4, archer: 3, bowman: 3, shielder: 3, brood: 2, gap: 0.44, tip: '两颗孢生菇 = 十二只小兵上限，先拆一只' },
    { minion: 9,  warrior: 5, charger: 4, archer: 4, bowman: 3, shielder: 3, brood: 2, gap: 0.42, tip: '盾兵打不动就先绕开，别在它身上耗' },
    { minion: 9,  warrior: 6, charger: 5, archer: 4, bowman: 3, shielder: 3, brood: 2, gap: 0.40, tip: '还差两回合：横向走位不要停' },
    { minion: 10, warrior: 6, charger: 5, archer: 4, bowman: 3, shielder: 4, brood: 2, gap: 0.38, tip: '最后一波：把钟楼里的人全拍碎' },
  ],
};

// ============================================================
// 第四关 · 雾堤服务区（第 35 块）
// 焦土公路尽头的废弃服务区，夜里起雾、地面积霜。
// 难度与第三关持平（用户定案）：hp 0.26 / dmg 0.15，约 400 只，
// 场地 19→20（怪多一点，摊得开一点）。
// 新怪：雾鬼（隐身）/ 雾猎狼（跳劈）/ 缝补小巫（回血）。
// ============================================================
export const LEVEL_4 = {
  id: 4,
  name: '第四关 · 雾堤服务区',
  theme: 'fog',
  arena: 20,               // 第三关 19，这关怪略多、再摊开一点
  // 顺序：近身 → 跳劈/远程 → 支援（盾/孵/缝合最后）——先清贴脸的
  order: [
    ['minion', 1], ['warrior', 1.6], ['charger', 1.8], ['leaper', 1.9],
    ['archer', 2.0], ['bowman', 2.2], ['wraith', 2.2],
    ['shielder', 2.4], ['brood', 2.6], ['mender', 2.6],
  ],
  spawnRadius: 18.2,
  spawnJitter: 0.5,
  minPlayerDistance: 8.0,
  minSpawnGap: 2.4,
  gapScale: 1.35,          // 与第三关同：生成放缓，雾里本来就看不清，别再扎堆
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.26, damage: 0.15, speed: 0.045, haste: 0.0085, curve: 0.28 },
  rounds: [
    // ---- 第一幕（R1~R3）：霜面停车场 ----
    { minion: 3,  warrior: 0, charger: 0, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.90, tip: '雾堤服务区：地上有霜，看脚下' },
    { minion: 4,  warrior: 1, charger: 0, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.80, tip: '还是老规矩：边走边拍' },
    { minion: 4,  warrior: 1, charger: 0, leaper: 0, archer: 1, bowman: 0, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.80, tip: '半透明的那只是雾鬼：隐身时打不着' },
    // ---- 第二幕（R4~R7）：雾猎狼登场 ----
    { minion: 5,  warrior: 1, charger: 0, leaper: 1, archer: 0, bowman: 0, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.75, tip: '雾狼要扑了：地上出红圈就挪出去' },
    { minion: 5,  warrior: 2, charger: 0, leaper: 1, archer: 1, bowman: 0, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.72, tip: '落地会震荡：它跳的是你刚才站的地方' },
    { minion: 5,  warrior: 2, charger: 0, leaper: 1, archer: 1, bowman: 1, wraith: 2, shielder: 0, brood: 0, mender: 0, gap: 0.70, tip: '雾鬼两只：别背对雾开怪' },
    { minion: 5,  warrior: 3, charger: 0, leaper: 2, archer: 1, bowman: 1, wraith: 2, shielder: 0, brood: 0, mender: 0, gap: 0.66, tip: '两只跳劈：红圈别叠着站' },
    // ---- 第三幕（R8~R11）：缝补小巫 ----
    { minion: 6,  warrior: 3, charger: 0, leaper: 2, archer: 2, bowman: 1, wraith: 2, shielder: 0, brood: 0, mender: 1, gap: 0.62, tip: '戴尖帽的小巫会给怪回血：先冲它' },
    { minion: 6,  warrior: 3, charger: 0, leaper: 2, archer: 2, bowman: 1, wraith: 2, shielder: 1, brood: 0, mender: 1, gap: 0.60, tip: '盾兵回来了：老规矩，等它放盾' },
    { minion: 7,  warrior: 3, charger: 0, leaper: 2, archer: 2, bowman: 1, wraith: 3, shielder: 1, brood: 0, mender: 1, gap: 0.58, tip: '雾鬼三只：显形的那一瞬最脆' },
    { minion: 7,  warrior: 4, charger: 0, leaper: 2, archer: 2, bowman: 2, wraith: 3, shielder: 1, brood: 1, mender: 1, gap: 0.56, tip: '孢生菇也来了：一边加人一边加血' },
    // ---- 第四幕（R12~R15）：三新混编 ----
    { minion: 7,  warrior: 4, charger: 0, leaper: 3, archer: 2, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, gap: 0.54, tip: '跳劈三只：留一条没有红圈的路' },
    { minion: 8,  warrior: 4, charger: 0, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, gap: 0.52, tip: '缝补小巫不砍就一直奶：别恋战' },
    { minion: 8,  warrior: 4, charger: 0, leaper: 3, archer: 3, bowman: 2, wraith: 4, shielder: 2, brood: 1, mender: 1, gap: 0.50, tip: '雾最浓的时候：贴着边圈走' },
    { minion: 8,  warrior: 5, charger: 0, leaper: 3, archer: 3, bowman: 2, wraith: 4, shielder: 2, brood: 1, mender: 1, gap: 0.48, tip: '回血和孵兵一起上场：先拆绿的' },
    // ---- 第五幕（R16~R20）：雾堤长夜。全家桶的雾中毕业考 ----
    { minion: 7,  warrior: 4, charger: 0, leaper: 4, archer: 2, bowman: 2, wraith: 4, shielder: 2, brood: 2, mender: 1, gap: 0.46, tip: '第 16 回合：雾堤长夜，全来了' },
    { minion: 7,  warrior: 4, charger: 0, leaper: 4, archer: 3, bowman: 2, wraith: 4, shielder: 3, brood: 2, mender: 1, gap: 0.44, tip: '盾厚雾浓：冰剑和暖炉该上场了' },
    { minion: 7,  warrior: 4, charger: 0, leaper: 4, archer: 2, bowman: 2, wraith: 4, shielder: 3, brood: 2, mender: 1, gap: 0.42, tip: '还剩四回合：横着走，别停' },
    { minion: 7,  warrior: 4, charger: 0, leaper: 4, archer: 3, bowman: 2, wraith: 4, shielder: 3, brood: 2, mender: 1, gap: 0.40, tip: '倒数第二波：小巫留到最后也行，先保命' },
    { minion: 8,  warrior: 4, charger: 0, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 1, gap: 0.38, tip: '最后一波：把服务区里的雾全拍散' },
  ],
};

// ============================================================
// 第五关 · 草甸路口（第 63 块）
//
// 剧情接 s05《一百只蛙的名单》：蛙爷在草甸路口摆了四十年摊，
// 一本册子记着这条草甸上住过谁。名字被擦掉的人「人还在，魂没了」。
//
// 这一关换了**压力的形状**：不是更密、不是更多技能，而是
// **怪从哪来变了**。
//   前四关怪从一整圈随机位置涌进来，你只能原地转圈迎。
//   这一关是十字路口 —— 怪只从东南西北四条路上来（lanes: 4），
//   每条路的角度固定、只带一点抖动。于是你**可以提前站位**：
//   背对没有路的方向，把正面留给两条路，就不会被四面夹。
//   这是全游戏第一次「地形站在你这边」的关卡。
//
// 新怪：擦名者（见 enemy.js）—— 它偷你环上的剑，得手就跑。
//   它不伤人，收益全记在你那本账上：丢一把剑 = 输出掉一截，
//   而且这一局永远拿不回来（除非当场杀了它）。
//
// 新法器：路口灯（见 relics.js）—— 每 4 秒点亮一圈，反隐 + 减速。
//   这条草甸夜里下雾，雾鬼（wraith）从第 4 回合就在场上了，
//   而这版本雾鬼隐身时能咬你、你却打不着它 —— 路口灯是唯一的反制。
//
// 数值比四关略高（hp 0.28 / dmg 0.16），怪的密度反而比四关低一点：
// 四向路口本身已经是压力，别再叠密度。
// ============================================================
export const LEVEL_5 = {
  id: 5,
  name: '第五关 · 草甸路口',
  theme: 'crossroad',
  arena: 20,
  // 四向路口：刷怪只从这 4 条路上来（角度均分，带 ±6% 的抖动）
  lanes: 4,
  order: [
    ['minion', 1], ['warrior', 1.6], ['leaper', 1.9],
    ['archer', 2.0], ['bowman', 2.2], ['wraith', 2.2],
    ['shielder', 2.4], ['brood', 2.6], ['mender', 2.6],
    ['eraser', 3.0],       // 擦名者最后进来：它是这一关的主菜，别跟小兵一起挤
  ],
  spawnRadius: 18.2,
  spawnJitter: 0.5,
  minPlayerDistance: 8.0,
  minSpawnGap: 2.4,
  gapScale: 1.35,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  // 第 65 块：用户实测「五六关偏软」→ 伤害 ×1.35、血量 ×1.15（整关一起乘）
  scale: { hp: 0.28, damage: 0.16, speed: 0.045, haste: 0.0090, curve: 0.28, hpMul: 1.15, dmgMul: 1.35 },
  rounds: [
    // ---- 第一幕（R1~R3）：路口 · 油灯还亮着 ----
    { minion: 3,  warrior: 0, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.90, tip: '草甸路口：四条路，油灯还亮着' },
    { minion: 4,  warrior: 1, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.80, tip: '它们只从四条路上来 —— 背对没路的方向' },
    { minion: 4,  warrior: 1, leaper: 0, archer: 1, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.80, tip: '路口的好处：你知道它们会从哪来' },
    // ---- 第二幕（R4~R7）：雾从东边漫过来 ----
    { minion: 5,  warrior: 1, leaper: 0, archer: 0, bowman: 0, wraith: 1, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.75, tip: '起雾了：半透明那只隐身时打不着，但它能咬你' },
    { minion: 5,  warrior: 2, leaper: 0, archer: 1, bowman: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.72, tip: '盯着雾里那道影子 —— 它显形的那一瞬最脆' },
    { minion: 6,  warrior: 2, leaper: 1, archer: 1, bowman: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.70, tip: '雾狼跳的是你刚才站的地方，别原地不动' },
    { minion: 6,  warrior: 3, leaper: 1, archer: 2, bowman: 1, wraith: 2, shielder: 0, brood: 0, mender: 0, eraser: 0, gap: 0.66, tip: '两只雾鬼：别背对着雾开怪' },
    // ---- 第三幕（R8~R12）：擦名者 ----
    { minion: 6,  warrior: 3, leaper: 1, archer: 2, bowman: 1, wraith: 2, shielder: 0, brood: 0, mender: 0, eraser: 1, gap: 0.64, tip: '戴兜帽的那个在擦东西 —— 它要偷你一把剑，先砍它' },
    { minion: 7,  warrior: 3, leaper: 1, archer: 2, bowman: 2, wraith: 2, shielder: 0, brood: 0, mender: 0, eraser: 1, gap: 0.60, tip: '它读条 4.5 秒：脚下出紫圈就冲过去，来得及' },
    { minion: 7,  warrior: 3, leaper: 2, archer: 3, bowman: 2, wraith: 2, shielder: 1, brood: 0, mender: 0, eraser: 1, gap: 0.58, tip: '得手之后它会往外跑：追出去，不然剑就没了' },
    { minion: 7,  warrior: 4, leaper: 2, archer: 3, bowman: 2, wraith: 3, shielder: 1, brood: 0, mender: 1, eraser: 1, gap: 0.56, tip: '缝补小巫在给怪回血：绿的先拆' },
    { minion: 8,  warrior: 4, leaper: 2, archer: 3, bowman: 2, wraith: 3, shielder: 1, brood: 1, mender: 1, eraser: 1, gap: 0.54, tip: '冰剑冻住擦名者最好用：它跑不动就只能站着等你' },
    // ---- 第四幕（R13~R16）：路口挤满了 ----
    { minion: 8,  warrior: 4, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, eraser: 1, gap: 0.52, tip: '四条路上都有东西在动' },
    { minion: 8,  warrior: 5, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, eraser: 1, gap: 0.50, tip: '盾兵挡路：等它放盾，别把输出花在盾上' },
    { minion: 8,  warrior: 5, leaper: 3, archer: 4, bowman: 3, wraith: 4, shielder: 2, brood: 1, mender: 1, eraser: 2, gap: 0.48, tip: '两个擦名者：它们偷的是两把不同的剑' },
    { minion: 9,  warrior: 5, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 2, brood: 2, mender: 1, eraser: 2, gap: 0.46, tip: '路口挤满了：贴着边圈走，别被围在中间' },
    // ---- 第五幕（R17~R20）：草甸的夜路 · 毕业考 ----
    { minion: 9,  warrior: 5, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 1, eraser: 2, gap: 0.45, tip: '第 17 回合：草甸的夜路，全来了' },
    { minion: 9,  warrior: 6, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 2, eraser: 2, gap: 0.42, tip: '两个小巫：先拆奶，不然前面白打' },
    { minion: 10, warrior: 6, leaper: 4, archer: 4, bowman: 4, wraith: 5, shielder: 3, brood: 2, mender: 2, eraser: 2, gap: 0.40, tip: '还差两回合：雾里的影子一直在动' },
    { minion: 10, warrior: 6, leaper: 5, archer: 4, bowman: 4, wraith: 5, shielder: 3, brood: 2, mender: 2, eraser: 2, gap: 0.38, tip: '最后一波：把四条路上的人都拍碎' },
  ],
};

// ============================================================
// 第六关 · 骨塔机房（第 63 块）
//
// 剧情接 s06《生母弃我》：阿速带你钻进骨塔的地下机房 —— 报废服务器、
// 还在慢转的风扇、墙上贴满的 ERROR 日志。
//
// 这一关的场地**本身**会打人：地上有 6 块从机柜上拆下来的格栅，
// 年头久了漏电，周期性通电（通电前 0.8 秒会闪）。站上去每 0.6 秒掉 1 血。
// 位置是固定的 —— 会看节奏的玩家能踩着「灭」的窗口穿过去。
//
// 新怪：重启体（见 enemy.js）—— 打死不算完，4 秒后原地半血重启，
// 而且比上一次更快；最多重启 2 次。它逼你把「补刀」当成习惯。
//
// 新法器：绝缘斗篷（见 relics.js）—— 站上通电地板不掉血，
// 反而把电引到身边的怪身上。第六关的「以毒攻毒」。
//
// 数值：hp 0.30 / dmg 0.17（四关 0.26 / 0.15，五关 0.28 / 0.16）。
// 场地 19：比五关小一格，因为漏电地板已经占了走位空间。
// ============================================================
export const LEVEL_6 = {
  id: 6,
  name: '第六关 · 骨塔机房',
  theme: 'server',
  arena: 19,
  order: [
    ['minion', 1], ['warrior', 1.6], ['reboot', 1.9], ['arc', 2.1], ['leaper', 2.0],
    ['archer', 2.0], ['bowman', 2.2], ['wraith', 2.2],
    ['shielder', 2.4], ['brood', 2.6], ['mender', 2.6],
  ],
  spawnRadius: 17.4,
  spawnJitter: 0.5,
  minPlayerDistance: 8.0,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  // 第 65 块：同第五关 —— 伤害 ×1.35、血量 ×1.15
  scale: { hp: 0.30, damage: 0.17, speed: 0.045, haste: 0.0095, curve: 0.28, hpMul: 1.15, dmgMul: 1.35 },
  // 漏电地板：位置固定，相位错开（每一块的通电时间点不一样，
  // 否则整片地板会一起亮，玩家只能干等 —— 那是罚站，不是走位）
  hazards: [
    { x: 6.4, z: 0, r: 2.6, cycle: 5.0, on: 1.4, warm: 0.8, damage: 2 },
    { x: -6.4, z: 0, r: 2.6, cycle: 5.0, on: 1.4, warm: 0.8, damage: 2 },
    { x: 0, z: 6.4, r: 2.6, cycle: 5.0, on: 1.4, warm: 0.8, damage: 2 },
    { x: 0, z: -6.4, r: 2.6, cycle: 5.0, on: 1.4, warm: 0.8, damage: 2 },
    { x: 8.6, z: 8.6, r: 2.2, cycle: 6.2, on: 1.2, warm: 0.8, damage: 2 },
    { x: -8.6, z: -8.6, r: 2.2, cycle: 6.2, on: 1.2, warm: 0.8, damage: 2 },
  ],
  rounds: [
    // ---- 第一幕（R1~R4）：机房 · 风扇还在转 ----
    { minion: 3, warrior: 0, reboot: 0, arc: 0, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.90, tip: '骨塔地下机房：地上有几块格栅在漏电 —— 防御挡不住，别站上去' },
    { minion: 3, warrior: 1, reboot: 0, arc: 0, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.80, tip: '通电前会闪一下橙光 —— 看到就往外走' },
    { minion: 3, warrior: 1, reboot: 0, arc: 0, leaper: 0, archer: 1, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.80, tip: '弧线走位：绕开格栅，别直着冲' },
    // ---- 第二幕（R5~R8）：重启体登场 ----
    { minion: 4, warrior: 1, reboot: 1, arc: 0, leaper: 0, archer: 1, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.75, tip: '那个铁块打死了会重新站起来：躺下的时候守着它' },
    { minion: 4, warrior: 2, reboot: 1, arc: 0, leaper: 0, archer: 1, bowman: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.72, tip: '重启只需要 4 秒：走了就白打一次' },
    { minion: 4, warrior: 2, reboot: 1, arc: 2, leaper: 1, archer: 1, bowman: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.70, tip: '雾鬼也钻到机房里来了：隐着身照样咬人' },
    { minion: 4, warrior: 2, reboot: 2, arc: 2, leaper: 1, archer: 2, bowman: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.66, tip: '并联体浮起来了：两只之间就拉着一条电弧，碰到掉血 —— 不用等它们成对，两只起就连' },
    { minion: 4, warrior: 3, reboot: 2, arc: 2, leaper: 1, archer: 2, bowman: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, gap: 0.62, tip: '场上并联体越少，能站的缝就越多 —— 它们互相还会推开，缝隙是它们自己让出来的' },
    // ---- 第三幕（R9~R13）：混编加压 ----
    // 第 80 块：这一回合给 3 只（奇数），让「两只以上就成网、不必成对」真的看得见。
    { minion: 4, warrior: 3, reboot: 2, arc: 3, leaper: 2, archer: 2, bowman: 1, wraith: 2, shielder: 1, brood: 0, mender: 1, gap: 0.60, tip: '戴尖帽的小巫在给怪回血：别让它奶到重启体' },
    { minion: 5, warrior: 3, reboot: 2, arc: 4, leaper: 2, archer: 2, bowman: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, gap: 0.58, tip: '四只并联体 = 六条电弧：这张网会把你逼到格栅边上' },
    { minion: 5, warrior: 3, reboot: 2, arc: 4, leaper: 2, archer: 3, bowman: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, gap: 0.56, tip: '地板、怪、奶妈三件事一起来 —— 先保走位' },
    { minion: 5, warrior: 3, reboot: 3, arc: 4, leaper: 2, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, gap: 0.54, tip: '三个重启体：这一波的「清场」要清三遍' },
    { minion: 6, warrior: 3, reboot: 3, arc: 4, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, gap: 0.52, tip: '漏电地板上的怪不掉血 —— 别指望电帮你' },
    // ---- 第四幕（R14~R17）：机房的夜班 ----
    { minion: 6, warrior: 3, reboot: 3, arc: 4, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 2, mender: 1, gap: 0.50, tip: '两颗孢生菇：十二只小兵上限，先拆一颗' },
    { minion: 6, warrior: 4, reboot: 3, arc: 4, leaper: 3, archer: 3, bowman: 3, wraith: 3, shielder: 2, brood: 2, mender: 1, gap: 0.48, tip: '风扇声越来越近 —— 它们比刚才更快了' },
    { minion: 6, warrior: 4, reboot: 4, arc: 4, leaper: 3, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 1, gap: 0.46, tip: '四个重启体：留一条能绕回格栅外的路' },
    { minion: 6, warrior: 4, reboot: 4, arc: 4, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 2, gap: 0.44, tip: '第 17 回合：ERROR 日志刷得停不下来' },
    // ---- 第五幕（R18~R20）：骨塔机房 · 毕业考 ----
    { minion: 6, warrior: 4, reboot: 4, arc: 4, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 2, gap: 0.42, tip: '还差三回合：别把血花在电上' },
    { minion: 6, warrior: 5, reboot: 4, arc: 4, leaper: 4, archer: 4, bowman: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, gap: 0.40, tip: '倒数第二波：补刀、补刀、补刀' },
    { minion: 7, warrior: 5, reboot: 5, arc: 4, leaper: 4, archer: 4, bowman: 4, wraith: 5, shielder: 4, brood: 2, mender: 2, gap: 0.38, tip: '最后一波：把机房里的东西全拆了' },
  ],
};

// ============================================================
// 第七关 · 骨塔井底（第 71 块）
//
// 剧情接 s07《井底的哲学课》：阿井躺平的井，不深，但里面全是戏。
//
// 这一关换了**场地的形状**：不是开阔地，是**窄井**——场地从六关的 19 缩到 13，
// 转身不方便、贴边就撞墙。配合头顶的**滴水落点**（见 hazards.js 的 kind:'drip'），
// 走位空间被压得很死：你既要躲怪，又要躲青蓝预警圈落下来的水。
//
// 两只新怪（enemy.js）：
//   wellfrog 井蛙 —— 吐舌头把主角拉过去，舌头有**独立血量**，必须先砍断舌头，
//                    井蛙本体才吃伤害；砍断后井蛙进入短硬直。这是「换血换机制」：
//                    它不靠更高数值压你，靠「拉你进怪堆」制造麻烦。
//   woodfish 木鱼灵 —— 青色法器精魄。第 82 块之前它整套复用咒面图腾
//                    （读条 → 脚下青圈 → 掉血 + 减速），用户：「攻击模式和咒面图腾重合」。
//                    现在改成吐**追踪泡**：一颗实体泡慢慢追你、能走位甩开、也能砍爆；
//                    追上就掉 1 点血并把你定住 1.2 秒（一步都走不了）。
//                    血薄、站后排，优先点掉。它敲的木鱼后来成了法器「木鱼」（见 relics.js）。
//
// 数值：hp 0.32 / dmg 0.19，再乘整关系数 hpMul 1.20 / dmgMul 1.45（六关是 1.15 / 1.35），
// 因为场地更小、走位更难，数值上不必再加太多；威胁来自机制而非堆数值。
// ============================================================
export const LEVEL_7 = {
  id: 7,
  name: '第七关 · 骨塔井底',
  theme: 'well',            // 第 71 块：深井蓝绿微光皮肤（scene.js 的 THEMES）
  arena: 13,               // 窄井：比六关的 19 小一截，转身空间很紧
  order: [
    ['minion', 1], ['warrior', 1.6], ['wellfrog', 1.8],
    ['archer', 2.0], ['bowman', 2.2], ['woodfish', 2.4],
    ['leaper', 2.0], ['wraith', 2.2], ['shielder', 2.4], ['brood', 2.6], ['mender', 2.6], ['reboot', 2.6],
  ],
  spawnRadius: 11.4,       // 跟着窄场地走（13 − 余量）
  spawnJitter: 0.5,
  minPlayerDistance: 6.5,  // 井小，出生点离人也更近一点
  minSpawnGap: 2.0,
  gapScale: 1.12,          // 生成放缓，窄井里别让怪叠成一坨
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  // 第 71 块：延续六关的整体系数再略加（hp 1.20 / dmg 1.45）
  scale: { hp: 0.32, damage: 0.19, speed: 0.045, haste: 0.0100, curve: 0.28, hpMul: 1.20, dmgMul: 1.45 },
  // 滴水落点：井底的水从头顶滴下来，三滴错相、随机落点（不依赖某只怪在场）
  hazards: [
    { kind: 'drip', random: true, cx: 0, cz: 0, spread: 8.5, r: 1.7, cycle: 3.4, on: 0.5, warm: 1.1, damage: 1, off: 0.0 },
    { kind: 'drip', random: true, cx: 0, cz: 0, spread: 8.5, r: 1.7, cycle: 3.4, on: 0.5, warm: 1.1, damage: 1, off: 1.7 },
    { kind: 'drip', random: true, cx: 0, cz: 0, spread: 8.5, r: 1.7, cycle: 3.4, on: 0.5, warm: 1.1, damage: 1, off: 2.5 },
  ],
  rounds: [
    // ---- 第一幕（R1~R3）：井底 · 水还在滴 ----
    { minion: 3, warrior: 0, wellfrog: 0, archer: 0, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.90, tip: '骨塔井底：头顶有水滴下来 —— 无视防御，看到青环就挪开' },
    { minion: 3, warrior: 1, wellfrog: 0, archer: 0, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.80, tip: '窄井里转身不方便，别贴着边走' },
    { minion: 3, warrior: 1, wellfrog: 0, archer: 1, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.80, tip: '还是横着走躲骨刀' },
    // ---- 第二幕（R4~R7）：井蛙登场 ----
    { minion: 4, warrior: 1, wellfrog: 1, archer: 1, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.75, tip: '那只绿蛙会吐舌头拉你 —— 舌头有独立血量，砍断它才能脱身' },
    { minion: 4, warrior: 2, wellfrog: 1, archer: 1, bowman: 1, woodfish: 0, leaper: 0, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.72, tip: '舌头伸出来时打它本体不掉血：先把舌头砍断' },
    { minion: 4, warrior: 2, wellfrog: 2, archer: 1, bowman: 1, woodfish: 0, leaper: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.70, tip: '两只井蛙会轮流拉你：别被拽到怪堆里' },
    { minion: 4, warrior: 2, wellfrog: 2, archer: 2, bowman: 1, woodfish: 0, leaper: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, gap: 0.66, tip: '盾兵也来了：等它放盾再打' },
    // ---- 第三幕（R8~R11）：木鱼灵登场 ----
    { minion: 4, warrior: 3, wellfrog: 2, archer: 2, bowman: 1, woodfish: 1, leaper: 1, wraith: 2, shielder: 1, brood: 0, mender: 0, reboot: 0, gap: 0.62, tip: '那只青色木鱼灵在吐泡：一次两颗、泡比以前大，会拐着弯追你，砍两下就炸' },
    { minion: 5, warrior: 3, wellfrog: 2, archer: 2, bowman: 2, woodfish: 1, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 0, reboot: 0, gap: 0.60, tip: '被泡追上会被定住一秒、环上的剑也会停转 —— 那一下最危险，优先点掉木鱼灵' },
    { minion: 5, warrior: 3, wellfrog: 3, archer: 3, bowman: 2, woodfish: 1, leaper: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 0, gap: 0.58, tip: '它敲的木鱼会震你 —— 井底的法器之一，之后能在商店买到' },
    { minion: 5, warrior: 3, wellfrog: 3, archer: 3, bowman: 2, woodfish: 2, leaper: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, reboot: 1, gap: 0.56, tip: '重启体也钻进井里了：躺下时守着它' },
    // ---- 第四幕（R12~R15）：混编加压 ----
    { minion: 5, warrior: 3, wellfrog: 3, archer: 3, bowman: 2, woodfish: 2, leaper: 3, wraith: 3, shielder: 2, brood: 1, mender: 1, reboot: 1, gap: 0.54, tip: '井蛙、木鱼、滴水和怪一起上 —— 先保走位' },
    { minion: 6, warrior: 3, wellfrog: 4, archer: 3, bowman: 3, woodfish: 2, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 1, reboot: 1, gap: 0.52, tip: '两只木鱼灵的泡会一起追：先把近的那颗砍了' },
    { minion: 6, warrior: 4, wellfrog: 4, archer: 4, bowman: 3, woodfish: 2, leaper: 3, wraith: 4, shielder: 3, brood: 2, mender: 1, reboot: 2, gap: 0.50, tip: '井蛙四只：舌头拉扯里别被拽出安全区' },
    { minion: 6, warrior: 4, wellfrog: 4, archer: 4, bowman: 3, woodfish: 3, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, gap: 0.48, tip: '第 15 回合：井底的水滴得最密' },
    // ---- 第五幕（R16~R20）：井底长夜 · 毕业考 ----
    { minion: 6, warrior: 4, wellfrog: 5, archer: 4, bowman: 3, woodfish: 3, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, gap: 0.46, tip: '第 16 回合：井底长夜，全来了' },
    { minion: 6, warrior: 4, wellfrog: 5, archer: 4, bowman: 4, woodfish: 3, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, gap: 0.44, tip: '木鱼法器该上了：挨打/击杀震一圈，把井蛙震退' },
    { minion: 6, warrior: 5, wellfrog: 5, archer: 5, bowman: 4, woodfish: 4, leaper: 5, wraith: 5, shielder: 3, brood: 2, mender: 2, reboot: 3, gap: 0.42, tip: '还剩三回合：舌头拉人和滴水一起躲' },
    { minion: 6, warrior: 5, wellfrog: 6, archer: 5, bowman: 4, woodfish: 4, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 4, gap: 0.40, tip: '倒数第二波：砍断舌头、躲开青圈' },
    { minion: 6, warrior: 5, wellfrog: 6, archer: 5, bowman: 4, woodfish: 4, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 4, gap: 0.38, tip: '最后一波：把井底的东西全拍碎，爬出去' },
  ],
};

// ============================================================
// 第八关 · 骨塔寄存层（第 81 块立，第 83 块重做）
//
// 剧情接 s08《一百层台阶》：骨塔的台阶是螺旋的，每一级都刻着名字。
// 第七十层是个大平台，平台边上有间木头柜子 —— 这一层的骷髅死后，
// 胸前那块被雾吹花了的木牌会被它收进去。
//
// 【第 83 块为什么整个换掉】用户原话：「那个一起移动的问题太大，直接换掉」。
// 旧机制是「一排不追人的骷髅 + 旗手崩散 + 柜子攒 8 块放出一支新队伍」，
// 队形系统（槽位 / 法线对齐 / 撞墙换向 / 崩散）整块删了，两只队形怪也删了。
// 现在的循环短得多，也硬得多：
//
//   任何一只怪死 → 木牌进柜（柜面 8 格可见）
//   → 玩家可以走到柜边按「取牌」，敲对一串四位数字 → 柜里牌子全清
//   → 攒满 8 块就**封柜**，5 秒后**寄存处看守**走出来（五套攻击 + 半血暴怒）
//
// 所以这一关真正的压力不是「场上有多少怪」，而是「你敢不敢停下来按键」：
// 取牌面板不暂停游戏，12 秒里怪还在追你。
//
// 场地：arena 18 —— 比第七关的窄井（13）宽，因为要留出绕到柜边清牌的空间；
//       比第六关机房（19）略小，位置上的容错更低（柜子那侧只有一条窄路）。
// 数值：hp 0.34 / dmg 0.20，整体系数 hpMul 1.28 / dmgMul 1.55（七关是 1.20 / 1.45）。
//       看守的数值单列在 enemy.js 的 warden（hp 20 / 五套攻击 / 半血 ×1.4），
//       不吃这里的 hpMul 之外的额外加成 —— 一只就够硬了。
// ============================================================
export const LEVEL_8 = {
  id: 8,
  name: '第八关 · 骨塔寄存层',
  theme: 'ossuary',         // 第 81 块：骨白 + 灰绿 + 干白雾（scene.js 的 THEMES）
  arena: 18,
  order: [
    ['minion', 1], ['warrior', 1.6], ['archer', 2.0], ['bowman', 2.2],
    ['leaper', 2.2], ['wraith', 2.4], ['shielder', 2.4], ['mender', 2.6],
    ['brood', 2.6], ['reboot', 2.8], ['charger', 2.8],
  ],
  spawnRadius: 16.2,
  spawnJitter: 0.5,
  minPlayerDistance: 8.0,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0105, curve: 0.28, hpMul: 1.28, dmgMul: 1.55 },
  // 寄存柜：不在场地里，立在边界石圈外面（像间哨亭）。
  //   x/z 是柜子中心，r 是它的碰撞半径，summon 是封柜开门时放出来的怪。
  //   玩家走到场地边缘（r≈17.7）离柜子 1.5 格，落在「取牌」范围（3.6）里。
  //   summon 也进 levelTypes()，所以进关时看守的模型就一起预载好了（第 83 块）。
  deposit: { x: 0, z: -19.2, r: 1.5, summon: 'warden' },
  rounds: [
    // ---- 第一幕（R1~R4）：寄存层 · 认识柜子 ----
    { minion: 3, warrior: 1, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.90, tip: '骨塔第七十层：场边那间木柜是寄存柜 —— 每死一只怪，木牌都会被它收进去' },
    { minion: 4, warrior: 2, archer: 1, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.84, tip: '柜面有 8 个格子，右下角写着已经收了几块' },
    { minion: 4, warrior: 2, archer: 2, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.80, tip: '走到柜子旁边，屏幕底下会冒出「取牌」按钮' },
    { minion: 4, warrior: 3, archer: 2, bowman: 1, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.76, tip: '按下取牌会给你一串四位数字：用面板上的键盘敲进去，敲完自动判定' },
    // ---- 第二幕（R5~R8）：清柜 ----
    { minion: 4, warrior: 3, archer: 2, bowman: 2, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.72, tip: '输对了柜里的牌子全被取走 —— 趁场上没几只的时候按' },
    { minion: 4, warrior: 3, archer: 3, bowman: 2, leaper: 2, wraith: 0, shielder: 1, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.70, tip: '面板不暂停游戏：按键盘的时候怪还在往你身上走' },
    { minion: 5, warrior: 3, archer: 3, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.66, tip: '输错或超时只是白跑一趟，牌子还在柜里，3 秒后能再按' },
    { minion: 5, warrior: 3, archer: 3, bowman: 2, leaper: 2, wraith: 1, shielder: 2, brood: 0, mender: 1, reboot: 0, charger: 0, gap: 0.62, tip: '攒满 8 块会当场封柜 —— 到那一刻就再也清不掉了' },
    // ---- 第三幕（R9~R13）：看守 ----
    { minion: 5, warrior: 3, archer: 3, bowman: 3, leaper: 2, wraith: 1, shielder: 2, brood: 1, mender: 1, reboot: 0, charger: 0, gap: 0.60, tip: '封柜 5 秒后柜门打开：寄存处看守会自己走出来' },
    { minion: 6, warrior: 3, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, charger: 0, gap: 0.58, tip: '看守有五套攻击：贴脸横扫、中距砸地、正面扇形牌雨、远处拐弯投牌，还会砸柜放小怪' },
    { minion: 6, warrior: 4, archer: 4, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, charger: 0, gap: 0.56, tip: '地上亮起金圈就往外走：那是落锤的位置，站里面必挨' },
    { minion: 6, warrior: 4, archer: 4, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, charger: 1, gap: 0.54, tip: '它半血之后会暴怒：移速和出手频率一起涨，别在原地跟它换血' },
    { minion: 6, warrior: 4, archer: 4, bowman: 4, leaper: 3, wraith: 2, shielder: 3, brood: 1, mender: 1, reboot: 1, charger: 1, gap: 0.52, tip: '别等它出现：这一关的正解是满 8 块之前清一次' },
    // ---- 第四幕（R14~R17）：两个机制一起压 ----
    { minion: 6, warrior: 4, archer: 4, bowman: 4, leaper: 3, wraith: 3, shielder: 3, brood: 2, mender: 1, reboot: 1, charger: 1, gap: 0.50, tip: '雾鬼也来了：一种是隐着身的，一种是明着走过来的' },
    { minion: 6, warrior: 5, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 1, charger: 1, gap: 0.48, tip: '投牌是从柜子那个方向飞过来的：别背对着柜子打' },
    { minion: 6, warrior: 5, archer: 5, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, charger: 1, gap: 0.46, tip: '第 16 回合：这一层的牌子从来收不完' },
    { minion: 7, warrior: 5, archer: 5, bowman: 4, leaper: 4, wraith: 3, shielder: 4, brood: 2, mender: 2, reboot: 2, charger: 2, gap: 0.44, tip: '第 17 回合：每一波都要绕到柜边一次，取牌就是「顺路」' },
    // ---- 第五幕（R18~R20）：毕业考 ----
    { minion: 7, warrior: 5, archer: 5, bowman: 5, leaper: 4, wraith: 4, shielder: 4, brood: 2, mender: 2, reboot: 2, charger: 2, gap: 0.42, tip: '还剩三回合：血别花在看守身上' },
    { minion: 7, warrior: 6, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 4, brood: 3, mender: 2, reboot: 3, charger: 2, gap: 0.40, tip: '倒数第二波：先看一眼柜里有几块，再决定要不要输出' },
    { minion: 8, warrior: 6, archer: 6, bowman: 5, leaper: 5, wraith: 4, shielder: 5, brood: 3, mender: 2, reboot: 3, charger: 2, gap: 0.38, tip: '最后一波：把这一层的牌子全收走' },
  ],
};

// ============================================================
// 第九关 · 骨塔登记庭（第 82 块）
//
// 剧情接 s09《名字的重量》：第九十九层，台阶尽头有一道门，门上嵌着一本簿子。
// 门卫 047 说「到这儿就得上称了 —— 这道门认字」。
//
// 【这一关在问什么】前八关问的都是「你怎么躲」：躲投手的骨刀、躲队伍那条线、
// 躲电弧网、躲井底的滴水。第九关问的是「你**先杀谁**」——
// 称量官一上称，**全场的怪一起加速、加伤害、加减伤**，而且迟早叠到五层。
// 拖着不解决它，同一批骷髅会每隔九秒换一副更凶的面孔；
// 反过来，它一倒，所有层当场清零 —— 这一关的输出位是它在站着念簿子的那 2.2 秒。
//
// 【所以它站在很后面】keepDistance 7.0、被逼近就往后躲。这不是耍赖，
// 是这套机制唯一成立的条件：它得比别的值钱，也得比别的难够到。
// 第五幕会同时上两只 —— 那时候「绕后」不再是单选题。
//
// 场地：arena 17 —— 比寄存层（18）再收一环。这一关全是「提速 + 混编」，
//       给太宽反而让人能一直跑；收窄之后每一次上称都会明显改变站位。
// 数值：hp 0.34 / dmg 0.20，整体系数 hpMul 1.28 / dmgMul 1.55（和第八关同档）——
//       **这一关不加额外数值**：称量官的五层 buff 本身就是一份很大的成长，
//       再加 hpmul 会让后期彻底失控。压力应该来自那个等差数列，不是来自表。
// ============================================================
export const LEVEL_9 = {
  id: 9,
  name: '第九关 · 骨塔登记庭',
  theme: 'registry',         // 第 82 块：鎏金 + 墨（scene.js 的 THEMES）
  arena: 17,
  order: [
    ['minion', 1], ['warrior', 1.6], ['weigher', 1.8], ['stamper', 2.05],
    ['archer', 2.0], ['bowman', 2.2], ['leaper', 2.2],
    ['wraith', 2.4], ['shielder', 2.4], ['brood', 2.6],
    ['mender', 2.6], ['reboot', 2.8], ['hexer', 3.0],
  ],
  spawnRadius: 15.2,
  spawnJitter: 0.5,
  minPlayerDistance: 7.6,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0110, curve: 0.28, hpMul: 1.28, dmgMul: 1.55 },
  rounds: [
    // ---- 第一幕（R1~R4）：上称 ----
    { minion: 3, warrior: 1, weigher: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, stamper: 0, hexer: 0, gap: 0.88, tip: '第九十九层：门认字，簿子认名字 —— 那道金边就是那扇门' },
    { minion: 3, warrior: 2, weigher: 1, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, stamper: 0, hexer: 0, gap: 0.80, tip: '抱着台账的那只是称量官：它把簿子翻开，全场一起变凶' },
    { minion: 4, warrior: 2, weigher: 1, archer: 1, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, stamper: 0, hexer: 0, gap: 0.78, tip: '它翻开簿子那 1.6 秒是唯一的窗口 —— 冲进去把它砍了' },
    { minion: 4, warrior: 2, weigher: 1, archer: 1, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, stamper: 1, hexer: 0, gap: 0.74, tip: '新面孔·盖章人：它在你脚下盖红方印，落下来就被封印 —— 别站着不动' },
    // ---- 第二幕（R5~R8）：它会躲，而且越来越难够到 ----
    { minion: 4, warrior: 3, weigher: 1, archer: 1, bowman: 1, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, stamper: 1, hexer: 0, gap: 0.72, tip: '被记名的怪更快、更疼、也更耐打 —— 别按老节奏打' },
    { minion: 4, warrior: 3, weigher: 1, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, stamper: 1, hexer: 0, gap: 0.70, tip: '它一躲就是七格开外：用位移一次拉到位，别追着它跑' },
    { minion: 5, warrior: 3, weigher: 1, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, stamper: 1, hexer: 0, gap: 0.66, tip: '尖帽小巫会给它回血：被奶回来的称量官等于从头念一遍' },
    { minion: 5, warrior: 3, weigher: 1, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 1, mender: 1, reboot: 0, stamper: 1, hexer: 0, gap: 0.64, tip: '第二只称量官要来了：两只叠得比一只快一倍' },
    // ---- 第三幕（R9~R13）：两只轮流念 ----
    { minion: 5, warrior: 3, weigher: 2, archer: 2, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 0, stamper: 1, hexer: 0, gap: 0.60, tip: '两只轮流上称：拆掉一只，另一只还在念 —— 但也只剩它了' },
    { minion: 6, warrior: 3, weigher: 2, archer: 3, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 1, stamper: 1, hexer: 0, gap: 0.58, tip: '五层封顶：到那一层场上每一只都比第七关的还凶' },
    { minion: 6, warrior: 4, weigher: 2, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, stamper: 1, hexer: 1, gap: 0.56, tip: '紫阵也回来了：被减速的时候最容易吃满一次上称' },
    { minion: 6, warrior: 4, weigher: 2, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 1, reboot: 1, stamper: 2, hexer: 1, gap: 0.54, tip: '第二只盖章人也来了：被封印的那两秒最容易吃满一次上称' },
    { minion: 6, warrior: 4, weigher: 2, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 1, stamper: 2, hexer: 1, gap: 0.52, tip: '第 13 回合：这一层从来就不缺追赶的人，只缺一个名字' },
    // ---- 第四幕（R14~R17）：封顶压力下打 ----
    { minion: 6, warrior: 5, weigher: 2, archer: 4, bowman: 3, leaper: 4, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 2, stamper: 2, hexer: 1, gap: 0.50, tip: '它一倒，所有金环一起碎 —— 看到那一碎就可以松一口气了' },
    { minion: 6, warrior: 5, weigher: 2, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, stamper: 2, hexer: 1, gap: 0.48, tip: '第五层的小兵跑得比你还快：别让它把整片场拉开' },
    { minion: 7, warrior: 5, weigher: 2, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, stamper: 2, hexer: 2, gap: 0.46, tip: '两只紫阵叠着放：站在两个紫阵的缝里也别忘了盯着称量官' },
    { minion: 7, warrior: 6, weigher: 2, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, stamper: 2, hexer: 2, gap: 0.44, tip: '第 17 回合：簿子已经翻到最后几页了' },
    // ---- 第五幕（R18~R20）：门前 ----
    { minion: 7, warrior: 6, weigher: 3, archer: 5, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, stamper: 2, hexer: 2, gap: 0.42, tip: '三只一起上称：这一波先认清楚哪三只抱着簿子' },
    { minion: 8, warrior: 6, weigher: 3, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, stamper: 2, hexer: 2, gap: 0.40, tip: '倒数第二波：把三个记账的都拆了，剩下的就是一群普通骷髅' },
    { minion: 8, warrior: 7, weigher: 3, archer: 5, bowman: 5, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 3, stamper: 2, hexer: 2, gap: 0.38, tip: '最后一波：把自己认的那个名字，写上那本簿子' },
  ],
};

// ============================================================
// 第十关「塔顶井台」（第 107 块）
// ============================================================
// 剧情接 s10「井水照见的东西」：骨塔顶层也有一口井，阿井从下面那口挖到了这一口。
// 这口井照出来的不是你的样子，是**别人记住的那个版本** —— 所以这一关的四只新怪
// 全是「照」出来的东西：照出你（照影）、照出那张单子（收件人）、
// 照出井壁上那句「等」（等的那个）、照出这一局死掉的人（回声）。
//
// 场地中央那口井是**本作第一个会挡路的实体地形**：怪绕开它、玩家掉进去，
// 所以它同时是减益区和掩体 —— 这是第十关和前九关最大的区别。
// 难度按用户定案「明显更狠」：hpMul 1.45 / dmgMul 1.80 + 杂兵密度回升
// （第九关是杂兵 ×0.70 压节奏，这里回到 ×0.9 一带，怪更多但节奏仍快）。
export const LEVEL_10 = {
  id: 10,
  name: '第十关 · 塔顶井台',
  theme: 'welltop',          // 第 107 块：墨蓝 + 井沿暖黄（scene.js 的 THEMES）
  arena: 17,
  order: [
    ['minion', 1], ['warrior', 1.6], ['mirror', 1.9],
    ['archer', 2.0], ['bowman', 2.2], ['leaper', 2.2],
    ['wraith', 2.4], ['shielder', 2.4], ['brood', 2.6],
    ['mender', 2.6], ['reboot', 2.8], ['hexer', 3.0],
    ['addressee', 3.2], ['waiter', 3.4], ['echo', 3.6],
  ],
  spawnRadius: 15.2,
  spawnJitter: 0.5,
  minPlayerDistance: 7.6,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0110, curve: 0.28, hpMul: 1.45, dmgMul: 1.80 },
  hazards: [
    { kind: 'well', x: 0, z: 0, r: 2.4, damage: 3, cd: 1.2 },
  ],
  rounds: [
    // ---- 第一幕（R1~R4）：井 + 照影 + 收件人 ----
    { minion: 4, warrior: 1, mirror: 0, addressee: 0, waiter: 0, echo: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.86, tip: '塔顶也有一口井。它照的不是你，是别人记住的那个你 —— 掉进去会摔掉 3 点，怪却会绕开它' },
    { minion: 4, warrior: 2, mirror: 1, addressee: 0, waiter: 0, echo: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.80, tip: '新面孔·照影：井里爬出来的那只蛙，抄的是你此刻的面板 —— 你攻击越高，它打得越疼' },
    { minion: 5, warrior: 2, mirror: 1, addressee: 0, waiter: 0, echo: 0, archer: 1, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.76, tip: '它每八秒重照一次：你中途变强，它也跟着变强 —— 阿井说过，别拼命变强' },
    { minion: 5, warrior: 2, mirror: 1, addressee: 1, waiter: 0, echo: 0, archer: 1, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.72, tip: '新面孔·收件人：那张收件人栏空着的单子 —— 它把名字填给别人，被填上的那只就免掉你手上那一类伤害' },
    // ---- 第二幕（R5~R8）：它开始填名字 ----
    { minion: 5, warrior: 3, mirror: 1, addressee: 1, waiter: 0, echo: 0, archer: 1, bowman: 1, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.70, tip: '头上有白框的那只免疫你环上占多数的那一类 —— 换一类武器打，或者先拆掉那张单子' },
    { minion: 6, warrior: 3, mirror: 1, addressee: 1, waiter: 0, echo: 0, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.68, tip: '它专挑你正在打的那只填 —— 看见白框就换目标，别死磕' },
    { minion: 6, warrior: 3, mirror: 2, addressee: 1, waiter: 0, echo: 0, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.66, tip: '两只照影一起上：它们的血是你自己的六成 —— 别先把血堆太厚' },
    { minion: 6, warrior: 4, mirror: 2, addressee: 1, waiter: 1, echo: 0, archer: 2, bowman: 2, leaper: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.64, tip: '新面孔·等的那个：井壁上刻着「第 70 层，等」。它站着不动，头上那圈金环在缩 —— 缩没了它就活过来' },
    // ---- 第三幕（R9~R12）：等的人醒了 ----
    { minion: 6, warrior: 4, mirror: 2, addressee: 1, waiter: 1, echo: 0, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 1, mender: 0, reboot: 0, hexer: 0, gap: 0.62, tip: '它二十二血、站着不动，很好打 —— 问题是你要不要现在花这个时间' },
    { minion: 7, warrior: 4, mirror: 2, addressee: 1, waiter: 1, echo: 1, archer: 2, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 0, hexer: 0, gap: 0.60, tip: '新面孔·回声：井水照出过去的东西 —— 它把这一局已经死掉的怪，再照回来一只' },
    { minion: 7, warrior: 4, mirror: 2, addressee: 2, waiter: 1, echo: 1, archer: 3, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 1, hexer: 0, gap: 0.58, tip: '两只单子同时填名：场上会同时有两类免疫 —— 看清楚再出手' },
    { minion: 7, warrior: 5, mirror: 2, addressee: 2, waiter: 1, echo: 1, archer: 3, bowman: 3, leaper: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, hexer: 1, gap: 0.56, tip: '第 12 回合：井水浮出来的东西越来越多了' },
    // ---- 第四幕（R13~R16）：四只齐活 ----
    { minion: 8, warrior: 5, mirror: 3, addressee: 2, waiter: 2, echo: 1, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 2, mender: 1, reboot: 1, hexer: 1, gap: 0.54, tip: '两只都在等：金环是分开缩的 —— 一只醒了，另一只可能还剩一半' },
    { minion: 8, warrior: 5, mirror: 3, addressee: 2, waiter: 2, echo: 2, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 1, hexer: 1, gap: 0.52, tip: '两只回声：照回来的都是半血，但它们照的是你刚打死的那些' },
    { minion: 9, warrior: 6, mirror: 3, addressee: 2, waiter: 2, echo: 2, archer: 4, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 2, hexer: 1, gap: 0.50, tip: '照影的血跟着你的上限走：这时候你堆的生命正在变成它们的生命' },
    { minion: 9, warrior: 6, mirror: 3, addressee: 2, waiter: 2, echo: 2, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, gap: 0.48, tip: '第 16 回合：井壁上又多了一行字，看不清写的是什么' },
    // ---- 第五幕（R17~R20）：门前 ----
    { minion: 10, warrior: 6, mirror: 3, addressee: 3, waiter: 2, echo: 2, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, gap: 0.46, tip: '三张单子：场上会一直有被填名的怪 —— 把单子全清掉才是解法' },
    { minion: 10, warrior: 7, mirror: 4, addressee: 3, waiter: 3, echo: 2, archer: 5, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, gap: 0.44, tip: '三只一起等：这一波先认清楚哪三只头上还有金环' },
    { minion: 11, warrior: 7, mirror: 4, addressee: 3, waiter: 3, echo: 3, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, hexer: 2, gap: 0.42, tip: '倒数第二波：照影会跟着你最后的面板一起变凶 —— 别在这时候猛堆攻击' },
    { minion: 11, warrior: 8, mirror: 4, addressee: 3, waiter: 3, echo: 3, archer: 5, bowman: 5, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 3, hexer: 2, gap: 0.40, tip: '最后一波：把自己认的那个名字，从井里捞出来' },
  ],
};

// ============================================================
// 第十一关「钟楼雾原」（第 114 块）
// ============================================================
// 剧情接 s11「空白的账簿」：空白第一次主动现身，不带雾、不吓人 ——
// 「它就站在焦土上」。地点是「钟楼外的雾里」，也就是第三关那座焦土钟楼的外面。
// 所以玩家是从骨塔顶层（第十关）一路走回钟楼，穿过那片从来没有散过的雾。
//
// **这一关的场地机制不是陷阱，是「看不见」**（用户 2026-10-28 定案）：
//   雾团每隔 gap 秒起一批，在场上慢慢漂，全遮住蛙 / 怪 / 投掷物 / 地面圈，
//   只留主角判定环 + 一层极淡的轮廓微光。起雾前 1.6 秒有地面预警圈。
//   怪的**出手预警**穿雾可见（老铁律：前摇不能被遮蔽），身体和划痕被遮。
// 它和前面十关的关系：第六关是「固定的地板不许站」，第十关是「中间有个洞」，
// 这一关是「你看不见」，压力从脚底搬到了眼睛上。
//
// 数值：用户定案「略高于第十关」—— hpMul 1.55 / dmgMul 1.95
// （第十关 1.45 / 1.80）。杂兵密度与第十关持平：雾本身已经是新增压力，
// 数值再猛就变成纯苦。
export const LEVEL_11 = {
  id: 11,
  name: '第十一关 · 钟楼雾原',
  theme: 'fogfield',          // 冷灰 + 一点焦土的橙（scene.js 的 THEMES）
  arena: 18,                  // 比井台大一圈：看不见的时候需要更多跑动空间
  order: [
    ['minion', 1], ['warrior', 1.6], ['clerk', 1.9],
    ['archer', 2.0], ['bowman', 2.2], ['leaper', 2.2],
    ['wraith', 2.4], ['shielder', 2.4], ['brood', 2.6],
    ['mender', 2.6], ['reboot', 2.8], ['hexer', 3.0],
    ['collector', 3.2],
  ],
  spawnRadius: 16.2,
  spawnJitter: 0.5,
  minPlayerDistance: 7.6,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0110, curve: 0.28, hpMul: 1.55, dmgMul: 1.95 },
  // 雾：见 js/fog.js。arena 要跟着本关的场地半径走（雾不会飘到场外）。
  fog: {
    arena: 18,
    max: 4,
    gap: 12.0,
    life: 8.0,
    warn: 1.6,
    drift: 0.35,
    radiusMin: 4.4,
    radiusMax: 6.5,
  },
  rounds: [
    // ---- 第一幕（R1~R4）：先学会「看不见」 ----
    { minion: 4, warrior: 1, clerk: 0, collector: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.86, tip: '钟楼外的雾从来没散过。雾起来的时候你什么都看不见 —— 但脚下那个环一直在' },
    { minion: 4, warrior: 2, clerk: 1, collector: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.80, tip: '新面孔·誊录员：它站着不动，在你身上划一条直线 —— 那条线是直的，横着走一步就躲开' },
    { minion: 5, warrior: 2, clerk: 1, collector: 0, archer: 1, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.76, tip: '它划过的地会留下墨痕，站在上面会一直掉血 —— 那是它的笔迹，七秒才干' },
    { minion: 5, warrior: 2, clerk: 1, collector: 1, archer: 1, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.72, tip: '新面孔·收账人：它不打你，它来收 —— 贴着读条 2.2 秒，读完你身上就少一样东西' },
    // ---- 第二幕（R5~R8）：雾里开始有东西 ----
    { minion: 5, warrior: 3, clerk: 1, collector: 1, archer: 1, bowman: 1, leaper: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.70, tip: '雾鬼也在这片雾里：它隐身的时候你打不着，除非有路口灯' },
    { minion: 6, warrior: 3, clerk: 1, collector: 1, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, hexer: 0, gap: 0.68, tip: '头顶那圈在缩的金环 = 有人在收你。金环缩完之前走到 3.5 格外，或者先把它打碎' },
    { minion: 6, warrior: 3, clerk: 2, collector: 1, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 1, brood: 1, mender: 0, reboot: 0, hexer: 0, gap: 0.66, tip: '两只誊录员：墨痕会从两个方向来，别只盯着脚下一条' },
    { minion: 6, warrior: 4, clerk: 2, collector: 1, archer: 2, bowman: 2, leaper: 1, wraith: 2, shielder: 1, brood: 1, mender: 0, reboot: 0, hexer: 0, gap: 0.64, tip: '雾里听声比看画面有用：短促的那一声是它落笔了' },
    // ---- 第三幕（R9~R12）：墨开始积起来 ----
    { minion: 6, warrior: 4, clerk: 2, collector: 1, archer: 2, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 0, hexer: 0, gap: 0.62, tip: '五道墨痕是上限：旧墨会先干掉。别站在旧墨上等它消失，绕着走' },
    { minion: 7, warrior: 4, clerk: 2, collector: 2, archer: 2, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 0, hexer: 0, gap: 0.60, tip: '两只收账人：它们收的不是血，是你身上已经堆起来的东西 —— 越强，被收越疼' },
    { minion: 7, warrior: 4, clerk: 3, collector: 2, archer: 3, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 1, hexer: 0, gap: 0.58, tip: '三条线一起划的时候，最好往它们中间穿 —— 两条线之间的缝比线外侧宽' },
    { minion: 7, warrior: 5, clerk: 3, collector: 2, archer: 3, bowman: 3, leaper: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, hexer: 1, gap: 0.56, tip: '第 12 回合：空白翻到第三万七千页了' },
    // ---- 第四幕（R13~R16）：雾越来越密 ----
    { minion: 8, warrior: 5, clerk: 3, collector: 2, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 2, mender: 1, reboot: 1, hexer: 1, gap: 0.54, tip: '墨痕 + 雾：真正危险的不是怪，是你脚下那块看不见的黑' },
    { minion: 8, warrior: 5, clerk: 3, collector: 2, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 1, hexer: 1, gap: 0.52, tip: '誊录员站得远，一笔能划十三格 —— 看不见它的时候，先往侧面走再说' },
    { minion: 9, warrior: 6, clerk: 3, collector: 2, archer: 4, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 2, hexer: 1, gap: 0.50, tip: '被收走一样东西的时候，头顶会浮一行字 —— 那不是提示，是账目' },
    { minion: 9, warrior: 6, clerk: 3, collector: 2, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, gap: 0.48, tip: '第 16 回合：雾里那本账簿翻得越来越快了' },
    // ---- 第五幕（R17~R20）：门前 ----
    { minion: 10, warrior: 6, clerk: 4, collector: 3, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, gap: 0.46, tip: '四支笔：这一波先把誊录员清掉，地上的墨就不再加了' },
    { minion: 10, warrior: 7, clerk: 4, collector: 3, archer: 5, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, gap: 0.44, tip: '三本账簿一起摊开：你身上最多同时被收走一样，但下一次永远在排队' },
    { minion: 11, warrior: 7, clerk: 4, collector: 3, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, hexer: 2, gap: 0.42, tip: '倒数第二波：雾散的那几秒是唯一的清账窗口' },
    { minion: 11, warrior: 8, clerk: 4, collector: 3, archer: 5, bowman: 5, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 3, hexer: 2, gap: 0.40, tip: '最后一波：写下你自己的那一行，别让它替你写' },
  ],
};

// ============================================================
// 第十二关「三幻神驿站」（第 116 块）
// ============================================================
// 剧情接 s12「黄色三幻神」：焦土公路边的服务区，招牌写着「三幻神驿站 · 24 小时 · 免费充电」。
// 门口停着一辆黄色大车，一只穿黄外套的袋鼠在数单子，一头穿黄 T 恤的牛在打奶泡。
//
// **这一关的场地机制是「躲车 + 借车撞怪」**（用户 2026-10-28 定案）：
//   两条平行车道横穿场地，配送车经过前 2.2 秒整条车道亮起方向箭头与路面预警，
//   不从屏幕外突然冲进来吓人。车撞到玩家 = 少量真实伤害 + 击退（绝不秒杀）；
//   车撞到敌人 = 高额伤害 + 击退，但同一目标有受击间隔、精英减伤，防止无脑清屏。
//   前八回合单车轮换，后期（doubleFrom 起）才出现错时双车；始终保留安全区域。
//   配合冲锋 / 击退 / 减速等现有能力，形成「把怪送进车道」的主动打法。
//
// 它和前面关卡的关系：第四关是「浓雾 + 听声辨位」，第五关是「四条路刷怪」，
// 第六关是「固定地板不许站」，第十关是「中间有个洞」，第十一关是「看不见」。
// 这一关把压力从「脚底」和「眼睛」搬到了「位置判断」—— 车是可见的、可预判的，
// 难在你要在车流和怪群之间，选对站的位置、以及把怪往车道上赶。
//
// 数值：用户定案「血量与十一关持平、伤害略降」—— hpMul 1.55 / dmgMul 1.85
// （第十一关 1.55 / 1.95）。难点放在位置判断，不再单纯抬数值。
export const LEVEL_12 = {
  id: 12,
  name: '第十二关 · 三幻神驿站',
  theme: 'highway',         // 夜里的公路：沥青深灰 + 路缘暖黄（scene.js 的 THEMES）
  arena: 19,                // 比十一关大一圈：两条车道横穿，需要更多横移空间
  order: [
    ['minion', 1], ['warrior', 1.6], ['charger', 1.9],
    ['archer', 2.0], ['bowman', 2.2], ['leaper', 2.2],
    ['wraith', 2.4], ['shielder', 2.4], ['brood', 2.6],
    ['mender', 2.6], ['reboot', 2.8], ['hexer', 3.0],
    ['addressee', 3.2], ['clerk', 3.4], ['kangaroo', 3.6],
  ],
  spawnRadius: 16.8,
  spawnJitter: 0.5,
  minPlayerDistance: 7.6,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0110, curve: 0.28, hpMul: 1.55, dmgMul: 1.85 },
  // 车流：见 js/traffic.js。arena 要跟着本关场地半径走；车道是两条平行的横线。
  traffic: {
    lanes: [-4.5, 4.5],
    width: 2.4,
    warn: 2.2,
    speed: 18.0,
    gap: 10.5,
    first: 4.0,
    damage: 2.0,
    enemyPct: 0.36,
    doubleFrom: 13,
  },
  rounds: [
    // ---- 第一幕（R1~R4）：先学会「躲车」+「袋鼠」----
    { minion: 4, warrior: 1, charger: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, kangaroo: 0, gap: 0.86, tip: '服务区的公路上有配送车来回跑。车道亮起箭头的时候，别站在线上' },
    { minion: 4, warrior: 2, charger: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, kangaroo: 1, gap: 0.80, tip: '新面孔·加急袋鼠：它不打你，它给别的怪「加急」—— 被挂上的那只突然变快变凶' },
    { minion: 5, warrior: 2, charger: 0, archer: 1, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, kangaroo: 1, gap: 0.76, tip: '车也能撞怪：把怪赶到车道上，让它替你挨这一下 —— 击退、减速、冲锋都行' },
    { minion: 5, warrior: 2, charger: 1, archer: 1, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, kangaroo: 1, gap: 0.72, tip: '冲锋蛮牛回来了：它自己会往你冲，正好可以把它引到车道上' },
    // ---- 第二幕（R5~R8）：旧怪组合进场 ----
    { minion: 5, warrior: 3, charger: 1, archer: 1, bowman: 1, leaper: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 1, clerk: 0, kangaroo: 1, gap: 0.70, tip: '收件人回来了：头上有白框的那只免疫你某一类伤害 —— 换一类武器，或者先拆单子' },
    { minion: 6, warrior: 3, charger: 1, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 1, clerk: 0, kangaroo: 1, gap: 0.68, tip: '誊录员也来了：它划的墨线会横切车道 —— 站在墨上会掉血，别和车撞到一起' },
    { minion: 6, warrior: 3, charger: 2, archer: 2, bowman: 1, leaper: 1, wraith: 1, shielder: 1, brood: 1, mender: 0, reboot: 0, hexer: 0, addressee: 1, clerk: 1, kangaroo: 1, gap: 0.66, tip: '袋鼠的加急是 6 秒：被加急的怪头上会有个黄标 —— 先打断袋鼠的读条，或者先点掉它' },
    { minion: 6, warrior: 4, charger: 2, archer: 2, bowman: 2, leaper: 1, wraith: 2, shielder: 1, brood: 1, mender: 0, reboot: 0, hexer: 0, addressee: 1, clerk: 1, kangaroo: 2, gap: 0.64, tip: '车撞怪伤害很高，但同一只怪有受击间隔 —— 别指望一辆车清光一片，还是得自己动手' },
    // ---- 第三幕（R9~R12）：墨线封路 ----
    { minion: 6, warrior: 4, charger: 2, archer: 2, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 0, hexer: 0, addressee: 1, clerk: 2, kangaroo: 2, gap: 0.62, tip: '两条墨线会把车道切成几段 —— 提前想好往哪边走，别被墨和车夹在中间' },
    { minion: 7, warrior: 4, charger: 2, archer: 2, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 0, hexer: 0, addressee: 2, clerk: 2, kangaroo: 2, gap: 0.60, tip: '在车道边放一杯拿铁，把怪留在危险区，再借车收割 —— 这是这关的正解' },
    { minion: 7, warrior: 4, charger: 3, archer: 3, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, reboot: 1, hexer: 0, addressee: 2, clerk: 2, kangaroo: 2, gap: 0.58, tip: '三只蛮牛一起蓄力：地上的直线预警是躲的窗口，横向侧移，别后退' },
    { minion: 7, warrior: 5, charger: 3, archer: 3, bowman: 3, leaper: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, hexer: 1, addressee: 2, clerk: 2, kangaroo: 2, gap: 0.56, tip: '第 12 回合：招牌上的「24 小时」闪了一下，是充电桩跳闸了' },
    // ---- 第四幕（R13~R16）：错时双车 ----
    { minion: 8, warrior: 5, charger: 3, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 2, mender: 1, reboot: 1, hexer: 1, addressee: 2, clerk: 2, kangaroo: 3, gap: 0.54, tip: '双车来了：两条车道可能同时来车，而且错开时间 —— 看清楚再动' },
    { minion: 8, warrior: 5, charger: 3, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 1, hexer: 1, addressee: 2, clerk: 3, kangaroo: 3, gap: 0.52, tip: '墨线 + 双车 = 场地被切碎。安全区一直在，但你要在车和墨之间算好路径' },
    { minion: 9, warrior: 6, charger: 3, archer: 4, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 2, hexer: 1, addressee: 3, clerk: 3, kangaroo: 3, gap: 0.50, tip: '三只袋鼠：它们会轮流给怪加急 —— 优先拆袋鼠，别让整群一起变凶' },
    { minion: 9, warrior: 6, charger: 4, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, addressee: 3, clerk: 3, kangaroo: 3, gap: 0.48, tip: '第 16 回合：那头黄牛抬头看了一眼，又低头继续打奶泡' },
    // ---- 第五幕（R17~R20）：门前 ----
    { minion: 10, warrior: 6, charger: 4, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, addressee: 3, clerk: 4, kangaroo: 3, gap: 0.46, tip: '四支笔：墨线会盖住大半车道 —— 先把誊录员清掉，地上的墨就不再加了' },
    { minion: 10, warrior: 7, charger: 4, archer: 5, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, addressee: 3, clerk: 4, kangaroo: 4, gap: 0.44, tip: '四只袋鼠 + 双车：场面最乱的时候，别慌 —— 车是有预警的，看清楚线' },
    { minion: 11, warrior: 7, charger: 4, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, hexer: 2, addressee: 4, clerk: 4, kangaroo: 4, gap: 0.42, tip: '倒数第二波：把怪赶到车道上，让最后一班配送车替你清场' },
    { minion: 11, warrior: 8, charger: 5, archer: 5, bowman: 5, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 3, hexer: 2, addressee: 4, clerk: 4, kangaroo: 4, gap: 0.40, tip: '最后一波：配送车 24 小时不停，你也该下班了' },
  ],
};

// ============================================================
// 第十三关「焦土操场」（第 123 块）
// ============================================================
// 剧情接 s13「流动的那块牌子」：焦土东边那片废墟，招牌上还留着一半字 —— 大学城。
// 操场上没有灯，但有人在跑：四个穿校服的人抬着一块两米高的牌子来回搬、拍照、再搬走。
// 牌子上画的是你，黄色、圆肚子、咧着嘴大笑。
//
// **这一关的场地机制是「环形跑道」**（用户 2026-10-31 定案，从三个方案里挑的 B）：
//   场地中间套一条塑胶跑道，站上去自己移速 ×1.35、带 0.42 格/秒的切向推力；
//   **怪站上去也 ×1.25**。两边一起抬是刻意的 —— 只给玩家就退化成
//   「永远绕着跑道跑圈」的永动机，两边一起抬之后它的意义是**换一种走位**：
//   你在这条带上更快，但敌人也会从切线方向抄近路堵你。
//   推力做得很轻（约移速的一成）：单摇杆最怕「场地跟摇杆抢方向」。
//
// 它和前面关卡的关系：第六关是「固定地板不许站」，第十关是「中间有个洞」，
// 第十一关是「看不见」，第十二关是「车流横穿、要把怪送进车道」。
// 这一关把压力搬到了「**速度差**」上 —— 全场唯一一块让你变快的地，
// 也是唯一一块让怪变快的地。
//
// 数值：用户定案「抬一档」—— hpMul 1.60 / dmgMul 1.95（第十二关 1.55 / 1.85）。
export const LEVEL_13 = {
  id: 13,
  name: '第十三关 · 焦土操场',
  theme: 'campus',          // 夜里的操场：干裂土 + 跑道红渣 + 钠灯暖橙
  arena: 19.5,              // 比驿站大一点：跑道占掉中段，外圈还得留得下跑动
  order: [
    ['minion', 1], ['warrior', 1.6], ['standee', 1.9],
    ['archer', 2.0], ['bowman', 2.2], ['leaper', 2.3],
    ['wraith', 2.4], ['shielder', 2.5], ['brood', 2.6],
    ['charger', 2.7], ['mender', 2.8], ['reboot', 2.9],
    ['camera', 3.0], ['hexer', 3.1], ['clerk', 3.3], ['addressee', 3.5],
  ],
  spawnRadius: 17.0,
  spawnJitter: 0.5,
  minPlayerDistance: 7.6,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0110, curve: 0.28, hpMul: 1.60, dmgMul: 1.95 },
  // 跑道：见 js/track.js。arena 变了这里要跟着改（跑道不会长到场外）。
  track: {
    inner: 5.4,
    outer: 7.6,
    playerMul: 1.35,
    enemyMul: 1.25,
    push: 0.42,
    dir: 1,
  },
  rounds: [
    // ---- 第一幕（R1~R4）：跑道 + 立牌 ----
    { minion: 4, warrior: 1, standee: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 0, camera: 0, gap: 0.86, tip: '操场上有一圈跑道。站上去你会跑得更快 —— 怪站上去也更快，别把它当安全区' },
    { minion: 4, warrior: 2, standee: 1, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 0, camera: 0, gap: 0.80, tip: '新面孔·立牌：正面挡掉七成五的伤害，但它转身很慢 —— 绕着它走两步，从侧后方打' },
    { minion: 5, warrior: 2, standee: 1, archer: 0, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 0, camera: 0, gap: 0.76, tip: '牌子上画的是你：黄色、圆肚子、咧着嘴笑。它举着的不是你' },
    { minion: 5, warrior: 2, standee: 1, archer: 0, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 0, camera: 1, gap: 0.72, tip: '新面孔·取景的：举机对焦一秒半，只拍正前方。往侧面走，走出它的取景框' },
    // ---- 第二幕（R5~R8）：拍照与冲锋 ----
    { minion: 5, warrior: 3, standee: 1, archer: 0, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 1, camera: 1, gap: 0.70, tip: '冲锋蛮牛会撞倒立牌：牌倒了那一瞬间，正面的护甲也没了' },
    { minion: 6, warrior: 3, standee: 2, archer: 1, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 1, camera: 1, gap: 0.68, tip: '两只立牌别背对着打：它们的护甲只看自己的朝向，不看你的站位' },
    { minion: 6, warrior: 3, standee: 2, archer: 2, bowman: 1, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 1, camera: 2, gap: 0.66, tip: '两台机器一起取景：它们不会互相协调，所以总有一只的角度是空的' },
    { minion: 6, warrior: 4, standee: 2, archer: 2, bowman: 2, leaper: 1, wraith: 0, shielder: 1, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 1, camera: 2, gap: 0.64, tip: '跑道不是安全区，是加速带：想甩开追兵就往上面跑，想被围住也一样' },
    // ---- 第三幕（R9~R12）：墨与单子 ----
    { minion: 6, warrior: 4, standee: 2, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, hexer: 0, addressee: 0, clerk: 0, charger: 2, camera: 2, gap: 0.62, tip: '跑道上的速度差在雾鬼身上最明显：它隐身时追不上你，一显形就在你背后' },
    { minion: 7, warrior: 4, standee: 2, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, mender: 1, reboot: 0, hexer: 0, addressee: 0, clerk: 1, charger: 2, camera: 2, gap: 0.60, tip: '誊录员回来了：它的墨线会横切跑道，站在墨上再借跑道的速度，等于自己往刀上撞' },
    { minion: 7, warrior: 4, standee: 3, archer: 3, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 0, mender: 1, reboot: 0, hexer: 0, addressee: 1, clerk: 1, charger: 2, camera: 2, gap: 0.58, tip: '收件人给别的怪填名字：白框的那只免疫你某一类伤害 —— 换一类，或者先拆单子' },
    { minion: 7, warrior: 5, standee: 3, archer: 3, bowman: 3, leaper: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, hexer: 0, addressee: 1, clerk: 1, charger: 3, camera: 2, gap: 0.56, tip: '第 12 回合：看台那边有人在鼓掌，但场上一个人也没有' },
    // ---- 第四幕（R13~R16）：操场挤满 ----
    { minion: 8, warrior: 5, standee: 3, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, hexer: 0, addressee: 1, clerk: 2, charger: 3, camera: 3, gap: 0.54, tip: '立牌 + 取景的：一个逼你绕后，一个逼你侧移 —— 这两件事方向正好相反' },
    { minion: 8, warrior: 5, standee: 3, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 1, hexer: 1, addressee: 1, clerk: 2, charger: 3, camera: 3, gap: 0.52, tip: '被拍到不疼，但你会立刻被三只盯着 —— 这就是取景的作用' },
    { minion: 9, warrior: 6, standee: 4, archer: 4, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 2, reboot: 2, hexer: 1, addressee: 2, clerk: 2, charger: 3, camera: 3, gap: 0.50, tip: '四块牌子立着的时候，跑道就成了唯一的开阔地 —— 也是四条腿一起追你的地方' },
    { minion: 9, warrior: 6, standee: 4, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 1, addressee: 2, clerk: 2, charger: 4, camera: 4, gap: 0.48, tip: '第 16 回合：那块牌子被搬到跑道上了，正对着你' },
    // ---- 第五幕（R17~R20）：门前 ----
    { minion: 10, warrior: 6, standee: 4, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, addressee: 2, clerk: 3, charger: 4, camera: 4, gap: 0.46, tip: '三支笔一起划：跑道上会全是墨，这一次别借它的速度' },
    { minion: 10, warrior: 7, standee: 5, archer: 5, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, hexer: 2, addressee: 2, clerk: 3, charger: 4, camera: 4, gap: 0.44, tip: '五块牌子：这一波先清取景的，它不解决，你的走位永远被拍到' },
    { minion: 11, warrior: 7, standee: 5, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, hexer: 2, addressee: 3, clerk: 3, charger: 5, camera: 5, gap: 0.42, tip: '倒数第二波：他们在操场尽头把牌子放下了，然后退开、掏出手机' },
    { minion: 11, warrior: 8, standee: 5, archer: 5, bowman: 5, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 3, hexer: 2, addressee: 3, clerk: 3, charger: 5, camera: 5, gap: 0.40, tip: '最后一波：你站在牌子旁边比了比 —— 它比你更圆，笑得更开' },
  ],
};

// ============================================================
// 第十四关「钟楼打样间」（第 124 块）
// ============================================================
// 剧情接 s14「钟楼里没有钟」：钟楼一层什么都没有，只有一台很大的旧机器。
// 它一直在响，每响一声就吐出一张纸；纸上是一只奶龙，不太对的那种。
//
// **这一关的场地机制是「裁切刀」**（用户 2026-10-31 定案，从三个方案里挑的 A）：
//   机器按时把整场横着（或竖着）切开一刀 —— 1.25 秒预警，站在带上的
//   **人和怪一起吃**（玩家 12% 最大生命，怪按血量比例另有保底）。
//   切位在四条线上轮换、横竖交替，第 15 回合起偶尔一次落两刀。
//
// 它和前面三关场地的关系：第十一关是「看不见」，第十二关是「车流横穿」，
// 第十三关是「让你和怪一起变快的跑道」；这一关把压力搬到了**时间**上 ——
// 地上那条线一开始就告诉你答案，你只要在它落下来之前站到别处。
// 站桩在这里第一次被明确惩罚，而且惩罚是「按最大生命百分比」的，
// 堆血流堆不出一个能站着不动的蛙。
//
// 数值：用户定案「抬一档」—— hpMul 1.65 / dmgMul 2.00（第十三关 1.60 / 1.95）。
export const LEVEL_14 = {
  id: 14,
  name: '第十四关 · 钟楼打样间',
  theme: 'press',           // 夜里的机房：冷灰水泥 + 纸白 + 指示灯的青
  arena: 19,                // 裁切刀要横跨全场，场地别太大，不然预警看不清
  order: [
    ['minion', 1], ['warrior', 1.5], ['misprint', 1.8],
    ['archer', 2.0], ['bowman', 2.1], ['leaper', 2.2],
    ['wraith', 2.3], ['shielder', 2.4], ['brood', 2.5],
    ['charger', 2.6], ['mender', 2.7], ['reboot', 2.8],
    ['proofreader', 2.9], ['hexer', 3.0], ['clerk', 3.2],
    ['addressee', 3.3], ['standee', 3.4], ['camera', 3.5],
  ],
  spawnRadius: 16.6,
  spawnJitter: 0.5,
  minPlayerDistance: 7.4,
  minSpawnGap: 2.4,
  gapScale: 1.12,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.045, haste: 0.0110, curve: 0.28, hpMul: 1.65, dmgMul: 2.00 },
  // 裁切刀：见 js/cutter.js。arena 变了这里要跟着改（刀横跨整个场地）。
  cutter: {
    arena: 19,
    slots: [-7.0, -2.3, 2.3, 7.0],
    warn: 1.25,
    gap: 5.2,
    gapMin: 3.1,
    width: 1.30,
    playerPct: 0.12,
    doubleFrom: 15,
  },
  rounds: [
    // ---- 第一幕（R1~R4）：先学会看那条白线 ----
    { minion: 4, warrior: 1, misprint: 0, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, charger: 0, mender: 0, reboot: 0, proofreader: 0, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 0, gap: 0.86, tip: '地上那条白线是机器要走刀的地方。它亮起一秒多之后才落刀 —— 别站在线上' },
    { minion: 4, warrior: 2, misprint: 1, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, charger: 0, mender: 0, reboot: 0, proofreader: 0, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 0, gap: 0.80, tip: '新面孔·错版：它死的时候会从中间裂成两张。别指望砍一刀少一只' },
    { minion: 5, warrior: 2, misprint: 1, archer: 0, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, charger: 0, mender: 0, reboot: 0, proofreader: 0, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 0, gap: 0.76, tip: '刀也切怪：把怪推到线上，让它替你挨一下 —— 和第十二关把怪赶进车道一个道理' },
    { minion: 5, warrior: 2, misprint: 1, archer: 0, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, charger: 0, mender: 0, reboot: 0, proofreader: 1, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 0, gap: 0.72, tip: '新面孔·校对的：它不打你，它拿红笔圈别的怪。被圈的怪打得更重、跑得更急' },
    // ---- 第二幕（R5~R8）：刀口轮换 ----
    { minion: 5, warrior: 3, misprint: 1, archer: 0, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, charger: 1, mender: 0, reboot: 0, proofreader: 1, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 0, gap: 0.70, tip: '切位在换：这一刀切这条，下一刀换另一条，还会横竖交替 —— 别养成站原地的习惯' },
    { minion: 6, warrior: 3, misprint: 2, archer: 1, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, charger: 1, mender: 0, reboot: 0, proofreader: 1, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 0, gap: 0.68, tip: '校对的挑的是「血最厚的那只」：你越放着大块头不管，它越先被批注' },
    { minion: 6, warrior: 3, misprint: 2, archer: 2, bowman: 1, leaper: 1, wraith: 0, shielder: 0, brood: 0, charger: 1, mender: 0, reboot: 0, proofreader: 1, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 1, gap: 0.66, tip: '错版 + 裁刀：它们在刀口上死会分裂，两张纸片照样站得住 —— 先看线，再决定打谁' },
    { minion: 6, warrior: 4, misprint: 2, archer: 2, bowman: 2, leaper: 1, wraith: 0, shielder: 1, brood: 0, charger: 1, mender: 0, reboot: 0, proofreader: 1, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 1, gap: 0.64, tip: '一刀切下去是「最大生命的百分比」：血越厚的怪越疼，所以别把大块头留到最后' },
    // ---- 第三幕（R9~R12）：纸堆起来了 ----
    { minion: 6, warrior: 4, misprint: 2, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, charger: 2, mender: 1, reboot: 0, proofreader: 1, hexer: 0, clerk: 0, addressee: 0, standee: 0, camera: 1, gap: 0.62, tip: '雾鬼在刀口上隐身：它显形的那一下如果正好在线上，你连补刀都不用' },
    { minion: 7, warrior: 4, misprint: 2, archer: 2, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, charger: 2, mender: 1, reboot: 0, proofreader: 1, hexer: 0, clerk: 1, addressee: 0, standee: 0, camera: 1, gap: 0.60, tip: '誊录员回来了：墨线会横着铺一片，别站在墨上又站在线上，两条伤害一起结算' },
    { minion: 7, warrior: 4, misprint: 3, archer: 3, bowman: 2, leaper: 2, wraith: 2, shielder: 1, brood: 0, charger: 2, mender: 1, reboot: 0, proofreader: 1, hexer: 0, clerk: 1, addressee: 1, standee: 0, camera: 1, gap: 0.58, tip: '被批注的怪头上有一圈红：打它反而更快，别下意识躲开它' },
    { minion: 7, warrior: 5, misprint: 3, archer: 3, bowman: 3, leaper: 2, wraith: 2, shielder: 2, brood: 1, charger: 3, mender: 1, reboot: 1, proofreader: 0, hexer: 0, clerk: 1, addressee: 1, standee: 0, camera: 1, gap: 0.56, tip: '第 12 回合：机器的响声变快了。它不是在催你，它是在排版' },
    // ---- 第四幕（R13~R16）：双刀 ----
    { minion: 8, warrior: 5, misprint: 3, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, charger: 3, mender: 1, reboot: 1, proofreader: 1, hexer: 0, clerk: 2, addressee: 1, standee: 0, camera: 2, gap: 0.54, tip: '立牌来了：正面挡掉七成五的伤害。绕到侧后方打 —— 用裁纸刀切它不吃朝向' },
    { minion: 8, warrior: 5, misprint: 3, archer: 3, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, charger: 3, mender: 2, reboot: 1, proofreader: 1, hexer: 1, clerk: 2, addressee: 1, standee: 1, camera: 2, gap: 0.52, tip: '第 15 回合起会一次落两刀，而且方向不一样 —— 看清楚有几条线' },
    { minion: 9, warrior: 6, misprint: 4, archer: 4, bowman: 3, leaper: 3, wraith: 3, shielder: 2, brood: 2, charger: 3, mender: 2, reboot: 2, proofreader: 1, hexer: 1, clerk: 2, addressee: 2, standee: 1, camera: 2, gap: 0.50, tip: '两台取景的 + 双刀：横着躲刀、侧着走出取景框，这两件事可以一起做' },
    { minion: 9, warrior: 6, misprint: 4, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, charger: 4, mender: 2, reboot: 2, proofreader: 1, hexer: 1, clerk: 2, addressee: 2, standee: 1, camera: 2, gap: 0.48, tip: '第 16 回合：机器吐出一张纸，纸上是空白的。它停了半秒，又继续响' },
    // ---- 第五幕（R17~R20）：门前 ----
    { minion: 10, warrior: 6, misprint: 4, archer: 4, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, charger: 4, mender: 2, reboot: 2, proofreader: 2, hexer: 2, clerk: 3, addressee: 2, standee: 1, camera: 2, gap: 0.46, tip: '两只校对的轮流批注：清不掉它们，你就一直在打「变凶的怪」' },
    { minion: 10, warrior: 7, misprint: 5, archer: 5, bowman: 4, leaper: 4, wraith: 4, shielder: 3, brood: 2, charger: 4, mender: 2, reboot: 2, proofreader: 2, hexer: 2, clerk: 3, addressee: 2, standee: 1, camera: 3, gap: 0.44, tip: '五张纸递了进来：每一张都是你，每一张都不太对' },
    { minion: 11, warrior: 7, misprint: 5, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 3, brood: 2, charger: 5, mender: 3, reboot: 3, proofreader: 2, hexer: 2, clerk: 3, addressee: 3, standee: 2, camera: 3, gap: 0.42, tip: '倒数第二波：刀口越来越密。记住一件事 —— 线亮起来的那一秒，你还有时间' },
    { minion: 11, warrior: 8, misprint: 5, archer: 5, bowman: 5, leaper: 5, wraith: 5, shielder: 4, brood: 2, charger: 5, mender: 3, reboot: 3, proofreader: 2, hexer: 2, clerk: 3, addressee: 3, standee: 2, camera: 3, gap: 0.40, tip: '最后一波：机器把最后一张纸推出来 —— 那张纸是空的，它在等有人打字' },
  ],
};

// 关卡号 → 关卡表（主流程 / 选关 / 测试都从这里取）
export const LEVELS_BY_ID = {
  1: LEVEL_1, 2: LEVEL_2, 3: LEVEL_3, 4: LEVEL_4, 5: LEVEL_5, 6: LEVEL_6, 7: LEVEL_7, 8: LEVEL_8,
  9: LEVEL_9, 10: LEVEL_10, 11: LEVEL_11, 12: LEVEL_12, 13: LEVEL_13, 14: LEVEL_14,
};

// 第 roundNo 回合（从 1 开始）的怪物属性倍率
// 难度（第 18 块）：乘在每回合的成长倍率上。一局一选，不进设置面板
// （难度是「这一局玩多狠」的选择，不是机器偏好）。
// 第 112 块（用户定案）：整体抬一档 —— 新普通 = 旧地狱，新增简单（骨币也少），
// 噩梦 / 地狱在旧地狱之上继续加码。四档顺序即 UI 显示顺序。
export const DIFFS = {
  easy:      { name: '简单', hp: 0.90, damage: 0.75, speed: 0.95, haste: 0.95, desc: '怪更软更慢，骨币也少一些 —— 先活着走出荒草地' },
  normal:    { name: '普通', hp: 1.80, damage: 1.55, speed: 1.08, haste: 1.10, desc: '原地狱档：一步走错就倒下' },
  nightmare: { name: '噩梦', hp: 2.30, damage: 1.90, speed: 1.14, haste: 1.16, desc: '在旧地狱之上再抬一档，硬吃一下就可能归零' },
  hell:      { name: '地狱', hp: 2.90, damage: 2.30, speed: 1.20, haste: 1.22, desc: '给头铁到极点的蛙：容错只剩走位' },
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
  // 第 65 块：额外整体系数 hpMul / dmgMul（默认 1，只有五、六关用）。
  // 用户嫌后两关太软，要「伤害 +35%、血量 +15%」——加在乘数上比改 slope 直观：
  //   slope 是「每回合长多少」，改它会顺带把 R1 也一起抬起来；
  //   mul 是「整关一起乘」，晚期的疼度线性可预测。
  //
  // 第 91 块：**关内梯度**。之前只有 hp / damage / speed 三个维度在长，
  // 前两项还很陡，玩家感受到的只有「怪变多、变肉」；出手频率全程不变，
  // 移速到 R20 也才 ×1.67。现在多一根轴 + 一条后期加速曲线：
  //
  //   haste  「出手频率」倍率（全新）。所有冷却都 / haste，**前摇/预警圈不变** ——
  //          所以是「更频繁」，不是「更突然」，玩家仍然看得见、躲得掉。
  //   curve  「后期加速」。t = 本回合走到整关的几成（0~1），
  //          ramp = 1 + curve × t² —— 平方意味着前五回合几乎不动、
  //          最后五回合陡增。**只作用于 haste**：血量/伤害已经是线性陡坡，
  //          再叠平方会把后期直接变成不可通关（第九关 hp 本来就 ×8 了）。
  const N = Math.max(1, ((level.rounds && level.rounds.length) || 20) - 1);
  const t = Math.min(1, k / N);
  const ramp = 1 + (s.curve || 0) * t * t;
  return {
    hp: (1 + s.hp * k) * diff.hp * (s.hpMul || 1),
    damage: (1 + s.damage * k) * diff.damage * (s.dmgMul || 1),
    speed: (1 + s.speed * k) * diff.speed,
    haste: (1 + (s.haste || 0) * k) * ramp * (diff.haste || 1),
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

// 第 72 块：按关预载 —— 这一关到底会用到哪几种怪。
//
// 以前加载页把 17 只怪（约 6MB glb）一次性全拉下来，手机上首屏要等很久，
// 而玩家一局只会碰到其中一小半。现在**进关前只补这一关要用的模型**：
//   · 以 order 为准（不能只看第 1 回合：弓手是第 12 回合才登场的）；
//   · 剔除整关一只都不出的种（关卡表里占位 0 的不白下载）；
//   · 已经在内存里的不会重复下载（enemy.js 的 loadType 幂等），
//     所以「第一关 → 第五关」只会补差集那几只。
// 返回值给 main.js 的 ensureLevelAssets 用；加载页进度也按这个数走。
export function levelTypes(level = LEVEL_1) {
  const out = [];
  for (const [type] of level.order || []) {
    if (out.includes(type)) continue;
    const used = (level.rounds || []).some((r) => (r[type] || 0) > 0);
    if (used) out.push(type);
  }
  // 第 83 块：不参与波次的「召唤物」也要预载 —— 第八关的寄存处看守只在柜子满了
  // 才出场，回合表里永远 0 只。不进这个清单，它第一次被召唤时才开始下载模型
  // （约 480KB），玩家会看到一只**空白**站在柜门口等两秒。
  const summon = level.deposit && level.deposit.summon;
  if (summon && !out.includes(summon)) out.push(summon);
  return out;
}

// 把一回合的怪表展开成带延迟的生成列表。
// 顺序与段间隔完全由关卡的 order 决定：
//   近身先到 → 远程后到 → 巫师最后（先把贴脸的清掉，再面对后排的吟唱）。
//   每段之前隔 0.35 秒，数量为 0 的段直接跳过（不白占时间）。
// 第一关的 order 就是老代码里写死的 minion→warrior→archer→bowman（1/1.6/2.0/2.2），
// 展开结果与改造前逐条一致。
// mod：本回合修正（随机事件写入），数量按 mod.countScale 缩放。
// level.gapScale：全关生成节奏系数（第 33 块，第三关 1.35 = 放慢 35%），
// 只拉开怪与怪的间隔，不改回合表里的数量。
// 第 75 块（用户实测：「它们生成有些靠后，最后只剩擦名者」）：
// 擦名者（eraser）**不再参与 order 排队**，而是单独插到本回合刷怪进度的
// 40%~60% 之间 —— 也就是场上最热闹、玩家最忙的那一段。它出厂时就是来添乱的，
// 不该等到清场了才慢悠悠走过来。
//
// 两个细节：
//   ① 插进去之后**整表按 delay 重排**。update 是按 spawnIdx 顺序消费的
//      （`t >= spawns[spawnIdx].delay`），表里一旦出现倒序，后面那些怪会卡住不刷；
//   ② 标记 `near: true`：进场位置改用更近的半径（见 pickSpawn 的 nearR 参数），
//      免得它在 18 格外的场边出生 —— 那个距离玩家看不见，也走不过来。
const ERASER_AT = 0.5;       // 插在刷怪进度的中点（上下浮动 ±0.1）
const ERASER_NEAR = 0.52;    // 出生半径 = 关卡 spawnRadius × 这个系数（五关 18.2 → 9.5 格）

// 第 75 块：导出（测试要精确检查「擦名者插在进度哪一格」与整表是否递增）
export function buildSpawns(roundNo, mod = {}, level = LEVEL_1) {  const cfg = level.rounds[roundNo - 1];
  const cs = mod.countScale != null ? Math.max(0, mod.countScale) : 1;
  const gs = level.gapScale || 1;
  const n = (v) => Math.max(0, Math.round((v || 0) * cs));
  const out = [];
  let t = 0.75;
  let first = true;
  let eraserCount = 0;
  for (const [type, gapMul] of level.order) {
    const count = n(cfg[type]);
    if (count <= 0) continue;
    if (type === 'eraser') {        // 第 75 块：先扣下来，等整表排完再插到中段
      eraserCount += count;
      continue;                     // 别动 t / first，它不该占别人的段间隔
    }
    if (!first) t += 0.35;
    first = false;
    for (let i = 0; i < count; i++) {
      out.push({ type, delay: t });
      t += cfg.gap * gapMul * gs;
    }
  }
  if (eraserCount > 0) {
    // 整回合的刷怪时长：最后一只怪什么时候出来（没别的怪时就给个最短窗口）
    const span = out.length ? out[out.length - 1].delay : 4.0;
    for (let i = 0; i < eraserCount; i++) {
      // 一只擦名者固定在 50%；多只就在 40%~60% 之间岔开，别叠在同一秒
      const k = eraserCount === 1
        ? ERASER_AT
        : (ERASER_AT - 0.10) + (0.20 * i) / (eraserCount - 1);
      out.push({ type: 'eraser', delay: Math.max(1.2, span * k), near: true });
    }
    out.sort((a, b) => a.delay - b.delay);   // 见上面 ①：必须是递增表
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

  // ---- 第 97 块（用户第 3 条）：场上太空就提前放后面的怪 ----
  // 以前一回合的出场表是**绝对时间表**：怪与怪的间隔写死在表里，谁都被钉在
  // 自己的那一秒出场。清得快（一波刚落地就被拍碎）的时候，玩家只能干等 ——
  // 一局时间就这么被"空场"吃掉了。
  // 现在：活怪低于 LOW_POP 只的时候，把**下一只待出场**的怪直接拉到"现在"。
  // 两个限制，免得变成一瞬间把整波倒出来：
  //   · 每次只拉一只（拉完立刻出场，剩下的排队等下一次判定）
  //   · 两次之间至少隔 CATCH_STEP 秒
  // 只改那一只的 delay（不动 t），所以后面那些怪的**原定节奏不变**。
  const LOW_POP = 5;
  const CATCH_STEP = 0.22;
  let catchT = 0;

  // nearR：第 75 块 —— 擦名者用更近的出生半径传进来（其它怪不传，行为不变）。
  // 传了就同时收紧「不能刷在主角脸上」的下限，否则近半径会被规则 2 全部否掉。
  function pickSpawn(nearR) {
    const p = getPlayerPos();
    const R = nearR || level.spawnRadius;
    const minD = nearR ? Math.min(level.minPlayerDistance, R * 0.66) : level.minPlayerDistance;
    const jitter = nearR ? level.spawnJitter * 0.6 : level.spawnJitter;
    // 第 63 块：四向路口（level.lanes）—— 只在均分的几条「路」上刷。
    // 每条路带一点角度抖动（±1/6 路宽），不然四次都从同一条直线进来太假。
    const lanes = level.lanes | 0;
    const laneStep = lanes > 0 ? (Math.PI * 2) / lanes : 0;

    for (let i = 0; i < 30; i++) {
      let a;
      if (lanes > 0) {
        const base = Math.floor(Math.random() * lanes) * laneStep;
        a = base + (Math.random() - 0.5) * laneStep * 0.33;
      } else {
        a = Math.random() * Math.PI * 2;
      }
      const r = R + (Math.random() - 0.5) * jitter * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // 规则 2：不能刷在主角脸上
      if (Math.hypot(x - p.x, z - p.z) < minD) continue;

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
    catchT = 0;             // 第 97 块：空场催怪的节流计时也归零
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
    catchT = 0;             // 第 97 块
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
        // 第 75 块：擦名者（near）从更近的圈上进场 —— 它得让玩家当场看见
        const at = pickSpawn(sp.near ? level.spawnRadius * ERASER_NEAR : 0);
        const sc = roundScale(roundIndex + 1, level);
        // 第 122 块：本回合修正也可以改怪物的数值（「疾风挑战」的移速 / 出手频率）。
        // 只有 countScale 是 buildSpawns 自己吃的，其余三项在这里乘，
        // 缺省 1 —— 老事件写的 mod 没有这几个键，行为一点不变。
        const rm = roundMod || {};
        const e = enemies.spawn(sp.type, at, {
          hpScale: sc.hp * (rm.hpMul || 1),
          damageScale: sc.damage * (rm.dmgMul || 1),
          speedScale: sc.speed * (rm.speedMul || 1),
          hasteScale: sc.haste * (rm.hasteMul || 1),   // 第 91 块：出手频率（enemy.js 的 e.haste）
        });
        if (e) spawned++;
      }

      // 第 97 块：空场催下一只（见上面 LOW_POP 的说明）
      if (spawnIdx < spawns.length && enemies.aliveCount() < LOW_POP) {
        catchT += dt;
        if (catchT >= CATCH_STEP) {
          catchT = 0;
          const nx = spawns[spawnIdx];
          if (nx && nx.delay > t) nx.delay = t;    // 下一帧的 while 就会把它放出来
        }
      } else {
        catchT = 0;
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
    t = 0; spawnIdx = 0; gapT = 0; spawned = 0; catchT = 0;
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
    // 第 97 块：本回合还有几只没出场（空场催怪的观测口，测试也用它）
    get pending() { return spawns ? Math.max(0, spawns.length - spawnIdx) : 0; },
    get lowPop() { return LOW_POP; },
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
