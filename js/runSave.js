// ============================================================
// runSave.js —— 存档续玩（第 17 块）
//
// 「进行中的一局」的快照，键 naiwa_rouge_run_v1：
//   每回合开始时写一次（onRound 回调），结算时删掉。
//   中途关掉网页，主菜单会出现「继续上次 · 第 N 回合」。
//
// 存的是「回合刚开始」的局面：mods 是普通对象数组（JSON 可存），
// 读档时逐条重放。恢复动作本身在各模块的 restore() 里，这里只管存取。
// ============================================================

const KEY = 'naiwa_rouge_run_v1';

export function saveRun(payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...payload, v: 1, at: Date.now() }));
  } catch (_) { /* 隐私模式写不进就算了 */ }
  return payload;
}

export function loadRun() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || raw.v !== 1 || typeof raw.round !== 'number') return null;
    return raw;
  } catch (_) { return null; }
}

export function clearRun() {
  try { localStorage.removeItem(KEY); } catch (_) { /* 忽略 */ }
}

export function hasRun() {
  return !!loadRun();
}
