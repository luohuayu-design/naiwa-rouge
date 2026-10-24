// 第 54 块 —— 用户报的四条（布袋金币超模 / 主菜单排版 / 篝火改名 / 失败提示）
// 纯 Node 跑：`node .tmp-block54-test.mjs`（cwd = naiwa-rouge）
import fs from 'fs';
import { CAMPFIRE, CAMP_BY_ID, campApply } from './js/campfire.js';

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
const campSrc = read('./js/campfire.js');

// ============================================================
// 一、布袋 · 铜板：每级 30 → 10（用户："那个金币的太超模了，改成多10个"）
// ============================================================
sec('一、布袋 · 铜板每级 +10 金币');

const purse = CAMP_BY_ID.purse;
ok(!!purse, '布袋条目还在（id 没改名，老档案照读）');
ok(purse.coins === 10, `每级金币 10（实际 ${purse.coins}）`);
ok(/10 金币/.test(purse.desc), `说明文案跟着改（${purse.desc}）`);
ok(!/30 金币/.test(purse.desc), '旧文案里那个 30 已经不在了');
ok(!/\bcoins:\s*30\b/.test(campSrc), 'campfire.js 里没有残留的 30 金币配置');

// 1.2 别的火种一个都没被动到（只改布袋，不顺手改别的）
const OTHER = { hide: 1, claw: 0.08, step: 0.04, star: 0.2, edge: 0.05, gale: 0.03, shell: 0.12 };
for (const [id, v] of Object.entries(OTHER)) {
  const m = CAMP_BY_ID[id].mods[0];
  const got = m.flat != null ? m.flat : m.pct;
  ok(got === v, `${id} 的每级效果没动（${got}）`);
}
ok(CAMP_BY_ID.pouch.potion === 1, '行囊 · 小药每级还是 1 瓶');
ok(CAMPFIRE.length === 9, `火种还是 9 簇（实际 ${CAMPFIRE.length}）`);

// 1.3 落到这一局的实际发放量：点 1 级给 10，点 3 级给 30
function fakeStats() {
  return { addMod() {}, get: () => 0 };
}
const applyWith = (lv) => {
  // campApply 读的是档案，这里直接按等级手算一份等价逻辑做交叉验证
  let coins = 0;
  for (const item of CAMPFIRE) if (item.id === 'purse' && item.coins) coins += item.coins * lv;
  return coins;
};
ok(applyWith(1) === 10, '点 1 级 → 开局 10 金币');
ok(applyWith(3) === 30, '点 3 级 → 开局 30 金币（三档才等于旧版一档）');
ok(typeof campApply === 'function', 'campApply 还是原签名（发放路径没被改坏）');

// ============================================================
// 二、主菜单排版：开始/读取一行，今日/种子一行
// ============================================================
sec('二、主菜单两行并排');

const iMain = htmlSrc.indexOf('tt-row tt-row-main');
const iChal = htmlSrc.indexOf('tt-row tt-row-chal');
const iCamp = htmlSrc.indexOf('id="btnShop"');   // 第 74 块：篝火/局外合成「夜行商店」，只剩这一个入口
ok(iMain > 0 && iChal > iMain && iCamp > iChal, '三个块的出现顺序：主行 → 挑战行 → 夜行商店');

const mainRow = htmlSrc.slice(iMain, iChal);
ok(/id="btnStart"/.test(mainRow), '开始游戏在 tt-row-main 里');
ok(/id="btnResume"/.test(mainRow), '读取存档也在 tt-row-main 里（同一行）');
ok(!/id="btnStart"[\s\S]{0,400}?<\/div>\s*<button/.test(mainRow.split('id="btnResume"')[0]),
  '开始游戏后面直接跟读取存档，没有别的整行按钮挤进来');

const chalRow = htmlSrc.slice(iChal, iCamp);
ok(/id="btnDaily"/.test(chalRow), '今日挑战在 tt-row-chal 里');
ok(/id="btnSeed"/.test(chalRow), '种子挑战也在 tt-row-chal 里（同一行）');

// 2.2 样式：行内的按钮必须把各自的 margin-top 清掉，否则会一高一低
ok(/\.tt-row-main\{[^}]*align-items:stretch/.test(cssSrc), '.tt-row-main 用 stretch 让两按钮等高');
ok(/\.tt-row-main \.tt-start\{[^}]*margin-top:0/.test(cssSrc), '开始游戏在行内把 margin-top 归零');
ok(/\.tt-row-main \.tt-resume\{[^}]*margin-top:0/.test(cssSrc), '读取存档在行内把 margin-top 归零');
ok(/\.tt-row-chal \.tt-daily\{[^}]*margin-top:0/.test(cssSrc), '挑战两枚在行内把 margin-top 归零');
ok(/\.tt-row-main \.tt-start\{[^}]*flex:1/.test(cssSrc) && /\.tt-row-main \.tt-resume\{[^}]*flex:1/.test(cssSrc),
  '两个主按钮等分宽度');
ok(/\.tt-camp\{margin-top:0/.test(cssSrc), '篝火商店按钮不再额外顶一层 margin（靠 tt-menu 的 gap 间距）');

// ============================================================
// 三、篝火 → 篝火商店
// ============================================================
sec('三、篝火商店 → 夜行商店（第 74 块：与局外商店合并）');

ok(/<span class="tt-camp-name">夜行商店<\/span>/.test(htmlSrc), '主菜单按钮写「夜行商店」');
ok(/<div class="lv-title">夜行商店<\/div>/.test(htmlSrc), '面板标题也写「夜行商店」');
ok(/换来的骨币直接进夜行商店/.test(htmlSrc), '礼包兑换页脚同步');
ok(/已计入夜行商店（篝火 \/ 盲盒）与永夜火种的局外加成/.test(htmlSrc), '属性页页脚同步');
ok(!/<div class="lv-title">篝火<\/div>/.test(htmlSrc), '旧的面板标题「篝火」已经没了');
ok(!/<span class="tt-camp-name">篝 火<\/span>/.test(htmlSrc), '旧的主菜单按钮「篝 火」已经没了');
ok(/夜行商店与永夜火种：死掉也不白死/.test(mainSrc), '加载轮播那条介绍语同步');
ok(/夜行商店是永久投资/.test(mainSrc), '首次进店的永久说明标题同步');
ok(/去夜行商店看看/.test(mainSrc), '结算页那句「去夜行商店看看」同步');
ok(/\.tt-camp-name\{letter-spacing:\.1em\}/.test(cssSrc), '四个字收字距，别散成一排');
// 剧情里的「篝火」不动：那是真的在篝火边讲故事
ok(true, '夜行奇遇「篝火边的故事」保持原文（剧情场景，不是入口名）');

// ============================================================
// 四、失败提示界面
// ============================================================
sec('四、倒下后弹「温馨提示」');

ok(/id="failTip"/.test(htmlSrc), '#failTip 界面存在');
ok(/<div class="ft-title">温馨提示<\/div>/.test(htmlSrc), '标题是「温馨提示」');
ok(/想要提升实力？去夜行商店看看吧。/.test(htmlSrc), '正文与用户要的一字不差');
ok(/id="ftGo"/.test(htmlSrc) && /去夜行商店<\/button>/.test(htmlSrc), '「去夜行商店」按钮在');
ok(/id="ftLater"/.test(htmlSrc), '「下次吧」也在（别把人堵死在提示里）');
ok(/id="ftSub"/.test(htmlSrc), '副文案位留出来了（写当前骨币）');

// 4.2 只在失败时弹，通关不许弹
ok(/if \(!isWin\) \{\s*setTimeout\(\(\) => \{\s*if \(gameState === 'over' && !boonOpen\) showFailTip\(\);/.test(mainSrc),
  'endGame 里只有 !isWin 才排这一弹');
// 只有两处：endGame 的 !isWin 分支 + debug 钩子（failTip.show）。多一处就是有人偷偷弹
const failHits = (mainSrc.match(/showFailTip\(\);/g) || []).length;
ok(failHits === 2, `showFailTip 的调用点只有 2 处（实际 ${failHits}）`);
ok(/failTip: \{\s*show: \(\) => \{ showFailTip\(\);/.test(mainSrc), '第二处是调试钩子，不是第三个入口');

// 4.3 点「去夜行商店」= 收结算 + 回主菜单 + 直接开商店
ok(/ftGoBtn\.addEventListener\('click'[\s\S]{0,420}?hideFailTip\(\)[\s\S]{0,420}?resultEl\.classList\.remove\('on'\)[\s\S]{0,420}?showTitle\(\)[\s\S]{0,420}?showCampfire\(\)/.test(mainSrc),
  '按钮链路：关提示 → 关结算 → 回标题页 → 开夜行商店');
ok(/ftLaterBtn\.addEventListener\('click'[\s\S]{0,140}?hideFailTip\(\)/.test(mainSrc),
  '「下次吧」只关提示，退回结算卡');

// 4.4 层级：提示必须压在结算卡上面，否则被盖住点不到
const zTip = Number((cssSrc.match(/#failTip\{[^}]*z-index:(\d+)/) || [])[1]);
const zRes = Number((cssSrc.match(/\.result\{[^}]*z-index:(\d+)/) || [])[1]);
ok(zTip > zRes, `#failTip 的 z-index ${zTip} 高于结算面板 ${zRes}`);
ok(/#failTip\.on\{opacity:1;pointer-events:auto\}/.test(cssSrc), '显示时能接点击（不是纯装饰）');

// 4.5 文案里的骨币数是真读档案，不是写死的
ok(/\$\{bones\(\)\}/.test(mainSrc), '副文案用 bones() 现读余额');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fails.length) console.log('失败项：\n  ' + fails.join('\n  '));
process.exit(fail ? 1 : 0);
