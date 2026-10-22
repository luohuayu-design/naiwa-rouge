// 第 49 块 CDP：种子挑战（输入种子 → 战绩匹配难度 → 游玩记录 → 续玩保留）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block49-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9351;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-49');

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
  const jsErrors = [];
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
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
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 还没就绪 */ }
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }
    let targetId = target.id;
    async function goto(url, beforeNavigate) {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
      try { await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`); } catch (_) {}
      targetId = t.id;
      ws.close();
      ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      bindWs();
      await send('Runtime.enable');
      await send('Page.enable');
      if (beforeNavigate) await beforeNavigate();
      await send('Page.navigate', { url });
      await waitFor("location.href.indexOf('127.0.0.1')>=0 && document.readyState === 'complete'", 60000, '页面加载');
    }
    const seedRecords = (obj) => send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify(${JSON.stringify(obj)}));`,
    });

    await send('Runtime.enable');
    await send('Page.enable');

    // ============ A 段：模块单测（evaluate 里 import 同一实例） ============
    console.log('\n[A] seed.js 模块：种子哈希 / 难度匹配 / 记录取优');
    await goto('http://127.0.0.1:8124/?debug=1&title');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    const seedMod = "import('./js/seed.js?v=57').then(m => m)";
    ok('seedFromText 确定性（同文同种）',
      (await ev(`(async () => { const m = await ${seedMod}; return m.seedFromText('奶蛙666') === m.seedFromText('奶蛙666'); })()`)) === true);
    ok('不同文本不同种子',
      (await ev(`(async () => { const m = await ${seedMod}; return m.seedFromText('a') !== m.seedFromText('b'); })()`)) === true);
    ok('空文本也不炸（trim 后仍有种子）',
      (await ev(`(async () => { const m = await ${seedMod}; return m.seedFromText('  ') > 0; })()`)) === true);
    // 难度匹配三档
    const R0 = await ev(`(async () => { const m = await ${seedMod}; return m.pickSeedRules(123, {}, [{id:'c1'},{id:'c2'},{id:'c3'}]); })()`);
    ok('0 通关 → 第一关 / normal / 无诅咒',
      R0.levelId === 1 && R0.diff === 'normal' && R0.curses.length === 0, JSON.stringify(R0));
    const R2 = await ev(`(async () => { const m = await ${seedMod}; return m.pickSeedRules(123, {1:{wins:2}}, [{id:'c1'},{id:'c2'},{id:'c3'}]); })()`);
    ok('2 通关 → 第一关 / hard / 1 诅咒',
      R2.levelId === 1 && R2.diff === 'hard' && R2.curses.length === 1, JSON.stringify(R2));
    const R6 = await ev(`(async () => { const m = await ${seedMod}; return m.pickSeedRules(123, {1:{wins:4},2:{wins:3}}, [{id:'c1'},{id:'c2'},{id:'c3'}]); })()`);
    ok('7 通关 → 第二关 / nightmare / 2 诅咒',
      R6.levelId === 2 && R6.diff === 'nightmare' && R6.curses.length === 2, JSON.stringify(R6));
    const R3 = await ev(`(async () => { const m = await ${seedMod}; return m.pickSeedRules(123, {2:{wins:3}}, [{id:'c1'},{id:'c2'},{id:'c3'}]); })()`);
    ok('没通关过第一关 → 不去第二关（哪怕通关数够）',
      R3.levelId === 1, JSON.stringify(R3));
    // 记录取优：输 → 赢（improved）→ 再输（不覆盖）
    await ev(`(async () => {
      const m = await ${seedMod};
      m.saveSeedRecord({ code: 'AA0001', text: '测试', seed: 1, win: false, round: 3, kills: 10, time: 9, level: 1, diff: 'normal' });
      const a = m.saveSeedRecord({ code: 'AA0001', text: '测试', seed: 1, win: true, round: 20, kills: 99, time: 8, level: 1, diff: 'normal' });
      const b = m.saveSeedRecord({ code: 'AA0001', text: '测试', seed: 1, win: false, round: 2, kills: 1, time: 7, level: 1, diff: 'normal' });
      window.__sr = { a: a.improved, b: b.improved, rec: m.loadSeedRecords()[0] };
    })()`);
    ok('第一次记录 improved', await ev('window.__sr.a') === true);
    ok('更好成绩覆盖 improved', await ev('window.__sr.b') === false);
    ok('记录内容是赢的那次', await ev('window.__sr.rec.win') === true && (await ev('window.__sr.rec.round')) === 20);
    ok('记录存进了 localStorage（seeds_v1）', (await ev("(function(){ const v = JSON.parse(localStorage.getItem('naiwa_rouge_seeds_v1') || '{}'); return v.runs && v.runs.AA0001 && v.runs.AA0001.win === true; })()")) === true);

    // ============ B 段：面板 UI 与战绩匹配文案 ============
    console.log('\n[B] 面板：入口 / 匹配文案 / 骰子 / 记录列表');
    await ev('location.reload()');
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(400);
    await ev("document.getElementById('btnSeed').click()");
    await waitFor("document.getElementById('seedScr').classList.contains('on')", 15000, '种子面板打开');
    ok('空输入给引导提示', /输入或掷个种子/.test(await ev("document.getElementById('sdMatch').textContent")));
    await ev("(function(){ const i = document.getElementById('seedInput'); i.value = '奶蛙666'; i.dispatchEvent(new Event('input')); })()");
    ok('0 通关 → 文案是普通/无诅咒',
      /普通/.test(await ev("document.getElementById('sdMatch').textContent")) &&
      /无<\/b>/.test(await ev("document.getElementById('sdMatch').innerHTML")));
    ok('记录列表显示刚才那条', /AA0001/.test(await ev("document.getElementById('sdList').textContent")));
    await ev("document.getElementById('sdDice').click()");
    ok('骰子能填出随机种子', /^SD[A-Z0-9]{4}$/.test(await ev("document.getElementById('seedInput').value")));
    // 预置战绩再看匹配文案（要重载才能让 loadRecords 吃到）
    await goto('http://127.0.0.1:8124/?debug=1&title', () => seedRecords({ 1: { wins: 2, bestRound: 12, bestKills: 50, bestTime: 100 } }));
    await waitFor('!!window.__game', 90000, '重载（带战绩）');
    await sleep(400);
    await ev("document.getElementById('btnSeed').click()");
    await sleep(300);
    await ev("(function(){ const i = document.getElementById('seedInput'); i.value = '奶蛙666'; i.dispatchEvent(new Event('input')); })()");
    ok('2 通关 → 文案是困难/1 诅咒',
      /困难/.test(await ev("document.getElementById('sdMatch').textContent")) &&
      !/无<\/b>/.test(await ev("document.getElementById('sdMatch').innerHTML")));

    // ============ C 段：实战一局 + 续玩保留 ============
    console.log('\n[C] 种子局实战：种子生效 / 续玩后种子还在');
    // 换到 keepsave 页面：?debug=1 不带 keepsave 时 saveRunAtRound 直接 return，永远不落档
    await goto('http://127.0.0.1:8124/?debug=1&keepsave&title');
    await waitFor('!!window.__game', 90000, 'keepsave 页就绪');
    await sleep(400);
    await ev("document.getElementById('btnSeed').click()");
    await sleep(300);
    await ev("(function(){ const i = document.getElementById('seedInput'); i.value = '奶蛙666'; i.dispatchEvent(new Event('input')); })()");
    await ev("document.getElementById('sdStart').click()");
    await waitFor('window.__game.state === "playing"', 60000, '种子局开打');
    await sleep(500);
    const info = await ev('window.__game.seedInfo()');
    ok('这一局挂上了种子（seed>0）', info.seed > 0, JSON.stringify(info));
    ok('不是每日挑战（daily=false）', info.daily === false);
    ok('结算标签用的 code 与种子一致',
      (await ev("(function(){ const m = null; return window.__game.seedInfo().code; })()")) !== '' &&
      (await ev('window.__game.seedInfo().code')) === (await ev("(async () => (await import('./js/seed.js?v=57')).seedCode(window.__game.seedInfo().seed))()")));
    // 落一份档（同第 47 块手法：管理员跳回合 → 关管理员 + 加攻击范围 → 自然清场落档）
    await ev('window.__game.setAdmin(true)');
    await ev('window.__game.jumpRound(1)');
    await sleep(300);
    await ev('window.__game.setAdmin(false)');
    await ev("window.__game.buff('attackRange', 12)");
    await waitFor("(function(){ const k = Object.keys(localStorage).filter(k => k.indexOf('runs_v1') >= 0); return k.length && JSON.parse(localStorage.getItem(k[0])).length > 0; })()",
      180000, '种子局落档');
    const savedSeed = await ev("(function(){ const k = Object.keys(localStorage).filter(k => k.indexOf('runs_v1') >= 0); return JSON.parse(localStorage.getItem(k[0]))[0].seed; })()");
    ok('存档里带着这颗种子', savedSeed === info.seed, savedSeed + ' vs ' + info.seed);
    // 重载续玩
    await goto('http://127.0.0.1:8124/?debug=1&keepsave&title');
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(400);
    await ev("document.getElementById('btnResume').click()");
    await waitFor("document.getElementById('saveList').classList.contains('on')", 15000, '存档列表');
    await sleep(300);
    await ev("document.querySelector('#saveList .save-item').click()");
    await waitFor('window.__game.state === "playing"', 60000, '续玩进入战斗');
    await sleep(600);
    const info2 = await ev('window.__game.seedInfo()');
    ok('读档后种子一致', info2.seed === info.seed, JSON.stringify(info2));
    ok('读档后仍是种子局（非每日）', info2.daily === false);
    const realErrors = jsErrors.filter((s) => !/favicon|Autofocus|Unable to load/i.test(s));
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
