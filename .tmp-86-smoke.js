// 第 86 块 · 冒烟：新开一局必须从「干净状态」开始
// 用户报的 bug：上一关没打完就存档退出，再开另一关，上一局的属性和武器会跟着进来。
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-86-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9386;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-86smoke');
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
    // 把各种会冻结世界的过渡态点掉，直到真的在 playing
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

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    // ---------- 1. 第一局：进第一关，攒一身「上一局的收获」 ----------
    console.log('\n[1] 第一局：进第一关并制造局内成长');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    ok(await settle(), '第一局进入 playing');
    ok(await ev('__game.levelId') === 1, '在第一关');

    const baseAttack = await ev('__game.stats.get("attack")');
    const baseHp = await ev('__game.stats.get("maxHp")');
    const baseWAtk = await ev('__game.wstats.get("attack")');
    console.log(`     base: attack=${baseAttack} maxHp=${baseHp} wAttack=${baseWAtk}`);

    await ev('__game.stats.addMod({ stat:"attack", flat:6, src:"upg:test:1" })');
    await ev('__game.stats.addMod({ stat:"maxHp", flat:8, src:"upg:test:1" })');
    await ev('__game.wstats.addMod({ stat:"attack", pct:0.5, src:"upg:test:2" })');
    await ev('__game.weapon.grant()');
    await ev('__game.addSword("frost")');
    await ev('__game.addCoins(250)');
    await ev('__game.bag.add("potion", 3)');
    // 造 3 只停在原地的怪（第一关的 warrior，模型现成）—— 存档退出时它们还活着
    await ev('__game.setWaves(true)');
    await ev('(async () => { for (let i = 0; i < 3; i++) __game.block63.enemies.spawn("warrior", 6 + i, 6); return 1; })()');
    await sleep(400);
    await ev('__game.block63.enemies.set("warrior", { state: "idle", t: 0 })');

    const atkNow = await ev('__game.stats.get("attack")');
    const swordsNow = await ev('__game.swordKinds');
    const liveNow = await ev('__game.enemies.list.filter((e) => e.state !== "dead").length');
    ok(atkNow > baseAttack + 5, `第一局攻击力确实涨了 ${baseAttack} → ${atkNow}`, String(atkNow));
    ok(swordsNow.some((k) => k.kind === 'frost'), '第一局拿到了元素剑（冰）', JSON.stringify(swordsNow));
    ok(liveNow >= 3, `场上有 ${liveNow} 只活怪（存档退出时不会自己消失）`, String(liveNow));

    // ---------- 2. 存档并退出（真的走 UI 那条链） ----------
    console.log('\n[2] 存档并退出');
    await ev('document.getElementById("exitBtn").click()');
    await waitFor('document.getElementById("confirmAsk").classList.contains("on")', 4000, '等「存档并退出」确认框');
    await ev('document.getElementById("caOk").click()');
    ok(await waitFor('__game.state === "title"', 6000, '回到标题页'), '退出后游戏状态是 title');
    const runs = await ev('__game.run.load().length');
    ok(runs >= 1, `留下了 ${runs} 份存档`, String(runs));

    // ---------- 3. 开另一关：属性 / 武器 / 金币 / 背包 / 怪都不能跟过来 ----------
    console.log('\n[3] 开另一关（第二关）—— 上一局的东西必须全清');
    await ev('__game.setPendingLevel(2)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    ok(await settle(), '第二局进入 playing');
    ok(await ev('__game.levelId') === 2, '这一次真的在第二关');

    const atk2 = await ev('__game.stats.get("attack")');
    const hp2 = await ev('__game.stats.get("maxHp")');
    const wAtk2 = await ev('__game.wstats.get("attack")');
    const mods2 = await ev('__game.stats.dumpMods().filter((m) => /^upg:/.test(m.src)).length');
    ok(Math.abs(atk2 - baseAttack) < 0.01, `攻击力回到基线 ${atk2}（第一局是 ${atkNow}）`, String(atk2));
    ok(Math.abs(hp2 - baseHp) < 0.01, `生命上限回到基线 ${hp2}（第一局加到 ${baseHp + 8}）`, String(hp2));
    ok(Math.abs(wAtk2 - baseWAtk) < 0.01, `武器属性回到基线 ${wAtk2}`, String(wAtk2));
    ok(mods2 === 0, `局内升级的 mod 一条不剩（${mods2} 条）`, String(mods2));

    const swords2 = await ev('__game.swordKinds');
    const wOwned = await ev('__game.weapon.owned');
    ok(!swords2.some((k) => k.kind === 'frost'), '上一局买的冰剑没跟过来', JSON.stringify(swords2));
    ok(wOwned.length === 0 || wOwned.every((k) => k === 'iron'),
      `环剑只剩铁剑或空着（${JSON.stringify(wOwned)}）`);

    ok(await ev('__game.coins') === 0, '金币从 0 起', String(await ev('__game.coins')));
    ok(await ev('__game.bag.total') === 0, '背包从 0 起', String(await ev('__game.bag.total')));
    ok(await ev('__game.getKills()') === 0, '击杀数从 0 起', String(await ev('__game.getKills()')));

    // 上一局那 3 只 warrior：新局开局不刷怪的情况下，场上必须是空的
    await ev('__game.setWaves(true)');
    await sleep(600);
    const leftovers = await ev('__game.enemies.list.filter((e) => e.state !== "dead").length');
    ok(leftovers === 0, `上一局的怪没有留在场上（${leftovers} 只）`, String(leftovers));
    await ev('__game.setWaves(false)');

    // 技能栏也跟着回零：新 profile 没拿过环剑，第 1 格不该亮
    const ringGranted = await ev('__game.weapon.granted');
    ok(ringGranted === false || (await ev('__game.ringObtained()')) === true,
      `环剑状态与档案一致（granted=${ringGranted}）`);

    // ---------- 4. 读档那条路不能被改坏：存档里的东西必须照旧恢复 ----------
    console.log('\n[4] 读回第一局那份档 —— 该恢复的还得恢复');
    // 第二局开局自己也会落一份档（回合 1），先清掉它，剩下的最近一份才是第一局的
    await ev('__game.run.clear()');
    ok(await ev('__game.run.load().length') === 1, '只剩第一局那份档', String(await ev('__game.run.load().length')));
    await ev('(async () => { await __game.run.resume(); return 1; })()');
    ok(await settle(), '读档后进入 playing');
    const atk3 = await ev('__game.stats.get("attack")');
    const swords3 = await ev('__game.swordKinds');
    const coins3 = await ev('__game.coins');
    ok(Math.abs(atk3 - atkNow) < 0.01, `读档把攻击力还原到存档值 ${atk3}（存档时 ${atkNow}）`, String(atk3));
    ok(swords3.some((k) => k.kind === 'frost'), '读档把冰剑还原了', JSON.stringify(swords3));
    ok(coins3 === 250, `读档把金币还原成 ${coins3}`, String(coins3));

    // ---------- 5. 没有 JS 报错 ----------
    console.log('\n[5] 运行时错误');
    const noisy = jsErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
    ok(noisy.length === 0, `没有 JS 异常（${noisy.length} 条）`, noisy.slice(0, 3).join(' | '));

    console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
    if (fail) console.log('失败项：\n- ' + fails.join('\n- '));
  } catch (e) {
    console.log('\n[脚本异常] ' + (e && e.message ? e.message : e));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* 忽略 */ }
    chrome.kill();
    await sleep(300);
    process.exit(fail ? 1 : 0);
  }
})();
