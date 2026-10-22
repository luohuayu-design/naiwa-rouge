// 第 46 块 CDP 回归：抽象奶蛙音效包（第一关通关解锁 + 设置里切换 + 现场裁切播放）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block46-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9339;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-46');

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
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
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
    // 第 20 回合清完不是立刻结算：会先弹武器卡（这一局跳回合没拿武器）→
    // 三选一（第 20 回合在升级列表里）→ 选完才通关。这里一路点过去。
    async function pushToOver(ms = 45000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const s = await ev('window.__game.state');
        if (s === 'over') return true;
        if (await ev("document.getElementById('weaponCard').classList.contains('on')")) {
          await ev("document.getElementById('wcOk').click()");
          await sleep(450);
          continue;
        }
        if (await ev("document.getElementById('weaponTut').classList.contains('on')")) {
          await ev("document.getElementById('wtSkip').click()");
          await sleep(350);
          continue;
        }
        if (s === 'upgrade') {
          await ev("document.querySelector('#upList .up-item').click()");
          await sleep(550);
          continue;
        }
        await sleep(300);
      }
      return false;
    }

    const q = (s) => JSON.stringify(s);
    const isOn = (sel) => `document.getElementById(${q(sel)}).classList.contains('on')`;

    await send('Runtime.enable');
    await send('Page.enable');
    // 音频上下文要一次真实手势才 running（headless 下也一样）：在画面中间点一下
    const tap = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };

    console.log('\n[1] 初始状态');
    await waitFor('!!window.__game', 90000, '__game 就绪（SwiftShader 较慢）');
    await ev('window.__game.pack.reset()');
    await sleep(200);
    const st0 = await ev('window.__game.pack.state()');
    ok('一开始没解锁', st0.unlocked === false, JSON.stringify(st0));
    ok('默认用正常音效包', st0.id === 'normal', JSON.stringify(st0));
    ok('引擎里的包也是 normal', (await ev('window.__game.pack.audio().pack')) === 'normal');
    ok('奶蛙素材还没加载', (await ev('window.__game.pack.audio().voiceLoaded.length')) === 0);
    ok('4 段素材在表里', (await ev('window.__game.pack.files().length')) === 4);
    const files = await ev('window.__game.pack.files().map(f => f.file)');
    ok('素材就是 voice-1/2/3 + voice-end', JSON.stringify(files.sort()) ===
      JSON.stringify(['voice-1.mp3', 'voice-2.mp3', 'voice-3.mp3', 'voice-end.mp3']), String(files));
    const map = await ev('window.__game.pack.map()');
    ok('替换 8 个位置', Object.keys(map).length === 8, Object.keys(map).join(','));
    ok('核心位置都在（拍击/暴击/受伤/怪死/自爆/清回合/通关/倒下）',
      ['hit', 'crit', 'hurt', 'die', 'explode', 'roundClear', 'victory', 'defeat'].every((k) => map[k]),
      Object.keys(map).join(','));
    ok('每项都写了自己的播放区间', Object.values(map).every((v) => typeof v.dur === 'number' && v.dur > 0 && typeof v.offset === 'number'));
    ok('每个音效都映射到 4 个文件之一', Object.values(map).every((v) => files.includes(v.file)));

    // 音频上下文要真实手势才 running，否则 sfx() 一律返回 false（测不出东西）
    await tap(200, 400);
    await sleep(600);
    ok('音频上下文已 running', (await ev('window.__game.pack.audio().ctxState')) === 'running',
      String(await ev('window.__game.pack.audio().ctxState')));

    console.log('\n[2] 设置面板：未解锁时锁着');
    await ev('window.__game.ui.showSettings()');
    await sleep(300);
    const rowTxt = await ev("(document.getElementById('setList').textContent || '')");
    ok('设置里有「音效包」一行', /音效包/.test(rowTxt), rowTxt.slice(0, 60));
    ok('未解锁时说明写「通关第一关解锁」', /通关第一关解锁/.test(rowTxt));
    ok('「奶蛙」按钮存在但禁用', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && b.disabled; })()"));
    ok('当前选中的是「正常」', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='normal'); return !!b && b.classList.contains('on'); })()"));
    await ev("document.getElementById('setBack').click()");
    await sleep(200);

    console.log('\n[3] 解锁卡：内容 + 试听');
    await ev('window.__game.pack.show()');
    await sleep(300);
    ok('卡片弹出来了', await ev(isOn('packGet')));
    const cardTxt = await ev("document.getElementById('packGet').textContent");
    ok('标题写「抽象奶蛙音效包」', /抽象奶蛙音效包/.test(cardTxt));
    ok('说明里点到了换哪些地方', /拍击/.test(cardTxt) && /通关/.test(cardTxt));
    ok('4 段素材都列出来了', (await ev("document.querySelectorAll('#pgList .pg-row').length")) === 4);
    ok('每段都有试听按钮', (await ev("document.querySelectorAll('#pgList .pg-play').length")) === 4);
    ok('两个选择按钮都在', await ev("!!document.getElementById('pgYes') && !!document.getElementById('pgNo')"));
    // 试听第一段：真的解码并播放
    await ev("document.querySelectorAll('#pgList .pg-play')[0].click()");
    await sleep(400);
    const vl = await ev('window.__game.pack.audio().voiceLoaded');
    ok('试听后素材真的解码了', vl.length >= 1, String(vl));
    // 反馈窗口 900ms（成功）/1300ms（失败），在 400ms 取样稳定落在窗口内
    ok('试听按钮给了反馈（♪）', /♪|没声/.test(await ev("document.querySelectorAll('#pgList .pg-play')[0].textContent")));
    await sleep(1100);
    ok('反馈会自己还原成「试听」', (await ev("document.querySelectorAll('#pgList .pg-play')[0].textContent")) === '试听');

    console.log('\n[4] 换上奶蛙叫');
    await ev("document.getElementById('pgYes').click()");
    await sleep(400);
    ok('卡片关掉了', (await ev(isOn('packGet'))) === false);
    const st1 = await ev('window.__game.pack.state()');
    ok('记成已解锁', st1.unlocked === true, JSON.stringify(st1));
    ok('当前包 = frog', st1.id === 'frog', JSON.stringify(st1));
    ok('引擎已切到 frog', (await ev('window.__game.pack.audio().pack')) === 'frog');
    await sleep(1200);   // 等预热
    const vl2 = await ev('window.__game.pack.audio().voiceLoaded');
    ok('4 段奶蛙素材全加载', vl2.length === 4, String(vl2));
    ok('打中一下走的是奶蛙素材（能播）', (await ev("window.__game.pack.sfx('hit', 0.01)")) === true);
    ok('通关音也能播（6 秒那段）', (await ev("window.__game.pack.sfx('victory', 0.01)")) === true);
    ok('没被替换的挥剑音照样能播', (await ev("window.__game.pack.sfx('swing', 0.01)")) === true);
    ok('加载没失败', (await ev('window.__game.pack.audio().failed.length')) === 0,
      String(await ev('window.__game.pack.audio().failed')));

    console.log('\n[5] 设置里来回切');
    await ev('window.__game.ui.showSettings()');
    await sleep(300);
    ok('解锁后「奶蛙」能点了', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && !b.disabled; })()"));
    ok('「奶蛙」现在是选中态', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog'); return !!b && b.classList.contains('on'); })()"));
    ok('解锁后说明不再写「通关第一关解锁」', !/通关第一关解锁/.test(await ev("document.getElementById('setList').textContent")));
    await ev("[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='normal').click()");
    await sleep(300);
    ok('点「正常」切回去了', (await ev('window.__game.pack.get()')) === 'normal');
    ok('引擎也跟着回 normal', (await ev('window.__game.pack.audio().pack')) === 'normal');
    ok('「正常」变成选中态', await ev("(() => { const b=[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='normal'); return !!b && b.classList.contains('on'); })()"));
    await ev("[...document.querySelectorAll('#setList button')].find(x=>x.dataset.pack==='frog').click()");
    await sleep(300);
    ok('再切回奶蛙也行', (await ev('window.__game.pack.get()')) === 'frog');
    await ev("document.getElementById('setBack').click()");
    await sleep(200);

    console.log('\n[6] 选择会存下来（刷新后还在）');
    await send('Page.navigate', { url: PAGE });
    await waitFor('!!window.__game', 90000, '刷新后 __game 就绪');
    await sleep(500);
    const st2 = await ev('window.__game.pack.state()');
    ok('刷新后仍是已解锁 + frog', st2.unlocked === true && st2.id === 'frog', JSON.stringify(st2));
    ok('刷新后引擎也自动是 frog（applySettings 推进去的）',
      (await ev('window.__game.pack.audio().pack')) === 'frog');

    console.log('\n[7] 重置进度 → 回到没解锁');
    await ev('window.__game.ui.reset()');
    await sleep(400);
    const st3 = await ev('window.__game.pack.state()');
    ok('重置后未解锁', st3.unlocked === false, JSON.stringify(st3));
    ok('重置后回到正常音效包', st3.id === 'normal', JSON.stringify(st3));

    console.log('\n[8] 真的打通第一关 → 自动弹卡');
    ok('进游戏状态', (await ev('window.__game.state')) === 'playing', String(await ev('window.__game.state')));
    ok('当前是第一关', (await ev('window.__game.levelId')) === 1, String(await ev('window.__game.levelId')));
    await ev('window.__game.setAdmin(true)');
    await sleep(200);
    await ev('window.__game.jumpRound(20)');
    await sleep(600);
    ok('已经到第 20 回合', (await ev('window.__game.level.roundNo')) === 20, String(await ev('window.__game.level.roundNo')));
    await ev('window.__game.skipRound()');
    ok('一路点过武器卡 / 三选一，直到结算', await pushToOver());
    ok('打完了（结算面板弹出）', await ev(isOn('result')));
    await waitFor(isOn('packGet'), 6000, '音效包卡弹出');
    ok('第一关通关后自动弹「获得新音效包」', await ev(isOn('packGet')));
    ok('弹卡时结算面板还在下面', await ev(isOn('result')));
    ok('卡片盖在结算之上（z-index 20 > 18）',
      (await ev("+getComputedStyle(document.getElementById('packGet')).zIndex")) >
      (await ev("+getComputedStyle(document.getElementById('result')).zIndex")));

    console.log('\n[9] 选「先用原来的」也照样记解锁');
    await ev("document.getElementById('pgNo').click()");
    await sleep(300);
    ok('卡片关掉', (await ev(isOn('packGet'))) === false);
    const st4 = await ev('window.__game.pack.state()');
    ok('记成已解锁但仍是 normal', st4.unlocked === true && st4.id === 'normal', JSON.stringify(st4));
    ok('结算面板还在（流程没被打断）', await ev(isOn('result')));

    console.log('\n[10] 解锁会落盘，之后再通关不弹');
    // 管理员沙盒（第 38 块）期间一切都不落盘 —— 上面那次通关只是验证「会弹」，
    // 这里退出沙盒回滚，再用钩子在**非管理员**状态下解锁（这一步才会真写档），
    // 最后重新进一局确认「已经解锁过就不再弹」。
    await ev('window.__game.setAdmin(false)');
    await sleep(400);
    ok('退出沙盒后回滚成未解锁', (await ev('window.__game.pack.state().unlocked')) === false);
    await ev('window.__game.pack.unlock()');
    await sleep(300);
    ok('非管理员下解锁会写进档案', (await ev('window.__game.pack.state().unlocked')) === true);
    await send('Page.navigate', { url: PAGE });
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(600);
    ok('重载后仍是已解锁', (await ev('window.__game.pack.state().unlocked')) === true);
    ok('重载后仍是正常音效包', (await ev('window.__game.pack.state().id')) === 'normal');
    await tap(200, 400);
    await sleep(400);
    await ev('window.__game.setAdmin(true)');
    await sleep(200);
    await ev('window.__game.jumpRound(20)');
    await sleep(600);
    await ev('window.__game.skipRound()');
    ok('第二次也一路点到结算', await pushToOver());
    await sleep(1400);
    ok('已解锁后再通关不弹卡', (await ev(isOn('packGet'))) === false);
    ok('结算面板照常显示', await ev(isOn('result')));
    await ev('window.__game.setAdmin(false)');

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
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* 浏览器还没完全退出，留给系统清理 */ }
  }
})();
