// 第 41 块 CDP 回归：永久选择提示（篝火 / 永夜火种）+ 游戏内存档退出
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block41-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-41');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2',
    '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + UD,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    // 等调试端口
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await httpJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, 'PUT');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
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
      if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }
    async function waitFor(expr, ms = 30000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 还没就绪 */ }
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n[1] 启动与主菜单');
    await waitFor('!!window.__game', 90000, '__game 就绪（SwiftShader 较慢）');
    ok('__game 调试钩子存在', await ev('!!window.__game'));
    ok('#confirmAsk 默认不显示', await ev("!document.getElementById('confirmAsk').classList.contains('on')"));
    ok('#ttSaved 默认隐藏', await ev("document.getElementById('ttSaved').hidden === true"));

    console.log('\n[2] 篝火入口的永久提示');
    await ev('window.__game.camp.show()');
    await sleep(120);
    ok('篝火页面打开', await ev("document.getElementById('campScr').classList.contains('on')"));
    ok('第一次进篝火弹出告知', await ev("document.getElementById('confirmAsk').classList.contains('on')"));
    const campTitle = await ev("document.getElementById('caTitle').textContent");
    const campSub = await ev("document.getElementById('caSub').textContent");
    ok('标题讲明是永久', /永久/.test(campTitle), campTitle);
    ok('正文提到写进存档/每一局', /存档/.test(campSub) && /每一局/.test(campSub));
    ok('告知型弹窗只有一个按钮', await ev("document.getElementById('caCancel').hidden === true"));
    await ev("document.getElementById('caOk').click()");
    await sleep(120);
    ok('点「我知道了」关掉弹窗', await ev("!document.getElementById('confirmAsk').classList.contains('on')"));
    ok('档案记下已提示过', await ev("window.__game.ui.profile().notice.campfire === true"));
    // 再进一次不该再拦
    await ev('window.__game.camp.hide()');
    await sleep(100);
    await ev('window.__game.camp.show()');
    await sleep(200);
    ok('第二次进篝火不再弹窗', await ev("!document.getElementById('confirmAsk').classList.contains('on')"));
    ok('常驻警示条在篝火页存在', await ev("!!document.getElementById('cfWarn') && getComputedStyle(document.getElementById('cfWarn')).display !== 'none'"));
    await ev('window.__game.camp.hide()');
    await sleep(100);

    console.log('\n[3] 永夜火种的永久提示');
    await ev('window.__game.boons.grant(1)');
    ok('派发了一次待领火种', await ev('window.__game.boons.pending()') >= 1);
    await ev('window.__game.boons.show()');
    await sleep(200);
    ok('火种面板打开', await ev("document.getElementById('upgrade').classList.contains('on')"));
    ok('火种面板弹出告知', await ev("document.getElementById('confirmAsk').classList.contains('on')"));
    const boonTitle = await ev("document.getElementById('caTitle').textContent");
    const boonSub = await ev("document.getElementById('caSub').textContent");
    ok('标题讲明跟着一辈子', /一辈子|永久/.test(boonTitle), boonTitle);
    ok('正文提到不可撤销', /撤销|洗不掉/.test(boonSub));
    ok('火种面板露出警示条', await ev("document.getElementById('upWarn').getAttribute('aria-hidden') === 'false'"));
    ok('警示条真的可见', await ev("getComputedStyle(document.getElementById('upWarn')).display !== 'none'"));
    await ev("document.getElementById('caOk').click()");
    await sleep(120);
    ok('告知关掉后火种面板还在', await ev("document.getElementById('upgrade').classList.contains('on')"));
    await ev('window.__game.boons.close()');
    await sleep(200);
    ok('关掉火种面板后警示条收起', await ev("getComputedStyle(document.getElementById('upWarn')).display === 'none'"));
    // 局内升级面板不许露出这条警示条
    ok('局内升级时警示条同样不显示', await ev(
      "(function(){const el=document.getElementById('upWarn');el.setAttribute('aria-hidden','true');" +
      "return getComputedStyle(el).display==='none';})()"));

    console.log('\n[4] 开一局 → 存档并退出');
    await ev("document.getElementById('btnStart').click()");
    await sleep(300);
    ok('进入选关页', await ev("document.getElementById('levelSel').classList.contains('on')"));
    await ev("document.querySelector('#lvList .lv-item:not(.locked)').click()");
    await sleep(300);
    ok('第二步：选难度', await ev("document.getElementById('diffScr').classList.contains('on')"));
    await ev("document.getElementById('diffNext').click()");
    await sleep(250);
    ok('第三步：选诅咒', await ev("document.getElementById('curseScr').classList.contains('on')"));
    await ev("document.getElementById('curseStart').click()");
    await sleep(400);
    // 第一关会问教程
    if (await ev("document.getElementById('tutAsk').classList.contains('on')")) {
      await ev("document.getElementById('tutNo').click()");
    }
    await sleep(1500);
    ok('局内 HUD 出现退出按钮', await ev(
      "(function(){const b=document.getElementById('exitBtn');const r=b.getBoundingClientRect();" +
      "return !!b && r.width>0 && r.height>0;})()"));
    await ev("document.getElementById('exitBtn').click()");
    await sleep(250);
    ok('点退出弹出确认', await ev("document.getElementById('confirmAsk').classList.contains('on')"));
    ok('确认文案是「存档并退出」', /存档/.test(await ev("document.getElementById('caTitle').textContent")));
    ok('这次给了「继续游戏」的反悔键', await ev("document.getElementById('caCancel').hidden === false"));
    await ev("document.getElementById('caCancel').click()");
    await sleep(200);
    ok('点「继续游戏」留在局内', await ev("window.__game.state === 'playing'"), await ev('window.__game.state'));
    await ev("document.getElementById('exitBtn').click()");
    await sleep(250);
    await ev("document.getElementById('caOk').click()");
    await sleep(800);
    ok('确认后回到主菜单', await ev("window.__game.state === 'title'"), await ev('window.__game.state'));
    ok('标题页写明存到第几回合', await ev(
      "(function(){const t=document.getElementById('ttSaved');return !t.hidden && /第\\s*\\d+\\s*\\/\\s*\\d+\\s*回合/.test(t.textContent);})()"),
      await ev("document.getElementById('ttSaved').textContent"));
    const runs = await ev('window.__game.run.load().length');
    ok('存档列表里有一份存档', runs >= 1, 'count=' + runs);

    // 第 61 块（用户要求）：最近退出的排最上面。这里造两条「已知时间」的存档塞进去，
    // 一条 1 天前（第 3 回合）、一条刚退出（第 17 回合），看列表第一张是不是新的那条。
    const ordN = await ev(`(function(){
      const K = 'naiwa_rouge_runs_v1';
      const all = JSON.parse(localStorage.getItem(K) || '[]');
      const base = all[0] || {};
      const rest = all.filter(function (r) { return r.uid !== 'ord-new' && r.uid !== 'ord-old'; });
      function mk(uid, at, round) {
        const o = JSON.parse(JSON.stringify(base));
        o.uid = uid; o.at = at; o.round = round; o.rounds = o.rounds || 20;
        return o;
      }
      rest.push(mk('ord-old', Date.now() - 86400000, 3));
      rest.push(mk('ord-new', Date.now(), 17));
      localStorage.setItem(K, JSON.stringify(rest));
      return rest.length;
    })()`);
    ok('注入两条对照存档后共 ' + ordN + ' 条', ordN >= 3, 'n=' + ordN);

    console.log('\n[5] 读取存档列表');
    await ev("document.getElementById('btnResume').click()");
    await sleep(300);
    ok('打开读取存档页', await ev("document.getElementById('saveList').classList.contains('on')"));
    const cards = await ev("document.querySelectorAll('#saveListBox .save-item').length");
    ok('列表里至少一张存档卡', cards >= 1, 'cards=' + cards);
    ok('卡片显示退出时间', await ev(
      "(function(){const c=document.querySelector('#saveListBox .save-item');return !!c && /\\d{4}\\/\\d{1,2}\\/\\d{1,2}/.test(c.textContent);})()"));
    ok('卡片显示关卡与回合', await ev(
      "(function(){const c=document.querySelector('#saveListBox .save-item');return !!c && /回合/.test(c.textContent);})()"));
    // 第 61 块：最近退出的在最上 —— 第一张必须是刚退出的那条（第 17 回合），最后一张是最旧的（第 3 回合）
    const firstCard = await ev("document.querySelector('#saveListBox .save-item').textContent");
    const lastCard = await ev("(function(){const a=document.querySelectorAll('#saveListBox .save-item');return a[a.length-1].textContent;})()");
    ok('第一张是最新的存档（第 17 回合）', /第\s*17\s*\/\s*20\s*回合/.test(firstCard), firstCard);
    ok('最后一张是最旧的存档（第 3 回合）', /第\s*3\s*\/\s*20\s*回合/.test(lastCard), lastCard);
    ok('面板头的说明也跟着改了（最近的在上）',
      /最近的在上/.test(await ev("document.querySelector('#saveList .lv-step').textContent")),
      await ev("document.querySelector('#saveList .lv-step').textContent"));

    console.log('\n-------------------------------');
    console.log(`通过 ${pass} / 失败 ${fail}`);
    if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('测试中断:', e.message);
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill('SIGKILL'); } catch (_) {}
    await sleep(600);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* 浏览器还没完全退出，临时目录留给系统清理 */ }
  }
})();
