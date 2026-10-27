// 第 101 块契约（纯 Node，不起浏览器）
// 用户：新加一个兑换码，名叫「建群大典」，兑换 888 骨币，码是用户手写的那串。
//   · 码面是 11 个字母 + 三段横杠的手写短码，归一化后 11 个字母
//   · 888 骨币、组名「建群大典」，一码一机一次（沿用 gift.js 那套本机档案）
//   · 这是**第一枚手写短码**：不满足 NA-XXXX-XXXX 的形状，所以顺带钉死两件事 ——
//     归一化只认字母数字（分段横杠必须吃掉）、lookupGift 的 6 字下限不能挡到它
// ⚠️ 明文码不写进本文件（.tmp-* 是被 git 跟踪的）：从 gitignore 的 gift-codes.local.md 读，
//    仓库里只留哈希。这是第 44 块就定下的约定。
// 跑法：node .tmp-block101-test.mjs（cwd = naiwa-rouge）
import { readFileSync, readdirSync } from 'node:fs';
import { lookupGift, giftByHash, normalizeCode, codeHash, GIFT_COUNT } from './js/gift.js';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const htmlSrc = read('./index.html');
const giftSrc = read('./js/gift.js');
const VER = (htmlSrc.match(/js\/main\.js\?v=(\d+)/) || [, ''])[1];

// 明文从本地留档取（888 面额那一行）
const LOCAL = read('./gift-codes.local.md');
const CODE = (LOCAL.match(/\|\s*\d+\s*\|\s*`([A-Z][A-Z0-9-]{6,})`\s*\|\s*888\s*\|/) || [, ''])[1];
const HASH = 'f7f82dee9e4e126e';
// 归一化形式本身也是能直接兑换的码，所以同样不能写死 —— 由 CODE 派生（只去掉横杠）
const NORM = CODE.replace(/-/g, '');

// ============================================================
sec('① 码面与哈希');
// ============================================================
ok(!!CODE, '从本地留档里读到了 888 那枚码', CODE || '没读到');
ok((CODE.match(/-/g) || []).length === 3, '码面是三段横杠的 11 字手写码', CODE);
ok(normalizeCode(CODE) === NORM, '归一化后 = ' + NORM, normalizeCode(CODE));
ok(normalizeCode(CODE).length === 11, '归一化长度 11（> lookupGift 的 6 字下限）');
ok(codeHash(normalizeCode(CODE)) === HASH, '哈希 = ' + HASH, codeHash(normalizeCode(CODE)));
ok(new RegExp('\\[\\s*\'' + HASH + '\'\\s*,\\s*888\\s*,\\s*\'建群大典\'\\s*\\]').test(giftSrc),
  '码表里有 [哈希, 888, 建群大典] 这一行');

// ============================================================
sec('② 认得出来，而且面额 / 组名都对');
// ============================================================
const hit = lookupGift(CODE);
ok(!!hit, 'lookupGift 命中（不是 null）');
ok(hit && hit.bones === 888, '骨币 = 888', hit && String(hit.bones));
ok(hit && hit.name === '建群大典', '组名 = 建群大典（提示词会显示它，而不是「A 类礼包」）', hit && hit.name);
ok(hit && hit.hash === HASH, '返回的哈希与表里那条一致');
const back = giftByHash(HASH);
ok(back.bones === 888 && back.name === '建群大典', 'giftByHash 反查（已兑换列表走这条路）也对', JSON.stringify(back));

// ============================================================
sec('③ 手抄容错：大小写 / 空格 / 横杠怎么写都同一个码');
// ============================================================
const bare = CODE.replace(/-/g, '');
const variants = [
  CODE,
  CODE.toLowerCase(),
  CODE.split('-').join(' '),
  bare,
  bare.toLowerCase(),
  '  ' + CODE.replace(/-/g, '--') + '  ',
  CODE.replace(/-/g, '_'),
  CODE.replace(/-/g, '－'),      // 全角横杠
];
for (const v of variants) {
  const h = lookupGift(v);
  ok(h && h.hash === HASH && h.bones === 888, `「${v}」命同一条`, h ? h.hash : 'null');
}
// 差一个字母就认不出（防「模糊匹配」式的错实现）
ok(lookupGift(bare.slice(0, -1) + 'Z') === null, '改掉最后一个字母就认不出');

// ============================================================
sec('④ 与老码互不干扰');
// ============================================================
ok(GIFT_COUNT === 51, '码表共 51 条（40 老码 + 10 夜行礼包 + 1 建群大典）', String(GIFT_COUNT));
{
  const rows = [...giftSrc.matchAll(/\[\s*'([0-9a-f]{16})'\s*,\s*(\d+)(?:\s*,\s*'([^']*)')?\s*\]/g)];
  const hashes = rows.map((r) => r[1]);
  ok(rows.length === 51, '源码里能数出 51 条表项', String(rows.length));
  ok(new Set(hashes).size === hashes.length, '51 条哈希互不相同（没有碰撞）', `${new Set(hashes).size}/${hashes.length}`);
  const n888 = rows.filter((r) => r[2] === '888').length;
  ok(n888 === 1, '888 面额只有这一条', String(n888));
  ok(!new RegExp('\\[\\s*\'' + HASH + '\'\\s*,\\s*(?!888)\\d+').test(giftSrc), '这条哈希没被别处复用成别面额');
}

// ============================================================
sec('⑤ 源码里不许出现明文码（哈希才进仓库）');
// ============================================================
{
  // 明文码是「给玩家的东西」，只该出现在 gitignore 掉的本地留档里；
  // 仓库里只允许哈希 —— 注释里顺手写一句「码面是 XXX」也算泄露。
  const plain = new RegExp(NORM + '|' + NORM.split('').join('[\\s\\-_]*'), 'i');
  const jsFiles = readdirSync(new URL('./js/', import.meta.url)).filter((f) => f.endsWith('.js'));
  const leaked = jsFiles.filter((f) => plain.test(read('./js/' + f)));
  ok(leaked.length === 0, 'js/ 下没有任何形式的明文码（含注释、含带杠写法）', leaked.join(','));
  ok(!plain.test(htmlSrc), 'index.html 里也没有明文码');
  ok(!plain.test(read('./README.md')), 'README 里也没有明文码');
  ok(!plain.test(read('./.tmp-block101-test.mjs')), '本测试文件自己不写明文');
  ok(!plain.test(read('./.tmp-101-cdp.js')), 'CDP 套件里也不写明文');
  // 反向：本地留档里必须有，不然码就丢了
  ok(LOCAL.toUpperCase().includes(NORM), 'gift-codes.local.md（gitignore）里有留档');
}

// ============================================================
sec('⑥ 版本号：全站同一版（从 index.html 读，不写死）');
// ============================================================
ok(/^\d+$/.test(VER), 'index.html 里读得到 main.js?v=N', VER);
{
  const bad = [];
  for (const f of readdirSync(new URL('./js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const src = read('./js/' + f);
    for (const m of src.matchAll(/from\s+'\.\/[a-zA-Z0-9_.-]+\.js\?v=(\d+)'/g)) {
      if (m[1] !== VER) bad.push(`${f}:${m[1]}`);
    }
  }
  ok(bad.length === 0, `js/ 里的 import 版本号全是 v=${VER}`, bad.join(','));
  const htmlVers = [...htmlSrc.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  ok(htmlVers.every((v) => v === VER), `index.html 的 ${htmlVers.length} 处版本号统一`, [...new Set(htmlVers)].join(','));
}

console.log(`\n通过 ${pass} / ${pass + fail}`);
if (fails.length) { console.log('失败项：\n  ' + fails.join('\n  ')); process.exitCode = 1; }
