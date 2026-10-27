import { codeHash, normalizeCode } from './js/gift.js';
const rows = [];
for (let i = 1; i <= 10; i++) {
  const code = 'FXYXGG' + String(i).padStart(2, '0');
  const norm = normalizeCode(code);
  rows.push(`  ['${codeHash(norm)}', 3000, '夜行礼包'],`);
}
console.log(rows.join('\n'));
console.log('---- 码 ----');
for (let i = 1; i <= 10; i++) console.log('FXYXGG' + String(i).padStart(2, '0'));
