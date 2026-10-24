// ============================================================
// 第 67 块 CDP：民心跨档事件的播放时序（用户定案）
//   A 这一回合**有**三选一 → 随机事件 → 三选一 → 民心事件
//   B 这一回合**没有**三选一 → 随机事件 → 民心事件（立刻弹，中间不插升级）
//   C 民心事件不再留到下一回合（drain 结束时队列空）
//   D 关底（第 20 回合）照播，不被结算吞掉（第 65 块的回归）
//   E 全程 0 JS 报错 + 截图
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block67-cdp.js`
//
// ⚠️ 必须带 &story：?debug=1 会 DEBUG_SKIP_NARRATIVE=true，整段叙述被跳过，
//    民心事件和随机事件都不会弹（第 65 块踩过这个坑，白测半天）。
// ⚠️ 第一关主线前三夜绑在第 2 回合，测第 7/8/20 回合不会撞上「夜」。
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9392;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-67-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block67');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&story';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });

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
    async function waitFor(expr, ms = 60000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      let st = '';
      try { st = '（当前 state=' + (await ev('__game.state')) + '）'; } catch (_) {}
      throw new Error('等待超时: ' + label + st);
    }
    async function shot(name) {
      await ev(`['packGet','noticeOv','promoOv','signOv'].forEach((i) => {
        const el = document.getElementById(i);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
      }); 1`);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }
    async function clearOverlays() {
      await ev(`['noticeOv','promoOv','signOv','packGet'].forEach((i) => {
        const el = document.getElementById(i);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); el.style.display = 'none'; }
      }); 1`);
    }

    // ---- 起一局（跳过新手教程）----
    async function startRun(tag) {
      await ev('__game.block64.tut.start(), 1');
      await waitFor("__game.state === 'tutorial'", 30000, '进入 tutorial（' + tag + '）');
      await sleep(600);
      await ev('__game.block64.tut.skip(), 1');
      await waitFor("__game.state === 'playing'", 30000, '进入 playing（' + tag + '）');
      await sleep(600);
      await clearOverlays();
    }

    // ---- 造一次「民心跨档」（走真实的 addRep → queueRepEvent）----
    async function crossTier() {
      await ev('__game.repEv.clear(), 1');
      const before = await ev('__game.rep');
      const target = before < 60 ? 62 : before < 80 ? 82 : before < 100 ? 102 : before + 10;
      await ev(`__game.addRep(${target - before}), 1`);
      const after = await ev('__game.rep');
      const queue = JSON.parse(await ev('JSON.stringify(__game.repEv.queue())'));
      return { before, after, queue };
    }

    // ---- 把事件 / 三选一 / 商店一轮点完，记录面板顺序 ----
    // 返回 seq：例如 ['event','upgrade','rep']（连续同名的只记一次）
    async function drain(label, shotWhenRep) {
      const seq = [];
      const repTitles = [];
      const push = (tag) => { if (seq[seq.length - 1] !== tag) seq.push(tag); };
      for (let guard = 0; guard < 160; guard++) {
        const st = await ev('__game.state');
        if (st === 'playing') break;
        if (st === 'event') {
          if (await ev('__game.event.isResultOpen()')) {
            await ev('__game.event.next(), 1');
            await sleep(420);
            continue;
          }
          const title = await ev("document.getElementById('evTitle').textContent");
          const isRep = await ev(`__game.repEv.pools().good.concat(__game.repEv.pools().bad)
            .some((e) => e.title === ${JSON.stringify(title)})`);
          push(isRep ? 'rep' : 'event');
          if (isRep) {
            repTitles.push(title);
            if (shotWhenRep && repTitles.length === 1) { await sleep(500); await shot(shotWhenRep); }
          }
          // 选项按钮在「多拍对话」时会被读秒置灰（第 42 块的 3 秒）→ 轮着试，等它活
          let clicked = false;
          for (let k = 0; k < 8 && !clicked; k++) {
            clicked = await ev(`__game.event.choose(${k})`);
            if (!clicked) await sleep(900);
          }
          if (!clicked) {
            console.log('     （' + label + '：事件「' + title + '」选项点不动，等一下）');
            await sleep(1600);
          }
          await sleep(420);
          continue;
        }
        if (st === 'upgrade') {
          push('upgrade');
          await ev("document.querySelector('#upList .up-item').click(), 1");
          await sleep(520);
          continue;
        }
        if (st === 'shop') {
          push('shop');
          await ev("document.getElementById('shClose').click(), 1");
          await sleep(520);
          continue;
        }
        // tutorial / wtut / hint 之类的过渡态：等一等
        await sleep(500);
      }
      return { seq, repTitles };
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(1500);
    await clearOverlays();

    // 自检：确实没被 debug 跳过叙述（不然整场全是假绿）
    ok(await ev('__game.state') === 'title', '开局停在标题页（&title 生效）', await ev('__game.state'));

    // ============================================================
    console.log('\n[A] 这一回合有三选一（第 8 回合）→ 事件 → 三选一 → 民心事件');
    // ============================================================
    await startRun('A');
    const cA = await crossTier();
    ok(cA.after > cA.before, '民心真的涨了', cA.before + ' → ' + cA.after);
    ok(cA.queue.length === 1, '跨档 → 队列里排了一条民心事件', JSON.stringify(cA.queue));
    const repPool = JSON.parse(await ev('JSON.stringify(__game.repEv.pools().good.concat(__game.repEv.pools().bad).map((e) => e.title))'));
    ok(repPool.length >= 5, '民心事件池子有内容', String(repPool.length));

    await ev('__game.handleRoundClear(8), 1');
    const dA = await drain('A', 'a-rep-event.png');
    console.log('     面板顺序: ' + JSON.stringify(dA.seq) + ' | 民心事件: ' + JSON.stringify(dA.repTitles));
    ok(dA.seq.includes('event'), '随机事件先弹（真实链路，不是手动触发）', JSON.stringify(dA.seq));
    ok(dA.seq.includes('upgrade'), '三选一弹了（第 8 回合本该有）', JSON.stringify(dA.seq));
    ok(dA.seq.includes('rep'), '民心事件弹了（用户反馈「还是没弹」的核心）', JSON.stringify(dA.seq));
    ok(dA.seq.indexOf('upgrade') > dA.seq.indexOf('event'), '三选一在随机事件之后',
      JSON.stringify(dA.seq));
    ok(dA.seq.indexOf('rep') > dA.seq.indexOf('upgrade'), '民心事件在三选一**之后**（用户定的顺序）',
      JSON.stringify(dA.seq));
    ok(dA.repTitles.length >= 1 && repPool.includes(dA.repTitles[0]), '弹的确实是民心事件池里的那条',
      dA.repTitles[0]);
    ok((await ev('JSON.stringify(__game.repEv.queue())')) === '[]', '这一回合就播完，不留给下一回合',
      await ev('JSON.stringify(__game.repEv.queue())'));

    // ============================================================
    console.log('\n[B] 这一回合没有三选一（第 7 回合）→ 事件 → 民心事件（立刻）');
    // ============================================================
    await startRun('B');
    const cB = await crossTier();
    ok(cB.queue.length === 1, '跨档排队（B 组）', JSON.stringify(cB.queue));
    await ev('__game.handleRoundClear(7), 1');
    const dB = await drain('B', 'b-rep-immediate.png');
    console.log('     面板顺序: ' + JSON.stringify(dB.seq) + ' | 民心事件: ' + JSON.stringify(dB.repTitles));
    ok(dB.seq.includes('event'), '随机事件弹了（B 组）', JSON.stringify(dB.seq));
    ok(!dB.seq.includes('upgrade'), '第 7 回合没有三选一（前提成立，否则测不到「立刻弹」）',
      JSON.stringify(dB.seq));
    ok(dB.seq.includes('rep'), '民心事件照样弹了（B 组）', JSON.stringify(dB.seq));
    ok(dB.seq.indexOf('rep') > dB.seq.indexOf('event'), '民心事件紧跟在随机事件之后', JSON.stringify(dB.seq));
    ok((await ev('JSON.stringify(__game.repEv.queue())')) === '[]', '队列当场清空（B 组）',
      await ev('JSON.stringify(__game.repEv.queue())'));

    // ============================================================
    console.log('\n[C] 关底（第 20 回合）→ 三选一 → 民心事件，不被结算吞（第 65 块回归）');
    // ============================================================
    await startRun('C');
    const cC = await crossTier();
    ok(cC.queue.length === 1, '跨档排队（C 组）', JSON.stringify(cC.queue));
    await ev('__game.handleRoundClear(20), 1');
    const dC = await drain('C', null);
    console.log('     面板顺序: ' + JSON.stringify(dC.seq) + ' | 民心事件: ' + JSON.stringify(dC.repTitles));
    ok(!dC.seq.includes('event'), '关底不抽随机事件（老规矩）', JSON.stringify(dC.seq));
    ok(dC.seq.includes('rep'), '关底民心事件照播（第 65 块修的那条没有回退）', JSON.stringify(dC.seq));
    ok(dC.seq.indexOf('rep') > dC.seq.indexOf('upgrade'), '关底也是三选一在前、民心在后',
      JSON.stringify(dC.seq));
    ok((await ev('JSON.stringify(__game.repEv.queue())')) === '[]', '关底队列也空了（C 组）',
      await ev('JSON.stringify(__game.repEv.queue())'));

    // ============================================================
    console.log('\n[D] 同一档一局只来一次（不因为改时序变成反复刷）');
    // ============================================================
    await ev('__game.repEv.clear(), 1');
    // 前面几组已经把民心顶到「拥戴」了，先降回中性档，才能再造一次「跨档」
    const repNow = await ev('__game.rep');
    await ev(`__game.addRep(${55 - repNow}), 1`);
    await ev('__game.repEv.clear(), 1');
    const repBefore = await ev('__game.rep');
    await ev('__game.addRep(10), 1');        // 55 → 65：跨到「好感」档
    const q1 = JSON.parse(await ev('JSON.stringify(__game.repEv.queue())'));
    ok(q1.length === 1, '第一次跨到「好感」档 → 排一条', repBefore + ' → ' + await ev('__game.rep') + ' ' + JSON.stringify(q1));
    await ev('__game.repEv.clear(), 1');   // 只清队列，不回头数 fired
    await ev('__game.addRep(1), 1');        // 已经在这一档里，不再跨档
    const q2 = JSON.parse(await ev('JSON.stringify(__game.repEv.queue())'));
    ok(q2.length === 0, '同一档内加减民心不会再排（没跨档）', JSON.stringify(q2));

    // ============================================================
    console.log('\n[E] 全程 0 条 JS 报错');
    // ============================================================
    const realErrors = jsErrors.filter((e) => !/favicon|net::ERR_/i.test(e));
    ok(realErrors.length === 0, '没有 JS 报错', realErrors.slice(0, 3).join(' | '));
  } catch (e) {
    console.error('运行出错:', e.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
    if (fails.length) console.log('失败项:\n  - ' + fails.join('\n  - '));
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
