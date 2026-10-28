// 第 109 块 CDP：每日任务池扩容 24 → 39（真浏览器冒烟）
//   A 标题页每日任务面板：5 条都渲染、常驻必出、avail 任务（箭雨/傀儡）对新档不出现
//   B 进度联动：__game.dq.pump 把某条任务的 metric 喂满 → 行变 done → claim 后变 got
//   C 一键领取 / 红点
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-109-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9392;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-109');
const OUT = path.join(os.tmpdir(), 'naiwa-block109');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
// ⚠️ 签名是 ok(条件, 名字, 附注) —— 别写成 ok(名字, 条件)：非空字符串恒真
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
    const visible = (sel) => ev(`(() => { const el = document.querySelector('${sel}'); if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0; })()`);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    // 公告 → 签到 → 宣传：350ms 定时器链逐环关掉
    try { await waitFor('__game.notice.open()', 8000, '公告自动弹出'); } catch (_) { /* 看过了就不弹 */ }
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(600);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(600);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);

    // ============================================================
    console.log('\n[A] 每日任务面板');
    // ============================================================
    {
      const st = await ev('JSON.stringify(__game.dq.state())');
      const s = JSON.parse(st);
      ok(s.picked.length === 5, '抽到 5 条', String(s.picked.length));
      ok(s.picked.includes('dq_clear_any'), '常驻「完整通过任一关卡」必出');
      const availIds = ['dq_arrow_20', 'dq_m_arrow8', 'dq_m_golem2'];
      ok(!s.picked.some((x) => availIds.includes(x)),
        '新档（无箭雨 / 无傀儡术）抽不到 avail 任务', s.picked.join(','));

      await ev('__game.tab("quest")');
      await waitFor("[...document.querySelectorAll('.qp-item')].length === 5", 8000, '面板渲染 5 条');
      ok(await visible('.qp-item'), '任务行可见');
      const rows = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.qp-item')].map((r) => r.dataset.q))`));
      ok(rows.length === 5 && rows.includes('dq_clear_any'), '面板行与抽签一致（data-q 身份）', rows.join(','));
      await shot('a-quest-pane.png');
    }

    // ============================================================
    console.log('\n[B] 进度联动 + 领取');
    // ============================================================
    {
      // 挑一条今天抽中的任务，把它的 metric 喂满 —— 全部走真实 dqPump 通路
      const tasks = JSON.parse(await ev(`JSON.stringify(__game.dq.tasks().map(t => ({ id: t.id, metric: t.def.metric, need: t.need, tier: t.tier })))`));
      const t = tasks.find((x) => x.metric === 'dq_clear_any' && false) || tasks.find((x) => !x.metric.startsWith('kT:'));
      ok(!!t, '找到一条可喂的任务', JSON.stringify(tasks.map((x) => x.metric)));
      await ev(`__game.dq.pump({ ${JSON.stringify(t.metric)}: ${t.need} })`);
      // __game.dq.pump 是数据口，不触发面板重绘；setTitleTab 同 tab 会早退，
      // 所以先切走再切回（重进 quest 会走 renderQuestPane）
      await ev('__game.tab("main")');
      await ev('__game.tab("quest")');
      await waitFor(`(() => { const r = document.querySelector('.qp-item[data-q="${t.id}"]'); return !!r && r.classList.contains('done'); })()`, 6000, '行变 done');
      ok(true, `喂满 ${t.metric} 后行变 done`, t.id);
      // 红点亮起（有待领）
      ok(await ev('__game.dq.pending() > 0'), '待领红点（dqPending > 0）');
      // 骨币到手
      const bones0 = await ev('__game.ui.bones()');
      const r = await ev(`JSON.stringify(__game.dq.claim(${JSON.stringify(t.id)}))`);
      const rr = JSON.parse(r);
      ok(rr.ok && rr.bones > 0, `领取到账 ${rr.bones} 骨币`, r);
      ok(await ev('__game.ui.bones()') === bones0 + rr.bones, '骨币数值对上');
      await ev('__game.tab("main")');
      await ev('__game.tab("quest")');
      await waitFor(`(() => { const el = document.querySelector('.qp-item[data-q="${t.id}"]'); return !!el && el.classList.contains('got'); })()`, 6000, '行变 got');
      ok(true, '领取后行变 got');
      await shot('b-claimed.png');
      await ev('__game.dq.reset()');
    }

    ok(jsErrors.length === 0, '整个过程没有 JS 异常', jsErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('崩溃: ' + e.message);
    console.log('\n✗ 崩溃: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) console.log('失败项：\n - ' + fails.join('\n - '));
  console.log('截图目录：' + OUT);
  process.exit(fail ? 1 : 0);
})();
