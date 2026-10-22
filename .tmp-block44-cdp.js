// 第 44 块 CDP 回归：主菜单「礼包兑换」
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block44-cdp.js`
// 明文码从 gift-codes.local.md 读（gitignore，不进仓库）；本文件里不写任何真码。
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-44');
const LOCAL = path.join(__dirname, 'gift-codes.local.md');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 从本地档里取一批真码（表格行才认）
function readCodes() {
  if (!fs.existsSync(LOCAL)) return null;
  const txt = fs.readFileSync(LOCAL, 'utf8');
  const rows = [...txt.matchAll(/^\|\s*\d+\s*\|\s*`(N[AB]-[A-Z0-9]{4}-[A-Z0-9]{4})`/gm)].map((m) => m[1]);
  return {
    a: rows.filter((c) => c.startsWith('NA-')),
    b: rows.filter((c) => c.startsWith('NB-')),
  };
}

async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  const codes = readCodes();
  if (!codes || codes.a.length < 2 || codes.b.length < 1) {
    console.error('缺少 gift-codes.local.md 或码数不足，没法跑');
    process.exit(2);
  }

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
    const q = (s) => JSON.stringify(s);

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n[1] 启动与主菜单入口');
    await waitFor('!!window.__game', 90000, '__game 就绪（SwiftShader 较慢）');
    ok('码表里共 20 个礼包', await ev('window.__game.gift.count') === 20);
    ok('主菜单有「礼包兑换」按钮', await ev("!!document.getElementById('btnGift')"));
    ok('按钮文案是礼包兑换', await ev("document.getElementById('btnGift').textContent.trim()") === '礼包兑换');
    const baseBones = await ev('window.__game.gift.bones()');
    ok('初始骨币读得到（数字）', typeof baseBones === 'number', String(baseBones));

    console.log('\n[2] 打开兑换页');
    await ev('window.__game.gift.open()');
    await sleep(150);
    ok('礼包页打开', await ev("document.getElementById('giftScr').classList.contains('on')"));
    ok('页面骨币显示当前值', await ev("document.getElementById('giftBoneNum').textContent") === String(baseBones));
    ok('输入框存在且为空', await ev("document.getElementById('giftCode').value === ''"));
    ok('已兑换列表初始隐藏', await ev("!document.getElementById('giftLog').classList.contains('on')"));

    console.log('\n[3] 空输入 / 假码都被拦');
    await ev('window.__game.gift.redeem("")');
    await sleep(80);
    ok('空输入提示「先把手里的礼包码填进去」', /先把手里的礼包码填进去/.test(await ev("document.getElementById('giftMsg').textContent")));
    ok('空输入不动骨币', await ev('window.__game.gift.bones()') === baseBones);
    await ev('window.__game.gift.redeem("ZZ-ABCD-2345")');
    await sleep(80);
    ok('假码提示「没有这个礼包码」', /没有这个礼包码/.test(await ev("document.getElementById('giftMsg').textContent")));
    ok('假码不进已兑换列表', Object.keys(await ev('window.__game.gift.log()')).length === 0);
    ok('错误提示是红字态', await ev("document.getElementById('giftMsg').classList.contains('err')"));

    console.log('\n[4] A 类真码：+300 骨币');
    // 故意用小写 + 空格，验证归一化
    const aCode = codes.a[0];
    const aMessy = ' ' + aCode.replace(/-/g, ' ').toLowerCase() + ' ';
    const msgA = await ev(`window.__game.gift.redeem(${q(aMessy)})`);
    await sleep(120);
    ok('小写无横杠也能兑', /兑换成功/.test(msgA), msgA);
    ok('提示写明 A 类 +300', /A 类/.test(msgA) && /300/.test(msgA), msgA);
    ok('骨币 +300', await ev('window.__game.gift.bones()') === baseBones + 300,
      String(await ev('window.__game.gift.bones()')));
    ok('成功提示是亮字态', await ev("document.getElementById('giftMsg').classList.contains('ok')"));
    ok('输入框已清空', await ev("document.getElementById('giftCode').value === ''"));
    ok('页面骨币同步更新', await ev("document.getElementById('giftBoneNum').textContent") === String(baseBones + 300));
    ok('主菜单篝火角标同步', await ev("document.getElementById('campBoneNum').textContent") === String(baseBones + 300));
    ok('已兑换列表出现', await ev("document.getElementById('giftLog').classList.contains('on')"));
    ok('列表写「A 类 · +300 骨币」', /A 类 · \+300 骨币/.test(await ev("document.getElementById('giftLog').textContent")));

    console.log('\n[5] 同一个码第二次被拦');
    const msgAgain = await ev(`window.__game.gift.redeem(${q(aCode)})`);
    await sleep(120);
    ok('第二次提示已经用过', /已经用过/.test(msgAgain), msgAgain);
    ok('骨币不再增加', await ev('window.__game.gift.bones()') === baseBones + 300);
    ok('已兑换列表还是 1 条', Object.keys(await ev('window.__game.gift.log()')).length === 1);

    console.log('\n[6] B 类真码：+100 骨币');
    const msgB = await ev(`window.__game.gift.redeem(${q(codes.b[0])})`);
    await sleep(120);
    ok('B 类兑换成功', /兑换成功/.test(msgB), msgB);
    ok('B 类 +100', await ev('window.__game.gift.bones()') === baseBones + 400,
      String(await ev('window.__game.gift.bones()')));
    ok('已兑换列表 2 条', Object.keys(await ev('window.__game.gift.log()')).length === 2);
    ok('列表出现 B 类蓝色标', await ev("!!document.querySelector('#giftLog .gf-tier.b')"));

    console.log('\n[7] 关掉页面 / 刷新后记录还在');
    await ev("document.getElementById('giftBack').click()");
    await sleep(150);
    ok('返回键关掉礼包页', await ev("!document.getElementById('giftScr').classList.contains('on')"));
    await send('Page.navigate', { url: PAGE });
    await waitFor('!!window.__game', 90000, '刷新后 __game 就绪');
    await sleep(300);
    ok('刷新后骨币还是 +400', await ev('window.__game.gift.bones()') === baseBones + 400,
      String(await ev('window.__game.gift.bones()')));
    ok('刷新后已兑换记录还是 2 条', Object.keys(await ev('window.__game.gift.log()')).length === 2);
    const msgAfterReload = await ev(`window.__game.gift.redeem(${q(codes.a[1])})`);
    await sleep(120);
    ok('换一个没用的 A 码仍然能兑', /兑换成功/.test(msgAfterReload), msgAfterReload);
    const msgOld = await ev(`window.__game.gift.redeem(${q(aCode)})`);
    await sleep(120);
    ok('刷新后用过的码依然被拦', /已经用过/.test(msgOld), msgOld);

    console.log('\n[8] 大小写 / 横杠兼容性（同一台机器）');
    ok('查询接口认得脏输入', await ev(`!!window.__game.gift.lookup(${q(' ' + codes.a[0].toLowerCase() + ' ')})`));
    ok('查询接口不认假码', await ev(`window.__game.gift.lookup('ZZ-ABCD-2345') === null`));

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
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* 浏览器还没完全退出，临时目录留给系统清理 */ }
  }
})();
