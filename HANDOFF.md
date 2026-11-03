# 奶蛙 · 夜行 —— 交接文档

> 新对话从这里开始读，**别翻聊天记录**。要动手只读 §1 铁律 + §2 当前状态 + §3 坑。
> 最后更新 2026-11-03 · 线上 **v=168** · 第 150 块（鸿蒙全屏浮层收窄）。更早的细节查 `git log` / `git show`，本文件不重复。

## 0. 一句话

Three.js r160 的单摇杆幸存者肉鸽《奶蛙 · 夜行》：纯静态站点（无构建、无 CDN、零依赖、无 importmap），GitHub Pages 发布，**手机浏览器兼容是硬约束**。玩家是一只会走路的奶蛙，**十八关 × 20 回合**。

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
9. **发版同时 bump 两处版本号**：`index.html` 与所有 `js/*.js` 的 `?v=N`（本轮 174 处），漏一处 = 本地好线上炸。
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
16. **App 发版三件套**（用户 2026-11-01 定：桌面始终留一份最新的 APK）：
   ① 游戏 `?v=` bump 的同时改 `naiwa-app/android/app/build.gradle` 的 `versionCode / versionName`（只增不减）；
   ② 跑 `cd naiwa-app && npm run apk`；
   ③ 脚本会自动把新包复制成 `C:\Users\MECHREVO\Desktop\奶蛙夜行-v<versionName>.apk` 并删掉桌面上自己那套命名的旧版本（旧前缀「蛙步夜行」也认，改名那次留下的会被顺手清掉）—— **桌面只留最新一版**，别手动改这个名字，否则旧版删不掉。

---

## 2. 当前状态（v=168 · 第 150 块）

### 2.1 第 150 块：鸿蒙「能动了但界面还错位」—— 全屏浮层收窄到 --app-w（v=168）

**真机反馈（2026-11-03）**：鸿蒙用户装 v=163 后「可以移动了，但界面还是错位」。

**根因**：v=163 只收窄了 `#app` / `#touchLayer` 和三个右对齐元素（`#waveHud` / `.name-board` / `#skillBar`），但**所有全屏浮层仍是 `position:fixed; inset:0`** —— 宽度跟着「布局视口」（鸿蒙上比屏幕宽），里面的 `display:flex; justify-content:center` 按布局视口居中，卡片中心跑到屏幕外，标题页 / 弹窗整体偏右、右边被裁。另外布局视口宽于屏幕时 `body` 会出现横向滚动，手指一横滑整页就「错位」。

**改法（`style.css`，第 2336 行后）**：
- 全屏浮层统一 `width/max-width: var(--app-w,100vw)`：`.attr-panel / .result / #failTip / .upgrade / #loading / .title-scr / .tt-sub-scr / .modal / .wcard / .bag-panel / .event-card / .shop / .story-read / #noticeOv / #promoOv / .pack-get / #hurtFx`。
- 浮层内的卡片统一 `max-width:100%` —— 它们写着 `92vw` / `min(92vw,430px)`，在宽视口下会算出比屏幕还宽的尺寸。
- `html,body{max-width:100%;overflow-x:hidden}` 禁掉横向滚动。
- **正常机型 `--app-w` 就等于 `100vw`，这三条零变化**；只有视口被算宽的机型才会生效。

**未动**：`MainActivity.java` 里那套 `setUseWideViewPort(false)` 等原生设置保持原样（真机上证明能让摇杆恢复，但没能阻止布局视口偏宽）。

**若这一版仍错位**：下一步上「整页 zoom / transform 缩放」（按 `screen.width / 布局视口宽` 把整页缩回屏幕），但会牵动 canvas 与触摸坐标，需要真机截图确认后再动。

**发版**：`?v=167` → **168**（174 处）；`build.gradle` → `versionCode 168 / "1.0.168"`；APK `dist/naiwa-nightwalk-1.0.168.apk`（14.2 MB），桌面副本 `奶蛙夜行-v1.0.168.apk`。
**回归**：75 套全绿（CSS 改动不影响任何 Node 断言）。

### 2.2 第 149 块：补上漏挡的自动弹点 —— 宣传有礼真的不再弹（v=167）

**用户实测反馈（2026-11-02）**：「关闭更新日志之后，宣传有礼还是会弹」。

**根因**：宣传有礼有**两个**自动弹入口，v=166 只挡住了其中一个 ——
- `closeSignin()`（`main.js` 约 8576 行）：**今天没签** → 弹签到 → 关签到 → 350ms 后弹宣传。这条挡了。
- `afterNoticeChain()`（约 8641 行）：**今天已签** → 直接 `showPromo(false, true)`。这条**漏了**。玩家今天签过（或签到链走另一分支）时，关掉公告就会立刻看到宣传弹窗。

**修法**：`afterNoticeChain()` 里改成 `if (PROMO_ON && !promoOv.classList.contains('on')) showPromo(false, true);`。`PROMO_ON` 仍是唯一开关，两处自动弹点现在都在它下面。

**新增守卫**（`.tmp-block57-test.mjs`，116 项）：遍历 `main.js` 里所有 `showPromo(false` 调用点，逐个检查**前 320 字符内必须出现 `PROMO_ON`** —— 以后再加自动弹点，没包开关就会立刻红。同时把「公告关闭 → 链上宣传有礼」那条正则更新成新写法（链路还在，只是被挡住）。

**发版**：`?v=166` → **167**（174 处）；`build.gradle` → `versionCode 167 / "1.0.167"`；APK `dist/naiwa-nightwalk-1.0.167.apk`（14.2 MB），桌面副本 `奶蛙夜行-v1.0.167.apk`。
**回归**：75 套全绿。

### 2.3 第 148 块：「宣传有礼」整体下线，代码保留（v=166）

用户 2026-11-02 定：宣传有礼弹窗也完全删掉 —— **采用「不生效、代码保留」**。

- `index.html`：主菜单「据点」里的 `#btnPromo` 按钮删除（只留一段注释说明怎么恢复）。
- `main.js`：新增唯一开关 `const PROMO_ON = false;`（在 `PROMO_VER` 上方）。
  - `btnPromo` 绑定改成判空：按钮没了也不会在 `getElementById` 上抛错。
  - 签到链尾部的 `showPromo(false, true)` 包进 `if (PROMO_ON) { … }`，公告 → 签到之后就停，不再弹宣传。
  - `showPromo` / `closePromo` / `PROMO_VER` / `PROMO_KEY` / 艺术字特效 / `#promoOv` 整块 DOM **原样保留**。
- **恢复方式**：`PROMO_ON` 改回 `true`，并把 `#btnPromo` 按钮加回据点面板（`bp-it promo` 类），其余不用动。
- 第 147 块那句「宣传有礼里的 QQ 行没动」到此失效 —— 整个弹层已不会再出现在玩家面前。

**发版**：`?v=165` → **166**（174 处）；`build.gradle` → `versionCode 166 / "1.0.166"`；APK `dist/naiwa-nightwalk-1.0.166.apk`（14.2 MB），桌面副本 `奶蛙夜行-v1.0.166.apk`。
**回归**：75 套全绿。`.tmp-block57-test.mjs` 把「入口按钮 / bp-it promo 样式」两条改成「入口已移除 + DOM 保留 + PROMO_ON = false」；`.tmp-block106-test.mjs` 的据点面板入口清单从 8 个改成 7 个（移除 `btnPromo`）。

### 2.4 第 147 块：公告正文改成「每次更新的内容」（v=165）

用户 2026-11-02 定：公告的全部内容删掉，**QQ 号 3829845261 / QQ 群 1132440548 / 本站网址三处联系方式全部移除**，正文只写每次更新了什么。

**HTML**（`index.html` 的 `#noticeOv`）：标题 `📢 公告` → `📢 更新日志`；正文整段换成版本条目 —— `<div class="nt-rel">` + `<div class="nt-ver">版本号</div>` + 若干 `<p class="nb-p">`，新→旧排列（1.0.165 最新 / 1.0.162 / 1.0.160），末尾保留一条存档提示（不属于联系方式）。三行 `.cp-row` + 三个 `.notice-copy` 全删。
**CSS**：新增 `.notice-bd .nt-rel`（虚线下分隔）与 `.notice-bd .nt-ver`（小号亮绿色版本号）。`.cp-row` 等保留 —— 宣传有礼还在用。
**main.js**：`NOTICE_VER '3'` → `'4'`（改内容必须 +1，今天勾过「不再弹出」的人才会重新看到）；删掉公告弹窗上的 `.notice-copy` 事件委托（正文已无可复制内容），`copyText()` 保留给宣传有礼。
**说明**：宣传有礼（`#promoOv`）里的「联系本人」QQ 行**这次没动**（用户只点名公告）。若以后要一起清，把 `.cp-row` 三行同时删掉并把 `PROMO_VER` +1。

**发版**：`?v=164` → **165**（174 处）；`build.gradle` → `versionCode 165 / "1.0.165"`；APK `dist/naiwa-nightwalk-1.0.165.apk`（14.2 MB），桌面副本 `奶蛙夜行-v1.0.165.apk`。
**回归**：75 套全绿。`.tmp-block102-test.mjs` 整篇按新契约重写（25 项）：公告无 QQ / 群 / 网址 / data-copy、标题与更新日志结构、`NOTICE_VER = 4`、公告复制委托已删而宣传保留、样式与版本号统一。

### 2.5 第 146 块：防秒护栏 —— 单次受击最多扣 35% 生命上限（v=164）

用户 2026-11-02 反馈「第十三关被秒了」，选方案「加护栏」。

**结论**：0.9 秒无敌帧（`main.js` 的 `IFRAME`）只挡得住同帧多段伤害，能一下见底的都是**单下过重** —— 后期近战随回合放大（`scale.damage 0.20` 曲线）× 本关 `dmgMul`、蛮牛冲锋、再叠诅咒 / 挑战的受伤加成 / 曝光系。

**改法**：`hurtPlayer()` 里把 `raw` 外面套一层
`Math.min(Math.max(1, stats.get('maxHp') * 0.35), amount * (1+runCurseDmg) * (1+boxCurseDmg) * (1+chalDmgTaken) * lightMul)`。
- 夹在 `raw` 上就够：后面 `stats.damage()` → `mitigate()` 只会再减、不会加。
- `Math.max(1, …)` 防止血上限极低时变成「打不死」。
- 场地真伤（`damageTrue`）与电路伤害同样吃这一夹（它们本来就绕过无敌帧，更需要）。
- **没有改第十三关任何数值**（`hpMul 1.60 / dmgMul 1.95` 原样），护栏是全局的。

**发版**：`?v=163` → **164**（174 处）；`build.gradle` → `versionCode 164 / "1.0.164"`；APK `dist/naiwa-nightwalk-1.0.164.apk`（14.2 MB），桌面副本 `奶蛙夜行-v1.0.164.apk`。
**回归**：75 套全绿。新增 `.tmp-block146-test.mjs`（11 项：夹取写法 / 顺序 / 数值验算 / 13 关数值未动）。`.tmp-block76-test.mjs` 与 `.tmp-block122-test.mjs` 的 raw 断言改为「Math.min 套在外层、里面仍是原乘式」。

### 2.6 第 145 块：鸿蒙 / 荣耀手机上整页错位 + 摇杆按不动（v=163）

用户真机反馈（荣耀 + HarmonyOS，1.0.162）：进局内整页被放大、右边缘裁掉，左侧露出一条别的图层，标题被切半截；左半屏按不动，人物不动。**同一台手机浏览器打开网页版完全正常** → 不是游戏 CSS / 逻辑，是 Capacitor WebView 在该系统上把布局视口（viewport）算得比真实屏幕宽，再整体放大。

**A 原生（治根）**：`naiwa-app/android/app/src/main/java/com/luohuayu/naiwa/MainActivity.java` 在 `onCreate` 里关掉 WebView 的宽视口与缩放 —— `setUseWideViewPort(false)` / `setLoadWithOverviewMode(false)` / `setSupportZoom(false)` / `setBuiltInZoomControls(false)` / `setDisplayZoomControls(false)` / `setTextZoom(100)`（防系统字体放大再叠一层）。整段 try/catch，设置失败不阻断启动。

**B 前端兜底**：
- `main.js` 新增 `appW()` / `syncAppWidth()`（与 `appH()` 并列）：取 `innerWidth` 与 `visualViewport.width` 的较小值，只有都超过 `screen.width` 1.15 倍时才信 `screen.width`；写 `:root` 的 `--app-w`，`resize` / `visualViewport.resize` / 转屏都重算。渲染器 `setSize`、相机 `aspect`、投影标签位置改用 `appW()/appH()`。
- `style.css`：`:root` 默认 `--app-w:100vw`；`#app` / `#touchLayer` 宽度按 `--app-w`；右对齐的 `#waveHud` / `.name-board` / `#skillBar` 与居中的 `#hint` 用 `100vw - var(--app-w)` 往左退（正常机型两边相等，退 0）；`html,body` 加 `max-width:100vw; overflow-x:hidden`。
- `joystick.js`：左右半屏判定从 `innerWidth` 改成 `layer.clientWidth`（触摸层实际宽度），否则放大过的页面里「左半屏」边界跑到屏幕外，摇杆看着按不动。

**发版**：`?v=162` → **163**（index 2 处 + 45 个 js 共 174 处）；`build.gradle` → `versionCode 163 / "1.0.163"`；APK `dist/naiwa-nightwalk-1.0.163.apk`（14.2 MB，签名校验过），桌面副本 `奶蛙夜行-v1.0.163.apk`。
**回归**：全量 74 套全绿。`.tmp-block57-test.mjs` 的 4 条源码断言按新实现更新（`--app-h` 默认值同行加 `--app-w`、visualViewport 监听改块写法、转屏回调、渲染器尺寸改用 `appW()/appH()`），另加一条 `appW()` 守卫。
**待用户真机复验**：这个修复是靠「网页版正常」反推 WebView 层，必须荣耀机实测确认；若仍错位，下一步出诊断版（标题页角落实时显示 innerWidth / vv.width / screen.width / dpr）。

### 2.7 第 144 块：改名「奶蛙 · 夜行」+ 换 App 图标（v=162）

用户原话：「图标改成这个，名字改成奶蛙·夜行吧」，随后单发了一张 1536×1536 的图标原图（像素风：奶蛙抱剑，旁边一只骷髅，头顶月亮与星星）。

**改名（游戏内文案 + App 显示名一起换；包名 / 存档内部标识一律不动）**：
- `index.html`：`<title>`、HUD 的 `.hud-title`、公告页与宣传页各一句《奶蛙 · 夜行》、两处 QQ 群标签「奶蛙夜行」。
- `main.js`：加载页轮播第二条、`navigator.share` 的 title；`saveIO.js`：存档文件名 `奶蛙·夜行存档文件-YYYYMMDD-HHMM.txt`、导入失败提示文案。
- **不能动的**：`saveIO.js` 的 `APP = 'naiwa-rouge'`、包名 `com.luohuayu.naiwa`、keystore —— 老存档照样导入，覆盖安装照样保数据。
- App 侧：`capacitor.config.json` 的 `appName`、`strings.xml` 的 `app_name` / `title_activity_main`、`package.json` 描述、桌面副本名（`蛙步夜行-v*.apk` → `奶蛙夜行-v*.apk`，脚本同时清旧前缀）。
- **保留不改**：正文 / 素材出处里的「同作者的音游《蛙步》」（那是另一款作品，不是本作的旧名）。
- 连带改测试断言：`.tmp-block104-test.mjs` ④（文件名与正则）、`.tmp-block78-test.mjs` 七（文件名正则）。

**换图标**：原图存为 `naiwa-app/assets/icon.jpg`，`make-icons.ps1` 重生成 5 个密度 ×（方形 / 圆角 / 自适应前景）+ 11 张 splash，再 `npm run apk`。启动图底色沿用 `#081014`，自适应图标底色仍是 `#0B1B2A`。
**发版**：`?v=161` → **162**（index 2 处 + 45 个 js 共 174 处）；`build.gradle` → `versionCode 162 / "1.0.162"`；APK `dist/naiwa-nightwalk-1.0.162.apk`（14.2 MB，`apksigner verify` 过），桌面副本 `奶蛙夜行-v1.0.162.apk`（旧的 `蛙步夜行-v1.0.161.apk` 已自动删除）。
**回归**：全量 74 套 `.tmp-*-test.mjs` 全绿。

### 2.8 第 143 块：安卓 App 壳（Capacitor，v=161）

用户原话：「如果把目前的版本做成APP……现在做APP版给我」。四个选择由用户拍板：**只要安卓 APK** / **内置离线包**（把网页打进 APK，不连服务器）/ **首装迁移引导** / **包名与签名由我定**。

**工程在 `../naiwa-app`（独立目录，不进本仓库）**：Capacitor 6 + `android/`。
- `sync-web.mjs`：把本仓库的 `index.html / style.css / sw.js / js / lib / assets` 复制成 `www/`（跳过 `.tmp-*` 与 `.git`），只读本仓库、不回写。
- `build-apk.mjs`（`npm run apk`）：串联 `sync-web` → `npx cap sync android` → `android/gradlew.bat assembleRelease` → `apksigner verify`，最后把产物收成 `naiwa-app/dist/naiwa-nightwalk-<versionName>.apk`，**并同步一份到桌面 `C:\Users\MECHREVO\Desktop\奶蛙夜行-v<versionName>.apk`（自动删掉桌面上旧的版本，桌面永远只留最新一版）**；日志里会比对游戏 `?v=` 与 `versionCode`，不一致只警告不中断。
- 包名 `com.luohuayu.naiwa`、应用名「奶蛙 · 夜行」（第 144 块改名）、竖屏锁定（`AndroidManifest` 的 `screenOrientation="portrait"`）、自适应图标底色 `#0B1B2A`。
- 签名：`android/app/naiwa-release.keystore`（alias `naiwa`，口令 `naiwa2026`，RSA2048 / 10000 天）。**包名 + keystore 永久不许换** —— 换了就是另一个 App，老用户覆盖安装会被系统拒绝，等于丢档。

**版本号规则**：`android/app/build.gradle` 的 `versionCode / versionName` 跟游戏 `?v=` 同步（当前 `162 / "1.0.162"`）。**每次发版必须 +1**，否则同一个版本号装不上（Android 只认更大的 versionCode）。
**gradle wrapper** 的 `distributionUrl` 已改走腾讯镜像（`services.gradle.org` 国内直连 10s 超时，第一版就是这么失败的）。

**游戏侧三处改动（本仓库）**：
1. `index.html` 的 SW 注册脚本第一行：`isNativePlatform()` 为真直接 `return`。App 里资源本来就在本地，SW 缓存只会让新版 APK 读到自己上一版的缓存；网页版行为完全不变。
2. `main.js` 新增 `isNativeApp()` / `askAppMigrate()`：首装（`localStorage` 里没有 `naiwa_app_migrate_asked_v1`）在 boot 后 2600ms 弹一次「把网页版的进度搬过来？」；点「去粘贴存档码」→ `showBackup()` + `openSaveCodeAsk()`。点跳过也记已问过，之后随时能在「存档备份」页手动导。
3. `main.js` 接 `@capacitor/app` 的 `backButton`，分级拦截：合成台开着 → 关；面板开着 → `setPanel(false)`；标题页 → `exitApp()`；局内 → 确认弹窗（「保存并退出」= `saveAndExit()`）。

**存档真相（回复用户时的口径）**：网页版与 App 是两套 `localStorage`，**首装一定空白**，迁移靠现有的存档码；App **覆盖安装（同包名同签名）保数据**，**卸载即清空**（`allowBackup="true"` 只是让系统有机会在重装时帮忙恢复，不保证）。
**回归**：全量 74 套 `.tmp-*-test.mjs` 全绿（Node 里没有 `window.Capacitor`，`isNativeApp()` 恒 false，老逻辑零变化）；`?v=160` → **161**（index 2 处 + 45 个 js 共 174 处）。

### 2.9 第 142 块：合成台结果改成大卡片（v=160）

用户原话：「合成台那里，每次合成之后弹窗显示结果，只出一行字太不明显」。

**以前**：结果只写进 `#craftSub`（标题下那行 10.5px 小字），「杰作！XX —— 描述」一长串挤一行；导航 / 手机上基本看不清，也看不出「到底拿到了什么」。

**现在**：`index.html` 在 `#craftList` 与 `#craftFoot` 之间加 `<div class="cr-result" id="craftResult">`，合成后由 `main.js` 的 `showCraftResult(rec)` 画一张大卡：
- 档位标签：杰作 / 合成成功 / 赌输了 / 炸炉（四档各自配色：金 / 绿 / 灰 / 红，`.is-master / .is-normal / .is-junk / .is-accident`）。
- 大号结果名（19px）+ 描述 + 底部「实际拿到什么」：新剑入环 / 法器等级 +1 / 骨币 +N / 废料丢弃；杰作额外写「返还『残片』×1」；炸炉写「全场怪受创，你也掉了 1 点血」。
- 每次合成重画 `.cr-card`，`@keyframes crPop` 自带 0.26s 弹入；`openCraft()` 会把卡片重置为隐藏，下次打开面板不会残留上一次结果。

**改的文件**：`index.html`（+1 行容器）、`style.css`（`.cr-result` / `.cr-card` / 四档配色 / `crPop`）、`js/main.js`（`craftResultEl` 缓存、`showCraftResult()`、`doCraft()` 结果分支合并、`openCraft()` 重置）。
**回归**：全量 74 套 `.tmp-*-test.mjs` 全绿（没有套件引用 craftSub / craftPanel，改动不动数值与存档）；`?v=159` → **160**（index 2 处 + 46 个 js 共 172 处）。
**顺手注意**：`craftSubEl` 保留给两类提示文案（「这一枚残片凑不出配方」「还没有残片」），结果不再走它。

### 2.10 第 141 块：三选一「减冷却」卡实测核查 + 纸立牌/裁纸刀全族修复（v=159）

用户原话：「检验三选一中减少技能cd的，是否真的减了」。用真实系统实例（Node 里造 11 个系统 + 桩 `document`）逐张 apply 后比对 `cdMax`，不是读代码猜。

**实测结论（13 张冷却卡）**
- 11 张真的减：傀儡 40→32 / 箭雨 8→7.2（大档再 7.2→5.6）/ 墨丸 8→7.2 / 拿铁 30→27 / 守夜烛 22→19.5 / 落款 14→12.5 / 环形灯 24→21.5 / 描红 30→27.5 / 装箱 26→23 / 砸地 26→23。
- 2 张**一点没减**：纸立牌 26→26、裁纸刀 30→30（卡片写着「→23.5 / →27」）。

**根因：两族的卡是 `{ stat, flat }`，系统却还在读裸键**
- `js/board.js` / `js/guillotine.js` 的 `applyCard` 读 `card.cd / card.duration / card.width / card.count`（或 `card.cut / range`），而 `upgrade.js` 里的卡早就改成 `{ stat:'cd', flat:2.5 }` 这种写法 → 整族**八张卡全是空卡**（不只是冷却：持续 / 宽度 / 数量 / 切口 / 射程 / 刀口都没生效）。
- 修法：两个 `applyCard` 改成按 `stat` 分派、累加 `flat`（和 ringlight / pencil / crate / hammer 一致）。**别再改回裸键**。
- 老测试 `.tmp-block123` / `.tmp-block124` 原本用裸键喂卡（所以一直是绿的假象），已改成 `{stat,flat}`，并新增「从 `UPGRADES` 里取真实 4 张卡全喂一遍、`bonuses()` 必须有变化」的守卫断言。

**顺带修的显示错（守夜烛 / 落款 10 张卡）**
- `candleChange` / `markChange` 以前写 `meta[c.stat] ? c.stat : 'radius' / 'targets'`，这两族老卡没有 `stat` 字段 → 预览行永远显示「半径 3.2 → 3.2」「目标 1 个 → 1 个」。**实际减了，只是文案错。**
- 现在两种写法都认（裸键 + `{stat,flat}` + `extra`），按「谁的增量非 0」选主条；传说卡（`candleSet` / `markSet`）其余通道追加成「名字 旧 → 新」。`.tmp-block118` §④ 补了冷却卡预览必须写「冷却」且 `to < from` 的断言。

**回归 / 版本**
- 全量 74 套 `.tmp-*-test.mjs` 全绿（含新增 5 条守卫断言）；`?v=158` → **159**（index 2 处 + 45 个 js 文件共 172 处）。
- 临时探针 `.tmp-cd-check.mjs`（真实实例 before/after 打印）留在项目根，改卡池后可重跑；不提交。

### 2.11 第 140 块 · 第二批：成就 121 → 152 / 每日任务池 39 → 63（v=158）

用户原话：「根据目前新增的关卡和法器，技能，怪物，武器，新增一大套成就和每日任务」。

**成就（`js/achievements.js`，+31 条 = 152，档位 22 / 81 / 49，全清 11400 骨币 ≈ 40.7 个金匣，天花板从 32 抬到 45）**

| 组 | 新 id | 口径 |
| --- | --- | --- |
| 战斗 4（t2） | `kills_5000` / `crit_5000` / `dmg_5m` / `sword_20000` | 全走老计数器（`kills` / `crits` / `dmgDealt` / `swordHits`），`prog.k='stat'` |
| 生存 1（t1） | `deaths_100` | `deaths` |
| 构筑 4 | `hammer_casts_100`(t1) / `hammer_run_5`(t1) / `hammer_max`(t2) / `names_30`(t1) | 镇纸锤「砸地」与抢名字牌；累计走 `hammerCasts` / `namesTaken`，单局两条在结算手判 |
| 关卡 5 | `clear_13`(t1) / `clear_14`~`clear_17`(t2) | 结算 `isWin` 里对 `levelCleared(13..17)` |
| 关卡 4 | `levels_12`(t1) / `levels_16`(t2) / `rounds_1000`(t2) / `wins_100`(t2) | 前两条走 `clearCount()`，后两条走 `rounds` / `wins` |
| 关卡 10（t1） | `standee_10` / `camera_10` / `misprint_10` / `proofreader_5` / `danmaku_10` / `moderator_5` / `paper_20` / `frame_10` / `toll_10` / `bronze_5` | `prog.k='enemy'`，读图鉴击倒数，`onDeath` 一行一条 |
| 关卡 2（t2） | `blank_boss_3` / `blank_avatars_50` | BOSS 走 `codexCount('blank')`；残影按 `BLANK_AVATAR_IDS` 八种合计（**不含 `blankMinion` / `blank`**），由 main.js 手判 |
| 局外 1（t2） | `box_500` | `metaShopState().opened` |

**每日任务（`js/dailyQuest.js`，39 → 63 = 简单 27 / 中等 19 / 困难 17）**
- `AGG` 新增 4 个键：`names:'sum'` / `namesRunMax:'max'` / `hammerCasts:'sum'` / `hammerRunMax:'max'`。
- 简单 8：`dq_e_names1` / `dq_e_hammer3` + 六只新怪的 `kT:standee / paper / danmaku / toll / camera / bronze`。
- 中等 8：`dq_m_lv13` / `dq_m_lv15` / `dq_m_names3` / `dq_m_hammer10` / `dq_m_hammer_run` + `kT:misprint / frame / moderator`。
- 困难 8：`dq_h_lv18` / `dq_h_names8` / `dq_h_hammer30` / `dq_h_hammer_run5` / `dq_h_blank` / `dq_h_proof` / `dq_h_round18`（`roundMax 18`）/ `dq_h_kill300`（`killRunMax 300`）。
- 抽签规则没动：常驻 `dq_clear_any` + 简单 2 + 中 1 + 难 1；`avail` 仍只挂箭雨 / 傀儡三条。

**main.js 埋点（新计数器只有两个，其余复用现成设施）**
- `runHammerCasts` / `runNames` 单局计数器：声明在单局变量区，`resetRunState()` 清零。
- 砸地：`skillCtx().hammer.cast` 成功后 `bumpStat('hammerCasts')` + `runHammerCasts++` + `dqPump({ hammerCasts:1, hammerRunMax })`。
- 名字牌：抢回事件里 `bumpStat('namesTaken')` + `runNames++` + `dqPump({ names:1, namesRunMax })`。
- 结算：`dqRun` 加 `namesRunMax` / `hammerRunMax`；`isWin` 分支加 `clear_13~17` 与 `levels_12/16`；`isWin` 之外加 `hammer_max`（`relics.levels().hammer >= 3`）与 `hammer_run_5`。
- 累计 10 条统一挂 `checkCumulativeAchs`（`kills_5000` / `crit_5000` / `dmg_5m` / `sword_20000` / `deaths_100` / `hammer_casts_100` / `names_30` / `rounds_1000` / `wins_100` / `box_500`）。
- 回归：新套件 `.tmp-block140-test.mjs`（131 条断言）；老套件里写死的 121 / 8640 / 39 一并改了（block106 的分类条数 25/12/19/61/14/5/11/5、档位 22/81/49、11400）；全量 70 套绿。

**版本**：`?v=157` → **158**（index.html 两处 + 46 个带版本串的 js）。

### 2.12 第 140 块 · 第一批：首屏加载提速（v=157，用户：「进入网站的加载很慢」，拍板 A + E）

**A —— 加载页不再等第一关的怪物模型（`js/main.js` 的 boot）**
- 以前这里是 `await enemies.preload(levelTypes(LEVEL_1), ...)`：标题页必须等第一关 4 只怪下完（原始约 2.7MB / gzip 约 1MB，国内手机 3~10 秒）。
- 现在非 `?debug=1` 改成 `enemies.preload(..., null, { limit: 2 })` **不 await**：标题页先出来，模型在后台接着下。
- 玩家点「开始」时若还没齐，`beginGame` 里原有的 `ensureLevelAssets(pendingLevelId)` 会补上（续玩 `resumeGame` 同理），不会出现没模型的怪。
- `?debug=1` 例外：仍 `await` 全量预载 —— 自动化测试直接 `__game.setLevel(6)` 切关，等不了异步补载。
- 加载失败统一走 `onModelErr`（红字提示 + `enemyLoadOk = false`，教程自动跳过第 2 步）。

**E —— 加载页说清「现在在干什么」（`index.html` + `style.css` + `js/main.js`）**
- 新增 `.ld-step`（`#ldStep`）一行，随阶段改写：下载游戏代码 → 搭建夜行场地 → 加载奶蛙模型 → 装配夜行装备。
- 进度条不再提前谎报 100%：后面的同步装配段停在 **97%**，真正的 `setProgress(1)` 留到遮罩淡出那一刻（原来 100% 之后画面还要冻一两秒）。
- 装配前 `await new Promise((r) => setTimeout(r, 50))`，让浏览器真画一帧 —— 否则同步装配会连这行字一起吞掉，等于没加。
- 首条轮播语改为「第一次打开要把游戏装到本地，之后再来就快了」。
- 实测口径（gzip 之后，线上 v=156）：76 个 js 模块 ≈ 863KB、`three.module.js` 263KB、主角 `rigged.glb` 703KB 原始、第一关 4 只怪 ≈ 1MB。
- 用户确认「进一次之后就好多了」= SW 的缓存优先（带 `?v=`）正常工作，慢的只是**发版后的第一次**，所以这轮只动首屏，不动缓存层。

**版本 / 回归**
- 全部 `?v=` bump 到 **157**（index.html + 47 个 js）；老套件版本号都是动态从 index.html 读的，`block139` 断言是 `>= 156`，不用改数字。

### 2.13 第 139 块：第十八关「天亮之前」+ 名字被收 + 第 20 件法器「镇纸锤」

设计稿 `DESIGN-LEVEL18.md`（唯一真相源，用户逐条定案）。**这是最后一关**，也是图鉴 / 法器 / 技能 / 卡池最后一次扩张。

**① 场地机制「名字被收」（`js/blank.js` 的 `createBlankSystem`）**
- 前 19 回合的八种残影，每种死后掉一枚**金色名字牌**（`onDeath` 调 `blank.dropPlate(e)`，靠 `cfg.blankMove` 判）。落地 **5.0 秒**后飘走（淡出 1.1 秒），**1.2 格**内走过去就抢回。
- 抢回 1 个 = 名字板亮一格 + **30 金币** + 第 20 回合**封印空白对应的那一招**。同一招只掉一枚，已抢回的不再掉。
- 名字板 UI 在 `index.html`（`#nameBoard` / `#nbGrid` / `#nbCount`），`main.js` 每抢回一格 `renderNameBoard()` 重绘。
- 存档只记已抢回的招名（`blank.serialize()` → `{names:[...]}`），`restore` 会丢掉不认识的键。

**② 八招 / 八只残影 / BOSS「空白」**
- 八招 = 名字板八格：散名 / 盯上你 / 写错一笔 / 收走一样 / 照着我造 / 这里没有东西 / 合上这一页 / 最后一笔；每招一个新模型（图鉴 **37 → 46**）。
- 登场节奏：R2 / R4 / R6 / R8 / R10 / R12 / R14 / R16 各一只，R17~R19 混编；**R20 只刷 `blank` 本体**（`boss:true`，不放任何普通小怪）。
- 招式分「本体版 / 分身版」两套数值（`BLANK_BASE` 每招的 `boss` / `avatar` + `pct`）；所有伤害都按**主角最大生命的百分比**，不吃回合倍率。
- **「收走一样」是固定六项轮转**（ground → skill → weapon → buff → combo → hp），放招时先弹 `stealWarn` 事件 —— 可预判就是它的玩法。
- BOSS 三阶间隔 3.5 / 3.0 / 2.5 秒，上台带 2 只护卫（按剩余未封印的招招残影，全封印后退化成小空白），护卫死了 8 秒补一只，血每掉 1/3 多一只（最多 4 只）。
- 八招全被封印后只剩**通用五式**（g1 近身拍 / g2 扇形字牌 / g3 冲刺 / g4 落点红圈 / g5 延迟白圈），`pickKey` 里 `specials` 为空就走 `GENERIC`。
- `blank.js` **零业务依赖**（只 import three），怪的位置 / 受伤 / 冰冻 / 击退全走注入的 `enemies` 接口；要弹 UI 的事一律 push 进 `takeEvents()`（`name` / `stealWarn` / `minion` 三种事件）。
- 纸墙走 `blank.clampPoint(x, z)`（玩家移动里夹住，不许跨过去）；白斑会把**怪也直接收走**（`takeDamage(e, maxHp*10)`），所以它只能留几秒。

**③ 第 20 件法器「镇纸锤」（`createHammerSystem`，也在 `blank.js`）**
- 被动：每 **6.5 / 5.5 / 4.5** 秒在身前 **2.4 格**砸一下，半径 **2.0**、伤害 **3.2 / 4.4 / 5.6**（吃 `amp.dmg`）、击退 0.8、**破甲 20%（3 秒）**，对空白族 **×1.5**。
- 主动「砸地」= 技能第 15 格（**G** 键）：半径 **4.0**、伤害 = 最大生命 **25%**（至少 8）、钉 **1 秒**，冷却 **26 / 23 / 20**（下限 15）。
- 五件齐：① `skills.js` 的 `hammer`（G、外圈冷却、`visible` 看 `hammer.owned`）；② 5 张卡（`hammerDmg` / `hammerRate` / `hammerRange` / `hammerArmor` / `hammerCd`）+ `weightOf` 的 `hammerOwned` 门 + `hammerChange()`；③ `shop.js` 本体 38 + 买断「加重锤头」20 / 「握柄」24；④ `relics.js` 的 `RELIC_DEFS.hammer` + `levels` / `cds`；⑤ 主循环 CD 缩短循环带上它。
- ⚠️ **`applyCard(h)` 收的是卡片里的 hammer 描述**（`upgrade.js` 传的是 `up.hammer`，不是整张卡）。写成 `up.hammer` 会永远拿到 `undefined`、卡片静默失效 —— 本轮就是这么踩的（block139 逮住）。
- 存档 `hammer.snapshot()` / `restore()`（mods + shop + cd + autoT）；`amp` 不进存档（主循环每帧从法器等级推）。

**④ 数据 / 终章 / 规模**
- `wave.js` 的 `LEVEL_18`（`theme:'blank'` / `arena 20` / 20 回合 / `hpMul 1.86 / dmgMul 2.20` / `blank:{arena, plateLife, pickRadius, coinPerName, totalNames, summon:['blankMinion']}`）+ `main.js` 选关表与 `LEVEL_18` import（**两处都要加**）。
- 关底 `runEvent` 加了终章例外：`storyChapterAt(...)` 命中 s18（`atRound: 20`）就先播剧情再 `runUpgrade`。
- 三条成就（`blank_names` / `blank_flawless` / `hammer_20`，成就 **117 → 121** 含全清改口「十八关皆通」）；骨币倍率 `campfire.js` 的 `levelMul[18] = 6.0`。
- 9 只新怪 9 个新 glb（全部 CC0，`trebeljahr/quaternius-showcase`）：`avatar-parchment / ink / quill / drawer / mirror / eraser / pages / pen` + `blank.glb`；`avatar-paperdoll.glb` 与 `ledger.glb` md5 相同（重复）已删，换成**立式镜子**（`sourceHeight 0.938 / footY -0.469`、**不要**再给 `tiltX`，模型节点自带 −90°）。
- `blankHoming` 是唯一带骨骼的残影（蜘蛛，5 段动画，`animFamily:'spider'`）；其余 8 只是静态道具（`blankAvatar:true` + `blankMove`），图鉴缩略图 `assets/codex/{id}.webp` 走 `.tmp-codex-shots.js` 重出。
- `enemy.js` 分派铁律：`if (e.cfg.blankAvatar || e.cfg.blankBoss || e.cfg.blankMoves) { handleBlank(e, dt, ctx); return; }` 必须排在通用近战 / 施法者之前。
- 回归：新建 `.tmp-block139-test.mjs`（**192 项**）；全量 68 套全绿；老套件按「怪 47 / 卡 138 / 商店 58 / 法器 20 / 技能 15 / 关卡 18 / glb 46 / 模块 76 / 成就 121」更新（124/125/126/128/130/52/63/64/65/67/72/73/77/82/84）。

### 2.14 第 131–138 块：合成台选残片 / 兜底配方 / 残片进档 / 锻造权重 + 骨币关卡倍率补齐 + 更新补贴码 + 系统分享面板与分段复制 + TXT 导出与自动识别导入 + 中文存档文件名（唯一来源）+ 存档备份独立成页（据点入口 + 页面版本号）

用户四连报（原话：「1.要确保所有碎片可以参与合成 2.玩一半存档，回档之后碎片会清零 3.可以适当提高剑鞘补满选项卡的概率 4.有时打怪显示掉落碎片了，实际背包没有出现」）。第 1 条定案「加『选碎片』+ 兜底配方」；第 4 条经追问确认是**合成台里的数量没涨**（不是 B 键背包）。

**① 6 种残片都能合（`js/crafting.js` + `js/main.js` 合成台 UI）**
- `crafting.js` 在 `RECIPES` **尾部**追加 `FALLBACK_RECIPES`（`${id}_fallback`，`fallback:true`，6 条）：只吃**自己 1 枚**，`weapon/relic` 都是 `undefined`（不需要剑 / 法器）。
- 兜底结果降一档：好 `kind:'coins'` 4 枚（`边角料`）/ 坏 `kind:'coins'` 1 枚（`一点渣`）。这两个对象是 `FALLBACK_GOOD / FALLBACK_BAD`，6 条配方共用。
- **顺序即优先级**：`findRecipe` 取第一条命中的，专属配方在前 —— 有铁剑 + 锈铁屑仍先走 `rust_iron`，兜底只在「实在凑不齐」时命中。
- `main.js` 合成台：残片从 `<span>` 改成 `<button class="cr-shard" data-shard="id">`，新增 `craftSel` —— **点哪枚就用哪枚**；打开面板自动选中第一枚有库存的；点选监听挂在容器上（`innerHTML` 重绘不失效）。`doCraft` 只在 `match.shards` 含该残片的配方里找。
- `applyCraftResult` 新增 `kind === 'coins'` 分支（`coins += res.coins; renderGold()`）—— 这是兜底配方唯一的结算口。
- `style.css`：`.cr-shard` 按钮化（`font:inherit / appearance:none / cursor:pointer`）+ `.cr-shard:disabled`（库存 0 灰掉）+ `.cr-shard.sel`（金框选中态）。

**② 残片进存档（真 bug，`js/main.js`）**
- `saveRunAtRound` 加 `crafting: crafting.serialize()` —— 以前整份快照里没有残片，读档自然归零。
- `resumeGame` 加 `crafting.restore(saved.crafting)`（放在 `relics.restore` 之前；老存档没这个字段 → `restore` 什么都不做，表现为 0）。
- `crafting` 的 `serialize / restore` 本来就写好，只是没人调 —— 改这里不用碰 `runSave.js`（它存任意 payload）。

**③ 「剑匣补满」权重 +33%（`js/upgrade.js`）**
- `swordForge`（title「剑匣补满 −X 秒」）`w0 0.90 → 1.20`、`gw +0.010 → +0.014`；品质仍是普通（rarity 0，mul 1.00），三选一里的实际概率同比上升。`vals [-2.0, -3.5, -6.0]` 一字未动（`.tmp-block73/64` 只断言 vals 与三档递减，不会红）。

**④ 「打怪掉了残片但包里没有」**
- 提示改成报**累计数**：`「锈铁屑」×3 —— 日常的碎片`（`crafting.shardCount`），玩家当场能对账。
- 掉落当场落一次档：`if (gameState === 'playing' && level.roundNo >= 1) saveRunAtRound(level.roundNo)`。以前只在回合开始 / 退出时写，手机切后台被系统回收 → 那一片就丢（这是用户「有时」的真实来源）。
- 补 `document.visibilitychange`（`hidden` → `saveRunOnExit()`）：手机切后台不保证触发 `pagehide`。
- 排除过的路径（别再查）：`shards[id]++` 在 `onShardDrop` 之前 → 提示能弹就一定已入账；`crafting` 全文件只有一个实例；`die()` 只触发一次 `onDeath`；合成台打开时 `gameState === 'craft'` → `inGame` 为假、世界冻结，不会有「面板开着却掉新的」。
- 回归：`.tmp-crafting-test.mjs` 加第六段（6 种残片各 3 条断言 + 专属优先 1 条），现在 80 项全过。

**⑤ 骨币关卡倍率补齐到 17 关（第 132 块，用户：「到 12 关左右，打完一普通关起码给 1000 骨币」）**
- `campfire.js` 的 `BONE.levelMul` 原来只写到第 6 关，**7~17 关全部落进 `|| 1`** —— 第 17 关的结算倍率和第一关一模一样（第 7 关甚至比第 6 关掉一大截：730 → 258）。
- 补齐 7~17：1~6 段保留每关 +0.4（3.0 封顶），之后斜率 **+0.25/关** → `7:3.2 8:3.45 9:3.7 10:3.95 11:4.2 12:4.45 13:4.7 14:4.95 15:5.2 16:5.45 17:5.7`。
- 普通难度 / 通关 / 金币花光（下限）：第 7 关 ≈ 825、第 9 关 ≈ 981、**第 12 关 ≈ 1350**、第 15 关 ≈ 1793、第 17 关 ≈ 1764。没花完的金币按 4:1 折进 raw 再乘倍率，所以实战通常比这高 300 上下。
- 没照搬 +0.4 的理由：那样第 17 关 = ×7.4 ≈ 2290，会把篝火 23 簇 + 盲盒 30/100/280 的长期价签一把冲平。
- **别把显式表改成公式**：`.tmp-block63-test.mjs` 断言 `levelBoneMul(99) === 1`（未知关卡兜底），公式会破这条。以后再加关，照着表继续 +0.25。

**⑥ 更新补贴兑换码（第 133 块）**
- `js/gift.js` 的 `GIFT_TABLE` 追加一条：`['9a27c4f53c88ab61', 1000, '更新补贴']`（码表 51 → 52）。
- 明文码是 **7 个字母的手写短码**，只留在本机 `gift-codes.local.md` / `兑换码大全.txt`，**仓库里只有哈希**（这两个文件都在 .gitignore 里，别转存公开仓库）。
- 面额 1000，正好是「第 12 关左右打一局普通关」的量级 —— 配合第 132 块的倍率补齐一起发。
- 连带改：`.tmp-gift-test.mjs` 的码表规模断言 51 → 52；README「礼包兑换（51 码）」→ 52。

**⑦ 系统分享面板 + 分段复制（第 134 块，用户：「A 要做，C 新增一个分段复制，保证每一段长度低于 6000 字符，手机有复制上限，并讲清楚用法」）**

A —— 导出文件先走 `navigator.share`（`js/main.js`）：
- 老写法在微信 / QQ 内核里注定哑火：内核把下载请求移交给「QQ 下载器」，`data:` / `blob:` 都给不出真实地址，最后只剩「没有应用可执行此操作」。
- 新增 `shareSaveFile(json, name)`：`new File([json], name, {type:'application/json'})` → `navigator.canShare({files:[file]})` 为真才 `navigator.share({files, title, text})`。返回 `'ok' / 'cancel' / 'none'`。
- `exportFile()` 改成 `async`，返回 `'ok' / 'cancel' / 'fail'`。**玩家取消（AbortError）→ 直接 `'cancel'`，不再硬撑下载**（否则会「明明取消了却又多出一个文件」）。`canShare` 为假 / 抛错 → `'none'`，退回原来的下载路径。
- 下载路径仍是 `makeHref(json, false)`：会被移交的内核走 `data:`，原生 Chrome / Safari / 桌面走 `blob:`（blob 不受 URL 长度限制，大档更稳）。原来那条 `data:` 主路径降为最后兜底。
- 成功不管走哪条都亮 `#ioSaveRow`（`data:` 长按另存兜底一直有效）。

C —— 分段复制（`index.html` + `js/main.js` + `style.css`）：
- 常量 `PART_MAX = 5000`（比用户要求的 6000 留 1000 字余量），`splitParts(code)` 按定长切；切点随便切都行 —— `saveIO.parseText` 会先 `replace(/\s+/g,'')` 再解析。
- 设置页存档区第 5 颗按钮 `#ioExportParts`「分段复制」（第 104 块的四颗 → 五颗）。`style.css` 给落单的那颗 `grid-column:1/-1` 拉满整行。
- 新弹窗 `#partsAsk`（`.md-card.md-wide` + 可滚 `.parts-list`，z-index 40 同 `#saveCodeAsk`）：`#partsSub` 报「共 N 段 · 全文 X 字 · 每段不超过 5000 字」。
- 每段一行：`第 k/N 段 · x 字` + 「复制这一段」（事件委托，`copyText(seg)`，成功变「已复制 ✓」1.6 秒）+ **只读 textarea**（剪贴板被拦时长按全选兜底）。
- **用法写在弹窗里**（`#partsHow`，用户明确要求「讲清楚用法」）：从第 1 段开始复制 → 粘到备忘录 / 微信文件传输助手 → 回来复制下一段；段间不用加换行、顺序乱了也能拼回去；**别改字别删字符，尤其第 1 段开头的 `NWSZ1:`**；恢复时点「粘贴存档码」，所有段粘进同一个框（一次粘不完分几次点「下一步」），凑齐自动认出来。
- 相关契约（`.tmp-block104-test.mjs` 重写 ①②⑥ 并新增 ⑨；`.tmp-block97` ⑦-c、`.tmp-block99` ③ 从「禁止 share」翻成「必须有 share」）：74 项全绿，含 `splitParts` 实跑（20006 字 → 5 段、拼回一字不差、最长 5000）。
- ⚠️ 别再按第 104 块的老结论把 `navigator.share` 判成「禁项」—— 第 134 块是用户点名要的 A。

**⑧ TXT 导出 + 导入自动识别（第 135 块，用户：「依然不行，是不是文件格式的问题，你试试用 TXT 文件，导入的时候自动转化成其他文件格式并生效」）**
- 导出扩展名 `.json → .txt`：`asciiFileName()` 末段改 `.txt`；`makeHref` 的 `data:` 改成 `data:text/plain;charset=utf-8,`，`blob` 的 `type` 改成 `'text/plain'`；`shareSaveFile` 的 `new File([json], name, {type:'text/plain'})`。
- 内容**不变**，仍是同一份可读 JSON（导入侧不依赖扩展名）。
- 导入改成 `saveIO.parseAny(txt)`（原来只 `parseJsonFile`）：`.txt`（JSON 正文）/ 老 `.json` 备份 / 把 `NWSZ1:` 存档码存成的 txt / 折行拼接的 txt，全自动识别；`accept` 扩到 `.json,.txt,application/json,text/plain`。
- `shareSaveFile` 的 canShare 门闩放宽：国产内核（X5 / QQ 浏览器）的 `canShare` 常是假阴性。手机 UA（`MOBILE_UA`）上一律**再试一次真分享**，真不支持会立刻抛 `TypeError` 再退回下载；桌面仍按 canShare。
- 回归：`.tmp-block104-test.mjs` ④⑤① 断言换成 text/plain / .txt，新增 ⑩ 段真跑 `parseAny`（JSON 全文 / 存档码 / 折行三种都能进），80 项全绿。

**⑨ 中文存档文件名（第 136 / 137 块）**
- 名字统一由 `js/saveIO.js` 的 `fileName()` 产出：`奶蛙·夜行存档文件-YYYYMMDD-HHMM.txt`（第 136 块起中文，第 144 块改名；扩展名 `.txt` 与 `makeHref` 的 `text/plain` 配套）。日期时分防同名覆盖。
- 第 137 块收口：`main.js` 里那份自己拼的 `saveFileName()` 删掉，`exportFile()` 直接用 `saveIO.fileName()` —— **落盘名与 toast 名从此是同一个字符串**（以前 toast 停在 `蛙步夜行-存档-….json`，容易被误判成「下的还是旧文件」）。
- 第 104 块把名字改成 ASCII 是为了照顾安卓下载管理器；现在手机端先走系统分享面板，可读性优先。桌面 / 原生浏览器对 `a.download` 里的中文名没有兼容问题。
- 回归：`.tmp-block104-test.mjs` ④ 改成中文名断言 + 「main.js 不许再自己拼名」，`.tmp-block78-test.mjs` 七 同步新名，81 / 102 项全绿。

**⑩ 存档备份独立成页 + 页面版本号（第 138 块，用户：「加版本号，另外，把备份相关的按钮从设置里面独立出来，在营地页面加一个备份按钮，点进去之后是备份相关的五个按钮」）**
- `index.html`：`.set-io` 整块（五颗按钮 + 自动备份行 + 手动保存兜底 + 提示语）从 `#setScr` 原样搬进新页 `#backupScr`（`tt-sub-scr` + `lv-card`，标题「存档备份」）。**id 一个没改**，`main.js` 里那套监听全都不用动。
- 入口：据点面板（用户说的「营地页面」）里新增一条独占整行的横卡 `#btnBackup`（`.bp-it.bp-wide`，`grid-column:1 / -1`）；设置页那颗的副标题从「音量 / 摇杆 / 存档」改成「音量 / 摇杆 / 画质」。
- `main.js`：`const backupScr`、`showBackup()`（先 `renderAutoSlot()` 再 `showSub`）、`#btnBackup` / `#bkBack` 两个监听；`checkUpdate` 的两处「正在操作就别自动刷新」名单里加上 `backupScr`（分段复制到一半被刷掉等于白干）。
- 版本号：备份页页脚 `#bkVer` 由 `BUILD`（从任一 `<script src>` 的 `?v=` 上读）写成 `v155`；设置页页脚原来那行「… · vN」保持不动（`.tmp-block100-test.mjs` 钉着 `#setScr .lv-foot`）。
- 回归：`.tmp-block104-test.mjs` ② 改为「五颗按钮在备份页 / 设置页里没有 / 据点有入口 / 返回键收 backupScr / 进页先刷自动备份槽」，共 90 项；`.tmp-block106-test.mjs` 加两条 `btnBackup` 断言（138 项）。

**发版**：`index.html` + `js/*.js` 的 `?v=` 一起 154 → **155**（172 处）。回归全绿，唯一红的是 `.tmp-story-test.mjs` 的 3 条（`局内有 16 夜` vs 实际 17 夜）—— 第 130 块起就红，与 131~138 无关。

### 2.15 第 130 块：第十七关「钟楼顶」+ 钟声定身 + 空箱子 / 装箱

用户定案：场地机制 = **钟声定身**；两只新怪 = **撞钟的 + 铜壳**；配套 = **空箱子（第 19 件法器）+ 装箱（技能，`F`）**；数值取「更贪」档（`hpMul 1.80 / dmgMul 2.15`）。

**场地：`js/bell.js`（零 import，和 sketch / spotlight 一套写法）**
- 北沿场地外挂石台 + 两根立柱 + 横梁 + 铜钟，钟响时前后摆几下。
- 节拍：`interval 9.0s`（每回合 −0.32s，下限 6.0）；响前 `warn 1.0s` 钟身发亮 + 地面警示环往里收。
- 钟响：`toll()` 推一个 `{kind:'toll', hold:0.6, push:3.0}` 事件 → `main.js` 对**全场活怪**（`hittable`）`applyFreeze({time:hold, bell:true})`、`rootPlayer(hold)`（**主角也停**），再把主角 3 格内的怪 `knockback` 推开；同时放一圈冲击环。
- `build(spec|null)` / `reset` / `setRound` / `update` / `state` / `takeEvents` / `debugToll`；存档不进 `snapshot`，由 `setLevel` 重建。

**两只新怪（`enemy.js`）**
- **撞钟的 `toll`**（`chapel-bell.glb`，3dassets.dev「Chapel Bell」CC0，只有一段 `swing` → 新 `bell` 族全映射到 swing）：慢速小怪（3.5 血 / 移速 1.35），每 6.5 秒读条 0.7 秒，主角在 2.8 格内 → **局部钉住 0.9 秒**（提示音 + 头顶金圈）。它是平摊道具模型：`sourceHeight 0.236`（包围盒最大边）/ `tiltX` 两处都加 / `doubleSided:true`。
- **铜壳 `bronze`**（`bronze-knight.glb`，KayKit《Character Pack: Adventures》Knight，76 段 → 新 `knight` 族）：7 血 / `armor 0.25` / 移速 0.95 / 近战伤害 2；**`cfg.freezeImmune: true`** —— `applyFreeze` 里 `if (bell && e.cfg.freezeImmune) return;`，**只免疫钟声这一路**，冰剑 / 木屑定身照吃。
- 装箱：`enemies.box(e,{time}) / unbox(e,at) / boxedList()`；被装箱的怪 `e.boxed` 为真，`hittable` 直接排除（打不到、不被索敌），`root.visible=false`、AI 停；到期或倒箱时 `unbox` 回场。

**第 19 件法器「空箱子」`js/crate.js`**
- 程序化木箱跟在主角身后 0.92；被动每 7/6/5 秒把 `autoRange 6.0` 内最近的一只活怪收进箱子（暂时消失）。
- `cap 1/2/3` 装满后自动倒下：怪 `unbox` 到半径 `dropRadius 2.0/2.6` 的环上，摔伤 `round(maxHp × 25%/30%/35%)`（最低 1）+ 定身 0.9 秒；落点 `impactR 2.2` 内其他怪再吃 `impactDmg 1.5/2.1/2.8`。
- 主动「装箱」：`cast(playerPos, yaw)` 收 `castRange 5.0` 内最多 `castCount 3` 只，CD 26/23/20 秒。
- 商店：本体 36（第 17 关起 / 第 8 回合 / `SHOP_PINNED[9]`）+ 买断「箱盖」20（`lidTime` 倒箱定身加长）与「绳扣」24（收得更快）。
- 六张专属卡：`crateInterval / crateImpact / crateRange / crateCd / crateCap / crateFall`；`weightOf` 门是 `up.crate && !opts.crateOwned → 0`。

**技能「装箱」`skills.js`（`F` 键，技能栏第 14 格）**
- `visible: ctx.crate.owned`，`ring:true`；`press` 调 `ctx.crate.cast(ctx.playerPos, yaw)`；`lastFail` 回 `'lock'` / `'cd'` / `'full'`。

**接线清单**：`wave.js` LEVEL_17（arena 19 / `hpMul 1.80` / `dmgMul 2.15` / 20 回合 / 15 种怪，`toll` 3.4 早于 `bronze` 4.2）+ `LEVELS_BY_ID[17]`；`scene.js` `roof` 主题（`makeRoofTexture()` 青石板错缝 + 铜绿渍 + 夜雾霜）；`story.js` s17 绑第 17 关；`main.js` 选关表 + import + `setLevel` 重建 + 主循环（`bell.setRound/update/takeEvents` → 冻结 + `rootPlayer` + `knockback`；`crate.setRelicLevel/update`）+ 存档 + 调试口（`__game.block114` 桶）；`shop.js` 三件货 + `itemLocked`；`upgrade.js` 六张卡 + `crateChange()` + `weightOf` 门；`relics.js` 定义 + `levels/cds`；`codex.js` 两条文案 + 两张缩略图。
- 回归：新建 `.tmp-block130-test.mjs`（139 项）+ `.tmp-130-smoke.js`（CDP 实跑第十七关 PASS、零 console 报错）；老套件按十七关口径更新（怪 37 / 卡 133 / 商店 55 / 法器 19 / 技能 14 / 关卡 17 / glb 37 / 模块 75）。

### 2.16 第 129 块：第十六关「钟楼画室」+ 铅笔线稿圈 + 铅笔 / 描红

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

### 2.17 第 128 块：第十五关「钟楼直播间」+ 补光曝光区 + 环形灯 / 开播

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

### 2.18 第 127 块：收件人 / 回声减血 + 连杀「数字不封顶、加成封顶」

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

### 2.19 第 126 块：照影换成主角同款模型（紫色）

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

### 2.20 第 125 块：删「等的那个」+ 连杀不封顶

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

### 2.21 第 124 块：第十四关「钟楼打样间」+ 裁切刀 + 裁纸刀

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

### 2.22 上一块：第 122 块（回合挑战 + 三选一刷新，细节见 git log）

**回合挑战**（`js/challenge.js` 纯数据纯函数，零 DOM 零业务 import；接线全在 `main.js`）
- 每关 `planRounds()` 从 `[3, rounds-1]` 无放回抽 **2 个回合**（独立 `chal` 随机流），**回合开始前**弹卡。
- 九条各碰一个轴：`thinBlood` 上限 ×0.5（+`clampHp`）/ `softPaw` 攻击→原值 40%（**下限 1**，走 `mul` 折算）/ `brokenSword`（`weapon.setMuted(true)`）/ `tide` 数量 ×2 / `gale` 移速 ×1.45 出手 ×1.3 / `coldHand` 攻速 ×0.55 / `mute` 技能全锁 / `heavyStep` 移速 ×0.62 / `fragile` 受伤 ×1.6。
- **可以放弃**（记 `chalUsed`，这回合照常打、无奖励）。
- 弹窗挂在 `handleRoundClear` 结算链**末尾**（商店关完之后、gap 里），靠「`gameState ≠ playing` → `level.update` 不跑 → gap 不走表」天然冻结，**没给 wave 加门闩**。

**挑战奖励**（排整条结算链**最前**）：88 金币 / 立刻再一次三选一 / **下一回合属性大涨**（`rollBoosts` 三类各一条 → `applyBoost`，**只活一回合**）。

**三选一刷新**：`UP_REFRESH_FREE = 3`（**一局**三次，不是每面板）。用完后每次刷新随机背一条**未持有**的**盲盒式减成** —— `BOX_CURSES`（`curses.js`，10 条，一条只碰一个数，一律走 `mul`）→ `askConfirm` → `addBoxCurse` → `applyBoxCurses`（`src='boxcurse'`，先撤再重放）→ `boxCurseDmg`（荆棘皮）→ `clampHp`；十条背满锁键。
**⚠️ 别跟夜行诅咒混**（v=139 修的就是这个）：`RUN_CURSES` 是开局自选、换骨币倍率、写进 `profile().runCurses` 的大刀；刷新的减成只掉属性、不写 profile、不动骨币倍率、不进诅咒勾选面板，存档走独立的 `box` 字段。

**生命周期**：效果 src 分别是 `chal` / `boost`，`clearRoundBuffs()` 里成对撤；`resumeGame` 成对抹 + `weapon.setMuted(false)` + `applySkillCdFactor(1)`；`resetRunState` 归零全部计数。存档带 `chal: {plan, used, seen}`。

### 2.23 最近几块（一行一块）

- **143 v=161**：安卓 App 壳（工程在 `../naiwa-app`，Capacitor 6，包名 `com.luohuayu.naiwa`）；游戏侧只动三处（SW 原生跳过 / `askAppMigrate()` 首装迁移引导 / `backButton` 分级拦截），网页版行为与数值零变化。
- **142 v=160**：合成台结果从「一行小字」改成面板内大结果卡（档位标签 + 结果名 + 描述 + 实际拿到什么，四档配色 + 弹入动画）；index/style/main 三处小改。
- **141 v=159**：三选一冷却卡实测 —— 11 张真减 / 2 张（纸立牌、裁纸刀）一点没减；根因是 `board.applyCard` / `guillotine.applyCard` 读裸键而卡是 `{stat,flat}`（整族八张全空）。修好两处 applyCard，顺带修 `candleChange` / `markChange` 的兜底（10 张卡预览文案写错）；block118/123/124 补守卫断言。
- **140 v=158**：成就 121 → **152**（+31：十三~十七关通关 / 十只新怪 / 空白 BOSS 与残影 / 镇纸锤与名字牌 / 累计型；全清 11400 骨币）+ 每日任务池 39 → **63**（简单 27 / 中 19 / 难 17；新计数器 `names` / `hammerCasts` 与两条 `*RunMax`）；新套件 `.tmp-block140-test.mjs`。
- **140 v=157**：首屏提速（A 加载页不等模型 / E 步骤提示 + 97% 停格）；
- **139 v=156**：第十八关「天亮之前」—— 名字被收（`blank.js`，残影死后掉名字牌，5 秒飘走 / 1.2 格内抢回 / 抢回一格封一招）+ 八招八残影 + R20 BOSS「空白」+ 第 20 件法器「镇纸锤」（自动抡破甲 + 砸地 G）；怪 46（+9）/ 卡 138 / 商店 58 / 法器 20 / 技能 15 / 关卡 18 / glb 46 / 模块 76 / 成就 121。
- **138 v=155**：存档备份从设置里独立成 `#backupScr`（据点里新增 `#btnBackup` 横卡进页），备份页页脚显示 `v155`；`checkUpdate` 把 `backupScr` 也列进「别自动刷新」名单。
- **137 v=154**：文件名收口到 `saveIO.fileName()` 一个来源（`main.js` 删掉自拼的 `saveFileName`），落盘名与 toast 名一致。
- **136 v=153**：存档文件名改中文 `蛙步·夜行存档文件-日期-时间.txt`（`asciiFileName` → `saveFileName`），日期时分照旧防重名。
- **135 v=152**：导出存档改 `.txt`（`text/plain`；`data:` / `blob:` / `File` 三处同步改），导入改走 `parseAny`（JSON 全文 / `NWSZ1:` 码 / 折行拼接都自动认），`accept` 认 `.txt`；`shareSaveFile` 在手机 UA 上无视 canShare 假阴性、直接试真分享。
- **134 v=151**：导出存档先走 `navigator.share` + `File`（手机系统分享面板；取消不再硬撑下载），`canShare` 不通过 / 出错才退回下载（blob → data:）；设置页新增第 5 颗「分段复制」，存档码按 `PART_MAX=5000` 切段、每段一颗复制键 + 只读框，弹窗里写明操作步骤与恢复办法（`index.html` / `main.js` / `style.css`）。
- **133 v=150**：新增礼包码「更新补贴」1000 骨币（7 字母手写短码，哈希 `9a27c4f53c88ab61`；明文只在本机留档），码表 51 → 52。
- **132 v=149**：骨币关卡倍率 `levelMul` 补齐 7~17 关（+0.25/关，12 关 ×4.45 ≈ 1350、17 关 ×5.7 ≈ 1764；以前 7 关以后全退回 ×1）。
- **131 v=148**：合成台修三处 —— 残片**可点选**（点哪枚用哪枚）+ 6 条**兜底配方**（只吃 1 枚，结果折算骨币 4/1）+ **残片进档**（`saveRunAtRound` 加 `crafting`，`resumeGame` 补 `restore`，掉落当场补存 + `visibilitychange` 补存）+ 「锻造（剑匣补满）」权重 `w0 0.90 → 1.20`；数量未变，不需要改老套件。
- **130 v=147**：第十七关「钟楼顶」—— 钟声定身（`bell.js`，整点钟响全场含主角定 0.6 秒，余波把身边 3 格内的怪推开）+ 撞钟的（局部钉 0.9 秒）/ 铜壳（钟声免疫）+ 第 19 件法器「空箱子」（自动装箱、满箱倒出摔伤定身）+ 技能「装箱」(F)；怪 37 / 卡 133 / 商店 55 / 法器 19 / 技能 14 / 模块 75。
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

### 2.24 规模数字（改数值断言必看）

关卡 **18** · 怪 **47**（**46 个 glb，零复用，没有一只是手搓的**；`blankMinion` 是隐藏图鉴；图鉴 **46** webp）· 升级卡 **138** · 商店 **58** · 法器 **20** · 技能键 **15** · 火种簇 **23**（核心 9）· 成就 **152** · 事件 **131** · 每日任务池 **63** · 礼包码 52 · 火种卡 16 · 诅咒 6 · js 模块 **76**（`?v=168`）。

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
29. **测试里别写死版本号和数字**：版本运行时从 `index.html` 读；怪数 / 关卡数 / 卡池 / 成就数每次扩张都会让老断言变红。**改数值回头修老套件**（清单见 §2.5 末尾）。
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

## 4. 文件地图（js/，75 个模块，只列要动的）

| 文件 | 职责 |
| --- | --- |
| `main.js`（~1 万行） | 主循环 + 所有 UI 面板 + 各系统接线 + `__game` 钩子。**改前先 grep 定位** |
| `wave.js` | 20 回合编排、`roundScale`、`DIFFS`、升级/商店节点、吃 `roundMod` 四项（hp/dmg/speed/haste） |
| `stats.js` / `weaponStats.js` | 两套属性引擎（`(base+Σflat)×(1+Σpct)×Πmul`） |
| `enemy.js` | 47 只怪的行为、`CLIP_FAMILIES`、`cdOf`、`haste`、冰冻/定身（钟声免疫 `freezeImmune`）、装箱 `box/unbox`、并联体、称量官、看守五招、墨线、加急袋鼠、错版分裂、校对批注、画框囚笼、空白族 `handleBlank`（`blankAvatar` / `blankBoss` / `blankMoves`）、`moveToward`（嘲讽收口） |
| `weapon.js` | 环剑 3 把 + 6 元素剑（除铁剑外群伤 7 格）+ 万剑齐发；`setMuted()` / `holdOrbit()` |
| `skills.js` | 技能注册表 15 格（万剑 / 箭雨 / 回血 / 傀儡 / 墨丸 / 拿铁 / 守夜烛 / 落款 / 纸立牌 / 裁纸刀 / 环形灯 `Q` / 开播 `E` / 描红 `R` / 装箱 `F` / 砸地 `G`，第 10 格的键是 `0`） |
| `upgrade.js` | 138 张升级卡、`weightOf` 门控、`*Change()` 文案函数 |
| `challenge.js` | **第 122 块**：挑战九条 + 规划 + 奖励池，纯数据纯函数 |
| `relics.js` + `mine/latte/golem/candle/mark/board/guillotine/ringlight/pencil/crate.js` + `blank.js` | 20 件法器引擎（各 3 级，独立 `reset / applyCard / snapshot`）；`ringlight` 是第 17 件（Q 键，灯圈跟人走），`pencil` 是第 18 件（自动划线 + 描红），`crate` 是第 19 件（自动装箱 + 满箱倒出），`blank.js` 里的 `createHammerSystem` 是第 20 件「镇纸锤」（G 键砸地） |
| `broadcast.js` | 技能「开播」（不挂法器，`levelCleared(14)` 解锁；倒计时撤 mod 用独立 `on` 布尔，别拿 `t` 当开关） |
| `shop.js` / `campfire.js` / `boons.js` / `curses.js` / `metaShop.js` | 商店 58 件 / 篝火 9 簇 / 火种 16 卡 / 诅咒（夜行 6 + 刷新减成 10）/ 盲盒 |
| `events.js + eventsExtra + eventsSide + repEvents` | 131 个事件（99 随机 + 10 番外 + 13 连锁 + 9 民心），`TEMP_SCALE` |
| `deposit.js` / `hazards.js` / `traffic.js` / `fog.js` / `track.js` / `cutter.js` / `spotlight.js` / `sketch.js` / `bell.js` | 第八关寄存柜 / 场地机关 / 第十二关车流 / 第十一关雾 / 第十三关跑道 / 第十四关裁切刀 / 第十五关补光曝光区 / 第十六关铅笔线稿圈 / 第十七关钟声（车流之后全是零 import，纯注入） |
| `achievements.js` / `dailyQuest.js` / `signin.js` / `codex.js` / `story.js` | 121 成就（手动领取）/ 每日 39 条 / 签到 / 图鉴 46 种 / 18 夜主线（18 夜已绑关） |
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
bell{on,state,toll,count,pos,reset} · crate{owned,ready,count,cap,cdLeft,cdMax,progress,bonuses,list,box,dump,cast,lid,rope,reset} · grantCrate(lv)
blank{names,moves,plates,walls,drop,config,state,serialize,restore} · hammer{owned,ready,cdLeft,cdMax,damage,radius,bonuses,cast,state,snapshot} · grantHammer(lv)
```
> `chal.plan()` / `used()` 是**函数**不是属性；调试口一律回扁平值（见坑 35）。第 129 块起 `sketch / pencil / grantPencil`、第 130 块起 `bell / crate / grantCrate` 都挂在 **`__game.block114`** 桶里（不是 `__game.sketch`）。

---

## 6. 发版与测试

- **推送**：`git -c http.proxy=http://127.0.0.1:7897 push` → `git status -sb` 验证 → `curl --noproxy '*'` 连查两次版本号（Pages 约 1 分钟生效）。
- **回归**：`Get-ChildItem .tmp-block*-test.mjs` 逐个 `node` 跑（**68 套**，PowerShell 没有 `sh`）；要一把梭就写个 `ForEach-Object` 循环收集 `$LASTEXITCODE`。CDP 按需单套串行（第 124 块为 `.tmp-124-cdp.js` 47 项，第 128 块 `.tmp-128-smoke.js`，第 129 块 `.tmp-129-smoke.js`，第 130 块 `.tmp-130-smoke.js`）。
- **已知黄账（别浪费时间）**：`camp-test` 84/22、`boon-test` 133/13、`eventui-test` 35/2、`block18` 34/1、`start-test` 33/15、`block30-cdp` 42/8、`ui-test` 15/7、`block54-cdp` 签到浮层 z-index。
- 老套件 `ok()` 签名不统一：`block41` 是 `ok(name, cond)`，`block59/64/65/66/67/70` 是 `ok(cond, name)` —— 写新套件先看日志格式。

---

## 7. 下一步

用户 2026-10-21 定：**不做多角色，其他都能做，只要局外因素对局内影响不过大**。

- [x] 第十五关（第 128 块，「钟楼直播间」+ 补光曝光区 + 环形灯 / 开播）
- [x] 第十六关（第 129 块，「钟楼画室」+ 铅笔线稿圈 + 铅笔 / 描红）
- [x] 第十七关（第 130 块，「钟楼顶」+ 钟声定身 + 空箱子 / 装箱）
- [x] 第十八关（第 139 块，「天亮之前」+ 名字被收 + 镇纸锤 / 砸地）—— **最后一关，18 夜主线全部绑关**
- [ ] 后续新内容（关已出完；再做就加武器 / 技能 / 事件 / 局外成长，新法器仍要「五件齐」）
- [ ] 更多武器 / 技能（技能栏还剩几格）
- [ ] 性能优化（怪物合批 / 假阴影 / 视锥剔除）—— **等用户点头再动**
- [x] 主菜单 3D 背景 —— 用户 2026-10-28 明确「暂时不做了」
- 不做：排行榜（无后端）、商城/皮肤、广告位、多角色
