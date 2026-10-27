// 第 100 块 · 诊断：属性面板手改之后，基础值到底有没有变（含刷新 / 进游戏两种场景）
// 用户第二次报「改属性那里基础值还是变了」，这次把每一步的面板文字和运行时 base 全 dump 出来。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9397;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-100');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

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
    async function clearPopups() {
      for (const sel of ['#noticeX', '#signX', '#promoX']) {
        await ev(`(() => { const x = document.querySelector('${sel}'); if (x) x.click(); return 1; })()`);
        await sleep(420);
      }
    }

    // 每次都从干净存档开始（避免上一轮的脏数据干扰）
    await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?debug=1&title' });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await ev(`(() => { localStorage.clear(); return 1; })()`);
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪（清档后）');
    await sleep(700);
    await clearPopups();

    const dumpAll = `(() => {
      const rows = [...document.querySelectorAll('#statRows .st-row')];
      return rows.map((r) => ({
        name: (r.querySelector('.st-name') || {}).textContent || '',
        input: r.querySelector('.st-input') ? Number(r.querySelector('.st-input').value) : null,
        val: r.querySelector('.st-val') ? Number(r.querySelector('.st-val').textContent) : null,
        base: r.querySelector('.st-base') ? r.querySelector('.st-base').textContent.trim() : '',
        edited: r.classList.contains('st-edited'),
      }));
    })()`;

    console.log('\n—— ⓪ 运行时 base（代码原值）——');
    const base0 = await ev(`JSON.parse(JSON.stringify(__game.stats.base))`);
    console.log('   ' + JSON.stringify(base0));

    await ev(`__game.setAdmin(true)`);
    await sleep(300);
    await ev(`document.getElementById('btnStats').click()`);
    await waitFor(`document.querySelectorAll('#statRows .st-row').length > 0`, 15000, '属性页渲染');
    await sleep(400);
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(400);

    console.log('\n—— ① 编辑态初始（前 6 行）——');
    console.table((await ev(dumpAll)).slice(0, 6));

    console.log('\n—— ② 填 maxHp = 100 ——');
    await ev(`(() => {
      const inp = [...document.querySelectorAll('#statRows .st-input')].find((i) => i.dataset.key === 'maxHp');
      inp.value = '100';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    })()`);
    await sleep(500);
    const after = (await ev(dumpAll)).find((r) => r.name.indexOf('生命') >= 0);
    console.log('   ' + JSON.stringify(after));
    ok(after && Math.abs(after.input - 100) < 1e-9, `输入框 100（${after && after.input}）`);
    ok(after && /10/.test(after.base), `★ 编辑态基础仍是 10（${after && after.base}）`);

    const rt = await ev(`JSON.stringify({ base: __game.stats.base.maxHp, adj: __game.stats.adj.maxHp, get: __game.stats.get('maxHp'), nat: __game.stats.natural('maxHp') })`);
    console.log('   运行时：' + rt);
    const rto = JSON.parse(rt);
    ok(Math.abs(rto.base - 10) < 1e-9, `运行时 base.maxHp 仍是 10（${rto.base}）`);
    ok(Math.abs(rto.get - 100) < 1e-9, `★ 改完本局 stats 立刻生效 get=100（${rto.get}）`);
    const verFoot = await ev(`(document.querySelector('#setScr .lv-foot') || {}).textContent || ''`);
    console.log('   设置页脚：' + verFoot);
    ok(/v\d+/.test(verFoot), `设置页底部标了版本号（${verFoot}）`);

    console.log('\n—— ③ 切回普通态 ——');
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(500);
    const plain = (await ev(dumpAll)).find((r) => r.name.indexOf('生命') >= 0);
    console.log('   ' + JSON.stringify(plain));
    ok(plain && Math.abs(plain.val - 100) < 1e-9, `普通态显示 100（${plain && plain.val}）`);
    ok(plain && /10/.test(plain.base), `★ 普通态基础仍是 10（${plain && plain.base}）`);

    console.log('\n—— ④ 关管理员模式（退出沙盒）——');
    await ev(`__game.setAdmin(false)`);
    await sleep(900);
    await clearPopups();
    await ev(`__game.setAdmin(true)`);
    await sleep(300);
    const stillOpen = await ev(`document.querySelectorAll('#statRows .st-row').length > 0`);
    if (!stillOpen) {
      await ev(`document.getElementById('btnStats').click()`);
      await waitFor(`document.querySelectorAll('#statRows .st-row').length > 0`, 15000, '属性页重开');
      await sleep(400);
    }
    const kept = (await ev(dumpAll)).find((r) => r.name.indexOf('生命') >= 0);
    console.log('   ' + JSON.stringify(kept));
    ok(kept && Math.abs(kept.val - 100) < 1e-9, `退出沙盒后最终值仍是 100（${kept && kept.val}）`);
    ok(kept && /10/.test(kept.base), `★ 退出沙盒后基础仍是 10（${kept && kept.base}）`);

    console.log('\n—— ⑤ 刷新页面（最容易露馅的一步）——');
    await send('Page.reload', { ignoreCache: true });
    await waitFor('!!window.__game', 90000, '刷新后 __game 就绪');
    await sleep(800);
    await clearPopups();
    const disk = await ev(`JSON.stringify(JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}').statAdmin || {})`);
    console.log('   磁盘上的 statAdmin：' + disk);
    const baseR = await ev(`JSON.stringify({ base: __game.stats.base.maxHp, adj: __game.stats.adj.maxHp, get: __game.stats.get('maxHp') })`);
    console.log('   刷新后运行时：' + baseR);
    const br = JSON.parse(baseR);
    ok(Math.abs(br.base - 10) < 1e-9, `刷新后 base.maxHp 仍是 10（${br.base}）`);
    ok(Math.abs(br.get - 100) < 1e-9, `刷新后 get('maxHp') 仍是 100（${br.get}）`);

    await ev(`__game.setAdmin(true)`);
    await sleep(300);
    await ev(`document.getElementById('btnStats').click()`);
    await waitFor(`document.querySelectorAll('#statRows .st-row').length > 0`, 15000, '刷新后属性页');
    await sleep(400);
    const afterReload = (await ev(dumpAll)).find((r) => r.name.indexOf('生命') >= 0);
    console.log('   ' + JSON.stringify(afterReload));
    ok(afterReload && Math.abs(afterReload.val - 100) < 1e-9, `刷新后面板仍是 100（${afterReload && afterReload.val}）`);
    ok(afterReload && /10/.test(afterReload.base), `★ 刷新后基础仍是 10（${afterReload && afterReload.base}）`);

    console.log('\n—— ⑥ 进一局游戏，看局内 base ——');
    await ev(`document.querySelector('#statBack') && document.getElementById('statBack').click()`);
    await sleep(400);
    await ev(`(() => { try { __game.begin(1); } catch (e) { return 'ERR:' + e.message; } return 'ok'; })()`);
    await sleep(1500);
    await clearPopups();
    await sleep(500);
    const inRun = await ev(`JSON.stringify({ base: __game.stats.base.maxHp, adj: __game.stats.adj.maxHp, get: __game.stats.get('maxHp'), state: __game.state })`);
    console.log('   局内：' + inRun);
    const ir = JSON.parse(inRun);
    ok(Math.abs(ir.base - 10) < 1e-9, `局内 base.maxHp 仍是 10（${ir.base}）`);

    ok(jsErrors.length === 0, '全程没有 JS 异常', jsErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('脚本异常：' + e.message);
    console.log('\n  ✗ 脚本异常：' + e.stack);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail) console.log('失败项：\n - ' + fails.join('\n - '));
    process.exit(fail ? 1 : 0);
  }
})();
