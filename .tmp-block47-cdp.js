// 第 47 块 CDP：新武器「箭雨」+ 武器解锁原则（第一关只出剑，第二关起解锁箭雨）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block47-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9344;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-47');

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
    async function goto(url, beforeNavigate) {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
      // 老标签页关掉，省资源
      try { await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); } catch (_) {}
      target.id = t.id; target.webSocketDebuggerUrl = t.webSocketDebuggerUrl;
      ws.close();
      ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      bindWs();
      await send('Runtime.enable');
      await send('Page.enable');
      if (beforeNavigate) await beforeNavigate();   // 导航前注入（如预置 localStorage）
      await send('Page.navigate', { url });
      await waitFor("location.href.indexOf('127.0.0.1')>=0 && document.readyState === 'complete'", 60000, '页面加载');
    }
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

    const q = (s) => JSON.stringify(s);

    // 拿武器链路：回合开始弹武器卡 → 教程 → 都点掉，直到条件满足
    async function drainGrant(untilExpr, ms = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await ev(untilExpr)) return true;
        if (await ev("document.getElementById('weaponCard').classList.contains('on')")) {
          await ev("document.getElementById('wcOk').click()"); await sleep(400); continue;
        }
        if (await ev("document.getElementById('weaponTut').classList.contains('on')")) {
          await ev("document.getElementById('wtSkip').click()"); await sleep(350); continue;
        }
        if ((await ev('window.__game.state')) === 'upgrade') {
          await ev("document.querySelector('#upList .up-item').click()"); await sleep(500); continue;
        }
        await sleep(250);
      }
      return false;
    }

    // 三选一卡会挡住 playing —— 全部点掉直到回到战斗
    async function drainUpgrade(ms = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const s = await ev('window.__game.state');
        if (s === 'playing') return true;
        if (s === 'upgrade') { await ev("document.querySelector('#upList .up-item').click()"); await sleep(500); continue; }
        if (await ev("document.getElementById('weaponCard').classList.contains('on')")) {
          await ev("document.getElementById('wcOk').click()"); await sleep(400); continue;
        }
        if (await ev("document.getElementById('weaponTut').classList.contains('on')")) {
          await ev("document.getElementById('wtSkip').click()"); await sleep(350); continue;
        }
        await sleep(250);
      }
      return false;
    }

    await send('Runtime.enable');
    await send('Page.enable');

    // ============ A 段：第一关只出剑（?debug=1 自动开局） ============
    console.log('\n[A] 第一关：拿到环剑也不给箭雨');
    await goto('http://127.0.0.1:8124/?debug=1');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(500);
    await ev('window.__game.setAdmin(true)');
    await ev('window.__game.jumpRound(4)');
    await sleep(400);
    await ev('window.__game.skipRound()');
    ok('第一关第 5 回合拿到环剑',
      await drainGrant('(window.__game.swordKinds || []).length > 0', 40000));
    ok('拿完剑回到战斗（三选一已点掉）', await drainUpgrade(40000));
    ok('第一关不解锁箭雨（unlock 原则）', await ev('window.__game.arrowRain.state().unlocked') === false);
    ok('技能栏只有万剑齐发一个', JSON.stringify(await ev('window.__game.visibleSkills()')) === JSON.stringify(['swordRain']),
      JSON.stringify(await ev('window.__game.visibleSkills()')));

    // ============ B 段：强制解锁 → 施放 → 伤害 → 冷却倒计时 ============
    console.log('\n[B] 箭雨系统：解锁 / 施放 / 群箭伤害 / CD 倒计时');
    await ev('window.__game.arrowRain.unlock()');
    ok('钩子解锁后 visibleSkills 含箭雨', (await ev('window.__game.visibleSkills()')).includes('arrowRain'));
    ok('技能按钮真的显示出来了', await ev("document.querySelector('.sk[data-skill=\"arrowRain\"]').style.display !== 'none'"));
    ok('刚解锁是就绪状态', await ev('window.__game.arrowRain.state().ready') === true);

    // 回到战斗并等场上刷出活怪（当前回合的怪还在走过来）
    ok('回到战斗', await drainUpgrade(40000));
    await waitFor('window.__game.state === "playing" && window.__game.arrowRain.probe().n > 0', 60000, '场上出现活怪');
    const before = await ev('window.__game.arrowRain.probe()');
    ok('施放成功（返回 true）', await ev('window.__game.arrowRain.fire()') === true);
    const st1 = await ev('window.__game.arrowRain.state()');
    ok('出现一场箭雨', st1.strikes >= 1, JSON.stringify(st1));
    ok('进入冷却（0 < cd <= 8）', st1.cdLeft > 0 && st1.cdLeft <= 8, 'cd=' + st1.cdLeft);
    ok('冷却中不再是就绪', st1.ready === false);
    const cdTxt = await (async () => { await sleep(500); return ev("document.querySelector('.sk[data-skill=\"arrowRain\"] .sk-num').textContent"); })();
    const cdNum = parseInt(cdTxt, 10);
    ok('技能框显示 CD 倒计时数字', cdNum >= 1 && cdNum <= 8, '显示 ' + JSON.stringify(cdTxt));
    await sleep(1000);
    const st2 = await ev('window.__game.arrowRain.state()');
    ok('冷却在倒数（1 秒后变小）', st2.cdLeft < st1.cdLeft, st1.cdLeft + ' → ' + st2.cdLeft);
    // 箭落完（AIM 0.85 + 散布 1.0 + 下落 0.42 ≈ 2.3 秒，留余量）
    await waitFor('window.__game.arrowRain.state().strikes === 0', 12000, '箭雨结束');
    // 等下一轮冷却好，挑一只**远程**怪再放一次做伤害验证：
    // 剑环只够得着身边 ~2.6 格，主角拍击射程也很短 —— 4.5 格外的怪掉血只可能是箭雨干的
    await waitFor('window.__game.arrowRain.state().ready', 20000, '冷却转好');
    await waitFor('(function(){ const p = window.__game.arrowRain.probe(); return p.nearest && p.nearest.d > 4.5 && p.nearest.hp > 0; })()',
      60000, '出现 4.5 格外的远程目标');
    const far = await ev('window.__game.arrowRain.probe()');
    ok('远程施放成功', await ev('window.__game.arrowRain.fire()') === true);
    await sleep(3600);
    const farAfter = await ev('window.__game.arrowRain.probe()');
    ok('箭雨对远程目标造成了伤害或击杀',
      farAfter.nearest.hp < far.nearest.hp || farAfter.n < far.n,
      JSON.stringify({ far, farAfter }));
    ok('警告圈与箭都被回收（无残留）', await ev('window.__game.arrowRain.state().strikes') === 0);

    // ============ C 段：第二关解锁 + 存档续玩保留 ============
    console.log('\n[C] 第二关：拿环剑时一并解锁箭雨，读档后仍在');
    // 预置战绩：第一关通关过 → 第二关解锁（必须在导航前注册，否则新标签页吃不到）
    const seedRecords = () => send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify({ 1: { wins: 1, bestTime: 99, bestKills: 10, bestRound: 20 } }));`,
    });
    await goto('http://127.0.0.1:8124/?debug=1&keepsave&title', seedRecords);
    await waitFor('!!window.__game', 90000, '标题页 __game 就绪');
    await sleep(400);
    await ev("document.getElementById('btnStart').click()");
    await waitFor("document.getElementById('levelSel').classList.contains('on')", 15000, '选关页');
    await sleep(300);
    ok('第二关卡片没锁', await ev("document.querySelectorAll('#lvList .lv-item')[1] && !document.querySelectorAll('#lvList .lv-item')[1].classList.contains('locked')"));
    await ev("document.querySelectorAll('#lvList .lv-item')[1].click()");
    await sleep(300);
    await ev("document.getElementById('diffNext').click()");
    await sleep(300);
    await ev("document.getElementById('curseStart').click()");
    await waitFor('window.__game.state === "playing"', 60000, '第二关开打');
    await sleep(400);
    // 注意：jumpRound/skipRound 只在管理员模式下生效 —— 先开着快进拿武器，再关掉让存档能落盘。
    // 第二关 weaponAt=4：跳到第 3 回合清掉 → handleRoundClear(3) 还不够，要再清一场（第 4 回合）才触发。
    // 清场链上可能弹：武器卡 / 武器教程 / 三选一 / 商店 —— 循环里全点掉。
    await ev('window.__game.setAdmin(true)');
    await ev('window.__game.jumpRound(3)');
    await sleep(400);
    ok('第二关第 4 回合：环剑与箭雨一起到手', await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        if (await ev('window.__game.arrowRain.state().unlocked')) return true;
        if (await ev("document.getElementById('weaponCard').classList.contains('on')")) {
          await ev("document.getElementById('wcOk').click()"); await sleep(400); continue;
        }
        if (await ev("document.getElementById('weaponTut').classList.contains('on')")) {
          await ev("document.getElementById('wtSkip').click()"); await sleep(350); continue;
        }
        const st = await ev('window.__game.state');
        if (st === 'upgrade') { await ev("document.querySelector('#upList .up-item').click()"); await sleep(500); continue; }
        if (await ev("document.getElementById('shop').classList.contains('on')")) {
          await ev("document.getElementById('shClose').click()"); await sleep(400); continue;
        }
        if (st === 'playing') { await ev('window.__game.skipRound()'); await sleep(1500); continue; }
        await sleep(400);
      }
      return false;
    })());
    // 把武器卡/教程/三选一/商店都点掉，回到战斗再断言技能栏
    ok('拿完回到战斗', await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 40000) {
        const st = await ev('window.__game.state');
        if (st === 'playing') return true;
        if (await ev("document.getElementById('weaponCard').classList.contains('on')")) { await ev("document.getElementById('wcOk').click()"); await sleep(400); continue; }
        if (await ev("document.getElementById('weaponTut').classList.contains('on')")) { await ev("document.getElementById('wtSkip').click()"); await sleep(350); continue; }
        if (st === 'upgrade') { await ev("document.querySelector('#upList .up-item').click()"); await sleep(500); continue; }
        if (await ev("document.getElementById('shop').classList.contains('on')")) { await ev("document.getElementById('shClose').click()"); await sleep(400); continue; }
        await sleep(350);
      }
      return false;
    })());
    ok('第二关技能栏有两个技能', (await ev('window.__game.visibleSkills()')).join(',') === 'swordRain,arrowRain',
      JSON.stringify(await ev('window.__game.visibleSkills()')));
    // 关掉管理员（解除「不落盘」），站桩清完当前回合 → 下一回合开始时 saveRunAtRound 落档。
    // 第二关的投手会停在射程外，站桩打不到 —— 用测试钩子给主角 +12 攻击范围；
    // 等待期间继续帮忙点掉三选一/商店，回合才能往前走
    await ev('window.__game.setAdmin(false)');
    await ev("window.__game.buff('attackRange', 12)");
    ok('回合开始已落档（runs 里有本局）', await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 180000) {
        if (await ev("(function(){ const k = Object.keys(localStorage).filter(k => k.indexOf('runs_v1') >= 0); return k.length && JSON.parse(localStorage.getItem(k[0])).length > 0; })()")) return true;
        const st = await ev('window.__game.state');
        if (st === 'upgrade') { await ev("document.querySelector('#upList .up-item').click()"); await sleep(450); continue; }
        if (await ev("document.getElementById('shop').classList.contains('on')")) { await ev("document.getElementById('shClose').click()"); await sleep(400); continue; }
        if (await ev("document.getElementById('weaponCard').classList.contains('on')")) { await ev("document.getElementById('wcOk').click()"); await sleep(400); continue; }
        await sleep(500);
      }
      return false;
    })());

    // 刷新 → 读取存档 → 箭雨还是解锁的
    await goto('http://127.0.0.1:8124/?debug=1&keepsave&title', seedRecords);
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(400);
    ok('重载后「读取存档」按钮出现', await ev("!document.getElementById('btnResume').hidden"));
    await ev("document.getElementById('btnResume').click()");
    await waitFor("document.getElementById('saveList').classList.contains('on')", 15000, '存档列表');
    await sleep(300);
    await ev("document.querySelector('#saveList .save-item').click()");
    await waitFor('window.__game.state === "playing"', 60000, '续玩进入战斗');
    await sleep(600);
    ok('读档后箭雨仍是解锁状态', await ev('window.__game.arrowRain.state().unlocked') === true);
    ok('读档后环剑也在（restore 正常）', await ev("(function(){ return window.__game.swordKinds.length > 0; })()"));
    ok('读档后技能栏两个技能都在', (await ev('window.__game.visibleSkills()')).join(',') === 'swordRain,arrowRain');

    // 收尾：无 JS 报错
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
