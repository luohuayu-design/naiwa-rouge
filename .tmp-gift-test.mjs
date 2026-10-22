// 礼包兑换 · Node 层回归（第 44 块）
// 明文码从 gift-codes.local.md 读（该文件被 .gitignore 排除，不进仓库）。
// 注意：本文件里**不许出现真码**，示例一律用假串，否则等于把码交出去。
// 本测试只验「哈希 / 归一化 / 查表」这一层；界面链路看 .tmp-block44-cdp.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupGift, giftByHash, normalizeCode, codeHash, GIFT_COUNT } from './js/gift.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = path.join(HERE, 'gift-codes.local.md');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')); }
}

console.log('礼包兑换 · Node 回归\n');

// ---- 1. 码表规模 ----
console.log('[1] 码表规模');
ok('共 20 个礼包码', GIFT_COUNT === 20, String(GIFT_COUNT));

// ---- 2. 归一化（拿假串验规则）----
console.log('\n[2] 归一化（大小写 / 横杠 / 空格都吃掉）');
ok('小写去杠等价', normalizeCode('zz abcd 2345') === normalizeCode('ZZ-ABCD-2345'));
ok('全角横杠也吃掉', normalizeCode(' zz－abcd－2345 ') === 'ZZABCD2345', normalizeCode(' zz－abcd－2345 '));
ok('空值不炸', normalizeCode(null) === '' && normalizeCode(undefined) === '');

// ---- 3. 哈希稳定性 ----
console.log('\n[3] 哈希稳定性');
const h1 = codeHash(normalizeCode('ZZ-ABCD-2345'));
const h2 = codeHash('ZZABCD2345');
ok('同一码不同写法 → 同哈希', h1 === h2, h1 + ' / ' + h2);
ok('哈希是 16 位十六进制', /^[0-9a-f]{16}$/.test(h1), h1);
ok('差一个字符就换哈希', codeHash('ZZABCD2345') !== codeHash('ZZABCD2346'));

// ---- 4. 真码全查得出来 ----
console.log('\n[4] 明文码逐个查表');
if (!fs.existsSync(LOCAL)) {
  ok('gift-codes.local.md 存在（缺了没法验真码）', false, LOCAL);
} else {
  const txt = fs.readFileSync(LOCAL, 'utf8');
  // 只认表格行（| 1 | `NA-XXXX-XXXX` |），免得把说明文字里的示例码算进来
  const rows = [...txt.matchAll(/^\|\s*\d+\s*\|\s*`(N[AB]-[A-Z0-9]{4}-[A-Z0-9]{4})`/gm)].map((m) => m[1]);
  ok('本地档里读到 20 个码', rows.length === 20, String(rows.length));
  const aCodes = rows.filter((c) => c.startsWith('NA-'));
  const bCodes = rows.filter((c) => c.startsWith('NB-'));
  ok('A 类 10 个', aCodes.length === 10, String(aCodes.length));
  ok('B 类 10 个', bCodes.length === 10, String(bCodes.length));

  let aAll = true, bAll = true, altAll = true;
  const hashes = new Set();
  for (const c of rows) {
    const hit = lookupGift(c);
    if (!hit) { if (c.startsWith('NA-')) aAll = false; else bAll = false; continue; }
    hashes.add(hit.hash);
    if (c.startsWith('NA-') && (hit.bones !== 300 || hit.tier !== 'A')) aAll = false;
    if (c.startsWith('NB-') && (hit.bones !== 100 || hit.tier !== 'B')) bAll = false;
    const alt = lookupGift('  ' + c.replace(/-/g, ' ').toLowerCase() + ' ');
    if (!alt || alt.hash !== hit.hash) altAll = false;   // 换写法也得查得出来
  }
  ok('A 类全部 → 300 骨币 / tier A', aAll);
  ok('B 类全部 → 100 骨币 / tier B', bAll);
  ok('20 个码哈希互不相同（无碰撞）', hashes.size === 20, String(hashes.size));
  ok('每个码换写法仍可查', altAll);

  // ---- 5. giftByHash 反查 ----
  console.log('\n[5] 已兑换列表用的反查');
  const sample = lookupGift(rows[0]);
  ok('反查回同一个档位', giftByHash(sample.hash).bones === 300);
  ok('未知哈希退回「礼包」', giftByHash('ffffffffffffffff').tier === '?');
}

// ---- 6. 假码一律不认 ----
console.log('\n[6] 假码 / 残码不认');
const bad = [
  'ZZ-ABCD-2345', 'NA-0000-0000', 'NB-ZZZZ-ZZZZ', '', '   ', '123456',
  'HELLO-WORLD', 'null', 'undefined', 'ZZ-ABCD-23456',
];
let allBad = true;
for (const b of bad) {
  if (lookupGift(b)) { allBad = false; console.log('    误判：' + JSON.stringify(b)); }
}
ok('10 个假码全部拒绝', allBad);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
