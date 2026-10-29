# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。**先读 §0，再按需查后面章节。**
> 最后更新：2026-10-29 · 线上 **v=137** · 第 121 块（连杀断连改接战斗秒表）；上一块 120（进关进度条复位）、119（首访加载兜底）、118（第十一关补完 / 商店刷新 / 火种法器簇 / 盲盒法器属性）。
> 本文件只记**结论与坑**；逐块实现细节看代码注释与 `git log` / `git show`。

---

## ⚠️ 0-1. 另一组在同步开发（动手前必看）

本项目此刻有**两个对话并行开发**，文件级占位如下，**别动别覆盖别重命名**：

| 归属 | 文件 / 区域 |
| --- | --- |
| **另一组（合成台）** | `js/crafting.js`（**文件名已被占用**）、`DESIGN.md`、`.tmp-crafting-test.mjs` |
| 另一组之后会碰 | `main.js` 的 **`onDeath` 区域** 与 **暂停 / 弹窗（`.modal`）区域** |
| 本侧（第 116 块） | `js/traffic.js`、`js/latte.js` 为**另一组已写好、本侧接线**；`main.js` 已把击杀记账压成 `onDeath` 里**唯一一行** `onKillExtra114(e);` |

- 本侧已主动把冲突面收到最小：`onDeath` 里只多这一行调用（函数定义在 `createMineSystem` 之后），另一组改这段时**绕开这一行**即可。
- 谁 push 完**要通知对方 pull**：本侧 push 后会立刻告知；收到「另一组已 push」的通知后再 `git pull --rebase`，不要盲目 `pull` 冲突文件。

---

## 0. 给新对话的话

### 0.1 当前基线：v=137（第 121 块；下面 1~6 是第 116 块打下的底子，第 118 块补第十一关，119/120 修加载，121 修连杀计时）

剧情底座是 `story.js` 的 s12。第十二关把「看不见」换成「躲车流」——两条平行车道 + 中距放风筝的新怪 + 一个区域增益法器，与前十一关机制正交。

1. **车流（`js/traffic.js`）**：`LEVEL_12.traffic = {lanes:[-4.5,4.5],width:2.4,warn:2.2,speed:18,damage:2.0,enemyPct:0.36,doubleFrom:13}`。两条平行车道，配送车**2.2 秒预警后驶过**（预警圈走 `rangeRing` 体系）；**撞玩家掉 2 血（不秒杀）**、**撞怪高额伤害 = max(10 + round×1.5, 血×0.36)**（撞死算玩家击杀，喂成就）。前八回合单车、**第 13 回合起错时双车**。接口：`build(next, arena) / update(dt, {playerPos, playerRadius, roundNo}) / clear() / spawn() / list() / config()`，**零 import 业务模块**，只靠注入回调（`hurtPlayer / onEnemyHit / onPlayerHit`）。
2. **新怪「加急袋鼠」（`kangaroo`，程序化模型 `proc:'kangaroo'`）**：**不打人（`damage:0`）**，中距离 `keepDistance 4.5` 放风筝；读条 `rush.time 6` 秒给**另一只怪挂「加急」**（`e.hasted = {t, hasteMul 1.5, speedMul 1.3}`，持续约 6 秒：移速 ×1.3、出手频率 ×1.5，在 `moveToward` / `cdOf` 里乘算、`updateOne` 里递减）。**击杀掉咖啡增益**（`onPickup`），是优先击杀目标。读条环复用 `collector` 的 `e.waitRing` 字段。
3. **新法器「苔藓拿铁」（`js/latte.js`，12 号）**：解锁技能栏**第 6 键**，主动放一块区域增益 `LATTE_BASE = {cd 30, cdMin 14, radius 3.2, duration 5, haste 0.2, move 0.15, slow 0.28, cap 1, capMax 3}`——**攻速 +20% / 移速 +15% / 敌人减速 28%**。三条成长：**3 级法器**（`setRelicLevel`）+ **6 张升级卡**（`applyCard` 六通道 `duration/radius/haste/slow/cd/cap`）+ **2 件一次性商店货**（`buyFoam` 奶泡 +2 秒 & +8% 减速、`buyThermos` 保温杯 +1 杯 & −4 秒）。`snapshot()/restore()` 进存档。
4. **回归旧怪三选**：收件人（`addressee`）、誊录员（`clerk`）、蛮牛（`charger`）—— 铁律「新关卡至少带 2~3 只旧怪」。
5. **节奏**：hpMul 1.55 / dmgMul 1.85；R1-4 学习（少怪）、R5-8 旧怪、R9-12 墨线封路、R13-20 双车高压。
6. **数量位移**（改老套件的清单）：关卡 11→12、怪物 27→28、升级卡 93→99、商店 31→34、法器 11→12、技能键 5→6、程序化怪 3→4、成就 114→118（`clear_12 / kangaroo_10 / traffic_50 / traffic_run_20`，全清 **8280**；`clear_all` 文案改「十二关皆通」）。

### 0.2 最近几块（细节见 §2 与 git log）

- **121 · v=137**：**连杀不再被暂停时间冲掉**。连杀的「断连计时」原来读 `performance.now()`（真实时钟）：在商店 / 事件对话 / 背包里停多久都记进断连里，一出店第一帧 `idle` 就超阈值，热度被整段暂停时间刷掉。现在 `createHeat` 注入 `now: () => elapsed`（局内战斗秒表），暂停期间热度原样冻结。顺带复核了「一局用时」：它本来就走 `elapsed`，**只算打斗** —— CDP 实测商店 / 背包 / 事件卡 / 三选一 / 合成台 / 提示卡各停 2.2 秒，秒表涨幅全是 `+0.000`（改前后一致）。
- **120 · v=136**：**进关进度条复位**。`setProgress` 是「只升不降」的（启动阶段用它抵消真实进度晚到），启动结束时 `_progressShown` 已经钉在 1.0；`ensureLevelAssets` 再调 `setProgress(0.05)` 时就永远是满格 —— 表现是「进关进度条始终 100%」。新增 `resetProgress(p)` 直接压回起点，进关改走它。CDP 实测（本地服务器给 glb 加 700ms 延迟 + 启动阶段屏蔽全部 glb，逼出进关补载）：进度条从 74%→83%→85%→87% 跟着 `n/11` 走，不再满格。
- **119 · v=135**：**首访加载 0% 兜底**。症状：第一次打开永远停在 0%、关掉重进就快（本质是 100+ 个 js 模块还没下完，`main.js` 一行没跑；第二次命中 HTTP / SW 缓存）。全部改动在 `index.html` 的兜底脚本：① 模块下载期间进度条自己爬到 **55%**，`main.js` 的 `_progressShown` 改成从当前显示值接着算（否则真实进度一到又把条拽回 0）；② **连续 6 秒没有任何新 js 下完**才判定卡死并 `location.reload()`（同 tab 最多 2 次、2 分钟内计数；成功启动清 `sessionStorage['naiwa.bootRetry']`）；还在慢慢下载就不重载。CDP 用 `Network.setBlockedURLs(['*main.js*'])` 复现验证：正常启动 0 重载，阻断后约 7s 自动重载、第 3 次退回「黄字 + 手动重试」。
- **118 · v=133**：第十一关补完 —— ① 新法器 **守夜烛**（`candle.js`，第 7 键）：脚下点灯 6 秒，圈内灼烧 + 减速，**圈内的雾被 `fog.cut` 照散**；② 新法器 **落款**（`mark.js`，第 8 键）：点名最近的怪持续掉血，死亡时**墨爆**（半径 1.8）；③ 两件各 5 张三选一卡 + 2 件一次性商店货，`rollChoices` 用 `candleOwned/markOwned` 拦池；④ **商店付夜行骨币刷新**（`shopRefreshCost`：6→10→15→25→39，本次进店递增、离店 / 进店清零）；⑤ **火种加 14 簇逐件法器增幅**（核心九簇不变，`CAMP_CORE` 仍 9；`campRelicAmp()` 汇总）；⑥ **盲盒补法器三条**（器魂 / 广域 / 疾器 + 负面），`metaRelicAmp()` 与火种合并后开局 `setRelicAmp()` 灌给所有法器引擎；⑦ 新引擎独立测试 `.tmp-block118-test.mjs`（69 项）。**v=134 热修**：`resetRunState()` 里残留了一行第 117 块删掉的 `renderHeatBar(0)`，任何关卡 `beginGame` 都会抛 `ReferenceError` 卡在标题页 —— 已删除该调用（同类「删了函数忘删调用」的坑：删 UI 组件时 grep 整个 `js/` 再收工）。
- **117 · v=132**：局内交互整理 —— ① 声音开关从局内 HUD 移进局外「设置」页（新增「声音 开/关」一行，M 键仍可用）；② 按用户要求**删除「剑转」按钮与剑阵反向机制**（`swordReverse.js` 已删，`weapon.js` 去掉 `orbitSpeedMul`）；③ **连杀不再用进度条**，改为屏幕中央浮现「连杀 ×N + 移速/攻速具体百分比」，停 1.6 秒淡出；④ **背包贴图补齐**（HUD 背包图标原来因 `<i>` 是 inline + 没上 mask 而空白，已修；药水物品新增 `potion.svg / potion-full.svg` 两个图标）。
- **116 · v=131**：第十二关「三幻神驿站」+ 车流系统（另一组写引擎、本侧接线）+ 加急袋鼠（hasted buff）+ 法器「苔藓拿铁」（独立升级卡与商店货）；成就 118。
- **114 · v=129**：第十一关「钟楼雾原」+ 雾系统 + 誊录员 / 收账人 + 法器墨丸（独立升级卡与商店物品）；成就 114。
- **113 · v=128**：删除成就「电光石火」（5 分钟内通关太难完成）及其埋点；成就 111 → 110（挑战 15 → 14、罕见 30 → 29），全清骨币 7800 → 7680。
- **112 · v=127**：整体提难度（四档重排、称量官无上限叠层、盖章人封步到死、诅咒改最终乘算），详见 git log。
- **111 · v=126**：商店 `needLevel` 是「第 N 关起都有」，导致绝缘斗篷（防电衣）与镇牌铃（镇牌灵）串关。新增 `onlyLevel`（6 / 8），`rollShopItems` + `itemLocked` 双过滤，`buyItem` 补传 `level`。
- **110 · v=125**：铁傀儡主动追怪；照影血量去掉 `spawnScale.hp` 并 `hpCap 60`；看守暴怒 `rageGap 0.45` + 前摇收招 ×0.72。
- **109 · v=124**：每日任务池 24→39，`avail` 门控在**抽签时**排除（不是事后过滤）。
- **108 · v=123**：傀儡 +4 卡 / 箭雨 8 卡 / 商店买断箭袋，卡池 75→87。
- **107 · v=122**：第十关「塔顶井台」+ 法器傀儡术 + 四只新怪 + 成就 111。
- **106 · v=120~121**：主页面瘦身 + 新「据点」页 + 属性横卡 + 成就 67→106。

### 0.3 长期有效、反复踩过的经验

1. **发版必须同时 bump 两处版本号**：`index.html` 与 `js/*.js` 里所有 `?v=N`（本轮 121 处）。漏一处 = 本地好、线上炸。
2. **测试里别写死版本号和数字**：版本一律以 `index.html` 为准运行时读；怪数 / 关卡数 / 卡池数每次扩张都会让写死的老断言变红。
3. **别再用 `location.reload()` 当复位手段**：主流程只留「导入存档」与 `closeBoons('reload')` 两处；结算走 `exitToTitle()`，站位 / 姿势 / 范围环统一收在 `restoreRunVisuals()`。
4. **一切局内成长都必须在 `resetRunState()` 里有一条**（属性 mods、计数器、场景对象、模块级单例）；但 `resumeGame` 绝不调它（读档是整表覆盖）。
5. **「淡出但留在 DOM」的浮层必须 `visibility:hidden` + 内部按钮 `pointer-events:none`**：`.tut-card` 已经根治；否则一块隐形大按钮会吃掉屏幕正中的点击（第 65 / 66 块的真 bug）。
6. **一次性收尾函数（`finishCode` 这种）第一行写 `if (done) return;`**：倒计时归零后每帧都会再进，`clearTimeout + setTimeout` 被反复重置，浮层永远关不掉。
7. **凡是不进回合表、由代码 `spawn` 的怪，都要自己带 `roundScale(level.roundNo, level.level)`**（`hpScale / damageScale / speedScale`），否则越后期越像纸片。
8. **新出手机制一律走 `enemy.js` 的 `cdOf()`**；**前摇 `windup` 永远不乘 haste**（红圈 / 读条按它算）；召唤物要继承 `hasteScale`。
9. **静态 glb 的原点可能离几何中心很远**：`spawn` 要用 `pivot` 吃偏移（Three 是 T×R×S，直接改 `model.position` 会绕偏移点转）；**蒙皮模型的 `Box3` 完全不可信**，身高用「正交相机读像素」实测（`.tmp-*-calib.js`）。
10. **换怪物模型 / 加新怪后必须重跑图鉴缩略图**：`assets/codex/*.webp` 是离线渲染的，运行时不会读 glb；命令 `node .tmp-codex-shots.js <type>`。
11. **概率 / 数值的唯一真相源只能有一份**：掉牌率在 `deposit.js` 的 `TAG_SEAL`，`relics.js` 挂引用；手写百分比一定漂移。
12. **事件 `effects.hp` 正负是两套语义**：正数 = 加上限 + 补血（第 87 / 88 块），负数 = 纯扣血（第 90 块）。批量改必须按符号过滤；文本正则要括号配平、只处理最外层。
13. **属性键名是 `armor` 不是 `defense`**：写错不报错、加成静默归零；`.tmp-event-test.mjs` 会扫全部 mods。
14. **`textContent` 不认 markdown**：怪描述 / 教程卡 / 剑说明里别写 `**加粗**`，需要加粗走 `guide.js` 的 `richText()`。
15. **从子面板（`.tt-sub-scr`，z-index 21）弹出的 `.modal` 要单独抬到 40**；`hidden` 属性不一定藏得住元素（作者样式压过 UA），验可见性读 `getComputedStyle`。
16. **CDP 造靶子**：`spawn` 后必须 `set({state:'chase'})` 或 `sleep(spawnTime)`（spawn 状态免疫伤害）；别用 `minion`（会自爆），用 `warrior` 并把血钉高；测伤害前确认 `adminOn()===false`。
17. **CDP 重载是异步的**：先打 `window.__bootMark=1`，reload 后等它变成 `undefined`，再等 `__game`；否则操作仍作用在旧文档上。
18. **`?debug=1` 下**：叙述跳过（测剧情 / 民心得加 `&story`）、新怪信息卡默认关（测它加 `&meet`）、帧率自适应默认关（加 `&autoperf`）。
19. **「遮住一切但保留某几样」不要靠深度缓冲，靠渲染顺序**（第 114 块）：雾是几片带 `+0.862h` 投影补偿的水平面，它的几何深度和屏幕位置本来就不一致，`depthTest` 永远算不对。正确姿势 = 雾层 `depthTest:false` + `renderOrder:700`，需要穿出来的元素排 850~900，需要被遮的保持默认（≤721）。**看到"雾里还能看见血条/判定圈"先查 renderOrder，别调 opacity**。
20. **同一个闭包里同名函数会静默互相覆盖**（第 114 块 `distToSeg`）：两个都用 6 参版本 → 后声明的赢，前一个调用点拿到 NaN，一路传到 `x:null` 才在 CDP 里露头。新写的几何工具函数一律带用途前缀（`distToInk`），别指望「参数个数不同」能重载。
21. **「淡出 / 清理 / 关闭」要分三个动词**（第 114 块 `fog.clear` vs `clearPatches`）：调试只想抹掉场上那几片，结果把整个系统关了，后面所有断言都跟着错。凡是生命周期里有「暂时清场」和「彻底关闭」两种语义的，一进函数就拆成两个 API。
22. **纯数据接口别回对象**（第 114 块 `collectCast`）：CDP 的 `returnByValue` 会把 Three 的循环引用整个序列化，轻则卡死、重则 `Object reference chain is too long`。调试口一律回 `{ progress }` / 数字 / 扁平数组。
23. **「另一组写引擎、我接线」的并行模式**（第 116 块）：`traffic.js` / `latte.js` 是另一组写好的零 import 引擎文件，**完全别碰它们**，只 import 导出接口、在 `main.js` 里做依赖注入 + 回调。这样两个对话各改各的文件，冲突面最小。
24. **增益类 buff 挂 `e.hasted` 字段、收口在两处乘算**（第 116 块袋鼠）：给别的怪挂「加急」不用改敌人 AI 主流程，只要在 `moveToward`（移速）和 `cdOf`（出手频率）两个收口点乘 `hasted` 系数，`updateOne` 里递减计时即可 —— 和 `filled` 递减并排放。
25. **商店「买断型」法器强化走 `itemLocked` 门控**（第 116 块）：奶泡 / 保温杯这种「一局一次」的货，`itemLocked` 看 `ctx.latte.hasFoam()` / `hasThermos()` 返回 true 就锁死，别让玩家重复买。
26. **加载页「0%」是模块图的锅，不是模型**（第 119 块）：`window.__naiwaBooted` 在 `main.js` 顶层才置位 = 全部 import 都下完并执行；在那之前进度条一格都走不动。所以兜底必须写在 `index.html` 的内联脚本里（能先跑），判据用 `performance.getEntriesByType('resource')` 里 `.js` 条目数是否连续 N 秒不涨 —— 别按固定秒数重载，否则会掐断正在慢慢下载的玩家。复现/验证用 CDP `Network.setBlockedURLs(['*main.js*'])`。
27. **同一个进度条服务两段加载时，必须能复位**（第 120 块）：`setProgress` 刻意的「只升不降」是给启动阶段对冲真实进度用的，但启动收尾会把它顶到 1.0；`ensureLevelAssets` 复用它就成了「进关永远 100%」。凡是「阶段制」的进度，阶段开始一律走显式 `resetProgress()`，别指望 `setProgress(0.05)` 能压回去。
28. **手感计时一律接「战斗秒表」`elapsed`，别用真实时钟**（第 121 块）：连杀断连原来读 `performance.now()`，商店 / 对话 / 背包停多久都算进 `idle`，一出店连杀被整段暂停时间刷掉。凡是「局内手感」的计时（断连、双推窗口、任何 cd/超时）都必须吃只在 `inGame` 里走的 `elapsed`（`createHeat({now: () => elapsed})`）；真实时钟只配给「和游戏是否暂停无关」的场合（读秒锁、签到倒计时）。

### 0.4 发版与测试

- 推送：`git -c http.proxy=http://127.0.0.1:7897 ...`（本机 Clash 代理；代理没开时 push 会失败，让用户开代理，别改 git 配置）。
- 回归：`.tmp-block114-test.mjs` 等 **60 套 Node** 全绿；CDP 按需单套串行（一次只跑一套，套间 `node .tmp-cdp-clean.js`）。
- 已知黄账（别浪费时间）：`block63-cdp` 4 个通电地板、`block54-cdp` 签到浮层 z-index（35/1）、`camp-test` / `boon-test` / `eventui-test` / `block18` / `start-test` / `block30-cdp` / `ui-test` 等老套件本身过期。
- 用户规则：**全中文**；有疑问先问；README 与实况同步；美术优先 GitHub 现成 CC0；不做多角色；局外对局内影响要小。

---

## 0′. 一句话

Three.js r160 的单摇杆幸存者肉鸽《蛙步 · 夜行》，纯静态站点（无构建、无 CDN、零依赖），GitHub Pages 发布。玩家是一只会走路的奶蛙，在荒草地上撑过 20 个回合。

---

## 1. 位置与环境

| 项 | 值 |
| --- | --- |
| 本地仓库 | `C:/Users/MECHREVO/Desktop/班级网站/naiwa-rouge`（**独立 git 仓库**，不要把文件提进上级 class-website 仓库） |
| 线上 | <https://luohuayu-design.github.io/naiwa-rouge/> |
| 远端 | `luohuayu-design/naiwa-rouge`，main 分支，Pages = main / root |
| 本地服务器 | `cd naiwa-rouge && python -m http.server 8124`（**必须 run_in_background，且命令本身不带 `&`**；本机没装 python 时用 Node 临时静态服务器，端口 8124 / 8125） |
| 测试脚本 | 老的在上级目录 `C:/Users/MECHREVO/Desktop/班级网站/.tmp-*.js`，第 41 块起在 `naiwa-rouge/.tmp-*.mjs`（**回归资产，别删**） |
| node | `C:/Users/MECHREVO/.workbuddy/binaries/node/versions/22.22.2-6/node.exe` |
| 无头 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe` |

**网络坑**：github.com 常连不上（Pages 反而通）。推送失败重试或 `git -c http.proxy=http://127.0.0.1:7897 ...`。

---

## 2. 版本时间线

| 块 | 版本 | 核心内容 |
| --- | --- | --- |
| **121** | **v=137** | **连杀只认战斗时间**：断连计时从 `performance.now()` 换成注入的 `now: () => elapsed`（只在真在打时走表），商店 / 对话 / 背包里停多久都不再掉热度。顺带 CDP 复核「一局用时」本来就只算打斗（六个面板各停 2.2s，秒表 +0.000） |
| **120** | **v=136** | **进关进度条复位**：`setProgress` 只升不降，启动后 `_progressShown` 钉在 1.0，导致任何关卡入场都 100%。新增 `resetProgress(p)`，`ensureLevelAssets` 改走它。CDP 实测进关条从 74% 跟到 87%（`n/11`） |
| **119** | **v=135** | **首访加载兜底**：冷启动时 100+ 个 js 还没下完，`main.js` 没跑、进度条钉在 0%。`index.html` 兜底脚本让进度条先自走到 55%，并且「连续 6 秒没有新 js 下完」才 `location.reload()`（同 tab 最多 2 次，成功即清标记）；`main.js` 的 `_progressShown` 改为从当前显示值接着算。CDP 用 `Network.setBlockedURLs` 复现通过 |
| **118** | **v=134** | **第十一关补完 + 经济/成长对齐**（v=133；v=134 热修 `renderHeatBar` 残留调用导致全关卡进不去）：新法器「守夜烛」（`candle.js`，第 7 键，雾里点灯照散雾）与「落款」（`mark.js`，第 8 键，点名 + 死亡墨爆）；两件各 5 张三选一卡 + 2 件买断商店货（守夜烛 wax/shade、落款 cinnabar/paper）；商店**付骨币刷新**（`shopRefreshCost`，本次进店递增、离店重置）；火种**逐件法器各一簇**（+14，`CAMP_CORE` 仍 9，`campRelicAmp`）；盲盒**法器属性三条**（`metaRelicAmp`）；开局 `applyRelicAmp()` 合并灌给 relics/mine/latte/golem/candle/mark。数量：卡池 99→109、商店 34→40、法器 12→14、技能键 6→8、火种簇 9→23 |
| **117** | **v=132** | **局内交互整理**：声音开关从 HUD 移入局外设置；删除「剑转」按钮与剑阵反向（`swordReverse.js` 删除、`weapon.js` 去掉 `orbitSpeedMul`）；连杀改屏幕中央浮现（隐藏、1.6s 淡出，显示移速/攻速具体百分比）；背包 HUD 图标修好 + 药水物品新增两张 SVG 贴图 |
| **116** | **v=131** | **第十二关「三幻神驿站」**：车流系统（两条车道、2.2s 预警、撞怪高额伤害）+ 加急袋鼠（中距放风筝、给怪挂「加急」hasted buff）+ 法器「苔藓拿铁」（第 6 键区域增益，3 级 + 6 卡 + 2 商店货）+ 回归旧怪收件人/誊录员/蛮牛；成就 114→118（全清 8280）；卡池 93→99、商店 31→34、怪 27→28、法器 11→12、程序化怪 3→4 |
| **114** | **v=129** | **第十一关「钟楼雾原」**：雾系统（最多 4 片、预警 1.6s、寿命 8s、漂移、`densityAt`）+ 两怪（誊录员画墨线 / 收账人偷属性技能 8s）+ 法器「墨丸」（3 级 + 6 卡 + 2 商店物）；成就 111→114；**遮挡改渲染顺序（`depthTest:false` + `renderOrder 700`），穿雾层 850/860/880/900** |
| 113 | v=128 | 删除成就「电光石火」（5 分钟内通关）及埋点；成就 110 条，全清 7680 骨币 |
| 112 | v=127 | **整体提难度**：四档重排（普通=旧地狱）、骨币倍率 0.6/1/1.4/1.8；称量官 hp8 每 8s 一层无上限全场五项 +10%；盖章人方印 6.2 格 / 2.4s / 封步到死；诅咒改最终乘算（脆骨 66%）；诅咒骨币倍率减半（六条 ×1.65） |
| 111 | v=126 | 商店 `onlyLevel`：绝缘斗篷只第 6 关、镇牌铃只第 8 关（三处过滤含 `buyItem`） |
| 110 | v=125 | 铁傀儡追怪；照影血量 bug 修复 + `hpCap 60` + 模型 1.22；看守暴怒 0.45 |
| 109 | v=124 | 每日任务池 24→39，`avail` 抽签时排除 |
| 108 | v=123 | 傀儡 +4 卡、箭雨 8 卡、商店买断箭袋，卡池 75→87 |
| 107 | v=122 | 第十关「塔顶井台」+ 法器「傀儡术」+ 四怪 + 成就 111 |
| 106 | v=120~121 | 主页瘦身 + 据点页 + 属性横卡 + 成就 67→106 |
| 105 | v=119 | 签到随机 0~100；3/5/7 天档；盲盒属性 ×0.88 + 四条新属性 |
| 104 | v=118 | 删分享 / 云端码；导出改 ASCII 名 + `data:` 兜底 |
| 103 | v=117 | 礼包记录降序取最近 8 条（原取最早 8 条） |
| 102 | v=116 | 公告加 QQ 群（可复制）；`NOTICE_VER` / `PROMO_VER` +1 |
| 101 | v=115 | 新码「建群大典」888 骨币 |
| 100 | v=114 | 启动自检版本 + 设置页显示版本 + 改属性立刻生效 |
| 99 | v=113 | 删分段存档码；分享改纯文本 / 下载；速度感默认开 |
| 98 | v=112 | 管理员改最终值改存追加项 `statAdmin`（基础值永不变） |
| 97 | v=111 | 称量官换模型 hp12 + 盖章人 + 空场催怪 + `hittable` + 存档压缩 |
| 96 | v=110 | 看守五招（扇形牌雨 / 砸柜）+ 追踪牌 |
| 95 | v=109 | 并联体间距 16、hp 8；管理员模式二（改最终值） |
| 94 | v=105~106 | 三 tab + 每日任务 + 成就 67 + 盲盒 3% + 10 码；成就手动领取 |
| 93 | v=104 | 防御上限 70%（`ARMOR_FLOOR`） |
| 92 | v=103 | 结算改「回到主界面」+ `restoreRunVisuals()` |
| 91 | v=102 | 关内难度梯度：`haste` 进 `roundScale` + 移速斜率 + 九套出手统一 `cdOf` |
| 90 | v=101 | 事件扣血 ×2；盲盒老档审计 |
| 89 | v=100 | 暴击率提升幅度削 1/3 |
| 88 | v=99 | 生命上限全面提档（`maxHp.base` 6→10） |
| 87 | v=98 | 再生 / 吸血降档；事件回血 = 上限 +N |
| 86 | v=97 | `resetRunState`：新开一局清空局内 |
| 85 | v=96 | 泡加大 / 一颗变两颗 / 命中停环剑 |
| 84 | v=95 | 掉牌 50% + 进柜提示 + 镇牌铃 + 商店常驻货 |
| 83 | v=94 | 第八关重做：删队形、寄存柜 + 看守 + 四位码；事件临时数值放大 |
| 82 | v=93 | 并联体硬约束、电弧无视无敌、盲盒 5%、木鱼灵泡、第九关称量官 |
| 81 | v=92 | 第八关「骨塔寄存层」（队形 + 寄存柜，队形后于 83 重做） |
| 80 | v=91 | 加载 4 路并发 + `assetUrl.withV` + 并联体 pivot |
| 79 | v=90 | 加载页误报修复 + `sw.js`（缓存优先 + 首访补存） |
| 78 | v=89 | 存档导出 / 导入（`saveIO.js`） |
| 77 | v=88 | 井蛙 / 木鱼灵换真模型；`fish` 动画族；`hover` |
| 76 | v=87 | 场地伤害无视防御（`damageTrue`） |
| 75 | v=86 | 擦名者回合中段登场 + 并联体 + 重启体 1 次 |
| 74 | v=85 | 两店合并 + 盲盒线性涨价 + 生命回复削弱 |
| 73 | v=84 | 卡池 28→71（22 族 × 3 档） |
| 72 | v=83 | 按关预载（`levelTypes` / `ensureLevelAssets`） |
| 71 | v=82 | 第七关「骨塔井底」+ 井蛙 / 木鱼灵 + 木鱼法器 + 滴水 hazard |
| 70 | v=81 | 民心事件换皮（青绿横幅） |
| 69 | v=80 | 擦名者「可见才起手」+ 读条 4.5s + 得手僵 1.4s |
| 68 | v=79 | 元素剑范围 3.5→7.0 格 |
| 67 | v=78 | 民心事件时序：事件→三选一→民心→商店 |
| 66 | v=77 | 箭雨教程补靶 + 隐形按钮根治 |
| 65 | v=76 | 回血键 / 读条 HUD / 五六关难度 / 技能解锁脱钩 |
| 64 | v=75 | 教程 8 步 + 元素剑群体化 + 主线番外 10 条 |
| 63 | v=74 | 第五关「草甸路口」+ 第六关「骨塔机房」 |
| 62 | v=72 | 体型 / 小巫奶量 / 民心上限 / 音效增益 |
| 61 | v=71 | 存档列表改为「最近的在上」 |
| 60 | v=70 | 签到红点 `hidden` 修复 |
| 59 | v=69 | 签到 + 帧率自适应 + 拆 `backdrop-filter` |
| 58 | v=68 | 局外盲盒商店（花骨币抽永久属性） |
| 57 | v=67 | 宣传有礼 + 新增 20 兑换码 |
| 17~56 | v=20~66 | 设置 / 存档 / 图鉴 / 成就 / 篝火 / 第二~四关 / 诅咒 / 每日挑战 / 武器教程 / 礼包 / 公告 / 音效包 / 种子 / 属性页 / 13 只怪模型等基础设施，详见 `git log` |

---

## 3. 文件地图（js/）

| 文件 | 职责 |
| --- | --- |
| `main.js`（~10000 行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改之前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、`DIFFS`、`startAt`、升级 / 商店节点 |
| `stats.js` | 属性引擎（`createStats`）：主角 14 项 / 武器 12 项；本轮新增最终乘算 `mul` |
| `enemy.js` | **28 只怪**（24 个 glb；`addressee` / `clerk` / `collector` / `kangaroo` 程序化）、`CLIP_FAMILIES`、血条、冰冻 / 定身、`attachTag`、木鱼灵追踪泡、并联体分离、称量官叠层（`weighTier / dressWeigh / performWeigh / clearWeigh`）、盖章人（`spawnSeal` / `sealBySource`）、看守五招、`hittable`、**墨线（`startInkCast / spawnInkBand / updateInks / distToInk`）**、**加急袋鼠（`handleKangaroo / performRush`，`e.hasted` 在 `moveToward` / `cdOf` 乘算、`updateOne` 递减）** |
| `traffic.js` | **第 116 块新增**：第十二关的车流。`createTrafficSystem({scene,fx,enemies,hurtPlayer,onEnemyHit,onPlayerHit})` → `build / update / clear / spawn / list / config`；常量 `TRAFFIC_DEFAULTS {lanes:[-4.5,4.5],width:2.4,warn:2.2,speed:18,damage:2.0,enemyPct:0.36,doubleFrom:13}`；零 import 业务模块，纯注入 |
| `latte.js` | **第 116 块新增**：法器「苔藓拿铁」（12 号）。`createLatteSystem({scene,fx,enemies,stats,onCast,onSlow,onPickup})` → `drop / dropPickup / update / reset / clearField / setRelicLevel / applyCard / buyFoam / buyThermos / snapshot / restore / setCdMul / bonuses`；`LATTE_BASE {cd 30, cdMin 14, radius 3.2, duration 5, haste 0.2, move 0.15, slow 0.28, cap 1, capMax 3}`；零 import，纯注入 |
| `fog.js` | **第 114 块新增**：第十一关的雾。`createFogSystem({scene})` → `build / update / clear / clearPatches / inside / densityAt / on / count / spawn / heat / haloVisible / haloPos`；常量 `VIEW_K 0.862`（深度投影补偿）、`FOG_ORDER 700`；两层平面 `makeLayer(1.35,1.00,0.06)` + `makeLayer(2.05,0.82,-0.05)`，`depthTest:false` |
| `mine.js` | **第 114 块新增**：法器「墨丸」（11 号）。`DMG_MUL 2.5 / MAX_MINE 3 / MAX_CAP 8 / RADIUS 2.6 / TRIGGER_R 0.9 / CD 8→3`；`drop / update / reset / clearField / applyCard / buySac / buyThick / setRelicLevel / snapshot / restore`；地雷 `renderOrder 721`、光环 720（穿雾） |
| `deposit.js` | 寄存柜（第八关）：`build / update / reset / addTag / takeAll / clearTags / setSeal`；常量 `CAP 8 / LOCK_DELAY 5.0 / RANGE 3.6`；掉牌率唯一真相源 `TAG_BASE 0.50` / `TAG_SEAL [.50,.34,.22,.13]` |
| `weapon.js` | 环剑、5 种元素剑、万剑齐发 CD 制；毒 / 冰 / 血 / 震 `aroundPoint()` 一圈（`elementRadius` 7.0、`elementRatio` 50%）；雷剑全场连锁 |
| `turret.js` / `relics.js` | 弩炮台（上限 3）、**12 件法器**（地刺 / 霜环 / 震钟 / 棘甲 / 暖炉 / 路口灯 / 绝缘斗篷 / 木鱼 / 镇牌铃 / 傀儡术 / 墨丸 / 苔藓拿铁），各 3 级 |
| `upgrade.js` | **99 张升级卡**（22 族 × 3 档 + 21 张结构卡 + 6 张墨丸卡 + 6 张拿铁卡）；`up.golem` / `up.arrow` / `up.mine` / `up.latte` 转交各自模块，changes 文案共用 `golemChange()` / `arrowChange()` / `mineChange()` / `latteChange()`；`weightOf` 看 `mineOwned` / `latteOwned` 收窄法器卡 |
| `golem.js` | 傀儡系统：铁傀儡（不拉仇恨 / 攻击=主角×1.5 / 主动追怪）+ 雪傀儡（拉仇恨 / 击退不伤害 / 站桩）；嘲讽收口在 `enemy.js moveToward` 顶部 |
| `hazards.js` | 场地机关：漏电地板 / 井底滴水 `drip` / 井口 `well` |
| `shop.js` | **34 件货**、按品质加权摆 4 件；`SHOP_PINNED` 常驻货；`onlyLevel` 精确关卡；墨丸（`buyMine` 32 骨币 / needRound 8 / needLevel 11）+ 两个一次性强化（`buyInkSac` / `buyInkThick`，走 `type:'ink'`）；拿铁（`buyLatte` / needLevel 12）+ 两个一次性强化（`buyLatteFoam` / `buyLatteThermos`，走 `type:'latte'`） |
| `events.js` + `eventsExtra.js` + `eventsSide.js` + `repEvents.js` | 99 随机 + 10 条主线番外 + 13 老连锁 + 9 民心事 = **131 事件**；`TEMP_SCALE` 放大临时数值 |
| `campfire.js` | 篝火 / 骨币（九簇，无限级线性阶梯价）；`BONE.diffMul` 难度倍率 |
| `boons.js` | 永夜火种（16 张永久卡 + 层数上限 + 品质抽签） |
| `curses.js` | 夜行诅咒（六条，`mul` 骨币倍率 + `mods` 最终乘算） |
| `seed.js` / `rarity.js` | 种子与每日挑战 / 五档品质唯一真相源 |
| `assetUrl.js` | 给静态资产拼 `?v=N`（`ASSET_V` 从 `import.meta.url` 读，不写死） |
| `saveIO.js` | 存档导出 / 导入（不碰 DOM，Node 可直跑）；`IO_KEYS` 六键；`NWSZ1:` 压缩码 |
| `../sw.js` | Service Worker（根目录）：带版本 js/css 缓存优先、其余 stale-while-revalidate、`index.html` 放行、`warm` 首访补存、`?nosw=1` 后门 |
| `profile.js` / `runSave.js` | 本机档案聚合（`setSaveSuppressed` 沙盒）/ 读取存档 |
| `gift.js` / `voicepack.js` | 礼包码（只存哈希）/ 音效包 |
| `arrowRain.js` | 箭雨：`mods` 四通道（`arrows / dmgPct / zone / cdCut`）、`applyCard / applyQuiver` |
| `statView.js` | 属性页 3D 展台（独立 canvas，开着才 update） |
| `signin.js` | 签到（周一起算 7 天、随机 0~100、3/5/7 天档、跨周清零） |
| `skills.js` | 技能注册表：`visible / ready / progress / press / cdText`；第 5 格 `mine`（墨丸，`relics.mine > 0` 才可见）、第 6 格 `latte`（拿铁，`relics.latte > 0` 才可见） |
| `story.js` | 主线 18 夜 + 印记 / 结局；s01~s12 已绑关，剩 6 夜 `levelId:null` |
| `achievements.js` | **118 条成就** + 八类 + 三档 + `achClaim` 手动领取（「电光石火」已删；本轮加 `clear_12 / kangaroo_10 / traffic_50 / traffic_run_20`；`clear_all` 改名「十二关皆通」） |
| `dailyQuest.js` | 每日任务（池 39：简 19 / 中 11 / 难 9，`avail` 抽签门控） |
| `accordion.js` | 通用手风琴（懒构建 + 单组展开） |
| `codex.js` / `audio.js` / `joystick.js` / `scene.js` / `frog.js` / `fx.js` / `gold.js` / `input.js` / `rangeRing.js` / `swordKinds.js` / `guide.js` | 图鉴数据 / 音频 / 摇杆 / 场景 / 角色 / 特效 / 金币 / 输入 / 范围环 / 剑种 / 攻略面板 |
| `assets/` | `rigged.glb`（奶蛙）、`weapons/`、`monsters/`（24 个 glb）、`golems/`（MC 贴图）、`props/`、`codex/*.webp`（28 张缩略图）、`audio/` |

---

## 4. 铁律（违反会返工）

1. **全中文**：注释、文案、提交信息、README 都要中文。
2. **有疑问先问，不要边猜边写**。
3. **资产优先 GitHub 现成 CC0**（KayKit / Quaternius / poly.pizza），程序化只作加载失败兜底。
4. **数值改动必须跑回归**（§6）。
5. **属性公式**：`(base + Σflat) × (1 + Σpct) × Πmul`；`base = 0` 的属性只能用 flat。
6. **两套属性表**：主角 `STAT_DEFS`（14 项）、武器 `WEAPON_STAT_DEFS`（12 项）；剑击只读 `wstats`。
7. **品质是抽签权重**，不是先摇档再挑卡。
8. **`handleRoundClear` 只允许存在一份**（重复声明会静默覆盖）。
9. **一件武器只教一次**（`localStorage['naiwa_rouge_wtut_v1']`）。
10. **README.md 必须与实况同步**。
11. **测试用 `?debug=1` 默认不落存档**（要落档加 `&keepsave=1`）。
12. **新内容「先推送再交给用户测」**。
13. **发版必须同时 bump 两处版本号**（见 §0.3 第 1 条）。
14. **新关卡至少带 2~3 只前面出现过的特色怪**（只新增 1~2 只新面孔）。

---

## 5. 调试钩子（`?debug=1` 才有 `window.__game`）

```
stats / wstats / enemies / level / weapon / fx / input / pos / scene / renderer
getState()                        当前 gameState（title/playing/tutorial/wtut/over）
enemies.spawn(type,{x,z},opts) / all() / takeDamage(e,n) / aliveCount() / hittable
level.roundNo / phase / shouldUpgrade(n)
run.save() / load() / clear() / resume()
codex.* / ach.* / weapon.* / upgrade.isOpen()
runCurses() / setCurses(ids) / curseMul() / curseDmg()      ← 诅咒（本轮有 seals 字段）
boons.* / camp.* / seedInfo() / setSeed(n) / daily.*
adminOn() / setAdmin(b) / ADMIN_CODE='615265'                 ← 沙盒：金币 / 骨币钉 ∞
jumpToRound(n) / skipRound()                                    ← 仅 adminOn 时生效
gift.* / notice.* / pack.* / arrowRain.* / statPage.* / promo.*
sign.* / ui.perf{auto,state,setFps,tick,reset} / meta.apply
block64.tut{...} / block64.panel{...} / block64.skillNums()
block65.hint{...} / block65.cast{...}
enemies.arcGaps() / bubbleCount() / weighTier() / namedCount() / namedRingCount()
levelTypes(id) / loadedTypes() / levelAssetsReady(id) / ensureLevelAssets(id)
boxCost(id,n) / boxPriceOf(id) / boxBought(id)
block63.deposit{state,pos,add,clear,open,code,typed,solve,seal,chance}
block63.enemies.spawn(type,x,z) / kill(type) / live(type) / place / set / list
__game.pos() / __game.warp(x,z) / __game.iframe() / __game.rootT() / __game.rootPlayer(sec)
__game.block107.well() / golems / grantPuppet() / skillBtn() / skillBtnVisible()
__game.shop.stock（getter）/ open(roundNo) / close() / roll(rng)
__game.block114.fog{on,count,max,list,inside,density,halo,haloPos,spawn,heat,clear}
__game.block114.mines{count,cap,list,snapshot,bonuses,reset,drop,blastCount} / grantMine(lv)
__game.block114.steal() / stealNow() / clearSteal()
__game.enemies.inkCount() / inks() / inkCasts() / inkHit(x,z) / clearInks() / clerkCount() / collectorCount()
__game.enemies.collectCast()          ← 只回 {progress}，别回敌人对象（CDP 序列化会卡死）
__game.traffic.list() / config() / spawn()   ← 第 116 块：场上的车 / 车道配置 / 手动来一辆
__game.latte.drop() / count / cap / ready / bonuses() / setRelicLevel()   ← 第 116 块：拿铁放增益 / 读数
__game.enemies.kangarooCount() / hastedCount()   ← 第 116 块：袋鼠数 / 被挂「加急」的怪数
```

> **第 114 块踩过的两个坑**：①`fog.clear()` 会整系统关掉，调试只想抹掉场上那几片要用 `clearPatches()`（`block114.fog.clear` 已指向后者）。②`block114.steal()` 是纯数据快照（`{stat, t, skills}`），不是取敌人。

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e => __game.enemies.takeDamage(e, 999))` 清场（**清光会弹三选一**）。

---

## 6. 测试

- **纯 Node（秒级）**：新增块各自 `.tmp-blockNN-test.mjs`。第 116 块为 `.tmp-block116-test.mjs`（**77 项**：关卡数据 / 车流参数 / 袋鼠 rush 配置 / 拿铁常量 / 法器与卡与商店货 / 成就与图鉴与剧情 / 版本一致）。
- **实机 CDP（需先起 8124）**：`.tmp-blockNN-cdp.js` 或 `.tmp-NN-smoke.js`；启动参数带 `--num-raster-threads=2 --renderer-process-limit=1` 并关后台节流；**串行，一次只跑一套**，套间 `node .tmp-cdp-clean.js`；SwiftShader 慢，必须轮询等待不能固定 sleep；截图路径不能含中文。第 114 块为 `.tmp-114-cdp.js`（**56 项**：雾起散 / 判定环置顶 / 微光跟随 / 墨丸落地炸 / 墨痕掉血减速 / 收账人读条偷取与 8 秒归还）。
- **CDP 里测「持续掉血」必须先钉住局面**（第 114 块真踩过）：主角只有 10 点血，一边等墨痕一边被近战砍，人一死 `hurtPlayer` 第一行就 `if (gameState !== 'playing') return`，断言全变假红且看不出原因。正确做法 = 清怪（只留被测伤害源）→ `stats.hp.cur = stats.hp.max` → `enemies.clearInks()` → 再读差值，并且补一条 `state === 'playing'` 的断言把「主角死了」变成显式失败。
- 跑全量：`sh .tmp-94-runall.sh`（只报挂了的）。**改数值类断言记得回头改老套件**（版本号 / 怪数 / 关卡数 / 卡池数 / 成就数 / 码表数都有人写死过）。
- 第 116 块回归结果：**60 套 Node 全绿**（含修复 block82 / block85 两个既有黄账的正则断言——分离循环 `pass<2/pass<6`、`orbitHold` getter 写法）。数量位移清单见 §0.1 第 6 条。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [x] 第 19~116 块全部完成并推送（见 §2）
- [ ] **主菜单 3D 背景**（场景和模型都在，只是没跑 render；用户 2026-10-28 明确「暂时不做了」）
- [ ] **第十三关起**（`story.js` 还有 6 夜 `levelId:null` 等接；模板照 `LEVEL_12` 抄，带车流的关加 `traffic` 字段、带雾的关加 `fog` 字段）
- [ ] 更多武器 / 技能（`skills.js` 的 SKILLS 表，技能栏还剩 3 格）
- [ ] 性能优化（怪物合批 / 假阴影 / 视锥剔除）—— **等用户点头再动**
- [ ] 不做：主菜单排行榜（无后端）、商城 / 皮肤、广告位、多角色
