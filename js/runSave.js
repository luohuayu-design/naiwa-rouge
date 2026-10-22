// ============================================================
// runSave.js —— 读取存档（原「续玩存档」第 17 块，第 38 块升级为多存档）
//
// 现在存的是「进行中的一局」的快照列表，键 naiwa_rouge_runs_v1（一个数组）：
//   - 每回合开始时写一次（onRound 回调），结算时按 uid 摘掉。
//   - 中途关掉网页，会由 pagehide 再补一次最新快照（退出时间更准）。
//   - 每局有唯一 uid 区分：普通局 uid 随机、每日挑战 uid 也随机，
//     所以「打到第 18 关退出」和「重开第 5 关」是两张不同的卡，互不覆盖。
//
// 存的是「回合刚开始」的局面：mods 是普通对象数组（JSON 可存），
// 读档时逐条重放。恢复动作本身在各模块的 restore() 里，这里只管存取。
// ============================================================

const KEY = 'naiwa_rouge_runs_v1';

// 写一条存档：按 uid upsert（同 uid 只更新不新增）。at 缺省填当前时间。
export function saveRun(payload) {
  const all = loadRuns();
  const uid = payload && payload.uid;
  const rec = { ...payload, v: 1, at: (payload && payload.at) ? payload.at : Date.now() };
  const i = all.findIndex((r) => r.uid === uid);
  if (i >= 0) all[i] = rec;
  else all.push(rec);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* 隐私模式写不进就算了 */ }
  return rec;
}

// 全部存档（已按合法结构过滤），调用方自己排序。
export function loadRuns() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((r) => r && r.v === 1 && typeof r.round === 'number' && r.uid != null);
  } catch (_) { return []; }
}

// 按 uid 取某一条（读档用）；没有返回 null。
export function loadRunByUid(uid) {
  return loadRuns().find((r) => r.uid === uid) || null;
}

// 删一条（通关选完永夜火种后调）；不传 uid 则整份清空（调试用）。
export function clearRun(uid) {
  const all = uid == null ? [] : loadRuns().filter((r) => r.uid !== uid);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* 忽略 */ }
}

export function hasRun() {
  return loadRuns().length > 0;
}
