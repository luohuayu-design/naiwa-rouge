// 第 102 块 CDP 回归：公告里的 QQ 群号 + 一键复制
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，后台），再 `node .tmp-102-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
// 断言口径：
//   · 真浏览器、真点击，不打桩判断「复制成功了没」—— 把 navigator.clipboard.writeText
//     换成记录器，直接看有没有把**群号**写进去（不依赖无头环境有没有剪贴板权限）。
//   · 手机尺寸（375×812）下这一行要真的看得见、不溢出。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-102');
const GROUP = '1132440548';

let pass = 0, fail = 0;
const fails = [];
// 注意签名是 ok(name, cond, extra) —— 别的老套件是 ok(cond, name)，两种都见过，别写反
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2',
    '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--user-data-dir=' + UD,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await httpJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, 'PUT');
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
      if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
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

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n[1] 打开公告');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    // 「进主界面自动弹」由 block45 覆盖；这里只关心内容，直接强制打开
    await ev('window.__game.notice.show(true)');
    await waitFor("document.getElementById('noticeOv').classList.contains('on')", 15000, '公告打开');
    ok('公告弹窗打开', await ev("document.getElementById('noticeOv').classList.contains('on')"));
    ok('公告版本是 3（改过内容就该 +1）', (await ev("window.__game.notice && window.__game.notice.ver && window.__game.notice.ver()")) === '3',
      String(await ev("window.__game.notice && window.__game.notice.ver ? window.__game.notice.ver() : ''")));

    console.log('\n[2] 群号看得见（手机尺寸 375×812）');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    const rowInfo = await ev(`(() => {
      const rows = [...document.querySelectorAll('#noticeOv .cp-row')];
      const row = rows.find((r) => r.textContent.includes(${JSON.stringify(GROUP)}));
      if (!row) return null;
      const val = row.querySelector('.cp-val');
      const btn = row.querySelector('.notice-copy');
      const box = row.getBoundingClientRect();
      const cs = getComputedStyle(row);
      const vcs = getComputedStyle(val);
      return {
        n: rows.length,
        text: val.textContent.trim(),
        copy: btn ? btn.dataset.copy : '',
        vis: cs.visibility + '/' + vcs.visibility,
        w: Math.round(box.width), h: Math.round(box.height),
        top: Math.round(box.top),
        vw: innerWidth, vh: innerHeight,
        color: vcs.color,
        inScroll: !!row.closest('.notice-bd'),
      };
    })()`);
    ok('公告里找得到写着群号的那一行', !!rowInfo);
    ok('这一行显示的就是群号', rowInfo && rowInfo.text === GROUP, rowInfo && rowInfo.text);
    ok('复制按钮的 data-copy 也是群号', rowInfo && rowInfo.copy === GROUP, rowInfo && rowInfo.copy);
    ok('没有靠 visibility 藏起来（真的可见）', rowInfo && rowInfo.vis !== 'hidden/hidden', rowInfo && rowInfo.vis);
    ok('这一行有实际尺寸（不是塌成 0）', rowInfo && rowInfo.w > 0 && rowInfo.h > 0, rowInfo && `${rowInfo.w}×${rowInfo.h}`);
    ok('在 375 宽度下不横向溢出', rowInfo && rowInfo.w <= rowInfo.vw, rowInfo && `${rowInfo.w} / ${rowInfo.vw}`);
    ok('公告里三行联系方式都在', rowInfo && rowInfo.n === 3, rowInfo && String(rowInfo.n));

    console.log('\n[3] 一键复制：点了真的把群号写进剪贴板');
    // 打桩记录 writeText 的入参（无头环境没剪贴板权限，读回不可靠）
    await ev(`(() => {
      window.__copied = null;
      const fake = { writeText: async (t) => { window.__copied = t; }, readText: async () => window.__copied || '' };
      try { Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true }); }
      catch (_) { navigator.clipboard.writeText = fake.writeText; }
      return true;
    })()`);
    await ev(`(() => {
      const b = [...document.querySelectorAll('#noticeOv .notice-copy')].find((x) => x.dataset.copy === ${JSON.stringify(GROUP)});
      b.click();
      return true;
    })()`);
    await waitFor('window.__copied !== null', 5000, '写入剪贴板');
    ok('点复制后 writeText 收到的就是群号', (await ev('window.__copied')) === GROUP, String(await ev('window.__copied')));
    await waitFor(`[...document.querySelectorAll('#noticeOv .notice-copy')].some((b) => /已复制/.test(b.textContent))`, 4000, '按钮变成已复制');
    ok('按钮给了「已复制」的反馈', /已复制/.test(await ev(`([...document.querySelectorAll('#noticeOv .notice-copy')].find((b) => b.dataset.copy === ${JSON.stringify(GROUP)}) || {}).textContent || ''`)));
    ok('按钮文案会自己变回来（1.6s 后）', await (async () => {
      await sleep(2200);
      return ev(`[...document.querySelectorAll('#noticeOv .notice-copy')].every((b) => !/已复制|复制失败/.test(b.textContent))`);
    })());
    ok('复制成功后点了没影响公告（还开着）', await ev("document.getElementById('noticeOv').classList.contains('on')"));

    console.log('\n[4] 宣传有礼那一份也能复制');
    await ev("document.getElementById('noticeOk').click()");
    // 「公告 → 签到 → 宣传有礼」350ms 定时器链的衔接由 block57/block59 覆盖，
    // 这里直接强制打开，只验群号与复制
    await sleep(400);
    await ev('window.__game.promo.show(true, false)');
    await waitFor("document.getElementById('promoOv').classList.contains('on')", 15000, '宣传有礼上场');
    const promoRow = await ev(`(() => {
      const row = [...document.querySelectorAll('#promoOv .cp-row')].find((r) => r.textContent.includes(${JSON.stringify(GROUP)}));
      return row ? { text: row.querySelector('.cp-val').textContent.trim(), copy: row.querySelector('.notice-copy').dataset.copy } : null;
    })()`);
    ok('宣传有礼里也列着群号', !!promoRow && promoRow.text === GROUP, JSON.stringify(promoRow));
    await ev(`(() => {
      const b = [...document.querySelectorAll('#promoOv .notice-copy')].find((x) => x.dataset.copy === ${JSON.stringify(GROUP)});
      b.click(); return true;
    })()`);
    await waitFor(`window.__copied === ${JSON.stringify(GROUP)}`, 5000, '宣传有礼里复制群号');
    ok('宣传有礼的复制按钮同样把群号写进剪贴板', (await ev('window.__copied')) === GROUP);

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
