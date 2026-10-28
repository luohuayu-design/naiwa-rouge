# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。**先读 §0，再按需查后面章节。**
> 最后更新：2026-10-28 · 线上 **v=129** · 第 114 块（第十一关「钟楼雾原」+ 雾 + 墨丸 + 两怪）。
> 本文件只记**结论与坑**；逐块实现细节看代码注释与 `git log` / `git show`。

---

## ⚠️ 0-1. 另一组在同步开发（动手前必看）

本项目此刻有**两个对话并行开发**，文件级占位如下，**别动别覆盖别重命名**：

| 归属 | 文件 / 区域 |
| --- | --- |
| **另一组（合成台）** | `js/crafting.js`（**文件名已被占用**）、`DESIGN.md`、`.tmp-crafting-test.mjs` |
| 另一组之后会碰 | `main.js` 的 **`onDeath` 区域** 与 **暂停 / 弹窗（`.modal`）区域** |
| 本侧（第 114 块） | `js/fog.js`、`js/mine.js` 为新增；`main.js` 已把击杀记账压成 `onDeath` 里**唯一一行** `onKillExtra114(e);` |

- 本侧已主动把冲突面收到最小：`onDeath` 里只多这一行调用（函数定义在 `createMineSystem` 之后），另一组改这段时**绕开这一行**即可。
- 谁 push 完**要通知对方 pull**：本侧 push 后会立刻告知；收到「另一组已 push」的通知后再 `git pull --rebase`，不要盲目 `pull` 冲突文件。

---

## 0. 给新对话的话

### 0.1 当前基线：v=129（第 114 块「第十一关 · 钟楼雾原」，59 套 Node 测试 + 2 套新 CDP 全绿）

剧情底座是 `story.js` 的 s11「空白的账簿」——账簿被刮白，钟楼起雾。所以这一关的新压力**不是伤害，而是「看不见」**，与前十关全部机制正交。

1. **雾（`js/fog.js`）**：`LEVEL_11.fog = {arena:18,max:4,gap:12,life:8,warn:1.6,drift:0.35,radiusMin:4.4,radiusMax:6.5}`。最多 4 片、每片两层平面（`1.35 / 2.05` 半径倍率），**1.6 秒前预警环 → 0.55s 淡入 → 8s 寿命 → 1.8s 淡出**，缓慢漂移。`densityAt(x,z)` 是查询入口（0~1），`inside()` 给布尔。雾在**局内移动时**才抖镜头（`shakeOn`）。
2. **遮挡靠渲染顺序，不靠深度缓冲**（关键）：雾层 `depthTest:false` + `renderOrder:700`；需要穿雾的东西全部排在它**上面**（数值越大越靠上）—— 墨线开笔预警 850 → 雾预警环 860 → 主角微光 880 → 主角判定环 900；墨丸 720/721 也在雾之上（自己的墨要看得见）。
3. **主角在雾里只剩三样**：判定环（`rangeRing.setOnTop(true)`，且改 `NormalBlending`，否则叠加混合在雾上炸成一条白带）、极淡轮廓微光（`halo.material.opacity = 0.10 + 0.30*d`）、以及所有**前摇预警**。
4. **誊录员（`clerk`，程序化模型 `proc:'quill'`）**：隔 13 格画一道墨线（`half 0.62 / dmg 1.1 / bandLife 7 / bandDps 0.55 / slow 0.86`），最多 5 条。墨线本体在雾下（`renderOrder 6`），**开笔前摇的读圈穿雾（850）**——铁律「前摇永不被遮蔽」。
5. **收账人（`collector`，`proc:'book'`）**：**不造成任何伤害**（`damage:0`），`windup 2.2` / `attackDuration 3.4` / `cd 9`，贴到 2.8 格开始记账，成功则**偷走玩家一项「真实拥有」的属性或技能**（普攻 / 暴击 / 剑 / 任一已解锁技能），持续 8 秒后自动归还；同时只能偷一样；被偷的技能按钮 `.sk.stolen` 变灰（`.sk-art` 灰化 + 角标）。偷的是 `stats.addMod` 的临时 pct（独立 src），不走永久属性。
6. **法器「墨丸」（`js/mine.js`，11 号）**：解锁技能栏第 5 键，按一次放一颗，怪踩上（`TRIGGER_R 0.9`）瞬间炸 `RADIUS 2.6 × DMG_MUL 2.5`。三条成长通道：**3 级法器**（`max / radius / dmg / cd`）+ **6 张升级卡**（`applyCard` 四通道 `dmgPct/max/radius/cdCut`）+ **2 个一次性商店物品**（`buySac` 加伤 / `buyThick` 加厚）。上限 `MAX_MINE 3`（`MAX_CAP 8`）、冷却 `8.0 → 3.0`（`CD_HARD_CAP 24`）。
7. **难度**：`hpMul 1.55 / dmgMul 1.95`，略高于第十关。
8. **数量位移**（改老套件的清单）：关卡 10→11、怪物 25→27、升级卡 87→93、商店 28→31、法器 10→11、成就 111→114（`clear_11 / clerk_10 / collector_5 / fog_20`，全清 **7980**；`clear_all` 文案改「十一关皆通」）。

### 0.2 最近几块（细节见 §2 与 git log）

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

### 0.4 发版与测试

- 推送：`git -c http.proxy=http://127.0.0.1:7897 ...`（本机 Clash 代理；代理没开时 push 会失败，让用户开代理，别改 git 配置）。
- 回归：`.tmp-block114-test.mjs` 等 **59 套 Node** 全绿；CDP 按需单套串行（一次只跑一套，套间 `node .tmp-cdp-clean.js`）。
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
| 本地服务器 | `cd naiwa-rouge && python -m http.server 8124`（**必须 run_in_background，且命令本身不带 `&`**） |
| 测试脚本 | 老的在上级目录 `C:/Users/MECHREVO/Desktop/班级网站/.tmp-*.js`，第 41 块起在 `naiwa-rouge/.tmp-*.mjs`（**回归资产，别删**） |
| node | `C:/Users/MECHREVO/.workbuddy/binaries/node/versions/22.22.2-6/node.exe` |
| 无头 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe` |

**网络坑**：github.com 常连不上（Pages 反而通）。推送失败重试或 `git -c http.proxy=http://127.0.0.1:7897 ...`。

---

## 2. 版本时间线

| 块 | 版本 | 核心内容 |
| --- | --- | --- |
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
| `enemy.js` | **27 只怪**（24 个 glb；`addressee` / `clerk` / `collector` 程序化）、`CLIP_FAMILIES`、血条、冰冻 / 定身、`attachTag`、木鱼灵追踪泡、并联体分离、称量官叠层（`weighTier / dressWeigh / performWeigh / clearWeigh`）、盖章人（`spawnSeal` / `sealBySource`）、看守五招、`hittable`、**墨线（`startInkCast / spawnInkBand / updateInks / distToInk`）** |
| `fog.js` | **第 114 块新增**：第十一关的雾。`createFogSystem({scene})` → `build / update / clear / clearPatches / inside / densityAt / on / count / spawn / heat / haloVisible / haloPos`；常量 `VIEW_K 0.862`（深度投影补偿）、`FOG_ORDER 700`；两层平面 `makeLayer(1.35,1.00,0.06)` + `makeLayer(2.05,0.82,-0.05)`，`depthTest:false` |
| `mine.js` | **第 114 块新增**：法器「墨丸」（11 号）。`DMG_MUL 2.5 / MAX_MINE 3 / MAX_CAP 8 / RADIUS 2.6 / TRIGGER_R 0.9 / CD 8→3`；`drop / update / reset / clearField / applyCard / buySac / buyThick / setRelicLevel / snapshot / restore`；地雷 `renderOrder 721`、光环 720（穿雾） |
| `deposit.js` | 寄存柜（第八关）：`build / update / reset / addTag / takeAll / clearTags / setSeal`；常量 `CAP 8 / LOCK_DELAY 5.0 / RANGE 3.6`；掉牌率唯一真相源 `TAG_BASE 0.50` / `TAG_SEAL [.50,.34,.22,.13]` |
| `weapon.js` | 环剑、5 种元素剑、万剑齐发 CD 制；毒 / 冰 / 血 / 震 `aroundPoint()` 一圈（`elementRadius` 7.0、`elementRatio` 50%）；雷剑全场连锁 |
| `turret.js` / `relics.js` | 弩炮台（上限 3）、**11 件法器**（地刺 / 霜环 / 震钟 / 棘甲 / 暖炉 / 路口灯 / 绝缘斗篷 / 木鱼 / 镇牌铃 / 傀儡术 / 墨丸），各 3 级 |
| `upgrade.js` | **93 张升级卡**（22 族 × 3 档 + 21 张结构卡 + 6 张墨丸卡）；`up.golem` / `up.arrow` / `up.mine` 转交各自模块，changes 文案共用 `golemChange()` / `arrowChange()` / `mineChange()`；`weightOf` 看 `mineOwned` 收窄墨丸卡 |
| `golem.js` | 傀儡系统：铁傀儡（不拉仇恨 / 攻击=主角×1.5 / 主动追怪）+ 雪傀儡（拉仇恨 / 击退不伤害 / 站桩）；嘲讽收口在 `enemy.js moveToward` 顶部 |
| `hazards.js` | 场地机关：漏电地板 / 井底滴水 `drip` / 井口 `well` |
| `shop.js` | **31 件货**、按品质加权摆 4 件；`SHOP_PINNED` 常驻货；`onlyLevel` 精确关卡；墨丸（`buyMine` 32 骨币 / needRound 8 / needLevel 11）+ 两个一次性强化（`buyInkSac` / `buyInkThick`，走 `type:'ink'`） |
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
| `skills.js` | 技能注册表：`visible / ready / progress / press / cdText`；第 5 格 `mine`（墨丸，`relics.mine > 0` 才可见） |
| `story.js` | 主线 18 夜 + 印记 / 结局；s01~s11 已绑关，剩 7 夜 `levelId:null` |
| `achievements.js` | **114 条成就** + 八类 + 三档 + `achClaim` 手动领取（「电光石火」已删；本轮加 `clear_11 / clerk_10 / collector_5 / fog_20`） |
| `dailyQuest.js` | 每日任务（池 39：简 19 / 中 11 / 难 9，`avail` 抽签门控） |
| `accordion.js` | 通用手风琴（懒构建 + 单组展开） |
| `codex.js` / `audio.js` / `joystick.js` / `scene.js` / `frog.js` / `fx.js` / `gold.js` / `input.js` / `rangeRing.js` / `swordKinds.js` / `guide.js` | 图鉴数据 / 音频 / 摇杆 / 场景 / 角色 / 特效 / 金币 / 输入 / 范围环 / 剑种 / 攻略面板 |
| `assets/` | `rigged.glb`（奶蛙）、`weapons/`、`monsters/`（24 个 glb）、`golems/`（MC 贴图）、`props/`、`codex/*.webp`（27 张缩略图）、`audio/` |

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
```

> **第 114 块踩过的两个坑**：①`fog.clear()` 会整系统关掉，调试只想抹掉场上那几片要用 `clearPatches()`（`block114.fog.clear` 已指向后者）。②`block114.steal()` 是纯数据快照（`{stat, t, skills}`），不是取敌人。

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e => __game.enemies.takeDamage(e, 999))` 清场（**清光会弹三选一**）。

---

## 6. 测试

- **纯 Node（秒级）**：新增块各自 `.tmp-blockNN-test.mjs`。第 114 块为 `.tmp-block114-test.mjs`（**132 项**：雾的常量与生命周期 / 墨丸上下限与冷却 / 两种新怪的配置 / 收账人偷取与归还 / 图鉴成就数量 / 版本一致）。
- **实机 CDP（需先起 8124）**：`.tmp-blockNN-cdp.js` 或 `.tmp-NN-smoke.js`；启动参数带 `--num-raster-threads=2 --renderer-process-limit=1` 并关后台节流；**串行，一次只跑一套**，套间 `node .tmp-cdp-clean.js`；SwiftShader 慢，必须轮询等待不能固定 sleep；截图路径不能含中文。第 114 块为 `.tmp-114-cdp.js`（**56 项**：雾起散 / 判定环置顶 / 微光跟随 / 墨丸落地炸 / 墨痕掉血减速 / 收账人读条偷取与 8 秒归还）。
- **CDP 里测「持续掉血」必须先钉住局面**（第 114 块真踩过）：主角只有 10 点血，一边等墨痕一边被近战砍，人一死 `hurtPlayer` 第一行就 `if (gameState !== 'playing') return`，断言全变假红且看不出原因。正确做法 = 清怪（只留被测伤害源）→ `stats.hp.cur = stats.hp.max` → `enemies.clearInks()` → 再读差值，并且补一条 `state === 'playing'` 的断言把「主角死了」变成显式失败。
- 跑全量：`sh .tmp-94-runall.sh`（只报挂了的）。**改数值类断言记得回头改老套件**（版本号 / 怪数 / 关卡数 / 卡池数 / 成就数 / 码表数都有人写死过）。
- 第 114 块回归结果：**59 套 Node 全绿**；block114-test 132 / 114-cdp 56。数量位移清单见 §0.1 第 8 条。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [x] 第 19~114 块全部完成并推送（见 §2）
- [ ] **主菜单 3D 背景**（场景和模型都在，只是没跑 render；用户 2026-10-28 明确「暂时不做了」）
- [ ] **第十二关起**（`story.js` 还有 7 夜 `levelId:null` 等接；模板照 `LEVEL_11` 抄，带雾的关加 `fog` 字段、`FOG_LEVELS` 里登记）
- [ ] 更多武器 / 技能（`skills.js` 的 SKILLS 表，技能栏还剩 4 格）
- [ ] 性能优化（怪物合批 / 假阴影 / 视锥剔除）—— **等用户点头再动**
- [ ] 不做：主菜单排行榜（无后端）、商城 / 皮肤、广告位、多角色
