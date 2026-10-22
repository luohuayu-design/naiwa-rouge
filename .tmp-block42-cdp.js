// 第 42 块 CDP 回归：主线剧情「读秒再推进」
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block42-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-42');

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
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2',
    '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + UD,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        list = await r.json(); break;
      } catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const tr = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' });
    const target = await tr.json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    function send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }
    async function waitFor(expr, ms = 30000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 还没就绪 */ }
        await sleep(120);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n[1] 启动并开一局');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    ok('读秒时长配置为 3 秒', await ev('window.__game.story.readDelay') === 3);

    await ev("document.getElementById('btnStart').click()");
    await sleep(300);
    await ev("document.querySelector('#lvList .lv-item:not(.locked)').click()");
    await sleep(300);
    await ev("document.getElementById('diffNext').click()");
    await sleep(250);
    await ev("document.getElementById('curseStart').click()");
    await sleep(500);
    if (await ev("document.getElementById('tutAsk').classList.contains('on')")) {
      await ev("document.getElementById('tutNo').click()");
    }
    await sleep(1500);
    ok('已经在局内', await ev("window.__game.state === 'playing'"), await ev('window.__game.state'));

    console.log('\n[2] 主线第一拍：按钮锁住 + 倒计时');
    await ev("window.__game.story.play('s01')");
    await sleep(400);
    ok('事件卡打开了', await ev("document.getElementById('eventCard').classList.contains('on')"));
    ok('这一拍有回话按钮', await ev("document.querySelectorAll('#evChoices .ev-btn').length") >= 1);
    ok('按钮全部锁住', await ev(
      "[...document.querySelectorAll('#evChoices .ev-btn')].every(b => b.disabled === true)"));
    ok('按钮上有倒计时角标', await ev(
      "!!document.querySelector('#evChoices .ev-btn .ev-cd')"));
    const cd0 = await ev("document.querySelector('#evChoices .ev-btn .ev-cd').textContent");
    ok('角标显示秒数', /^[123]s$/.test(cd0), cd0);
    ok('调试钩子报告还在倒计时', await ev('window.__game.event.cdLeft') >= 1, String(await ev('window.__game.event.cdLeft')));
    ok('倒计时期间点不动', await ev('window.__game.event.choose(0)') === false);

    console.log('\n[3] 倒计时在走');
    await sleep(1100);
    const cd1 = await ev("document.querySelector('#evChoices .ev-btn .ev-cd').textContent");
    ok('角标数字在往下走', parseInt(cd1) < parseInt(cd0), cd0 + ' → ' + cd1);

    console.log('\n[4] 读秒结束按钮解锁');
    await waitFor('window.__game.event.cdLeft === 0', 8000, '倒计时归零');
    ok('按钮全部解锁', await ev(
      "[...document.querySelectorAll('#evChoices .ev-btn')].every(b => b.disabled === false)"));
    ok('角标收走了', await ev("!document.querySelector('#evChoices .ev-btn .ev-cd')"));
    ok('锁定标记清了', await ev('window.__game.event.cdLocked') === false);

    console.log('\n[5] 回一句 → 下一拍重新读秒');
    const before = await ev('window.__game.event.transcript.length');
    ok('这次能点下去了', await ev('window.__game.event.choose(0)') === true);
    await sleep(400);
    ok('对话记录多了一句', await ev('window.__game.event.transcript.length') > before);
    ok('新一拍又锁上了', await ev(
      "[...document.querySelectorAll('#evChoices .ev-btn')].every(b => b.disabled === true)"));
    ok('新一拍又跑起倒计时', await ev('window.__game.event.cdLeft') >= 1, String(await ev('window.__game.event.cdLeft')));

    console.log('\n[5b] 第二拍也能正常解锁（旧定时器不捣乱）');
    await waitFor('window.__game.event.cdLeft === 0', 9000, '第二拍倒计时归零');
    ok('第二拍角标收干净', await ev("document.querySelectorAll('#evChoices .ev-cd').length") === 0);
    ok('第二拍没有残留暗态', await ev("document.querySelectorAll('#evChoices .ev-btn.cd-wait').length") === 0);
    ok('锁定标记清了', await ev('window.__game.event.cdLocked') === false);

    console.log('\n[6] 随机奇遇同样读秒（第 43 块放开）');
    await ev('window.__game.event.close()');
    await sleep(300);
    await ev("window.__game.event.trigger('envoy')");
    await sleep(400);
    ok('随机对话事件打开了', await ev('window.__game.event.isTalk') === true);
    ok('按钮也锁住了', await ev(
      "[...document.querySelectorAll('#evChoices .ev-btn')].every(b => b.disabled === true)"));
    ok('也有倒计时角标', await ev("!!document.querySelector('#evChoices .ev-btn .ev-cd')"));
    const evCd0 = await ev("document.querySelector('#evChoices .ev-btn .ev-cd').textContent");
    ok('角标显示秒数', /^[23]s$/.test(evCd0), evCd0);
    ok('读秒期间点不动', await ev('window.__game.event.choose(0)') === false);
    ok('读秒标记在跑', await ev('window.__game.event.cdLocked') === true,
      'cdLeft=' + await ev('window.__game.event.cdLeft')
      + ' cdEls=' + await ev("document.querySelectorAll('#evChoices .ev-cd').length")
      + ' dis=' + await ev("[...document.querySelectorAll('#evChoices .ev-btn')].map(b=>b.disabled).join(',')")
      + ' cls=' + await ev("[...document.querySelectorAll('#evChoices .ev-btn')].map(b=>b.className).join('|')")
      + ' delay=' + await ev('window.__game.event.readDelay'));

    console.log('\n[7] 奇遇读秒结束也能正常推进');
    await waitFor('window.__game.event.cdLeft === 0', 8000, '奇遇倒计时归零');
    ok('奇遇按钮解锁', await ev(
      "[...document.querySelectorAll('#evChoices .ev-btn')].every(b => b.disabled === false)"));
    ok('奇遇这次点得下去了', await ev('window.__game.event.choose(0)') === true);
    await sleep(400);

    console.log('\n-------------------------------');
    console.log(`通过 ${pass} / 失败 ${fail}`);
    if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('测试中断:', e.message);
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill('SIGKILL'); } catch (_) {}
    await sleep(600);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* 交给系统清理 */ }
  }
})();
