// ============================================================
// 第 72 块 CDP：按关预载（真实浏览器量「首屏到底拉了几个 glb」）
//   A 非 debug 首屏：只请求第一关 4 只怪的 glb（原来 17 只全拉）
//   B 非 debug 首屏能正常进标题页、0 JS 报错
//   C debug 模式照旧全量（自动化测试会直接 setLevel(6)，等不了异步）
//   D 补载链路：ensureLevelAssets 只补差集，进过第五关后才出现 eraser 模型
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block72-cdp.js`
// ⚠️ 一次只跑一套；套间跑 node .tmp-cdp-clean.js
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9472;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-72-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block72');
const URL_PROD = 'http://127.0.0.1:8124/index.html';
const URL_DEBUG = 'http://127.0.0.1:8124/index.html?debug=1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });

    let id = 0;
    const pending = new Map();
    let errSink = jsErrors;
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errSink.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        errSink.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]);
      }
      if (m.method === 'Network.requestWillBeSent') {
        const u = m.params.request?.url || '';
        if (u.endsWith('.glb')) glbSink.push(u.split('/').pop());
      }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); }
    };
    let glbSink = [];

    const send = (method, params = {}) => new Promise((res) => {
      const myId = ++id;
      pending.set(myId, res);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return r.result?.value ?? (r.exceptionDetails ? { __err: r.exceptionDetails.text } : undefined);
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');

    // ---------- A / B：生产首屏 ----------
    console.log('\n[A/B] 生产首屏（?debug 不挂）');
    glbSink = []; errSink = jsErrors;
    await send('Page.navigate', { url: URL_PROD });
    // SwiftShader 慢，轮询等标题页出来
    let titleOn = false;
    for (let i = 0; i < 80; i++) {
      await sleep(1000);
      const st = await ev(`(() => { const t = document.getElementById('titleScr'); const l = document.getElementById('loading');
        return { title: t ? !t.classList.contains('off') : false, ld: l ? getComputedStyle(l).display : '' }; })()`);
      if (st && st.title && st.ld === 'none') { titleOn = true; break; }
    }
    ok(titleOn, '生产首屏能进标题页（加载层已收起）');
    const glbs = [...new Set(glbSink)];
    const monsterGlbs = glbs.filter((g) => !/rigged|sword|turret|spikes|ballista|bone-deco/i.test(g));
    console.log('    首屏请求的 glb：' + glbs.join(', '));
    ok(monsterGlbs.length <= 5, '首屏怪物模型 <= 5 个（原来一次性 17 个）', monsterGlbs.join(','));
    ok(monsterGlbs.length >= 4, '首屏至少拉了第一关 4 只怪', monsterGlbs.join(','));
    ok(monsterGlbs.some((g) => /minion/i.test(g)), '含 skeleton-minion（教程要打的那只）');
    ok(!monsterGlbs.some((g) => /wizard|demon|wolf|bull|orc|mushroom|ghost|reboot|hooded/i.test(g)),
      '首屏不拉二~七关的怪（wizard/bull/orc/wolf/demon/ghost/reboot…）', monsterGlbs.join(','));
    ok(jsErrors.length === 0, '生产首屏 0 JS 报错', jsErrors.slice(0, 3).join(' | '));
    await send('Page.captureScreenshot', {}).then(async (r) => {
      if (r.data) fs.writeFileSync(path.join(OUT, 'prod-title.png'), Buffer.from(r.data, 'base64'));
    });

    // ---------- C：debug 全量 ----------
    console.log('\n[C] debug 模式照旧全量');
    glbSink = [];
    await send('Page.navigate', { url: URL_DEBUG });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      await sleep(1000);
      const n = await ev(`window.__game && window.__game.enemies && window.__game.enemies.loaded ? window.__game.enemies.loaded().length : 0`);
      if (typeof n === 'number' && n >= 15) { ready = true; break; }
    }
    ok(ready, 'debug 模式预载齐全（自动化测试直接切关不会缺模型）');
    const loadedN = await ev(`window.__game.enemies.loaded().length`);
    ok(loadedN >= 17, 'debug 下 17 种怪全在内存', String(loadedN));

    // ---------- D：补载链路 ----------
    console.log('\n[D] 补载链路（只补差集）');
    const lv5 = await ev(`(() => { const w = window.__game; return w.levels ? w.levels[5].name : ''; })()`);
    ok(/草甸路口/.test(String(lv5 || '')), '第五关名字取得到', String(lv5));
    // 直接调 ensureLevelAssets 走一遍（debug 下已全量 → 应当零新增请求）
    const before = glbSink.length;
    const r1 = await ev(`window.__game.ensureLevelAssets(5)`);
    ok(r1 === true, 'ensureLevelAssets(5) 返回 true');
    await sleep(600);
    ok(glbSink.length === before, '已加载的不会重复下载（0 新增请求）');
    const canSpawn = await ev(`(() => { const g = window.__game; const e = g.enemies.spawn('eraser', { x: 3, z: 3 }); return !!e; })()`);
    ok(canSpawn === true, '第五关的擦名者能正常生成（模型在内存里）');

    console.log('\n第 72 块 CDP：' + pass + ' 通过 / ' + fail + ' 失败');
    if (fails.length) console.log('失败项：\n  - ' + fails.join('\n  - '));
  } catch (err) {
    console.error('跑挂了：', err && err.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    process.exit(fail ? 1 : 0);
  }
})();
