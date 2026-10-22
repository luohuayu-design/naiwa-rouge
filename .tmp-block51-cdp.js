// 第 51 块 CDP：图鉴怪物贴图（离线渲染的缩略图接进怪物页签）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block51-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9357;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-51');
const SHOT_DIR = path.join(os.tmpdir(), 'naiwa-shot-51');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  const jsErrors = [];
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    function bindWs() {
      ws.onmessage = (evt) => {
        const m = JSON.parse(evt.data);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
          jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
        }
        if (m.method === 'Runtime.exceptionThrown') {
          jsErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
        }
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      };
    }
    bindWs();
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
    async function waitFor(expr, ms = 60000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { }
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOT_DIR, name + '.png'), Buffer.from(r.data, 'base64'));
      console.log('  截图:', name);
    };

    await send('Runtime.enable');
    await send('Page.enable');
    // 390×844 手机尺寸（和别的视觉核对脚本一致）
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:8124/?debug=1&title' });
    await waitFor("location.href.indexOf('127.0.0.1')>=0 && document.readyState === 'complete'", 60000, '页面加载');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(2600);   // 公告 loading 淡完 +700ms 才弹，等它出来再收
    await ev('window.__game.notice && window.__game.notice.hide()');
    await sleep(500);

    // ============ A：怪物页签带缩略图 ============
    console.log('\n[A] 图鉴 · 怪物页签：每只怪都有贴图');
    await ev('window.__game.codex.show()');
    await waitFor("document.getElementById('codexScr').classList.contains('on')", 15000, '图鉴打开');
    await sleep(300);
    const entries = await ev('window.__game.codex.entries("enemies")');
    ok('怪物条目 13 只', entries.length === 13, 'count=' + entries.length);
    ok('每条都带 thumb 字段', entries.every((e) => typeof e.thumb === 'string' && e.thumb.indexOf('assets/codex/') === 0),
      entries.filter((e) => !e.thumb).map((e) => e.id).join(','));
    ok('thumb 文件名就是怪 id', entries.every((e) => e.thumb === `assets/codex/${e.id}.webp`));

    const domCount = await ev(`(function(){
      const items = [...document.querySelectorAll('#cxList .cx-item')];
      return {
        items: items.length,
        withThumb: items.filter((i) => i.classList.contains('has-thumb')).length,
        imgs: items.filter((i) => i.querySelector('img.cx-thumb')).length,
        titleInBody: items.filter((i) => i.querySelector('.cx-body .cx-title')).length,
        noBodyWhenNoThumb: [...document.querySelectorAll('#cxList .cx-item:not(.has-thumb)')].length,
      };
    })()`);
    ok('DOM 里 13 个条目', domCount.items === 13, JSON.stringify(domCount));
    ok('13 个条目都挂了缩略图', domCount.withThumb === 13 && domCount.imgs === 13, JSON.stringify(domCount));
    ok('文字都挪进了 .cx-body（左图右文）', domCount.titleInBody === 13, 'titleInBody=' + domCount.titleInBody);

    // 等图片真正解码出来（naturalWidth 才是「加载成功」的硬证据）
    await waitFor(`[...document.querySelectorAll('#cxList img.cx-thumb')].every((i) => i.complete && i.naturalWidth > 0)`, 20000, '缩略图全部解码');
    const imgStat = await ev(`(function(){
      const imgs = [...document.querySelectorAll('#cxList img.cx-thumb')];
      return {
        n: imgs.length,
        broken: imgs.filter((i) => !i.naturalWidth).length,
        sizes: [...new Set(imgs.map((i) => i.naturalWidth + 'x' + i.naturalHeight))],
        lazy: imgs.every((i) => i.loading === 'lazy'),
        alts: imgs.filter((i) => i.alt).length,
      };
    })()`);
    ok('13 张图全部解码成功（0 破图）', imgStat.n === 13 && imgStat.broken === 0, JSON.stringify(imgStat));
    ok('渲染尺寸都是 240×288', imgStat.sizes.length === 1 && imgStat.sizes[0] === '240x288', imgStat.sizes.join(','));
    ok('图片走 lazy 加载', imgStat.lazy === true);
    ok('图片都有 alt（无障碍）', imgStat.alts === 13);

    // 排版：图在左、文字在右，缩略图 66 宽
    const layout = await ev(`(function(){
      const it = document.querySelector('#cxList .cx-item.has-thumb');
      const img = it.querySelector('img.cx-thumb');
      const body = it.querySelector('.cx-body');
      const a = img.getBoundingClientRect(), b = body.getBoundingClientRect();
      const cs = getComputedStyle(img);
      return { imgW: Math.round(a.width), imgH: Math.round(a.height), imgRight: Math.round(a.right), bodyLeft: Math.round(b.left), radius: cs.borderRadius, fit: cs.objectFit };
    })()`);
    ok('缩略图 66×79 左右', Math.abs(layout.imgW - 66) <= 2 && Math.abs(layout.imgH - 79) <= 2, JSON.stringify(layout));
    ok('图在文字左侧', layout.imgRight <= layout.bodyLeft + 1, JSON.stringify(layout));
    ok('缩略图圆角 + object-fit', layout.radius !== '0px' && layout.fit === 'cover', JSON.stringify(layout));

    await shot('codex-enemies');

    // ============ B：其它页签不受影响 ============
    console.log('\n[B] 其它页签（武器 / 奇遇）不该多出图');
    await ev(`document.querySelector('#cxTabs button[data-tab="swords"]').click()`);
    await sleep(300);
    const swords = await ev(`({
      items: document.querySelectorAll('#cxList .cx-item').length,
      thumbs: document.querySelectorAll('#cxList .cx-thumb').length,
      hasThumbCls: document.querySelectorAll('#cxList .cx-item.has-thumb').length,
      simple: document.querySelectorAll('#cxList .cx-item .cx-title').length,
    })`);
    ok('武器页签没有缩略图', swords.thumbs === 0 && swords.hasThumbCls === 0, JSON.stringify(swords));
    ok('武器页签标题仍直接挂在条目下', swords.simple === swords.items && swords.items > 0, JSON.stringify(swords));
    await shot('codex-swords');
    await ev(`document.querySelector('#cxTabs button[data-tab="events"]').click()`);
    await sleep(300);
    ok('奇遇页签没有缩略图', (await ev("document.querySelectorAll('#cxList .cx-thumb').length")) === 0);
    await ev(`document.querySelector('#cxTabs button[data-tab="enemies"]').click()`);
    await sleep(500);
    ok('切回怪物页签缩略图还在', (await ev("document.querySelectorAll('#cxList .cx-thumb').length")) === 13);
    await ev("document.getElementById('cxBack').click()");

    // ============ C：素材文件本身 ============
    console.log('\n[C] 缩略图素材（HTTP 200 / 体积合理）');
    let badFiles = [];
    let total = 0;
    for (const e of entries) {
      const r = await fetch('http://127.0.0.1:8124/' + e.thumb);
      const buf = Buffer.from(await r.arrayBuffer());
      total += buf.length;
      const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
      if (r.status !== 200 || buf.length < 5000 || !isWebp) badFiles.push(`${e.id}:${r.status}/${buf.length}/${isWebp}`);
    }
    ok('13 个 webp 全部 200、是真 webp、体积 > 5KB', badFiles.length === 0, badFiles.join(','));
    ok('总体积 < 400KB（缩略图不该拖慢首屏）', total < 400 * 1024, (total / 1024).toFixed(0) + 'KB');

    const realErrors = jsErrors.filter((s) => !/favicon|Autofocus|Unable to load|WebGL|SwiftShader/i.test(s));
    ok('无 console 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 300));

    console.log(`\n-------------------------------\n通过 ${pass} / 失败 ${fail}`);
    if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
  } catch (err) {
    console.error('测试中断：', err.message);
    console.log(`\n通过 ${pass} / 失败 ${fail}`);
    if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
