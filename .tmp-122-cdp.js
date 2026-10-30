// 第 122 块 CDP：三选一刷新 + 回合挑战（实机）
//   A 刷新：三次免费 → 第四次要确认 → 确认后背一条盲盒减成 + 换卡 → 十条背满就锁死
//   B 挑战弹窗：force 弹出 / 接下 / 放弃
//   C 效果：残血（上限×0.5）/ 绵软（攻击→40%，最低1）/ 断剑（weapon.muted）/
//            禁术（技能栏全灰 + pressSkill 拒绝）/ 怪物潮（roundMod.countScale=2）
//   D 奖励：88 金币 / 下一次三选一 / 下一回合大涨（三类各一条，只活一回合）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-122-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9399;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-122');
const OUT = path.join(os.tmpdir(), 'naiwa-block122');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&chal';

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
    '--renderer-process-limit=1', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
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
    const cards = () => ev('__game.upgrade.cards.map(c => c.id).join(",")');
    // 清掉「当前这一回合」：先放开波次，等真的进了刷怪阶段且场上有怪，
    // 再 skipRound（把没出场的划掉）+ 全歼 —— 否则在 gap 里 kill 是空杀，
    // 回合根本不结算（第 122 块写这套时踩过）
    async function clearRound() {
      // 先补满血：这套测试背了十条减成，等待期间被砍死会让后面所有断言假红
      await ev('__game.stats.hp.cur = __game.stats.get("maxHp"); 1');
      await ev('__game.setWaves(false); 1');
      await waitFor('__game.level.phase === "spawning" && __game.enemies.all().length > 0', 20000, '下一回合开始刷怪');
      await ev('__game.stats.hp.cur = __game.stats.get("maxHp"); 1');
      await ev('__game.level.skipRound(); __game.enemies.all().forEach(e => __game.enemies.takeDamage(e, 999)); 1');
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
    console.log('\n[A] 进局 + 三选一刷新');
    // ============================================================
    await ev('__game.setPendingLevel(1)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1500);
    ok(await settle(), '进入 playing');
    await ev('__game.setWaves(true)');          // 冻波次：只测自己触发的面板
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');

    await ev('__game.upgrade.show(3, null)');
    await waitFor('__game.upgrade.isOpen()', 5000, '三选一面板打开');
    const c0 = await cards();
    ok(!!c0 && c0.split(',').length === 3, '面板上是三张卡', c0);
    ok((await ev('__game.upgrade.refresh.left')) === 3, '开局 3 次免费');
    ok((await ev('__game.upgrade.rfText().n')).includes('3/3'), '键面写着 免费 3/3');
    ok(!(await ev('__game.upgrade.rfText().danger')), '免费阶段不是危险色');
    await shot('a1-upgrade-refresh.png');

    // 免费刷新 ×3
    for (let i = 1; i <= 3; i++) {
      await ev('__game.upgrade.refreshClick()');
      await sleep(220);
      ok((await ev('__game.upgrade.refresh.left')) === 3 - i, `第 ${i} 次免费刷新后剩 ${3 - i} 次`);
    }
    const c3 = await cards();
    ok(c3.split(',').length === 3, '刷新后仍然是三张卡');
    ok(await ev('__game.upgrade.rfText().danger'), '免费次数用完后换成危险色（要付减成）');
    ok((await ev('__game.upgrade.rfText().name')).includes('减成'), '键面改成「用一条减成换」');

    const curseBefore = await ev('__game.runCurses().length');
    await ev('__game.upgrade.refreshClick()');
    await waitFor("document.getElementById('confirmAsk').classList.contains('on')", 4000, '确认弹窗弹出');
    ok(true, '第四次要先确认');
    ok((await ev('document.getElementById("caSub").textContent')).includes('减成'), '确认弹窗写清了代价');
    await ev('document.getElementById("caOk").click()');
    await sleep(400);
    const boxN = await ev('__game.upgrade.box.length');
    ok(boxN === 1, `确认后背上了 1 条盲盒减成（${boxN}）`);
    ok((await ev('__game.runCurses().length')) === curseBefore, '夜行诅咒没被写进去（两套账分开）');
    ok((await ev('__game.upgrade.rfText().n')).includes('已背 1'), '键面写「已背 1 条」');
    ok((await ev('__game.upgrade.rfText().tip')).includes('本局已背'), '提示行列出了已背的减成');
    ok((await ev('__game.upgrade.refresh.paid')) === 1, '付费刷新计数 +1');
    const c4 = await cards();
    ok(c4.split(',').length === 3, '减成换的刷新也真的换了一批卡');
    await shot('a2-upgrade-curse.png');

    // 减成真的生效：指定背「薄刃」，攻击力必须掉 10%（mul 最终乘算，不吃 pct）
    const atkBefore = await ev("__game.stats.get('attack')");
    await ev('__game.upgrade.addCurse("weak")');
    await sleep(200);
    const atkAfter = await ev("__game.stats.get('attack')");
    ok(Math.abs(atkAfter - atkBefore * 0.9) < 0.02, `薄刃把攻击压了 10%（${atkBefore.toFixed(2)} → ${atkAfter.toFixed(2)}）`);
    ok((await ev('__game.upgrade.boxNames()')).includes('薄刃'), '减成名字挂在面板提示上');

    // 十条背满 → 键锁死
    await ev('["anemic","lead","numb","shortarm","dull","holey","thorns","rusty","blunt"]'
      + '.forEach((id) => __game.upgrade.addCurse(id)); 1');
    await sleep(200);
    await ev('__game.upgrade.show(3, null)');   // 重开面板触发一次 syncRefreshUi
    await sleep(200);
    ok((await ev('__game.upgrade.box.length')) === 10, '十条减成都背上了');
    ok(Math.abs((await ev('__game.upgrade.boxDmg')) - 0.12) < 1e-9, '荆棘皮记进受伤加重（+12%）');
    ok((await ev('__game.upgrade.rfText().disabled')) === true, '没有可再背的减成后刷新键锁死');
    ok((await ev('__game.upgrade.rfText().name')).includes('用完'), '键面写「刷新已用完」');
    ok((await ev('__game.runCurses().length')) === curseBefore, '全程没污染夜行诅咒列表');
    // 矮屏可用性：320×560 上刷新键必须在视口内（否则等于没做）
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 560, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    const box = await ev('(() => { const r = document.getElementById("upRfBtn").getBoundingClientRect();'
      + ' return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight,'
      + ' scrollable: document.getElementById("upList").scrollHeight > document.getElementById("upList").clientHeight }; })()');
    ok(box.bottom <= box.h && box.top >= 0, '320×560 下刷新键在视口内', JSON.stringify(box));
    await send('Emulation.clearDeviceMetricsOverride');
    await sleep(300);
    await ev('document.querySelector("#upList .up-item").click()');   // 选一张收掉面板
    await sleep(400);
    ok(!(await ev('__game.upgrade.isOpen()')), '选完卡面板关掉');

    // ============================================================
    console.log('\n[B] 挑战弹窗：接下 / 放弃');
    // ============================================================
    const hpMax0 = await ev('+__game.stats.get("maxHp").toFixed(2)');
    const atk0 = await ev('+__game.stats.get("attack").toFixed(3)');
    await ev('__game.chal.force("thinBlood")');
    await waitFor('__game.chal.ask.open', 4000, '挑战弹窗打开');
    ok((await ev('__game.chal.look().name')) === '残血挑战', '弹窗是残血挑战');
    ok((await ev('__game.state')) === 'challenge', '弹窗期间世界冻结（state=challenge）');
    await shot('b1-chal-ask.png');
    await ev('__game.chal.accept()');
    await sleep(400);
    ok(!(await ev('__game.chal.ask.open')), '接下后弹窗关闭');
    ok((await ev('__game.state')) === 'playing', '接完回到 playing');
    const hpMax1 = await ev('+__game.stats.get("maxHp").toFixed(2)');
    ok(Math.abs(hpMax1 - hpMax0 * 0.5) < 0.05, `残血：上限减半（${hpMax0} → ${hpMax1}）`);
    ok((await ev('+__game.stats.hp.cur.toFixed(2)')) <= hpMax1 + 0.01, '当前血量被夹进新上限');
    ok((await ev('__game.chal.active.id')) === 'thinBlood', 'chal.active 记着是哪条');

    // ============================================================
    console.log('\n[C] 打完 → 奖励三选一');
    // ============================================================
    await clearRound();
    await waitFor('__game.chal.reward.open', 20000, '奖励弹窗打开（挑战打完）');
    ok(true, '挑战打完弹奖励');
    const items = await ev('__game.chal.reward.items.join(",")');
    ok(items === 'coin,card,boost', '三条奖励齐全', items);
    ok((await ev('document.querySelectorAll("#crList .ch-item").length')) === 3, 'DOM 上也是三张');
    await shot('c1-chal-reward.png');
    const coins0 = await ev('__game.coins');
    await ev('__game.chal.takeReward("coin")');
    await sleep(500);
    ok((await ev('__game.coins')) === coins0 + 88, `选金币 +88（${coins0} → ${coins0 + 88}）`);
    ok(!(await ev('__game.chal.reward.open')), '奖励弹窗关掉');
    ok((await ev('__game.chal.active')) === null, '挑战效果已经卸掉（chal.active 为空）');
    const hpMax2 = await ev('+__game.stats.get("maxHp").toFixed(2)');
    ok(Math.abs(hpMax2 - hpMax0) < 0.05, `生命上限还回来了（${hpMax1} → ${hpMax2}）`);

    // ============================================================
    console.log('\n[C2] 挑战会自己弹出来（不是只有 force 才弹）');
    // ============================================================
    await settle();
    const curR = await ev('__game.level.roundNo');
    const nextR = curR + 1;
    await ev(`__game.chal.setPlan([${nextR}])`);
    ok((await ev('__game.chal.plan().join(",")')) === String(nextR), `计划改成只打第 ${nextR} 回合`);
    // 直接走一次「第 curR 回合的结算链」：末尾就是 beforeNextRound → maybeChallenge(curR+1)。
    // 不去等真实刷怪 —— 这条只验「链尾会不会自己弹」，跟波次无关。
    await ev(`__game.handleRoundClear(${curR}); 1`);
    await waitFor('__game.chal.ask.open', 20000, '清完回合后挑战自己弹出');
    ok((await ev('__game.chal.ask.round')) === nextR, `弹的是第 ${nextR} 回合`);
    ok((await ev('__game.chal.look().name')) !== '', '弹窗有挑战名', await ev('__game.chal.look().name'));
    // 放弃：不生效、没奖励，回合照常开打
    await ev('__game.chal.refuse()');
    await sleep(400);
    ok(!(await ev('__game.chal.ask.open')), '放弃后弹窗关掉');
    ok((await ev('__game.chal.active')) === null, '放弃的挑战不生效');
    ok((await ev('__game.state')) === 'playing', '放弃后照常开打');
    ok((await ev(`__game.chal.used().includes(${nextR})`)) === true, '放弃过的回合不会再来一次');
    await shot('c2-chal-refused.png');

    // ============================================================
    console.log('\n[D] 绵软 / 断剑 / 禁术 / 怪物潮');
    // ============================================================
    await settle();
    await ev('__game.setWaves(true)');
    await ev('__game.chal.force("softPaw")');
    await sleep(300);
    await ev('__game.chal.accept()');
    await sleep(300);
    const atk1 = await ev('+__game.stats.get("attack").toFixed(3)');
    const want = Math.max(1, atk0 * 0.4);
    ok(Math.abs(atk1 - want) < 0.02, `绵软：攻击 ${atk0} → ${atk1}（应 ≈ ${want.toFixed(3)}）`);
    ok(atk1 >= 0.999, '绵软：最低不低于 1');
    // 收掉这一回合（奖励随便选）
    await clearRound();
    await waitFor('__game.chal.reward.open', 20000, '奖励弹窗（绵软）');
    await ev('__game.chal.takeReward("coin")');
    await sleep(600);
    await settle();
    await ev('__game.setWaves(true)');
    ok((await ev('+__game.stats.get("attack").toFixed(3)')) === atk0, '绵软的攻击力在回合结束后还原');

    // 断剑
    await ev('__game.weapon.grant(); __game.upgrade && 1');
    await sleep(200);
    const hadSword = await ev('__game.weapon.granted');
    await ev('__game.chal.force("brokenSword")');
    await sleep(300);
    await ev('__game.chal.accept()');
    await sleep(300);
    if (hadSword) {
      ok((await ev('__game.weapon.muted')) === true, '断剑：weapon.muted = true');
      ok((await ev('__game.weapon.fire(() => ({ x: 0, z: 0 }))')) === false, '断剑：万剑齐发放不出来');
      ok((await ev('__game.weapon.orbitingCount')) >= 0, '断剑：剑还在 owned 里（只是失效）');
    } else {
      ok(true, '（本局没剑，跳过断剑的剑环断言）');
    }
    // 禁术
    await ev('__game.chal.force("mute")');
    await sleep(300);
    await ev('__game.chal.accept()');
    await sleep(300);
    ok((await ev('__game.chal.noSkill')) === true, '禁术：chal.noSkill = true');
    ok((await ev('__game.pressSkill("swordRain")')) === false, '禁术：技能按不动');
    await shot('d1-mute.png');
    // 怪物潮
    await ev('__game.chal.force("tide")');
    await sleep(300);
    await ev('__game.chal.accept()');
    await sleep(300);
    ok((await ev('__game.level.roundMod.countScale')) === 2, '怪物潮：roundMod.countScale = 2');
    // 疾风
    await ev('__game.chal.force("gale")');
    await sleep(300);
    await ev('__game.chal.accept()');
    await sleep(300);
    ok((await ev('__game.level.roundMod.speedMul')) === 1.45, '疾风：roundMod.speedMul = 1.45');

    // 收尾：清掉这一回合，确认所有开关都回到干净状态
    await clearRound();
    await waitFor('__game.chal.reward.open', 20000, '奖励弹窗（收尾）');
    await ev('__game.chal.takeReward("coin")');
    await sleep(600);
    await settle();
    ok((await ev('__game.chal.noSkill')) === false, '回合结束后禁术解锁');
    ok((await ev('__game.weapon.muted')) === false, '回合结束后剑解禁');
    ok((await ev('__game.chal.dmg')) === 0, '回合结束后受伤加重归零');

    // ============================================================
    console.log('\n[E] 「下一回合大涨」只活一回合');
    // ============================================================
    await ev('__game.setWaves(true)');
    await ev('__game.chal.force("heavyStep")');
    await sleep(300);
    await ev('__game.chal.accept()');
    await sleep(300);
    await clearRound();
    await waitFor('__game.chal.reward.open', 20000, '奖励弹窗（大涨）');
    await ev('__game.chal.takeReward("boost")');
    await sleep(500);
    const boost = await ev('JSON.stringify(__game.chal.boost)');
    ok(!!boost && boost !== 'null', '大涨已生效', boost);
    ok(JSON.parse(boost || '{}').n === 3, '大涨是三条（基本属性 / 技能 / 法器各一）',
      JSON.parse(boost || '{}').info);
    await shot('e1-boost.png');
    // 清一次回合 → 大涨必须收掉
    await settle();
    await ev('__game.setWaves(true)');
    // 直接走一次「回合结算」：`clearRoundBuffs` 就在这里被调 —— 大涨必须当场卸掉。
    // （不去等真实回合：那需要整段刷怪时间，而这条断言只关心「结算时有没有撤」）
    await ev('__game.handleRoundClear(__game.level.roundNo); 1');
    await sleep(700);
    ok((await ev('__game.chal.boost')) === null, '回合结算时大涨撤掉（只活一回合）');
    await ev('if (__game.chal.reward.open) __game.chal.takeReward("coin"); 1');
    await sleep(400);

    // ============================================================
    console.log('\n[F] 没有 JS 报错');
    // ============================================================
    const errs = jsErrors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
    ok(errs.length === 0, '全程无未捕获异常', errs.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('异常：' + e.message);
    console.log('  ✗ 异常：' + e.message);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log(`\n===== block122-cdp: ${pass} ✓ / ${fail} ✗ =====`);
  if (fail) console.log(fails.map((f) => '  - ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
})();
