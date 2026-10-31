// 第 107 块 CDP：第十关「塔顶井台」+ 法器「傀儡术」实机冒烟
//   A 进第十关：arena 17 / 井口在场地中央 / 主题加载不报错
//   B 四只新怪 spawn：照影抄面板（血 = 主角上限 60%）、收件人、等的那个、回声
//   C 傀儡术：买到 → 技能键出现 → 按下真暂停 → 二选一 → 点雪傀儡召出 + CD 40
//   D 雪傀儡拉仇恨：朝玩家走的怪改道朝它走；贴脸磨血掉血
//   E 铁傀儡出手：两秒一拳把靶子打掉血
//   F 取消不罚：点卡外收卡，不召不转 CD；再按还能打开
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-107-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9393;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-107');
const OUT = path.join(os.tmpdir(), 'naiwa-block107');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&hints';

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
    // 过渡态逐环清掉（老规矩：hint / wtut / meet / weapon / tutorial）
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

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    // 公告 → 签到 → 宣传有礼（350ms 定时器链：点早了它还会弹，进局后再清一次）
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
    ok(await ev('__game.levelId') === 10, '当前是第十关', String(await ev('__game.levelId')));
    await ev('__game.setWaves(true)');   // 冻住波次：只测自己造的靶子

    // ============================================================
    console.log('\n[A] 井台现场');
    // ============================================================
    {
      // 兜底：公告链若在进局后才弹，截图前再清一次
      await ev('if (__game.notice.open()) __game.notice.hide(); 1');
      await sleep(400);
      ok(await ev('__game.arenaRadius') === 17, 'arena 17');
      const well = await ev('__game.block107.well()');
      ok(well && well.x === 0 && well.z === 0 && well.r === 2.4, '井口在场地中央 r 2.4', JSON.stringify(well));
      // 出生点让开井口：不在井里，开局白吃 3 点的事不能发生
      const spawnPos = await ev('__game.pos()');
      ok(Math.hypot(spawnPos.x - well.x, spawnPos.z - well.z) > well.r,
        '出生点在井外（开局不掉血）', JSON.stringify(spawnPos));
      // 走进井里会被吐回井沿 + 掉 3 点：warp 到井心，1 秒后应在井外且掉血
      await ev('__game.warp(0, 0)');
      await sleep(1000);
      const pushed = await ev('__game.pos()');
      const hpA = await ev('__game.stats.hp.cur');
      ok(Math.hypot(pushed.x, pushed.z) >= well.r + 0.1, '掉进井里被吐回井沿', JSON.stringify(pushed));
      ok(hpA <= 10 - 3 + 0.01, `掉井掉 3 点（当前血 ${hpA}）`);
      await sleep(1200);
      ok(jsErrors.filter((e) => !/favicon/i.test(e)).length === 0, '进场无 JS 报错', jsErrors.slice(0, 2).join(' | '));
      await shot('a-welltop.png');
    }

    // ============================================================
    console.log('\n[B] 三只新怪 spawn 冒烟（第 125 块删了等的那个）');
    // ============================================================
    {
      for (const t of ['mirror', 'addressee', 'echo']) {
        const r = await ev(`__game.block63.enemies.spawn('${t}', ${4 + Math.random() * 3}, ${-3 + Math.random() * 6})`);
        ok(r === t, `spawn ${t}`);
      }
      await sleep(900);
      ok(await ev(`__game.block63.enemies.list().filter(e => ['mirror','addressee','echo'].includes(e.type) && e.state !== 'dead').length`) === 3,
        '三只都活着');
      await shot('b-four-monsters.png');
      // 照影：血 = min(玩家上限 60%, hpCap)（满面板主角 10 → 6）
      const want = await ev(`(() => {
        const m = __game.enemyTypes.mirror.mirror;
        const cap = m.hpCap != null ? m.hpCap : Infinity;
        return Math.min(0.6 * __game.stats.get('maxHp'), cap);
      })()`);
      const mhp = await ev(`__game.block63.enemies.list().find(e => e.type==='mirror' && e.state !== 'dead').hp`);
      ok(Math.abs(mhp - want) <= 0.3, `照影出生血 = min(上限60%, ${want})`, `${mhp} / ${want}`);
      await ev('__game.block63.enemies.kill()');
      await sleep(300);
    }

    // ============================================================
    console.log('\n[C] 傀儡术：技能键 → 真暂停 → 二选一');
    // ============================================================
    {
      ok(await ev('__game.block107.skillBtnVisible()') === false, '没买傀儡术：键藏着（按钮节点常驻 DOM，看的是可见性）');
      ok(await ev('__game.block107.grantPuppet(1)') === 1, '买到 1 级');
      await waitFor('__game.block107.skillBtnVisible()', 8000, '技能键出现');
      ok(true, '技能键出现在技能栏');
      // 按下 → 真暂停（gameState hint）+ 卡里有两张选项
      await ev(`(() => { const b = document.querySelector('#skillBar .sk[data-skill="golem"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()`);
      await waitFor("document.querySelector('.hint-card').classList.contains('on')", 5000, '二选一卡弹出');
      ok(await ev('__game.state') === 'hint', '世界真的暂停（state hint）');
      ok(await ev(`document.querySelectorAll('.hint-card .hi-choice').length`) === 2, '卡里是铁 / 雪两张选项');
      // 点卡外 = 取消
      await ev(`document.querySelector('.hint-card').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
      await sleep(400);
      ok(await ev('__game.state') === 'playing', '取消回到 playing');
      ok(await ev('__game.block107.golems.count()') === 0, '取消没召出');
      ok(await ev('__game.block107.golems.cdLeft()') === 0, '取消不转冷却（误按不罚）');
      // 再按 → 点雪傀儡（第二张选项）
      await ev(`(() => { const b = document.querySelector('#skillBar .sk[data-skill="golem"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()`);
      await waitFor("document.querySelector('.hint-card').classList.contains('on')", 5000, '再次打开');
      await ev(`(() => { const cs = [...document.querySelectorAll('.hint-card .hi-choice')]; cs[1].click(); })()`);
      await waitFor('__game.block107.golems.count() === 1', 5000, '雪傀儡召出');
      ok(await ev('__game.state') === 'playing', '选完回到 playing');
      const info = await ev('__game.block107.golems.info()');
      ok(info[0].kind === 'snow' && info[0].maxHp === 10, '雪傀儡 10 血（1 级不乘成）', JSON.stringify(info));
      const cd = await ev('__game.block107.golems.cdLeft()');
      ok(cd > 38 && cd <= 40, `冷却开始转（剩 ${cd}）`);
      ok(await ev(`__game.block107.golems.tauntAt()`) !== null, 'tauntAt 有值（雪在场）');
      await shot('c-snow-golem.png');
    }

    // ============================================================
    console.log('\n[D] 雪傀儡拉仇恨 + 磨血');
    // ============================================================
    {
      // 雪傀儡在主角面朝方向 1.5 格（出生点朝 -z → 约 (0,-1.5)）。主角挪回原点，
      // 造一只战士在 (8,3)：到傀儡 4.6 格、到主角 8.5 格 —— 朝玩家走就会被改道。
      await ev('__game.warp(0, 0)');
      const gp = await ev('__game.block107.golems.info()[0]');
      const gx = gp ? gp.x : 0, gz = gp ? gp.z : -1.5;
      await ev(`__game.block63.enemies.spawn('warrior', 8, 3)`);
      await ev(`(() => { const w = __game.block63.enemies.live('warrior'); if (w) { w.hp = w.maxHp = 999; w.state = 'chase'; } })()`);
      await sleep(1800);   // 走一会
      const w = await ev(`(() => { const x = __game.block63.enemies.live('warrior'); return x ? { x: x.pos.x, z: x.pos.z } : null; })()`);
      ok(w && Math.hypot(w.x - gx, w.z - gz) < Math.hypot(w.x, w.z) + 0.4,
        '战士在朝雪傀儡走而不是朝主角', JSON.stringify(w));
      // 贴脸磨血：把战士直接放到傀儡脸上，几秒后傀儡掉血
      await ev(`__game.block63.enemies.place('warrior', ${gx + 0.6}, ${gz})`);
      const hp0 = (await ev('__game.block107.golems.info()'))[0].hp;
      await sleep(1800);
      const hp1 = (await ev('__game.block107.golems.info()'))[0].hp;
      ok(hp1 < hp0, `贴脸怪磨傀儡的血（${hp0} → ${hp1}）`);
      await ev('__game.block63.enemies.kill()');
      await sleep(200);
    }

    // ============================================================
    console.log('\n[E] 铁傀儡出手');
    // ============================================================
    {
      // 冷却 40 秒等不起，直接 reset（清 CD / 清场上 / 清加成），再灌 2 级召铁傀儡
      await ev('__game.block107.golems.reset()');
      ok(await ev('__game.block107.grantPuppet(2)') === 2, '灌到 2 级');
      ok(await ev(`__game.block107.golems.summon('iron', { x: 3, z: 0 })`) !== null, '召出铁傀儡');
      const gi = await ev('__game.block107.golems.info()');
      ok(gi[0].kind === 'iron' && gi[0].maxHp === Math.round(14 * 1.3), '铁傀儡 2 级血 = 18（14×1.3）', JSON.stringify(gi));
      ok(await ev('__game.block107.golems.tauntAt()') === null, '铁傀儡不拉仇恨（tauntAt 空）');
      // 造靶子贴脸：warrior (4.2, 0) 钉血 999 → 两秒一拳 1.5×攻击×1.25
      await ev(`__game.block63.enemies.spawn('warrior', 4.2, 0)`);
      await ev(`(() => { const w = __game.block63.enemies.live('warrior'); w.hp = w.maxHp = 999; w.state = 'chase'; })()`);
      const thp0 = await ev(`__game.block63.enemies.live('warrior').hp`);
      await sleep(5600);
      const thp1 = await ev(`__game.block63.enemies.live('warrior').hp`);
      ok(thp1 < thp0, `铁傀儡两秒一拳真的掉血（${thp0} → ${thp1}）`);
      await ev('__game.block63.enemies.kill()');
      await shot('e-iron-golem.png');
    }

    // ============================================================
    console.log('\n[F] 收尾');
    // ============================================================
    {
      const realErr = jsErrors.filter((e) => !/favicon/i.test(e));
      ok(realErr.length === 0, '全程无 JS 报错', realErr.slice(0, 2).join(' | '));
    }
  } catch (e) {
    ok(false, '套件异常', e.message);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    chrome.kill();
  }
  console.log(`\n====================================================`);
  console.log(`第 107 块 CDP：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败清单：'); for (const f of fails) console.log(' - ' + f); process.exit(1); }
  process.exit(0);
})();
