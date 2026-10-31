const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-123chk');
const URL = 'http://127.0.0.1:8124/?debug=1&story&chal&meet';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  XX  ' + m); } };

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--renderer-process-limit=1', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });

  const errs = [];
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('no debug port');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errs.push((d.exception && d.exception.description || d.text || '').split('\n')[0]);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errs.push('console: ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 160));
      }
    };
    const send = (method, params) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) {
        throw new Error((r.result.exceptionDetails.exception || {}).description || 'eval error');
      }
      return r.result && r.result.result ? r.result.result.value : null;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 90; i++) {
      if (await ev('!!window.__game')) break;
      await sleep(400);
    }
    ok(await ev('!!window.__game'), '页面起来了，__game 存在');

    const lvCount = await ev('Object.keys(__game.levels).length');
    ok(lvCount === 13, `关卡表有 ${lvCount} 关`);
    ok(await ev('!!__game.levelDef(13)'), '第十三关数据存在');
    ok((await ev('__game.levelDef(13).name')).includes('焦土操场'), '关卡名 = 第十三关 · 焦土操场');
    ok(await ev('!!__game.levelDef(12)'), '第十二关数据存在');
    ok((await ev('__game.levelDef(13).rounds.length')) === 20, '第十三关 20 回合');
    ok((await ev('__game.levelDef(13).scale.hpMul')) === 1.6, 'hpMul = 1.60');
    ok(!!(await ev('JSON.stringify(__game.levelDef(13).track)')) , '跑道参数在关卡里');

    // 进第十三关
    await ev('__game.setPendingLevel(13)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1500);
    ok((await ev('__game.level.roundNo')) >= 1, '开局成功');
    ok((await ev('__game.level.level.name')).includes('焦土操场'), '当前是焦土操场');
    ok(await ev('__game.track && __game.track.on()'), '跑道已启用');
    const spec = await ev('JSON.stringify(__game.track.spec ? __game.track.spec() : null)');
    console.log('     track spec: ' + spec);

    // 生成两只新怪
    ok(await ev('!!__game.enemies.spawn("standee", { x: 4, z: 0 })'), '能刷出「立牌」');
    ok(await ev('!!__game.enemies.spawn("camera", { x: -4, z: 0 })'), '能刷出「取景的」');
    await sleep(600);
    const types = await ev('__game.enemies.all().map(e => e.type).join(",")');
    console.log('     场上: ' + types);

    ok(errs.length === 0, `没有 JS 报错（${errs.length}）`);
    if (errs.length) errs.slice(0, 6).forEach((e) => console.log('     ! ' + e));
  } catch (e) {
    console.log('  XX  异常: ' + e.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
  console.log(`\n===== block123 冒烟: ${pass} ✓ / ${fail} ✗ =====`);
  process.exit(fail ? 1 : 0);
})();
