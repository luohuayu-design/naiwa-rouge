// ============================================================
// joystick.js —— 浮动摇杆
//
// 行为：手指按在【左半屏】任意位置 → 摇杆底盘就在落点出现；
//       拖动 → 摇杆头跟手（限制在半径内）；松手 → 立刻归零并淡出。
// 输出：out.x / out.y 已归一化到 [-1,1]，屏幕坐标（y 向下为正）。
// 只认第一根手指，第二根手指按下不会抢走摇杆（后续右侧技能键要用）。
// ============================================================

export function createJoystick({ layer, el, maxRadius = 46, leftRatio = 0.58, deadZone = 0.12 }) {
  const knob = el.querySelector('.stick-knob');
  const out = { x: 0, y: 0, active: false, strength: 0 };

  let pid = null;      // 当前持有的 pointerId
  let ox = 0, oy = 0;  // 摇杆原点（屏幕坐标）

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  }

  function release() {
    if (pid !== null) {
      try { layer.releasePointerCapture(pid); } catch (_) { /* 已释放 */ }
    }
    pid = null;
    out.active = false;
    out.x = 0; out.y = 0; out.strength = 0;
    el.classList.remove('on');
    setKnob(0, 0);
  }

  function onDown(e) {
    if (pid !== null) return;                       // 已经有一根手指在控制
    if (e.clientX > innerWidth * leftRatio) return; // 右侧留给后续技能键
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pid = e.pointerId;
    try { layer.setPointerCapture(pid); } catch (_) { /* 某些环境不支持，忽略 */ }

    ox = e.clientX;
    oy = e.clientY;
    el.style.left = ox + 'px';
    el.style.top = oy + 'px';
    el.classList.add('on');
    setKnob(0, 0);

    out.active = true;
    out.x = 0; out.y = 0; out.strength = 0;
    e.preventDefault();
  }

  function onMove(e) {
    if (e.pointerId !== pid) return;

    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);

    // 摇杆头视觉上限制在底盘半径内
    const vis = len > maxRadius ? maxRadius / len : 1;
    setKnob(dx * vis, dy * vis);

    // 输出：归一化 + 死区重映射（推一点点不会让角色抖）
    let nx = dx / maxRadius;
    let ny = dy / maxRadius;
    let n = Math.hypot(nx, ny);
    if (n > 1) { nx /= n; ny /= n; n = 1; }

    if (n < deadZone) {
      out.x = 0; out.y = 0; out.strength = 0;
    } else {
      const k = (n - deadZone) / (1 - deadZone) / n;
      out.x = nx * k;
      out.y = ny * k;
      out.strength = Math.min(1, n);
    }
    e.preventDefault();
  }

  function onUp(e) {
    if (e.pointerId !== pid) return;
    release();
    e.preventDefault();
  }

  layer.addEventListener('pointerdown', onDown, { passive: false });
  layer.addEventListener('pointermove', onMove, { passive: false });
  layer.addEventListener('pointerup', onUp, { passive: false });
  layer.addEventListener('pointercancel', onUp, { passive: false });
  layer.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === pid) release();
  });

  // 页面切到后台时清状态，回来不会「自己一直往前走」
  const onBlur = () => release();
  addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  out.release = release;
  return out;
}
