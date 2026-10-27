// ============================================================
// achievements.js —— 成就清单（第 18 块建立，第 94 块重做）
//
// 这个文件只放「定义」：八类别 × 三档奖励。解锁动作分散在 main.js 的各个埋点
// （结算 / 击杀 / 选卡 / 喝药 / 挡刀 / 开箱 / 签到 / 兑换……），那边调 tryAch(id)。
// 是否已解锁存在 profile.ach（localStorage），跨局累计的用 profile.stats 的计数判断。
//
// ============ 第 94 块改了什么 ============
// ① **种类从 41 条扩到 67 条**，按八类分组（战斗 / 生存 / 构筑 / 关卡 / 挑战 /
//    剧情 / 局外 / 隐藏）—— 原来只有一条平铺的清单，玩家根本不知道还差哪一类；
// ② **解锁直接发夜行骨币**：三档 30 / 60 / 120（克制档，见 ACH_TIERS 注释）。
//    以前成就纯装饰，现在它是局外货币第三条来源；
// ③ **有进度条**：prog 字段声明「看哪个计数器、满多少」，面板里能看见
//    「击倒 137 / 500」这种实数，而不是只有一个干巴巴的描述。
//
// ⚠️ 新增成就的三条规矩：
//    · 必须有埋点，没有埋点的成就永远不会亮（本文件不含任何运行时逻辑）；
//    · prog 的 kind 只能填 'stat'（profile.stats 的键）/ 'enemy'（图鉴击倒数）/
//      'events'（遇到过的奇遇种类数），main.js 只认这三种；
//    · tier 决定骨币，**别手写骨币数字**（改档位只改 ACH_TIERS 一处）。
// ============================================================

import { profile, hasAch, achGot, markAchGot, addBones, save } from './profile.js?v=114';

// ---------------- 八类别 ----------------
// icon 全部来自 game-icons.net（CC BY 3.0），和背包图标同源；
// 下载下来后去掉了自带的那块黑色底板、并把 fill 改成 currentColor（用 CSS 着色）。
export const ACH_CATS = [
  {
    id: 'battle', name: '战斗', icon: 'assets/icons/ach-battle.svg',
    lead: '把骷髅拆成骨架这件事本身。数量型的成就，慢慢打总会满。',
  },
  {
    id: 'survive', name: '生存', icon: 'assets/icons/ach-survive.svg',
    lead: '活下来。这一类几乎都是「忍住别贪」的副产品。',
  },
  {
    id: 'build', name: '构筑', icon: 'assets/icons/ach-build.svg',
    lead: '环上的剑、身上的卡、兜里的金币 —— 这一局你打算靠什么赢。',
  },
  {
    id: 'level', name: '关卡', icon: 'assets/icons/ach-level.svg',
    lead: '走到第几关、撑到第几夜。骨塔有九层，每一层都有自己的规矩。',
  },
  {
    id: 'challenge', name: '挑战', icon: 'assets/icons/ach-challenge.svg',
    lead: '给自己加难度：更快、更狠、或者什么都不带。',
  },
  {
    id: 'story', name: '剧情', icon: 'assets/icons/ach-story.svg',
    lead: '《笑不出来的那一夜》十八夜，读完的人不多。',
  },
  {
    id: 'meta', name: '局外', icon: 'assets/icons/ach-meta.svg',
    lead: '标题页里花的时间也算数：篝火、盲盒、签到、兑换码。',
  },
  {
    id: 'secret', name: '隐藏', icon: 'assets/icons/ach-secret.svg',
    lead: '不写在明面上的三个。慢慢逛，总会撞上。',
  },
];

export const ACH_CAT_BY_ID = Object.fromEntries(ACH_CATS.map((c) => [c.id, c]));

// ---------------- 三档奖励 ----------------
// 第 94 块定案用**克制档**：骨币现状是木匣首价 30、金匣 280，篝火一级几十上百。
// 三档 30 / 60 / 120 —— 一条罕见成就约等于半个金匣。
// 67 条的分布是 寻常 15 / 不易 37 / 罕见 15，**全清一共 4470 骨币 ≈ 16 个金匣**。
// 这个量级是「有感觉但不至于把盲盒那套靠成本兜底的平衡冲掉」。
// ⚠️ 这是**一次性**奖励，每条只能领一次（achGot 里记着领过没有）。
// 第 94-2 块之前是「解锁直接发」，现在改成**手动领取**（和每日任务同一个手感）：
// 解锁 -> 面板上出现「领取」按钮 + tab 亮红点 -> 点了才加骨币。
export const ACH_TIERS = [
  { id: 0, name: '寻常', bones: 30, cls: 't0' },
  { id: 1, name: '不易', bones: 60, cls: 't1' },
  { id: 2, name: '罕见', bones: 120, cls: 't2' },
];

export function achTier(t) { return ACH_TIERS[Number(t) || 0] || ACH_TIERS[0]; }

// ---------------- 成就表 ----------------
// prog 说明（kind 只有四种，main.js 的 achProgress 只认这四种）：
//   { k:'stat',   key:'kills', need:100 }  读 profile().stats 里的累计计数
//   { k:'enemy',  id:'warden', need:5 }    读图鉴里这种怪的击倒数
//   { k:'events', need:50 }                读「遇到过几种奇遇」
//   { k:'meta',   key:'opened',need:10 }   读 metaShopState()（盲盒开箱数）
//   { k:'enemies',need:20 }                读「图鉴里已经打过的怪有几种」
// 没有 prog 的（单局达成型 / 条件型）面板上就不画进度条，只画 0% / 100%。
export const ACHS = [
  // ========== 战斗 ==========
  { id: 'first_blood', cat: 'battle', tier: 0, icon: '💀', name: '第一根骨头', desc: '击倒第一只骷髅', prog: { k: 'stat', key: 'kills', need: 1 } },
  { id: 'kills_100', cat: 'battle', tier: 0, icon: '☠️', name: '清道夫', desc: '累计击倒 100 只骷髅', prog: { k: 'stat', key: 'kills', need: 100 } },
  { id: 'kills_500', cat: 'battle', tier: 1, icon: '⚔️', name: '荒草地的死神', desc: '累计击倒 500 只骷髅', prog: { k: 'stat', key: 'kills', need: 500 } },
  { id: 'kills_1500', cat: 'battle', tier: 2, icon: '🩻', name: '白骨深渊', desc: '累计击倒 1500 只骷髅', prog: { k: 'stat', key: 'kills', need: 1500 } },
  { id: 'run_kills_100', cat: 'battle', tier: 1, icon: '🦴', name: '一夜百骨', desc: '单局击杀 100 只' },
  { id: 'run_kills_200', cat: 'battle', tier: 2, icon: '⛰️', name: '骨堆成山', desc: '单局击杀 200 只' },
  { id: 'run_kills_300', cat: 'battle', tier: 2, icon: '🌊', name: '骨海', desc: '单局击杀 300 只（后期一关的怪全算上）' },
  // 三四关的老面孔
  { id: 'charger_30', cat: 'battle', tier: 1, icon: '🐂', name: '别站在直线上', desc: '累计击倒 30 只冲锋蛮牛', prog: { k: 'enemy', id: 'charger', need: 30 } },
  { id: 'shielder_30', cat: 'battle', tier: 1, icon: '🪓', name: '等盾放下来', desc: '累计击倒 30 只盾斧兽人', prog: { k: 'enemy', id: 'shielder', need: 30 } },
  { id: 'brood_10', cat: 'battle', tier: 1, icon: '🍄', name: '断她的产房', desc: '累计击倒 10 只孢生菇', prog: { k: 'enemy', id: 'brood', need: 10 } },
  { id: 'wraith_30', cat: 'battle', tier: 1, icon: '🌫️', name: '雾散了', desc: '累计击倒 30 只雾鬼', prog: { k: 'enemy', id: 'wraith', need: 30 } },
  { id: 'leaper_30', cat: 'battle', tier: 1, icon: '🐺', name: '别站在圈里', desc: '累计击倒 30 只雾猎狼', prog: { k: 'enemy', id: 'leaper', need: 30 } },
  { id: 'mender_10', cat: 'battle', tier: 1, icon: '🩹', name: '拆手术台', desc: '累计击倒 10 只缝补小巫', prog: { k: 'enemy', id: 'mender', need: 10 } },

  // ========== 生存 ==========
  { id: 'flawless_round', cat: 'survive', tier: 1, icon: '🛡️', name: '一根汗毛都没少', desc: '一整回合不掉一滴血' },
  { id: 'low_hp_win', cat: 'survive', tier: 2, icon: '🕯️', name: '一线生机', desc: '生命低于 2 时通关' },
  { id: 'hp_30', cat: 'survive', tier: 1, icon: '❤️', name: '血牛', desc: '单局生命上限堆到 30' },
  { id: 'armor_10', cat: 'survive', tier: 1, icon: '🥋', name: '铁王八', desc: '单局防御堆到 10（记得最多只减 70%）' },
  { id: 'potion_10', cat: 'survive', tier: 0, icon: '🧪', name: '药罐子', desc: '累计喝掉 10 瓶药水', prog: { k: 'stat', key: 'potions', need: 10 } },
  { id: 'aegis_10', cat: 'survive', tier: 0, icon: '🔔', name: '金身不坏', desc: '金钟罩累计挡下 10 次伤害', prog: { k: 'stat', key: 'blocks', need: 10 } },

  // ========== 构筑 ==========
  { id: 'first_sword', cat: 'build', tier: 0, icon: '🗡️', name: '环剑到手', desc: '拿到旋转的环剑' },
  { id: 'cards_10', cat: 'build', tier: 0, icon: '🃏', name: '博而不精', desc: '一局里拿到 10 张升级卡' },
  { id: 'cards_all_kinds', cat: 'build', tier: 1, icon: '🌈', name: '五色俱全', desc: '拿齐五种品质的升级卡（本局）' },
  { id: 'sword_8', cat: 'build', tier: 2, icon: '🌀', name: '八剑齐飞', desc: '环上同时挂着 8 把剑' },
  { id: 'all_elements', cat: 'build', tier: 2, icon: '🌟', name: '六色俱全', desc: '同时持有六种元素剑（铁 / 毒 / 冰 / 雷 / 血 / 震）' },
  { id: 'all_relics', cat: 'build', tier: 1, icon: '🔮', name: '法器满挂', desc: '同时持有地刺、霜环与炮台' },
  { id: 'turret_3', cat: 'build', tier: 1, icon: '🏹', name: '炮兵阵地', desc: '同时摆下 3 台弩炮台' },
  { id: 'shop_20', cat: 'build', tier: 0, icon: '🪙', name: '大主顾', desc: '累计在商店花掉 200 金币', prog: { k: 'stat', key: 'spent', need: 200 } },
  { id: 'gold_500', cat: 'build', tier: 1, icon: '💰', name: '富甲一方', desc: '单局攒到 500 金币' },

  // ========== 关卡 ==========
  { id: 'first_run', cat: 'level', tier: 0, icon: '🌙', name: '夜行开始', desc: '打完第一局（无论输赢）', prog: { k: 'stat', key: 'runs', need: 1 } },
  { id: 'first_win', cat: 'level', tier: 0, icon: '🏕️', name: '守住了', desc: '第一次通关', prog: { k: 'stat', key: 'wins', need: 1 } },
  { id: 'round_10', cat: 'level', tier: 0, icon: '🌗', name: '半程', desc: '单局打到第 10 回合' },
  { id: 'round_15', cat: 'level', tier: 1, icon: '🌘', name: '深宵', desc: '单局打到第 15 回合' },
  { id: 'round_20', cat: 'level', tier: 1, icon: '🌅', name: '撑到天亮', desc: '打完 20 个回合（通关）' },
  { id: 'wins_3', cat: 'level', tier: 0, icon: '🎫', name: '常客', desc: '累计通关 3 次', prog: { k: 'stat', key: 'wins', need: 3 } },
  { id: 'wins_10', cat: 'level', tier: 1, icon: '👣', name: '夜行者', desc: '累计通关 10 次', prog: { k: 'stat', key: 'wins', need: 10 } },
  { id: 'clear_5', cat: 'level', tier: 1, icon: '🌾', name: '登临第五关', desc: '通关「草甸路口」' },
  { id: 'clear_9', cat: 'level', tier: 2, icon: '🏛️', name: '骨塔之巅', desc: '通关「骨塔登记庭」' },
  { id: 'clear_all', cat: 'level', tier: 2, icon: '🏆', name: '九关皆通', desc: '九关全部通关' },
  // 五~九关的关卡专属怪
  { id: 'eraser_10', cat: 'level', tier: 1, icon: '🧽', name: '名字还在', desc: '累计击倒 10 只擦名者', prog: { k: 'enemy', id: 'eraser', need: 10 } },
  { id: 'reboot_10', cat: 'level', tier: 1, icon: '🔌', name: '彻底拆了', desc: '累计击倒 10 只重启体', prog: { k: 'enemy', id: 'reboot', need: 10 } },
  { id: 'lantern_50', cat: 'level', tier: 1, icon: '🏮', name: '灯下没有影子', desc: '用路口灯照出 50 只隐身的雾鬼', prog: { k: 'stat', key: 'lanternReveal', need: 50 } },
  { id: 'arc_10', cat: 'level', tier: 1, icon: '⚡', name: '拆了十台', desc: '累计击倒 10 台并联体', prog: { k: 'enemy', id: 'arc', need: 10 } },
  { id: 'wellfrog_10', cat: 'level', tier: 1, icon: '🐸', name: '割舌人', desc: '累计击倒 10 只井蛙', prog: { k: 'enemy', id: 'wellfrog', need: 10 } },
  { id: 'woodfish_10', cat: 'level', tier: 1, icon: '🐡', name: '泡都打爆了', desc: '累计击倒 10 只木鱼灵', prog: { k: 'enemy', id: 'woodfish', need: 10 } },
  { id: 'warden_5', cat: 'level', tier: 1, icon: '🚪', name: '柜子空着', desc: '累计击倒 5 只寄存处看守', prog: { k: 'enemy', id: 'warden', need: 5 } },
  { id: 'weigh_5', cat: 'level', tier: 1, icon: '📒', name: '撕掉五本账簿', desc: '累计击倒 5 只称量官', prog: { k: 'enemy', id: 'weigher', need: 5 } },

  // ========== 挑战 ==========
  { id: 'win_fast', cat: 'challenge', tier: 1, icon: '⚡', name: '快刀', desc: '10 分钟内通关' },
  { id: 'win_faster', cat: 'challenge', tier: 2, icon: '🕛', name: '电光石火', desc: '5 分钟内通关' },
  { id: 'win_no_sword', cat: 'challenge', tier: 2, icon: '✊', name: '赤手空拳', desc: '不拿环剑通关（真的有人这么干？）' },
  { id: 'hell_win', cat: 'challenge', tier: 2, icon: '🔥', name: '地狱归来', desc: '在「地狱」难度下通关' },
  { id: 'curse_3', cat: 'challenge', tier: 1, icon: '🕸️', name: '三咒缠身', desc: '带着至少三条诅咒通关' },
  { id: 'curse_5', cat: 'challenge', tier: 2, icon: '🕷️', name: '五咒缠身', desc: '带着至少五条诅咒通关' },
  { id: 'daily_done', cat: 'challenge', tier: 0, icon: '📅', name: '今日份', desc: '打完一次今日挑战（倒下也算）' },
  { id: 'daily_win', cat: 'challenge', tier: 1, icon: '🥇', name: '今日最佳', desc: '通关一次今日挑战' },
  { id: 'lucky_10', cat: 'challenge', tier: 1, icon: '🍀', name: '福星高照', desc: '幸运达到 10' },

  // ========== 剧情 ==========
  { id: 'story_first', cat: 'story', tier: 0, icon: '📖', name: '第一夜', desc: '在关卡里撞见主线《笑不出来的那一夜》' },
  { id: 'story_all', cat: 'story', tier: 1, icon: '📚', name: '夜行人', desc: '在夜行记忆里读完十八夜' },
  { id: 'story_finish', cat: 'story', tier: 2, icon: '🔔', name: '齁', desc: '读到钟楼顶的结局' },

  // ========== 局外 ==========
  { id: 'box_10', cat: 'meta', tier: 0, icon: '📦', name: '开箱十连', desc: '累计开启 10 个盲盒', prog: { k: 'meta', key: 'opened', need: 10 } },
  { id: 'box_50', cat: 'meta', tier: 1, icon: '🎁', name: '开箱狂魔', desc: '累计开启 50 个盲盒', prog: { k: 'meta', key: 'opened', need: 50 } },
  { id: 'camp_9', cat: 'meta', tier: 1, icon: '🔥', name: '九簇篝火', desc: '九簇篝火全部点燃过' },
  { id: 'bones_1000', cat: 'meta', tier: 1, icon: '💎', name: '小康', desc: '同时存下 1000 骨币' },
  { id: 'gift_first', cat: 'meta', tier: 0, icon: '🎟️', name: '第一个码', desc: '兑换过一次礼包码' },
  { id: 'sign_full', cat: 'meta', tier: 1, icon: '📆', name: '满勤', desc: '一整周七天全部签到' },

  // ========== 隐藏 ==========
  { id: 'all_enemies', cat: 'secret', tier: 2, icon: '📕', name: '骨塔名录', desc: '图鉴集齐全部 20 种怪', prog: { k: 'enemies', need: 20 } },
  { id: 'event_50', cat: 'secret', tier: 1, icon: '👁️', name: '见多识广', desc: '遇到 50 种奇遇', prog: { k: 'events', need: 50 } },
  { id: 'event_100', cat: 'secret', tier: 2, icon: '🌌', name: '夜行百态', desc: '遇到 100 种奇遇', prog: { k: 'events', need: 100 } },
];

export const ACH_COUNT = ACHS.length;

const byId = new Map(ACHS.map((a) => [a.id, a]));
export function achById(id) { return byId.get(id); }

// 按类别分组（面板渲染用），顺序照 ACH_CATS
export function achsByCat(catId) {
  return ACHS.filter((a) => a.cat === catId);
}

// ============================================================
// 领奖（第 94-2 块：解锁 -> 手动领骨币）
// ============================================================
// 和每日任务是同一套手感：进度（这里是解锁）自动记，骨币要点「领取」才到手。
// 判据就是两张表的差集 —— ach 里有、achGot 里没有 = 待领。

// 待领清单：[{ id, name, bones }]，按成就表顺序（面板上的顺序一致）
export function achPending() {
  const p = profile();
  const ach = (p.ach && typeof p.ach === 'object') ? p.ach : {};
  const out = [];
  for (const a of ACHS) {
    if (!ach[a.id]) continue;              // 没解锁
    if (achGot(a.id)) continue;             // 领过了
    out.push({ id: a.id, name: a.name, bones: achTier(a.tier).bones });
  }
  return out;
}

export function achPendingBones() {
  return achPending().reduce((n, x) => n + x.bones, 0);
}

export function achClaimed(id) {
  return achGot(id);
}

// 领一条；返回 { ok, bones, name }。没解锁 / 领过了都是 ok:false（UI 不该给按钮）
export function achClaim(id) {
  const a = achById(id);
  if (!a) return { ok: false, reason: 'nope' };
  if (!hasAch(id)) return { ok: false, reason: 'locked' };
  if (!markAchGot(id)) return { ok: false, reason: 'got' };
  const bones = achTier(a.tier).bones;
  addBones(bones);
  return { ok: true, bones, name: a.name };
}

// 一键全领；返回 [{ id, name, bones }]
export function achClaimAll() {
  const got = [];
  for (const x of achPending()) {
    const r = achClaim(x.id);
    if (r.ok) got.push({ id: x.id, name: r.name, bones: r.bones });
  }
  return got;
}

// ---------------- 老用户补发（跑一次） ----------------
// v=105 之前成就**根本不给骨币**，老存档里解锁的那几十条什么也没拿到。
// 补发的实现不需要额外搬运数据：achGot 在老存档里是空对象，
// 那些已解锁的成就自然就落在 achPending() 里，玩家点一下就到手。
//
// 这个闸门只做一件事：记住「这次升级已经处理过」，好在进标题页时提示一次。
// 返回待领条数（0 = 没什么可补的）。
export function achMigrate() {
  const p = profile();
  if (p.achMigrated) return 0;
  p.achMigrated = 1;
  save();
  return achPending().length;
}
