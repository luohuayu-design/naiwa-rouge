// ============================================================
// gift.js —— 礼包兑换（第 44 块）
//
// 没有服务器怎么做「一个码只能用一次」？
//   · 码本身不写在代码里，只存它的一段哈希 → 扒源码也拿不到能用的码。
//   · 「用过没有」记在玩家本机档案 profile.gifts 里（hash → 兑换时间），
//     同一个码第二次进来就被拦下。
//   · 代价说清楚：换浏览器 / 清缓存 / 换设备 = 记录清零，同一个码能再用。
//     纯前端只能做到这一步，要真正锁死必须上服务器。
//
// 码的格式：N{A|B}-XXXX-XXXX（A 类 300 骨币，B 类 100 骨币）
//   不区分大小写，横杠、空格随便打，全都当没写 —— 手抄不会因为少个杠就废。
//   第 57 块起码可以带「组名」（宣传礼包 / 推荐礼包），兑换提示和已兑列表显示它；
//   第一批（提建议/报 bug）没有组名，照旧显示「A 类 / B 类」。
// ============================================================

// [兑换码哈希, 骨币, 组名（可选）]。码里刻意不含 0 / O / 1 / I / L 这些看岔的字符。
// 哈希 = 归一化后的码做两次加盐 FNV-1a，拼成 16 位十六进制。
// 生成 / 校验用 `.tmp-gen-codes.mjs`（node .tmp-gen-codes.mjs 10 A）。
const GIFT_TABLE = [
  // A 类 · 300 骨币 —— 第一批：提建议 / 报 bug 礼包（第 44 块）
  ['440f992b263512b7', 300],
  ['cb1f955cfe39c2dc', 300],
  ['d9a249fe405cd87e', 300],
  ['43b38aeb4c9b8017', 300],
  ['074589ed80960a09', 300],
  ['425ab4a5e0690891', 300],
  ['4895e77e6c298cfe', 300],
  ['ef1f9557361cae3b', 300],
  ['595828d49d02a524', 300],
  ['0c3dc35f33ecca33', 300],
  // B 类 · 100 骨币 —— 第一批：提建议 / 报 bug 礼包（第 44 块）
  ['4b6ba947451b49eb', 100],
  ['3f76c707021da5cb', 100],
  ['ff47db66192f9a76', 100],
  ['2e092dbae057dca2', 100],
  ['97aefece7282e2ce', 100],
  ['daf996f081366158', 100],
  ['af7fe1a25618d99a', 100],
  ['1071ed7b0f1da007', 100],
  ['93d7a5eee8bacc8e', 100],
  ['0de37957341c265b', 100],
  // A 类 · 300 骨币 —— 宣传礼包（第 57 块「宣传有礼」：发视频 / 发朋友圈宣传）
  ['93d621226fb5ba5a', 300, '宣传礼包'],
  ['7b18142b9b851237', 300, '宣传礼包'],
  ['5a95e062eedb89fa', 300, '宣传礼包'],
  ['72912e8a1adf37d2', 300, '宣传礼包'],
  ['868ff0912dcdada5', 300, '宣传礼包'],
  ['38abd3a05a84c128', 300, '宣传礼包'],
  ['cc87959b22dbb427', 300, '宣传礼包'],
  ['d8e310b96ef42c1d', 300, '宣传礼包'],
  ['d43cf578189213f0', 300, '宣传礼包'],
  ['5f8c7ae0a722b168', 300, '宣传礼包'],
  // B 类 · 100 骨币 —— 推荐礼包（第 57 块「宣传有礼」：把网址推荐给朋友）
  ['88bd8a1a8aff9442', 100, '推荐礼包'],
  ['5ebd8b55474f2221', 100, '推荐礼包'],
  ['1c611f4058174e08', 100, '推荐礼包'],
  ['4173471e2a35bbbe', 100, '推荐礼包'],
  ['e674ae1aa8c68202', 100, '推荐礼包'],
  ['28ac474af6fca212', 100, '推荐礼包'],
  ['a8f8d23dab4a59b9', 100, '推荐礼包'],
  ['e47511ab1fc07a37', 100, '推荐礼包'],
  ['18f457d89b7539b0', 100, '推荐礼包'],
  ['08976d0c8114278c', 100, '推荐礼包'],
];

// hash → { bones, name }。第一批的 name 是空串（显示时回退到「A/B 类」）
const GIFT_MAP = new Map(GIFT_TABLE.map(([h, b, name]) => [h, { bones: b, name: name || '' }]));

export const GIFT_COUNT = GIFT_TABLE.length;

// 归一化：大写、只留字母数字。N A - Q V 9 9 - 4 6 R 2 → NAQV9946R2
export function normalizeCode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function h32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function codeHash(norm) {
  const a = h32(norm, 0x811c9dc5);
  const b = h32('#naiwa#' + norm + '#gift#', 0x01000193);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// 查码。认得出来就返回 { hash, bones, tier, name }，认不出来返回 null。
// 归一化后短于 6 个字符的，明显不是码，直接跳过算哈希。
export function lookupGift(raw) {
  const norm = normalizeCode(raw);
  if (norm.length < 6) return null;
  const hash = codeHash(norm);
  const hit = GIFT_MAP.get(hash);
  if (!hit) return null;
  return { hash, bones: hit.bones, tier: hit.bones >= 300 ? 'A' : 'B', name: hit.name };
}

// 按哈希反查档位（给「已兑换」列表用；码被下架了就当普通礼包）
export function giftByHash(hash) {
  const hit = GIFT_MAP.get(hash);
  if (!hit) return { bones: 0, tier: '?', name: '' };
  return { bones: hit.bones, tier: hit.bones >= 300 ? 'A' : 'B', name: hit.name };
}
