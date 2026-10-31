# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，**别翻聊天记录**。要动手只读 §1 铁律 + §2 当前状态 + §3 坑。
> 最后更新 2026-10-30 · 线上 **v=139** · 第 122 块。更早的细节查 `git log` / `git show`，本文件不重复。

## 0. 一句话

Three.js r160 的单摇杆幸存者肉鸽《蛙步 · 夜行》：纯静态站点（无构建、无 CDN、零依赖、无 importmap），GitHub Pages 发布，**手机浏览器兼容是硬约束**。玩家是一只会走路的奶蛙，**十二关 × 20 回合**。

| 项 | 值 |
| --- | --- |
| 本地仓库 | `C:/Users/MECHREVO/Desktop/班级网站/naiwa-rouge`（**独立 git 仓库**，绝不提进上级 class-website） |
| 线上 | <https://luohuayu-design.github.io/naiwa-rouge/> |
| 远端 | `luohuayu-design/naiwa-rouge` main，Pages = main / root |
| 本地服务器 | `cd naiwa-rouge && python -m http.server 8124`（**必须 run_in_background**，命令本身不带 `&`） |
| node / Chrome | `~/.workbuddy/binaries/node/versions/22.22.2-6/node.exe` / `C:/Program Files/Google/Chrome/Application/chrome.exe` |
| 测试 | `naiwa-rouge/.tmp-*.mjs`（纯 Node）+ `.tmp-*-cdp.js`（实机）。**回归资产，别删** |

**并行开发**：另一组写过 8 个零 import 引擎（`crafting / elementReaction / elite / weather / musicbox / dash / heat / lastwords`，设计见 `DESIGN.md`），已接线。他们的文件别改名别覆盖；`main.js` 的 `onDeath` 里本侧只多一行 `onKillExtra114(e);`，改那段绕开它。**提交只 `git add -u` + 点名自己的新文件，别 `add -A`。**

---

## 1. 铁律（违反会返工）

1. **全中文**：注释、文案、commit message、文档。
2. **有疑问先问，别边猜边写**；多方案先让用户选。
3. **资产优先 GitHub 现成 CC0**（KayKit / Quaternius / poly.pizza / kenney / game-icons）。
4. **属性公式**：`(base + Σflat) × (1 + Σpct) × Πmul`。**减益走 `mul`**，走 `flat` 会被 pct 反向放大；`base = 0` 的属性只能用 flat。
5. **两套属性表**：主角 `STAT_DEFS`（14 项）、武器 `WEAPON_STAT_DEFS`（12 项）；剑击只读 `wstats`。属性键名是 **`armor`**，写 `defense` 不报错、静默归零。
6. **品质是抽签权重**（`rarity.js` 唯一真相源），不是先摇档再挑卡。
7. **`handleRoundClear` 只能存在一份**（重复声明静默覆盖）。
8. **一切局内成长必须在 `resetRunState()` 里有一条**；但 `resetRunState` 只在 `beginGame` 调，`resumeGame` 绝不调（读档是整表覆盖）。
9. **发版同时 bump 两处版本号**：`index.html` 与所有 `js/*.js` 的 `?v=N`（本轮 149 处），漏一处 = 本地好线上炸。
10. **新内容「先推送再交给用户测」**：本地回归绿 → 立刻 commit & push → 交「线上链接 + 改了什么 / 怎么试」。
11. **`README.md` 与 `HANDOFF.md` 必须与实况同步。**
12. **数值改动必须跑回归**（§6）；改用户可见文案同样要跑（老套件正则写死了数字）。
13. **新关卡至少带 2~3 只前面出现过的老怪**（只新增 1~2 张新面孔）。
14. **测试用 `?debug=1` 默认不落存档**（要落加 `&keepsave=1`）；`debug` 下叙事 / 挑战 / 怪信息卡默认跳过，分别加 `&story` / `&chal` / `&meet`。

---

## 2. 当前状态（v=139 · 第 122 块）

### 2.1 第 122 块：回合挑战 + 三选一刷新

**回合挑战**（`js/challenge.js` 纯数据纯函数，零 DOM 零业务 import；接线全在 `main.js`）
- 每关 `planRounds()` 从 `[3, rounds-1]` 无放回抽 **2 个回合**（独立 `chal` 随机流），**回合开始前**弹卡。
- 九条各碰一个轴：`thinBlood` 上限 ×0.5（+`clampHp`）/ `softPaw` 攻击→原值 40%（**下限 1**，走 `mul` 折算）/ `brokenSword`（`weapon.setMuted(true)`）/ `tide` 数量 ×2 / `gale` 移速 ×1.45 出手 ×1.3 / `coldHand` 攻速 ×0.55 / `mute` 技能全锁 / `heavyStep` 移速 ×0.62 / `fragile` 受伤 ×1.6。
- **可以放弃**（记 `chalUsed`，这回合照常打、无奖励）。
- 弹窗挂在 `handleRoundClear` 结算链**末尾**（商店关完之后、gap 里），靠「`gameState ≠ playing` → `level.update` 不跑 → gap 不走表」天然冻结，**没给 wave 加门闩**。

**挑战奖励**（排整条结算链**最前**）：88 金币 / 立刻再一次三选一 / **下一回合属性大涨**（`rollBoosts` 三类各一条 → `applyBoost`，**只活一回合**）。

**三选一刷新**：`UP_REFRESH_FREE = 3`（**一局**三次，不是每面板）。用完后每次刷新随机背一条**未持有**的**盲盒式减成** —— `BOX_CURSES`（`curses.js`，10 条，一条只碰一个数，一律走 `mul`）→ `askConfirm` → `addBoxCurse` → `applyBoxCurses`（`src='boxcurse'`，先撤再重放）→ `boxCurseDmg`（荆棘皮）→ `clampHp`；十条背满锁键。
**⚠️ 别跟夜行诅咒混**（v=139 修的就是这个）：`RUN_CURSES` 是开局自选、换骨币倍率、写进 `profile().runCurses` 的大刀；刷新的减成只掉属性、不写 profile、不动骨币倍率、不进诅咒勾选面板，存档走独立的 `box` 字段。

**生命周期**：效果 src 分别是 `chal` / `boost`，`clearRoundBuffs()` 里成对撤；`resumeGame` 成对抹 + `weapon.setMuted(false)` + `applySkillCdFactor(1)`；`resetRunState` 归零全部计数。存档带 `chal: {plan, used, seen}`。

### 2.2 最近几块（一行一块）

- **123 v=140**：第十三关「焦土操场」—— 环形跑道（`track.js`，玩家 ×1.35 / 怪 ×1.25 + 轻推力）+ 立牌（正面 −75%，`turnRate` 0.9）+ 取景的（锥形快门 ±0.78）+ 第 15 件法器「纸立牌」（`board.js`，挡投掷物 + 挡快门）；四只手搓怪全换成下载 glb（`sourceHeight` 改**包围盒最大边**、平摊模型加 `tiltX`）；补上第 12 关漏的 `main.js` 选关入口。
- **122 v=138**：回合挑战 + 三选一刷新（见上）。数量未变，老套件只改 4 处源码正则（56/76/85/91）。
- **121 v=137**：连杀断连改接战斗秒表 `elapsed`（`createHeat({now: () => elapsed})`），商店 / 对话 / 背包停多久都不再掉热度。
- **120 v=136**：`setProgress` 只升不降导致进关永远 100% → 新增 `resetProgress(p)`，`ensureLevelAssets` 改走它。
- **119 v=135**：首访加载 0% 兜底（`index.html` 内联脚本：进度条自爬到 55%；连续 6 秒无新 js 才 reload，同 tab 最多 2 次）。
- **118 v=133/134**：第十一关补完（守夜烛第 7 键 / 落款第 8 键）+ 商店付骨币刷新 + 火种 14 簇法器增幅 + 盲盒法器三属性。v=134 热修：删掉遗留的 `renderHeatBar(0)` 调用（任何关卡点开始都卡标题页）。
- **116/117**：第十二关「三幻神驿站」+ 车流 + 加急袋鼠 + 拿铁；声音开关移设置、删剑转、连杀改屏幕中央浮现。
- 更早：查 `git log --oneline`。

### 2.3 规模数字（改数值断言必看）

关卡 **13** · 怪 **30**（**30 个 glb，零复用，没有一只是手搓的**；图鉴 **30** webp）· 升级卡 **113** · 商店 **43** · 法器 **15** · 技能键 **9** · 火种簇 **23**（核心 9）· 成就 **118**（全清 8280）· 事件 **131** · 每日任务池 **39** · 礼包码 51 · 火种卡 16 · 诅咒 6。

---

## 3. 长期坑（全部真踩过）

**属性 / 数值**
1. **改某个属性先枚举全部通路再动**（暴击 4 条、生命 4 条），只改一条等于没改。
2. **批量改数据先分语义**：`effects.hp` 正 = 加上限 + 补血、负 = 纯扣血、`cost.hp` 是第三套；嵌套对象要「括号配平 + 只处理最外层」。
3. **概率 / 数值只有一个真相源**（掉牌在 `deposit.js` 的 `TAG_SEAL`，`relics.js` 挂引用），手写百分比一定漂移。
4. **「统一降/升一档」挂一个系数**（`BOX_ATTR_SCALE`），UI 显示走同一函数。
5. **改默认值救不了老档**（`fill` 只在键缺失时生效）→ 用**世代号**一次性迁移（`profile.uiRev` + `migrateUi()`，当场落盘）。

**生命周期 / 状态**
6. **`location.reload()` 不是复位手段**。主流程只剩「导入存档」与 `closeBoons` 兼容分支两处；它曾顺手完成一堆复位（pos / 蛙 rotation.z / `playerRing.setVisible`），换掉要逐个显式补。
7. **两个「只活一回合」的效果不能共用一个 src**：随机事件会写成 `event:N` 覆盖掉，被覆盖那份永远撤不掉、跟着一局跑到底。
8. **「整把武器失效」做开关，别动 `granted / owned`**（那是整局资产，清掉等于偷玩家的剑）。
9. **`let` 状态变量别写在会读它的函数后面**：`renderSkill()` 在初始化阶段就执行，读后段变量 = TDZ 白屏，控制台只有一行。
10. **同一个闭包里同名函数静默覆盖**：几何工具函数一律带用途前缀（`distToInk`），别指望参数个数不同能重载。
11. **「淡出 / 清场 / 关闭」拆成两个 API**（`fog.clearPatches` vs `fog.clear`）：调试只想抹掉场上那几片，结果整系统关掉，后面断言全错。
12. **一次性收尾函数第一行写 `if (done) return;`**：倒计时归零后每帧都进，`clearTimeout + setTimeout` 被反复重置，浮层永远关不掉。
13. **删 UI 组件要 grep 整个 `js/` 再收工**：删了函数忘删调用 → 第 118 块全关卡进不去。

**UI / 触摸 / 渲染**
14. **「淡出但留在 DOM」必须 `visibility:hidden` + 内部按钮 `pointer-events:none`**：一块 398×39 的隐形按钮正好压在屏幕正中，三分之一的点击落空（第 65/66 块的真 bug）。
15. **动画别用 `grid-template-rows:0fr→1fr`**（要 Chrome 107+），用 `max-height` + `visibility` 延迟（引擎 `js/accordion.js`）。
16. **矮屏浮层给卡片 `max-height:calc(100dvh - 32px)` + 内部列表 `overflow-y:auto;min-height:0`**，否则底部按钮（如三选一刷新键）被顶出视口。
17. **从子面板弹出的 `.modal` 要单独抬 z-index**；`hidden` 属性不一定藏得住（作者样式压过 UA），验可见性读 `getComputedStyle` / `getClientRects`。
18. **单色 SVG 图标别用外链 `<img>`**（吃不到 currentColor）→ `<i style="--ic:url()">` + `background:currentColor` + `mask`。
19. **「遮住一切但留几样」用渲染顺序，不用深度缓冲**：雾层 `depthTest:false` + `renderOrder:700`，要穿出来的排 850~900，要盖住的保持默认（≤721）。看到「雾里还能看见血条」先查 renderOrder，别调 opacity。
20. **「画在这、打在那」**：判定与视觉常量必须同源（泡的 `r`、扇形角度、pivot 偏移）。朝向约定 `rotY = atan2(dx, dz)`，局部朝 +X 的几何要转 `φ − π/2`。
21. **静态 glb 的原点可能离几何中心很远** → 用 `pivot` 吃偏移（Three 是 T×R×S，直接改 `model.position` 会绕偏移点转）；**蒙皮包围盒完全不可信**，身高用「正交相机读像素」实测。
22. **挂件/木牌用 `MeshBasicMaterial` + `userData.isTag`**（避开 tint / glow / 闪白）；零厚度 Plane 侧身退化成一条线 → 用薄 Box；挂件要反向缩放。
23. **换模型 / 加新怪后必须重跑图鉴缩略图**（`assets/codex/*.webp` 是离线渲染的）：`node .tmp-codex-shots.js <type>`。
23a. **平摊模型（纸 / 书 / 布）的 `sourceHeight` 要用包围盒最大边，不能用高度**：一叠纸的"高度"是厚度，按它归一化会放大成盖住半场的巨幕（第 123 块）。45° 俯视下塌成一条线就加 `tiltX` 竖起来，`buildPreviewModel` 与 `spawn` **两处都要加**，只加一处 = 图鉴能看、场上一条线。
23b. **静态 glb 与蒙皮 glb 的 clone 分流用 `src.clips` 是否为空判断**，别维护 `proc` 白名单；布 / 旗这类单面模型要 `side: DoubleSide` + 一点 emissive，否则夜里从背后看是一整块洞。

**接线（加关卡 / 加法器）**
23c. **加关卡必须改两处**：`wave.js` 的 `LEVELS_BY_ID` + `main.js` 的 `LEVELS` 选关表**和 import**。第 12 关就漏了后者，数据 / 车流 / 袋鼠全在跑，玩家选不到。
23d. **加法器要一次接齐 6 处**：`relics.js`（定义 + levels/cds）、`skills.js`（技能格 + 按键）、`shop.js`（本体 + 两件买断 + `itemLocked`）、`upgrade.js`（卡 + `weightOf` 门 + `applyUpgrade`/`previewUpgrade` 末参 + change 文案）、`main.js`（创建 / skillCtx / update / reset / clearField / 存档 snapshot+restore / setCdMul / setRelicAmp 的 ids / 商店 ctx 与购买分支 / `__game` 钩子）、以及**判定所在的引擎**（如 `enemy.js` 的弹道循环）。漏一处 = 功能「看着有、用不了」。
23e. **新判定挂在既有叠乘链上，别自己开一套**：立牌的正面减伤折进 `red = min(0.95, aura + named + face + shield)`，和冰缓 / 记名同一条，才不会互相覆盖。

**加载 / 缓存 / 发版**
24. **纯静态站必须自己解决缓存**：启动 + `visibilitychange` 时 fetch `index.html` 抠 `?v=N` 比对，更大就 `location.replace`（局内/设置/属性页开着时不刷）。
25. **加载页 0% 是模块图的锅**：`window.__naiwaBooted` 在 `main.js` 顶层才置位，兜底只能写 `index.html` 内联脚本；判据用「连续 N 秒没有新 js 下完」，别按固定秒数 reload。
26. **阶段制进度条必须能复位**：`setProgress` 刻意只升不降（给启动阶段对冲），启动收尾会把它顶到 1.0 —— 进关一律走 `resetProgress()`。
27. **`blob:` 被移交给别的 App 就是死链**：微信/QQ/X5 内核导出改走 `data:`，文件名一律纯 ASCII，永远留一条手动兜底链接。
28. **别拿能力探测当门闩**：`canShare({files})` 手机大面积误报 false。一律「先试 → 失败降一档 → 最后才说不行」，文案说清改成了什么。

**测试 / CDP**
29. **测试里别写死版本号和数字**：版本运行时从 `index.html` 读；怪数 / 关卡数 / 卡池 / 成就数每次扩张都会让老断言变红。**改数值回头修老套件**（清单见 §2.3）。
30. **Node 里 `./profile.js` 与 `./profile.js?v=N` 是两个模块实例** —— 测试必须带同一个版本号导入。
31. **造靶子用 `warrior`（不用自爆的 `minion`），先钉血，`spawn` 后把 `state` 改成 `chase`**（spawn 态免疫伤害）；测伤害前确认 `adminOn() === false`（管理员模式里主角免疫一切）。
    **主角上限是 `stats.get('maxHp')`**，`stats.hp` 只有 `{cur}`（写成 `stats.hp.max` 会让血变 NaN）。
32. **CDP 测「持续掉血」先钉住局面**：补血 + 清怪只留伤害源，并补一条 `state === 'playing'` 断言；主角一死 `hurtPlayer` 首行就 return，全是假红。
33. **无头 CDP 里按毫秒 sleep 等游戏事件不可靠**（`dt` 被夹 0.05，游戏时间比墙钟慢）→ 轮询状态位。CDP 重载是异步的：先打 `window.__bootMark=1`，等它变 `undefined` 再等 `__game`。
34. **CDP 清回合要先放开波次**：`setWaves(true)` 时 `level.update` 不跑，`skipRound()` + 全歼是空杀。正确 = `setWaves(false)` → 等 `phase === 'spawning' && 场上有怪` → `skipRound()` + 全歼。
35. **调试口别回对象**：CDP `returnByValue` 会把 Three 的循环引用整个序列化（`Object reference chain is too long`）。一律回 `{progress}` / 数字 / 扁平数组。
36. **用 Python 改 `.js` 必须 `newline=''`**（`\n` 会变真换行撕断代码）；改完 `node --check`。
37. **扫源码的正则别写死参数表收尾 `)`**（第 114 块 `applyUpgrade(...golems, arrowRain, mines)` 一起红十几套）→ 用 `golems[^)]*\)`。「两段之间的距离」也会随新怪增长，加怪就要放宽。
38. **颜色断言写 `rgba?\(r, g, b`**（计算样式输出 rgba）；glb 带 `?v=N` → CDP 抓请求要 `url.split('?')[0].endsWith('.glb')`。
39. **跑浏览器测试别占满 CPU**：一次一套、`--num-raster-threads=2 --renderer-process-limit=1`、套间 `node .tmp-cdp-clean.js` 清孤儿 chrome；长测试 run_in_background + 写日志；截图路径与 cwd **不能含中文**。

**环境**
40. **Bash cwd 多次调用间会重置回「班级网站」根** → git / sed 必须 `cd naiwa-rouge && ...` 单条链式。
41. **`http_proxy` 常驻** → 探连通性必须 `curl -s --noproxy '*'`。push 用 `git -c http.proxy=http://127.0.0.1:7897 push`，**push 完必须 `git status -sb` 验证不 ahead**（曾出现 exit 0、零输出、其实没推上去）；`unexpected disconnect` 后再推一次往往就成。
42. **同名概念要分两套账**（v=139 用户指出的真错）：第一版把刷新代价写成「夜行诅咒」，结果是**开局自选、换骨币倍率、写 profile** 的那六条被局内偷偷塞了一条 —— 玩家的诅咒勾选、骨币倍率、`curse_5/curse_7` 成就全被污染。同一个中文词如果背后是两种语义（自选大局 vs 局内小账），必须两套数据、两个 src、两个存档字段，别图省事复用数组。

---

## 4. 文件地图（js/，66 个模块，只列要动的）

| 文件 | 职责 |
| --- | --- |
| `main.js`（~1 万行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、`DIFFS`、升级/商店节点、吃 `roundMod` 四项（hp/dmg/speed/haste） |
| `stats.js` / `weaponStats.js` | 两套属性引擎（`(base+Σflat)×(1+Σpct)×Πmul`） |
| `enemy.js` | 28 只怪的行为、`CLIP_FAMILIES`、`cdOf`、`haste`、冰冻/定身、并联体、称量官、看守五招、墨线、加急袋鼠、`moveToward`（嘲讽收口） |
| `weapon.js` | 环剑 3 把 + 6 元素剑（除铁剑外群伤 7 格）+ 万剑齐发；`setMuted()` / `holdOrbit()` |
| `skills.js` | 技能注册表 8 格（万剑 / 箭雨 / 回血 / 傀儡 / 墨丸 / 拿铁 / 守夜烛 / 落款） |
| `upgrade.js` | 109 张升级卡、`weightOf` 门控、`*Change()` 文案函数 |
| `challenge.js` | **第 122 块**：挑战九条 + 规划 + 奖励池，纯数据纯函数 |
| `relics.js` + `mine/latte/golem/candle/mark.js` | 14 件法器引擎（各 3 级，独立 `reset / applyCard / snapshot`） |
| `shop.js` / `campfire.js` / `boons.js` / `curses.js` / `metaShop.js` | 商店 40 件 / 篝火 9 簇 / 火种 16 卡 / 诅咒（夜行 6 + 刷新减成 10）/ 盲盒 |
| `events.js + eventsExtra + eventsSide + repEvents` | 131 个事件（99 随机 + 10 番外 + 13 连锁 + 9 民心），`TEMP_SCALE` |
| `deposit.js` / `hazards.js` / `traffic.js` / `fog.js` | 第八关寄存柜 / 场地机关 / 第十二关车流 / 第十一关雾（后三者零 import，纯注入） |
| `achievements.js` / `dailyQuest.js` / `signin.js` / `codex.js` / `story.js` | 118 成就（手动领取）/ 每日 39 条 / 签到 / 图鉴 / 18 夜主线（12 夜已绑关） |
| `profile.js` / `runSave.js` / `saveIO.js` / `assetUrl.js` / `sw.js`(根目录) | 档案聚合 / 存档读 / 导入导出（`NWSZ1:` 压缩码）/ 给 glb 拼 `?v=` / Service Worker |

---

## 5. 调试钩子（`?debug=1` 才有 `window.__game`）

```
getState() / level.roundNo / level.phase / enemies.all() / enemies.spawn(type,{x,z},opts)
enemies.takeDamage(e,n)  清场会弹三选一；__game.hurt(99) 直接结算
pos() / warp(x,z) / iframe() / rootT() / rootPlayer(sec)
run.save() / load() / clear() / resume()        jumpToRound(n) / skipRound()（仅 adminOn）
runCurses() / setCurses(ids) / curseMul()       adminOn() / setAdmin(b)
shop.stock / shop.open(roundNo) / shop.close()
upgrade.refresh{r.left,r.paid,r.free} / refreshClick() / rfText / addCurse(id)
chal.list() / plan() / used() / active / force(id,round) / accept() / refuse() / look()
chal.ask{open,round,id} / reward{open,round,items} / takeReward('coin'|'card'|'boost')
chal.dmg / chal.noSkill / chal.boost{round,info,n}        ← n 是条数（info 名字自带「·」）
traffic.list/config/spawn · latte.drop/count/bonuses · fog{on,count,spawn,heat,clearPatches}
```
> `chal.plan()` / `used()` 是**函数**不是属性；调试口一律回扁平值（见坑 35）。

---

## 6. 发版与测试

- **推送**：`git -c http.proxy=http://127.0.0.1:7897 push` → `git status -sb` 验证 → `curl --noproxy '*'` 连查两次版本号（Pages 约 1 分钟生效）。
- **回归**：`sh .tmp-94-runall.sh`（**62 套 Node**，只报挂了的）；CDP 按需单套串行（第 122 块为 `.tmp-122-cdp.js` 59 项）。
- **已知黄账（别浪费时间）**：`camp-test` 84/22、`boon-test` 133/13、`eventui-test` 35/2、`block18` 34/1、`start-test` 33/15、`block30-cdp` 42/8、`ui-test` 15/7、`block54-cdp` 签到浮层 z-index。
- 老套件 `ok()` 签名不统一：`block41` 是 `ok(name, cond)`，`block59/64/65/66/67/70` 是 `ok(cond, name)` —— 写新套件先看日志格式。

---

## 7. 下一步

用户 2026-10-21 定：**不做多角色，其他都能做，只要局外因素对局内影响不过大**。

- [ ] **第十四关起**（`story.js` 还有 5 夜 `levelId:null`；模板照 `LEVEL_13` 抄，带场地机制的关加 `track` / `traffic` / `fog` 字段，**并且 `wave.js` 与 `main.js` 两处都要加**）
- [ ] 更多武器 / 技能（技能栏还剩几格）
- [ ] 性能优化（怪物合批 / 假阴影 / 视锥剔除）—— **等用户点头再动**
- [x] 主菜单 3D 背景 —— 用户 2026-10-28 明确「暂时不做了」
- 不做：排行榜（无后端）、商城/皮肤、广告位、多角色
