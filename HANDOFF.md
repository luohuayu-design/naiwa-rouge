# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。
> 最后更新：2026-10-21 · 对应代码：第 18 块（工作区已提交，见下方「当前状态」）

---

## 0. 一句话

Three.js r160 的单摇杆幸存者肉鸽《奶蛙夜行》，纯静态站点（无构建、无 CDN、零依赖），GitHub Pages 发布。玩家是一只会走路的奶蛙，在荒草地上撑过 20 个回合。

---

## 1. 位置与环境

| 项 | 值 |
|---|---|
| 本地仓库 | `C:/Users/MECHREVO/Desktop/班级网站/naiwa-rouge`（**独立 git 仓库**，绝不要把它的文件提进上级 class-website 仓库） |
| 线上 | https://luohuayu-design.github.io/naiwa-rouge/ |
| 远端 | `luohuayu-design/naiwa-rouge`，main 分支，Pages = main / root |
| 本地服务器 | `cd naiwa-rouge && python -m http.server 8124`（**必须 run_in_background**，否则 shell 退出就死，报错看起来像游戏没启动） |
| 测试脚本 | 在**上级**目录 `C:/Users/MECHREVO/Desktop/班级网站/.tmp-*.js`（回归资产，别删） |
| node | `C:/Users/MECHREVO/.workbuddy/binaries/node/versions/22.22.2-6/node.exe` |
| 无头 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe` |

**网络坑**：github.com 经常连不上（Pages 反而通）。推送用
`git -c http.proxy= -c https.proxy= push origin main`（绕过本地 7897 代理），失败就重试几轮。

---

## 2. 当前状态（2026-10-21 11:35）

| 块 | 内容 | 状态 |
|---|---|---|
| 1~16 | 见文末「历史」 | 已上线（v=20） |
| **17** | 设置面板 + 存档续玩 | 代码完成，**提交 dad5e91 但推送失败**（ahead 1） |
| **18** | 图鉴 + 成就 + 战绩 + 难度 | 代码完成，测试 31/31 绿，**本轮刚收尾** |

线上还是 **v=20**（第 16 块）。本地 index.html 已到 **v=22**。
👉 **下一步第一件事：`git push`，然后轮询 Pages 到 v=22，跑线上烟测。**

---

## 3. 文件地图（js/）

| 文件 | 职责 |
|---|---|
| `main.js` (~2900 行) | 主循环 + 所有 UI 面板（标题/选关/记录/设置/图鉴/商店/升级/事件/背包/结算/教程）+ 各系统接线。**改之前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、**难度 DIFFS**、`startAt`（读档）、升级点/商店点 |
| `stats.js` | 通用属性引擎（`createStats(defs)`），主角 14 项 / 武器 11 项两套实例；`dumpMods/loadMods`（存档） |
| `enemy.js` | 4 种怪（minion/warrior/archer/bowman）、红圈落箭、`takeDamage(无敌期打不动)` |
| `weapon.js` | 环剑、5 种元素剑、`grant/addSword/restore` |
| `turret.js` / `relics.js` | 弩炮台（上限 3）、地刺/霜环（各 3 级），都有 `restore` |
| `upgrade.js` | 28 张升级卡（含 rarity 0~4） |
| `shop.js` | 18 件货、按品质加权摆 4 件、`itemLocked` |
| `events.js` | 57 事件 + 10 连锁（对话/条件/取舍） |
| `rarity.js` | 五档品质唯一真相源（颜色/mul/luck） |
| `profile.js` | **本机档案**：settings / stats / codex / ach / bones，键 `naiwa_rouge_profile_v1` |
| `runSave.js` | 存档续玩，键 `naiwa_rouge_run_v1`（每回合开始写，结算删） |
| `codex.js` | 图鉴五页签的数据整理（纯渲染数据，无状态） |
| `achievements.js` | 26 条成就定义（`{id,name,desc}`） |
| `audio.js` | 程序化音效 + BGM；`setSfxVolume/setMusicVolume`（与静音独立） |
| `joystick.js` | 浮动摇杆；`setOpts({radius, hand})` 运行时改大小/左右手 |
| `scene.js` `frog.js` `fx.js` `gold.js` `skills.js` `input.js` `rangeRing.js` `swordKinds.js` | 场景/角色/特效/金币/技能/输入/范围环/剑种 |

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
```

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e=>__game.enemies.takeDamage(e,999))` 清场（**注意：清光会弹三选一，挡住后续操作**）。

---

## 6. 测试

**Node 5 套（468 项，纯逻辑，秒级）**
```
cd C:/Users/MECHREVO/Desktop/班级网站
node .tmp-stats-test.mjs      # 70  属性引擎
node .tmp-rogue-unit.mjs      # 144 回合/升级/概率（含 roundScale 对拍）
node .tmp-econ-test.mjs       # 78  经济/商店/事件作用域
node .tmp-event-test.mjs      # 105 事件表规模与文案
node .tmp-rarity-test.mjs     # 71  品质/幸运
```

**CDP 端到端（需先起 8124）**
```
.tmp-start-test.js      46  开局→选关→教程→战斗→技能
.tmp-battle-test.js     39  战斗全流程
.tmp-menu-test.js       24  主菜单/选关/记录
.tmp-settings-test.js   31  设置面板（音量/画质/摇杆/抖屏/重置）
.tmp-resume-test.js     28  存档续玩
.tmp-block18-test.js    31  图鉴/成就/战绩/难度
.tmp-wtut-test.js       34  武器教程
.tmp-block13-test.js    32  炮台/金钟罩/法器/背包
.tmp-shop-chain-test.js 49  .tmp-econ-cdp-test.js 44
.tmp-rogue-test.js      41  .tmp-ring-test.js 19  .tmp-atk-test.js 11
.tmp-weapon-test.js     19  .tmp-archer-test.js 20  .tmp-crowd-test.js 15
.tmp-talk-skill-test.js 54  .tmp-audio-test.js 41  .tmp-rarity-cdp-test.js 48
.tmp-bowman-test.js     21  .tmp-sword-shop-test.js 26
.tmp-live-smoke.js      12  线上烟测（GAME_URL 环境变量指线上）
```
写新 CDP 测试：抄 `.tmp-settings-test.js` 的骨架（CDP 连接 + goto + shot + 错误收集），
**`waitFor` 要定义在 IIFE 内部**（放外面会 ReferenceError: evaluate is not defined，踩过三次）。

**SwiftShader 下游戏时间慢很多**：测试必须轮询等待，不能固定 sleep 就断言。
**无头 Chrome 的截图输出路径不能含中文**（用 `C:/Users/MECHREVO/AppData/Local/Temp/wbtest`）。

---

## 7. 下一步（用户已拍板的方向）

用户 2026-10-21 定的方向（原话意思）：**不要多角色，其他都可以做，只要局外因素对局内影响不会过大**。

- [ ] **推送 + 上线 v=22**（第 17、18 块），跑线上烟测
- [ ] **第 19 块：篝火 · 夜行骨币**（局外成长，必须克制：每项只 +1、价格高、不能把难度吃掉）
- [ ] **第 20 块：诅咒系统**（自选 debuff 换骨币倍率，结算显示「本次 ×N」）
- [ ] **第 21 块：每日挑战 + 种子**（日期哈希出固定 seed，无需服务器）
- [ ] **第 22 块：主菜单 3D 背景**（场景和模型都在，只是没跑 render；奶蛙待机 + 远处骷髅剪影 + 萤火虫）
- [ ] 第二关 · 巫师（`skeleton-mage` 9 段动画已就位，`ENEMY_TYPES.mage` 是 planned）
- [ ] 更多武器/技能（`skills.js` 的 SKILLS 表，技能栏还剩 5 格）
- [ ] 性能优化（怪物合批/假阴影/视锥剔除）—— **等用户点头再动**
- 不做：主菜单排行榜（无后端）、商城/皮肤、广告位、多角色

---

## 8. 已知坑（都是踩过的）

1. **`GLTFLoader` 会洗掉骨骼名里的点**：`handslot.r` → `handslotr`，`getObjectByName` 两个名字都要试。
2. **怪物身高不能信包围盒**：用原点 + 截图实测，写死在 `ENEMY_TYPES.sourceHeight`。
3. **`bonetexture` 依赖 WebGL2**：小游戏/老设备上要做 WebGL2 归一化（本项目是纯网页，不受影响）。
4. **`takeDamage` 对 `state==='spawn'`（钻地无敌期）返回 false** —— 测试杀怪前要等 `state==='chase'`。
5. **`hurtPlayer` 只在 `gameState==='playing'` 且 `iframe<=0` 时生效** —— 面板打开/无敌帧期间调 `hurt()` 无效。
6. **`startAt` 不重放前面回合**：只设 `roundIndex`，`roundMod` 由存档恢复。
7. **存档 mods 必须保留 `src`**：`clearRoundBuffs` / `removeBySource` 靠它清事件 buff。
8. **设置面板的摇杆大小要同时改逻辑半径和视觉缩放**（`--joy-s`），只改一个会「看着大、推着近」。
9. **画质切档只切 `shadowMap.enabled`**，不要遍历改 `castShadow`（改坏过）。
10. **`?debug=1` 时 `saveRunAtRound` 直接 return**（除非 `&keepsave=1`），否则测试互相覆盖存档。

---

## 9. 历史（一句话版）

第 1~10 块：角色/摇杆/战场 → 战斗/波次 → 属性系统 → 环剑 → 奇遇与商店 → 界面补全 → 金币与元素剑 → 怪群分散 → 音效。
第 11 块：五档品质 + 幸运。第 12 块：骷髅弓手（红圈落箭）+ 双拍 + 57 事件 + 金币落地 3 秒。
第 13 块：15→20 回合（273 只）+ 弩炮台 + 金钟罩 + 地刺/霜环 + 背包。
第 14 块：主页面菜单（开始游戏→选关 / 我的记录）。
第 15 块：获得新武器自动弹用法教程（可跳过，每种只教一次）。
第 16 块：金钟罩特效明显化 + 弓手去大红圈 + 背包按钮换图标放大 + 新手教程加背包步骤。
第 17 块：设置面板（音量分离/画质/摇杆/抖屏/重置）+ 存档续玩。
第 18 块：图鉴（5 页签）+ 26 条成就 + 全局战绩 + 难度三档。
