// ============================================================
// achievements.js —— 成就清单（第 18 块）
//
// 只放「定义」：每条 { id, name, desc }。解锁动作分散在 main.js 的
// 各个埋点（结算/击杀/选卡/喝药/挡刀……），那边调 tryAch(id)。
// 是否已解锁存在 profile.ach（localStorage），跨局累计的用
// profile.stats 的计数来判断，所以这里不需要任何运行时状态。
// ============================================================

export const ACHS = [
  // 起步
  { id: 'first_run', name: '夜行开始', desc: '打完第一局（无论输赢）' },
  { id: 'first_blood', name: '第一根骨头', desc: '击倒第一只骷髅' },
  { id: 'first_win', name: '守住了', desc: '第一次通关' },
  { id: 'first_sword', name: '环剑到手', desc: '拿到旋转的环剑' },
  // 击杀
  { id: 'kills_100', name: '清道夫', desc: '累计击倒 100 只骷髅' },
  { id: 'kills_500', name: '荒草地的死神', desc: '累计击倒 500 只骷髅' },
  { id: 'kills_1500', name: '白骨深渊', desc: '累计击倒 1500 只骷髅' },
  { id: 'run_kills_100', name: '一夜百骨', desc: '单局击杀 100 只' },
  { id: 'run_kills_200', name: '骨堆成山', desc: '单局击杀 200 只' },
  // 进度
  { id: 'round_10', name: '半程', desc: '单局打到第 10 回合' },
  { id: 'round_15', name: '深宵', desc: '单局打到第 15 回合' },
  { id: 'round_20', name: '撑到天亮', desc: '打完 20 个回合（通关）' },
  { id: 'wins_3', name: '常客', desc: '累计通关 3 次' },
  { id: 'wins_10', name: '夜行者', desc: '累计通关 10 次' },
  { id: 'win_fast', name: '快刀', desc: '10 分钟内通关' },
  { id: 'win_no_sword', name: '赤手空拳', desc: '不拿环剑通关（真的有人这么干？）' },
  // 收集与构筑
  { id: 'cards_10', name: '博而不精', desc: '一局里拿到 10 张升级卡' },
  { id: 'cards_all_kinds', name: '五色俱全', desc: '拿齐五种品质的升级卡（本局）' },
  { id: 'shop_20', name: '大主顾', desc: '累计在商店花掉 200 金币' },
  { id: 'all_relics', name: '法器满挂', desc: '同时持有地刺、霜环与炮台' },
  // 生存与玩法
  { id: 'potion_10', name: '药罐子', desc: '累计喝掉 10 瓶药水' },
  { id: 'aegis_10', name: '金身不坏', desc: '金钟罩累计挡下 10 次伤害' },
  { id: 'turret_3', name: '炮兵阵地', desc: '同时摆下 3 台弩炮台' },
  { id: 'low_hp_win', name: '一线生机', desc: '生命低于 2 时通关' },
  { id: 'hell_win', name: '地狱归来', desc: '在「地狱」难度下通关' },
  { id: 'lucky_10', name: '福星高照', desc: '幸运达到 10' },
  // 第 21 / 22 块
  { id: 'curse_3', name: '三咒缠身', desc: '带着至少三条诅咒通关' },
  { id: 'daily_done', name: '今日份', desc: '打完一次今日挑战（倒下也算）' },
  { id: 'daily_win', name: '今日最佳', desc: '通关一次今日挑战' },
  // 第 29 块：第三关的三只新怪
  { id: 'charger_30', name: '别站在直线上', desc: '累计击倒 30 只骨骑冲锋兵' },
  { id: 'shielder_30', name: '等盾放下来', desc: '累计击倒 30 只骸盾兵' },
  { id: 'brood_10', name: '断她的产房', desc: '累计击倒 10 只孵骨巫祝' },
];

const byId = new Map(ACHS.map((a) => [a.id, a]));
export function achById(id) { return byId.get(id); }
