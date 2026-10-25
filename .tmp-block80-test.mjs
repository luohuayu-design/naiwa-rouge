// 第 80 块契约（纯 Node，不起浏览器）：
//   A 并联体机制重做：minGap / 折线电弧 / 取消自转 / 原点补偿 / 分离力
//   B 文案：图鉴与新怪卡把「n 只连几条、多久咬一次、缝在哪」讲清楚
//   C 关卡表：真的有一回合是奇数（证明不必成对）
//   D 加载：预载并发 + 进关后预载下一关 + 进度带「3/5」
//   E 缓存：glb 带版本号 + SW 对带 ?v 的一律缓存优先
//   F 图鉴缩略图：arc.webp 真的存在（第 75 块漏出的图就是这个）
//   G 版本号：index.html 与所有 js 一致
// 跑法：node .tmp-block80-test.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { LEVELS_BY_ID, levelTypes } from './js/wave.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
function sec(t) { console.log('\n' + t); }

const enemySrc = readFileSync('js/enemy.js', 'utf8');
const codexSrc = readFileSync('js/codex.js', 'utf8');
const waveSrc = readFileSync('js/wave.js', 'utf8');
const mainSrc = readFileSync('js/main.js', 'utf8');
const swSrc = readFileSync('sw.js', 'utf8');
const htmlSrc = readFileSync('index.html', 'utf8');

// ============================================================
sec('一、assetUrl：版本号是「运行时自己读出来的」');
// ============================================================
const assetMod = await import('./js/assetUrl.js');
ok(typeof assetMod.withV === 'function', '导出 withV()');
ok(assetMod.ASSET_V === '', `裸 import 时 ASSET_V 为空串（退回旧行为，不崩）："${assetMod.ASSET_V}"`);
ok(assetMod.withV('assets/a.glb') === 'assets/a.glb', '没有版本号时原样返回');
// 带 ?v 的 import 才会拿到版本（用查询串模拟 index.html 的写法）
const vmod = await import('./js/assetUrl.js?v=42');
ok(vmod.ASSET_V === '42', `带 ?v=42 import 时 ASSET_V = "${vmod.ASSET_V}"`);
ok(vmod.withV('assets/a.glb') === 'assets/a.glb?v=42', '拼出 assets/a.glb?v=42', vmod.withV('assets/a.glb'));
ok(vmod.withV('a.glb?v=7') === 'a.glb?v=7', '已经带版本的不重复拼（正则判断，不按字面）');
ok(vmod.withV('a.glb?x=1') === 'a.glb?x=1&v=42', '已有其它参数时用 & 接', vmod.withV('a.glb?x=1'));

// ============================================================
sec('二、并联体：配置（间距 / 折线 / 不自转）');
// ============================================================
const cfgArc = enemySrc.match(/arc: \{\s*\n\s*name: '并联体'/);
ok(!!cfgArc, 'ENEMY_TYPES 里还是叫并联体');
ok(/minGap: 3\.0/.test(enemySrc), 'arc.minGap = 3.0（两两最小间距）');
ok(/segs: 4/.test(enemySrc) && /dots: 2/.test(enemySrc), '电弧折 4 段 + 2 个流光（实机调参后的值）');
ok(/jitter: 0\.10/.test(enemySrc), '折线横向抖动 0.10');
ok(/width: 0\.145/.test(enemySrc), '线宽 0.145（0.075 在实机里细得看不见）');
ok(/SphereGeometry/.test(enemySrc), '实例几何是球（方块段接头一粗一细，像一串珠子）');
ok(/sway: 0\.16/.test(enemySrc), 'sway 0.16（左右机械摆动）');
ok(!/spin: 0\.8/.test(enemySrc), '整圈自转的配置已经删掉');
ok(!/e\.t \* e\.cfg\.spin/.test(enemySrc), '代码里不再有「t × spin」的自转');
ok(/previewHover: false/.test(enemySrc), '图鉴里不抬 hover（原点在底部）');

// ============================================================
sec('三、并联体：电弧渲染与分离力');
// ============================================================
ok(/new THREE\.InstancedMesh\(arcGeo, mat, instCount\)/.test(enemySrc),
  '一条电弧 = 一个 InstancedMesh（段 + 流光共 1 个 draw call）');
ok(/setFromUnitVectors\(ARC_Z, _arcD\)/.test(enemySrc), '每段用四元数对齐方向（折线才立得住）');
ok(/function separateArcs\(nodes, dt\)/.test(enemySrc), '有独立的分离函数');
ok(/a\.pos\.x -= dx \* push; a\.pos\.z -= dz \* push;/.test(enemySrc), '两只都在被推（不是只推一只）');
ok(/const gap = nodes\[0\]\.cfg\.arc\.minGap/.test(enemySrc), '间距取自配置，不写死');
ok(/separateArcs\(nodes, dt\);/.test(enemySrc), 'updateArcNet 每帧先分离再画线');

// 原点补偿：静态网格才量，且用 pivot 承担旋转
ok(/if \(!gltf\.animations\.length\)/.test(enemySrc), '只对静态网格量原点偏移（蒙皮包围盒不可信）');
ok(/pivot = new THREE\.Group\(\);/.test(enemySrc), '偏移用一层 pivot 承担（T×R×S 顺序才不会绕远点转）');
ok(/e\.modelPivot = pivot !== model \? pivot : null;/.test(enemySrc), 'pivot 挂在实例上，sway 转它');
ok(/const rig = e\.modelPivot \|\| e\.model;/.test(enemySrc), 'sway 有 fallback（没 pivot 的怪照旧）');

// 每只怪都还在
ok(/wellfrog: \{/.test(enemySrc) && /woodfish: \{/.test(enemySrc), '井蛙 / 木鱼灵没被动到');

// ============================================================
sec('四、文案：机制要讲清楚（用户：「介绍不清晰」）');
// ============================================================
ok(/if \(cfg\.arc\) return '区域压力/.test(codexSrc), 'enemyDesc 里有 arc 专属分支');
const arcDesc = (codexSrc.match(/if \(cfg\.arc\) return '([^']+)'/) || [, ''])[1];
console.log('    [' + arcDesc.length + ' 字] ' + arcDesc.slice(0, 60) + '…');
ok(arcDesc.includes('0.7 秒'), '说清伤害间隔（0.7 秒）', '');
ok(arcDesc.includes('3 格'), '说清它们之间保持 3 格');
ok(/2 只 1 条/.test(arcDesc) && /3 只 3 条/.test(arcDesc) && /4 只 6 条/.test(arcDesc),
  '把 n 只连几条列出来（不用自己算组合数）');
ok(arcDesc.includes('不用成对'), '明说不必成对出现');
ok(arcDesc.includes('拆掉一只'), '给出解法（拆一只断一片）');
ok(/电弧 1 伤 \/ 次/.test(codexSrc), '数值行补了「电弧 1 伤 / 次」');
ok(!/\*\*/.test(arcDesc), '文案里没有 markdown 星号（textContent 不认）');

// ============================================================
sec('五、关卡表：奇数也成立（不必成对）');
// ============================================================
const arcCounts = LEVELS_BY_ID[6].rounds.map((r) => r.arc || 0);
const oddRounds = arcCounts.filter((n) => n % 2 === 1).length;
ok(oddRounds >= 1, `第六关有 ${oddRounds} 个回合是奇数只（第 80 块特意放了一组 3 只）`);
ok(Math.max(...arcCounts) <= 4, `单回合最多 ${Math.max(...arcCounts)} 只（再多是封场，不是难度）`);
ok(levelTypes(LEVELS_BY_ID[6]).includes('arc'), '第六关的预载表里有 arc');
ok(/两只之间就拉着一条电弧/.test(waveSrc), '回合提示改成了「两只之间就连」（不再暗示成对）');

// ============================================================
sec('六、加载：并发 + 预载下一关 + 看得见的进度');
// ============================================================
ok(/await Promise\.all\(Array\.from\(\{ length: limit \}, worker\)\)/.test(enemySrc),
  'preload 用 N 路并发（原来是 for + await 串行）');
ok(/catch \(err\) \{\s*\n\s*console\.warn\('\[怪物\] 模型加载失败（跳过这一只）/.test(enemySrc),
  '单只失败不连坐（以前一 reject 整关都进不去）');
ok(/opts\.limit/.test(enemySrc), 'preload 支持 limit（预载用 2，不跟战斗抢主线程）');
ok(/function prefetchNextLevel\(\)/.test(mainSrc), '有 prefetchNextLevel()');
ok(/schedulePrefetch\(\);/.test(mainSrc), 'startPlay 里排了预载');
ok(/enemies\.preload\(need, null, \{ limit: 2 \}\)/.test(mainSrc), '预载走 limit: 2（静默失败）');
ok(/const label = \(n\) => `正在进入\$\{short\} · \$\{n\}\/\$\{need\.length\}`/.test(mainSrc),
  '进关遮罩写「第几个 / 共几个」');
ok(/mtImg\.onerror = \(\) => \{ mtImg\.hidden = true; \}/.test(mainSrc),
  '新怪卡图片 404 时自动隐藏（不显示碎图）');

// ============================================================
sec('七、缓存：glb 带版本号 + SW 缓存优先');
// ============================================================
ok(/loadAsync\(withV\(cfg\.file\)\)/.test(enemySrc), '怪物 glb 走 withV');
ok(/loadFrog\(withV\('assets\/rigged\.glb'\)/.test(mainSrc), '主角 glb 走 withV');
ok(/import \{ withV \} from '\.\/assetUrl\.js\?v=\d+'/.test(readFileSync('js/weapon.js', 'utf8')),
  '武器 glb 走 withV');
ok(/import \{ withV \} from '\.\/assetUrl\.js\?v=\d+'/.test(readFileSync('js/turret.js', 'utf8')),
  '炮台 glb 走 withV');
ok(/import \{ withV \} from '\.\/assetUrl\.js\?v=\d+'/.test(readFileSync('js/relics.js', 'utf8')),
  '地刺 glb 走 withV');
ok(/if \(immutable\) return cacheFirst\(event, cache\);/.test(swSrc),
  'SW：带 ?v 的一律缓存优先（原来只放 js/css，glb 每次在后台重下 7MB）');
ok(!/isCode && immutable/.test(swSrc), '旧的 isCode 限制已经去掉');

// ============================================================
sec('八、图鉴缩略图：arc.webp 真的在');
// ============================================================
const arcThumb = 'assets/codex/arc.webp';
ok(existsSync(arcThumb), `${arcThumb} 存在（第 75 块就是漏了它，卡上是个碎图）`);
if (existsSync(arcThumb)) {
  const kb = statSync(arcThumb).size / 1024;
  ok(kb > 1.5, `体积 ${kb.toFixed(1)}KB（太小的多半是一张空图）`);
}

// ============================================================
sec('九、版本号：index.html 与所有 js 完全一致');
// ============================================================
const V = (htmlSrc.match(/\?v=(\d+)/) || [, '1'])[1];
ok(Number(V) >= 91, `index.html 是 v=${V}（≥ 91 即可，别写死版本号）`);
const fs2 = await import('node:fs');
const jsFiles = fs2.readdirSync('js').filter((f) => f.endsWith('.js'));
let bad = [];
for (const f of jsFiles) {
  const src = fs2.readFileSync('js/' + f, 'utf8');
  const hits = src.match(/\?v=(\d+)/g) || [];
  for (const h of hits) if (h !== '?v=' + V) bad.push(f + ': ' + h);
}
ok(bad.length === 0, `js/ 里所有 ?v= 都是 v=${V}`, bad.slice(0, 4).join(', '));
ok(!/\?v=\d/.test(swSrc), 'sw.js 里没有写死版本号（它不参与 ?v 体系）');

console.log('\n' + '─'.repeat(56));
if (fail) {
  console.log(`第 80 块契约：${pass} 通过 / ${fail} 失败`);
  console.log('失败项：\n  ' + fails.join('\n  '));
  process.exitCode = 1;
} else {
  console.log(`第 80 块契约全绿：${pass} 通过 / 0 失败`);
}
