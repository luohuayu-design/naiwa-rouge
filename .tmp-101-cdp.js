// 第 101 块 CDP 回归：兑换码「建群大典」（888 骨币）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，后台），再 `node .tmp-101-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
// ⚠️ 明文码不写进本文件（.tmp-* 是被 git 跟踪的）：从 gitignore 的 gift-codes.local.md 读，
//    和 .tmp-block44-cdp.js 同一个约定。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-101');
const LOCAL_MD = path.join(__dirname, 'gift-codes.local.md');
const LOCAL_TXT = fs.existsSync(LOCAL_MD) ? fs.readFileSync(LOCAL_MD, 'utf8') : '';
const CODE = (LOCAL_TXT.match(/\|\s*\d+\s*\|\s*`([A-Z][A-Z0-9-]{6,})`\s*\|\s*888\s*\|/) || [, ''])[1];

let pass = 0, fail = 0;
const fails = [];
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
    const q = (s) => JSON.stringify(s);

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n[1] 码表');
    await waitFor('!!window.__game', 90000, '__game 就绪（SwiftShader 较慢）');
    ok('码表 51 条', await ev('window.__game.gift.count') === 51, String(await ev('window.__game.gift.count')));
    ok('新码在页面里查得到（说明加载的是含它的 gift.js）', !!(await ev(`window.__game.gift.lookup(${q(CODE)})`)));

    console.log('\n[2] 打开兑换页');
    const baseBones = await ev('window.__game.gift.bones()');
    ok('初始骨币是数字', typeof baseBones === 'number', String(baseBones));
    await ev('window.__game.gift.open()');
    await sleep(200);
    ok('礼包页打开', await ev("document.getElementById('giftScr').classList.contains('on')"));
    ok('输入框为空', await ev("document.getElementById('giftCode').value === ''"));

    console.log('\n[3] 脏输入也能兑（小写 + 空格）');
    const messy = ' ' + CODE.split('-').join(' ').toLowerCase() + ' ';
    const msg = await ev(`window.__game.gift.redeem(${q(messy)})`);
    await sleep(150);
    ok('兑换成功', /兑换成功/.test(msg), msg);
    ok('提示写的是组名「建群大典」', /建群大典/.test(msg), msg);
    ok('提示写 +888 骨币', /888/.test(msg), msg);
    ok('提示里没有「A 类礼包」（说明走的是组名分支）', !/A 类/.test(msg), msg);
    ok('骨币 +888', await ev('window.__game.gift.bones()') === baseBones + 888, String(await ev('window.__game.gift.bones()')));
    ok('成功态是亮字', await ev("document.getElementById('giftMsg').classList.contains('ok')"));
    ok('输入框已清空', await ev("document.getElementById('giftCode').value === ''"));
    ok('页面骨币同步', await ev("document.getElementById('giftBoneNum').textContent") === String(baseBones + 888));
    const msTxt = await ev("document.getElementById('msBadge').textContent");
    ok('主菜单商店角标同步（renderCampBadge → renderShopBadge → #msBadge）', msTxt === String(baseBones + 888), `页面 ${msTxt} / 期望 ${baseBones + 888}`);
    ok('已兑换列表出现', await ev("document.getElementById('giftLog').classList.contains('on')"));
    ok('列表里写「建群大典」', /建群大典/.test(await ev("document.getElementById('giftLog').textContent")));

    console.log('\n[4] 同一个码第二次被拦');
    const msg2 = await ev(`window.__game.gift.redeem(${q(CODE)})`);
    await sleep(150);
    ok('第二次提示已经用过', /已经用过/.test(msg2), msg2);
    ok('骨币不再增加', await ev('window.__game.gift.bones()') === baseBones + 888);
    ok('已兑换列表还是 1 条', Object.keys(await ev('window.__game.gift.log()')).length === 1);

    console.log('\n[5] 刷新后记录还在');
    await send('Page.navigate', { url: PAGE });
    await waitFor('!!window.__game', 90000, '刷新后 __game 就绪');
    await sleep(400);
    ok('刷新后骨币还是 +888', await ev('window.__game.gift.bones()') === baseBones + 888, String(await ev('window.__game.gift.bones()')));
    ok('刷新后记录还在（1 条）', Object.keys(await ev('window.__game.gift.log()')).length === 1);
    const msg3 = await ev(`window.__game.gift.redeem(${q(CODE)})`);
    await sleep(150);
    ok('刷新后仍被拦', /已经用过/.test(msg3), msg3);

    console.log('\n[6] 查询接口');
    ok('lookup 认得码', !!(await ev(`window.__game.gift.lookup(${q(CODE)})`)));
    ok('lookup 返回 888', (await ev(`window.__game.gift.lookup(${q(CODE)}).bones`)) === 888);
    ok('lookup 返回组名', (await ev(`window.__game.gift.lookup(${q(CODE)}).name`)) === '建群大典');
    ok('长得像但不是的码认不出', await ev(`window.__game.gift.lookup(${q(CODE.slice(0, -1) + 'Z')}) === null`));

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
