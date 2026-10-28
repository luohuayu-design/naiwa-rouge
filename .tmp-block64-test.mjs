// ============================================================
// 第 64 块 Node 契约测试：元素剑群体化 / 剑系卡翻倍 / 番外事件 / 技能面板 / 教程
//
// 跑法：node .tmp-block64-test.mjs
// 只测「纯数据 + 纯函数 + 静态文本」，运行时行为（群体命中、随机恢复、两位数
// 倒计时、教程 8 步、面板第三页）在 .tmp-block64-cdp.js。
//
// 这一块最容易出的错是「文案和数值脱节」：把卡片的 title 写成 +60% 但 pct 忘了翻倍，
// 或者把冰剑 desc 写 1.6 秒但 wstats 还是 1.2。所以下面有一整组
// 「标题数字 ↔ 实际数值」的对拍断言。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra != null ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra != null ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

// 中文目录在 URL 里是 %E7%8F%AD...，直接用 pathname 会 ENOENT
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const weaponStats = await import('./js/weaponStats.js');
const upgrade = await import('./js/upgrade.js');
const swordKinds = await import('./js/swordKinds.js');
const events = await import('./js/events.js');
const side = await import('./js/eventsSide.js');
const skills = await import('./js/skills.js');
const guide = await import('./js/guide.js');

const { WEAPON_STAT_DEFS, createWeaponStats, rollSwordDamage } = weaponStats;

// ============================================================
sec('一、武器属性表：新增群体参数 + 元素基础值上调');
// ============================================================
ok(WEAPON_STAT_DEFS.length === 12, `武器属性表 12 项（实际 ${WEAPON_STAT_DEFS.length}）`);
const wdef = (k) => WEAPON_STAT_DEFS.find((d) => d.key === k);
ok(!!wdef('elementRadius') && wdef('elementRadius').base === 7.0, '新增「元素波及」7.0 格（第 68 块从 3.5 翻倍）');
ok(!!wdef('elementRatio') && wdef('elementRatio').base === 0.5, '新增「元素溅射」50%');
ok(wdef('poisonDps').base === 0.15, `毒伤基础 0.15/秒（实际 ${wdef('poisonDps').base}）`);
ok(wdef('frostTime').base === 1.6, `冰冻基础 1.6 秒（实际 ${wdef('frostTime').base}）`);
ok(wdef('chainRatio').base === 0.45, `闪电基础 45%（实际 ${wdef('chainRatio').base}）`);
ok(wdef('elementRadius').group === '元素' && wdef('elementRatio').group === '元素', '两项都归「元素」分组');
// 面板要显示得出来：所有项都有 fmt / desc
ok(WEAPON_STAT_DEFS.every((d) => typeof d.fmt === 'function' && d.desc && d.desc.length > 8),
  '12 项都有 fmt 和说明');

const w = createWeaponStats();
ok(w.get('elementRadius') === 7.0 && w.get('elementRatio') === 0.5, '实例读得到新参数');
// 剑伤不受影响：这一块只调元素，不动 swordDamage
ok(w.get('swordDamage') === 1.60, '剑伤害基础仍是 1.60（没被这次加强误伤）');
const roll = rollSwordDamage(w, { targetArmor: 0, rng: () => 0.99 });
ok(Math.abs(roll.damage - 1.6) < 1e-9, `不暴击时伤害 1.6（实际 ${roll.damage}）`);

// ============================================================
sec('二、剑系升级卡：数值翻倍，且标题数字与 pct/flat 一致');
// ============================================================
const UP = upgrade.UPGRADES;
const card = (id) => UP.find((u) => u.id === id);

const swordCards = [
  ['swordEdge', 'swordDamage', 'pct', 0.60, 0.30],
  // 第 89 块：暴击率整体削 1/3，剑锋 → 11%（旧 16%）
  ['swordCrit', 'swordCrit', 'flat', 0.11, 0.08],
  ['swordFang', 'swordCritMul', 'pct', 0.80, 0.40],
  ['swordSpin', 'swordOrbit', 'pct', 0.50, 0.25],
  ['swordForge', 'swordRefill', 'flat', -2.0, -1.0],
  ['venom', 'poisonDps', 'flat', 0.12, 0.05],
  ['chill', 'frostTime', 'flat', 0.60, 0.30],
  ['volt', 'chainRatio', 'flat', 0.20, 0.10],
  ['spring', 'leechRate', 'flat', 0.10, 0.05],
];
for (const [id, stat, mode, now, before] of swordCards) {
  const c = card(id);
  ok(c && c.stat === stat && c.scope === 'weapon', `${id} 仍挂在武器表（scope:weapon）`);
  ok(c && c[mode] === now, `${id} 的 ${mode} 已是 ${now}（实际 ${c && c[mode]}）`);
  ok(c && Math.abs(c[mode]) > Math.abs(before), `${id} 比旧值 ${before} 更强`);
}
// 翻倍幅度统一（除了剑匣是「秒数」、−1 → −2）
// 八张翻倍卡里，淬毒是 0.05 → 0.12（2.4 倍）—— 毒伤基数太小，正好 ×2 只会变成
// 0.10，还是感觉不到；其余七张严格 ×2；剑匣是时长（−1 → −2 秒）单独算。
// 第 89 块起剑锋不再参与「翻倍」判定（它被 73 块拆档、89 块削 1/3）
ok(swordCards.filter(([id]) => id !== 'swordForge' && id !== 'swordCrit').every(([id, , mode, now, before]) => {
  const c = card(id);
  const r = Math.abs(c[mode] / before);
  return r >= 1.9 && r <= 2.5;
}), '七张数值卡至少翻 1.9 倍（淬毒 2.4 倍，其余 ×2；剑锋另行调档）');

// 标题里的数字必须和实际数值对得上（防「文案说 +60% 但 pct 还是 0.3」）
const titleCases = [
  ['swordEdge', '剑伤害 +60%'], ['swordCrit', '剑暴击率 +11%'], ['swordFang', '剑暴击伤害 +80%'],
  ['swordSpin', '剑转速 +50%'], ['venom', '毒伤 +0.12/秒'], ['chill', '冰冻 +0.6 秒'],
  ['volt', '闪电伤害 +20%'], ['spring', '血剑回血 +10%'],
];
for (const [id, title] of titleCases) {
  ok(card(id).title === title, `${id} 标题是「${title}」（实际「${card(id).title}」）`);
}
// 翻倍之后每张卡的 desc 里不能还留着旧数字
const staleDesc = UP.filter((u) => u.scope === 'weapon' && u.desc
  && /(0\.05|0\.10|35% →|1\.2 →|15% → 20%|10 → 9 秒)/.test(u.desc)).map((u) => u.id);
ok(staleDesc.length === 0, `武器系卡的说明里没有旧数值（${staleDesc.length ? staleDesc.join(',') : '干净'}）`);

// ============================================================
sec('三、元素剑说明：五种全部群体化');
// ============================================================
const K = swordKinds.SWORD_KINDS;
ok(Object.keys(K).length === 6, `仍是 6 种剑（实际 ${Object.keys(K).length}）`);
for (const id of ['poison', 'frost', 'leech', 'quake']) {
  const d = K[id].desc;
  ok(/一圈|范围内|一片|波及/.test(d), `${id} 的说明写了群体（${d.slice(0, 14)}…）`);
}
ok(/45%/.test(K.thunder.desc) && /所有/.test(K.thunder.desc), '雷剑说明写 45% 且是全场');
ok(/1\.6 秒/.test(K.frost.desc), '冰剑说明写 1.6 秒');
ok(/0\.15/.test(K.poison.desc), '毒剑说明写 0.15/秒');
ok(/所有怪造成的总伤害/.test(K.leech.desc), '血剑说明写「按总伤害」');
ok(K.thunder.tagline === '全场连锁' && K.frost.tagline === '一片冻住', 'tagline 也改成群体说法');

// ============================================================
sec('四、主线番外事件（10 条，按剧情解锁）');
// ============================================================
const SIDE = side.SIDE_EVENTS;
ok(SIDE.length === 10, `番外 10 条（实际 ${SIDE.length}）`);
ok(new Set(SIDE.map((e) => e.id)).size === 10, '番外 id 无重复');
const allIds = new Set(events.ALL_EVENTS.map((e) => e.id));
ok(allIds.size === events.ALL_EVENTS.length, '并进 ALL_EVENTS 后仍然没有重复 id');
ok(SIDE.every((e) => allIds.has(e.id)), '10 条都在 ALL_EVENTS 里（图鉴能翻到）');
ok(SIDE.every((e) => typeof e.cond === 'function'), '每条都有 cond（带剧情门槛）');
ok(SIDE.every((e) => !e.chainOnly), '番外不是 chainOnly（要能随机抽到）');
ok(SIDE.every((e) => e.icon && e.title && e.who && e.story && e.choices && e.choices.length >= 2),
  '字段齐全（icon/title/who/story/≥2 个选择）');
ok(SIDE.every((e) => e.choices.every((c) => c.label && c.hint && c.effects && c.say)),
  '每个选项都有 label/hint/effects/say');
ok(SIDE.every((e) => e.choices.every((c) => c.say.length >= 70)),
  '每个选项的回应都不短（≥70 字）');
// 效果里的属性名必须有效（上一轮的 defense/armor 就是这里抓出来的）
const validStats = new Set([...WEAPON_STAT_DEFS.map((d) => d.key),
  ...(await import('./js/stats.js')).STAT_DEFS.map((d) => d.key)]);
const badStat = [];
for (const e of SIDE) {
  for (const c of e.choices) {
    for (const m of (c.effects.permanent || [])) if (!validStats.has(m.stat)) badStat.push(`${e.id}:${m.stat}`);
    for (const m of (c.effects.mods || [])) if (!validStats.has(m.stat)) badStat.push(`${e.id}:${m.stat}`);
  }
}
ok(badStat.length === 0, `番外的属性名全部有效（${badStat.length ? badStat.join(' | ') : '无笔误'}）`);

// cond 行为：没看过剧情 → 一条都不放行
const noStory = SIDE.filter((e) => e.cond({})).length;
ok(noStory === 0, `空档案（没走过剧情）时一条都不放行（实际 ${noStory}）`);
// 只看过 s01 时，只有蛙爷的第一条番外开放
const onlyS01 = SIDE.filter((e) => e.cond({ story: { seen: { s01: true }, read: {} } })).map((e) => e.id);
ok(onlyS01.length === 1 && onlyS01[0] === 'sideGrandpaPot', `只看过 s01 → 只开锅底那条（${onlyS01.join(',')}）`);
// 全看完 → 10 条全开
const allSeen = {};
for (const id of ['s01', 's02', 's04', 's05', 's06', 's07', 's09', 's11', 's12', 's16']) allSeen[id] = true;
ok(SIDE.every((e) => e.cond({ story: { seen: allSeen, read: {} } })), '相关章节全看过 → 10 条全开');
// 只「读过档案」也算（read 表）
ok(SIDE.every((e) => e.cond({ story: { seen: {}, read: allSeen } })), '只读过档案（read 表）同样算看过');

// pickEvent：没剧情抽不到番外；有剧情能抽到
const noStoryHits = new Set();
for (let i = 0; i < 4000; i++) {
  const ev = events.pickEvent({ round: 3, round2: 0, gold: 20, rep: 50 }, [], Math.random);
  if (ev && SIDE.some((s) => s.id === ev.id)) noStoryHits.add(ev.id);
}
ok(noStoryHits.size === 0, `没剧情时抽 4000 次，一次也没抽到番外（实际 ${noStoryHits.size}）`);
const withStoryHits = new Set();
for (let i = 0; i < 4000; i++) {
  const ev = events.pickEvent({ round: 3, gold: 20, rep: 50, story: { seen: allSeen, read: {} } }, [], Math.random);
  if (ev && SIDE.some((s) => s.id === ev.id)) withStoryHits.add(ev.id);
}
ok(withStoryHits.size === 10, `剧情全开时抽 4000 次，10 条番外都出现过（实际 ${withStoryHits.size}）`);
// 番外不能挤掉原有池子：99 条老事件仍然抽得到
const oldHits = new Set();
for (let i = 0; i < 4000; i++) {
  const ev = events.pickEvent({ round: 3, gold: 20, rep: 50, story: { seen: allSeen, read: {} } }, [], Math.random);
  if (ev) oldHits.add(ev.id);
}
ok(oldHits.size > 40, `怪池子还是混着抽的（4000 次抽到 ${oldHits.size} 种不同事件）`);

// ============================================================
sec('五、技能元数据（属性面板「技能」页要用）');
// ============================================================
ok(skills.SKILLS.length === 4, `4 个技能（第 107 块 +傀儡术，实际 ${skills.SKILLS.length}）`);
for (const sk of skills.SKILLS) {
  ok(typeof sk.cd === 'number' && sk.cd > 0, `${sk.id} 有基础 CD（${sk.cd} 秒）`);
  ok(typeof sk.cdNow === 'function', `${sk.id} 有 cdNow()（算上 CD 缩短）`);
  ok(typeof sk.state === 'function', `${sk.id} 有 state()（面板状态行）`);
  ok(sk.desc && sk.desc.length >= 40, `${sk.id} 有够长的说明（${sk.desc.length} 字）`);
  ok(!!sk.unlockNote, `${sk.id} 写了解锁条件`);
}
const byId = (id) => skills.SKILLS.find((s) => s.id === id);
ok(byId('arrowRain').cd === 8.0, '箭雨 CD 8 秒（第 64 块之前面板上根本查不到）');
ok(byId('heal').cd === 25.0, '回血 CD 25 秒');
ok(byId('swordRain').cd === 6.0, '万剑齐发 CD 6 秒');

// 两位小数：fmtCd 是唯一出口
ok(skills.fmtCd(3.14159) === '3.14', `fmtCd(3.14159) = ${skills.fmtCd(3.14159)}`);
ok(skills.fmtCd(25) === '25.00', `fmtCd(25) = ${skills.fmtCd(25)}（补零，宽度恒定）`);
ok(skills.fmtCd(0.004) === '0.00', `fmtCd(0.004) = ${skills.fmtCd(0.004)}`);
ok(skills.fmtCd(0) === '', 'fmtCd(0) 返回空串（就绪时不显示数字）');
ok(!/Math\.ceil/.test(read('js/skills.js')), 'skills.js 里已经没有 Math.ceil（不再显示整数秒）');

// 假的 ctx：验证 state / cdText 的分支
const ctxBase = {
  playing: true,
  weapon: { granted: true, fireReady: false, fireCdLeft: 3.14159, fireCdProgress: 0.4, fireCdTotal: 6 },
  arrowRain: { unlocked: true, ready: true, cdLeft: 0, progress: 1, cdMax: 8 },
  heal: { unlocked: true, ready: false, cdLeft: 12.346, cdTotal: 25, progress: 0.5, status: 'cd' },
};
ok(byId('swordRain').cdText(ctxBase) === '3.14', `万剑齐发倒计时两位小数（${byId('swordRain').cdText(ctxBase)}）`);
ok(byId('arrowRain').cdText(ctxBase) === '', '箭雨就绪时不显示数字');
ok(byId('heal').cdText(ctxBase) === '12.35', `回血倒计时两位小数（${byId('heal').cdText(ctxBase)}）`);
ok(byId('heal').cdText({ ...ctxBase, heal: { ...ctxBase.heal, status: 'full' } }) === '满',
  '满血时显示「满」而不是数字');
ok(byId('swordRain').state(ctxBase) === 'cd', '万剑齐发在 CD 中 → state=cd');
ok(byId('swordRain').state({ ...ctxBase, weapon: { ...ctxBase.weapon, fireReady: true } }) === 'ready',
  '冷却走完 → state=ready');
ok(byId('arrowRain').state({ ...ctxBase, arrowRain: { unlocked: false } }) === 'lock',
  '箭雨没解锁 → state=lock（面板照样显示，写着解锁条件）');
ok(byId('heal').cdNow(ctxBase) === 25, '回血 cdNow 读到 cdTotal');

// ============================================================
sec('六、攻略面板：数值与实况同步');
// ============================================================
const gAll = guide.GUIDE_SECTIONS.flatMap((s) => s.items).map((i) => i.name + '|' + i.body + i.best + i.warn).join('\n');
ok(!/35% 伤害/.test(gAll), '攻略里没有「35% 伤害」（雷剑已 45%）');
ok(!/1\.2 秒/.test(gAll), '攻略里没有「1.2 秒」（冰冻已 1.6 秒）');
ok(/45%/.test(gAll), '攻略写了雷剑 45%');
ok(/1\.6 秒/.test(gAll), '攻略写了冰冻 1.6 秒');
ok(/一圈/.test(gAll), '攻略提到「一圈」（群体化说明）');

// ============================================================
sec('七、新手教程：8 步 + 判定环讲解 + 下一步按钮');
// ============================================================
const mainSrc = read('js/main.js');
const tutBlock = mainSrc.slice(mainSrc.indexOf('const TUT_STEPS = ['), mainSrc.indexOf('// 受击红闪用的战场冻结开关'));
const stepCount = (tutBlock.match(/kind: '/g) || []).length;
ok(stepCount === 8, `TUT_STEPS 8 步（实际 ${stepCount}）`);
for (const kind of ['move', 'info', 'kill', 'panel', 'bag']) {
  ok(tutBlock.includes(`kind: '${kind}'`), `有 kind:'${kind}' 的步骤`);
}
ok(/判定环/.test(tutBlock), '教程讲到了判定环');
ok(/圈外的怪你一下都够不到/.test(tutBlock), '教程讲清「圈外打不到」');
ok(/把怪带进圈里/.test(tutBlock), '教程讲清走位的意义');
ok(/技能页里写清了每个技能的冷却/.test(tutBlock), '教程指引到属性面板的技能页');
ok(/精确到 0\.01 秒/.test(tutBlock), '教程说明技能倒计时是两位小数');
ok(/金币|民心/.test(tutBlock), '教程讲了 HUD 的金币/民心');
ok(/第 8、16 回合结束会弹商店/.test(tutBlock), '教程讲了商店节奏');
// 教程卡是 textContent 渲染的，正文里不能出现 markdown 的 **（会原样显示成星号）
// 注意：教程正文是多行字符串拼接，单条正则抓不全 —— 直接扫整段 TUT_STEPS 块
ok(!tutBlock.includes('**'), '教程正文里没有 ** 星号（textContent 不认 markdown）');
// 攻略面板走 richText：** 会渲染成 <b class="gd-b">
ok(/export function richText/.test(read('js/guide.js')), '攻略面板有 richText 渲染器');
ok(/p\.appendChild\(richText\(text\)\)/.test(read('js/guide.js')), '攻略段落走 richText（不再是 createTextNode）');

// 推进逻辑改成按 kind 判（不再依赖下标）
ok(/const kind = TUT_STEPS\[tutStep\] && TUT_STEPS\[tutStep\]\.kind/.test(mainSrc),
  'tutorialTick 按 kind 推进（插步骤不用改下标）');
ok(/if \(tcNext\) tcNext\.hidden = s\.kind !== 'info'/.test(mainSrc), '讲解步才显示「下一步」');
ok(/tcNext\?\.addEventListener/.test(mainSrc), '「下一步」按钮已绑定');
const htmlSrc = read('index.html');
ok(/id="tcNext"/.test(htmlSrc) && /id="tcNext"[^>]*hidden/.test(htmlSrc), 'index.html 有 tcNext 且默认隐藏');
ok(/data-tab="skill"/.test(htmlSrc), 'index.html 属性面板有第三个页签「技能」');
ok(/三页互不影响/.test(htmlSrc), '面板底部文案改成「三页」');
const cssSrc = read('style.css');
ok(/#tutCard \.wt-next\{display:block\}/.test(cssSrc), 'CSS 让新手教程的「下一步」默认可见');
ok(/font-variant-numeric:tabular-nums/.test(cssSrc), '.sk-num 用等宽数字（两位数不跳字）');

// 面板第三页的渲染代码
ok(/panelTab === 'skill'/.test(mainSrc), 'renderPanel 有 skill 分支');
ok(/function apSkillRow/.test(mainSrc), '有 apSkillRow 渲染函数');
ok(/\$\{SKILLS\.length\} 个技能/.test(mainSrc), '技能页副标题报技能数量');
ok(/未解锁 —— /.test(mainSrc), '未解锁的技能也显示（写着解锁条件）');
ok(/还剩 \$\{left\.toFixed\(2\)\} 秒/.test(mainSrc), '冷却中显示两位小数剩余时间');

// ============================================================
sec('八、环剑恢复随机化（静态检查）+ 群体命中接线');
// ============================================================
const wSrc = read('js/weapon.js');
ok(/export function pickMissingKind/.test(wSrc), '随机挑选抽成了可导出的纯函数 pickMissingKind');
ok(/return pool\[Math\.min\(pool\.length - 1, \(rng\(\) \* pool\.length\) \| 0\)\]/.test(wSrc),
  'pickMissingKind 用 rng 在差集里等概率挑一种');
ok(!/for \(const k of owned\) \{\n      const c = have\.get\(k\) \|\| 0;\n      if \(c > 0\) \{ have\.set\(k, c - 1\); continue; \}\n      return k;/.test(wSrc),
  '旧的「按获得顺序返回第一把」已经删掉');
ok(/function aroundPoint/.test(wSrc), '有 aroundPoint（按半径取活怪）');
ok(/const R = Math\.max\(1\.0, wstats\.get\('elementRadius'\)\)/.test(wSrc), '群体半径读 elementRadius');
ok(/const splash = dmg \* ratio/.test(wSrc), '溅射伤害 = 主伤害 × elementRatio');
ok(/if \(o === e\) continue;/.test(wSrc), '直接命中的那只不重复吃溅射');
for (const k of ['poison', 'frost', 'leech', 'quake']) {
  ok(new RegExp(`kind === '${k}'`).test(wSrc), `applyKind 里有 ${k} 的群体分支`);
}
ok(/totalDmg \+= splash/.test(wSrc), '血剑按「主伤害 + 溅射伤害」总额回血');
ok(/ELEMENT_FX/.test(wSrc), '四种元素各有自己的特效颜色/音效');
ok(/kind === 'thunder'[\s\S]{0,1200}return;/.test(wSrc), '雷剑走完全场连锁后直接 return（不进圆圈逻辑）');

// ============================================================
sec('八之二、恢复顺序随机化（纯函数分布验证）');
// ============================================================
const weaponMod = await import('./js/weapon.js');
const pick = weaponMod.pickMissingKind;
// 库存 2 铁 + 1 冰 + 1 雷，环上只有 1 铁 + 1 雷 → 缺 1 铁 1 冰，两种各一半
// （旧逻辑按获得顺序会 100% 返回铁剑 —— 属性剑永远轮不上，这就是用户报的 bug）
const dist = {};
for (let i = 0; i < 6000; i++) {
  const k = pick(['iron', 'iron', 'frost', 'thunder'], ['iron', 'thunder']);
  dist[k] = (dist[k] || 0) + 1;
}
ok(!dist.thunder, '不缺口的那一种永远不会被选中', JSON.stringify(dist));
ok(dist.iron > 2600 && dist.frost > 2600,
  `缺的两种各占约一半（铁 ${dist.iron} / 冰 ${dist.frost}）`);
// 固定 rng：能确定地取到后一个（旧逻辑永远取第一个）
ok(pick(['iron', 'frost'], [], () => 0.99) === 'frost', 'rng=0.99 时取到差集里的后一种');
ok(pick(['iron', 'frost'], [], () => 0.0) === 'iron', 'rng=0 时取到差集里的前一种');
// 数量要按 multiplicity 算：库存两把铁、环上一把铁 → 差集只有一把铁
const onlyIron = new Set();
for (let i = 0; i < 500; i++) onlyIron.add(pick(['iron', 'iron', 'frost'], ['frost'], Math.random));
ok(onlyIron.size === 1 && onlyIron.has('iron'), `多用量的种类按剩余把数算（${[...onlyIron].join(',')}）`);
ok(pick(['iron'], ['iron']) === null, '不缺口时返回 null');
ok(pick([], []) === null, '空库存返回 null');

// ============================================================
sec('九、版本号一致');
// ============================================================
// 第 65 块起改成「版本无关」：拿 index.html 里的版本当基准，再要求全部 import 跟它一致。
// 原来这里写死 '75'，每发一次版都要来改一次，纯属噪声（真正的风险是「只 bump 了一半」）。
const ver = (read('index.html').match(/main\.js\?v=(\d+)/) || [])[1];
ok(!!ver, `index.html 的 main.js 带版本号（v=${ver}）`);
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const badVer = jsFiles.filter((f) => {
  const s = read('js/' + f);
  return new RegExp('\\?v=(?!' + ver + ')\\d+').test(s);
});
ok(badVer.length === 0, `js/*.js 的 import 全跟 index.html 同版本（v=${ver}；${badVer.length ? badVer.join(',') : '一致'}）`);

console.log(`\n结果：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); }
process.exit(fails.length ? 1 : 0);
