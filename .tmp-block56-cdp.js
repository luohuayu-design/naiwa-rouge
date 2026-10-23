// 第 56 块 CDP：用户五条的真浏览器验证
//   A 生命条统一大小（小兵 / 0.7 倍战士 / 3.24 倍菌王，血条全一样宽）
//   B 万剑齐发：CD + 辐射 n=拥有数 + 不动环绕 + 冷却中按不动
//   C 冰剑冻结：命中冻住 → 不动不打动画停 → 解冻恢复
//   D 雷剑全场连锁：5 只散开（含 4.5 格外）全部吃到闪电
//   E 技能栏让开教程卡（弹卡时整栏上移、收卡落回右下角）
//   F 后续关卡开局自带环剑（level 2 直接 3 把铁剑 + 箭雨；没拿到过的档不送）
// 跑法：先 `python -m http.server 8124 --bind 127.0.0.1`（cwd=naiwa-rouge），再 `node .tmp-block56-cdp.js`
// 说明：进关后先 setWaves(true) 冻结波次机器（debugNoWaves，只停刷怪不停世界）
//       + enemies.reset()，A~E 全靠自己摆怪，不受回合刷怪/三选一面板干扰
//       （F 会重载页面，波次恢复正常）。
// 注意钩子语义：setWaves(p) { debugNoWaves = !!p } —— setWaves(true) 才是暂停，
//       setWaves(false) 是「开着波次」（第 56 块踩过：写 false 等于没关）。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9363;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-56');
const OUT = path.join(os.tmpdir(), 'naiwa-block56');
// ⚠️ 必须带 &title：debug 模式下没有它会在加载完直接开局（AUTO_START）
// 不带 &meet：新怪信息卡会冻结世界，本套件要满场跑怪
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

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
    // 开局进某一关（老流程，和第 55 块一致）
    async function enterLevel(n) {
      await ev(`document.getElementById('btnStart').click(), 1`);
      await sleep(400);
      await ev(`document.querySelector('.lv-item[data-level="${n}"]').click(), 1`);
      await sleep(400);
      await ev(`document.getElementById('diffNext')?.click(), 1`);
      await sleep(400);
      await ev(`document.getElementById('curseStart')?.click(), 1`);
    }
    // 摆一圈高血量小兵（专供元素剑测试：不会轻易被打死）
    async function spawnMinions(spots) {
      await ev(`(() => {
        const S = {};
        for (const [x, z] of ${JSON.stringify(spots)}) {
          const e = __game.enemies.spawn('minion', { x, z }, S);
          if (e) { e.hp = 99999; e.maxHp = 99999; if (e.state === 'spawn') e.state = 'chase'; }
        }
        return 1;
      })()`);
      await waitFor(`__game.enemies.all().length >= ${spots.length}`, 20000, '小兵上场');
    }
    await send('Runtime.enable');
    await send('Page.enable');

    await goto(URL);
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(700);
    try { await waitFor(`__game.notice.open()`, 6000, '公告弹出'); } catch (_) {}
    await ev(`__game.notice.hide(), 1`);
    await sleep(250);
    if (await ev(`__game.notice.open()`)) { await ev(`__game.notice.hide(), 1`); await sleep(250); }

    await enterLevel(1);
    await waitFor(`window.__game.levelId === 1`, 40000, '第一关开始');
    await sleep(500);
    if (await ev(`document.getElementById('tutAsk')?.classList.contains('on')`)) {
      await ev(`document.getElementById('tutNo').click(), 1`);
      await sleep(300);
    }
    ok(await ev(`__game.getState() === 'playing'`), '已经进入战斗状态');
    // A~E 全靠自己摆怪：冻结波次机器（只停刷怪，世界照常运转）+ 清场
    await ev(`__game.setWaves(true), __game.enemies.reset(), 1`);
    await sleep(300);
    ok(await ev(`__game.getState() === 'playing'`), '冻结波次后世界照常运转（state=playing，没被三选一面板顶掉）');

    // ============================================================
    // A. 生命条统一大小
    // ============================================================
    console.log('\n[A] 生命条统一大小');
    // 一只普通小兵、一只 0.7 倍的战士（菌王卫队的缩放）、一只 3.24 倍高的骸骷公
    await ev(`(() => {
      const S = {};
      __game.enemies.spawn('minion',  { x:  4, z:  0 }, S);
      __game.enemies.spawn('warrior', { x: -4, z:  0 }, { ...S, scale: 0.7 });
      __game.enemies.spawn('hierarch', { x: 0, z:  4 }, S);
      return 1;
    })()`);
    await waitFor(`__game.enemies.all().length >= 3`, 20000, '三只怪都上场');
    await sleep(400);
    const bars = await ev(`(() => __game.enemies.all().map((e) => ({
      type: e.type,
      barW: +e.bar.spr.scale.x.toFixed(3), barH: +e.bar.spr.scale.y.toFixed(3),
      barY: +e.bar.spr.position.y.toFixed(3),
    })))()`);
    const wSet = [...new Set(bars.map((b) => b.barW))];
    ok(bars.length === 3, `场上正好三只怪（${bars.length}）`);
    ok(wSet.length === 1 && Math.abs(wSet[0] - 1.5) < 0.001, `血条宽度全统一 = ${wSet.join('/')}（BAR_W 1.5）`);
    ok(bars.every((b) => Math.abs(b.barH - 1.5 * (42 / 168)) < 0.01), '高度按画布比例折算，三家一致');
    // 挂高仍按各自的实际头顶：小兵 1.14+0.95；0.7 倍战士 1.38*0.7+0.95；菌王 3.24+0.95
    const expY = { minion: 1.14 + 0.95, warrior: 1.38 * 0.7 + 0.95, hierarch: 3.24 + 0.95 };
    ok(bars.every((b) => Math.abs(b.barY - expY[b.type]) < 0.02),
      `挂高按实际头顶算（${bars.map((b) => b.type + ':' + b.barY).join(' ')}）`);
    await shot('a-bars-unified');

    // ============================================================
    // B. 万剑齐发：CD + n 把 + 不动环绕
    // ============================================================
    console.log('\n[B] 万剑齐发（CD + 辐射 n 把）');
    await ev(`__game.enemies.reset(), 1`);
    await sleep(200);
    await ev(`__game.weapon.grant(), 1`);
    await sleep(200);
    await ev(`__game.addSword('iron'), 1`);
    await sleep(300);
    const st0 = await ev(`({ owned: __game.weapon.owned.length, orbiting: __game.weapon.orbitingCount, ready: __game.fireReady() })`);
    ok(st0.owned === 4 && st0.orbiting === 4, `开局 3 把 + 商店 1 把 = 拥有 4 把、环上 4 把（${st0.owned}/${st0.orbiting}）`);
    ok(st0.ready === true, '刚拿到技能是就绪的');

    const fired = await ev(`(() => {
      const okPressed = __game.fireSwords();
      const flying1 = __game.weapon.flyingCount;
      const orbiting1 = __game.weapon.orbitingCount;
      const ready1 = __game.fireReady();
      const cd1 = __game.fireCdLeft();
      // 同一 evaluate 里立刻再按一次：冷却中必须被拦下，飞剑数不许叠加
      // （不能等 1.2 秒再按 —— 飞剑飞出 17.5 格约 1.2 秒就自然消散，等等再按看到的是 0 不是 4）
      const okPressed2 = __game.fireSwords();
      return { okPressed, flying1, orbiting1, ready1, cd1, okPressed2,
               flying2: __game.weapon.flyingCount, cdTotal: __game.fireCdTotal() };
    })()`);
    ok(fired.okPressed === true, '按下技能真的放了');
    ok(fired.flying1 === 4, `辐射出 n = 拥有数 4 把（实际 ${fired.flying1}；不是 2n=8，也不是环上数）`);
    ok(fired.orbiting1 === 4, `环绕数量一点没变（${fired.orbiting1}）—— 释放技能不动环上的剑`);
    ok(fired.ready1 === false, '放完进入冷却（不再就绪）');
    ok(fired.cd1 > 5.5 && fired.cd1 <= 6, `冷却从 6 秒起走（剩余 ${fired.cd1}）`);
    ok(fired.cdTotal === 6, '冷却总长 6 秒');
    ok(fired.okPressed2 === false, '冷却中立刻再按 → 什么也没发生（CD 拦停）');
    ok(fired.flying2 === fired.flying1, `飞剑数没被二次释放叠加（${fired.flying1} → ${fired.flying2}）`);

    // 冷却真的在走表（等 1.2 秒，剩余应掉到 4.8 上下）
    await sleep(1200);
    const again = await ev(`({ cd: __game.fireCdLeft() })`);
    ok(again.cd < fired.cd1 - 1, `冷却在走表（${fired.cd1} → ${again.cd}）`);

    // 按钮态：冷却中 = spent + 秒数数字
    const btn = await ev(`(() => {
      const b = document.querySelector('#skillBar [data-skill="swordRain"]');
      return { spent: b.classList.contains('spent'), ready: b.classList.contains('ready'),
               num: (b.querySelector('.sk-num').textContent || '').trim(),
               cdH: b.querySelector('.sk-cd').style.height };
    })()`);
    ok(btn.spent && !btn.ready, '冷却中按钮是灰的（spent）');
    ok(/^[0-6]$/.test(btn.num), `按钮上有剩余秒数（${btn.num}）`);
    ok(parseFloat(btn.cdH) < 100, `底部进度条按冷却填充（${btn.cdH}）`);

    // 等冷却走完 → 又能放
    await waitFor(`__game.fireReady() === true`, 9000, '冷却走完');
    const ready2 = await ev(`({ ready: __game.fireReady(), orbiting: __game.weapon.orbitingCount })`);
    ok(ready2.ready === true, '6 秒后恢复就绪');
    ok(ready2.orbiting === 4, '等冷却的这会儿环上还是 4 把（辐射没动过它）');
    await shot('b-skill-cd');

    // ============================================================
    // C. 冰剑冻结
    // ============================================================
    console.log('\n[C] 冰剑冻结');
    await ev(`__game.enemies.reset(), 1`);
    await sleep(200);
    await spawnMinions([[3, 0], [-3, 0], [0, 3]]);
    // 直接调 applyFreeze：冻住 → 位置不动、动画停、状态还在
    const fz = await ev(`(() => {
      const e = __game.enemies.all()[0];
      __game.enemies.applyFreeze(e, { time: 1.2 });
      return { n: __game.enemies.frozenCount(), t: +e.freezeT.toFixed(2), state: e.state };
    })()`);
    ok(fz.n === 1, `frozenCount = 1（${fz.n}）`);
    ok(fz.t > 1.1 && fz.t <= 1.2, `冻 1.2 秒（${fz.t}）`);
    ok(fz.state !== 'dead', '状态还是活的（不是打死，是定住）');
    await sleep(200);   // 等一帧，让 updateOne 里的冰冻分支跑起来
    const ts0 = await ev(`__game.enemies.all()[0].mixer.timeScale`);
    ok(ts0 === 0, `冻住时动画混合器 timeScale = 0（冰封连动作都停，实际 ${ts0}）`);
    const p0 = await ev(`__game.enemies.all()[0].pos.x.toFixed(3) + ',' + __game.enemies.all()[0].pos.z.toFixed(3)`);
    await sleep(700);
    const p1 = await ev(`__game.enemies.all()[0].pos.x.toFixed(3) + ',' + __game.enemies.all()[0].pos.z.toFixed(3)`);
    ok(p0 === p1, `冻住期间一步没挪（${p0}）`);
    // 解冻：倒计时归零 + 动画恢复 + 重新开始追人
    let unfroze = false, lastInfo = '';
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      lastInfo = await ev(`(() => { const e = __game.enemies.all()[0]; return e ? (e.freezeT.toFixed(2) + '/' + e.mixer.timeScale + '/' + e.state) : 'gone'; })()`);
      if (lastInfo.startsWith('0.00/1/')) { unfroze = true; break; }
    }
    ok(unfroze, `解冻后倒计时归零、动画恢复（${lastInfo}）`);
    ok(await ev(`__game.enemies.frozenCount() === 0`), 'frozenCount 归零');
    // 解冻后重新开始追人：位置动了算；走到贴身距离改成原地攻击也算（AI 恢复了）
    // —— 不能只采样一次位置：小兵 ~0.5s 就能从 2.7 格贴到玩家，600ms 后可能已在攻击位站着打
    await sleep(250);
    const p2a = await ev(`__game.enemies.all()[0].pos.x.toFixed(3) + ',' + __game.enemies.all()[0].pos.z.toFixed(3)`);
    await sleep(350);
    const p2 = await ev(`(() => { const e = __game.enemies.all()[0]; return e.pos.x.toFixed(3) + ',' + e.pos.z.toFixed(3) + '/' + e.state; })()`);
    const [p2pos, p2state] = p2.split('/');
    ok(p1 !== p2a || p2pos !== p2a || p2state === 'attack',
      `解冻后重新开始行动（${p1} → ${p2a} → ${p2pos}，状态 ${p2state}）`);

    // 端到端：买一把冰剑，环绕命中 → 怪被冻住
    await ev(`__game.enemies.reset(), 1`);
    await sleep(200);
    await spawnMinions([[2.2, 0], [-2.2, 0], [0, 2.2]]);
    await ev(`__game.addSword('frost'), 1`);
    ok(await waitFor(`__game.enemies.frozenCount() > 0`, 25000, '冰剑绕到怪身上'), '冰剑命中 → 怪被冻住（端到端）');
    const fz2 = await ev(`(() => { const e = __game.enemies.all().find((x) => x.freezeT > 0); return e ? +e.freezeT.toFixed(2) : -1; })()`);
    ok(fz2 > 0, `被冻的怪身上有冰冻倒计时（${fz2}）`);
    await shot('c-frost-freeze');

    // ============================================================
    // D. 雷剑全场连锁
    // ============================================================
    console.log('\n[D] 雷剑全场连锁');
    await ev(`__game.enemies.reset(), 1`);
    await sleep(200);
    // 5 只撒开：有近的也有 4.5 格以外的（旧版连锁距离上限 4.5，够不着远的）
    await spawnMinions([[2, 0], [-2, 0], [0, 6], [7, 0], [-7, 0]]);
    // 直接对第一只调 applyKind('thunder', ...)：一道闪电打全场
    const chain = await ev(`(() => {
      const list = __game.enemies.all();
      const before = list.map((e) => e.hp);
      __game.weapon.applyKind('thunder', list[0], 10);
      const after = list.map((e) => e.hp);
      return { before, after, hurt: after.map((h, i) => +(before[i] - h).toFixed(2)) };
    })()`);
    ok(chain.hurt[0] === 0, '第一只是直接命中的那只，不吃自己的连锁（0）');
    ok(chain.hurt.slice(1).every((h) => h > 3 && h < 4.2), `其余 4 只全部吃到连锁闪电（伤害 ${chain.hurt.slice(1).join('/')} ≈ 10×0.35）`);
    ok(chain.hurt.slice(1).every((h) => Math.abs(h - 3.5) < 0.3), `每道闪电约 35% 伤害（${chain.hurt.slice(1).join('/')}）`);
    await shot('d-thunder-chain');

    // ============================================================
    // E. 技能栏让开教程卡
    // ============================================================
    console.log('\n[E] 技能按钮让开技能介绍');
    await ev(`__game.enemies.reset(), 1`);
    await ev(`__game.arrowRain.unlock(), 1`);
    await sleep(300);
    const nBtn = await ev(`[...document.querySelectorAll('#skillBar .sk')].filter((b) => b.style.display !== 'none').length`);
    ok(nBtn === 2, `技能栏有 2 格（万剑齐发 + 箭雨，实际 ${nBtn}）`);
    const restPos = await ev(`(() => {
      const b = document.getElementById('skillBar').getBoundingClientRect();
      return { bottom: Math.round(innerHeight - b.bottom), lift: document.getElementById('skillBar').style.getPropertyValue('--sk-lift') };
    })()`);
    ok(restPos.bottom <= 20 && (!restPos.lift || restPos.lift === '0px' || restPos.lift === ''),
      `平时贴在右下角（距底 ${restPos.bottom}px，lift=${restPos.lift || '0'}）`);

    // 弹武器教程（技能介绍）→ 整栏上移，且不再被卡片盖住
    await ev(`__game.wtut.show('arrowrain'), 1`);
    await waitFor(`document.getElementById('weaponTut').classList.contains('on')`, 8000, '教程卡弹出');
    await sleep(500);   // 等 .22s 淡入/滑入走完再量（transform 会影响 rect）
    const lifted = await ev(`(() => {
      const bar = document.getElementById('skillBar');
      const card = document.getElementById('weaponTut');
      const br = bar.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const btns = [...bar.querySelectorAll('.sk')].filter((b) => b.style.display !== 'none')
        .map((b) => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; });
      // 逐个按钮判定有没有被卡片盖住（水平有交集且垂直有交集）
      let covered = 0;
      for (const b of btns) {
        const ox = Math.min(cr.right, b.right) - Math.max(cr.left, b.left);
        const oy = Math.min(cr.bottom, b.bottom) - Math.max(cr.top, b.top);
        if (ox > 0 && oy > 0) covered++;
      }
      return {
        lift: bar.style.getPropertyValue('--sk-lift'),
        barBottomFromBottom: Math.round(innerHeight - br.bottom),
        cardTopFromBottom: Math.round(innerHeight - cr.top),
        gap: Math.round((innerHeight - cr.top) - (innerHeight - br.bottom)),
        btns, covered,
      };
    })()`);
    ok(parseFloat(lifted.lift) > 100, `弹卡时整栏上移（--sk-lift = ${lifted.lift}）`);
    ok(lifted.gap <= -10, `技能栏底边在卡片上方 ${-lifted.gap}px（不再被盖）`);
    ok(lifted.covered === 0, `两个按钮都没被卡片盖住（盖住 ${lifted.covered} 个）`);
    await shot('e-skill-lifted');

    // 收卡 → 落回右下角
    await ev(`__game.wtut.close(), 1`);
    await waitFor(`!document.getElementById('weaponTut').classList.contains('on')`, 8000, '教程卡收起');
    await sleep(400);
    const back = await ev(`(() => {
      const bar = document.getElementById('skillBar');
      const b = bar.getBoundingClientRect();
      return { bottom: Math.round(innerHeight - b.bottom), lift: bar.style.getPropertyValue('--sk-lift') || '0px' };
    })()`);
    ok(back.bottom <= 20, `收卡后落回右下角（距底 ${back.bottom}px）`);
    ok(back.lift === '0px', `--sk-lift 归零（${back.lift}）`);

    // ============================================================
    // F. 后续关卡开局自带环剑
    // ============================================================
    console.log('\n[F] 第二关开局自带环剑');
    // 伪造一个「第一关通关过 + 拿到过环剑 + 教程全看过」的老玩家档案
    await ev(`(() => {
      try {
        const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
        p.ringGot = true;
        localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
        localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify({ 1: { wins: 1, bestTime: 300, bestKills: 50, bestRound: 20 } }));
        localStorage.setItem('naiwa_rouge_wtut_v1', JSON.stringify(['ring', 'arrowrain']));
      } catch (e) { return '' + e; }
      return 'ok';
    })()`);
    await goto(URL);
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(700);
    try { await waitFor(`__game.notice.open()`, 6000, '公告弹出'); } catch (_) {}
    await ev(`__game.notice.hide(), 1`);
    await sleep(250);
    await enterLevel(2);
    await waitFor(`window.__game.levelId === 2`, 40000, '第二关开始');
    await sleep(800);
    const pre = await ev(`({
      granted: __game.weapon.granted, owned: __game.weapon.owned.length,
      orbiting: __game.weapon.orbitingCount, rain: __game.arrowRain.state().unlocked,
      state: __game.getState(),
      btns: [...document.querySelectorAll('#skillBar .sk')].filter((b) => b.style.display !== 'none').length,
    })`);
    ok(pre.granted === true, '进第二关时环剑已经在手（不用等第 5 回合）');
    ok(pre.owned === 3 && pre.orbiting === 3, `开局就送 3 把铁剑（拥有 ${pre.owned} / 环上 ${pre.orbiting}）`);
    ok(pre.rain === true, '箭雨也一并解锁（第二关起的武器）');
    ok(pre.state === 'playing', `直接进战斗（state ${pre.state}）—— 老玩家不重看教程`);
    ok(pre.btns === 2, `技能栏 2 格齐了（${pre.btns}）`);
    await shot('f-level2-prefill');

    // F2：反过来 —— 没拿到过环剑的档，第二关仍走老路（不预送）
    await ev(`(() => {
      try {
        const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
        delete p.ringGot;
        localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
      } catch (e) {}
      return 1;
    })()`);
    await goto(URL);
    await waitFor('!!window.__game', 90000, '再重载 __game 就绪');
    await sleep(700);
    try { await waitFor(`__game.notice.open()`, 6000, '公告弹出'); } catch (_) {}
    await ev(`__game.notice.hide(), 1`);
    await sleep(250);
    await enterLevel(2);
    await waitFor(`window.__game.levelId === 2`, 40000, '第二关开始（无环剑档）');
    await sleep(600);
    const pre2 = await ev(`({ granted: __game.weapon.granted, state: __game.getState() })`);
    ok(pre2.granted === false, `没拿到过的档不预送（granted=${pre2.granted}，等第 4 回合的获得时刻）`);
    ok(pre2.state === 'playing', '照常进战斗');

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
