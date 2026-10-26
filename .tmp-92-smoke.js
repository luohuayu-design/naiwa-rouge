// 第 92 块 · 冒烟：结算页「回到主界面」不再刷新整页
//   ① 死亡结算 → 点按钮 → 直接回标题页（页面**没有**重新加载：navMark / timeOrigin 都不变）
//   ② 回标题后再开一局 → 站位归零、奶蛙姿势扶正、攻击范围环重新可见（这三样原来靠刷新复位）
//   ③ 首次通关（有永夜火种）→ 按钮文案变成「领取 N 次永夜火种」，领完同样回标题页
//   ④ 音效包卡（首通 1.4 秒后弹）被一起收掉，不会糊在标题页上
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-92-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9392;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-92smoke');
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
    async function settle(max = 60) {
      for (let i = 0; i < max; i++) {
        const st = await ev('__game.state');
        if (st === 'playing') return true;
        if (st === 'hint') await ev('document.getElementById("hiOk").click()');
        else if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
        else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
        else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
        else if (st === 'tutorial') await ev('__game.tutorial.skip()');
        else break;
        await sleep(160);
      }
      return (await ev('__game.state')) === 'playing';
    }
    async function boot() {
      await ev('__game.setPendingLevel(1)');
      await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
      await sleep(900);
      return settle();
    }
    // 页面「有没有被重新加载」的两把尺子：
    //   · window.__navMark 是脚本自己打的标记，刷新就没了；
    //   · performance.timeOrigin 是文档创建时刻，刷新会变。
    const navMark = async () => ev('({ mark: window.__navMark || 0, origin: performance.timeOrigin })');
    const visible = (sel) => ev(`(() => { const el = document.querySelector('${sel}'); if (!el) return false;
      const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; })()`);

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    console.log('\n[1] 页面与版本');
    const mainSrc = await ev(`(() => { const s = document.querySelector('script[src*="main.js"]'); return s ? s.src : ''; })()`);
    const idxSrc = await ev(`fetch('index.html').then(r => r.text())`);
    const ver = (idxSrc.match(/v=(\d+)/) || [])[1] || '';
    ok(ver && new RegExp('v=' + ver).test(mainSrc), `main.js 与 index.html 同版本（v=${ver}）`, mainSrc);
    ok(await boot(), '世界进入 playing', await ev('__game.state'));
    await ev('window.__navMark = 1');
    const nav0 = await navMark();

    // ---------- 2. 死亡结算 → 回主界面（不刷新） ----------
    console.log('\n[2] 倒下 →「回到主界面」');
    for (let i = 0; i < 20 && (await ev('__game.state')) !== 'over'; i++) {
      await ev('__game.hurt(999)');
      await sleep(160);
    }
    ok((await ev('__game.state')) === 'over', '生命归零后进入结算（over）', await ev('__game.state'));
    await sleep(1200);                      // 失败提示 900ms 后才弹，等它出来再点
    ok(await ev('__game.failTip.on()'),
      '失败提示已经弹出（这一层也要被一起收掉）', String(await ev('__game.failTip.on()')));
    const btnText = await ev('document.getElementById("rsBtn").textContent');
    ok(btnText === '回到主界面', `按钮文案是「回到主界面」（实际：${btnText}）`, btnText);

    await ev('document.getElementById("rsBtn").click()');
    await sleep(700);
    ok((await ev('__game.state')) === 'title', '点一下直接回到 title，不需要重开页面', await ev('__game.state'));
    const nav1 = await navMark();
    ok(nav1.mark === 1, '页面没有被重新加载（window 上的标记还在）', JSON.stringify(nav1));
    ok(Math.abs(nav1.origin - nav0.origin) < 1, '文档创建时刻没变（performance.timeOrigin 一致）',
      `${nav0.origin} → ${nav1.origin}`);
    ok(!(await ev(`document.getElementById('result').classList.contains('on')`)), '结算面板已收起');
    ok(await visible('#titleScr'), '主界面已经显示出来');
    ok(!(await ev('__game.failTip.on()')), '失败提示也收掉了');

    // ---------- 3. 回标题后再开一局：站位 / 姿势 / 范围环 ----------
    console.log('\n[3] 再开一局：结算时收起来的东西都扶正了');
    const before = await ev(`({
      pos: { x: +__game.pos().x.toFixed(2), z: +__game.pos().z.toFixed(2) },
      rotZ: +__game.frog.root.rotation.z.toFixed(3),
      ring: !!__game.playerRing.mesh.visible,
    })`);
    ok(Math.abs(before.rotZ) > 1 || before.ring === false,
      '结算之后确实是「躺着 + 范围环隐藏」的状态（否则这条测试没验证到东西）', JSON.stringify(before));

    // 「开始游戏」按钮本身是打开选关面板（showLevelSel → 难度 → 诅咒 → startRun），
    // 走完整流程会串进升级/商店/教程，这套只关心「开局时的视觉复位」，
    // 所以直接走 beginGame（startRun 最终也是调它）。
    await ev('__game.setPendingLevel(1)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1200);
    ok(await settle(), '再开一局进入 playing', await ev('__game.state'));
    const after = await ev(`({
      pos: { x: +__game.pos().x.toFixed(2), z: +__game.pos().z.toFixed(2) },
      rotZ: +__game.frog.root.rotation.z.toFixed(3),
      ring: !!__game.playerRing.mesh.visible,
      hp: +__game.stats.hp.cur.toFixed(1),
      max: +__game.stats.get('maxHp').toFixed(1),
    })`);
    ok(after.pos.x === 0 && after.pos.z === 0, '主角站位回到原点（不会从上一局死掉的地方开局）', JSON.stringify(after.pos));
    ok(Math.abs(after.rotZ) < 1e-6, '奶蛙站直了（rotation.z = 0）', String(after.rotZ));
    ok(after.ring === true, '攻击范围环重新可见', String(after.ring));
    ok(nav1.origin === (await navMark()).origin, '这一路的开局也没有触发刷新');
    ok(await ev(`(() => { const b = document.getElementById('btnStart'); return !!b && b.textContent === '开始游戏'; })()`),
      '主界面的「开始游戏」按钮没被这次改动碰到');

    // ---------- 4. 首通：按钮变成「领取火种」，领完同样回主界面 ----------
    console.log('\n[4] 首通（有永夜火种）的出口');
    await ev('__game.win()');
    await sleep(1800);                      // 音效包卡 1.4 秒后才弹
    ok((await ev('__game.state')) === 'over', '通关后进入结算', await ev('__game.state'));
    const winBtn = await ev('document.getElementById("rsBtn").textContent');
    ok(/领取\s*\d+\s*次永夜火种/.test(winBtn), `首通时按钮先让你领火种（${winBtn}）`, winBtn);
    const packOn = await ev(`document.getElementById('packGet').classList.contains('on')`);
    ok(packOn, '首通 1.4 秒后弹了「获得新音效包」卡（这一层也要被收掉）', String(packOn));

    await ev('document.getElementById("rsBtn").click()');
    await sleep(500);
    ok((await ev('__game.boons.open()')) === true, '点按钮先打开火种面板', String(await ev('__game.boons.open()')));
    // 领完所有火种（超过 3 次就是多轮）
    for (let i = 0; i < 12 && (await ev('__game.boons.open()')); i++) {
      await ev(`(() => { const b = document.querySelector('#upList .up-item[data-tag="boon"]'); if (b) b.click(); return 1; })()`);
      await sleep(320);
    }
    await sleep(600);
    ok((await ev('__game.boons.open()')) === false, '火种领完了，面板收起');
    ok((await ev('__game.state')) === 'title', '领完火种直接回 title（不再 reload）', await ev('__game.state'));
    const nav2 = await navMark();
    ok(nav2.mark === 1 && Math.abs(nav2.origin - nav0.origin) < 1, '整条路都没有刷新页面', JSON.stringify(nav2));
    ok(!(await ev(`document.getElementById('packGet').classList.contains('on')`)),
      '音效包卡被一起收掉，不会糊在主界面上');
    ok(!(await ev(`document.getElementById('result').classList.contains('on')`)), '结算面板已收起');
    ok(await visible('#titleScr'), '主界面显示正常');
    // 火种待领清零（否则标题页会反复弹面板）
    ok((await ev('__game.boons.pending()')) === 0, '待领火种已清零', String(await ev('__game.boons.pending()')));

    // ---------- 4b. 回主界面后，真实入口还能用 ----------
    console.log('\n[4b] 主界面的「开始游戏」照旧打开选关面板');
    await ev('document.getElementById("btnStart").click()');
    await sleep(600);
    ok(await ev(`(() => { const el = document.getElementById('levelSel');
      const cs = getComputedStyle(el); return cs.display !== 'none' && +cs.opacity > 0.05; })()`),
      '选关面板正常显示（这条路径没被改动碰到）');
    ok(await ev(`document.querySelectorAll('#lvList .lv-item').length >= 1`),
      '关卡列表也渲染出来了', String(await ev(`document.querySelectorAll('#lvList .lv-item').length`)));
    await ev('document.getElementById("lvBack").click()');
    await sleep(400);
    ok(await ev('__game.state') === 'title', '退出选关回到主界面', await ev('__game.state'));

    // ---------- 5. 没有 JS 报错 ----------
    console.log('\n[5] 控制台');
    const realErr = jsErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
    ok(realErr.length === 0, '没有 JS 报错', realErr.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    fails.push(String(e && e.message || e));
    console.log('  ✗ 异常：' + (e && e.message || e));
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* ignore */ }
    try { chrome.kill(); } catch (_) { /* ignore */ }
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`通过 ${pass} · 失败 ${fail}`);
  if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
