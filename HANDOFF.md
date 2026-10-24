# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。**先读 §0「给新对话的话」，再按需查后面章节。**
>
> 最后更新：2026-10-24 · 线上 **v=78** · 第 67 块（民心跨档事件改到**本回合**结算链里播：随机事件 → 三选一 → 民心事件 → 商店；顺带修好「关底选完三选一直接 endGame、绕过回调」把队列丢掉的坑）已完成并推送。

---

## 0. 给新对话的话（2026-10-23 交接）

1. **当前基线**：v=78（第 67 块 = 用户报「民心提升的剧情还是没有弹」，定下新时序：**随机事件 → 三选一（这回合该有的话）→ 民心事件 → 商店**，没有三选一就随机事件一关立刻弹；原来它排在**下一回合**的奇遇时段、还让位给主线，玩家要多打一整回合才看到。改的时候抓出一个真 bug：`chooseUpgrade` 在关底**直接 `endGame(true)`**、绕过了 `upgradeAfterCb`，关底那条民心事件永远没人播（CDP 的 C 组抓到队列里还留着 `repGoodNames`）；再往前第 66 块 = 用户实测两条：**① 箭雨刚出时在教程里按了没反应**（教程最后一步要玩家真放一次，但 wtut 期间波次停着、拿武器又在回合结算之后 → 场上 0 只怪，而箭雨空地按不动 → 永远等不到，教程卡死；现在这一步自动补靶子）+ **② 随机事件 / 三选一的按钮「很迟钝」**（第 65 块把 `.hi-ok` 写成 `pointer-events:auto`，卡片收起后一块 398×39 的隐形按钮压在屏幕正中，吃掉中间那张卡和事件选项约三分之一点击；现在 `.tut-card` 收起时 `visibility:hidden` + 卡片内按钮统一「只有 .on 才吃点击」）；顺带修了「新手教程期间技能栏整套 display:none，而教程第 5 步讲的就是技能栏」与「箭雨 8 秒冷却跨局残留」；再往前第 65 块 = 用户实测八条：回血键改绿色十字 + 外圈充能环并加一次性提示卡 / 擦名者读条时奶蛙头顶百分比 HUD + 首次讲解卡 / 五六关伤害 ×1.35 血量 ×1.15 / 缝补小巫绿加号雨 / 雾鬼显隐差别拉大 / **修「边移动边点技能无效」的真 bug（隐形教程按钮 pointer-events 挡着）** / 关底民心事件不再被吞 / 技能解锁与关卡脱钩；再往前第 64 块新手教程 8 步 + 元素剑群体化，第 63 块第五关「草甸路口」+ 第六关「骨塔机房」）已推送，git 工作区干净，**没有挂起的半成品**。用户新需求来了再开工，别主动找活。
2. **节奏**：用户偏好**小步块状推进**——一块功能 = 一次提交 = 一个版本号（v=N）。**做完回归绿就立刻推送交给用户测**，用户反馈比自测更快更准。
3. **最容易翻车的五件事**：
   ① 发版**两处版本号**都要 bump（index.html 的 `main.js?v=N` / `style.css?v=N` + `js/*.js` 里所有 `import ...?v=N`）——漏一处就是「本地好线上炸」；
   ② **重复 id 假绿**（v=61 翻车）：复制面板 HTML 忘改 id，测试用全局 `getElementById` 点击会掩盖——block50 有「全页零重复 id」通用断言，新面板直接抄；
   ③ 公告在 loading 淡完 **+700ms** 才弹，测试截图先 `sleep(2600)` 再 `__game.notice.hide()`；
   ④ `jumpToRound/skipRound` **只在 adminOn 时生效**，不开管理员是静默 no-op；
   ⑤ 本地服务器必须 `run_in_background`；CDP 截图路径**不能含中文**；推送走 `git -c http.proxy=http://127.0.0.1:7897 ...`（先 curl 探代理，挂了改直连）。
4. **最新绿基线**（动到相关文件后要回归）：Node 17 套约 1300 项 + CDP 57 套约 1950 项全绿（第 67 块新增 `.tmp-block67-test.mjs` 40 项 / `.tmp-block67-cdp.js` 25 项），具体套件与数字见 §6。仓库内 15 套的最新数字：block52 141 / block53 46 / block54 54 / block55 91 / block56 86 / block57 112 / block58 18 / block59 49 / block63 119 / block64 164 / block65 95 / block66 51 / **block67 40** / gift 18 / story 76，全部 0 失败。
5. **已知既有失败（过期断言，别浪费时间查）**：`.tmp-camp-test.mjs` 84/22、`.tmp-boon-test.mjs` 133/13（偶发抖动）、`.tmp-eventui-test.js` 35/2、`.tmp-block18-test.js` 34/1、`.tmp-start-test.js` 33/15、`.tmp-block30-cdp.js` 42/8、`.tmp-ui-test.js` 15/7。
   **第 63 块已修红的**（原来是过期断言，现已改成与实况一致，全 0 失败）：`.tmp-level4-test.mjs` 90/0（雾鬼取消显形距离 / 奶半径 8.0 / 怪 15 / 法器 8 / 成就 41）、`.tmp-level3-test.mjs` 71/0（法器 7）、`.tmp-event-test.mjs` 105/0（事件 121 / 连锁 22 / 民心 0~120）、`.tmp-block52/56/57/59-test.mjs`、`.tmp-story-test.mjs`（18 夜 = 18 关，前 6 夜已绑关）。
   **第 64 块又修红的**：`.tmp-block56-test.mjs` 77/7 → **84/0**（全是第 56 块写死的旧数值：frostTime 1.2→1.6、chainRatio 0.35→0.45、严寒 +0.3→+0.6、导电 +10%→+20%、冰剑 tagline / 雷剑 45% / 商店冰剑文案）、`.tmp-stats-test.mjs` 70/0、`.tmp-rogue-unit.mjs` 144/0、`.tmp-econ-test.mjs` 80/0、`.tmp-event-test.mjs` 105/0、`.tmp-event-test.mjs` 的事件数 121→**131**。
6. **用户规则**：全中文；有疑问先问、有疑问不写码；README 与实况同步；美术资产优先 GitHub 现成 CC0；不做多角色；局外对局内影响要小（篝火每级 +1 生命这种量级）。
7. **新怪信息卡在 `?debug=1` 下默认关**（第 55 块）：它会冻结世界，老 CDP 一开局被拦。测这张卡的套件加 **`&meet`**（或 `__game.meetCard.setAuto(true)`）；正常游玩永远开。同类「首次提示型」弹窗以后照这个办：**生产默认开、测试显式开**。
8. **`el.hidden = true` 不一定能藏住元素**（第 60 块踩的）：只要给这个元素写过 `display`（`.tt-dot` 就是 inline-block），作者样式就压过 UA 的 `[hidden]{display:none}`，属性翻了但照样显示。style.css 顶部现在有全局 `[hidden]{display:none!important}` 兜底；**测试断言可见性请读 `getComputedStyle` / `getClientRects()`，别读 `.hidden` 属性**（签到红点就是这么假绿了一整轮的）。
9. **浮层别再上 backdrop-filter**（第 59 块）：全屏 blur 压着 WebGL 画布 → 手机上公告要几十秒才画出来、滚动像是「缓存被清空」。已经全站拆完，换成 .86~.90 的纯色遮罩；想要「玻璃感」用半透明底，不要用模糊。
10. **帧率自适应在 `?debug=1` 下默认关**（第 59 块）：要测得加 `&autoperf`。否则无头 SwiftShader 的低帧会把画质一路压到 min，截图测试全变样。UI 钩子在 `__game.ui.perf`。
11. **加设置项 / 主菜单按钮之后，回头跑 `.tmp-settings-test.js`**：它原来用**下标**点设置行，第 46 块插了「音效包」之后一直点在错行上（24/12 假失败了一整轮没人发现）。第 59 块改成按标题找行才修好，主菜单入口断言也从「排除法」改成了白名单——以后别再写排除法。
12. **第 63 块的四条新坑**：
    ① **裁 GLB 时 `images[].bufferView` 必须一起重映射**（`.tmp-shrink-glb.py` 已修）：漏了不会报错，模型只是**渲染成纯白** —— 裁完一定要看一眼渲染图（`.tmp-block63-test.mjs` 里有「贴图 PNG 签名」断言兜底）；
    ② **用 Python 改 `.js` 时 `open(..., newline='')` 不能省**：默认写法在 Windows 上会把文件改写成 CRLF，老测试里 `/a;\n    b;/` 这类正则集体静默挂（block56 就是这么红的）；
    ③ **测第五/六关必须先造档案**：关卡是锁的（要打通上一关）、第二关起「开局送环剑」也要 `profile.ringGot`。`profile()` 启动时读进内存 → 写 localStorage 之后**必须 reload**；否则点 `.lv-item` 是静默失败、游戏从第一关开始，断言全在错的数据上跑；
    ④ **第二关起开局会连排两段武器教程（`gameState='wtut'`）**，世界是冻的：起局后要循环点 `#wtSkip` 直到 `state==='playing'`；同理回合清空会弹升级卡，长测试要有个 `clearPanels()` 助手（见 `.tmp-block63-cdp.js`）；
    ⑤ **属性键名是 `armor`，不是 `defense`**（「防御」只是显示名）：写 `{ stat: 'defense' }` 不会报错，`stats.mods` 直接无视这个键 —— 文案承诺的加成静默归零。第 62 块两条民心事（`repGoodRepair` / `repGoodNames`）就这么空转了一轮，是 `.tmp-event-test.mjs` 的「所有 mods 的 stat 都在属性表里」断言抓出来的。**以后加永久加成，跑这套测试**。
13. **第 64 块的四条新坑**：
    ① **用户可见文字里的 `**加粗**` 会被原样显示**：`textContent` 不认 markdown。教程卡、图鉴怪描述、`swordKinds.desc` 全走 `textContent` —— 要么别写星号（改用「」），要么走 `guide.js` 里新加的 `richText()`（按 `**` 切段生成 `<b class="gd-b">`）。改完 grep 一遍 `js/*.js` 里的 `\*\*`；
    ② **`e.dot` 的时间字段是 `t`，不是 `time`**（`applyDot` 里写的是 `e.dot.t`）：测试钩子读 `.time` 会得到 `undefined`，断言「毒命中」全 false；
    ③ **测试文件自己的 `import '?v=N'` 也要跟着 bump**：模块升 v=75 后 `.tmp-block59/64` 直接 `TypeError: Cannot read properties of undefined`。批量 `sed -i 's/?v=74/?v=75/g' .tmp-*.mjs .tmp-*.js`（含上级目录）；
    ④ **改数值要全仓库扫旧文案**：商店 `shop.js` 的剑描述、图鉴 `codex.js`、`swordKinds.desc`、`guide.js`、武器教程 `WEAPON_TUT` 是五份独立的文案副本，改完数值只改一处 = 玩家看到「冻 1.2 秒」实际冻 1.6 秒。第 64 块就是靠 block56 的旧断言对拍才发现商店还写着 1.2 秒 / 35%。
14. **改横向特性要回头跑老套件**（2026-10-23 教训）：读秒锁让 block32 静默挂；公告升 `NOTICE_VER` 让 block45 挂；**技能键常驻 DOM**（`renderSkill` 只切 `display`）让 weapon/talk-skill/econ-cdp 数技能格假绿（必须 `filter(b => b.style.display !== 'none')`）；乞丐/商队两拍对话 + 3s 读秒让 `choose` 点 disabled 静默失败（加 `sleep(3500)`）。
15. **第 65 块的六条新坑**：
    ① **「淡出但留在 DOM」的浮层必须显式 `pointer-events:none`**（本轮唯一的真 bug）：`.tut-card` 收起后只是 `opacity:0`，里面 `#tcSkip / #wtNext` 却一直是 `pointer-events:auto`，位置正好压在技能栏最上面两格 → **整局点不动回血和箭雨**，而被压在下面的按钮看起来毫无异常。定位手法（值得背下来）：`document.elementsFromPoint(x, y)` 打印整条链 + 每层 `getComputedStyle(el).pointerEvents`，再看哪个 `opacity:0` 的家伙在最上面。现在规则是 `.tc-skip,.wt-next{pointer-events:none}` + `.tut-card.on .tc-skip,.tut-card.on .wt-next{pointer-events:auto}`；
    ② **`?debug=1` 会跳过叙述**（`DEBUG_SKIP_NARRATIVE`）：民心事件 / 主线剧情在 debug 下整段被吃，测它们必须加 **`&story`**。本轮「民心升档没弹事件」的第一现场就是这个假象，真正的问题只在关底；
    ③ **用 Python 往 JS 里写 `'\n'` 会被解释成真换行**：普通三引号字符串里写 `text: '…。\n'` 直接把一行撕成两行 → `node --check` 报 `Invalid or unexpected token`。要么写成数组（`text: ['第一句', '第二句']` + `.map()` 渲染，本轮就是改成这样），要么用 `r'''...'''`；
    ④ **`__game.arrowRain` 是调试壳子，不是系统本体**：`ready` 在包装对象的 **`state()`** 里（`__game.arrowRain.state().ready`），直接读 `.ready` 永远是 `undefined` → 断言假红怪，白等 3 分钟；
    ⑤ **`heal.state().ready` 在满血时是 false**（故意的：满血不给按，免得白扔 25 秒 CD）。测「CD 转好」要等 `state().cd <= 0.05`，或者先 `hurt()` 掉几点血；
    ⑥ **CDP 里造靶子别用 `minion`，且都要先钉血**：`minion` 是 `selfDestruct` 自爆怪，追到脸上就炸 —— 等了 8 秒 CD 再点箭雨时 `probe().n` 已经是 0，`fire()` 直接 return false，看起来像「点了没反应」（探针 v8 才抓出来：`pointerdown` 明明到了按钮上）。用 **`warrior`**（`selfDestruct:false`）+ `m.hp = m.maxHp = 9999`。雾鬼同理只有 2 点血，被拍死后**死亡淡出**会让 `mats[i].opacity` 停在 0.72 这种中间值，看起来像「显形不够亮」。
16. **第 66 块的四条新坑**：
    ① **「淡出但留在 DOM」这个坑一年能踩三次 —— 这次根治了**：第 65 块才给 `.tc-skip / .wt-next` 补了 `pointer-events:none`，第 66 块就发现新加的 `.hi-ok`（提示卡的「知道了」）漏了同一条，**一块 398×39 的隐形按钮正压在屏幕正中**，把事件卡选项和三选一中间那张卡吃掉三分之一点击（用户原话「变得很迟钝」）。现在三重保险：`.tut-card{visibility:hidden}`（**visibility 连命中测试都不参加，比 pointer-events 更彻底**）+ `.tut-card button{pointer-events:none}` / `.tut-card.on button{pointer-events:auto}` 兜底 + `.tut-card.hint-card.on{pointer-events:auto}`（点空白也能关）。**以后往卡片里加按钮不用再单独处理**。收起时延迟 `visibility 0s linear .22s` 保住淡出动画，打开时用 `.tut-card.on` 的 transition 覆盖掉延迟。
    ② **「按了没反应」先把 `ready()` 的每一个前置条件列出来**：箭雨教程卡死的根因不是 UI —— `wtut` 期间 `level.update` 不跑（波次停），拿武器又发生在回合结算之后，所以**场上一只怪都没有**；而 `arrowRain.fire()` 需要射程内有活怪。教训：**教程里要求玩家做的动作，必须保证这个动作的每个前提都成立**（本轮解法：`ensureRainTargets(dt)` 在 `wait:'rain'` 那一步没靶子就补两只 `warrior`，1.6s 节流）。
    ③ **静默失败等于「按键坏了」**：`fire()` 原来只返回 `false`，玩家什么反馈都没有。现在 `lastFail`（`'lock' | 'cd' | 'notarget'`）+ `pressSkill` 里对 `notarget` 冒一句 `fx.text('附近没有怪')`。**任何「条件不满足就不做事」的技能键都该给一句话**。
    ④ **模块级单例的 CD 不会自己清**：`arrowRain` 只有读档那条路 `reset()`，直接「重开一局」会把上一局没走完的 8 秒冷却带进新局。加 `resetCd()`（只清 cd、**不动 unlocked** —— 直接 `reset()` 会把 unlocked 也清掉，而 `prefillRing()` 见 `weapon.granted` 已是 true 会提前 return，箭雨就再也解锁不回来）。
    另：**测试里的 `?v=N` 别再写死**。`.tmp-block59` 因为写着 `?v=76` 和模块的 `?v=77` 形成两个实例（骨币读写打在不同对象上），这次改成**运行时从 index.html 读版本号再 `await import()`**，以后发版不用再改测试；`.tmp-block64/65` 的版本断言也统一成「以 index.html 为基准、全部一致」。

17. **第 67 块：结算链是「回调套回调」，别在别处硬编码终点**。民心事件改时序时发现 `chooseUpgrade` 里有一段
    `if (pendingRound >= level.totals.rounds) { endGame(true); return; }` —— **关底直接结算，`upgradeAfterCb` 根本没被调用**。
    于是「关底选完三选一 → 播民心事件 → 结算」这条链断在最后一步：队列里还留着 `repGoodNames`，玩家看不到。
    **教训：凡是 `if (...) { endGame(); return; }` 这种「提前收官」，都要问一句「它是不是绕过了本该调用的回调」**。
    现在关底也先跑 `upgradeAfterCb`，终点统一收在 `runShop` 的 `if (isLast) { endGame(true); return; }`。
    另：**改「什么时候发生」不要从队列下手，要从编排下手**。`repEventQueue` 本身没错（第 62 块排得对），
    错的是它被消费的位置（下一回合的 `runEvent` 里）。改成在 `handleRoundClear` 抽一个 `playRep(next)` 当唯一出口，
    顺序问题就变成一行 `showUpgrade(roundNo, () => playRep(runShop))` 的事。

---

## 0. 一句话

Three.js r160 的单摇杆幸存者肉鸽《奶蛙夜行》，纯静态站点（无构建、无 CDN、零依赖），GitHub Pages 发布。玩家是一只会走路的奶蛙，在荒草地上撑过 20 个回合。

---

## 1. 位置与环境

| 项         | 值                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------- |
| 本地仓库      | `C:/Users/MECHREVO/Desktop/班级网站/naiwa-rouge`（**独立 git 仓库**，绝不要把它的文件提进上级 class-website 仓库）          |
| 线上        | <https://luohuayu-design.github.io/naiwa-rouge/>                                                   |
| 远端        | `luohuayu-design/naiwa-rouge`，main 分支，Pages = main / root                                          |
| 本地服务器     | `cd naiwa-rouge && python -m http.server 8124`（**必须 run_in_background**，否则 shell 退出就死） |
| 测试脚本      | 老的在上级目录 `C:/Users/MECHREVO/Desktop/班级网站/.tmp-*.js`，第 41 块起的新套件在 `naiwa-rouge/.tmp-*.js`（回归资产，别删） |
| node      | `C:/Users/MECHREVO/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`                           |
| 无头 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe`                                            |

**网络坑**：github.com 常连不上（Pages 反而通）。推送失败时重试或用 `git -c http.proxy=http://127.0.0.1:7897 ...`。

---

## 2. 版本时间线（v=67 基线）

| 块组 | 版本 | 核心内容 |
| --- | --- | --- |
| 1~16 | v=20 | 角色/摇杆/战斗/波次/属性/环剑/奇遇商店/界面/金币元素剑/怪群/音效/图鉴成就/主菜单/教程/设置存档 |
| 17 | v=20 | 设置面板 + 存档续玩 |
| 18 | v=20 | 图鉴 + 成就 + 战绩 + 难度三档 |
| 19 | v=23 | 篝火 · 夜行骨币（局外成长） |
| 20 | v=24 | 第二关「骨塔庭院」+ 三巫师各一技 + 场景双主题 + 关卡参数化 |
| 21 | v=25 | 夜行诅咒（自选 debuff 换骨币倍率） |
| 22 | v=25 | 今日挑战 + 种子（日期哈希，无需服务器） |
| 23 | v=26 | 金币自动拾取 + 局外成长重做（篝火多级 / 永夜火种 / 金币折骨币 / 关卡倍率） |
| 24 | v=27 | 道具外观升级（炮台/地刺换 CC0 真模型，加载失败退回程序化） |
| 25 | v=28~29 | 诅咒可视化修补 + 商店买断售罄 + 音效补全 |
| 26~31 | v=31~35 | 环剑补满 / 篝火无限级 / 霜牢主祭重做 / 第三关焦土钟楼 / 管理员模式 / 事件大扩容（112 事件） |
| 32 | v=36 | 主线《笑不出来的那一夜》18 夜 2.3 万字 + 夜行记忆面板 + 印记四结局 |
| 33 | v=37 | 平衡性改版（夜行记忆按夜解锁 / 火种无上限加强 / 防御减法公式 / 无敌帧 0.9s / 第三关场地 19 + 生成放缓） |
| 34 | v=38 | 管理员选回合 |
| 35 | v=40 | 第四关「雾堤服务区」雾魉/跃行尸/缝合师 + 暖炉 + fog 主题 |
| 36 | v=41 | 相机减晕重做（死区跟随 + 速度感视野） |
| 37 | v=43 | 选关分步（选关 → 选难度 → 选诅咒） |
| 38 | v=44 | 管理员升级为沙盒（不落盘、退出还原） |
| 39 | v=45 | 读取存档（多存档列表） |
| 40 | v=47 | 局内「存档并退出」 |
| 41 | v=47 | 永久选择提示（篝火/火种各弹一次 + 常驻警示条） |
| 42 | v=48 | 主线剧情读秒（回话按钮锁 3s + 倒计时） |
| 43 | v=49 | 读秒放开到全部奇遇 + 修锁死真 bug |
| 44 | v=50 | 礼包兑换（纯前端离线码表，A 类 300 / B 类 100 各 10 个） |
| 45 | v=51 | 公告（进主界面自动弹 + 今日不再 + 强制回看 + QQ/网址复制） |
| 46 | v=52 | 抽象奶蛙音效包（通关第一关解锁，4 段奶蛙叫声替换 8 位置） |
| 47 | v=57 | 新武器「箭雨」+ 武器解锁原则（第二关起解锁） |
| 48 | v=58 | 加载页轮播 |
| 49 | v=58 | 种子挑战（输文字当种子，同种子同关） |
| 50 | v=59 | 主菜单「属性」页（3D 奶蛙展台，可拖动旋转） |
| 51 | v=60 | 图鉴附怪物贴图（离线渲染 13 张 webp） |
| 52 | v=62 | 13 只怪一只一个模型（后 9 只换 Quaternius，改名） |
| 53 | v=63 | 用户实测七条（概率事件真结果 / 二三关提亮 / 三只怪尺寸 / 箭雨教程 / 轮播 1.8×） |
| 54 | v=64 | 用户实测四条（布袋金币 30→10 / 主菜单两行 / 篝火改名篝火商店 / 倒下温馨提示） |
| 55 | v=65 | 兑换码大全 txt / 新怪物信息卡 / 只记打斗时长 |
| 56 | v=66 | 用户五条（生命条统一 / 后续关卡带环剑 / 万剑齐发 CD 制 / 冰雷加强 / 技能栏上移） |
| **57** | **v=67** | **宣传有礼活动 / 新增 20 兑换码 / 图鉴夜行记忆卡顿优化 / sr-alt 字号 / boot 闪屏与浮层修复** |
| **58** | **v=68** | **局外商店 · 宝箱：花骨币买木/银/金三档，开箱直接随机给一次永久属性（诅咒=强制负面）；高品箱低诅咒率且能出永久法器 / 技能CD缩短；效果落 metaShop，每局开局经 applyMeta 注入（属性走 src='meta'，法器经 relics.restore，技能CD经 weapon/arrowRain.setCdMul）** |
| **59** | **v=69** | **用户六条：盾斧兽人/孢生菇视觉 ×2.6（碰撞 ×1.5）/ 每日签到（周单位，20 一天 + 3 天 100 + 6 天 200）/ 全站拆掉 backdrop-filter + 滚动图层 + legendPulse 收成一次性 / 帧率自适应自动降档 / 修第 58 块诅咒记成正数的真 bug + mods 注入合并** |
| **60** | **v=70** | **hotfix：签到后红点不消失 —— `.tt-dot{display:inline-block}` 压过 UA 的 `[hidden]{display:none}`，属性翻了但元素照样画；加全局 `[hidden]{display:none!important}` 兜底，`sign.btn()` 调试钩子改读 computed 可见性（原来只读属性才假绿）；顺手把「本周 1 / 7 天 · 今天已签」缩回一行（窄按钮换行把整排撑错位）** |
| **62** | **v=72** | **阶段一：盾斧兽人 / 孢生菇缩到战士 1.4 倍（1.90）；雾鬼 / 雾猎狼 / 缝补小巫统一到 1.85；缝补小巫奶半径 3.2→8.0 且不再画判定圈（只给被治的怪冒绿光）；雾鬼删掉「贴脸强制显形」；奶蛙音效包感知音量 ×1.8（VOICE_GAIN）；民心上限 100→120 + 商店折扣下限放到 0.65；存档列表排序修正在块 61** |
| **63** | **v=74** | **第五关「草甸路口」**（四向路口刷怪 `lanes:4`，可以提前站位；新怪**擦名者**读条 2.6s 擦走环上一把剑、得手后往场外跑，杀掉还回来 / 跑掉永久没；新法器**路口灯**每 3~4 秒照亮一圈，唯一反隐手段）+ **第六关「骨塔机房」**（地上 6 块**漏电地板**周期通电、通电前 0.8s 橙光预警，站上去每 0.6s 掉 1 血且不吃无敌帧；新怪**重启体**死后躺 4s 半血重启、最多 2 次；新法器**绝缘斗篷**免地板伤害并把电导给身边的怪）+ 第 62 块阶段二（**回血技能**第 4 关通关永久解锁 / **民心专属事件**涨跌档各一套 9 条 / **攻略面板**战败后可看）+ 骨币倍率补齐 4~6 关 + 商店新增 `needLevel` 门槛 + 右上角 HUD 关卡名不再写死** |
| **64** | **v=75** | **① 新手教程 4 步→8 步**（走路 / **判定环** / 打第一只 / 三选一 / 属性面板 / 技能栏与 CD 读秒 / 背包 / 开局），推进从「按下标」改成「按 `kind`」，讲解步用 `#tcNext` 手动翻；**② 环剑恢复顺序随机化**（导出纯函数 `pickMissingKind(owned, ringKinds, rng)`：从「库存减环上」的差集里随机挑，属性剑不再被先得的铁剑稀释）；**③ 元素剑群体化**（毒/冰/血/震统一「命中点 3.5 格内一圈」，直接命中那只不吃溅射，血剑按一圈总伤害回血；雷剑保持全场连锁并 `return`，不进圆圈分支；新增武器属性 `elementRadius` 3.5 格 / `elementRatio` 50%）；**④ 剑系 9 张卡约翻倍**（剑伤害 30→60% / 暴击 0.08→0.16 / 吸剑 40→80% / 转速 25→50% / 锻剑 −1→−2 秒 / 淬毒 0.05→0.12 / 严寒 0.3→0.6 / 导电 0.10→0.20 / 回春 0.05→0.10）；**⑤ 属性面板加第三页「技能」**（3 个技能 + CD 时长 + 当前状态 + 未解锁写清条件）；**⑥ 技能 CD 倒计时两位小数**（`skills.js` 的 `fmtCd`，原 `Math.ceil`）；**⑦ 主线番外事件 10 条**（`js/eventsSide.js`，全部带 `cond(ctx.story)`，看过对应夜才进池；事件总数 121→**131**）** |
| **65** | **v=76** | **用户实测八条**：①（真 bug）**移动中点技能无效** —— 收起的教程卡 `opacity:0` 但 `#tcSkip/#wtNext` 仍 `pointer-events:auto`，正好压在技能栏最上两格；改成默认 `none`、只 `.tut-card.on` 时 `auto`；② **回血键改绿色十字 + 外圈充能环**（`skills.js` 新增 `art` 内联 SVG / `ring:true`，环周长 163.36）＋**一次性提示卡**（`HINTS` 表 + `hintPause` 式 `gameState='hint'`，世界真冻结，档案 `profile.tut`）；③ **擦名者读条百分比 HUD**（`enemies.eraseCast()` 取进度最高那只 → 奶蛙头顶 `#castHud`，≥65% 变 `warn` 粉 + 脉动；首次弹讲解卡）；④ **五六关难度**：`scale.hpMul 1.15 / dmgMul 1.35`（只抬这两关，前四关不动）；⑤ **缝补小巫绿加号雨**（`fx.plus()` 共享 96×96 贴图，每 0.16s 冒一个、连冒 1.4s，最多 10 只怪）；⑥ **雾鬼显隐差别**（隐身 `ghostOpacity 0.16→0.05` + 显形自发光 0.3→2.2）；⑦ **关底民心事件不再被吞**（`handleRoundClear` 的 `isLast` 分支先播 `repEventQueue` 再结算）；⑧ **技能解锁与关卡脱钩**（`prefillRing()` 重写 + 档案 `rainGot`：只要有记录 ≥ 第 2 关或 `rainGot` 就开局送环剑 + 箭雨，重打第一关也带着）** |
| **66** | **v=77** | **用户实测两条（都是上一块留下的）**：① **箭雨刚出时在教程里按了没反应** —— `WEAPON_TUT.arrowrain` 最后一步要求真放一次，但 `wtut` 期间 `level.update` 不跑（波次停）、拿武器又发生在回合结算后 → 场上 0 只怪，而 `arrowRain.fire()` 需要射程内有活怪 → 永远等不到 `strikeCount>0`，教程卡死。修：`ensureRainTargets(dt)`（`wtTick(dt)` 里、只 `wait:'rain'` 那步、1.6s 节流、补 2 只 `warrior`）+ `lastFail`/`hasTarget` + 空地按下去冒「附近没有怪」；② **事件 / 三选一按钮「很迟钝」** —— 第 65 块把 `.hi-ok` 写成 `pointer-events:auto`，卡片收起后 398×39 的隐形按钮压在屏幕正中、吃掉中间那张卡和事件选项约三分之一点击。修：`.tut-card{visibility:hidden}` + `.tut-card button{pointer-events:none}` / `.tut-card.on button{auto}` 兜底 + `.hint-card.on{auto}`（能点空白关）；③ 顺带：`skillCtx().playing` 加 `tutorial` + `startTutorial()` 里 `prefillRing({ quiet: true })` / `healSkill.setUnlocked()` / `arrowRain.resetCd()`（开局初始化原先全在 `endTutorial → startPlay` 里，教程第 5 步讲技能栏时整栏是空的）；④ 顺带：`arrowRain.resetCd()`（8 秒冷却原来跨局残留）；⑤ 测试：`.tmp-block59` 改成运行时读版本号，`block64/65` 版本断言改成与版本无关 **|**
| **67** | **v=78** | **用户：「民心提升的剧情还是没有弹」**。定案时序：**随机事件 → 三选一（这回合该有的话）→ 民心事件 → 商店**；这回合没有三选一的，随机事件一关就立刻弹。原来 `repEventQueue` 排在**下一回合**的奇遇时段、还让位给主线 —— 玩家要多打一整回合才看到，撞上主线还会一路往后推，体感就是「根本没弹」。实现：`handleRoundClear` 里抽出一个 `playRep(next)`（唯一出口，播完递归接队列里的下一条），`runUpgrade` 改成 `showUpgrade(roundNo, () => playRep(runShop))`、无三选一时直接 `playRep(runShop)`，`runEvent` 的关底分支简化为 `runUpgrade()`。**顺带抓出真 bug**：`chooseUpgrade` 在关底直接 `endGame(true)` 并 return，`upgradeAfterCb` 根本没被调用 → 关底那条民心事件永远留在队列里（CDP 抓到 `queue` 还是 `['repGoodNames']`）；现在关底先跑回调、由 `runShop` 的 `if (isLast) { endGame(true); return; }` 收尾 **|**
| **61** | **v=71** | **读取存档列表改成「最近的在上」**（原升序 + 面板头还写着「早的在上」，已同步改成「最近的在上」）；顺手修 `resumeGame()` 无 uid 兜底分支的同类错误（注释写取最近一次，实际升序 + `[0]` 拿到最旧的那份）** |

> 每个块的实现细节、测试坑、真 bug 教训已沉淀进上面的铁律 / 调试钩子 / 文件地图与代码注释，不再单列。

---

## 3. 文件地图（js/）

| 文件 | 职责 |
| --- | --- |
| `main.js`（~6700 行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改之前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、难度 `DIFFS`、`startAt`（读档）、升级/商店节点 |
| `stats.js` | 通用属性引擎（`createStats(defs)`），主角 14 项 / 武器 **12 项**两套实例 |
| `enemy.js` | 13 只怪（一只一个 glb）、`CLIP_FAMILIES` 动作家族翻译、配件挂骨骼、血条统一 `BAR_W=1.5`、冰冻 `freezeT` |
| `weapon.js` | 环剑、5 种元素剑；**万剑齐发 CD 制**（n=owned.length、不动环绕）；**第 64 块：毒/冰/血/震统一走 `aroundPoint()` 炸一圈（`elementRadius` 3.5 格、`elementRatio` 50% 溅射）**，雷剑 `chainTargets(e, Infinity, Infinity)` 全场连锁后 `return`；恢复顺序走导出的 `pickMissingKind()` 随机挑 |
| `turret.js` / `relics.js` | 弩炮台（上限 3）、地刺/霜环/暖炉（各 3 级） |
| `upgrade.js` | 28 张升级卡（含 rarity 0~4） |
| `shop.js` | 18 件货、按品质加权摆 4 件 |
| `events.js` + `eventsExtra.js` + `eventsSide.js` + `repEvents.js` | 99 随机 + **10 条主线番外（第 64 块）** + 13 老连锁 + 9 民心事（第 62 块）= **131 事件**；抽签池是 `RANDOM_EVENTS`（`[...EVENTS, ...SIDE_EVENTS]`），`ALL_EVENTS` 才含连锁与民心。后面三个文件只放数据 |
| `eventsSide.js` | **主线番外 10 条（第 64 块）**：`cond(ctx.story)` 读 `seen/read` 判断玩家看过对应夜没有，看过才进抽签池（例：爷爷的锅 s01、047 的按钮 s02、阿苏跑腿 s04、阿静倒酒 s07\|s10、空白页 s11、小满的铅笔 s16） |
| `campfire.js` | 篝火/骨币（九簇 × 无限级线性阶梯价 `×(1+0.35×level)`） |
| `boons.js` | 永夜火种（16 张永久卡 + 层数上限 + 品质抽签 + `boonPending` 待领次数） |
| `curses.js` | 夜行诅咒（六条 debuff、倍率加法叠加） |
| `seed.js` | 种子与每日挑战 |
| `rarity.js` | 五档品质唯一真相源 |
| `profile.js` | 本机档案聚合层（键 `naiwa_rouge_profile_v1`）；管理员沙盒靠 `setSaveSuppressed` 关掉落盘 |
| `runSave.js` | 读取存档（键 `naiwa_rouge_runs_v1`） |
| `gift.js` | 礼包兑换（`GIFT_TABLE` 只存 16 位哈希 + 骨币；明文码在 gitignore 的 `gift-codes.local.md` / `兑换码大全.txt`） |
| `voicepack.js` | 音效包（4 段奶蛙素材区间 + 8 个位置 + 裁切表） |
| `arrowRain.js` | 箭雨（单技能 8s CD、自动落群箭，伤害走 wstats） |
| `statView.js` | 属性页 3D 展台（独立 canvas，只有开着才 update） |
| `signin.js` | 每日签到（第 59 块）：周一起算的 7 天进度、20/100/200 三档奖励、跨周清零、脏数据过滤 |
| `skills.js` | **技能注册表（第 64 块扩充）**：`visible/ready/progress/press/cdText` + `cd/cdNow/desc/unlockNote/state`；`fmtCd()` 统一两位小数（原 `Math.ceil`） |
| `story.js` | 主线 18 夜数据 + 印记/结局 + 调度（加新关只改对应夜的 `levelId`+`atRound`） |
| `codex.js` / `achievements.js` / `audio.js` / `joystick.js` / `scene.js` / `frog.js` / `fx.js` / `gold.js` / `input.js` / `rangeRing.js` / `swordKinds.js` / `guide.js` | 图鉴渲染数据 / **41 条成就** / 音频引擎 / 摇杆 / 场景 / 角色 / 特效 / 金币 / 输入 / 范围环 / 剑种（`tagline`+`desc` 走 textContent，**别写 markdown 星号**）/ 攻略面板（含 `richText()` 加粗渲染） |
| `assets/` | `rigged.glb`（奶蛙）、`weapons/`、`monsters/`（13 个 glb，共 5.0MB，boot 全量预载）、`props/`（CC0 道具）、`codex/*.webp`（13 张图鉴缩略图）、`audio/` |

---

## 4. 铁律（违反会返工）

1. **全中文**：注释、文案、提交信息、README 都要中文。
2. **有疑问先问，不要边猜边写**。
3. **资产优先 GitHub 现成 CC0**：需要 3D 模型/贴图/UI 形状贴图时先找现成的（KayKit / Quaternius 等），程序化只作加载失败兜底。
4. **数值改动必须跑回归**：Node 5 套 + 相关 CDP 套（见 §6）。
5. **属性公式**：`(base + flat) × (1 + Σpct)`；`base = 0` 的属性只能用 flat。
6. **两套属性表**：主角 `STAT_DEFS`（14 项）、武器 `WEAPON_STAT_DEFS`（**12 项**，第 64 块新增 `elementRadius` 元素波及 / `elementRatio` 元素溅射）。剑击只读 `wstats`。
7. **品质是抽签权重**，不是先摇档再挑卡。
8. **`handleRoundClear` 只允许存在一份**（同名 function 重复声明会静默覆盖）。
9. **一件武器只教一次**（`localStorage['naiwa_rouge_wtut_v1']`）。
10. **README.md 必须与实况同步**。
11. **测试用 `?debug=1` 默认不落存档**（要落档加 `&keepsave=1`）。
12. **新内容「先推送再交给用户测」**：功能做完 + 本地回归绿 → 立刻 commit & push，把线上地址和「改了什么 / 怎么试」交给用户。
13. **发版必须同时 bump 两处版本号**（index.html + js 内所有 import 的 `?v=N`），否则旧缓存会让线上炸。

---

## 5. 调试钩子（`?debug=1` 才有 `window.__game`）

```
stats / wstats / enemies / level / weapon / fx / input / pos / scene / renderer
getState()            当前 gameState（title/playing/tutorial/wtut/over）
level.roundNo / phase / shouldUpgrade(n)
enemies.spawn(type, {x,z}, opts) / all() / takeDamage(e,n) / aliveCount()
ui.settings() ui.set(k,v) ui.quality() ui.renderCfg() ui.joy() ui.shake() ui.audio()
run.save() run.load() run.clear() run.resume()
codex.add(g,id) codex.count(g,id) codex.summary() codex.entries(tab) codex.show() codex.cache()
ach.try(id) ach.has(id) ach.list()
weapon.grant() / orbitingCount / flyingCount
weapon.fireReady / fireCdLeft / fireCdTotal / fireCdProgress   ← 对象上的 getter，不能加括号；__game.fireReady() 才是钩子函数
upgrade.isOpen() / roll / shop.cards / hurt(n) / win()
runCurses() / setCurses(ids) / curseMul() / curseDmg()
boons.list() / stacks(id) / pending() / grant(n) / roll(luck) / take(id) / apply() / show() / close() / totalStacks() / reset()
camp.level(id) / maxed(id) / list()
seedInfo() / setSeed(n) / daily.{...}
adminOn() / setAdmin(b) / ADMIN_CODE='615265'   ← 沙盒：金币/骨币钉 ∞
jumpToRound(n) / skipRound()   ← 仅 adminOn 时生效
gift.{state,open,redeem,list} / notice.{show,hide,seenReset} / pack.{...} / arrowRain.{...}
statPage.{show,ready,yaw,rows} / promo.{show,hide,open,art,ver,key,clear} / render{live,frames,appH,appHpx}
sign.{show,hide,open,state,cells,signed,do,btn} / ui.perf{auto,state,setFps,tick,reset} / meta.apply
block64.tut{step,total,kind,title,text,stepText,nextHidden,next,start,skip}   ← 教程 8 步（截图/断言用）
block64.panel{open,close,tab,rows,notes,sub}                                  ← 属性面板三页
block64.skillNums() / ringKinds() / ringOrder() / elemHit(kind,type) / weaponStats() / grantRing()
block65.hint{open,queue,seen,show,close,pump,forget,text,visible}   ← 一次性提示卡（回血 / 读条）
block65.cast{info,start(p),hud}                                    ← 擦名者读条：start 造一只并推进到 p 进度
block65.buttons() / rainUnlocked() / rainObtained() / ringObtained() / prefill()
fx.counts()                                                        ← { total, plus }：数屏上有几个绿加号
enemies.eraseCast() / wraithCount() / hiddenCount() / menderCount()
arrowRain.lastFail() / arrowRain.hasTarget()                       ← 第 66 块：箭雨为什么没放出去
```

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e=>__game.enemies.takeDamage(e,999))` 清场（**注意：清光会弹三选一，挡住后续操作**）。

---

## 6. 测试

**Node 15 套（纯逻辑，秒级）**：`node .tmp-stats-test.mjs`（属性）/ `.tmp-rogue-unit.mjs`（回合升级概率）/ `.tmp-econ-test.mjs`（经济商店事件）/ `.tmp-event-test.mjs`（**131 事件** + 番外剧情门槛）/ `.tmp-rarity-test.mjs`（品质幸运）/ `.tmp-block64-test.mjs`（**164 项：武器属性表 / 剑系卡翻倍 / 元素说明 / 番外分布 / 技能元数据 / 攻略面板 / 教程 8 步 / 恢复顺序分布 / 版本号**）/ `.tmp-block65-test.mjs`（**95 项：pointer-events 遮挡回归 / 五六关难度乘数 / 回血键 SVG+环 / 提示卡文案与档案 / 雾鬼透明度 / 绿加号 / 关底民心队列 / 技能解锁脱钩 / 版本号**）/ `.tmp-block66-test.mjs`（**51 项：卡片 visibility 命中测试 / 按钮兜底规则 / 箭雨教程补靶子 / skillCtx 含 tutorial / lastFail+hasTarget / resetCd 不跨局 / 版本号**）/ `.tmp-block67-test.mjs`（**40 项：民心事件本回合播放 / 顺序 = 事件→三选一→民心 / 无三选一立刻弹 / 关底跑回调不绕过 / 队列递归 / debug 不留垃圾 / 池子 9 条 / 版本号**）/ `.tmp-camp-test.mjs`（篝火骨币）/ `.tmp-level2-test.mjs`（第二关）/ `.tmp-level3-test.mjs`（第三关）/ `.tmp-level4-test.mjs`（第四关）/ `.tmp-admin-test.mjs` / `.tmp-eventui-test.js` / `.tmp-curse-test.mjs` / `.tmp-boon-test.mjs`（永夜火种）。

**CDP 端到端（需先起 8124；一次只跑一套，套间跑 `.tmp-cdp-clean.js`）**：开局/战斗/菜单/设置/存档续玩/图鉴/成就/武器教程/炮台法器/`block18~57` 各块专项/`admin`/`seed`/`pack`/`promo`/`start-test`/`block64`/`block65`/`block66`/`block67` 等共 **57 套**，约 1950 项。脚本在上级目录（第 32 块前）与 `naiwa-rouge/`（第 41 块起）。

**跑全量回归的正确姿势（2026-10-21 定）**：
- 启动参数带 `--num-raster-threads=2 --renderer-process-limit=1` + 关后台节流（SwiftShader 会按核数开线程打满 CPU）。
- 每套之间跑一次 `node .tmp-cdp-clean.js` 清孤儿 chrome。
- **串行，一次只跑一套**（用户明确要求别占满 CPU）。
- **SwiftShader 慢很多，必须轮询等待不能固定 sleep**；无头截图路径不能含中文；`waitFor` 必须定义在 IIFE 内部。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [x] 第 19~57 块全部完成并推送（见 §2）
- [x] 第五关「草甸路口」/ 第六关「骨塔机房」（第 63 块）
- [x] 第 58~65 块（宝箱 / 签到 / 帧率自适应 / 新手教程 8 步 / 回血键与提示卡 / 读条百分比 / 五六关难度）
- [ ] **主菜单 3D 背景**（场景和模型都在，只是没跑 render）
- [ ] 第七关（主线 s07 起还有 12 夜的 `levelId:null` 等接）
- [ ] 更多武器/技能（`skills.js` 的 SKILLS 表，技能栏还剩 5 格）
- [ ] 性能优化（怪物合批/假阴影/视锥剔除）—— **等用户点头再动**
- [ ] 不做：主菜单排行榜（无后端）、商城/皮肤、广告位、多角色
