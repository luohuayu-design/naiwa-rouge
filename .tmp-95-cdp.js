// 第 95 块 · 并联体 CDP：16 格实时间距 + hp 8
//   ① 第六关真开局，四只并联体**叠在一个点**生成 → 分离力把它们推开到 16 格附近
//   ② 4 只两两 6 组距离全都 ≥ 15（留一点收敛余量）
//   ③ 都在场地里（半径 19 − 夹边 0.6）
//   ④ 血量按 8 点起算（不再是一刀砍不动的 12）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-95-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9396;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-95');
const SHOT = path.join(os.tmpdir(), 'naiwa-95-arc.png');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--window-size=430,932', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') {
        jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable'); await send('Page.enable');
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    }
    async function waitFor(expr, ms, why) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 未就绪 */ }
        await sleep(150);
      }
      throw new Error('等超时：' + why);
    }
    async function settle(max = 60) {
      for (let i = 0; i < max; i++) {
        const st = await ev('__game.state');
        if (st === 'playing') return true;
        if (st === 'hint') await ev('document.getElementById("hiOk").click()');
        else if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
        else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
        else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
        else if (st === 'tutorial') await ev('__game.tutorial.skip()');
        else break;
        await sleep(160);
      }
      return (await ev('__game.state')) === 'playing';
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(600);
    await ev(`(() => { const x = document.getElementById('noticeX'); if (x) x.click(); return 1; })()`);

    console.log('—— ① 第六关开局，四只叠在一个点生成 ——');
    ok(await ev(`__game.ui.set('admin', true)`), '管理员沙盒开着（免得被小兵打死打断测量）');
    await ev(`__game.setPendingLevel(6)`);
    await ev(`(async () => { await __game.beginGame({ tutorial: false }); return 1; })()`);
    await sleep(1200);
    await settle();
    const lv = await ev(`({ id: __game.levelId, arena: +__game.arenaRadius.toFixed(2) })`);
    ok(lv.id === 6, `真的进了第六关（levelId=${lv.id}，arena=${lv.arena}）`, JSON.stringify(lv));

    // 四只全叠在主角附近同一个点，逼分离力干活
    await ev(`(() => {
      const n = [];
      for (let i = 0; i < 4; i++) n.push(__game.block63.enemies.spawn('arc', 0, 0));
      return n;
    })()`);
    // 出生 0.8 秒是 spawn 态（不参与画线），等它们站起来
    await sleep(2600);
    const GAPS = `(() => {
      const ns = __game.block63.enemies.list().filter((e) => e.type === 'arc' && e.state !== 'dead' && e.state !== 'spawn');
      const out = [];
      for (let i = 0; i < ns.length; i++)
        for (let j = i + 1; j < ns.length; j++)
          out.push(+Math.hypot(ns[j].x - ns[i].x, ns[j].z - ns[i].z).toFixed(2));
      return out;
    })()`;
    const nodes = await ev(`__game.block63.enemies.list().filter((e) => e.type === 'arc' && e.state !== 'dead' && e.state !== 'spawn').length`);
    ok(nodes === 4, `场上 ${nodes} 只并联体节点`);

    console.log('—— ② 实时两两间距 ——');
    let gaps = await ev(GAPS);
    ok(Array.isArray(gaps) && gaps.length === 6, `4 只 = ${gaps && gaps.length} 组两两距离`);
    ok(Math.min(...gaps) >= 15.0, `最小实时间距 ${Math.min(...gaps)}（目标 16，留 1 格收敛余量）`, JSON.stringify(gaps));
    console.log('    间距：' + JSON.stringify(gaps));

    // 再等 2 秒看它稳不稳（追击压力会不会把它们又压近）
    await sleep(2000);
    gaps = await ev(GAPS);
    ok(Math.min(...gaps) >= 15.0, `2 秒后仍然 ≥ 15：${Math.min(...gaps)}`, JSON.stringify(gaps));
    console.log('    间距：' + JSON.stringify(gaps));

    console.log('—— ③ 都在场地里 ——');
    const pos = await ev(`__game.block63.enemies.list().filter(e => e.type === 'arc').map(e => ({ x: e.x, z: e.z }))`);
    ok(pos.length >= 4, `读到 ${pos.length} 只坐标`);
    const far = pos.map((p) => Math.hypot(p.x, p.z));
    ok(Math.max(...far) <= 19 - 0.55, `最远一只离场心 ${Math.max(...far).toFixed(2)} 格（上限 18.45）`, JSON.stringify(far.map((v) => +v.toFixed(2))));

    console.log('—— ④ 血量 8 ——');
    const hp = await ev(`(() => {
      const e = __game.block63.enemies.live('arc');
      return e ? { hp: +e.hp.toFixed(2), max: +(e.maxHp || e.hp).toFixed(2) } : null;
    })()`);
    // 血上限读 maxHp：这几秒里主角在自动砍它，hp 已经掉了一点
    ok(hp && Math.abs(hp.max - 8) < 0.01, `血上限 ${hp && hp.max}（第 95 块从 12 降到 8；当前剩 ${hp && hp.hp}）`, JSON.stringify(hp));

    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(snap.result.data, 'base64'));

    ok(jsErrors.length === 0, '全程无 JS 异常', jsErrors.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    fails.push('EXCEPTION: ' + e.message);
    console.log('  ✗ 异常：' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) { /* ignore */ }
    try { chrome.kill(); } catch (_) { /* ignore */ }
  }

  console.log('\n' + '='.repeat(46));
  console.log(`第 95 块并联体 CDP：通过 ${pass} / 失败 ${fail}`);
  if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
  console.log('截图：' + SHOT);
  process.exit(fail ? 1 : 0);
})();
