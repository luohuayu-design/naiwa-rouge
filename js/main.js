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
import { createFx } from './fx.js';
import { createEnemySystem } from './enemy.js';
import { createLevel1, LEVEL_1 } from './wave.js';
import { createRangeRing } from './rangeRing.js';
import { rollChoices, applyUpgrade, previewUpgrade, upgradeText, UPGRADES } from './upgrade.js';
import { createWeaponSystem } from './weapon.js';
import { SWORD_KINDS, KIND_ORDER } from './swordKinds.js';
import { createGoldSystem } from './gold.js';
import { SHOP_ITEMS, itemLocked } from './shop.js';
import { pickEvent, effectLines, EVENTS } from './events.js';

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
  const stats = createStats();

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
  // 开始界面 / 新手教程 / 武器获得卡
  const titleScr = document.getElementById('titleScr');
  const btnStart = document.getElementById('btnStart');
  const tutAsk = document.getElementById('tutAsk');
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

  // 属性面板：每次打开时重建，数值永远是最新的
  function renderPanel() {
    apSub.textContent = `生命 ${fmtHp(stats.hp.cur)} / ${stats.get('maxHp').toFixed(1)} · 共 ${STAT_DEFS.length} 项 · 已暂停`;
    apList.textContent = '';
    for (const def of STAT_DEFS) {
      const row = document.createElement('div');
      row.className = 'ap-row';
      const name = document.createElement('div');
      name.className = 'ap-name';
      name.textContent = def.name;
      const val = document.createElement('div');
      val.className = 'ap-val';
      val.textContent = def.fmt(stats.get(def.key));
      const desc = document.createElement('div');
      desc.className = 'ap-desc';
      desc.textContent = def.desc;
      row.append(name, val, desc);
      apList.appendChild(row);
    }
  }

  let panelOpen = false;
  let panelOpenedOnce = false;
  function setPanel(open) {
    panelOpen = open;
    if (open) {
      panelOpenedOnce = true;
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
      // 金币掉落：按 goldRate 掷骰（概率属性，财运升级可提升）
      gold.maybeDrop(e.pos);
    },
  });

  let enemyLoadOk = true;
  try {
    // 三种怪都要预载：投手（远程）第 11 回合登场，模型 655KB
    await enemies.preload(['minion', 'warrior', 'archer'], (p) => setProgress(0.55 + p * 0.42));
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
  const weapon = createWeaponSystem({ scene, stats, fx, enemies });
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
    coins = Math.max(0, coins + n);
    renderGold();
  }
  const gold = createGoldSystem({ scene, fx, stats, onGold: addCoins });
  renderGold();

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

  // 受击：先过无敌帧，再按防御减伤扣血；血量归零即结束
  function hurtPlayer(amount) {
    if (gameState !== 'playing' || iframe > 0) return;
    stats.damage(amount);
    iframe = IFRAME;
    shake = 0.55;
    hurtFx.classList.add('on');
    setTimeout(() => hurtFx.classList.remove('on'), 90);
    renderHud();
    if (stats.hp.cur <= 0) endGame(false);
  }

  // 主角近战：找攻击范围内最近的怪打一下（没有目标时不空挥）
  function playerAttack() {
    const found = stats.findTarget(
      pos, enemies.list,
      (e) => e.state !== 'dead' && e.state !== 'spawn'
    );
    if (!found) return false;

    const e = found.target;
    // 出手瞬间转向目标，避免背对着怪拍地
    const ty = Math.atan2(e.pos.x - pos.x, e.pos.z - pos.z);
    yaw += ((ty - yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 0.85;

    const roll = stats.rollDamage({ targetArmor: e.cfg.armor });
    enemies.takeDamage(e, roll.damage, roll.crit);
    // 吸血：按实际造成的伤害回血（属性为 0 时不触发）
    const lifesteal = stats.get('lifesteal');
    if (lifesteal > 0 && roll.damage > 0) {
      stats.heal(roll.damage * lifesteal);
      renderHud();
    }
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
    const picks = rollChoices(undefined, { round: roundNo, hasWeapon: weapon.granted });

    upTitle.textContent = `第 ${roundNo} 回合结束 · 三选一`;
    upSub.textContent = upgradesTaken > 0
      ? `已获得 ${upgradesTaken} 次强化 · 选一个带进下一回合`
      : '选一个带进下一回合';
    upList.textContent = '';

    for (const up of picks) {
      const btn = document.createElement('button');
      btn.className = 'up-item';
      btn.type = 'button';
      btn.dataset.tag = up.tag;
      btn.dataset.id = up.id;

      const glyph = document.createElement('span');
      glyph.className = 'up-glyph';
      glyph.textContent = up.glyph;

      const name = document.createElement('span');
      name.className = 'up-name';
      name.textContent = up.name;

      const effect = document.createElement('b');
      effect.className = 'up-effect';
      effect.textContent = up.title;

      // 精确的「原值 → 选后值」：用 stats.preview 算，和真选下去的数字完全一致
      const delta = document.createElement('div');
      delta.className = 'up-delta';
      for (const c of previewUpgrade(stats, up)) {
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

    upgradeOpen = true;
    gameState = 'upgrade';
    input.joystick.release();
    vel.set(0, 0, 0);
    upPanel.classList.add('on');
    upPanel.setAttribute('aria-hidden', 'false');
  }

  function chooseUpgrade(up) {
    if (!upgradeOpen) return;
    upgradeOpen = false;

    upSerial++;
    upgradesTaken++;
    const res = applyUpgrade(stats, up, upSerial);
    takenUpgrades.push(up);

    upPanel.classList.remove('on');
    upPanel.setAttribute('aria-hidden', 'true');
    renderHud();
    showToast(`获得 · ${up.name}`, upgradeText(res));

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

  // ---------------- 技能栏（右下角 6 格） ----------------
  // 第 1 格「万剑齐发」可点；第 2~6 格展示拥有的元素剑（按获得顺序，只展示不可点）。
  const skillBar = document.getElementById('skillBar');
  const sk0 = document.getElementById('sk0');
  const skCdEl = sk0.querySelector('.sk-cd');
  const skSlots = [1, 2, 3, 4, 5].map((i) => document.getElementById('sk' + i));
  let lastKindsKey = '';   // 剑槽 DOM 重建的缓存键（renderSkill 每帧跑，别每帧动 DOM）

  function renderSkill() {
    skillBar.classList.toggle('on', weapon.granted);
    const ready = weapon.granted && weapon.count > 0 && gameState === 'playing';
    sk0.classList.toggle('ready', ready);
    sk0.classList.toggle('spent', weapon.granted && weapon.count === 0);
    // 底部恢复进度条：下一把剑攒了多少
    skCdEl.style.height = (weapon.regenProgress * 100).toFixed(1) + '%';

    // 元素剑槽：显示每种剑的图标与数量，按获得顺序排位（5 种刚好排满）
    const kinds = weapon.kindCounts();
    const key = kinds.map((k) => k.kind + k.n).join(',');
    if (key === lastKindsKey) return;
    lastKindsKey = key;
    for (let i = 0; i < skSlots.length; i++) {
      const slot = skSlots[i];
      const entry = kinds[i];
      if (!entry) {
        slot.classList.add('off');
        slot.textContent = '';
        continue;
      }
      slot.classList.remove('off');
      slot.textContent = '';
      const img = document.createElement('img');
      img.src = SWORD_KINDS[entry.kind].icon;
      img.alt = SWORD_KINDS[entry.kind].name;
      img.draggable = false;
      const n = document.createElement('span');
      n.className = 'sk-n';
      n.textContent = '×' + entry.n;
      slot.title = SWORD_KINDS[entry.kind].name + ' · ' + SWORD_KINDS[entry.kind].tagline;
      slot.append(img, n);
    }
  }

  function tryFireSwords() {
    if (gameState !== 'playing' || !weapon.granted || weapon.count === 0) return;
    weapon.fire(() => pos);
    renderSkill();
  }

  // 技能键用 pointerdown 而不是 click：
  // 手机上一根手指正在推摇杆时，第二根手指点按钮，iOS Safari 不会派发 click，
  // 表现就是「移动中技能点不动」。pointerdown 每根手指都会立刻触发。
  let lastSkillPress = 0;
  function onSkillPress(e) {
    if (e && e.cancelable) e.preventDefault();
    const now = performance.now();
    if (now - lastSkillPress < 120) return;   // 防止 pointerdown + click 双触发
    lastSkillPress = now;
    tryFireSwords();
  }
  sk0.addEventListener('pointerdown', onSkillPress);
  // 极老的浏览器没有 Pointer Events，退回 click
  if (!window.PointerEvent) sk0.addEventListener('click', onSkillPress);

  // ---------------- 开始界面 / 新手教程 / 武器获得卡 ----------------
  function showTitle() {
    gameState = 'title';
    titleScr.style.display = '';
    requestAnimationFrame(() => titleScr.classList.remove('off'));
    titleScr.setAttribute('aria-hidden', 'false');
  }

  function beginGame({ tutorial = false } = {}) {
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

  btnStart.addEventListener('click', () => {
    tutAsk.classList.add('on');
    tutAsk.setAttribute('aria-hidden', 'false');
  });
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
  // 随机事件（夜行奇遇）：每回合开始前弹卡，效果只持续一回合
  // ============================================================
  const evCard = document.getElementById('eventCard');
  const evIcon = document.getElementById('evIcon');
  const evTitle = document.getElementById('evTitle');
  const evStory = document.getElementById('evStory');
  const evEffect = document.getElementById('evEffect');
  const evChoices = document.getElementById('evChoices');

  let eventOpen = false;
  let roundBuffSrc = null;     // 本回合临时加成的 src（回合结束撤销用）
  let roundDrain = 0;          // 本回合每秒流失的生命（乞丐吐痰等）
  const seenEvents = [];       // 最近出过的事件（3 回合内不重复）
  const pledges = [];          // 伏笔：{ due, icon, title, story, ok, effects }

  // 结算一条 effects：mods 挂回合 buff（可撤销）、金币/生命立刻结算、
  // level 修正写给 wave、pledge 存进伏笔队列、roll 按概率分支
  function applyEffects(effects, roundNo, { permanentMods = false } = {}) {
    if (!effects) return;
    // roll：概率分支（两瓶药水 / 老井），只走一条
    if (effects.roll) {
      let r = Math.random();
      for (const branch of effects.roll) {
        r -= branch.p;
        if (r < 0) { applyEffects(branch.effects, roundNo, { permanentMods }); return; }
      }
      applyEffects(effects.roll[effects.roll.length - 1].effects, roundNo, { permanentMods });
      return;
    }
    // mods：永久加成（伏笔回报）用独立 src，回合清场不会撤销
    if (effects.mods && effects.mods.length) {
      const src = permanentMods ? `pledge:${roundNo}` : `event:${roundNo}`;
      if (!permanentMods) roundBuffSrc = src;
      for (const m of effects.mods) stats.addMod({ ...m, src });
    }
    if (effects.gold) addCoins(effects.gold);
    if (effects.hp > 0) stats.heal(effects.hp);
    if (effects.hp < 0) stats.hp.cur = Math.max(0.5, stats.hp.cur + effects.hp);   // 咬一口但不会一口咬死
    if (effects.drain > 0) roundDrain = effects.drain;
    if (effects.level) level.applyRoundMod(effects.level);
    if (effects.pledge) {
      pledges.push({
        due: roundNo + effects.pledge.delay,
        icon: effects.pledge.icon, title: effects.pledge.title,
        story: effects.pledge.story, ok: effects.pledge.ok,
        effects: effects.pledge.effects,
      });
    }
  }

  // 回合结束清掉本回合的临时效果（下一回合的事件再挂新的）
  function clearRoundBuffs() {
    if (roundBuffSrc) {
      stats.removeBySource(roundBuffSrc);
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

  function renderEventUI(ev, { withChoices = true } = {}) {
    evIcon.textContent = ev.icon || '❔';
    evTitle.textContent = ev.title || '夜行奇遇';
    evStory.textContent = ev.story || '';
    evEffect.textContent = '';
    const lines = effectLines(ev.effects);
    for (const line of lines) {
      const s = document.createElement('span');
      s.className = effectLineClass(line);
      s.textContent = line;
      evEffect.appendChild(s);
    }
    evChoices.textContent = '';
    if (withChoices && ev.choices) {
      for (const c of ev.choices) {
        const btn = document.createElement('button');
        btn.className = 'ev-btn';
        btn.type = 'button';
        const b = document.createElement('b');
        b.textContent = c.label;
        btn.appendChild(b);
        if (c.desc) {
          const i = document.createElement('i');
          i.textContent = c.desc;
          btn.appendChild(i);
        }
        btn.addEventListener('click', () => chooseEventOption(ev, c));
        evChoices.appendChild(btn);
      }
    } else {
      const btn = document.createElement('button');
      btn.className = 'ev-btn';
      btn.type = 'button';
      const b = document.createElement('b');
      b.textContent = ev.ok || '知道了';
      btn.appendChild(b);
      btn.addEventListener('click', closeEvent);
      evChoices.appendChild(btn);
    }
    evCard.classList.add('on');
    evCard.setAttribute('aria-hidden', 'false');
    eventOpen = true;
  }

  // 打开事件卡：世界冻结，等玩家看完 / 选完
  function openEvent(ev, roundNo) {
    gameState = 'event';
    input.joystick.release();
    vel.set(0, 0, 0);
    currentEventRound = roundNo;
    renderEventUI(ev);
  }

  let currentEventRound = 0;
  function chooseEventOption(ev, choice) {
    if (!eventOpen) return;
    applyEffects(choice.effects, currentEventRound);
    eventOpen = false;
    evCard.classList.remove('on');
    evCard.setAttribute('aria-hidden', 'true');
    if (gameState === 'event') gameState = 'playing';
    const lines = effectLines(choice.effects);
    if (lines.length) {
      showToast(ev.title, lines.join(' · '));   // 选项结果比回合提示更重要，覆盖之
      pendingRoundTip = null;
    } else if (pendingRoundTip) {
      showToast(pendingRoundTip.title, pendingRoundTip.sub);
      pendingRoundTip = null;
    }
  }

  function closeEvent() {
    if (!eventOpen) return;
    eventOpen = false;
    evCard.classList.remove('on');
    evCard.setAttribute('aria-hidden', 'true');
    if (gameState === 'event') gameState = 'playing';
    // 无选项事件看完：把被事件卡挡住的回合开始提示补上
    if (pendingRoundTip) {
      showToast(pendingRoundTip.title, pendingRoundTip.sub);
      pendingRoundTip = null;
    }
  }

  let pendingRoundTip = null;   // 事件卡挡住了回合开始的 toast，看完再补

  // 回合开始：清上一回合 buff → 处理到期伏笔 → 抽新事件（调试模式跳过叙事）
  function onRoundStart(roundNo, tip) {
    clearRoundBuffs();
    const due = pledges.findIndex((p) => p.due <= roundNo);
    if (due >= 0) {
      const p = pledges.splice(due, 1)[0];
      pendingRoundTip = { title: `第 ${roundNo} 回合`, sub: tip };
      openEvent(p, roundNo);
      applyEffects(p.effects, roundNo, { permanentMods: true });
      return;
    }
    const ev = DEBUG_SKIP_NARRATIVE ? null : pickEvent(
      { round: roundNo, hasWeapon: weapon.granted, gold: coins },
      seenEvents
    );
    if (!ev) {
      showToast(`第 ${roundNo} 回合`, tip);
      return;
    }
    seenEvents.push(ev.id);
    pendingRoundTip = { title: `第 ${roundNo} 回合`, sub: tip };
    openEvent(ev, roundNo);
    applyEffects(ev.effects, roundNo);
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

  function openShop(roundNo, after) {
    shopAfterCb = after || null;
    shopOpen = true;
    gameState = 'shop';
    input.joystick.release();
    vel.set(0, 0, 0);
    shSub.textContent = `第 ${roundNo} 回合清空 · 打完这一波，来点补给？`;
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
    const next = shopAfterCb;
    shopAfterCb = null;
    if (next) next();
  }
  document.getElementById('shClose').addEventListener('click', closeShop);
  shopEl.addEventListener('click', (e) => { if (e.target === shopEl) closeShop(); });

  function renderShop() {
    shGold.textContent = String(coins);
    shList.textContent = '';
    for (const item of SHOP_ITEMS) {
      const locked = itemLocked(item, {
        hasWeapon: weapon.granted,
        hpFull: stats.hp.cur >= stats.get('maxHp') - 1e-9,
      });
      const afford = coins >= item.price;
      const btn = document.createElement('button');
      btn.className = 'sh-item';
      btn.type = 'button';
      btn.disabled = !!locked || !afford;

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

      const desc = document.createElement('div');
      desc.className = 'sh-desc';
      desc.textContent = locked || item.desc;

      const buy = document.createElement('span');
      buy.className = 'sh-buy';
      const coin = document.createElement('span');
      coin.className = 'gc-coin';
      buy.appendChild(coin);
      const price = document.createElement('b');
      price.textContent = String(item.price);
      buy.appendChild(price);

      btn.append(icon, name, desc, buy);
      btn.addEventListener('click', () => buyItem(item));
      shList.appendChild(btn);
    }
  }

  function buyItem(item) {
    if (coins < item.price) return;
    const locked = itemLocked(item, {
      hasWeapon: weapon.granted,
      hpFull: stats.hp.cur >= stats.get('maxHp') - 1e-9,
    });
    if (locked) return;
    coins -= item.price;
    renderGold();

    if (item.type === 'heal') stats.heal(item.amount);
    else if (item.type === 'healFull') stats.heal(1e9);
    else if (item.type === 'stat') {
      shopSerial++;
      stats.addMod({
        stat: item.stat, flat: item.flat || 0, pct: item.pct || 0,
        src: `shop:${item.id}:${shopSerial}`,
      });
      if (item.stat === 'maxHp') stats.syncHp(item.heal || 0);
      showToast(item.name, '永久生效 · ' + item.desc);
    } else if (item.type === 'sword') {
      const r = weapon.addSword(item.kind);
      showToast(`${SWORD_KINDS[item.kind].name} 入列`,
        r.onRing ? '已经转到环上了' : '环上满员，下一把剑消耗后补位');
      renderSkill();
    }
    renderHud();
    renderShop();   // 刷新金币与按钮可用态（面板保持打开，可以连买）
  }

  // 回合清空后的编排：
  //   第 5 回合（weaponAt）打完 → 武器卡 → 三选一（若有）→ 商店（若有）
  //   其余回合   → 三选一（若有）→ 商店（若有）→ 2.6 秒后下一回合
  function handleRoundClear(roundNo) {
    if (roundNo >= LEVEL_1.weaponAt && !weapon.granted) {
      weapon.grant();
      renderSkill();
      showWeaponCard(() => afterWeaponCard(roundNo));
      return;
    }
    afterWeaponCard(roundNo);
  }

  function afterWeaponCard(roundNo) {
    // 调试模式（?debug=1）不自动弹商店：自动化测试需要确定性的回合推进。
    // openShop 仍可手动调用（测试用它验证购买流程）。
    const runShop = () => { if (level.shouldShop(roundNo) && !DEBUG_SKIP_NARRATIVE) openShop(roundNo, null); };
    if (level.shouldUpgrade(roundNo)) showUpgrade(roundNo, runShop);
    else runShop();
  }


  // ---------------- 第一关 ----------------
  // 回合清空后的编排（也挂到 __game 上，方便自动化测试直接跳到第 5 回合验证武器卡）
  function handleRoundClear(roundNo) {
    // 第 5 回合打完送武器「环剑」：先弹获得卡，关掉卡再进三选一
    // （先授予再进三选一，武器系升级才进得去池子）
    if (roundNo >= LEVEL_1.weaponAt && !weapon.granted) {
      weapon.grant();
      renderSkill();
      showWeaponCard(() => {
        if (level.shouldUpgrade(roundNo)) showUpgrade(roundNo);
      });
      return;
    }
    // 第 1/2/3/5/8/10 回合打完弹三选一；其余回合直接走 2.6 秒间隔进下一回合
    if (level.shouldUpgrade(roundNo)) showUpgrade(roundNo);
  }

  const level = createLevel1({
    enemies, fx,
    getPlayerPos: () => pos,
    onRound: (cur, total, tip) => {
      setRoundLabel(cur, total);
      // 回合开始：先清上一回合的事件效果，再抽新事件（可能弹卡挡住 toast）
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
    playerRing.setVisible(false);   // 倒下/通关后不再提示攻击范围
    weapon.setVisible(false);       // 环剑也一并收起
    gold.setVisible(false);         // 地上的金币也收掉
    renderSkill();

    rsTag.textContent = LEVEL_1.name;
    rsTitle.textContent = isWin ? '通 关' : '倒 下';
    rsTitle.classList.toggle('fail', !isWin);
    rsSub.textContent = isWin
      ? '夜色里的骷髅被清干净了，草地重新安静下来'
      : '奶蛙被骷髅拖进了草丛……下一局记得边打边退';
    rsGrid.textContent = '';

    const roundShown = Math.min(level.totals.rounds, Math.max(1, level.roundNo));
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
      stats, pos, vel, input, enemies, level, fx, playerRing, frog, camera, weapon, scene,
      fireSwords: tryFireSwords,
      renderSkill,
      getYaw: () => yaw,
      getState: () => gameState,
      getKills: () => kills,
      getElapsed: () => elapsed,
      getShots: () => enemies.shotCount(),
      setPanel: (open) => setPanel(open),
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
        roll: () => rollChoices(),
        list: UPGRADES,
        get taken() { return takenUpgrades.map((u) => u.id); },
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
        render: () => renderShop(),
      },
      event: {
        // 传事件 id 手动触发（绕过抽取，便于确定性测试）
        trigger: (id) => {
          const ev = EVENTS.find((e) => e.id === id);
          if (!ev) return null;
          seenEvents.push(id);
          pendingRoundTip = null;
          openEvent(ev, level.roundNo);
          applyEffects(ev.effects, level.roundNo);
          return ev;
        },
        choose: (idx) => {
          const btns = evChoices.querySelectorAll('.ev-btn');
          if (btns[idx]) btns[idx].click();
        },
        close: () => closeEvent(),
        isOpen: () => eventOpen,
        list: EVENTS,
        get pendingPledges() { return pledges.map((p) => p.due); },
      },
      // 元素剑：直接加一把（绕过商店扣费，测试用）
      addSword: (kind) => weapon.addSword(kind),
      get swordKinds() { return weapon.kindCounts(); },
      swordKindsAll: SWORD_KINDS,
      get roundDrain() { return roundDrain; },
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

    let speed = 0;
    let speed01 = 0;
    const prevX = pos.x, prevZ = pos.z;

    // 教程也算「在游戏里」：能移动、能打怪，只是不推进回合波次
    const inGame = (gameState === 'playing' || gameState === 'tutorial') && !panelOpen;
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

      // 5) 怪物 AI → 波次推进 → 环剑 → 金币 → 生命回复 / 无敌帧
      if (!debugNoEnemies) enemies.update(dt, combatCtx);
      if (!debugNoWaves && gameState === 'playing') level.update(dt);
      weapon.update(dt, { playerPos: pos });
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
