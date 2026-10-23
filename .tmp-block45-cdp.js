// 第 45 块 CDP 回归：公告弹窗（照搬 naiwa-step）+ 一键复制 + 主菜单入口
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block45-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const PAGE_PLAIN = 'http://127.0.0.1:8124/';     // 无 debug：验证「进主界面自动弹」
const UD = path.join(os.tmpdir(), 'naiwa-cdp-45');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
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
    const isOn = (sel) => `document.getElementById(${q(sel)}).classList.contains('on')`;

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n[1] 结构与入口');
    await waitFor('!!window.__game', 90000, '__game 就绪（SwiftShader 较慢）');
    ok('公告浮层在 DOM 里', await ev("!!document.getElementById('noticeOv')"));
    ok('初始不显示', (await ev(isOn('noticeOv'))) === false);
    ok('主菜单有公告按钮', await ev("!!document.getElementById('btnNotice')"));
    ok('按钮文案带「公告」', /公告/.test(await ev("document.getElementById('btnNotice').textContent")));
    ok('调试模式不自动弹（不挡自动化）', (await ev('window.__game.notice.open()')) === false);
    ok('清掉历史记录', (await ev('window.__game.notice.clear(), localStorage.getItem("naiwa_rouge_notice_v1")')) === null);

    console.log('\n[2] 内容：建议/bug 换礼包码 + QQ + 网址');
    await ev('window.__game.notice.show(true)');
    await sleep(120);
    ok('强制打开后可见', await ev(isOn('noticeOv')));
    ok('aria-hidden 跟着变', (await ev("document.getElementById('noticeOv').getAttribute('aria-hidden')")) === 'false');
    const body = await ev("document.getElementById('noticeOv').textContent");
    ok('提到「建议」', /建议/.test(body));
    ok('提到「bug」', /bug/i.test(body));
    ok('写明有礼包兑换码奖励', /礼包兑换码/.test(body));
    ok('写明 A/B 类骨币数（300 / 100）', /300/.test(body) && /100/.test(body));
    ok('写明在「礼包兑换」里换', /礼包兑换/.test(body));
    ok('有本人 QQ 号 3829845261', /3829845261/.test(body));
    ok('有落花雨署名', /落花雨/.test(body));
    ok('有本站网址', /luohuayu-design\.github\.io\/naiwa-rouge/.test(body));
    ok('有「今日内不再弹出」勾选框', await ev("!!document.getElementById('noticeHideToday')"));
    ok('勾选框文案对得上', /今日内不再弹出/.test(await ev("document.querySelector('.notice-chk').textContent")));
    ok('两条复制按钮', (await ev("document.querySelectorAll('#noticeOv .notice-copy').length")) === 2);
    ok('QQ 复制按钮 data-copy 正确', (await ev("document.querySelectorAll('#noticeOv .notice-copy')[0].dataset.copy")) === '3829845261');
    ok('网址复制按钮 data-copy 正确',
      (await ev("document.querySelectorAll('#noticeOv .notice-copy')[1].dataset.copy")) === 'https://luohuayu-design.github.io/naiwa-rouge/');
    ok('正文可选中（手机上能长按复制）',
      (await ev("getComputedStyle(document.querySelector('.notice-bd')).userSelect")) !== 'none');

    console.log('\n[3] 一键复制');
    // headless 默认没有剪贴板权限（真机上用户点击是真实手势，不会被拦），先授权再测
    try {
      await send('Browser.grantPermissions', {
        origin: 'http://127.0.0.1:8124',
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      });
      await send('Page.bringToFront');
    } catch (_) { /* 老 Chrome 不认这个域就算了 */ }
    ok('copyText 能复制（clipboard 或 execCommand 兜底）', (await ev("window.__game.notice.copy('3829845261')")) === true);
    ok('剪贴板里确实写进了 QQ 号',
      (await ev("navigator.clipboard.readText().catch(() => '')")) === '3829845261',
      String(await ev("navigator.clipboard.readText().catch(() => '')")));
    const copyBtnSel = "document.querySelectorAll('#noticeOv .notice-copy')[0]";
    const before = await ev(`${copyBtnSel}.textContent`);
    await ev(`${copyBtnSel}.click()`);
    await sleep(250);
    const after = await ev(`${copyBtnSel}.textContent`);
    ok('点复制后按钮文案变了', after !== before, `${before} → ${after}`);
    ok('文案是成功/失败态之一', /已复制|复制失败/.test(after), after);
    await sleep(1700);
    ok('1.6 秒后文案还原', (await ev(`${copyBtnSel}.textContent`)) === before,
      String(await ev(`${copyBtnSel}.textContent`)));

    console.log('\n[4] 不勾选时关掉 → 下次还弹');
    await ev("document.getElementById('noticeX').click()");
    await sleep(150);
    ok('✕ 能关掉', (await ev(isOn('noticeOv'))) === false);
    ok('没写「今日不再弹」记录', (await ev('window.__game.notice.key()')) === '');
    ok('再打开时还会弹（show(false) = true）', (await ev('window.__game.notice.show(false)')) === true);
    ok('确实弹出来了', await ev(isOn('noticeOv')));

    console.log('\n[5] 勾选「今日内不再弹出」');
    await ev("document.getElementById('noticeHideToday').checked = true");
    await ev("document.getElementById('noticeOk').click()");
    await sleep(150);
    ok('「我知道了」能关掉', (await ev(isOn('noticeOv'))) === false);
    const keyStr = await ev('window.__game.notice.key()');
    ok('写下了「日期|版本」记录', /^\d{4}-\d{1,2}-\d{1,2}\|\d+$/.test(keyStr || ''), String(keyStr));   // 版本号写死会过期（v=61 教训：NOTICE_VER 已到 2）
    ok('当天再进不再弹', (await ev('window.__game.notice.show(false)')) === false);
    ok('确实没弹', (await ev(isOn('noticeOv'))) === false);
    ok('主菜单点「公告」仍能强制看', (await ev('window.__game.notice.show(true)')) === true);
    ok('强制打开成功', await ev(isOn('noticeOv')));
    await ev("document.getElementById('noticeOk').click()");
    await sleep(120);

    console.log('\n[6] 公告版本号一换，今天勾过的人也要重看');
    // 手动把记录改成旧版本号
    await ev("localStorage.setItem('naiwa_rouge_notice_v1', localStorage.getItem('naiwa_rouge_notice_v1').replace(/\\|\\d+$/, '|0'))");
    ok('旧版本的记录不算数', (await ev('window.__game.notice.show(false)')) === true);
    ok('旧版本会重新弹', await ev(isOn('noticeOv')));
    await ev("document.getElementById('noticeX').click()");
    await sleep(120);

    console.log('\n[7] 刷新后记录还在');
    await ev('window.__game.notice.show(true)');
    await ev("document.getElementById('noticeHideToday').checked = true");
    await ev("document.getElementById('noticeOk').click()");
    await sleep(150);
    const keyBefore = await ev('window.__game.notice.key()');
    await send('Page.navigate', { url: PAGE });
    await waitFor('!!window.__game', 90000, '刷新后 __game 就绪');
    await sleep(300);
    ok('刷新后记录还在', (await ev('window.__game.notice.key()')) === keyBefore);
    ok('刷新后当天不再自动弹', (await ev('window.__game.notice.show(false)')) === false);

    console.log('\n[8] 重置进度会清掉公告记录');
    await ev('window.__game.ui.reset()');
    await sleep(200);
    ok('重置后没有公告记录', (await ev('window.__game.notice.key()')) === '');
    ok('重置后会重新弹', (await ev('window.__game.notice.show(false)')) === true);
    await ev("document.getElementById('noticeX').click()");
    await sleep(120);

    console.log('\n[9] 正常模式：进主界面后自动弹');
    await send('Page.navigate', { url: PAGE_PLAIN });
    await waitFor(isOn('noticeOv'), 120000, '公告自动弹出（正常模式）');
    ok('正常模式进主界面自动弹公告', await ev(isOn('noticeOv')));
    ok('自动弹出时标题页在背后', await ev("!!document.getElementById('titleScr')"));
    ok('自动弹出时没勾选', (await ev("document.getElementById('noticeHideToday').checked")) === false);
    ok('没有 __game 钩子（正常游玩不暴露）', (await ev('typeof window.__game')) === 'undefined');
    // 勾「今日不再弹」再刷新 → 不该再自动弹
    await ev("document.getElementById('noticeHideToday').checked = true");
    await ev("document.getElementById('noticeOk').click()");
    await sleep(150);
    ok('勾选后关掉', (await ev(isOn('noticeOv'))) === false);
    await send('Page.navigate', { url: PAGE_PLAIN });
    await waitFor("document.getElementById('loading').style.display === 'none'", 120000, '第二次进主界面加载完');
    await sleep(1500);
    ok('同一天第二次进来不再自动弹', (await ev(isOn('noticeOv'))) === false);

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
