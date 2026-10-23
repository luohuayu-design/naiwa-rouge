// 第 53 块 CDP：用户报的七条，抓真实行为
// 跑法：先 `python -m http.server 8124 --bind 127.0.0.1`（cwd=naiwa-rouge），再 `node .tmp-block53-cdp.js`
//   A 概率事件真的摇出结果（不是「这一夜什么都没发生」）
//   B 第二关亮度 / 三只怪尺寸 / 卫队 0.7
//   C 箭雨教程卡（内容 + wait:'rain' 真的放一次才结束）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9357;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-53');
const OUT = path.join(os.tmpdir(), 'naiwa-block53');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
// 注意参数顺序：cond 在前、名字在后（和 .tmp-block53-test.mjs 一致）。
// 上一版写反了，结果 cond 被当名字打印，一屏「✓ true」全是假绿。
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
        await sleep(200);
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

    // 预置战绩：解锁第二关
    await goto(URL);
    await ev(`localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify({1:{wins:1,bestTime:60,bestKills:200,bestRound:20}})), 1`);
    await goto(URL);
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(600);

    // 进第一关
    await ev(`document.getElementById('btnStart').click(), 1`);
    await sleep(500);
    await ev(`document.querySelector('.lv-item[data-level="1"]').click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('diffNext')?.click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('curseStart')?.click(), 1`);
    await waitFor(`window.__game.levelId === 1`, 30000, '第一关开始');
    await sleep(500);
    // 新手教程弹窗会盖住事件卡
    if (await ev(`document.getElementById('tutAsk')?.classList.contains('on')`)) {
      await ev(`document.getElementById('tutNo').click(), 1`);
      await sleep(300);
    }

    // ============================================================
    // A. 概率事件（用户第 1 条）
    // ============================================================
    console.log('\n[A] 概率分支真的摇出结果');
    await ev(`__game.setCoins(400), 1`);
    const coin0 = await ev('__game.coins');

    // A1 掷骨子：押五枚，45% 赢回 13 / 55% 空手
    const runs = [];
    for (let i = 0; i < 16; i++) {
      const opened = await ev(`!!__game.event.trigger('diceBones')`);
      if (!opened) break;
      await sleep(120);
      const clicked = await ev('__game.event.choose(0)');
      await sleep(140);
      const lines = await ev('__game.event.resultLines');
      runs.push({ clicked, lines, coins: await ev('__game.coins') });
      await ev('__game.event.close(), 1');
      await sleep(80);
    }
    ok(runs.length >= 10, `触发并结算了 ${runs.length} 次掷骨子`);
    const flat = runs.map((r) => r.lines.join('|'));
    ok(flat.every((s) => s && s.length > 0), '每次结果页都有字', flat.find((s) => !s));
    ok(flat.every((s) => !s.includes('这一夜，什么也没发生')),
      '没有一次落到「这一夜，什么也没发生」', flat.find((s) => s.includes('这一夜，什么也没发生')));
    const wins = flat.filter((s) => s.includes('金币 +13')).length;
    const empty = flat.filter((s) => s.includes('这一把落空了')).length;
    ok(wins + empty === runs.length, `结果只有两种：赢 ${wins} 次 / 落空 ${empty} 次`);
    ok(wins > 0 && empty > 0, `两种结果都出现过（概率是真的在摇，不是死循环）`);
    ok(flat.every((s) => s.includes('金币 -5（已付）')), '押注的 5 金币每次都如实标了');
    const coinNow = await ev('__game.coins');
    ok(coinNow === coin0 - 5 * runs.length + 13 * wins,
      `金币账对得上：${coin0} −5×${runs.length} +13×${wins} = ${coinNow}`);

    // A2 两瓶药水（红）：70% 回血 / 30% 掉血 —— 要有具体数值，不能又是空
    await ev(`__game.stats.hp.cur = 4, 1`);
    const hp0 = await ev('__game.stats.hp.cur');
    await ev(`__game.event.trigger('potions')`);
    await sleep(150);
    await ev('__game.event.choose(0)');
    await sleep(150);
    const potionLines = await ev('__game.event.resultLines');
    ok(potionLines.some((s) => /生命 \+2\.0|生命 -1\.0/.test(s)),
      '红药水写出具体生命变化', JSON.stringify(potionLines));
    const hp1 = await ev('__game.stats.hp.cur');
    ok(hp1 !== hp0, `生命真的变了（${hp0} → ${hp1}）`);
    ok(!potionLines.join('').includes('这一夜，什么也没发生'), '药水不会再说「什么都没发生」');
    await shot('a-event-result');
    await ev('__game.event.close(), 1');

    // ============================================================
    // B. 进第二关：亮度 / 尺寸 / 卫队
    // ============================================================
    console.log('\n[B] 第二关亮度 + 三只怪尺寸');
    await goto(URL);
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(600);
    await ev(`document.getElementById('btnStart').click(), 1`);
    await sleep(500);
    const lv2 = await ev(`!!document.querySelector('.lv-item[data-level="2"]')`);
    ok(lv2, '第二关可选');
    await ev(`document.querySelector('.lv-item[data-level="2"]').click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('diffNext')?.click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('curseStart')?.click(), 1`);
    await waitFor(`window.__game.levelId === 2`, 30000, '第二关开始');
    await sleep(700);
    if (await ev(`document.getElementById('tutAsk')?.classList.contains('on')`)) {
      await ev(`document.getElementById('tutNo').click(), 1`);
      await sleep(300);
    }

    const light = await ev(`(() => {
      const s = __game.scene;
      const hemi = s.children.find((o) => o.isHemisphereLight);
      const dirs = s.children.filter((o) => o.isDirectionalLight);
      return {
        fog: s.fog.density,
        fogColor: s.fog.color.getHexString(),
        bg: s.background.getHexString(),
        hemi: hemi ? hemi.intensity : null,
        dirs: dirs.map((d) => +d.intensity.toFixed(2)),
      };
    })()`);
    ok(Math.abs(light.fog - 0.0122) < 1e-6, `第二关雾浓度 0.0122（实际 ${light.fog}）`);
    ok(light.hemi >= 1.5, `第二关天光 1.55（实际 ${light.hemi}）`);
    ok(light.bg === '191327', `第二关底色换成提亮版（${light.bg}）`);
    ok(Math.max(...light.dirs) >= 3.0, `月光 ≥ 3.0（实际 ${light.dirs.join('/')}）`);
    await shot('b-level2-bright');

    // B2 三只怪的实际渲染缩放 = height / sourceHeight
    const sizes = await ev(`(() => {
      __game.enemies.reset();
      const out = {};
      for (const k of ['hexer', 'pyro', 'hierarch']) {
        const e = __game.enemies.spawn(k, { x: 4, z: 0 });
        if (!e) { out[k] = null; continue; }
        out[k] = { h: e.height, sx: +e.model.scale.x.toFixed(4), src: e.cfg.sourceHeight };
        __game.enemies.reset();
      }
      return out;
    })()`);
    for (const [k, want] of [['hexer', 2.52], ['pyro', 1.464], ['hierarch', 3.24]]) {
      const s = sizes[k];
      ok(s && Math.abs(s.h - want) < 0.002, `${k} 身高 ${want}（实际 ${s && s.h}）`);
      ok(s && Math.abs(s.sx - want / s.src) < 0.002,
        `${k} 渲染缩放与身高一致（${s && s.sx} ≈ ${s && (want / s.src).toFixed(4)}）`);
    }

    // B3 卫队 0.7 倍（按实例缩放，不动 warrior 本体）
    const guard = await ev(`(() => {
      __game.enemies.reset();
      const g = __game.enemies.spawn('warrior', { x: -3, z: 0 }, { scale: 0.7 });
      const n = __game.enemies.spawn('warrior', { x: 3, z: 0 });
      return { gsx: +g.model.scale.x.toFixed(4), gbar: +g.bar.spr.position.y.toFixed(2),
               nsx: +n.model.scale.x.toFixed(4), nbar: +n.bar.spr.position.y.toFixed(2),
               gh: g.height, nh: n.height };
    })()`);
    ok(Math.abs(guard.gsx / guard.nsx - 0.7) < 0.01,
      `卫队模型是 0.7 倍（${guard.gsx} vs ${guard.nsx}）`);
    ok(Math.abs(guard.gh / guard.nh - 0.7) < 0.01, `卫队的 e.height 也按 0.7 算（${guard.gh}）`);
    ok(guard.gbar < guard.nbar, `卫队血条跟着降下来（${guard.gbar} < ${guard.nbar}）`);

    // ============================================================
    // C. 箭雨教程卡
    // ============================================================
    console.log('\n[C] 箭雨教程卡');
    ok((await ev('__game.wtut.all()')).includes('arrowrain'), '教程表里有 arrowrain');
    await ev('__game.wtut.resetSeen(), 1');
    await ev(`__game.wtut.show('arrowrain'), 1`);
    await waitFor(`document.getElementById('weaponTut').classList.contains('on')`, 15000, '教程卡打开');
    ok(true, '教程卡能弹出');
    ok(/技能教程/.test(await ev('__game.wtut.label()')), `顶部写「技能教程」（${await ev('__game.wtut.label()')}）`);
    ok((await ev('__game.wtut.kind()')) === 'arrowrain', '当前条目是 arrowrain');
    ok((await ev('__game.wtut.steps()')) === 3, '三步');
    ok(/技能栏/.test(await ev('__game.wtut.title()')), `第一步讲技能栏（${await ev('__game.wtut.title()')}）`);
    await sleep(420); await shot('c-tut-step1');  // 等 0.22s 淡入动画走完再截，否则卡片是半透明的
    await ev('__game.wtut.next(), 1');
    await sleep(150);
    ok(/它自己挑地方/.test(await ev('__game.wtut.title()')), '第二步讲自动选点');
    await ev('__game.wtut.next(), 1');
    await sleep(150);
    ok((await ev('__game.wtut.nextBtn()')) === '知道了', '第三步是最后一步');
    ok((await ev(`document.getElementById('wtNext').classList.contains('on')`)) === false,
      '最后一步藏起「下一步」，必须先真的放一次箭雨');
    // 真放一次
    await ev(`__game.arrowRain.unlock(), 1`);
    // ⚠️ 两个坑：① 刚刷出来的怪 state='spawn'，arrowRain 选目标会跳过；
    //   ② 放在玩家脚边会被自动攻击瞬间砍死（探针里那只 1.6 格的 minion 就这么没的）。
    // 所以放 6 格外、speedScale 0 让它站定，等它转成 chase 再放。
    await ev(`__game.enemies.reset(); __game.enemies.spawn('minion', { x: 6, z: 0 }, { speedScale: 0 }), 1`);
    await sleep(1400);
    const preDiag = await ev(`JSON.stringify({
      look: __game.enemies.all().map((e) => e.type + ':' + e.state),
      rain: __game.arrowRain.state(),
    })`);
    console.log('    放箭前：' + preDiag);
    await waitFor(`__game.enemies.all().some((e) => e.state === 'chase')`, 12000, '怪进入可攻击状态');
    const fired = await ev(`__game.arrowRain.fire(0, 0)`);
    ok(fired === true, '箭雨放出去了');
    await waitFor('__game.arrowRain.state().strikes > 0', 8000, '落箭实例出现');
    ok(true, '箭雨实例真的在跑（strikeCount > 0）');
    await waitFor(`__game.wtut.open() === false`, 12000, '教程自动结束');
    ok(true, '放完自动过关（wait:rain 生效）');
    ok((await ev('__game.wtut.seen()')).includes('arrowrain'), '记成已看过，不再重复打扰');
    await shot('c-tut-done');

    // C2 环剑教程没被破坏（老功能）
    ok((await ev('__game.wtut.all()')).includes('ring'), '环剑教程还在（没被改坏）');

    // ============================================================
    console.log('\n[D] 无 JS 报错');
    const realErrors = jsErrors.filter((s) => s && !/favicon|AudioContext|autoplay/i.test(s));
    ok(realErrors.length === 0, '运行期没有 JS 报错', realErrors.slice(0, 3).join(' | '));
  } catch (err) {
    fail++;
    fails.push('异常：' + err.message);
    console.log('\n✗ 异常：' + err.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) console.log('失败项：\n  ' + fails.join('\n  '));
  console.log('截图目录：' + OUT);
  process.exit(fail ? 1 : 0);
})();
