// 第 110 块 CDP：三连修实机冒烟
//   A 照影：出生血 = clamp(玩家上限×0.6, 6, 60)，无回合倍率（第 110 块修复）
//   B 铁傀儡：追击半径内的怪主动走过去打；没怪走回主角身边
//   C 看守：半血暴怒后前摇/收招 ×0.72、移速 ×1.4
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-110-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9394;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-110');
const OUT = path.join(os.tmpdir(), 'naiwa-block110');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
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
      throw new Error('等待超时: ' + label);
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
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
      return false;
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    // 公告 → 签到 → 宣传（350ms 定时器链逐环关）
    await sleep(1400);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(500);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(500);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);

    // ============================================================
    console.log('\n[进局] 第十关');
    // ============================================================
    await ev('__game.setPendingLevel(10)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1500);
    ok(await settle(), '进入 playing');
    await ev('__game.setWaves(true)');   // 冻住波次：只测自己造的靶子
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');

    // ============================================================
    console.log('\n[A] 照影：血量修复 + 模型缩小');
    // ============================================================
    {
      const r = await ev("__game.block63.enemies.spawn('mirror', 5, 3)");
      ok(r === 'mirror', 'spawn mirror');
      await sleep(1300);
      const got = await ev(`(() => {
        const m = __game.block63.enemies.live('mirror');
        if (!m) return null;
        return { hp: m.hp, maxHp: m.maxHp };
      })()`);
      const want = await ev(`(() => {
        const mm = __game.enemyTypes.mirror.mirror;
        return Math.max(mm.hpFloor, Math.min(mm.hpCap, 0.6 * __game.stats.get('maxHp')));
      })()`);
      ok(!!got, '照影活着');
      ok(got && Math.abs(got.maxHp - Math.round(want)) <= 1,
        `出生血 = clamp(上限60%, 6, 60)（无回合倍率）`, got && `${got.maxHp} / 期望 ${Math.round(want)}`);
      ok(got && Math.abs(got.hp - got.maxHp) <= 1, '满血出生');
      await ev('__game.block63.enemies.kill()');
      await sleep(300);
    }

    // ============================================================
    console.log('\n[B] 铁傀儡：主动追怪 + 回锚');
    // ============================================================
    {
      ok(await ev('__game.block107.grantPuppet(1)') >= 1, '灌傀儡术 lv1');
      await ev('__game.warp(0, 0)');
      await sleep(300);
      const s0 = await ev('__game.block107.golems.summon("iron", { x: 0, z: -2 })');
      ok(s0 && s0.kind === 'iron', '召出铁傀儡', JSON.stringify(s0));
      // 靶子：追击半径内（7.21 < 7.5）但拳距外
      await ev("__game.block63.enemies.spawn('warrior', 6, 2)");
      await ev(`(() => { const w = __game.block63.enemies.live('warrior'); if (w) { w.hp = w.maxHp = 9999; w.state = 'chase'; } })()`);
      await sleep(400);
      // 轮询：朝靶子走近（游戏时间比墙钟慢，别按毫秒断言）
      let movedTo = null;
      try {
        await waitFor(`(() => {
          const g = (__game.block107.golems.info())[0];
          const w = __game.block63.enemies.live('warrior');
          if (!g || !w) return false;
          return Math.hypot(w.pos.x - g.x, w.pos.z - g.z) < 6.0;
        })()`, 20000, '铁傀儡向靶子走近');
        movedTo = await ev(`(() => {
          const g = (__game.block107.golems.info())[0];
          const w = __game.block63.enemies.live('warrior');
          return Math.round(Math.hypot(w.pos.x - g.x, w.pos.z - g.z) * 100) / 100;
        })()`);
      } catch (e) { movedTo = 'timeout'; }
      ok(typeof movedTo === 'number', `铁傀儡主动追怪（距离缩到 ${movedTo}，初始 7.21）`);
      // 打得到：它出过拳（靶子掉血）
      let hit = null;
      try {
        await waitFor(`(() => { const w = __game.block63.enemies.live('warrior'); return w && w.hp < 9999; })()`, 15000, '出拳掉血');
        hit = await ev(`__game.block63.enemies.live('warrior').hp`);
      } catch (_) { hit = null; }
      ok(hit != null && hit < 9999, `铁傀儡出拳命中（靶子血 ${hit}）`);
      await shot('b-iron-hunting.png');
      // 回锚：清场 + 主角走远 → 铁傀儡跟过来
      await ev('__game.block63.enemies.kill()');
      await ev('__game.warp(-6, -6)');
      let back = null;
      try {
        await waitFor(`(() => {
          const g = (__game.block107.golems.info())[0];
          const p = __game.pos();
          return g && Math.hypot(p.x - g.x, p.z - g.z) < 3.0;
        })()`, 25000, '铁傀儡回到主角身边');
        back = true;
      } catch (_) { back = false; }
      ok(back, '没怪可打时走回主角身边（< 3 格）');
      await ev('__game.block107.golems.reset && __game.block107.golems.reset()');
      await sleep(200);
    }

    // ============================================================
    console.log('\n[C] 看守：暴怒后攻速大增');
    // ============================================================
    {
      await ev('__game.warp(0, 0)');
      const r = await ev("__game.block63.enemies.spawn('warden', 2.5, 0)");
      ok(r === 'warden', 'spawn warden');
      await sleep(1200);
      // 打到半血以下触发暴怒
      await ev(`(() => { const w = __game.block63.enemies.live('warden'); if (w) { w.hp = w.maxHp * 0.4; w.state = 'chase'; } })()`);
      const spd0 = await ev(`(() => { const w = __game.block63.enemies.live('warden'); return w ? w.speed : 0; })()`);
      let raged = null;
      try {
        await waitFor(`(() => { const w = __game.block63.enemies.live('warden'); return w && w.raged === true; })()`, 8000, '暴怒触发');
        raged = true;
      } catch (_) { raged = false; }
      ok(raged, '血量 40% 触发暴怒');
      const spd = await ev(`(() => { const w = __game.block63.enemies.live('warden'); return w ? w.speed : 0; })()`);
      ok(Math.abs(spd - spd0 * 1.4) < 0.05, `暴怒移速 ×1.4（${spd0.toFixed(2)} → ${spd.toFixed(2)}）`);
      // 等它出第一招：前摇应 = 原前摇 ×0.72
      let wind = null, mv = null, dur = null;
      try {
        await waitFor(`(() => { const w = __game.block63.enemies.live('warden'); return w && w.wdWindup != null; })()`, 20000, '出手');
        const d = await ev(`(() => { const w = __game.block63.enemies.live('warden');
          return JSON.stringify({ mv: w.wdMove, wind: w.wdWindup, dur: w.wdDur }); })()`);
        const j = JSON.parse(d); wind = j.wind; mv = j.mv; dur = j.dur;
      } catch (_) {}
      const expectWind = { sweep: 0.396, slam: 0.396, tag: 0.396, fan: 0.684, cabinet: 0.864 }[mv];
      ok(wind != null && expectWind != null && Math.abs(wind - expectWind) < 0.02,
        `暴怒前摇 = 原前摇×0.72（${mv}: ${wind} ≈ ${expectWind}）`);
      const expectDur = { sweep: 0.72, slam: 1.116, tag: 0.756, fan: 0.936, cabinet: 1.224 }[mv];
      ok(dur != null && expectDur != null && Math.abs(dur - expectDur) < 0.02,
        `暴怒收招 = 原时长×0.72（${mv}: ${dur} ≈ ${expectDur}）`);
      await shot('c-warden-rage.png');
      await ev('__game.block63.enemies.kill()');
      await sleep(300);
    }

    ok(jsErrors.filter((e) => !/favicon/i.test(e)).length === 0, '全程无 JS 报错', jsErrors.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    fails.push('FATAL: ' + e.message);
    console.log('  ✗ FATAL: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
  console.log(`\n===== block110-cdp: ${pass} pass / ${fail} fail =====`);
  if (fails.length) console.log('失败清单:\n - ' + fails.join('\n - '));
  process.exit(fail ? 1 : 0);
})();
