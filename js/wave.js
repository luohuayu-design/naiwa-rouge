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
  scale: { hp: 0.20, damage: 0.12, speed: 0.035 },
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
  scale: { hp: 0.24, damage: 0.14, speed: 0.035 },
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
  scale: { hp: 0.26, damage: 0.15, speed: 0.035 },
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
  scale: { hp: 0.28, damage: 0.16, speed: 0.035, hpMul: 1.15, dmgMul: 1.35 },
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
  gapScale: 1.35,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  // 第 65 块：同第五关 —— 伤害 ×1.35、血量 ×1.15
  scale: { hp: 0.30, damage: 0.17, speed: 0.035, hpMul: 1.15, dmgMul: 1.35 },
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
    { minion: 4, warrior: 1, reboot: 0, arc: 0, leaper: 0, archer: 0, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.80, tip: '通电前会闪一下橙光 —— 看到就往外走' },
    { minion: 4, warrior: 1, reboot: 0, arc: 0, leaper: 0, archer: 1, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.80, tip: '弧线走位：绕开格栅，别直着冲' },
    // ---- 第二幕（R5~R8）：重启体登场 ----
    { minion: 5, warrior: 1, reboot: 1, arc: 0, leaper: 0, archer: 1, bowman: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.75, tip: '那个铁块打死了会重新站起来：躺下的时候守着它' },
    { minion: 5, warrior: 2, reboot: 1, arc: 0, leaper: 0, archer: 1, bowman: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, gap: 0.72, tip: '重启只需要 4 秒：走了就白打一次' },
    { minion: 5, warrior: 2, reboot: 1, arc: 2, leaper: 1, archer: 1, bowman: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.70, tip: '雾鬼也钻到机房里来了：隐着身照样咬人' },
    { minion: 6, warrior: 2, reboot: 2, arc: 2, leaper: 1, archer: 2, bowman: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, gap: 0.66, tip: '两只并联体浮起来了：它们之间那条青白色电弧，碰到就掉血' },
    { minion: 6, warrior: 3, reboot: 2, arc: 2, leaper: 1, archer: 2, bowman: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, gap: 0.62, tip: '拆掉一只并联体，就少一条电弧 —— 场上的网是它们连出来的' },
    // ---- 第三幕（R9~R13）：混编加压 ----
    { minion: 6, warrior: 3, reboot: 2, arc: 2, leaper: 2, archer: 2, bowman: 1, wraith: 2, shielder: 1, brood: 0, mender: 1, gap: 0.60, tip: '戴尖帽的小巫在给怪回血：别让它奶到重启体' },
    { minion: 7, warrior: 3, reboot: 2, arc: 4, leaper: 2, archer: 2, bowman: 2, wraith: 2, shielder: 1, brood: 1, mender: 1, gap: 0.58, tip: '四只并联体 = 六条电弧：这张网会把你逼到格栅边上' },
    { minion: 7, warrior: 4, reboot: 2, arc: 4, leaper: 2, archer: 3, bowman: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, gap: 0.56, tip: '地板、怪、奶妈三件事一起来 —— 先保走位' },
    { minion: 7, warrior: 4, reboot: 3, arc: 4, leaper: 2, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, gap: 0.54, tip: '三个重启体：这一波的「清场」要清三遍' },
    { minion: 8, warrior: 4, reboot: 3, arc: 4, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, gap: 0.52, tip: '漏电地板上的怪不掉血 —— 别指望电帮你' },
    // ---- 第四幕（R14~R17）：机房的夜班 ----
    { minion: 8, warrior: 4, reboot: 3, arc: 4, leaper: 3, archer: 3, bowman: 2, wraith: 3, shielder: 2, brood: 2, mender: 1, gap: 0.50, tip: '两颗孢生菇：十二只小兵上限，先拆一颗' },
    { minion: 8, warrior: 5, reboot: 3, arc: 4, leaper: 3, archer: 3, bowman: 3, wraith: 3, shielder: 2, brood: 2, mender: 1, gap: 0.48, tip: '风扇声越来越近 —— 它们比刚才更快了' },
    { minion: 8, warrior: 5, reboot: 4, arc: 4, leaper: 3, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 1, gap: 0.46, tip: '四个重启体：留一条能绕回格栅外的路' },
    { minion: 9, warrior: 5, reboot: 4, arc: 4, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 2, gap: 0.44, tip: '第 17 回合：ERROR 日志刷得停不下来' },
    // ---- 第五幕（R18~R20）：骨塔机房 · 毕业考 ----
    { minion: 9, warrior: 5, reboot: 4, arc: 4, leaper: 4, archer: 4, bowman: 3, wraith: 4, shielder: 3, brood: 2, mender: 2, gap: 0.42, tip: '还差三回合：别把血花在电上' },
    { minion: 9, warrior: 6, reboot: 4, arc: 4, leaper: 4, archer: 4, bowman: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, gap: 0.40, tip: '倒数第二波：补刀、补刀、补刀' },
    { minion: 10, warrior: 6, reboot: 5, arc: 4, leaper: 4, archer: 4, bowman: 4, wraith: 5, shielder: 4, brood: 2, mender: 2, gap: 0.38, tip: '最后一波：把机房里的东西全拆了' },
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
//   woodfish 木鱼灵 —— 青色法器精魄，读条在你脚下钉青圈（hex 改青）：圈里掉血 + 减速。
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
  gapScale: 1.35,          // 生成放缓，窄井里别让怪叠成一坨
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  // 第 71 块：延续六关的整体系数再略加（hp 1.20 / dmg 1.45）
  scale: { hp: 0.32, damage: 0.19, speed: 0.035, hpMul: 1.20, dmgMul: 1.45 },
  // 滴水落点：井底的水从头顶滴下来，三滴错相、随机落点（不依赖某只怪在场）
  hazards: [
    { kind: 'drip', random: true, cx: 0, cz: 0, spread: 8.5, r: 1.7, cycle: 3.4, on: 0.5, warm: 1.1, damage: 1, off: 0.0 },
    { kind: 'drip', random: true, cx: 0, cz: 0, spread: 8.5, r: 1.7, cycle: 3.4, on: 0.5, warm: 1.1, damage: 1, off: 1.7 },
    { kind: 'drip', random: true, cx: 0, cz: 0, spread: 8.5, r: 1.7, cycle: 3.4, on: 0.5, warm: 1.1, damage: 1, off: 2.5 },
  ],
  rounds: [
    // ---- 第一幕（R1~R3）：井底 · 水还在滴 ----
    { minion: 3, warrior: 0, wellfrog: 0, archer: 0, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.90, tip: '骨塔井底：头顶有水滴下来 —— 无视防御，看到青环就挪开' },
    { minion: 4, warrior: 1, wellfrog: 0, archer: 0, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.80, tip: '窄井里转身不方便，别贴着边走' },
    { minion: 4, warrior: 1, wellfrog: 0, archer: 1, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.80, tip: '还是横着走躲骨刀' },
    // ---- 第二幕（R4~R7）：井蛙登场 ----
    { minion: 5, warrior: 1, wellfrog: 1, archer: 1, bowman: 0, woodfish: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.75, tip: '那只绿蛙会吐舌头拉你 —— 舌头有独立血量，砍断它才能脱身' },
    { minion: 5, warrior: 2, wellfrog: 1, archer: 1, bowman: 1, woodfish: 0, leaper: 0, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.72, tip: '舌头伸出来时打它本体不掉血：先把舌头砍断' },
    { minion: 5, warrior: 2, wellfrog: 2, archer: 1, bowman: 1, woodfish: 0, leaper: 1, wraith: 1, shielder: 0, brood: 0, mender: 0, reboot: 0, gap: 0.70, tip: '两只井蛙会轮流拉你：别被拽到怪堆里' },
    { minion: 6, warrior: 2, wellfrog: 2, archer: 2, bowman: 1, woodfish: 0, leaper: 1, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, gap: 0.66, tip: '盾兵也来了：等它放盾再打' },
    // ---- 第三幕（R8~R11）：木鱼灵登场 ----
    { minion: 6, warrior: 3, wellfrog: 2, archer: 2, bowman: 1, woodfish: 1, leaper: 1, wraith: 2, shielder: 1, brood: 0, mender: 0, reboot: 0, gap: 0.62, tip: '那只青色木鱼灵在念咒：脚下出青圈掉血又减速，走开' },
    { minion: 7, warrior: 3, wellfrog: 2, archer: 2, bowman: 2, woodfish: 1, leaper: 2, wraith: 2, shielder: 1, brood: 1, mender: 0, reboot: 0, gap: 0.60, tip: '木鱼灵血薄但会减速你，优先点掉' },
    { minion: 7, warrior: 4, wellfrog: 3, archer: 3, bowman: 2, woodfish: 1, leaper: 2, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 0, gap: 0.58, tip: '它敲的木鱼会震你 —— 井底的法器之一，之后能在商店买到' },
    { minion: 7, warrior: 4, wellfrog: 3, archer: 3, bowman: 2, woodfish: 2, leaper: 2, wraith: 3, shielder: 2, brood: 1, mender: 1, reboot: 1, gap: 0.56, tip: '重启体也钻进井里了：躺下时守着它' },
    // ---- 第四幕（R12~R15）：混编加压 ----
    { minion: 7, warrior: 4, wellfrog: 3, archer: 3, bowman: 2, woodfish: 2, leaper: 3, wraith: 3, shielder: 2, brood: 1, mender: 1, reboot: 1, gap: 0.54, tip: '井蛙、木鱼、滴水和怪一起上 —— 先保走位' },
    { minion: 8, warrior: 4, wellfrog: 4, archer: 3, bowman: 3, woodfish: 2, leaper: 3, wraith: 3, shielder: 2, brood: 2, mender: 1, reboot: 1, gap: 0.52, tip: '两只木鱼灵的青圈会叠，别站一块' },
    { minion: 8, warrior: 5, wellfrog: 4, archer: 4, bowman: 3, woodfish: 2, leaper: 3, wraith: 4, shielder: 3, brood: 2, mender: 1, reboot: 2, gap: 0.50, tip: '井蛙四只：舌头拉扯里别被拽出安全区' },
    { minion: 8, warrior: 5, wellfrog: 4, archer: 4, bowman: 3, woodfish: 3, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, gap: 0.48, tip: '第 15 回合：井底的水滴得最密' },
    // ---- 第五幕（R16~R20）：井底长夜 · 毕业考 ----
    { minion: 8, warrior: 5, wellfrog: 5, archer: 4, bowman: 3, woodfish: 3, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 2, gap: 0.46, tip: '第 16 回合：井底长夜，全来了' },
    { minion: 8, warrior: 5, wellfrog: 5, archer: 4, bowman: 4, woodfish: 3, leaper: 4, wraith: 4, shielder: 3, brood: 2, mender: 2, reboot: 3, gap: 0.44, tip: '木鱼法器该上了：挨打/击杀震一圈，把井蛙震退' },
    { minion: 9, warrior: 6, wellfrog: 5, archer: 5, bowman: 4, woodfish: 4, leaper: 5, wraith: 5, shielder: 3, brood: 2, mender: 2, reboot: 3, gap: 0.42, tip: '还剩三回合：舌头拉人和滴水一起躲' },
    { minion: 9, warrior: 6, wellfrog: 6, archer: 5, bowman: 4, woodfish: 4, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 4, gap: 0.40, tip: '倒数第二波：砍断舌头、躲开青圈' },
    { minion: 9, warrior: 6, wellfrog: 6, archer: 5, bowman: 4, woodfish: 4, leaper: 5, wraith: 5, shielder: 4, brood: 2, mender: 2, reboot: 4, gap: 0.38, tip: '最后一波：把井底的东西全拍碎，爬出去' },
  ],
};

// 关卡号 → 关卡表（主流程 / 选关 / 测试都从这里取）
export const LEVELS_BY_ID = {
  1: LEVEL_1, 2: LEVEL_2, 3: LEVEL_3, 4: LEVEL_4, 5: LEVEL_5, 6: LEVEL_6, 7: LEVEL_7,
};

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
  // 第 65 块：额外整体系数 hpMul / dmgMul（默认 1，只有五、六关用）。
  // 用户嫌后两关太软，要「伤害 +35%、血量 +15%」——加在乘数上比改 slope 直观：
  //   slope 是「每回合长多少」，改它会顺带把 R1 也一起抬起来；
  //   mul 是「整关一起乘」，晚期的疼度线性可预测。
  return {
    hp: (1 + s.hp * k) * diff.hp * (s.hpMul || 1),
    damage: (1 + s.damage * k) * diff.damage * (s.dmgMul || 1),
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
        // 第 75 块：擦名者（near）从更近的圈上进场 —— 它得让玩家当场看见
        const at = pickSpawn(sp.near ? level.spawnRadius * ERASER_NEAR : 0);
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
