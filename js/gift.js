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
// ============================================================

// [兑换码哈希, 骨币]。码里刻意不含 0 / O / 1 / I / L 这些看岔的字符。哈希 = 归一化后的码做两次加盐 FNV-1a，拼成 16 位十六进制。
const GIFT_TABLE = [
  // A 类 · 300 骨币
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
  // B 类 · 100 骨币
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
];

const GIFT_MAP = new Map(GIFT_TABLE);

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

// 查码。认得出来就返回 { hash, bones, tier }，认不出来返回 null。
// 归一化后短于 6 个字符的，明显不是码，直接跳过算哈希。
export function lookupGift(raw) {
  const norm = normalizeCode(raw);
  if (norm.length < 6) return null;
  const hash = codeHash(norm);
  const bones = GIFT_MAP.get(hash);
  if (!bones) return null;
  return { hash, bones, tier: bones >= 300 ? 'A' : 'B' };
}

// 按哈希反查档位（给「已兑换」列表用；码被下架了就当普通礼包）
export function giftByHash(hash) {
  const bones = GIFT_MAP.get(hash);
  if (!bones) return { bones: 0, tier: '?' };
  return { bones, tier: bones >= 300 ? 'A' : 'B' };
}
