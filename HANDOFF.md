# 蛙步 · 夜行 —— 交接文档

> 新对话从这里开始读，不要先翻聊天记录。**先读 §0「给新对话的话」，再按需查后面章节。**
>   
> 最后更新：2026-10-23 下午 · 线上 **v=65** · 第 55 块（兑换码大全 txt / 新怪物信息卡 / 只记打斗时长）已完成并推送

---

## 0. 给新对话的话（2026-10-23 交接）

1. **当前基线**：v=65（第 55 块）已推送，git 工作区干净。最近十四块（44~55 + v=53~56 一串音效包 hotfix + v=61 hotfix）全部完结，**没有挂起的半成品**。用户新需求来了再开工，别主动找活。
2. **节奏**：用户偏好**小步块状推进**——一块功能 = 一次提交 = 一个版本号（v=N）。铁律 12：**做完回归绿就立刻推送交给用户测**，用户的反馈比自测更快更准。
3. **最容易翻车的五件事**（细节都在铁律和下文）：
   ① 发版**两处版本号**都要 bump（index.html + js 内部所有 `import ...?v=N`），漏一处就是「本地好线上炸」；
   ② **重复 id 假绿**（v=61 刚翻车）：复制面板 HTML 忘改 id，测试用全局 `getElementById` 点击会掩盖——block50 测试里已有「全页零重复 id」通用断言，新面板直接抄；
   ③ **公告在 loading 淡完 +700ms 才弹**，测试截图要先 `sleep(2600)` 再 `__game.notice.hide()`；
   ④ `jumpToRound/skipRound` **只在 adminOn 时生效**，不开管理员是静默 no-op；
   ⑤ 本地服务器必须 `run_in_background`；CDP 截图路径**不能含中文**；推送走 `git -c http.proxy=http://127.0.0.1:7897 ...`（先 curl 探代理，挂了改直连）。
4. **最新绿基线**（动到相关文件后要回归）：block55 **89**/0（Node：码表 txt 逐个重算哈希 / 新怪卡源码契约 / 计时白名单）+ block55-cdp **51**/0（真 DOM：首次遇怪弹卡 + 世界冻结 + 计时不动 + 我明白了继续 + 不重复弹；商店/剧情/升级/属性卡都不计时；开新局归零）、block54 **54**/0（Node，布袋 + 排版 + 改名 + 失败提示源码契约）+ block54-cdp **36**/0（真 DOM：两行同行等高、商店标题、布袋 10 金币、倒下 0.9s 弹提示、两个按钮的去向）、block53 **46**/0 + block53-cdp **39**/0、block52 **125**/0、block51 **20**/0、block50 **12**/0（含重复 id 断言）、block19 **44**/0（篝火/骨币全流程）、block29 **39**/0、block35 **49**/0、`.tmp-wtut-title-check.js` **4**/0、block47 27/0、block49 23/0。跑法见 §6，一次只跑一套。
   已知**既有**失败（不是新代码弄坏的，别浪费时间去查）：`.tmp-rogue-unit.mjs` 142/2、`.tmp-camp-test.mjs` 84/22、`.tmp-boon-test.mjs` 133/13、`.tmp-eventui-test.js` 35/2、`.tmp-block18-test.js` 34/1 —— 都是第 27/33/41/43 块改过数值或 UI 后没回填的过期断言（2026-10-23 用 git stash 对拍确认过基线一致）。
5. **用户规则**：全中文；有疑问先问、有疑问不写码；README 与实况同步；美术资产优先 GitHub 现成 CC0；不做多角色；局外对局内影响要小（篝火每级 +1 生命这种量级）。
6. **新怪信息卡在 `?debug=1` 下默认是关的**（第 55 块）：它会冻结整个世界，二十多套老 CDP 都要开局刷怪等回合推进，一上来被拦一下就成片挂（实测 block53 就栽在这）。要测这张卡的套件地址加 **`&meet`**（或 `__game.meetCard.setAuto(true)`）；正常游玩永远是开的。同类「首次提示型」弹窗以后照这个办：**生产默认开、测试显式开**。
7. **改交互规则要回头跑老套件**（2026-10-23 的教训）：第 42/43 块给回话按钮加 3 秒读秒锁后，block32（读秒之前写的）静默挂了 9 项；公告升 `NOTICE_VER=2` 后 block45 写死 `|1` 也挂了。**横向特性（锁定/延迟/版本号）上线时，把受影响的老 CDP 套件重跑一遍**，别只跑新套件。本次两个都已修好（block32 60/0、block45 49/0）。

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
| 测试脚本      | 老的在**上级**目录 `C:/Users/MECHREVO/Desktop/班级网站/.tmp-*.js`，第 41 块起的新套件在 `naiwa-rouge/.tmp-*.js`（回归资产，别删） |
| node      | `C:/Users/MECHREVO/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`                           |
| 无头 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe`                                            |

**网络坑**：github.com 经常连不上（Pages 反而通）。推送用
  
`git -c http.proxy= -c https.proxy= push origin main`（绕过本地 7897 代理），失败就重试几轮。

---

## 2. 当前状态（2026-10-23，v=61）

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
| **24** | 道具外观升级：炮台/地刺换 CC0 真模型（assets/props/，加载失败自动退回程序化） | 已上线（e99e3a1，v=27） |
| **25** | 诅咒可视化修补 + 商店买断售罄 | 已上线（3af2323，v=28~29） |
| **26~31** | 环剑补满 / 篝火无限级 / 霜牢主祭重做 / 第三关焦土钟楼 / 管理员模式 / 事件大扩容 | 已上线（471d4ca…bf18e2c，v=31~35） |
| **32** | 主线《笑不出来的那一夜》十八夜 2.3 万字 + 夜行记忆面板 + 印记四结局 | 已上线（v=36） |
| **33** | 平衡性改版：夜行记忆按夜解锁 / 火种无上限加强 / 防御减法公式 / 无敌帧 0.9s / 第三关场地 19 + 生成放缓 | 已上线（dfcb6b3，v=37） |
| **34** | 管理员选回合：局内 1~N 格子面板直接从该回合开打（走 startAt 普通路径） | 已上线（9139648，v=38） |
| **35** | 第四关「雾堤服务区」：雾魉（隐身无敌）/ 跃行尸（落点跳劈）/ 缝合师（群体回血）+ 暖炉 + fog 主题；主线 s04 进关；补丁：卫队尸体消散 | 已上线（v=40） |
| **36** | 相机减晕重做：死区跟随 + 平滑焦点 + 删速度预测注视点；速度感视野（FOV 随移速 45→48，设置可关） | 已上线（v=41） |
| **37** | 选关分步：主菜单「开始游戏」拆成「选关卡 → 选难度 → 选诅咒」三步独立页面，不再挤在一张卡 | 已上线（v=43） |
| **38** | 管理员模式升级为沙盒：生命无限 + 全部不落盘（关卡进度/火种/篝火/成就/记录/续玩存档全不写）+ 退出即还原开启前状态（独立键 `naiwa_rouge_admin_v1` 存开关） | 已上线（v=44） |
| **39** | 读取存档（多存档列表）：主菜单「读取存档」→ 卡片列表（按退出时间升序，显示时间/关卡/回合/难度）；中途退出全部留档（按 uid 区分不互相覆盖）；输/重刷即清，首次通关选完永夜火种才清 | 已上线（v=45） |
| **40** | 局内「存档并退出」：HUD 顶部右角按钮 → 确认弹窗（继续游戏 / 存档退出）→ 写一份存档回主菜单，标题页写明「已存档 · 第 X / 总 回合」 | 已上线（v=47） |
| **41** | 永久选择提示：篝火入口 + 永夜火种面板首次打开各弹一次告知（讲明写进存档、伴随每个开局、不可撤销），并各带一条常驻警示条（`.cf-warn` / `.up-warn`）；提示已读记在 `profile.notice` | 已上线（v=47） |
| **42** | 主线剧情读秒：主线每一拍的回话按钮先锁 3 秒、按钮右上角跑倒计时，读完才亮 | 已上线（v=48） |
| **43** | 读秒放开到全部对话：随机奇遇同样读秒；顺手修掉「旧定时器空转把新一拍的按钮锁死」的真 bug（代次令牌 + 按 DOM 现状清理） | 已上线（v=49） |
| **44** | 礼包兑换（主菜单 → 礼包兑换）：纯前端离线码表，源码只存 16 位哈希；输码换骨币（A 类 300 / B 类 100，各 10 个）；一码一机一次，记录在 `profile.gifts`；已兑换列表带时间与档位 | v=50 |
| **45** | 公告：进主界面自动弹一次（「日期 + `NOTICE_VER`」记在 `naiwa_rouge_notice_v1`，勾「今日内不再弹出」当天不再打扰）；内容 = 提建议/报 bug 发礼包码 + QQ「落花雨 3829845261」+ 本站网址，后两个一键复制；主菜单第三排「📢 公告」随时强制回看 | v=51 |
| **46** | 抽象奶蛙音效包：**打通第一关**后结算面板上弹「获得新音效包」（可逐段试听），选「换上奶蛙叫」则用 4 段奶蛙叫声（`voice-1/2/3` + `voice-end`，来自同作者音游《蛙步》）替换 8 个位置；裁切靠**播放区间**（`offset/dur/rate/vol`）不靠改文件；设置里「音效包」随时切回，没解锁时锁着 | v=52 |
| **47** | 新武器「箭雨」（`js/arrowRain.js`）：第二关起拿环剑时一并解锁（第一关只出剑，用户定案）；无普通攻击、单技能 8s CD（技能框有倒计时数字 `.sk-num`）；自动以最近的怪为心标警告圈（0.85s 瞄准 + 1s 散布），14 支箭错峰落下，每支 = 剑伤害 ×0.55（吃 wstats → 剑油/磨剑石同样强化）；存档 `arrowRain.unlocked`，钩子 `__game.arrowRain` / `__game.buff` | v=57 |
| **48** | 加载页轮播：`LOAD_TIPS` 10 句 3.2s 淡入淡出（`.ld-tip`），loading 淡完 `clearInterval`；首屏评估=放弃压缩改造 | v=58 |
| **49** | 种子挑战（`seed.js` 追加）：`seedFromText`（加盐 FNV-1a）/ `pickSeedRules(seed, records, curseTable)`（wins 0~1 普通·2~5 困难·≥6 噩梦；诅咒 0/1/2；过不了第一关不去第二关）/ `loadSeedRecords`/`saveSeedRecord`（一码一条取优）/ `pruneSeeds(40)`；UI `#seedScr`（输入+🎲+匹配文案+记录列表）；`customSeed` 进快照 `seedPlay`；结算 `rsTag` 与记录在 `endGame`；键 `naiwa_rouge_seeds_v1` | v=58 |
| **50** | 主菜单「属性」页（`js/statView.js` + `#statScr`）：独立小渲染器把 `loadFrog('assets/rigged.glb')` 摆在带呼吸描边环的展台上，拖动转视角（`setPointerCapture` 包 try-catch）、松手回正、定时蹦跶/拍掌；属性用**临时实例** `createStats+createWeaponStats` 重算（基础+篝火 `campApply`+火种 `applyBoons`），14 项按 4 组列出、加成行标「（基础 X）」；钩子 `__game.statPage` | v=59 |
| **51** | 图鉴附怪物贴图：`enemy.js` 新增 `buildPreviewModel(type)`（克隆 + 按 sourceHeight 归一 + 换肤/染色/半透明 + Idle 定格），离线脚本 `.tmp-codex-shots.js` 按透明通道包围盒自动取景，输出 13 张 240×288 webp 到 `assets/codex/`（共 ~200KB）；`codex.js` 给怪物条目加 `thumb`，图鉴走「左图右文」（`.cx-item.has-thumb` / `.cx-thumb` / `.cx-body`）；运行时不加载模型 | v=60 |
| **52** | **13 只怪一只一个模型**（用户立项：之前 13 只其实只用了 4 个 glb，法师骨架被 6 只共用）。后 9 只换 Quaternius《Ultimate Monsters》并改名：骨咒师→咒面图腾（tribal）/ 火焚巫祝→焚火魔（demon）/ 霜牢主祭→孢冠菌王（mushroom-king）/ 骨骑冲锋兵→冲锋蛮牛（bull）/ 骸盾兵→盾斧兽人（orc）/ 孵骨巫祝→孢生菇（mushnub-evolved）/ 雾魉→雾鬼（ghost）/ 跃行尸→雾猎狼（wolf）/ 缝合师→缝补小巫（wizard）；第一关四只保留 KayKit 骷髅（用户定案）。工程侧：`CLIP_FAMILIES` 动作家族翻译层 + `resolveClipAliases` + `clipOverrides`、`findBone`（GLTFLoader 洗点号）、`footY` 脚底对齐、`glow` 自发光、配件按世界缩放反推尺寸；`.tmp-mob-calib.js` 正交相机逐像素实测身高（取代人眼比对）；图鉴 13 张缩略图重出 | v=62 |
| **53** | **用户实测报的七条一起修**：① **概率事件点完只有「这一夜什么都没发生」**（真 bug：`chooseEventOption` 把 `{roll:[...]}` 原样交给 `applyEffects`——结算内部摇了，但摇出的分支没外传，结果页拿到只有 `roll` 键的对象、`effectLines` 一项都认不出。现在先 `resolveRoll(choice.effects, rngOf('event'))` 摇一次，同一份结果既结算又显示；种子局也因此可复现；摇到空手写「这一把落空了，什么也没拿到」）。② 第二/三关**提亮**（crypt/ash 的底色、雾色、雾浓度 0.0152→0.0122 / 0.0168→0.0132、天光 1.05→1.55、月光 2.35/2.40→3.10、补光 0.70→0.95，地面贴图底部色也提了一档）。③ 咒面图腾 ×1.8（1.40→2.52）、焚火魔 ×1.2（1.22→1.464）、孢冠菌王 ×2（1.62→3.24），碰撞半径同步。④ 菌王的四个卫队缩到 0.7 倍（`spawn(type, at, { scale })` 按实例缩放，不动 warrior 本体；血条/伤害数字跟着 `e.height` 走；轨道 1.45→1.9）。⑤ **箭雨教程**挂进 `WEAPON_TUT`（`arrowrain`，label「技能教程」，最后一步 `wait:'rain'` 要求真放一次），拿环剑时按「武器卡 → 环剑教程 → 箭雨教程 → 回合链」串起来。⑥ 加载轮播 3200ms → **1778ms**（×1.8 速），淡出 450→200ms（CSS 同步） | v=63 |
| **54** | **用户实测四条一起修**：① 篝火商店「布袋 · 铜板」每级金币 **30 → 10**（`campfire.js` 的 `coins`，desc 同步；一档就白送半家摊子，局内经济被它一个人抬起来）；② **主菜单排版收成两行**（`index.html` 把 `tt-start`/`tt-resume` 包进 `.tt-row-main`、`tt-daily`/`tt-seedbtn` 包进 `.tt-row-chal`；CSS 用 `flex:1 + max-width + align-items:stretch` 让两枚等高，行内按钮 `margin-top:0` 免得一高一低，隐藏「读取存档」时开始游戏自己居中）；③ 「篝火」改名 **篝火商店**（主菜单按钮、面板标题、礼包/属性页脚、结算提示、加载轮播、永久说明标题统一；剧情「篝火边的故事」保留原文）；④ **倒下弹「温馨提示」**（`#failTip`：标题「温馨提示」+「想要提升实力？去篝火商店看看吧。」，副文案现读 `bones()`；`endGame` 里 `!isWin` 时 900ms 后弹，层级 19 压过结算卡 18；「去篝火商店」= 关提示 → 关结算 → `showTitle()` → `showCampfire()`，「下次吧」只关提示）。钩子 `__game.failTip` | v=64 |
| **55** | **用户三条**：① **兑换码大全 txt**（本机 `兑换码大全.txt`，A 类 300×10 / B 类 100×10，分类 + 速查 + 用法；20 码逐个重算哈希对上 `js/gift.js`；已 gitignore）；② **新怪物信息卡**（`#meetCard` + `profile.met` + `enemy.js onSpawn`：一种怪首次上场 → `gameState='meet'` 冻结世界 → 讲攻击方式 → 「我明白了」继续，一辈子只拦一次；`?debug=1` 下默认关、加 `&meet` 才开）；③ **只记打斗时长**（`elapsed` 只在 playing/tutorial/wtut 且无 panelOpen/bagOpen/meetOpen/uiHold 时走表；`startPlay` 归零 —— 以前跨局会累积） | v=65 |

第 51 块上线后 hotfix（v=61，用户报「属性页返回按钮失效」）：

- **根因：重复 id**。index.html 里「夜行记忆」的返回按钮和属性页的返回按钮**都叫 `stBack`**——`getElementById` 只认 DOM 里靠前的那个，于是两个监听（`hideSub(storyScr)` + `hideSub(statScr)`）全挂在了夜行记忆的按钮上，**属性页按钮一个监听都没有**。block50 测试此前「能过」是假绿：测试点的是全局 `getElementById('stBack')`（= 夜行记忆按钮），它身上的第二个监听恰好把属性页也关了。
- **修法**：属性页返回按钮改名 `statBack`（index.html + main.js 各一处）。**顺带修掉第二个重复 id**：武器教程卡标题 `wtTitle` 与局内波次 toast 的 `wtTitle` 重名——教程卡自己的标题从来没被更新过（一直停在「剑会自己转」），改名 `wtutTitle`。
- **防复发**：`.tmp-block50-cdp.js` 加了两条断言——① 点的必须是 `#statScr #statBack`（限定在面板内找）；② **全页遍历所有带 id 的元素，断言零重复**（这个检查能兜住以后所有同类的坑）。
- **专项测试**：`.tmp-wtut-title-check.js` 4 项全绿（教程卡打开 / 标题随 3 步变化且写进 `#wtutTitle` / toast 的 `wtTitle` 不含教程文案）。回归 block50 **12**/0、block51 20/0。
- **教训**：加新面板复制旧面板 HTML 时，**id 忘了改**就是这类 bug 的来源；以后每加一个面板跑一遍「重复 id 检查」（block50 里的通用断言可以直接抄）。

第 51 块要点（图鉴附怪物贴图，2026-10-22，v=60）：

- **用户要求**：「图鉴附贴图」——怪物页签要能看见怪长什么样，不只是文字。
- **为什么是离线 PNG/WebP 而不是运行时渲染**：图鉴一打开就临时拉 13 只怪（4 个 glb 共 2.7MB）＋再开一个 WebGL 上下文，手机上有风险也慢。改成构建时一次性渲染、产物进仓库：运行时只是 13 张 `<img loading="lazy">`，零额外模型请求、零额外上下文。
- **`enemy.js` 的 `buildPreviewModel(type)`**：和 `spawn()` 走同一套打扮逻辑（`cloneSkinned` → `scale = height/sourceHeight` → `applyWizardSkin` / `tint` / ghost 半透明），只是不建血条/范围环/AI；最后用 `AnimationMixer` 把 Idle 推进 0.45s 定格（**绑定姿态是张牙舞爪的 T pose，不能用**）。换模型/改皮肤后要重跑 `.tmp-codex-shots.js` 重出图。
- **自动取景（踩了两个坑）**：
  ① `readPixels` 的缓冲**必须 `Uint8Array`**（配 `gl.UNSIGNED_BYTE`），用 `Float32Array` 会静默读到全 0 → 包围盒为 null → 取景循环直接 break，图就被裁掉头顶。
  ② 不能按 `cfg.height` 算相机距离：模型 Idle 姿势下的真实渲染高度并不等于标定值，直接算会裁头。改成「先退到 12×h → 量 alpha 包围盒 → 若贴边就继续退 → 按 `bh/(H*0.84)` 缩距离、按中心偏差移 `aimX/aimY`」，最多 9 轮。
- **UI**：`codex.js` 怪物条目加 `thumb: 'assets/codex/<id>.webp'`；`main.js` 的 `renderCodex` 遇到 `en.thumb` 就包一层 `.cx-item.has-thumb`（img + `.cx-body`），其它页签完全不变（测试里专门断言武器/奇遇页签没有 `.cx-thumb`）。
- **测试**：`.tmp-block51-cdp.js` **20** 项全绿（13 条都有 thumb 且文件名=id / DOM 13 图 13 body / 全部解码成功 0 破图 / 尺寸 240×288 / lazy + alt / 66×79 且图在文字左侧 / 其它页签不受影响 / 13 个文件 HTTP 200 且是真 webp >5KB / 总体积 <400KB / 零报错）。截图 `.tmp-block51-cdp.js` 输出 `%TEMP%/naiwa-shot-51/`（codex-enemies / codex-swords）。
- **截图坑（复踩）**：公告是 loading 淡完 **+700ms** 才弹，测试里 `sleep(2600)` 之后必须显式 `__game.notice.hide()`，否则截出来整屏都是公告。

第 52 块要点（13 只怪一只一个模型，2026-10-23，v=62）：

- **用户要求**：「现在的怪物有重复使用 3D 模型，允许上 GitHub 找其他家的模型，**不要和之前怪物重复并替换掉**」。调研确认：13 只怪其实只用了 4 个 glb（minion 1 只、warrior 3 只、rogue 3 只、mage **6 只**）。两个决策由用户当场拍板：① **只换后 9 只，第一关 4 只保持 KayKit 骷髅**（名字也保留）；② 风格走「**夜行怪物大杂烩**」（幽灵/恶魔/雪怪/菌人/狼/牛都用）。
- **素材**：Quaternius《Ultimate Monsters》（CC0），经 `Dallolz/moorfall-assets` 镜像取 9 个 glb 到 `assets/monsters/`。**没用上的备选（squidle / glub / ghost-skull / goleling / blue-demon / yeti）已删掉**，别再往仓库里堆。全 13 个模型共 **5.0MB**（旧 4 个就 2.7MB，新的九只 ≈2.4MB）——boot 时 13 只全部预载，**首屏比 v=61 重 2.4MB**；若用户反馈加载慢，下一步做「按关预载」（注意 `spawn()` 遇到未加载类型是 `console.warn` + 返回 null，**不会懒加载**，所以按关预载必须在开局前 await）。
- **改名对照（全项目同步：wave 回合提示 / codex 图鉴 / achievements / events / 音频注释）**：
  `hexer 骨咒师→咒面图腾`、`pyro 火焚巫祝→焚火魔`、`hierarch 霜牢主祭→孢冠菌王`、`charger 骨骑冲锋兵→冲锋蛮牛`、`shielder 骸盾兵→盾斧兽人`、`brood 孵骨巫祝→孢生菇`、`wraith 雾魉→雾鬼`、`leaper 跃行尸→雾猎狼`、`mender 缝合师→缝补小巫`。**id（`ENEMY_TYPES` 的键）一个都没改**，存档/成就/测试断言的键不受影响。
- **跨引擎动画名**：两家 clip 命名完全不同（KayKit `1H_Melee_Attack_Chop`；Quaternius `CharacterArmature|Flying_Idle` / `Bite_Front` / `Attack_Headbutt` / `Jump`…）。`enemy.js` 里 `CLIP_FAMILIES` 给四族（humanoid / flying / blob / quad）定义语义键→真实 clip 名，`resolveClipAliases()` 按「去掉 `|` 前缀的短名」建表，单只怪用 `clipOverrides` 覆盖个别动作（如 hexer/pyro 的 `cast → Punch`，四足没有读条动画）。解析出的别名由 `spawn()` 挂到 `actions` 上（`actions[语义键] = actions[真实名]`），业务代码继续只认语义键。**加新模型只改 `CLIP_FAMILIES` + `clipOverrides`，别在业务里写死动画名**。
- **身高/脚底不再靠人眼比对**：新脚本 `.tmp-mob-calib.js`（正交相机 + 网格 + `readPixels` 量透明包围盒）直接给 `sourceHeight` 与 `footY`（模型本体相对原点的悬空/下沉量；浮空怪别按到地上）。**`readPixels` 行方向是从下往上**，翻屏幕坐标时别写反（写反会得到「高 2.06、脚 -2」这种鬼数）；正交视野 `FIXED_H` 要够大（4 装不下 Quaternius 的模型，用 14）。
- **配件挂骨骼的血案（`attachShield` / `attachStaff`）**：Quaternius 的 `CharacterArmature` 自带 **×100 缩放**，挂件直接塞局部尺寸 → 盾牌放大 40 倍糊满全屏。修法：`slot.updateWorldMatrix(true, false)`（**`true` 必须带**，否则祖先链没更新、量到 1.29 而不是 ~47）→ `getWorldScale` → `k = 目标世界半径 / (0.34 × 骨骼世界缩放)`；举盾动画里**不许写死局部 y**（旧写法的 0.17 在 ×47 下等于 8 格位移），只按 `userData.k` 乘。修好后盾牌世界包围盒 0.83×0.79×0.20，正常贴在小臂上。
- **骨骼名点号**：GLTFLoader 会把 `LowerArm.L` 洗成 `LowerArmL`，`findBone()` 必须先 `toLowerCase().replace(/\./g,'')` 再匹配（旧版只小写化 → 盾/杖挂点全部落空，`hasShieldMesh:false`）。
- **顺手修的真 bug（第 51 块遗留）**：`.tmp-codex-shots.js` 自动取景里 `aimX -= (bcX - W/2)*wpp` **符号反了**——对称模型看不出来，遇到大翅膀/长尾巴（demon、bull）就越修越偏，最后整只跑出画面（`pyro.webp` 只有 1.1KB 就是证据）。改成 `+=` 后 13 张图都正常（8~13KB）。
- **测试**：新增 `.tmp-block52-test.mjs` **125** 项全绿（13 只 13 个文件零重复 / 文件真在且体积合理 / **直接解 glb 头 JSON 断言每个 `clipOverrides` 名字真存在于那个模型** / 身高半径区间 / 9 只都配 glow（盾斧兽人亮绿例外）/ 四关回合表点名的 type 全在且已启用）。
  回归：block29 **39**/0、block35 **49**/0、block51 **20**/0、block50 **12**/0、level2 65/0、level3 71/0、level4 90/0。
- **测试坑（新）**：换模型后每只怪第一次出场都要**编译自己的着色器**，SwiftShader 下十几秒——老套件里「关卡表真的刷出了 XX」的 25 秒预算会假失败。block29 / block35 已放到 **60 秒**并写明原因。另外 block29 / block35 早就因为第 41 块的「选关分步三页」进不了关（点完卡片还要 `#diffNext` → `#curseStart`），本块一并补上，两套才真正跑起来。



第 53 块要点（用户实测报的七条，2026-10-23，v=63）：

- **① 概率事件「点了什么都没有」是真 bug，不是文案问题**：`chooseEventOption()` 以前把 `choice.effects`（一个 `{ roll: [...] }`）原样丢给 `applyEffects()`。而 `applyEffects()` 内部**自己会摇一次**并生效——问题是**摇出来的那一支没往外传**，紧接着 `effectLines(choice.effects)` 拿到的是只有 `roll` 键的对象，一项都认不出 → 结果页永远只能打兜底文案「这一夜，什么也没发生」。全库 **47 处** roll 选项（约三成事件）都踩这个坑，所以玩家体感是「很多概率事件点了都没反应」。
  修法：`const eff = resolveRoll(choice.effects || {}, rngOf('event'))` 先摇**一次**，同一份结果既交给 `applyEffects(eff)` 又交给 `effectLines(eff)`。副作用顺带修好：走事件种子流后，种子挑战里同一颗种子摇出的分支可复现了（原来 `applyEffects` 内部用的是 `Math.random`）。
  另一层：摇到空手（如掷骨子押 5 币没中）以前只显示「金币 -5（已付）」，看不出输赢。现在追加一句「这一把落空了，什么也没拿到」——**摇到空也是结果，得说出来**。
- **② 二三关提亮**：`scene.js` 里 `crypt` / `ash` 两套主题整体抬一档 —— 底色、雾色、雾浓度（crypt 0.0152→0.0122、ash 0.0168→0.0132）、天光（1.05→1.55）、月光基准（2.35/2.40→3.10）、补光（0.70/0.72→0.95）。地面程序化贴图的底色也提了一档（枯土 `#2b2338`→`#3a3050`、焦土 `#2a1c18`→`#3b2822`）。**别过头**：测试里有一条「第二关不该亮过第一关」，保住「夜色」这个基调。
- **③④ 模型尺寸**（用户点名）：咒面图腾 ×1.8（1.40→**2.52**）、焚火魔 ×1.2（1.22→**1.464**）、孢冠菌王 ×2（1.62→**3.24**）。碰撞半径同步（0.45→0.60 / 0.42→0.48 / 0.52→0.78），不然大模型会和小怪穿模。
- **⑤ 卫队按实例缩放**：`spawn(type, at, opts)` 新增 `opts.scale`（乘在 `cfg.height / cfg.sourceHeight` 之后），菌王的 `summon.scale = 0.7`。**关键：不改 `ENEMY_TYPES.warrior.height`** —— 第一关还在用同一份配置，改全局会把第一关的战士一起缩小。血条 `createBar(cfg, scale)` 与伤害数字位置改用 `e.height`（= `cfg.height × scale`），否则 0.7 倍的卫队血条会飘在半空。轨道 1.45→1.9（菌王放大后 1.45 会贴着腿）。
- **⑥ 箭雨教程**：挂进既有的 `WEAPON_TUT` 表（`arrowrain`，`label: '技能教程'`，三步，最后一步 `wait: 'rain'` 要求**真放一次**箭雨，`wtTick` 用 `arrowRain.strikeCount > 0` 判定）。拿环剑时按 **武器卡 → 环剑教程 → 箭雨教程 → 回合链** 用回调串起来（不能两个都塞队列：队列先到先教，直接 push 会让箭雨抢在环剑前面）。第一关仍不解锁箭雨（第 47 块定案）。
- **⑦ 加载轮播提速**：`LOAD_TIP_MS` 3200→**1778**（×1.8），淡出 450→**200ms**，`style.css` 的 `.ld-tip` transition 同步改成 `.2s`（只改 JS 不改 CSS 会让文字在还半透明时就换掉）。
- **测试**：新增 `.tmp-block53-test.mjs` **46**/0（纯 Node：47 处 roll 的概率和=1 / 每支都有 effects / 每支都摇得出来 / 摇完不再含 roll / 九成以上能写出数值 / **源码级防回退**（不许再出现 `applyEffects(choice.effects, nextRound)`）/ 两关亮度阈值与「不亮过第一关」/ 三只尺寸与卫队 0.7 及「warrior 本体没被动」/ 教程表与接线 / 轮播常量）+ `.tmp-block53-cdp.js` **39**/0（真流程：掷骰 16 次统计赢/落空并核对金币账、药水写出「生命 +2.0」、第二关实时场景的雾色/天光/底色、三只怪 `model.scale` 与 `e.height` 一致、卫队 0.63 血条跟着降、教程卡 label 与 `wait:rain` 自动过关）。
  回归：block29 **39**/0（ash 底色断言已同步成 `1d1311`）、block35 **49**/0、block51 **20**/0、block50 **12**/0、block52 **125**/0、level2 65/0、level3 71/0、level4 90/0。
- **测试坑**：CDP 里测箭雨千万别把怪放在玩家脚边 —— 自动攻击会在你 `waitFor` 之前把它砍死（探针里那只 1.6 格的 minion 就是这么没的），而且要等 `state` 从 `spawn` 转成 `chase`，否则 `arrowRain.fire()` 直接返回 false（选目标跳过 spawn/dead/隐身）。放 6 格外 + `speedScale: 0` 最稳。
  另外 `ok()` 的**参数顺序**要盯住（本项目惯例是 `ok(cond, name)`），写反了会打出一屏「✓ true」的假绿——第 53 块第一版就这么假绿了一轮，`✗` 一个没报。


第 55 块要点（兑换码大全 / 新怪物信息卡 / 只记打斗时长，2026-10-23，v=65）：

- **① 兑换码大全.txt（本机文件，不进仓库）**：明文码只在 `gift-codes.local.md` 里（第 44 块留下的），第 55 块按用户要求整理成 `naiwa-rouge/兑换码大全.txt`：**A 类 300 骨币 ×10 + B 类 100 骨币 ×10**，分「怎么用 / 输入规则 / 分类总览 / A 类清单 / B 类清单 / 速查清单 / 校验记录」，每个码前面留了 `[ ]` 打勾位。**20 个码不是抄一遍就完**：脚本把每个码按 `normalizeCode + codeHash` 重算哈希，逐个对 `js/gift.js` 的码表核档位（20/20 全中）—— 以后加码同理，**先算哈希再写 txt**。文件已进 `.gitignore`（`兑换码大全.txt` + `*兑换码大全*.txt`）。
- **② 新怪物信息卡（用户要「新类型怪物暂停 + 讲攻击方式 + 我明白了继续」）**：
  · 数据层：`profile.met = { minion: 时间戳 }`（**和 `codex.enemies` 是两张表** —— 那张是击倒数，遇到没打死在那边是 0），配 `enemyMet()/markEnemyMet()`。
  · 触发点：`createEnemySystem({ onSpawn })`，在 `list.push(e)` **之后**、`return` 之前回调（回调里就看得见怪已上场）。
  · 拦截规则（`onMeetSpawn`）：`meetAuto` → `gameState==='playing'` 且 `level.roundNo` 已开 → 没 `meetOpen` → `enemyMet` 为假 → `markEnemyMet` 成功才排队。教程/武器教程里冒出来的怪**不打断也不记档**（那些有自己的教学卡）。
  · 冻结：`gameState = 'meet'`（`inGame` 白名单里没有它 → 移动、怪物、波次、秒表一起停）+ `input.joystick.release()` + `vel` 清零。`closeMeet()` 还原 `meetAfter`；队列里还有下一只就 160ms 后再弹（两张卡硬切会闪）。
  · 内容：直接 `codexEntries('enemies')` 取 `title/sub/desc/thumb`（图鉴改文案，两处同步），`desc` 里清掉 `**` 星号。层级 `#meetCard` **z-index 17**（压商店/升级 16，低于结算 18 与失败提示 19）；`endGame/showTitle/startPlay` 里 `dropMeet()` 收干净。
  · **⚠️ `?debug=1` 下默认不弹，加 `&meet` 才开**：这张卡会冻世界，二十多套老 CDP 一开局就被拦（实测 block53 的「怪进入可攻击状态」直接超时）。钩子：`__game.meetCard.{on,type,pending,met,auto,setAuto,close,forget,metAll}`。
- **③ 只记打斗时长（用户要「商店/剧情/选属性都不算」）**：
  · 全项目只有**一处** `elapsed += dt`，条件 `inGame` 现在 = `playing|tutorial|wtut` 且 `!panelOpen && !bagOpen && !meetOpen && uiHold===0`。商店/奇遇与主线/升级/武器卡都把 `gameState` 换掉了，天然不计；属性卡走 `panelOpen`、背包走 `bagOpen`、**通用确认弹窗走新加的 `uiHold`**（`askConfirm` +1 / `closeConfirm` 按 `confirmOpen` 才 -1，重入不会减成负数）。
  · **真 bug：跨局累积**。`elapsed` 只在模块初始化时置 0，打完一局回标题再开，第二局的「用时」把上一局的带进来（记录/成就全歪）。现在 `startPlay()` 里归零；读档仍走 `elapsed = saved.elapsed || 0` 接着算。
  · 调试钩子 `__game.timeInfo() → { seconds, running, state, holds }`；测试就断言 `running === false` + 1.1 秒内秒数不动。
- **测试**：`.tmp-block55-test.mjs` **89**/0（纯 Node：txt 20 码重算哈希 + 分类段/说明/总额 + gitignore；met 两张表分离 + onSpawn 位置 + 守卫链 + 层级 + 全页零重复 id + 计时白名单 + 归零唯一性）、`.tmp-block55-cdp.js` **51**/0（真 DOM，**URL 必须带 `&meet`**）。
  回归：block53-cdp **39**/0、block50 **12**/0、block29 **39**/0、block35 **49**/0、block19 **44**/0、block54-cdp **36**/0、block52/53/54 Node 全绿。
- **踩坑**：① 量 `#meetCard` 的 opacity 不能紧跟 `waitFor(.on)` —— CSS 有 0.26s 淡入，量到 0 是正常的（先 `sleep(420)`）；缩略图要等 `img.complete && naturalWidth>0`。② `elapsed = 0;` 的正则会被 `let elapsed = 0;` 命中，断言「只有一处归零」要用 `(?<!let )`。③ 商店面板的类名是 `.shop` 不是 `#shopScr`（取 z-index 别猜）。

第 50 块要点（主菜单属性页，2026-10-22，v=59；同批发版还有 47 箭雨 / 48 加载轮播 / 49 种子挑战）：

- **用户要求**：主菜单加「属性」页——上半屏 3D 奶蛙**可拖动旋转**、**不时做个动作**（蹦/拍掌），下半屏显示**加上篝火和永夜火种之后**的属性。
- **`js/statView.js`**：独立小渲染器（自己的 canvas + renderer，与 `scene.js` 主场景完全隔离；同一个 `rigged.glb` 走浏览器缓存只下载一次）。`PerspectiveCamera(38)` 在 `(0, 2.35, 5.1)` 看 `(0, 1.02, 0)`；半球光 + 月光 + 暖补光；圆形展台 + 呼吸描边环；模型走 `loadFrog('assets/rigged.glb')`（失败自动 `buildFallbackFrog`）。节拍：`hopT > 0` 时用 `frog.update(dt, 1)` 走步态、每次蹦 0.9s、间隔 3.2~6.2s；每 8~14s `playAttack()` 拍一掌。只有属性页开着时 `main.js` 的 `tick()` 才 `resize()/update(dt)`，关页即停。
- **拖动**：`pointerdown` 记 `startX/lastX`，`pointermove` 把位移折成 `targetYaw`（每像素 0.011 rad，夹 ±2.6），松手 `targetYaw *= pow(0.25, dt)` 回正；`setPointerCapture` 必须包 try-catch（合成 PointerEvent 的 pointerId 抓不住会抛）。
- **数值**：`renderStatRows()` 每次进页重算——`const s = createStats(STAT_DEFS); const w = createWeaponStats(); campApply(s, w); applyBoons(s, w);`（**临时实例**，绝不碰局内 stats）；按 `PLAYER_GROUPS` 分组；`val !== base` 的行补「（基础 X）」。别在这里用 `stats` 单例，否则打开属性页会污染正在跑的那局。
- **测试**：`.tmp-block50-cdp.js` **10** 项全绿（4 组 14 行渲染 / 基础值 6.0 与防御 0.0 / 合成 PointerEvent 拖动 yaw 真变 / 松手回正 / 预置篝火铁壳×3 + 厚皮×2 后防御不再 0.0 且标注基础值 / 返回能关 / 零报错）。视觉核对 `.tmp-shot50.js`（390×844 → `%TEMP%/naiwa-shot-50/`）。
- **截图坑**：`?debug=1&title` 的公告是 loading 淡完 +700ms 才弹，`__game.notice.hide()` 抢在前面白关一次 → 先 `sleep(2600)` 再 hide 再截图；`.st-hint` 压在展台光环上会糊，已改成半透明胶囊。
- 同批测试：`.tmp-block47-cdp.js` 27、`.tmp-block49-cdp.js` 23、回归 block46 65 / block45 49 / block41 37 全绿。

第 46 块要点（抽象奶蛙音效包，2026-10-22，v=52）：

- **用户要求**：`naiwa-step/sounds/` 里的 voice-1/2/3 与 voice-end（**不含** `voice-end-rabbit`）都是奶蛙音效；**通关第一关后弹出「获得新音效包」界面**，问要不要从正常音效包切到「抽象奶蛙音效包」；选了就启用（4 个文件，位置自己挑、可以替换或新增，时长不合适可以裁切）；**设置里要能改**。
- **素材**：`assets/audio/voice/voice-1.mp3 / voice-2.mp3 / voice-3.mp3 / voice-end.mp3`（48kHz 立体声，1.8~6.1 秒）。来源与静音位置记在 `assets/audio/LICENSE.md`。**这不是 CC0 第三方素材**，是同作者音游的原创音，跟着本仓库走。
- **不做文件级裁切**（本项目没装 ffmpeg，也没必要装）：`js/voicepack.js` 给每个要替换的音效写 `offset / dur / vol / rate / jitter`，`audio.js` 播的时候用 `AudioBufferSourceNode.start(0, offset, dur)` 现场裁。改长度 = 改表里两个数字，不用重做音频。
- **换哪 8 个位置**（`FROG_SFX`）：`hit`（voice-3 起 0.745 取 0.45s，加速 1.12 → 短促一呱）· `crit`（voice-1 起 0.334 取 0.9s）· `hurt`（voice-2 起 0.177 取 0.85s）· `die`（voice-2 同段取 0.7s，降速 0.80 → 闷）· `explode`（voice-2 降速 0.72 只取 0.55s）· `roundClear`（voice-1 取 1.1s，20 回合要听 20 次别太长）· `victory`（voice-end 整段 6s）· `defeat`（voice-end 前 3.4s 降速 0.80）。
  **不换**：`swing`（每秒 1.2 次，长叫声会糊）、金币 / UI / 商店 / 图鉴这类非角色音。
- **audio.js 的改法**：buffer 缓存键从「音效名」改成「实际文件」—— `'s:' + 名字`（原版）/ `'v:' + 文件名`（奶蛙），`loadFile(key, url)` 统一加载；`voiceOf(name)` 按当前包决定用哪份；`setPack(id)` 只改内存标记 + 预热新包素材（不打断正在响的）；`previewVoice(file, offset, dur)` 给试听用；`stats()` 新增 `pack` / `voiceLoaded`（`loaded` 仍只列原版名字，老断言不受影响）。
- **解锁与开关**：`profile().voicePack = { unlocked, id }` 是唯一真相源，`audio.setPack()` 纯内存，`applySettings()` 每次启动/改设置时推一遍。解锁卡两个按钮（含 ✕）**都算看过** —— 都写 `unlocked: true`，只是 `id` 不同；此外 `#packGet` 只在 `isWin && 第一关 && !unlocked` 时延迟 **1.4 秒**弹出（先让通关的成就 toast 播完，弹之前还会 `clearTimeout(toastTimer)` 把残余 toast 收掉，否则会压住卡片标题）。
- **UI**：`#packGet`（z-index **20**：压住结算面板 18、比永夜火种三选一 22 低）→ 标题 / 说明 / 4 行素材（各带「试听」按钮，播完显示「♪」0.9 秒）/ 「先用原来的」「换上奶蛙叫」。设置面板第二行新增「音效包」，两段「正常 / 奶蛙」，未解锁时「奶蛙」`disabled` 且说明改成「通关第一关解锁『奶蛙』那一项」。
- **顺手改的**：`#waveToast` 的 z-index 从 7 提到 **26** —— 不然结算面板（18）弹着时切换音效包的提示完全看不见。**坑**：正因为提到 26，设置面板里切包时弹 toast 会正好压住「音效包」那一行（截图核对才看出来），所以**设置里切换不弹 toast**，只靠按钮态 + 那一声。
- **调试钩子**：`__game.pack = { state, get, set, unlock, show, yes, no, open, files, map, descs, preview, sfx, audio, reset }`。
- **同帧叠音修掉（v=55）**：用户反馈「打中的呱 + 怪死的呱同时播，很糊」。`sfx()` 支持 `delay`（从包表或 opts 读，用 AudioContext 绝对时间调度 `start(at)`，不是 setTimeout）；`voicepack.js` 的 die `delay:0.09` / explode `delay:0.13`。顺带修了回归测试的偶发：试听反馈断言原先卡在 900ms 还原边界（素材缓存热了 ♪ 出现更早、还原也更早），取样点提前到 400ms。
- **追溯解锁（v=54 补丁）**：音效包上线前就通关过第一关的老玩家拿不到解锁（解锁只挂在通关那一刻）。补丁 `packRetroDue()`：战绩 `records[1].wins > 0` 且未解锁 → 标题页 1.6s 后补弹一次解锁卡（错开 700ms 的公告），点「换上/先用原来的」走 `closePackGet` 正常落档。测试 `.tmp-block46b-cdp.js` **14** 项全绿（钩子 `__game.pack.retroDue()`）。
- **测试**：`.tmp-block46-cdp.js` **62** 项全绿（含真打通第一关：`setAdmin(true)` → `jumpRound(20)` → `skipRound()` → 点过武器卡/三选一 → 结算 → 弹卡；**第 20 回合是最后一回合也会先弹武器卡和三选一**，测试里必须一路点过去）。素材探测 `.tmp-voice-probe.js`（时长/峰值/首尾静音）。视觉核对 `.tmp-shot46.js`（390×844，输出 `%TEMP%/naiwa-shot-46/`）。线上烟测 `.tmp-block46-live.js` **14** 项全绿（v=52 / 4 段素材 200 且解码时长与本地一致 / 未解锁时「奶蛙」disabled / 预置档案后线上真能切到 frog 并去拉素材 / 刷新后选择还在 / 零 console 报错）。回归 block45 49/0、block44 36/0、block41 37/0。
- **测试坑**：① headless 里 `AudioContext` 要一次**真实鼠标手势**才 `running`（`Input.dispatchMouseEvent` 点一下），否则 `sfx()` 全返回 false；② **管理员沙盒期间一切不落盘**（第 38 块），所以在 admin 下通关解锁的音效包不会存档、退出沙盒就回滚 —— 验持久化要先 `setAdmin(false)` 再 `pack.unlock()`。

第 45 块要点（公告，2026-10-22，v=51）：

- **用户要求**：新加公告，**基本照搬 `naiwa-step` 的公告功能（含「今日不再弹出」）**，内容改成「大家提建议和 bug 能获得礼包兑换码」+ 本人 QQ **落花雨 3829845261**（一键复制）+ **本站网址**（一键复制）。
- **照搬过来的骨架**（`naiwa-step/js/main.js` 的 `showNoticeIfNeeded` / `copyText`）：`localStorage` 存 `日期|版本`，`force=false` 时命中就不弹；✕ 与「我知道了」都走同一个 `closeNotice()`；勾选框只在关闭那一刻才写记录（不勾就不会记住，下次照弹）。**换公告内容只改 `main.js` 的 `NOTICE_VER`（现在是 `'1'`）**，所有人都会重看一次。
- **改动的两处**：① 配色/字体换成夜行这套（暖黄标题 + 月光青描边，`.notice-*` / `.cp-*` 全在 `style.css` 末尾第 45 块段落）；② 自动弹出时机从「进主界面 600ms」挪到 **loading 遮罩淡完之后 700ms**（遮罩 z-index 20，公告 46，不会打架，但压着加载页弹像卡住）。
- **一键复制 `copyText()`**：`navigator.clipboard.writeText` → 失败退回 `textarea + execCommand('copy')`（老 WebView / 非 https 场景）。`#noticeOv` 上**事件委托**一次绑完，按钮 `data-copy` 带原文；成功亮「✅ 已复制」并播 `card` 音效，1.6 秒后还原。
- **入口**：主菜单**第三排单独一行**「📢 公告」（`.tt-row-notice` / `.tt-notice-btn`）——第二排已经是 3 个按钮，塞第 4 个会挤；这个走暖黄色、字号小一档，别抢「开始游戏」的眼。
- **不挡自动化测试**：`AUTO_START`（`?debug=1` 且不带 `title`）时不自动弹；`?debug=1&title` 会弹（截图核对标题页时要先 `.classList.remove('on')` 收掉）。
- **调试钩子**：`__game.notice = { show(force), hide(), open(), ver(), key(), clear(), copy(t) }`。
- **测试**：`.tmp-block45-cdp.js` **49** 项全绿（含 headless 里先 `Browser.grantPermissions` 授 `clipboardReadWrite` 才能验剪贴板真值；`?debug=1` 验证钩子、**无 debug 页**验证「进主界面自动弹」）。线上烟测 `.tmp-block45-live.js` **17** 项全绿（线上 v=51 / 自动弹 / 文案 / 两个复制按钮真写进剪贴板 / 勾「今日不再弹」后刷新不弹 / 主菜单按钮强制回看）。视觉核对脚本 `.tmp-shot45.js`（`?debug=1&title` + 390×844，输出到 `%TEMP%/naiwa-shot-45/`）。回归 block41 37/0、block44 36/0。
  - **线上烟测的坑**：`/json/new?URL` 之后立刻 `Runtime.evaluate` 读到的是 **about:blank**（它也有 `body`，`readyState` 也不为 `loading`），所以开头两项（版本号 / 公告 DOM）会查空；必须等 `location.href.indexOf('naiwa-rouge') >= 0` 才算导航完。

第 44 块要点（礼包兑换，2026-10-22，v=50）：

- **用户要求**：主菜单加礼包兑换，不依赖服务器；自带若干码；同一个码对同一用户只生效一次；先给 A 类（300 骨币）/ B 类（100 骨币）各 10 个。
- **码不写在源码里**：`js/gift.js` 的 `GIFT_TABLE` 只有 `[16 位哈希, 骨币]`。哈希 = 归一化后的码做两次加盐 FNV-1a（`0x811c9dc5` 与 `#naiwa#…#gift#` / `0x01000193`），拼成 16 位十六进制。扒源码拿不到能用的码。
- **明文码只在 `gift-codes.local.md`**（`.gitignore` 已排除，含 `*.local.md`）。**千万不要提交这个文件**，一做公开仓库就等于把码发给所有人。
- **归一化 `normalizeCode()`**：转大写、只留 `A-Z0-9`。大小写、横杠、空格、全角横杠全都不影响；短于 6 个字符直接当无效。
- **一码一次**：`profile.gifts = { <hash>: 兑换时间戳 }`；`giftRedeemed()` 拦重复，`markGift()` 记账。代价说清楚：**换浏览器 / 清缓存 / 换设备 = 记录清零，同码可再用**。纯前端极限，要真锁死必须上服务器。
- **管理员沙盒**：第 38 块的 `suppressSave` 照样生效 —— 管理员期内兑换的骨币和用码记录都不落盘，退出管理员就还原。
- **UI**：主菜单第二排变成「图鉴 / 礼包兑换 / 设置」。`#giftScr` 里有当前骨币、输入框、兑换按钮、结果提示（`.gf-msg.ok` / `.err`）、已兑换列表（`A 类 · +300 骨币` + `2026/10/22 21:35`）。兑换成功同步刷 `#campBoneNum` 与礼包页骨币数。输入框回车上直接兑换。
- **调试钩子**：`__game.gift = { count, lookup, log, bones, open, redeem }`。
- **测试**：`.tmp-gift-test.mjs` **17** 项（码表规模 / 归一化 / 哈希稳定 / 20 个真码逐个查表 / 无碰撞 / 换写法可查 / 反查档位 / 10 个假码全拒）；`.tmp-block44-cdp.js` **36** 项（入口 / 空输入 / 假码 / A 类 +300 / 重复被拦 / B 类 +100 / 列表文案 / 刷新后骨币与记录还在 / 刷新后用过的码仍被拦）。回归 `.tmp-block41-cdp.js` 37/0。
- **再发一批新码**：跑 `node .tmp-gift-gen.mjs` 生成明文+哈希，把哈希追加进 `js/gift.js` 的 `GIFT_TABLE`、明文追加进 `gift-codes.local.md`。

第 43 块要点（读秒放开到奇遇 + 修锁死，2026-10-22，v=49）：
- **用户要求**：「也套吧」——随机奇遇的文案也是一两百字，一起读秒。
- **改动（`main.js`）**：`STORY_READ_DELAY` → `TALK_READ_DELAY = 3`；`resolveStoryChapter()` 不再挂 `__readDelay`；`renderTalkBeat()` 改成 `talk.ev.readDelay != null ? talk.ev.readDelay : TALK_READ_DELAY` —— **任何事件在数据里写 `readDelay: 0` 就能单独关掉读秒**。
- **顺手修的真 bug（第 42 块埋的）**：旧实现倒计时归零时只写 `talkCdTimer = null`、**没有 `clearInterval`**，旧定时器继续每 100ms 空转；它持有上一拍的 `list`（已脱离 DOM）和过期 `deadline`，于是不断把**新一轮**的 `talkCdBtns` 清空 → 新一拍的按钮永远暗着、点不动（主线第二拍之后就会触发，奇遇一测就暴露）。
  - 修法两条：①`talkCdGen` **代次令牌**，换代后旧 tick 自查立刻退场并清掉自己的 interval；②`clearTalkCountdown()` 一律**按 DOM 现状**（`evChoices.querySelectorAll('.ev-btn')`）清角标与暗态，解锁靠按钮自身的 `data-cd-lock` 标记，不再依赖记住的数组（按钮被重建也不会漏）。
- **调试钩子**：`__game.event.readDelay` 新增；`cdLeft` / `cdLocked` 含义不变。
- **测试**：`.tmp-block42-cdp.js` 扩到 **28** 项全绿（新增：第二拍也能正常解锁、奇遇读秒锁住/角标/点不动/归零后能推进）；回归 `.tmp-story-test.mjs` 76、`.tmp-block41-cdp.js` 37 全绿。
- **测试坑**：`cdLocked` 是 `talkCdBtns.length > 0`，只反映"记着的那批"，**要验真实状态请看 DOM**（`.ev-btn.cd-wait` / `.ev-cd` 的数量）——这次就是靠 DOM 与钩子对不上才挖出 bug。

第 42 块要点（主线读秒，2026-10-22，v=48）：
- **用户要求**：「过 story 剧情时，为保证用户读完，3s 后再激活按钮进入下一句对话，按钮显示倒计时」。
- **实现（`main.js`）**：常量 `TALK_READ_DELAY = 3`（第 43 块由 `STORY_READ_DELAY` 改名，并对奇遇生效）；`renderTalkBeat()` 渲染完这一拍的回话按钮后调 `armTalkCountdown(btns, sec)`。
- **倒计时机制**：`armTalkCountdown()` 用 `performance.now()` 算截止时间（不受帧率/后台节流影响），`setInterval(100ms)` 刷新角标；只有**付得起**的按钮在读秒结束后解锁，付不起的一直灰着；`clearTalkCountdown()` 在 `closeEvent` 与换拍时清理定时器与角标。（**第 43 块已重写这段机制，见上**）
- **样式（`style.css`）**：`.ev-btn{position:relative}` + `.ev-cd`（右上角秒数角标）+ `.ev-btn.cd-wait`（读秒中的暗态，右侧留 52px 给角标）。
- **调试钩子**：`__game.story.readDelay` / `__game.event.cdLeft` / `__game.event.cdLocked`（注意 talk 系列的钩子都挂在 `__game.event` 下，不是 `__game.talk`）。
- **测试**：`.tmp-block42-cdp.js` 21 项（第 43 块扩到 28 项，含奇遇读秒与第二拍解锁）。

第 41 块要点（永久选择提示 + 存档退出，2026-10-22，v=47）：
- **两个「会写进存档」的界面都要说清楚**（用户点名「永夜篝火」，确认后选了「两处都加」）：主菜单篝火页（骨币点九簇火种）+ 通关后的永夜火种三选一。
- **两层提示**：① 首次进入各弹一次 `.modal`（`#confirmAsk`，告知型单按钮「我知道了」）—— 靠 `profile().notice.{campfire,boon}` 只拦一次，之后不烦人；② 常驻警示条 `.cf-warn`（篝火页常显）/ `.up-warn`（火种面板显、局内回合升级面板用同一套 DOM 所以要 `aria-hidden` 收起）。
- **上一轮没接完的「存档退出」一起补齐**：`#exitBtn` 在 HUD 顶部行 `#hudTop` 右侧；`saveAndExit()` = `askConfirm` → `saveRunAtRound(roundNo)` → `gameState='title'` + `showTitle()`；标题页 `#ttSaved` 写「已存档 · 第 X / 总 回合」。已通关待领火种（`pendingClearUid != null`）不再建存档，避免清掉的档复活。
- **调试钩子新增** `__game.state`（getter）。测试：`.tmp-block41-cdp.js` **37** 项全绿（两处弹窗文案/只弹一次/警示条可见性与收起/局内升级不显示/开一局→退出→回标题→存档列表卡片）。
- **坑**：`__game` 里 `profile()` 挂在 `ui` 下（`__game.ui.profile()`），不是 `settings`；`state` 是 getter 不能加括号；Chrome 用户数据目录删除会 EBUSY，删不掉就交给系统。

第 36 块要点（相机减晕，2026-10-22，v=41）：
- **用户反馈「视野搞得人晕」+ 建议「随移速扩大视野」**。GitHub 调研的定案依据：Unity Cinemachine Framing Transposer（Dead Zone 内相机不动 / Soft Zone 按阻尼回中 / Lookahead 对噪声敏感会放大抖动的官方警告）、Godot Phantom Camera「Framed」模式（3.4k★，同款死区）、three.js 相机教程（「用独立的平滑注视目标减少抖动」）、任天堂 Kirby Air Riders 的舒适设置（「速度效果」=FOV 随速度变化，单独一个可关项——FOV 拉宽是有效的速度反馈，但对晕动症最敏感）。
- **实现（`main.js`）**：删掉旧「相机位置连续 lerp 追角色 + 注视点=pos+vel×0.22」；改为 `camFocus`（焦点）：
  - 角色离焦点 ≤ `CAM_DEADZONE`(1.0) → 焦点**完全不动**，画面静止（防晕的核心）；
  - 超出 → 焦点按 `1−exp(−CAM_FOLLOW·dt)`（6.0）追到「角色刚好回到死区边缘」，角色跑动时稳定停在死区边缘、屏幕匀速平移；
  - `camera.position = camFocus + camOffset`（不再二次 lerp，避免双重滞后的「糊」感），`lookAt(camFocus)`；
  - **速度预测注视点整个删除**——急停急转时镜头不再甩（这是晕的头号来源）；
  - 受击震屏维持只挪位置不转镜头，且因为 position 每帧由焦点重设，抖动不再残留进缓动。
- **速度感视野**：`CAM_FOV_BASE 45` / `CAM_FOV_ADD 3.0` / `CAM_FOV_LERP 3.2`，`speed01`（属性移速归一）驱动，停下自己收回；设置 `speedFov`（默认开，`BOOL_SETTINGS` 统一处理 on/off 段）。幅度刻意小 + 必须缓动 + 可关，三者缺一就是新的晕源。
- **调参入口**：`main.js` 顶部 `CAM_DEADZONE / CAM_FOLLOW / CAM_FOV_BASE / CAM_FOV_ADD / CAM_FOV_LERP`；死区调 0 = 回到旧「随时贴着角色」的跟随。
- **调试钩子**：`__game.cam = { focus(), pos(), fov(), deadzone, fovBase, fovAdd, speedFov() }`；`startPlay` 里焦点贴到角色（换关不再从上一局的死点飞过来）。
- **测试**：新 `.tmp-block36-cdp.js` 27 项全绿（死区零位移 / 出死区收敛到边缘 / 位置=焦点+偏移 / FOV 缓动与上限 / 开关与持久化 / 源码护栏 vel×0.22 已删 / 震屏不转镜头 / 零异常）。回归：block18 35 / block35 49 / block34 28 / block30 50 / settings 36（+3：八项设置、速度感开关与持久化）全绿。
- **测试坑**：SwiftShader 帧率低而 dt 夹在 0.05，**缓动按模拟时间走**——凡是「等它收敛」的断言一律 `waitFor` 不能 `sleep(固定)`；震屏的位置残差要用「pos − (focus+固定偏移)」来量，不能和旧快照比（焦点会漂）。

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
- **篝火改成无限级（第 27 块）**：`CAMP_STEP` 是每级加价百分比，`campCost(id, level)` = 原价 × (1 + CAMP_STEP×level)，**线性、没有上限**（第 27 块原是指数 ×1.35^level，v=46 因关卡难度是线性、改回线性增长，第 1 级价格不变）。老档案里 `camp[id]=1` 天然读作 1 级，**不需要迁移**。
- **骨币产出**加了两个维度：`coins`（没花完的金币 ×0.25）与 `levelId`（`BONE.levelMul`：1 关 ×1 / 2 关 ×1.4 / 3 关 ×1.8）。`bonesFor` 的签名向后兼容（老调用不传就是 0 金币 / 第 1 关）。
- **永夜火种**（`boons.js`）：**本关首次通关**（第 27 块改，`wasFirstWin` 在 `saveRunRecord` 之前判定）→ `grantBoons(3)` 写 `profile().boonPending` → 结算按钮变「领取 3 次永夜火种」→ 复用三选一面板（`upPanel` + `.boon` 皮肤），抽签走 `rollBoons(rng, {luck})`，权重和局内卡同一套 `rarity.js`。主菜单 `#boonScr` 可看已选层数。
- **待领次数必须落档案**：玩家很可能在结算界面直接关网页。`showTitle` 会检查 `boonPending()` 并自动补弹（500ms 后，等标题页动画）。
- 16 张卡、**每张 1~3 层上限**，满层退出抽签池；满层共 40 层（要约 12 次通关全收）。数值压得很小，全满 ≈ 一局中期的分量。
- 结算面板：`rsBtn` 文案与 `.boon` 金色样式在 `endGame` 里按 `boonGain` 切换；`rsBone` 明细多了「第 N 关 ×1.4」和「剩 X 金币折 Y」。

测试：Node 8 套 679（新增诅咒/种子 84）+ CDP 26 套 847（新增 block21 36、block22 38；第 18 块图鉴 31→35、弓手 21→22）。

第 24 块要点（道具外观升级，2026-10-21 夜）：
- **资产全部 CC0**：`assets/props/` 共 5 个 glb 约 300KB —— `spikes-trap.glb`（KayKit Dungeon Remastered 的 floor_tile_big_spikes，带手绘贴图）、`turret-crate.glb` / `ballista-bow.glb` / `ballista-bolt.glb` / `bone-deco.glb`（Quaternius，经 trebeljahr/quaternius-showcase 镜像）。**加载失败自动退回程序化外观**（turret.js 的 buildTurret 原箱炮 / relics.js 的紫色石锥），测试与弱网都不受影响。
- **Quaternius 模型的根节点自带 -90°X 旋转**：不能直接改 `rotation`（会覆盖烘焙旋转，箭会立起来），必须包一层 Group 转向，模型自身只动 scale/position；尺寸单位还小约 100 倍，用包围盒 fit 缩放。
- **KayKit 尖刺的节点结构是反的**：`floor_tile_big_spikes`（网格）包着 `spikes`（子网格）——不管藏砖节点还是藏砖网格都会连刺一起藏。正确做法：`root2.attach(spikesMesh)` 把刺摘到根下，再把砖网格 `visible=false`。
- **调试钩子**：`__game.relics.debugShow(x, z)` 常驻一丛尖刺（截图/检查用）。
- 验收脚本：`.tmp-shot-props.js`（进游戏放 2 炮台 + 地刺 + 霜环，抓喷发瞬间连拍；CPU 友好 2 线程）。
- 弃坑记录：KayKit 骷髅包的 `Skeleton_Crossbow.gltf` 几何本身就是碎石状（疑似坏模型，别再用）；Quaternius cyberpunk 的 Turret 风格不符。外观对比离线查看器：`naiwa-rouge/.tmp-view.html` + `.tmp-shot-view.js`（已 gitignore）。

第 25 块要点（诅咒可视化修补，2026-10-21 晚）：
- **起因**：用户反馈「夜行（诅咒）似乎没有真正生效」。逐环节排查结论：**管线本身是好的**——
  选卡 → `profile().runCurses` → `startPlay` 的 `applyRunCurses`（`src='curse'`）→
  五个属性都有真实读取点（moveSpeed/goldRate/attackSpeed/attack/hurtPlayer×(1+dmgTaken)），
  结算 `curseMul` 也确实乘进 `bonesFor`（node 单测 + CDP 双验证，开局血量 4 实测过）。
  真问题是**看不见**：效果说明全塞在 `title`（悬停才有，手机上等于没写）、局内无任何提示、
  结算只写「诅咒 ×1.45」不点名。
- **修补**：① `curses.js` 每条加 `eff` 字段（改前→改后的具体数字，如「生命上限 6 → 4」）；
  ② 选卡芯片改两行卡（第一行图标+名字+倍率，第二行印 `eff`），底部新增 `#rcSum` 明细行
  （`renderCurseSum`，随点选实时更新）；③ 开局落账时 `showToast('夜行诅咒生效', 名单+倍率)`；
  ④ 属性面板（奶蛙页顶部）加 `.ap-note`：「上面显示的已经是扣完之后的数值」；
  ⑤ 结算加「诅咒」格子（点名+倍率），`rsBone` 的诅咒倍率也带上名字。
- 验收脚本：`.tmp-curse-ui-test.js`（14 项：芯片两行/明细行/倍率/开局血量/面板注记）。
- **商店买断售罄（第 25 块追加，2026-10-21 晚，v=29）**：用户要求「同一件货买一次后售罄」。
  main.js 加 `shopSoldOut` Set：`openShop` 清零 → `buyItem` 成功后记入并 `renderShop` →
  已售罄的卡 disabled + `.soldout` 灰态 + 描述换「售罄 —— 下次进店再看看」，钩子购买同样被拦。
  **属性/药水不能再在一家店里反复叠**；下次进店（第 3/6/9…回合刷新）重新上架。
  回归：econ 78 + shop-chain 49 + 新 `.tmp-soldout-test.js` 9 项 + block13 32（地刺升 3 级的用例改成跨 3 次进店）。
- **丰富音效（第 25 块追加，2026-10-21 晚，v=30）**：新增 7 个 CC0 音效补空白时刻——
  `aegis`（金钟罩开启，原蹭页签声）/ `turretShot`（炮台发射，原蹭万剑齐发）/ `spikes`（地刺破土，
  原蹭 hit）/ `curse`（被骨咒师咒中，下行扫弦）/ `soldout`（商店售罄与买不起的拒绝声）/
  `ach`（成就解锁铃，原蹭页签声）/ `boon`（火种揭示号角）。素材仍来自同一批 CC0 包，
  构建脚本 `.tmp-audio-build2.py`（只处理新增，老的用 `.tmp-audio-build.py`）。
  SFX_DEFS 26→32；cursePlayer 只在「从干净被咒」时响一次（紫圈叠咒不叠音）。
  回归：audio CDP 41（音效表断言改 32）。

第 27 块要点（环剑整环补满 + 篝火无限级 + 火种首通门槛 + 主菜单火种面板，2026-10-21 深夜，v=31）：
- **环剑整环补满**：`swordRegen`（3.0 秒/把）改名 `swordRefill`（base 10.0 秒，整环补满总时长）。
  `weapon.js` 两处 `need = swordRefill / owned.length`（5 把 → 2s/把，4 把 → 2.5s/把），
  买剑不再拖慢恢复。升级卡「锻造」改「剑匣收紧」：`{ stat:'swordRefill', flat:-1.0 }`（10 → 9 秒）。
- **篝火无限级**：删 `CAMP_MAX_LEVEL/campMaxLevel/campFullCost/CAMP_TOTAL_COST/campMaxed`，
  `campLevel` 不再封顶；`CAMP_STEP` 1.6 → **1.35**；首档整体降价约 4 成（厚皮 160→90 等）；
  UI 不再显示「Lv.x / 3」「已到顶」，只显示 `Lv.N` / 「未点燃」。
  **新增三簇火种**：剑锋（每级剑伤害 +5%，scope:'weapon'）/ 疾风（每级攻速 +3%）/ 铁壳（每级护甲 +6），共 9 簇。
- **永夜火种首通门槛**：`endGame` 在 `saveRunRecord` **之前**先记 `wasFirstWin`（本关 wins==0 且本局胜），
  `boonGain = wasFirstWin ? 3 : 0`；重复刷同一关不再发，结算格子写「本关已首通过，不再发放」。
- **主菜单「永夜火种」面板**：`#boonScr`（`btnBoons` 进入）列已选 boon、层数 n/maxStack、效果与说明。
- 回归：camp 单测重写 106 + rogue-unit 144 + block19 CDP 44 + block23 CDP 63（含新 F2 重复通关不发）
  + 新 `.tmp-boonui-test.js` 9 + weapon 19 + sword-shop 26 + block13 32 + block20 31 + block21 36
  + block22 38 + econ 44 + rarity 48 + curse-ui 14 + soldout 9 + curse 84 + audio 41 + boon 146，全绿。

第 28 块要点（霜牢主祭重做：霜牢环跟玩家 + 环绕卫队 + 石刺链，2026-10-21，v=32）：
- 用户 bug 报告：主祭只会躲在角落没有任何攻击能力。三项改法全在 `enemy.js`：
- **霜牢环跟玩家**：`aura.followPlayer: true`（半径 4.6 → 2.6）。环 mesh 挂 scene（不挂怪 root），
  每帧贴玩家脚下；`collectAuras(ctx)` 按 `ctx.playerPos` 距离判定加成；被加成怪 `glowT` 渐变泛青光
  （`AURA_GLOW=0x2fd8f0`，受击闪白优先）。主祭死了环先隐藏。
- **环绕卫队**：`summon: { kind:'warrior', count:4, every:9.0, first:4.5, orbit:1.45 }`。
  spawn 时带 `guard: { master, angle, radius }` opts；每帧 `angle += dt*0.55` 公转、
  位置 = master + 极坐标；不自主运动（`!e.guard` 才 moveToward）、不休息；
  master 死 → `takeDamage(99999, quiet)` 自灭（「霜牢断了，傀儡失去支撑」）。
  召出来的卫队继承主祭本回合的 `hpScale/damageScale`。
- **石刺链**：`spell: { kind:'spikes', count:6, step:1.15, radius:1.0, gap:0.16 }`。
  `spikesQ`（待爆段）+ `spikesFx`（ConeGeometry 锥体：升 0.12s → 停 0.25s → 缩 0.25s）；
  第 i 根在 1.4+step*i 距离、gap*i 延迟起爆；判定 `hurtPlayer`；**最后一段再 spawn 一只 minion**
  （继承 scales）。`updateSpikes(dt, ctx)`、`reset()` 清空、导出 `spikeCount()/guardCount()`（测试用）。
- `wave.js` 142~144 回合提示与注释同步新机制；`codex.js` 主祭描述改「霜牢环钉在你脚下跟着你走……」。
- 回归：level2 单测重写 67 + block20 CDP 36（D 段改环跟玩家 + 新 D2 卫队/石刺/主祭死卫队散架），
  全绿。注意：测试小兵必须放在玩家 2.0 距离（环 2.6 之内、自爆圈 ~1.1 之外），贴脸会自爆。

第 35 块要点（第四关「雾堤服务区」，2026-10-22，v=39）：
- **定案（AskUserQuestion 确认过）**：主题 = 雾堤服务区；三只新怪全做（wraith 隐身 / leaper 跳劈 / mender 回血）；难度与三关持平（原表 412 只，微调 R16~R20 旧怪数量拉回 **396**——只砍 minion/warrior/archer/bowman，新怪密度不动）。
- **⚠️ 定案修正：「第 7 种剑霜剑」取消**——写的时候发现 frost（冰剑，命中减速）第一关就有、icon-frost.svg 也存在，定案时漏查了。用户拍板：不加新剑，本块只加暖炉。剑阵保持 6 种。R17 回合提示同步改成「冰剑和暖炉该上场了」。
- **wraith 雾魉**（`enemy.js`，rogue glb 青灰重涂）：`cfg.ghost = { hidden:2.5, visible:3.0, revealDist:1.2, firstHidden:1.4, ghostOpacity:0.16 }`。隐身 = **无敌**（`takeDamage` 开头 `if (e.ghostHidden) return false`）+ **不可索敌**（main 近战 / weapon aliveEnemies / turret 三处 / enemy chainTargets 都加了 `!e.ghostHidden`）+ 材质透明度逐帧过渡（mats 在 spawn 时转 transparent）。贴脸（≤ revealDist+玩家半径）强制显形；攻击起手也强制显形（隐身时攻击距离够不着人，双保险）。隐身时脚下圈和血条一起藏。
- **leaper 跃行尸**（rogue glb 尸绿重涂）：`cfg.leap = { jumpTime:0.55, arcH:1.7, landRadius:1.7, recover:1.0, color }` + windup 0.8。状态机 attack（落点红圈钉玩家**当时**位置，`leapRing` Group=disc+rim，按需创建/destroy）→ jump（抛物线，`root.position.y = sin(πk)×arcH`）→ recover → chase。落点夹在场地边界内；死亡时收圈 + 落回地面；**「随机休息」块要豁免 jump 状态**（否则滞空会被 restT 冻住）。
- **mender 缝合师**（mage glb 绿眼摘帽提骨针 `STAFF_STYLES.mend`）：**不写 damage 字段**（图鉴显示「从不还手」）；`spell:{kind:'mend', radius:3.2, heal:1.2}`，`mendWounds` 给半径内掉血怪回 heal × 生成时 damageScale（满血不浪费、血条即时刷新、绿字 `fx.text`）；走巫师通用 keepDistance 读条骨架。
- **暖炉 stove**（`relics.js`）：3 级，radius 2.2→2.6 / 每 1.0s / 0.5→0.9 伤（`dot:true` 静默结算防数字刷屏）。视觉纯程序化油桶炉（项目没有合适的炉子模型，「废服务区油桶改的」比硬凑 CC0 更贴题）；判定中心是**玩家**不是炉子；商店 `buyStove` 32 币 / 第 8 回合解锁。调试钩子 `__game.relics.stove(at)`（手动烧一次）+ `__game.arenaRadius`（新加的 debug getter）。
- **接线**：main.js `LEVELS` +1 / preload 3 新怪 / onDeath 成就埋点 3 条；story.js s04 `levelId:4, atRound:2`；achievements 38 条；codex 13 怪（enemyDesc 加 ghost/leap/mend 三分支）。
- **测试**：`.tmp-level4-test.mjs` 90 + `.tmp-block35-cdp.js` 49 全绿；回归 block18（图鉴 13/6、成就 38）/ block29（39）/ block30/32/34 / settings/eventui/econ-cdp / Node 全套（story 改成局内四夜 1/2/3/4）全绿。
- **测试坑**：①隐身淡出是逐帧过渡，断言 opacity 要 `waitFor` 不能当场读；②跃行尸红圈 scale 带呼吸（1.7×1.04→1.7），断言留 ±0.1 容差；③`__game.arenaRadius` 是本块新加的 debug getter，旧测试别再用别的方式摸场地半径。
- **🔧 上线后修的用户 bug（v=40）**：主祭死后**卫队尸体不消失**。原因：`updateOne` 里卫队块的 `if (!m || m.state === 'dead') { takeDamage(…); return; }` 是每帧都进的——卫队第一次被杀（state 已 dead）之后，仍然走这个分支 `return`，永远到不了下面的 `if (e.state === 'dead') { e.deathT += dt; … }`，deathT 不涨、回收循环（`deathT < deathTime`）永远收不走，尸体就原地定格。修法：只在 `e.state !== 'dead'` 时补刀，**不 return**，让死亡分支照常跑。（原 block20 的 `guardCount() === 0` 断言只数 `state !== 'dead'`，所以一直是绿的、掩盖了这个 bug；已补断言 `list.filter(e => e.guard).length === 0`。）
- **通用教训**：任何「条件满足就 `takeDamage(…99999); return;`」的写法，都要确认自己不会在**已经 dead 之后**继续每帧进这个分支——否则死亡消散计时被跳过。

第 33 块要点（平衡性改版，2026-10-22，v=37）：
- **五项需求**：①夜行记忆一夜一章按顺序解锁（走完/读完上一夜才翻开，`chapterUnlocked(i)`，未解锁点击只弹 toast）；②永夜火种取消三级上限（`maxStack: Infinity`，仅「双拍/不灭」两张机制卡仍 1 层）且每层数值上调（利爪 6→8%、回春 0.12→0.15、吸血 3→4% 等，`boons.js`）；③防御改减法公式 `mitigate = max(1, raw − armor)`（`stats.js`，敌人侧的举盾/光环减伤仍走乘法不变）；④受击无敌帧 `IFRAME` 0.55→0.9 秒（`main.js`），受击期间 `frog.mesh` 按帧闪烁；⑤第三关 `LEVEL_3.arena: 19`（一/二关 15）—— `scene.js` 新增 `setArena(r)` 重摆边界圈/石头/草/萤火虫，`main.js` 的 `ARENA_R` 改 let 并随 `setLevel` 同步（`combatCtx.arenaRadius` 用 getter、`enemies.setArenaRadius(r)`），`spawnRadius 17.4 / minSpawnGap 2.4`，`gapScale: 1.35` 让 buildSpawns 段内间隔放慢 35%。
- **测试**：`.tmp-arena-probe.js`（场地半径切换 4 项）+ boon/stats/rogue/story 等断言同步更新；block32 CDP 加了「未解锁夜点不开」断言（60 项）。
- **注意**：boonStackText/火种面板层数文案对 Infinity 显示 ∞；`boonStacks` 只认有限正数（防脏值把叠加循环跑飞）。

第 32 块要点（主线《笑不出来的那一夜》，2026-10-22，v=36）：
- **用户需求**：做一条贯穿所有关卡的长剧情，可以出现辅助人物，对话长一些、有趣一些，配上现在国内奶蛙的梗。
  经确认：18 章全写、局内只放 3 章（现有 3 关），其余 15 章进「夜行记忆」当档案读；梗拉满、最后一章收正；
  三结局按三次选择累计。**定案「一夜对应一关」**——以后每加一关就接上一夜。
- **数据**：`js/story.js` 纯数据 + 纯函数。18 夜（64 拍、正文约 2.3 万字），前 3 夜
  `levelId:1/2/3, atRound:2`（各关第 2 回合结束后撞上），4~18 夜 `levelId:null`。
  配角：蛙爷（秋天的第一杯奶茶）/ 阿速（蛙了么骑手）/ 阿井（井底躺平哲学家）/ 小满（画错奶蛙的画师），
  反派「空白」（收走没被记住的东西）。奶蛙梗：齁齁齁、AI 画错、生母弃我、黄色三幻神、高校立牌、
  电子木鱼、躺平上岸、内卷、抽象。
- **印记与结局**：s01/s02/s03 各有一拍 3 个选项带 `mark:'laughter'|'name'|'memory'`，
  选了写 `profile.story.marks`（同局去重靠 `storyMarked` Set，`startPlay` 时清空）。
  `storyEndingKey(marks)`：某项 ≥2 → 对应结局；三项各 1 或总数 0 → 隐藏结局 `none`。
  s18（终章）带 `endings` 表，最后一拍 reply 的 `say` 是占位符 `'__ENDING__'`；
  `resolveStoryChapter()` 在播之前把结局按档案挂到 `ev.__ending`，`finishTalk()` 见到就把结局
  四段追加进对话记录 + 写 `profile.story.ending`。改结局文案只动 `STORY_ENDINGS`。
- **调度**：`handleRoundClear` 的 `runEvent()` **第 0 步**查 `storyChapterAt(curLevelId, roundNo, seen)`，
  有就 `playStoryChapter()`（markStorySeen + markStoryRead + openEvent + toast），主线**不占随机池**、
  不进 seenEvents。`storyChapterAt` 返回「最早的未看过且 atRound<=round」的夜，所以读档跳回合也会补播。
  章节对象结构与对话式事件完全一致（story/talk/replies），渲染直接复用事件卡，只多三个能力：
  reply `mark`（写印记）、reply `as`（气泡署名改成「奶蛙」）、beat/endings（见上）。
- **档案**：`profile.story = { seen, read, marks, ending }`。**seen=局内亲历（调度只看它），
  read=面板读过（只影响面板标记）**——分开记，读档案不会让局内那夜消失。
- **UI**：主菜单「夜行记忆」`#storyScr`（卷名/进度条/三枚印记/18 条目：亲历=绿标、已读/档案=灰）+
  阅读器 `#storyRead`（整章一次铺开：旁白块 + 气泡，第一条回话当正文、其余收进 `sr-alt` 小字
  「若当时换一种说法」；终章末尾按档案结局追加四段 + 结局块）。样式在 style.css 尾部 `.st-*` / `.sr-*`。
- **成就**：`story_first`（局内撞见第一夜）/ `story_all`（阅读器读满 18 夜）/ `story_finish`（读到终章结局）。
  成就总数 32 → **35**（block18 测试断言已同步）。
- **调试钩子**：`__game.story`——`at(levelId,round)`（调度结果）/ `play(id)`（直接播）/ `progress` /
  `endingKey()` / `mark(kind)` / `clearMarks()` / `forget()`（清亲历）/ `endingShown`（结果页文本）。
- **测试**：`.tmp-story-test.mjs`（75 项，纯 Node）+ `.tmp-block32-cdp.js`（58 项，真浏览器：
  局内第 2 回合真弹 s01 且优先于随机奇遇 / 印记写档案 / 终章两个结局真跑 / 面板与阅读器全流程）。
  **测试坑**：skipRound 之后要等 2.6s 收尾倒计时再跳下一回合，循环跳直到 eventCard 弹出；
  终章钩子是 `__game.story.endingShown` 不是 `__game.event.endingShown`。
- **加新关卡接剧情只改数据**：把对应夜的 `levelId` 改成新关 id、`atRound` 填该关第几回合，完事。

第 31 块要点（夜行奇遇大扩容，2026-10-22，v=35）：
- **用户需求**：随机事件再加几十种、要有趣、随机性强、对话加长到一二百字。
- **规模**：`js/eventsExtra.js` 新增 42 条（40 随机 + 2 条第三关专属挪回）+ 3 条 chainOnly 连锁。
  `events.js` 里 `CORE_EVENTS`（原 57 条）+ `EXTRA_EVENTS` 组装成 `EVENTS`（99），`ALL_EVENTS` = 112，
  选项总数 355+，talk 型 22 个 / 46 拍 / 128 句回话，新文案 say 平均 100 字、close 平均 103 字。
- **顺带修了个真 bug**：第 29 块把 bellRinger / ashChild 写进了 `CHAIN_EVENTS`，
  而 `pickEvent` 只从 `EVENTS` 抽 —— 两条第三关专属奇遇**从来没人遇到过**。已挪进 EXTRA_EVENTS
  （文本顺便加长了）。
- **结构**：`eventsExtra.js` 只放数据，抽签/文案工具仍在 `events.js`；`events.js` 顶部 import 它
  （单向依赖，无循环）。文件太大不好维护是拆分的唯一原因。
- **六个新取向**（和原有 57 条错开）：骷髅的怪日常 8 / 路边的人 8 / 不对劲的东西 8 / 赌一把 8 /
  相处与奇景 5 / 处境事件 3（`richMan` cond gold>=40、`emptyPocket` gold<6、`lastBreath` hp<=2.5）。
- **随机性**：十余个 roll 分支（55/45、60/40、45% 赌局）；3 条新连锁
  skullLost→littleSpear（2 回合）/ doorInField→doorAgain（2）/ memoryPawn→memoryBack（3）。
- **调试钩子**：`__game.event.pick(n)`（按真实规则连抽 n 次，内部维护 recent 模拟「3 次不重复」）、
  `__game.event.pickAt(levelId, n)`（指定关卡抽，验第三关专属）、既有 `trigger/choose/next/isResultOpen`。
- **测试**：新 `.tmp-eventui-test.js`（37 项：事件库 112 / talk 22 / 长文案排版不溢出不超一屏 /
  多拍对话 beat 推进 / 400 次抽 87 种 / 条件事件按金币生命出现 / 图鉴 112 条全渲染）。
  计数断言同步：event-test（99/112/13、talk≥18、拍≥40）、block18 奇遇 112、talk-skill（99/13/112）、
  rarity 99。**测试坑：教程询问弹窗会盖住事件卡（清 localStorage 后必弹），进关先点 `#tutNo`；
  带代价的按钮在渲染那一刻就按当时金币置灰，`setCoins` 要放在 `trigger` 之前。**

第 30 块要点（管理员模式，2026-10-22，v=34；选回合是第 34 块 v=38 补的）：
- **入口**：设置面板最下面一行「管理员模式」（`SET_ROWS` 里 `type:'admin'`），点「开启」弹
  `#adminAsk` 密码框（`.md-input`，inputmode numeric），密码 `615265` 写在 `main.js` 的 `ADMIN_CODE`。
  输错只亮 `#adminErr` + 清空输入；输对 → `applyAdmin(true)`。**关闭不需要密码**（关是安全方向）。
- **状态**：存在 `profile.settings.admin`（`DEFAULT_SETTINGS` 加了布尔键，靠 `setSetting` 白名单自动持久化），
  `main.js` 的 `let adminOn` 跟着它走；`applyAdmin()` 是唯一开关入口（debug 钩子 `__game.setAdmin`、
  `__game.ui.set('admin', v)` 都走它）。
- **无限金币**：不做「哪里能买」的特判 —— `addCoins` 与买完之后的扣款都把 `coins` 钉回 `ADMIN_GOLD=999999`，
  于是商店的 `coins < price`、事件的 `canAfford` 全部自动通过；`renderGold()` 在 admin 时显示 `∞`。
  开之前先记 `coinsBeforeAdmin`，关掉时还回去（不会把 99 万留在正常局里）。
- **无限骨币**：`campfire.js` 的 `campBuy(id, free = false)` 加了个 free 参数（不查余额、不 `addBones(-price)`），
  `main.js` 的篝火购买和 `__game.camp.buy` 都传 `adminOn`；`renderCampfire/renderCampBadge` 在 admin 时
  显示 `∞`、`have = Infinity`（价格永不 `poor`）。
- **跳过本回合**：`#waveHud` 里加 `#skipRound`（`.skip-round`，`pointer-events:auto` 因为父级是 `none`），
  只在 `adminOn && gameState==='playing'` 时挂 `.on`（`renderSkipBtn()` 在主循环每帧调，带缓存不重排）。
  点了做两件事：`enemies.killAll()` + `level.skipRound()`。
  - `enemies.killAll()`（enemy.js 新增）：把每只活怪直接标 dead、`deathT = cfg.deathTime`、`root.visible=false`，
    下一帧回收循环收走 —— **不调 onDeath**，所以不掉金币、不算击杀、不写图鉴、不触发成就。
  - `wave.js` 的 `skipRound()`：`spawning` 阶段把 `spawnIdx` 推到 `spawns.length`（若还没展开就给个空表），
    `gap` 阶段直接把 `gapT` 填满。**不另开路径** —— 下一帧 update 走普通清场判定，
    三选一/商店/事件/通关结算与正常打完完全一致；最后一回合跳过就是直接通关。
  - 副作用：跳过只划掉「还没出场的怪」，场上那几只靠 `killAll` 清，两者必须一起调（单测里验证过这个语义）。
- **选择回合（第 34 块，v=38）**：`#waveHud` 里加 `#pickRound` + `#roundPick` 面板（`.rp-grid` 5 列格子），
  显隐跟跳过按钮同一条件（`renderSkipBtn` 里顺带调 `renderPickRound`）。每次展开按当前关卡重画
  `buildRoundPicker()`（1..`level.totals.rounds`，当前回合 `.cur` 高亮）。点格子 → `jumpToRound(n)`：
  `enemies.killAll()` + 清空 `laterQueue`（过期的连锁事件作废，调试跳转不带出旧事件卡）+
  `level.startAt(n)`（走存档续玩那条普通路径，onRound/存档快照/结算全部一致）。越界夹回 [1, 总回合]。
  调试钩子 `__game.jumpRound(n)`（非管理员或非 playing 时 no-op）。测试 `.tmp-block34-cdp.js`（28 项）。
  **测试坑**：全程跳回合从没清过场 → 第一次清场会触发首武器卡（`grantRingThen`）+ 武器教程，
  把 gameState 堵在 'weapon'/'wtut' —— 测试里要先点 `#wcOk` + `#wtSkip`。
- **测试**：新 `.tmp-admin-test.mjs`（28 项：设置键 / 免费点火 / skipRound 的 spawning·gap·idle·通关四种走向）
  + 新 `.tmp-block30-cdp.js`（50 项：密码错对 / ∞ 显示 / 篝火免费 / 跳两回合 / 商店不扣钱 / 关掉回归）。
  旧断言只动了一处：`.tmp-settings-test.js` 的设置行 6 → 7（多了管理员模式那一行）。

第 29 块要点（第三关 · 焦土钟楼 + 三只新怪 + 三件新装备，2026-10-22，v=33）：
- **关卡**：`wave.js` 加 `LEVEL_3`（20 回合 **363 只**，scale hp 0.24 / dmg 0.14 / speed 0.035，
  R20 ×5.56 血 / ×3.66 伤；武器仍第 4 回合）。`LEVELS_BY_ID` 注册，`main.js` 的 `LEVELS` 加第三条
  （解锁沿用「通关上一关」的通用逻辑，不用改代码）。theme `ash`。
- **场景**：`scene.js` 第三主题 `ash`（暗红余烬 + 铁灰、边圈残火、火星群）+ `makeAshTexture()`
  程序化焦土地面（复用枯土那套画法，配色走炭红）。
- **三只新怪**（`enemy.js`，全部复用现有 glb + tint 重涂，遵守资产铁律）：
  - `charger` 骨骑冲锋兵（warrior ×1.15，铁灰）：`charge` 状态机 attack(蓄力 0.85s) → dash(9 速 ×0.62s)
    → recover(1.1s)。蓄力时 `showChargeLine(e)` 在玩家方向铺一条长 6.5 宽 1.15 的红色预警线
    （每条怪一条 mesh，die/清理时 `disposeChargeLine`）。撞人只结算一次（`chargeHitDone`）。
    **不设 ringColor**：5.4 的起手距离画成环会把半个战场染红。
  - `shielder` 骸盾兵（warrior + 程序化骨盾 `attachShield`，挂左手骨骼）：`shield{up 1.6, down 1.6, reduce 0.70}`，
    每帧翻计时；举盾 → 不改状态但 `takeDamage` 减伤 70%（和霜牢环的 auraArmor **乘法叠加**，
    上限 0.95），同时近战分支里直接 return（不动、不打人）。
  - `brood` 孵骨巫祝（mage + 短骨杖「骨篮」）：`spell{kind:'brood', count:2, cap:6, radius:1.25}`，
    走巫师通用的「保持距离 + 读条」骨架，`spawnSpell` 里分派到 `spawnBroodlings`：
    数的就是「`summonedBy === 她` 且没死」的存活数，到 cap 就停手。
- **打断 / 击退基础设施**（三件新装备都靠它）：`enemies.knockback(e, fromX, fromZ, dist)`（沿远离来源
  的方向推、贴边界停）与 `enemies.interrupt(e)`（attack/dash → chase，`hitDone=true` 防重复结算，
  `attackCd` 至少 0.9 秒）。观测量：`shieldedCount() / chargingCount() / broodlingCount(parent)`。
- **三件新装备**：
  - `bell` 震钟（relics.js，34 币 / 第 9 回合，3 级）：每 6.0/5.4/4.8 秒 `ringBell`，
    半径 3.2/3.4/3.6 内全部吃 0.5/0.75/1.0 伤（quiet 结算）+ `interrupt` + `knockback` 1.2/1.4/1.6。
    音效用 `aegis`（素材包没有第二口钟）。
  - `thorns` 棘甲（relics.js，30 币 / 第 7 回合，3 级）：`main.js hurtPlayer` 里调 `relics.thornsHit(pos)`，
    对 2.2/2.4/2.6 内所有怪各结算 0.6/0.9/1.2 伤；脚下有一圈暗红棘环（触发时闪一下）。
  - `quake` 震剑（swordKinds.js 第 6 种 + 自绘 `assets/weapons/icon-quake.svg`）：`weapon.js applyKind`
    里 35% 概率 `interrupt` + `knockback(1.4)`，方向取 `_playerAt`（update 每帧记的主角位置）。
  - 商店三件：`buyBell` 34 / `buyThorns` 30 / `buyQuake` 36（剑类 needWeapon）。
- **奇遇/成就/图鉴**：`events.js` 加两条第三关专属（`bellRinger`、`ashChild`），靠 ctx 新增的
  `levelId` 筛（`main.js pickEvent` 的 ctx 已带上 `curLevelId`）。成就 +3（charger_30 / shielder_30 / brood_10，
  在 `onDeath` 里按 `codexCount` 判）。`codex.js` 的 `enemyDesc` 加 charge/shield/brood 三条文案。
- **测试**：新 `.tmp-level3-test.mjs`（71 项）+ 新 `.tmp-block29-cdp.js`（38 项，A 解锁 / B 进关 /
  C 骨骑蓄力-冲锋-撞人-僵直 / D 盾减伤 3 vs 10 / E 孵兵与上限 / F 震钟打断击退 / G 棘甲反伤 / H 震剑与图鉴）。
  受影响旧断言：block18（图鉴 10/6/5、奇遇 69、成就 32）、econ（6 种剑）、event（69）、talk-skill（69）。
- **测试坑**：CDP 里买过震钟之后它会**自动按 6 秒周期敲**，手动 `ringBell` 的怪可能已被震出半径 →
  测「打断」要把怪放在 1.6 格内，并在**同一次 evaluate 里**量距离→敲钟→再量（帧间抖动会让断言飘）。
  `__game.swordKinds` 是**数组** `[{kind,n}]`，不是对象。

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
| `main.js` (~5400 行)                                                                          | 主循环 + 所有 UI 面板（标题/选关/种子/属性/记录/设置/图鉴/商店/升级/事件/背包/结算/教程/公告/礼包/读取存档）+ 各系统接线 + `__game` 钩子。**改之前先 grep 定位** |
| `wave.js`                                                                                    | 20 回合编排、`roundScale`、**难度 DIFFS**、`startAt`（读档）、升级点/商店点                                                    |
| `stats.js`                                                                                   | 通用属性引擎（`createStats(defs)`），主角 14 项 / 武器 11 项两套实例；`dumpMods/loadMods`（存档）                                  |
| `enemy.js`                                                                                   | 13 只怪（**第 52 块起一只一个 glb**：第一关 KayKit 骷髅 4 只 + Quaternius 独立模型 9 只）、`CLIP_FAMILIES` 动作家族翻译 + `clipOverrides`、`findBone`（洗点号）、`footY`/`glow`/配件（盾弓杖）、红圈落箭、法术地阵（hex/burn）、光环/卫队/石刺 |
| `weapon.js`                                                                                  | 环剑、5 种元素剑、`grant/addSword/restore`                                                                         |
| `turret.js` / `relics.js`                                                                    | 弩炮台（上限 3）、地刺/霜环（各 3 级），都有 `restore`                                                                        |
| `upgrade.js`                                                                                 | 28 张升级卡（含 rarity 0~4）                                                                                      |
| `shop.js`                                                                                    | 18 件货、按品质加权摆 4 件、`itemLocked`                                                                              |
| `events.js`                                                                                  | 57 事件 + 10 连锁（对话/条件/取舍）                                                                                    |
| `campfire.js`                                                                                | 篝火/骨币（第 19 块建，第 27 块无限级）：`bonesFor`（回合/击杀/通关/金币/关卡）、九簇×无限级**线性**阶梯价（×(1+0.35×level)）、`campApply`                                   |
| `boons.js`                                                                                   | 永夜火种（第 23 块，第 27 块加首通门槛）：16 张永久卡 + 层数上限 + 品质抽签（吃幸运）+ `boonPending` 待领次数                                                |
| `curses.js`                                                                                  | 夜行诅咒（第 21 块）：六条自选 debuff、倍率叠加、`applyRunCurses` 落账/撤销                                                       |
| `seed.js`                                                                                    | 种子与每日挑战（第 22 块）：`hashStr`/`makeRng`/`dailySeed`/`pickDailyCurses`/每日战绩存档                                   |
| `rarity.js`                                                                                  | 五档品质唯一真相源（颜色/mul/luck）                                                                                     |
| `profile.js`                                                                                 | **本机档案**：settings / stats / codex / ach / bones / camp / boons / story / notice / gifts，键 `naiwa_rouge_profile_v1`；管理员沙盒靠 `setSaveSuppressed` 关掉落盘 |
| `runSave.js`                                                                                 | 读取存档（第 38 块：多存档列表），键 `naiwa_rouge_runs_v1`（数组，按 uid upsert；每回合开始写 + pagehide 补一次；通关选完永夜火种才清） |
| `gift.js`                                                                                    | 礼包兑换（第 44 块）：`GIFT_TABLE` 只存 16 位哈希 + 骨币，`normalizeCode`/`codeHash`/`lookupGift`/`giftByHash`；明文码在 gitignore 的 `gift-codes.local.md` |
| `voicepack.js`                                                                               | 音效包（第 46 块）：`FROG_FILES` 4 段奶蛙素材（含试听区间）、`FROG_SFX` 8 个位置的 `offset/dur/vol/rate/jitter`、`PACK_LIST`；**改裁切只改这张表** |
| `assets/codex/*.webp` | 图鉴怪物缩略图（第 51 块）：13 张 240×288，`node .tmp-codex-shots.js` 生成；**换模型/皮肤后要重跑**（第 52 块换模型就重出过一次） |
| `assets/monsters/*.glb` | 13 个怪物模型（第 52 块去重后一只一个）：`skeleton-{minion,warrior,rogue,mage}` = KayKit；`tribal/demon/mushroom-king/bull/orc/mushnub-evolved/ghost/wolf/wizard` = Quaternius。共 5.0MB，**boot 时全量预载**；换/加模型要同步 `.tmp-block52-test.mjs` |
| `.tmp-mob-calib.js` | 怪物身高标定（第 52 块）：正交相机 + `readPixels` 实测 `sourceHeight` / `footY`，输出 PNG + 数字；换模型先跑它 |
| `.tmp-mob-lineup.js` | 9 只新怪并排对比图 + 兽人盾牌特写（验收用，输出 `%TEMP%/naiwa-mob-lineup/`） |
| `arrowRain.js`                                                                               | 箭雨（第 47 块）：单技能 8s CD、自动找最近怪标警告圈落群箭，伤害走 wstats（剑油/磨剑石可强化）；`unlock/reset/restore/snapshot`                    |
| `statView.js`                                                                                | 属性页 3D 展台（第 50 块）：独立 canvas + renderer，拖动旋转/定时蹦跳拍掌；**与主场景隔离，只有属性页开着才 update**                              |
| `eventsExtra.js`                                                                             | 事件扩容（第 31 块）：42 条新事件 + 3 条连锁，与 `events.js` 合并成 112 条                                                      |
| `story.js`                                                                                   | 主线《笑不出来的那一夜》（第 32 块）：18 夜 2.3 万字；加新关只改对应夜的 `levelId` + `atRound`                                          |
| `codex.js`                                                                                   | 图鉴五页签的数据整理（纯渲染数据，无状态）                                                                                      |
| `achievements.js`                                                                            | 26 条成就定义（`{id,name,desc}`）                                                                                 |
| `audio.js`                                                                                   | 程序化音效 + BGM；`setSfxVolume/setMusicVolume`（与静音独立）                                                           |
| `joystick.js`                                                                                | 浮动摇杆；`setOpts({radius, hand})` 运行时改大小/左右手                                                                  |
| `scene.js` `frog.js` `fx.js` `gold.js` `skills.js` `input.js` `rangeRing.js` `swordKinds.js` | 场景/角色/特效/金币/技能/输入/范围环/剑种                                                                                   |

---

## 4. 铁律（违反会返工）

1. **全中文**：注释、文案、提交信息、README 都要中文。用户明确要求过。
2. **有疑问先问，不要边猜边写**。
3. **资产优先 GitHub 现成 CC0**（2026-10-21 用户定的铁律）：需要 3D 模型、贴图、UI 形状贴图时，**先上 GitHub 找现成的**（KayKit / Quaternius 等包已验证可用），不要手写程序化几何凑合；程序化外观只作加载失败的兜底。已入库：`assets/props/`（第 24 块）。
4. **数值改动必须跑回归**：Node 5 套 + 相关 CDP 套（见 §6）。
5. **属性公式**：`(base + flat) × (1 + Σpct)`；`base = 0` 的属性只能用 flat（多乘会永远 0）。
6. **两套属性表**：主角 `STAT_DEFS`（14 项）、武器 `WEAPON_STAT_DEFS`（11 项）。剑击只读 `wstats`，不读主角。
7. **品质是抽签权重**，不是先摇档再挑卡（公式：`(w0+gw×(回合-1)) × rarity.mul × (1+luck×系数)`）。
8. **`handleRoundClear` 只允许存在一份**（同名 function 重复声明会静默覆盖，曾导致商店不弹）。
9. **一件武器只教一次**：`localStorage['naiwa_rouge_wtut_v1']`；`gameState='wtut'` 时能走能放技能但不推进波次。
10. **README.md 必须与实况同步**（用户规则）。
11. **测试用的 `?debug=1` 默认不落存档**（要落档加 `&keepsave=1`）。
12. **新内容「先推送再交给用户测」**（2026-10-22 用户定的铁律）：功能做完 + 本地回归绿 → **立刻 commit & push**，把线上地址和「这轮改了什么 / 怎么试」一起交给用户，让他先上手给反馈；不要憋着等自己把一切都打磨完才推送。用户的反馈比自测更早、更准。

13. **发版必须同时 bump 两处版本号**（2026-10-22 的教训，v=52 翻过车）：除了 `index.html` 的 `main.js?v=N` / `style.css?v=N`，**`js/*.js` 里所有相对 import 也都带 `?v=N`**（`import audio from './audio.js?v=53'`）。GitHub Pages 的 `Cache-Control: max-age=600` 只保证 10 分钟，不带版本的模块 import 会命中用户浏览器里的旧缓存——这次就是 `main.js?v=52` 是新的、`audio.js` 还是旧缓存，`audio.setPack is not a function`。发版统一 `sed -i "s|\\.js?v=N|.js?v=N+1|g; s|\\?v=N'|?v=N+1'|g" js/*.js index.html`。语法检查别只查 main.js，改过 import 的文件都要 `node --check`。

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
adminOn() / setAdmin(b) / ADMIN_CODE='615265'                 ← 第 30/38 块（沙盒：不落盘、金币钉 ∞）
jumpToRound(n) / skipRound()                                  ← 第 30 块，**仅 adminOn 时生效**（否则静默 no-op）
gift.{state,open,redeem,list}                                 ← 第 44 块
notice.{show,hide,seenReset}                                  ← 第 45 块（自动弹在 loading 淡完 +700ms）
pack.{state,get,set,unlock,show,yes,no,files,map,preview,reset}   ← 第 46 块（音效包）
arrowRain.{state,unlock,fire,probe}                           ← 第 47 块（probe 含最近怪距离/血量）
buff(stat, flat)                                              ← 第 47 块通用：stats.addMod({src:'dbg:test'})，测试给主角加属性用
seedRecords() / startSeedRun(text)                            ← 第 49 块（种子挑战）
statPage.{show,ready,yaw,rows}                                ← 第 50 块（属性页；rows 是渲染后的数值行）
```

常用：`__game.hurt(99)` 直接结算；`__game.enemies.all().forEach(e=>__game.enemies.takeDamage(e,999))` 清场（**注意：清光会弹三选一，挡住后续操作**）。

---

## 6. 测试

**Node 13 套（1090 项，纯逻辑，秒级）**

```
cd C:/Users/MECHREVO/Desktop/班级网站
node .tmp-stats-test.mjs      # 70  属性引擎
node .tmp-rogue-unit.mjs      # 144 回合/升级/概率（含 roundScale 对拍）
node .tmp-econ-test.mjs       # 78  经济/商店/事件作用域
node .tmp-event-test.mjs      # 105 事件库结构/权衡/连锁/抽取/文案（112 条）
node .tmp-rarity-test.mjs     # 71  品质/幸运
node .tmp-camp-test.mjs       # 99  篝火/骨币（多级 + 阶梯 + 金币折算 + 关卡倍率）
node .tmp-level2-test.mjs     # 65  第二关/三只（第 52 块起各用各的模型）
node .tmp-level3-test.mjs     # 71  第三关/三只新怪/三件新装备/专属奇遇
node .tmp-level4-test.mjs     # 90  第四关/雾魉/跃行尸/缝合师/暖炉/剑阵定案
node .tmp-admin-test.mjs      # 28  管理员模式（设置键/免费点火/skipRound 四种走向）
node .tmp-eventui-test.js     # 37  事件 UI（长文案排版/多拍对话/随机性/条件事件/图鉴）
node .tmp-curse-test.mjs      # 84  诅咒/种子/每日规则
node .tmp-boon-test.mjs       # 146 永夜火种（层数/品质吃幸运/待领次数/克制）
```

**CDP 端到端（39 套约 1280 项，需先起 8124；一次只跑一套，套间跑 `.tmp-cdp-clean.js`）**

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
.tmp-block23-cdp.js     63  金币吸附/无限级篝火/发火种（首通门槛）/火种面板/开局落账/标题页补选/重复通关不发
.tmp-boonui-test.js      9  主菜单「永夜火种」一览面板（空态/层数/卡名）
.tmp-live-block23.js    15  线上专项（篝火 / 火种面板 / 版本号）
.tmp-block29-cdp.js     39  第三关（解锁/焦土/骨骑/骸盾/孵骨/震钟/棘甲/震剑）
.tmp-block30-cdp.js     50  管理员模式（密码/无限钱/跳过回合/关闭回归）
.tmp-block34-cdp.js     28  管理员选回合（面板/点格子跳转/夹回边界/守卫/换关重画）
.tmp-block35-cdp.js     49  第四关（fog 主题/隐身无敌/贴脸显形/落点跳劈/缝合回血/暖炉灼烧）
.tmp-block36-cdp.js     27  相机减晕（死区零位移/收敛到边缘/FOV 缓动与上限/开关/源码护栏/震屏不转镜头）
.tmp-eventui-test.js     37  奇遇扩容（排版/对话/抽签随机性/图鉴 112）
.tmp-curse-ui-test.js   14  诅咒可视化（芯片两行/明细行/开局血量/面板注记）
.tmp-dbg-boot.js           抓启动期异常（改完代码先跑这个，比整套 CDP 快）
```

**第 32 块起新增（⚠️ 老套件在上级目录，新的在 `naiwa-rouge/`）**

```
（上级目录）
.tmp-block32-cdp.js    60  主线剧情（对话流/印记/四结局/夜行记忆面板/成就）
.tmp-dupcheck.mjs          ——（若在）：重复 id 静态检查
（naiwa-rouge/）
.tmp-block41-cdp.js    37  选关分步三页
.tmp-block42-cdp.js    28  主线读秒（回话按钮锁 3s + 倒计时）
.tmp-block44-cdp.js    36  礼包兑换（哈希表/一码一机/已兑列表）
.tmp-block45-cdp.js    49  公告（自动弹/今日不再/强制回看/复制；断言版本号要写成 \d+，别写死）
.tmp-block46-cdp.js    65  音效包（解锁卡/试听/设置切换/8 位置替换）
.tmp-block46b-cdp.js   14  音效包补充（读秒与 packGet z-index 干涉）
.tmp-block47-cdp.js    27  箭雨 + 武器解锁原则（⚠️ jumpRound/skipRound 要 adminOn）
.tmp-block49-cdp.js    23  种子挑战（同种子同关/难度匹配/记录取优/续玩）
.tmp-block50-cdp.js    12  属性页（含「全页零重复 id」通用断言 + 面板内定位点击——新面板抄这个）
.tmp-block51-cdp.js    20  图鉴贴图（13 图解码/lazy/尺寸/其它页签无 thumb）
.tmp-block52-test.mjs 125  13 只怪模型去重（解 glb 头对拍动画名 / 文件在 / 关卡表不断链）— 纯 Node
.tmp-block53-test.mjs  46  第 53 块七条（概率分支数据完整性 + 源码防回退 / 二三关亮度 / 三只尺寸 / 箭雨教程 / 轮播 1.8×）— 纯 Node
.tmp-block53-cdp.js    39  第 53 块真流程（掷骰 16 次看数值 + 金币账 / 第二关亮度 / 模型缩放 / 教程卡 wait:rain）
.tmp-block54-test.mjs  54  第 54 块四条（布袋 10 金币 + 别的火种没被动 / 主菜单两行结构 + 行内 margin 清零 / 改名全链路 / 失败提示只在 !isWin 弹 + 按钮链路 + z-index）— 纯 Node
.tmp-block54-cdp.js    36  第 54 块真 DOM（两按钮同行等高 + 菜单横向居中 / 商店标题与布袋说明 / 倒下 0.9s 自动弹 + 真实骨币 / 下次吧保留结算 / 去商店的落点）
.tmp-block55-test.mjs  89  第 55 块（兑换码大全.txt 20 码逐个重算哈希对 gift.js / 新怪卡 profile.met + onSpawn + 守卫 + 层级 + 唯一 id / 计时白名单 + 确认弹窗挂起 + 开新局归零）— 纯 Node
.tmp-block55-cdp.js    51  第 55 块真流程（⚠️ URL 要带 &meet：首次遇怪 → state=meet → 计时与刷怪全停 → 内容与图鉴一致 → 我明白了继续 → 不重复弹；商店/奇遇/升级/属性卡 1.1s 计时不动；win 后 beginGame 归零）
.tmp-mob-calib.js          怪物身高标定（正交实测 sourceHeight/footY）
.tmp-mob-lineup.js         9 只新怪并排对比 + 盾牌特写（验收图）
.tmp-wtut-title-check.js 4  武器教程卡标题随步骤变化（wtutTitle）
.tmp-codex-shots.js        图鉴缩略图生成器（非测试；换模型/皮肤后重跑，先起 8124）
.tmp-shot45/50.js          视觉截图脚本（390×844 → %TEMP%/naiwa-shot-XX/）
.tmp-block45/46/46b-live.js  线上专项烟测
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
- [x] 第 24 块：道具外观升级（炮台=木箱+长弓+宝珠、地刺=KayKit 尖刺丛，均 CC0）
- [x] 第 32 块：主线剧情《笑不出来的那一夜》十八夜（一夜一关；后 14 关做出来后把 `levelId` 接上即可）
- [x] 第 33 块：平衡性改版（按夜解锁 / 火种无上限 / 防御减法 / 无敌帧 / 第三关大场地）
- [x] 第 34 块：管理员选回合
- [x] 第 35 块：第四关 · 雾堤服务区（雾魉 / 跃行尸 / 缝合师 + 暖炉；主线 s04 已进关）
- [ ] **第 25 块：主菜单 3D 背景**（场景和模型都在，只是没跑 render；奶蛙待机 + 远处骷髅剪影 + 萤火虫）
- [ ] 第五关（主线 s05《一百只蛙的名单》蛙爷，`story.js` 里 `levelId:null` 等接）
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
  
第 25 块：诅咒可视化修补（效果数字上卡面 + 开局横幅 + 面板注记 + 结算点名；管线经验证本来就是通的）。
