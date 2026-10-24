// 第 74 块 CDP：夜行商店（篝火 + 盲盒）与盲盒涨价在真实浏览器里对不对
//   A 主菜单只有一个商店入口「夜行商店」，点开是同一个面板
//   B 面板里两区能互相切，默认落在篝火
//   C 盲盒按购买次数加价：木 30 → 32 → 34，且三种各自独立
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block74-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9374;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-74');
// ⚠️ 必须带 &title：debug 模式下没有它会在加载完直接开局（AUTO_START）
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
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

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
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(250);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(700);

    console.log('\n— A 主菜单只剩一个商店入口 —');
    const shopBtns = await ev(`JSON.stringify(Array.from(document.querySelectorAll('.tt-camp')).map((b) => b.id))`);
    ok(JSON.parse(shopBtns).join() === 'btnShop', '主菜单只有一个商店按钮（btnShop）', shopBtns);
    const btnText = await ev(`document.querySelector('#btnShop .tt-camp-name').textContent.trim()`);
    ok(btnText === '夜行商店', '按钮上写「夜行商店」', btnText);
    ok(await ev(`!document.getElementById('btnCamp')`), '旧的「篝火商店」按钮没了');
    ok(await ev(`!document.getElementById('msScr')`), '旧的「局外商店」面板没了');

    console.log('\n— B 一个面板、两区可切 —');
    await ev(`document.getElementById('btnShop').click()`);
    await sleep(500);
    ok(await ev(`document.getElementById('campScr').classList.contains('on')`), '点开就是夜行商店');
    const title = await ev(`document.querySelector('#campScr .lv-title').textContent.trim()`);
    ok(title === '夜行商店', '面板标题「夜行商店」', title);
    ok(await ev(`!document.getElementById('shopBodyCamp').hidden`), '默认落在篝火区');
    ok(await ev(`document.getElementById('shopBodyBox').hidden`), '盲盒区默认收着');
    const cfN = await ev(`document.querySelectorAll('#cfList .cf-item').length`);
    ok(cfN === 9, '篝火区九簇火种', String(cfN));

    await ev(`document.getElementById('shopTabBox').click()`);
    await sleep(350);
    ok(await ev(`!document.getElementById('shopBodyBox').hidden`), '切到盲盒区：盲盒可见');
    ok(await ev(`document.getElementById('shopBodyCamp').hidden`), '切到盲盒区：篝火收起');
    ok(await ev(`document.getElementById('shopTabBox').classList.contains('on')`), '盲盒 tab 高亮');
    ok(await ev(`!document.getElementById('shopTabCamp').classList.contains('on')`), '篝火 tab 不再高亮');
    const msN = await ev(`document.querySelectorAll('#msList .ms-item').length`);
    ok(msN === 3, '盲盒区三种箱子', String(msN));
    await ev(`document.getElementById('shopTabCamp').click()`);
    await sleep(300);
    ok(await ev(`!document.getElementById('shopBodyCamp').hidden`), '切回篝火区');

    console.log('\n— C 盲盒按购买次数加价 —');
    await ev(`__game.camp.setBones(5000)`);
    await ev(`document.getElementById('shopTabBox').click()`);
    await sleep(350);
    const price0 = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#msList .ms-cost')).map((e) => e.textContent))`);
    ok(JSON.parse(price0).join() === '30 骨币,100 骨币,280 骨币', '一开始是首价 30 / 100 / 280', price0);

    // 连买三次木匣：30 → 32 → 34
    const seq = [];
    for (let i = 0; i < 3; i++) {
      const p = await ev(`document.querySelectorAll('#msList .ms-cost')[0].textContent`);
      seq.push(p);
      await ev(`document.querySelectorAll('#msList .ms-buy')[0].click()`);
      await sleep(500);
      await ev(`document.getElementById('brOk').click()`);   // 收下开箱结果
      await sleep(350);
    }
    ok(seq.join() === '30 骨币,32 骨币,34 骨币', '木匣 30 → 32 → 34（每买一次 +6% 首价）', seq.join());
    ok(await ev(`__game.meta.bought('wood')`) === 3, '木匣买了 3 次', String(await ev(`__game.meta.bought('wood')`)));
    ok(await ev(`__game.meta.price('wood')`) === 35, '买过 3 次后木匣 35（30 × 1.18 = 35.4）', String(await ev(`__game.meta.price('wood')`)));

    const after = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#msList .ms-cost')).map((e) => e.textContent))`);
    ok(JSON.parse(after).join() === '35 骨币,100 骨币,280 骨币', '银匣 / 金匣没被木匣带贵（各数各的）', after);

    // 买一次银匣，确认它自己也开始涨
    await ev(`document.querySelectorAll('#msList .ms-buy')[1].click()`);
    await sleep(500);
    await ev(`document.getElementById('brOk').click()`);
    await sleep(350);
    const after2 = await ev(`JSON.stringify(Array.from(document.querySelectorAll('#msList .ms-cost')).map((e) => e.textContent))`);
    ok(JSON.parse(after2).join() === '35 骨币,106 骨币,280 骨币', '银匣买过一次 → 106（100 × 1.06）', after2);
    const info = await ev(`document.querySelectorAll('#msList .ms-info')[0].textContent`);
    ok(/已开 3 次/.test(info) && /下次 37/.test(info), '卡片上明说「已开几次 / 下次多少」', info);

    console.log('\n— D 无 JS 报错 —');
    ok(jsErrors.length === 0, '整轮没有 JS 报错', jsErrors.slice(0, 3).join(' | '));
  } catch (err) {
    fail++; fails.push('脚本异常：' + err.message);
    console.log('  ✗ 脚本异常：' + err.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(600);
    try { fs.rmSync(UD, { recursive: true, force: true, maxRetries: 3, retryDelay: 400 }); } catch (_) {}
  }
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
})();
