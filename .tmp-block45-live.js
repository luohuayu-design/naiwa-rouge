// 第 45 块线上烟测：公告在真实线上地址能不能正常弹、复制、记住「今日不再弹」
// 跑法：`node .tmp-block45-live.js`（不需要本地服务器）
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const ORIGIN = 'https://luohuayu-design.github.io';
const PAGE = ORIGIN + '/naiwa-rouge/';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-45live');

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
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const waitFor = async (expr, ms = 150000, label = expr) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 还没就绪 */ }
        await sleep(250);
      }
      throw new Error('等待超时: ' + label);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    try {
      await send('Browser.grantPermissions', {
        origin: ORIGIN,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      });
      await send('Page.bringToFront');
    } catch (_) { /* 不支持就算了 */ }

    console.log('\n[1] 线上版本与页面');
    // /json/new 之后页面还在导航：此时 evaluate 读到的是 about:blank（它也有 body），
    // 必须等 location 真的换成 naiwa-rouge 再查，否则前面两项永远查空。
    await waitFor("location.href.indexOf('naiwa-rouge') >= 0 && document.readyState !== 'loading'", 60000, '页面导航完成');
    const ver = await ev("(document.querySelector('script[src*=\"main.js\"]')||{}).src?.match(/v=(\\d+)/)?.[1] || ''");
    ok('线上引的是 v=51', ver === '51', 'v=' + ver);
    ok('公告 DOM 在线上存在', await ev("!!document.getElementById('noticeOv')"));
    await waitFor("document.getElementById('loading').style.display === 'none'", 150000, '首屏加载完成');
    ok('标题页已出现', await ev("document.getElementById('titleScr').classList.contains('off') === false"));

    console.log('\n[2] 公告自动弹出');
    await waitFor("document.getElementById('noticeOv').classList.contains('on')", 30000, '公告自动弹出');
    ok('进主界面自动弹公告', await ev("document.getElementById('noticeOv').classList.contains('on')"));
    const body = await ev("document.getElementById('noticeOv').textContent");
    ok('写了礼包兑换码奖励', /礼包兑换码/.test(body));
    ok('写了 QQ 3829845261', /3829845261/.test(body) && /落花雨/.test(body));
    ok('写了本站网址', /luohuayu-design\.github\.io\/naiwa-rouge/.test(body));
    ok('两个复制按钮就位', (await ev("document.querySelectorAll('#noticeOv .notice-copy').length")) === 2);

    console.log('\n[3] 一键复制（线上 https 走 clipboard）');
    await ev("document.querySelectorAll('#noticeOv .notice-copy')[0].click()");
    await sleep(400);
    ok('剪贴板拿到 QQ 号', (await ev("navigator.clipboard.readText().catch(() => '')")) === '3829845261',
      String(await ev("navigator.clipboard.readText().catch(() => '')")));
    ok('按钮亮成「已复制」', /已复制/.test(await ev("document.querySelectorAll('#noticeOv .notice-copy')[0].textContent")));
    await sleep(1700);
    await ev("document.querySelectorAll('#noticeOv .notice-copy')[1].click()");
    await sleep(400);
    ok('剪贴板拿到网址', (await ev("navigator.clipboard.readText().catch(() => '')")) === 'https://luohuayu-design.github.io/naiwa-rouge/',
      String(await ev("navigator.clipboard.readText().catch(() => '')")));

    console.log('\n[4] 今日不再弹出');
    await ev("document.getElementById('noticeHideToday').checked = true");
    await ev("document.getElementById('noticeOk').click()");
    await sleep(250);
    ok('关掉了', (await ev("document.getElementById('noticeOv').classList.contains('on')")) === false);
    ok('写下了日期|版本', /^\d{4}-\d{1,2}-\d{1,2}\|1$/.test(await ev("localStorage.getItem('naiwa_rouge_notice_v1') || ''")),
      String(await ev("localStorage.getItem('naiwa_rouge_notice_v1') || ''")));
    await send('Page.reload', { ignoreCache: false });
    await waitFor("document.getElementById('loading').style.display === 'none'", 150000, '刷新后加载完成');
    await sleep(2000);
    ok('同一天再进来不再自动弹', (await ev("document.getElementById('noticeOv').classList.contains('on')")) === false);
    ok('主菜单「📢 公告」按钮在', await ev("!!document.getElementById('btnNotice')"));
    await ev("document.getElementById('btnNotice').click()");
    await sleep(400);
    ok('点按钮仍能强制回看', await ev("document.getElementById('noticeOv').classList.contains('on')"));
    ok('强制回看时不勾选', (await ev("document.getElementById('noticeHideToday').checked")) === false);

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
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* 留给系统清理 */ }
  }
})();
