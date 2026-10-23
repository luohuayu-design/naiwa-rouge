// 礼包码生成器（第 57 块新增，以后加批复用）
// 跑法：node .tmp-gen-codes.mjs [条数] [类别 A|B]
//   · A 类 = 300 骨币（NA- 开头），B 类 = 100 骨币（NB- 开头）
//   · 字符集刻意去掉 0/O/1/I/L（看岔的），和现有码一致
//   · 输出：可直接粘进 gift.js GIFT_TABLE 的 [哈希, 骨币, 组名] 行 + 给人看的码
// 哈希算法必须和 gift.js 的 codeHash 完全一致（两次加盐 FNV-1a → 16 位 hex）
import { codeHash, normalizeCode } from './js/gift.js';

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // 无 I / L / O
const DIGIT = '23456789';                  // 无 0 / 1

function pick(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.random() < 0.55
      ? ALPHA[Math.floor(Math.random() * ALPHA.length)]
      : DIGIT[Math.floor(Math.random() * DIGIT.length)]);
  }
  return out.join('');
}

// 已有哈希（写死当前表，防撞）—— 换批时把上一批的输出补进来
const EXISTING = new Set([
  '440f992b263512b7', 'cb1f955cfe39c2dc', 'd9a249fe405cd87e', '43b38aeb4c9b8017',
  '074589ed80960a09', '425ab4a5e0690891', '4895e77e6c298cfe', 'ef1f9557361cae3b',
  '595828d49d02a524', '0c3dc35f33ecca33', '4b6ba947451b49eb', '3f76c707021da5cb',
  'ff47db66192f9a76', '2e092dbae057dca2', '97aefece7282e2ce', 'daf996f081366158',
  'af7fe1a25618d99a', '1071ed7b0f1da007', '93d7a5eee8bacc8e', '0de37957341c265b',
]);

const N = Math.max(1, Math.min(50, parseInt(process.argv[2] || '10', 10)));
const cls = (process.argv[3] || 'A').toUpperCase() === 'B' ? 'B' : 'A';
const bones = cls === 'A' ? 300 : 100;
const name = cls === 'A' ? '宣传礼包' : '推荐礼包';
const prefix = cls === 'A' ? 'NA' : 'NB';

const seenHash = new Set(EXISTING);
const seenCode = new Set();
const rows = [];
while (rows.length < N) {
  const body = pick(8);
  const code = `${prefix}-${body.slice(0, 4)}-${body.slice(4)}`;
  const norm = normalizeCode(code);
  if (seenCode.has(norm)) continue;
  const h = codeHash(norm);
  if (seenHash.has(h)) continue;
  seenCode.add(norm);
  seenHash.add(h);
  rows.push({ code, hash: h });
}

console.log(`// ${name}（${cls} 类 · ${bones} 骨币）—— 第 57 块`);
for (const r of rows) console.log(`  ['${r.hash}', ${bones}, '${name}'],`);
console.log('---- 给人看的码 ----');
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.code}`));
