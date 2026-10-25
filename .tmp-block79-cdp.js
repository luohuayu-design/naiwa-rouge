// ============================================================
// 第 79 块 CDP：加载慢 / 加载失败的提示重写 + Service Worker 本地缓存
//   A 慢网（限速 20KB/s）不再误报成错：9 秒只出黄字「网络有点慢」，
//     百分比和进度条照走，不染红、不写「超时」；25 秒才给重试按钮
//   B 真的是脚本失败（拦住 main.js 让它 404）→ 红字 + 重试按钮，能点
//   C SW 装上后：缓存条目够多；**第二次进站 js/css 几乎全从 SW 拿**（不发网络请求）
//   D 断网后带版本的模块仍能从 SW 里取到（这也是「网络抖动自动重试」的底气）
//   E ?nosw=1 时不走 SW 也能正常开局（给调试 / 自动化留的后门）
//   F 全程 0 JS 报错
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block79-cdp.js`
// ⚠️ 一次只跑一套；套间跑 node .tmp-cdp-clean.js
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9479;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-79-' + process.pid);
const BASE = 'http://127.0.0.1:8124';
// 版本号从 index.html 读，别写死（写死会加载出两份模块实例）
const V = (fs.readFileSync('index.html', 'utf8').match(/\?v=(\d+)/) || [])[1];
const CACHE_NAME = 'naiwa-rouge-v1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=430,900',
    // headless 默认把「不可见页面」的定时器节流到 1~2 秒一次，
    // 9 秒 / 25 秒的提示会晚到，测出来全是假红。真人前台不会有这个问题。
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
  const netEv = [];          // Network.responseReceived
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        jsErrors.push((d.exception && d.exception.description) || d.text || '');
      }
      if (m.method === 'Network.responseReceived') netEv.push(m);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (ex) => {
      const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (((r.exceptionDetails.exception || {}).description) || '').split('\n')[0]);
      return r.result.value;
    };
    const waitFor = async (ex, ms, label) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await ev(ex)) return true; } catch (_) {} await sleep(150); }
      throw new Error('等待超时: ' + (label || ex));
    };
    // 导航到指定 URL，等「新文档真的起来了」（旧文档上的 __game 会让判断假阳）
    const goto = async (url) => {
      await ev('window.__bootMark = 1').catch(() => {});
      await send('Page.navigate', { url });
      await waitFor('typeof window.__bootMark === "undefined"', 30000, '导航已开始');
    };
    const netOff = () => send('Network.emulateNetworkConditions',
      { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const netSlow = (kbps) => send('Network.emulateNetworkConditions',
      { offline: false, latency: 300, downloadThroughput: kbps * 1024, uploadThroughput: kbps * 1024 });
    const netDead = () => send('Network.emulateNetworkConditions',
      { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });

    // 加载页当前状态
    const loadState = () => ev(`(() => {
      const slow = document.getElementById('ldSlow');
      const retry = document.getElementById('ldRetry');
      const txt = document.getElementById('ldTxt');
      const bar = document.getElementById('ldBar');
      // 只认 hidden 属性和 display —— 不能用 getClientRects()：
      // 限速下 style.css 还没到、渲染被阻塞，明明该显示的元素 rect 也是 0。
      const seen = (el) => !!el && !el.hasAttribute('hidden')
        && getComputedStyle(el).display !== 'none';
      return {
        booted: !!window.__naiwaBooted,
        txt: txt ? txt.textContent : null,
        txtColor: txt ? getComputedStyle(txt).color : null,
        txtSize: txt ? getComputedStyle(txt).fontSize : null,
        bar: bar ? bar.style.width : null,
        slowOn: seen(slow),
        slowTxt: slow ? slow.textContent : null,
        retryOn: seen(retry),
        loadingOn: (() => { const l = document.getElementById('loading');
          return !!l && !l.classList.contains('off'); })(),
      };
    })()`);

    // 从 during 这个时间点之后的响应里数：走 SW 的 / 走网络的
    const netStats = (from) => {
      const m = { sw: 0, disk: 0, net: 0, total: 0 };
      for (const e of netEv.slice(from)) {
        const r = e.params.response;
        if (!/\.(js|css)(\?|$)/.test(r.url)) continue;
        m.total++;
        if (r.fromServiceWorker) m.sw++;
        else if (r.fromDiskCache) m.disk++;
        else m.net++;
      }
      return m;
    };

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Network.enable', {});
    await send('Network.setCacheDisabled', { cacheDisabled: false });

    // ============================================================
    console.log('\n— A 慢网不再误报成错（限速 20KB/s，关掉 SW） —');
    // ============================================================
    await netSlow(20);
    const tA = netEv.length;
    await goto(BASE + '/index.html?debug=1&title&nosw=1');
    // 限速 20KB/s 是**全局共享**的，连 index.html 自己都要下好几秒，
    // 所以不能用「导航后 9.5 秒」去掐 —— 页面里的 __ldT 记的是定时器自己的时间。
    await waitFor('window.__ldT && window.__ldT.slow > 0', 60000, '9 秒那道坎终于跑到了');
    const t9 = await ev('window.__ldT.slow');
    console.log('  .. 慢提示打点 = ' + t9 + 'ms');
    ok(t9 >= 8900 && t9 <= 9700, `慢提示是 9 秒后才出（实测 ${t9}ms）`, '偏离太多说明不定时器被别人提前了');
    let st = await loadState();
    console.log('  .. 9 秒后：' + JSON.stringify(st));
    ok(!st.booted, '限速下这时候确实还没起来（前提成立才谈得上测提示）');
    ok(st.slowOn === true, '出现了「网络有点慢」的黄字提示');
    ok(/慢/.test(st.slowTxt || ''), '慢提示文案是人话', st.slowTxt);
    ok(!/超时/.test(st.txt || ''), '不再写「加载超时」', st.txt);
    ok(st.txtColor !== 'rgb(255, 138, 120)', '百分比没被染成错误红', st.txtColor);
    // 限速 20KB/s 时 style.css 可能还没下完，此时 ldTxt 是浏览器默认 16px —— 那不是错，
    // 只要不是旧版 fail() 写死的 12px 就行（真人前台 CSS 在 head 里阻塞渲染，不会这样）。
    ok(st.txtSize !== '12px', '百分比字号没被旧版 fail() 压成 12px', st.txtSize);
    ok(st.retryOn === false, '9 秒还不给重试按钮（只是慢，别催人）');
    ok(st.bar !== null, '进度条还在（没有被提示顶掉）', String(st.bar));
    ok((await ev('window.__ldT.fail')) === 0, '这一路没被误判成「失败」');

    await waitFor('window.__ldT && window.__ldT.long > 0', 60000, '25 秒那道坎终于跑到了');
    const t25 = await ev('window.__ldT.long');
    console.log('  .. 「时间偏长」打点 = ' + t25 + 'ms');
    ok(t25 >= 24900 && t25 <= 27500, `「时间偏长」是 25 秒后才出（实测 ${t25}ms）`);
    st = await loadState();
    console.log('  .. 25 秒后：' + JSON.stringify(st));
    ok(/偏长|重载/.test(st.slowTxt || ''), '25 秒换成了「时间偏长 + 重载」的说法', st.slowTxt);
    ok(st.retryOn === true, '25 秒给出「重新加载」按钮');
    ok(!st.booted, '确实一直没起来（不是我们误判）');

    // 恢复网络后应该能自愈：慢提示收掉、正常进游戏
    await netOff();
    await waitFor('!!window.__naiwaBooted', 120000, '恢复网络后最终起来了');
    await waitFor('!document.getElementById("ldSlow") || document.getElementById("ldSlow").hasAttribute("hidden")',
      15000, '起来后慢提示自动收掉');
    st = await loadState();
    ok(st.slowOn === false, '模块跑起来后黄字自动消失');
    ok(st.txtColor !== 'rgb(255, 138, 120)', '起来后文字颜色也还原了（旧版不会）', st.txtColor);
    ok(st.retryOn === false, '起来后重试按钮不残留');

    // ============================================================
    console.log('\n— B 真的是脚本失败时：红字 + 能点的重试按钮 —');
    // ============================================================
    await netOff();
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    // 拦掉 main.js，让 script 元素派发 error（这才是「真失败」）
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/js/main.js*', requestStage: 'Request' }] });
    const failHandler = (() => {
      const h = (evt) => {
        const m = JSON.parse(evt.data);
        if (m.method === 'Fetch.requestPaused') {
          send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Failed' }).catch(() => {});
        }
      };
      ws.addEventListener('message', h);
      return h;
    })();
    await goto(BASE + '/index.html?debug=1&title&nosw=1&fail=1');
    await sleep(2500);
    st = await loadState();
    console.log('  .. 拦住 main.js 后：' + JSON.stringify(st));
    ok(st.booted === false, '拦住 main.js 后确实没起来');
    ok(/脚本加载失败|加载失败/.test(st.txt || ''), '报的是「脚本加载失败」而不是笼统的超时', st.txt);
    ok(st.retryOn === true, '失败时给出重试按钮');
    ok(st.slowOn === false, '失败时不再叠一条「网络有点慢」（别自相矛盾）');
    // 重试按钮得真的能点（点击后重新导航）
    const canClick = await ev(`(() => { const b = document.getElementById('ldRetry');
      if (!b || b.hasAttribute('hidden')) return false;
      const r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el && (el === b || b.contains(el)); })()`);
    ok(canClick, '重试按钮真的可点（不是被遮住 / 零尺寸）');
    // 撤掉拦截，等于「用户点重试」
    ws.removeEventListener('message', failHandler);
    await send('Fetch.disable', {});
    const tR = Date.now();
    await send('Page.reload', {});
    await waitFor('!!window.__naiwaBooted', 90000, '撤掉拦截后重载能起来');
    ok(Date.now() - tR < 90000, '重载后能正常起来（模拟用户点重试）');
    await send('Network.setCacheDisabled', { cacheDisabled: false });

    // ============================================================
    console.log('\n— C SW 缓存：第二次进站 js/css 几乎不发网络请求 —');
    // ============================================================
    await netOff();
    // 前面 A / B 两段全是 nosw=1，SW 从没注册过 —— 所以这一趟就是干净的「第一次访问」
    const t1 = netEv.length;
    await goto(BASE + '/index.html?debug=1&title&boot=1');
    await waitFor('!!window.__game', 120000, '冷启动（第一次真正访问）起游戏');
    await waitFor('!!navigator.serviceWorker.controller', 40000, 'SW 接管了这个页面');
    ok(true, 'Service Worker 注册并接管了页面');
    // 页面在 load 后会把「这次下载过什么」报给 SW，SW 再后台补存（并发 4），
    // 所以这里轮询等它补够 —— 这条不过，那「二次秒开」就是假的。
    const cacheStats = () => ev(`(async () => {
      const c = await caches.open(${JSON.stringify(CACHE_NAME)});
      const k = await c.keys();
      let code = 0;
      for (const r of k) if (/\\.(js|css)(\\?|$)/.test(r.url)) code++;
      return { total: k.length, code: code };
    })()`);
    let cs = { total: 0, code: 0 };
    for (let i = 0; i < 80; i++) {
      cs = await cacheStats().catch(() => ({ total: 0, code: 0 }));
      if (cs.code >= 45) break;
      await sleep(400);
    }
    console.log('  .. SW 缓存：合计 ' + cs.total + ' 条，其中 js/css ' + cs.code + ' 条');
    ok(cs.code >= 45, `缓存里补下了 ${cs.code} 个 js/css（首屏 50 个）`, '补存没生效：首访等于白干');
    const first = netStats(t1);
    console.log('  .. 第一次访问的 js/css 响应：' + JSON.stringify(first));
    ok(first.net > 20, `第一次访问确实老老实实发了网络请求（${first.net} 个）`, '太小的话说明本来就缓存了，后面的对比不算数');

    // 打印缓存里的 js/css 清单，缺了什么一眼能看见
    const cachedCode = await ev(`(async () => {
      const c = await caches.open(${JSON.stringify(CACHE_NAME)});
      const k = await c.keys();
      return k.map((r) => r.url.split('/').pop())
        .filter((n) => /\\.(js|css)(\\?|$)/.test(n)).sort();
    })()`);
    console.log('  .. 缓存里的 js/css：' + JSON.stringify(cachedCode.slice(0, 6))
      + (cachedCode.length > 6 ? ' … 共 ' + cachedCode.length + ' 个' : ''));

    // ⚠️ 清掉浏览器自己的 HTTP 缓存再进 —— transferSize 为 0 既可能是 SW 给的，
    // 也可能是磁盘缓存给的，不清就分不出来（本地 http.server 没给 Cache-Control，
    // Chrome 会启发式缓存）。清完还是 0 字节，才真的是 SW 的功劳。
    await send('Network.clearBrowserCache', {});
    const t2 = netEv.length;
    await goto(BASE + '/index.html?debug=1&title&boot=1');
    await waitFor('!!window.__game', 120000, '第二次进站起游戏');
    await sleep(1500);
    const second = netStats(t2);
    console.log('  .. 第二次访问的 js/css 响应：' + JSON.stringify(second));
    ok(second.sw > 30, `第二次进站 js/css 都经过 SW（${second.sw} 个）`);
    ok(second.sw > first.sw, '第二次比第一次明显更依赖 SW', `first.sw=${first.sw} second.sw=${second.sw}`);
    // ⚠️ fromServiceWorker 只说明「响应是 SW 给的」，SW 内部再去 fetch 也算 ——
    // 真正判「有没有吃缓存」得看页面侧的实际传输量。
    const bytesOf = () => ev(`(() => {
      const rs = performance.getEntriesByType('resource').filter((r) => /\\.(js|css)/.test(r.name));
      return { n: rs.length, kb: Math.round(rs.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024) };
    })()`);
    const b2 = await bytesOf();
    console.log('  .. 第二次访问页面侧 js/css 实际传输：' + JSON.stringify(b2));
    ok(b2.n > 30, `第二次访问页面侧能看到 ${b2.n} 个 js/css 资源`);
    ok(b2.kb <= 5, `第二次进站 js/css 几乎不传输（${b2.kb}KB，基本全从 SW 缓存来）`, '还是下了 ' + b2.kb + 'KB');

    // ============================================================
    console.log('\n— D 断网后带版本的模块仍能从 SW 取到 —');
    // ============================================================
    await netDead();
    const onlineFetch = await ev(`(async () => {
      try {
        const r = await fetch('./js/enemy.js?v=${V}', { cache: 'no-store' });
        return r.status;
      } catch (e) { return 'ERR:' + e.message; }
    })()`);
    console.log('  .. 断网下取 js/enemy.js → ' + onlineFetch);
    ok(onlineFetch === 200, '断网时带版本的模块仍能拿到（来自 SW 缓存）', String(onlineFetch));
    // 断网到底生没生效？拿一个 SW 根本不接管的路径（.txt 不在白名单）去试。
    // 用 .js 试是不准的：SW 内部再 fetch 时 CDP 的断网未必管得住它。
    const missFetch = await ev(`(async () => {
      try {
        const r = await fetch('./__offline_probe__.txt', { cache: 'no-store' });
        return r.status;
      } catch (e) { return 'ERR'; }
    })()`);
    console.log('  .. 断网下取一个没缓存的路径 → ' + missFetch);
    ok(missFetch === 'ERR', '没缓存的确实拿不到（证明 CDP 的断网真生效了）', String(missFetch));
    await netOff();

    // 缓存不存坏响应：断网期间那个失败请求不该把坏东西写进缓存
    const healthy = await ev(`(async () => {
      const c = await caches.open(${JSON.stringify(CACHE_NAME)});
      const k = await c.keys();
      const bad = [];
      for (const req of k) {
        const res = await c.match(req);
        if (!res || res.status !== 200) bad.push(req.url.split('/').pop());
      }
      return bad.slice(0, 3);
    })()`);
    ok(Array.isArray(healthy) && healthy.length === 0, '缓存里没有坏响应（全是 200）', JSON.stringify(healthy));

    // ============================================================
    console.log('\n— E ?nosw=1 后门：不走 SW 也能正常开局 —');
    // ============================================================
    // 对照组：先在**普通页面**里取一个缓存里没有的 URL，它应该被写进缓存。
    // （不能用 transferSize 判「有没有吃缓存」—— 同一个页面刚访问过，
    //   资源躺在内存缓存里，SW 给的和内存给的都是 0 字节，分不出来。）
    await ev(`fetch('./js/wave.js?v=${V}&probe=yes', { cache: 'no-store' }).then((r) => r.status)`);
    await sleep(600);
    const wroteNormal = await ev(`caches.match('./js/wave.js?v=${V}&probe=yes').then((r) => !!r)`);
    ok(wroteNormal === true, '普通页面取到的东西会被写进缓存（对照组）');

    await send('Network.clearBrowserCache', {});
    const t3 = netEv.length;
    await goto(BASE + '/index.html?debug=1&title&nosw=1');
    await waitFor('!!window.__game', 120000, 'nosw 下起游戏');
    const nosw = netStats(t3);
    console.log('  .. nosw 下的 js/css 响应：' + JSON.stringify(nosw));
    const b3 = await ev(`(() => {
      const rs = performance.getEntriesByType('resource').filter((r) => /\\.(js|css)/.test(r.name));
      return { n: rs.length };
    })()`);
    ok(b3.n > 30, `?nosw=1 时页面照常拿到 ${b3.n} 个 js/css`);

    // 关键：nosw 页面取一个缓存里没有的 URL，**不能**被写进缓存。
    // 这才是 fromNoSwPage 的实际语义 —— 透传，读也不读、写也不写。
    await ev(`fetch('./js/wave.js?v=${V}&probe=nosw', { cache: 'no-store' }).then((r) => r.status)`);
    await sleep(600);
    const wroteNoSw = await ev(`caches.match('./js/wave.js?v=${V}&probe=nosw').then((r) => !!r)`);
    ok(wroteNoSw === false, '?nosw=1 页面取得的东西不会写进缓存（真绕过了）', '被写进去了，说明 nosw 没生效');

    // ============================================================
    console.log('\n— F 全程 0 JS 报错 —');
    // ============================================================
    // 断网 / 拦请求那两段本来就会有一条「资源加载失败」的控制台记录，属预期
    const realErrors = jsErrors.filter((e) => !/net::ERR|Failed to load resource|404/i.test(e));
    ok(realErrors.length === 0, `没有意料之外的 JS 报错（${realErrors.length} 条）`, realErrors.slice(0, 2).join(' | '));

    console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
    if (fails.length) console.log('\n失败项：\n  ' + fails.join('\n  '));
  } catch (err) {
    console.error('\nFAIL', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
