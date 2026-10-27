// 第 104 块 CDP 回归：删掉「分享文件」+ 导出文件在「会跳 App」的环境里也要真下载
//
// 用户三条：
//   ① 云端短码存档不要了（不做）
//   ② 「导出文件和分享文件一个效果啊，删掉分享文件好了」
//   ③ 「导出文件之后，QQ 浏览器下载，跳转到 QQ 浏览器并没有自动下载」
//
// ③ 的两个根因（这套就是钉它们的）：
//   a. 文件名原来是中文「蛙步夜行-存档-20261027-2215.json」—— 安卓下载管理器对
//      URL 编码后的中文名处理不一致，最坏是「点了完全没反应」；
//   b. 链接原来是 blob: —— 微信 / QQ 内嵌内核把链接**移交给 QQ 浏览器**去开时，
//      blob: 只活在发起它的页面进程里，移交后就是死链：跳过去了、不下载。
//      会被移交的内核（MicroMessenger / MQQBrowser / QQ/x / X5 / ; wv)）改走自包含的 data:。
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，后台），再 `node .tmp-104-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const BASE = 'http://127.0.0.1:8124/';
const PAGE = BASE + '?debug=1';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-104');
const OUT = path.join(os.tmpdir(), 'naiwa-104-dl-' + process.pid);

const UA_WECHAT = 'Mozilla/5.0 (Linux; Android 13; PGT-AN10 Build/TP1A.220905.001; wv) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Version/4.0 Chrome/111.0.0.0 Mobile Safari/537.36 '
  + 'MicroMessenger/8.0.42.2460(0x28002A3B) WeChat/arm64';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let pass = 0, fail = 0;
const fails = [];
// ⚠️ 本套签名是 ok(cond, name, extra)。
//    第 104 块自己踩过一次：辅助函数写成 ok(name, cond) 而调用写成 ok(cond, '文案')，
//    结果 cond 是「非空字符串」→ 27 条**全部假绿**（日志里全是 `ok true`）。
//    看到日志里 ok 后面跟着 true / false 而不是中文，就是签名串味了。
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}
const lsJson = () => fs.readdirSync(OUT).filter((f) => f.endsWith('.json'));
function clearOut() {
  for (const f of fs.readdirSync(OUT)) { try { fs.rmSync(path.join(OUT, f), { force: true }); } catch (_) {} }
}

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

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
    // 抓住「点了哪个 a、href 是什么协议、download 叫什么」—— 这是判断走 blob: 还是 data: 的唯一口子
    const HOOK = `(() => {
      if (window.__hookOn) return true;
      window.__hookOn = true;
      window.__dl = [];
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag) {
        const el = origCreate(tag);
        if (String(tag).toLowerCase() === 'a') {
          const oc = el.click.bind(el);
          el.click = function () {
            const h = el.getAttribute('href') || '';
            window.__dl.push({
              scheme: h.slice(0, 22),
              len: h.length,
              name: el.getAttribute('download') || '',
            });
            return oc();
          };
        }
        return el;
      };
      return true;
    })()`;

    async function openSettings() {
      await waitFor('!!window.__game', 90000, '__game 就绪');
      await ev('window.__game.ui.showSettings()');
      await waitFor(`document.getElementById('setScr').classList.contains('on')`, 15000, '设置页打开');
      await sleep(300);
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    for (const m of ['Browser.setDownloadBehavior', 'Page.setDownloadBehavior']) {
      try { await send(m, { behavior: 'allow', downloadPath: OUT, eventsEnabled: true }); } catch (_) { /* 版本差异 */ }
    }

    // ============================================================
    console.log('\n[A] 存档区只剩四颗按钮，分享文件彻底没了');
    // ============================================================
    await openSettings();
    const ids = await ev(`[...document.querySelectorAll('.set-io-btns button')].map((b) => b.id)`);
    ok(JSON.stringify(ids) === JSON.stringify(['ioExportFile', 'ioExportCode', 'ioImportFile', 'ioImportCode']),
      '四颗按钮 = 导出文件 / 复制存档码 / 导入文件 / 粘贴存档码', JSON.stringify(ids));
    ok(await ev(`document.getElementById('ioShareFile') === null`), '#ioShareFile 元素不存在（点了不会报 null）');
    const tip = await ev(`document.querySelector('.set-io-tip').textContent`);
    ok(!/分享文件/.test(tip), '说明文字里不再提「分享文件」', tip.slice(0, 40));
    ok(!/分段/.test(tip), '说明文字里不再提「分段」');
    ok(/手动保存/.test(tip), '说明文字告诉玩家「没动静就手动保存」');
    const rows0 = await ev(`document.getElementById('ioSaveRow').hidden`);
    ok(rows0 === true, '兜底行默认是收起的（不点导出就不打扰）', String(rows0));

    // ============================================================
    console.log('\n[B] 桌面 UA：blob: 下载，文件真的落盘，名字是纯 ASCII');
    // ============================================================
    await send('Emulation.setUserAgentOverride', { userAgent: UA_DESKTOP });
    await send('Page.navigate', { url: PAGE + '&_r=' + Math.random().toString(36).slice(2) });
    await sleep(1200);
    await openSettings();
    await ev(HOOK);
    clearOut();
    await ev(`document.getElementById('ioExportFile').click()`);
    let dl = [];
    for (let i = 0; i < 80; i++) { dl = lsJson(); if (dl.length) break; await sleep(200); }
    ok(dl.length === 1, '磁盘上出现 1 个导出文件', lsJson().join(',') || '(空)');
    const nB = dl[0] || '';
    ok(/^wabu-save-\d{8}-\d{4}\.json$/.test(nB), `文件名纯 ASCII + 日期时间（${nB}）`);
    ok(!/[^\x20-\x7e]/.test(nB), '文件名里没有中文 / 非 ASCII（安卓下载管理器最省心）');
    const dlB = await ev(`window.__dl`);
    ok(dlB.length === 1 && /^blob:http/.test(dlB[0].scheme), '桌面 UA 走的是 blob:（大存档不吃 URL 长度）', JSON.stringify(dlB[0] && dlB[0].scheme));
    ok(dlB[0] && dlB[0].name === nB, 'a.download 用的就是那个 ASCII 名', dlB[0] && dlB[0].name);
    // 内容校验：能解析、能当存档导回来
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(path.join(OUT, nB), 'utf8')); } catch (e) { parsed = null; }
    ok(!!parsed && parsed.app === 'naiwa-rouge' && parsed.kind === 'save', '落盘的是一份合法存档', parsed ? parsed.app : 'parse fail');
    ok(!!parsed && !!parsed.data && !!parsed.data.naiwa_rouge_profile_v1, '存档里带着进度数据');
    const rowOn = await ev(`({ h: document.getElementById('ioSaveRow').hidden, vis: getComputedStyle(document.getElementById('ioSaveRow')).display })`);
    ok(rowOn.h === false && rowOn.vis !== 'none', '导出后兜底行亮出来了', JSON.stringify(rowOn));
    const tip2 = await ev(`document.getElementById('ioSaveRow').innerText.replace(/\\s+/g, ' ')`);
    ok(/没看到下载/.test(tip2), `兜底行文案是「没看到下载？…」（${tip2}）`);
    const linkB = await ev(`(() => { const a = document.getElementById('ioSaveLink');
      return { h: (a.getAttribute('href') || '').slice(0, 40), len: (a.getAttribute('href') || '').length, name: a.getAttribute('download') || '' }; })()`);
    ok(/^data:application\/json/.test(linkB.h), '兜底链接是自包含的 data: URL（不是 blob:）', linkB.h);
    ok(linkB.len > 1000, `兜底链接里真的带着整份存档（${linkB.len} 字符）`);
    ok(linkB.name === nB, '兜底链接的 download 名与导出文件一致');

    // ============================================================
    console.log('\n[C] 微信 UA（会被移交给 QQ 浏览器）：改走 data:，照样真下载');
    // ============================================================
    await send('Emulation.setUserAgentOverride', { userAgent: UA_WECHAT });
    await send('Page.navigate', { url: PAGE + '&_r=' + Math.random().toString(36).slice(2) });
    await sleep(1200);
    await openSettings();
    ok(/MicroMessenger/.test(await ev('navigator.userAgent')), 'UA 已经装成微信内置浏览器');
    await ev(HOOK);
    clearOut();
    await ev(`document.getElementById('ioExportFile').click()`);
    let dl2 = [];
    for (let i = 0; i < 80; i++) { dl2 = lsJson(); if (dl2.length) break; await sleep(200); }
    const dlC = await ev(`window.__dl`);
    ok(dlC.length === 1, '只点了一次、只造了 1 个 a', JSON.stringify(dlC.map((x) => x.scheme)));
    ok(dlC[0] && /^data:application\/json/.test(dlC[0].scheme),
      '微信 / QQ / X5 内核走 data: URL（blob: 移交到别的 App 就是死链）', dlC[0] && dlC[0].scheme);
    ok(dlC[0] && /^wabu-save-\d{8}-\d{4}\.json$/.test(dlC[0].name), '文件名还是纯 ASCII', dlC[0] && dlC[0].name);
    ok(dl2.length === 1, 'data: URL 这条路在浏览器里同样落了盘（不是「点了没反应」）', lsJson().join(',') || '(空)');
    if (dl2.length) {
      let p2 = null;
      try { p2 = JSON.parse(fs.readFileSync(path.join(OUT, dl2[0]), 'utf8')); } catch (_) { p2 = null; }
      ok(!!p2 && p2.app === 'naiwa-rouge', 'data: 那条存下来的内容一样合法（没被截断 / 乱码）', p2 ? p2.app : 'parse fail');
    }

    // ============================================================
    console.log('\n[D] 兜底链接自己也能再存一次（点它 = 再下一次）');
    // ============================================================
    clearOut();
    await ev(`document.getElementById('ioSaveLink').click()`);
    let dl3 = [];
    for (let i = 0; i < 80; i++) { dl3 = lsJson(); if (dl3.length) break; await sleep(200); }
    ok(dl3.length === 1, '点「点这里手动保存」真的又下载了一份', lsJson().join(',') || '(空)');
    ok(/^wabu-save-/.test(dl3[0] || ''), '这一份的名字也是 ASCII 存档名', dl3[0] || '');

    // ============================================================
    console.log('\n[E] 全程没有 JS 异常，其它存档按钮还在');
    // ============================================================
    ok(await ev(`document.getElementById('ioExportCode') !== null && document.getElementById('ioImportCode') !== null
      && document.getElementById('ioImportFile') !== null && document.getElementById('ioFileInput') !== null`),
      '复制码 / 粘码 / 导文件 三颗都还在（没被顺手带走）');

    console.log('\n------------------------------');
    if (fail === 0) console.log(`第 104 块 CDP：全绿 ${pass}/${pass}`);
    else {
      console.log(`第 104 块 CDP：${pass} 通过 / ${fail} 失败`);
      for (const f of fails) console.log('  - ' + f);
    }
  } catch (e) {
    console.log('\n中断：' + (e && e.message ? e.message : e));
    process.exitCode = 2;
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(400);
    try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
    process.exit(fail ? 1 : (process.exitCode || 0));
  }
})();
