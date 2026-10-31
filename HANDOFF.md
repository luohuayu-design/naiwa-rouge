# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，**别翻聊天记录**。要动手只读 §1 铁律 + §2 当前状态 + §3 坑。
> 最后更新 2026-10-31 · 线上 **v=146** · 第 129 块。更早的细节查 `git log` / `git show`，本文件不重复。

## 0. 一句话

Three.js r160 的单摇杆幸存者肉鸽《蛙步 · 夜行》：纯静态站点（无构建、无 CDN、零依赖、无 importmap），GitHub Pages 发布，**手机浏览器兼容是硬约束**。玩家是一只会走路的奶蛙，**十六关 × 20 回合**。

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
9. **发版同时 bump 两处版本号**：`index.html` 与所有 `js/*.js` 的 `?v=N`（本轮 159 处），漏一处 = 本地好线上炸。
10. **新内容「先推送再交给用户测」**：本地回归绿 → 立刻 commit & push → 交「线上链接 + 改了什么 / 怎么试」。
11. **`README.md` 与 `HANDOFF.md` 必须与实况同步。**
12. **数值改动必须跑回归**（§6）；改用户可见文案同样要跑（老套件正则写死了数字）。
13. **新关卡至少带 2~3 只前面出现过的老怪**（只新增 1~2 张新面孔）。
14. **测试用 `?debug=1` 默认不落存档**（要落加 `&keepsave=1`）；`debug` 下叙事 / 挑战 / 怪信息卡默认跳过，分别加 `&story` / `&chal` / `&meet`。
15. **加关卡 = 法器 + 技能 + 卡池一起加**（用户 2026-10-31 定的铁律）：新法器必须**五件齐**，少一件就是半成品 ——
   ① `skills.js` 一格（键位顺延；1~9 满了就往下借 `0`，第 11 格再想别的键）；
   ② `upgrade.js` **≥3 张专属卡** + `weightOf` 门控（`up.xxx && !opts.xxxOwned → return 0`）+ `xxxChange()` 文案函数（卡键 ↔ bonuses 键的唯一翻译处）；
   ③ `shop.js` 本体买断货 + 磨刀石 / 握柄两件成长货 + `itemLocked` 分支；
   ④ `relics.js` 的 `RELIC_DEFS` 定义 + `levels` / `cds` 两张状态表；
   ⑤ 主循环里「技能 CD 缩短」的那条循环要带上它。
   **只做前两步最像做完了**：技能栏有图标、按得出来，但三选一永远抽不到，成长线只剩商店一条。`block124` 里有守卫断言（除初始的万剑齐发，每个技能都必须在卡池里找到自己的卡）。

---

## 2. 当前状态（v=146 · 第 129 块）

### 2.1 第 129 块：第十六关「钟楼画室」+ 铅笔线稿圈 + 铅笔 / 描红

用户定案：场地机制 = **线稿定稿**；两只新怪 = **纸屑 + 画框**；配套 = **铅笔（第 18 件法器）+ 描红（技能，`R`）**；两只新怪各用一份新下载的 CC0 模型（零复用）。

**场地：`js/sketch.js`（零 import，和 spotlight / cutter 一套写法）**
- 每圈走三相 `draft → ink → idle`：淡草稿圈先亮 `warn 2.0s`（`inkLife 1.6s` 的定稿余辉），**定稿那一瞬站在圈里**的人被判一次 `{kind:'pin', damage:0.06, sec:1.2}` —— 钉 1.2 秒 + 掉 6% 最大生命（伤害走 `'hazard'`，不吃防御、无视无敌帧、被绝缘斗篷全免）。
- `cfg`：`arena 19 / count 1 / radius 1.55 / warn 2.0 / gap 2.4 / pct 0.06 / pin 1.2 / extraAt [{6,+1},{11,+1},{16,+1}]` —— 后场 4 圈轮换。
- 陷阱与第十五关**相反**：光斑是「主动走进光里贪」，线稿是「提前算时间走开」。
- `trapFrame({x,z,half,life})` 是画框怪用的**囚笼**：`clampPoint(x,z)` 把主角钳回框内，`frameCount` 给 `combatCtx.trapFrame` 兜上限（同屏最多 2 个）。
- 存档不进 `snapshot`：**由关卡表在 `setLevel` 里重建**（`sketch.build(level.level.sketch || null)` + `setRound` + `clearFrames`）。
- 踩过的 bug：`extraAt` 的槽位必须在 `rebuild()` 里先算总数再分槽，否则后加的圈会把布局挤到场地外。

**两只新怪（`enemy.js`）**
- **纸屑 `paper`**（`paper-scrap.glb`，Quaternius「Debris Papers」CC0）：1 血 / 移速 2.55 / `selfDestruct` 一碰就爆 —— 最脆最快的炮灰，永远一群一群来，逼你边算圈边清场。它是**平摊道具**：`sourceHeight:1.24`（包围盒最大边）/ `tiltX:-0.42` / `doubleSided:true`（坑 23a + 23b）。
- **画框 `frame`**（`picture-frame.glb`，CreativeTrio「Painting」CC0）：4 血 / `damage:0`（一下都不打人）/ 站 4.6 格外 / 每 8.5 秒读条 0.85 秒 → `ctx.trapFrame` 在你**脚下扣一个方框**（`half 1.8 / life 3.2`）；`keepDistance` 让它不贴脸。同样 `sourceHeight:0.268` / `tiltX:-π/2` / `doubleSided:true`。
- `handleFrame` 走 `waitRing` 读条环；`combatCtx.trapFrame` 已是「第 3 个框直接 return false」。

**第 18 件法器「铅笔」`js/pencil.js`（自动划线 + `R` 描红）**
- 被动：每 8/7/6 秒沿**面朝方向**划一道 5/6/7 格的线（`lineLife 8s`）；踩线的怪移速 −30% + 每 0.4 秒吃 `dps × 0.4` 的 `dot` 伤害（`lineDps 0.6/0.8/1.0`，吃 `amp.dmg`）。
- 主动「描红」：面前 7.5 格、宽 2.0 的长线，命中的怪挂 `e.redlined = {t, dmgMul, ringT}` → `takeDamage` 里 `red` 之后再乘 **×1.25**（5 秒），头上多一圈红。CD 30/26/22（`cdMin` 15）。
- 商店：本体 34（第 16 关起 / 第 8 回合 / `SHOP_PINNED` 12 回合）+ 买断「加长笔杆」20（线 +1.5 格）与「双头铅笔」24（同时划十字第二道）。
- 五张专属卡：`pencilLen / pencilDps / pencilRate / pencilCd / pencilMark`；`weightOf` 门是 `up.pencil && !opts.pencilOwned → 0`。
- **技能 id 必须叫 `pencil`**（不是 `redline`）：`block124` 的守卫靠「技能 id ↔ 卡池」同名匹配，改成 `redline` 那一条就红。

**技能「描红」`skills.js`（`R` 键，技能栏第 13 格）**
- `visible: ctx.pencil.owned`，`ring: true`；`press` 调 `ctx.pencil.mark(ctx.playerPos, yaw)`；`lastFail` 回 `'lock'`（没买）/ `'cd'`。

**接线清单**：`wave.js` LEVEL_16（arena 19 / `hpMul 1.78` / `dmgMul 2.12` / 20 回合 / 14 种怪，新怪 `paper` 2.4 早于 `frame` 3.2）+ `LEVELS_BY_ID[16]`；`scene.js` `atelier` 主题（`makeAtelierTexture()` 暖木地板 + 草稿线 + 橡皮屑）；`story.js` s16 绑第 16 关；`main.js` 选关表 + import + `setLevel` 重建 + 主循环 `sketch.update/Frames/takeEvents` → `rootPlayer + hurtPlayer` + 圆形钳制后 `sketch.clampPoint` + 铅笔 `setRelicLevel/update` + 存档 + 调试口（在 `__game.block114` 桶）；`shop.js` 三件货 + `itemLocked`；`upgrade.js` 五张卡 + `pencilChange()` + `weightOf` 门；`relics.js` 定义 + `levels/cds`。
- 回归：新建 `.tmp-block129-test.mjs`（137 项，七段）+ `.tmp-129-smoke.js`（CDP 实跑第十六关 PASS、零 console 报错）；19 个老套件的计数与源码断言按十六关口径更新（法器 18 / 技能 13 / 商店 52 / 卡 127 / 怪 35 / 关卡 16 / glb 35 / 模块 73）。
- 缩略图坑：`paper / frame` 都是平摊模型，初版图只有影子。三处同时改才出得来 —— ① `doubleSided:true`（两处 traverse 都要设 `THREE.DoubleSide`）；② `.tmp-codex-shots.js` 的 `ELEV`（paper 0.62 / frame 0.30 提高俯角）；③ `SHADOW_K`（paper 0.28，影子小一点镜头才不拉远）。

### 2.2 第 128 块：第十五关「钟楼直播间」+ 补光曝光区 + 环形灯 / 开播

用户两轮定案：场地机制 = **补光曝光区**；两只新怪 = **超管 + 弹幕**；配套 = **环形灯（第 17 件法器）+ 开播（技能）**；键位 **Q / E**；两只新怪各用一份**新下载的 CC0 模型**；数值取「更贪」一档。

**场地：`js/spotlight.js`（零 import，和 track / cutter / traffic 一套写法）**
- 两盏光斑绕场地中心缓慢公转（不跑出场地），呼吸式明暗；`build(spec|null)` 开关、`update(dt)`、`reset()`、`setRound(r)`。
- 开局 2 盏；`extraAt` 第 **6 / 11 / 16** 回合各 +1（后场 5 盏），漂移速度按 `1 + 0.16 × 多出来的盏数` 变快 —— 后场没有一块能一直站的安全地。
- 收益 / 代价全在查询函数里：`coinAt`（光里击杀 **+3 打赏**）、`takenMulAt`（**×1.30**）、`enemyMulAt`（光里的怪 **×1.20** 移速）。
- 接线：`setLevel` 里 `spotlight.build(level.level.spotlight || null)` + `setRound`；主循环 `spotlight.update(dt)`；`enemy.moveToward` 经 `ctx.lightMul` 吃移速；`hurtPlayer` 的 `raw` 尾部再乘 `takenMul`；`onDeath` 掉币处叠 `coinAt`。

**两只新怪（`enemy.js`）**
- **弹幕 `danmaku`**（`glub.glb`，新下载 CC0）：3 血 / 移速 1.60 / 站 8.2 格外 / 每 3.9 秒吐一块**字牌**（`projectile.word`，四句「就这? / 下播吧 / 刷屏了 / 菜」canvas 贴图，直飞不翻滚，瞄「出招那一刻你的位置」）。横挪一步就错开 —— 本关第一课。
- **超管 `moderator`**（`yeti.glb`，新下载 CC0）：9 血 / **damage 0（一下都不打人）** / 每 11 秒读条 1.9 秒 → `ctx.silenceSkills(3.0)` 让**技能栏变灰 3 秒、Q / E 按不出**；读条可被一刀打断；团块家族借 `Jump` 当读条动作。
- 图鉴：`codex.js` 补两只专属数值行与一句话说明（`textContent` 渲染，禁 `**` / HTML）；缩略图 `assets/codex/danmaku.webp` / `moderator.webp` 由 `.tmp-codex-shots.js danmaku moderator` 离线出图。

**第 17 件法器「环形灯」`js/ringlight.js`（Q 键）**
- 基础：冷却 24 / 持续 6 / 半径 3.6 / 减速 30% / 灯下击杀 +1 打赏；三级表 + 五张专属卡（`ringDur/ringRad/ringSlow/ringCd/ringSet`）。
- 灯圈**跟着人走**（不是钉在原地），每 0.35 秒给圈里的怪刷一次 0.55 秒减速。
- 商店：本体 34（第 15 关起 / 第 8 回合 / `SHOP_PINNED` 9·12 回合）+ 买断「强光灯管」20（半径 +0.6 / 减速 +5%）与「落地支架」24（持续 +2 秒 / 冷却 −4 秒，`cdMin` 12 兜底）。
- **`restore()` 内部先 `reset()`**：读档顺序必须是 restore → 再 setRelicLevel（main.js 本来就是这个顺序，测试照抄才不假红）。

**技能「开播」`js/broadcast.js`（E 键）**
- 不挂法器：`visible` 看 `levelCleared(14)`（通关第十四关永久可用）。
- 6 秒内攻速 +20% / 移速 +15% / **每次击杀额外 +1 打赏**，但**受伤 +10%**；冷却 45 秒（`setCdMul` 下限 24）。
- **生命周期坑（本次修的真 bug）**：`update()` 先把 `t` 减到 ≤0 再调 `stop()`，而 `stop()` 原本用 `t > 0` 判断 → 直接 return，`stats.removeBySource('broadcast')` 永远不执行。现在用独立 `let on` 布尔：「在不在直播」与「还剩几秒」两本账。**以后写任何倒计时撤 mod 都别拿倒计时本体当开关。**

**接线清单**：`wave.js` LEVEL_15（arena 19 / `hpMul 1.70` / `dmgMul 2.05` / 20 回合 / 18 种怪，`order` 里弹幕 2.1 早于超管 3.0）+ `LEVELS_BY_ID[15]`；`scene.js` `studio` 主题（`makeStudioTexture()`）；`story.js` s15 绑第 15 关第 2 回合；`main.js` 选关表 / 三处打赏 / 受伤入口 / `silenceT` / `setLevel` / 存档 / 调试口；`shop.js` 三件货 + `itemLocked`；`upgrade.js` 五张卡 + `ringlightChange()`；`relics.js` 定义表（maxLevel 3）。
- 回归：新建 `.tmp-block128-test.mjs`（192 项，八段）；13 个老套件的计数与源码断言按十五关口径更新（法器 17 / 技能 12 / 商店 49 / 卡 122 / 怪 33 / 关卡 15 / glb 33）。
- 实机自检：headless Chrome 加载 `?debug=1` → `setLevel(15)`，无运行时异常；光斑 2 盏、环形灯 / 开播 / 禁言三个口都响应，两只新怪能生成。

### 2.3 第 127 块：收件人 / 回声减血 + 连杀「数字不封顶、加成封顶」

用户两条实测反馈：①「收件人和回声的血太厚」；②「连击数量显示无上限，但是属性加成有上限」。

**减血（只动 `enemy.js` 的 `hp`）**
- 收件人 `addressee` 6 → **4.0**：它一下都不打人，价值全在「给别的怪填名」；血比护盾怪（5）还厚时，拆它的时间成本高过它制造的麻烦，这一关只剩「绕着走」。
- 回声 `echo` 7 → **4.5**：每 15 秒从「这一局死过的怪」里照一只回来，站着就一直在发免死金牌 —— 血厚等于按着玩家的输出不放。4.5 与袋鼠 / 相机同一档：点得掉，但要专门跑一趟。
- **只改基础血量**，`roundScale` 的回合倍率照旧；不动移速 / 伤害 / 机制字段。

**连杀拆成两本账（`heat.js`）**
- 第 125 块把计数和加成一齐放开（30 连杀 = +36% / +54%）；这次按用户二次定案只放开计数：
  `setHeat` 只兜底到 0（**不钳上限**），`speedMul / atkMul` 读的时候才钳在 `HEAT_BONUS_CAP`（默认 10 连杀 = +12% / +18%）。
- 出口新增 `bonusCapped`（`heat >= HEAT_BONUS_CAP`）；`ratio` 钳在 1（仍可当进度条宽度）。
- `main.js` 的连杀浮现文案在加成满后追加 **「· 已满」**，否则玩家会以为「数字还在涨、怎么不更快了」是 bug。
- 手感只改 `HEAT_BONUS_CAP` 一个常量；**别在 `setHeat` 里加 `Math.min`**（那是第 125 块修掉的 bug）。
- 回归：`.tmp-block125-test.mjs` 的 ③ 段已按新语义改写（30 连杀 → 数字 30、加成 1.12 / 1.18），版本断言改成 `>=` 免得每次 bump 都红。

### 2.4 第 126 块：照影换成主角同款模型（紫色）

用户一句话：「把模仿者的 3D 模型换成和主角一样，只不过把黄色换成紫色」。
「模仿者」= 第十关的**照影**（`mirror`，唯一照抄玩家面板的怪）。

**做法：复制主角模型的贴图换色，不动几何。**
- 主角 `assets/rigged.glb` 是「单块网格 + 内嵌 webp baseColor」，贴图本来就是奶油黄。
- 复制一份，只把 baseColor 换成紫色版，存 `assets/monsters/mirror-frog.glb`；
  顶点 / UV / 法线 / 骨骼数据一个字节没改（测试里比了 accessor 的 count 和 min/max）。
- 旧的 `reflect-frog.glb`（Quaternius 四足蛙）连同 `CLIP_FAMILIES.frogbeast` 一起删掉。

**换色的算法（`sharp`，.tmp-purple.js，一次性脚本）**
- 不是色相旋转（`modulate({hue})` 试过 215/230/245/265/285 全都偏**粉**）——
  原图是高明度低饱和的暖黄，旋转后落在品红区。
- 改成**色度重定向**：保持每个像素的亮度 L 不变，把「相对 L 的 RGB 偏移」
  换成紫色方向的单位向量 × 原色度模长。
  `s = max(len × 1.30, 0.16)`，高光衰减 `damp` 防止亮部被钳成死白。
- `SAT_BASE = 0.16` 是关键：0.075 时肚皮（原米白、色度≈0）几乎还是奶白，
  用户要的是「紫身 + 浅紫肚」，这个下限决定灰白区域至少带多少紫。

**量化模型的坑（`sourceHeight` 不能拍脑袋）**
- 主角模型开了 `KHR_mesh_quantization`：POSITION 是 **normalized short**，满量程 32767；
  node scale 0.5392 + rotX 90°。套完世界高度 = **1.0784**（不是 1.30，更不是 2.28）。
- `cfg.height = 2.28`（= `frog.js` 的 `RIG.TARGET_H`，**和主角一模一样大**），
  所以缩放 s = 2.28 / 1.0784 ≈ 2.114。写错 sourceHeight 会直接差一倍。
- `footY: 0` —— node 的 translation.y 已经把脚底抬到原点，**不要再抬**。
- `radius` 0.44 → 0.60（主角 BODY_R 是 0.65，水影的判定略窄一点）。

**静态单网格的「活着」：`cfg.bounce`**
- 主角那套 7 骨蒙皮是 `frog.js` 专门为玩家造的一份（顶点权重按距离算），
  敌人这边只有静态网格 —— 放不了任何 clip，所以照影没有走路 / 攻击动画。
- 新增 `bounce: { amp, hz, tilt }` 分支（`updateOne` 里，排在 arc / hover 之后）：
  `root.position.y = |sin(t·hz + phase)| × amp` —— **必须取绝对值**，
  正弦的负半周会把模型压到地面以下（半个身子钻进土里）；
  再用 `rig.rotation.x = sin(2·ph) × tilt` 点头，静态网格才有「蹬地」的感觉。
- 只转 x，不碰 y（y 是朝向，root 管）。
- 分支条件是 `state !== 'dead' && state !== 'dying'`：死亡下沉分支会写
  `root.position.y = hover - 0.45k`，不避开就会打架。

**保留 / 改掉的其它字段**
- `phantom` 0.62 → **0.80**：太透会看见模型背面的内壁（单面网格 + DoubleSide）。
- `tint` **删掉**：它会把 material.color 整体压成那个色再乘贴图，冷白一层压上去紫色就淡了。
- `color` 0x9fe8ff → 0x9a63d8、`glow` 0x2a6a88 → 0x3a1f66（落点圈/血条这类非贴图元素）。
- `anim` 仍要留对象：状态机会读 `e.cfg.anim.idle`，`play()` 找不到 action 会安全 return。

**机制没动**：血量仍是玩家最大生命 ×0.6（夹 6~60）、移速照抄、每 8 秒重照一次。

**测试**：`.tmp-block126-test.mjs` 40 项（含「从 glb 里抠贴图算平均色，验证 B>R>G」这种硬断言）
+ `.tmp-126-cdp.js` 13 项（含**截图采样**验紫色、bounce 的 y 采样、spawn 态不进 handleMirror 的时机问题）。
老套件回修 3 条：block52 把 mirror 加进静态模型白名单、block107 的 phantom 值、block110 的 height/radius。

### 2.5 第 125 块：删「等的那个」+ 连杀不封顶

**用户两条实测反馈**（都是「设计一眼就不对」的类型，不是数值微调）：
① 「第十关里等的那个没有任何意义，直接删除」；② 「连击打到十次以上就不在往上了」。

**删「等的那个」**（`waiter`，第 107 块做的）
- 为什么没意义：它站着不动、90 秒才醒、醒了只是一只普通近战 —— 等于场上多一块**必须花时间拆的石头**，
  而拆与不拆都不改变打法。真正的判断（现在拆 vs 抢着清场）从来没成立过，因为 90 秒比一回合长得多。
- 删干净要动**七处**，少一处就会留死代码或孤儿资产：
  ① `ENEMY_TYPES.waiter` 整段 cfg；② `handleWaiter` + `wakeWaiter` + `if (cfg.wait)` 分派；
  ③ `waitT / waitCalls` 状态字段；④ 上场时挂的金环（`cfg.wait` 分支）；⑤ `wave.js` 里第十关 20 回合的 `waiter: N` 与 `order`；
  ⑥ 成就 `waiter_5` + `main.js` 的埋点 + `codex.js` 的数值行分支；⑦ 资产 `goleling.glb`（只它用）与 `codex/waiter.webp`。
- **`raged` / `waitRing` 不能跟着删**：`raged` 是看守暴怒在用，`waitRing` 是收账人 / 加急袋鼠 / 校对的共用的读条环。
- 坑位没有直接抹掉：每回合 `waiter: N` 并进了 `warrior`（+1~3），总只数不变（R8 21 只、R20 65 只）。
  换 warrior 本身是减负（waiter 22 血站桩 → warrior 脆皮近战），真觉得太松再把数量回调。

**连杀不封顶**（`heat.js`）
- 原来 `HEAT_MAX = 10` 是**硬上限**，`setHeat` 里 `Math.min(HEAT_MAX, v)` 把数字和加成一齐钳在 ×10。
- 现在只兜底到 0、**不封顶**：`speedMul = 1 + heat × 0.012`、`atkMul = 1 + heat × 0.018` ——
  前 10 杀的手感和旧版**严格一致**（10 点 = +12% / +18%），之后继续线性涨（30 连杀 = +36% / +54%）。
- `HEAT_MAX` 保留，但语义降级成「基础满格」，**绝不能拿它钳计数**；`ratio` 会 >1（别当进度条宽度用）。
- ⚠️ 已知风险：移速无上限。真出现「单帧穿过井口 / 场地边界」，去**位移处夹单帧步长**，不要把这里改回封顶。
- **顺手修了一个一直没接上的谎**：连杀浮现文案从第 117 块起就写着「攻速 +N%」，
  但 `heat.atkMul()` 只参与文案计算，从没乘进 `attackCd`。现在 `attackCd = 1 / (攻速 × heat.atkMul())`。

### 2.6 第 124 块：第十四关「钟楼打样间」+ 裁切刀 + 裁纸刀

**场地「裁切刀」**（`js/cutter.js`，零 import 引擎，和 `traffic / track / fog` 同款）
- 相位机 `idle → warn(1.25s) → slice(0.22s) → recover(0.55s)`；`slots = [-7, -2.3, 2.3, 7]` 轮换 + 每换位翻一次横竖（八种组合）；`gap 5.2 → gapMin 3.1` 随回合加速；`roundNo >= 15` 起偶尔一次落两刀。
- 判定与画面同源：`cutterBandHit(x, z, axis, slot, width, radius)` 是导出纯函数，预警带、刀光、夹具全用它；**`place(s, w)` 只读 `s.axis / s.slot`，不读全局** —— 双刀时读全局两条会叠成一条（本块自己抓到的坑）。
- 伤害：玩家 `hurtPlayer(maxHp * 0.12, 'cut')` —— **用 `'cut'` 不用 `'hazard'`**，否则「绝缘体」法器会顺带免疫掉整关机制；怪 `max(enemyBase + round*1.4, maxHp * 0.22)`，**怪也吃这一刀**。

**两只新怪**（`enemy.js`）
- **错版** `misprint`：死时 `die()` 里**先 `spawnSplitlings` 再 `onDeath`**（反过来先记账，收尾那一下会看到「场上空了」提前放下一波）。孩子 `splitDone = true` + 45% 血 + 0.62 体型，**只分一代**。
- **校对的** `proofreader`：`damage: 0`，读条完给「**血最厚且没被批注**」的怪挂 `proofed = {t: 8, dmgMul: 1.35, speedMul: 1.2}`；和加急袋鼠正好相反（袋鼠挑「离玩家最近」，惩罚你正在打的）。键名是 `proof` **不是 `mark`** —— 项目里已有一件叫「落款」的法器（`mark.js`）。
- 减伤链：批注是**乘法、乘在 `red` 之后**（`dealt = amount * (1 - red)` 之后再 `*= dmgMul`），折进加法链会被 0.95 上限吃掉。

**第 16 件法器「裁纸刀」**（`js/guillotine.js`，键 `0` —— 技能栏 1~9 已满）
- 面前 6/7/8 格、宽 3.4 的直线横切，CD 30/26/22；伤害 `max(6, maxHp * 0.30/0.40/0.50 * decay) * amp.dmg` —— **按最大生命百分比**，固定伤害会被立牌正面减伤 / 称量官叠层吃掉。
- 同一目标重复命中 `Math.pow(0.55, n-1)`、下限 25%（`e.guillotineHits`），防「一直按把 BOSS 削成纸」。
- 接口与 `board.js` 同签名（`drop / update / reset / ready / cdLeft / range / cutPct / hits / totalCuts / snapshot / restore`），商店 34 币买断 + 磨刀石 +8% + 握柄 +0.8 格。

**接线**：`wave.js` 的 `LEVEL_14`（arena 19、`scale 1.65 / 2.00`、18 种怪、`cutter` 字段）+ `LEVELS_BY_ID[14]`；`main.js` 的 `LEVELS` 表 + import；`scene.js` 新增 `press` 主题（`makePressTexture()`）；`story.js` 的 s14 绑第十四关；`skills.js` 第 10 格；`upgrade.js` 四张卡 + `guillotineChange()`；`shop.js` 三件货。

### 2.7 上一块：第 122 块（回合挑战 + 三选一刷新，细节见 git log）

**回合挑战**（`js/challenge.js` 纯数据纯函数，零 DOM 零业务 import；接线全在 `main.js`）
- 每关 `planRounds()` 从 `[3, rounds-1]` 无放回抽 **2 个回合**（独立 `chal` 随机流），**回合开始前**弹卡。
- 九条各碰一个轴：`thinBlood` 上限 ×0.5（+`clampHp`）/ `softPaw` 攻击→原值 40%（**下限 1**，走 `mul` 折算）/ `brokenSword`（`weapon.setMuted(true)`）/ `tide` 数量 ×2 / `gale` 移速 ×1.45 出手 ×1.3 / `coldHand` 攻速 ×0.55 / `mute` 技能全锁 / `heavyStep` 移速 ×0.62 / `fragile` 受伤 ×1.6。
- **可以放弃**（记 `chalUsed`，这回合照常打、无奖励）。
- 弹窗挂在 `handleRoundClear` 结算链**末尾**（商店关完之后、gap 里），靠「`gameState ≠ playing` → `level.update` 不跑 → gap 不走表」天然冻结，**没给 wave 加门闩**。

**挑战奖励**（排整条结算链**最前**）：88 金币 / 立刻再一次三选一 / **下一回合属性大涨**（`rollBoosts` 三类各一条 → `applyBoost`，**只活一回合**）。

**三选一刷新**：`UP_REFRESH_FREE = 3`（**一局**三次，不是每面板）。用完后每次刷新随机背一条**未持有**的**盲盒式减成** —— `BOX_CURSES`（`curses.js`，10 条，一条只碰一个数，一律走 `mul`）→ `askConfirm` → `addBoxCurse` → `applyBoxCurses`（`src='boxcurse'`，先撤再重放）→ `boxCurseDmg`（荆棘皮）→ `clampHp`；十条背满锁键。
**⚠️ 别跟夜行诅咒混**（v=139 修的就是这个）：`RUN_CURSES` 是开局自选、换骨币倍率、写进 `profile().runCurses` 的大刀；刷新的减成只掉属性、不写 profile、不动骨币倍率、不进诅咒勾选面板，存档走独立的 `box` 字段。

**生命周期**：效果 src 分别是 `chal` / `boost`，`clearRoundBuffs()` 里成对撤；`resumeGame` 成对抹 + `weapon.setMuted(false)` + `applySkillCdFactor(1)`；`resetRunState` 归零全部计数。存档带 `chal: {plan, used, seen}`。

### 2.8 最近几块（一行一块）

- **129 v=146**：第十六关「钟楼画室」—— 铅笔线稿圈（`sketch.js`，草稿 2 秒后定稿，站圈里被钉 1.2 秒 + 掉 6% 血，第 6·11·16 回合加圈）+ 纸屑（1 血自爆群）/ 画框（读条扣方框，同屏最多两个）+ 第 18 件法器「铅笔」（自动划线减速磨血）+ 技能「描红」(R)；怪 35 / 卡 127 / 商店 52 / 法器 18 / 技能 13 / 模块 73。
- **128 v=145**：第十五关「钟楼直播间」—— 补光曝光区（`spotlight.js`，光里击杀 +3 打赏 / 受伤 ×1.30 / 怪 ×1.20 移速，第 6·11·16 回合加灯）+ 弹幕（吐四句字牌）/ 超管（读条禁言 3 秒）+ 第 17 件法器「环形灯」(Q) + 技能「开播」(E)；怪 33 / 卡 122 / 商店 49 / 法器 17 / 技能 12 / 模块 71。
- **127 v=144**：收件人 / 回声减血（6 → 4.0 / 7 → 4.5，只动 `hp`）+ 连杀**数字不封顶、加成封顶**（`HEAT_BONUS_CAP`，满 10 杀 = +12% / +18%，浮现文案追加「· 已满」）。
- **126 v=143**：照影换成**主角同款模型**（复制 `rigged.glb` 只换 baseColor 贴图，黄→紫，几何一字未改），旧的 `reflect-frog.glb` 与 `frogbeast` 族一并删；静态单网格靠新增的 `cfg.bounce` 一跳一跳；`sourceHeight` 必须按量化后的世界高 **1.0784** 写，`height` 2.28 与主角同尺寸。
- **125 v=142**：删掉第十关的「等的那个」（七处连根拔，坑位并进 warrior）+ 连杀**不再封顶**（`heat.js` 去掉 `Math.min(HEAT_MAX, …)`，前 10 杀手感不变）+ 修好「攻速加成从没接进 attackCd」的谎；怪 31 / 成就 117。
- **124 v=141**：第十四关「钟楼打样间」—— 裁切刀（`cutter.js`，全宽横切 + 怪也吃）+ 错版（死后裂两只，只分一代）/ 校对的（批注血最厚的怪）+ 第 16 件法器「裁纸刀」（`guillotine.js`，按最大生命百分比）；怪 32 / 卡 117 / 商店 46 / 法器 16 / 技能 10 / 模块 68。
- **123 v=140**：第十三关「焦土操场」—— 环形跑道（`track.js`，玩家 ×1.35 / 怪 ×1.25 + 轻推力）+ 立牌（正面 −75%，`turnRate` 0.9）+ 取景的（锥形快门 ±0.78）+ 第 15 件法器「纸立牌」（`board.js`，挡投掷物 + 挡快门）；四只手搓怪全换成下载 glb（`sourceHeight` 改**包围盒最大边**、平摊模型加 `tiltX`）；补上第 12 关漏的 `main.js` 选关入口。
- **122 v=138**：回合挑战 + 三选一刷新（见上）。数量未变，老套件只改 4 处源码正则（56/76/85/91）。
- **121 v=137**：连杀断连改接战斗秒表 `elapsed`（`createHeat({now: () => elapsed})`），商店 / 对话 / 背包停多久都不再掉热度。
- **120 v=136**：`setProgress` 只升不降导致进关永远 100% → 新增 `resetProgress(p)`，`ensureLevelAssets` 改走它。
- **119 v=135**：首访加载 0% 兜底（`index.html` 内联脚本：进度条自爬到 55%；连续 6 秒无新 js 才 reload，同 tab 最多 2 次）。
- **118 v=133/134**：第十一关补完（守夜烛第 7 键 / 落款第 8 键）+ 商店付骨币刷新 + 火种 14 簇法器增幅 + 盲盒法器三属性。v=134 热修：删掉遗留的 `renderHeatBar(0)` 调用（任何关卡点开始都卡标题页）。
- **116/117**：第十二关「三幻神驿站」+ 车流 + 加急袋鼠 + 拿铁；声音开关移设置、删剑转、连杀改屏幕中央浮现。
- 更早：查 `git log --oneline`。

### 2.9 规模数字（改数值断言必看）

关卡 **16** · 怪 **35**（**35 个 glb，零复用，没有一只是手搓的**；图鉴 **35** webp）· 升级卡 **127** · 商店 **52** · 法器 **18** · 技能键 **13** · 火种簇 **23**（核心 9）· 成就 **117**（全清 8220）· 事件 **131** · 每日任务池 **39** · 礼包码 51 · 火种卡 16 · 诅咒 6。

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
29. **测试里别写死版本号和数字**：版本运行时从 `index.html` 读；怪数 / 关卡数 / 卡池 / 成就数每次扩张都会让老断言变红。**改数值回头修老套件**（清单见 §2.2 末尾）。
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

## 4. 文件地图（js/，73 个模块，只列要动的）

| 文件 | 职责 |
| --- | --- |
| `main.js`（~1 万行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、`DIFFS`、升级/商店节点、吃 `roundMod` 四项（hp/dmg/speed/haste） |
| `stats.js` / `weaponStats.js` | 两套属性引擎（`(base+Σflat)×(1+Σpct)×Πmul`） |
| `enemy.js` | 35 只怪的行为、`CLIP_FAMILIES`、`cdOf`、`haste`、冰冻/定身、并联体、称量官、看守五招、墨线、加急袋鼠、错版分裂、校对批注、画框囚笼、`moveToward`（嘲讽收口） |
| `weapon.js` | 环剑 3 把 + 6 元素剑（除铁剑外群伤 7 格）+ 万剑齐发；`setMuted()` / `holdOrbit()` |
| `skills.js` | 技能注册表 13 格（万剑 / 箭雨 / 回血 / 傀儡 / 墨丸 / 拿铁 / 守夜烛 / 落款 / 纸立牌 / 裁纸刀 / 环形灯 `Q` / 开播 `E` / 描红 `R`，第 10 格的键是 `0`） |
| `upgrade.js` | 127 张升级卡、`weightOf` 门控、`*Change()` 文案函数 |
| `challenge.js` | **第 122 块**：挑战九条 + 规划 + 奖励池，纯数据纯函数 |
| `relics.js` + `mine/latte/golem/candle/mark/board/guillotine/ringlight/pencil.js` | 18 件法器引擎（各 3 级，独立 `reset / applyCard / snapshot`）；`ringlight` 是第 17 件（Q 键，灯圈跟人走），`pencil` 是第 18 件（自动划线 + 描红） |
| `broadcast.js` | 技能「开播」（不挂法器，`levelCleared(14)` 解锁；倒计时撤 mod 用独立 `on` 布尔，别拿 `t` 当开关） |
| `shop.js` / `campfire.js` / `boons.js` / `curses.js` / `metaShop.js` | 商店 52 件 / 篝火 9 簇 / 火种 16 卡 / 诅咒（夜行 6 + 刷新减成 10）/ 盲盒 |
| `events.js + eventsExtra + eventsSide + repEvents` | 131 个事件（99 随机 + 10 番外 + 13 连锁 + 9 民心），`TEMP_SCALE` |
| `deposit.js` / `hazards.js` / `traffic.js` / `fog.js` / `track.js` / `cutter.js` / `spotlight.js` / `sketch.js` | 第八关寄存柜 / 场地机关 / 第十二关车流 / 第十一关雾 / 第十三关跑道 / 第十四关裁切刀 / 第十五关补光曝光区 / 第十六关铅笔线稿圈（车流之后全是零 import，纯注入） |
| `achievements.js` / `dailyQuest.js` / `signin.js` / `codex.js` / `story.js` | 117 成就（手动领取）/ 每日 39 条 / 签到 / 图鉴 35 种 / 18 夜主线（16 夜已绑关） |
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
track{on,spec,at,enemyMul} · board{owned,count,blockShot,drop} · grantBoard(lv)
cutter{on,spec,state,trigger,hits,reset} · guillotine{owned,ready,cdLeft,cdMax,range,width,cutPct,progress,hits,totalCuts,drop} · grantGuillotine(lv)
spotlight{on,state,list,inLight,reset} · ringlight{owned,active,ready,count,cap,cdLeft,cdMax,progress,bonuses,list,inLight,drop,bulb,stand,reset} · grantRinglight(lv)
broadcast{owned,active,ready,remain,cdLeft,cdMax,bonuses,cast,reset} · silence() / silenceNow(sec)
sketch{on,count,state,list,inkNow,frames/frame,clearFrames,clamp,reset} · pencil{owned,ready,cdLeft,cdMax,progress,bonuses,list,line,mark,long,twin,reset} · grantPencil(lv)
```
> `chal.plan()` / `used()` 是**函数**不是属性；调试口一律回扁平值（见坑 35）。第 129 块起 `sketch / pencil / grantPencil` 挂在 **`__game.block114`** 桶里（不是 `__game.sketch`）。

---

## 6. 发版与测试

- **推送**：`git -c http.proxy=http://127.0.0.1:7897 push` → `git status -sb` 验证 → `curl --noproxy '*'` 连查两次版本号（Pages 约 1 分钟生效）。
- **回归**：`sh .tmp-94-runall.sh`（**66 套 Node**，只报挂了的）；CDP 按需单套串行（第 124 块为 `.tmp-124-cdp.js` 47 项，第 128 块 `.tmp-128-smoke.js`，第 129 块 `.tmp-129-smoke.js`）。
- **已知黄账（别浪费时间）**：`camp-test` 84/22、`boon-test` 133/13、`eventui-test` 35/2、`block18` 34/1、`start-test` 33/15、`block30-cdp` 42/8、`ui-test` 15/7、`block54-cdp` 签到浮层 z-index。
- 老套件 `ok()` 签名不统一：`block41` 是 `ok(name, cond)`，`block59/64/65/66/67/70` 是 `ok(cond, name)` —— 写新套件先看日志格式。

---

## 7. 下一步

用户 2026-10-21 定：**不做多角色，其他都能做，只要局外因素对局内影响不过大**。

- [x] 第十五关（第 128 块，「钟楼直播间」+ 补光曝光区 + 环形灯 / 开播）
- [x] 第十六关（第 129 块，「钟楼画室」+ 铅笔线稿圈 + 铅笔 / 描红）
- [ ] **第十七关起**（`story.js` 还有 2 夜 `levelId:null`；模板照 `LEVEL_16` 抄，带场地机制的关加 `track` / `traffic` / `fog` / `cutter` / `spotlight` / `sketch` 字段，**并且 `wave.js` 与 `main.js` 两处都要加**）
- [ ] 更多武器 / 技能（技能栏还剩几格）
- [ ] 性能优化（怪物合批 / 假阴影 / 视锥剔除）—— **等用户点头再动**
- [x] 主菜单 3D 背景 —— 用户 2026-10-28 明确「暂时不做了」
- 不做：排行榜（无后端）、商城/皮肤、广告位、多角色
