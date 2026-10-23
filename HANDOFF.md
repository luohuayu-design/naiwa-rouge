# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。**先读 §0「给新对话的话」，再按需查后面章节。**
>
> 最后更新：2026-10-23 晚 · 线上 **v=67** · 第 57 块（宣传有礼活动 / 20 新兑换码 / 图鉴夜行记忆卡顿优化 / sr-alt 字号 / boot 闪屏与浮层修复）已完成并推送。

---

## 0. 给新对话的话（2026-10-23 交接）

1. **当前基线**：v=67（第 57 块）已推送，git 工作区干净，**没有挂起的半成品**。用户新需求来了再开工，别主动找活。
2. **节奏**：用户偏好**小步块状推进**——一块功能 = 一次提交 = 一个版本号（v=N）。**做完回归绿就立刻推送交给用户测**，用户反馈比自测更快更准。
3. **最容易翻车的五件事**：
   ① 发版**两处版本号**都要 bump（index.html 的 `main.js?v=N` / `style.css?v=N` + `js/*.js` 里所有 `import ...?v=N`）——漏一处就是「本地好线上炸」；
   ② **重复 id 假绿**（v=61 翻车）：复制面板 HTML 忘改 id，测试用全局 `getElementById` 点击会掩盖——block50 有「全页零重复 id」通用断言，新面板直接抄；
   ③ 公告在 loading 淡完 **+700ms** 才弹，测试截图先 `sleep(2600)` 再 `__game.notice.hide()`；
   ④ `jumpToRound/skipRound` **只在 adminOn 时生效**，不开管理员是静默 no-op；
   ⑤ 本地服务器必须 `run_in_background`；CDP 截图路径**不能含中文**；推送走 `git -c http.proxy=http://127.0.0.1:7897 ...`（先 curl 探代理，挂了改直连）。
4. **最新绿基线**（动到相关文件后要回归）：Node 13 套约 1060 项 + CDP 52 套约 1700 项全绿，具体套件与数字见 §6。
5. **已知既有失败（过期断言，别浪费时间查）**：`.tmp-camp-test.mjs` 84/22、`.tmp-boon-test.mjs` 133/13（偶发抖动）、`.tmp-eventui-test.js` 35/2、`.tmp-block18-test.js` 34/1、`.tmp-start-test.js` 33/15、`.tmp-block30-cdp.js` 42/8、`.tmp-ui-test.js` 15/7；`.tmp-event-test.mjs` 主跑 105/0 偶发 104/1。
6. **用户规则**：全中文；有疑问先问、有疑问不写码；README 与实况同步；美术资产优先 GitHub 现成 CC0；不做多角色；局外对局内影响要小（篝火每级 +1 生命这种量级）。
7. **新怪信息卡在 `?debug=1` 下默认关**（第 55 块）：它会冻结世界，老 CDP 一开局被拦。测这张卡的套件加 **`&meet`**（或 `__game.meetCard.setAuto(true)`）；正常游玩永远开。同类「首次提示型」弹窗以后照这个办：**生产默认开、测试显式开**。
8. **改横向特性要回头跑老套件**（2026-10-23 教训）：读秒锁让 block32 静默挂；公告升 `NOTICE_VER` 让 block45 挂；**技能键常驻 DOM**（`renderSkill` 只切 `display`）让 weapon/talk-skill/econ-cdp 数技能格假绿（必须 `filter(b => b.style.display !== 'none')`）；乞丐/商队两拍对话 + 3s 读秒让 `choose` 点 disabled 静默失败（加 `sleep(3500)`）。

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

> 每个块的实现细节、测试坑、真 bug 教训已沉淀进上面的铁律 / 调试钩子 / 文件地图与代码注释，不再单列。

---

## 3. 文件地图（js/）

| 文件 | 职责 |
| --- | --- |
| `main.js`（~5400 行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改之前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、难度 `DIFFS`、`startAt`（读档）、升级/商店节点 |
| `stats.js` | 通用属性引擎（`createStats(defs)`），主角 14 项 / 武器 11 项两套实例 |
| `enemy.js` | 13 只怪（一只一个 glb）、`CLIP_FAMILIES` 动作家族翻译、配件挂骨骼、血条统一 `BAR_W=1.5`、冰冻 `freezeT` |
| `weapon.js` | 环剑、5 种元素剑；**万剑齐发 CD 制**（n=owned.length、不动环绕）；冰剑 `applyFreeze`、雷剑 `chainTargets(e, Infinity, Infinity)` |
| `turret.js` / `relics.js` | 弩炮台（上限 3）、地刺/霜环/暖炉（各 3 级） |
| `upgrade.js` | 28 张升级卡（含 rarity 0~4） |
| `shop.js` | 18 件货、按品质加权摆 4 件 |
| `events.js` + `eventsExtra.js` | 57 + 42 = 112 事件（对话/条件/取舍），`eventsExtra.js` 只放数据 |
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
| `story.js` | 主线 18 夜数据 + 印记/结局 + 调度（加新关只改对应夜的 `levelId`+`atRound`） |
| `codex.js` / `achievements.js` / `audio.js` / `joystick.js` / `scene.js` / `frog.js` / `fx.js` / `gold.js` / `skills.js` / `input.js` / `rangeRing.js` / `swordKinds.js` | 图鉴渲染数据 / 26 条成就 / 音频引擎 / 摇杆 / 场景 / 角色 / 特效 / 金币 / 技能注册 / 输入 / 范围环 / 剑种 |
| `assets/` | `rigged.glb`（奶蛙）、`weapons/`、`monsters/`（13 个 glb，共 5.0MB，boot 全量预载）、`props/`（CC0 道具）、`codex/*.webp`（13 张图鉴缩略图）、`audio/` |

---

## 4. 铁律（违反会返工）

1. **全中文**：注释、文案、提交信息、README 都要中文。
2. **有疑问先问，不要边猜边写**。
3. **资产优先 GitHub 现成 CC0**：需要 3D 模型/贴图/UI 形状贴图时先找现成的（KayKit / Quaternius 等），程序化只作加载失败兜底。
4. **数值改动必须跑回归**：Node 5 套 + 相关 CDP 套（见 §6）。
5. **属性公式**：`(base + flat) × (1 + Σpct)`；`base = 0` 的属性只能用 flat。
6. **两套属性表**：主角 `STAT_DEFS`（14 项）、武器 `WEAPON_STAT_DEFS`（11 项）。剑击只读 `wstats`。
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
```

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e=>__game.enemies.takeDamage(e,999))` 清场（**注意：清光会弹三选一，挡住后续操作**）。

---

## 6. 测试

**Node 13 套（纯逻辑，秒级）**：`node .tmp-stats-test.mjs`（属性）/ `.tmp-rogue-unit.mjs`（回合升级概率）/ `.tmp-econ-test.mjs`（经济商店事件）/ `.tmp-event-test.mjs`（112 事件）/ `.tmp-rarity-test.mjs`（品质幸运）/ `.tmp-camp-test.mjs`（篝火骨币）/ `.tmp-level2-test.mjs`（第二关）/ `.tmp-level3-test.mjs`（第三关）/ `.tmp-level4-test.mjs`（第四关）/ `.tmp-admin-test.mjs` / `.tmp-eventui-test.js` / `.tmp-curse-test.mjs` / `.tmp-boon-test.mjs`（永夜火种）。

**CDP 端到端（需先起 8124；一次只跑一套，套间跑 `.tmp-cdp-clean.js`）**：开局/战斗/菜单/设置/存档续玩/图鉴/成就/武器教程/炮台法器/`block18~57` 各块专项/`admin`/`seed`/`pack`/`promo`/`start-test` 等共 52 套，约 1700 项。脚本在上级目录（第 32 块前）与 `naiwa-rouge/`（第 41 块起）。

**跑全量回归的正确姿势（2026-10-21 定）**：
- 启动参数带 `--num-raster-threads=2 --renderer-process-limit=1` + 关后台节流（SwiftShader 会按核数开线程打满 CPU）。
- 每套之间跑一次 `node .tmp-cdp-clean.js` 清孤儿 chrome。
- **串行，一次只跑一套**（用户明确要求别占满 CPU）。
- **SwiftShader 慢很多，必须轮询等待不能固定 sleep**；无头截图路径不能含中文；`waitFor` 必须定义在 IIFE 内部。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [x] 第 19~57 块全部完成并推送（见 §2）
- [ ] **主菜单 3D 背景**（场景和模型都在，只是没跑 render）
- [ ] 第五关（主线 s05《一百只蛙的名单》蛙爷，`story.js` 里 `levelId:null` 等接）
- [ ] 更多武器/技能（`skills.js` 的 SKILLS 表，技能栏还剩 5 格）
- [ ] 性能优化（怪物合批/假阴影/视锥剔除）—— **等用户点头再动**
- [ ] 不做：主菜单排行榜（无后端）、商城/皮肤、广告位、多角色
