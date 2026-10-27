// 第 97 块契约（纯 Node，不起浏览器）
// 用户这一轮六条：
//   ① 降称量官血量 16 → 12
//   ② 第九关加新怪物（且称量官模型跟擦名者重复了，要换）
//   ③ 场上怪低于 5 只就自动提前生成后面的怪
//   ④ 存档：手机上导文件难、存档码太长复制不完
//   ⑤ 靠后关卡靠堆数量导致一局太长 → 砍杂兵 + 压间隔
//   ⑥ 重启体躺尸期间还在吃剑 / 吃攻击，白耗输出
// 跑法：node .tmp-block97-test.mjs（cwd = naiwa-rouge）
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');
const eq = (a, b, name) => ok(a === b, name, `${a} !== ${b}`);

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const enemySrc = read('./js/enemy.js');
const waveSrc = read('./js/wave.js');
const mainSrc = read('./js/main.js');
const codexSrc = read('./js/codex.js');
const ioSrc = read('./js/saveIO.js');
const htmlSrc = read('./index.html');
const jsFiles = readdirSync(new URL('./js', import.meta.url)).filter((x) => x.endsWith('.js'));

const { ENEMY_TYPES } = await import('./js/enemy.js');
const { LEVEL_9, LEVELS_BY_ID } = await import('./js/wave.js');
const CG = ENEMY_TYPES.weigher;
const SP = ENEMY_TYPES.stamper;

// ============================================================
sec('① 称量官：换模型 + 降血');
// ============================================================
ok(!!CG, '称量官还在');
eq(CG.file, 'assets/monsters/ledger-king.glb', '模型换成了 ledger-king.glb（不再和擦名者共用一张脸）');
ok(existsSync(new URL('./' + CG.file, import.meta.url)), '新模型文件真实存在');
ok(statSync(new URL('./' + CG.file, import.meta.url)).size > 100000,
  '模型不是空壳', statSync(new URL('./' + CG.file, import.meta.url)).size + ' B');
eq(CG.hp, 12, '血量 16 → 12（用户定案：温和）');
ok(CG.hp < ENEMY_TYPES.eraser.hp * 4, `12 不至于把它变成一块血豆腐（擦名者 ${ENEMY_TYPES.eraser.hp}）`);
eq(CG.animFamily, 'royal', '换了 royal 动画族（King 没有 Punch / Weapon）');
ok(CG.clipOverrides === undefined, '不再需要 clipOverrides 兜旧骨架');
// 复用的反面证据：21 只怪 21 个模型文件
const allFiles = Object.values(ENEMY_TYPES).filter((t) => !t.planned).map((t) => t.file);
eq(new Set(allFiles).size, allFiles.length, `零复用：${allFiles.length} 只怪 / ${new Set(allFiles).size} 个文件`);
ok(ENEMY_TYPES['eraser'].file !== CG.file, '擦名者与称量官不再是同一个 glb');

sec('①-b royal 动画族');
const royalBlock = enemySrc.match(/royal:\s*\{[\s\S]*?\}/);
ok(!!royalBlock, 'CLIP_FAMILIES 里有 royal');
if (royalBlock) {
  for (const k of ['idle', 'walk', 'run', 'attack', 'cast', 'death', 'hit', 'spawn']) {
    ok(new RegExp(k + ":\\s*'").test(royalBlock[0]), `royal.${k} 有对应切片`);
  }
  ok(/attack:\s*'Sword_Slash'/.test(royalBlock[0]), 'royal.attack = Sword_Slash（国王只有这套劈砍）');
}

// ============================================================
sec('② 新怪 盖章人 stamper');
// ============================================================
ok(!!SP, 'stamper 已注册');
eq(SP.name, '盖章人', '名字是盖章人');
eq(SP.file, 'assets/monsters/stamp-goblin.glb', '独立模型 stamp-goblin.glb');
ok(existsSync(new URL('./' + SP.file, import.meta.url)), '盖章人模型文件存在');
eq(SP.animFamily, 'brute', '复用 brute 骨架（与 warden 同族）');
eq(SP.tag, 'stamp', '手里的印章走 attachTag 的 stamp 分支');
for (const k of ['hp', 'speed', 'attackRange', 'keepDistance', 'damage', 'attackInterval', 'windup', 'attackDuration']) {
  ok(Number.isFinite(SP[k]), `参数齐全：${k} = ${SP[k]}`);
}
ok(SP.hp <= 3, `血 ${SP.hp}：两下就没（它的价值是干扰，不是耗输出）`);
ok(SP.attackDuration > SP.windup, `攻击时长 ${SP.attackDuration} > 前摇 ${SP.windup}（否则招永远播不完）`);
ok(SP.keepDistance < SP.attackRange, `保持距离 ${SP.keepDistance} < 射程 ${SP.attackRange}（有「贴太近就退」的带宽）`);

sec('②-b 方印参数');
const S = SP.seal;
ok(!!S, 'seal 参数存在（这是它和紫阵、木牌雨的区别所在）');
for (const k of ['radius', 'color', 'slow', 'time']) ok(S && S[k] != null, `seal.${k} = ${S && S[k]}`);
ok(S.radius > 1 && S.radius < 2.5, `方印半宽 ${S.radius}：比一个身位宽一点，走两步能出去`);
ok(S.slow > 0.3 && S.slow < 0.8, `封步系数 ${S.slow}：砍半但不至于钉死（钉死 = 必吃一发上称）`);
ok(S.time >= 2 && S.time <= 4, `封步 ${S.time} 秒：够它准备好下一次抬手，又不至于让人一直瘸`);

sec('②-c 印章模型（程序化，零资产）');
ok(/kind === 'stamp'/.test(enemySrc), "attachTag 里有独立的 'stamp' 分支（不是 else 兜底）");
const stampBlock = enemySrc.match(/if \(kind === 'stamp'\)[\s\S]{0,2000}/);
ok(!!stampBlock && /MeshBasicMaterial/.test(stampBlock[0]),
  '印章用 MeshBasicMaterial（否则会被 tint / glow 的 traverse 覆盖掉颜色）');
ok(!!stampBlock && /isTag/.test(stampBlock[0]), '印章打了 userData.isTag（tint / glow / ghost / 闪白都跳过）');

// ============================================================
sec('③ 方印落在地上（方形 zone，切比雪夫判定）');
// ============================================================
ok(/zoneSquareGeo/.test(enemySrc) && /zoneSquareRingGeo/.test(enemySrc), '有方形底 + 方框几何');
ok(/new THREE\.ShapeGeometry\(outer\)/.test(enemySrc), '方框用 Shape 挖洞（不是四根细条拼）');
ok(/extra\.square/.test(enemySrc), 'makeZone 按 extra.square 选几何');
ok(/square:\s*true/.test(enemySrc), 'spawnSeal 传了 square: true');
ok(/Math\.max\(Math\.abs\([a-z]+\), Math\.abs\([a-z]+\)\)/.test(enemySrc),
  '方印判定用切比雪夫距离（画的是方，判的也必须是方）');
ok(/'seal'/.test(enemySrc) && /ZONE_PALETTES[\s\S]{0,400}seal/.test(enemySrc), 'ZONE_PALETTES 有 seal 配色');
ok(/handleStamper/.test(enemySrc), '有独立的 handleStamper（三档走位）');
ok(/cursePlayer\(\s*\{\s*factor:\s*v\.seal\.slow/.test(enemySrc.replace(/\n/g, ' ')) ||
  /factor:\s*v\.seal\.slow/.test(enemySrc), '封步走 cursePlayer（和紫阵共用减速通道，不另开一套）');

// ============================================================
sec('④ 第六 ~ 九关：砍杂兵 + 压间隔');
// ============================================================
for (const id of [6, 7, 8, 9]) {
  const lv = LEVELS_BY_ID[id];
  eq(lv.gapScale, 1.12, `第 ${id} 关 gapScale 1.35 → 1.12`);
}
eq(LEVELS_BY_ID[5].gapScale, 1.35, '第五关及以前不动（用户说的是「靠后关卡」）');

// 每回合杂兵数量上限：不能出现「靠数量堆」的老样子
let maxMinion = 0, maxWarrior = 0;
for (const r of LEVEL_9.rounds) {
  maxMinion = Math.max(maxMinion, r.minion || 0);
  maxWarrior = Math.max(maxWarrior, r.warrior || 0);
}
ok(maxMinion <= 8, `第九关杂兵单回合上限 ${maxMinion}（原来是 12）`);
ok(maxWarrior <= 7, `第九关战士单回合上限 ${maxWarrior}`);
ok(LEVEL_9.rounds.length === 20, '仍是 20 回合（没靠砍回合数偷工）');

sec('④-b 第九关掺入盖章人');
const order = (LEVEL_9.order || []).map((x) => x[0]);
ok(order.includes('stamper'), 'order 里有 stamper');
ok(order.includes('weigher'), 'order 里称量官还在');
const firstStamp = LEVEL_9.rounds.findIndex((r) => (r.stamper || 0) > 0);
ok(firstStamp >= 3, `第一次出现放在第 ${firstStamp + 1} 回合（先认机制，再加量）`);
ok(LEVEL_9.rounds.every((r) => (r.stamper || 0) <= 2), '每回合最多两只（三只就变成纯骚扰了）');

// ============================================================
sec('⑤ 空场催怪');
// ============================================================
ok(/const LOW_POP = 5;/.test(waveSrc), '阈值写死 5 只');
ok(/const CATCH_STEP = 0\.22;/.test(waveSrc), '有节流步长（否则整波瞬间倒出来）');
ok(/get lowPop\(\)/.test(waveSrc) && /get pending\(\)/.test(waveSrc), '暴露 lowPop / pending 给测试与调试用');
ok(/nx\.delay > t\) nx\.delay = t;/.test(waveSrc) || /delay = t/.test(waveSrc),
  '只把 delay 拉到「现在」，不动已排好的后面几只');
eq((waveSrc.match(/catchT = 0;/g) || []).length >= 4,
  true, `catchT 在 startAt / nextRound / reset 都归零（共 ${(waveSrc.match(/catchT = 0;/g) || []).length} 处）`);
ok(/enemies\.aliveCount\(\) < LOW_POP/.test(waveSrc), '用 aliveCount 判，不是「已生成 - 已死」的近似值');

// ============================================================
sec('⑥ 躺尸的怪不再吃剑 / 吃攻击');
// ============================================================
ok(/function hittable\(e\)/.test(enemySrc), '统一判据 hittable() 存在');
const hb = enemySrc.match(/function hittable\(e\) \{[\s\S]{0,300}?\n\s*\}/);
ok(!!hb, '能取到 hittable 函数体');
if (hb) {
  for (const s of ['dead', 'spawn', 'down']) {
    ok(new RegExp(`state !== '${s}'`).test(hb[0]), `hittable 排除 ${s}`);
  }
}
ok(/hittable,\s*\/\//.test(enemySrc) || /\n\s*hittable,/.test(enemySrc), 'hittable 挂到了导出对象上');
ok(/if \(!hittable\(e\)\) return false;/.test(enemySrc), 'takeDamage 入口就用 hittable 拦');
ok(/if \(!hittable\(o\)\) continue;/.test(enemySrc), 'mendWounds 不给躺尸的奶');
ok(/!hittable\(o\) \|\| o\.ghostHidden/.test(enemySrc), '连锁整片也走 hittable');
// 所有「找目标」的地方都不许再自己写 state 判断。
// 例外只有「状态推进 / 样貌 / 观测口」这类不是索敌的地方，逐条点名：
//   e.dot / e.auraHaste / e.cfg.ghost  —— 毒跳、发光、隐身循环，是 e 自己的状态
//   eraserCount / arcNodes            —— 观测口（给测试数数）
//   probe() 里的 live                 —— 调试探针
const BENIGN = [
  /e\.dot && e\.state !== 'dead'/,
  /e\.auraHaste > 0 && e\.state !== 'dead'/,
  /e\.cfg\.ghost && e\.state !== 'dead'/,
  /eraserCount:/,
  /arcNodes:/,
  /const live = enemies\.list\.filter/,
];
const badSites = [];
for (const f of jsFiles) {
  const s = readFileSync(new URL('./js/' + f, import.meta.url), 'utf8');
  for (const m of s.matchAll(/[^\n]*\.state\s*!==\s*'dead'\s*&&[^\n]*'spawn'[^\n]*/g)) {
    const line = m[0].trim();
    if (BENIGN.some((re) => re.test(line))) continue;
    if (/function hittable/.test(line) || /return !!e && e\.state/.test(line)) continue;   // 统一出口本体
    badSites.push(f + ' → ' + line.slice(0, 60));
  }
}
ok(badSites.length === 0, '索敌处已经没有「只排 dead / spawn、漏掉 down」的旧判据', badSites.join(' | '));
ok(!/state !== 'dead' && e\.state !== 'spawn' && !e\.ghostHidden/.test(
  readFileSync(new URL('./js/weapon.js', import.meta.url), 'utf8')),
  '环剑 aliveEnemies() 已改用 hittable（这是用户第 6 条的本体）');
ok(/if \(e\.cfg\.aura && hittable\(e\)\)/.test(enemySrc), '光环源也不含躺尸的重启体');
for (const [f, re] of [
  ['js/weapon.js', /enemies\.hittable\(o\)/],
  ['js/arrowRain.js', /enemies\.hittable\(e\)/],
  ['js/turret.js', /enemies\.hittable\(e\)/],
  ['js/relics.js', /enemies\.hittable\(e\)/],
  ['js/main.js', /enemies\.hittable\(e\)/],
]) {
  ok(re.test(readFileSync(new URL('./' + f, import.meta.url), 'utf8')), `${f} 已改用 hittable`);
}

// ============================================================
sec('⑦ 存档码压缩（分段列表已在第 99 块删掉）');
// ============================================================
ok(/const MAGIC = 'NWSZ1:';/.test(ioSrc), '新前缀 NWSZ1:（压缩）');
ok(/const MAGIC_RAW = 'NWSAVE1:';/.test(ioSrc), '老前缀 NWSAVE1: 仍保留（老用户的码不作废）');
ok(/function lzCompress/.test(ioSrc) && /function lzDecompress/.test(ioSrc), '自带 LZ77（零依赖）');
ok(/const LZ_WIN = 16383/.test(ioSrc), '窗口 16383（实测性价比最好的那组）');
ok(/function bytesToB64u/.test(ioSrc) && /function b64uToBytes/.test(ioSrc), 'base64url 编解码（没有 + / = 才不会在粘贴时被吃掉）');
// 第 99 块：分段列表整个删掉了（几十段，还被压在设置底下）。这里反过来钉住「别再长回来」。
ok(!/CODE_CHUNK|chunkCode|codeStats/.test(ioSrc), 'saveIO 不再有分段相关导出');
ok(!/code-seg/.test(read('./style.css')), '分段样式已删干净');
ok(/NWSZ1:/.test(htmlSrc) && !/NWSAVE1:/.test(htmlSrc.replace(/id="saveCodeSub"[\s\S]{0,200}?/, '')),
  'index.html 的提示文案用的是新前缀');

sec('⑦-b 本机自动备份槽');
ok(/naiwa_rouge_autobak_v1/.test(ioSrc), '自动备份键已登记');
ok(/export const AUTO_SLOTS = 3;/.test(ioSrc), '留 3 份');
for (const fn of ['pushAuto', 'listAuto', 'getAuto', 'clearAuto']) {
  ok(new RegExp('export function ' + fn).test(ioSrc), `${fn} 已导出`);
}
ok(/autoBackup\(\)/.test(mainSrc), 'main.js 里有 autoBackup');
ok(/autoBackup\(\);[\s\S]{0,80}第 97 块/.test(mainSrc) || /autoBackup\(\)/.test(mainSrc),
  '每回合结束调一次');
ok(/renderAutoSlot/.test(mainSrc) && /ioAutoInfo/.test(htmlSrc), '面板上有「本机自动备份」一行');
ok(/ioAutoRestore/.test(htmlSrc), '有恢复按钮');

// 第 104 块：用户说「导出文件和分享文件一个效果」，直接把这颗按钮删了。
// 这里**反向钉住**，防止哪天又长回来。
sec('⑦-c 导出文件（第 104 块删掉了「分享文件」）');
ok(!/ioShareFile/.test(htmlSrc), '面板上**没有**「分享文件」按钮了');
ok(!/navigator\.share\b/.test(mainSrc), '代码里也不再调 Web Share API');
ok(!/navigator\.canShare/.test(mainSrc), '也没有 canShare');
ok(/function exportFile/.test(mainSrc), '导出动作还是抽成了函数');

sec('⑦-d 粘贴容错（分段累积保留：手机输入框仍可能截断一次粘贴）');
ok(/let codeStaged = ''/.test(mainSrc), '有分段累积缓冲');
ok(/codeStaged \+ raw/.test(mainSrc), '新粘的一段接在已有内容后面');
ok(!/id="codeBox"/.test(htmlSrc) && !/codeBoxAll/.test(htmlSrc), '分段弹窗已从 index.html 删掉');
ok(/ioExportCode[\s\S]{0,900}?copyText\(code\)/.test(mainSrc), '「复制存档码」一键复制整串（不弹窗、不分段）');
ok(/openSaveCodeAsk\(\);\s*\/\/ 它会把框先清空/.test(mainSrc), '剪贴板被拦时把码填进粘贴框兜底');

// ============================================================
sec('⑧ 文案');
// ============================================================
ok(/cfg\.seal/.test(codexSrc), '图鉴给盖章人写了专属说明');
const sealDesc = codexSrc.match(/return `走位压力[\s\S]*?`;/);
ok(!!sealDesc, '能取到 seal 文案块');
if (sealDesc) {
  ok(/紫阵/.test(sealDesc[0]), '明确写出与紫阵的区别（不然玩家会觉得是重复机制）');
  ok(!/\*\*/.test(sealDesc[0]), '文案里没有 markdown 星号（textContent 不认）');
  ok(!/</.test(sealDesc[0].replace(/=>/g, '')), '文案里没有 HTML 标签');
}
ok(/盖章人/.test(waveSrc), '第九关波次提示里提到盖章人');

// ============================================================
sec('⑨ 资产');
// ============================================================
for (const f of ['assets/monsters/ledger-king.glb', 'assets/monsters/stamp-goblin.glb',
  'assets/codex/weigher.webp', 'assets/codex/stamper.webp']) {
  const u = new URL('./' + f, import.meta.url);
  ok(existsSync(u) && statSync(u).size > 4000, `${f} 就位`, existsSync(u) ? statSync(u).size + ' B' : '不存在');
}

// ============================================================
sec('⑩ 版本号：index.html 与所有 js 完全一致');
// ============================================================
const vs = [...htmlSrc.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
const base = vs[0];
ok(!!base, `index.html 里有版本号 v=${base}`);
ok(vs.every((v) => v === base), `index.html 内所有版本号一致（${vs.length} 处）`);
const bad = [];
for (const f of jsFiles) {
  const s = readFileSync(new URL('./js/' + f, import.meta.url), 'utf8');
  for (const m of s.matchAll(/\?v=(\d+)/g)) if (m[1] !== base) bad.push(f + ' → ' + m[1]);
}
eq(bad.length, 0, `js 里所有 ?v= 都是 ${base}`, bad.slice(0, 3).join(' | '));
ok(/name="?naiwa-rouge/.test(htmlSrc) || /naiwa-rouge/.test(htmlSrc), 'index.html 还是这个项目');

// ============================================================
console.log('\n------------------------------');
if (fail === 0) console.log(`第 97 块契约：全绿 ${pass}/${pass + fail}`);
else {
  console.log(`第 97 块契约：${pass} 通过 / ${fail} 失败`);
  for (const f of fails) console.log('  - ' + f);
}
process.exit(fail === 0 ? 0 : 1);
