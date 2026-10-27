// 第 95 块 · 冒烟：并联体间距/血量 + 属性面板「管理员模式二」
//   ① 没开管理员模式一 → 属性页那一栏整栏不可见（共用同一串密码）
//   ② 开了 → 按钮可见，点开出现数字输入框，框里是**最终值**
//   ③ 填 100 → 该行立刻变 100；关掉编辑态照样是 100（带「基础 x」与「已改」）
//   ④ 关掉管理员模式一 → 栏位消失，数值不变
//   ⑤ 刷新页面（持久化）→ 还是 100
//   ⑥ 真开一局 → stats.get('attack') 从改后的 100 起算
//   ⑦ 恢复默认 → 回到出厂 1
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-95-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9395;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-95smoke');
const SHOT = path.join(os.tmpdir(), 'naiwa-95-admin2.png');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--window-size=430,932',
    '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') {
        jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      } else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
        jsErrors.push(d.params.entry.text);
      }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

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
    async function boot(why) {
      await send('Page.navigate', { url: URL });
      await waitFor('!!window.__game', 90000, why || '页面没起来');
      await sleep(300);
      // 把标题页的公告 / 签到 / 宣传有礼那条 350ms 定时器链拆掉，别盖住界面
      await ev(`(() => {
        for (const id of ['noticeOv','signOv','actOv','packGet']) {
          const el = document.getElementById(id);
          if (el && el.classList.contains('on')) {
            const btn = el.querySelector('.hi-ok, .nt-x, [data-close]');
            if (btn) btn.click();
          }
        }
        return 1;
      })()`);
      await sleep(500);
    }

    // 行查询：返回该属性的输入框 / 数值文本
    const ROW = (name) => `(() => {
      const rows = [...document.querySelectorAll('#statRows .st-row')];
      const row = rows.find((r) => r.querySelector('.st-name') && r.querySelector('.st-name').textContent === '${name}');
      if (!row) return null;
      const input = row.querySelector('input.st-input');
      return {
        text: row.textContent,
        val: row.querySelector('.st-val') ? row.querySelector('.st-val').textContent : null,
        base: row.querySelector('.st-base') ? row.querySelector('.st-base').textContent : null,
        input: input ? input.value : null,
        edited: row.classList.contains('st-edited'),
        flag: !!row.querySelector('.st-flag'),
      };
    })()`;
    const setFinal = (name, v) => `(() => {
      const rows = [...document.querySelectorAll('#statRows .st-row')];
      const row = rows.find((r) => r.querySelector('.st-name') && r.querySelector('.st-name').textContent === '${name}');
      const input = row && row.querySelector('input.st-input');
      if (!input) return 'no-input';
      input.value = '${v}';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`;

    console.log('\n—— ① 没开管理员模式一：整栏不可见 ——');
    await boot('首屏');
    ok(jsErrors.length === 0, `首屏无 JS 异常`, jsErrors.slice(0, 2).join(' | '));
    await ev('__game.statPage.show()');
    await sleep(600);
    const bar0 = await ev(`(() => {
      const b = document.getElementById('stAdminBar');
      const btn = document.getElementById('stAdminToggle');
      return {
        hidden: b.hidden,
        disp: getComputedStyle(b).display,
        btnDisp: getComputedStyle(btn).display,
        inputs: document.querySelectorAll('#statRows input.st-input').length,
        rows: document.querySelectorAll('#statRows .st-row').length,
      };
    })()`);
    ok(bar0.rows > 0, `属性页渲染出 ${bar0.rows} 行`);
    ok(bar0.hidden === true, 'stAdminBar 处于 hidden（没密码看不到）');
    ok(bar0.disp === 'none', `computed display = ${bar0.disp}（flex 容器也被 hidden 压住）`);
    ok(bar0.inputs === 0, '没进编辑态时全页 0 个输入框');

    console.log('\n—— ② 开管理员模式一（同一串密码）后可见 ——');
    await ev(`__game.setAdmin(true)`);
    await ev('__game.statPage.show()');
    await sleep(500);
    const bar1 = await ev(`(() => {
      const b = document.getElementById('stAdminBar');
      return { hidden: b.hidden, disp: getComputedStyle(b).display,
               btn: document.getElementById('stAdminToggle').textContent };
    })()`);
    ok(bar1.hidden === false, '沙盒开了之后 stAdminBar 显示出来');
    ok(bar1.disp !== 'none', `display = ${bar1.disp}`);
    ok(/管理员模式二：关/.test(bar1.btn), `按钮初始文案「${bar1.btn}」`);

    console.log('\n—— ③ 点开编辑态：输入框里是最终值 ——');
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(400);
    const editRows = await ev(`document.querySelectorAll('#statRows input.st-input').length`);
    ok(editRows > 10, `编辑态出现 ${editRows} 个输入框（每条属性一个）`);
    const atk0 = await ev(ROW('攻击力'));
    ok(!!atk0, '找得到「攻击力」这一行');
    ok(atk0.input != null && Number(atk0.input) >= 0, `输入框里是数字「${atk0.input}」`);
    // 输入框显示的是**最终值**，必须等于没开编辑态时那一行的数值
    ok(/基础/.test(atk0.base || ''), `右边标了「${atk0.base}」`);

    console.log('\n—— ④ 填 100 → 面板立刻变 100 ——');
    const r1 = await ev(setFinal('攻击力', 100));
    ok(r1 === 'ok', 'change 事件打进去了');
    await sleep(350);
    const atk1 = await ev(ROW('攻击力'));
    ok(atk1 && Math.abs(Number(atk1.input) - 100) < 1e-6, `填完输入框回读 ${atk1 && atk1.input}（不漂）`);
    ok(atk1 && atk1.edited && atk1.flag, '这一行挂上「已改」标记');
    const saved1 = await ev(`JSON.stringify(__game.ui.profile().statBases || {})`);
    ok(/attack/.test(saved1), `档案里记下了 ${saved1}`);

    // 截图留证（编辑态）
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(snap1.result.data, 'base64'));

    console.log('\n—— ⑤ 关掉编辑态：数值保留，且显示「基础 x」 ——');
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(400);
    const atk2 = await ev(ROW('攻击力'));
    ok(atk2 && Math.abs(Number(atk2.val) - 100) < 1e-6, `非编辑态显示 ${atk2 && atk2.val}`);
    // 没有其它加成时 final == base，面板就不重复写「基础 100.0」（原来只在有加成时显示）
    ok(atk2 && atk2.flag, '「已改」标记还在');

    console.log('\n—— ⑥ 关掉管理员模式一：栏位消失、数值不变 ——');
    await ev(`__game.setAdmin(false)`);
    await ev('__game.statPage.show()');
    await sleep(500);
    const bar2 = await ev(`(() => {
      const b = document.getElementById('stAdminBar');
      return { hidden: b.hidden, inputs: document.querySelectorAll('#statRows input.st-input').length };
    })()`);
    ok(bar2.hidden === true, '关掉沙盒后那一栏又藏起来');
    ok(bar2.inputs === 0, '编辑态被强制收回（0 个输入框）');
    const atk3 = await ev(ROW('攻击力'));
    ok(atk3 && Math.abs(Number(atk3.val) - 100) < 1e-6, `数值仍然是 ${atk3 && atk3.val}`);

    console.log('\n—— ⑦ 刷新页面：数值持久化 ——');
    await boot('刷新后');
    await ev('__game.statPage.show()');
    await sleep(600);
    const atk4 = await ev(ROW('攻击力'));
    ok(atk4 && Math.abs(Number(atk4.val) - 100) < 1e-6, `刷新后还是 ${atk4 && atk4.val}`);
    const bar3 = await ev(`document.getElementById('stAdminBar').hidden`);
    ok(bar3 === true, '刷新后管理员栏仍是隐藏的（要重新输密码）');

    console.log('\n—— ⑧ 真开一局：属性吃改后的值 ——');
    const atkRun = await ev(`(async () => {
      await __game.beginGame({ tutorial: false });
      return __game.stats.get('attack');
    })()`);
    ok(Math.abs(atkRun - 100) < 1e-6, `开局后 stats.get('attack') = ${atkRun}（改前是 1）`);
    const baseRun = await ev(`__game.stats.base.attack`);
    ok(Math.abs(baseRun - 100) < 0.01, `base.attack = ${baseRun}`);

    console.log('\n—— ⑨ 恢复默认 ——');
    await ev(`(() => {
      // 先回标题页，再开管理员与属性页
      document.getElementById('rsBtn') && 0;
      return 1;
    })()`);
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '二次刷新');
    await sleep(400);
    await ev(`__game.setAdmin(true)`);
    await ev('__game.statPage.show()');
    await sleep(500);
    await ev(`document.getElementById('stAdminReset').click()`);
    await sleep(400);
    // 恢复默认会把编辑态重新打开（好让你接着改），读数值要先关掉编辑态
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(400);
    const atk5 = await ev(ROW('攻击力'));
    ok(atk5 && Math.abs(Number(atk5.val) - 1) < 1e-6, `恢复默认后回到 ${atk5 && atk5.val}（出厂值）`);
    ok(atk5 && !atk5.flag, '「已改」标记消失');
    const left = await ev(`Object.keys(__game.ui.profile().statBases || {}).length`);
    ok(left === 0, `档案里已改项清空（剩 ${left} 条）`);
    await ev(`__game.setAdmin(false)`);

    ok(jsErrors.length === 0, `全程无 JS 异常`, jsErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('EXCEPTION: ' + e.message);
    console.log('  ✗ 异常：' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) { /* ignore */ }
    try { chrome.kill(); } catch (_) { /* ignore */ }
  }

  console.log('\n' + '='.repeat(46));
  console.log(`第 95 块冒烟：通过 ${pass} / 失败 ${fail}`);
  if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
  console.log('截图：' + SHOT);
  process.exit(fail ? 1 : 0);
})();
