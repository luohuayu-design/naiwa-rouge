"""第 83 块：main.js 接线（掉牌 / 召唤看守 / 取牌面板 / 第八关教程）"""
import io

P = 'js/main.js'
s = io.open(P, 'r', encoding='utf-8', newline='').read()


def rep(old, new, n=1):
    global s
    assert old in s, 'anchor missing:\n' + old[:120]
    s = s.replace(old, new, n)


# ---------------- 1. 死亡钩子：任何怪都掉牌 ----------------
rep("""      // 第 81 块：无名者 / 旗手倒下 → 木牌进寄存柜。
      // 这是第八关的核心循环：杀得越多，柜子越快满；满了柜子会把人放回场上。
      if (e.type === 'ranker' || e.type === 'bearer') deposit.addTag(1);""",
    """      // 第 83 块（用户定案）：**任何**一只怪倒下，木牌都会进寄存柜。
      // 旧版只有两种队形怪掉牌，现在队形系统整个删了，柜子改成按「击杀数」记账：
      // 杀得越快，柜子越快满；满了封柜 5 秒，然后寄存处看守自己走出来。
      // 每局开始时 deposit 还没 build（没有 def），addTag 会自己 return —— 安全。
      deposit.addTag(1);""")

# ---------------- 2. 寄存柜创建处：补注释 ----------------
rep("""  // ---------------- 寄存柜（第 81 块，第八关） ----------------
  // 只伤玩家 / 收木牌 / 放队伍，和 hazards 是两套东西（它不是「危险区」，是「对象」）。
  // 放队伍的回调要能 spawn，所以函数体在运行时才取 enemies —— 那时已经建好了。
  const deposit = createDeposit({
    scene, fx, playerPos: pos, playerRadius: BODY_R, hurtPlayer,
  });""",
    """  // ---------------- 寄存柜（第 81 块立，第 83 块重做，第八关） ----------------
  // 它只做三件事：收牌子（任何怪死都 +1）、封柜倒数、到点把看守放出来。
  // 「取牌」不再是站桩，而是柜子旁边的按钮 + 四位数字（见下面的 depositUiTick）。
  // 召唤回调要能 spawn，所以函数体在运行时才取 enemies —— 那时已经建好了。
  const deposit = createDeposit({
    scene, fx, playerPos: pos, playerRadius: BODY_R, hurtPlayer,
  });""")

# ---------------- 3. 取牌面板（插在寄存柜创建之后） ----------------
UI = """
  // ============================================================
  // 第八关「寄存柜 · 取牌」：四位数字小游戏（第 83 块）
  // ============================================================
  // 用户定案：**世界不冻结**（边打边输）。所以这里没有 gameState='code' 这种状态，
  // 面板只是一个贴右下角的浮层；玩家松开摇杆去按键时，怪照样在走。
  // 时间压力：12 秒。超时 / 输错 → 关闭 + 3 秒冷却，牌子一块不少地留在柜里。
  // 输对 → 柜里**所有**牌子一起取走（计数归零），下次从 0 开始攒。
  //
  // ⚠️ 三个关键点（都是老坑）：
  //   ① 面板只在自己的矩形里吃点击，绝不盖全屏（盖全屏 = 摇杆和技能键全哑）；
  //   ② 关闭一律走 closeCode()，别在别处直接 classList.remove —— 计数 / 冷却会漏；
  //   ③ gameState 一离开 playing（回合结算 / 三选一 / 提示卡）就主动关掉，
  //      否则面板会浮在结算卡上面（第 67 / 70 块的层级事故都是这么来的）。
  const depositBtn = document.getElementById('depositBtn');
  const codePanel = document.getElementById('codePanel');
  const cpWant = document.getElementById('cpWant');
  const cpSlots = [...document.querySelectorAll('#cpSlots i')];
  const cpFill = document.getElementById('cpFill');
  const cpKeys = document.getElementById('cpKeys');
  const cpFoot = document.getElementById('cpFoot');
  const cpClose = document.getElementById('cpClose');
  const CP_TIME = 12;      // 一次输入给多少秒
  const CP_RETRY = 3;      // 失败后多久能再按
  let codeOpen = false;
  let codeTarget = '';
  let codeTyped = '';
  let codeLeft = 0;
  let codeCd = 0;
  let codeJudgeT = 0;      // 输满四位后的小延迟：让人看清第四位再判
  let codeShutTimer = null;
  let lastDepositLocked = false;

  function newCode() {
    // 四位、首位非 0 更好记（1000~9999）
    return String(1000 + Math.floor(Math.random() * 9000));
  }

  function renderCodeSlots() {
    for (let i = 0; i < cpSlots.length; i++) {
      const ch = codeTyped[i] || '';
      cpSlots[i].textContent = ch;
      cpSlots[i].classList.toggle('on', !!ch);
    }
  }

  function openCode() {
    if (codeOpen) return false;
    if (gameState !== 'playing') return false;
    if (codeCd > 0 || deposit.locked()) return false;
    if (!deposit.near() || deposit.count() <= 0) return false;
    codeOpen = true;
    codeTarget = newCode();
    codeTyped = '';
    codeLeft = CP_TIME;
    codeJudgeT = 0;
    cpWant.textContent = codeTarget;
    cpFoot.textContent = '输错或超时，牌子还留在柜里';
    cpFill.style.transform = 'scaleX(1)';
    codePanel.classList.remove('bad', 'good');
    codePanel.classList.add('on');
    codePanel.setAttribute('aria-hidden', 'false');
    renderCodeSlots();
    audio.sfx('uiSwitch');
    return true;
  }

  function closeCode(why) {
    if (!codeOpen) return;
    codeOpen = false;
    codePanel.classList.remove('on', 'bad', 'good');
    codePanel.setAttribute('aria-hidden', 'true');
    if (codeShutTimer) { clearTimeout(codeShutTimer); codeShutTimer = null; }
    if (why === 'esc') codeCd = Math.max(codeCd, 0.6);   // 主动关掉也要愣一下，别连点乱猜
  }

  function finishCode(ok, msg) {
    codePanel.classList.add(ok ? 'good' : 'bad');
    cpFoot.textContent = msg;
    codeCd = ok ? 0 : CP_RETRY;
    if (codeShutTimer) clearTimeout(codeShutTimer);
    codeShutTimer = setTimeout(() => {
      codeShutTimer = null;
      closeCode(ok ? 'ok' : 'bad');
    }, ok ? 620 : 760);
  }

  function judgeCode() {
    if (!codeOpen) return;
    if (codeTyped.length < 4) return;
    if (codeTyped === codeTarget) {
      const n = deposit.takeAll();
      audio.sfx('upgrade');
      showToast('牌子取走了', `柜里 ${n} 块全拿出来 —— 从头攒`);
      finishCode(true, `对了 · ${n} 块全收走`);
      return;
    }
    audio.sfx('die');
    finishCode(false, '不对 · 白跑一趟，牌子还在柜里');
  }

  function typeCode(k) {
    if (!codeOpen) return;
    if (codeJudgeT > 0) return;                 // 判定中不许再按
    if (k === 'del') {
      codeTyped = codeTyped.slice(0, -1);
      renderCodeSlots();
      return;
    }
    if (k === 'ok') { judgeCode(); return; }
    if (!/^[0-9]$/.test(k)) return;
    if (codeTyped.length >= 4) return;
    codeTyped += k;
    renderCodeSlots();
    if (codeTyped.length === 4) codeJudgeT = 0.22;   // 满四位 → 停一下再判（自动判定）
  }

  cpKeys.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-k]');
    if (!b) return;
    typeCode(b.dataset.k);
  });
  cpClose.addEventListener('click', () => closeCode('esc'));
  depositBtn.addEventListener('click', () => {
    if (deposit.locked()) return;
    if (codeCd > 0) return;
    openCode();
  });

  // 每帧：按钮显隐 / 封柜倒数 / 面板计时（只在 playing 里跑）
  function depositUiTick(dt) {
    // 面板：离开 playing（结算 / 三选一 / 提示卡 / 死亡）立刻收掉
    if (codeOpen) {
      if (gameState !== 'playing') {
        closeCode('esc');
      } else {
        if (codeJudgeT > 0) {
          codeJudgeT -= dt;
          if (codeJudgeT <= 0) { codeJudgeT = 0; judgeCode(); }
        } else {
          codeLeft -= dt;
          cpFill.style.transform = `scaleX(${Math.max(0, codeLeft / CP_TIME)})`;
          if (codeLeft <= 0 && codeTyped.length < 4) {
            audio.sfx('die');
            finishCode(false, '慢了一步 · 牌子还在柜里');
          }
        }
      }
    } else if (codeCd > 0) {
      codeCd = Math.max(0, codeCd - dt);
    }

    const st = deposit.state();
    if (st.locked && !lastDepositLocked) {
      showToast('寄存柜满了', '5 秒后开门 —— 现在清不掉了');
      audio.sfx('event');
    }
    lastDepositLocked = st.locked;

    // 按钮：封柜时变成倒数（不可点），平时贴到柜边才出现
    const showLock = st.locked;
    const showTake = !showLock && st.near && st.count > 0 && !codeOpen && gameState === 'playing';
    if (showLock) {
      depositBtn.textContent = `封柜 ${st.lock.toFixed(1)}`;
      depositBtn.classList.add('on', 'lock');
      depositBtn.disabled = true;
    } else {
      depositBtn.classList.remove('lock');
      depositBtn.disabled = codeCd > 0;
      depositBtn.textContent = codeCd > 0
        ? `稍等 ${codeCd.toFixed(1)}`
        : (st.count > 0 ? `取牌 · ${st.count}/${st.cap}` : '取牌');
      depositBtn.classList.toggle('on', showTake || (codeCd > 0 && st.near && st.count > 0));
    }
  }
"""

rep("""  const deposit = createDeposit({
    scene, fx, playerPos: pos, playerRadius: BODY_R, hurtPlayer,
  });
""",
    """  const deposit = createDeposit({
    scene, fx, playerPos: pos, playerRadius: BODY_R, hurtPlayer,
  });
""" + UI)

# ---------------- 4. 每帧 deposit.update：换成召唤看守 ----------------
OLD = """      // 第 81 块：寄存柜（收木牌 / 站桩取牌 / 满了放人 / 溢出放电）
      deposit.update(dt, {
        squadAlive: () => enemies.squadAlive(),
        onRelease: (n) => {
          const hub = deposit.pos();
          if (!hub) return;
          // 从柜子门口朝场地中心的方向站出来：旗手先，其余人跟在他身后两侧。
          // newSquad: true —— 这一批必须自己成一队（见 enemy.js 的 joinSquad）。
          const d = Math.hypot(hub.x, hub.z) || 1;
          const fx_ = -hub.x / d, fz_ = -hub.z / d;      // 柜子 → 场地中心
          const nx = -fz_, nz = fx_;                     // 法线（队伍排开的方向）
          // 这 6 只共用同一个 ref：第一只建队，后面几只跟着进（见 enemy.js 的 joinSquad）
          const ref = {};
          for (let i = 0; i < n; i++) {
            const isLeader = i === 0;
            const lat = isLeader ? 0 : ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) * 1.0;
            const at = {
              x: hub.x + fx_ * (2.4 + (isLeader ? 0 : 0.3)) + nx * lat,
              z: hub.z + fz_ * (2.4 + (isLeader ? 0 : 0.3)) + nz * lat,
            };
            const lim = ARENA_R - 1.2;
            const rr = Math.hypot(at.x, at.z);
            if (rr > lim) { at.x = (at.x / rr) * lim; at.z = (at.z / rr) * lim; }
            enemies.spawn(isLeader ? 'bearer' : 'ranker', at, { newSquad: isLeader, squadRef: ref });
          }
          audio.sfx('upgrade');
        },
      });"""
NEW = """      // 第 83 块：寄存柜（收木牌 / 封柜倒数 / 5 秒后把「寄存处看守」放出来）
      deposit.update(dt, {
        onSummon: () => {
          const hub = deposit.pos();
          if (!hub) return;
          // 从柜门朝场地中心走两步再落地：既不和柜子穿模，也不在场地外
          const d = Math.hypot(hub.x, hub.z) || 1;
          let x = hub.x - (hub.x / d) * 2.6;
          let z = hub.z - (hub.z / d) * 2.6;
          const lim = ARENA_R - 1.4;
          const rr = Math.hypot(x, z);
          if (rr > lim) { x = (x / rr) * lim; z = (z / rr) * lim; }
          enemies.spawn('warden', { x, z }, {});
          showToast('寄存柜开了', '寄存处看守从柜子里走出来 —— 它收牌子，也收命');
          audio.sfx('upgrade');
        },
      });
      // 取牌按钮 / 四位数字面板（只有 playing 里才动）
      if (gameState === 'playing') depositUiTick(dt);"""
rep(OLD, NEW)

# ---------------- 5. 调试钩子 ----------------
rep("""        deposit: {
          state: () => deposit.state(),
          pos: () => deposit.pos(),
          count: () => deposit.count(),
          add: (n) => deposit.addTag(n == null ? 1 : n),
          clear: () => { deposit.clearTags(); return true; },
        },""",
    """        deposit: {
          state: () => deposit.state(),
          pos: () => deposit.pos(),
          count: () => deposit.count(),
          add: (n) => deposit.addTag(n == null ? 1 : n),
          clear: () => { deposit.clearTags(); return true; },
          // 第 83 块：取牌小游戏的全套口子（CDP 里要能「不按屏幕就输对」）
          open: () => openCode(),
          code: () => codeTarget,
          typed: () => codeTyped,
          left: () => +Math.max(0, codeLeft).toFixed(2),
          open_: () => codeOpen,
          cd: () => +codeCd.toFixed(2),
          hit: (k) => { typeCode(String(k)); return codeTyped; },
          // 直接把正确数字敲进去（顺手：输满四位会自动判定）
          solve: () => {
            if (!codeOpen) openCode();
            if (!codeOpen) return false;
            codeTyped = codeTarget;
            codeJudgeT = 0.02;
            return true;
          },
          // 敲一个错的（测「输错不清柜」）
          wrong: () => {
            if (!codeOpen) openCode();
            if (!codeOpen) return false;
            codeTyped = codeTarget === '1111' ? '2222' : '1111';
            codeJudgeT = 0.02;
            return true;
          },
        },""")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('main.js patched step 1')
