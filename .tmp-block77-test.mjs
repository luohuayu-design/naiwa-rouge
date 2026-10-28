// 第 77 块契约测试：井蛙 / 木鱼灵 换成真模型（CC0）
// 用户第 9 条：「井蛙和木鱼灵还没有自己的模型，你去找现成模型下载下来用」
// 跑法：`node .tmp-block77-test.mjs`
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ENEMY_TYPES } from './js/enemy.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};
const sec = (t) => console.log('\n' + t);

// ------------------------------------------------------------
// GLB 解析：只读 JSON chunk，够拿动画名 / 节点数
// ------------------------------------------------------------
function glbJson(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(file + ' 不是 GLB');
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) return JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  throw new Error(file + ' 找不到 JSON chunk');
}
const shortName = (n) => String(n).split('|').pop();

// ============================================================
sec('一、两只新模型文件都在，而且是真 GLB');
// ============================================================
const FROG = 'assets/monsters/frog.glb';
const PUFFER = 'assets/monsters/puffer-fish.glb';
ok(existsSync(FROG), '井蛙模型 assets/monsters/frog.glb 存在');
ok(existsSync(PUFFER), '木鱼灵模型 assets/monsters/puffer-fish.glb 存在');

const gFrog = glbJson(FROG);
const gPuffer = glbJson(PUFFER);
const aFrog = (gFrog.animations || []).map((a) => shortName(a.name));
const aPuffer = (gPuffer.animations || []).map((a) => shortName(a.name));

ok(aFrog.length >= 10, `青蛙自带 ${aFrog.length} 段动画（骨骼动画，不是静态网格）`, aFrog.join(','));
ok(aPuffer.length === 6, `河豚自带 ${aPuffer.length} 段动画`, aPuffer.join(','));
ok((gFrog.skins || []).length > 0 && (gPuffer.skins || []).length > 0, '两只都有蒙皮（skins 非空）');
ok((gFrog.meshes || []).length > 0 && (gPuffer.meshes || []).length > 0, '两只都有网格');

// 占位用的老模型不能被删掉：雾猎狼 / 咒面图腾还在用
ok(existsSync('assets/monsters/wolf.glb'), 'wolf.glb 还在（雾猎狼仍在用）');
ok(existsSync('assets/monsters/tribal.glb'), 'tribal.glb 还在（咒面图腾仍在用）');

// ============================================================
sec('二、配置：文件、身高、动画族、去掉占位换色');
// ============================================================
const wf = ENEMY_TYPES.wellfrog;
const wd = ENEMY_TYPES.woodfish;

ok(/frog\.glb$/.test(wf.file), '井蛙用 frog.glb（不再借 wolf.glb）', wf.file);
ok(/puffer-fish\.glb$/.test(wd.file), '木鱼灵用 puffer-fish.glb（不再借 tribal.glb）', wd.file);
ok(wf.tint === undefined, '井蛙不再压占位绿 tint');
ok(wd.tint === undefined, '木鱼灵不再压占位青 tint');

ok(wf.animFamily === 'humanoid', '井蛙用人形动画族（骨架就是 CharacterArmature）', wf.animFamily);
ok(wd.animFamily === 'fish', '木鱼灵用新增的鱼形动画族', wd.animFamily);
ok(!wd.clipOverrides, '木鱼灵的旧 clipOverrides（cast→Punch）已删——新模型没 Punch');

// 身高：不能还挂着 wolf / tribal 的旧值
ok(Math.abs(wf.sourceHeight - 2.50) < 0.01, `井蛙 sourceHeight 实测为 ${wf.sourceHeight}`);
ok(wf.sourceHeight !== 2.707, '井蛙不再复用 wolf 的 2.707');
ok(Math.abs(wd.sourceHeight - 2.656) < 0.01, `木鱼灵 sourceHeight 实测为 ${wd.sourceHeight}`);
ok(wd.sourceHeight !== 4.238, '木鱼灵不再复用 tribal 的 4.238');

// 落地 / 浮空
ok(wf.footY < 0, `井蛙脚底在原点下 ${wf.footY}，要抬回地面`);
ok(wd.footY === undefined, '木鱼灵不按脚落地（原点在身体正中，写 footY 会算错）');
ok(wd.hover > 0.8 && wd.hover < 1.6, `木鱼灵靠 hover=${wd.hover} 浮起来`);

// 数值 / 行为不许顺手改坏
// 第 82 块：井蛙 hp 5→8、舌头拖拽 pull 3.0→4.5（用户定：「改到 8，4.5」）
ok(wf.hp === 8 && wf.radius === 0.55, `井蛙血量 8（第 82 块从 5 提高），体积没动（实际 ${wf.hp}）`);
ok(wf.tongue && wf.tongue.hp === 4 && wf.tongue.pull === 4.5, `井蛙吐舌参数：舌头 4 血、每秒拉 4.5 格（第 82 块从 3 提高）`);
ok(wd.hp === 4, '木鱼灵血量没动');
// 第 82 块（用户）：木鱼灵原本整套复用咒面图腾的 hex 圈（读条→脚下圈→掉血+减速），
// 换成**追踪定身泡**：泡泡有独立血量、缓慢拐弯追人、命中把主角定住。
ok(!wd.spell, '木鱼灵不再用 spell 圈（那是咒面图腾的东西）');
ok(wd.bubble && wd.bubble.hp > 0 && wd.bubble.speed > 0 && wd.bubble.speed < 4.4,
  `木鱼灵改吐追踪泡：泡 ${wd.bubble && wd.bubble.hp} 血、速度 ${wd.bubble && wd.bubble.speed}（慢于主角 4.4，能甩掉）`);
ok(wd.bubble && wd.bubble.root > 0.8, `命中定住 ${wd.bubble && wd.bubble.root} 秒（比减速更狠）`);

// ============================================================
sec('三、动画族映射的每一段，模型里真的存在');
// ============================================================
// 这是最容易静默出错的地方：clip 名写错不会报错，只会退到 idle 站着不动。
const CLIP_FAMILIES = {
  humanoid: {
    idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Punch', cast: 'Weapon',
    death: 'Death', hit: 'HitReact', spawn: 'Idle',
  },
  fish: {
    idle: 'Swimming_Normal', walk: 'Swimming_Normal', run: 'Swimming_Fast',
    attack: 'Attack', cast: 'Attack', death: 'Death',
    hit: 'Swimming_Impulse', spawn: 'Swimming_Normal',
  },
};

for (const [type, cfg, have, label] of [
  ['wellfrog', wf, aFrog, '井蛙'],
  ['woodfish', wd, aPuffer, '木鱼灵'],
]) {
  const fam = CLIP_FAMILIES[cfg.animFamily];
  ok(!!fam, `${label}的动画族 ${cfg.animFamily} 在表里`);
  const missing = Object.keys(cfg.anim)
    .map((key) => [key, fam[key]])
    .filter(([, clip]) => !clip)
    .map(([key]) => key);
  ok(missing.length === 0, `${label} cfg.anim 的每个语义键都有映射`, missing.join(','));
  const absent = Object.keys(cfg.anim)
    .map((key) => fam[key])
    .filter((clip) => clip && !have.includes(clip))
    .filter((v, i, arr) => arr.indexOf(v) === i);
  ok(absent.length === 0, `${label}用到的 clip 在 glb 里都存在`, absent.join(','));
}

// 井蛙要有攻击/死亡这两段（吐舌借用 Punch、倒地借用 Death）
for (const need of ['Punch', 'Death', 'Idle', 'Walk']) {
  ok(aFrog.includes(need), `青蛙模型有 ${need} 段`);
}
// 河豚要有游动 / 死亡这两段
for (const need of ['Swimming_Normal', 'Death']) {
  ok(aPuffer.includes(need), `河豚模型有 ${need} 段`);
}

// ============================================================
sec('四、别的怪没被波及');
// ============================================================
ok(/wolf\.glb$/.test(ENEMY_TYPES.leaper.file), '雾猎狼还在用 wolf.glb', ENEMY_TYPES.leaper.file);
ok(/tribal\.glb$/.test(ENEMY_TYPES.hexer.file), '咒面图腾还在用 tribal.glb', ENEMY_TYPES.hexer.file);
// 第 82 块：+称量官 → 21 只
// 第 83 块：-无名者/旗手 +寄存处看守 → 20 只
// 第 97 块：+盖章人 stamper → 21 只（称量官同时换模型，总数不变的是文件数）
ok(Object.keys(ENEMY_TYPES).length === 25, `怪物总数 25 只（第 107 块 +4，实际 ${Object.keys(ENEMY_TYPES).length}）`);
ok(ENEMY_TYPES.arc && ENEMY_TYPES.arc.animFamily === undefined, '并联体仍是静态网格（没乱加动画族）');

// ============================================================
sec('五、源码层面的三处配套改动');
// ============================================================
const src = readFileSync('js/enemy.js', 'utf8');
ok(/fish:\s*\{\s*\n\s*idle: 'Swimming_Normal'/.test(src), 'CLIP_FAMILIES 里新增了 fish 一族');
ok(/else if \(e\.cfg\.hover && e\.state !== 'dead'\)/.test(src), 'updateOne 里有「只浮空不自转」的分支');
// 第 80 块：加了 previewHover:false 的例外（并联体原点在底部，抬了构图会散），
// 所以这里放宽成「条件是 cfg.hover 开头，动作仍是抬高」
ok(/if \(cfg\.hover[^\n]*\) model\.position\.y \+= cfg\.hover;/.test(src), '图鉴预览也应用 hover（否则半截埋地）');
ok(/\(e\.cfg\.hover \|\| 0\) - 0\.45 \* k/.test(src), '死亡下沉相对 hover 计算（浮空怪不会突然掉到地上）');
// 顺带修的既有 bug：擦名者「看不见→靠近」和「太近→后退」两条规则互相夹死，
// 会卡在视野边缘（≈3.85 格）原地抖，永远不读条。
ok(/if \(!viz && dist > 2\.0\)/.test(src), '擦名者：看不见就先靠近（放在后退判断之前）');
ok(/if \(dist < keep - 1\.5\)/.test(src), '擦名者：后退底线降到 keep-1.5（和 keep+0.45 拉开，不再重叠）');
ok(!/dist > keep \+ 0\.45 \|\| !viz/.test(src), '旧的「靠近 or 看不见」合并条件已拆开');

// ============================================================
sec('六、版本号：index.html 与所有 js 完全一致');
// ============================================================
const idx = readFileSync('index.html', 'utf8');
const vs = [...idx.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
const base = vs[0];
ok(!!base, `index.html 里有版本号 v=${base}`);
const jsFiles = readdirSync('js').filter((f) => f.endsWith('.js'));
const bad = [];
for (const f of jsFiles) {
  const s = readFileSync('js/' + f, 'utf8');
  for (const m of s.matchAll(/\?v=(\d+)/g)) if (m[1] !== base) bad.push(f + ' → ' + m[1]);
}
ok(bad.length === 0, `js 里所有 ?v= 都是 ${base}`, bad.slice(0, 3).join(' | '));
ok(Number(base) >= 88, `版本号已 bump 到 88 或更高（当前 ${base}）`);

console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
process.exit(fail ? 1 : 0);
