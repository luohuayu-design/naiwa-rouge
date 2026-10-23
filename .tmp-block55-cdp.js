// 第 55 块 CDP：用户三条里能在浏览器里验的两条
//   A 新怪物信息卡（首次遇到 → 世界冻结 → 内容取自图鉴 → 我明白了继续 → 不重复弹）
//   B 战斗计时（只有真打才走表；商店/剧情/升级/属性卡/新怪卡都不算；开新局归零）
// 跑法：先 `python -m http.server 8124 --bind 127.0.0.1`（cwd=naiwa-rouge），再 `node .tmp-block55-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9359;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-55');
const OUT = path.join(os.tmpdir(), 'naiwa-block55');
// ⚠️ 必须带 &title：debug 模式下没有它会在加载完直接开局（AUTO_START）
// &meet：debug 下新怪信息卡默认关着（免得冻住二十多套老套件），要测它得显式打开
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1&meet=1';

let pass = 0, fail = 0;
const fails = [];
// 参数顺序：cond 在前、名字在后（写反会打一屏假绿）
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
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
    async function waitFor(expr, ms = 60000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(180);
      }
      throw new Error('等待超时: ' + label);
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    }
    async function goto(url) {
      await send('Page.navigate', { url });
      await waitFor("location.href.indexOf('127.0.0.1')>=0 && document.readyState === 'complete'", 60000, '页面加载');
    }
    await send('Runtime.enable');
    await send('Page.enable');

    await goto(URL);
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(700);
    // 公告弹窗是 loading 淡完 +700ms 才弹的，等它真出来再关
    try { await waitFor(`__game.notice.open()`, 6000, '公告弹出'); } catch (_) { /* 今天已勾不再弹 */ }
    await ev(`__game.notice.hide(), 1`);
    await sleep(250);
    if (await ev(`__game.notice.open()`)) { await ev(`__game.notice.hide(), 1`); await sleep(250); }

    // 进第一关（第一回合只有小兵，正好用来验「第一次遇到」）
    await ev(`document.getElementById('btnStart').click(), 1`);
    await sleep(500);
    await ev(`document.querySelector('.lv-item[data-level="1"]').click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('diffNext')?.click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('curseStart')?.click(), 1`);
    await waitFor(`window.__game.levelId === 1`, 40000, '第一关开始');
    await sleep(500);
    if (await ev(`document.getElementById('tutAsk')?.classList.contains('on')`)) {
      await ev(`document.getElementById('tutNo').click(), 1`);
      await sleep(300);
    }
    ok(await ev(`__game.getState() === 'playing'`), '已经进入战斗状态');
    ok(await ev(`__game.meetCard.auto() === true`), '&meet 打开了新怪信息卡（debug 下默认是关的）');

    // ============================================================
    // A. 新怪物信息卡
    // ============================================================
    console.log('\n[A] 新怪物信息卡');
    // 清掉「见过」记录，让第一只小兵就算「第一次遇到」
    await ev(`__game.meetCard.forget(), 1`);
    ok(await ev(`__game.meetCard.met('minion') === false`), '清档后小兵算「没见过」');

    await waitFor(`__game.meetCard.on()`, 40000, '第一只新怪弹卡');
    // 淡入 .26s + 缩略图要解码，量之前先等一等（不然量到 opacity 0 / naturalWidth 0）
    await waitFor(`(() => { const i = document.getElementById('mtImg'); return i.complete && i.naturalWidth > 0; })()`, 6000, '缩略图加载');
    await sleep(420);
    const card = await ev(`(() => {
      const el = document.getElementById('meetCard');
      const r = el.querySelector('.mt-card').getBoundingClientRect();
      const info = __game.codex.entries('enemies').find((e) => e.id === __game.meetCard.type());
      return {
        cls: el.classList.contains('on'),
        aria: el.getAttribute('aria-hidden'),
        state: __game.getState(),
        type: __game.meetCard.type(),
        name: document.getElementById('mtName').textContent.trim(),
        sub: document.getElementById('mtSub').textContent.trim(),
        desc: document.getElementById('mtDesc').textContent.trim(),
        secText: document.querySelector('#meetCard .mt-sec').textContent.replace(/\\s+/g, ''),
        btn: document.getElementById('mtOk').textContent.trim(),
        img: document.getElementById('mtImg').getAttribute('src') || '',
        imgW: document.getElementById('mtImg').naturalWidth || 0,
        infoName: info ? info.title : '',
        infoDesc: info ? String(info.desc || '').replace(/\\*\\*/g, '') : '',
        zIdx: getComputedStyle(el).zIndex,
        w: Math.round(r.width), h: Math.round(r.height),
        vw: innerWidth, vh: innerHeight,
        op: getComputedStyle(el).opacity,
      };
    })()`);
    ok(card.cls, '卡片真的显示了（.on）');
    ok(card.aria === 'false', 'a11y：aria-hidden 已放开');
    ok(card.state === 'meet', `弹卡时状态是 meet（实际 ${card.state}）`);
    ok(card.type === 'minion', `第一张卡讲的是刚上场的那只（${card.type}）`);
    ok(card.name && card.name === card.infoName, `名字取自图鉴（${card.name}）`);
    ok(/生命|伤害|速度/.test(card.sub), `数值行在（${card.sub}）`);
    ok(card.secText === '攻击方式', `专设「攻击方式」一栏（${card.secText}）`);
    ok(card.desc.length >= 8 && card.desc === card.infoDesc, `攻击方式与图鉴同一份文案（${card.desc}）`);
    ok(!/\*\*/.test(card.desc), '攻击方式里没有残留的 markdown 星号');
    ok(card.btn.replace(/\s+/g, '') === '我明白了', `按钮是「我明白了」（${card.btn}）`);
    ok(/minion\.webp$/.test(card.img), `配了怪物缩略图（${card.img}）`);
    ok(card.imgW > 0, `缩略图真的解码出来了（宽 ${card.imgW}）`);
    ok(card.w > 250 && card.w <= card.vw && card.h < card.vh, `尺寸合理（${card.w}×${card.h} / 视口 ${card.vw}×${card.vh}）`);
    ok(Number(card.zIdx) === 17, `层级 17（实际 ${card.zIdx}）`);
    ok(Number(card.op) > 0.9, `不透明度到位（${card.op}）`);
    await shot('a-meet-card');

    // A3 世界冻结：计时不走、怪不再往外刷
    const frozen0 = await ev(`({ t: __game.getElapsed(), n: __game.enemies.aliveCount(), run: __game.timeInfo().running })`);
    await sleep(1500);
    const frozen1 = await ev(`({ t: __game.getElapsed(), n: __game.enemies.aliveCount() })`);
    ok(frozen0.run === false, '卡开着时 timeInfo().running = false');
    ok(Math.abs(frozen1.t - frozen0.t) < 0.02, `卡开着时战斗计时不动（${frozen0.t.toFixed(2)} → ${frozen1.t.toFixed(2)}）`);
    ok(frozen1.n === frozen0.n, `卡开着时不再刷新怪（${frozen0.n} → ${frozen1.n}）`);
    const pos0 = await ev(`__game.enemies.all().map((e) => e.pos.x.toFixed(2) + ',' + e.pos.z.toFixed(2)).join('|')`);
    await sleep(900);
    const pos1 = await ev(`__game.enemies.all().map((e) => e.pos.x.toFixed(2) + ',' + e.pos.z.toFixed(2)).join('|')`);
    ok(pos0 === pos1, '卡开着时场上的怪一步没挪');

    // A4 点「我明白了」→ 继续打
    await ev(`document.getElementById('mtOk').click(), 1`);
    await waitFor(`!__game.meetCard.on()`, 5000, '卡片关闭');
    await sleep(200);
    ok(await ev(`__game.getState() === 'playing'`), '关掉后状态回到 playing');
    ok(await ev(`__game.timeInfo().running === true`), '关掉后秒表重新走');
    ok(await ev(`document.getElementById('meetCard').getAttribute('aria-hidden') === 'true'`), '关掉后 aria-hidden 收回');
    const t2a = await ev(`__game.getElapsed()`);
    await sleep(1000);
    const t2b = await ev(`__game.getElapsed()`);
    ok(t2b > t2a + 0.5, `关掉后计时真的在涨（${t2a.toFixed(2)} → ${t2b.toFixed(2)}）`);
    ok(await ev(`__game.meetCard.met('minion') === true`), '小兵已记进「见过」表');
    ok(await ev(`__game.meetCard.pending() === 0`), '队列已空');

    // A5 不重复弹：小兵还在陆续刷，等 4 秒不能再冒出来
    let popped = false;
    for (let i = 0; i < 8; i++) {
      await sleep(500);
      if (await ev(`__game.meetCard.on()`)) { popped = true; break; }
    }
    ok(!popped, '同一种怪之后的刷新不再弹卡（一种怪一辈子只拦一次）');
    ok(await ev(`__game.getElapsed() > 2`), '这几秒都在正常计时（说明不是整个循环卡住了）');

    // ============================================================
    // B. 只记打斗时长
    // ============================================================
    console.log('\n[B] 战斗计时只算打斗');
    const measure = async (label, openExpr, closeExpr) => {
      const a = await ev(`({ t: __game.getElapsed(), run: __game.timeInfo().running, st: __game.getState() })`);
      await sleep(1100);
      const b = await ev(`({ t: __game.getElapsed(), run: __game.timeInfo().running, st: __game.getState() })`);
      ok(a.run === false, `${label}开着：running = false（state ${a.st}）`);
      ok(Math.abs(b.t - a.t) < 0.02, `${label}开着：1.1 秒里计时没动（${a.t.toFixed(2)} → ${b.t.toFixed(2)}）`);
      return { a, b };
    };

    // B1 战斗中确实在走表
    const c0 = await ev(`__game.getElapsed()`);
    await sleep(1000);
    const c1 = await ev(`__game.getElapsed()`);
    ok(c1 > c0 + 0.5, `战斗中计时在涨（${c0.toFixed(2)} → ${c1.toFixed(2)}）`);

    // B2 商店
    await ev(`__game.shop.open(), 1`);
    await sleep(300);
    const shopM = await measure('商店');
    ok(shopM.a.st === 'shop', '确实是商店面板（state shop）');
    await shot('b-shop-timer');
    await ev(`__game.shop.close(), 1`);
    await sleep(200);
    ok(await ev(`__game.timeInfo().running === true`), '关店后计时恢复');

    // B3 剧情（随机奇遇，含 3 秒读秒锁）
    await ev(`__game.event.trigger('diceBones'), 1`);
    await sleep(300);
    const evM = await measure('奇遇剧情');
    ok(evM.a.st === 'event', '确实是事件卡（state event）');
    await ev(`__game.event.close(), 1`);
    await sleep(200);
    ok(await ev(`__game.timeInfo().running === true`), '关掉剧情后计时恢复');

    // B4 升级三选一
    await ev(`__game.upgrade.show(), 1`);
    await sleep(300);
    const upM = await measure('升级三选一');
    ok(upM.a.st === 'upgrade', '确实是升级面板（state upgrade）');
    await shot('b-upgrade-timer');
    await ev(`(() => {
      const c = __game.upgrade.cards[0];
      const up = __game.upgrade.list.find((u) => u.id === c.id);
      return __game.upgrade.choose(up);
    })()`);
    await sleep(250);
    ok(await ev(`__game.timeInfo().running === true`), '选完卡后计时恢复');

    // B5 属性卡
    await ev(`__game.setPanel(true), 1`);
    await sleep(250);
    const apM = await measure('属性卡');
    ok(apM.a.run === false, '属性卡开着不算战斗时间');
    await ev(`__game.setPanel(false), 1`);
    await sleep(200);
    ok(await ev(`__game.timeInfo().running === true`), '关上属性卡后计时恢复');

    // B6 开新局归零（老 bug：第二局会把上一局的时长带进来）
    const before = await ev(`__game.getElapsed()`);
    ok(before > 3, `这一局已经打了一会儿（${before.toFixed(1)} 秒）`);
    await ev(`__game.win(), 1`);
    await sleep(500);
    await ev(`__game.beginGame(), 1`);
    await sleep(600);
    const fresh = await ev(`__game.getElapsed()`);
    ok(fresh < 3, `新开一局从 0 起表（${fresh.toFixed(2)} 秒，上一局是 ${before.toFixed(1)}）`);
    ok(fresh < before, '新局的用时不会继承上一局');

    ok(jsErrors.length === 0, `全程零 JS 报错（${jsErrors.slice(0, 2).join(' / ') || '无'}）`);

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fails.length) console.log('失败项：\n  ' + fails.join('\n  '));
    console.log('截图目录：' + OUT);
  } catch (err) {
    fail++;
    console.error('\n[崩了] ' + err.message);
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    chrome.kill();
    setTimeout(() => process.exit(fail ? 1 : 0), 300);
  }
})();
