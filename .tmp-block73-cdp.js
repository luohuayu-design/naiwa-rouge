// 第 73 块 CDP：三档卡池在真实浏览器里渲染得对不对
//   A 卡池 71 张、三张卡三系各一、品质角标与卡片 rarity 对得上
//   B 反复开面板：小/中/大三档都真会出现，小档最多、大档稀罕
//   C 选一张大档卡，主角属性真的按大档数值涨（不是按小档）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block73-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9373;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-73');
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
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
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
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        jsErrors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]);
      }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    function send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    }
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(250);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    console.log('\n— A 卡池与面板渲染 —');
    ok(await ev('__game.upgrade.list.length') === 71, '卡池 71 张',
      String(await ev('__game.upgrade.list.length')));
    await ev('__game.beginGame({tutorial:false})');
    await sleep(900);
    await ev('__game.upgrade.show()');
    await sleep(400);
    ok(await ev('__game.upgrade.isOpen()'), '升级面板打开');

    const cards = await ev(`JSON.stringify(__game.upgrade.cards)`);
    const c0 = JSON.parse(cards);
    ok(c0.length === 3, '面板上 3 张卡', String(c0.length));
    ok(c0.map((c) => c.tag).sort().join() === 'atk,def,mov', '三系各一张', c0.map((c) => c.tag).join());
    const RANK = { common: '普通', rare: '稀有', fine: '精良', epic: '史诗', legend: '传说' };
    ok(c0.every((c) => RANK[c.rarity] === c.rank), '品质角标文字与 data-rarity 一致',
      JSON.stringify(c0));
    // 卡片上的标题必须和卡池里那张一致（防「渲染拿了小档、应用拿了中档」）
    const titleOk = await ev(`(() => {
      const bad = [];
      for (const b of document.querySelectorAll('#upList .up-item')) {
        const up = __game.upgrade.list.find((u) => u.id === b.dataset.id);
        if (!up) { bad.push(b.dataset.id + ' 不在卡池里'); continue; }
        const t = b.querySelector('.up-effect').textContent;
        if (t !== up.title) bad.push(b.dataset.id + ':' + t + '≠' + up.title);
        const n = b.querySelector('.up-name').textContent;
        if (!n.startsWith(up.name)) bad.push(b.dataset.id + ' 名字:' + n);
      }
      return JSON.stringify(bad);
    })()`);
    ok(JSON.parse(titleOk).length === 0, '面板上的名字/数值文案 = 卡池里那张', titleOk);

    console.log('\n— B 反复开面板：三档都会出现，小档最多 —');
    const tally = await ev(`(async () => {
      const t = { s: 0, m: 0, l: 0, uniq: 0 };
      const seenB = [];
      for (let i = 0; i < 45; i++) {
        __game.upgrade.show();
        for (const c of __game.upgrade.cards) {
          const up = __game.upgrade.list.find((u) => u.id === c.id);
          if (!up || !up.tier) { t.uniq++; continue; }
          t[up.tier]++;
          if (up.tier === 'l') seenB.push(c.id + '|' + c.rarity + '|' + c.rank);
        }
      }
      return JSON.stringify({ t, seenB: seenB.slice(0, 6) });
    })()`);
    const T = JSON.parse(tally);
    const total = T.t.s + T.t.m + T.t.l + T.t.uniq;
    console.log('   三档命中：', JSON.stringify(T.t), '整卡', T.t.uniq);
    ok(T.t.s > 0 && T.t.m > 0 && T.t.l > 0, '小 / 中 / 大三档都真会出现', JSON.stringify(T.t));
    ok(T.t.s > T.t.m && T.t.m > T.t.l, '出现次数 小 > 中 > 大', JSON.stringify(T.t));
    const pBig = T.t.l / total;
    ok(pBig > 0.005 && pBig < 0.15, `大档占比落在 0.5%~15%（实际 ${(pBig * 100).toFixed(1)}%）`);
    ok(T.seenB.every((x) => x.split('|')[1] === 'epic' && x.split('|')[2] === '史诗'),
      '大档卡在面板上就是「史诗 / 金」', JSON.stringify(T.seenB));

    console.log('\n— C 选一张大档卡，属性按大档数值涨 —');
    const atk0 = await ev('__game.stats.get("attack")');
    await ev(`__game.upgrade.choose(__game.upgrade.list.find((u) => u.id === 'edgeB'))`);
    await sleep(350);
    const atk1 = await ev('__game.stats.get("attack")');
    ok(Math.abs(atk1 - (atk0 + 4)) < 1e-6, `锋利Ⅲ 攻击力 ${atk0} → ${atk1}（+4，大档）`);
    const atk2 = await ev(`(() => {
      __game.upgrade.show();
      const up = __game.upgrade.list.find((u) => u.id === 'edgeM');
      __game.upgrade.choose(up);
      return __game.stats.get('attack');
    })()`);
    ok(Math.abs(atk2 - (atk1 + 2)) < 1e-6, `锋利Ⅱ 攻击力 ${atk1} → ${atk2}（+2，中档）`);
    const atk3 = await ev(`(() => {
      __game.upgrade.show();
      const up = __game.upgrade.list.find((u) => u.id === 'edge');
      __game.upgrade.choose(up);
      return __game.stats.get('attack');
    })()`);
    ok(Math.abs(atk3 - (atk2 + 1)) < 1e-6, `锋利 攻击力 ${atk2} → ${atk3}（+1，小档）`);
    const taken = await ev('JSON.stringify(__game.upgrade.taken.slice(-3))');
    ok(JSON.parse(taken).join() === 'edgeB,edgeM,edge', '拿卡记录里三档 id 分明', taken);

    console.log('\n— D 无 JS 报错 —');
    ok(jsErrors.length === 0, '整轮没有 JS 报错', jsErrors.slice(0, 3).join(' | '));
  } catch (err) {
    fail++; fails.push('脚本异常：' + err.message);
    console.log('  ✗ 脚本异常：' + err.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    // Chrome 退出慢一点，临时目录会 EBUSY —— 等一下再删，删不掉也不算测试失败
    await sleep(600);
    try { fs.rmSync(UD, { recursive: true, force: true, maxRetries: 3, retryDelay: 400 }); } catch (_) {}
  }
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) { console.log('失败项：'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
})();
