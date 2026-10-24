// ============================================================
// 探针 → 验证（第 66 块两个 bug）
//   ① 新手/武器教程期间，箭雨按了没反应
//   ② 事件卡 / 三选一的按钮「很迟钝」（隐形「知道了」按钮吃点击）
//
// 跑法：先起 8124 服务器，再 node .tmp-block66-probe.js
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9386;
const UD = path.join(os.tmpdir(), 'naiwa-probe66-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block66');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 失败')); });

    let id = 0;
    const pending = new Map();
    const jsErrors = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') jsErrors.push((m.params.args || []).map((a) => a.value || '').join(' '));
      if (m.method === 'Runtime.exceptionThrown') jsErrors.push((m.params.exceptionDetails?.exception?.description || '').split('\n')[0]);
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
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    }
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('超时: ' + label);
    }
    // 在按钮中心派发一次真 pointerdown（技能键就是靠它触发的）
    async function tapSkill(id) {
      return ev(`(() => {
        const b = [...document.querySelectorAll('#skillBar .sk')].find((x) => x.dataset.skill === '${id}');
        if (!b) return 'no-button';
        const r = b.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const top = document.elementFromPoint(x, y);
        const same = top === b || b.contains(top);
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return JSON.stringify({ hitSelf: same, top: top ? (top.id ? '#' + top.id : top.tagName) : 'null' });
      })()`);
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game');
    await sleep(900);

    await ev(`(() => {
      const rec = {};
      for (const id of [1, 2, 3, 4]) rec[id] = { wins: 1, bestTime: 120, bestKills: 200, bestRound: 20 };
      localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify(rec));
      const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
      p.ringGot = true; p.rainGot = true; p.heal = { unlocked: true };
      p.tut = { heal: true, cast: true };
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
      return 1;
    })()`);
    await send('Page.reload', { ignoreCache: true });
    await waitFor('!!window.__game', 90000, '__game2');
    await sleep(1400);
    const killOverlays = `(() => {
      ['noticeOv','promoOv','signOv','packGet','titleScr'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); if (id === 'titleScr') el.style.display = 'none'; }
      });
      return 1;
    })()`;
    await ev(killOverlays);
    await sleep(300);

    // ============================================================
    log('\n[A] 收起的卡片不再参与命中测试（「迟钝」的根因）');
    // ============================================================
    const hi = JSON.parse(await ev(`(() => {
      const okb = document.querySelector('#hintCard .hi-ok');
      const card = document.getElementById('hintCard');
      const r = okb.getBoundingClientRect();
      const cc = getComputedStyle(card), cs = getComputedStyle(okb);
      return JSON.stringify({
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        cardOn: card.classList.contains('on'),
        cardVisibility: cc.visibility,
        cardPointerEvents: cc.pointerEvents,
        okPointerEvents: cs.pointerEvents,
        okVisibility: cs.visibility,
      });
    })()`));
    log('  卡片状态:', JSON.stringify(hi));
    ok(hi.cardOn === false, '提示卡是收起状态');
    ok(hi.cardVisibility === 'hidden', '收起的卡片 visibility:hidden（不再参与命中）', hi.cardVisibility);
    ok(hi.okPointerEvents === 'none', '「知道了」按钮不吃点击了', hi.okPointerEvents);
    const cx = Math.round(hi.rect.x + hi.rect.w / 2), cy = Math.round(hi.rect.y + hi.rect.h / 2);
    const topAtHi = await ev(`(() => { const el = document.elementFromPoint(${cx}, ${cy}); return el ? (el.id ? '#' + el.id : el.tagName + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '')) : 'null'; })()`);
    ok(!/hiOk/i.test(topAtHi), '隐形按钮那块位置不再命中 #hiOk', topAtHi);

    // 打开提示卡 → 按钮应恢复可点
    await ev('__game.block65.hint.forget("heal"), __game.block65.hint.show("heal"), 1');
    await sleep(500);
    const hiOn = JSON.parse(await ev(`(() => {
      const okb = document.querySelector('#hintCard .hi-ok'); const card = document.getElementById('hintCard');
      return JSON.stringify({ on: card.classList.contains('on'), vis: getComputedStyle(card).visibility,
        pe: getComputedStyle(okb).pointerEvents });
    })()`));
    ok(hiOn.on === true && hiOn.vis === 'visible', '打开时卡片真的可见', JSON.stringify(hiOn));
    ok(hiOn.pe === 'auto', '打开时「知道了」可点', hiOn.pe);
    await ev('document.getElementById("hiOk").click(), 1');
    await sleep(400);
    ok(await ev('__game.block65.hint.open()') === false, '点「知道了」能关掉');

    // ============================================================
    log('\n[B] 三选一：第二张卡（原来被隐形按钮压住的那张）现在整张可点');
    // ============================================================
    // 三选一是局内面板：先起一局（跳过教程）再开
    await ev('__game.block64.tut.start(), 1');
    await waitFor("__game.state === 'tutorial'", 20000, '进入 tutorial（B 段）');
    await sleep(700);
    await ev('__game.block64.tut.skip(), 1');
    await sleep(700);
    await ev(killOverlays);
    await ev('__game.upgrade.show(1), 1');
    await sleep(700);
    ok(await ev('__game.upgrade.isOpen()') === true, '三选一打开了');
    const cards = JSON.parse(await ev(`(() => JSON.stringify([...document.querySelectorAll('#upgrade .up-item')].map((b) => {
      const r = b.getBoundingClientRect();
      const pts = [0.25, 0.5, 0.75].map((f) => {
        const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height * f);
        const el = document.elementFromPoint(x, y);
        return { f, ok: !!(el && (el === b || b.contains(el))), top: el ? (el.id ? '#' + el.id : el.tagName) : 'null' };
      });
      return { id: b.dataset.id, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], pts };
    })))()`));
    log('  三张卡:', JSON.stringify(cards, null, 1).slice(0, 800));
    ok(cards.length === 3, '渲染出三张卡', String(cards.length));
    const allPts = cards.every((c) => c.pts.every((p) => p.ok));
    ok(allPts, '三张卡的上/中/下三个点都命中自己（没有隐形层挡着）',
      JSON.stringify(cards.map((c) => c.pts.filter((p) => !p.ok))));

    // 真点第二张卡：应该真的选中并关掉面板
    const before = await ev('__game.state');
    await ev(`(() => { const b = document.querySelectorAll('#upgrade .up-item')[1]; b.click(); return 1; })()`);
    await sleep(700);
    ok(await ev('__game.state') !== before || await ev('__game.upgrade.isOpen()') === false,
      '点第二张卡真的生效了（面板关掉 / 状态推进）',
      'state=' + await ev('__game.state') + ' open=' + await ev('__game.upgrade.isOpen()'));

    // ============================================================
    log('\n[B2] 随机事件卡：选项按钮也不被隐形层挡住');
    // ============================================================
    await ev('__game.enemies.killAll(), 1');
    await ev('__game.event.trigger("wallet", 1), 1');
    await sleep(800);
    ok(await ev('__game.event.isOpen()') === true, '事件卡打开了',
      'state=' + await ev('__game.state'));
    const evBtns = JSON.parse(await ev(`(() => JSON.stringify([...document.querySelectorAll('#evChoices .ev-btn')].map((b) => {
      const r = b.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      const top = document.elementFromPoint(x, y);
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        hitSelf: !!(top && (top === b || b.contains(top))),
        top: top ? (top.id ? '#' + top.id : top.tagName) : 'null' };
    })))()`));
    log('  选项按钮:', JSON.stringify(evBtns));
    ok(evBtns.length >= 2, '事件卡有多个选项', String(evBtns.length));
    ok(evBtns.every((b) => b.hitSelf), '每个选项按钮中心都命中自己（没有被隐形层吃掉）',
      JSON.stringify(evBtns.filter((b) => !b.hitSelf)));

    // ============================================================
    log('\n[C] 新手教程期间技能栏要看得见（原来整栏 display:none）');
    // ============================================================
    await ev('__game.block64.tut.start(), 1');
    await waitFor("__game.state === 'tutorial'", 20000, '进入 tutorial');
    await sleep(800);
    ok(await ev('__game.state') === 'tutorial', '状态是 tutorial');
    const skTut = JSON.parse(await ev(`(() => JSON.stringify([...document.querySelectorAll('#skillBar .sk')].map((b) => ({
      id: b.dataset.skill, display: getComputedStyle(b).display,
    }))))()`));
    log('  tutorial 期间的技能键:', JSON.stringify(skTut));
    ok(skTut.some((s) => s.display !== 'none' && s.id === 'swordRain'), '教程期间环剑键是可见的（第 5 步讲技能栏时有东西可看）',
      JSON.stringify(skTut));
    ok(skTut.some((s) => s.display !== 'none' && s.id === 'arrowRain'), '教程期间箭雨键也是可见的');
    ok(await ev('__game.arrowRain.state().unlocked') === true, '箭雨已经解锁（老玩家重打第一关）');

    // ============================================================
    log('\n[D] 箭雨教程：场上没怪时自动补靶子，按下去能放');
    // ============================================================
    await ev('__game.block64.tut.skip(), 1');
    await sleep(600);
    await ev(killOverlays);
    // 清空场上所有怪，模拟「回合结算后 / 刚开局」的真实场景
    await ev('__game.enemies.killAll(), 1');
    await ev('__game.wtut.resetSeen(), 1');
    await sleep(400);
    log('  清场后活怪:', await ev('__game.enemies.list.filter((e) => e.state !== "dead" && e.state !== "spawn").length'));
    await ev('__game.wtut.show("arrowrain"), 1');
    await sleep(600);
    // 可能先弹 ring 教程（如果它还没教过），一路点到 arrowrain
    for (let i = 0; i < 12; i++) {
      const kind = await ev('__game.wtut.kind()');
      if (kind === 'arrowrain') break;
      const openNow = await ev('__game.wtut.open()');
      if (!openNow) { await ev('__game.wtut.show("arrowrain"), 1'); }
      else { await ev('__game.wtut.next(), 1'); }
      await sleep(500);
    }
    ok(await ev('__game.wtut.kind()') === 'arrowrain', '箭雨教程开了', await ev('JSON.stringify({kind: __game.wtut.kind(), open: __game.wtut.open()})'));

    // 快进到最后一步（wait:'rain'）
    for (let i = 0; i < 6; i++) {
      const step = await ev('__game.wtut.step()');
      const steps = await ev('__game.wtut.steps()');
      if (step >= steps - 1) break;
      await ev('__game.wtut.next(), 1');
      await sleep(400);
    }
    log('  教程进度:', await ev('__game.wtut.step()') + '/' + await ev('__game.wtut.steps()'), '| 文案:', await ev('__game.wtut.title()'));

    // 靶子应该自动补出来
    let hadTarget = false;
    for (let i = 0; i < 20; i++) {
      hadTarget = await ev('__game.arrowRain.hasTarget(__game.pos)');
      if (hadTarget) break;
      await sleep(400);
    }
    const liveCount = await ev('__game.enemies.list.filter((e) => e.state !== "dead" && e.state !== "spawn" && !e.ghostHidden).length');
    ok(hadTarget, '教程最后一步自动补了靶子（原来这里 0 只怪 → 按了没反应）', 'live=' + liveCount);

    const tapRes = await tapSkill('arrowRain');
    log('  点箭雨键:', tapRes);
    await sleep(900);
    const st = JSON.parse(await ev('JSON.stringify(__game.arrowRain.state())'));
    ok(st.strikes > 0 || st.cdLeft > 0, '真点技能键把箭雨放出去了', JSON.stringify(st));
    await sleep(900);
    // 放出去之后 wtTick 会 wtAdvance → 教程走完 → 队列里下一个（ring）接着弹，
    // 所以不能看 step（会归零重来），要看「arrowrain 这一课已经记成教过」。
    const seenList = await ev('JSON.stringify(__game.wtut.seen())');
    ok(seenList.includes('arrowrain'), '教程因此走完了（arrowrain 记成已教）', seenList + ' | kind=' + await ev('__game.wtut.kind()'));

    // ============================================================
    log('\n[E] 空地按箭雨：仍然不放，但会冒一句提示');
    // ============================================================
    // 重开一局，确保真的在 playing（上一步选完卡会把面板又弹出来，状态不干净）
    await ev('__game.block64.tut.start(), 1');
    await waitFor("__game.state === 'tutorial'", 20000, '进入 tutorial（E 段）');
    await sleep(700);
    await ev('__game.block64.tut.skip(), 1');
    await sleep(900);
    await ev(`(() => {
      let guard = 0;
      while (window.__game.wtut.open() && guard++ < 10) window.__game.wtut.close();
      return 1;
    })()`);
    await sleep(500);
    await ev(killOverlays);
    await ev('__game.enemies.killAll(), 1');
    await sleep(700);
    log('  当前 state:', await ev('__game.state'), '| 活怪:',
      await ev('__game.enemies.list.filter((e) => e.state !== "dead" && e.state !== "spawn").length'));

    const before2 = await ev('__game.arrowRain.state().strikes');
    const okFire = await ev('__game.arrowRain.fire()');
    await sleep(300);
    const after2 = await ev('__game.arrowRain.state().strikes');
    ok(okFire === false, '空地调用 fire() 返回 false（不会白扔 8 秒 CD）', String(okFire));
    ok(after2 === before2, '没有生成箭雨（strikes 不变）', before2 + ' → ' + after2);
    ok(await ev('__game.arrowRain.lastFail()') === 'notarget', '失败原因是 notarget（给了提示的引子）',
      String(await ev('__game.arrowRain.lastFail()')));

    // ============================================================
    log('\n[F] 全程 0 条 JS 报错');
    // ============================================================
    const noise = jsErrors.filter((e) => e && !/favicon|404|net::ERR/.test(e));
    ok(noise.length === 0, '没有 JS 报错', noise.slice(0, 3).join(' | '));

    // 截图留证
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'f-final.png'), Buffer.from(r.data, 'base64'));

  } catch (err) {
    fail++;
    fails.push('异常: ' + err.message);
    log('\n✗ 异常:', err.message);
  } finally {
    try { ws?.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); }
  process.exit(fail ? 1 : 0);
})();
