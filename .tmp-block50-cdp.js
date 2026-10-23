// 第 50 块 CDP：主菜单「属性」页（3D 奶蛙展台 + 经篝火/火种加成后的属性总览）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block50-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9353;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-50');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  const jsErrors = [];
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    function bindWs() {
      ws.onmessage = (evt) => {
        const m = JSON.parse(evt.data);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
          jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
        }
        if (m.method === 'Runtime.exceptionThrown') {
          jsErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
        }
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      };
    }
    bindWs();
    function send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { }
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }
    let targetId = target.id;
    async function goto(url, beforeNavigate) {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
      try { await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`); } catch (_) {}
      targetId = t.id;
      ws.close();
      ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      bindWs();
      await send('Runtime.enable');
      await send('Page.enable');
      if (beforeNavigate) await beforeNavigate();
      await send('Page.navigate', { url });
      await waitFor("location.href.indexOf('127.0.0.1')>=0 && document.readyState === 'complete'", 60000, '页面加载');
    }

    await send('Runtime.enable');
    await send('Page.enable');

    // ============ A：空档案 → 属性页基础（base 值 + 3D 模型） ============
    console.log('\n[A] 属性页：入口 / base 值 / 3D 模型');
    await goto('http://127.0.0.1:8124/?debug=1&title');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(400);
    await ev('window.__game.statPage.show()');
    await waitFor("document.getElementById('statScr').classList.contains('on')", 15000, '属性页打开');
    ok('属性行渲染出来（4 组 + 14 项）', (await ev('window.__game.statPage.rows()')) >= 18,
      'rows=' + (await ev('window.__game.statPage.rows()')));
    ok('生命上限是基础值 6（无局外加成）',
      /6\.0/.test(await ev("document.getElementById('statRows').textContent")));
    ok('防御是基础值 0.0（第 46 块改小后的量级）',
      /防御0\.0/.test((await ev("document.getElementById('statRows').textContent")).replace(/\s+/g, '')));
    await waitFor('window.__game.statPage.ready()', 60000, '3D 奶蛙模型就绪');
    ok('拖动前朝向为 0', Math.abs(await ev('window.__game.statPage.yaw()')) < 0.01);
    // 模拟拖动：直接对 canvas 派发 PointerEvent（headless 里 Input 坐标不好对准面板内 canvas）
    await ev(`(function(){
      const c = document.getElementById('statCanvas');
      const r = c.getBoundingClientRect();
      const y = r.top + r.height / 2, x0 = r.left + 40;
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, clientY: y, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 10; i++) {
        c.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + i * 12, clientY: y, pointerId: 7, bubbles: true }));
      }
      c.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 + 120, clientY: y, pointerId: 7, bubbles: true }));
    })()`);
    await sleep(150);
    const yaw1 = await ev('window.__game.statPage.yaw()');
    ok('拖动能旋转（yaw 变了）', Math.abs(yaw1) > 0.05, 'yaw=' + yaw1.toFixed(3));
    await sleep(1200);
    const yaw2 = await ev('window.__game.statPage.yaw()');
    ok('松手后慢慢回正（|yaw| 变小）', Math.abs(yaw2) < Math.abs(yaw1), yaw1.toFixed(3) + ' → ' + yaw2.toFixed(3));
    // 回归（用户 bug：属性页返回按钮失效）——根因是 stBack 在「夜行记忆」和属性页
    // 重复了 id，getElementById 只认靠前的那个，属性页按钮一个监听都没挂上。
    // 修法：属性页改叫 statBack。这里点的是 statScr 内部的那个按钮，不再依赖全局 getElementById。
    ok('属性页返回按钮 id 唯一（statBack）',
      (await ev("document.querySelectorAll('#statScr #statBack').length")) === 1 &&
      (await ev("document.getElementById('statBack')?.closest('#statScr')")) !== null);
    await ev("document.querySelector('#statScr #statBack').click()");
    ok('返回按钮能关页', (await ev("document.getElementById('statScr').classList.contains('on')")) === false);
    // 通用回归：整个 index.html 不允许再出现任何重复 id
    const dupIds = await ev(`(function(){
      const seen = new Set(), dup = new Set();
      document.querySelectorAll('[id]').forEach((el) => { const id = el.id; if (seen.has(id)) dup.add(id); seen.add(id); });
      return [...dup];
    })()`);
    ok('全页无重复 id', dupIds.length === 0, dupIds.join(','));

    // ============ B：预置篝火 + 火种 → 数值变大 ============
    console.log('\n[B] 局外加成计入：篝火铁壳 ×3 + 永夜火种厚皮 ×2');
    await goto('http://127.0.0.1:8124/?debug=1&title', () => send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(function(){ try {
        const KEY = 'naiwa_rouge_profile_v1';
        const p = JSON.parse(localStorage.getItem(KEY) || '{}');
        p.camp = Object.assign({}, p.camp, { shell: 3 });       // 铁壳 ×3（防御 +0.12×3）
        p.boons = Object.assign({}, p.boons, { b_hide: 2 });     // 厚皮 ×2（防御 +0.3? 看表）
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch (_) {} })();`,
    }));
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(400);
    await ev('window.__game.statPage.show()');
    await sleep(400);
    const txt = (await ev("document.getElementById('statRows').textContent")).replace(/\s+/g, '');
    ok('防御显示加成后的值（不再是 0.0）', !/防御0\.0（?基础/.test(txt) && /防御/.test(txt), txt.slice(0, 120));
    ok('加成行标注了基础值', /（基础/.test(await ev("document.getElementById('statRows').textContent")));

    const realErrors = jsErrors.filter((s) => !/favicon|Autofocus|Unable to load|WebGL|SwiftShader/i.test(s));
    ok('无 console 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 300));

    console.log(`\n-------------------------------\n通过 ${pass} / 失败 ${fail}`);
    if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
  } catch (err) {
    console.error('测试中断：', err.message);
    console.log(`\n通过 ${pass} / 失败 ${fail}`);
    if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
