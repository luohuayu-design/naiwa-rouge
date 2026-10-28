// ============================================================
// lastwords.js —— 青蛙遗言系统（情绪叙事 · 创意 B5）
//
// 死亡结算时，根据这一局收集到的东西（剑/法器/残片/骨币/回合/击杀），
// 青蛙说一句不同的遗言。让「输」也有情绪重量，而不是冷冰冰的失败面板。
//
// 呼应主线「被记住」的内核：收集越多，遗言越「不甘心被遗忘」。
//
// 设计原则：零 import 业务模块，纯逻辑 + 依赖注入，Node 可测。
// 接线方在 endGame(false) 时调 pickLastWords(run) 拿文案，填进 rsSub。
// ============================================================

// 遗言规则：按「本局成就」的优先级从高到低匹配，返回最贴合的那句。
// 匹配键与主线三印记（笑声/名字/记忆）呼应。

// 遗言表（按优先级排序，命中第一个就返回）
const LINES = [
  {
    id: 'no_sword',
    test: (r) => r.swordKinds <= 0,
    text: '一把剑都没拿到……连影子都没来得及挥出去。',
  },
  {
    id: 'early_death',
    test: (r) => r.round <= 2,
    text: '第一夜还没亮就倒下了。草地会替我记住这声蛙鸣吗？',
  },
  {
    id: 'rich_no_relic',
    test: (r) => r.coins >= 100 && r.relicCount <= 0,
    text: '攒了这么多骨币，却一件法器都没带走……钱买不回名字。',
  },
  {
    id: 'many_shards',
    test: (r) => r.shards >= 4,
    text: '夜行残片撒了一地。空白会捡走它们，把我彻底抹掉。',
  },
  {
    id: 'deep_run',
    test: (r) => r.round >= 15,
    text: '撑到了这么远……只差一点，就能让钟楼记住我的脚印。',
  },
  {
    id: 'many_relics',
    test: (r) => r.relicCount >= 4,
    text: '这么多法器都护不住我。被遗忘，比死亡更冷。',
  },
  {
    id: 'high_kills',
    test: (r) => r.kills >= 100,
    text: '打倒了成群的骷髅，却还是没能守住自己的名字。',
  },
  {
    id: 'default',
    test: () => true,
    text: '奶蛙被夜色吞没了。下一次，我会记住更多。',
  },
];

// 通关（胜利）时的文案，不叫遗言，但同一套入口
const WIN_LINE = '夜色里的骷髅被清干净了，奶蛙的名字，今晚被记住了。';

/**
 * 根据一局的数据生成遗言。
 * @param {object} run
 *   run.swordKinds   本局拿到的剑种数
 *   run.relicCount   本局法器数
 *   run.shards       本局残片数
 *   run.coins        本局骨币数
 *   run.round        倒下的回合数
 *   run.kills        本局击杀数
 * @returns {string} 遗言文案
 */
export function pickLastWords(run) {
  const r = run || {};
  const hit = LINES.find((l) => l.test(r));
  return hit ? hit.text : LINES[LINES.length - 1].text;
}

/**
 * 通关文案（胜利）。预留接口，统一出口。
 */
export function winLine() {
  return WIN_LINE;
}

// 暴露遗言表给测试
export { LINES };
