// ============================================================
// .tmp-block52-test.mjs —— 第 52 块：13 只怪「一只一个模型」（纯 Node，无浏览器）
// 跑法：node .tmp-block52-test.mjs（cwd = naiwa-rouge）
//
// 这一套守四件事：
//   1. **零重复**：13 只怪 13 个 glb，谁也不许再共用骨架（这是本块的立项原因）；
//   2. **文件真在**：config 里写的路径必须真能读到，且是合法 glb；
//   3. **动作不错位**：clipOverrides 里每一条都得真的存在于那个模型里
//      （跨引擎动画名是手抄的，抄错就是「怪站在那不动」，肉眼很难发现）；
//   4. **关卡不断链**：wave.js 每个回合点名的 type 都得在 ENEMY_TYPES 里且已启用。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENEMY_TYPES } from './js/enemy.js';
import { LEVELS_BY_ID } from './js/wave.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const sec = (t) => console.log(`\n—— ${t} ——`);

// 读 glb 头里的 JSON chunk，拿骨架动画名（去掉 "CharacterArmature|" 前缀）
function glbClipNames(abs) {
  const buf = fs.readFileSync(abs);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 glb（magic 不对）');
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) {   // 'JSON'
      const json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
      return (json.animations || []).map((a) => String(a.name || '').split('|').pop());
    }
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return [];
}

const TYPES = Object.entries(ENEMY_TYPES).filter(([, t]) => !t.planned);
const typeNames = TYPES.map(([k]) => k);

// 第 71 块 +井蛙/木鱼灵 = 17 条；第 75 块 +并联体 = 18 条。
// 第 77 块起井蛙 / 木鱼灵各有自己的 glb（frog / puffer-fish），曾经是「一只一个文件」。
// 第 81 块（第八关 · 无名者 + 旗手）有意复用 skeleton-minion / skeleton-rogue：
// 这两只是「同一批骷髅里的普通一个和举牌的那个」，本来就该长一个样，
// 给它们各做一套新模型反而会让人以为是不同种族。
// 第 82 块称量官同理复用 hooded-scribe（第五关擦名者那只）：兜帽长袍 + 抱一本
// 台账就是「记账的」，第五关那身紫黑和第九关这身鎏金一眼能分开。
// 第 83 块：第八关那两只队形怪（ranker / bearer）整块删掉，换成寄存处看守 warden
// （自己的 deposit-warden.glb）→ 条目 21 → 20，文件 18 → 19。
// 第 97 块：称量官换成 Quaternius King（ledger-king.glb）+ 新增盖章人（stamp-goblin.glb）
//   → 条目 21，文件 21，**零复用**。
// 第 107 块：第十关 +mirror / addressee / waiter / echo → 条目 25；
//   收件人是**本作第一只没有 glb 的怪**（一张程序化的纸，enemy.js 的 cfg.proc 通道）
//   → 有模型的 24 条，零复用不变。
// 第 114 块：+誊录员 / 收账人（两只程序化怪）→ 27 条，有模型的 24 条
sec('一、27 只怪 · 零复用（有模型的每条一个独立模型）');
ok(TYPES.length === 27, `怪物条目 27 只（实际 ${TYPES.length}）`);   // 第 97 块 +stamper，第 107 块 +4，第 114 块 +2
const noModel = TYPES.filter(([, t]) => !t.file);
ok(noModel.length === 3 && noModel.map((x) => x[0]).sort().join() === 'addressee,clerk,collector',
  '三只程序化怪：收件人（纸）/ 誊录员（羽笔）/ 收账人（账簿）', noModel.map((x) => x[0]).join(','));
const files = TYPES.map(([, t]) => t.file).filter(Boolean);
ok(files.every((f) => typeof f === 'string' && f.startsWith('assets/monsters/')), '有模型的都写了 assets/monsters/ 下的路径');
const dupFiles = files.filter((f, i) => files.indexOf(f) !== i);
// 第 97 块起称量官也换了模型，历史上有意复用（无名者 / 旗手 / 称量官）已全部消除
const ALLOWED_DUP = new Set([]);
ok(dupFiles.every((f) => ALLOWED_DUP.has(f)) && new Set(files).size === 24,
  `${files.length} 条目 / ${new Set(files).size} 文件，零复用`,
  `重复：${dupFiles.join(', ')}`);
const names = TYPES.map(([, t]) => t.name);
ok(new Set(names).size === names.length, '20 个中文名互不重复');
// 第一关四只维持 KayKit 骷髅（用户定案：只换后 9 只）
for (const k of ['minion', 'warrior', 'archer', 'bowman']) {
  ok(ENEMY_TYPES[k].file.includes('skeleton-'), `${k} 仍是 KayKit 骷髅（${ENEMY_TYPES[k].file.split('/').pop()}）`);
}

sec('二、模型文件真的在，且是合法 glb');
for (const [k, t] of TYPES) {
  if (!t.file) continue;   // 第 107 块：收件人没有 glb
  const abs = path.join(ROOT, t.file);
  ok(fs.existsSync(abs), `${k} 文件存在（${t.file.split('/').pop()}）`);
  if (!fs.existsSync(abs)) continue;
  ok(fs.statSync(abs).size > 8 * 1024, `${k} 体积不像空壳（${(fs.statSync(abs).size / 1024).toFixed(0)}KB）`);
}

sec('三、动作名对得上（clipOverrides 不许抄错）');
const CLIP_KEYS = ['idle', 'walk', 'run', 'attack', 'cast', 'death', 'hit', 'spawn'];
for (const [k, t] of TYPES) {
  if (!t.file) continue;   // 第 107 块：收件人没有 glb
  const abs = path.join(ROOT, t.file);
  if (!fs.existsSync(abs)) continue;
  const clips = glbClipNames(abs);
  // 第 75 块：并联体（arc）用的是 Kenney 的静态网格，本来就没有骨骼动画，
  // 它的「活着」靠程序化悬停 + 电弧抖动（见 updateOne 的 cfg.spin 分支）。
  if (k === 'arc') {
    ok(clips.length === 0, `${k} 是静态模型（0 段动画，靠程序化浮空）`, String(clips.length));
  } else {
    ok(clips.length >= 3, `${k} 模型自带动画 ≥3 段（${clips.length} 段）`);
  }
  const overrides = t.clipOverrides || {};
  const badKeys = Object.keys(overrides).filter((x) => !CLIP_KEYS.includes(x));
  ok(badKeys.length === 0, `${k} clipOverrides 只用语义键`, `非法键：${badKeys.join(',')}`);
  const missing = Object.entries(overrides).filter(([, real]) => !clips.includes(real));
  ok(missing.length === 0, `${k} 覆盖的动作名都真存在`,
    `缺失：${missing.map(([sem, real]) => `${sem}→${real}`).join(', ')}（现有 ${clips.slice(0, 8).join('/')}…）`);
}

sec('四、身高 / 落地 / 自发光配置');
for (const [k, t] of TYPES) {
  ok(t.sourceHeight > 0 && t.height > 0, `${k} sourceHeight/height 已标定`);
  // 上限 3.5：第 53 块用户要求把咒面图腾放大到 ×1.8（2.52）、孢冠菌王放大到 ×2（3.24），
  // 所以「最矮 0.8、最高 2.2」这条当年的尺子得跟着松 —— 检查的是「别把模型缩成豆子或
  // 放大成天柱」，不是钉死具体数值。
  ok(t.height >= 0.8 && t.height <= 3.5, `${k} 归一后身高在 0.8~3.5（实际 ${t.height}）`);
  ok(t.radius > 0.2 && t.radius < 1.0, `${k} 碰撞半径合理（实际 ${t.radius}）`);
}
// 9 只换过模型的都给配了自发光（暗场景可见性靠它）
// 例外：盾斧兽人是亮绿色，本来就看得清，没配 glow。
const RENEWED = ['hexer', 'pyro', 'hierarch', 'charger', 'brood', 'wraith', 'leaper', 'mender'];
for (const k of RENEWED) {
  ok(ENEMY_TYPES[k].glow && ENEMY_TYPES[k].glow.intensity > 0, `${k} 带自发光`);
}
ok(!ENEMY_TYPES.shielder.glow, '盾斧兽人亮绿、不需要自发光（省一次着色开销）');
ok(ENEMY_TYPES.hexer.footY > 0 && ENEMY_TYPES.pyro.footY > 0 && ENEMY_TYPES.wraith.footY > 0,
  '浮空模型都留了 footY（不按到地上）');

sec('五、关卡表不断链');
const NON_TYPE_KEYS = ['tip', 'gap'];
const used = new Set();
for (const lv of Object.values(LEVELS_BY_ID)) {
  for (const r of lv.rounds) {
    for (const k of Object.keys(r)) {
      if (NON_TYPE_KEYS.includes(k)) continue;
      used.add(k);
    }
  }
}
const unknown = [...used].filter((k) => !ENEMY_TYPES[k]);
ok(unknown.length === 0, '每个回合点名的 type 都在 ENEMY_TYPES 里', `未知：${unknown.join(',')}`);
const notReady = [...used].filter((k) => ENEMY_TYPES[k] && ENEMY_TYPES[k].planned);
ok(notReady.length === 0, '点名的 type 都已启用（没有预案占位）', `未启用：${notReady.join(',')}`);
ok(used.size >= 13, `四关合起来用满 13 只（实际 ${used.size}）`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
