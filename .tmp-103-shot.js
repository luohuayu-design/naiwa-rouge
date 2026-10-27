// 第 103 块 · 视觉检查：礼包页「已兑换」列表（手机尺寸 375×812）
// 场景：本机已有 7 条老记录 → 兑建群大典 → 列表第一行就是它，共 8 条。
// 跑法：先起 8124 静态服务，再 `node .tmp-103-shot.js`；图片写到系统临时目录（路径不能含中文）
// ⚠️ 明文码不写进本文件，从 gitignore 的 gift-codes.local.md 读。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-103s');
const OUT = process.env.NAIWA_SHOT_DIR || os.tmpdir();
const KEY = 'naiwa_rouge_profile_v1';
const LOCAL_TXT = fs.existsSync(path.join(__dirname, 'gift-codes.local.md'))
  ? fs.readFileSync(path.join(__dirname, 'gift-codes.local.md'), 'utf8') : '';
const CODE = (LOCAL_TXT.match(/\|\s*\d+\s*\|\s*`([A-Z][A-Z0-9-]{6,})`\s*\|\s*888\s*\|/) || [, ''])[1];
const OLD = ['440f992b263512b7', 'cb1f955cfe39c2dc', 'd9a249fe405cd87e', '43b38aeb4c9b8017',
  '93d621226fb5ba5a', '071773cb8ba48d37', '88bd8a1a8aff9442'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  if (!CODE) { console.error('gift-codes.local.md 里没读到 888 那枚码'); process.exit(2); }
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
      try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('调试端口没起来');
    const t = await httpJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, 'PUT');
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    };
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const waitFor = async (expr, ms = 90000, label = expr) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('超时: ' + label);
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const p = path.join(OUT, name);
      fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
      console.log('saved ' + p);
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

    // 先给 7 条「以前兑过的」，再兑建群大典 → 正好 8 条，一眼看到最新那条在最上面
    await ev(`(() => {
      const KEY = ${JSON.stringify(KEY)};
      const p = JSON.parse(localStorage.getItem(KEY) || '{}');
      const now = Date.now();
      p.gifts = {};
      ${JSON.stringify(OLD)}.forEach((h, i) => { p.gifts[h] = now - (8 - i) * 600000; });
      localStorage.setItem(KEY, JSON.stringify(p));
      return Object.keys(p.gifts).length;
    })()`);
    await send('Page.navigate', { url: PAGE + '&_r=shot' });
    await sleep(1200);
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await ev('window.__game.gift.open()');
    await sleep(400);
    await shot('naiwa-103-gift-before.png');

    await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(700);
    await shot('naiwa-103-gift-after.png');
    console.log('列表文案:', await ev("document.getElementById('giftLog').innerText.replace(/\\n/g,' | ')"));
  } finally {
    if (ws) try { ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
