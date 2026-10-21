# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。
>   
> 最后更新：2026-10-21 夜 · 对应代码：第 23 块（见下方「当前状态」）

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
| 本地服务器     | `cd naiwa-rouge && python -m http.server 8124`（**必须 run_in_background**，否则 shell 退出就死，报错看起来像游戏没启动） |
| 测试脚本      | 在**上级**目录 `C:/Users/MECHREVO/Desktop/班级网站/.tmp-*.js`（回归资产，别删）                                      |
| node      | `C:/Users/MECHREVO/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`                           |
| 无头 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe`                                            |

**网络坑**：github.com 经常连不上（Pages 反而通）。推送用
  
`git -c http.proxy= -c https.proxy= push origin main`（绕过本地 7897 代理），失败就重试几轮。

---

## 2. 当前状态（2026-10-21 12:50）

| 块      | 内容                                            | 状态                          |
| ------ | --------------------------------------------- | --------------------------- |
| 1~16   | 见文末「历史」                                       | 已上线（v=20）                   |
| **17** | 设置面板 + 存档续玩                                   | 已上线（dad5e91）                |
| **18** | 图鉴 + 成就 + 战绩 + 难度                             | 已上线（7c7fd22）                |
| **19** | 篝火 · 夜行骨币（局外成长）                               | 已上线（605fe08，v=23）           |
| **20** | 第二关「骨塔庭院」+ 三位巫师 + 场景双主题 + 关卡参数化               | 已上线（358f34d / 073947d，v=24） |
| **21** | 夜行诅咒（自选 debuff 换骨币倍率）                         | 已上线（7a222bf，v=25）           |
| **22** | 今日挑战 + 种子（日期哈希，无需服务器）                         | 已上线（7a222bf，v=25）           |
| **23** | 金币自动拾取 + 局外成长重做（篝火 3 级 / 永夜火种 / 金币折骨币 / 关卡倍率） | 已上线（1907838，v=26） |

第 20 块要点（详见 README「第二关 · 骨塔庭院」段）：

- **用户定案：一个巫师只带一件独门技能**——骨咒师（紫阵+减速诅咒）/ 火焚巫祝（灼地持续伤害）/ 霜牢主祭（光环加攻速减伤，不出手）。共用 `skeleton-mage.glb`，靠帽子/眼睛发光色/程序化法杖/身高区分。
- `wave.js` 参数化成 `createLevel(def, deps)`，加新关 = 加数据 + `LEVELS_BY_ID` 注册；第一关数值没动（144 项单测原样通过）。
- `scene.js` 双主题（meadow / crypt），`setTheme` 只改颜色和地面贴图。
- 主角减速诅咒：main.js 的 `cursePlayer`（只减移速、不叠加、2.6s 自退），HUD 有「咒」角标。
- **巫师模型 `sourceHeight` 已验证（2026-10-21）**：并排截图 + 离线正交渲染剪影确认视觉比例与落脚正确（脚底 ≈ -0.01），数值保持 1.20 不动。⚠️ 巫师骨架本身比骷髅兵矮、视觉高度靠帽子/法杖撑，自动量法（逐顶点 / 读像素）会得出 2.2~3.4 的乱数，**改数值请走截图人眼比对**。

第 21 / 22 块要点：

- **诅咒**：`curses.js` 的 `RUN_CURSES` 六条（脆骨/铅足/迟滞/空囊/薄刃/荆棘），倍率**加法叠加**（全选 ×2.30），落账在 `startPlay`（`applyRunCurses`，带 `src='curse'`），荆棘走 `curseDmg` → `hurtPlayer` 的乘法；勾选存 `profile().runCurses`。
- **种子**：`seed.js`，日期 → FNV-1a → mulberry32；五个系统五条**独立随机流**（card/shop/event/gold/talk），普通局 `seed=0` 时全部退回 `Math.random`。
- **每日挑战**：固定第一关 · 噩梦 · 两条由种子挑的诅咒，额外 ×1.25 骨币；战绩键 `naiwa_rouge_daily_v1`（一天一条，只留更好的）。
- **难度是局内临时覆盖**（`diffOverride`），**绝不写 profile** —— 写过一次，中途刷新会把玩家难度永久改成噩梦（第 22 块踩到）。

第 23 块要点（局外成长重做 + 金币吸附）：

- **金币进圈即拾**：`gold.update(dt, player, range)`，range = `stats.get('attackRange')`。进圈后 0.15 秒飞向奶蛙再入账（有动画）；**圈外仍然留 3 秒**。`gold.flush()` 在 `endGame` 开头把地上的钱全收进兜里（否则结算会少算），然后按 25% 折骨币。
- **篝火改成多级**：`CAMP_MAX_LEVEL=3`、`CAMP_STEP=1.6`，`campCost(id, level)` = 原价 × 1.6^level。老档案里 `camp[id]=1` 天然读作 1 级，**不需要迁移**。
- **骨币产出**加了两个维度：`coins`（没花完的金币 ×0.25）与 `levelId`（`BONE.levelMul`：1 关 ×1 / 2 关 ×1.4 / 3 关 ×1.8）。`bonesFor` 的签名向后兼容（老调用不传就是 0 金币 / 第 1 关）。
- **永夜火种**（`boons.js`）：**通关一大关** → `grantBoons(3)` 写 `profile().boonPending` → 结算按钮变「领取 3 次永夜火种」→ 复用三选一面板（`upPanel` + `.boon` 皮肤），抽签走 `rollBoons(rng, {luck})`，权重和局内卡同一套 `rarity.js`。
- **待领次数必须落档案**：玩家很可能在结算界面直接关网页。`showTitle` 会检查 `boonPending()` 并自动补弹（500ms 后，等标题页动画）。
- 16 张卡、**每张 1~3 层上限**，满层退出抽签池；满层共 40 层（要约 12 次通关全收）。数值压得很小，全满 ≈ 一局中期的分量。
- 结算面板：`rsBtn` 文案与 `.boon` 金色样式在 `endGame` 里按 `boonGain` 切换；`rsBone` 明细多了「第 N 关 ×1.4」和「剩 X 金币折 Y」。

测试：Node 8 套 679（新增诅咒/种子 84）+ CDP 26 套 847（新增 block21 36、block22 38；第 18 块图鉴 31→35、弓手 21→22）。

第 18 块那个 P0 的完整链路（已修，留作教训）：
  
`chooseUpgrade` 里 `countCard(up.id)` 没 import → 每次选卡抛 `ReferenceError`，
  
而它排在 `upPanel.classList.remove('on')` **之前** → 面板留在屏幕上、`pointer-events` 还是 `auto`，
  
盖住技能键、`gameState` 卡在 `'upgrade'` → 玩家看到的就是「点了三选一没反应」。

第 20 块又踩一次同类坑（已修）：`codex.js` 的 `NUM()` 对 `cfg.damage` 直接 `toFixed`，
  
而霜牢主祭按设计**没有 damage 字段**（从不还手）→ 一打开图鉴怪物页就抛
  
`TypeError`，整个面板白屏。教训：**新怪允许缺字段，遍历 ENEMY_TYPES 的渲染代码必须容错**；
  
`enemy.js` 的 spawn 也顺手做了 `Number.isFinite` 兜底（否则 `Math.max(1, NaN)` 还是 NaN）。

---

## 3. 文件地图（js/）

| 文件                                                                                           | 职责                                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `main.js` (~2900 行)                                                                          | 主循环 + 所有 UI 面板（标题/选关/记录/设置/图鉴/商店/升级/事件/背包/结算/教程）+ 各系统接线。**改之前先 grep 定位**                                   |
| `wave.js`                                                                                    | 20 回合编排、`roundScale`、**难度 DIFFS**、`startAt`（读档）、升级点/商店点                                                    |
| `stats.js`                                                                                   | 通用属性引擎（`createStats(defs)`），主角 14 项 / 武器 11 项两套实例；`dumpMods/loadMods`（存档）                                  |
| `enemy.js`                                                                                   | 7 种怪（minion/warrior/archer/bowman + 第二关巫师 hexer/pyro/hierarch）、红圈落箭、法术地阵（hex/burn）、光环、`takeDamage(无敌期打不动)` |
| `weapon.js`                                                                                  | 环剑、5 种元素剑、`grant/addSword/restore`                                                                         |
| `turret.js` / `relics.js`                                                                    | 弩炮台（上限 3）、地刺/霜环（各 3 级），都有 `restore`                                                                        |
| `upgrade.js`                                                                                 | 28 张升级卡（含 rarity 0~4）                                                                                      |
| `shop.js`                                                                                    | 18 件货、按品质加权摆 4 件、`itemLocked`                                                                              |
| `events.js`                                                                                  | 57 事件 + 10 连锁（对话/条件/取舍）                                                                                    |
| `campfire.js`                                                                                | 篝火/骨币（第 19 块建，第 23 块多级）：`bonesFor`（回合/击杀/通关/金币/关卡）、六簇×3 级阶梯价、`campApply`                                   |
| `boons.js`                                                                                   | 永夜火种（第 23 块）：16 张永久卡 + 层数上限 + 品质抽签（吃幸运）+ `boonPending` 待领次数                                                |
| `curses.js`                                                                                  | 夜行诅咒（第 21 块）：六条自选 debuff、倍率叠加、`applyRunCurses` 落账/撤销                                                       |
| `seed.js`                                                                                    | 种子与每日挑战（第 22 块）：`hashStr`/`makeRng`/`dailySeed`/`pickDailyCurses`/每日战绩存档                                   |
| `rarity.js`                                                                                  | 五档品质唯一真相源（颜色/mul/luck）                                                                                     |
| `profile.js`                                                                                 | **本机档案**：settings / stats / codex / ach / bones，键 `naiwa_rouge_profile_v1`                                 |
| `runSave.js`                                                                                 | 存档续玩，键 `naiwa_rouge_run_v1`（每回合开始写，结算删）                                                                    |
| `codex.js`                                                                                   | 图鉴五页签的数据整理（纯渲染数据，无状态）                                                                                      |
| `achievements.js`                                                                            | 26 条成就定义（`{id,name,desc}`）                                                                                 |
| `audio.js`                                                                                   | 程序化音效 + BGM；`setSfxVolume/setMusicVolume`（与静音独立）                                                           |
| `joystick.js`                                                                                | 浮动摇杆；`setOpts({radius, hand})` 运行时改大小/左右手                                                                  |
| `scene.js` `frog.js` `fx.js` `gold.js` `skills.js` `input.js` `rangeRing.js` `swordKinds.js` | 场景/角色/特效/金币/技能/输入/范围环/剑种                                                                                   |

---

## 4. 铁律（违反会返工）

1. **全中文**：注释、文案、提交信息、README 都要中文。用户明确要求过。
2. **有疑问先问，不要边猜边写**。
3. **数值改动必须跑回归**：Node 5 套 + 相关 CDP 套（见 §6）。
4. **属性公式**：`(base + flat) × (1 + Σpct)`；`base = 0` 的属性只能用 flat（多乘会永远 0）。
5. **两套属性表**：主角 `STAT_DEFS`（14 项）、武器 `WEAPON_STAT_DEFS`（11 项）。剑击只读 `wstats`，不读主角。
6. **品质是抽签权重**，不是先摇档再挑卡（公式：`(w0+gw×(回合-1)) × rarity.mul × (1+luck×系数)`）。
7. **`handleRoundClear` 只允许存在一份**（同名 function 重复声明会静默覆盖，曾导致商店不弹）。
8. **一件武器只教一次**：`localStorage['naiwa_rouge_wtut_v1']`；`gameState='wtut'` 时能走能放技能但不推进波次。
9. **README.md 必须与实况同步**（用户规则）。
10. **测试用的 `?debug=1` 默认不落存档**（要落档加 `&keepsave=1`）。

---

## 5. 调试钩子（`?debug=1` 才有 `window.__game`）

```
stats / wstats / enemies / level / weapon / fx / input / pos / scene / renderer
getState()            当前 gameState（title/playing/tutorial/wtut/over）
level.roundNo / level.phase / level.shouldUpgrade(n)
enemies.spawn(type, {x,z}, opts) / all() / takeDamage(e,n) / aliveCount()
ui.settings() ui.set(k,v) ui.quality() ui.renderCfg() ui.joy() ui.shake() ui.audio()
run.save() run.load() run.clear() run.resume()
codex.add(g,id) codex.count(g,id) codex.summary() codex.entries(tab) codex.show()
ach.try(id) ach.has(id) ach.list()
stats2()  → profile().stats
diff.set(k) diff.get() diff.scale(n)
setCoins(n) / coins（getter）
bag.total / bag.add(id,n) / bag.use(id)
turrets.count() / relics.levels()
weapon.grant() / weapon.orbitingCount / weapon.flyingCount
upgrade.isOpen() / upgrade.roll / shop.cards / hurt(n) / win()
runCurses() / setCurses(ids) / curseMul() / curseDmg()        ← 第 21 块
boons.list() / stacks(id) / pending() / grant(n) / roll(luck) / take(id) / apply() / show(after) / close() / totalStacks() / reset()   ← 第 23 块
camp.level(id) / camp.maxed(id) / camp.list()[i].costAt(lv) / camp.list()[i].full   ← 第 23 块（多级篝火）
seedInfo() / setSeed(n) / daily.{key,seed,code,curses,record,save,show,start}   ← 第 22 块
```

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e=>__game.enemies.takeDamage(e,999))` 清场（**注意：清光会弹三选一，挡住后续操作**）。

---

## 6. 测试

**Node 9 套（856 项，纯逻辑，秒级）**

```
cd C:/Users/MECHREVO/Desktop/班级网站
node .tmp-stats-test.mjs      # 70  属性引擎
node .tmp-rogue-unit.mjs      # 144 回合/升级/概率（含 roundScale 对拍）
node .tmp-econ-test.mjs       # 78  经济/商店/事件作用域
node .tmp-event-test.mjs      # 105 事件表规模与文案
node .tmp-rarity-test.mjs     # 71  品质/幸运
node .tmp-camp-test.mjs       # 99  篝火/骨币（多级 + 阶梯 + 金币折算 + 关卡倍率）
node .tmp-level2-test.mjs     # 59  第二关/巫师
node .tmp-curse-test.mjs      # 84  诅咒/种子/每日规则
node .tmp-boon-test.mjs       # 146 永夜火种（层数/品质吃幸运/待领次数/克制）
```

**CDP 端到端（27 套 909 项，需先起 8124）**

```
.tmp-start-test.js      48  开局→选关→教程→战斗→技能（含选卡关面板/技能键可点）
.tmp-battle-test.js     39  战斗全流程
.tmp-menu-test.js       24  主菜单/选关/记录
.tmp-settings-test.js   32  设置面板（音量/画质/摇杆/抖屏/重置）
.tmp-resume-test.js     28  存档续玩
.tmp-block18-test.js    31  图鉴/成就/战绩/难度
.tmp-block19-cdp.js     43  篝火/骨币（多级）
.tmp-wtut-test.js       34  武器教程
.tmp-block13-test.js    32  炮台/金钟罩/法器/背包
.tmp-shop-chain-test.js 49  .tmp-econ-cdp-test.js 44
.tmp-rogue-test.js      41  .tmp-ring-test.js 19  .tmp-atk-test.js 11
.tmp-weapon-test.js     19  .tmp-archer-test.js 20  .tmp-crowd-test.js 15
.tmp-talk-skill-test.js 54  .tmp-audio-test.js 41  .tmp-rarity-cdp-test.js 48
.tmp-bowman-test.js     21  .tmp-sword-shop-test.js 26
.tmp-live-smoke.js      12  线上烟测（GAME_URL 环境变量指线上）
.tmp-live-upgrade.js     7  线上验证「点三选一没反应」已修
.tmp-block21-cdp.js     36  诅咒（勾选/倍率/落账/受伤加重/结算/换局不残留）
.tmp-block22-cdp.js     38  每日挑战（种子稳定/固定规则/同种子同手牌/存档/成就）
.tmp-block23-cdp.js     60  金币吸附/多级篝火/发火种/火种面板/开局落账/标题页补选
.tmp-live-block23.js    15  线上专项（篝火 3 级 / 火种面板 / 版本号）
.tmp-dbg-boot.js           抓启动期异常（改完代码先跑这个，比整套 CDP 快）
```

写新 CDP 测试：抄 `.tmp-settings-test.js` 的骨架（CDP 连接 + goto + shot + 错误收集），
  
**`waitFor` 要定义在 IIFE 内部**（放外面会 ReferenceError: evaluate is not defined，踩过三次）。

**SwiftShader 下游戏时间慢很多**：测试必须轮询等待，不能固定 sleep 就断言。
  
**无头 Chrome 的截图输出路径不能含中文**（用 `C:/Users/MECHREVO/AppData/Local/Temp/wbtest`）。

**跑全量回归的正确姿势（2026-10-21 定的）**：

- 启动参数统一带 `--num-raster-threads=2 --renderer-process-limit=1` +
    
  `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`
    
  （不限流的话 SwiftShader 会按 32 个逻辑核开线程，单个实例就能把 CPU 打满；
    
  不关定时器节流的话 `duck` 那种 `setInterval` 渐变永远走不完）。
- **每套之间跑一次 `node .tmp-cdp-clean.js`**，按 `cdp-*-prof` 精确清掉超时残留的孤儿 chrome
    
  （`chrome.kill()` 只在正常路径执行，套件崩了就走不到，残留会叠着抢 CPU）。
- **串行跑，而且一次只跑一套**（用户 2026-10-21 明确要求「别把 CPU 占满，慢一点没关系」）：
  单实例 2 线程 ≈ 占 2 核，批量并发会互相拖超时、留一堆孤儿进程把 CPU 打满。
  逐套 `node .tmp-xxx.js` → `node .tmp-cdp-clean.js` → 下一套。
- 想用夸克浏览器跑也行（`D:/Quark/quark.exe`，内核 Chrome/144，CDP 与 SwiftShader 都通，见 `.tmp-quark-boot.js`），
  但它会注入一段自带脚本抛 `getTopURL` 异常，会污染「零报错」断言 —— 回归仍用 Chrome。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定的方向（原话意思）：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [x] 第 19 块：篝火 · 夜行骨币
- [x] 第 20 块：第二关 · 骨塔庭院
- [x] 第 21 块：诅咒系统（自选 debuff 换骨币倍率）
- [x] 第 22 块：每日挑战 + 种子
- [x] 第 23 块：金币自动拾取 + 局外成长重做（篝火多级 / 永夜火种 / 金币折骨币 / 关卡倍率）
- [ ] **第 24 块：主菜单 3D 背景**（场景和模型都在，只是没跑 render；奶蛙待机 + 远处骷髅剪影 + 萤火虫）
- [ ] 第二关 · 巫师（`skeleton-mage` 9 段动画已就位，`ENEMY_TYPES.mage` 是 planned）
- [ ] 更多武器/技能（`skills.js` 的 SKILLS 表，技能栏还剩 5 格）
- [ ] 性能优化（怪物合批/假阴影/视锥剔除）—— **等用户点头再动**
- [ ] 不做：主菜单排行榜（无后端）、商城/皮肤、广告位、多角色


## 9. 历史（一句话版）

第 1~10 块：角色/摇杆/战场 → 战斗/波次 → 属性系统 → 环剑 → 奇遇与商店 → 界面补全 → 金币与元素剑 → 怪群分散 → 音效。
  
第 11 块：五档品质 + 幸运。第 12 块：骷髅弓手（红圈落箭）+ 双拍 + 57 事件 + 金币落地 3 秒。
  
第 13 块：15→20 回合（273 只）+ 弩炮台 + 金钟罩 + 地刺/霜环 + 背包。
  
第 14 块：主页面菜单（开始游戏→选关 / 我的记录）。
  
第 15 块：获得新武器自动弹用法教程（可跳过，每种只教一次）。
  
第 16 块：金钟罩特效明显化 + 弓手去大红圈 + 背包按钮换图标放大 + 新手教程加背包步骤。
  
第 17 块：设置面板（音量分离/画质/摇杆/抖屏/重置）+ 存档续玩。
  
第 18 块：图鉴（5 页签）+ 26 条成就 + 全局战绩 + 难度三档。
  
第 19 块：篝火 · 夜行骨币（局外成长，六簇火种）+ 修 `countCard` 未定义的 P0（选卡卡死）。
  
第 20 块：第二关「骨塔庭院」（三巫师各一技 + 双主题 + 关卡参数化）。
  
第 21 块：夜行诅咒（六条自选 debuff 换骨币倍率；顺带修「base=0 的属性减不动」与 DOM id 撞车）。
  
第 22 块：今日挑战 + 种子（日期哈希、五条独立随机流、一天一条战绩、难度走局内临时覆盖）。
