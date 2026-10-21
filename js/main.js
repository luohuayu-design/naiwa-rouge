// ============================================================
// main.js —— 蛙步 · 夜行（肉鸽原型 第 1 块：角色 + 摇杆 + 可行走场景）
//
// 这一版只做「移动手感」：没有敌人、没有攻击、没有升级。
// 目标是把三件事调顺：摇杆输入 → 角色速度/朝向 → 相机跟随。
// 后续叠战斗时，只需要在 tick() 里加敌人更新与自动攻击，不用动输入层。
// ============================================================
import * as THREE from '../lib/three.module.js';
import { buildNightScene } from './scene.js';
import { loadFrog, buildFallbackFrog, MODEL_YAW } from './frog.js';
import { createInput } from './input.js';
import { createStats, STAT_DEFS } from './stats.js';
import { createWeaponStats } from './weaponStats.js';
import { createFx } from './fx.js';
import { createEnemySystem } from './enemy.js';
import { createLevel1, LEVEL_1 } from './wave.js';
import { createRangeRing } from './rangeRing.js';
import { rollChoices, applyUpgrade, previewUpgrade, upgradeText, UPGRADES, rarityOdds } from './upgrade.js';
import { createWeaponSystem } from './weapon.js';
import { SWORD_KINDS } from './swordKinds.js';
import { createGoldSystem } from './gold.js';
import { SHOP_ITEMS, itemLocked, rollShopItems, SHOP_SHOW } from './shop.js';
import { createTurretSystem, TURRET } from './turret.js';
import { createRelicSystem, RELIC_DEFS } from './relics.js';
import { RARITIES, rarityInfo, highTierOdds, oddsOf } from './rarity.js';
import audio from './audio.js';
import { SKILLS, visibleSkills, skillForKey } from './skills.js';
import {
  EVENTS, ALL_EVENTS, getEventById, pickEvent, effectLines,
  choiceHint, canAfford, costShort, REP_MIN, REP_MAX, REP_START,
  isTalk, eventChoices, resolveRoll, mergeEffects,
} from './events.js';

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
  const ARENA_R = 15;          // 可走半径（石头圈在 15.55）
  const BODY_R = 0.65;         // 角色自身半径（贴边留一点余量）
  const ACCEL = 14;            // 速度趋近系数，越大越「跟手」
  const TURN_SPEED = 13;       // 转身角速度系数
  const CAM_OFFSET = new THREE.Vector3(0, 10.6, 9.2);
  const CAM_LERP = 7;
  const IFRAME = 0.55;         // 受击后的无敌时间（防止被多只小兵同帧秒杀）
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
  const { scene, update: updateScene } = buildNightScene({ arenaRadius: ARENA_R });

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 220);
  const camOffset = CAM_OFFSET.clone();

  function applyViewport() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // 竖屏时把相机往后拉，否则角色会顶满屏幕
    const k = camera.aspect < 1 ? 1.0 + (1 - camera.aspect) * 0.55 : 1;
    camOffset.copy(CAM_OFFSET).multiplyScalar(k);
    camera.updateProjectionMatrix();
  }
  applyViewport();
  window.addEventListener('resize', applyViewport);
  window.addEventListener('orientationchange', () => setTimeout(applyViewport, 120));

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
  const upPanel = document.getElementById('upgrade');
  const upList = document.getElementById('upList');
  const upTitle = document.getElementById('upTitle');
  const upSub = document.getElementById('upSub');
  const upFoot = document.getElementById('upFoot');
  // 开始界面 / 新手教程 / 武器获得卡
  const titleScr = document.getElementById('titleScr');
  const btnStart = document.getElementById('btnStart');
  const tutAsk = document.getElementById('tutAsk');
  // 主菜单子面板：关卡选择 / 我的记录（第 14 块）
  const levelSel = document.getElementById('levelSel');
  const lvList = document.getElementById('lvList');
  const recordsScr = document.getElementById('recordsScr');
  const rcList = document.getElementById('rcList');
  const tutCard = document.getElementById('tutCard');
  const tcStep = document.getElementById('tcStep');
  const tcTitle = document.getElementById('tcTitle');
  const tcText = document.getElementById('tcText');
  const tcBar = document.getElementById('tcBar');
  const wcard = document.getElementById('weaponCard');
  let hintDone = false;

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
      tip.textContent = '第 5 回合结束会自动获得环剑，下面是它的独立数值（不吃主角的攻击与暴击）。';
      apList.appendChild(tip);
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
    onDeath: (e) => {
      kills++;
      // 小兵是自爆 → 爆炸声；其他怪是被打死 → 骨头散架声
      audio.sfx(e.cfg.selfDestruct ? 'explode' : 'die');
      // 金币掉落：按 goldRate 掷骰（概率属性，财运升级可提升）
      gold.maybeDrop(e.pos);
    },
  });

  let enemyLoadOk = true;
  try {
    // 三种怪都要预载：投手（远程）第 11 回合登场，模型 655KB
    await enemies.preload(['minion', 'warrior', 'archer', 'bowman'], (p) => setProgress(0.55 + p * 0.42));
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
  function renderGold() {
    goldNumEl.textContent = String(coins);
  }
  function addCoins(n) {
    if (n > 0) audio.sfx('coin');
    coins = Math.max(0, coins + n);
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
  let gameState = 'title';
  let elapsed = 0;             // 本局时长（秒）
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
  const aegisShield = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0xffd66e, transparent: true, opacity: 0.16,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  aegisShield.position.y = 0.75;
  aegisShield.visible = false;
  scene.add(aegisShield);

  function aegisPeriod() {
    const lv = Math.ceil(stats.get('aegis'));
    if (lv < 1) return AEGIS.PERIOD;
    return Math.max(AEGIS.MIN_PERIOD, AEGIS.PERIOD - (lv - 1) * AEGIS.STEP);
  }
  function aegisReset() {
    aegisCycle = aegisPeriod();
    aegisActive = true;        // 拿到的那一瞬间先罩 3 秒（奖励感）
    aegisShield.visible = true;
  }

  function aegisUpdate(dt) {
    const lv = stats.get('aegis');
    if (lv < 1) { aegisActive = false; aegisShield.visible = false; return; }
    if (aegisCycle <= 0) aegisCycle = aegisPeriod();
    aegisCycle -= dt;
    const active = aegisCycle <= AEGIS.DURATION;
    if (active && !aegisActive) {
      aegisActive = true;
      aegisShield.visible = true;
      audio.sfx('uiSwitch');
      fx.ring(pos, { from: 0.5, to: 1.6, color: 0xffd66e, life: 0.5, opacity: 0.8, y: 0.1 });
    } else if (!active && aegisActive) {
      aegisActive = false;
      aegisShield.visible = false;
    }
    if (aegisActive) {
      aegisShield.position.set(pos.x, 0.75 + Math.sin(elapsed * 4) * 0.05, pos.z);
      aegisShield.rotation.y = elapsed * 1.2;
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
      text: '点左上角的血条可以暂停游戏、查看全部属性。打开再关掉，教程就结束了。',
    },
  ];

  // 受击红闪用的战场冻结开关：只有 ?debug=1 的调试钩子会置 true（自动化测试用）
  let debugNoWaves = false;    // 冻结波次推进（不再刷怪）
  let debugNoEnemies = false;  // 冻结怪物 AI（已生成的怪原地不动）

  // 受击：先看金钟罩（第 13 块，护体期间完全免疫），
  // 再过无敌帧，最后按防御减伤扣血；血量归零即结束
  function hurtPlayer(amount) {
    if (gameState !== 'playing' || iframe > 0) return;
    if (aegisActive) {
      // 罩子挡下这一下：金环提示，不掉血、不触发无敌帧（罩子本来就免伤）
      fx.ring(pos, { from: 0.7, to: 1.3, color: 0xffd66e, life: 0.28, opacity: 0.7, y: 0.35 });
      return;
    }
    stats.damage(amount);
    iframe = IFRAME;
    shake = 0.55;
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
      (e) => e.state !== 'dead' && e.state !== 'spawn'
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
    const picks = rollChoices(undefined, { round: roundNo, hasWeapon: weapon.granted, luck });

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
    // 抽到金/红卡时额外一声：不是数值上的奖励，是「今晚运气站在我这边」的那一下
    const rIdx = up.rarity ?? 0;
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
      btn.append(img, cd);

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
      skillBtns.set(sk.id, { btn, cd, sk });
    }
    renderSkill();      // 先把该藏起来的藏起来（没环剑时第一格也不该露头）
  }

  // 传给技能的条件/上下文（每帧现拼，技能自己决定看不看）
  function skillCtx() {
    return { playing: gameState === 'playing', weapon, playerPos: pos, stats, coins };
  }

  function renderSkill() {
    const ctx = skillCtx();
    const list = visibleSkills(ctx);
    skillBar.classList.toggle('on', list.length > 0);
    for (const { btn, cd, sk } of skillBtns.values()) {
      const shown = list.includes(sk);
      btn.style.display = shown ? '' : 'none';
      if (!shown) continue;
      const ready = !!sk.ready(ctx);
      btn.classList.toggle('ready', ready);
      btn.classList.toggle('spent', !ready);
      const p = sk.progress ? Math.max(0, Math.min(1, sk.progress(ctx) || 0)) : 0;
      cd.style.height = (p * 100).toFixed(1) + '%';
    }
  }

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

  // ---------------- 开始界面 / 新手教程 / 武器获得卡 ----------------
  function showTitle() {
    gameState = 'title';
    audio.playBgm('night');
    titleScr.style.display = '';
    requestAnimationFrame(() => titleScr.classList.remove('off'));
    titleScr.setAttribute('aria-hidden', 'false');
  }

  function beginGame({ tutorial = false } = {}) {
    audio.unlock();               // 这一下点击就是浏览器要的「用户手势」
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
    gameState = 'playing';
    hintDone = false;
    hintEl.classList.remove('off');
    level.start();
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
    hintEl.classList.add('off');
    tutCard.classList.add('on');
    tutCard.setAttribute('aria-hidden', 'false');
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

  // 教程每帧推进：移动距离 / 靶子是否被拍死 / 属性面板是否开过又关掉
  function tutorialTick(moved) {
    if (tutStep === 0) {
      tutMoved += moved;
      tcBar.style.width = (Math.min(1, tutMoved / 2.5) / TUT_STEPS.length * 100).toFixed(1) + '%';
      if (tutMoved >= 2.5) tutNext();
    } else if (tutStep === 1) {
      if (tutDummy && tutDummy.state === 'dead') tutNext();
    } else if (tutStep === 2) {
      if (panelOpenedOnce && !panelOpen) tutNext();
    }
  }

  // ---------------- 主菜单：关卡选择 / 我的记录（第 14 块） ----------------
  // 关卡清单：以后加新关 = 在这里加一条（playable 才能点）。解锁规则：
  // 第 1 关永远开放，后面每关要「通关上一关」才解锁（看记录里的 wins）。
  const LEVELS = [
    { id: 1, name: LEVEL_1.name, playable: true },
    { id: 2, name: '第二关 · 制作中', playable: false },
  ];
  const REC_KEY = 'naiwa_rouge_records_v1';
  function loadRecords() {
    try {
      const v = JSON.parse(localStorage.getItem(REC_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch { return {}; }
  }
  function saveRunRecord(levelId, { win, time, kills, roundShown }) {
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
        const totals = level.totals;
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
          hideSub(levelSel);
          tutAsk.classList.add('on');
          tutAsk.setAttribute('aria-hidden', 'false');
        });
      }
      lvList.appendChild(item);
    });
    showSub(levelSel);
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
    showSub(recordsScr);
  }

  btnStart.addEventListener('click', showLevelSel);
  document.getElementById('lvBack').addEventListener('click', () => hideSub(levelSel));
  document.getElementById('btnRecords').addEventListener('click', showRecords);
  document.getElementById('rcBack').addEventListener('click', () => hideSub(recordsScr));
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
    // 数字键 = 技能快捷键（1 对应第一格，往后类推）
    const sk = skillForKey(e.key);
    if (sk && gameState === 'playing') pressSkill(sk);
    // B = 背包（第 13 块）：作战中随时开/关
    if (e.key === 'b' || e.key === 'B') {
      if (gameState === 'playing') setBag(!bagOpen);
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

    if (reply.say) talkLine('me', '你', reply.say);
    mergeEffects(talk.acc, resolveRoll(reply.effects));
    if (reply.chain) talk.chains.push(reply.chain);

    if (reply.go != null) {           // 还有下一拍：把「反应」并到下一句里
      if (reply.close) talk.pendingClose = reply.close;
      talk.beat = reply.go;
      renderTalkBeat();
      return;
    }
    if (reply.close) talkLine('npc', talk.ev.who || '', reply.close);
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
    applyEffects(choice.effects, nextRound);
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
    const lines = effectLines(choice.effects || {});
    if (cost.gold) lines.unshift(`金币 -${cost.gold}（已付）`);
    if (cost.hp) lines.unshift(`生命 -${cost.hp.toFixed(1)}（已付）`);
    fillLines(evResultLines, lines.length ? lines : ['这一夜，什么也没发生']);
    evResult.classList.add('on');
  }

  evNext.addEventListener('click', closeEvent);

  function closeEvent() {
    if (!eventOpen) return;
    eventOpen = false;
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

  function openShop(roundNo, after) {
    shopAfterCb = after || null;
    shopOpen = true;
    shopRound = roundNo;
    // 抽签前先按「现在买有没有用」过滤：没环剑时的剑类、没到解锁回合的法器、
    // 放满时的炮台都不占格子（药水进背包，满血也能囤 —— 第 13 块）
    shopStock = rollShopItems(Math.random, {
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
      const afford = coins >= price;
      const btn = document.createElement('button');
      btn.className = 'sh-item';
      btn.type = 'button';
      btn.disabled = !!locked || !afford;
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
      desc.textContent = locked || item.desc;

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
    const price = priceOf(item);      // 民心影响售价
    if (coins < price) return;
    const locked = itemLocked(item, {
      hasWeapon: weapon.granted,
      round: shopRound,
      turretCount: turrets.count(),
      relicLevels: relics.levels(),
    });
    if (locked) return;
    coins -= price;
    renderGold();

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
      weapon.addSword(item.kind);
      showToast(`${SWORD_KINDS[item.kind].name} 入列`, `环上现在有 ${weapon.count} 把剑在转`);
      renderSkill();
    } else if (item.type === 'turret') {
      const t = turrets.spawn(pos);
      showToast(item.name, t ? `已立起（场上 ${turrets.count()}/${TURRET.MAX_COUNT} 台）· 本局一直在` : '放不下了');
    } else if (item.type === 'relic') {
      const lv = relics.buy(item.relic);
      const def = RELIC_DEFS[item.relic];
      showToast(`${def.name} ${lv} 级`, def.desc[lv - 1] + (lv < def.maxLevel ? ' · 再买可升级' : ' · 已满级'));
    }
    renderHud();
    renderShop();   // 刷新金币与按钮可用态（面板保持打开，可以连买）
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
        },
        seenEvents
      );
      if (!ev) { runUpgrade(); return; }
      seenEvents.push(ev.id);
      if (seenEvents.length > 8) seenEvents.shift();
      openEvent(ev, roundNo, runUpgrade);
    };

    // 武器卡排在最前：拿到环剑之后抽到的事件才可能出现「夜风顺了」
    if (roundNo >= LEVEL_1.weaponAt && !weapon.granted) {
      weapon.grant();
      renderSkill();
      showWeaponCard(runEvent);
      return;
    }
    runEvent();
  }


  // ---------------- 第一关 ----------------
  const level = createLevel1({
    enemies, fx,
    getPlayerPos: () => pos,
    onRound: (cur, total, tip) => {
      setRoundLabel(cur, total);
      // 回合开始只报一句提示：事件已经改到上一回合结束时弹
      onRoundStart(cur, tip);
    },
    onRoundClear: handleRoundClear,
    onVictory: () => endGame(true),
  });

  // ---------------- 结算 ----------------
  function endGame(isWin) {
    if (gameState === 'over') return;
    gameState = 'over';
    won = isWin;
    deadT = 0;
    input.joystick.release();
    vel.set(0, 0, 0);
    setBag(false);                  // 背包开着就收掉
    playerRing.setVisible(false);   // 倒下/通关后不再提示攻击范围
    weapon.setVisible(false);       // 环剑也一并收起
    gold.setVisible(false);         // 地上的金币也收掉
    renderSkill();

    audio.stopBgm({ fade: 1.0 });
    audio.sfx(isWin ? 'victory' : 'defeat', { vol: 1 });
    rsTag.textContent = LEVEL_1.name;
    rsTitle.textContent = isWin ? '通 关' : '倒 下';
    rsTitle.classList.toggle('fail', !isWin);
    rsSub.textContent = isWin
      ? '夜色里的骷髅被清干净了，草地重新安静下来'
      : '奶蛙被骷髅拖进了草丛……下一局记得边打边退';
    rsGrid.textContent = '';

    const roundShown = Math.min(level.totals.rounds, Math.max(1, level.roundNo));
    // 落一笔记录（第 14 块）：通关数 / 最快通关 / 最高击杀 / 最远回合，主页面「我的记录」看
    saveRunRecord(1, { win: isWin, time: elapsed, kills, roundShown });
    const cells = [
      ['用时', elapsed.toFixed(1) + ' 秒'],
      ['击杀', kills + ' 只'],
      ['回合', `${roundShown} / ${level.totals.rounds}`],
      ['升级', `${upgradesTaken} 次`],
      ['剩余生命', `${fmtHp(stats.hp.cur)} / ${stats.get('maxHp').toFixed(1)}`],
      ['攻击力', stats.get('attack').toFixed(1)],
      ['金币', String(coins)],
    ];
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
  }

  document.getElementById('rsBtn').addEventListener('click', () => location.reload());

  // 调试钩子：只有 ?debug=1 才挂到 window，方便自动化测试读内部状态（正常游玩不暴露）
  if (new URLSearchParams(location.search).has('debug')) {
    window.__game = {
      stats, wstats, pos, vel, input, enemies, level, fx, playerRing, frog, camera, weapon, scene,
      renderer,
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
        roll: (luck) => rollChoices(undefined, { luck: luck ?? stats.get('luck'), hasWeapon: weapon.granted }),
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
        roll: (rng, luck) => rollShopItems(rng, {
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
      },
      aegis: {
        get level() { return stats.get('aegis'); },
        get active() { return aegisActive; },
        get cycle() { return aegisCycle; },
        get period() { return aegisPeriod(); },
        reset: () => aegisReset(),
        add: () => { stats.addMod({ stat: 'aegis', flat: 1, src: 'dbg:aegis' }); aegisReset(); },
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

  // 传给怪物 AI 的上下文（每帧复用同一个对象，避免反复分配）
  const combatCtx = {
    playerPos: pos,
    playerRadius: BODY_R,
    arenaRadius: ARENA_R,
    hurtPlayer,
  };

  function tick() {
    requestAnimationFrame(tick);

    const dt = Math.min(0.05, clock.getDelta());
    syncAudio();

    let speed = 0;
    let speed01 = 0;
    const prevX = pos.x, prevZ = pos.z;

    // 教程也算「在游戏里」：能移动、能打怪，只是不推进回合波次
    // 背包打开时同样冻结（第 13 块：随时能开，开就是暂停）
    const inGame = (gameState === 'playing' || gameState === 'tutorial') && !panelOpen && !bagOpen;
    if (inGame) {
      elapsed += dt;

      // 1) 输入 → 目标速度（屏幕 y 向下 = 世界 +Z，相机在 +Z 方向看向场景）
      //    移速取属性面板里的实时值：升级加成就立刻跑得更快
      const moveSpeed = stats.get('moveSpeed');
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
      turrets.update(dt, { playerPos: pos });
      relics.update(dt, { playerPos: pos });
      aegisUpdate(dt);
      gold.update(dt);
      renderSkill();
      if (stats.hp.cur < stats.get('maxHp')) stats.heal(stats.get('hpRegen') * dt);
      // 事件造成的持续流失（乞丐吐痰）：绕过回复直接扣，能磨死人也只作用于本回合
      if (roundDrain > 0 && gameState === 'playing') {
        stats.hp.cur = Math.max(0, stats.hp.cur - roundDrain * dt);
        if (stats.hp.cur <= 0) { endGame(false); }
      }
      if (iframe > 0) iframe -= dt;
      if (gameState === 'tutorial') tutorialTick(Math.hypot(pos.x - prevX, pos.z - prevZ));
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
      frog.update(dt, 0);
    }

    frog.root.position.x = pos.x;
    frog.root.position.z = pos.z;
    frog.yaw.rotation.y = yaw + MODEL_YAW;
    if (inGame) frog.update(dt, speed01);

    // 脚下的攻击范围环：位置跟人走，半径跟属性走
    playerRing.setRadius(stats.get('attackRange'));
    playerRing.mesh.position.x = pos.x;
    playerRing.mesh.position.z = pos.z;
    playerRing.update(dt);

    // 6) 相机：位置缓动跟随，注视点略微超前于角色
    const leadX = pos.x + vel.x * 0.22;
    const leadZ = pos.z + vel.z * 0.22;
    const desiredX = pos.x + camOffset.x;
    const desiredY = camOffset.y;
    const desiredZ = pos.z + camOffset.z;
    const ck = 1 - Math.exp(-CAM_LERP * dt);
    camera.position.x += (desiredX - camera.position.x) * ck;
    camera.position.y += (desiredY - camera.position.y) * ck;
    camera.position.z += (desiredZ - camera.position.z) * ck;
    camera.lookAt(leadX, 0.95, leadZ);

    // 受击震屏：只抖相机位置，注视点不变
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
    renderer.render(scene, camera);

    // 7) HUD（每 0.25 秒刷一次，别每帧动 DOM）
    frames++;
    acc += dt;
    hudAcc += dt;
    if (acc >= 0.5) {
      fps = frames / acc;
      frames = 0; acc = 0;
    }
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

  // 加载完成 → 淡出遮罩 → 显示标题页（或调试模式直接开打）
  setProgress(1);
  clock.start();
  tick();
  showTitle();
  setTimeout(() => {
    loadingEl.classList.add('off');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
    // 调试模式默认跳过标题页与教程，自动化测试直接进第 1 回合
    if (AUTO_START) setTimeout(() => beginGame({ tutorial: false }), 300);
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
