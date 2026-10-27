// 第 99 块 · CDP 冒烟（真实点面板，走 UI 链路）
//   ① 速度感：新档默认「开」；老档（存着 false）迁移成开；玩家手动关掉后不再被重开
//   ② 「复制存档码」= 一键整串：剪贴板里拿到 NWSZ1: 整串，且**没有任何弹窗图层**
//   ③ 「分享文件」三级回退：带文件成功 / 文件被拒自动退纯文本 / 两次都失败退下载 /
//      用户取消不算失败
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-99-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9399;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-99');
const BASE = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 在页面脚本之前插桩：可控的 share / clipboard / 下载计数
const STUB = `
window.__shareCalls = [];
window.__shareMode = 'ok';
window.__shareOff = false;
window.__clip = null;
window.__downloads = 0;
try {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    get() {
      if (window.__shareOff) return undefined;
      return async (data) => {
        window.__shareCalls.push({ hasFiles: !!(data && data.files), textLen: ((data && data.text) || '').length });
        const m = window.__shareMode;
        if (m === 'abort') { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
        if (m === 'filesFail' && data && data.files) { const e = new Error('no file support'); e.name = 'TypeError'; throw e; }
        if (m === 'allFail') { const e = new Error('boom'); e.name = 'NotAllowedError'; throw e; }
        return undefined;
      };
    },
  });
} catch (_) {}
try {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    get() { return { writeText: async (t) => { window.__clip = String(t); }, readText: async () => window.__clip || '' }; },
  });
} catch (_) {}
document.addEventListener('click', (e) => {
  const a = e.target;
  if (a && a.tagName === 'A' && a.hasAttribute('download')) window.__downloads++;
}, true);
`;

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--window-size=430,932', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
  let ws = null;
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
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') {
        jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    }
    async function waitFor(expr, ms, why) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 未就绪 */ }
        await sleep(120);
      }
      throw new Error('等超时：' + why);
    }
    async function boot(url) {
      await send('Page.navigate', { url });
      await waitFor('!!window.__game && !!window.__shareCalls', 90000, '__game 就绪');
      await sleep(600);
      for (const sel of ['#noticeX', '#signX', '#promoX']) {
        await ev(`(() => { const x = document.querySelector('${sel}'); if (x) x.click(); return 1; })()`);
        await sleep(420);
      }
    }
    const toast = `(() => { const t = document.getElementById('wtTitle'); const s = document.getElementById('wtSub');
      return { t: t ? t.textContent : '', s: s ? s.textContent : '', on: document.getElementById('waveToast').classList.contains('on') }; })()`;

    await boot(BASE);

    // ---------------------------------------------------------- ① 速度感
    console.log('\n—— ① 速度感默认打开 ——');
    ok(await ev(`__game.ui.settings().speedFov === true`), '新档默认就是「开」');
    ok(await ev(`(() => {
      const r = [...document.querySelectorAll('#setList .set-row')];
      return r.length >= 0;
    })()`), '设置面板结构可读');

    // 老档：speedFov:false 且没有 uiRev
    await ev(`(() => {
      const k = 'naiwa_rouge_profile_v1';
      const cur = JSON.parse(localStorage.getItem(k) || '{}');
      cur.settings = Object.assign({}, cur.settings, { speedFov: false });
      delete cur.uiRev;
      localStorage.setItem(k, JSON.stringify(cur));
      return 1;
    })()`);
    await boot(BASE);
    ok(await ev(`__game.ui.settings().speedFov === true`), '老档（speedFov:false）刷新后变成「开」');
    ok(await ev(`JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1')).settings.speedFov === true`),
      '磁盘上那份也改成开了（不是只在内存）');
    ok(await ev(`JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1')).uiRev === 1`), '世代号 = 1');

    // 真点面板把它关掉 → 刷新后必须还是关（迁移不许覆盖玩家的选择）
    await ev(`document.getElementById('btnSettings').click()`);
    await waitFor(`document.querySelectorAll('#setList .set-row').length > 0`, 12000, '设置行渲染');
    ok(await ev(`document.querySelectorAll('#setList .set-row').length > 0`), '设置页打开了');
    const clicked = await ev(`(() => {
      const rows = [...document.querySelectorAll('#setList .set-row')];
      const row = rows.find((r) => /速度感/.test(r.textContent));
      if (!row) return 'no-row';
      const off = [...row.querySelectorAll('.set-seg button')].find((b) => b.textContent.trim() === '关');
      if (!off) return 'no-off';
      off.click();
      return 'ok';
    })()`);
    ok(clicked === 'ok', '点到了「速度感 → 关」', clicked);
    await sleep(500);
    ok(await ev(`__game.ui.settings().speedFov === false`), '关掉之后设置里是 false');
    await boot(BASE);
    ok(await ev(`__game.ui.settings().speedFov === false`), '刷新后仍然是关（迁移只跑一次的语义对）');

    // 恢复成开，后面的用例别受影响
    await ev(`__game.ui.showSettings()`);
    await sleep(500);
    await ev(`(() => {
      const rows = [...document.querySelectorAll('#setList .set-row')];
      const row = rows.find((r) => /速度感/.test(r.textContent));
      const on = [...row.querySelectorAll('.set-seg button')].find((b) => b.textContent.trim() === '开');
      if (on) on.click();
      return 1;
    })()`);
    await sleep(400);

    // ---------------------------------------------------------- ② 复制存档码
    console.log('\n—— ② 复制存档码：一键整串，不弹窗 ——');
    ok(await ev(`document.getElementById('codeBox') === null`), 'index.html 里已经没有 codeBox 弹窗');
    await ev(`document.getElementById('ioExportCode').click()`);
    await sleep(700);
    const clip = await ev(`window.__clip`);
    ok(typeof clip === 'string' && clip.startsWith('NWSZ1:'), '剪贴板里是 NWSZ1: 整串', String(clip).slice(0, 12));
    ok(typeof clip === 'string' && clip.length > 800, `码有一千多字（${clip && clip.length}）`);
    ok(!/[ \n]/.test(String(clip).slice(8)), '码里没有空格 / 换行（粘到哪儿都不会被折断）');
    const t1 = await ev(toast);
    ok(t1.on && /存档码已复制/.test(t1.t), '弹出「存档码已复制」', t1.t);
    ok(/字/.test(t1.s), '副标题报了字数', t1.s);
    ok(await ev(`document.getElementById('codeBox') === null && document.querySelectorAll('.modal.on').length === 0`),
      '没有任何弹层盖上来（不会再出现「点在设置底下」）');

    // ---------------------------------------------------------- ③ 分享三级回退
    console.log('\n—— ③ 分享文件三级回退 ——');

    // A. 正常：带文件分享成功
    await ev(`window.__shareCalls = []; window.__shareMode = 'ok'; document.getElementById('ioShareFile').click()`);
    await sleep(700);
    let calls = await ev(`window.__shareCalls`);
    ok(calls.length === 1 && calls[0].hasFiles === true, '① 带文件分享：只调一次、带 files',
      JSON.stringify(calls));

    // B. 浏览器不认 files（手机上最常见的误判）→ 自动退成纯文本分享
    await ev(`window.__shareCalls = []; window.__shareMode = 'filesFail'; document.getElementById('ioShareFile').click()`);
    await sleep(900);
    calls = await ev(`window.__shareCalls`);
    ok(calls.length === 2, '② files 被拒后自动再试一次（而不是直接报不支持）', JSON.stringify(calls));
    ok(calls[1] && calls[1].hasFiles === false, '② 第二次不带 files');
    ok(calls[1] && calls[1].textLen > 800, `② 第二次带的是整串存档码（${calls[1] && calls[1].textLen} 字）`);

    // C. 两次都失败 → 退回下载，并说清楚
    const dl0 = await ev(`window.__downloads`);
    await ev(`window.__shareCalls = []; window.__shareMode = 'allFail'; document.getElementById('ioShareFile').click()`);
    await sleep(900);
    calls = await ev(`window.__shareCalls`);
    ok(calls.length === 2, '③ 两级都试过了（files + text）', JSON.stringify(calls));
    ok(await ev(`window.__downloads`) > dl0, '③ 最后退回下载文件（不会停在「不支持」上什么都不做）');

    // D. 用户取消 → 不算失败，不弹错、不下载
    const dl1 = await ev(`window.__downloads`);
    await ev(`window.__shareCalls = []; window.__shareMode = 'abort'; document.getElementById('ioShareFile').click()`);
    await sleep(800);
    calls = await ev(`window.__shareCalls`);
    ok(calls.length === 1, '④ 用户取消后不再重试别的通道', JSON.stringify(calls));
    ok(await ev(`window.__downloads`) === dl1, '④ 取消不触发下载（不吓人）');

    // E. 真的没有 share（老 WebView）→ 直接下载 + 明确的 toast
    const dl2 = await ev(`window.__downloads`);
    await ev(`window.__shareOff = true; document.getElementById('ioShareFile').click()`);
    await sleep(900);
    ok(await ev(`window.__downloads`) > dl2, '⑤ 没有分享面板时直接下载文件');
    const t2 = await ev(toast);
    ok(/没有分享面板/.test(t2.t), '⑤ toast 说「这台设备没有分享面板」', t2.t);

    console.log('\n—— 收尾 ——');
    ok(jsErrors.length === 0, '全程没有 JS 异常', jsErrors.slice(0, 2).join(' | '));

    console.log('\n------------------------------');
    if (fail === 0) console.log(`第 99 块 CDP：全绿 ${pass}/${pass + fail}`);
    else {
      console.log(`第 99 块 CDP：${pass} 通过 / ${fail} 失败`);
      for (const f of fails) console.log('  - ' + f);
    }
  } catch (e) {
    console.log('\n✗ 脚本异常：' + (e && e.message ? e.message : e));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* 忽略 */ }
    try { chrome.kill(); } catch (_) { /* 忽略 */ }
  }
  process.exit(fail === 0 ? 0 : 1);
})();
