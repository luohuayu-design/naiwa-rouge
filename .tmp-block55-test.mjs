// 第 55 块 —— 用户三条（兑换码大全 txt / 新怪信息卡 / 只记打斗时长）
// 纯 Node 跑：`node .tmp-block55-test.mjs`（cwd = naiwa-rouge）
//   A 兑换码大全.txt：分类齐全、20 个码、哈希与 gift.js 一一对得上、被 gitignore
//   B 新怪信息卡：profile.met / enemy onSpawn / main.js 的排队与冻结链路
//   C 战斗计时：只有真打的时候走表，商店/剧情/升级/属性卡/确认弹窗/新怪卡都不算
import fs from 'fs';
import { profile, markEnemyMet, enemyMet, metLog } from './js/profile.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const htmlSrc = read('./index.html');
const mainSrc = read('./js/main.js');
const cssSrc = read('./style.css');
const enemySrc = read('./js/enemy.js');
const profSrc = read('./js/profile.js');
const giftSrc = read('./js/gift.js');
const gitignore = read('./.gitignore');

// ============================================================
// A. 兑换码大全.txt（用户第 1 条）
// ============================================================
sec('A、兑换码大全.txt');

const TXT = new URL('./兑换码大全.txt', import.meta.url);
ok(fs.existsSync(TXT), '本机有 兑换码大全.txt');
const txt = fs.existsSync(TXT) ? fs.readFileSync(TXT, 'utf8') : '';

// A 类 / B 类都从 txt 里抠出来，再逐个重算哈希对 gift.js 的码表
function h32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function codeHash(n) {
  const a = h32(n, 0x811c9dc5);
  const b = h32('#naiwa#' + n + '#gift#', 0x01000193);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
const giftTable = new Map();
for (const m of giftSrc.matchAll(/\['([0-9a-f]{16})',\s*(\d+)\]/g)) giftTable.set(m[1], Number(m[2]));

const codes = [...txt.matchAll(/\bN([AB])-([A-Z0-9]{4})-([A-Z0-9]{4})\b/g)]
  .map((m) => ({ tier: m[1], plain: m[0] }));
const uniq = new Map(codes.map((c) => [c.plain, c]));
ok(uniq.size === 20, `txt 里正好 20 个不重复的码（实际 ${uniq.size}）`);
const tierA = [...uniq.values()].filter((c) => c.tier === 'A');
const tierB = [...uniq.values()].filter((c) => c.tier === 'B');
ok(tierA.length === 10, `A 类 10 个（实际 ${tierA.length}）`);
ok(tierB.length === 10, `B 类 10 个（实际 ${tierB.length}）`);

let hashOk = 0, tierOk = 0;
for (const c of uniq.values()) {
  const bones = giftTable.get(codeHash(c.plain.replace(/[^A-Z0-9]/g, '')));
  if (bones != null) hashOk++;
  if (bones === (c.tier === 'A' ? 300 : 100)) tierOk++;
}
ok(hashOk === 20, `20 个码的哈希在 gift.js 里都查得到（${hashOk}/20）`);
ok(tierOk === 20, `档位全对：NA-* = 300 骨币、NB-* = 100 骨币（${tierOk}/20）`);
ok(giftTable.size === 20, `gift.js 码表还是 20 条（实际 ${giftTable.size}）`);

// 分类展示：两段标题 + 总览 + 使用说明，一个都不能少
ok(/A 类/.test(txt) && /300 骨币/.test(txt), '有「A 类 · 300 骨币」的分类段');
ok(/B 类/.test(txt) && /100 骨币/.test(txt), '有「B 类 · 100 骨币」的分类段');
ok(/分类总览/.test(txt), '有分类总览');
ok(/怎么用/.test(txt), '有使用说明（怎么用）');
ok(/输入规则/.test(txt), '有输入规则（大小写/横杠/空格）');
ok(/只能用一次|一码一次/.test(txt), '写明了「一个码一台机只能用一次」');
ok(/篝火商店/.test(txt), '指向了骨币的去处：篝火商店');
ok(/4000 骨币/.test(txt), '全换完的总额（300×10 + 100×10 = 4000）算得对');
ok(/只留本机|别提交|gitignore/.test(txt), 'txt 里也写了「不要外传/提交」');
// 每段要真有 10 行码（不是只在总览里列一遍）
const secA = (txt.match(/A 类 · 每个 300 骨币[\s\S]*?(?=B 类 · 每个 100 骨币)/) || [''])[0];
const secB = (txt.match(/B 类 · 每个 100 骨币[\s\S]*?(?=速查清单)/) || [''])[0];
ok((secA.match(/\bNA-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g) || []).length === 10, 'A 类清单里逐行列了 10 个');
ok((secB.match(/\bNB-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g) || []).length === 10, 'B 类清单里逐行列了 10 个');

// 明文码不许进仓库：gitignore 必须排除（README 第 44 块也这么写的）
ok(/兑换码大全\.txt/.test(gitignore), '.gitignore 排除了 兑换码大全.txt');
ok(/gift-codes\.local\.md/.test(gitignore), '老的 gift-codes.local.md 仍在排除列表里');

// ============================================================
// B. 新怪物信息卡（用户第 2 条）
// ============================================================
sec('B、新怪物信息卡');

// B1 档案层：profile.met
ok(!!profile().met && typeof profile().met === 'object', '默认档案里有 met 表');
ok(!!metLog() && typeof metLog() === 'object', 'metLog() 可用（永不返回 null）');
ok(enemyMet('__none__') === false, '没见过的怪：enemyMet = false');
ok(markEnemyMet('__t__') === true, '第一次标记返回 true（= 该弹卡）');
ok(markEnemyMet('__t__') === false, '第二次标记返回 false（= 不再弹）');
ok(enemyMet('__t__') === true, 'enemyMet 认得刚记下的怪');
ok(!profile().codex.enemies.__t__, 'met 和 codex.enemies（击倒数）是两张表，没有混用');
ok(/export function markEnemyMet/.test(profSrc) && /save\(\);/.test(profSrc.split('export function markEnemyMet')[1].slice(0, 260)),
  'markEnemyMet 会落地到档案（save 在函数里）');

// B2 enemy.js：onSpawn 在 push 之后调（回调里能看见这只怪已经在场上）
ok(/export function createEnemySystem\(\{[^}]*onSpawn/.test(enemySrc), 'createEnemySystem 接了 onSpawn');
ok(/list\.push\(e\);[\s\S]{0,320}?if \(onSpawn\) onSpawn\(e\);[\s\S]{0,80}?return e;/.test(enemySrc),
  'onSpawn 在 list.push 之后、return 之前触发');

// B3 main.js：接线 + 守卫 + 冻结
ok(/onSpawn: \(e\) => onMeetSpawn\(e\)/.test(mainSrc), 'main.js 把 onSpawn 接到了 onMeetSpawn');
ok(/enemyMet, markEnemyMet/.test(mainSrc), 'profile 的 met 两个接口都导进来了');
ok(/function onMeetSpawn\(e\)[\s\S]{0,600}?if \(gameState !== 'playing' \|\| !level\.roundNo \|\| meetOpen\) return;/.test(mainSrc),
  '只在 playing 且回合已开时拦人（教程/面板里冒出来的怪不打扰）');
ok(/if \(enemyMet\(e\.type\)\) return;/.test(mainSrc), '见过的怪直接放行（一种怪一辈子只弹一次）');
ok(/if \(!markEnemyMet\(e\.type\)\) return;/.test(mainSrc), '没见过才写档案，写完才排队');
ok(/meetQueue\.push\(e\.type\)/.test(mainSrc), '排进队列（同帧多只新怪不叠卡）');
ok(/meetAfter = gameState;[\s\S]{0,120}?meetOpen = true;[\s\S]{0,120}?gameState = 'meet';/.test(mainSrc),
  '弹卡时把 gameState 切成 meet（世界冻结）');
ok(/input\.joystick\.release\(\);[\s\S]{0,60}?vel\.set\(0, 0, 0\);/.test(mainSrc.split('function pumpMeet')[1] || ''),
  '冻结时松摇杆、清速度（不然松开后还在滑）');
ok(/if \(gameState === 'meet'\) gameState = meetAfter \|\| 'playing';/.test(mainSrc), '点「我明白了」把状态还回去');
ok(/mtOk\.addEventListener\('click'/.test(mainSrc), '「我明白了」有真监听');
ok(/function dropMeet\(\)[\s\S]{0,260}?meetQueue\.length = 0;/.test(mainSrc), 'dropMeet 会清队列');
ok(/gameState = 'over';\s*\n\s*dropMeet\(\);/.test(mainSrc), '结算时收掉新怪卡（不许盖在结算上）');
ok(/gameState = 'title';\s*\n\s*dropMeet\(\);/.test(mainSrc), '回标题时也收掉');
ok(/function startPlay\(\)[\s\S]{0,300}?elapsed = 0;[\s\S]{0,200}?meetQueue\.length = 0;/.test(mainSrc),
  '开新局清队列（上一局没看的怪不追到这一局）');

// B4 卡片内容：借图鉴那一份，不另写文案
ok(/meetInfo\(type\)[\s\S]{0,160}?codexEntries\('enemies'\)/.test(mainSrc), '卡片内容取自 codexEntries(敌人)');
ok(/mtName\.textContent = info\.title;/.test(mainSrc) && /mtSub\.textContent = info\.sub/.test(mainSrc),
  '名字/数值行跟着图鉴走');
ok(/mtDesc\.textContent = String\(info\.desc \|\| ''\)\.replace\(\/\\\*\\\*\/g, ''\);/.test(mainSrc),
  '攻击方式那一段清掉了 markdown 的 ** 星号（图鉴里是原样显示的）');
ok(/mtImg\.src = info\.thumb;/.test(mainSrc), '配一张图鉴缩略图');

// B5 标记：一张都不能重
const ids = [...htmlSrc.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
ok(dup.length === 0, `全页零重复 id（${dup.join(',') || '无'}）`);
for (const id of ['meetCard', 'mtImg', 'mtName', 'mtSub', 'mtDesc', 'mtOk']) {
  ok(ids.filter((v) => v === id).length === 1, `#${id} 存在且唯一`);
}
ok(/id="meetCard"/.test(htmlSrc) && /class="mt-ok" id="mtOk"/.test(htmlSrc), '卡片结构完整（含按钮）');
ok(/攻 击 方 式/.test(htmlSrc), '卡片上有「攻击方式」这一栏');
ok(/我 明 白 了/.test(htmlSrc), '按钮文案是「我明白了」');

// B6 层级：压住战斗面板（16），低于结算（18）/ 失败提示（19）
const zMeet = Number((cssSrc.match(/#meetCard\{[^}]*z-index:(\d+)/) || [])[1]);
const zUp = Number((cssSrc.match(/\.upgrade\{[^}]*z-index:(\d+)/) || [])[1]);
const zShop = Number((cssSrc.match(/\.shop\{[^}]*z-index:(\d+)/) || [])[1]);
const zRes = Number((cssSrc.match(/\.result\{[^}]*z-index:(\d+)/) || [])[1]);
const zTip = Number((cssSrc.match(/#failTip\{[^}]*z-index:(\d+)/) || [])[1]);
ok(zMeet > zShop && zMeet > zUp, `#meetCard ${zMeet} 压在商店 ${zShop} / 升级 ${zUp} 之上`);
ok(zMeet < zRes && zMeet < zTip, `又低于结算 ${zRes} / 失败提示 ${zTip}`);
ok(/#meetCard\.on\{opacity:1;pointer-events:auto\}/.test(cssSrc), '显示时能接点击');

// ============================================================
// C. 只记打斗时长（用户第 3 条）
// ============================================================
sec('C、战斗计时只算打斗');

// C1 唯一走表点 + 条件
const tickPart = mainSrc.split('function tick()')[1] || '';
const cond = (tickPart.match(/const inGame = ([^;]+);/) || [])[1] || '';
ok(/elapsed \+= dt;/.test(tickPart), '秒表在 tick 里走');
ok((mainSrc.match(/elapsed \+= dt/g) || []).length === 1, '全项目只有一处 elapsed += dt（没有第二个表）');
ok(/gameState === 'playing' \|\| gameState === 'tutorial' \|\| gameState === 'wtut'/.test(cond),
  '只在这三种「真在玩」的状态里走表');
ok(/!panelOpen/.test(cond), '属性卡开着不走（!panelOpen）');
ok(/!bagOpen/.test(cond), '背包开着不走（!bagOpen）');
ok(/!meetOpen/.test(cond), '新怪信息卡开着不走（!meetOpen）');
ok(/uiHold === 0/.test(cond), '确认弹窗开着不走（uiHold === 0）');
// elapsed 只在这些状态外走 → 商店/剧情/升级/结算天然不计时
for (const st of ['shop', 'event', 'upgrade', 'weapon', 'over']) {
  ok(!new RegExp(`gameState === '${st}'`).test(cond), `状态 ${st} 不在白名单里（不计时）`);
}

// C2 确认弹窗：开局 +1、关闭 -1，且不会漏减
ok(/confirmOpen = true;\s*\n\s*uiHold\+\+;/.test(mainSrc), 'askConfirm 打开时 uiHold++');
ok(/if \(confirmOpen\) \{ confirmOpen = false; uiHold = Math\.max\(0, uiHold - 1\); \}/.test(mainSrc),
  'closeConfirm 按「真的开着」才 --（重入不会减成负数）');

// C3 新局归零（老 bug：第二局时长会把上一局的带进来）
const startPlayPart = mainSrc.split('function startPlay()')[1].split('function ')[0];
ok(/elapsed = 0;/.test(startPlayPart), 'startPlay 里 elapsed 归零');
ok((mainSrc.match(/(?<!let )elapsed = 0;/g) || []).length === 1, '只有开局那一处归零（读档走 saved.elapsed 续算）');
ok(/elapsed = saved\.elapsed \|\| 0;/.test(mainSrc), '读档仍接着原来的战斗时长走');

// C4 记录/成就吃的都是这一只表
ok(/saveRunRecord\(curLevelId, \{ win: isWin, time: elapsed/.test(mainSrc), '关卡记录「最快通关」用 elapsed');
ok(/bumpStat\('seconds', Math\.round\(elapsed\)\)/.test(mainSrc), '全局战绩的累计时长用 elapsed');
ok(/\['用时', elapsed\.toFixed\(1\) \+ ' 秒'\]/.test(mainSrc), '结算面板的「用时」用 elapsed');

// C5 调试钩子
ok(/timeInfo: \(\) => \(\{[\s\S]{0,420}?running:/.test(mainSrc), '有 __game.timeInfo()（测试要看 running）');
ok(/meetCard: \{[\s\S]{0,700}?forget:/.test(mainSrc), '有 __game.meetCard（含 forget 便于重测）');
ok(/let meetAuto = meetQs\.has\('debug'\) \? meetQs\.has\('meet'\) : true;/.test(mainSrc),
  'debug 下默认不弹（&meet 才开），正常游玩始终弹');
ok(/if \(!meetAuto\) return;/.test(mainSrc.split('function onMeetSpawn')[1] || ''),
  'onMeetSpawn 第一道闸就是 meetAuto');

// C6 版本号：全局只允许一个版本，且只升不降
// （不写死具体数字 —— block45 的教训：写死 v=NN 的断言会在下次 bump 时假挂，
//   逼着人回来改测试；这里查「一致性 + 不低于本站稳时的版本」）
const allV = (s) => [...s.matchAll(/\?v=(\d+)/g)].map((m) => +m[1]);
const htmlVs = new Set(allV(htmlSrc));
const jsVs = new Set();
try {
  for (const f of fs.readdirSync(new URL('./js/', import.meta.url))) {
    if (f.endsWith('.js')) for (const v of allV(read('./js/' + f))) jsVs.add(v);
  }
} catch (_) { /* 目录读不到就只查 index.html */ }
const curV = [...htmlVs][0];
ok(htmlVs.size === 1 && jsVs.size === 1 && curV === [...jsVs][0],
  `index.html 与全部 js import 同一版本（html=${[...htmlVs].join('/')}，js=${[...jsVs].join('/')}）`);
ok(curV >= 65, `版本号只升不降（当前 v=${curV}，第 55 块落地时是 v=65）`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fails.length) console.log('失败项：\n  ' + fails.join('\n  '));
process.exit(fail ? 1 : 0);
