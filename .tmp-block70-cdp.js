// ============================================================
// 第 70 块 CDP：民心专属事件的独立外观（真实渲染）
//   A 良性民心事件：贴顶青绿横幅 + 「民」印章 + 「民心 +2 → 62」
//   B 恶性民心事件：同一版式换暗红（.bad）
//   C 数值真的走链路：队列快照 → 回合末播出来，横幅上就是那个数
//   D 随机事件完全没被影响（仍居中、暖黄、无横幅头栏）
//   E 全程 0 JS 报错 + 截图
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block70-cdp.js`
// ⚠️ 必须带 &title&story（?debug=1 会把叙述全跳过 → 民心事件根本不弹）
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9401;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-70-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block70');
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
    // 面板外观快照：一次 evaluate 全读出来（省往返）
    const look = () => ev(`JSON.stringify((() => {
      const card = document.getElementById('eventCard');
      const box = card.querySelector('.ev-box');
      const bar = document.getElementById('repBar');
      const seal = card.querySelector('.rb-seal');
      const icon = document.getElementById('evIcon');
      const cb = getComputedStyle(box), cc = getComputedStyle(card);
      return {
        cls: card.className,
        cardZ: Number(cc.zIndex),
        toastZ: Number(getComputedStyle(document.getElementById('waveToast')).zIndex || 0),
        alignItems: cc.alignItems,
        boxTop: Math.round(box.getBoundingClientRect().top),
        boxLeft: Math.round(box.getBoundingClientRect().left),
        boxW: Math.round(box.getBoundingClientRect().width),
        textAlign: cb.textAlign,
        bg: cb.backgroundImage,
        border: cb.borderTopColor,
        barDisplay: bar ? getComputedStyle(bar).display : 'none',
        barRectH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
        title: document.getElementById('rbTitle').textContent,
        delta: document.getElementById('rbDelta').textContent,
        deltaHTML: document.getElementById('rbDelta').innerHTML,
        sealColor: seal ? getComputedStyle(seal).backgroundImage : '',
        iconDisplay: icon ? getComputedStyle(icon).display : '',
        evTitleDisplay: getComputedStyle(document.getElementById('evTitle')).display,
        foot: document.getElementById('evFoot').textContent,
        state: __game.state,
      };
    })())`).then(JSON.parse);

    async function startRun() {
      await ev('__game.block64.tut.start(), 1');
      await waitFor("__game.state === 'tutorial'", 30000, '进入 tutorial');
      await sleep(600);
      await ev('__game.block64.tut.skip(), 1');
      await waitFor("__game.state === 'playing'", 30000, '进入 playing');
      await sleep(700);
      await clearOverlays();
    }

    // 点一个能点的选项（读秒锁时轮着等）
    async function pickOption() {
      for (let k = 0; k < 10; k++) {
        const done = await ev('__game.event.choose(0)');
        if (done) return true;
        await sleep(800);
      }
      return false;
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
    ok(await ev('__game.state') === 'title', '开局停在标题页', await ev('__game.state'));

    await startRun();

    // ============================================================
    console.log('\n[A] 良性民心事件：贴顶青绿横幅 + 民心 +2 → 62');
    // ============================================================
    await ev("__game.event.trigger('repGoodLamp', 8, { rep: true, delta: 2, total: 62 }), 1");
    await waitFor("__game.event.isOpen()", 8000, '民心事件打开');
    await sleep(520);
    const a = await look();
    console.log('     ' + JSON.stringify({ cls: a.cls, top: a.boxTop, align: a.textAlign, delta: a.delta }));

    ok(/rep/.test(a.cls), '卡片挂上 .rep（民心版式）', a.cls);
    ok(!/bad/.test(a.cls), '良性事件没有 .bad', a.cls);
    ok(a.barDisplay === 'flex', '横幅头栏显示出来了', a.barDisplay);
    ok(a.barRectH > 30, '头栏真有高度（不是零高占位）', a.barRectH + 'px');
    ok(a.title === '门前的灯', '头栏标题就是事件标题', a.title);
    ok(a.delta.replace(/\s/g, '').includes('+2'), '徽章打出「+2」', a.delta);
    ok(a.delta.replace(/\s/g, '').includes('→62'), '徽章打出「→ 62」', a.delta);
    ok(/<b>/.test(a.deltaHTML), '数值是加粗强调的', a.deltaHTML);
    ok(a.iconDisplay === 'none', '原 emoji 图标藏起来了（换成「民」印章）', a.iconDisplay);
    ok(a.evTitleDisplay === 'none', '原居中大标题藏起来了', a.evTitleDisplay);
    ok(a.alignItems === 'flex-start', '整体贴顶（align-items:flex-start，不是居中）', a.alignItems);
    ok(a.boxTop <= 60, '卡片确实落在屏幕顶部', a.boxTop + 'px');
    ok(a.textAlign === 'left', '正文左对齐（事件卡是居中）', a.textAlign);
    ok(/rgba?\(16, 40, 36/.test(a.bg), '底色是深青绿', (a.bg || '').slice(0, 90));
    ok(/rgba\(224, 196, 120/.test(a.bg), '顶部那道金线在', (a.bg || '').slice(0, 90));
    ok(/rgba\(118, 214, 186/.test(a.border), '描边是青绿色', a.border);
    ok(a.foot.includes('民心记在村里的账上'), '脚注换成了民心版（不是随机事件那句）', a.foot);
    ok(a.state === 'event', '弹卡时世界处于 event 状态（照旧冻结）', a.state);
    ok(a.cardZ > a.toastZ, `横幅盖得住「第 N 回合」飘字（${a.cardZ} > ${a.toastZ}）`,
      a.cardZ + ' vs ' + a.toastZ);
    await shot('a-rep-good.png');

    // 玩法还得通：选一项 → 结果页 → 继续
    ok(await pickOption(), '选项能点（读秒锁没被样式改动影响）');
    await sleep(450);
    ok(await ev('__game.event.isResultOpen()'), '结果页正常打开');
    ok((await ev('__game.event.resultLines.length')) > 0, '结果页有结算条目',
      JSON.stringify(await ev('JSON.stringify(__game.event.resultLines)')));
    await shot('a-rep-result.png');
    await ev('__game.event.next(), 1');
    await sleep(500);
    ok(await ev('__game.event.isOpen()') === false, '继续能关掉卡片');
    const closed = await ev("document.getElementById('eventCard').className");
    ok(!/rep/.test(closed) && !/bad/.test(closed), '关掉后 .rep / .bad 都清掉了（不带到下一张）', closed);
    ok(await ev("document.getElementById('evFoot').textContent.includes('抉择之后')"),
      '脚注还原成随机事件那句');

    // ============================================================
    console.log('\n[B] 恶性民心事件：同一版式换暗红');
    // ============================================================
    await ev("__game.event.trigger('repBadCross', 9, { rep: true, delta: -8, total: 32 }), 1");
    await waitFor("__game.event.isOpen()", 8000, '恶性民心事件打开');
    await sleep(520);
    const b = await look();
    console.log('     ' + JSON.stringify({ cls: b.cls, delta: b.delta, border: b.border }));

    ok(/rep/.test(b.cls) && /bad/.test(b.cls), '挂上 .rep.bad', b.cls);
    ok(/rgba\(44, 22, 22/.test(b.bg), '底色换成暗红', (b.bg || '').slice(0, 90));
    ok(/rgba\(228, 126, 116/.test(b.border), '描边换成暗红', b.border);
    ok(/rgba?\(232, 182, 166/.test(b.sealColor), '印章也换了色（不是只有底变了）', b.sealColor);
    ok(/−8/.test(b.delta) && /→32/.test(b.delta.replace(/\s/g, '')), '掉民心用「−8 → 32」（真减号）', b.delta);
    ok(b.alignItems === 'flex-start' && b.barDisplay === 'flex', '还是贴顶横幅（版式统一）', b.alignItems);
    await shot('b-rep-bad.png');
    await pickOption();
    await sleep(400);
    await ev('__game.event.next(), 1');
    await sleep(500);
    ok(!/bad/.test(await ev("document.getElementById('eventCard').className")), '关掉后 .bad 也清掉');

    // ============================================================
    console.log('\n[C] 数值走真链路：跨档快照 → 回合末播出来');
    // ============================================================
    await ev('__game.repEv.clear(), 1');
    const before = await ev('__game.rep');
    const goal = before < 60 ? 62 : before < 80 ? 82 : before < 100 ? 102 : before + 10;
    await ev(`__game.addRep(${goal - before}), 1`);
    const after = await ev('__game.rep');
    const full = JSON.parse(await ev('JSON.stringify(__game.repEv.queueFull())'));
    ok(full.length === 1, '跨档排进一条民心事件', JSON.stringify(full));
    ok(full[0] && full[0].delta === after - before,
      `快照里的 delta = 实际涨幅 ${after - before}`, full[0] && String(full[0].delta));
    ok(full[0] && full[0].total === after, '快照里的 total = 当前民心', full[0] && String(full[0].total));
    ok(full[0] && typeof full[0].id === 'string', '队列元素还带 id', full[0] && full[0].id);
    ok(JSON.parse(await ev('JSON.stringify(__game.repEv.queue())'))[0] === (full[0] && full[0].id),
      'repEv.queue() 仍返回 id 字符串（老测试兼容）');

    // 真的走到回合末：随机事件 →（三选一）→ 民心事件
    await ev('__game.handleRoundClear(9), 1');
    let repSeen = null;
    const stuck = [];
    for (let guard = 0; guard < 300; guard++) {
      const st = await ev('__game.state');
      if (guard % 25 === 0) stuck.push(st);
      if (st === 'playing') break;
      // 过渡态不处理会一直空转（hint = 第 65 块的一次性提示卡，会把世界冻住）
      if (st === 'hint') { await ev("document.getElementById('hiOk')?.click(), 1"); await sleep(320); continue; }
      if (st === 'wtut') { await ev("document.getElementById('wtSkip')?.click(), 1"); await sleep(320); continue; }
      if (st === 'meet') { await ev("document.getElementById('mtOk')?.click(), 1"); await sleep(320); continue; }
      if (st === 'weapon') { await ev("document.getElementById('wcOk')?.click(), 1"); await sleep(520); continue; }
      if (st === 'tutorial') { await ev('__game.block64.tut.skip(), 1'); await sleep(320); continue; }
      if (st === 'event') {
        const cls = await ev("document.getElementById('eventCard').className");
        if (/rep/.test(cls)) {
          await sleep(450);
          repSeen = await look();
          break;
        }
        if (await ev('__game.event.isResultOpen()')) { await ev('__game.event.next(), 1'); await sleep(400); continue; }
        for (let k = 0; k < 10; k++) { if (await ev(`__game.event.choose(${k})`)) break; await sleep(800); }
        await sleep(400);
        continue;
      }
      if (st === 'upgrade') {
        await ev("document.querySelector('#upList .up-item').click(), 1");
        await sleep(520);
        continue;
      }
      if (st === 'shop') { await ev("document.getElementById('shClose').click(), 1"); await sleep(520); continue; }
      await sleep(400);
    }
    ok(!!repSeen, '回合末真的弹出了民心事件（不是手动 trigger）', '经过状态: ' + stuck.join(' → '));
    if (repSeen) {
      console.log('     ' + JSON.stringify({ cls: repSeen.cls, delta: repSeen.delta, title: repSeen.title }));
      ok(/rep/.test(repSeen.cls), '真实链路上也是横幅版式', repSeen.cls);
      ok(repSeen.delta.replace(/\s/g, '').includes('+' + (after - before)),
        `横幅打出的涨幅 = 实际涨幅 +${after - before}`, repSeen.delta);
      ok(repSeen.delta.replace(/\s/g, '').includes('→' + after), `横幅打出的总数 = ${after}`, repSeen.delta);
      await shot('c-rep-live.png');
      await pickOption();
      await sleep(400);
      await ev('__game.event.next(), 1');
      await sleep(500);
    }

    // 清干净，别让「这一夜」的余波影响 D 段
    for (let guard = 0; guard < 120; guard++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'hint') { await ev("document.getElementById('hiOk')?.click(), 1"); await sleep(300); continue; }
      if (st === 'wtut') { await ev("document.getElementById('wtSkip')?.click(), 1"); await sleep(300); continue; }
      if (st === 'meet') { await ev("document.getElementById('mtOk')?.click(), 1"); await sleep(300); continue; }
      if (st === 'weapon') { await ev("document.getElementById('wcOk')?.click(), 1"); await sleep(480); continue; }
      if (st === 'event') {
        if (await ev('__game.event.isResultOpen()')) { await ev('__game.event.next(), 1'); await sleep(350); continue; }
        for (let k = 0; k < 10; k++) { if (await ev(`__game.event.choose(${k})`)) break; await sleep(800); }
        await sleep(350);
        continue;
      }
      if (st === 'upgrade') { await ev("document.querySelector('#upList .up-item').click(), 1"); await sleep(450); continue; }
      if (st === 'shop') { await ev("document.getElementById('shClose').click(), 1"); await sleep(450); continue; }
      await sleep(350);
    }

    // ============================================================
    console.log('\n[D] 随机事件没被影响（回归）');
    // ============================================================
    await ev('__game.enemies.killAll(), 1');
    await sleep(300);
    await ev("__game.event.trigger('coldWave', 10), 1");
    await waitFor("__game.event.isOpen()", 8000, '随机事件打开');
    await sleep(520);
    const d = await look();
    console.log('     ' + JSON.stringify({ cls: d.cls, top: d.boxTop, align: d.alignItems, bar: d.barDisplay }));

    ok(!/rep/.test(d.cls) && !/bad/.test(d.cls), '随机事件没挂 .rep / .bad', d.cls);
    ok(d.barDisplay === 'none', '随机事件的横幅头栏不显示', d.barDisplay);
    ok(d.iconDisplay !== 'none', 'emoji 图标照旧显示', d.iconDisplay);
    ok(d.evTitleDisplay !== 'none', '居中大标题照旧显示', d.evTitleDisplay);
    ok(d.alignItems === 'center', '还是垂直居中（没被改成贴顶）', d.alignItems);
    ok(d.textAlign === 'center', '正文还是居中', d.textAlign);
    ok(d.boxTop > 60, '卡片不在顶部（居中摆放）', d.boxTop + 'px');
    ok(/rgba\(30, 28, 18/.test(d.bg), '底色还是暖黄木门', (d.bg || '').slice(0, 90));
    ok(d.foot.includes('抉择之后'), '脚注还是原来那句', d.foot);
    await shot('d-normal-event.png');

    // 切回民心：确认 class 不会互相污染
    await ev('__game.event.close(), 1');
    await sleep(300);
    await ev("__game.event.trigger('repGoodBread', 11, { rep: true, delta: 2, total: 64 }), 1");
    await waitFor("__game.event.isOpen()", 8000, '再来一条民心事件');
    await sleep(400);
    const e2 = await look();
    ok(/rep/.test(e2.cls) && e2.alignItems === 'flex-start' && e2.barDisplay === 'flex',
      '切回民心事件仍然正常（无残留污染）', e2.cls + ' / ' + e2.alignItems);
    await ev('__game.event.close(), 1');

    // ============================================================
    console.log('\n[E] JS 报错');
    // ============================================================
    const realErrors = jsErrors.filter((e) => e && !/favicon|net::ERR_/i.test(e));
    ok(realErrors.length === 0, '全程 0 JS 报错', realErrors.slice(0, 3).join(' | '));

    console.log('\n============================');
    console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败');
    if (fails.length) { console.log('  失败项：'); fails.forEach((f) => console.log('   - ' + f)); }
    console.log('  截图：' + OUT);
    console.log('============================');
  } catch (err) {
    console.log('\n中断：' + err.message);
    console.log('已通过 ' + pass + ' / 失败 ' + fail);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(400);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
