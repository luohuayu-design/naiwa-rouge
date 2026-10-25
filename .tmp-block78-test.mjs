// 第 78 块契约测试：存档导出 / 导入（js/saveIO.js）
// 用户第 11 条：「清缓存不丢档能不能实现」。
// 结论是「全自动免疫做不到，只能手动备份」，所以这块的正确性全在
// 「导出的东西够不够、导入只覆盖该覆盖的、坏数据会不会把档搞坏」三件事上。
// 跑法：`node .tmp-block78-test.mjs`
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};
const sec = (t) => console.log('\n' + t);
const eq = (a, b, name, extra = '') => ok(a === b, name, extra || `${a} !== ${b}`);

// ------------------------------------------------------------
// localStorage 假实现（Node 里没有）
// Node 22 自带 btoa / atob / TextEncoder / TextDecoder，不用再补。
// ------------------------------------------------------------
class LS {
  constructor() { this.m = new Map(); this.boom = null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (this.boom && this.boom === k) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  dump() { return JSON.stringify([...this.m.entries()].sort()); }
}

globalThis.localStorage = new LS();
const io = await import('./js/saveIO.js');
const { IO_KEYS, NEVER_IMPORT_KEYS, SAVE_MAGIC, SAVE_FORMAT } = io;
const LS_ = globalThis.localStorage;

const K = {
  profile: 'naiwa_rouge_profile_v1',
  records: 'naiwa_rouge_records_v1',
  runs: 'naiwa_rouge_runs_v1',
  daily: 'naiwa_rouge_daily_v1',
  seeds: 'naiwa_rouge_seeds_v1',
  wtut: 'naiwa_rouge_wtut_v1',
  audio: 'naiwa_rouge_audio_v1',
  admin: 'naiwa_rouge_admin_v1',
  notice: 'naiwa_rouge_notice_v1',
  promo: 'naiwa_rouge_promo_v1',
};

const mkProfile = (o = {}) => JSON.stringify({
  v: 1,
  settings: { sfx: 0.8, music: 0.55, quality: 'high', joySize: 'mid', joyHand: 'left', shake: true, speedFov: true },
  stats: { runs: 3, wins: 1, kills: 42, seconds: 600, coins: 900, dmgTaken: 120, cards: {}, lanternReveal: 2 },
  codex: { enemies: { minion: 5, warrior: 2, wisp: 1 }, cards: { atk: 3, hp: 2 }, swords: {}, relics: {}, events: {} },
  ach: { firstRun: 1, firstWin: 2 },
  bones: 120,
  camp: { atk: 2, hp: 1 },
  boons: { swift: 2 },
  boonPending: 0,
  story: { seen: { s01: 1, s02: 1 }, read: {}, marks: {}, ending: '' },
  notice: { campfire: true, boon: true },
  gifts: {}, voicePack: { unlocked: false, id: 'normal' }, met: {},
  ringGot: false, heal: { unlocked: false }, rainGot: false, tut: {},
  metaShop: { bought: {}, opened: 0, mods: [], relics: {}, skillCdMul: 1, log: [] },
  signin: { week: '', days: [], got3: false, got6: false },
  ...o,
});

function seedAll() {
  LS_.clear();
  LS_.setItem(K.profile, mkProfile());
  LS_.setItem(K.records, JSON.stringify({ 1: { wins: 1, best: 233.4 } }));
  LS_.setItem(K.runs, JSON.stringify([{ id: 'a' }, { id: 'b' }]));
  LS_.setItem(K.daily, JSON.stringify({ day: '2026-10-25', seed: 'x' }));
  LS_.setItem(K.seeds, JSON.stringify({ list: [1, 2] }));
  LS_.setItem(K.wtut, JSON.stringify({ sword: true }));
  // 这四类故意不导出
  LS_.setItem(K.audio, JSON.stringify({ sfx: 0.1, music: 0.2, muted: true }));
  LS_.setItem(K.admin, JSON.stringify({ on: true }));
  LS_.setItem(K.notice, JSON.stringify({ read: true }));
  LS_.setItem(K.promo, JSON.stringify({ read: true }));
}

const mkPayload = (data, extra = {}) => ({
  app: 'naiwa-rouge', kind: 'save', ver: 1,
  at: '2026-10-25T10:00:00.000Z', game: '89', data, ...extra,
});

// ============================================================
sec('一、快照：只带走「真正有价的」六类');
// ============================================================
seedAll();
const snap = io.snapshot();
ok(snap.app === 'naiwa-rouge', 'payload.app 是 naiwa-rouge');
eq(snap.kind, 'save', 'payload.kind 是 save');
eq(snap.ver, SAVE_FORMAT, 'payload.ver 等于当前格式号');
ok(/^\d{4}-\d{2}-\d{2}T/.test(snap.at), 'payload.at 是 ISO 时间', snap.at);

for (const k of IO_KEYS) ok(snap.data[k] != null, `快照带上了 ${k}`);
for (const k of NEVER_IMPORT_KEYS) ok(snap.data[k] == null, `快照**没有**带上 ${k}`);

const outProf = JSON.parse(snap.data[K.profile]);
ok(!('settings' in outProf), '快照里的 profile 剥掉了 settings（音量 / 摇杆不跟着走）');
eq(outProf.bones, 120, '快照里的 profile 保留了骨币');
eq(Object.keys(outProf.camp || {}).length, 2, '快照里的 profile 保留了篝火等级');
eq(Object.keys(outProf.codex.enemies || {}).length, 3, '快照里的 profile 保留了图鉴');
ok(LS_.getItem(K.audio) != null, '本机的 audio 键还在（导出只读不删）');

// ============================================================
sec('二、文本码：编得出来、解得回去、经得起微信折行');
// ============================================================
const code = io.payloadCode(snap);
ok(code.startsWith(SAVE_MAGIC), `文本码以 ${SAVE_MAGIC} 开头`);
ok(!/\s/.test(code), '文本码里没有任何空白（粘到微信里不会被截断）');
ok(code.length > 100, `文本码有内容（${code.length} 字符）`);

const back = io.parseText(code);
ok(back.ok, '刚导出的码能原样解回来', back.err);
eq(JSON.stringify(back.payload.data), JSON.stringify(snap.data), '解回来的数据与导出时逐字节一致');

// 微信转发会自动折行：每 40 字插一个换行 + 空格，另外前后加空行
const folded = '\n  ' + code.replace(/(.{40})/g, '$1\n ') + '  \n';
const back2 = io.parseText(folded);
ok(back2.ok, '带换行和空格的码照样能解（微信折行场景）', back2.err);

// 前缀大小写不敏感（base64 正文本身大小写敏感，只有前缀能乱写）
ok(io.parseText('nwsave1:' + code.slice(SAVE_MAGIC.length)).ok, '前缀写成小写也认');

const cut = io.parseText(code.slice(0, Math.floor(code.length * 0.6)));
ok(!cut.ok, '截断一半的码会被拦下（不会写坏档）', cut.ok ? '竟然成功' : '');
const empty = io.parseText('');
ok(!empty.ok && /空/.test(empty.err), '空字符串报「存档码是空的」', empty.err);
const onlyMagic = io.parseText(SAVE_MAGIC);
ok(!onlyMagic.ok, '只有前缀没有内容的码会被拦下', onlyMagic.ok ? '竟然成功' : '');

// 中文：档案里的名字 / 剧情都没有中文，但别让编码层先炸
LS_.setItem(K.profile, mkProfile({ 昵称: '奶蛙·夜行', story: { seen: { s01: '第一夜' } } }));
const cnSnap = io.snapshot();
const cnBack = io.parseText(io.payloadCode(cnSnap));
ok(cnBack.ok, '含中文的档案也能走文本码', cnBack.err);
eq(JSON.parse(cnBack.payload.data[K.profile])['昵称'], '奶蛙·夜行', '中文原样回来（btoa 的 Latin1 坑已绕开）');

// ============================================================
sec('三、校验：坏数据一律拦在写盘之前');
// ============================================================
seedAll();
const goodData = { [K.profile]: mkProfile() };
const cases = [
  ['null', null],
  ['数组', []],
  ['字符串', 'hello'],
  ['少了 app', { ...mkPayload(goodData), app: undefined }],
  ['app 不对（别的游戏）', mkPayload(goodData, { app: 'other-game' })],
  ['没有 data', mkPayload(null)],
  ['data 是数组', mkPayload([])],
  ['data 里没有 profile', mkPayload({ [K.runs]: '[]' })],
  ['profile 是坏 JSON', mkPayload({ [K.profile]: '{不是 json' })],
  ['profile 是数组', mkPayload({ [K.profile]: '[1,2]' })],
  ['ver = 0', mkPayload(goodData, { ver: 0 })],
  ['ver = "abc"', mkPayload(goodData, { ver: 'abc' })],
  ['ver 比当前格式新太多', mkPayload(goodData, { ver: 99 })],
];
for (const [name, p] of cases) {
  const r = io.validate(p);
  ok(!r.ok && !!r.err, `拦下：${name}`, r.ok ? '竟然放过了' : '');
}
const rVersion = io.validate(mkPayload(goodData, { ver: 99 }));
ok(/更新版本/.test(rVersion.err), '版本太新时给的是「先更新游戏」这句人话', rVersion.err);
ok(io.validate(mkPayload(goodData)).ok, '正常存档通过校验');

// ============================================================
sec('四、摘要：确认弹窗上给玩家看的数字');
// ============================================================
LS_.clear();
const sSum = io.summarize(mkPayload({
  [K.profile]: mkProfile({ bones: 777, camp: { a: 3, b: 2 }, boons: { x: 2, y: 1 }, ach: { k1: 1, k2: 2, k3: 3 } }),
  [K.runs]: JSON.stringify([{ id: 'a' }, { id: 'b' }]),
}));
eq(sSum.bones, 777, '摘要：骨币');
eq(sSum.campLv, 5, '摘要：篝火等级是各簇之和');
eq(sSum.boonLv, 3, '摘要：火种层数是各卡之和');
eq(sSum.boonKinds, 2, '摘要：火种卡种数');
eq(sSum.enemies, 3, '摘要：图鉴怪物种数');
eq(sSum.cards, 2, '摘要：图鉴卡牌种数');
eq(sSum.ach, 3, '摘要：成就个数');
eq(sSum.runs, 2, '摘要：在途存档局数');
eq(sSum.wins, 1, '摘要：通关次数');
eq(sSum.story, 2, '摘要：亲历的剧情夜数');

// 空壳也别崩
const sEmpty = io.summarize(mkPayload({ [K.profile]: '{}' }));
ok(sEmpty.bones === 0 && sEmpty.campLv === 0 && sEmpty.runs === 0, '空档案的摘要全是 0（不崩）');

// ============================================================
sec('五、落地：只覆盖该覆盖的，设备设置留本机');
// ============================================================
seedAll();
// 本机：摇杆设成 large（别人手机的存档不该把这个搬走）
const localProf = JSON.parse(LS_.getItem(K.profile));
localProf.settings.joySize = 'large';
localProf.settings.sfx = 0.35;
LS_.setItem(K.profile, JSON.stringify(localProf));
const audioBefore = LS_.getItem(K.audio);
const adminBefore = LS_.getItem(K.admin);
const dailyBefore = LS_.getItem(K.daily);

// 外来存档：骨币 999、篝火 9 级、摇杆 small；没有 daily / seeds / wtut
const incoming = mkProfile({ bones: 999, camp: { z: 9 } });
const inProf = JSON.parse(incoming);
inProf.settings.joySize = 'small';
inProf.settings.sfx = 0.99;
const inPayload = mkPayload({ [K.profile]: JSON.stringify(inProf), [K.records]: '{"2":{"wins":4}}' });

const res = io.apply(inPayload);
ok(res.ok, '正常导入成功', res.err);
eq(res.written.length, 2, '只写了 payload 里确实带的两个键', res.written.join(','));
ok(res.written.includes(K.profile) && res.written.includes(K.records), '写的正是 profile 与 records');

const afterProf = JSON.parse(LS_.getItem(K.profile));
eq(afterProf.bones, 999, '进度被覆盖（骨币 999）');
eq(Object.keys(afterProf.camp).join(','), 'z', '进度被覆盖（篝火换成外来那份）');
eq(afterProf.settings.joySize, 'large', '摇杆大小**保留本机**的 large（没被搬成 small）');
eq(afterProf.settings.sfx, 0.35, '音量**保留本机**的 0.35');
eq(LS_.getItem(K.audio), audioBefore, '音量独立键没被碰');
eq(LS_.getItem(K.admin), adminBefore, '管理员标记没被碰（不跟着存档跑）');
eq(LS_.getItem(K.daily), dailyBefore, '外来存档没带的 daily 保留本机（不清空）');
ok(LS_.getItem(K.runs) != null, '外来存档没带的 runs 也保留本机');
ok(LS_.getItem(K.notice) != null && LS_.getItem(K.promo) != null, '公告 / 宣传已读没被碰');

// 坏 payload：一个字节都不许写
const before = LS_.dump();
const bad = io.apply(mkPayload({ [K.profile]: 'garbage{' }));
ok(!bad.ok, 'apply 传坏档案返回失败', bad.ok ? '竟然成功' : '');
eq(LS_.dump(), before, '失败时 localStorage 一个字节都没变');

// 带禁用键的 payload：就算别人手改文件塞进来也不写
const smuggled = io.apply(mkPayload({
  [K.profile]: mkProfile(),
  [K.audio]: '{"sfx":0}',
  [K.admin]: '{"on":true}',
}));
ok(smuggled.ok, '带禁用键的存档本身能导（只是忽略那几个键）', smuggled.err);
eq(smuggled.written.length, 1, '禁用键被忽略，只写了 profile', smuggled.written.join(','));
eq(LS_.getItem(K.audio), audioBefore, '禁用键 audio 没被覆盖');
eq(LS_.getItem(K.admin), adminBefore, '禁用键 admin 没被覆盖');

// 隐私模式 / 存储满
LS_.boom = K.profile;
const quota = io.apply(mkPayload({ [K.profile]: mkProfile({ bones: 1 }) }));
LS_.boom = null;
ok(!quota.ok && /隐私模式|存储/.test(quota.err), '写不进去时给的是人话提示', quota.err);

// ============================================================
sec('六、parseAny：导入框两种都认');
// ============================================================
seedAll();
const anySnap = io.snapshot();
ok(io.parseAny(io.payloadCode(anySnap)).ok, '粘文本码能认');
ok(io.parseAny(io.payloadJson(anySnap)).ok, '粘 JSON 全文也能认（导出的 .json 直接全选复制）');
ok(io.parseAny('  ' + io.payloadJson(anySnap) + '\n\n').ok, 'JSON 前后带空行也认');
ok(!io.parseAny('').ok, '空内容报错');
ok(!io.parseAny('随便打的字').ok, '乱码报错');
ok(!io.parseAny('{坏的 json').ok, '坏 JSON 报错');

// ============================================================
sec('七、文件名与大存档');
// ============================================================
const fn = io.fileName(new Date(2026, 9, 25, 9, 7));
ok(/^蛙步夜行-存档-20261025-0907\.json$/.test(fn), '文件名带上日期小时分钟', fn);
const fn2 = io.fileName(new Date(2026, 0, 3, 23, 59));
ok(/-20260103-2359\.json$/.test(fn2), '个位数月 / 日 / 分都会补零', fn2);

// 大存档：真玩到后期，runs + 图鉴 + 开箱 log 会比较大
const big = 'x'.repeat(200 * 1024) + '奶蛙'.repeat(2000);
const bigPayload = mkPayload({ [K.profile]: mkProfile({ blob: big }) });
const bigCode = io.payloadCode(bigPayload);
const bigBack = io.parseText(bigCode);
ok(bigBack.ok, `200KB+ 的存档也能走文本码（码长 ${bigCode.length}）`, bigBack.err);
eq(JSON.parse(bigBack.payload.data[K.profile]).blob.length, big.length, '大存档解回来长度一致（分块编码没截断）');

// ============================================================
sec('八、键位清单：该导的一个不漏，不该导的一个不混');
// ============================================================
eq(IO_KEYS.length, 6, '导出清单是 6 个键');
ok(!IO_KEYS.includes(K.audio) && !IO_KEYS.includes(K.admin), '导出清单里没有 audio / admin');
ok(!IO_KEYS.includes(K.notice) && !IO_KEYS.includes(K.promo), '导出清单里没有 notice / promo');
ok(NEVER_IMPORT_KEYS.every((k) => !IO_KEYS.includes(k)), '禁用清单与导出清单没有交集');

// 项目里真实存在的 naiwa_rouge_* 键必须被这份清单全覆盖（新加键别忘了登记）
const declared = new Set([...IO_KEYS, ...NEVER_IMPORT_KEYS]);
const found = new Set();
for (const f of readdirSync('js').filter((x) => x.endsWith('.js'))) {
  const s = readFileSync('js/' + f, 'utf8');
  for (const m of s.matchAll(/'(naiwa_rouge_[a-z_]+_v\d+)'/g)) found.add(m[1]);
}
const missed = [...found].filter((k) => !declared.has(k));
ok(missed.length === 0, '项目里出现的存档键都已登记（导 / 明确不导）', missed.join(','));

// ============================================================
sec('九、版本号：index.html 与所有 js 完全一致');
// ============================================================
const idx = readFileSync('index.html', 'utf8');
const vs = [...idx.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
const base = vs[0];
ok(!!base, `index.html 里有版本号 v=${base}`);
const bad2 = [];
for (const f of readdirSync('js').filter((x) => x.endsWith('.js'))) {
  const s = readFileSync('js/' + f, 'utf8');
  for (const m of s.matchAll(/\?v=(\d+)/g)) if (m[1] !== base) bad2.push(f + ' → ' + m[1]);
}
ok(bad2.length === 0, `js 里所有 ?v= 都是 ${base}`, bad2.slice(0, 3).join(' | '));
ok(Number(base) >= 89, `版本号已 bump 到 89 或更高（当前 ${base}）`);

// main.js 真的接了这四个按钮（接线漏一个就等于功能不存在）
const main = readFileSync('js/main.js', 'utf8');
for (const id of ['ioExportFile', 'ioExportCode', 'ioImportFile', 'ioImportCode']) {
  ok(new RegExp(`getElementById\\('${id}'\\)`).test(main), `main.js 绑定了 #${id}`);
}
ok(/from '\.\/saveIO\.js\?v=\d+'/.test(main), 'main.js 引了 saveIO 模块');

console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
process.exit(fail ? 1 : 0);
