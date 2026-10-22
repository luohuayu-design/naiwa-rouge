// 第 46 块线上烟测：v=52 / 4 段奶蛙素材可达可解码 / 设置里真能切包（线上无 debug，靠预置档案）
// 跑法：`node .tmp-block46-live.js`（不需要本地服务器）
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const ORIGIN = 'https://luohuayu-design.github.io';
const PAGE = ORIGIN + '/naiwa-rouge/';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-46live');
const FILES = ['voice-1.mp3', 'voice-2.mp3', 'voice-3.mp3', 'voice-end.mp3'];

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
    const errors = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text || 'exception');
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
    };
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
    const tap = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };

    console.log('\n[1] 线上版本');
    await waitFor("location.href.indexOf('naiwa-rouge') >= 0 && document.readyState !== 'loading'", 60000, '页面导航完成');
    const ver = await ev("(document.querySelector('script[src*=\"main.js\"]')||{}).src?.match(/v=(\\d+)/)?.[1] || ''");
    ok('线上引的是 v=52', ver === '52', 'v=' + ver);

    console.log('\n[2] 4 段奶蛙素材在线可解码');
    const probe = await ev(`(async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const out = [];
      for (const f of ${JSON.stringify(FILES)}) {
        const r = await fetch('assets/audio/voice/' + f);
        if (!r.ok) { out.push({ f, status: r.status }); continue; }
        const ab = await r.arrayBuffer();
        const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
        out.push({ f, status: 200, sec: +buf.duration.toFixed(2), rate: buf.sampleRate });
      }
      ctx.close();
      return out;
    })()`);
    ok('4 个文件全 200', probe.every((p) => p.status === 200), JSON.stringify(probe.map((p) => p.status)));
    ok('都能解码出时长', probe.every((p) => p.sec > 1), JSON.stringify(probe.map((p) => p.sec)));
    const secs = Object.fromEntries(probe.map((p) => [p.f, p.sec]));
    const near = (v, want) => Math.abs(v - want) < 0.03;   // 解码器四舍五入有 ±0.01 的抖动
    ok('时长与本地一致（1.83 / 3.14 / 3.66 / 6.06）',
      near(secs['voice-3.mp3'], 1.83) && near(secs['voice-1.mp3'], 3.14) &&
      near(secs['voice-2.mp3'], 3.66) && near(secs['voice-end.mp3'], 6.06), JSON.stringify(secs));

    console.log('\n[3] 还没解锁时设置里是锁着的');
    await waitFor("document.getElementById('loading').style.display === 'none'", 150000, '首屏加载完成');
    // 公告会自己弹，先收掉
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await tap(200, 800);
    await sleep(400);
    await ev("document.getElementById('btnSettings').click()");
    await sleep(600);
    ok('设置面板打开了', await ev("document.getElementById('setScr').classList.contains('on')"));
    const setTxt = await ev("document.getElementById('setList').textContent");
    ok('有「音效包」一行', /音效包/.test(setTxt));
    ok('没解锁时「奶蛙」是禁用的', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && b.disabled; })()"));
    ok('说明写着怎么解锁', /通关第一关解锁/.test(setTxt));
    await ev("document.getElementById('setBack').click()");
    await sleep(300);

    console.log('\n[4] 解锁后（预置档案）线上真能切包');
    await ev(`(() => {
      const k = 'naiwa_rouge_profile_v1';
      const cur = JSON.parse(localStorage.getItem(k) || '{}');
      cur.voicePack = { unlocked: true, id: 'normal' };
      localStorage.setItem(k, JSON.stringify(cur));
    })()`);
    await send('Page.reload', { ignoreCache: false });
    await waitFor("document.getElementById('loading').style.display === 'none'", 150000, '重载后加载完成');
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await tap(200, 800);
    await sleep(500);
    await ev("document.getElementById('btnSettings').click()");
    await sleep(600);
    ok('解锁后「奶蛙」能点了', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && !b.disabled; })()"));
    await ev("[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog').click()");
    await sleep(2500);
    ok('按钮切到奶蛙选中态', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && b.classList.contains('on'); })()"));
    const saved = await ev("JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1')||'{}').voicePack");
    ok('档案里记成 frog', saved && saved.id === 'frog', JSON.stringify(saved));
    const reqs = await ev("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.indexOf('/audio/voice/')>=0).map(n=>n.split('/').pop())");
    ok('切包后真的去拉了奶蛙素材', reqs.length >= 1, String(reqs));
    ok('没有 console 报错', errors.length === 0, errors.slice(0, 2).join(' | '));

    console.log('\n[5] 刷新后选择还在');
    await send('Page.reload', { ignoreCache: false });
    await waitFor("document.getElementById('loading').style.display === 'none'", 150000, '第二次重载完成');
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await tap(200, 800);
    await sleep(500);
    await ev("document.getElementById('btnSettings').click()");
    await sleep(600);
    ok('刷新后仍是奶蛙选中', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && b.classList.contains('on'); })()"));

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
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
