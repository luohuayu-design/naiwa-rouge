# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。**先读 §0，再按需查后面章节。**
> 最后更新：2026-10-28 · 线上 **v=128** · 第 113 块（删除成就「电光石火」）。
> 本文件只记**结论与坑**；逐块实现细节看代码注释与 `git log` / `git show`。

---

## 0. 给新对话的话

### 0.1 当前基线：v=127（第 112 块「整体提难度」，58 套 Node 测试全绿）

用户五条，已全部落地：

1. **四档难度**（`js/wave.js` 的 `DIFFS`）：简单 `hp 0.90 / dmg 0.75 / speed 0.95 / haste 0.95`、普通 `1.80 / 1.55 / 1.08 / 1.10`（= 旧地狱）、噩梦 `2.30 / 1.90 / 1.14 / 1.16`、地狱 `2.90 / 2.30 / 1.20 / 1.22`；骨币倍率 `campfire.js` 的 `BONE.diffMul` = `0.6 / 1 / 1.4 / 1.8`。
2. **称量官**：`hp 8`、`attackInterval 8`、每 8 秒一层、**无层数上限 / 全场无距离限制**；每层五项各 +10%（生命上限与当前血按比例、伤害、移速、攻速、减伤按 `1-0.9^层` 连乘）。实例记 `hp0 / haste0`，每层都按**出生值**重算，不滚雪球；金环 `Math.min(4.5, 0.60+t*0.18)` 封顶；称量官死后 `clearWeigh()` 全场清零。
3. **盖章人**：`seal.radius 6.2`（边长 ×4）、`attackInterval 2.4`、`windup 1.0`、`seal.time Infinity`；`main.js` 用 `sealBySource` Map 按盖章人 id 记账（`sealPlayer / unsealPlayer / sealMoveMul`），封步**持续到该盖章人死亡**，落印前判 `srcAlive`（人死了印盖空）。
4. **诅咒改最终乘算**（`stats.js` 新增 `mul`）：`final = (base + Σflat) × (1 + Σpct) × Πmul + adminFlat`；脆骨 `maxHp mul 0.66`（10 → 6.6，局中 +3 实际只 +1.98），其余五条同理。
5. **骨币倍率减半**：`frail .125 / lead .10 / sluggish .10 / hunger .10 / thin .075 / thorn .15`，六条全选 ×2.30 → **×1.65**。

测试：新增 `.tmp-block112-test.mjs`（93 项）；按新设计归一改写了 block65 / block82 / block91 / block97 的过期断言（不再写死 1.00 / 3 层 / 3 秒）。

### 0.2 最近几块（细节见 §2 与 git log）

- **113 · v=128**：删除成就「电光石火」（5 分钟内通关太难完成）及其埋点；成就 111 → 110（挑战 15 → 14、罕见 30 → 29），全清骨币 7800 → 7680。
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

### 0.4 发版与测试

- 推送：`git -c http.proxy=http://127.0.0.1:7897 ...`（本机 Clash 代理；代理没开时 push 会失败，让用户开代理，别改 git 配置）。
- 回归：`.tmp-block112-test.mjs` 等 **58 套 Node** 全绿；CDP 按需单套串行（一次只跑一套，套间 `node .tmp-cdp-clean.js`）。
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
| **113** | **v=128** | 删除成就「电光石火」（5 分钟内通关）及埋点；成就 110 条，全清 7680 骨币 |
| **112** | **v=127** | **整体提难度**：四档重排（普通=旧地狱）、骨币倍率 0.6/1/1.4/1.8；称量官 hp8 每 8s 一层无上限全场五项 +10%；盖章人方印 6.2 格 / 2.4s / 封步到死；诅咒改最终乘算（脆骨 66%）；诅咒骨币倍率减半（六条 ×1.65） |
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
| `main.js`（~6700 行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改之前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、`DIFFS`、`startAt`、升级 / 商店节点 |
| `stats.js` | 属性引擎（`createStats`）：主角 14 项 / 武器 12 项；本轮新增最终乘算 `mul` |
| `enemy.js` | **25 只怪**（24 个 glb；`addressee` 程序化）、`CLIP_FAMILIES`、血条、冰冻 / 定身、`attachTag`、木鱼灵追踪泡、并联体分离、称量官叠层（`weighTier / dressWeigh / performWeigh / clearWeigh`）、盖章人（`spawnSeal` / `sealBySource`）、看守五招、`hittable` |
| `deposit.js` | 寄存柜（第八关）：`build / update / reset / addTag / takeAll / clearTags / setSeal`；常量 `CAP 8 / LOCK_DELAY 5.0 / RANGE 3.6`；掉牌率唯一真相源 `TAG_BASE 0.50` / `TAG_SEAL [.50,.34,.22,.13]` |
| `weapon.js` | 环剑、5 种元素剑、万剑齐发 CD 制；毒 / 冰 / 血 / 震 `aroundPoint()` 一圈（`elementRadius` 7.0、`elementRatio` 50%）；雷剑全场连锁 |
| `turret.js` / `relics.js` | 弩炮台（上限 3）、**10 件法器**（地刺 / 霜环 / 震钟 / 棘甲 / 暖炉 / 路口灯 / 绝缘斗篷 / 木鱼 / 镇牌铃 / 傀儡术），各 3 级 |
| `upgrade.js` | **87 张升级卡**（22 族 × 3 档 + 21 张结构卡）；`up.golem` / `up.arrow` 转交各自模块，changes 文案共用 `golemChange()` / `arrowChange()` |
| `golem.js` | 傀儡系统：铁傀儡（不拉仇恨 / 攻击=主角×1.5 / 主动追怪）+ 雪傀儡（拉仇恨 / 击退不伤害 / 站桩）；嘲讽收口在 `enemy.js moveToward` 顶部 |
| `hazards.js` | 场地机关：漏电地板 / 井底滴水 `drip` / 井口 `well` |
| `shop.js` | **27 件货**、按品质加权摆 4 件；`SHOP_PINNED` 常驻货；`onlyLevel` 精确关卡 |
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
| `skills.js` | 技能注册表：`visible / ready / progress / press / cdText` |
| `story.js` | 主线 18 夜 + 印记 / 结局；s01~s10 已绑关，剩 8 夜 `levelId:null` |
| `achievements.js` | **110 条成就** + 八类 + 三档 + `achClaim` 手动领取（「电光石火」已删） |
| `dailyQuest.js` | 每日任务（池 39：简 19 / 中 11 / 难 9，`avail` 抽签门控） |
| `accordion.js` | 通用手风琴（懒构建 + 单组展开） |
| `codex.js` / `audio.js` / `joystick.js` / `scene.js` / `frog.js` / `fx.js` / `gold.js` / `input.js` / `rangeRing.js` / `swordKinds.js` / `guide.js` | 图鉴数据 / 音频 / 摇杆 / 场景 / 角色 / 特效 / 金币 / 输入 / 范围环 / 剑种 / 攻略面板 |
| `assets/` | `rigged.glb`（奶蛙）、`weapons/`、`monsters/`（24 个 glb）、`golems/`（MC 贴图）、`props/`、`codex/*.webp`（25 张缩略图）、`audio/` |

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
```

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e => __game.enemies.takeDamage(e, 999))` 清场（**清光会弹三选一**）。

---

## 6. 测试

- **纯 Node（秒级）**：新增块各自 `.tmp-blockNN-test.mjs`。第 112 块为 `.tmp-block112-test.mjs`（93 项：四档数值 / diffMul / 称量官无上限 / 盖章人封步到死 / 六条诅咒实算 / 版本一致）。
- **实机 CDP（需先起 8124）**：`.tmp-blockNN-cdp.js` 或 `.tmp-NN-smoke.js`；启动参数带 `--num-raster-threads=2 --renderer-process-limit=1` 并关后台节流；**串行，一次只跑一套**，套间 `node .tmp-cdp-clean.js`；SwiftShader 慢，必须轮询等待不能固定 sleep；截图路径不能含中文。
- 跑全量：`sh .tmp-94-runall.sh`（只报挂了的）。**改数值类断言记得回头改老套件**（版本号 / 怪数 / 关卡数 / 卡池数 / 成就数 / 码表数都有人写死过）。
- 第 112 块回归结果：**58 套 Node 全绿**；block65 95 / block82 92 / block91 114 / block97 132 的新断言已按难度倍率归一。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [x] 第 19~112 块全部完成并推送（见 §2）
- [ ] **主菜单 3D 背景**（场景和模型都在，只是没跑 render）
- [ ] **第十一关起**（`story.js` 还有 8 夜 `levelId:null` 等接；模板照 `LEVEL_10` 抄）
- [ ] 更多武器 / 技能（`skills.js` 的 SKILLS 表，技能栏还剩 5 格）
- [ ] 性能优化（怪物合批 / 假阴影 / 视锥剔除）—— **等用户点头再动**
- [ ] 不做：主菜单排行榜（无后端）、商城 / 皮肤、广告位、多角色
