// 礼包码生成器（一次性工具，不参与线上运行）
// 产出：明文码（只交给用户）+ 16 位十六进制哈希（写进 js/gift.js）
const AB = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // 去掉 0O1IL 等易混字符

function h32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function codeHash(norm) {
  const a = h32(norm, 0x811c9dc5);
  const b = h32('#naiwa#' + norm + '#gift#', 0x01000193);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
function randCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += AB[Math.floor(Math.random() * AB.length)];
  return s;
}

const out = { A: [], B: [] };
for (const tier of ['A', 'B']) {
  const seen = new Set();
  while (out[tier].length < 10) {
    const body = randCode();
    if (seen.has(body)) continue;
    seen.add(body);
    const plain = `N${tier}-${body.slice(0, 4)}-${body.slice(4)}`;
    out[tier].push({ plain, hash: codeHash(plain.replace(/[^A-Z0-9]/g, '')) });
  }
}

for (const tier of ['A', 'B']) {
  console.log(`--- ${tier} 类（${tier === 'A' ? 300 : 100} 骨币）---`);
  for (const g of out[tier]) console.log(`${g.plain}   ${g.hash}`);
}

console.log('\n=== 直接可粘进 gift.js 的数组 ===');
const rows = [];
for (const tier of ['A', 'B']) {
  for (const g of out[tier]) rows.push(`  ['${g.hash}', ${tier === 'A' ? 300 : 100}],`);
}
console.log(rows.join('\n'));
