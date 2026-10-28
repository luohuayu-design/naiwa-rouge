// 第 114 块 CDP：第十一关「钟楼雾原」实机冒烟
//   A 雾：开局无雾 → 强制起一团 → 主角在雾里（判定环置顶 + 轮廓微光）→ 切关雾散
//   B 墨丸：买入 → 技能键出现 → 按一下落地 → 怪踩上去炸 → 同屏上限
//   C 誊录员：站远处画墨线 → 地上留痕 → 玩家踩上去持续掉血且变慢
//   D 收账人：读条 → 真的收走一样东西（属性表当场变）→ 8 秒还回来
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-114-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9396;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-114');
const OUT = path.join(os.tmpdir(), 'naiwa-block114');
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
    '--no-proxy-server',
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
    await sleep(1400);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(500);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(500);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);

    // ============================================================
    console.log('\n[进局] 第十一关');
    // ============================================================
    ok(await ev('__game.setPendingLevel(11)') === 11, 'setPendingLevel(11)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    ok(await settle(), '进入 playing');
    await ev('__game.setWaves(true)');       // 冻波次：只测自己造的东西
    // ⚠️ 巡检用的「不死」：这一关 10 点血，测试里有大量「站着等」的段落，
    // 会被场上的怪白白砍死；主角一死 gameState 变 over，主循环不再推进，
    // 后面所有「等它发生」的断言都会超时（表现成「机制坏了」，其实是被打死了）。
    // 只有 C 段真正要量掉血时才关掉它（见下）。
    await ev(`window.__keepHp = setInterval(() => {
      try { if (__game.state === 'playing') __game.stats.hp.cur = __game.stats.get('maxHp'); } catch (_) {}
    }, 250); 1`);
    await ev('__game.block63.enemies.kill()');
    await ev("__game.stats.hp.cur = __game.stats.get('maxHp')");
    ok(await ev("Math.abs(__game.stats.hp.cur - __game.stats.get('maxHp')) < 0.001"), '巡检前先把血补满（不死巡检已开）');
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    ok(await ev('__game.levelId') === 11, '当前关卡 id = 11');
    ok(await ev('__game.block114.fog.on()') === true, '这一关的雾系统是开的');
    ok(await ev('__game.arenaRadius') === 18, '场地半径 18');

    // ============================================================
    console.log('\n[A] 雾');
    // ============================================================
    {
      // 进场后雾会自己起（build 里给了 0.8 秒缓冲，走到这里已经过了几秒）
      const c0 = await ev('__game.block114.fog.count()');
      ok(c0 >= 1 && c0 <= 4, '进场之后雾会自己起来', `count=${c0}`);
      const before = c0;
      const n = await ev('__game.block114.fog.spawn(true)');
      ok(n === Math.min(4, before + 1), '再强制起一团（受同屏上限约束）', `${before} → ${n}`);
      ok(await ev('__game.block114.fog.heat(0)'), '把这一团拔到满强度');
      const patch = (await ev('__game.block114.fog.list()'))[0];
      ok(!!patch && patch.r >= 4.4 && patch.r <= 6.5, `单团半径在配置区间内（${patch && patch.r}）`);
      ok(!!patch && patch.a > 0.9, `强度满（a=${patch && patch.a}）`);
      // 主角走进雾心
      await ev(`__game.warp(${patch.x}, ${patch.z})`);
      await sleep(500);
      ok(await ev(`__game.block114.fog.inside(${patch.x}, ${patch.z})`) === true, '主角站在雾里');
      ok(await ev(`__game.block114.fog.density(${patch.x}, ${patch.z})`) > 0.5, '雾心浓度 > 0.5（镜头会摇）');
      ok(await ev('__game.block114.fog.halo()') === true, '雾里那层极淡轮廓微光开着');
      const halo = await ev('__game.block114.fog.haloPos()');
      const pp = await ev('__game.pos()');
      ok(halo && Math.abs(halo.x - pp.x) < 0.2 && Math.abs(halo.z - pp.z) < 0.2, '微光跟着主角走',
        `halo=${JSON.stringify(halo)} pos=${JSON.stringify(pp)}`);
      // 判定环置顶（depthTest:false + renderOrder 900）
      const ringTop = await ev('(() => { const m = __game.playerRing.mesh; return { vis: m.visible, dt: m.material.depthTest, order: m.renderOrder }; })()');
      ok(ringTop && ringTop.dt === false && ringTop.order >= 900, '雾里只留判定环（置顶穿雾）', JSON.stringify(ringTop));
      await shot('a-fog.png');
      // 换到第十关：雾必须整片散掉、环要还原
      await ev('__game.setLevel(10)');
      await sleep(400);
      ok(await ev('__game.block114.fog.on()') === false, '换到第十关雾关掉了');
      ok(await ev('__game.block114.fog.count()') === 0, '雾团全清');
      const ring10 = await ev('(() => { const m = __game.playerRing.mesh; return { dt: m.material.depthTest, order: m.renderOrder }; })()');
      ok(ring10 && ring10.dt === true, '没雾的关卡判定环还原（不再穿地）', JSON.stringify(ring10));
      await ev('__game.setLevel(11)');
      await ev('__game.warp(0, 0)');
      await sleep(400);
      ok(await ev('__game.block114.fog.on()') === true, '切回第十一关雾又开了');
      await ev('__game.block114.fog.clear()');
      await ev('__game.block114.fog.spawn(true)');
      await ev('__game.block114.fog.heat(0)');
    }

    // ============================================================
    console.log('\n[B] 墨丸');
    // ============================================================
    {
      ok(await ev("!!document.querySelector('.sk[data-skill=mine]')"), '技能栏里有「墨丸」这一格（DOM 已建）');
      ok(await ev("getComputedStyle(document.querySelector('.sk[data-skill=mine]')).display === 'none'"),
        '没买法器时这一格是藏着的');
      ok(await ev('__game.block114.grantMine(1)') >= 1, '买到墨丸 lv1');
      await sleep(600);
      const vis = await ev(`(() => {
        const b = document.querySelector('.sk[data-skill=mine]');
        if (!b) return null;
        const cs = getComputedStyle(b);
        return { display: cs.display, ready: b.classList.contains('ready'), num: (b.querySelector('.sk-num') || {}).textContent };
      })()`);
      ok(vis && vis.display !== 'none', '买到后这一格出现', JSON.stringify(vis));
      ok(vis && vis.ready === true, '刚买到就是亮的（可以放）', JSON.stringify(vis));

      ok(await ev('__game.block114.mines.count()') === 0, '场上还没有雷');
      ok(await ev("__game.pressSkill('mine')") === true, '按一下技能键');
      await sleep(300);
      ok(await ev('__game.block114.mines.count()') === 1, '脚下多了一枚墨丸');
      ok(await ev('__game.block114.mines.cdLeft()') > 6, '进入 8 秒冷却');
      ok(await ev("__game.pressSkill('mine')") === false, '冷却中按不动（不会白放）');

      // 放一只怪让它走过来踩
      // ⚠️ 先清场：`live('warrior')` 拿的是「第一只 warrior」，场上原本就有波次刷的怪，
      // 不清干净的话会去量错人（曾经量到 -8.9 格外的另一只，断言假红）。
      await ev('__game.block63.enemies.kill()');
      await sleep(200);
      const mp = await ev('__game.block114.mines.list()');
      const mx = mp[0].x, mz = mp[0].z;
      ok(await ev(`__game.block63.enemies.spawn('warrior', ${mx + 1.2}, ${mz})`) === 'warrior', '在雷边 1.2 格放一只靶子');
      await ev(`(() => { const w = __game.block63.enemies.live('warrior'); if (w) { w.hp = w.maxHp = 999; w.state = 'chase'; } })()`);
      let boom = null;
      try {
        await waitFor(`(() => {
          const w = __game.block63.enemies.live('warrior');
          return w && w.hp < 999;
        })()`, 15000, '踩雷掉血');
        boom = await ev(`(() => {
          const w = __game.block63.enemies.live('warrior');
          return { hp: w.hp, left: __game.block114.mines.count(), blasts: __game.block114.mines.blasts() };
        })()`);
      } catch (_) { boom = null; }
      ok(boom && boom.hp < 999, '怪踩上去就被炸了', boom && `掉到 ${boom.hp}`);
      ok(boom && boom.left === 0, '雷用掉了');
      ok(boom && boom.blasts >= 1, '炸过之后计数 +1', boom && boom.blasts);
      await shot('b-mine.png');
      // 上限
      await ev('__game.block63.enemies.kill()');
      const placed = await ev(`(async () => {
        let n = 0;
        for (let i = 0; i < 30; i++) {
          if (__game.pressSkill('mine')) n++;
          await new Promise((r) => setTimeout(r, 260));
        }
        return { placed: n, count: __game.block114.mines.count(), cap: __game.block114.mines.cap() };
      })()`);
      ok(placed && placed.count <= placed.cap && placed.cap === 3,
        `连按也放不超上限（现在 ${placed && placed.count} / ${placed && placed.cap}）`);
      await ev('__game.block114.mines.reset()');
    }

    // ============================================================
    console.log('\n[C] 誊录员：墨线');
    // ============================================================
    {
      await ev('__game.warp(0, 6)');
      await sleep(300);
      // ⚠️ 用 block63 的包装口（(type, x, z)），别用 __game.enemies.spawn ——
      // 原生那个签名是 (type, at{x,z}, opts)，传数字会让坐标变 undefined。
      ok(await ev("__game.block63.enemies.spawn('clerk', 0, -2)") === 'clerk', 'spawn 誊录员');
      await ev(`(() => { const c = __game.block63.enemies.live('clerk'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()`);
      ok(await ev('__game.enemies.clerkCount()') === 1, '它活着');
      // 它要走远一点才画：轮询等第一道墨线落地（或者先看到预警）
      let sawCast = false;
      try {
        await waitFor('__game.enemies.inkCasts().length > 0 || __game.enemies.inkCount() > 0', 25000, '起手画线');
        sawCast = true;
      } catch (_) { sawCast = false; }
      ok(sawCast, '它开始画线了（预警线 / 墨痕出现）');
      let ink = null;
      try {
        await waitFor('__game.enemies.inkCount() > 0', 20000, '墨痕落地');
        ink = (await ev('__game.enemies.inks()'))[0];
      } catch (_) { ink = null; }
      ok(!!ink, '地上留下墨痕', JSON.stringify(ink));
      ok(!!ink && Math.abs(ink.len - 13) < 0.01, `墨痕长 13 格（${ink && ink.len}）`);
      ok(!!ink && Math.abs(ink.half - 0.62) < 0.01, `半宽 0.62（${ink && ink.half}）`);
      ok(!!ink && ink.t > 0 && ink.t <= ink.life, `有剩余寿命（${ink && ink.t} / ${ink && ink.life}）`);
      // 站到墨痕正中（判定与视觉同源：用 inkHit 当真相源）
      const mid = await ev(`(() => { const k = __game.enemies.inks()[0];
        return { x: k.x + k.dx * k.len / 2, z: k.z + k.dz * k.len / 2 }; })()`);
      await ev(`__game.warp(${mid.x}, ${mid.z})`);
      await sleep(250);
      const distMid = await ev(`__game.enemies.inkHit(${mid.x}, ${mid.z})`);
      ok(distMid != null && distMid < 0.7, `人站在墨痕上（离中线 ${distMid} 格）`);
      // ⚠️ 只留「墨痕」这一个变量：把誊录员（近战 1.1）和其它怪全清掉，
      // 并**关掉不死巡检**（不然血被每 250ms 补满，永远看不到掉血）。
      await ev('clearInterval(window.__keepHp)');
      await ev('__game.block63.enemies.kill()');
      await ev("__game.stats.hp.cur = __game.stats.get('maxHp')");
      await sleep(200);
      const hp0 = await ev('__game.stats.hp.cur');
      let hurt = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        const hp = await ev('__game.stats.hp.cur');
        if (hp < hp0 - 0.1) { hurt = true; break; }
        await sleep(200);
      }
      ok(hurt, '站在墨痕上会持续掉血');
      ok((await ev('__game.curse().move')) < 1, '墨痕还会拖慢脚步（move < 1）');
      ok(await ev('__game.state') === 'playing', '这一段里主角还活着');
      // 量完把巡检装回去（后面还有「等 8 秒归还」这种长等待）
      await ev(`window.__keepHp = setInterval(() => {
        try { if (__game.state === 'playing') __game.stats.hp.cur = __game.stats.get('maxHp'); } catch (_) {}
      }, 250); 1`);
      await ev("__game.stats.hp.cur = __game.stats.get('maxHp')");
      await shot('c-clerk-ink.png');
      await ev('__game.block63.enemies.kill()');
      await ev('__game.block114.clearSteal()');
      await sleep(300);
    }

    // ============================================================
    console.log('\n[D] 收账人：收走一样东西');
    // ============================================================
    {
      // ⚠️ 先把场上的墨痕抹干净、血补满：收账人本身 0 伤害，
      // 但地上残留的墨会替它「把主角耗死」，同样会把断言拖成假红。
      await ev('__game.enemies.clearInks()');
      await ev('__game.warp(0, 0)');
      await ev('__game.block63.enemies.kill()');
      await ev("__game.stats.hp.cur = __game.stats.get('maxHp')");
      await sleep(300);
      // 先看「没收过」的空态
      const empty = await ev('__game.block114.steal()');
      ok(empty && empty.stat === '' && empty.t === 0 && Object.keys(empty.skills).length === 0, '没收过的时候是空表');

      ok(await ev("__game.block63.enemies.spawn('collector', 3.0, 0)") === 'collector', 'spawn 收账人');
      await ev(`(() => { const c = __game.block63.enemies.live('collector'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()`);
      // 读条 → 收走
      let read = false;
      try {
        await waitFor('!!__game.enemies.collectCast()', 25000, '开始读条');
        read = true;
      } catch (_) { read = false; }
      ok(read, '它会站定读条（collectCast 有进度）');
      if (read) {
        const prog = (await ev('__game.enemies.collectCast()')).progress;
        ok(prog > 0 && prog <= 1, `读条进度 0~1（${prog}）`);
      }
      let stolen = null;
      try {
        await waitFor("__game.block114.steal().stat !== '' || Object.keys(__game.block114.steal().skills).length > 0", 25000, '真的收走');
        stolen = await ev('__game.block114.steal()');
      } catch (_) { stolen = null; }
      ok(!!stolen, '读完条真的收走了东西', JSON.stringify(stolen));
      if (stolen && stolen.stat) {
        // 属性真的被削弱了：src 挂在 stats 上
        const mul = await ev(`(() => {
          const d = __game.stats.dumpMods();
          return d.filter((m) => String(m.src || '').startsWith('steal:')).length;
        })()`);
        ok(mul >= 1, '属性表上真的挂了一条 steal: 的临时削弱', `条数 ${mul}`);
        ok(stolen.t > 0 && stolen.t <= 8.0, `还有 ${stolen.t} 秒（总共 8 秒）`);
        // ⚠️ 先把它打死再等：收账人 9 秒会再收一次，场上有它的话
        // 「8 秒到期」这件事永远等不到（刚还回去又被收走）。
        await ev('__game.block63.enemies.kill()');
        // 8 秒后自动还回来
        let back = false;
        const t1 = Date.now();
        while (Date.now() - t1 < 20000) {
          const s = await ev('__game.block114.steal()');
          if (s.stat === '' && s.t === 0) { back = true; break; }
          await sleep(300);
        }
        ok(back, '到点自动还回来（不会永久削弱）');
        const left = await ev(`__game.stats.dumpMods().filter((m) => String(m.src || '').startsWith('steal:')).length`);
        ok(left === 0, 'stats 上那条 mod 也摘干净了', `剩 ${left}`);
      }
      await shot('d-collector.png');
      await ev('__game.block63.enemies.kill()');
      await sleep(200);
    }

    // ============================================================
    console.log('\n[E] 收尾');
    // ============================================================
    ok(jsErrors.filter((e) => !/favicon/i.test(e)).length === 0, '全程无 JS 报错', jsErrors.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    fails.push('FATAL: ' + e.message);
    console.log('  ✗ FATAL: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
  console.log(`\n===== block114-cdp: ${pass} pass / ${fail} fail =====`);
  if (fails.length) console.log('失败清单:\n - ' + fails.join('\n - '));
  process.exit(fail ? 1 : 0);
})();
