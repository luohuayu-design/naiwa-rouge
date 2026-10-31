// ============================================================
// 第 126 块契约：照影（mirror）换成主角同款模型 + 紫色贴图
//
// 用户原话：「把模仿者的 3D 模型换成和主角一样，只不过把黄色换成紫色」
//   → 照影 = 主角的 rigged.glb **几何一字不改**，只把 baseColor 贴图里
//     的黄/米白换成中紫/淡紫，存成独立的 assets/monsters/mirror-frog.glb。
//
// 这份测试盯的是「换模型」最容易漏的几件事：
//   ① 文件真的换了、旧的四足蛙没留在盘上；
//   ② 缩放换算对（量化 glb 的世界高 ≠ 肉眼看的身高，算错就差一倍）；
//   ③ 主角模型一个字节都没被动过（复制出来的东西不该污染原件）；
//   ④ 贴图**真的是紫的**（不是忘了换、也不是换成粉色）；
//   ⑤ 静态单网格的「活着」有兜底（bounce 分支在，别变成一块滑行的贴图）。
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require('sharp');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra != null ? `  [${extra}]` : '')); }
  else { fail++; fails.push(name + (extra != null ? `  [${extra}]` : '')); console.log('  ✗ ' + name + (extra != null ? `  [${extra}]` : '')); }
}
function sec(t) { console.log('\n' + t); }

// ---------------- glb 解析（只读 JSON chunk + 第一张图） ----------------
function readGlb(p) {
  const b = fs.readFileSync(p);
  if (b.slice(0, 4).toString() !== 'glTF') return null;
  let off = 12, js = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const chunk = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) js = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004E4942) bin = chunk;
    off += 8 + len;
  }
  return { js, bin };
}
function baseColorTex(glb) {
  const js = glb.js;
  const tex = js.textures[js.materials[0].pbrMetallicRoughness.baseColorTexture.index];
  let img = tex.source;
  if (img == null) img = tex.extensions.EXT_texture_webp.source;
  const bv = js.bufferViews[js.images[img].bufferView];
  return glb.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
}

// ---------------- 读源码 ----------------
const enemySrc = fs.readFileSync(path.join(ROOT, 'js/enemy.js'), 'utf8');
const frogSrc = fs.readFileSync(path.join(ROOT, 'js/frog.js'), 'utf8');
const MIRROR_SRC = enemySrc.slice(
  enemySrc.indexOf('  mirror: {'),
  enemySrc.indexOf('  addressee: {'),
);

const MIR = (await import('./js/enemy.js?v=' + (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/\?v=(\d+)/) || [, '1'])[1])).ENEMY_TYPES.mirror;

// ============================================================
sec('一、换的是哪个文件');
ok(!!MIR, 'mirror 还在 ENEMY_TYPES 里');
ok(MIR.file === 'assets/monsters/mirror-frog.glb', 'file 指向新的紫色模型', MIR.file);
ok(fs.existsSync(path.join(ROOT, MIR.file)), '新模型真的在盘上');
ok(!fs.existsSync(path.join(ROOT, 'assets/monsters/reflect-frog.glb')),
  '旧的四足蛙 reflect-frog.glb 已删除（不留孤儿资产）');
ok(!fs.existsSync(path.join(ROOT, 'assets/monsters/goleling.glb')),
  '更早的 goleling.glb 也没回来');

// ============================================================
sec('二、和主角是同一个模型（几何不变，只换配色）');
const mainGlb = readGlb(path.join(ROOT, 'assets/rigged.glb'));
const mirGlb = readGlb(path.join(ROOT, 'assets/monsters/mirror-frog.glb'));
ok(!!mainGlb && !!mirGlb, '两个 glb 都能解析');
const mainPos = mainGlb.js.accessors[mainGlb.js.meshes[0].primitives[0].attributes.POSITION];
const mirPos = mirGlb.js.accessors[mirGlb.js.meshes[0].primitives[0].attributes.POSITION];
ok(mainPos.count === mirPos.count, '顶点数和主角完全一致', `${mirPos.count} vs ${mainPos.count}`);
ok(JSON.stringify(mainPos.min) === JSON.stringify(mirPos.min)
  && JSON.stringify(mainPos.max) === JSON.stringify(mirPos.max), '包围盒一字不差（没被重新导出缩放）');
ok(mirGlb.js.animations == null || mirGlb.js.animations.length === 0, '新模型 0 段动画（静态单网格）');
ok((mirGlb.js.skins || []).length === 0, '新模型没有骨骼（frog.js 那套 7 骨是它自己造的）');

// 主角原件不许被动
const mainSize = fs.statSync(path.join(ROOT, 'assets/rigged.glb')).size;
ok(mainSize === 719360, '主角 rigged.glb 没被改动（719360 字节）', String(mainSize));

// ============================================================
sec('三、缩放换算（量化模型的坑）');
// KHR_mesh_quantization：POSITION 是 normalized short，满量程 32767
ok(mirGlb.js.extensionsUsed.includes('KHR_mesh_quantization'), '模型用的是量化顶点（normalized short）');
const nodeScale = mirGlb.js.nodes[0].scale[2];
const worldH = (mirPos.max[2] - mirPos.min[2]) / 32767 * nodeScale;   // z 轴 → rotX90 后变 y
ok(Math.abs(worldH - 1.0784) < 0.001, '按量化 + node scale 算出的世界高 = 1.0784', worldH.toFixed(4));
ok(Math.abs(MIR.sourceHeight - 1.0784) < 0.001,
  'cfg.sourceHeight 就是这个世界高（不能拿旧四足蛙的 1.30 凑）', MIR.sourceHeight);
ok(MIR.footY === 0, 'footY = 0（node 的 translation.y 已把脚底抬平）', MIR.footY);

const TARGET_H = Number((frogSrc.match(/TARGET_H:\s*([\d.]+)/) || [, 0])[1]);
ok(TARGET_H === 2.28, '主角 frog.js 的 TARGET_H = 2.28', TARGET_H);
ok(MIR.height === TARGET_H, '照影 height = 主角的 TARGET_H（**一样大**）', MIR.height);
ok(MIR.radius === 0.6, '碰撞半径 0.60（比主角 BODY_R 0.65 略窄）', MIR.radius);

// ============================================================
sec('四、配色真的是紫的');
const mirTex = baseColorTex(mirGlb);
ok(mirTex.length > 3000, '新模型的 baseColor 贴图有内容', `${(mirTex.length / 1024).toFixed(1)}KB`);
const { data: px, info: pi } = await sharp(mirTex).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let sr = 0, sg = 0, sb = 0, n = 0, purple = 0;
for (let i = 0; i < pi.width * pi.height; i++) {
  const o = i * 3, r = px[o], g = px[o + 1], b = px[o + 2];
  sr += r; sg += g; sb += b; n++;
  // 紫色判据：蓝 > 红 > 绿（黄/米白是红 > 绿 > 蓝）
  if (b > r + 12 && r > g + 4) purple++;
}
const ar = sr / n, ag = sg / n, ab = sb / n;
ok(ab > ar && ar > ag, `贴图平均色是紫（B>R>G）`, `R${ar.toFixed(0)} G${ag.toFixed(0)} B${ab.toFixed(0)}`);
ok(purple / n > 0.55, '过半像素落在紫色区（不是只染了一小块）', `${(purple / n * 100).toFixed(1)}%`);

const mainTex = baseColorTex(mainGlb);
const { data: mp, info: mi } = await sharp(mainTex).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let mr = 0, mg = 0, mb = 0;
for (let i = 0; i < mi.width * mi.height; i++) { mr += mp[i * 3]; mg += mp[i * 3 + 1]; mb += mp[i * 3 + 2]; }
const mn = mi.width * mi.height;
ok(mr / mn > mb / mn, '主角的贴图还是黄的（红 > 蓝，原件没被染）',
  `R${(mr / mn).toFixed(0)} G${(mg / mn).toFixed(0)} B${(mb / mn).toFixed(0)}`);

// ============================================================
sec('五、cfg 的其它字段');
// ⚠️ 查的是**字段本身**（行首 animFamily:），不是随便出现这个词 ——
// 上面那段注释里还写着「没有 animFamily」呢。
ok(!/^\s*animFamily:/m.test(MIRROR_SRC), '照影不再挂 animFamily（静态模型放不了 clip）');
ok(!/^\s*tint:/m.test(MIRROR_SRC), '不写 tint（会把紫色贴图冲淡）');
ok(MIR.phantom === 0.8, 'phantom 0.80（还是水影，但太透会露出背面内壁）', MIR.phantom);
const mc = MIR.color;
const cr = (mc >> 16) & 255, cg = (mc >> 8) & 255, cb = mc & 255;
ok(cb > cr && cr > cg, 'color 也是紫（落点圈/血条这类非贴图元素用）',
  '#' + mc.toString(16).padStart(6, '0'));
ok(!!MIR.glow && ((MIR.glow.color & 255) > ((MIR.glow.color >> 8) & 255)),
  'glow 从冷青改成紫（原来的 0x2a6a88 是井水色）',
  '#' + (MIR.glow ? MIR.glow.color.toString(16) : '?'));
ok(!!MIR.anim && typeof MIR.anim === 'object',
  'anim 仍留一个对象（状态机会读 cfg.anim.idle，别让它 undefined）');

// ============================================================
sec('六、静态模型的「活着」兜底');
ok(!!MIR.bounce, '有 bounce 字段', JSON.stringify(MIR.bounce));
ok(MIR.bounce && MIR.bounce.amp > 0 && MIR.bounce.hz > 0, 'bounce 的幅度/频率都是正数');
ok(/else if \(e\.cfg\.bounce && e\.state !== 'dead' && e\.state !== 'dying'\)/.test(enemySrc),
  'updateOne 里有 bounce 分支，且避开 dead/dying（不然会跟死亡下沉打架）');
const bounceBlock = enemySrc.slice(enemySrc.indexOf("else if (e.cfg.bounce"),
  enemySrc.indexOf("else if (e.cfg.bounce") + 900);
ok(/Math\.abs\(Math\.sin\(ph\)\)/.test(bounceBlock),
  '用 |sin| 而不是 sin（正弦负半周会把模型压到地面以下）');
ok(/rig\.rotation\.x = Math\.sin\(ph \* 2\)/.test(bounceBlock), '腾空时点头（静态网格才像蹬地）');
ok(!/rig\.rotation\.y/.test(bounceBlock), '不碰 rotation.y（朝向归 root 管）');

// 只有照影吃这套：别的怪写了 bounce 就是手滑
const bounceOwners = Object.entries(
  (await import('./js/enemy.js?v=' + (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/\?v=(\d+)/) || [, '1'])[1])).ENEMY_TYPES,
).filter(([, c]) => c.bounce).map(([k]) => k);
ok(bounceOwners.length === 1 && bounceOwners[0] === 'mirror',
  'bounce 只有照影在用', bounceOwners.join(','));

// ============================================================
sec('七、图鉴与残留');
const codexPath = path.join(ROOT, 'assets/codex/mirror.webp');
ok(fs.existsSync(codexPath), '图鉴缩略图 mirror.webp 在');
const codexMeta = await sharp(codexPath).metadata();
ok(codexMeta.width > 100 && codexMeta.height > 100, '图鉴尺寸正常',
  `${codexMeta.width}×${codexMeta.height}`);
const { data: cx } = await sharp(codexPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let cr2 = 0, cg2 = 0, cb2 = 0;
for (let i = 0; i < codexMeta.width * codexMeta.height; i++) {
  // 只看中间区域（避开白底和投影）
  const x = i % codexMeta.width, y = Math.floor(i / codexMeta.width);
  if (x < codexMeta.width * 0.3 || x > codexMeta.width * 0.7) continue;
  if (y < codexMeta.height * 0.25 || y > codexMeta.height * 0.75) continue;
  cr2 += cx[i * 3]; cg2 += cx[i * 3 + 1]; cb2 += cx[i * 3 + 2];
}
ok(cb2 > cr2 && cr2 > cg2, '图鉴缩略图本体是紫的（已经重出过）',
  `R${(cr2 / 1).toFixed(0)} G${(cg2 / 1).toFixed(0)} B${(cb2 / 1).toFixed(0)}`);

ok(!/^\s*frogbeast\s*:/m.test(enemySrc), 'CLIP_FAMILIES 里的 frogbeast 族已删（只服务过照影）');
ok(fs.readdirSync(path.join(ROOT, 'assets/monsters')).filter((f) => f.endsWith('.glb')).length === 35,
  '怪物 glb 共 35 个（第 129 块的 paper-scrap / picture-frame 是新文件，不是换文件）');

// ============================================================
console.log('\n' + '='.repeat(52));
console.log(`第 126 块契约：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('失败清单：'); fails.forEach((f) => console.log('  ✗ ' + f)); }
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
