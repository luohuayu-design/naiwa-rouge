// ============================================================
// input.js —— 把「浮动摇杆」和「键盘」合成一个方向向量
//
// 输出约定与摇杆一致：x 向右为正，y 向下为正（屏幕坐标）。
// 摇杆一旦被按住就优先于键盘，避免手指和键盘打架。
// ============================================================
import { createJoystick } from './joystick.js?v=128';

const KEY_VEC = {
  w: [0, -1], arrowup: [0, -1],
  s: [0, 1], arrowdown: [0, 1],
  a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};

export function createInput(layer, stickEl) {
  const joy = createJoystick({ layer, el: stickEl });
  const held = new Set();

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!KEY_VEC[k]) return;
    held.add(k);
    e.preventDefault();
  }
  function onKeyUp(e) {
    held.delete(e.key.toLowerCase());
  }
  function onBlur() {
    held.clear();
  }

  addEventListener('keydown', onKeyDown, { passive: false });
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  function read() {
    if (joy.active && (joy.x !== 0 || joy.y !== 0)) {
      return { x: joy.x, y: joy.y };
    }
    let x = 0, y = 0;
    held.forEach((k) => {
      const v = KEY_VEC[k];
      x += v[0]; y += v[1];
    });
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  return { read, joystick: joy };
}
