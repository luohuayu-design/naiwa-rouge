// 第 111 块 CDP：用户报「新关中途退出 → 读档续玩 → 通关后没有永夜火种、没显示该关通关」
// 复现链路（全走真实入口）：
//   ① setPendingLevel(2) → beginGame（新档，第 2 关从没赢过）
//   ② 中途 __game.run.save()（等价 pagehide 落档）
//   ③ Page.navigate 重新载入（真实「退出」）
//   ④ __game.run.resume()（读档续玩）
//   ⑤ __game.win()（真实结算入口 endGame(true)）
//   ⑥ 检查：结算面板 / boons.pending / profile().clears / records / 回标题补弹
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-111-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9395;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-111');
const OUT = path.join(os.tmpdir(), 'naiwa-block111');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&keepsave=1&title';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
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
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        jsErrors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]);
      }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    function send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    }
    async function waitFor(expr, ms = 60000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
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
      return false;
    }
    async function closePopups() {
      await sleep(1200);
      await ev('if (__game.notice.open()) __game.notice.hide(); 1');
      await sleep(500);
      await ev('if (__game.sign.open()) __game.sign.hide(); 1');
      await sleep(500);
      await ev('if (__game.promo.open()) __game.promo.hide(); 1');
      await sleep(300);
    }

    await send('Runtime.enable');
    await send('Page.enable');

    // ---------- 第一段：新关开局 + 中途存档 ----------
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    await closePopups();

    console.log('\n[① 新关开局] 第 2 关（新档）');
    await ev('__game.setPendingLevel(2)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1500);
    ok(await settle(), '进入 playing');
    ok((await ev('__game.levelId')) === 2, '开局 levelId = 2');
    ok((await ev('__game.boons.pending()')) === 0, '开局火种欠账 = 0');
    ok(!(await ev('__game.ui.profile().clears && __game.ui.profile().clears["2"]')), '开局第 2 关未通关');
    ok((await ev('JSON.parse(localStorage.getItem("naiwa_rouge_records_v1")||"{}")["2"]?.wins || 0')) === 0, '开局 records[2].wins = 0');

    console.log('\n[② 中途存档]');
    await ev('__game.run.save()');
    const saves = await ev('__game.run.load()');
    ok(saves.length === 1, '存档落盘 1 条', '实际 ' + saves.length);
    ok(saves[0] && saves[0].level === 2, '存档记着第 2 关', '实际 level=' + (saves[0] && saves[0].level));

    console.log('\n[③ 真实退出：整页重新载入]');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    await closePopups();
    const saves2 = await ev('__game.run.load()');
    ok(saves2.length === 1, '退出后存档还在 1 条', '实际 ' + saves2.length);

    console.log('\n[④ 读档续玩]');
    await ev('(async () => { await __game.run.resume(); return 1; })()');
    await sleep(1500);
    ok(await settle(), '续玩进入 playing');
    ok((await ev('__game.levelId')) === 2, '续玩 levelId = 2', '实际 ' + (await ev('__game.levelId')));

    console.log('\n[⑤ 通关结算 endGame(true)]');
    await ev('__game.win()');
    await waitFor("__game.state === 'over'", 8000, '进入 over');
    await sleep(600);
    await shot('111-over.png');

    const st = await ev(`(() => {
      const rs = document.getElementById('resultScr') || document.querySelector('.rs-on, #resultScr');
      const btn = document.getElementById('rsBtn');
      const grid = document.getElementById('rsGrid');
      let boonCell = '';
      if (grid) grid.querySelectorAll('.rs-cell').forEach((c) => { if (c.textContent.includes('永夜火种')) boonCell = c.textContent; });
      return {
        levelId: __game.levelId,
        title: document.getElementById('rsTitle') ? document.getElementById('rsTitle').textContent : '(无结算标题)',
        btn: btn ? btn.textContent : '(无按钮)',
        boonCell,
        pending: __game.boons.pending(),
        clears2: !!(__game.ui.profile().clears || {})['2'],
        wins2: JSON.parse(localStorage.getItem('naiwa_rouge_records_v1') || '{}')['2']?.wins || 0,
        boonOpen: __game.boons.open(),
      };
    })()`);
    console.log('   诊断:', JSON.stringify(st));
    ok(st.title === '通 关', '结算标题 = 通关', st.title);
    ok(st.pending === 3, 'boonPending = 3（回标题补弹）', '实际 ' + st.pending);
    ok(st.clears2 === true, 'profile.clears[2] = true', '实际 ' + st.clears2);
    ok(st.wins2 === 1, 'records[2].wins = 1', '实际 ' + st.wins2);
    ok(/永夜火种/.test(st.boonCell) && !/不再发放/.test(st.boonCell), '结算面板火种格 = +3 次', st.boonCell || '(无)');

    console.log('\n[⑥ 回标题 → 火种三选一补弹]');
    await ev('document.getElementById("rsBtn").click()');
    await sleep(1200);
    const backTitle = await ev('__game.state');
    ok(backTitle === 'title', '回到标题页', backTitle);
    await waitFor('__game.boons.open()', 8000, '火种三选一自动弹出');
    ok(true, '永夜火种三选一已弹出');
    await shot('111-boons.png');
    // 选完一张收尾，避免残留（测试档无所谓，但保持整洁）
    await ev('__game.boons.reset()');

    // ---------- 总结 ----------
    console.log(`\n========== 总结: ${pass} 通过 / ${fail} 失败 ==========`);
    if (jsErrors.length) {
      console.log('页面 JS 报错（前 5 条）:');
      jsErrors.slice(0, 5).forEach((e) => console.log('  ' + e));
    }
    if (fails.length) { console.log('失败项:'); fails.forEach((f) => console.log('  - ' + f)); }
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('测试中断:', e.message);
    try { await shot('111-crash.png'); } catch (_) {}
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    chrome.kill();
    await sleep(400);
    chrome.kill('SIGKILL');
  }
})();
