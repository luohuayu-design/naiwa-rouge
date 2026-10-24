// 第 57 块 —— 用户七条
// 纯 Node 跑：`node .tmp-block57-test.mjs`（cwd = naiwa-rouge）
//   A 宣传有礼：艺术字特效 + 公告二 + 主菜单入口 + 今日不再弹（链在公告关闭后）
//   B 新增 20 个兑换码（宣传礼包 300 ×10 / 推荐礼包 100 ×10，带组名）
//   C 图鉴 / 夜行记忆卡顿优化（世界渲染闸门 + 分块渲染 + 签名缓存 + 空闲预热）
//   D 夜行记忆「换一种说法」字号加大
//   E boot 闪屏（标题页加载期彻底藏住，遮罩淡出时才淡入）
//   F 公告栏右下角被裁（vh → dvh + 遮罩可滚 + margin:auto）
//   G 菜单面板被主页面盖 / 加载慢（遮挡做厚 + 卡片 dvh + 分块/缓存）
import fs from 'node:fs';
import { lookupGift, giftByHash, GIFT_COUNT } from './js/gift.js';

let pass = 0, fail = 0;
const fails = [];
// 参数顺序：cond 在前、名字在后（写反会打一屏假绿）
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const htmlSrc = read('./index.html');
const mainSrc = read('./js/main.js');
const cssSrc = read('./style.css');
const profSrc = read('./js/profile.js');
const giftSrc = read('./js/gift.js');

// ============================================================
// A. 宣传有礼（用户第 1 条）
// ============================================================
sec('A、宣传有礼：艺术字特效 + 公告二 + 主菜单入口');

// A1 面板骨架（index.html）
ok(/id="promoOv"/.test(htmlSrc), '有宣传有礼遮罩 #promoOv');
ok(/id="promoArt"/.test(htmlSrc), '有艺术字特效层 #promoArt');
ok(/id="promoHideToday"/.test(htmlSrc), '有「今日内不再弹出」勾选框 #promoHideToday');
ok(/id="promoOk"/.test(htmlSrc), '有「我知道了」按钮 #promoOk');
ok(/id="promoX"/.test(htmlSrc), '有 ✕ 关闭按钮 #promoX');
ok(/id="btnPromo"/.test(htmlSrc), '主菜单有「🎁 宣传有礼」入口按钮');
ok((htmlSrc.match(/tt-promo-btn/g) || []).length >= 1, '入口挂了专用样式类 tt-promo-btn');
// 艺术字层里就是「宣传有礼」四个大字 + 副题
const artHtml = (htmlSrc.match(/<div class="promo-art"[\s\S]*?<\/div>/) || [''])[0];
ok(/<b>宣传有礼<\/b>/.test(artHtml), '艺术字层主字就是「宣传有礼」');
ok(/说给下一个人听/.test(artHtml), '艺术字层带副题');

// A2 活动文案（用户原话五要素）
ok(/每推荐一个人，得 100 骨币/.test(htmlSrc), '写明「每推荐一个人得 100 骨币」');
ok(/推荐礼包码/.test(htmlSrc), '推荐得的是「推荐礼包码」');
ok(/视频剪辑或实机录屏/.test(htmlSrc), '写明「做视频剪辑或实机录屏」');
ok(/抖音、快手、小红书、哔哩哔哩等平台，或微信朋友圈、QQ 动态/.test(htmlSrc), '平台列全：抖音/快手/小红书/B站/朋友圈/QQ 动态');
ok(/得 300 骨币（宣传礼包码）/.test(htmlSrc), '发视频得「300 骨币（宣传礼包码）」');
ok(/每获得一个赞、一条评论、一次收藏，都再得 5 骨币/.test(htmlSrc), '写明「赞/评论/收藏各 5 骨币」');
ok(/11 月 30 日联系本人，统一结算/.test(htmlSrc), '写明结算日期（用户口述 11 月 31 日不存在，取 11 月 30 日）');
ok(/联系本人/.test(htmlSrc), '写明「联系本人领取」');
ok(/3829845261/.test(htmlSrc) && /luohuayu-design\.github\.io\/naiwa-rouge/.test(htmlSrc), '带 QQ 和本站网址（可一键复制）');

// A3 逻辑（main.js）
ok(/const PROMO_VER = '1';/.test(mainSrc), '有独立版本号 PROMO_VER（换活动 +1 全员重看）');
ok(/const PROMO_KEY = 'naiwa_rouge_promo_v1';/.test(mainSrc), '有独立 localStorage 键（与公告分开各记各的）');
ok(/const PROMO_ART_MS = 1500;/.test(mainSrc), '艺术字特效时长 1500ms');
ok(/function showPromo\(force, art\)/.test(mainSrc), 'showPromo(force, art)：force=主菜单强制回看，art=播艺术字');
ok(/if \(seen === `\$\{noticeToday\(\)\}\|\$\{PROMO_VER\}`\) return false;/.test(mainSrc), '「今日不再弹」判断（日期 + 版本）');
ok(/localStorage\.setItem\(PROMO_KEY/.test(mainSrc), '勾选后写本机记录');
ok(/promoOv\.classList\.add\('art'\)/.test(mainSrc) && /promoTimer = setTimeout\(\(\) => promoOv\.classList\.remove\('art'\)/.test(mainSrc),
  '播艺术字 → 到点自动摘 .art（特效消散变标题）');
// 第 63 块修正（过期测试）：链路后来重构成了 afterNoticeChain() + titleIdle()，
//   「公告 → 签到（没签才弹）→ 宣传有礼」三级，判断条件也不再是裸的 gameState === 'title'。
ok(/function afterNoticeChain\(\)[\s\S]{0,240}?if \(!promoOv\.classList\.contains\('on'\)\) showPromo\(false, true\);/.test(mainSrc),
  '公告关闭 → 链上宣传有礼（艺术字版，带防重）');
ok(/if \(!signedToday\(\)\) \{ showSignin\(true\); return; \}/.test(mainSrc)
  && /function titleIdle\(\)[\s\S]{0,200}?gameState !== 'title'\) return false/.test(mainSrc),
  '链条带防重：标题页且没开子面板才弹（titleIdle）');
ok(/if \(!showNotice\(false\)\) setTimeout\(\(\) => afterNoticeChain\(\), 350\);/.test(mainSrc),
  '公告今天已关过 → 宣传有礼自己上场（不漏弹）');
ok(/btnPromo[\s\S]{0,80}?showPromo\(true, false\)/.test(mainSrc), '主菜单点开 = 强制回看且不播特效');
ok(/promo: \{[\s\S]*?show: \(force, art\)/.test(mainSrc), '__game.promo 测试钩子（show/hide/open/art/ver/key/clear）');
ok(/promo: \{[\s\S]*?art: \(\) => promoOv\.classList\.contains\('art'\)/.test(mainSrc), '钩子能问「特效正在播吗」');

// A4 样式（style.css）
ok(/#promoOv\{[^}]*z-index:47/.test(cssSrc), '遮罩 z-index 47（压在公告 46 之上）');
ok(/@keyframes promoArtIn\{/.test(cssSrc), '艺术字入场关键帧 promoArtIn');
ok(/#promoOv\.art \.promo-art\{[^}]*animation:promoArtIn/.test(cssSrc), '.art 期间才播特效');
ok(/#promoOv\.art \.promo-hd,#promoOv\.art \.promo-bd[^}]*opacity:0/.test(cssSrc), '特效期间正文藏起来（散去才亮相）');
ok(/background-clip:text;color:transparent/.test(cssSrc.replace(/\n/g, '')), '艺术字走渐变裁字（金色）');
ok(/tt-promo-btn/.test(cssSrc), '主菜单入口有暖金色样式');

// ============================================================
// B. 新增 20 个兑换码（用户第 2 条）
// ============================================================
sec('B、兑换码：宣传礼包 300 ×10 / 推荐礼包 100 ×10');

ok(GIFT_COUNT === 40, `码表共 40 个（第一批 20 + 本批 20，实际 ${GIFT_COUNT}）`);
const promoRows = [...giftSrc.matchAll(/\['([0-9a-f]{16})', 300, '宣传礼包'\]/g)];
const recRows = [...giftSrc.matchAll(/\['([0-9a-f]{16})', 100, '推荐礼包'\]/g)];
ok(promoRows.length === 10, `宣传礼包 10 条（实际 ${promoRows.length}）`);
ok(recRows.length === 10, `推荐礼包 10 条（实际 ${recRows.length}）`);
ok(/第 57 块/.test(giftSrc), '码表注释标明第 57 块');

// 从 txt 拿两个新码真查一遍（txt 是本机文件，被 gitignore）
const txt = fs.existsSync(new URL('./兑换码大全.txt', import.meta.url))
  ? read('./兑换码大全.txt') : '';
ok(/宣传礼包/.test(txt) && /推荐礼包/.test(txt), '兑换码大全.txt 已同步两个新分类');
const txtCodes = [...txt.matchAll(/\bN[AB]-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g)].map((m) => m[0]);
const uniqTxt = new Set(txtCodes);
ok(uniqTxt.size === 40, `txt 里 40 个不重复的码（实际 ${uniqTxt.size}）`);
let txtAllOk = true, nameSeen = new Set();
for (const c of uniqTxt) {
  const hit = lookupGift(c);
  if (!hit) { txtAllOk = false; continue; }
  nameSeen.add(hit.name || '(无组名)');
}
ok(txtAllOk, 'txt 里 40 个码全部查得到');
ok(nameSeen.has('宣传礼包') && nameSeen.has('推荐礼包') && nameSeen.has('(无组名)'),
  '组名三件套都在（第一批无组名）', [...nameSeen].join('/'));
// 组名贯通到反查（已兑换列表用）
const sample = lookupGift('NA-69SU-J85D');
ok(!!sample && sample.bones === 300 && giftByHash(sample.hash).name === '宣传礼包',
  '抽验 NA-69SU-J85D → 300 骨币 / 组名「宣传礼包」');
ok(/info\.name\s*\n?\s*\?/.test(mainSrc.replace(/\n/g, '')) || /info\.name/.test(mainSrc),
  '兑换 UI 用组名（成功提示 + 已兑列表）');
ok(/hit\.name \|\| `\$\{hit\.tier\} 类礼包`/.test(mainSrc), '第一批老码回退显示「A/B 类礼包」');

// ============================================================
// C. 图鉴 / 夜行记忆卡顿（用户第 3 条）
// ============================================================
sec('C、卡顿优化：世界渲染闸门 + 分块 + 缓存 + 空闲预热');

// C1 世界渲染闸门（主因：backdrop-filter 糊在每帧重绘的画布上）
ok(/const worldLive = inGame \|\| \(gameState === 'over' && deadT < 1\.4\);/.test(mainSrc),
  'tick 有 worldLive 闸门（不在打就停渲染；结算只保留倒地动画）');
ok(/if \(worldLive\) \{[\s\S]*?renderer\.render\(scene, camera\);/.test(mainSrc),
  'renderer.render 收进 worldLive 闸门');
ok(/if \(worldLive\) frog\.update\(dt, 0\);/.test(mainSrc), '冻结时连待机呼吸也省掉');
ok(/renderer\.render\(scene, camera\);\s*\n\s*\}/.test(mainSrc.split('function applyViewport')[1]?.split('}')[0] + '}'),
  '旋转屏幕后补渲染一帧（冻结期 setSize 会清画布）');

// C2 图鉴分块 + 签名缓存
ok(/const CX_CHUNK = 24;/.test(mainSrc), '图鉴分块常量（每帧最多 24 条）');
ok(/function cxSignature\(tab\)/.test(mainSrc), '签名函数（页签 + 本机图鉴档案）');
ok(/function cxBuildInto\(host, entries, done\)/.test(mainSrc), '分块建造函数（rAF 分批）');
ok(/cxCache\.frag\.cloneNode\(true\)/.test(mainSrc), '命中缓存 → 整块克隆秒开');
ok(/cxCache = \{ sig, frag: cxList\.cloneNode\(true\) \};/.test(mainSrc), '建完写缓存（下次就热）');
ok(/if \(cxBuild\) \{ cancelAnimationFrame\(cxBuild\); cxBuild = 0; \}/.test(mainSrc),
  '切页签 / 关面板会作废未完成的分批建造');
ok(/cxItem\(/.test(mainSrc), '条目构建抽成 cxItem（分批复用）');

// C3 空闲预热（用户建议：主界面停留时默默缓存）
ok(/const CX_PREWARM_MS = 1200;/.test(mainSrc), '预热等待 1.2 秒');
ok(/function scheduleCodexPrewarm\(\)/.test(mainSrc), '有预热调度函数');
ok(/scheduleCodexPrewarm\(\);/.test(mainSrc), 'showTitle 里调用（回主菜单就重新计时）');
ok(/if \(gameState !== 'title'\) return;/.test(mainSrc), '已进游戏就不预热（不抢前台）');
ok(/document\.createDocumentFragment\(\)/.test(mainSrc), '预热建在游离 fragment 上（不碰界面）');

// C4 遮挡做厚（菜单不再被主页面「透」出来）
ok(/\.tt-sub-scr\{background:rgba\(3,9,8,\.88\)/.test(cssSrc), '子面板遮挡从 .62 提到 .88（老 WebView 没模糊时也盖得住）');
ok(/\.tt-sub-scr\{[^}]*overflow:auto/.test(cssSrc), '子面板遮罩可滚（vh 算错也能滚到底）');
ok(/\.tt-sub-scr > \*\{margin:auto\}/.test(cssSrc), '卡片 margin:auto 居中（防 flex+overflow 裁顶）');

// ============================================================
// D. 夜行记忆「换一种说法」字号（用户第 4 条）
// ============================================================
sec('D、夜行记忆「换一种说法」字号');
const srAlt = (cssSrc.match(/\.sr-alt\{[^}]*\}/) || [''])[0];
ok(/\.sr-alt\{/.test(cssSrc), '有 .sr-alt 规则');
ok(/font-size:12\.5px/.test(srAlt), '字号 10.5 → 12.5px', srAlt.slice(0, 80));
ok(/rgba\(168,206,190,\.78\)/.test(srAlt), '颜色提亮（.58 → .78，暗字难认）');
ok(/line-height:1\.75/.test(srAlt), '行高 1.7 → 1.75');

// ============================================================
// E. boot 闪屏（用户第 5 条）
// ============================================================
sec('E、boot 闪屏：加载期标题页彻底藏住');
ok(/<div id="titleScr" class="title-scr off" style="display:none">/.test(htmlSrc),
  '标题页初始 display:none + .off（加载段不绘制）');
// 第 72 块：ensureLevelAssets（按关补载）也会写一次 loadingEl.classList.add，
// 而且它在文件里更靠前 —— 这里要的是 **boot 结尾** 那次，所以用 pop() 取最后一处。
ok(/showTitle\(\);/.test(mainSrc.split('loadingEl.classList.add').pop()?.slice(0, 200) || ''),
  'showTitle 挪到遮罩淡出那一刻（同步淡入）');
ok(/标题页在整个加载段都藏着/.test(mainSrc), '注释写清了为什么（两个全屏大图层抢合成器）');
ok(/titleScr\.style\.display = '';/.test(mainSrc) && /requestAnimationFrame\(\(\) => titleScr\.classList\.remove\('off'\)\)/.test(mainSrc),
  'showTitle 仍走 display 清空 + rAF 摘 .off（淡入过渡照旧）');

// ============================================================
// F. 公告栏右下角被裁（用户第 6 条，截图实证）
// ============================================================
sec('F、公告盒右下角：可滚 + margin:auto + --app-h');
ok(/#noticeOv,#promoOv\{overflow:auto\}/.test(cssSrc.replace(/\n/g, '')), '公告/宣传遮罩自己可滚（兜底）');
ok(/\.notice-box,\.promo-box\{margin:auto\}/.test(cssSrc.replace(/\n/g, '')), '公告/宣传盒 margin:auto 居中（防 flex+overflow 裁顶）');
ok(/\.notice-box,\.promo-box\{max-height:calc\(var\(--app-h,100vh\) - 24px\)\}/.test(cssSrc.replace(/\n/g, '')),
  '公告/宣传盒限高走 --app-h');

// ============================================================
// G. 全屏浮层真实高度（用户截图实证的根因：fixed+inset:0 按布局视口算）
// ============================================================
sec('G、全屏浮层 --app-h（截图：浮层只盖八成、底部露黑、卡片被切）');

ok(/:root\{--app-h:100vh\}/.test(cssSrc), 'CSS 侧默认 --app-h:100vh');
ok(/@supports \(height:100dvh\)\{:root\{--app-h:100dvh\}\}/.test(cssSrc.replace(/\n/g, '')),
  '有 dvh 的环境默认值升级成 100dvh');
const layerRule = (cssSrc.match(/#app,#touchLayer[\s\S]*?#promoOv\{height:var\(--app-h,100vh\)\}/) || [''])[0];
for (const sel of ['#loading', '.title-scr', '.tt-sub-scr', '#noticeOv', '#promoOv', '.result', '.modal', '.shop', '.event-card', '.bag-panel', '.story-read', '.pack-get', '.upgrade', '#meetCard', '#failTip', '#app', '#touchLayer']) {
  ok(layerRule.includes(sel), `全屏层 ${sel} 也走 --app-h`);
}
for (const [cls, h] of [['.ap-card', '48px'], ['.lv-card', '48px'], ['.sh-card', '36px'], ['.sr-box', '40px'], ['.pg-card', '24px'], ['.bag-panel .ap-card', '20px']]) {
  ok(new RegExp(cls.replace(/\./g, '\\.').replace(/ /g, '\\s*') + '\\{max-height:calc\\(var\\(--app-h,100vh\\) - ' + h + '\\)\\}').test(cssSrc.replace(/\n/g, '')),
    `${cls} 限高 → calc(var(--app-h) - ${h})`);
}
ok(/\.cx-list\{max-height:calc\(var\(--app-h,100vh\) \* \.52\)\}/.test(cssSrc.replace(/\n/g, '')), '图鉴列表限高走 --app-h');
ok(/\.st-list\{max-height:calc\(var\(--app-h,100vh\) \* \.44\)\}/.test(cssSrc.replace(/\n/g, '')), '夜行记忆列表限高走 --app-h');

// JS 侧：按 visualViewport 实时写 --app-h
ok(/function appH\(\)/.test(mainSrc), '有 appH()（取 innerHeight 与 visualViewport.height 较大值）');
ok(/function syncAppHeight\(\)/.test(mainSrc), '有 syncAppHeight()');
ok(/document\.documentElement\.style\.setProperty\('--app-h'/.test(mainSrc), '写到 :root 的 --app-h');
ok(/syncAppHeight\(\);[\s\S]{0,80}window\.addEventListener\('resize', syncAppHeight\)/.test(mainSrc), 'resize 时重算');
ok(/window\.visualViewPort|window\.visualViewport\) window\.visualViewport\.addEventListener\('resize', syncAppHeight\)/.test(mainSrc),
  'visualViewport.resize 时重算（工具栏收起的那一刻）');
ok(/orientationchange', \(\) => setTimeout\(syncAppHeight, 120\)/.test(mainSrc), '转屏后重算');
ok(/const w = window\.innerWidth, h = appH\(\);/.test(mainSrc), '渲染器尺寸也用 appH()（画布跟着盖满）');

// ============================================================
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fails.length) { console.log('失败清单：'); fails.forEach((f) => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
