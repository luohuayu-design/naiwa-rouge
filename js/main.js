// ============================================================
// main.js —— 蛙步 · 夜行（肉鸽原型 第 1 块：角色 + 摇杆 + 可行走场景）
//
// 这一版只做「移动手感」：没有敌人、没有攻击、没有升级。
// 目标是把三件事调顺：摇杆输入 → 角色速度/朝向 → 相机跟随。
// 后续叠战斗时，只需要在 tick() 里加敌人更新与自动攻击，不用动输入层。
// ============================================================
import * as THREE from '../lib/three.module.js?v=70';
import { buildNightScene } from './scene.js?v=70';
import { loadFrog, buildFallbackFrog, MODEL_YAW } from './frog.js?v=70';
import { createInput } from './input.js?v=70';
import { createStats, STAT_DEFS, PLAYER_GROUPS } from './stats.js?v=70';
import { createStatView } from './statView.js?v=70';
import { createWeaponStats } from './weaponStats.js?v=70';
import { createFx } from './fx.js?v=70';
import { createEnemySystem } from './enemy.js?v=70';
import {
  createLevel, LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVELS_BY_ID, DIFFS, setDifficulty, getDifficulty, roundScale, levelStats,
} from './wave.js?v=70';
import { createRangeRing } from './rangeRing.js?v=70';
import { rollChoices, applyUpgrade, previewUpgrade, upgradeText, UPGRADES, rarityOdds } from './upgrade.js?v=70';
import { createWeaponSystem } from './weapon.js?v=70';
import { createArrowRainSystem } from './arrowRain.js?v=70';
import { SWORD_KINDS } from './swordKinds.js?v=70';
import { createGoldSystem } from './gold.js?v=70';
import { SHOP_ITEMS, itemLocked, rollShopItems, SHOP_SHOW } from './shop.js?v=70';
import { createTurretSystem, TURRET } from './turret.js?v=70';
import { createRelicSystem, RELIC_DEFS } from './relics.js?v=70';
import { RARITIES, rarityInfo, highTierOdds, oddsOf } from './rarity.js?v=70';
import audio from './audio.js?v=70';
import { SKILLS, visibleSkills, skillForKey } from './skills.js?v=70';
import {
  settings as readSettings, setSetting, save as saveProfile, profile,
  bumpStat, setStatMax, codexAdd, codexCount, countCard, unlockAch, hasAch, addBones, bones, resetAll,
  metaShopState, metaSummary,
  storyProgress, markStorySeen, markStoryRead, addStoryMark, setStoryEnding,
  setSaveSuppressed, reloadFromStorage,
  giftLog, giftRedeemed, markGift,
  enemyMet, markEnemyMet,
  ringObtained, markRingObtained,
} from './profile.js?v=70';
// 第 44 块：礼包兑换（码表只有哈希，明细在 gift.js 顶部注释）
import { lookupGift, giftByHash, normalizeCode, GIFT_COUNT } from './gift.js?v=70';
// 第 46 块：音效包（抽象奶蛙音效包 —— 4 段奶蛙叫声，通关第一关解锁）
import { FROG_FILES, FROG_SFX, PACK_LIST, packInfo } from './voicepack.js?v=70';
import * as runSave from './runSave.js?v=70';
import {
  CAMPFIRE, CAMP_STEP, campBuy, campOwned, campLevel,
  campCost, campApply, bonesFor, diffBoneMul, levelBoneMul, coinBones, BONE,
} from './campfire.js?v=70';
// 第 23 块：永夜火种（通关白给的 3 次永久三选一）
import {
  BOONS, BOON_BY_ID, BOON_PICKS, boonOwned, boonStacks, boonPending, boonTotalStacks,
  grantBoons, rollBoons, takeBoon, applyBoons, boonStackText,
} from './boons.js?v=70';
// 第 21 块：夜行诅咒（自选 debuff 换骨币倍率）
import { RUN_CURSES, CURSE_BY_ID, applyRunCurses, curseMul, curseDmg, curseList, curseNames } from './curses.js?v=70';
// 第 22 块：种子与每日挑战
import {
  DAILY_RULES, dayKey, dayText, dailySeed, seedCode, pickDailyCurses,
  seedFromText, pickSeedRules, loadSeedRecords, saveSeedRecord, pruneSeeds,
  dailyRecord, saveDailyRecord, pruneDaily, makeRng,
} from './seed.js?v=70';
import { CODEX_TABS, codexEntries, codexSummary } from './codex.js?v=70';
// 第 58 块：局外商店 · 宝箱（花骨币买，开箱随机给永久属性 / 永久法器 / 技能CD缩短）
import {
  BOXES, BOX_BY_ID, buyBox, rollBox, metaApplyStats, applyMeta,
} from './metaShop.js?v=70';
// 第 59 块：每日签到（以周为单位，周一 00:00 重置）
import {
  WEEK_TIERS, SIGN_BONES, weekCells, signSummary, signToday, signedToday,
} from './signin.js?v=70';
import { achById, ACHS } from './achievements.js?v=70';
import {
  EVENTS, ALL_EVENTS, getEventById, pickEvent, effectLines,
  choiceHint, canAfford, costShort, REP_MIN, REP_MAX, REP_START,
  isTalk, eventChoices, resolveRoll, mergeEffects,
} from './events.js?v=70';
// 第 32 块：主线《笑不出来的那一夜》（18 夜，一夜一关，前 3 夜已有关卡）
import {
  STORY_ARC, STORY_CHAPTERS, STORY_ENDINGS, MARK_INFO,
  storyChapterAt, storyChapterById, storyEndingKey,
} from './story.js?v=70';

// 标记模块已经跑起来了：index.html 的兜底自检靠它判断
// 「模块根本没执行」还是「执行了但加载慢」。
window.__naiwaBooted = true;

// ============================================================
// 启动流程整体包在 async 函数里，不使用顶层 await。
// iOS Safari 15 以下 / 老安卓 WebView 不支持顶层 await，
// 整份模块会直接语法报错、加载页永远停在 0%。
// ============================================================
async function boot() {

  // ---------------- 可调参数 ----------------
  // ?debug=1            挂调试钩子（自动化测试用），并自动跳过标题页与教程
  // ?debug=1&title=1    挂调试钩子，但保留标题页（用来测开局流程）
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const AUTO_START = DEBUG && !params.has('title');
  // 调试模式跳过叙事（随机事件卡 / 商店自动弹出）：自动化测试需要确定性的开局，
  // 想测叙事用 ?debug=1&story=1 打开。
  const DEBUG_SKIP_NARRATIVE = DEBUG && !params.has('story');
  let ARENA_R = 15;            // 可走半径（石头圈在 +0.55）。第 33 块起随关卡变：第三关 19
  function setArenaRadius(r) {
    ARENA_R = r;
    setSceneArena(r);
    enemies.setArenaRadius(r);
    return r;
  }
  const BODY_R = 0.65;         // 角色自身半径（贴边留一点余量）
  const ACCEL = 14;            // 速度趋近系数，越大越「跟手」
  const TURN_SPEED = 13;       // 转身角速度系数
  // ---------------- 相机（第 36 块重做：死区 + 平滑焦点 + 速度感视野） ----------------
  // 之前是「相机跟着角色连续缓动 + 注视点用速度做超前预测」，两个问题：
  //   ① 角色每一次细微挪动，整块屏幕都跟着动 —— 眼睛找不到静止参考，久了就晕；
  //   ② vel×0.22 的超前注视点在急转弯 / 急停时是**瞬间**跳过去的，
  //      镜头跟着甩一下（Unity Cinemachine 文档对 Lookahead 的警告就是这个：
  //      "sensitive to noisy animation ... resulting in undesirable camera jitter"）。
  // 现在照 Cinemachine Framing Transposer / Godot Phantom Camera「Framed」的做法：
  //   死区（Dead Zone）内相机**完全不动** → 出死区才用阻尼把角色推回死区边缘（Soft Zone）。
  //   注视点 = 平滑焦点本身，不再做速度预测，镜头旋转速度与焦点平移速度严格成正比，不会甩。
  const CAM_OFFSET = new THREE.Vector3(0, 10.6, 9.2);
  const CAM_DEADZONE = 1.0;    // 死区半径（世界单位，屏幕上约半格；想回到「随时贴着角色」就调成 0）
  const CAM_FOLLOW = 6.0;      // 焦点追随阻尼系数（越大越跟手，越小越飘）
  // 速度感：跑起来视野微微拉宽（用户建议）。幅度刻意压得很小 ——
  // 赛车游戏里 FOV 拉宽是最有效的速度反馈，但也是对晕动症最敏感的一项
  // （任天堂 Kirby Air Riders 的「速度效果」就是单独一个可关项），所以：小幅度 + 平滑 + 可关。
  const CAM_FOV_BASE = 45;     // 站着不动的视野（原来的值）
  const CAM_FOV_ADD = 3.0;     // 跑满时最多再放宽 3°
  const CAM_FOV_LERP = 3.2;    // 视野变化也要缓（突变本身比变化更晕）
  const IFRAME = 0.9;          // 受击后的无敌时间（第 33 块 0.55→0.9：怪堆里不再被连环蹭血；
                               // 略短于大多数怪的攻击间隔，走位仍能被惩罚，但不会被同屏多只怪轮流点名）
  // 移动速度不在这里调了 —— 见 stats.js 的 STAT_DEFS 里 moveSpeed（属性面板实时生效）

  // 音频：这里只建对象（0 请求、0 声音）。真正的解锁在第一次点击/按键
  // （浏览器与微信都禁止无手势自动播放），见下面的全局 pointerdown。
  audio.init();

  // ---------------- 渲染器 ----------------
  const app = document.getElementById('app');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.getElementById('ldTxt').textContent = '当前浏览器不支持 WebGL';
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.38;
  app.appendChild(renderer.domElement);

  // ---------------- 场景与相机 ----------------
  const { scene, update: updateScene, setTheme: setSceneTheme, setArena: setSceneArena } = buildNightScene({ arenaRadius: ARENA_R });

  const camera = new THREE.PerspectiveCamera(CAM_FOV_BASE, window.innerWidth / window.innerHeight, 0.1, 220);
  const camOffset = CAM_OFFSET.clone();
  // 相机焦点（第 36 块）：相机永远看向它，它也只在角色走出死区时才移动
  const camFocus = new THREE.Vector3(0, 0, 0);
  let camFov = CAM_FOV_BASE;                 // 当前视野（每帧向目标值缓动）
  let speedFovOn = !!readSettings().speedFov;   // 设置项：速度感（applySettings 里同步）

  // 第 57 块：全屏浮层的真实高度（--app-h）。
  // 用户截图实证：WeChat / 安卓下 position:fixed + inset:0 按「布局视口」算，
  // 工具栏收起后可视视口更高 → 浮层只盖半屏、底部露黑、卡片被切（种子挑战
  // 面板的「开始」按钮被切掉一半）。按 visualViewport 实时写 --app-h（取
  // innerHeight 与 visualViewport.height 的较大值，绝不比原来矮）；CSS 里
  // 所有全屏浮层和卡片限高都改用这个变量。
  function appH() {
    const vv = window.visualViewport;
    return Math.round(Math.max(window.innerHeight || 0, (vv && vv.height) || 0));
  }
  function syncAppHeight() {
    const h = appH();
    if (h > 0) document.documentElement.style.setProperty('--app-h', h + 'px');
  }
  syncAppHeight();   // 模块体就执行（boot 之前），加载遮罩第一屏就是对的
  window.addEventListener('resize', syncAppHeight);
  window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncAppHeight);

  function applyViewport() {
    const w = window.innerWidth, h = appH();
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // 竖屏时把相机往后拉，否则角色会顶满屏幕
    const k = camera.aspect < 1 ? 1.0 + (1 - camera.aspect) * 0.55 : 1;
    camOffset.copy(CAM_OFFSET).multiplyScalar(k);
    camera.updateProjectionMatrix();
    // 第 57 块：世界冻结期间（菜单/图鉴开着）旋转屏幕 → setSize 会清掉画布内容，
    // 背后那张「定住的夜景」会变黑。补渲染一帧，模糊 backdrop 重新有东西可糊。
    renderer.render(scene, camera);
  }
  applyViewport();
  window.addEventListener('resize', applyViewport);
  window.addEventListener('orientationchange', () => setTimeout(applyViewport, 120));

  // ---------------- 画质（设置面板 + 自动降档） ----------------
  // 高：2x 像素比 + 阴影；中：1.25x + 阴影；低：1x + 关阴影（老手机发热时用）
  //
  // 第 59 块（用户要求「战斗中帧率低于 40 自动降低画质」）：
  // 设置里的三档是**基准档**，实际生效档 = 基准档 + 自动降档层数（autoDrop）。
  // 掉帧时一层一层往下压，压到 QUALITY_STEPS 最后一档（min）为止；
  // 帧率稳回来再一层一层升回基准档。**全程不写存档**，设置里那个值始终是玩家选的。
  // 只在「真的在打」的帧里判定（菜单/结算里的帧率说明不了什么）。
  const QUALITY_STEPS = [
    { id: 'high', dpr: 2, shadow: true },
    { id: 'mid', dpr: 1.25, shadow: true },
    { id: 'low', dpr: 1, shadow: false },
    { id: 'min', dpr: 0.75, shadow: false },   // 只有自动降档才会走到这里
  ];
  const QUALITY_BASE = { high: 0, mid: 1, low: 2 };
  let qualityBaseIdx = 0;     // 玩家在设置里选的档（0 高 / 1 中 / 2 低）
  let autoDrop = 0;           // 自动往下压了几层（0~3）
  let qualityNow = 'high';    // 玩家选的档名（不是实际生效档）
  function applyQualityStep() {
    const idx = Math.max(0, Math.min(QUALITY_STEPS.length - 1, qualityBaseIdx + autoDrop));
    const cfg = QUALITY_STEPS[idx];
    qualityNow = QUALITY_STEPS[qualityBaseIdx].id;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dpr));
    // 关掉 shadowMap 后渲染器不再跑阴影 pass，性能立刻回来；
    // 不用逐个改 castShadow，恢复时也是这样（省得改坏场景里的标记）
    renderer.shadowMap.enabled = cfg.shadow;
    renderer.setSize(window.innerWidth, window.innerHeight);
    return idx;
  }
  function applyQuality(q) {
    qualityBaseIdx = QUALITY_BASE[q] != null ? QUALITY_BASE[q] : 0;
    autoDrop = 0;               // 玩家手动改画质 = 从基准档重新开始
    applyQualityStep();
    return qualityNow;
  }

  // 帧率自适应（第 59 块）：1 秒采样一次
  //   · 连续 2 秒低于 40 → 降一层（最多降到 min），第一次降档弹一次提示
  //   · 连续 5 秒高于 52 → 升一层，回到基准档就停
  //   为什么升档门槛比降档高（52 vs 40）：来回抖在 40 上下会反复改 pixelRatio，
  //   每次都要 setSize 重建缓冲，比一直低画质还伤。
  const PERF_AUTO = !DEBUG || params.has('autoperf');   // debug 下默认关（截图/回归别被降档干扰）
  const PERF_DROP_FPS = 40;
  const PERF_UP_FPS = 52;
  const PERF_DROP_SEC = 2;
  const PERF_UP_SEC = 5;
  let perfAcc = 0, perfLow = 0, perfOk = 0, perfTold = false;
  function perfReset() { perfAcc = 0; perfLow = 0; perfOk = 0; autoDrop = 0; applyQualityStep(); }
  function perfSample(dtSec) {
    if (!PERF_AUTO) return null;
    const live = worldLiveNow && (gameState === 'playing' || gameState === 'tutorial' || gameState === 'wtut');
    if (!live) { perfLow = 0; perfOk = 0; return null; }
    if (fps < PERF_DROP_FPS) { perfLow += dtSec; perfOk = 0; }
    else if (fps >= PERF_UP_FPS) { perfOk += dtSec; perfLow = Math.max(0, perfLow - dtSec * 0.5); }
    else { perfLow = Math.max(0, perfLow - dtSec * 0.5); perfOk = 0; }
    if (perfLow >= PERF_DROP_SEC && autoDrop < QUALITY_STEPS.length - 1 - qualityBaseIdx) {
      autoDrop++;
      applyQualityStep();
      perfLow = 0; perfOk = 0;
      if (!perfTold) {
        perfTold = true;
        showToast('画质已自动下调', '帧率偏低，先降一档保流畅 · 设置里可以改回');
      }
      return 'down';
    }
    if (perfOk >= PERF_UP_SEC && autoDrop > 0) {
      autoDrop--;
      applyQualityStep();
      perfOk = 0; perfLow = 0;
      return 'up';
    }
    return null;
  }

  camera.position.copy(camOffset);
  camera.lookAt(0, 0.95, 0);

  // ---------------- 角色 ----------------
  const loadingEl = document.getElementById('loading');
  const ldBar = document.getElementById('ldBar');
  const ldTxt = document.getElementById('ldTxt');

  function setProgress(p) {
    const pct = Math.max(0, Math.min(1, p || 0));
    ldBar.style.width = (pct * 100).toFixed(0) + '%';
    ldTxt.textContent = (pct * 100).toFixed(0) + '%';
  }

  // ---------------- 加载页轮播介绍语（第 48 块） ----------------
  // 首条 = 首次加载慢的提示；之后每 1.78 秒换一句游戏介绍，淡出淡入。
  // 第 53 块（用户反馈「切得太慢」）：3200ms → 1778ms（×1.8 速），淡出同步压到 250ms。
  const LOAD_TIP_MS = 1778;
  const LOAD_TIP_FADE = 200;   // 与 style.css 里 .ld-tip 的 transition 保持一致
  const LOAD_TIPS = [
    '首次加载较慢，请耐心等待……',
    '《蛙步 · 夜行》—— 奶蛙的深夜生存之旅',
    '摇杆走位，环剑自动出鞘，活过 20 个回合',
    '毒 / 冰 / 雷 / 血元素剑，商店买了就上环',
    '炮台 · 法器 · 金钟罩 · 背包，深夜装备库',
    '一百多条夜行奇遇，路边处处有故事',
    '篝火商店与永夜火种：死掉也不白死，越打越强',
    '自选诅咒换骨币倍率，胆子越大赚得越多',
    '提建议 / 报 bug 有礼包兑换码 —— 主菜单「公告」看详情',
    '祝你今夜走得比昨夜远',
  ];
  const ldTip = document.getElementById('ldTip');
  let loadTipTimer = null;
  if (ldTip) {
    let tipIdx = 0;
    ldTip.textContent = LOAD_TIPS[0];
    loadTipTimer = setInterval(() => {
      ldTip.classList.add('fade');
      setTimeout(() => {
        tipIdx = (tipIdx + 1) % LOAD_TIPS.length;
        ldTip.textContent = LOAD_TIPS[tipIdx];
        ldTip.classList.remove('fade');
      }, LOAD_TIP_FADE);
    }, LOAD_TIP_MS);
  }

  let frog;
  let loadFailed = false;
  try {
    frog = await loadFrog('assets/rigged.glb', (p) => setProgress(p * 0.55));
  } catch (err) {
    console.warn('[奶蛙] 模型加载失败，改用几何体占位：', err);
    loadFailed = true;
    frog = buildFallbackFrog();
    const warn = document.createElement('div');
    warn.className = 'ld-err on';
    warn.textContent = '模型加载失败，已用简化角色占位（检查 assets/rigged.glb 是否可访问）';
    loadingEl.querySelector('.ld-box').appendChild(warn);
    ldTxt.textContent = '降级运行';
  }
  scene.add(frog.root);

  // 落点：场地中心，面朝相机
  const pos = new THREE.Vector3(0, 0, 0);
  const vel = new THREE.Vector3(0, 0, 0);
  let yaw = 0;
  frog.root.position.copy(pos);
  frog.yaw.rotation.y = yaw + MODEL_YAW;

  // ---------------- 输入 ----------------
  const input = createInput(
    document.getElementById('touchLayer'),
    document.getElementById('stick')
  );

  // ---------------- 属性 ----------------
  // 第 6 块起是两套完全独立的表：
  //   stats  奶蛙自己（生命 / 近战 / 机动 / 经济）
  //   wstats 环剑自己（剑伤害 / 剑暴击 / 元素）—— 与主角零关系
  const stats = createStats();
  const wstats = createWeaponStats();

  // 脚下的攻击范围环：半径实时跟着 attackRange 走（升级加范围会立刻变大）。
  // 挂在 scene 上而不是角色身上，免得走路/倒地的起伏把环带离地面。
  const playerRing = createRangeRing({
    radius: stats.get('attackRange'),
    color: 0x7ff0c6,
    opacity: 0.46,
    pulse: 0.06,
  });
  playerRing.mesh.position.set(pos.x, 0.028, pos.z);
  scene.add(playerRing.mesh);

  // ---------------- HUD ----------------
  const dbgEl = document.getElementById('stats');
  const hintEl = document.getElementById('hint');
  const hpCard = document.getElementById('hpCard');
  const hpCurEl = document.getElementById('hpCur');
  const hpMaxEl = document.getElementById('hpMax');
  const hpFillEl = document.getElementById('hpFill');
  const hpBarEl = hpFillEl.parentElement;
  const hudKeyEl = document.getElementById('hudKey');
  const exitBtn = document.getElementById('exitBtn');   // 第 40 块：游戏内「存档并退出」
  // 减速诅咒提示（第 20 块）：中咒才亮
  const curseChip = document.getElementById('curseChip');
  const curseNum = document.getElementById('curseNum');
  let curseShown = false;
  let curseLastTxt = '';
  let curseT = 0;          // 诅咒剩余时间（秒）
  let curseFactor = 1;     // 当前移速倍率
  function renderCurse() {
    const on = curseT > 0;
    if (on !== curseShown) {
      curseShown = on;
      curseChip.classList.toggle('on', on);
      curseChip.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (!on) return;
    const txt = `移速 ${Math.round(curseFactor * 100)}%`;
    if (txt !== curseLastTxt) { curseLastTxt = txt; curseNum.textContent = txt; }
  }
  const apPanel = document.getElementById('attrPanel');
  const apList = document.getElementById('apList');
  const apSub = document.getElementById('apSub');
  // 波次 / 受击 / 结算
  const whWave = document.getElementById('whWave');
  const whSub = document.getElementById('whSub');
  const whFill = document.getElementById('whFill');
  const waveToast = document.getElementById('waveToast');
  const wtTitle = document.getElementById('wtTitle');
  const wtSub = document.getElementById('wtSub');
  const hurtFx = document.getElementById('hurtFx');
  const resultEl = document.getElementById('result');
  const rsTitle = document.getElementById('rsTitle');
  const rsSub = document.getElementById('rsSub');
  const rsGrid = document.getElementById('rsGrid');
  const rsTag = document.getElementById('rsTag');
  const rsBone = document.getElementById('rsBone');
  const rsBtn = document.getElementById('rsBtn');
  const upPanel = document.getElementById('upgrade');
  const upList = document.getElementById('upList');
  const upTitle = document.getElementById('upTitle');
  const upSub = document.getElementById('upSub');
  const upFoot = document.getElementById('upFoot');
  const upWarn = document.getElementById('upWarn');   // 永久提示条：只在永夜火种面板里露头
  // 开始界面 / 新手教程 / 武器获得卡
  const titleScr = document.getElementById('titleScr');
  const btnStart = document.getElementById('btnStart');
  const tutAsk = document.getElementById('tutAsk');
  // 获得新音效包（第 46 块）
  const packGetEl = document.getElementById('packGet');
  const pgList = document.getElementById('pgList');
  // 通用确认弹窗（第 41 块）：存档并退出 / 进篝火前的提醒都用它
  const confirmAsk = document.getElementById('confirmAsk');
  const caTitle = document.getElementById('caTitle');
  const caSub = document.getElementById('caSub');
  const caOk = document.getElementById('caOk');
  const caCancel = document.getElementById('caCancel');
  // 主菜单子面板：关卡选择 / 我的记录（第 14 块）
  const levelSel = document.getElementById('levelSel');
  const lvList = document.getElementById('lvList');
  const recordsScr = document.getElementById('recordsScr');
  const boonScr = document.getElementById('boonScr');
  const rcList = document.getElementById('rcList');
  const tutCard = document.getElementById('tutCard');
  const tcStep = document.getElementById('tcStep');
  const tcTitle = document.getElementById('tcTitle');
  const tcText = document.getElementById('tcText');
  const tcBar = document.getElementById('tcBar');
  const wcard = document.getElementById('weaponCard');
  // 武器用法教程（第 15 块）：获得新武器时自动弹，可跳过
  const wtEl = document.getElementById('weaponTut');
  const wtStepEl = document.getElementById('wtStep');
  const wtNameEl = document.getElementById('wtName');
  // wtutTitle 曾与局内波次 toast 的 wtTitle 重名 —— getElementById 只认靠前的
  // 那个（toast），教程卡自己的标题从来没被更新过，一直停在「剑会自己转」。
  const wtTitleEl = document.getElementById('wtutTitle');
  const wtTextEl = document.getElementById('wtText');
  const wtBarEl = document.getElementById('wtBar');
  const wtNextBtn = document.getElementById('wtNext');
  const wtSkipBtn = document.getElementById('wtSkip');
  let hintDone = false;
  let renderFrames = 0;        // 第 57 块：世界渲染帧计数（测试钩子用：菜单期间不再增长）
  let worldLiveNow = false;    // 第 57 块：最近一帧的闸门状态（tick 内是局部 const，这里给钩子留镜像）

  // 关键属性（生命走血条，这里放三个最常看的）
  const KEY_STATS = ['attack', 'attackRange', 'moveSpeed'];

  // 生命保留一位小数：再生/吸血是小数回复，取整会让玩家看不出在回血
  const fmtHp = (v) => Math.max(0, v).toFixed(1);

  function renderHud() {
    const maxHp = stats.get('maxHp');
    const cur = stats.hp.cur;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, cur / maxHp)) : 0;

    hpCurEl.textContent = fmtHp(cur);
    hpMaxEl.textContent = maxHp.toFixed(1);   // 数值统一 1 位小数（与伤害一致）
    hpFillEl.style.width = (ratio * 100).toFixed(1) + '%';
    hpBarEl.classList.toggle('low', ratio <= 0.25);
    hpBarEl.classList.toggle('mid', ratio > 0.25 && ratio <= 0.5);

    hudKeyEl.textContent = '';
    for (const key of KEY_STATS) {
      const def = STAT_DEFS.find((d) => d.key === key);
      if (!def) continue;
      const wrap = document.createElement('span');
      const label = document.createElement('i');
      label.textContent = def.name;
      const val = document.createElement('b');
      val.textContent = def.fmt(stats.get(key));
      wrap.append(label, val);
      hudKeyEl.appendChild(wrap);
    }
  }

  // 属性面板：分两页（奶蛙 / 环剑），页内按 group 分组。
  // 主角与武器是两套独立属性表，混在一页里玩家分不清「这个攻击力管不管剑」，
  // 所以第 6 块改成标签页 + 分组小标题。
  const apTabsEl = document.getElementById('apTabs');
  let panelTab = 'player';     // player | weapon

  function apRow(def, value) {
    const row = document.createElement('div');
    row.className = 'ap-row';
    const name = document.createElement('div');
    name.className = 'ap-name';
    name.textContent = def.name;
    const val = document.createElement('div');
    val.className = 'ap-val';
    val.textContent = def.fmt(value);
    const desc = document.createElement('div');
    desc.className = 'ap-desc';
    desc.textContent = def.desc;
    row.append(name, val, desc);
    return row;
  }

  function renderPanel() {
    const tabName = panelTab === 'weapon' ? '环剑' : '奶蛙';
    const table = panelTab === 'weapon' ? wstats : stats;
    apSub.textContent = `生命 ${fmtHp(stats.hp.cur)} / ${stats.get('maxHp').toFixed(1)}`
      + ` · ${tabName} ${table.defs.length} 项 · 已暂停`;

    // 标签页高亮
    for (const btn of apTabsEl.querySelectorAll('.ap-tab')) {
      btn.classList.toggle('on', btn.dataset.tab === panelTab);
    }

    apList.textContent = '';

    // 武器页：还没拿到环剑时先说明一句，数值照常显示（都是真实生效值）
    if (panelTab === 'weapon' && !weapon.granted) {
      const tip = document.createElement('div');
      tip.className = 'ap-note';
      // 第 56 块：第一关第 5 回合获得；之后的关卡（拿到过就）开局直接送
      tip.textContent = ringObtained() && curLevelId >= 2
        ? '这一关开局就带着环剑（第一关拿到过），下面是它的独立数值（不吃主角的攻击与暴击）。'
        : '第 5 回合结束会自动获得环剑，下面是它的独立数值（不吃主角的攻击与暴击）。';
      apList.appendChild(tip);
    }
    // 第 21 块：本局带了诅咒时，点明「上面的数值已经扣过诅咒」，
    // 不然玩家看到移速 3.74 会以为是 bug
    if (panelTab !== 'weapon' && gameState !== 'title' && pendingCurses.length) {
      const list = curseList(pendingCurses);
      const note = document.createElement('div');
      note.className = 'ap-note';
      note.textContent = `本局夜行诅咒：${list.map((c) => `${c.name}（${c.eff || ''}）`).join(' · ')}—— 上面显示的已经是扣完之后的数值。`;
      apList.appendChild(note);
    }

    for (const g of table.grouped()) {
      const box = document.createElement('div');
      box.className = 'ap-group';
      const head = document.createElement('div');
      head.className = 'ap-gt';
      head.textContent = g.group;
      box.appendChild(head);
      for (const row of g.rows) box.appendChild(apRow(row, row.value));
      apList.appendChild(box);
    }
  }

  apTabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.ap-tab');
    if (!btn) return;
    panelTab = btn.dataset.tab === 'weapon' ? 'weapon' : 'player';
    renderPanel();
  });

  let panelOpen = false;
  let panelOpenedOnce = false;
  // tab：可选，打开时切到指定页（教程/测试用）
  function setPanel(open, tab) {
    panelOpen = open;
    if (open) {
      panelOpenedOnce = true;
      if (tab) panelTab = tab === 'weapon' ? 'weapon' : 'player';
      input.joystick.release();   // 面板盖住屏幕，别让摇杆一直输出
      vel.set(0, 0, 0);           // 暂停时不留残余速度，关掉面板不会突然窜出去
      renderPanel();
      apPanel.classList.add('on');
      apPanel.setAttribute('aria-hidden', 'false');
    } else {
      apPanel.classList.remove('on');
      apPanel.setAttribute('aria-hidden', 'true');
    }
  }

  hpCard.addEventListener('click', () => setPanel(!panelOpen));
  document.getElementById('apClose').addEventListener('click', () => setPanel(false));
  apPanel.addEventListener('click', (e) => {
    // 点卡片外的遮罩区域关闭
    if (e.target === apPanel) setPanel(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelOpen) setPanel(false);
  });

  renderHud();

  // ============================================================
  // 战斗：特效 → 怪物 → 第一关
  // ============================================================
  const fx = createFx(scene);
  let kills = 0;

  const enemies = createEnemySystem({
    scene, fx, arenaRadius: ARENA_R,
    // 第 55 块：新类型第一次上场 → 冻结世界 + 弹「它怎么打人」的信息卡
    onSpawn: (e) => onMeetSpawn(e),
    onDeath: (e) => {
      kills++;
      codexAdd('enemies', e.type);      // 图鉴：击倒计数
      tryAch('first_blood');
      // 第三关的新怪各有一条里程碑（第 29 块）
      if (e.type === 'charger' && codexCount('enemies', 'charger') >= 30) tryAch('charger_30');
      if (e.type === 'shielder' && codexCount('enemies', 'shielder') >= 30) tryAch('shielder_30');
      if (e.type === 'brood' && codexCount('enemies', 'brood') >= 10) tryAch('brood_10');
      // 第四关的三只新怪（第 35 块）
      if (e.type === 'wraith' && codexCount('enemies', 'wraith') >= 30) tryAch('wraith_30');
      if (e.type === 'leaper' && codexCount('enemies', 'leaper') >= 30) tryAch('leaper_30');
      if (e.type === 'mender' && codexCount('enemies', 'mender') >= 10) tryAch('mender_10');
      // 小兵是自爆 → 爆炸声；其他怪是被打死 → 骨头散架声
      audio.sfx(e.cfg.selfDestruct ? 'explode' : 'die');
      // 金币掉落：按 goldRate 掷骰（概率属性，财运升级可提升）
      gold.maybeDrop(e.pos, rngOf('gold'));
    },
  });

  let enemyLoadOk = true;
  try {
    // 13 只怪全部预载（第 52 块起每个各用各的模型，不再有复用去重）
    await enemies.preload(
      ['minion', 'warrior', 'archer', 'bowman', 'hexer', 'pyro', 'hierarch',
        'charger', 'shielder', 'brood', 'wraith', 'leaper', 'mender'],
      (p) => setProgress(0.55 + p * 0.42),
    );
  } catch (err) {
    enemyLoadOk = false;
    console.warn('[怪物] 模型加载失败：', err);
    const warn = document.createElement('div');
    warn.className = 'ld-err on';
    warn.textContent = '怪物模型加载失败（检查 assets/monsters/ 是否可访问）';
    loadingEl.querySelector('.ld-box').appendChild(warn);
  }

  // ---------------- 武器：环剑 ----------------
  // 模型很小（~20KB），跟着怪物一起在加载段拿；失败时 weapon.preload 内部会占位降级
  const weapon = createWeaponSystem({ scene, stats, wstats, fx, enemies });

  // ---------------- 武器：箭雨（第 47 块） ----------------
  // 第二关起随环剑一并解锁；伤害吃 wstats（剑油/磨剑石同样强化它）
  const arrowRain = createArrowRainSystem({ scene, fx, enemies, wstats });

  try {
    await weapon.preload();
  } catch (err) {
    console.warn('[武器] 预加载异常（已降级）：', err);
  }
  setProgress(1);

  // ---------------- 金币 ----------------
  // 怪死掉按 goldRate 掷骰掉金币，0.5 秒后自动入账（onGold 回调）。
  // 金币只在商店里花；本局内有效（结算不跨局保存）。
  const goldNumEl = document.getElementById('goldNum');
  let coins = 0;
  // ---------------- 管理员模式（第 30 块 + 第 37 块沙盒化）----------------
  // 密码在设置里开启，只用来检查调试：无限金币 / 无限骨币 / 生命无限 / 每回合可跳过。
  // 做法不是到处写 if —— 而是把余额钉在一个大数上、扣钱的地方不再扣，
  // 这样商店的价格判断、canAfford、事件付款全都不用改就自动通过。
  // 第 37 块：管理员期变成「沙盒」—— 不落任何盘（关卡进度 / 永夜火种 / 篝火 /
  // 成就 / 记录全不记），退出时把内存档案回滚到开启前的样子。开启开关单独存一把
  // 键，否则会被 save() 的抑制一起吞掉，刷新页面就丢了沙盒状态。
  const ADMIN_GOLD = 999999;
  const ADMIN_KEY = 'naiwa_rouge_admin_v1';
  const readAdminKey = () => { try { return !!localStorage.getItem(ADMIN_KEY); } catch { return false; } };
  let adminOn = readAdminKey();
  setSaveSuppressed(adminOn);   // 刷新页面仍处在沙盒里：继续不落盘
  let coinsBeforeAdmin = 0;     // 关掉时把开之前那笔钱还回去
  function renderGold() {
    goldNumEl.textContent = adminOn ? '∞' : String(coins);
  }
  function addCoins(n) {
    if (n > 0) audio.sfx('coin');
    coins = adminOn ? ADMIN_GOLD : Math.max(0, coins + n);
    renderGold();
  }
  const gold = createGoldSystem({ scene, fx, stats, onGold: addCoins });
  renderGold();

  // ---------------- 自动炮台 / 随身法器（第 13 块） ----------------
  // 炮台：商店买下即立在主角身边，本局永久，自己索敌射弩箭；
  // 法器：地刺 / 霜环跟着主角走，买下即常驻，再买升级。
  const turrets = createTurretSystem({ scene, fx, enemies });
  const relics = createRelicSystem({ scene, fx, enemies });

  // 事件给的「下次商店折扣」（第 11 块）：一次性，进店结账用掉就清。
  // 和民心折扣相乘，所以高民心 + 折扣牌能把价格压到六折左右。
  let nextShopDiscount = 0;

  // ---------------- 民心（第 7 块） ----------------
  // 跨回合记住你做过什么：救人、守信 → 涨；抢掠、背信 → 跌。
  // 影响两件事：① 商店价格（0.75~1.25 倍）② 金币掉落率（±8%）。
  let reputation = REP_START;
  const repNumEl = document.getElementById('repNum');
  const repChipEl = document.getElementById('repChip');
  let lastRepTier = 0;          // 民心档位（用于提示"村民对你改观了"）

  function repPriceMul() {
    // 50 → 1.00，100 → 0.75，0 → 1.25
    return Math.max(0.75, Math.min(1.25, 1 - (reputation - 50) / 200));
  }
  function priceOf(item) {
    // 民心 × 事件折扣，两个都是乘数；最低 1 金币，别出现 0 元购
    return Math.max(1, Math.round(item.price * repPriceMul() * (1 - nextShopDiscount)));
  }
  function repTier() {
    if (reputation >= 80) return 2;   // 敬重
    if (reputation >= 60) return 1;   // 好感
    if (reputation <= 20) return -2;  // 敌视
    if (reputation <= 40) return -1;  // 冷淡
    return 0;
  }
  function renderRep() {
    if (!repNumEl) return;
    repNumEl.textContent = String(Math.round(reputation));
    if (repChipEl) {
      repChipEl.classList.toggle('high', reputation >= 60);
      repChipEl.classList.toggle('low', reputation <= 40);
    }
  }
  // 民心对金币掉落的影响（独立 src，改完可整体撤销）
  function syncRepBonus() {
    stats.removeBySource('rep');
    if (reputation >= 70) stats.addMod({ stat: 'goldRate', flat: 0.08, src: 'rep' });
    else if (reputation <= 30) stats.addMod({ stat: 'goldRate', flat: -0.08, src: 'rep' });
  }
  function addRep(n) {
    if (!n) return;
    const before = reputation;
    reputation = Math.max(REP_MIN, Math.min(REP_MAX, reputation + n));
    if (reputation === before) return;
    syncRepBonus();
    renderRep();
    // 跨过档位时给一句提示（不打断事件卡，走 toast）
    const t0 = repTierAt(before), t1 = repTier();
    if (t1 !== t0) {
      const msg = {
        2: '草原上开始有人喊你「守夜的先生」了',
        1: '村里人见了你会点头了',
        0: '',
        '-1': '有人在你背后低声说话',
        '-2': '路过的人开始绕着你走',
      }[String(t1)];
      if (msg) showToast('民心变化', msg);
    }
    lastRepTier = t1;
  }
  function repTierAt(v) {
    if (v >= 80) return 2;
    if (v >= 60) return 1;
    if (v <= 20) return -2;
    if (v <= 40) return -1;
    return 0;
  }
  renderRep();
  syncRepBonus();

  // ---------------- 战斗状态 ----------------
  // title（标题页）| tutorial（新手教程）| playing | upgrade（三选一）| weapon（武器卡）| over
  // 第 55 块新增一种：meet（新怪物信息卡，世界冻结）
  let gameState = 'title';
  // 本局的**战斗时长**（秒）——用户定案（第 55 块）：只算真正在打的时间。
  // 商店 / 奇遇与主线剧情 / 升级三选一 / 属性卡 / 背包 / 确认弹窗 / 新怪信息卡
  // 全都不许算进来（判断在 tick 里的 combatOn），开新局时归零。
  let elapsed = 0;
  // 战斗外界面的挂起计数（第 55 块）：目前只有通用确认弹窗会 +1。
  // 用它而不是再塞一个 gameState —— 确认弹窗是叠在任意状态上的薄壳。
  let uiHold = 0;
  let iframe = 0;              // 无敌帧剩余
  let shake = 0;               // 相机震动强度
  let attackCd = 0;            // 主角攻击冷却
  let deadT = 0;               // 死亡倒地动画计时
  let won = false;
  let upgradesTaken = 0;       // 已经选过几次升级
  let upSerial = 0;            // 升级加成的唯一序号（src 用）
  let upgradeOpen = false;
  let pendingRound = 0;        // 这次面板是打完第几回合弹的
  const takenUpgrades = [];    // 结算里展示这一局都选了什么

  // ============================================================
  // 金钟罩（第 13 块）：每 15 秒护体 3 秒的周期无敌。
  //   拥有 aegis ≥ 1 后启动；多拿一层周期缩短 1.5 秒（最快 10 秒）。
  //   生效期间 hurtPlayer 全部无效（弩箭、红圈落箭、自爆全挡），
  //   视觉 = 主角身上一层金色薄罩 + 激活瞬间一圈金环。
  // ============================================================
  const AEGIS = { PERIOD: 15, DURATION: 3, STEP: 1.5, MIN_PERIOD: 10 };
  let aegisCycle = 0;          // 距离下一次护体还有多久（含护体那 3 秒）
  let aegisActive = false;
  // 特效三件套（第 16 块加强：之前的单层淡球 0.16 透明度几乎看不见）：
  //   金球（半透明）+ 白金线框壳（反向旋转）+ 地面脉冲金环 —— 隔着屏幕都要觉得「无敌了」
  const aegisShield = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffd66e, transparent: true, opacity: 0.28,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  const aegisWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.22, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.5, wireframe: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  const aegisGround = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffc94d, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  aegisShield.position.y = 0.78;
  aegisWire.position.y = 0.78;
  aegisGround.position.y = 0.05;
  aegisShield.visible = aegisWire.visible = aegisGround.visible = false;
  scene.add(aegisShield, aegisWire, aegisGround);
  function aegisVis(v) {
    aegisShield.visible = v;
    aegisWire.visible = v;
    aegisGround.visible = v;
  }

  function aegisPeriod() {
    const lv = Math.ceil(stats.get('aegis'));
    if (lv < 1) return AEGIS.PERIOD;
    return Math.max(AEGIS.MIN_PERIOD, AEGIS.PERIOD - (lv - 1) * AEGIS.STEP);
  }
  function aegisReset() {
    // 注意：激活窗口的判定是「cycle ≤ DURATION」，所以这里必须从 DURATION 起算，
    // 不能设成整个周期 —— 设成周期的话下一帧就判定为「不激活」，罩子亮一下就没（踩过）
    aegisCycle = AEGIS.DURATION;
    aegisActive = true;        // 拿到的那一瞬间先罩 3 秒（奖励感）
    aegisVis(true);
  }

  function aegisUpdate(dt) {
    const lv = stats.get('aegis');
    if (lv < 1) { aegisActive = false; aegisVis(false); return; }
    if (aegisCycle <= 0) aegisCycle = aegisPeriod();
    aegisCycle -= dt;
    const active = aegisCycle <= AEGIS.DURATION;
    if (active && !aegisActive) {
      aegisActive = true;
      aegisVis(true);
      audio.sfx('aegis');     // 第 25 块：护体开启的蓄力嗡鸣（原来是蹭页签切换声）
      fx.ring(pos, { from: 0.5, to: 1.9, color: 0xffd66e, life: 0.5, opacity: 0.9, y: 0.1 });
      fx.ring(pos, { from: 0.3, to: 1.4, color: 0xffe9a8, life: 0.4, opacity: 0.8, y: 0.12 });
    } else if (!active && aegisActive) {
      aegisActive = false;
      aegisVis(false);
    }
    if (aegisActive) {
      // 球体浮沉 + 线框反向旋转 + 地面金环呼吸放大，三层一起动才够醒目
      const bob = Math.sin(elapsed * 4) * 0.05;
      aegisShield.position.set(pos.x, 0.78 + bob, pos.z);
      aegisShield.rotation.y = elapsed * 1.2;
      aegisWire.position.set(pos.x, 0.78 + bob, pos.z);
      aegisWire.rotation.y = -elapsed * 0.9;
      aegisWire.rotation.x = elapsed * 0.45;
      aegisGround.position.set(pos.x, 0.05, pos.z);
      const pulse = 1.18 + Math.sin(elapsed * 5.5) * 0.16;
      aegisGround.scale.setScalar(pulse);
      aegisGround.material.opacity = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(elapsed * 5.5));
    }
  }

  // ============================================================
  // 背包（第 13 块）：作战中随时打开的面板，放药水这类「攒着用」的东西。
  //   商店买的药水不再立刻喝，而是进背包；背包里点一下才喝。
  //   结构预留：ITEMS 里加一种东西，商店与背包就都认识它。
  // ============================================================
  const BAG_ITEMS = {
    potion: { name: '生命药水', glyph: '⚗', heal: 3, desc: '回复 3.0 生命' },
    bigPotion: { name: '大生命药水', glyph: '🧪', healFull: true, desc: '生命直接回满' },
  };
  const bag = { potion: 0, bigPotion: 0 };
  let bagOpen = false;

  const bagBtn = document.getElementById('bagBtn');
  const bagNum = document.getElementById('bagNum');
  const bagPanel = document.getElementById('bagPanel');
  const bagList = document.getElementById('bagList');
  const bagSub = document.getElementById('bagSub');

  function bagCount() { return bag.potion + bag.bigPotion; }
  function renderBagBtn() {
    const n = bagCount();
    bagBtn.classList.toggle('on', n > 0);
    bagNum.textContent = String(n);
  }
  function renderBag() {
    bagSub.textContent = `生命 ${fmtHp(stats.hp.cur)} / ${stats.get('maxHp').toFixed(1)} · 打开面板时世界暂停`;
    bagList.textContent = '';
    let any = false;
    for (const [id, def] of Object.entries(BAG_ITEMS)) {
      const n = bag[id] || 0;
      if (n <= 0) continue;
      any = true;
      const row = document.createElement('button');
      row.className = 'bg-item';
      row.type = 'button';
      const glyph = document.createElement('span');
      glyph.className = 'bg-glyph';
      glyph.textContent = def.glyph;
      const mid = document.createElement('span');
      mid.className = 'bg-mid';
      const name = document.createElement('b');
      name.textContent = `${def.name} ×${n}`;
      const desc = document.createElement('i');
      desc.textContent = def.desc;
      mid.append(name, desc);
      const use = document.createElement('span');
      use.className = 'bg-use';
      use.textContent = '使用';
      row.append(glyph, mid, use);
      row.addEventListener('click', () => useBagItem(id));
      bagList.appendChild(row);
    }
    if (!any) {
      const empty = document.createElement('div');
      empty.className = 'bg-empty';
      empty.textContent = '背包是空的 —— 商店里买的药水会存进这里';
      bagList.appendChild(empty);
    }
  }
  function setBag(open) {
    bagOpen = open;
    if (open) {
      tutBagUsed = true;         // 新手教程第 4 步：开过一次背包就算见过
      renderBag();
      bagPanel.classList.add('on');
      bagPanel.setAttribute('aria-hidden', 'false');
      input.joystick.release();
      vel.set(0, 0, 0);
      audio.sfx('uiSwitch');
    } else {
      bagPanel.classList.remove('on');
      bagPanel.setAttribute('aria-hidden', 'true');
    }
  }
  function useBagItem(id) {
    const def = BAG_ITEMS[id];
    if (!def || (bag[id] || 0) <= 0) return;
    // 满血时喝药是浪费：拦一下，按钮照常可点但给个提示
    const maxHp = stats.get('maxHp');
    if (stats.hp.cur >= maxHp - 1e-9) {
      showToast('现在喝是浪费', '生命是满的，留着救命再喝');
      return;
    }
    bag[id]--;
    if (def.healFull) stats.heal(1e9);
    else if (def.heal) stats.heal(def.heal);
    bumpStat('potions');              // 成就：累计喝药
    if (profile().stats.potions >= 10) tryAch('potion_10');
    audio.sfx('heal');
    renderHud();
    renderBag();
    renderBagBtn();
  }
  function bagAdd(id, n = 1) {
    if (!(id in BAG_ITEMS)) return;
    bag[id] = (bag[id] || 0) + n;
    renderBagBtn();
  }
  bagBtn.addEventListener('click', () => setBag(!bagOpen));
  document.getElementById('bagClose').addEventListener('click', () => setBag(false));
  bagPanel.addEventListener('click', (e) => { if (e.target === bagPanel) setBag(false); });
  renderBagBtn();

  // 新手教程
  let tutStep = 0;
  let tutMoved = 0;
  let tutDummy = null;
  let tutBagUsed = false;      // 背包那一步：打开过背包（再用「关掉」判过关）
  const TUT_STEPS = [
    {
      title: '先动起来',
      text: '按住屏幕左半边任意位置拖动，奶蛙就会朝那个方向跑（电脑上也可以按 WASD）。跑起来这一步就过了。',
    },
    {
      title: '攻击是自动的',
      text: '脚下这个青绿色的圈是你的攻击范围：怪一走进来就会自动拍它，不用点攻击键。先拍死面前这只小兵。',
    },
    {
      title: '随时查看属性',
      text: '点左上角的血条可以暂停游戏、查看全部属性（主角和环剑分两页）。打开再关掉。',
    },
    {
      title: '背包与按钮',
      text: '右下角的背包按钮（或按 B）随时能打开：商店买的药水存在这里，危急时点一下就用。旁边的喇叭是声音开关。打开背包再关掉，教程就结束了。',
    },
  ];

  // 受击红闪用的战场冻结开关：只有 ?debug=1 的调试钩子会置 true（自动化测试用）
  let debugNoWaves = false;    // 冻结波次推进（不再刷怪）
  let debugNoEnemies = false;  // 冻结怪物 AI（已生成的怪原地不动）

  // 受击：先看金钟罩（第 13 块，护体期间完全免疫），
  // 再过无敌帧，最后按防御减伤扣血；血量归零即结束
  function hurtPlayer(amount) {
    if (adminOn) return;   // 管理员沙盒：生命无限，不吃任何伤害
    if (gameState !== 'playing' || iframe > 0) return;
    if (aegisActive) {
      // 罩子挡下这一下：金环提示，不掉血、不触发无敌帧（罩子本来就免伤）
      fx.ring(pos, { from: 0.7, to: 1.7, color: 0xffd66e, life: 0.34, opacity: 0.85, y: 0.35 });
      fx.ring(pos, { from: 0.5, to: 1.2, color: 0xffe9a8, life: 0.26, opacity: 0.7, y: 0.5 });
      audio.sfx('uiSwitch');
      bumpStat('blocks');
      if (profile().stats.blocks >= 10) tryAch('aegis_10');
      return;
    }
    // 荆棘（第 21 块）：本局选了它就按比例加重；金钟罩在上面已经整下挡掉了，不吃这一项
    stats.damage(amount * (1 + runCurseDmg));
    // 棘甲法器（第 29 块）：挨打时对身边一圈怪反伤（被动解场，不需要操作）
    if (relics.thornsHit) relics.thornsHit(pos);
    iframe = IFRAME;
    shake = readSettings().shake ? 0.55 : 0;   // 设置里可以关掉抖屏
    audio.sfx('hurt');
    hurtFx.classList.add('on');
    setTimeout(() => hurtFx.classList.remove('on'), 90);
    renderHud();
    if (stats.hp.cur <= 0) endGame(false);
  }

  // 主角近战：找攻击范围内最近的怪打一下（没有目标时不空挥）
  function playerAttack() {
    // 一次出手打几只：1 + multiHit（「双拍」= 2）。只挑**不同**的怪，按距离由近到远。
    // 射程内不足这么多只时就有几只打几只（不会空挥）。
    const want = 1 + Math.max(0, Math.round(stats.get('multiHit')));
    const hits = stats.findTargets(
      pos, enemies.list, want,
      (e) => e.state !== 'dead' && e.state !== 'spawn' && !e.ghostHidden   // 雾鬼隐身时拍不着（第 35 块）
    );
    if (!hits.length) return false;

    // 出手瞬间转向最近的目标，避免背对着怪拍地
    const first = hits[0].target;
    const ty = Math.atan2(first.pos.x - pos.x, first.pos.z - pos.z);
    yaw += ((ty - yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 0.85;

    const lifesteal = stats.get('lifesteal');
    let healed = 0;
    let anyCrit = false;
    for (const h of hits) {
      const e = h.target;
      const roll = stats.rollDamage({ targetArmor: e.cfg && e.cfg.armor });
      enemies.takeDamage(e, roll.damage, roll.crit);
      if (roll.crit) anyCrit = true;
      // 吸血：按实际造成的伤害回血（每一只分别结算，属性为 0 时不触发）
      if (lifesteal > 0 && roll.damage > 0) healed += roll.damage * lifesteal;
    }
    if (healed > 0) {
      stats.heal(healed);
      renderHud();
    }

    audio.sfx(anyCrit ? 'crit' : 'hit');
    audio.sfx('swing');                // 每一次出手都有破空声（跟着攻击频率走）
    frog.playAttack();                 // 抬手 → 拍下，和冲击环同一瞬间起手
    fx.swing(pos, stats.get('attackRange'));
    attackCd = 1 / Math.max(0.2, stats.get('attackSpeed'));
    return true;
  }

  // ---------------- 回合 HUD ----------------
  let toastTimer = 0;
  function showToast(title, sub) {
    wtTitle.textContent = title;
    wtSub.textContent = sub || '';
    waveToast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => waveToast.classList.remove('on'), 2000);
  }

  function setRoundLabel(cur, total) {
    whWave.textContent = `第 ${cur}/${total} 回合`;
    whFill.style.width = ((cur / total) * 100).toFixed(1) + '%';
  }

  // ---------------- 回合结束的三选一 ----------------
  // 打开面板时整局进入 upgrade 状态：怪物/波次/无敌帧全部冻结，只留渲染与待机动画。
  // 回合结束的三选一：面板关闭后要接「商店」（第 3/6/9/12 回合先升级后购物）
  let upgradeAfterCb = null;
  function showUpgrade(roundNo, after) {
    upgradeAfterCb = after || null;
    pendingRound = roundNo;
    // 权重按回合变化：round 决定每项的 w0 + gw×(回合-1)
    // 拿到环剑之后，武器系升级才进池子（没武器时抽到等于废牌）
    // 幸运只放宽高品质那一头（第 11 块）：史诗/传说的权重 ×(1 + 幸运 × 该档系数)
    const luck = stats.get('luck');
    // 第 22 块：种子局用固定随机流（同一天同一颗种子 → 同一手牌）
    const picks = rollChoices(rngOf('card'), { round: roundNo, hasWeapon: weapon.granted, luck });

    upTitle.textContent = `第 ${roundNo} 回合结束 · 三选一`;
    upSub.textContent = upgradesTaken > 0
      ? `已获得 ${upgradesTaken} 次强化 · 选一个带进下一回合`
      : '选一个带进下一回合';
    // 页脚把「幸运到底值多少」写成数字，玩家才知道这属性有用
    const odds = rarityOdds(roundNo, { hasWeapon: weapon.granted, luck });
    upFoot.textContent = `幸运 ${luck.toFixed(1)} · 精良及以上 ${(highTierOdds(odds) * 100).toFixed(0)}%`
      + ' · 点一张卡立即生效';
    upList.textContent = '';

    for (const up of picks) {
      const rar = rarityInfo(up);
      const btn = document.createElement('button');
      btn.className = 'up-item';
      btn.type = 'button';
      btn.dataset.tag = up.tag;
      btn.dataset.id = up.id;
      btn.dataset.rarity = rar.id;

      const glyph = document.createElement('span');
      glyph.className = 'up-glyph';
      glyph.textContent = up.glyph;

      const name = document.createElement('span');
      name.className = 'up-name';
      name.textContent = up.name;
      // 品质角标：普通也标，玩家才能一眼看出「这张比旁边那张贵」
      const rank = document.createElement('span');
      rank.className = 'up-rank';
      rank.textContent = rar.name;
      name.appendChild(rank);

      const effect = document.createElement('b');
      effect.className = 'up-effect';
      effect.textContent = up.title;

      // 精确的「原值 → 选后值」：用 stats.preview 算，和真选下去的数字完全一致
      const delta = document.createElement('div');
      delta.className = 'up-delta';
      for (const c of previewUpgrade(stats, up, wstats, weapon)) {
        const row = document.createElement('span');
        row.className = 'up-chg';
        const label = document.createElement('i');
        label.textContent = c.name;
        const from = document.createElement('s');
        from.textContent = c.fromText;
        const arrow = document.createElement('em');
        arrow.textContent = '→';
        const to = document.createElement('b');
        to.textContent = c.toText;
        row.append(label, from, arrow, to);
        delta.appendChild(row);
      }

      const desc = document.createElement('span');
      desc.className = 'up-desc';
      desc.textContent = up.desc;

      btn.append(glyph, name, effect, delta, desc);
      btn.addEventListener('click', () => chooseUpgrade(up));
      upList.appendChild(btn);
    }

    audio.sfx('card');
    upgradeOpen = true;
    gameState = 'upgrade';
    input.joystick.release();
    vel.set(0, 0, 0);
    upWarn.setAttribute('aria-hidden', 'true');   // 局内升级不写永久存档，警示条收起来
    upPanel.classList.add('on');
    upPanel.setAttribute('aria-hidden', 'false');
  }

  function chooseUpgrade(up) {
    if (!upgradeOpen) return;
    audio.sfx('upgrade');
    upgradeOpen = false;

    upSerial++;
    upgradesTaken++;
    const res = applyUpgrade(stats, up, upSerial, wstats, weapon);
    takenUpgrades.push(up);
    // 图鉴 / 战绩 / 成就（第 18 块）：拿到的卡记一笔，本局品质集合也记一笔
    const rIdx = up.rarity ?? 0;
    codexAdd('cards', up.id);
    countCard(up.id);
    runRarities.add(rIdx);
    // 抽到金/红卡时额外一声：不是数值上的奖励，是「今晚运气站在我这边」的那一下
    if (rIdx >= 3) audio.sfx('coin');

    upPanel.classList.remove('on');
    upPanel.setAttribute('aria-hidden', 'true');
    renderHud();
    // 标题固定「获得 · 名字」；精良以上的品质写在副标题里，不抢主文案
    showToast(`获得 · ${up.name}`,
      upgradeText(res) + (rIdx >= 2 ? ` · ${rarityInfo(up).name}` : ''));

    // 第 15 回合是最后一格：选完就结算，不用再等 2.6 秒的回合间隔
    if (pendingRound >= level.totals.rounds) {
      endGame(true);
      return;
    }
    gameState = 'playing';
    const next = upgradeAfterCb;
    upgradeAfterCb = null;
    if (next) next();
  }

  // ---------------- 技能栏（右下角，一栏纯技能键） ----------------
  // 第 10 块：不再摆元素剑数量（属性面板里能看到），只保留「能放什么」。
  // 每个技能 = 一个按钮，按 skills.js 的注册顺序从下往上排；
  // 加技能只改 skills.js，这里一行都不用动。
  const skillBar = document.getElementById('skillBar');
  const skillBtns = new Map();     // id → { btn, cd }

  function buildSkillButtons() {
    skillBar.textContent = '';
    skillBtns.clear();
    for (const sk of SKILLS) {
      const btn = document.createElement('button');
      btn.className = 'sk';
      btn.type = 'button';
      btn.dataset.skill = sk.id;
      btn.setAttribute('aria-label', sk.name);
      btn.title = sk.name + (sk.key ? `（键盘 ${sk.key}）` : '') + '\n' + (sk.hint || '');

      const img = document.createElement('img');
      img.src = sk.icon;
      img.alt = '';
      img.draggable = false;
      const cd = document.createElement('i');
      cd.className = 'sk-cd';
      const num = document.createElement('b');    // 冷却倒计时数字（箭雨用，第 47 块）
      num.className = 'sk-num';
      btn.append(img, cd, num);

      // 技能键用 pointerdown 而不是 click：
      // 手机上一根手指正在推摇杆时，第二根手指点按钮，iOS Safari 不会派发 click。
      let lastPress = 0;
      const onPress = (e) => {
        if (e && e.cancelable) e.preventDefault();
        const now = performance.now();
        if (now - lastPress < 120) return;      // pointerdown + click 双触发
        lastPress = now;
        pressSkill(sk);
      };
      btn.addEventListener('pointerdown', onPress);
      if (!window.PointerEvent) btn.addEventListener('click', onPress);

      skillBar.appendChild(btn);
      skillBtns.set(sk.id, { btn, cd, num, sk });
    }
    renderSkill();      // 先把该藏起来的藏起来（没环剑时第一格也不该露头）
  }

  // 传给技能的条件/上下文（每帧现拼，技能自己决定看不看）
  function skillCtx() {
    // 'wtut'（武器教程）也算能操作：教程最后一步要玩家真的放一次万剑齐发
    return { playing: gameState === 'playing' || gameState === 'wtut', weapon, arrowRain, playerPos: pos, stats, coins };
  }

  function renderSkill() {
    const ctx = skillCtx();
    const list = visibleSkills(ctx);
    skillBar.classList.toggle('on', list.length > 0);
    for (const { btn, cd, num, sk } of skillBtns.values()) {
      const shown = list.includes(sk);
      btn.style.display = shown ? '' : 'none';
      if (!shown) continue;
      const ready = !!sk.ready(ctx);
      btn.classList.toggle('ready', ready);
      btn.classList.toggle('spent', !ready);
      const p = sk.progress ? Math.max(0, Math.min(1, sk.progress(ctx) || 0)) : 0;
      cd.style.height = (p * 100).toFixed(1) + '%';
      // 冷却倒计时数字（第 47 块）：ready 时藏起来，冷却中显示剩余秒数
      if (num) {
        const txt = (!ready && sk.cdText) ? sk.cdText(ctx) : '';
        num.textContent = txt;
        num.style.display = txt ? '' : 'none';
      }
    }
  }

  // 第 56 块（用户报「技能介绍挡住技能按钮」）：教程卡（新手教程 / 武器教程，
  // 共用 .tut-card）弹出时，把整栏技能按钮**统一上移**让开卡片；卡片一收就归零，
  // 平时仍贴在右下角，拇指够得着。
  // 实测依据：卡片底边距底 86px、最高 235px（窄屏长文案）；两个技能按钮从底部
  // 16px 起有 126px 高 —— 上面那个按钮正好被盖住 56px，箭雨教程最后一步
  // 要按的那个按钮首当其冲。
  function syncSkillLift() {
    const card = document.querySelector('.tut-card.on');
    if (!card) { skillBar.style.setProperty('--sk-lift', '0px'); return; }
    // 卡片有 .22s 滑入过渡（translateY 12px→0）：刚加 .on 时读 rect 会量到动画中间态，
    // 抬升量算少一截（实测差 12px，收卡时技能栏短一截、离卡片只剩 0px）。
    // 底边距和布局高都不过渡，用它们还原卡片的最终位置：top = innerHeight - bottom - height。
    // （wtRender 先跑完再调本函数，内容高度已是终值；bottom 是 calc(86px + env(...))，已解析）
    const cs = getComputedStyle(card);
    const bottom = parseFloat(cs.bottom);
    const h = card.offsetHeight || card.getBoundingClientRect().height;
    const top = Number.isFinite(bottom) ? window.innerHeight - bottom - h : card.getBoundingClientRect().top;
    let barH = skillBar.getBoundingClientRect().height;
    if (!barH) barH = 58;                       // 藏着的时候按一格算（不影响观感）
    // 目标：技能栏底边落在卡片上方 12px。现在底边在 16px，补的差就是 lift。
    let lift = Math.max(0, (window.innerHeight - top) + 12 - 16);
    // 别把整栏顶出屏幕（超矮的横屏）：留 24px 给边缘
    lift = Math.min(lift, Math.max(0, window.innerHeight - barH - 24));
    skillBar.style.setProperty('--sk-lift', lift.toFixed(1) + 'px');
  }
  window.addEventListener('resize', syncSkillLift);
  window.addEventListener('orientationchange', () => setTimeout(syncSkillLift, 120));

  function pressSkill(sk) {
    const ctx = skillCtx();
    if (!sk.ready(ctx)) return false;
    const okPressed = sk.press(ctx);
    renderSkill();
    return !!okPressed;
  }

  function pressSkillById(id) {
    const sk = SKILLS.find((s) => s.id === id);
    return sk ? pressSkill(sk) : false;
  }

  buildSkillButtons();

  // ---------------- 通用确认弹窗（第 41 块）----------------
  // 一套壳子三处复用：存档并退出、局外永久选择的提醒、以后别的事也能用。
  // 语义：确定 → resolve(true)，取消/点外面 → resolve(false)。
  // cancelText 传 null = 单按钮「我知道了」的告知型弹窗（不给人反悔的机会）。
  let confirmResolve = null;
  let confirmOpen = false;
  function askConfirm(title, sub, { okText = '确定', cancelText = '再想想' } = {}) {
    if (!confirmAsk) return Promise.resolve(false);
    caTitle.textContent = title;
    caSub.textContent = sub;
    caOk.textContent = okText;
    caCancel.textContent = cancelText || '';
    caCancel.hidden = !cancelText;
    confirmAsk.classList.add('on');
    confirmAsk.setAttribute('aria-hidden', 'false');
    // 第 55 块：弹窗开着的时候人没在打，战斗计时也停下来
    confirmOpen = true;
    uiHold++;
    return new Promise((res) => { confirmResolve = res; });
  }
  function closeConfirm(ok) {
    if (!confirmAsk) return;
    confirmAsk.classList.remove('on');
    confirmAsk.setAttribute('aria-hidden', 'true');
    if (confirmOpen) { confirmOpen = false; uiHold = Math.max(0, uiHold - 1); }
    const r = confirmResolve;
    confirmResolve = null;
    if (r) r(!!ok);
  }
  caOk.addEventListener('click', () => closeConfirm(true));
  caCancel.addEventListener('click', () => closeConfirm(false));
  confirmAsk.addEventListener('click', (e) => { if (e.target === confirmAsk) closeConfirm(false); });

  // 第 41 块：局外永久选择（篝火 / 永夜火种）的告知弹窗。
  // 每个存档只看一次 —— 看完之后不再拦路，但界面上的常驻警示条一直在，
  // 玩家任何时候都能看见「这一下会写进整个存档」。
  function permNoticeOnce(kind, title, sub) {
    const n = profile().notice || (profile().notice = {});
    if (n[kind]) return;
    n[kind] = true;
    saveProfile();
    askConfirm(title, sub, { okText: '我知道了', cancelText: null });
  }

  // ---------------- 开始界面 / 新手教程 / 武器获得卡 ----------------
  function showTitle() {
    gameState = 'title';
    dropMeet();                   // 第 55 块：回标题时新怪卡一起收掉
    audio.playBgm('night');
    titleScr.style.display = '';
    requestAnimationFrame(() => titleScr.classList.remove('off'));
    titleScr.setAttribute('aria-hidden', 'false');
    refreshResume();              // 有存档就亮出「读取存档」入口
    renderCampBadge();            // 篝火按钮上的骨币数（第 19 块）
    renderMsBadge();              // 局外商店按钮上的骨币数（第 58 块）
    renderSignBtn();              // 每日签到入口的红点与本周进度（第 59 块）
    renderDailyBadge();           // 今日挑战按钮上的「今天最好」（第 22 块）
    // 第 57 块：在主界面停留一会儿 → 默默建图鉴缓存（用户建议的「自动缓存」）
    scheduleCodexPrewarm();
    // 第 23 块：上次通关后直接关了网页，这 3 次永久选择还欠着 —— 回标题页补上
    if (boonPending() > 0) {
      setTimeout(() => { if (!boonOpen && gameState === 'title') showBoons({ after: 'close' }); }, 500);
    }
  }

  function beginGame({ tutorial = false } = {}) {
    runUid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // 每局一个存档身份
    audio.unlock();               // 这一下点击就是浏览器要的「用户手势」
    if (ttSaved) ttSaved.hidden = true;   // 新开一局，标题页那句「刚存档」收掉
    audio.playBgm('battle');
    tutAsk.classList.remove('on');
    tutAsk.setAttribute('aria-hidden', 'true');
    titleScr.classList.add('off');
    titleScr.setAttribute('aria-hidden', 'true');
    setTimeout(() => { titleScr.style.display = 'none'; }, 340);
    if (tutorial) startTutorial();
    else startPlay();
  }

  function startPlay() {
    tutCard.classList.remove('on');
    tutCard.setAttribute('aria-hidden', 'true');
    syncSkillLift();          // 第 56 块：教程卡收掉，技能栏落回右下角
    gameState = 'playing';
    // 第 55 块：新一局从 0 起表。以前只初始化一次 —— 打完一局回标题再开，
    // 第二局的「用时」会把上一局那几十分钟一起带进来（记录/成就全被带歪）。
    elapsed = 0;
    meetQueue.length = 0;             // 上一局没来得及看的怪别追到这一局来
    hintDone = false;
    hintEl.classList.remove('off');
    runRarities = new Set();          // 本局品质集合重置（cards_all_kinds 用）
    storyMarked.clear();              // 第 32 块：印记去重表一局一清（重打可以重新选，档案照样累计）
    setDifficulty(diffOverride || profile().difficulty || 'normal');   // 难度一局一选，开局生效
    setLevel(pendingLevelId);         // 第 20 块：按选关重建这一关（含场景皮肤）
    // 第 56 块（用户定案）：第一关第 5 回合拿到过环剑之后，之后的关卡开局就送 3 把铁剑
    // （「后续关卡默认拥有该技能」）。第一关自己仍走 weaponAt 那一回合的获得时刻，
    // 那是全游戏的仪式瞬间，不预送。读档不走这里（存档里的 weapon 直接 restore）。
    prefillRing();
    // 第 36 块：开局把相机焦点贴到角色身上，别从上一局死的地方慢慢飞过来
    camFocus.set(pos.x, 0, pos.z);
    camFov = CAM_FOV_BASE;
    camera.fov = CAM_FOV_BASE;
    camera.position.set(camFocus.x + camOffset.x, camOffset.y, camFocus.z + camOffset.z);
    camera.updateProjectionMatrix();
    clearCurse();                     // 上一局残留的减速不许带进来
    applyCampfire();                  // 篝火（第 19 块）：局外成长在开局一次性落账
    applyMeta(stats, wstats, { weapon, arrowRain, relics });  // 第 58 块：局外商店永久效果（属性+技能CD+永久法器）
    // 第 23 块：永夜火种（通关白给的永久属性）也在这里落账。
    // 局内的一切加成都不跨局 —— 新一局 stats 从 base 重建，这里只补局外那两份。
    const boonLv = applyBoons(stats, wstats);
    if (boonLv) stats.syncHp(stats.get('maxHp'));
    // 第 21 / 22 块：种子与诅咒也在开局落账。普通局 seed=0 → 全部退回 Math.random
    initRunRng(dailyMode ? dailySeedNow : (customSeed ? customSeed.seed : 0));
    const rc = applyRunCurses(stats, wstats, pendingCurses);
    runCurseDmg = rc.dmgTaken;
    if (rc.count) {
      stats.syncHp();     // 脆骨砍的是上限，血条得跟着压下来
      // 开局就要让玩家看见诅咒真的生效了：弹一条横幅，点名+给倍率
      showToast('夜行诅咒生效', `${curseNames(pendingCurses)} —— 属性已扣 · 骨币 ×${rc.mul.toFixed(2)}`);
    }
    level.start();
    perfReset();                      // 第 59 块：新一局从玩家选的画质档重新开始（清掉上一局的自动降档）
  }

  // 篝火：把已点燃的火种加进这一局。先按来源撤一次，保证重复开局不会叠加；
  // 续玩不走这里 —— 存档里的 mods 已经带着 src='camp' 回放了。
  function applyCampfire() {
    stats.removeBySource('camp');
    wstats.removeBySource('camp');
    const got = campApply(stats, wstats);
    if (got.coins) addCoins(got.coins);
    if (got.potion) bagAdd('potion', got.potion);
    if (got.count) stats.syncHp(stats.get('maxHp'));   // 加了血上限就补满，别开局 6/7
    renderHud();
    return got;
  }

  function startTutorial() {
    // 怪物模型没加载出来时，教程第 2 步无从演示 —— 直接进正式流程
    if (!enemyLoadOk) {
      startPlay();
      return;
    }
    gameState = 'tutorial';
    tutStep = 0;
    tutMoved = 0;
    tutDummy = null;
    tutBagUsed = false;
    hintEl.classList.add('off');
    tutCard.classList.add('on');
    tutCard.setAttribute('aria-hidden', 'false');
    syncSkillLift();          // 第 56 块：新手教程卡同样别盖技能栏
    whWave.textContent = '教程';
    whFill.style.width = '0%';
    whSub.textContent = '先熟悉一下';
    renderTutStep();
  }

  function renderTutStep() {
    const s = TUT_STEPS[tutStep];
    if (!s) return;
    tcStep.textContent = `新手教程 ${tutStep + 1} / ${TUT_STEPS.length}`;
    tcTitle.textContent = s.title;
    tcText.textContent = s.text;
    syncSkillLift();          // 第 56 块：文案换了卡片高度可能变
    tcBar.style.width = ((tutStep / TUT_STEPS.length) * 100).toFixed(1) + '%';
    if (tutStep === 1) spawnTutDummy();
  }

  // 教程用的靶子：站在主角前方 3 个单位、0 伤害、1 血 —— 走过来正好进入攻击范围
  function spawnTutDummy() {
    if (tutDummy) return;
    tutDummy = enemies.spawn('minion', { x: pos.x + 3.0, z: pos.z + 0.8 }, {
      hpScale: 1, damageScale: 0, speedScale: 0.55,
    });
    if (tutDummy) {
      tutDummy.state = 'chase';
      tutDummy.hp = 1;
      tutDummy.maxHp = 1;
      tutDummy.damage = 0;   // 教程怪不还手（就算跳过教程留在场上也无害）
      tutDummy.bar.draw(1, 1, 1);
    } else {
      // 靶子没生成（模型缺失等）就跳过这一步，别把玩家卡在教程里
      setTimeout(() => tutNext(), 300);
    }
  }

  function tutNext() {
    tutStep++;
    if (tutStep >= TUT_STEPS.length) {
      endTutorial();
      return;
    }
    renderTutStep();
  }

  function endTutorial() {
    tutCard.classList.remove('on');
    tutCard.setAttribute('aria-hidden', 'true');
    // 没打完的靶子留给正式第 1 回合，0 伤害不会造成威胁
    showToast('教程结束', '第 1 回合开始，祝你好运');
    startPlay();
  }

  // 教程每帧推进：移动距离 / 靶子是否被拍死 / 属性面板是否开过又关掉 / 背包是否开过又关掉
  function tutorialTick(moved) {
    if (tutStep === 0) {
      tutMoved += moved;
      tcBar.style.width = (Math.min(1, tutMoved / 2.5) / TUT_STEPS.length * 100).toFixed(1) + '%';
      if (tutMoved >= 2.5) tutNext();
    } else if (tutStep === 1) {
      if (tutDummy && tutDummy.state === 'dead') tutNext();
    } else if (tutStep === 2) {
      if (panelOpenedOnce && !panelOpen) tutNext();
    } else if (tutStep === 3) {
      if (tutBagUsed && !bagOpen) tutNext();
    }
  }

  // ---------------- 主菜单：关卡选择 / 我的记录（第 14 块） ----------------
  // 关卡清单：以后加新关 = 在这里加一条（playable 才能点）。解锁规则：
  // 第 1 关永远开放，后面每关要「通关上一关」才解锁（看记录里的 wins）。
  const LEVELS = [
    { id: 1, name: LEVEL_1.name, playable: true },
    { id: 2, name: LEVEL_2.name, playable: true },
    { id: 3, name: LEVEL_3.name, playable: true },
    { id: 4, name: LEVEL_4.name, playable: true },   // 第 35 块：第四关 · 雾堤服务区
  ];
  // 选关面板点了哪一关 —— beginGame 时按它切关卡（点的时候还没进战斗）
  let pendingLevelId = 1;

  // ---------------- 夜行诅咒（第 21 块） ----------------
  // 勾选结果存在 profile().runCurses：下次打开还是上次那套，不用重新想。
  // 只在开局落账（startPlay），中途不能改 —— 改了就是「临结算再加难度骗倍率」。
  let pendingCurses = curseList(profile().runCurses || []).map((c) => c.id);
  let runCurseDmg = 0;          // 本局「受伤加重」合计（荆棘），hurtPlayer 用

  // ---------------- 种子 / 每日挑战（第 22 块） ----------------
  // runSeed = 0 表示不固定：所有抽签退回 Math.random，和以前的普通局完全一样。
  // 种子局每个系统一条独立随机流，互不占用 —— 少抽一张卡不会让商店换货。
  let runSeed = 0;
  // 第 38 块：本局唯一标识，区分不同的存档卡。普通局随机、每日也随机，
  // 这样「重开第 5 关」不会覆盖「打到第 18 关退出」那张卡。
  let runUid = 0;
  let rngStreams = null;
  let dailyMode = false;        // 这一局是今日挑战
  let dailyStamp = null;        // 开局那天的 key（跨零点结算也不串到第二天）
  // 第 49 块：自定义种子挑战。非 null = 本局是种子局（{ seed, code, text, rules }）
  let customSeed = null;
  // 本局的临时难度覆盖（每日挑战固定噩梦）。**不写档案** ——
  // 写档案的话，中途刷新会把玩家的难度永久改成噩梦（踩过）。
  let diffOverride = null;

  function initRunRng(seed) {
    runSeed = (seed >>> 0) || 0;
    rngStreams = runSeed ? {
      card: makeRng(runSeed ^ 0x9e3779b1),
      shop: makeRng(runSeed ^ 0x85ebca6b),
      event: makeRng(runSeed ^ 0xc2b2ae35),
      gold: makeRng(runSeed ^ 0x27d4eb2f),
      talk: makeRng(runSeed ^ 0x165667b1),
    } : null;
    return runSeed;
  }
  function rngOf(key) {
    return (rngStreams && rngStreams[key]) || Math.random;
  }

  const REC_KEY = 'naiwa_rouge_records_v1';
  function loadRecords() {
    try {
      const v = JSON.parse(localStorage.getItem(REC_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch { return {}; }
  }
  function saveRunRecord(levelId, { win, time, kills, roundShown }) {
    if (adminOn) return {};   // 管理员沙盒：不记任何战绩
    const all = loadRecords();
    const r = all[levelId] || { wins: 0, bestTime: null, bestKills: 0, bestRound: 0 };
    if (win) {
      r.wins += 1;
      if (r.bestTime == null || time < r.bestTime) r.bestTime = time;
      if (kills > r.bestKills) r.bestKills = kills;
    }
    if (roundShown > r.bestRound) r.bestRound = roundShown;
    all[levelId] = r;
    try { localStorage.setItem(REC_KEY, JSON.stringify(all)); } catch { /* 隐私模式写不进就算了 */ }
    return r;
  }
  const fmtTime = (t) => t == null ? '—' : (t >= 60
    ? `${Math.floor(t / 60)} 分 ${Math.round(t % 60)} 秒`
    : `${t.toFixed(1)} 秒`);

  function showSub(el) {
    el.classList.add('on');
    el.setAttribute('aria-hidden', 'false');
  }
  function hideSub(el) {
    el.classList.remove('on');
    el.setAttribute('aria-hidden', 'true');
  }

  function showLevelSel() {
    const recs = loadRecords();
    lvList.textContent = '';
    LEVELS.forEach((lv, i) => {
      const unlocked = lv.playable && (i === 0 || (recs[LEVELS[i - 1].id]?.wins || 0) > 0);
      const rec = recs[lv.id];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'lv-item' + (unlocked ? '' : ' locked');
      item.dataset.level = String(lv.id);
      const name = document.createElement('div');
      name.className = 'lv-name';
      name.textContent = lv.name;
      const meta = document.createElement('div');
      meta.className = 'lv-meta';
      const best = document.createElement('div');
      best.className = 'lv-best';
      if (!lv.playable) {
        meta.textContent = '新的夜路正在铺 —— 敬请期待';
        best.textContent = '';
      } else {
        const totals = levelStats(LEVELS_BY_ID[lv.id]);   // 卡片显示的是**这一关**的统计
        meta.textContent = `${totals.rounds} 个回合 · ${totals.total} 只怪 · 奇遇 / 三选一 / 商店`;
        best.innerHTML = rec && rec.wins > 0
          ? `最佳：最快通关 <b>${fmtTime(rec.bestTime)}</b> · 通关 <b>${rec.wins}</b> 次`
          : (rec && rec.bestRound > 0
            ? `最佳：最远打到第 <b>${rec.bestRound}</b> 回合`
            : '还没有记录 —— 去闯一闯');
      }
      item.append(name, meta, best);
      if (rec && rec.wins > 0) {
        const tag = document.createElement('span');
        tag.className = 'lv-clear';
        tag.textContent = '已通关';
        item.appendChild(tag);
      } else if (!unlocked) {
        const tag = document.createElement('span');
        tag.className = 'lv-lock';
        tag.textContent = '🔒 未解锁';
        item.appendChild(tag);
      }
      if (unlocked) {
        item.addEventListener('click', () => {
          pendingLevelId = lv.id;      // 点了哪关，beginGame 就开哪关
          dailyMode = false;           // 手动选关 = 普通局（种子与固定规则都不生效）
          customSeed = null;           // 种子局同理（第 49 块）
          goToDiff();                  // 进了第二步：选难度
        });
      }
      lvList.appendChild(item);
    });
    showSub(levelSel);
  }

  // ---------------- 选关分步（第 37 块） ----------------
  // 原来关卡 / 难度 / 诅咒塞在同一页，太挤。现在拆成三页：
  //   选关卡 → 选难度 → 选诅咒，每页只管一件事。选择都存在 pending* 里跨页保留。
  const diffScr = document.getElementById('diffScr');
  const curseScr = document.getElementById('curseScr');

  function goToDiff() {
    hideSub(levelSel);
    renderDiffSeg();        // 难度段控跟着上次的选择亮
    showSub(diffScr);
  }
  function goToCurse() {
    hideSub(diffScr);
    renderCursePick();      // 诅咒勾选跟着上次的选择亮
    showSub(curseScr);
  }
  function startRun() {
    hideSub(curseScr);
    // 教程只在第一关问一次：能开第二关的人早就会玩了，别拿教程挡路
    if (pendingLevelId === 1) {
      tutAsk.classList.add('on');
      tutAsk.setAttribute('aria-hidden', 'false');
    } else {
      beginGame({ tutorial: false });
    }
  }

  function showRecords() {
    const recs = loadRecords();
    rcList.textContent = '';
    let any = false;
    LEVELS.forEach((lv) => {
      if (!lv.playable) return;
      const rec = recs[lv.id];
      if (!rec || (rec.wins === 0 && !rec.bestRound)) return;
      any = true;
      const item = document.createElement('div');
      item.className = 'rc-item';
      const name = document.createElement('div');
      name.className = 'lv-name';
      name.textContent = lv.name;
      const grid = document.createElement('div');
      grid.className = 'rc-grid';
      const cells = [
        ['通关次数', rec.wins > 0 ? `${rec.wins} 次` : '—', rec.wins > 0],
        ['最快通关', fmtTime(rec.bestTime), rec.bestTime != null],
        ['最高击杀', rec.bestKills > 0 ? `${rec.bestKills} 只` : '—', rec.bestKills > 0],
        ['最远回合', rec.bestRound > 0 ? `第 ${rec.bestRound} 回合` : '—', rec.bestRound > 0],
      ];
      for (const [k, v, hot] of cells) {
        const cell = document.createElement('div');
        cell.className = 'rc-cell';
        const i = document.createElement('i'); i.textContent = k;
        const b = document.createElement('b');
        if (hot) b.className = 'hot';
        b.textContent = v;
        cell.append(i, b);
        grid.appendChild(cell);
      }
      item.append(name, grid);
      rcList.appendChild(item);
    });
    if (!any) {
      const empty = document.createElement('div');
      empty.className = 'lv-empty';
      empty.textContent = '还没有任何记录。\n去闯一闯，这里会记下你的每一次通关。';
      empty.style.whiteSpace = 'pre-line';
      rcList.appendChild(empty);
    }
    // 全局战绩（第 18 块）：跨局累计，不管哪一关
    const st = profile().stats;
    const cards = Object.entries(st.cards || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const g = document.createElement('div');
    g.className = 'rc-item';
    const gt = document.createElement('div');
    gt.className = 'lv-name';
    gt.textContent = '夜行统计（所有关卡加起来）';
    const grid = document.createElement('div');
    grid.className = 'rc-grid';
    const gcells = [
      ['总夜行', `${st.runs || 0} 局`, st.runs > 0],
      ['通关', `${st.wins || 0} 次`, st.wins > 0],
      ['累计击杀', `${st.kills || 0} 只`, st.kills > 0],
      ['累计时长', st.seconds >= 60 ? `${Math.floor(st.seconds / 60)} 分` : `${st.seconds || 0} 秒`, st.seconds > 0],
      ['最远回合', st.bestRound > 0 ? `第 ${st.bestRound} 回合` : '—', st.bestRound > 0],
      ['单局最多击杀', st.bestRunKills > 0 ? `${st.bestRunKills} 只` : '—', st.bestRunKills > 0],
      ['最常拿的卡', cards.length ? cards.map(([id]) => {
        const up = UPGRADES.find((u) => u.id === id);
        return up ? up.name : id;
      }).join(' / ') : '—', cards.length > 0],
      ['累计喝药', `${st.potions || 0} 瓶`, st.potions > 0],
    ];
    for (const [k, v, hot] of gcells) {
      const cell = document.createElement('div');
      cell.className = 'rc-cell';
      const i = document.createElement('i'); i.textContent = k;
      const b = document.createElement('b');
      if (hot) b.className = 'hot';
      b.textContent = v;
      cell.append(i, b);
      grid.appendChild(cell);
    }
    g.append(gt, grid);
    rcList.appendChild(g);
    showSub(recordsScr);
  }

  // 永夜火种一览（第 27 块）：主菜单看「已经选了哪些永久加成、各叠了几层」
  function showBoonPanel() {
    const bnList = document.getElementById('bnList');
    const bnTotal = document.getElementById('bnTotal');
    if (!bnList) return;
    bnTotal.textContent = String(boonTotalStacks());
    bnList.textContent = '';
    let any = false;
    for (const b of BOONS) {
      const n = boonStacks(b.id);
      if (!n) continue;
      any = true;
      const rar = rarityInfo(b.rarity);
      const item = document.createElement('div');
      item.className = 'rc-item';
      const head = document.createElement('div');
      head.className = 'lv-name';
      const rank = document.createElement('span');
      rank.className = 'up-rank';
      rank.textContent = rar.name;
      head.append(`${b.glyph} ${b.name} `, rank);
      const grid = document.createElement('div');
      grid.className = 'rc-grid';
      const cells = [
        ['效果', b.title, true],
        ['层数', boonStackText(b), true],
        ['说明', b.desc, false],
      ];
      for (const [k, v, hot] of cells) {
        const cell = document.createElement('div');
        cell.className = 'rc-cell';
        const i = document.createElement('i'); i.textContent = k;
        const el = document.createElement('b');
        if (hot) el.className = 'hot';
        el.textContent = v;
        cell.append(i, el);
        grid.appendChild(cell);
      }
      item.append(head, grid);
      bnList.appendChild(item);
    }
    if (!any) {
      const empty = document.createElement('div');
      empty.className = 'lv-empty';
      empty.textContent = '还没有点燃过永夜火种。\n首次通关任何一关，结算就能抽 3 次永久加成。';
      empty.style.whiteSpace = 'pre-line';
      bnList.appendChild(empty);
    }
    showSub(boonScr);
  }

  // ---------------- 设置面板（第 17 块） ----------------
  const setScr = document.getElementById('setScr');
  const setList = document.getElementById('setList');
  const setReset = document.getElementById('setReset');

  // 摇杆三档：逻辑半径与视觉缩放一起变（只改一个会出现「看着大、推着近」）
  const JOY_PRESET = {
    small: { radius: 38, scale: 0.84 },
    mid: { radius: 46, scale: 1 },
    large: { radius: 56, scale: 1.18 },
  };

  const SET_ROWS = [
    { key: 'sfx', name: '音效音量', type: 'range', hint: '打斗、按钮' },
    { key: 'music', name: '音乐音量', type: 'range', hint: '夜里的小调' },
    // 第 46 块：音效包（正常 / 抽象奶蛙，第一关通关后解锁）
    { key: 'pack', name: '音效包', type: 'pack', hint: '局内所有打斗音' },
    { key: 'quality', name: '画质', type: 'seg', hint: '卡就切中或低', opts: [['high', '高'], ['mid', '中'], ['low', '低']] },
    { key: 'joySize', name: '摇杆大小', type: 'seg', opts: [['small', '小'], ['mid', '中'], ['large', '大']] },
    { key: 'joyHand', name: '摇杆位置', type: 'seg', hint: '按住哪半边出摇杆', opts: [['left', '左手'], ['right', '右手']] },
    { key: 'shake', name: '屏幕震动', type: 'seg', hint: '受击时抖一下', opts: [['on', '开'], ['off', '关']] },
    { key: 'speedFov', name: '速度感', type: 'seg', hint: '跑起来视野微微拉宽（晕的话关掉）', opts: [['on', '开'], ['off', '关']] },
    { key: 'admin', name: '管理员模式', type: 'admin', hint: '金币/骨币/生命无限 · 沙盒不记录 · 退出即还原' },
  ];

  // 布尔型设置项在面板上显示成「开/关」两段
  const BOOL_SETTINGS = new Set(['shake', 'speedFov']);

  // 把设置真正作用到音频 / 渲染 / 摇杆 / 抖屏上
  function applySettings() {
    const s = readSettings();
    audio.setSfxVolume(s.sfx);
    audio.setMusicVolume(s.music);
    audio.setPack(packState().id);     // 第 46 块：启动 / 改设置时把音效包推进引擎
    applyQuality(s.quality);
    speedFovOn = !!s.speedFov;
    const pre = JOY_PRESET[s.joySize] || JOY_PRESET.mid;
    if (input.joystick && input.joystick.setOpts) input.joystick.setOpts({ radius: pre.radius, hand: s.joyHand });
    const stickEl = document.getElementById('stick');
    if (stickEl) stickEl.style.setProperty('--joy-s', String(pre.scale));
    return s;
  }

  function renderSettings() {
    const s = readSettings();
    setList.textContent = '';
    for (const row of SET_ROWS) {
      const wrap = document.createElement('div');
      wrap.className = 'set-row';
      const label = document.createElement('div');
      label.className = 'set-label';
      const name = document.createElement('span');
      name.textContent = row.name;
      if (row.hint) {
        const hint = document.createElement('i');
        // 音效包没解锁时，这一行的说明换成「怎么解锁」——比空着锁住更清楚
        hint.textContent = row.key === 'pack' && !packState().unlocked
          ? '通关第一关解锁「奶蛙」那一项'
          : row.hint;
        name.appendChild(hint);
      }
      label.appendChild(name);

      if (row.type === 'range') {
        const box = document.createElement('div');
        box.className = 'set-vol';
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = '0'; inp.max = '100'; inp.step = '5';
        inp.dataset.setting = row.key;
        inp.value = String(Math.round((s[row.key] || 0) * 100));
        const out = document.createElement('span');
        out.textContent = inp.value + '%';
        inp.addEventListener('input', () => {
          out.textContent = inp.value + '%';
          setSetting(row.key, Number(inp.value) / 100);
          applySettings();
        });
        box.append(inp, out);
        wrap.append(label, box);
      } else if (row.type === 'pack') {
        // 第 46 块：音效包两段。没解锁时「奶蛙」那项灰着点不动，
        // 切换立刻生效（并播一声，让玩家立刻听出区别）。
        const st = packState();
        const seg = document.createElement('div');
        seg.className = 'set-seg';
        for (const p of PACK_LIST) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.pack = p.id;
          b.textContent = p.id === 'frog' ? '奶蛙' : '正常';
          if (p.id === st.id) b.classList.add('on');
          if (p.id === 'frog' && !st.unlocked) b.disabled = true;
          b.addEventListener('click', () => {
            if (b.disabled || st.id === p.id) return;
            setPackId(p.id);
            audio.sfx(p.id === 'frog' ? 'crit' : 'hit');   // 现切现听
            // 这里不弹 toast：设置面板本身就在屏幕中间，toast 会正好压在
            // 「音效包」这一行上（截图核对时发现的），按钮态 + 这一声已经够说明问题
            renderSettings();
          });
          seg.appendChild(b);
        }
        wrap.append(label, seg);
      } else if (row.type === 'admin') {
        // 开要密码，关不用 —— 关掉是安全方向，别让人点错还得翻密码
        const seg = document.createElement('div');
        seg.className = 'set-seg';
        const bOn = document.createElement('button');
        bOn.type = 'button';
        bOn.id = 'adminOnBtn';
        bOn.textContent = adminOn ? '已开启' : '开启';
        if (adminOn) bOn.classList.add('on');
        bOn.addEventListener('click', () => {
          if (adminOn) return;
          openAdminAsk();
        });
        const bOff = document.createElement('button');
        bOff.type = 'button';
        bOff.id = 'adminOffBtn';
        bOff.textContent = '关闭';
        if (!adminOn) bOff.classList.add('on');
        bOff.addEventListener('click', () => {
          if (!adminOn) return;
          applyAdmin(false);
          renderSettings();
          showToast('管理员模式已关闭', '本局进度 / 永夜火种 / 篝火商店 / 记录全部还原到开启前');
        });
        seg.append(bOn, bOff);
        wrap.append(label, seg);
      } else {
        const cur = BOOL_SETTINGS.has(row.key) ? (s[row.key] ? 'on' : 'off') : s[row.key];
        const seg = document.createElement('div');
        seg.className = 'set-seg';
        for (const [v, text] of row.opts) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.v = v;
          b.textContent = text;
          if (v === cur) b.classList.add('on');
          b.addEventListener('click', () => {
            setSetting(row.key, BOOL_SETTINGS.has(row.key) ? v === 'on' : v);
            applySettings();
            renderSettings();
          });
          seg.appendChild(b);
        }
        wrap.append(label, seg);
      }
      setList.appendChild(wrap);
    }
  }

  // 重置要二次确认：第一次点变成「再点一次确认」，3 秒没点就撤
  let resetArmed = false;
  let resetTimer = 0;
  setReset.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      setReset.textContent = '再点一次确认重置';
      setReset.classList.add('arm');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        resetArmed = false;
        setReset.textContent = '重置全部进度';
        setReset.classList.remove('arm');
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    resetArmed = false;
    resetAll();
    setReset.textContent = '已重置';
    setReset.classList.remove('arm');
    setTimeout(() => { setReset.textContent = '重置全部进度'; }, 1400);
    renderSettings();
    applySettings();
  });

  function showSettings() {
    renderSettings();
    showSub(setScr);
  }

  // ---------------- 管理员模式（第 30 块 + 第 37 块沙盒化） ----------------
  // 设置里输对密码才开：局内金币 / 骨币 / 生命无限，每回合能直接跳过。
  // 开关单独存在 ADMIN_KEY（naiwa_rouge_admin_v1），不被 save() 抑制吞掉，
  // 刷新页面后仍处在沙盒里；沙盒期一切不落盘，退出即还原。
  const ADMIN_CODE = '615265';
  const adminAsk = document.getElementById('adminAsk');
  const adminPwd = document.getElementById('adminPwd');
  const adminErr = document.getElementById('adminErr');

  // 跳过按钮只在「管理员 + 真在打」时露出来，别的界面（三选一/商店/标题）都收掉
  let skipBtnShown = false;
  function renderSkipBtn() {
    const btn = document.getElementById('skipRound');
    if (!btn) return;
    const show = adminOn && gameState === 'playing';
    if (show !== skipBtnShown) {
      skipBtnShown = show;
      btn.classList.toggle('on', show);
      btn.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    renderPickRound(show);
  }

  // 选回合（第 34 块）：跟跳过按钮同一显隐条件；面板开着时收起界面要一起收
  function renderPickRound(show) {
    const btn = document.getElementById('pickRound');
    const panel = document.getElementById('roundPick');
    if (!btn || !panel) return;
    btn.classList.toggle('on', show);
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) panel.classList.remove('on');
  }

  // 每次展开面板都重画一遍：格子数跟当前关卡走，当前回合高亮
  function buildRoundPicker() {
    const grid = document.getElementById('rpGrid');
    if (!grid) return;
    grid.textContent = '';
    const total = level.totals.rounds;
    const cur = level.roundNo;
    for (let n = 1; n <= total; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = n;
      if (n === cur) b.classList.add('cur');
      b.addEventListener('click', () => jumpToRound(n));
      grid.appendChild(b);
    }
  }

  // 直接从第 n 回合开打：走存档续玩用的 startAt（普通路径，onRound/存档快照都一致）。
  // 场上怪静默清掉、过期的连锁事件队列作废 —— 调试跳转不该带出一串旧事件卡。
  function jumpToRound(n) {
    if (!adminOn || gameState !== 'playing') return;
    const total = level.totals.rounds;
    const target = Math.max(1, Math.min(total, n | 0));
    const cleared = enemies.killAll();
    laterQueue.length = 0;
    level.startAt(target);
    const panel = document.getElementById('roundPick');
    if (panel) panel.classList.remove('on');
    audio.sfx('uiSwitch');
    showToast(`管理员 · 跳到第 ${target} 回合`, cleared > 0 ? `清掉 ${cleared} 只，直接开打` : '直接开打');
    renderSkipBtn();
  }

  function applyAdmin(on) {
    const next = !!on;
    if (next === adminOn) {            // 已处于目标状态（含刷新后 init 重调）：只确保金币钉上对
      coins = adminOn ? ADMIN_GOLD : coins;
      return;
    }
    if (next) {
      coinsBeforeAdmin = coins;        // 记下开之前身上那笔钱
      try { localStorage.setItem(ADMIN_KEY, '1'); } catch (_) {}
      setSaveSuppressed(true);         // 沙盒期：profile / 记录 / 续玩存档一律不落地
      adminOn = true;
      coins = ADMIN_GOLD;
    } else {
      try { localStorage.removeItem(ADMIN_KEY); } catch (_) {}
      setSaveSuppressed(false);
      reloadFromStorage();             // 把沙盒里改过的档案丢掉，回到开之前那份
      adminOn = false;
      coins = Math.max(0, coinsBeforeAdmin);
      coinsBeforeAdmin = 0;
    }
    renderGold();
    renderSkipBtn();
    // 篝火的 DOM 变量在文件后半段才初始化，等这一轮跑完再刷角标
    setTimeout(() => {
      renderCampBadge();
      const cs = document.getElementById('campScr');
      if (cs && cs.classList.contains('on')) renderCampfire();
    }, 0);
  }

  function openAdminAsk() {
    if (!adminAsk) return;
    adminPwd.value = '';
    adminErr.classList.remove('on');
    adminAsk.classList.add('on');
    adminAsk.setAttribute('aria-hidden', 'false');
    setTimeout(() => adminPwd.focus(), 60);
  }
  function closeAdminAsk() {
    if (!adminAsk) return;
    adminAsk.classList.remove('on');
    adminAsk.setAttribute('aria-hidden', 'true');
    adminPwd.blur();
  }
  function submitAdmin() {
    if (adminPwd.value.trim() !== ADMIN_CODE) {
      adminErr.classList.add('on');
      adminPwd.value = '';
      audio.sfx('soldout');
      adminPwd.focus();
      return;
    }
    closeAdminAsk();
    applyAdmin(true);
    renderSettings();
    audio.sfx('uiSwitch');
    showToast('管理员模式已开启', '金币 / 骨币 / 生命无限 · 可跳过或选择回合 · 此间一切不记录，退出即还原');
  }

  if (adminAsk) {
    document.getElementById('adminYes').addEventListener('click', submitAdmin);
    document.getElementById('adminNo').addEventListener('click', closeAdminAsk);
    adminPwd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAdmin();
      else if (e.key === 'Escape') closeAdminAsk();
    });
    adminAsk.addEventListener('click', (e) => { if (e.target === adminAsk) closeAdminAsk(); });
  }

  // 跳过本回合：先把场上的怪静默清掉（不掉钱、不算击杀），再让波次系统
  // 把没出场的怪划掉 —— 下一帧走的是普通清场流程，三选一/商店/事件照常弹。
  document.getElementById('skipRound').addEventListener('click', () => {
    if (!adminOn || gameState !== 'playing') return;
    const cleared = enemies.killAll();
    if (!level.skipRound || !level.skipRound()) return;
    audio.sfx('uiSwitch');
    showToast('管理员 · 跳过本回合', cleared > 0 ? `清掉 ${cleared} 只，直接进下一回合` : '剩下的怪不再出场');
    renderSkipBtn();
  });

  // 选回合面板：展开时按当前关卡重画格子
  document.getElementById('pickRound').addEventListener('click', () => {
    if (!adminOn || gameState !== 'playing') return;
    const panel = document.getElementById('roundPick');
    if (!panel) return;
    if (!panel.classList.contains('on')) buildRoundPicker();
    panel.classList.toggle('on');
  });

  applyAdmin(adminOn);   // 上次开着就接着开

  btnStart.addEventListener('click', showLevelSel);
  document.getElementById('btnSettings').addEventListener('click', showSettings);
  document.getElementById('setBack').addEventListener('click', () => hideSub(setScr));
  applySettings();
  document.getElementById('lvBack').addEventListener('click', () => hideSub(levelSel));
  // 选关分步（第 37 块）：三页之间来回切，选择都留在 pending* 里
  document.getElementById('diffBack').addEventListener('click', () => { hideSub(diffScr); showSub(levelSel); });
  document.getElementById('diffNext').addEventListener('click', goToCurse);
  document.getElementById('curseBack').addEventListener('click', () => { hideSub(curseScr); showSub(diffScr); });
  document.getElementById('curseStart').addEventListener('click', startRun);
  document.getElementById('btnRecords').addEventListener('click', showRecords);
  document.getElementById('rcBack').addEventListener('click', () => hideSub(recordsScr));
  document.getElementById('btnBoons').addEventListener('click', showBoonPanel);
  document.getElementById('bnBack').addEventListener('click', () => hideSub(boonScr));
  // 静音开关：记在 localStorage 里，下次进来还是关着的
  const muteBtn = document.getElementById('muteBtn');
  const muteIcon = document.getElementById('muteIcon');
  function renderMute() {
    const m = audio.isMuted();
    if (muteIcon) muteIcon.textContent = m ? '🔇' : '🔊';
    if (muteBtn) {
      muteBtn.classList.toggle('off', m);
      muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
      muteBtn.setAttribute('aria-label', m ? '打开声音' : '关闭声音');
    }
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.unlock();
      audio.toggleMute();
      renderMute();
    });
  }
  renderMute();

  // BGM 跟着场景走：标题夜曲 → 战斗 → 叙事面板换轻快曲；属性面板内暂停只压低不换曲。
  // 每帧只比一次状态，不反复设音量 / 不反复触发加载。
  let audioMode = null;
  function syncAudio() {
    let mode;
    if (gameState === 'title') mode = 'title';
    else if (gameState === 'upgrade' || gameState === 'shop'
      || gameState === 'event' || gameState === 'weapon') mode = 'panel';
    else if (gameState === 'over') mode = 'over';
    else if (panelOpen) mode = 'paused';
    else mode = 'battle';
    if (mode === audioMode) return;
    audioMode = mode;
    if (mode === 'title') audio.playBgm('night');
    else if (mode === 'panel') audio.playBgm('shop');
    else if (mode === 'battle') { audio.duck(false); audio.playBgm('battle'); }
    else if (mode === 'paused') audio.duck(true);
    else if (mode === 'over') audio.duck(false);
  }

  // 第一次交互就把音频解锁；所有按钮统一点击声（捕获阶段 → 早于按钮自身的 click 处理）
  document.addEventListener('pointerdown', (e) => {
    audio.unlock();
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (btn && !btn.disabled) audio.sfx('uiClick');
  }, true);
  window.addEventListener('keydown', (e) => {
    audio.unlock();
    if (e.key === 'm' || e.key === 'M') {          // M 也能静音 / 恢复
      audio.toggleMute();
      renderMute();
      return;
    }
    // 数字键 = 技能快捷键（1 对应第一格，往后类推；武器教程里也能按）
    const sk = skillForKey(e.key);
    if (sk && (gameState === 'playing' || gameState === 'wtut')) pressSkill(sk);
    // B = 背包（第 13 块）：作战中随时开/关（新手教程里也允许，第 4 步要教它）
    if (e.key === 'b' || e.key === 'B') {
      if (gameState === 'playing' || gameState === 'tutorial') setBag(!bagOpen);
    }
  }, { once: false });

  document.getElementById('tutYes').addEventListener('click', () => beginGame({ tutorial: true }));
  document.getElementById('tutNo').addEventListener('click', () => beginGame({ tutorial: false }));
  document.getElementById('tcSkip').addEventListener('click', endTutorial);

  // ---------------- 武器获得卡 ----------------
  let weaponCardOpen = false;
  let weaponCardNext = null;

  function showWeaponCard(next) {
    weaponCardOpen = true;
    weaponCardNext = next || null;
    gameState = 'weapon';
    input.joystick.release();
    vel.set(0, 0, 0);
    wcard.classList.add('on');
    wcard.setAttribute('aria-hidden', 'false');
  }

  function closeWeaponCard() {
    if (!weaponCardOpen) return;
    weaponCardOpen = false;
    wcard.classList.remove('on');
    wcard.setAttribute('aria-hidden', 'true');
    gameState = 'playing';
    renderSkill();
    const next = weaponCardNext;
    weaponCardNext = null;
    if (next) next();
  }
  document.getElementById('wcOk').addEventListener('click', closeWeaponCard);

  // ---------------- 武器用法教程（第 15 块） ----------------
  // 需求：拿到**新武器**时自动开一个小教程，教这件武器怎么用，随时能跳过。
  // 规则：
  //   · 每种武器只教一次（localStorage 记住，「跳过」也算知道了，不再打扰）；
  //   · 卡片贴在底部、不挡操作 —— 环剑最后一步要玩家**真的按一次万剑齐发**才算学会；
  //   · 教程期间 gameState='wtut'：能走、能放技能，但回合波次不推进（和面板一样）。
  //   · 表驱动：加新武器只要往 WEAPON_TUT 里补一条（key = SWORD_KINDS 的 kind）。
  const WTUT_KEY = 'naiwa_rouge_wtut_v1';
  const WEAPON_TUT = {
    ring: {
      name: '环 剑',
      steps: [
        { title: '剑会自己转', text: '三把剑绕着你转圈，碰到怪就自动砍一刀 —— 攻击不用按键，走位就够了。' },
        { title: '剑会补回来', text: '砍中怪的那把剑会消失，之后每 3 秒补回一把。剑买得越多，环就越密。' },
        {
          title: '技能 · 万剑齐发',
          text: '按数字 1，或点右下角的剑形按钮：你拥有的每一把剑都会向四周辐射出去（商店买的也算，不影响环上正在转的）。冷却 6 秒，现在就试一次。',
          wait: 'fire',
        },
      ],
    },
    iron: {
      name: '铁 剑',
      steps: [{ title: '剑阵又厚一把', text: '铁剑没有附加效果，图的就是稳定：环上多一把，砍中怪的机会就多一次。' }],
    },
    poison: {
      name: '毒 剑',
      steps: [{ title: '命中就上毒', text: '毒是按秒跳血的，砍得越勤、毒得越久。打血厚的战士先给它上毒再绕圈走。' }],
    },
    frost: {
      name: '冰 剑',
      steps: [{ title: '命中就冻住', text: '冰剑不再只是减速 —— 命中的怪直接定住 1.2 秒，不能移动也不能攻击。投手的骨刀、骨骑的冲锋，冻一下全断。' }],
    },
    thunder: {
      name: '雷 剑',
      steps: [{ title: '命中就全场连锁', text: '砍中一只，一道闪电打到场上所有怪（每道 35% 伤害）。怪越密越是清场技，孤单单一只时性价比一般。' }],
    },
    leech: {
      name: '血 剑',
      steps: [{ title: '命中就回血', text: '按剑伤的一部分回血，和吸血属性叠乘。残血时别退，往怪身上蹭反而更安全。' }],
    },
    // 第 53 块（用户反馈「箭雨拿到之后没提示、没教程」）：
    // 技能也挂进这套卡片 —— key 是技能 id，不是剑种。和武器共用一个队列，
    // 所以拿到环剑那一回合的顺序是：武器卡 → 环剑教程 → 箭雨教程 → 回合链。
    arrowrain: {
      label: '技能教程',
      name: '箭 雨',
      steps: [
        {
          title: '技能栏多了一格',
          text: '第二关起拿到环剑时会一并解锁箭雨。屏幕右下角技能栏第 2 格（一支箭的图标），也可以按键盘 2 放。',
        },
        {
          title: '它自己挑地方',
          text: '不用瞄准：按下去就朝离你最近的那只怪头顶标一圈红环（半径 2.3，最多找 14 格内的怪），0.85 秒后 14 支箭一起落下。怪会走，圈不会追 —— 它跑出圈就白放了。',
        },
        {
          title: '冷却 8 秒',
          text: '放完格子上会显示剩余秒数，走完才能再放。每支箭的伤害吃你的剑伤和暴击（商店的剑油、磨剑石一样加成）。现在就按一次试试。',
          wait: 'rain',
        },
      ],
    },
  };

  let wtOpen = false;
  let wtKind = null;
  let wtStepIdx = 0;
  const wtQueue = [];
  let wtNext = null;          // 教程全部结束后接续回合链（事件/三选一/商店）
  let wtFired = false;

  function wtSeen() {
    try {
      const a = JSON.parse(localStorage.getItem(WTUT_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch { return []; }
  }

  function wtMarkSeen(kind) {
    if (adminOn) return;   // 管理员沙盒：武器教程「已看」也不落盘
    const list = wtSeen();
    if (list.includes(kind)) return;
    list.push(kind);
    try { localStorage.setItem(WTUT_KEY, JSON.stringify(list)); } catch { /* 隐私模式下忽略 */ }
  }

  // 面板/结算/标题页开着时先排队，等它们关掉再弹（别叠在商店上面）
  function wtBlocked() {
    return gameState === 'shop' || gameState === 'upgrade' || gameState === 'event'
      || gameState === 'weapon' || gameState === 'title' || gameState === 'over';
  }

  // 获得武器时调用：没教过的才排队；教过就直接接续 next（回合链不能断）
  function queueWeaponTut(kind, next) {
    if (next) wtNext = next;
    if (WEAPON_TUT[kind] && !wtSeen().includes(kind)) {
      wtQueue.push(kind);
      wtPump();
    } else {
      wtFlush();
    }
  }

  function wtPump() {
    if (wtOpen || wtQueue.length === 0 || wtBlocked()) return;
    wtShow(wtQueue.shift());
  }

  function wtFlush() {
    if (wtOpen || wtQueue.length > 0) return;
    const cb = wtNext;
    wtNext = null;
    if (cb) cb();
  }

  function wtShow(kind) {
    wtOpen = true;
    wtKind = kind;
    wtStepIdx = 0;
    wtFired = false;
    gameState = 'wtut';            // 能走能放技能，但 level.update 不跑（波次不动）
    input.joystick.release();
    vel.set(0, 0, 0);
    wtEl.classList.add('on');
    wtEl.setAttribute('aria-hidden', 'false');
    audio.sfx('card');
    wtRender();
    syncSkillLift();          // 第 56 块：技能栏整栏上移，别被卡片盖住
  }

  function wtRender() {
    const t = WEAPON_TUT[wtKind];
    const s = t.steps[wtStepIdx];
    wtStepEl.textContent = `${t.label || '武器教程'} ${wtStepIdx + 1} / ${t.steps.length}`;
    wtNameEl.textContent = t.name;
    wtTitleEl.textContent = s.title;
    wtTextEl.textContent = s.text;
    wtBarEl.style.width = ((wtStepIdx / t.steps.length) * 100).toFixed(1) + '%';
    wtNextBtn.classList.toggle('on', !s.wait);
    wtNextBtn.textContent = wtStepIdx + 1 >= t.steps.length ? '知道了' : '下一步';
    syncSkillLift();          // 第 56 块：文案换了卡片高度可能变，技能栏跟着挪
  }

  function wtAdvance() {
    const t = WEAPON_TUT[wtKind];
    wtStepIdx++;
    if (wtStepIdx >= t.steps.length) { wtFinish(); return; }
    wtRender();
  }

  // 学完 / 跳过都记成「已教过」，同一种武器不再打扰
  function wtFinish() {
    if (!wtOpen) return;
    wtMarkSeen(wtKind);
    wtOpen = false;
    wtKind = null;
    wtEl.classList.remove('on');
    wtEl.setAttribute('aria-hidden', 'true');
    syncSkillLift();          // 第 56 块：卡片收了，技能栏落回右下角
    if (wtQueue.length > 0) { wtPump(); return; }
    gameState = 'playing';
    wtFlush();
  }

  // 结算/重开时硬收（不留排队，别让教程盖在结算面板上）
  function wtAbort() {
    wtQueue.length = 0;
    wtNext = null;
    wtOpen = false;
    wtKind = null;
    wtEl.classList.remove('on');
    wtEl.setAttribute('aria-hidden', 'true');
    syncSkillLift();          // 第 56 块：同上
  }

  wtNextBtn.addEventListener('click', () => wtAdvance());
  wtSkipBtn.addEventListener('click', () => wtFinish());

  // 每帧看万剑齐发 / 箭雨有没有真的放出去（教程最后一步的过关条件）
  function wtTick() {
    if (!wtOpen) return;
    const t = WEAPON_TUT[wtKind];
    const s = t && t.steps[wtStepIdx];
    if (!s || wtFired) return;
    if (s.wait === 'fire' && weapon.flyingCount > 0) {
      wtFired = true;
      wtAdvance();
    } else if (s.wait === 'rain' && arrowRain.strikeCount > 0) {
      wtFired = true;
      wtAdvance();
    }
  }

  // ============================================================
  // 夜行奇遇（第 7 块）：**回合结束**弹卡，选择作用于**下一回合**
  //
  // 排序：清除上一回合的临时效果 → 武器卡 → 事件 → 三选一 → 商店 → 下一回合
  // 效果落点：mods 写 event:<下一回合>，下一回合结束时整批撤销；
  //           民心 / 金币 / 生命 / 永久属性是跨回合的，不受撤销影响。
  // ============================================================
  const evCard = document.getElementById('eventCard');
  const evIcon = document.getElementById('evIcon');
  const evTitle = document.getElementById('evTitle');
  const evWho = document.getElementById('evWho');
  const evStory = document.getElementById('evStory');
  const evEffect = document.getElementById('evEffect');
  const evChoices = document.getElementById('evChoices');
  const evResult = document.getElementById('evResult');
  const evSay = document.getElementById('evSay');
  const evResultLines = document.getElementById('evResultLines');
  const evTalk = document.getElementById('evTalk');       // 对话记录（第 10 块）
  const evNext = document.getElementById('evNext');

  let eventOpen = false;
  let eventNextCb = null;      // 事件关掉后继续（→ 三选一 → 商店）
  let roundBuffSrc = null;     // 当前生效的回合加成 src（event:<回合>）
  let roundDrain = 0;          // 当前回合每秒流失的生命
  let currentEventRound = 0;   // 刚结束的回合号（效果作用于 +1）
  const seenEvents = [];       // 最近出过的事件（3 回合内不重复）
  const laterQueue = [];       // 待兑现：{ due, kind:'event'|'effects', id? / effects? }

  // 结算一条 effects。nextRound = 效果生效的回合号
  function applyEffects(effects, nextRound, { permanent = false } = {}) {
    if (!effects) return;
    // roll：概率分支（两瓶药水 / 老井），只走一条
    if (effects.roll) {
      let r = Math.random();
      for (const branch of effects.roll) {
        r -= branch.p;
        if (r < 0) { applyEffects(branch.effects, nextRound, { permanent }); return; }
      }
      applyEffects(effects.roll[effects.roll.length - 1].effects, nextRound, { permanent });
      return;
    }
    // mods：下一回合的临时加成（回合结束整批撤销）
    if (effects.mods && effects.mods.length) {
      const src = `event:${nextRound}`;
      roundBuffSrc = src;
      for (const m of effects.mods) {
        const target = m.scope === 'weapon' ? wstats : stats;
        target.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, src });
      }
    }
    // permanent：永久加成（报恩的骨刀 / 幸运 / 金币掉落率），
    // 用独立 src，回合清场不会撤销。也支持挂到武器表上（scope:'weapon'）。
    if (effects.permanent && effects.permanent.length) {
      const src = `pledge:${nextRound}`;
      for (const m of effects.permanent) {
        const target = m.scope === 'weapon' ? wstats : stats;
        target.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, src });
        if (m.stat === 'maxHp') stats.syncHp(m.flat || 0);
      }
    }
    if (effects.rep) addRep(effects.rep);
    if (effects.gold) addCoins(effects.gold);
    if (effects.hp > 0) stats.heal(effects.hp);
    if (effects.hp < 0) stats.hp.cur = Math.max(0.5, stats.hp.cur + effects.hp);   // 咬一口但不会一口咬死
    if (effects.healFull) { stats.heal(1e9); renderHud(); }
    // 一次性商店折扣（第 11 块）：取更强的那一个，进店结账后清零
    if (effects.discount > 0) {
      nextShopDiscount = Math.max(nextShopDiscount, Math.min(0.5, effects.discount));
    }
    if (effects.drain > 0) roundDrain = effects.drain;
    if (effects.level) level.applyRoundMod(effects.level);
  }

  // 回合结束清掉上一回合的临时效果（事件写的是 event:<刚结束的回合>）
  function clearRoundBuffs() {
    if (roundBuffSrc) {
      stats.removeBySource(roundBuffSrc);
      wstats.removeBySource(roundBuffSrc);   // 事件也可能挂在武器表上（剑转速）
      roundBuffSrc = null;
    }
    roundDrain = 0;
  }

  // 事件卡上的效果行：好事绿、坏事红、中性的金
  function effectLineClass(line) {
    if (/[×-]\s*\d|−|-/.test(line) && !/\+/.test(line)) return 'bad';
    if (/\+/.test(line)) return 'good';
    return '';
  }

  function fillLines(box, lines) {
    box.textContent = '';
    for (const line of lines) {
      const s = document.createElement('span');
      s.className = effectLineClass(line);
      s.textContent = line;
      box.appendChild(s);
    }
  }

  // 一个选项按钮（一次抉择 / 对话回话共用）：label + hint，付不起就灰着
  function makeChoiceBtn(choice, onClick) {
    const btn = document.createElement('button');
    btn.className = 'ev-btn';
    btn.type = 'button';
    btn.dataset.id = choice.label;

    const b = document.createElement('b');
    b.textContent = choice.label;
    btn.appendChild(b);

    const hint = document.createElement('i');
    hint.className = 'ev-hint';
    const affordable = canAfford(choice, { gold: coins, hp: stats.hp.cur });
    hint.textContent = affordable ? choiceHint(choice) : `需要 ${costShort(choice)}（不够）`;
    if (!affordable) {
      btn.disabled = true;
      btn.classList.add('locked');
    }
    btn.appendChild(hint);

    btn.addEventListener('click', () => onClick(choice));
    return btn;
  }

  function renderEventUI(ev) {
    evIcon.textContent = ev.icon || '❔';
    evTitle.textContent = ev.title || '夜行奇遇';
    if (evWho) evWho.textContent = ev.who ? '—— ' + ev.who : '';
    evEffect.textContent = '';
    evResult.classList.remove('on');
    evChoices.textContent = '';
    evSay.style.display = '';

    // 对话式事件：故事先当旁白说一句，然后开始一拍一拍地聊
    if (isTalk(ev)) {
      evStory.textContent = '';
      startTalk(ev);
      return;
    }
    evStory.textContent = ev.story || '';
    evTalk.textContent = '';
    evTalk.classList.remove('on');

    if (ev.choices && ev.choices.length) {
      for (const c of ev.choices) {
        evChoices.appendChild(makeChoiceBtn(c, (x) => chooseEventOption(ev, x)));
      }
    } else {
      // 兼容无选项的旧事件：直接给一条效果说明 + 继续
      fillLines(evEffect, effectLines(ev.effects));
      const btn = document.createElement('button');
      btn.className = 'ev-btn';
      btn.type = 'button';
      const b = document.createElement('b');
      b.textContent = ev.ok || '知道了';
      btn.appendChild(b);
      btn.addEventListener('click', closeEvent);
      evChoices.appendChild(btn);
    }
  }

  // ---------------- 对话式事件（第 10 块） ----------------
  // 记录是逐句往下长的：旁白 / 对方 / 你，像真的在跟人说话。
  // 每一拍选的效果先累积（mergeEffects），全部聊完一次性结算成一张账单；
  // 金币、生命这种「当场就掏」的代价，选了就扣。
  let talk = null;     // { ev, beat, acc, paid[], chains[] }

  // ---------------- 对话的「读秒再推进」（第 42 块，第 43 块放开到奇遇）----------------
  // 每一拍都是一两百字，一句一句推进时玩家很容易连点把剧情跳过去。
  // 规则：每一拍显示之后，回话按钮先锁 3 秒、按钮上跑倒计时，读完了才亮。
  //       主线（story.js）和随机奇遇（events*.js）都走这一套；
  //       个别事件想在数据里写 readDelay: 0 就能单独关掉读秒。
  const TALK_READ_DELAY = 3;       // 秒
  let talkCdTimer = null;
  let talkCdLeft = 0;             // 还在倒计时的秒数（测试要看这个）
  let talkCdBtns = [];
  let talkCdGen = 0;              // 代次令牌：换代后上一轮的 tick 立刻失效（防旧定时器空转捣乱）

  // 收尾一律按「DOM 现状」清，不依赖记住的那批按钮：
  // 按钮被重建过（换拍、换事件）时，旧数组里的元素已经脱离文档，照着它清会漏掉真正在页面上的那些。
  function clearTalkCountdown() {
    talkCdGen++;
    if (talkCdTimer) { clearInterval(talkCdTimer); talkCdTimer = null; }
    for (const b of evChoices.querySelectorAll('.ev-btn')) {
      b.classList.remove('cd-wait');
      const cd = b.querySelector('.ev-cd');
      if (cd) cd.remove();
      if (b.dataset.cdLock === '1') { delete b.dataset.cdLock; b.disabled = false; }
    }
    talkCdBtns = [];
    talkCdLeft = 0;
  }

  // 把这拍的所有回话按钮锁 sec 秒，按钮右上角跑倒计时
  function armTalkCountdown(btns, sec) {
    clearTalkCountdown();
    const list = (btns || []).filter((b) => b);
    if (!list.length || !(sec > 0)) return;
    const gen = talkCdGen;         // 本轮令牌
    const deadline = performance.now() + sec * 1000;
    for (const b of list) {
      b.classList.add('cd-wait');
      // 付不起的本来就是灰的：只加角标，不动 disabled，也不在解锁时碰它
      if (!b.disabled) { b.dataset.cdLock = '1'; b.disabled = true; }
      const cd = document.createElement('em');
      cd.className = 'ev-cd';
      cd.textContent = Math.ceil(sec) + 's';
      b.appendChild(cd);
    }
    talkCdBtns = list;
    let myTimer = null;
    const tick = () => {
      if (gen !== talkCdGen) {      // 已经换代（换拍/关窗），这轮自己退场
        if (myTimer) clearInterval(myTimer);
        return;
      }
      const left = Math.max(0, deadline - performance.now());
      talkCdLeft = Math.ceil(left / 1000);
      for (const b of list) {
        const cd = b.querySelector('.ev-cd');
        if (cd) cd.textContent = talkCdLeft > 0 ? talkCdLeft + 's' : '';
      }
      if (left <= 0) {
        if (myTimer) clearInterval(myTimer);
        clearTalkCountdown();      // 清角标 + 解锁（按 DOM 现状，代次也会 ++）
      }
    };
    tick();
    myTimer = setInterval(tick, 100);
    talkCdTimer = myTimer;
  }

  // 本次会话里已经记过的印记（防止同一次游玩重复计数；跨局靠档案累计）
  const storyMarked = new Set();

  // ---------------- 主线（第 32 块） ----------------
  // 章节的数据结构跟「对话式奇遇」一模一样（story/talk/beats/replies），
  // 所以这里不另写一套渲染：把章节对象原样交给 openEvent，事件卡就是主线卡。
  //
  // 区别只有三点：
  //   1) 调度不同 —— 主线是「到了就必须播」，随机奇遇是「抽签」；
  //   2) 回话可以带 mark —— 选择会被记进档案（三次印记决定第 18 夜的结局）；
  //   3) 终章带 endings —— 按印记累计把最后一拍换成四个结局之一。

  // 把终章的结局预先挂到章节对象上（不改原数据，避免读档/重播串味）
  function resolveStoryChapter(ch) {
    if (!ch) return ch;
    if (!ch.endings) return ch;
    const key = storyEndingKey(storyProgress().marks);
    const end = ch.endings[key] || ch.endings.none;
    return { ...ch, __ending: end, __endingKey: key };
  }

  // 局内撞到一夜：先记「亲历」，再走事件卡
  function playStoryChapter(ch, endedRound, next) {
    const ev = resolveStoryChapter(ch);
    markStorySeen(ch.id);
    markStoryRead(ch.id);
    tryAch('story_first');
    openEvent(ev, endedRound, next);
    showToast(`第 ${ch.no} 夜 · ${ch.title}`, STORY_ARC.title);
    return ev;
  }

  // 印记写档案（同一章只算一次：重打不会刷印记）
  function recordStoryMark(kind, chapterId) {
    if (!kind || !MARK_INFO[kind]) return;
    const key = `mark:${chapterId}:${kind}`;
    if (storyMarked.has(key)) return;
    storyMarked.add(key);
    addStoryMark(kind);
  }

  function talkLine(cls, who, text) {
    if (!text) return;
    const row = document.createElement('div');
    row.className = 'tl ' + cls;
    if (who) {
      const b = document.createElement('b');
      b.textContent = who;
      row.appendChild(b);
    }
    const sp = document.createElement('span');
    sp.textContent = text;
    row.appendChild(sp);
    evTalk.appendChild(row);
    evTalk.scrollTop = evTalk.scrollHeight;
  }

  function startTalk(ev) {
    talk = { ev, beat: 0, acc: {}, paid: [], chains: [] };
    evChoices.textContent = '';
    evResult.classList.remove('on');
    evTalk.textContent = '';
    evTalk.classList.add('on');
    if (ev.story) talkLine('nar', '', ev.story);
    renderTalkBeat();
  }

  function renderTalkBeat() {
    const beat = talk.ev.talk[talk.beat];
    if (!beat) { finishTalk(); return; }
    // 上一句「对方的反应」如果还有话要说，就并进这一拍，别刷出两条连着的同人气泡
    const say = (talk.pendingClose ? talk.pendingClose + '\n' : '') + (beat.say || '');
    talk.pendingClose = '';
    talkLine('npc', beat.who || talk.ev.who || '', say);
    evChoices.textContent = '';
    for (const r of beat.replies || []) {
      evChoices.appendChild(makeChoiceBtn(r, (x) => chooseTalkReply(x)));
    }
    // 第 42/43 块：读秒 —— 这一拍先读完，按钮才亮（事件可写 readDelay 覆盖，0 = 不读秒）
    const delay = talk.ev.readDelay != null ? talk.ev.readDelay : TALK_READ_DELAY;
    armTalkCountdown([...evChoices.querySelectorAll('.ev-btn')], delay);
    evTalk.scrollTop = evTalk.scrollHeight;
  }

  function chooseTalkReply(reply) {
    if (!eventOpen || !talk) return;
    if (!canAfford(reply, { gold: coins, hp: stats.hp.cur })) return;

    const cost = reply.cost || {};
    if (cost.gold) { addCoins(-cost.gold); talk.paid.push(`金币 -${cost.gold}（已付）`); }
    if (cost.hp) {
      stats.hp.cur = Math.max(0.5, stats.hp.cur - cost.hp);
      talk.paid.push(`生命 -${cost.hp.toFixed(1)}（已付）`);
    }

    // 主线回话可以指定说话人（平时都是「你」；主线里是「奶蛙」）
    if (reply.say && reply.say !== '__ENDING__') talkLine('me', reply.as || '你', reply.say);
    mergeEffects(talk.acc, resolveRoll(reply.effects, rngOf('talk')));
    if (reply.chain) talk.chains.push(reply.chain);
    // 第 32 块：印记抉择（笑声 / 名字 / 记忆），记进档案，三次累计决定结局
    if (reply.mark) recordStoryMark(reply.mark, talk.ev.id);

    if (reply.go != null) {           // 还有下一拍：把「反应」并到下一句里
      if (reply.close) talk.pendingClose = reply.close;
      talk.beat = reply.go;
      renderTalkBeat();
      return;
    }
    if (reply.close) talkLine('npc', reply.closeAs || talk.ev.who || '', reply.close);
    finishTalk();
  }

  function finishTalk() {
    const nextRound = currentEventRound + 1;
    applyEffects(talk.acc, nextRound);
    for (const ch of talk.chains) {
      laterQueue.push({ due: currentEventRound + ch.in, kind: 'event', id: ch.id });
    }
    evChoices.textContent = '';
    evSay.textContent = '';
    evSay.style.display = 'none';     // 话都在记录里说完了，别留一条空竖线

    // 第 32 块：终章 —— 把结局接在对话记录后面（四段气泡），结果页写结局名
    const end = talk.ev && talk.ev.__ending;
    if (end) {
      for (const b of end.beats) talkLine('npc', b.who || '', b.say);
      setStoryEnding(end.key);
      tryAch('story_finish');
      const marks = storyProgress().marks;
      fillLines(evResultLines, [
        `${end.icon || '🐸'} ${end.title}`,
        `笑声 ×${marks.laughter || 0} · 名字 ×${marks.name || 0} · 记忆 ×${marks.memory || 0}`,
        end.line || '—— 这一夜，到这里为止。',
      ]);
      evResult.classList.add('on');
      evTalk.scrollTop = evTalk.scrollHeight;
      return;
    }

    const lines = talk.paid.concat(effectLines(talk.acc));
    fillLines(evResultLines, lines.length ? lines : ['这一夜，什么也没发生']);
    evResult.classList.add('on');
    evTalk.scrollTop = evTalk.scrollHeight;
  }

  // 打开事件卡：世界冻结，等玩家看完 / 选完 / 聊完
  function openEvent(ev, endedRound, next) {
    gameState = 'event';
    input.joystick.release();
    vel.set(0, 0, 0);
    currentEventRound = endedRound;
    eventNextCb = next || null;
    renderEventUI(ev);
    audio.sfx('event');            // 木门吱呀一声，故事开始
    evCard.classList.add('on');
    evCard.setAttribute('aria-hidden', 'false');
    eventOpen = true;
  }

  // 选完一个选项：扣代价 → 结算 → 排连锁 → 切到「角色的回应」结果页
  function chooseEventOption(ev, choice) {
    if (!eventOpen) return;
    const cost = choice.cost || {};
    if (!canAfford(choice, { gold: coins, hp: stats.hp.cur })) return;
    if (cost.gold) addCoins(-cost.gold);
    if (cost.hp) stats.hp.cur = Math.max(0.5, stats.hp.cur - cost.hp);

    const nextRound = currentEventRound + 1;
    // 第 53 块（用户报「概率事件点了都是『这一夜什么都没发生』」）：
    // 以前把 { roll: [...] } 原样丢给 applyEffects —— 它内部确实摇了、也确实生效了，
    // 但摇出来的那一支**没往外传**，于是 resultLines 拿到的是一个只有 roll 键的对象，
    // effectLines 认不出任何一项 → 结果页只能打兜底文案。满屏的「什么都没发生」。
    // 现在改成先摇一次（用事件种子流，种子挑战也才可复现），再拿同一份结果去结算和显示。
    const eff = resolveRoll(choice.effects || {}, rngOf('event'));
    applyEffects(eff, nextRound);
    if (choice.chain) {
      laterQueue.push({
        due: currentEventRound + choice.chain.in,
        kind: 'event',
        id: choice.chain.id,
      });
    }

    // 结果页：角色说一句 + 这一选到底改了什么
    evChoices.textContent = '';
    evSay.style.display = '';
    evSay.textContent = choice.say || '';
    const lines = effectLines(eff);
    // 概率分支摇到空手也是结果，得说出来 —— 玩家明明押了一把，
    // 不能只回他一句「金币 -5（已付）」就完事（那是扣了钱却没说输赢）。
    if (lines.length === 0 && choice.effects && choice.effects.roll) {
      lines.push('这一把落空了，什么也没拿到');
    }
    if (cost.gold) lines.unshift(`金币 -${cost.gold}（已付）`);
    if (cost.hp) lines.unshift(`生命 -${cost.hp.toFixed(1)}（已付）`);
    fillLines(evResultLines, lines.length ? lines : ['这一夜，什么也没发生']);
    evResult.classList.add('on');
  }

  evNext.addEventListener('click', closeEvent);

  function closeEvent() {
    if (!eventOpen) return;
    eventOpen = false;
    clearTalkCountdown();          // 第 42 块：关掉事件卡时把读秒停下
    evCard.classList.remove('on');
    evCard.setAttribute('aria-hidden', 'true');
    evResult.classList.remove('on');
    evTalk.classList.remove('on');
    evTalk.textContent = '';
    evSay.style.display = '';
    talk = null;
    if (gameState === 'event') gameState = 'playing';
    const next = eventNextCb;
    eventNextCb = null;
    if (next) next();
  }

  // 回合开始：事件已经挪到上一回合结束，这里只报一句本回合提示
  function onRoundStart(roundNo, tip) {
    // 号角只用三次：开局、最后一回合、其余回合留白（免得每回合都吵）
    if (roundNo === 1) audio.sfx('roundStart');
    else if (roundNo >= level.totals.rounds) audio.sfx('boss');
    showToast(`第 ${roundNo} 回合`, tip);
  }

  // ============================================================
  // 商店：每 3 回合（3/6/9/12）清空后弹出，金币购物
  // ============================================================
  const shopEl = document.getElementById('shop');
  const shSub = document.getElementById('shSub');
  const shGold = document.getElementById('shGold');
  const shList = document.getElementById('shList');
  let shopOpen = false;
  let shopAfterCb = null;      // 商店关掉后要不要继续（链式：事件→升级→商店→开打）
  let shopSerial = 0;          // 商店属性加成的 src 序号
  let shopRound = 1;           // 本次商店对应的回合号（购买解锁判定用它，测试可指定）

  // 本次商店摆的货：每进一次店重新抽 4 件（第 9 块），关掉重开不变
  let shopStock = SHOP_ITEMS.slice(0, SHOP_SHOW);
  // 本次进店已买断的货（第 25 块改）：同一件货**一次进店只能买一件**，
  // 买完就挂「售罄」—— 属性加成不能在一家店里反复叠，下次进店（回合刷新）重新上架
  let shopSoldOut = new Set();

  function openShop(roundNo, after) {
    shopAfterCb = after || null;
    shopOpen = true;
    shopRound = roundNo;
    shopSoldOut.clear();        // 新一批货，售罄记录清零
    // 抽签前先按「现在买有没有用」过滤：没环剑时的剑类、没到解锁回合的法器、
    // 放满时的炮台都不占格子（药水进背包，满血也能囤 —— 第 13 块）
    shopStock = rollShopItems(rngOf('shop'), {
      hasWeapon: weapon.granted,
      round: roundNo,
      turretCount: turrets.count(),
      relicLevels: relics.levels(),
      luck: stats.get('luck'),          // 幸运：更容易摆出金/红货（第 11 块）
    });
    gameState = 'shop';
    input.joystick.release();
    vel.set(0, 0, 0);
    shSub.textContent = `第 ${roundNo} 回合清空 · 打完这一波，来点补给？`;
    audio.sfx('card');
    renderShop();
    shopEl.classList.add('on');
    shopEl.setAttribute('aria-hidden', 'false');
  }

  function closeShop() {
    if (!shopOpen) return;
    shopOpen = false;
    shopEl.classList.remove('on');
    shopEl.setAttribute('aria-hidden', 'true');
    gameState = 'playing';
    nextShopDiscount = 0;      // 折扣是一次性的，离店即失效
    const next = shopAfterCb;
    shopAfterCb = null;
    if (next) next();
    wtPump();                  // 店里买了新种类剑 → 出来再教（不叠在货架上面）
  }
  document.getElementById('shClose').addEventListener('click', closeShop);
  shopEl.addEventListener('click', (e) => { if (e.target === shopEl) closeShop(); });

  function renderShop() {
    shGold.textContent = String(coins);
    // 民心影响市价：70 以上打八折~七五折，30 以下涨到一万一二
    const mul = repPriceMul();
    const tag = mul < 0.995 ? ` · 民心 ${Math.round(reputation)}，市价 ${Math.round(mul * 100)}%`
      : mul > 1.005 ? ` · 民心 ${Math.round(reputation)}，市价 ${Math.round(mul * 100)}%` : '';
    const deal = nextShopDiscount > 0 ? ` · 摊位折扣 ${Math.round(nextShopDiscount * 100)}%（仅本次）` : '';
    shSub.textContent = `第 ${shopRound} 回合清空 · 本店只摆 ${shopStock.length} 件${tag}${deal}`;
    shList.textContent = '';
    const shopCtx = {
      hasWeapon: weapon.granted,
      round: shopRound,
      turretCount: turrets.count(),
      relicLevels: relics.levels(),
    };
    for (const item of shopStock) {
      const rar = rarityInfo(item);
      const price = priceOf(item);
      const locked = itemLocked(item, shopCtx);
      const sold = shopSoldOut.has(item.id);   // 本次进店已买断
      const afford = coins >= price;
      const btn = document.createElement('button');
      btn.className = 'sh-item' + (sold ? ' soldout' : '');
      btn.type = 'button';
      btn.disabled = !!locked || !afford || sold;
      btn.dataset.rarity = rar.id;

      const icon = document.createElement('span');
      icon.className = 'sh-icon';
      if (item.icon) {
        const img = document.createElement('img');
        img.src = item.icon;
        img.alt = '';
        img.draggable = false;
        icon.appendChild(img);
      } else {
        icon.textContent = item.glyph || '❔';
      }

      const name = document.createElement('div');
      name.className = 'sh-name';
      name.textContent = item.name;
      // 品质角标：让「这件是金货」在挑之前就看得见
      const rank = document.createElement('span');
      rank.className = 'up-rank';
      rank.textContent = rar.name;
      name.appendChild(rank);

      const desc = document.createElement('div');
      desc.className = 'sh-desc';
      desc.textContent = sold ? '售罄 —— 下次进店再看看' : (locked || item.desc);

      const buy = document.createElement('span');
      buy.className = 'sh-buy';
      const coin = document.createElement('span');
      coin.className = 'gc-coin';
      buy.appendChild(coin);
      const priceEl = document.createElement('b');
      priceEl.textContent = String(price);
      if (price !== item.price) priceEl.classList.add('deal');
      buy.appendChild(priceEl);

      btn.append(icon, name, desc, buy);
      btn.addEventListener('click', () => buyItem(item));
      shList.appendChild(btn);
    }
  }

  function buyItem(item) {
    if (shopSoldOut.has(item.id)) {   // 售罄的货：锁扣「咚」一声拒绝（第 25 块）
      audio.sfx('soldout');
      return;
    }
    const price = priceOf(item);      // 民心影响售价
    if (!adminOn && coins < price) { audio.sfx('soldout'); return; }
    const locked = itemLocked(item, {
      hasWeapon: weapon.granted,
      round: shopRound,
      turretCount: turrets.count(),
      relicLevels: relics.levels(),
    });
    if (locked) return;
    if (adminOn) coins = ADMIN_GOLD; else coins -= price;
    renderGold();
    bumpStat('spent', price);         // 战绩：累计消费（shop_20 成就）
    // 炮台 / 法器 / 富裕相关的即时成就
    if (item.type === 'turret' && turrets.count() + 1 >= TURRET.MAX_COUNT) tryAch('turret_3');

    if (item.type === 'heal' || item.type === 'healFull') {
      // 药水不再立刻喝（第 13 块）：进背包，作战中随时打开喝
      const id = item.type === 'healFull' ? 'bigPotion' : 'potion';
      bagAdd(id);
      audio.sfx('buy');
      showToast(item.name, `收进背包（背包里现有 ${bagCount()} 件）`);
    } else if (item.type === 'stat') {
      shopSerial++;
      // scope:'weapon' 的商品（剑油 / 磨剑石）改武器表，其余改主角表
      const target = item.scope === 'weapon' ? wstats : stats;
      target.addMod({
        stat: item.stat, flat: item.flat || 0, pct: item.pct || 0,
        src: `shop:${item.id}:${shopSerial}`,
      });
      if (item.stat === 'maxHp') target.syncHp(item.heal || 0);
      if (item.stat === 'aegis' && !aegisActive && aegisCycle <= 0) aegisReset();
      showToast(item.name, '永久生效 · ' + item.desc);
    } else if (item.type === 'sword') {
      const firstOfKind = !weapon.kindCounts()[item.kind];   // 这个种类第一次上环
      weapon.addSword(item.kind);
      showToast(`${SWORD_KINDS[item.kind].name} 入列`, `环上现在有 ${weapon.count} 把剑在转`);
      renderSkill();
      // 新种类剑：离店后自动弹一次用法教程（可跳过）
      if (firstOfKind) queueWeaponTut(item.kind, null);
    } else if (item.type === 'turret') {
      const t = turrets.spawn(pos);
      showToast(item.name, t ? `已立起（场上 ${turrets.count()}/${TURRET.MAX_COUNT} 台）· 本局一直在` : '放不下了');
    } else if (item.type === 'relic') {
      const lv = relics.buy(item.relic);
      const def = RELIC_DEFS[item.relic];
      showToast(`${def.name} ${lv} 级`, def.desc[lv - 1] + (lv < def.maxLevel ? ' · 再买可升级' : ' · 已满级'));
    }
    renderHud();
    shopSoldOut.add(item.id);   // 买断：这件货本次进店售罄（renderShop 会挂上售罄态）
    renderShop();   // 刷新金币与按钮可用态（面板保持打开，可以连买别的）
  }

  // 回合清空后的编排：
  //   第 5 回合（weaponAt）打完 → 武器卡 → 三选一（若有）→ 商店（若有）
  //   其余回合   → 三选一（若有）→ 商店（若有）→ 2.6 秒后下一回合
  // 回合清空后的编排（第 7 块：全部挪到「回合结束」这一侧）：
  //   清上回合临时效果 → 武器卡（第 5 回合）→ 夜行奇遇 → 三选一 → 商店 → 下一回合
  //   第 15 回合是最后一关：不弹事件、不弹商店，选完升级直接结算。
  function handleRoundClear(roundNo) {
    clearRoundBuffs();
    const isLast = roundNo >= level.totals.rounds;

    const runUpgrade = () => {
      const runShop = () => {
        if (!isLast && level.shouldShop(roundNo) && !DEBUG_SKIP_NARRATIVE) openShop(roundNo, null);
      };
      if (level.shouldUpgrade(roundNo)) showUpgrade(roundNo, runShop);
      else runShop();
    };

    const runEvent = () => {
      if (isLast || DEBUG_SKIP_NARRATIVE) { runUpgrade(); return; }
      // 0) 主线优先（第 32 块）：这一关走到该播的那一夜，就先播夜。
      //    主线不占随机池、也不消耗「最近出过」的名额 —— 它是路，不是签。
      const chap = storyChapterAt(curLevelId, roundNo, storyProgress().seen);
      if (chap) { playStoryChapter(chap, roundNo, runUpgrade); return; }
      // 1) 到期的连锁优先兑现（剧情不能爽约）
      const dueIdx = laterQueue.findIndex((q) => q.due <= roundNo);
      if (dueIdx >= 0) {
        const q = laterQueue.splice(dueIdx, 1)[0];
        if (q.kind === 'event') {
          const chev = getEventById(q.id);
          if (chev) { openEvent(chev, roundNo, runUpgrade); return; }
        } else if (q.effects) {
          applyEffects(q.effects, roundNo + 1, { permanent: true });
        }
      }
      // 2) 抽一个随机事件
      const ev = pickEvent(
        {
          round: roundNo + 1, hasWeapon: weapon.granted, gold: coins,
          rep: reputation, hp: stats.hp.cur, luck: stats.get('luck'),
          levelId: curLevelId,          // 第 29 块：第三关专属奇遇靠它筛
        },
        seenEvents,
        rngOf('event')
      );
      if (!ev) { runUpgrade(); return; }
      seenEvents.push(ev.id);
      if (seenEvents.length > 8) seenEvents.shift();
      codexAdd('events', ev.id);        // 图鉴：遇见过的奇遇点亮
      openEvent(ev, roundNo, runUpgrade);
    };

    // 武器卡排在最前：拿到环剑之后抽到的事件才可能出现「夜风顺了」
    // 卡片关掉 → 武器教程（只教第一次）→ 再接事件
    if (roundNo >= level.level.weaponAt && !weapon.granted) {
      grantRingThen(runEvent);
      return;
    }
    runEvent();
  }

  // 第 56 块（用户定案）：后续关卡开局自带环剑。
  // 条件：以前拿到过（profile.ringGot）+ 这一关不是第一关 + 现在手上没有。
  // 送的就是最初的 3 把铁剑；第二关起顺带把箭雨一并解锁（它本来就是「第二关起」的武器）。
  // 教程不重播 —— queueWeaponTut 内部看 wtSeen，老玩家早就看过了；
  // 真没看过的（比如清过教程记录）会补教，比让他拿着一格不会用的技能栏好。
  function prefillRing() {
    if (weapon.granted) return;            // 这一局已经有了（续读的存档在这里之前已 restore）
    if (curLevelId < 2) return;            // 第一关保留「第 5 回合获得」的仪式时刻
    if (!ringObtained()) return;           // 没拿到过就不送
    weapon.grant();
    if (curLevelId >= 2) arrowRain.unlock();
    renderSkill();
    codexAdd('swords', 'ring');
    tryAch('first_sword');
    showToast('环剑已在手', '这一关开局就带着 3 把铁剑，技能栏第 1 格就是万剑齐发');
    queueWeaponTut('ring');
    if (curLevelId >= 2) queueWeaponTut('arrowrain');
  }

  // 第一次拿到环剑：武器卡 → 用法教程 → 接续回合链
  function grantRingThen(next) {
    weapon.grant();
    // 第 56 块（用户定案）：拿到过就记进档案 —— 之后从第二关起开局直接送 3 把铁剑
    markRingObtained();
    // 第 47 块（用户定案）：第一关只允许出现剑；第二关起解锁箭雨
    const withRain = curLevelId >= 2;
    if (withRain) {
      arrowRain.unlock();
      renderSkill();
      showToast('新武器 · 箭雨', '技能栏第 2 格：在最近的怪物头顶落一阵箭雨，冷却 8 秒');
    }
    renderSkill();
    codexAdd('swords', 'ring');     // 图鉴（武器页签按种类也记，这里记首次获得）
    tryAch('first_sword');
    // 第 53 块（用户报「箭雨拿到后没提示没教程」）：武器卡 → 环剑教程 → 箭雨教程 → 回合链。
    // 必须用回调串，不能两个都塞进队列 —— 队列是先到先教，直接 push 会让箭雨抢在环剑前面。
    showWeaponCard(() => queueWeaponTut(
      'ring',
      withRain ? () => queueWeaponTut('arrowrain', next) : next
    ));
  }


  // ---------------- 关卡（第 20 块：一关/二关共用同一套回合机器） ----------------
  // level 是可变的：选关或读档时整体重建（createLevel 只吃数据，没有别的副作用）。
  // 局中绝不切换 —— 回合机器、存档快照都按当前这一关解释。
  let curLevelId = 1;
  const levelDeps = {
    enemies, fx,
    getPlayerPos: () => pos,
    onRound: (cur, total, tip) => {
      setRoundLabel(cur, total);
      // 回合开始只报一句提示：事件已经改到上一回合结束时弹
      onRoundStart(cur, tip);
      saveRunAtRound(cur);      // 存档续玩：每回合开始落一次快照
    },
    onRoundClear: handleRoundClear,
    onVictory: () => endGame(true),
  };
  let level = createLevel(LEVEL_1, levelDeps);

  // 切关卡：重建回合机器 + 换场景皮肤 + 换场地半径（第三关更大，第 33 块）。id 不认识就回落到第一关。
  function setLevel(id) {
    curLevelId = LEVELS_BY_ID[id] ? id : 1;
    level = createLevel(LEVELS_BY_ID[curLevelId], levelDeps);
    setSceneTheme(level.level.theme || 'meadow');
    setArenaRadius(level.level.arena || 15);
    return level;
  }

  // ---------------- 存档续玩（第 17 块） ----------------
  // 每回合开始把「回合刚开始」的局面写进 localStorage；结算删档。
  // 恢复 = 数值回填 + 各模块 restore() + wave.startAt(回合)。
  const btnResume = document.getElementById('btnResume');
  function saveRunAtRound(roundNo) {
    if (DEBUG && !params.has('keepsave')) return;   // 调试局不落档（测试互相覆盖）
    if (adminOn) return;                            // 管理员沙盒：不写续玩存档
    runSave.saveRun({
      uid: runUid,             // 第 38 块：按本局身份 upsert，不同存档互不覆盖
      level: curLevelId,        // 读档要回到同一关（第二关的回合表跟一关不一样）
      round: roundNo,
      rounds: level.totals.rounds,  // 卡片上显示「第 X / 总 回合」
      roundMod: { ...level.roundMod },
      coins,
      rep: reputation,
      discount: nextShopDiscount,
      kills,
      elapsed,
      upgradesTaken,
      upSerial,
      shopSerial,
      hp: stats.hp.cur,
      playerMods: stats.dumpMods(),
      weapon: { granted: weapon.granted, owned: weapon.owned, mods: wstats.dumpMods() },
      arrowRain: arrowRain.snapshot(),   // 第 47 块：箭雨解锁状态进档
      turrets: turrets.list(),
      relics: relics.levels(),
      bag: { ...bag },
      diff: getDifficulty() === DIFFS.normal ? null : (profile().difficulty || 'normal'),
      rarities: [...runRarities],
      // 第 21 / 22 块：诅咒、种子、每日挑战标记都要进档，否则续玩会变成「无诅咒白拿倍率」
      curses: pendingCurses.slice(),
      seed: runSeed,
      daily: dailyMode,
      dailyStamp,
      seedPlay: customSeed ? { seed: customSeed.seed, code: customSeed.code, text: customSeed.text } : null,
      prevDiff: diffOverride,
    });
  }

  function refreshResume() {
    // 第 38 块：主菜单只亮一个「读取存档」入口，点进去看全部存档卡
    btnResume.hidden = !runSave.hasRun();
    btnResume.textContent = '读取存档';
  }

  // 第 38 块：读取存档列表。按退出时间升序（早的在上，对应「时间先后 · 自上而下」）。
  const saveList = document.getElementById('saveList');
  const saveListBox = document.getElementById('saveListBox');
  function fmtSaveTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function renderSaveList() {
    const all = runSave.loadRuns().slice().sort((a, b) => a.at - b.at);
    saveListBox.textContent = '';
    if (!all.length) {
      const empty = document.createElement('div');
      empty.className = 'save-empty';
      empty.textContent = '还没有存档 —— 去打一关，中途退出会自动留在这里';
      saveListBox.appendChild(empty);
      return;
    }
    for (const rec of all) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'save-item';
      const lvName = (LEVELS_BY_ID[rec.level] && LEVELS_BY_ID[rec.level].name) || (`第 ${rec.level} 关`);
      const roundTxt = rec.rounds ? `第 ${rec.round} / ${rec.rounds} 回合` : `第 ${rec.round} 回合`;
      const diffName = (rec.diff && DIFFS[rec.diff] && DIFFS[rec.diff].name) ? DIFFS[rec.diff].name : '普通';
      const name = document.createElement('div');
      name.className = 'save-lv';
      name.textContent = lvName;
      const meta = document.createElement('div');
      meta.className = 'save-meta';
      const rEl = document.createElement('span');
      rEl.className = 'save-round';
      rEl.textContent = roundTxt;
      const dEl = document.createElement('span');
      dEl.className = 'save-diff';
      dEl.textContent = diffName;
      meta.append(rEl, dEl);
      const tEl = document.createElement('div');
      tEl.className = 'save-time';
      tEl.textContent = '退出于 ' + fmtSaveTime(rec.at);
      item.append(name, meta, tEl);
      item.addEventListener('click', () => { hideSub(saveList); resumeGame(rec.uid); });
      saveListBox.appendChild(item);
    }
  }
  function openSaveList() {
    renderSaveList();
    showSub(saveList);
  }

  function resumeGame(uid) {
    let saved = uid != null ? runSave.loadRunByUid(uid) : null;
    if (!saved) {                       // 没指定 uid（调试入口）就取最近一次
      const all = runSave.loadRuns();
      if (!all.length) return;
      all.sort((a, b) => b.at - a.at);
      saved = all[0];
    }
    runUid = saved.uid;                 // 读档后继续往同一张卡上写
    audio.unlock();
    if (ttSaved) ttSaved.hidden = true; // 已经读档进去了，标题页那句「刚存档」收掉
    audio.playBgm('battle');
    tutAsk.classList.remove('on');
    tutAsk.setAttribute('aria-hidden', 'true');
    titleScr.classList.add('off');
    titleScr.setAttribute('aria-hidden', 'true');
    setTimeout(() => { titleScr.style.display = 'none'; }, 340);

    // 数值回填（与 saveRunAtRound 一一对应）
    coins = saved.coins || 0;
    if (adminOn) coins = ADMIN_GOLD;   // 管理员模式读档后照样无限
    reputation = saved.rep != null ? saved.rep : REP_START;
    nextShopDiscount = saved.discount || 0;
    kills = saved.kills || 0;
    elapsed = saved.elapsed || 0;
    upgradesTaken = saved.upgradesTaken || 0;
    upSerial = saved.upSerial || 0;
    shopSerial = saved.shopSerial || 0;
    stats.loadMods(saved.playerMods, saved.hp);
    weapon.restore(saved.weapon);
    arrowRain.restore(saved.arrowRain);   // 第 47 块
    turrets.restore(saved.turrets);
    relics.restore(saved.relics);
    // 第 58 块：局外商店的永久法器叠在「本局店内买到的」之上（buy 自带 3 级封顶，安全），
    // 技能CD倍率也要在续玩时一并生效。
    {
      const ms = metaShopState();
      if (ms.relics && Object.keys(ms.relics).length) {
        relics.restore({ ...saved.relics, ...ms.relics });
      }
      const m = Math.max(0.3, ms.skillCdMul || 1);
      if (weapon.setCdMul) weapon.setCdMul(m);
      if (arrowRain.setCdMul) arrowRain.setCdMul(m);
    }
    runRarities = new Set(saved.rarities || []);   // 本局品质集合一并恢复
    // 注意顺序：diffOverride 在下面几行才赋值，这里直接读存档里的 prevDiff
    if (saved.diff && DIFFS[saved.diff]) {
      profile().difficulty = saved.diff;
      setDifficulty(saved.prevDiff || saved.diff);
    } else if (saved.prevDiff) {
      setDifficulty(saved.prevDiff);
    }
    setLevel(saved.level || 1);       // 存档记着这一局是哪一关
    // 第 21 / 22 块：诅咒与种子跟着存档回来。mods 里已经带着 src='curse' 回放了，
    // 这里只补「受伤加重」（它不是属性表里的字段）和随机流。
    pendingCurses = curseList(saved.curses || []).map((c) => c.id);
    runCurseDmg = curseDmg(pendingCurses);
    dailyMode = !!saved.daily;
    dailyStamp = saved.dailyStamp || dayKey();
    dailySeedNow = saved.seed >>> 0;
    customSeed = saved.seedPlay || null;   // 第 49 块：种子局续玩（rules 不需要，开局才用）
    diffOverride = saved.prevDiff || (saved.daily ? DAILY_RULES.diff : null);
    initRunRng(saved.seed || 0);
    clearCurse();
    for (const [id, n] of Object.entries(saved.bag || {})) {
      if (id in BAG_ITEMS) bag[id] = Math.max(0, n | 0);
    }
    renderBagBtn();

    // 界面复位：续玩的人不需要再教怎么拖摇杆
    tutCard.classList.remove('on');
    tutCard.setAttribute('aria-hidden', 'true');
    hintDone = true;
    hintEl.classList.add('off');
    renderHud();
    renderSkill();
    gameState = 'playing';
    level.startAt(saved.round, saved.roundMod);   // 里面会触发 onRound → 立刻重写一次快照
  }

  btnResume.addEventListener('click', openSaveList);
  document.getElementById('saveBack').addEventListener('click', () => hideSub(saveList));

  // 第 38 块：关网页/切后台时补一次最新快照，让「退出时间」落在真正离开的那一刻
  // （onRound 每回合也写，但最后一回合到退出之间不会再触发）。
  function saveRunOnExit() {
    if (gameState !== 'playing') return;   // 已结算 / 标题页不写，避免覆盖或误建
    if (level.roundNo < 1) return;         // 第一回合还没真正开始，不写退化存档
    saveRunAtRound(level.roundNo);
  }
  window.addEventListener('pagehide', saveRunOnExit);
  window.addEventListener('beforeunload', saveRunOnExit);

  // ---------------- 游戏内「存档并退出」（第 40 块） ----------------
  // 以前中途想停只能直接关网页：靠 pagehide 兜底落档，玩家根本不知道存没存上。
  // 现在给一个明面上的出口：写一份存档 → 回主菜单 → 标题页写清「存到第几回合」。
  const ttSaved = document.getElementById('ttSaved');
  async function saveAndExit() {
    if (gameState !== 'playing') return;       // 只在真正开打时可用
    const ok = await askConfirm('存档并退出？',
      '当前进度会存成一份存档，主菜单「读取存档」里能接着打。\n' +
      '这一局不算失败，也不会结算骨币。',
      { okText: '存档退出', cancelText: '继续游戏' });
    if (!ok || gameState !== 'playing') return;   // 弹窗期间可能已经结算
    audio.sfx('uiSwitch');
    const roundNo = level.roundNo;
    // 已通关待领火种的局不再建存档（那份档结算时已经删掉了，别让它复活）
    const savedNow = roundNo >= 1 && pendingClearUid == null;
    if (savedNow) saveRunAtRound(roundNo);
    input.joystick.release();
    vel.set(0, 0, 0);
    gameState = 'title';                          // 主循环随之停摆，敌人定格在标题页后面
    if (ttSaved) {
      ttSaved.hidden = false;
      ttSaved.textContent = savedNow
        ? `已存档 · 第 ${roundNo} / ${level.totals.rounds} 回合 —— 点「读取存档」接着打`
        : '已退出 · 这一局没有留下存档';
    }
    showTitle();
  }
  exitBtn.addEventListener('click', saveAndExit);

  // ---------------- 成就 / 图鉴 / 战绩（第 18 块） ----------------
  // 解锁即弹 toast（战斗中的提示条）；已解锁的重复调用是空操作。
  function tryAch(id) {
    if (!unlockAch(id)) return false;
    const a = achById(id);
    showToast('成就解锁 · ' + a.name, a.desc);
    audio.sfx('ach');       // 第 25 块：解锁铃（原来是蹭页签切换声）
    return true;
  }
  // 跨局累计型成就统一在结算时对一次表；即时型（喝药/挡刀）在各埋点单独查
  function checkCumulativeAchs({ isWin, roundShown }) {
    const st = profile().stats;
    if (st.kills >= 100) tryAch('kills_100');
    if (st.kills >= 500) tryAch('kills_500');
    if (st.kills >= 1500) tryAch('kills_1500');
    if (st.wins >= 3) tryAch('wins_3');
    if (st.wins >= 10) tryAch('wins_10');
    if (st.potions >= 10) tryAch('potion_10');
    if (st.blocks >= 10) tryAch('aegis_10');
    if (st.spent >= 200) tryAch('shop_20');
    if (st.runs >= 1) tryAch('first_run');
    if (isWin) {
      tryAch('first_win');
      if (elapsed < 600) tryAch('win_fast');
      if (!weapon.granted) tryAch('win_no_sword');
      if (stats.hp.cur < 2) tryAch('low_hp_win');
      if (getDifficulty() === DIFFS.hell) tryAch('hell_win');
    }
    if (roundShown >= 10) tryAch('round_10');
    if (roundShown >= 15) tryAch('round_15');
    if (kills >= 100) tryAch('run_kills_100');
    if (kills >= 200) tryAch('run_kills_200');
    if (upgradesTaken >= 10) tryAch('cards_10');
    if (runRarities.size >= 5) tryAch('cards_all_kinds');
    if (stats.get('luck') >= 10) tryAch('lucky_10');
    if (turrets.count() >= 3) tryAch('turret_3');
    if (relics.levels().spikes > 0 && relics.levels().frost > 0 && turrets.count() >= 1) tryAch('all_relics');
  }
  // 本局拿到过的品质档（cards_all_kinds 用），开局清空
  let runRarities = new Set();

  // ---------------- 图鉴面板 ----------------
  const codexScr = document.getElementById('codexScr');
  const cxTabs = document.getElementById('cxTabs');
  const cxList = document.getElementById('cxList');
  const cxFoot = document.getElementById('cxFoot');
  let cxTab = 'enemies';

  // 第 57 块：图鉴分块渲染 + 签名缓存 + 空闲预热
  //   · 奇遇页签 112 条，逐条建 DOM 在老手机上要几百毫秒（一点开就卡住）→
  //     改成每帧最多建 CX_CHUNK 条，让出主线程；
  //   · 建完缓存一份（签名 = 页签 + 本机图鉴档案），下次打开签名没变就直接
  //     整块克隆塞进去，秒开；
  //   · 标题页停留 CX_PREWARM_MS 没人动 → 默默把缓存建好（用户建议的
  //     「主界面停留时自动缓存」）。预热建在游离 fragment 上，不碰界面。
  const CX_CHUNK = 24;
  const CX_PREWARM_MS = 1200;
  let cxCache = { sig: '', frag: null };
  let cxBuild = 0;          // 分批建造的 rAF 句柄（切页签 / 关面板时作废）
  let cxPrewarmTimer = 0;

  function cxSignature(tab) {
    // 图鉴档案（遇过哪些事件 / 击倒多少怪）全量进签名 —— 任何变化都算过期
    return `${tab}|${JSON.stringify(profile().codex || {})}`;
  }

  function cxItem(en) {
    const item = document.createElement('div');
    item.className = 'cx-item' + (en.seen ? '' : ' dim');
    if (en.color) item.style.borderColor = en.color + '55';
    // 第 51 块：有缩略图的（怪物页签）走「左图右文」，文字塞进 .cx-body
    let box = item;
    if (en.thumb) {
      item.classList.add('has-thumb');
      const img = document.createElement('img');
      img.className = 'cx-thumb';
      img.src = en.thumb;
      img.alt = en.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      item.appendChild(img);
      box = document.createElement('div');
      box.className = 'cx-body';
      item.appendChild(box);
    }
    const title = document.createElement('div');
    title.className = 'cx-title';
    if (en.color) title.style.color = en.color;
    title.textContent = en.title;
    const sub = document.createElement('div');
    sub.className = 'cx-sub';
    sub.textContent = en.sub || '';
    box.append(title, sub);
    if (en.desc) {
      const desc = document.createElement('div');
      desc.className = 'cx-desc';
      desc.textContent = en.desc;
      box.appendChild(desc);
    }
    if (en.meta) {
      const meta = document.createElement('div');
      meta.className = 'cx-meta';
      meta.textContent = en.meta;
      box.appendChild(meta);
    }
    return item;
  }

  // 分块把条目建进 host（cxList 或游离 fragment）；建完回调（写缓存用）
  function cxBuildInto(host, entries, done) {
    let i = 0;
    const step = () => {
      const end = Math.min(entries.length, i + CX_CHUNK);
      for (; i < end; i++) host.appendChild(cxItem(entries[i]));
      if (i < entries.length) {
        cxBuild = requestAnimationFrame(step);
      } else if (done) {
        done();
      }
    };
    step();
  }

  function renderCodex() {
    if (cxBuild) { cancelAnimationFrame(cxBuild); cxBuild = 0; }
    cxTabs.textContent = '';
    const sum = codexSummary();
    for (const t of CODEX_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tab = t.id;
      b.textContent = t.id === 'events' ? `${t.name} ${sum.eventsSeen}/${sum.events}` : t.name;
      if (t.id === cxTab) b.classList.add('on');
      b.addEventListener('click', () => { cxTab = t.id; renderCodex(); });
      cxTabs.appendChild(b);
    }
    cxList.textContent = '';
    const entries = codexEntries(cxTab);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'cx-empty';
      empty.textContent = '这里空空如也';
      cxList.appendChild(empty);
    } else {
      // 命中缓存（页签 + 图鉴档案都没变）→ 整块克隆，秒开
      const sig = cxSignature(cxTab);
      if (cxCache.sig === sig && cxCache.frag) {
        cxList.appendChild(cxCache.frag.cloneNode(true));
      } else {
        // 现场分块建（顺便写缓存，下次就热了）
        cxBuildInto(cxList, entries, () => {
          cxCache = { sig, frag: cxList.cloneNode(true) };
        });
      }
    }
    cxFoot.textContent = cxTab === 'events'
      ? `遇见过的奇遇会亮起来 —— 共 ${sum.events} 个，已遇 ${sum.eventsSeen} 个`
      : '怪物会记下你击倒它们的次数 · 事件遇到一次就点亮';
  }

  // 标题页停留一会儿没人动 → 默默把图鉴缓存建好（用户建议的「自动缓存」）
  function scheduleCodexPrewarm() {
    clearTimeout(cxPrewarmTimer);
    cxPrewarmTimer = setTimeout(() => {
      if (gameState !== 'title') return;                  // 已经进游戏了，不抢前台
      const sig = cxSignature(cxTab);
      if (cxCache.sig === sig && cxCache.frag) return;    // 已经是热的
      const off = document.createDocumentFragment();
      cxBuildInto(off, codexEntries(cxTab), () => { cxCache = { sig, frag: off }; });
    }, CX_PREWARM_MS);
  }

  function showCodex() {
    renderCodex();
    showSub(codexScr);
  }

  document.getElementById('btnCodex').addEventListener('click', showCodex);
  document.getElementById('cxBack').addEventListener('click', () => {
    if (cxBuild) { cancelAnimationFrame(cxBuild); cxBuild = 0; }   // 关面板就不建了
    hideSub(codexScr);
  });

  // ---------------- 礼包兑换（第 44 块）----------------
  // 纯前端：码表在 gift.js 里只存哈希；「用过没有」记在本机档案 profile.gifts。
  // 换设备 / 清缓存 = 记录清零，同一个码能再用一次 —— 这是不联网的极限。
  const giftScr = document.getElementById('giftScr');
  const giftCode = document.getElementById('giftCode');
  const giftRedeem = document.getElementById('giftRedeem');
  const giftMsg = document.getElementById('giftMsg');
  const giftBoneNum = document.getElementById('giftBoneNum');
  const giftLogBox = document.getElementById('giftLog');

  function giftSay(text, kind) {
    giftMsg.textContent = text || '';
    giftMsg.className = 'gf-msg' + (text ? ` on ${kind || ''}` : '');
  }

  function renderGiftLog() {
    const log = giftLog();
    const rows = Object.keys(log)
      .map((h) => ({ h, at: log[h] }))
      .sort((a, b) => b.at - a.at);
    giftLogBox.textContent = '';
    if (!rows.length) { giftLogBox.classList.remove('on'); return; }
    giftLogBox.classList.add('on');
    const head = document.createElement('h4');
    head.textContent = `本机已兑换 ${rows.length} 个礼包`;
    giftLogBox.appendChild(head);
    for (const r of rows.slice(0, 8)) {
      const info = giftByHash(r.h);
      const row = document.createElement('div');
      row.className = 'gf-row';
      const tier = document.createElement('span');
      tier.className = 'gf-tier' + (info.tier === 'B' ? ' b' : '');
      // 第 57 块：有组名（宣传礼包 / 推荐礼包）就报组名，第一批老码照旧报 A/B 类
      tier.textContent = info.name
        ? `${info.name} · +${info.bones} 骨币`
        : (info.tier === '?' ? '礼包' : `${info.tier} 类 · +${info.bones} 骨币`);
      const when = document.createElement('span');
      when.className = 'gf-when';
      when.textContent = fmtSaveTime(r.at);
      row.append(tier, when);
      giftLogBox.appendChild(row);
    }
  }

  function doRedeem() {
    if (!normalizeCode(giftCode.value)) {
      giftSay('先把手里的礼包码填进去', 'err');
      return;
    }
    const hit = lookupGift(giftCode.value);
    if (!hit) {
      giftSay('没有这个礼包码 —— 看看有没有漏字或打错，横杠和大小写都不影响', 'err');
      audio.sfx('soldout');
      return;
    }
    if (giftRedeemed(hit.hash)) {
      giftSay('这个礼包码在本机已经用过了，一个码只能换一次', 'err');
      audio.sfx('soldout');
      return;
    }
    addBones(hit.bones);
    markGift(hit.hash);
    giftCode.value = '';
    // 第 57 块：宣传礼包 / 推荐礼包直接报组名；第一批老码报「A 类 / B 类」
    const what = hit.name || `${hit.tier} 类礼包`;
    giftSay(`兑换成功 —— ${what}，+${hit.bones} 骨币`, 'ok');
    giftBoneNum.textContent = adminOn ? '∞' : String(bones());
    renderCampBadge();               // 主菜单篝火角标同步长钱
    renderGiftLog();
    audio.sfx('card');
  }

  function showGift() {
    giftBoneNum.textContent = adminOn ? '∞' : String(bones());
    giftCode.value = '';
    giftSay('', '');
    renderGiftLog();
    showSub(giftScr);
  }

  giftRedeem.addEventListener('click', doRedeem);
  giftCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doRedeem(); }
  });
  document.getElementById('btnGift').addEventListener('click', showGift);
  document.getElementById('giftBack').addEventListener('click', () => hideSub(giftScr));

  // ---------------- 公告（第 45 块）----------------
  // 照搬 naiwa-step 那套：进主界面自动弹一次，「日期 + 公告版本」写在本机；
  // 勾了「今日内不再弹出」当天就不再自动弹。改了公告内容把 NOTICE_VER +1，
  // 之前勾过的人也会重新看到一次。主菜单「公告」按钮则永远能强制回看。
  const NOTICE_VER = '2';   // v2：一人一AI / 新武器新怪创意 / 评估后发码
  const NOTICE_KEY = 'naiwa_rouge_notice_v1';   // 已在 profile.js 的 RESET_KEYS 里，重置进度会一起清掉
  const noticeOv = document.getElementById('noticeOv');
  const noticeHideToday = document.getElementById('noticeHideToday');

  const noticeToday = () => {
    const n = new Date();
    return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`;
  };

  // 一键复制：优先用 clipboard API；老 WebView / 非 https 环境用 textarea + execCommand 兜底
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) { /* 继续兜底 */ }
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { /* 不支持就算了 */ }
    ta.remove();
    return ok;
  }

  // 复制按钮走事件委托（只绑一次）：成功变「✅ 已复制」，1.6 秒后还原
  noticeOv.addEventListener('click', async (e) => {
    const b = e.target.closest('.notice-copy');
    if (!b) return;
    const old = b.textContent;
    const ok = await copyText(b.dataset.copy || '');
    b.textContent = ok ? '✅ 已复制' : '❌ 复制失败';
    if (ok) audio.sfx('card');
    setTimeout(() => { b.textContent = old; }, 1600);
  });

  function closeNotice() {
    if (noticeHideToday.checked) {
      try {
        localStorage.setItem(NOTICE_KEY, `${noticeToday()}|${NOTICE_VER}`);
      } catch (_) { /* 隐私模式写不进就算了，下次还会弹 */ }
    }
    noticeOv.classList.remove('on');
    noticeOv.setAttribute('aria-hidden', 'true');
    // 第 57 块：公告关掉 → 350ms 后「宣传有礼」接着上场（艺术字特效 → 公告二）。
    // 第 59 块：中间插入每日签到 —— 公告 → 签到（今天没签才拦）→ 宣传有礼。
    // 只在标题页链，调试直开 / 游戏中都不走这条。
    setTimeout(() => { afterNoticeChain(); }, 350);
  }

  // force=true = 从主菜单点「📢 公告」强制打开（忽略「今日不再弹出」）
  function showNotice(force) {
    if (!force) {
      let seen = '';
      try { seen = localStorage.getItem(NOTICE_KEY) || ''; } catch (_) { seen = ''; }
      if (seen === `${noticeToday()}|${NOTICE_VER}`) return false;   // 今天这一版已经关过
    }
    noticeHideToday.checked = false;
    noticeOv.classList.add('on');
    noticeOv.setAttribute('aria-hidden', 'false');
    return true;
  }

  document.getElementById('noticeOk').addEventListener('click', closeNotice);
  document.getElementById('noticeX').addEventListener('click', closeNotice);
  document.getElementById('btnNotice').addEventListener('click', () => showNotice(true));

  // ---------------- 宣传有礼（第 57 块）----------------
  // 用户原话：公告位置有限，关掉公告后先弹一记「宣传有礼」艺术字特效，
  // 特效消散变成公告标题，再展开正文（公告二）。规则照搬公告那套：
  // 「日期 + 版本」写本机，勾「今日不再弹出」当天不自动弹；
  // 主菜单「🎁 宣传有礼」随时强制回看。两种拿码方式都要联系本人，
  // 所以正文里带 QQ 和网址的一键复制（和公告同一个 copyText）。
  const PROMO_VER = '1';   // v1：宣传有礼上线（推荐 100 / 发视频 300 / 赞评藏各 5）
  const PROMO_KEY = 'naiwa_rouge_promo_v1';   // 与公告键分开，各记各的「今天」
  const PROMO_ART_MS = 1500;                  // 艺术字特效时长（与 CSS 动画对齐）
  const promoOv = document.getElementById('promoOv');
  const promoHideToday = document.getElementById('promoHideToday');
  let promoTimer = 0;

  // 公告里那套复制按钮的 delegation 照搬一份（notice-copy 类复用）
  promoOv.addEventListener('click', async (e) => {
    const b = e.target.closest('.notice-copy');
    if (!b) return;
    const old = b.textContent;
    const okCopy = await copyText(b.dataset.copy || '');
    b.textContent = okCopy ? '✅ 已复制' : '❌ 复制失败';
    if (okCopy) audio.sfx('card');
    setTimeout(() => { b.textContent = old; }, 1600);
  });

  function closePromo() {
    if (promoHideToday && promoHideToday.checked) {
      try {
        localStorage.setItem(PROMO_KEY, `${noticeToday()}|${PROMO_VER}`);
      } catch (_) { /* 隐私模式写不进就算了，下次还会弹 */ }
    }
    clearTimeout(promoTimer);
    promoOv.classList.remove('on', 'art');
    promoOv.setAttribute('aria-hidden', 'true');
  }

  // force=true = 主菜单点开（忽略「今日不再弹」）；art=true = 先播艺术字特效
  function showPromo(force, art) {
    if (!force) {
      let seen = '';
      try { seen = localStorage.getItem(PROMO_KEY) || ''; } catch (_) { seen = ''; }
      if (seen === `${noticeToday()}|${PROMO_VER}`) return false;   // 今天这一版已经关过
    }
    if (promoHideToday) promoHideToday.checked = false;
    clearTimeout(promoTimer);
    promoOv.classList.add('on');
    promoOv.setAttribute('aria-hidden', 'false');
    if (art) {
      // 艺术字先上（盖在正文上），到点散去，标题和正文才亮相
      promoOv.classList.add('art');
      promoTimer = setTimeout(() => promoOv.classList.remove('art'), PROMO_ART_MS);
    } else {
      promoOv.classList.remove('art');
    }
    audio.sfx('boon');
    return true;
  }

  document.getElementById('promoOk').addEventListener('click', closePromo);
  document.getElementById('promoX').addEventListener('click', closePromo);
  document.getElementById('btnPromo').addEventListener('click', () => showPromo(true, false));

  // ---------------- 每日签到（第 59 块）----------------
  // 用户定案：以周为大单位、日为小单位。周一 00:00 开新的一周（进度清零），
  // 每天签到 +20 骨币，一周内累计 3 天 +100、6 天 +200（不要求连续）。
  // 触发链路：公告关掉 → 今天没签就弹签到 → 关掉签到再弹宣传有礼（各每天一次）。
  // 主菜单「今日挑战」那一排有常驻入口，没签的那天按钮上有个红点。
  // 数据与日期计算全在 js/signin.js，这里只管画和发。
  const signOv = document.getElementById('signOv');
  const signWeekEl = document.getElementById('signWeek');
  const signTiersEl = document.getElementById('signTiers');
  const signSubEl = document.getElementById('signSub');
  const signGainEl = document.getElementById('signGain');
  const signBtn = document.getElementById('signBtn');
  const btnSign = document.getElementById('btnSign');
  const btnSignSub = document.getElementById('btnSignSub');
  const signDot = document.getElementById('signDot');
  let signAuto = false;      // 这次是「公告后面自动接上来的」→ 关掉后接着宣传有礼

  function renderSignin() {
    const s = signSummary();
    signSubEl.textContent = `本周已签 ${s.days} / 7 天 · 每天 +${SIGN_BONES} 骨币 · 周一 00:00 重新开始`;

    // 七格：周一 → 周日，已签打勾，今天描金边
    signWeekEl.textContent = '';
    for (const c of weekCells()) {
      const cell = document.createElement('div');
      cell.className = 'sign-day'
        + (c.signed ? ' signed' : '')
        + (c.today ? ' today' : '')
        + (c.future && !c.today ? ' future' : '');
      const n = document.createElement('div');
      n.className = 'sd-n';
      n.textContent = c.name;
      const d = document.createElement('div');
      d.className = 'sd-d';
      d.textContent = String(c.day);
      const b = document.createElement('div');
      b.className = 'sd-b';
      b.textContent = c.signed ? '✓' : '';
      cell.append(n, d, b);
      signWeekEl.appendChild(cell);
    }

    // 两个里程碑条
    signTiersEl.textContent = '';
    for (const t of WEEK_TIERS) {
      const done = t.days === 3 ? s.got3 : s.got6;
      const left = Math.max(0, t.days - s.days);
      const el = document.createElement('div');
      el.className = 'sign-tier' + (done ? ' done' : '');
      const k = document.createElement('div');
      k.className = 'st-k';
      k.textContent = `累计 ${t.days} 天`;
      const v = document.createElement('div');
      v.className = 'st-v';
      v.textContent = done ? `+${t.bones} 已领` : `+${t.bones} 骨币`;
      const p = document.createElement('div');
      p.className = 'st-p';
      p.textContent = done ? '本周这一档到手了' : (left > 0 ? `还差 ${left} 天` : '今天就能领');
      el.append(k, v, p);
      signTiersEl.appendChild(el);
    }

    signBtn.disabled = s.signedToday;
    signBtn.textContent = s.signedToday ? '今天已签到 · 明天再来' : `签到 · +${SIGN_BONES} 骨币`;
  }

  // 主菜单入口的副标题与红点（和签到面板同一份状态）
  function renderSignBtn() {
    const s = signSummary();
    btnSign.classList.toggle('done', s.signedToday);
    // 副标题只有「本周 x / 7 天」一句 —— 「· 今天已签」会把这么窄的按钮撑成两行，
    // 和旁边「今日挑战 / 种子挑战」错位。已签的状态交给绿色 done 样式 + 红点消失表达。
    btnSignSub.textContent = `本周 ${s.days} / 7 天`;
    signDot.hidden = s.signedToday;
  }

  function showSignin(auto) {
    signAuto = !!auto;
    signGainEl.textContent = '';
    renderSignin();
    signOv.classList.add('on');
    signOv.setAttribute('aria-hidden', 'false');
    if (!signedToday()) audio.sfx('event');
    return true;
  }

  function closeSignin() {
    signOv.classList.remove('on');
    signOv.setAttribute('aria-hidden', 'true');
    const wasAuto = signAuto;
    signAuto = false;
    renderSignBtn();
    if (wasAuto) {
      // 签到关掉 → 350ms 后轮到宣传有礼（它自己有「今日不再弹」挡着）
      setTimeout(() => {
        if (titleIdle() && !promoOv.classList.contains('on')) showPromo(false, true);
      }, 350);
    }
  }

  function doSignin() {
    const r = signToday();
    if (!r.ok) { renderSignin(); return false; }
    audio.sfx('ach');
    renderSignin();
    renderSignBtn();
    // 逐条写拿到什么（签到 20 / 达标补 100、200）
    signGainEl.textContent = '';
    let sum = 0;
    for (const g of r.gained) {
      const line = document.createElement('div');
      line.textContent = `${g.label}：+${g.bones} 骨币`;
      signGainEl.appendChild(line);
      sum += g.bones;
    }
    showToast('签到成功', `本周已签 ${r.days} 天 · 骨币 +${sum}`);
    renderCampBadge();
    renderMsBadge();
    return true;
  }

  signBtn.addEventListener('click', doSignin);
  document.getElementById('signX').addEventListener('click', closeSignin);
  document.getElementById('signClose').addEventListener('click', closeSignin);
  btnSign.addEventListener('click', () => showSignin(false));

  // 公告关掉之后的三连：签到（今天没签才弹）→ 宣传有礼
  // ⚠️ 只在「标题页且没开任何子面板」时才弹：玩家关掉公告立刻点「开始游戏」，
  // 350ms 后（那时已经在选关界面，gameState 还是 title）签到会啪一下盖在选关卡上。
  // 遇到这种情况就先不弹 —— 主菜单那个红点还在，玩家想签自己点。
  function titleIdle() {
    if (gameState !== 'title') return false;
    return !document.querySelector('.tt-sub-scr.on, .modal.on, .upgrade.on, .lv-card.on');
  }
  function afterNoticeChain() {
    if (!titleIdle()) return;
    if (!signedToday()) { showSignin(true); return; }
    if (!promoOv.classList.contains('on')) showPromo(false, true);
  }


  // ---------------- 音效包（第 46 块）----------------
  // 打通第一关后，奶蛙「把自己那 4 段叫声交出来」：结算面板之上弹一张卡，
  // 问要不要把角色音全换成它。两个按钮都算看过，之后不再弹；
  // 真正的开关在设置里（没解锁时「奶蛙」那项是锁着的）。
  // 选择存在 profile().voicePack = { unlocked, id }，audio.setPack() 只负责推进音频引擎。
  function packState() {
    const p = profile();
    if (!p.voicePack || typeof p.voicePack !== 'object') p.voicePack = { unlocked: false, id: 'normal' };
    if (p.voicePack.id !== 'frog') p.voicePack.id = 'normal';
    return p.voicePack;
  }

  function setPackId(id, opts = {}) {
    const st = packState();
    st.id = id === 'frog' ? 'frog' : 'normal';
    audio.setPack(st.id);
    if (opts.save !== false) saveProfile();
    return st.id;
  }

  // 解锁卡里的 4 段素材：一段一行，带试听
  function renderPackRows() {
    pgList.textContent = '';
    for (const f of FROG_FILES) {
      const row = document.createElement('div');
      row.className = 'pg-row';
      const meta = document.createElement('div');
      meta.className = 'pg-meta';
      const name = document.createElement('div');
      name.className = 'pg-name';
      name.textContent = f.name;
      const use = document.createElement('div');
      use.className = 'pg-use';
      use.textContent = f.use;
      meta.append(name, use);
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'pg-play';
      play.dataset.file = f.file;
      play.textContent = '试听';
      play.addEventListener('click', async () => {
        play.textContent = '…';
        const ok = await audio.previewVoice(f.file, f.offset, f.preview);
        play.textContent = ok ? '♪' : '没声';
        setTimeout(() => { play.textContent = '试听'; }, ok ? 900 : 1300);
      });
      row.append(meta, play);
      pgList.appendChild(row);
    }
  }

  function showPackGet() {
    // 通关那一瞬会先弹成就 toast（「第一根骨头」之类），它和这张卡在同一片
    // 空域（toast 在 21% 高、卡片从 22% 起）。延迟 1.4 秒让成就看完，这里再
    // 把残余的 toast 收掉，卡片就不会压着字。
    waveToast.classList.remove('on');
    clearTimeout(toastTimer);
    renderPackRows();
    packGetEl.classList.add('on');
    packGetEl.setAttribute('aria-hidden', 'false');
    audio.sfx('boon');
  }

  // useFrog = 玩家点了「换上奶蛙叫」；false（先用原来的 / ✕）也照样记「已解锁」
  function closePackGet(useFrog) {
    const st = packState();
    const first = !st.unlocked;
    st.unlocked = true;
    if (useFrog) setPackId('frog', { save: false });
    saveProfile();
    packGetEl.classList.remove('on');
    packGetEl.setAttribute('aria-hidden', 'true');
    if (first) {
      if (st.id === 'frog') {
        audio.sfx('crit');            // 换成奶蛙后这一声就是奶蛙叫，立刻能听见
        showToast('已换上抽象奶蛙音效包', '拍击 / 暴击 / 受伤 / 倒下 / 通关 全换成奶蛙叫 · 设置里随时改');
      } else {
        showToast('音效包留着了', '设置 → 音效包 里随时能换成奶蛙那套');
      }
    }
    renderSettings();
    return st.id;
  }

  document.getElementById('pgYes').addEventListener('click', () => closePackGet(true));
  document.getElementById('pgNo').addEventListener('click', () => closePackGet(false));
  document.getElementById('pgClose').addEventListener('click', () => closePackGet(false));

  // 第 46 块补丁：追溯解锁。音效包上线之前就通关过第一关的老玩家，
  // 档案里没有 voicePack，而解锁只挂在「通关那一刻」，他们永远拿不到。
  // 战绩 records[1].wins > 0 = 通关过第一关 → 标题页补弹一次解锁卡，
  // 点「换上」/「先用原来的」都走 closePackGet 正常落档，之后不再弹。
  function packRetroDue() {
    if (packState().unlocked) return false;
    const rec = loadRecords()[1];
    return !!(rec && rec.wins > 0);
  }

  // ---------------- 夜行记忆（第 32 块） ----------------
  // 十八夜，一夜一关。前 3 夜已经在关卡里走过；剩下 15 夜是给后面那些
  // 还没做出来的关卡预留的剧本，现在先当档案读。
  // 这里只读不写游戏状态（除了「已读」标记和终章结局），关掉面板不影响任何一局。
  const storyScr = document.getElementById('storyScr');
  const stArc = document.getElementById('stArc');
  const stBar = document.getElementById('stBar');
  const stProgNum = document.getElementById('stProgNum');
  const stProgTag = document.getElementById('stProgTag');
  const stMarks = document.getElementById('stMarks');
  const stList = document.getElementById('stList');
  const stFoot = document.getElementById('stFoot');
  const storyReadEl = document.getElementById('storyRead');
  const srNo = document.getElementById('srNo');
  const srTitle = document.getElementById('srTitle');
  const srBody = document.getElementById('srBody');
  const srPos = document.getElementById('srPos');
  const srPrev = document.getElementById('srPrev');
  const srNext = document.getElementById('srNext');
  let srIdx = 0;

  // 第 33 块：一夜一章按顺序解锁 —— 走完（亲历）或读完上一夜，才翻开下一页。
  // 第 1 夜默认开放；4~18 夜这些档案夜靠在面板里逐夜读下去解锁。
  function chapterUnlocked(i) {
    if (i <= 0) return true;
    const c = STORY_CHAPTERS[i - 1];
    const p = storyProgress();
    return !!(p.seen[c.id] || p.read[c.id]);
  }

  function renderStoryLog() {
    const p = storyProgress();
    const seenN = STORY_CHAPTERS.filter((c) => p.seen[c.id]).length;
    stArc.textContent = STORY_ARC.title;
    stBar.style.width = `${Math.round((seenN / STORY_CHAPTERS.length) * 100)}%`;
    stProgNum.textContent = String(seenN);
    stProgTag.textContent = seenN === 0 ? '未启程'
      : seenN >= STORY_CHAPTERS.length ? '走完了'
        : `走完 ${Math.round((seenN / STORY_CHAPTERS.length) * 100)}%`;

    // 三次印记 + 当前结局
    stMarks.textContent = '';
    for (const k of ['laughter', 'name', 'memory']) {
      const info = MARK_INFO[k];
      const cell = document.createElement('div');
      cell.className = 'st-mark';
      const ic = document.createElement('b'); ic.textContent = info.icon;
      const nm = document.createElement('i'); nm.textContent = info.name;
      const n = document.createElement('span'); n.textContent = `×${p.marks[k] || 0}`;
      cell.append(ic, nm, n);
      stMarks.appendChild(cell);
    }

    stList.textContent = '';
    STORY_CHAPTERS.forEach((ch, i) => {
      const live = !!p.seen[ch.id];
      const read = live || !!p.read[ch.id];
      const unlocked = chapterUnlocked(i);
      const prev = STORY_CHAPTERS[i - 1];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'st-item' + (live ? ' cur' : '')
        + (read ? '' : unlocked ? ' unread' : ' locked');
      item.dataset.id = ch.id;

      const ico = document.createElement('div'); ico.className = 'st-ico'; ico.textContent = read ? ch.icon : '🌫';
      const txt = document.createElement('div'); txt.className = 'st-txt';
      const no = document.createElement('div'); no.className = 'st-no';
      no.textContent = `第 ${ch.no} 夜 · ${read ? ch.place : '未知'}`;
      const nm = document.createElement('div'); nm.className = 'st-name';
      nm.textContent = read ? ch.title : '（还没走到）';
      const who = document.createElement('div'); who.className = 'st-who';
      who.textContent = read ? `—— ${ch.who}`
        : unlocked ? (ch.levelId ? `进入第 ${ch.levelId} 关带到第 ${ch.atRound} 回合` : '还没做出来的地方')
          : `走完第 ${prev.no} 夜后翻开`;
      txt.append(no, nm, who);

      const tag = document.createElement('div');
      tag.className = 'st-tag' + (live ? ' done' : '');
      tag.textContent = live ? '亲历' : (p.read[ch.id] ? '已读' : unlocked ? '档案' : '未解锁');

      item.append(ico, txt, tag);
      item.addEventListener('click', () => openStoryReader(i));
      stList.appendChild(item);
    });

    const locked = STORY_CHAPTERS.filter((c, i) => !chapterUnlocked(i)).length;
    const unread = STORY_CHAPTERS.length - STORY_CHAPTERS.filter((c) => p.read[c.id] || p.seen[c.id]).length;
    stFoot.textContent = unread > 0
      ? `还有 ${unread} 夜没读过${locked > 0 ? ` · ${locked} 夜未解锁（走完上一夜才翻开）` : ''} · 读完第 18 夜会结算你的结局`
      : '十八夜都读完了 · 点开任何一夜可以重读';
  }

  function openStoryReader(i) {
    if (!chapterUnlocked(i)) {
      const prev = STORY_CHAPTERS[i - 1];
      showToast('夜行记忆', `这一页还没翻开 —— 先走完第 ${prev ? prev.no : '?'} 夜`);
      return;
    }
    srIdx = Math.max(0, Math.min(STORY_CHAPTERS.length - 1, i));
    renderStoryReader();
    storyReadEl.classList.add('on');
    storyReadEl.setAttribute('aria-hidden', 'false');
    audio.sfx('event');
  }

  function closeStoryReader() {
    storyReadEl.classList.remove('on');
    storyReadEl.setAttribute('aria-hidden', 'true');
    renderStoryLog();
  }

  function srLine(cls, who, text) {
    const d = document.createElement('div');
    d.className = 'sr-line ' + cls;
    if (who) {
      const b = document.createElement('b');
      b.textContent = who;
      d.appendChild(b);
    }
    const sp = document.createElement('span');
    sp.textContent = text;
    d.appendChild(sp);
    srBody.appendChild(d);
  }

  function renderStoryReader() {
    const ch = STORY_CHAPTERS[srIdx];
    const p = storyProgress();
    markStoryRead(ch.id);
    srNo.textContent = `第 ${ch.no} 夜 · ${ch.place}`;
    srTitle.textContent = ch.title;
    srPos.textContent = `${ch.no} / ${STORY_CHAPTERS.length}`;
    srPrev.disabled = srIdx === 0;
    srNext.disabled = srIdx === STORY_CHAPTERS.length - 1 || !chapterUnlocked(srIdx + 1);
    srBody.textContent = '';

    if (ch.story) {
      const nar = document.createElement('div');
      nar.className = 'sr-nar';
      nar.textContent = ch.story;
      srBody.appendChild(nar);
    }

    for (const beat of ch.talk) {
      if (beat.say) srLine('', beat.who || ch.who, beat.say);
      const reps = (beat.replies || []).filter((r) => r.say && r.say !== '__ENDING__');
      if (!reps.length) continue;
      // 主线按「第一条回话」当作真正发生的那一版，其余收在下面一行小字里
      const main = reps[0];
      srLine('me', main.as || '奶蛙', main.say);
      if (reps.length > 1) {
        const alt = document.createElement('div');
        alt.className = 'sr-alt';
        const parts = reps.slice(1).map((r) => `${r.label}：${r.say}`);
        const b = document.createElement('b');
        b.textContent = '若当时换一种说法 —— ';
        alt.appendChild(b);
        alt.appendChild(document.createTextNode(parts.join('\n')));
        srBody.appendChild(alt);
      }
    }

    // 终章：接上结局
    if (ch.endings) {
      const key = p.ending || storyEndingKey(p.marks);
      const end = ch.endings[key] || ch.endings.none;
      for (const b of end.beats) srLine('', b.who || '', b.say);
      const box = document.createElement('div');
      box.className = 'sr-end';
      const t = document.createElement('div');
      t.className = 'sr-end-t';
      t.textContent = `${end.icon || '🐸'} ${end.title}`;
      const l = document.createElement('div');
      l.className = 'sr-end-l';
      const m = p.marks;
      l.textContent = `${end.line || ''}\n（这一局你交出去的东西：笑声 ×${m.laughter || 0} · 名字 ×${m.name || 0} · 记忆 ×${m.memory || 0}）`;
      box.append(t, l);
      srBody.appendChild(box);
      // 第一次读到终章就把结局写进档案 + 发成就
      if (!p.ending) setStoryEnding(key);
      tryAch('story_finish');
    }

    srBody.scrollTop = 0;
    // 十八夜读完（亲历或读档案都算）
    const now = storyProgress();
    if (STORY_CHAPTERS.every((c) => now.read[c.id] || now.seen[c.id])) tryAch('story_all');
  }

  srPrev.addEventListener('click', () => { if (srIdx > 0) { srIdx--; renderStoryReader(); } });
  srNext.addEventListener('click', () => { if (srIdx < STORY_CHAPTERS.length - 1 && chapterUnlocked(srIdx + 1)) { srIdx++; renderStoryReader(); } });
  document.getElementById('srClose').addEventListener('click', closeStoryReader);
  document.getElementById('btnStory').addEventListener('click', () => { renderStoryLog(); showSub(storyScr); });
  document.getElementById('stBack').addEventListener('click', () => hideSub(storyScr));

  // ---------------- 篝火 · 夜行骨币（第 19 块） ----------------
  // 局外成长只在这里发生：主菜单进入，站着看，不打断任何一局。
  // 骨币余额与已点燃的火种都存在 profile（bones / camp）。
  const campScr = document.getElementById('campScr');
  const cfList = document.getElementById('cfList');
  const cfBones = document.getElementById('cfBones');
  const cfFoot = document.getElementById('cfFoot');
  const btnCamp = document.getElementById('btnCamp');
  const campBoneNum = document.getElementById('campBoneNum');

  // 主菜单按钮上的骨币角标（每次回标题都会重刷）
  function renderCampBadge() {
    if (campBoneNum) campBoneNum.textContent = adminOn ? '∞' : String(bones());
  }

  function renderCampfire() {
    const have = adminOn ? Infinity : bones();   // 管理员模式：买什么都不差钱
    const gotCount = CAMPFIRE.filter((c) => campLevel(c.id) > 0).length;
    const lvSum = CAMPFIRE.reduce((a, c) => a + campLevel(c.id), 0);
    cfBones.textContent = adminOn ? '∞' : String(have);
    cfList.textContent = '';

    for (const item of CAMPFIRE) {
      const lv = campLevel(item.id);
      const price = campCost(item.id, lv);
      const poor = have < price;
      const row = document.createElement('div');
      row.className = 'cf-item' + (lv > 0 ? ' on' : '');
      row.dataset.id = item.id;
      row.dataset.level = String(lv);

      const head = document.createElement('div');
      head.className = 'cf-head';
      const icon = document.createElement('span');
      icon.className = 'cf-icon';
      icon.textContent = item.icon;
      const name = document.createElement('span');
      name.className = 'cf-name';
      name.textContent = item.name;
      const cost = document.createElement('span');
      cost.className = 'cf-cost' + (poor ? ' lack' : '');
      cost.textContent = `${price} 骨币`;
      head.append(icon, name, cost);

      // 等级行：无限级 —— 只显示当前等级，不显示上限
      const lvRow = document.createElement('div');
      lvRow.className = 'cf-lv';
      const lvText = document.createElement('span');
      lvText.textContent = lv > 0 ? `Lv.${lv}` : '未点燃';
      lvRow.appendChild(lvText);

      const desc = document.createElement('div');
      desc.className = 'cf-desc';
      desc.textContent = item.desc;

      row.append(head, lvRow, desc);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cf-buy' + (poor ? ' poor' : '');
      btn.dataset.buy = item.id;
      btn.textContent = poor
        ? `还差 ${price - have} 骨币`
        : (lv === 0 ? `点 燃 · ${price} 骨币` : `升到 Lv.${lv + 1} · ${price} 骨币`);
      if (!poor) {
        btn.addEventListener('click', () => {
          const r = campBuy(item.id, adminOn);
          if (!r.ok) return;
          audio.sfx('uiSwitch');
          renderCampfire();
          renderCampBadge();
        });
      }
      row.appendChild(btn);
      cfList.appendChild(row);
    }

    cfFoot.textContent = lvSum > 0
      ? `已点燃 ${gotCount} / ${CAMPFIRE.length} 簇 · 共 ${lvSum} 级 · 每升一级加价 ${Math.round(CAMP_STEP * 100)}%（线性，和关卡难度一样） · 火种没有上限，烧得越旺骨币要得越多`
      : `九簇火种等你点燃 · 每升一级加价 ${Math.round(CAMP_STEP * 100)}%（线性，和关卡难度一样） · 没有上限，烧得越旺骨币要得越多`;
  }

  function showCampfire() {
    renderCampfire();
    showSub(campScr);
    // 第 41 块：第一次进篝火先把「这里买的东西是永久的」讲明白（每个存档只弹一次）
    permNoticeOnce('campfire', '篝火商店是永久投资，不是这一局的装备',
      '用夜行骨币点燃的每一簇火种，都会写进本机存档，' +
      '之后每一关、每一局都带着它 —— 换关、重开、关掉网页再来，都还在。\n' +
      '花掉的骨币不会退回，点下去就改不回来了，请谨慎选择。');
  }

  btnCamp.addEventListener('click', showCampfire);
  document.getElementById('cfBack').addEventListener('click', () => hideSub(campScr));

  // ---------------- 局外商店 · 宝箱（第 58 块） ----------------
  // 花夜行骨币买三种品质的宝箱，开箱直接随机给一次永久属性变化
  // （可能触发诅咒、强制负面；高品箱更不易踩雷，还能出永久法器 / 技能CD缩短）。
  // 永久效果落进 profile().metaShop，由 applyMeta 在每局开局注入。
  const msScr = document.getElementById('msScr');
  const msList = document.getElementById('msList');
  const msBones = document.getElementById('msBones');
  const msFoot = document.getElementById('msFoot');
  const msLog = document.getElementById('msLog');
  const btnShop = document.getElementById('btnShop');
  const msBadge = document.getElementById('msBadge');

  function renderMsBadge() {
    if (msBadge) msBadge.textContent = adminOn ? '∞' : String(bones());
  }

  function renderMetaShop() {
    const have = adminOn ? Infinity : bones();
    const ms = metaShopState();
    msBones.textContent = adminOn ? '∞' : String(have);
    msList.textContent = '';
    for (const box of BOXES) {
      const poor = have < box.cost;
      const row = document.createElement('div');
      row.className = 'ms-item' + (poor ? ' poor' : '');

      const head = document.createElement('div');
      head.className = 'ms-head';
      const icon = document.createElement('span');
      icon.className = 'ms-icon';
      icon.textContent = box.icon;
      const name = document.createElement('span');
      name.className = 'ms-name';
      name.textContent = box.name;
      const cost = document.createElement('span');
      cost.className = 'ms-cost' + (poor ? ' lack' : '');
      cost.textContent = `${box.cost} 骨币`;
      head.append(icon, name, cost);

      const info = document.createElement('div');
      info.className = 'ms-info';
      const cursePct = Math.round(box.curse * 100);
      let infoText = `${box.name}：诅咒率 ${cursePct}%`;
      if (box.special) infoText += ` · 有概率出永久法器 / 技能CD缩短`;
      infoText += ` · 强度 ×${box.mag}`;
      info.textContent = infoText;

      row.append(head, info);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ms-buy' + (poor ? ' poor' : '');
      btn.textContent = poor ? `还差 ${box.cost - have} 骨币` : `开启 · ${box.cost} 骨币`;
      if (!poor) {
        btn.addEventListener('click', () => doBuyBox(box.id));
      }
      row.appendChild(btn);
      msList.appendChild(row);
    }

    const sum = metaSummary();
    msFoot.textContent = `累计开箱 ${ms.opened} 次 · 永久属性 ${sum.mods} 条 · 永久法器 ${sum.relics} 件 · 技能CD ×${Number(sum.skillCdMul).toFixed(2)}（越低越快）`;

    msLog.textContent = '';
    const log = ms.log || [];
    if (!log.length) {
      const empty = document.createElement('div');
      empty.className = 'ms-log-empty';
      empty.textContent = '还没有开过箱';
      msLog.appendChild(empty);
    } else {
      for (const e of log) {
        const li = document.createElement('div');
        li.className = 'ms-log-item' + (e.cursed ? ' cursed' : (e.kind === 'stat' ? '' : ' rare'));
        li.textContent = `${e.boxName}：${e.cursed ? '诅咒·' : ''}${e.icon} ${e.name} ${e.effect}`;
        msLog.appendChild(li);
      }
    }
  }

  function doBuyBox(id) {
    const r = buyBox(id, Math.random, adminOn);
    if (!r.ok) {
      if (r.reason === 'poor') showToast('骨币不足', `还差 ${r.cost - r.have} 骨币`);
      return;
    }
    audio.sfx('uiSwitch');
    renderMetaShop();
    renderMsBadge();
    showBoxReveal(r.box, r.res);
  }

  function showMetaShop() {
    renderMetaShop();
    showSub(msScr);
  }

  btnShop.addEventListener('click', showMetaShop);
  document.getElementById('msBack').addEventListener('click', () => hideSub(msScr));

  // 开箱揭示浮层（第 58 块）：宝箱抖动→打开→展示结果卡片（正面绿 / 稀有金 / 诅咒红）
  const boxReveal = document.getElementById('boxReveal');
  const brBox = document.getElementById('brBox');
  const brResult = document.getElementById('brResult');
  const brBtn = document.getElementById('brOk');
  let brTimer = null;

  function showBoxReveal(box, res) {
    brResult.textContent = '';
    const cls = res.cursed ? 'curse' : (res.kind === 'stat' ? 'good' : 'rare');
    const card = document.createElement('div');
    card.className = `br-card ${cls}`;

    const ico = document.createElement('div');
    ico.className = 'br-ico';
    ico.textContent = res.icon || box.icon;
    const title = document.createElement('div');
    title.className = 'br-title';
    title.textContent = res.cursed ? '诅咒降临' : (res.kind === 'stat' ? (box.name + ' · 属性变化') : '稀有收获');
    const nm = document.createElement('div');
    nm.className = 'br-name';
    nm.textContent = res.name;
    const ef = document.createElement('div');
    ef.className = 'br-effect';
    ef.textContent = res.effectText;

    card.append(ico, title, nm, ef);
    if (res.kind === 'relic') {
      const d = document.createElement('div');
      d.className = 'br-desc';
      d.textContent = res.desc || '';
      card.appendChild(d);
    }
    const note = document.createElement('div');
    note.className = 'br-note';
    note.textContent = '已永久生效（下一局开局带着它）';
    card.appendChild(note);
    brResult.appendChild(card);

    boxReveal.classList.add('on');
    boxReveal.setAttribute('aria-hidden', 'false');
    brBox.textContent = box.icon;
    brBox.classList.remove('open');
    brResult.classList.remove('show');
    // 宝箱抖动 → 打开 → 结果浮现
    brBox.classList.add('shake');
    if (brTimer) clearTimeout(brTimer);
    brTimer = setTimeout(() => {
      brBox.classList.remove('shake');
      brBox.classList.add('open');
    }, 620);
    setTimeout(() => { brResult.classList.add('show'); }, 920);
  }

  brBtn.addEventListener('click', () => {
    boxReveal.classList.remove('on');
    boxReveal.setAttribute('aria-hidden', 'true');
    brResult.classList.remove('show');
    brBox.classList.remove('open');
  });

  // ---------------- 永夜火种（第 23 块：通关白给的永久三选一） ----------------
  // 用户定案：**通关一大关**后触发 3 次，直接写进局外属性；品质照旧吃幸运。
  // 界面复用三选一那套 DOM（upPanel），只是换成永久卡、没有「带进下一回合」的措辞。
  //
  // 为什么用「待领次数」而不是结算时弹完就完：玩家很可能在结算界面直接关网页。
  // grantBoons 在 endGame 就写档案，下次回标题页自动补弹（showTitle 里检查）。
  let boonOpen = false;
  let boonPicks = [];           // 这一次摆出来的三张
  let boonSession = null;       // { total, done, after, luck }
  // 第 38 块：首次通关后要等玩家在标题页把永夜火种选完，那张存档才能清掉
  let pendingClearUid = null;

  function boonLuckNow() {
    // 结算时读的是「这一局最后的幸运」（含局内卡、事件、篝火、火种），
    // 标题页补选时 stats 还没落账，读到的就是 0 —— 补选不额外吃幸运，这是有意的。
    const v = stats.get('luck');
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function renderBoonPanel() {
    if (!boonSession) return;
    const luck = boonSession.luck;
    const left = boonPending();
    upTitle.textContent = `夜行之后 · 永夜火种 ${boonSession.done + 1} / ${boonSession.total}`;
    upSub.textContent = `还有 ${left} 次没选 · 选一张刻进骨头里，下一局开局就带着它`;
    upFoot.textContent = `幸运 ${luck.toFixed(1)} · 幸运越高越容易见到金红 · 每项都有层数上限`;

    boonPicks = rollBoons(rngOf('card'), { luck, count: 3 });
    upList.textContent = '';
    if (!boonPicks.length) {
      // 池子空了（全部到顶）：不该发生，兜底直接收掉
      closeBoons();
      return;
    }
    audio.sfx('boon');      // 第 25 块：火种揭示的升华号角

    for (const b of boonPicks) {
      const rar = rarityInfo(b);
      const n = boonStacks(b.id);
      const btn = document.createElement('button');
      btn.className = 'up-item';
      btn.type = 'button';
      btn.dataset.id = b.id;
      btn.dataset.tag = 'boon';
      btn.dataset.rarity = rar.id;

      const glyph = document.createElement('span');
      glyph.className = 'up-glyph';
      glyph.textContent = b.glyph;

      const name = document.createElement('span');
      name.className = 'up-name';
      name.textContent = b.name;
      const rank = document.createElement('span');
      rank.className = 'up-rank';
      rank.textContent = rar.name;
      name.appendChild(rank);

      const effect = document.createElement('b');
      effect.className = 'up-effect';
      effect.textContent = b.title;

      // 层数：「2 / 3」→「3 / 3」，比数值预览更实在（局外加成不在当前 stats 上）
      const delta = document.createElement('div');
      delta.className = 'up-delta';
      const line = document.createElement('span');
      line.className = 'up-chg';
      const label = document.createElement('i');
      label.textContent = '永久层数';
      const from = document.createElement('s');
      from.textContent = boonStackText(b);
      const arrow = document.createElement('em');
      arrow.textContent = '→';
      const to = document.createElement('b');
      to.textContent = `${n + 1} / ${Number.isFinite(b.maxStack) ? b.maxStack : '∞'}`;
      line.append(label, from, arrow, to);
      delta.appendChild(line);

      const desc = document.createElement('span');
      desc.className = 'up-desc';
      desc.textContent = b.desc;

      btn.append(glyph, name, effect, delta, desc);
      btn.addEventListener('click', () => chooseBoon(b));
      upList.appendChild(btn);
    }
  }

  function showBoons({ after = 'close' } = {}) {
    const total = boonPending();
    if (!total) return false;
    boonSession = { total, done: 0, after, luck: boonLuckNow() };
    boonOpen = true;
    renderBoonPanel();
    audio.sfx('card');
    upWarn.setAttribute('aria-hidden', 'false');   // 第 41 块：这一张是永久的，先把话说清楚
    upPanel.classList.add('on', 'boon');
    upPanel.setAttribute('aria-hidden', 'false');
    // 每个存档只拦一次：说完之后常驻警示条一直留着，不再每次弹窗
    permNoticeOnce('boon', '这张火种会跟着你一辈子',
      '永夜火种不是这一局的加成，它一选下去就写进本机存档，' +
      '之后每一关、每一局、每一个新开局都带着它。\n' +
      '选错了没有撤销，也洗不掉 —— 请看清楚再点。');
    return true;
  }

  function chooseBoon(b) {
    if (!boonOpen) return;
    const r = takeBoon(b.id);
    if (!r.ok) return;
    audio.sfx('upgrade');
    boonSession.done++;
    showToast(`火种 · ${b.name}`, `永久层数 ${r.stacks} / ${Number.isFinite(b.maxStack) ? b.maxStack : '∞'} —— 下一局开局生效`);
    if (boonPending() > 0 && boonTotalStacks() < BOONS.reduce((a, x) => a + x.maxStack, 0)) {
      renderBoonPanel();
      return;
    }
    closeBoons();
  }

  function closeBoons() {
    if (!boonOpen) return;
    boonOpen = false;
    const after = boonSession ? boonSession.after : 'close';
    boonSession = null;
    upWarn.setAttribute('aria-hidden', 'true');
    upPanel.classList.remove('on', 'boon');
    upPanel.setAttribute('aria-hidden', 'true');
    renderCampBadge();
    // 第 38 块：通关选完永夜火种，这次的存档彻底结算 → 从读取列表移除
    if (pendingClearUid != null) {
      runSave.clearRun(pendingClearUid);
      pendingClearUid = null;
      refreshResume();
    }
    if (after === 'reload') {
      location.reload();
    }
  }

  // ---------------- 夜行诅咒（第 21 块） ----------------
  // 选关面板里的勾选条：点一下加一条，再点一下摘掉，右上角实时显示骨币倍率。
  // 只写 profile().runCurses（记住选择），真正落账在 startPlay。
  // 注意：DOM id 不能叫 rcList —— 我的记录面板已经占了 rcList / #rcList（踩过）
  const rcPick = document.getElementById('rcPick');
  const rcMulTop = document.getElementById('rcMulTop');

  function renderCursePick() {
    if (!rcPick) return;
    rcPick.textContent = '';
    for (const c of RUN_CURSES) {
      const on = pendingCurses.includes(c.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rc-chip' + (on ? ' on' : '');
      chip.dataset.curse = c.id;
      chip.title = c.desc;
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      // 第一行：图标 + 名字 + 骨币倍率；第二行：具体数字（改前 → 改后）。
      // 之前效果全塞在 title 里，手机上根本看不到 —— 现在直接印出来。
      const row = document.createElement('span');
      row.className = 'rc-row';
      const icon = document.createElement('span');
      icon.textContent = c.icon;
      const name = document.createElement('span');
      name.textContent = c.name;
      const mul = document.createElement('em');
      mul.textContent = `+${Math.round(c.mul * 100)}%`;
      row.append(icon, name, mul);
      const eff = document.createElement('small');
      eff.className = 'rc-eff';
      eff.textContent = c.eff || c.desc;
      chip.append(row, eff);
      chip.addEventListener('click', () => toggleCurse(c.id));
      rcPick.appendChild(chip);
    }
    if (rcMulTop) rcMulTop.textContent = `×${curseMul(pendingCurses).toFixed(2)}`;
    renderCurseSum();
  }

  // 已选诅咒的明细行：每条带具体数字，让玩家看清开局会被改掉什么
  function renderCurseSum() {
    const rcSum = document.getElementById('rcSum');
    if (!rcSum) return;
    const list = curseList(pendingCurses);
    if (!list.length) {
      rcSum.textContent = '还没选 —— 一条都不选就是普通局（骨币 ×1.00）';
      return;
    }
    rcSum.textContent = '开局生效：'
      + list.map((c) => `${c.name}（${c.eff || ''}）`).join(' · ')
      + ` —— 骨币 ×${curseMul(pendingCurses).toFixed(2)}`;
  }

  function toggleCurse(id) {
    if (!CURSE_BY_ID[id]) return;
    pendingCurses = pendingCurses.includes(id)
      ? pendingCurses.filter((x) => x !== id)
      : [...pendingCurses, id];
    profile().runCurses = pendingCurses.slice();
    saveProfile();
    renderCursePick();
    audio.sfx('uiSwitch');
  }

  // ---------------- 今日挑战（第 22 块） ----------------
  // 日期哈希出种子 → 固定关卡/难度/两条诅咒。没有服务器，也不需要有。
  const dailyScr = document.getElementById('dailyScr');
  const btnDaily = document.getElementById('btnDaily');
  const btnSeed = document.getElementById('btnSeed');   // 第 49 块：种子挑战
  const btnDailySub = document.getElementById('btnDailySub');
  const dlDate = document.getElementById('dlDate');
  const dlSeed = document.getElementById('dlSeed');
  const dlRules = document.getElementById('dlRules');
  const dlBest = document.getElementById('dlBest');
  const dlStart = document.getElementById('dlStart');
  let dailySeedNow = 0;         // 这一局用的种子（跨零点也不变）
  let dailyCursesNow = [];

  function renderDailyBadge() {
    if (!btnDailySub) return;
    const rec = dailyRecord(dayKey());
    btnDaily.classList.toggle('done', !!rec);
    btnDailySub.textContent = rec
      ? (rec.win ? `今天已通关 · ${rec.round} 回合` : `今天最好：第 ${rec.round} 回合`)
      : '同一颗种子';
  }

  function showDaily() {
    const seed = dailySeed();
    dailyCursesNow = pickDailyCurses(seed, RUN_CURSES);
    dlDate.textContent = dayText();
    dlSeed.textContent = seedCode(seed);
    dlRules.textContent = '';
    const rules = [
      ['关卡', `${LEVELS_BY_ID[DAILY_RULES.levelId].name}（固定）`],
      ['难度', `${DIFFS[DAILY_RULES.diff].name}（固定）`],
      ['诅咒', dailyCursesNow.map((id) => (CURSE_BY_ID[id] ? CURSE_BY_ID[id].name : id)).join(' · ')],
      ['骨币', `额外 ×${BONE.dailyMul.toFixed(2)}`],
    ];
    for (const [k, v] of rules) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = k + '：';
      li.append(b, document.createTextNode(v));
      dlRules.appendChild(li);
    }
    const rec = dailyRecord();
    dlBest.textContent = '';
    if (!rec) {
      dlBest.textContent = '今天还没有记录 —— 第一条成绩就是你今天的基准';
    } else {
      dlBest.append(document.createTextNode('今天最好：'));
      const b = document.createElement('b');
      b.textContent = rec.win ? '通关' : `第 ${rec.round} 回合`;
      dlBest.append(b, document.createTextNode(
        ` · 击杀 ${rec.kills} 只`
        + (rec.time != null ? ` · 用时 ${rec.time.toFixed(1)} 秒` : '')
      ));
    }
    showSub(dailyScr);
  }

  function startDaily() {
    const seed = dailySeed();
    dailyMode = true;
    customSeed = null;               // 与种子挑战互斥（第 49 块）
    dailyStamp = dayKey();
    dailySeedNow = seed;
    diffOverride = DAILY_RULES.diff;   // 只在这一局生效，档案里的难度不动
    pendingLevelId = DAILY_RULES.levelId;
    pendingCurses = pickDailyCurses(seed, RUN_CURSES);
    beginGame({ tutorial: false });
  }

  btnDaily.addEventListener('click', showDaily);
  document.getElementById('dlBack').addEventListener('click', () => hideSub(dailyScr));
  dlStart.addEventListener('click', () => { hideSub(dailyScr); startDaily(); });

  // ---------------- 种子挑战（第 49 块） ----------------
  // 玩家输入任意文字当种子；关卡/难度/诅咒由战绩自动匹配（pickSeedRules）。
  const seedScr = document.getElementById('seedScr');
  const seedInput = document.getElementById('seedInput');
  const seedMatch = document.getElementById('sdMatch');
  const seedList = document.getElementById('sdList');

  function seedRulesOf(text) {
    const seed = seedFromText(text);
    return { seed, rules: pickSeedRules(seed, loadRecords(), RUN_CURSES) };
  }

  // 把「战绩 → 关卡/难度/诅咒」的匹配结果说给玩家听
  function renderSeedMatch() {
    const text = seedInput.value.trim();
    if (!text) { seedMatch.innerHTML = '<i style="color:rgba(150,190,174,.5)">输入或掷个种子，看这一局给你安排什么</i>'; return; }
    const { seed, rules } = seedRulesOf(text);
    const lvName = (LEVELS_BY_ID[rules.levelId] || LEVELS_BY_ID[1]).name;
    const diffName = { normal: '普通', hard: '困难', nightmare: '噩梦' }[rules.diff] || rules.diff;
    const curseNames2 = rules.curses.map((id) => RUN_CURSES.find((c) => c.id === id)?.name || id);
    seedMatch.innerHTML =
      `种子 <b>${seedCode(seed)}</b> → <b>${lvName}</b> · <b>${diffName}</b> · 诅咒 <b>${curseNames2.length ? curseNames2.join('、') : '无'}</b><br>` +
      `<span style="color:rgba(150,190,174,.55)">（按你的战绩自动匹配：通关 ${rules.wins} 次 → ${rules.wins >= 6 ? '噩梦 2 诅咒' : rules.wins >= 2 ? '困难 1 诅咒' : '普通 0 诅咒'}）</span>`;
  }

  function renderSeedList() {
    const list = loadSeedRecords();
    seedList.textContent = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'sd-empty';
      empty.textContent = '还没有种子记录 —— 开一局试试手气';
      seedList.appendChild(empty);
      return;
    }
    for (const r of list.slice(0, 12)) {
      const item = document.createElement('div');
      item.className = 'sd-item';
      const code = document.createElement('span');
      code.className = 'sd-code';
      code.textContent = r.code;
      const txt = document.createElement('span');
      txt.className = 'sd-txt';
      txt.textContent = r.text ? `「${r.text}」` : '';
      const info = document.createElement('span');
      info.className = 'sd-info';
      info.innerHTML = r.win
        ? `<span class="sd-win">通关</span> · 第 ${r.round} 回合`
        : `最远 ${r.round} 回合 · ${r.kills} 击杀`;
      item.append(code, txt, info);
      seedList.appendChild(item);
    }
  }

  function showSeed() {
    renderSeedMatch();
    renderSeedList();
    showSub(seedScr);
  }

  function startSeedRun() {
    let text = seedInput.value.trim();
    if (!text) {
      // 没填就随机一个短码当种子文本（也是玩家可以互相分享的码）
      text = 'SD' + Math.random().toString(36).slice(2, 6).toUpperCase();
      seedInput.value = text;
    }
    const { seed, rules } = seedRulesOf(text);
    customSeed = { seed, code: seedCode(seed), text, rules };
    dailyMode = false;               // 种子局和今日挑战互斥
    diffOverride = rules.diff;       // 只在这一局生效，档案难度不动
    pendingLevelId = rules.levelId;
    pendingCurses = rules.curses.slice();
    hideSub(seedScr);
    beginGame({ tutorial: false });
  }

  btnSeed.addEventListener('click', showSeed);
  document.getElementById('sdBack').addEventListener('click', () => hideSub(seedScr));
  document.getElementById('sdStart').addEventListener('click', startSeedRun);
  document.getElementById('sdDice').addEventListener('click', () => {
    seedInput.value = 'SD' + Math.random().toString(36).slice(2, 6).toUpperCase();
    renderSeedMatch();
  });
  seedInput.addEventListener('input', renderSeedMatch);
  seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startSeedRun(); });

  // ---------------- 属性页（第 50 块） ----------------
  // 3D 奶蛙展台 + 经篝火/永夜火种加成后的属性总览。
  // 数值用一份**临时 stats 实例**算（base + camp + boon），不碰局内那份。
  const statScr = document.getElementById('statScr');
  const statCanvas = document.getElementById('statCanvas');
  const statRows = document.getElementById('statRows');
  const statView = createStatView(statCanvas);

  function renderStatRows() {
    const s = createStats(STAT_DEFS);            // 干净 base
    const w = createWeaponStats();               // camp/boon 里的武器加成有处可去即可
    campApply(s, w);
    applyBoons(s, w);
    metaApplyStats(s, w);              // 第 58 块：属性页也把局外商店的永久加成算进去
    statRows.textContent = '';
    for (const group of PLAYER_GROUPS) {
      const g = document.createElement('div');
      g.className = 'st-group';
      g.textContent = group;
      statRows.appendChild(g);
      for (const d of STAT_DEFS) {
        if (d.group !== group) continue;
        const row = document.createElement('div');
        row.className = 'st-row';
        const name = document.createElement('span');
        name.className = 'st-name';
        name.textContent = d.name;
        const val = document.createElement('span');
        val.className = 'st-val';
        const final = s.get(d.key);
        const boosted = Math.abs(final - d.base) > 1e-9;
        val.textContent = d.fmt(final);
        const base = document.createElement('span');
        base.className = 'st-base';
        base.textContent = boosted ? `（基础 ${d.fmt(d.base)}）` : '';
        row.append(name, val, base);
        statRows.appendChild(row);
      }
    }
  }

  function showStat() {
    renderStatRows();         // 每次打开都重算（篝火/火种可能变过；十几行 DOM，开销可忽略）
    showSub(statScr);
    statView.load();          // 首次打开才开始拉模型（浏览器缓存，几乎不耗时）
    statView.resize();
  }

  const btnStats = document.getElementById('btnStats');
  btnStats.addEventListener('click', showStat);
  // 注意：id 是 statBack —— 曾和「夜行记忆」的 stBack 重名，重名时 getElementById
  // 只认 DOM 里靠前的那个，结果属性页返回按钮一个监听都没挂上（用户报过这个 bug）。
  document.getElementById('statBack').addEventListener('click', () => hideSub(statScr));


  // ---------------- 难度选择（关卡面板里，一局一选） ----------------
  const diffSeg = document.getElementById('diffSeg');
  function renderDiffSeg() {
    const cur = profile().difficulty || 'normal';
    diffSeg.textContent = '';
    for (const [key, d] of Object.entries(DIFFS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = key;
      b.textContent = d.name;
      if (key === cur) b.classList.add('on');
      b.addEventListener('click', () => {
        profile().difficulty = key;
        saveProfile();
        setDifficulty(key);
        renderDiffSeg();
      });
      diffSeg.appendChild(b);
    }
  }

  // ---------------- 结算 ----------------
  function endGame(isWin) {
    if (gameState === 'over') return;
    gameState = 'over';
    dropMeet();                     // 第 55 块：新怪卡不许盖在结算上
    const wasDaily = dailyMode;       // 下面会把 dailyMode 清掉，成就判定要用开局那一下
    won = isWin;
    deadT = 0;
    iframe = 0;                     // 结算不再闪（无敌帧闪烁只属于战斗中）
    input.joystick.release();
    vel.set(0, 0, 0);
    setBag(false);                  // 背包开着就收掉
    wtAbort();                      // 武器教程也收掉（别盖在结算上）
    playerRing.setVisible(false);   // 倒下/通关后不再提示攻击范围
    weapon.setVisible(false);       // 环剑也一并收起
    arrowRain.setVisible(false);    // 箭雨的落箭 / 警告圈同理（第 47 块）
    // 第 23 块：结算前把还躺在地上的金币全部收进兜里 ——
    // 「这一局没花完的钱」不该漏掉那些还没吸过来的
    gold.flush();
    gold.setVisible(false);         // 地上的金币也收掉
    renderSkill();

    audio.stopBgm({ fade: 1.0 });
    audio.sfx(isWin ? 'victory' : 'defeat', { vol: 1 });
    rsTag.textContent = customSeed
      ? `种子挑战 · ${customSeed.text || ''}（${customSeed.code}）`
      : (dailyMode && dailySeedNow
        ? `今日挑战 · 种子 ${seedCode(dailySeedNow)}`
        : level.level.name);
    rsTitle.textContent = isWin ? '通 关' : '倒 下';
    rsTitle.classList.toggle('fail', !isWin);
    rsSub.textContent = isWin
      ? (curLevelId === 2
        ? '骨塔里的三顶尖帽都倒了，庭院第一次安静下来'
        : '夜色里的骷髅被清干净了，草地重新安静下来')
      : (curLevelId === 2
        ? '奶蛙被留在了骨塔的院子里……下次先切后排'
        : '奶蛙被骷髅拖进了草丛……下一局记得边打边退');
    rsGrid.textContent = '';

    const roundShown = Math.min(level.totals.rounds, Math.max(1, level.roundNo));
    // 首通判定（第 27 块）：永夜火种只有**本关首次通关**才发 —— 必须在
    // saveRunRecord 把 wins +1 之前先记下「之前有没有赢过」。
    const wasFirstWin = isWin && !((loadRecords()[curLevelId] || {}).wins > 0);
    // 落一笔记录（第 14 块）：通关数 / 最快通关 / 最高击杀 / 最远回合，主页面「我的记录」看
    saveRunRecord(curLevelId, { win: isWin, time: elapsed, kills, roundShown });
    // 全局战绩与成就（第 18 块）：局数/时长/击杀/通关跨局累计，成就统一对表
    bumpStat('runs');
    bumpStat('seconds', Math.round(elapsed));
    bumpStat('kills', kills);
    setStatMax('bestRound', roundShown);
    setStatMax('bestRunKills', kills);
    if (isWin) bumpStat('wins');
    checkCumulativeAchs({ isWin, roundShown });
    // 篝火（第 19 块）：结算发骨币 —— 打得多深、杀得多狠、选多难，都算进去
    // 第 21 / 22 块：诅咒倍率与每日挑战加成乘在上面（都是玩家自己挣的）
    // 第 23 块：没花完的金币折成骨币，关卡越往后倍率越高
    const diffKey = diffOverride || profile().difficulty || 'normal';
    const mulCurse = curseMul(pendingCurses);
    const mulDaily = dailyMode ? BONE.dailyMul : 1;
    const coinPart = coinBones(coins);
    const lvMul = levelBoneMul(curLevelId);
    const boneGain = bonesFor(
      { roundShown, kills, isWin, coins, levelId: curLevelId },
      diffKey, mulCurse * mulDaily,
    );
    const boneTotal = addBones(boneGain);
    // 第 23 块：通关一大关 → 3 次永久三选一；第 27 块改为**只在本关首次
    // 通关**时发（重复刷同一关不给）。先写档案，玩家就算直接关网页，
    // 下次回标题页也会补弹（showTitle 里检查）。
    const boonGain = wasFirstWin ? BOON_PICKS : 0;
    if (boonGain) grantBoons(boonGain);
    const boneMul = diffBoneMul(diffKey);
    const diffName = getDifficulty().name;
    if (diffOverride) {                 // 临时难度用完就撤，下一局还是玩家自己选的那档
      diffOverride = null;
      setDifficulty(profile().difficulty || 'normal');
    }
    // 今日挑战：一天只记最好的一次（胜负都记），再顺手裁掉 30 天以前的老账
    if (dailyMode) {
      if (!adminOn) {   // 管理员沙盒：今日挑战也不落记录
        saveDailyRecord(
          { win: isWin, round: roundShown, kills, time: elapsed, seed: runSeed },
          dailyStamp || dayKey()
        );
        pruneDaily();
        renderDailyBadge();
      }
      dailyMode = false;
    }
    // 第 49 块：种子挑战记录 —— 一颗种子只留最好的那次
    if (customSeed) {
      if (!adminOn) {
        saveSeedRecord({
          code: customSeed.code, text: customSeed.text, seed: customSeed.seed,
          win: isWin, round: roundShown, kills, time: elapsed,
          level: curLevelId, diff: getDifficulty().name,
        });
        pruneSeeds();
        renderSeedList();
      }
      customSeed = null;
    }
    // 第 21 / 22 块的新成就：打完今日挑战、带三条诅咒通关
    if (wasDaily) {
      tryAch('daily_done');
      if (isWin) tryAch('daily_win');
    }
    if (isWin && pendingCurses.length >= 3) tryAch('curse_3');
    clearCurse();                   // 这一局的诅咒不带到结算界面
    // 第 38 块：输 / 重刷已通关（无永夜火种可领） → 当场清档；
    // 首次通关（boonGain>0，要回标题页领永夜火种）→ 延后到 closeBoons 再清，
    // 这样「选完永夜火种之前还能读档」、选完就消失。
    if (isWin && boonGain > 0) pendingClearUid = runUid;
    else runSave.clearRun(runUid);
    refreshResume();                // 主菜单上的「读取存档」随之更新
    const cells = [
      ['用时', elapsed.toFixed(1) + ' 秒'],
      ['击杀', kills + ' 只'],
      ['回合', `${roundShown} / ${level.totals.rounds}`],
      ['升级', `${upgradesTaken} 次`],
      ['剩余生命', `${fmtHp(stats.hp.cur)} / ${stats.get('maxHp').toFixed(1)}`],
      ['攻击力', stats.get('attack').toFixed(1)],
      ['金币', String(coins)],
      ['骨币', `+${boneGain}`],
    ];
    if (boonGain) cells.push(['永夜火种', `+${boonGain} 次`]);
    else if (isWin) cells.push(['永夜火种', '本关已首通过，不再发放']);
    // 第 21 块：本局带了诅咒就把名字印进结算，倍率从哪来的要看得见
    if (pendingCurses.length) cells.push(['诅咒', `${curseNames(pendingCurses)}（×${mulCurse.toFixed(2)}）`]);
    for (const [k, v] of cells) {
      const cell = document.createElement('div');
      cell.className = 'rs-cell';
      const i = document.createElement('i'); i.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      cell.append(i, b);
      rsGrid.appendChild(cell);
    }
    resultEl.classList.add('on');
    resultEl.setAttribute('aria-hidden', 'false');
    // 骨币单独一行：这是「下一局能变强一点」的唯一来源，结算时必须看得见
    if (rsBone) {
      const parts = [];
      if (boneMul > 1) parts.push(`${diffName} ×${boneMul}`);
      if (mulCurse > 1) parts.push(`诅咒 ×${mulCurse.toFixed(2)}（${curseNames(pendingCurses)}）`);
      if (mulDaily > 1) parts.push(`今日 ×${mulDaily.toFixed(2)}`);
      if (lvMul > 1) parts.push(`第 ${curLevelId} 关 ×${lvMul}`);
      if (coinPart > 0) parts.push(`剩 ${coins} 金币折 ${coinPart}`);
      rsBone.textContent = `🔥 夜行骨币 +${boneGain}`
        + (parts.length ? `（${parts.join(' · ')}）` : '')
        + ` · 现有 ${boneTotal}`
        + (boneTotal >= 90 ? ' —— 去篝火商店看看' : '');
    }
    // 通关才能拿永久火种：按钮直接改成「先领火种」，别让人错过
    if (rsBtn) {
      rsBtn.textContent = boonGain ? `领取 ${boonGain} 次永夜火种` : '再来一次';
      rsBtn.classList.toggle('boon', !!boonGain);
    }
    // 第 46 块：第一关首通 → 结算面板之上弹「获得新音效包」（等结算淡完、成就 toast 看完再弹）
    if (isWin && curLevelId === 1 && !packState().unlocked) {
      setTimeout(() => {
        if (gameState === 'over' && !boonOpen) showPackGet();
      }, 1400);
    }
    // 第 54 块（用户定案）：倒下之后弹一句「去篝火商店看看」。
    // 等结算卡淡入完再出 —— 两层面板同时糊上来，玩家不知道该先看哪个。
    if (!isWin) {
      setTimeout(() => {
        if (gameState === 'over' && !boonOpen) showFailTip();
      }, 900);
    }
  }

  // ---------------- 失败提示（第 54 块） ----------------
  // 只干一件事：把「这一局输了，但骨币进账了，去篝火商店能变强」讲明白。
  // 「去篝火商店」直接回主菜单并把商店推到他面前；「下次吧」退回结算卡。
  const failTipEl = document.getElementById('failTip');
  const ftSub = document.getElementById('ftSub');
  function showFailTip() {
    if (!failTipEl) return;
    if (ftSub) {
      ftSub.textContent = `这一局结算的骨币已经进账 · 现有 ${bones()} 骨币 · 火里点过的东西，下一局就带着`;
    }
    failTipEl.classList.add('on');
    failTipEl.setAttribute('aria-hidden', 'false');
  }
  function hideFailTip() {
    if (!failTipEl) return;
    failTipEl.classList.remove('on');
    failTipEl.setAttribute('aria-hidden', 'true');
  }
  const ftLaterBtn = document.getElementById('ftLater');
  if (ftLaterBtn) ftLaterBtn.addEventListener('click', () => { audio.sfx('uiSwitch'); hideFailTip(); });
  const ftGoBtn = document.getElementById('ftGo');
  if (ftGoBtn) {
    ftGoBtn.addEventListener('click', () => {
      audio.sfx('uiSwitch');
      hideFailTip();
      // 结算卡一起收掉：已经决定去花钱了，别让两层遮罩叠着
      resultEl.classList.remove('on');
      resultEl.setAttribute('aria-hidden', 'true');
      showTitle();          // 游戏世界还停在原地（和「存档并退出」一样）
      showCampfire();       // 直接把商店推到他面前
    });
  }

  // ============================================================
  // 新怪物信息卡（第 55 块，用户要求）
  // ------------------------------------------------------------
  // 「每遇到一个新类型的怪，游戏暂停，展示它的攻击方式，点了才继续。」
  //   · 「新」= 这份档案第一次遇见（profile.met，一种怪一辈子只拦一次），
  //     不是每局都弹 —— 每局弹一次会把 20 回合的节奏全打断。
  //   · 冻结方式沿用全局约定：gameState 换成 'meet'，tick 里的 combatOn 随之变假，
  //     移动、怪物、波次、战斗计时一起停（战斗计时也因此天然不含看卡的时间）。
  //   · 内容直接借图鉴那一份（codex.js 的 name/sub/desc/thumb），
  //     一处改文案、两处同步，不会再出现「图鉴说一套、卡片说另一套」。
  // ============================================================
  const meetEl = document.getElementById('meetCard');
  const mtImg = document.getElementById('mtImg');
  const mtName = document.getElementById('mtName');
  const mtSub = document.getElementById('mtSub');
  const mtDesc = document.getElementById('mtDesc');
  const mtOk = document.getElementById('mtOk');
  let meetOpen = false;
  let meetType = '';           // 现在这张卡讲的是谁（测试要看）
  let meetAfter = 'playing';   // 关掉之后回到哪个状态
  const meetQueue = [];        // 同一帧冒出来好几只新怪时排队，一张一张来
  // 自动化测试友好：?debug=1 下**默认不弹**这张卡。
  // 理由：它会冻结整个世界，而二十多套老 CDP 都要开局、刷怪、等回合推进，
  // 一上来就被拦一下会连着挂（第 55 块回归时实测 block53 就栽在这）。
  // 要测这张卡的套件在地址后面加 &meet，或者在 debug 里调 __game.meetCard.setAuto(true)。
  const meetQs = new URLSearchParams(location.search);
  let meetAuto = meetQs.has('debug') ? meetQs.has('meet') : true;

  function meetInfo(type) {
    const all = codexEntries('enemies');
    return all.find((e) => e.id === type) || null;
  }

  // 怪物上场时被 enemy.js 的 onSpawn 叫到
  function onMeetSpawn(e) {
    if (!meetAuto) return;                 // debug 下没加 &meet：自动化测试不想被拦
    if (!e || !e.type) return;
    // 只在真打的时候拦人：教程 / 武器教程里冒出来的怪先放过（那些有自己的教学卡，
    // 而且教程靶子就是第一关的兵，留给正式开打时再讲）。不记「见过」，下次还会判。
    if (gameState !== 'playing' || !level.roundNo || meetOpen) return;
    if (enemyMet(e.type)) return;
    if (!markEnemyMet(e.type)) return;     // 写档案；沙盒期 save 会被吞掉，只在内存里
    meetQueue.push(e.type);
    pumpMeet();
  }

  function pumpMeet() {
    if (meetOpen || !meetQueue.length) return;
    if (gameState !== 'playing') return;   // 等世界回到战斗状态再弹
    const type = meetQueue.shift();
    const info = meetInfo(type);
    if (!info) { pumpMeet(); return; }     // 图鉴里没有这只（以后新加的）就不拦路
    meetType = type;
    meetAfter = gameState;
    meetOpen = true;
    gameState = 'meet';
    input.joystick.release();
    vel.set(0, 0, 0);
    audio.sfx('event');
    mtName.textContent = info.title;
    mtSub.textContent = info.sub || '';
    mtDesc.textContent = String(info.desc || '').replace(/\*\*/g, '');
    if (mtImg) {
      if (info.thumb) {
        mtImg.src = info.thumb;
        mtImg.alt = info.title;
        mtImg.hidden = false;
      } else {
        mtImg.removeAttribute('src');
        mtImg.hidden = true;
      }
    }
    meetEl.classList.add('on');
    meetEl.setAttribute('aria-hidden', 'false');
  }

  function closeMeet() {
    if (!meetOpen) return;
    meetOpen = false;
    meetType = '';
    meetEl.classList.remove('on');
    meetEl.setAttribute('aria-hidden', 'true');
    if (gameState === 'meet') gameState = meetAfter || 'playing';
    meetAfter = 'playing';
    // 排队里的下一只等这张淡完再上（两张卡硬切会闪）
    if (meetQueue.length) setTimeout(pumpMeet, 160);
  }

  if (mtOk) mtOk.addEventListener('click', () => { audio.sfx('uiSwitch'); closeMeet(); });
  // 兜底：结算 / 回标题 / 重开时把卡和队列一起收掉，别糊在下一屏上。
  // 只收界面和标记 —— gameState 由调用方自己摆（它们紧接着就会设成 over/title/playing）。
  function dropMeet() {
    meetQueue.length = 0;
    meetOpen = false;
    meetType = '';
    meetEl.classList.remove('on');
    meetEl.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('rsBtn').addEventListener('click', () => {
    // 有没领的永久火种就先选：选完 closeBoons 会自己 reload 开下一局
    if (boonPending() > 0 && showBoons({ after: 'reload' })) {
      resultEl.classList.remove('on');
      resultEl.setAttribute('aria-hidden', 'true');
      return;
    }
    location.reload();
  });

  // 调试钩子：只有 ?debug=1 才挂到 window，方便自动化测试读内部状态（正常游玩不暴露）
  if (new URLSearchParams(location.search).has('debug')) {
    window.__game = {
      stats, wstats, pos, vel, input, enemies, fx, playerRing, frog, camera, weapon, scene,
      renderer,
      // 第 36 块：相机（死区 / 焦点 / 视野）—— 减晕改动全靠这几个数验证
      cam: {
        focus: () => ({ x: camFocus.x, z: camFocus.z }),
        pos: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
        fov: () => camera.fov,
        deadzone: CAM_DEADZONE,
        fovBase: CAM_FOV_BASE,
        fovAdd: CAM_FOV_ADD,
        speedFov: () => speedFovOn,
      },
      // level 是可变引用（切关卡会整体重建），必须用 getter，否则测试盯着的是旧的回合机器
      get level() { return level; },
      get levelId() { return curLevelId; },
      get state() { return gameState; },        // 'title' / 'playing' / 'upgrade' …（第 41 块测试要断言存档退出后回到 title）
      get arenaRadius() { return ARENA_R; },   // 可走半径随关卡变（第 35 块：四关 20）
      levels: LEVELS_BY_ID,
      setLevel: (id) => { setLevel(id); return curLevelId; },
      // 第 20 块：巫师的诅咒 / 法术现场（测试要能直接看）
      curse: () => ({ t: +curseT.toFixed(2), factor: curseFactor }),
      bless: (o) => { cursePlayer(o); return { t: +curseT.toFixed(2), factor: curseFactor }; },
      zones: () => enemies.zones(),
      // 第 21 块：夜行诅咒（选中的 id / 骨币倍率 / 受伤加重）
      runCurses: () => pendingCurses.slice(),
      setCurses: (ids) => {
        pendingCurses = curseList(ids || []).map((c) => c.id);
        profile().runCurses = pendingCurses.slice();
        saveProfile();
        renderCursePick();
        return curseMul(pendingCurses);
      },
      curseMul: () => curseMul(pendingCurses),
      curseDmg: () => runCurseDmg,
      // 第 22 块：种子与每日挑战
      seedInfo: () => ({ seed: runSeed, code: runSeed ? seedCode(runSeed) : '', daily: dailyMode, stamp: dailyStamp }),
      setSeed: (n) => initRunRng(n),
      daily: {
        key: () => dayKey(),
        seed: () => dailySeed(),
        code: () => seedCode(dailySeed()),
        curses: () => pickDailyCurses(dailySeed(), RUN_CURSES),
        record: (k) => dailyRecord(k || dayKey()),
        save: (o, k) => saveDailyRecord(o || {}, k || dayKey()),
        show: () => showDaily(),
        start: () => startDaily(),
      },
      wizards: () => enemies.list
        .filter((e) => e.cfg.spell || e.cfg.aura)
        .map((e) => ({
          type: e.type, state: e.state, hp: e.hp, maxHp: e.maxHp,
          x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2),
          auraRadius: e.cfg.aura ? e.cfg.aura.radius : 0,
          buffs: enemies.list.filter((o) => o.auraHaste > 0).length,
        })),
      // 性能探针：draw call / 三角数 / 显存对象数（第 9 块排查后期卡顿）
      renderInfo: () => ({
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs ? renderer.info.programs.length : -1,
        pixelRatio: renderer.getPixelRatio(),
        drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
        sceneChildren: scene.children.length,
      }),
      // 设置面板 / 本机档案（第 17 块）
      ui: {
        settings: () => ({ ...readSettings() }),
        set: (k, v) => {
          // 管理员模式不是普通设置项：要连带改金币 / 按钮显隐（第 30 块）
          if (k === 'admin') {
            applyAdmin(v);
            if (setScr.classList.contains('on')) renderSettings();
            return adminOn;
          }
          const r = setSetting(k, v);
          applySettings();
          if (setScr.classList.contains('on')) renderSettings();
          return r;
        },
        quality: () => qualityNow,
        renderCfg: () => ({ pixelRatio: renderer.getPixelRatio(), shadow: renderer.shadowMap.enabled }),
        // 第 59 块：帧率自适应（测试钩子）。tick(sec) 直接灌一段采样，setFps 伪造帧率
        perf: {
          auto: () => PERF_AUTO,
          state: () => ({
            fps: +fps.toFixed(1), drop: autoDrop, base: QUALITY_STEPS[qualityBaseIdx].id,
            eff: QUALITY_STEPS[Math.min(QUALITY_STEPS.length - 1, qualityBaseIdx + autoDrop)].id,
            dpr: renderer.getPixelRatio(), shadow: renderer.shadowMap.enabled, told: perfTold,
            low: +perfLow.toFixed(2), ok: +perfOk.toFixed(2),
          }),
          setFps: (v) => { fps = Number(v) || 0; },
          tick: (sec = 1) => { perfSample(Math.max(0.1, Number(sec) || 1)); return autoDrop; },
          reset: () => { perfReset(); return perfTold; },
        },
        joy: () => (input.joystick.getOpts ? input.joystick.getOpts() : null),
        joyScale: () => document.getElementById('stick').style.getPropertyValue('--joy-s'),
        shake: () => shake,
        audio: () => audio.volumes(),
        showSettings: () => showSettings(),
        profile: () => profile(),
        bones: () => bones(),
        reset: () => { resetAll(); renderSettings(); applySettings(); },
      },
      // 存档续玩（第 38 块：多存档列表）
      run: {
        save: () => saveRunAtRound(level.roundNo),
        load: () => runSave.loadRuns(),
        clear: () => runSave.clearRun(runUid),
        resume: () => resumeGame(),
      },
      // 金币只在函数里读（coins 是 let，暴露快照会过期）；测试与调试用
      get coins() { return coins; },
      setCoins: (n) => { coins = Math.max(0, n | 0); renderHud(); },
      // 管理员模式（第 30 块）：测试里直接开关，不用去点密码框
      get admin() { return adminOn; },
      setAdmin: (v) => {
        applyAdmin(v);
        if (setScr.classList.contains('on')) renderSettings();
      },
      skipRound: () => {
        if (!adminOn || gameState !== 'playing') return false;
        const n = enemies.killAll();
        const ok = !!(level.skipRound && level.skipRound());
        renderSkipBtn();
        return ok ? n : -1;
      },
      // 选回合（第 34 块）：测试直接跳，等价于点面板里的格子
      jumpRound: (n) => { jumpToRound(n); return level.roundNo; },
      // 图鉴 / 成就 / 战绩 / 难度（第 18 块）
      codex: {
        add: (g, id, n) => codexAdd(g, id, n),
        count: (g, id) => codexCount(g, id),
        summary: () => codexSummary(),
        entries: (tab) => codexEntries(tab),
        show: () => showCodex(),
        tab: () => cxTab,
        // 第 57 块：分块渲染缓存状态（预热 / 秒开的证据）
        cache: () => ({ sig: cxCache.sig, hot: !!(cxCache.sig && cxCache.frag) }),
      },
      ach: {
        try: (id) => tryAch(id),
        has: (id) => hasAch(id),
        list: () => ACHS.map((a) => a.id),
      },
      stats2: () => profile().stats,
      // 篝火 / 夜行骨币（第 19 块）
      camp: {
        bones: () => bones(),
        setBones: (n) => {
          profile().bones = Math.max(0, n | 0);
          saveProfile();
          renderCampBadge();
          if (campScr.classList.contains('on')) renderCampfire();
          return bones();
        },
        owned: () => ({ ...campOwned() }),
        buy: (id) => campBuy(id, adminOn),
        apply: () => applyCampfire(),
        show: () => showCampfire(),
        hide: () => hideSub(campScr),
        gain: (o) => bonesFor(o || {}, profile().difficulty || 'normal'),
        list: () => CAMPFIRE.map((c) => ({
          id: c.id, cost: c.cost,
          costAt: (lv) => campCost(c.id, lv),
        })),
        level: (id) => campLevel(id),
        total: () => CAMPFIRE.reduce((a, c) => a + campLevel(c.id), 0),
        reset: () => {
          profile().camp = {};
          profile().bones = 0;
          saveProfile();
          renderCampBadge();
          if (campScr.classList.contains('on')) renderCampfire();
        },
      },
      // 第 54 块：失败提示（测试要看它什么时候弹、点了跳哪儿）
      failTip: {
        show: () => { showFailTip(); return true; },
        hide: () => { hideFailTip(); return true; },
        on: () => !!(failTipEl && failTipEl.classList.contains('on')),
      },
      // 新怪物信息卡（第 55 块）
      meetCard: {
        on: () => meetOpen,
        type: () => meetType,
        pending: () => meetQueue.length,
        met: (type) => enemyMet(type),
        state: () => gameState,
        auto: () => meetAuto,
        setAuto: (b) => { meetAuto = !!b; return meetAuto; },
        close: () => { closeMeet(); return true; },
        // 测试用：把某只怪或全部怪重新标成「没见过」
        forget: (type) => {
          const p = profile();
          if (!p.met) p.met = {};
          if (type) delete p.met[type];
          else p.met = {};
          saveProfile();
          return true;
        },
        // 测试用：一次性把 13 只全标成「见过」——
        // 老 CDP 套件手动刷怪时不希望被信息卡冻结，setup 里调一下就干净了。
        metAll: () => {
          for (const it of codexEntries('enemies')) markEnemyMet(it.id);
          return true;
        },
      },
      // 战斗秒表（第 55 块）：{ seconds, running, state, holds }
      // running 是「这一刻在不在计时」，测试据此断言商店/剧情/属性卡里都不涨。
      timeInfo: () => ({
        seconds: elapsed,
        running: (gameState === 'playing' || gameState === 'tutorial' || gameState === 'wtut')
          && !panelOpen && !bagOpen && !meetOpen && uiHold === 0,
        state: gameState,
        holds: uiHold,
      }),
      // 永夜火种（第 23 块）：通关白给的永久属性
      boons: {
        list: () => BOONS.map((b) => ({
          id: b.id, name: b.name, rarity: b.rarity, maxStack: b.maxStack, stacks: boonStacks(b.id),
        })),
        stacks: (id) => boonStacks(id),
        pending: () => boonPending(),
        grant: (n) => grantBoons(n ?? BOON_PICKS),
        roll: (luck) => rollBoons(Math.random, { luck: luck ?? stats.get('luck') }).map((b) => b.id),
        take: (id) => takeBoon(id),
        apply: () => applyBoons(stats, wstats),
        show: (after) => showBoons({ after: after || 'close' }),
        close: () => closeBoons(),
        open: () => boonOpen,
        totalStacks: () => boonTotalStacks(),
        owned: () => ({ ...boonOwned() }),
        reset: () => {
          profile().boons = {};
          profile().boonPending = 0;
          saveProfile();
        },
        gain: (o) => bonesFor(o || {}, profile().difficulty || 'normal'),
      },
      diff: {
        set: (k) => { profile().difficulty = k; setDifficulty(k); saveProfile(); },
        get: () => getDifficulty().name,
        scale: (n) => roundScale(n),
      },
      // 测试用：临时加一条主角属性（如 attackRange +12 让站桩也够得着远程怪）
      buff: (stat, flat) => { stats.addMod({ stat, flat, src: 'dbg:test' }); return stats.get(stat); },
      // 第 50 块：属性页（测试钩子）
      statPage: {
        show: () => showStat(),
        ready: () => statView.ready,
        yaw: () => statView.yawAngle,
        rows: () => statRows.children.length,
      },
      // 第 53 块：教程卡（武器 + 技能共用一条队列），测试要能单独开一张
      wtut: {
        show: (kind) => { queueWeaponTut(kind); return true; },
        all: () => Object.keys(WEAPON_TUT),
        open: () => wtOpen,
        kind: () => wtKind,
        step: () => wtStepIdx,
        steps: () => (WEAPON_TUT[wtKind] ? WEAPON_TUT[wtKind].steps.length : 0),
        label: () => wtStepEl.textContent,
        title: () => wtTitleEl.textContent,
        text: () => wtTextEl.textContent,
        nextBtn: () => wtNextBtn.textContent,
        next: () => { wtAdvance(); return wtOpen; },
        close: () => { wtFinish(); return wtOpen; },
        seen: () => wtSeen(),
        resetSeen: () => { try { localStorage.removeItem(WTUT_KEY); } catch (_) {} return []; },
      },
      // 第 53 块：场景亮度直接读 __game.scene（fog / 灯光都在里面），不另开钩子。
      // 第 47 块：箭雨（测试钩子）
      arrowRain: {
        state: () => ({ unlocked: arrowRain.unlocked, ready: arrowRain.ready, cdLeft: +arrowRain.cdLeft.toFixed(2), strikes: arrowRain.strikeCount }),
        unlock: () => { arrowRain.unlock(); renderSkill(); return true; },
        fire: (px, pz) => arrowRain.fire(px != null ? { x: px, z: pz } : pos),
        // 活怪数与总血量（验证箭雨真的造成伤害）；nearest 用于「远程目标」隔离验证
        probe: () => {
          const live = enemies.list.filter((e) => e.state !== 'dead' && e.state !== 'spawn');
          let best = null, bestD = Infinity;
          for (const e of live) {
            const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
            if (d < bestD) { bestD = d; best = e; }
          }
          return {
            n: live.length,
            hp: +live.reduce((s, e) => s + Math.max(0, e.hp), 0).toFixed(2),
            nearest: best ? { d: +bestD.toFixed(2), hp: +best.hp.toFixed(2), max: best.maxHp } : null,
          };
        },
      },
      // 第 46 块：音效包（测试钩子）
      pack: {
        state: () => ({ ...packState() }),
        get: () => packState().id,
        set: (id) => { const r = setPackId(id); renderSettings(); return r; },
        unlock: () => { packState().unlocked = true; saveProfile(); renderSettings(); return true; },
        retroDue: () => packRetroDue(),
        show: () => { showPackGet(); return packGetEl.classList.contains('on'); },
        yes: () => closePackGet(true),
        no: () => closePackGet(false),
        open: () => packGetEl.classList.contains('on'),
        files: () => FROG_FILES.map((f) => ({ file: f.file, offset: f.offset, preview: f.preview })),
        map: () => ({ ...FROG_SFX }),
        descs: () => PACK_LIST.map((p) => ({ ...p })),
        preview: (file, off, dur) => audio.previewVoice(file, off, dur),
        sfx: (name, vol) => audio.sfx(name, { vol: vol == null ? 1 : vol }),
        audio: () => audio.stats(),
        reset: () => {
          profile().voicePack = { unlocked: false, id: 'normal' };
          saveProfile();
          audio.setPack('normal');
          renderSettings();
        },
      },
      // 第 45 块：公告（测试钩子）—— show(true) 强制打开，show(false) 走「今日不再弹」判断
      notice: {
        show: (force) => showNotice(force !== false),
        hide: () => { closeNotice(); return noticeOv.classList.contains('on'); },
        open: () => noticeOv.classList.contains('on'),
        ver: () => NOTICE_VER,
        key: () => { try { return localStorage.getItem(NOTICE_KEY) || ''; } catch (_) { return ''; } },
        clear: () => { try { localStorage.removeItem(NOTICE_KEY); } catch (_) { /* 忽略 */ } },
        copy: (t) => copyText(t),
      },
      // 第 57 块：宣传有礼（测试钩子）—— show(true, true) 强制打开并播艺术字特效
      promo: {
        show: (force, art) => showPromo(force !== false, art !== false),
        hide: () => { closePromo(); return promoOv.classList.contains('on'); },
        open: () => promoOv.classList.contains('on'),
        art: () => promoOv.classList.contains('art'),
        ver: () => PROMO_VER,
        key: () => { try { return localStorage.getItem(PROMO_KEY) || ''; } catch (_) { return ''; } },
        clear: () => { try { localStorage.removeItem(PROMO_KEY); } catch (_) { /* 忽略 */ } },
      },
      // 第 59 块：每日签到（测试钩子）
      sign: {
        show: (auto) => showSignin(auto === true),
        hide: () => { closeSignin(); return signOv.classList.contains('on'); },
        open: () => signOv.classList.contains('on'),
        state: () => signSummary(),
        cells: () => weekCells(),
        signed: () => signedToday(),
        do: () => doSignin(),
        // dot 读的是**实际可见性**，不是 `hidden` 属性 —— 第 59 块就是这里只读属性，
        // 才让「签到后红点还在」（CSS 里 .tt-dot 的 display 压过 [hidden]）一直假绿。
        btn: () => {
          const cs = getComputedStyle(signDot);
          const visible = cs.display !== 'none' && cs.visibility !== 'hidden'
            && Number(cs.opacity) > 0.01 && signDot.getClientRects().length > 0;
          return { sub: btnSignSub.textContent, dot: visible, done: btnSign.classList.contains('done') };
        },
      },
      // 第 57 块：世界渲染闸门（测试钩子）—— 菜单期间 live()=false 且 frames 不再增长
      render: {
        live: () => worldLiveNow,
        frames: () => renderFrames,
        appH: () => appH(),
        appHpx: () => { try { return getComputedStyle(document.documentElement).getPropertyValue('--app-h').trim(); } catch (_) { return ''; } },
      },
      // 第 44 块：礼包兑换（测试钩子）
      gift: {
        count: GIFT_COUNT,
        lookup: (raw) => lookupGift(raw),
        log: () => ({ ...giftLog() }),
        bones: () => bones(),
        open: () => showGift(),
        redeem: (raw) => { giftCode.value = raw; doRedeem(); return giftMsg.textContent; },
      },
      // 场景里各类对象计数（诊断用）
      sceneStats: () => {
        let mesh = 0, skinned = 0, sprite = 0, points = 0, lights = 0, shadows = 0;
        const matSet = new Set();
        scene.traverse((o) => {
          if (o.isSkinnedMesh) { skinned++; mesh++; }
          else if (o.isMesh) mesh++;
          if (o.isSprite) sprite++;
          if (o.isPoints) points++;
          if (o.isLight) lights++;
          if (o.castShadow) shadows++;
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => matSet.add(m.uuid));
        });
        return { mesh, skinned, sprite, points, lights, shadows, materials: matSet.size,
          enemies: enemies.aliveCount(), fx: fx.count() };
      },
      // 单帧 CPU 计时：连续 N 帧里，enemies.update + weapon.update 的毫秒数
      probeTick: (frames = 30) => new Promise((resolve) => {
        const costs = [];
        let n = 0;
        const step = () => {
          const t0 = performance.now();
          enemies.update(1 / 60, combatCtx);
          weapon.update(1 / 60, { playerPos: pos });
          fx.update(1 / 60);
          costs.push(performance.now() - t0);
          if (++n < frames) requestAnimationFrame(step);
          else resolve({ avg: costs.reduce((a, b) => a + b, 0) / costs.length,
            max: Math.max(...costs), frames });
        };
        requestAnimationFrame(step);
      }),
      fireSwords: () => pressSkillById('swordRain'),
      renderSkill,
      // 技能栏（第 10 块）：注册表 + 当前每一格的状态
      skillList: () => SKILLS.map((sk) => ({ id: sk.id, name: sk.name, key: sk.key || '' })),
      visibleSkills: () => visibleSkills(skillCtx()).map((sk) => sk.id),
      pressSkill: (id) => pressSkillById(id),
      skillState: () => [...skillBar.querySelectorAll('.sk')].map((b) => ({
        id: b.dataset.skill,
        shown: b.style.display !== 'none',
        ready: b.classList.contains('ready'),
        spent: b.classList.contains('spent'),
        cd: b.querySelector('.sk-cd') ? b.querySelector('.sk-cd').style.height : '',
      })),
      getYaw: () => yaw,
      getState: () => gameState,
      getKills: () => kills,
      getElapsed: () => elapsed,
      getShots: () => enemies.shotCount(),
      setPanel: (open, tab) => setPanel(open, tab),
      getPanelTab: () => panelTab,
      isPanelOpen: () => panelOpen,
      // 开局 / 教程 / 武器卡（自动化测试用）
      beginGame: (opt) => beginGame(opt),
      closeWeaponCard: () => closeWeaponCard(),
      isWeaponCardOpen: () => weaponCardOpen,
      handleRoundClear: (n) => handleRoundClear(n),
      tutorial: {
        get step() { return tutStep; },
        get total() { return TUT_STEPS.length; },
        get moved() { return tutMoved; },
        get dummy() { return tutDummy; },
        next: () => tutNext(),
        skip: () => endTutorial(),
        start: () => startTutorial(),
      },
      // 武器用法教程（第 15 块）：测试用
      weaponTut: {
        get open() { return wtOpen; },
        get kind() { return wtKind; },
        get step() { return wtStepIdx; },
        get total() { return wtKind && WEAPON_TUT[wtKind] ? WEAPON_TUT[wtKind].steps.length : 0; },
        get queue() { return wtQueue.slice(); },
        get title() { return wtTitleEl.textContent; },
        get visible() { return wtEl.classList.contains('on'); },
        get nextShown() { return wtNextBtn.classList.contains('on'); },
        seen: () => wtSeen(),
        show: (kind) => { queueWeaponTut(kind, null); },
        // 走真实链路：武器卡 → 教程（测第 5 回合的完整顺序）
        grantRing: () => grantRingThen(null),
        next: () => wtAdvance(),
        skip: () => wtFinish(),
        reset: () => { try { localStorage.removeItem(WTUT_KEY); } catch { /* 忽略 */ } },
      },
      hurt: (n) => hurtPlayer(n),
      win: () => endGame(true),
      setPaused(p) { debugNoWaves = debugNoEnemies = !!p; },
      setWaves(p) { debugNoWaves = !!p; },
      setEnemies(p) { debugNoEnemies = !!p; },
      isPaused: () => debugNoWaves || debugNoEnemies,
      // 三选一：手动弹面板 / 直接选 / 读池子（自动化测试用）
      upgrade: {
        show: (roundNo = level.roundNo, after = null) => showUpgrade(roundNo, after),
        choose: (up) => chooseUpgrade(up),
        // 第 22 块：走「本局随机流」，种子局里调试抽卡和实战抽卡是同一颗种子
        roll: (luck) => rollChoices(rngOf('card'), { luck: luck ?? stats.get('luck'), hasWeapon: weapon.granted }),
        odds: (roundNo = level.roundNo, luck) => rarityOdds(roundNo, {
          luck: luck ?? stats.get('luck'), hasWeapon: weapon.granted,
        }),
        list: UPGRADES,
        get taken() { return takenUpgrades.map((u) => u.id); },
        // 面板上实际渲染出来的三张卡（含品质，测试直接读 DOM）
        get cards() {
          return [...upList.querySelectorAll('.up-item')].map((b) => ({
            id: b.dataset.id, tag: b.dataset.tag, rarity: b.dataset.rarity,
            rank: b.querySelector('.up-rank') ? b.querySelector('.up-rank').textContent : '',
          }));
        },
        isOpen: () => upgradeOpen,
      },
      // 金币 / 商店 / 随机事件（自动化测试用）
      get coins() { return coins; },
      addCoins: (n) => addCoins(n),
      dropCoin: (at) => gold.spawn(at || { x: pos.x, z: pos.z }),
      get coinCount() { return gold.count(); },
      gold,
      shop: {
        open: (roundNo = level.roundNo, after = null) => openShop(roundNo, after),
        close: () => closeShop(),
        buy: (id) => { const it = SHOP_ITEMS.find((s) => s.id === id); if (it) buyItem(it); },
        isOpen: () => shopOpen,
        items: SHOP_ITEMS,
        get stock() { return shopStock.slice(); },
        // 店里实际渲染出来的货（含品质角标）
        get cards() {
          return [...shList.querySelectorAll('.sh-item')].map((b) => ({
            name: b.querySelector('.sh-name') ? b.querySelector('.sh-name').textContent : '',
            rarity: b.dataset.rarity || '',
            price: b.querySelector('.sh-buy b') ? b.querySelector('.sh-buy b').textContent : '',
            disabled: b.disabled,
          }));
        },
        odds: (luck) => oddsOf(
          SHOP_ITEMS.filter((it) => !(it.needWeapon && !weapon.granted)),
          { luck: luck ?? stats.get('luck') }
        ).map((o) => o.p),
        get discount() { return nextShopDiscount; },
        roll: (rng, luck) => rollShopItems(rng || rngOf('shop'), {
          hasWeapon: weapon.granted,
          round: level.roundNo,
          turretCount: turrets.count(),
          relicLevels: relics.levels(),
          luck: luck ?? stats.get('luck'),
        }),
        render: () => renderShop(),
      },
      // 运气与折扣（第 11 块）
      get luck() { return stats.get('luck'); },
      rarity: RARITIES,
      get shopDiscount() { return nextShopDiscount; },
      event: {
        // 传事件 id 手动触发（绕过抽取，便于确定性测试）。
        // 注意：新结构的效果在每个选项里，触发后要用 choose(idx) 选一项才会结算。
        trigger: (id, endedRound = level.roundNo) => {
          const ev = getEventById(id);
          if (!ev) return null;
          seenEvents.push(id);
          openEvent(ev, endedRound, null);
          return ev;
        },
        choose: (idx) => {
          const btns = evChoices.querySelectorAll('.ev-btn');
          if (btns[idx] && !btns[idx].disabled) { btns[idx].click(); return true; }
          return false;
        },
        next: () => { evNext.click(); },
        close: () => closeEvent(),
        isOpen: () => eventOpen,
        isResultOpen: () => evResult.classList.contains('on'),
        get resultLines() {
          return [...evResultLines.querySelectorAll('span')].map((s) => s.textContent);
        },
        list: EVENTS,
        all: ALL_EVENTS,
        // 第 31 块：按真实规则抽 n 次（含 cond 筛、权重、最近 3 次不重复），只返回 id
        pick: (n = 1) => {
          const ctx = {
            round: level ? level.roundNo + 1 : 1, hasWeapon: weapon.granted, gold: coins,
            rep: reputation, hp: stats.hp.cur, luck: stats.get('luck'), levelId: curLevelId,
          };
          const out = [];
          const recent = [];
          for (let i = 0; i < n; i++) {
            const ev = pickEvent(ctx, recent, rngOf('event'));
            if (!ev) break;
            recent.push(ev.id);
            out.push(ev.id);
          }
          return out;
        },
        // 指定关卡 id 抽 n 次（验证第三关专属事件）
        pickAt: (lvId, n = 1) => {
          const ctx = {
            round: 14, hasWeapon: true, gold: 20, rep: 50, hp: 5, luck: 0, levelId: lvId,
          };
          const out = [];
          const recent = [];
          for (let i = 0; i < n; i++) {
            const ev = pickEvent(ctx, recent, rngOf('event'));
            if (!ev) break;
            recent.push(ev.id);
            out.push(ev.id);
          }
          return out;
        },
        get queue() { return laterQueue.map((q) => ({ due: q.due, id: q.id })); },
        get currentRound() { return currentEventRound; },
        // 对话式事件（第 10 块）：现在拍到第几拍、说过哪些话、这一拍能回什么
        get isTalk() { return !!(talk && talk.ev); },
        get beat() { return talk ? talk.beat : -1; },
        get talkEvent() { return talk ? talk.ev.id : null; },
        get replies() {
          return [...evChoices.querySelectorAll('.ev-btn b')].map((b) => b.textContent);
        },
        get transcript() {
          return [...evTalk.querySelectorAll('.tl')].map((r) => {
            const b = r.querySelector('b');
            const sp = r.querySelector('span');
            return {
              cls: (r.className || '').replace('tl ', ''),
              who: b ? b.textContent : '',
              text: sp ? sp.textContent : '',
            };
          });
        },
        get acc() { return talk ? JSON.parse(JSON.stringify(talk.acc)) : null; },
        // 第 42 块：读秒还剩几秒 / 按钮是不是还锁着
        get cdLeft() { return talkCdLeft; },
        get cdLocked() { return talkCdBtns.length > 0; },
        readDelay: TALK_READ_DELAY,       // 第 43 块：主线与奇遇共用的读秒秒数
      },
      // 主线（第 32 块，测试用）
      story: {
        arc: STORY_ARC,
        readDelay: TALK_READ_DELAY,
        chapters: STORY_CHAPTERS,
        endings: STORY_ENDINGS,
        get progress() { return JSON.parse(JSON.stringify(storyProgress())); },
        seenCount: () => STORY_CHAPTERS.filter((c) => storyProgress().seen[c.id]).length,
        readCount: () => STORY_CHAPTERS.filter((c) => storyProgress().read[c.id]).length,
        // 这一关、这个回合该播哪一夜（调度逻辑直接暴露，方便断言「不重复播」）
        at: (levelId, round) => {
          const ch = storyChapterAt(levelId, round, storyProgress().seen);
          return ch ? ch.id : null;
        },
        // 局内直接播某一夜（跳过回合条件）
        play: (id) => {
          const ch = storyChapterById(id);
          if (!ch) return null;
          playStoryChapter(ch, level.roundNo, null);
          return ch.id;
        },
        endingKey: () => storyEndingKey(storyProgress().marks),
        // 手动记一次印记（测三结局结算用）
        mark: (kind) => addStoryMark(kind),
        clearMarks: () => {
          const s = storyProgress();
          s.marks = {};
          saveProfile();
          return s.marks;
        },
        // 清「亲历」记录（测同一夜能不能再播一次）
        forget: () => {
          const s = storyProgress();
          s.seen = {};
          saveProfile();
          return true;
        },
        get transcript() {
          return [...evTalk.querySelectorAll('.tl')].map((r) => {
            const b = r.querySelector('b');
            const sp = r.querySelector('span');
            return { cls: (r.className || '').replace('tl ', ''), who: b ? b.textContent : '', text: sp ? sp.textContent : '' };
          });
        },
        get endingShown() {
          return [...evResultLines.querySelectorAll('span')].map((s) => s.textContent);
        },
      },
      // 回合临时效果的生命周期（测试用：看它挂在第几回合、能手动撤）
      get roundBuffSrc() { return roundBuffSrc; },
      clearRoundBuffs: () => clearRoundBuffs(),
      get roundDrain() { return roundDrain; },
      // 音频（第 8 块）
      audio,
      audioStats: () => audio.stats(),
      toggleMute: () => { audio.toggleMute(); renderMute(); return audio.isMuted(); },
      // 民心（第 7 块）
      get rep() { return reputation; },
      addRep: (n) => addRep(n),
      get repMul() { return repPriceMul(); },
      priceOf: (id) => { const it = SHOP_ITEMS.find((x) => x.id === id); return it ? priceOf(it) : null; },
      // 元素剑：直接加一把（绕过商店扣费，测试用）
      addSword: (kind) => weapon.addSword(kind),
      get swordKinds() { return weapon.kindCounts(); },
      swordKindsAll: SWORD_KINDS,
      // 万剑齐发冷却（第 56 块）：ready = 能放；cdLeft 剩余秒数；progress 0→1
      fireReady: () => weapon.fireReady,
      fireCdLeft: () => +weapon.fireCdLeft.toFixed(2),
      fireCdTotal: () => weapon.fireCdTotal,
      fireCdProgress: () => +weapon.fireCdProgress.toFixed(3),
      // 炮台 / 法器 / 金钟罩 / 背包（第 13 块，测试用）
      turrets: {
        spawn: () => turrets.spawn(pos),
        reset: () => turrets.reset(),
        count: () => turrets.count(),
        boltCount: () => turrets.boltCount(),
        list: () => turrets.list(),
        TURRET,
      },
      relics: {
        buy: (kind) => relics.buy(kind),
        levels: () => relics.levels(),
        DEF: RELIC_DEFS,
        debugShow: (x, z) => relics.debugShow && relics.debugShow(x, z),
        // 第 29 块：手动敲钟 / 手动触发棘甲反伤（截图与测试用）
        ringBell: (at) => (relics.debugBell ? relics.debugBell(at || pos) : null),
        thorns: (at) => relics.thornsHit(at || pos),
        // 第 35 块：手动烧一次暖炉
        stove: (at) => (relics.debugStove ? relics.debugStove(at || pos) : 0),
      },
      // 第 58 块：局外商店 · 宝箱（测试 / 调试用）
      meta: {
        boxes: BOXES,
        state: () => metaShopState(),
        summary: () => metaSummary(),
        roll: (id) => rollBox(id),
        buy: (id, admin = false) => buyBox(id, Math.random, admin),
        bones: () => bones(),
        addBones: (n) => addBones(n),
        // 第 59 块：把永久效果注入当前 stats/wstats（测「负向真的扣属性、合并后条数很少」）
        apply: () => metaApplyStats(stats, wstats),
      },
      aegis: {
        get level() { return stats.get('aegis'); },
        get active() { return aegisActive; },
        get cycle() { return aegisCycle; },
        get period() { return aegisPeriod(); },
        reset: () => aegisReset(),
        add: () => { stats.addMod({ stat: 'aegis', flat: 1, src: 'dbg:aegis' }); aegisReset(); },
        // 特效三件套的可见性与参数（第 16 块：要「很明显」）
        get fx() {
          return {
            sphere: aegisShield.visible, wire: aegisWire.visible, ground: aegisGround.visible,
            sphereOpacity: aegisShield.material.opacity,
            wireOpacity: aegisWire.material.opacity,
            groundScale: +aegisGround.scale.x.toFixed(3),
            groundX: +aegisGround.position.x.toFixed(2),
            groundZ: +aegisGround.position.z.toFixed(2),
          };
        },
      },
      bag: {
        get counts() { return { ...bag }; },
        get total() { return bagCount(); },
        add: (id, n) => bagAdd(id, n),
        use: (id) => useBagItem(id),
        open: () => setBag(true),
        close: () => setBag(false),
        isOpen: () => bagOpen,
        render: () => renderBag(),
        clear: () => { bag.potion = 0; bag.bigPotion = 0; renderBagBtn(); },
      },
      setAegisCycle: (t) => { aegisCycle = t; },
    };
  }

  // ---------------- 主循环 ----------------
  const clock = new THREE.Clock();
  let fps = 60, frames = 0, acc = 0, hudAcc = 0;

  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // ---------------- 咒面图腾的减速诅咒（第 20 块） ----------------
  // 紫阵命中后短时间降低**移速**，不影响攻击和技能，也不叠加（取更狠的一次）。
  // 设计意图：这是「走位失误的惩罚」，不是「把你钉死」——
  // 全点满的篝火也吃不掉这个 debuff，但它 2.6 秒就过去了。
  function clearCurse() {
    curseT = 0;
    curseFactor = 1;
    renderCurse();
  }
  function cursePlayer({ factor = 0.62, duration = 2.6 } = {}) {
    const wasClean = curseT <= 0;    // 已经被咒着时不再叠音（紫圈会叠）
    if (curseT <= 0) curseFactor = factor;
    else curseFactor = Math.min(curseFactor, factor);   // 叠两次取更慢的那个
    curseT = Math.max(curseT, duration);
    if (wasClean) audio.sfx('curse');   // 第 25 块：被拖慢的下行扫弦
    renderCurse();
  }
  function updateCurse(dt) {
    if (curseT <= 0) return;
    curseT -= dt;
    if (curseT <= 0) { curseT = 0; curseFactor = 1; }
    renderCurse();
  }

  // 传给怪物 AI 的上下文（每帧复用同一个对象，避免反复分配）
  const combatCtx = {
    playerPos: pos,
    playerRadius: BODY_R,
    get arenaRadius() { return ARENA_R; },   // 随关卡变（第三关 19，第 33 块）
    hurtPlayer,
    cursePlayer,
  };

  function tick() {
    requestAnimationFrame(tick);

    const dt = Math.min(0.05, clock.getDelta());
    syncAudio();

    // 属性页开着时驱动 3D 展台（第 50 块）：拖动旋转 / 待机蹦跶
    if (statScr && statScr.classList.contains('on')) {
      statView.resize();
      statView.update(dt);
    }

    let speed = 0;
    let speed01 = 0;
    const prevX = pos.x, prevZ = pos.z;

    // 教程/武器教程也算「在游戏里」：能移动、能打怪，只是不推进回合波次
    // 背包打开时同样冻结（第 13 块：随时能开，开就是暂停）
    // 第 55 块（用户要求）：这才是「本局战斗时长」的唯一开关。
    //   · 商店 / 奇遇 / 主线剧情 / 升级三选一 / 武器卡 / 新怪信息卡
    //     都把 gameState 换掉了 → 不进这里 → 不计时；
    //   · 属性卡（panelOpen）、背包（bagOpen）、确认弹窗（uiHold）也是同类拦路。
    // 也就是说：只有真的能动、能挨打、怪在动的那段时间，秒表才走。
    const inGame = (gameState === 'playing' || gameState === 'tutorial' || gameState === 'wtut')
      && !panelOpen && !bagOpen && !meetOpen && uiHold === 0;
    // 第 57 块：世界渲染闸门 —— 不在「真的在打」的时候就停掉整屏 3D 渲染。
    // 为什么：菜单 / 图鉴 / 夜行记忆 / 商店都盖在画布上，且 .tt-sub-scr 之类
    // 带 backdrop-filter 模糊；画布每帧重绘 → 合成器每帧重新模糊整屏，
    // 老手机上直接卡成幻灯片（用户报「图鉴和夜行记忆打开非常卡顿」）。
    // 世界静态化后模糊结果被缓存，菜单才滑得起来；回到战斗第一帧即恢复。
    // 结算面板只保留倒地那一下的动画（deadT < 1.4），之后也冻结。
    const worldLive = inGame || (gameState === 'over' && deadT < 1.4);
    worldLiveNow = worldLive;
    if (inGame) {
      elapsed += dt;
      updateCurse(dt);

      // 1) 输入 → 目标速度（屏幕 y 向下 = 世界 +Z，相机在 +Z 方向看向场景）
      //    移速取属性面板里的实时值：升级加成就立刻跑得更快
      // 被咒面图腾的咒打中时移速打折（第 20 块）
      const moveSpeed = stats.get('moveSpeed') * (curseT > 0 ? curseFactor : 1);
      const dir = input.read();
      const targetVX = dir.x * moveSpeed;
      const targetVZ = dir.y * moveSpeed;
      const k = 1 - Math.exp(-ACCEL * dt);
      vel.x += (targetVX - vel.x) * k;
      vel.z += (targetVZ - vel.z) * k;

      // 2) 位移 + 边界约束（圆形场地，撞边只丢掉向外那部分速度）
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;

      const limit = ARENA_R - BODY_R;
      const dist = Math.hypot(pos.x, pos.z);
      if (dist > limit) {
        const nx = pos.x / dist, nz = pos.z / dist;
        pos.x = nx * limit;
        pos.z = nz * limit;
        const outward = vel.x * nx + vel.z * nz;
        if (outward > 0) {
          vel.x -= nx * outward;
          vel.z -= nz * outward;
        }
      }

      // 3) 朝向：只在真的在走的时候转身，停下保持原朝向
      speed = Math.hypot(vel.x, vel.z);
      speed01 = Math.min(1, speed / Math.max(0.01, moveSpeed));
      if (speed > 0.35) {
        const targetYaw = Math.atan2(vel.x, vel.z);
        yaw = lerpAngle(yaw, targetYaw, 1 - Math.exp(-TURN_SPEED * dt));
      }

      // 4) 自动近战：冷却好了就打攻击范围内最近的怪
      if (attackCd > 0) attackCd -= dt;
      if (attackCd <= 0) playerAttack();

      // 5) 怪物 AI → 波次推进 → 环剑 → 炮台/法器 → 金币 → 生命回复 / 无敌帧
      if (!debugNoEnemies) enemies.update(dt, combatCtx);
      if (!debugNoWaves && gameState === 'playing') level.update(dt);
      weapon.update(dt, { playerPos: pos });
      arrowRain.update(dt);
      turrets.update(dt, { playerPos: pos });
      relics.update(dt, { playerPos: pos });
      aegisUpdate(dt);
      // 金币：攻击范围圈就是拾取范围（第 23 块，进圈即吸），圈外的 3 秒后自动入账
      gold.update(dt, pos, stats.get('attackRange'));
      renderSkill();
      if (stats.hp.cur < stats.get('maxHp')) stats.heal(stats.get('hpRegen') * dt);
      // 事件造成的持续流失（乞丐吐痰）：绕过回复直接扣，能磨死人也只作用于本回合
      if (roundDrain > 0 && gameState === 'playing') {
        stats.hp.cur = Math.max(0, stats.hp.cur - roundDrain * dt);
        if (stats.hp.cur <= 0) { endGame(false); }
      }
      if (iframe > 0) iframe -= dt;
      if (gameState === 'tutorial') tutorialTick(Math.hypot(pos.x - prevX, pos.z - prevZ));
      if (gameState === 'wtut') wtTick();
    } else if (gameState === 'over') {
      // 结算后：失败就慢慢侧倒，胜利保持站姿待机
      deadT += dt;
      const k = Math.min(1, deadT / 0.6);
      if (!won) {
        frog.root.rotation.z = -Math.PI * 0.5 * k * k;
        frog.root.position.y = pos.y - 0.12 * k;
      }
      frog.update(dt, 0);
    } else {
      // 标题页 / 三选一 / 武器卡 / 属性面板：世界全冻结，只留待机呼吸
      // （第 57 块：不渲染时连呼吸也省了，见下面 worldLive 闸门）
      if (worldLive) frog.update(dt, 0);
    }

    // 排着队的武器教程：等面板/结算都关掉、回到可操作状态再弹
    if (wtQueue.length > 0 && gameState === 'playing') wtPump();

    frog.root.position.x = pos.x;
    frog.root.position.z = pos.z;
    frog.yaw.rotation.y = yaw + MODEL_YAW;
    if (inGame) frog.update(dt, speed01);

    // 受击无敌帧的视觉反馈：模型一闪一闪（第 33 块）。
    // 只藏身体不藏影子逻辑太琐碎，直接切换可见性；无敌帧结束的下一帧必定恢复可见。
    frog.mesh.visible = !(iframe > 0 && Math.floor(elapsed * 9) % 2 === 1);

    // 管理员模式：跳过按钮跟着 gameState 自动显隐（不在打的时候收起来）
    renderSkipBtn();

    if (worldLive) {
      // 脚下的攻击范围环：位置跟人走，半径跟属性走
      playerRing.setRadius(stats.get('attackRange'));
      playerRing.mesh.position.x = pos.x;
      playerRing.mesh.position.z = pos.z;
      playerRing.update(dt);

      // 6) 相机：死区 + 平滑焦点（第 36 块重做，详见文件顶部常量处的说明）
      //    - 角色在死区内走动：焦点不动 → 画面一动不动（眼睛有静止参考）
      //    - 走出死区：把焦点往「角色刚好落回死区边缘」的位置缓动 → 屏幕匀速平移
      //    - 注视点就是焦点，不做速度预测 → 急停急转时镜头不会甩
      {
        const fdx = pos.x - camFocus.x;
        const fdz = pos.z - camFocus.z;
        const fd = Math.hypot(fdx, fdz);
        if (fd > CAM_DEADZONE) {
          // 目标焦点 = 角色位置往回收「死区半径」那么多（角色正好贴在死区边缘）
          const tx = pos.x - (fdx / fd) * CAM_DEADZONE;
          const tz = pos.z - (fdz / fd) * CAM_DEADZONE;
          const ck = 1 - Math.exp(-CAM_FOLLOW * dt);
          camFocus.x += (tx - camFocus.x) * ck;
          camFocus.z += (tz - camFocus.z) * ck;
        }
        camera.position.set(camFocus.x + camOffset.x, camOffset.y, camFocus.z + camOffset.z);
        camera.lookAt(camFocus.x, 0.95, camFocus.z);

        // 速度感视野：跑满时 +CAM_FOV_ADD 度，停下慢慢回到原值；设置里可关
        const fovTarget = CAM_FOV_BASE + (speedFovOn ? CAM_FOV_ADD * speed01 : 0);
        camFov += (fovTarget - camFov) * (1 - Math.exp(-CAM_FOV_LERP * dt));
        if (Math.abs(camFov - camera.fov) > 0.005) {
          camera.fov = camFov;
          camera.updateProjectionMatrix();
        }
      }

      // 受击震屏：只抖相机位置，注视点不变（旋转不动，比「连镜头一起转」舒服得多）
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 2.0);
        const s = shake * 0.16;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
        camera.position.z += (Math.random() - 0.5) * s;
      }

      // 7) 特效 → 场景动画 → 渲染
      fx.update(dt);
      updateScene(dt);
      renderFrames++;
      renderer.render(scene, camera);
    }

    // 7) HUD（每 0.25 秒刷一次，别每帧动 DOM）
    frames++;
    acc += dt;
    hudAcc += dt;
    if (acc >= 0.5) {
      fps = frames / acc;
      frames = 0; acc = 0;
    }
    // 第 59 块：帧率自适应 —— 每满 1 秒拿当前 fps 判一次要不要降/升档
    perfAcc += dt;
    if (perfAcc >= 1) { const perfDt = perfAcc; perfAcc = 0; perfSample(perfDt); }
    if (hudAcc >= 0.25) {
      hudAcc = 0;
      renderHud();
      whSub.textContent = `荒草地 · 击杀 ${kills}`;
      // yaw 内部是累加值（转身插值会跨 ±180° 继续加减），显示前规范到 0~360
      const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
      dbgEl.textContent =
        `FPS ${fps.toFixed(0)}   速度 ${speed.toFixed(2)}\n` +
        `坐标 ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}   朝向 ${deg.toFixed(0)}°   怪 ${enemies.aliveCount()}`;
    }

    // 第一次真的走起来就把提示淡掉
    if (!hintDone && speed01 > 0.15) {
      hintDone = true;
      hintEl.classList.add('off');
    }
  }

  // 加载完成 → 淡出遮罩 → 标题页同步淡入（或调试模式直接开打）
  // 第 57 块：标题页在整个加载段都藏着（HTML 里 display:none + .off）——
  // 以前它一直绘在遮罩背后，手机上两个全屏大图层互相抢合成器，
  // 用户看到的就是「进度条还在走，主页面在后面闪」。现在到遮罩淡出
  // 这一刻才让它淡入，加载段眼里只有进度条。
  setProgress(1);
  clock.start();
  tick();
  setTimeout(() => {
    loadingEl.classList.add('off');
    if (loadTipTimer) { clearInterval(loadTipTimer); loadTipTimer = null; }   // 第 48 块
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
    showTitle();               // 标题页随遮罩一起淡入
    if (AUTO_START) {
      // 调试模式直接开打：公告 / 宣传有礼都不挡自动化测试
      // （要测就手调 __game.notice.show() / __game.promo.show()）
      setTimeout(() => beginGame({ tutorial: false }), 300);
    } else {
      // 第 45 块：进主界面后弹一次公告 —— 等遮罩淡完再弹，不然像加载卡住了
      // 第 57 块：公告今天已经关过（勾了不再弹）→ 宣传有礼自己接着上场
      // 第 59 块：这条链变成 公告 → 签到 → 宣传有礼（见 afterNoticeChain）
      setTimeout(() => {
        if (!showNotice(false)) setTimeout(() => afterNoticeChain(), 350);
      }, 700);
      // 第 46 块补丁：老玩家追溯解锁（公告 z-index 46 盖着音效包卡 20，
      // 推到 1.6s 后弹，公告关掉后它正好还在）
      setTimeout(() => { if (!packState().unlocked && packRetroDue()) showPackGet(); }, 1600);
    }
  }, loadFailed ? 2200 : 60);

  // 5 秒后不管有没有动，提示都淡掉，避免挡视线
  setTimeout(() => hintEl.classList.add('off'), 5200);
}   // boot()

boot().catch((err) => {
  console.error('[启动失败]', err);
  const txt = document.getElementById('ldTxt');
  if (txt) {
    txt.textContent = '启动失败：' + (err && err.message ? err.message : '未知错误');
    txt.style.color = '#ff8a78';
    txt.style.fontSize = '12px';
  }
});
