// 第 46 块补丁 CDP 回归：追溯解锁——更新前就通关过第一关的老玩家也能拿到音效包
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block46b-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const PAGE = "https://luohuayu-design.github.io/naiwa-rouge/?debug=1&title";
const UD = path.join(os.tmpdir(), 'naiwa-cdp-46b-live');

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
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
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
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 还没就绪 */ }
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }

    const q = (s) => JSON.stringify(s);
    const isOn = (sel) => `document.getElementById(${q(sel)}).classList.contains('on')`;

    await send('Runtime.enable');
    await send('Page.enable');

    // 预置战绩后整页重载
    async function preset(records, voicePack) {
      await ev(`localStorage.setItem('naiwa_rouge_records_v1', ${q(JSON.stringify(records))});`
        + (voicePack == null
          ? `localStorage.removeItem('naiwa_rouge_profile_v1');`   // 直接清档案最干净
          : `localStorage.setItem('naiwa_rouge_profile_v1', ${q(JSON.stringify(voicePack))});`));
      await ev('location.reload()');
      await waitFor("location.href.indexOf('naiwa-rouge')>=0 && !!window.__game", 90000, '重载后 __game 就绪');
      await sleep(400);
    }

    console.log('\n[1] 老玩家：通关过第一关，档案里没有 voicePack');
    ok('线上是 v=54', (await ev("document.documentElement.outerHTML.match(/main\.js\?v=(\d+)/)?.[1] || ''")) === '54');
    await waitFor("location.href.indexOf('naiwa-rouge')>=0 && !!window.__game", 90000, '首次 __game 就绪');
    // 先关掉可能自动弹的公告，避免干扰断言
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await preset({ '1': { wins: 2, bestTime: 100, bestKills: 50, bestRound: 20 } }, null);
    ok('追溯条件命中（pack.retroDue）', (await ev('window.__game.pack.retroDue()')) === true);
    ok('解锁卡在标题页自动弹出（1.6s）', await waitFor(isOn('packGet'), 6000, '追溯卡弹出'));
    const st0 = await ev('window.__game.pack.state()');
    ok('此刻还没写档（等玩家点按钮）', st0.unlocked === false, JSON.stringify(st0));

    console.log('\n[2] 点「换上奶蛙叫」→ 正常落档');
    await ev("document.getElementById('pgYes').click()");
    await sleep(500);
    const st1 = await ev('window.__game.pack.state()');
    ok('unlocked=true', st1.unlocked === true);
    ok('id=frog', st1.id === 'frog', JSON.stringify(st1));
    const saved = JSON.parse(await ev("localStorage.getItem('naiwa_rouge_profile_v1') || '{}'"));
    ok('写进了档案', saved.voicePack && saved.voicePack.unlocked === true && saved.voicePack.id === 'frog', JSON.stringify(saved.voicePack));

    console.log('\n[3] 刷新后不再弹、设置里可选');
    await ev('location.reload()');
    await waitFor("location.href.indexOf('naiwa-rouge')>=0 && !!window.__game", 90000, "第二次 __game 就绪");
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await sleep(2200);   // 等过 1.6s 的追溯弹卡窗口
    ok('已解锁后刷新不弹卡', (await ev(isOn('packGet'))) === false);
    ok('选择还在（frog）', (await ev('window.__game.pack.get()')) === 'frog');

    console.log('\n[4] 没通关过第一关的新档案：不弹');
    await preset({}, null);
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await sleep(2200);
    ok('无战绩不弹卡', (await ev(isOn('packGet'))) === false);
    ok('追溯条件不命中', (await ev('window.__game.pack.retroDue()')) === false);

    console.log('\n[5] 只有进入过（wins=0）也不算通关：不弹');
    await preset({ '1': { wins: 0, bestTime: null, bestKills: 0, bestRound: 17 } }, null);
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await sleep(2200);
    ok('wins=0 不弹卡', (await ev(isOn('packGet'))) === false);

    console.log('\n[6] 用「先用原来的」关掉追溯卡：也算解锁');
    await preset({ '1': { wins: 1, bestTime: 90, bestKills: 40, bestRound: 20 } }, null);
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    ok('追溯卡弹出', await waitFor(isOn('packGet'), 6000, '追溯卡弹出'));
    await ev("document.getElementById('pgNo').click()");
    await sleep(400);
    const st2 = await ev('window.__game.pack.state()');
    ok('unlocked=true 且仍是 normal', st2.unlocked === true && st2.id === 'normal', JSON.stringify(st2));
    const saved2 = JSON.parse(await ev("localStorage.getItem('naiwa_rouge_profile_v1') || '{}'"));
    ok('档案照写', saved2.voicePack && saved2.voicePack.unlocked === true, JSON.stringify(saved2.voicePack));

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
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* 浏览器还没完全退出，留给系统清理 */ }
  }
})();
