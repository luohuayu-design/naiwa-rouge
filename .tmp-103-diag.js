// 第 103 块诊断：兑换之后「已兑换」列表为什么不显示建群大典
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，后台），再 `node .tmp-103-diag.js`
// 只诊断不改代码：把两种场景都跑一遍，看是「一条都没有」还是「有但被截断」。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-103');
const KEY = 'naiwa_rouge_profile_v1';
// ⚠️ 明文码不写进本文件（.tmp-* 是被 git 跟踪的）：从 gitignore 的 gift-codes.local.md 读
const LOCAL_TXT = fs.existsSync(path.join(__dirname, 'gift-codes.local.md'))
  ? fs.readFileSync(path.join(__dirname, 'gift-codes.local.md'), 'utf8') : '';
const CODE = (LOCAL_TXT.match(/\|\s*\d+\s*\|\s*`([A-Z][A-Z0-9-]{6,})`\s*\|\s*888\s*\|/) || [, ''])[1];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  if (!CODE) { console.error('gift-codes.local.md 里没读到 888 那枚码，没法跑'); process.exit(2); }
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
    // 读「已兑换」列表的真实 DOM 状态
    async function readLog() {
      return await ev(`(() => {
        const box = document.getElementById('giftLog');
        if (!box) return { missing: true };
        const rows = [...box.querySelectorAll('.gf-row')].map((r) => ({
          tier: r.querySelector('.gf-tier') ? r.querySelector('.gf-tier').textContent : '',
          when: r.querySelector('.gf-when') ? r.querySelector('.gf-when').textContent : '',
        }));
        const cs = getComputedStyle(box);
        return {
          cls: box.className,
          display: cs.display,
          childCount: box.children.length,
          head: box.querySelector('h4') ? box.querySelector('h4').textContent : '',
          rows,
          text: box.innerText.replace(/\\n/g, ' | '),
        };
      })()`);
    }

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n========== 场景 A：全新档（0 条记录）==========');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await ev(`localStorage.clear()`);
    await send('Page.navigate', { url: PAGE + '&_r=a' });
    await sleep(1200);
    await waitFor('!!window.__game', 90000, '__game 重新就绪');
    await ev('window.__game.gift.open()');
    await sleep(600);
    console.log('  --- 兑换前 ---');
    console.log('  log 数据:', JSON.stringify(await ev('window.__game.gift.log()')));
    console.log('  DOM:', JSON.stringify(await readLog()));
    const msgA = await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(700);
    console.log('  兑换提示:', msgA);
    console.log('  log 数据:', JSON.stringify(await ev('window.__game.gift.log()')));
    const domA = await readLog();
    console.log('  DOM:', JSON.stringify(domA));

    console.log('\n========== 场景 B：本机已有 8 条记录，再兑第 9 个 =========');
    // 预置 8 条「很早以前兑的」真哈希（用码表里的，这样能查出组名）
    await ev(`(() => {
      const KEY = ${JSON.stringify(KEY)};
      const p = JSON.parse(localStorage.getItem(KEY) || '{}');
      const now = Date.now();
      p.gifts = {};
      const old = ['440f992b263512b7','cb1f955cfe39c2dc','d9a249fe405cd87e','43b38aeb4c9b8017',
                   '93d621226fb5ba5a','7b18142b9b851237','071773cb8ba48d37','88bd8a1a8aff9442'];
      old.forEach((h, i) => { p.gifts[h] = now - (8 - i) * 100000; });
      localStorage.setItem(KEY, JSON.stringify(p));
      return Object.keys(p.gifts).length;
    })()`);
    await send('Page.navigate', { url: PAGE + '&_r=b' });
    await sleep(1200);
    await waitFor('!!window.__game', 90000, '__game 重新就绪');
    await ev('window.__game.gift.open()');
    await sleep(600);
    console.log('  --- 兑换前（应该 8 条）---');
    console.log('  log 条数:', Object.keys(await ev('window.__game.gift.log()')).length);
    console.log('  DOM:', JSON.stringify(await readLog()));
    const msgB = await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(700);
    console.log('  兑换提示:', msgB);
    const logB = await ev('window.__game.gift.log()');
    console.log('  log 条数（应该 9）:', Object.keys(logB).length);
    const domB = await readLog();
    console.log('  DOM 行数:', domB.rows.length, '| 标题:', domB.head);
    console.log('  DOM 行内容:', JSON.stringify(domB.rows));
    console.log('  列表里有「建群大典」吗?', /建群大典/.test(domB.text));

    console.log('\n========== 结论素材 =========');
    console.log('场景 A（首兑）列表行数 =', domA.rows.length, '| 文案 =', JSON.stringify(domA.rows.map((r) => r.tier)));
    console.log('场景 B（第 9 次）列表行数 =', domB.rows.length, '| 文案 =', JSON.stringify(domB.rows.map((r) => r.tier)));
  } finally {
    if (ws) try { ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
