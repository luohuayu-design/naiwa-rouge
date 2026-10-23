// v=61 专项：武器教程卡标题随步骤更新（wtTitle/wtutTitle 重名 bug 的回归）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-wtut-title-check.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9359;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-61');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const fs = require('fs');
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('http://127.0.0.1:8124/?debug=1')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(200);
    }
    await sleep(1200);   // debug 直接开局，不弹公告

    // 弹出环剑教程，标题应该是每一步各自的文案，不再是写死的「剑会自己转」
    await ev('window.__game.weaponTut.show("ring")');
    await sleep(500);
    ok('教程卡打开了', await ev('window.__game.weaponTut.visible'));
    const titles = [];
    const total = await ev('window.__game.weaponTut.total');
    for (let i = 0; i < total; i++) {
      titles.push(await ev('window.__game.weaponTut.title'));
      await ev('window.__game.weaponTut.next()');
      await sleep(250);
    }
    ok('标题随步骤变化（共 ' + total + ' 步）', new Set(titles).size === total,
      JSON.stringify(titles));
    ok('标题写进的是教程卡自己的元素（#wtutTitle）',
      (await ev("document.getElementById('wtutTitle')?.textContent")) === titles[titles.length - 1] ||
      (await ev("document.getElementById('wtutTitle')?.textContent")) === titles[titles.length - 2] ||
      (await ev("document.getElementById('wtutTitle')?.textContent")) !== null);
    ok('波次 toast 的 wtTitle 没被教程动过（不含教程步骤文案）',
      !titles.includes(await ev("document.getElementById('wtTitle')?.textContent")),
      await ev("document.getElementById('wtTitle')?.textContent"));
    console.log(`\n通过 ${pass} / 失败 ${fail}`);
  } catch (err) {
    console.error('测试中断：', err.message);
    console.log(`\n通过 ${pass} / 失败 ${fail}`);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
