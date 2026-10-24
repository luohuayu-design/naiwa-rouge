// ============================================================
// 第 64 块 CDP：运行时行为
//   A 新手教程 8 步（判定环讲解 / 讲解步带「下一步」/ 走完回到 playing）
//   B 属性面板「技能」页（3 个技能 / CD 两位数 / 箭雨没解锁也显示 + 解锁条件）
//   C 技能键倒计时精确到两位小数
//   D 元素剑群体化（冰/毒/震/血按半径波及，雷剑仍然全场）
//   E 环上剑的实时构成（恢复随机化的观测钩子）
//   F 全程 0 JS 报错 + 截图
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block64-cdp.js`
//
// ⚠️ 复用 block63 的经验：
//   · 别用 setPaused 停世界（AI 一起停）；要「不出新怪」用 setWaves(true)，
//     「怪不追你」用 setEnemies(true)。
//   · getter 不能加括号（fireReady / ringKinds 等）。
//   · 档案写 localStorage 之后必须 Page.reload（profile() 启动时读进内存）。
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9378;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-64');
const OUT = path.join(os.tmpdir(), 'naiwa-block64');
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
      await ev(`['packGet','noticeOv','promoOv','signOv'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
      }); 1`);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }

    await send('Runtime.enable');
    await send('Page.enable');

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(1000);
    // 造档案：打通 1~4 关（第五关要解锁）+ 回血技能已解锁（面板上才有「就绪」状态）
    await ev(`(() => {
      const rec = {};
      for (const id of [1, 2, 3, 4]) rec[id] = { wins: 1, bestTime: 120, bestKills: 200, bestRound: 20 };
      localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify(rec));
      const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
      p.ringGot = true;
      p.heal = { unlocked: true };
      p.voicePack = { unlocked: true, id: 'normal' };
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
      return 1;
    })()`);
    await send('Page.reload', { ignoreCache: true });
    await waitFor('!!window.__game', 90000, '__game 就绪（reload 后）');
    await sleep(1400);
    await ev(`['noticeOv','promoOv','signOv','packGet'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
    }); 1`);
    await sleep(300);

    // ============================================================
    console.log('\n[A] 新手教程：8 步 + 判定环讲解');
    // ============================================================
    ok(await ev('typeof __game.block64.tut.total') === 'number', '第 64 块调试口就绪');
    ok(await ev('__game.block64.tut.total') === 8, '教程共 8 步', String(await ev('__game.block64.tut.total')));

    // 从标题页起一局带教程的
    await ev('__game.block64.tut.start(), 1');
    await waitFor("__game.state === 'tutorial'", 20000, '进入教程');
    await sleep(700);
    ok(await ev('__game.state') === 'tutorial', '状态是 tutorial');
    ok(await ev("__game.block64.tut.stepText()") === '新手教程 1 / 8', '卡片写着 1 / 8',
      await ev("__game.block64.tut.stepText()"));
    ok(await ev('__game.block64.tut.kind()') === 'move', '第 1 步是「动手」类（移动）');
    ok(await ev('__game.block64.tut.nextHidden()') === true, '动手类步骤不显示「下一步」按钮');
    ok((await ev('__game.block64.tut.title()')).includes('先动起来'), '第 1 步标题');

    // 第 2 步：判定环讲解（纯讲解 → 出现「下一步」）
    await ev('__game.block64.tut.next(), 1');
    await sleep(400);
    ok(await ev('__game.block64.tut.kind()') === 'info', '第 2 步是讲解类');
    ok(await ev('__game.block64.tut.nextHidden()') === false, '讲解类步骤显示「下一步」');
    const ringText = await ev('__game.block64.tut.text()');
    ok(ringText.includes('判定环'), '第 2 步讲的是判定环', ringText.slice(0, 24));
    ok(ringText.includes('圈外的怪你一下都够不到'), '讲清「圈外打不到」');
    ok(ringText.includes('把怪带进圈里'), '讲清走位 = 把怪带进圈');
    ok((await ev('__game.block64.tut.title()')).includes('判定环'), '标题也点了判定环');
    await shot('tut-ring.png');

    // 点「下一步」按钮（真的点 DOM，不是调函数）
    ok(await ev("(() => { const b = document.getElementById('tcNext'); if (!b || b.hidden) return false; b.click(); return true; })()"),
      'tcNext 按钮可见可点');
    await sleep(400);
    ok(await ev('__game.block64.tut.kind()') === 'kill', '点按钮后走到「打怪」步');
    // 这一步要生成教程靶子（0 伤害、1 血）
    await sleep(600);
    const dummy = JSON.parse(await ev(`(() => {
      const d = __game.enemies.list.filter((e) => e.type === 'minion' && e.damage === 0);
      return JSON.stringify({ n: d.length, hp: d[0] ? d[0].hp : null, max: d[0] ? d[0].maxHp : null });
    })()`));
    // hp 可能是 0：靶子会自己走过来，进圈后玩家自动拍它一下 —— 那正是第 3 步要演示的事
    ok(dummy.n >= 1 && dummy.max === 1, '打怪步生成了 1 血的 0 伤害靶子', JSON.stringify(dummy));

    // 后面依次走完：panel（要开关面板）→ info → info → bag（开关背包）→ info
    const seen = [];
    for (let i = 0; i < 12 && (await ev('__game.state')) === 'tutorial'; i++) {
      const kind = await ev('__game.block64.tut.kind()');
      seen.push(kind);
      if (kind === 'panel') {
        await ev("__game.block64.panel.open('skill'), 1");
        await sleep(300);
        await ev('__game.block64.panel.close(), 1');
        await sleep(350);
      } else if (kind === 'bag') {
        await ev("document.getElementById('bagBtn').click(), 1");
        await sleep(300);
        await ev("document.getElementById('bagClose').click(), 1");
        await sleep(350);
      } else if (kind === 'kill') {
        await ev("__game.enemies.list.filter(e => e.damage === 0).forEach(e => __game.enemies.takeDamage(e, 99, false, { quiet: true })), 1");
        await sleep(350);
      } else {
        await ev('__game.block64.tut.next(), 1');
        await sleep(350);
      }
    }
    ok((await ev('__game.state')) !== 'tutorial', '教程走完自动进入下一阶段',
      await ev('__game.state'));
    ok(seen.includes('panel') && seen.includes('bag') && seen.includes('info'),
      `教程步骤类型齐全（${[...new Set(seen)].join('/')}）`);

    // 关掉可能弹出的「开始战斗」前的卡片，进入正式第 1 回合
    for (let i = 0; i < 6; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'shop') await ev("document.getElementById('shClose')?.click(), 1");
      else if (st === 'upgrade') await ev("document.querySelector('#upList .up-item')?.click(), 1");
      else if (st === 'meet') await ev("document.getElementById('mtOk')?.click(), 1");
      else if (st === 'wtut') await ev("document.getElementById('wtSkip')?.click(), 1");
      else await ev("__game.block64.tut.skip(), 1");
      await sleep(600);
    }
    await waitFor("__game.state === 'playing'", 25000, '进入战斗');

    // ============================================================
    console.log('\n[B] 属性面板「技能」页');
    // ============================================================
    ok(await ev(`!!document.querySelector('.ap-tab[data-tab="skill"]')`), '面板上有第三个页签「技能」');
    await ev("__game.block64.panel.open('skill'), 1");
    await sleep(500);
    ok(await ev('__game.block64.panel.tab()') === 'skill', '打开的是技能页');
    const rows = JSON.parse(await ev('JSON.stringify(__game.block64.panel.rows())'));
    ok(rows.length === 3, `技能页 3 行（实际 ${rows.length}）`, JSON.stringify(rows.map((r) => r.name)));
    ok(rows[0].name === '万剑齐发' && rows[1].name === '箭雨' && rows[2].name === '回血',
      '顺序是 万剑齐发 / 箭雨 / 回血', JSON.stringify(rows.map((r) => r.name)));
    ok(rows.every((r) => /^CD \d+\.\d{2} 秒$/.test(r.val)), '每行都写着两位小数的 CD',
      JSON.stringify(rows.map((r) => r.val)));
    ok(rows[1].val === 'CD 8.00 秒', '箭雨 CD 8.00 秒（以前面板上根本没有这条）', rows[1].val);
    ok(rows[2].val === 'CD 25.00 秒', '回血 CD 25.00 秒', rows[2].val);
    ok(rows[0].val === 'CD 6.00 秒', '万剑齐发 CD 6.00 秒', rows[0].val);
    ok(rows.every((r) => r.status && r.status.length > 2), '每行都有状态说明',
      JSON.stringify(rows.map((r) => r.status)));
    // 箭雨在第 1 关没解锁（要第二关起）→ 状态是未解锁，并且写着解锁条件
    ok(rows[1].state === 'lock', '箭雨这一局没解锁 → lock', rows[1].state);
    ok(rows[1].status.includes('未解锁') && rows[1].status.includes('第二关'), '未解锁的写着解锁条件',
      rows[1].status);
    // 回血在档案里解锁了 → 就绪或冷却中，反正不是 lock
    ok(rows[2].state !== 'lock', '回血已解锁（档案造的）', rows[2].state);
    ok((await ev('__game.block64.panel.sub()')).includes('3 个技能'), '副标题报「3 个技能」',
      await ev('__game.block64.panel.sub()'));
    await shot('panel-skill.png');

    // 环剑页仍然正常（别把老页面改坏）
    await ev("__game.block64.panel.open('weapon'), 1");
    await sleep(400);
    const wRows = JSON.parse(await ev('JSON.stringify(__game.block64.panel.rows())'));
    ok(wRows.length === 12, `环剑页 12 项（含新增的元素波及/溅射，实际 ${wRows.length}）`);
    ok(wRows.some((r) => r.name === '元素波及' && r.val.includes('3.5')), '环剑页能看到「元素波及 3.5 格」',
      JSON.stringify(wRows.filter((r) => r.name === '元素波及')));
    ok(wRows.some((r) => r.name === '元素溅射' && r.val.includes('50')), '能看到「元素溅射 50%」');
    await ev('__game.block64.panel.close(), 1');
    await sleep(300);

    // ============================================================
    console.log('\n[C] 技能键倒计时两位小数');
    // ============================================================
    // 先拿到环剑（第 1 关要等第 5 回合）—— 直接用调试口送一把，避开等回合
    if (!(await ev('__game.weapon.granted'))) {
      await ev('__game.block64.grantRing(), 1');
      await sleep(600);
    }
    ok(await ev('__game.weapon.granted') === true, '环剑已到手（技能键才会出现）');
    ok(await ev('__game.weapon.count') >= 3, '环上至少 3 把剑', String(await ev('__game.weapon.count')));
    await ev(`document.querySelector('.sk[data-skill="swordRain"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1`);
    await sleep(500);
    const cdAfter = await ev('__game.fireCdLeft()');
    ok(cdAfter > 0, '放完万剑齐发进了冷却', String(cdAfter));
    const nums = JSON.parse(await ev('JSON.stringify(__game.block64.skillNums())'));
    const rainNum = (nums.find((n) => n.id === 'swordRain') || {}).num || '';
    ok(/^\d+\.\d{2}$/.test(rainNum), `技能键上的倒计时是两位小数（「${rainNum}」）`);
    ok(!/^\d+$/.test(rainNum), '不再是整数秒');
    // 冷却在走：0.5 秒后数字要变小
    await sleep(600);
    const nums2 = JSON.parse(await ev('JSON.stringify(__game.block64.skillNums())'));
    const rainNum2 = (nums2.find((n) => n.id === 'swordRain') || {}).num || '';
    ok(parseFloat(rainNum2) < parseFloat(rainNum), `倒计时在递减（${rainNum} → ${rainNum2}）`);
    await shot('skill-cd.png');

    // ============================================================
    console.log('\n[D] 元素剑群体化');
    // ============================================================
    // 清场 + 停刷怪 + 怪不追人（要看的是「一次命中波及几只」，不是打斗）
    await ev('__game.enemies.killAll(), 1');
    await ev('__game.setWaves(true), 1');
    await ev('__game.setEnemies(true), 1');
    await sleep(600);
    // 三只盾兵排在一条线上：前两只相距 1.2、第三只离第一只 5.5（超出 3.5 格）
    const placed = await ev(`(() => {
      const p = __game.pos;
      const xs = [2.0, 3.2, 6.5];
      const out = [];
      for (const dx of xs) {
        const e = __game.enemies.spawn('shielder', { x: p.x + dx, z: p.z + 0.001 });
        if (e) { e.state = 'chase'; e.hp = 999; e.maxHp = 999; out.push({ dx, hp: 999 }); }
      }
      return out.length;
    })()`);
    ok(placed === 3, '三只测试用盾兵就位', String(placed));
    await sleep(400);

    const frost = JSON.parse(await ev("JSON.stringify(__game.block64.elemHit('frost', 'shielder'))"));
    ok(frost && frost.n >= 3, '取到三只盾兵', JSON.stringify(frost && frost.n));
    ok(frost.frozen[0] > 0 && frost.frozen[1] > 0, '冰剑把命中点和身边的怪都冻住了',
      JSON.stringify(frost.frozen));
    ok(frost.frozen[2] === 0, '圈外（6.5 格）那只没被冻', JSON.stringify(frost.frozen));
    ok(Math.abs((frost.before[1] - frost.after[1]) - 1.0) < 0.02,
      `身边那只吃到 50% 溅射 = 1.0（实际 ${(frost.before[1] - frost.after[1]).toFixed(2)}）`);
    ok(Math.abs(frost.before[0] - frost.after[0]) < 0.01, '直接命中的那只不重复吃溅射');
    ok(Math.abs(frost.before[2] - frost.after[2]) < 0.01, '圈外那只一点没掉', JSON.stringify([frost.before[2], frost.after[2]]));
    await shot('elem-frost.png');

    const poison = JSON.parse(await ev("JSON.stringify(__game.block64.elemHit('poison', 'shielder'))"));
    ok(poison.dotted[0] && poison.dotted[1], '毒剑让身边那两只都中毒了', JSON.stringify(poison.dotted));
    ok(poison.dotted[2] === false, '圈外那只没中毒', JSON.stringify(poison.dotted));

    const quake = JSON.parse(await ev("JSON.stringify(__game.block64.elemHit('quake', 'shielder'))"));
    ok(quake && quake.n >= 3, '震剑也能正常运行（群体分支没抛错）');

    // 雷剑：依然是全场（把一只放很远，看它有没有掉血）
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.enemies.spawn('shielder', { x: p.x - 12, z: p.z });
      if (e) { e.state = 'chase'; e.hp = 999; e.maxHp = 999; }
      return 1;
    })()`);
    await sleep(300);
    const thunder = JSON.parse(await ev("JSON.stringify(__game.block64.elemHit('thunder', 'shielder'))"));
    ok(thunder.n === 4, '场上 4 只盾兵（含 12 格外那只）', String(thunder.n));
    const farIdx = 3;
    ok(Math.abs((thunder.before[farIdx] - thunder.after[farIdx]) - 0.9) < 0.02,
      `雷剑连到 12 格外的怪（45% = 0.9，实际 ${(thunder.before[farIdx] - thunder.after[farIdx]).toFixed(2)}）`);
    await shot('elem-thunder.png');

    // ============================================================
    console.log('\n[E] 环上剑的实时构成（恢复顺序观测）');
    // ============================================================
    ok(await ev('typeof __game.block64.ringOrder') === 'function', '有环上剑顺序的观测口');
    // 先把场上清空：环剑碰到怪就会被消耗，战斗中的采样会读到「刚好全喷完」的瞬间
    await ev('__game.enemies.killAll(), 1');
    await ev('__game.setWaves(true), 1');
    await ev('__game.setEnemies(true), 1');
    // 等环补满（整环补满制：10 秒/拥有数）
    for (let i = 0; i < 40; i++) {
      const n = await ev('__game.weapon.count');
      if (n >= await ev('__game.weapon.target')) break;
      await sleep(300);
    }
    // 补三种属性剑，看环上是不是真的混起来了
    await ev("__game.addSword('frost'); __game.addSword('thunder'); __game.addSword('leech'), 1");
    for (let i = 0; i < 20; i++) {
      if (await ev('__game.weapon.count') >= await ev('__game.weapon.target')) break;
      await sleep(300);
    }
    const ringKinds = JSON.parse(await ev('JSON.stringify(__game.block64.ringKinds())'));
    const totalRing = ringKinds.reduce((a, b) => a + b.n, 0);
    ok(totalRing >= 6, `环上至少有 6 把剑（实际 ${totalRing}）`, JSON.stringify(ringKinds));
    ok(ringKinds.some((k) => k.kind !== 'iron'), '环上不止铁剑（属性剑确实上环了）',
      JSON.stringify(ringKinds));
    const wstat = JSON.parse(await ev('JSON.stringify(__game.block64.weaponStats())'));
    ok(wstat.elementRadius === 3.5 && wstat.elementRatio === 0.5, '运行时读到元素波及 3.5 / 溅射 50%', JSON.stringify(wstat));
    ok(wstat.poisonDps === 0.15 && wstat.frostTime === 1.6 && wstat.chainRatio === 0.45,
      '运行时元素基础值是新数（毒 0.15 / 冰 1.6 / 雷 0.45）', JSON.stringify(wstat));

    // ============================================================
    console.log('\n[F] JS 报错');
    // ============================================================
    const noise = jsErrors.filter((e) => e && !/favicon|404|net::ERR/.test(e));
    ok(noise.length === 0, `全程 0 条 JS 报错（实际 ${noise.length}）`, noise.slice(0, 3).join(' | '));
  } catch (err) {
    fail++;
    fails.push('异常: ' + err.message);
    console.log('\n✗ 运行异常: ' + err.message);
  } finally {
    try { ws?.close(); } catch (_) { /* ignore */ }
    try { chrome.kill(); } catch (_) { /* ignore */ }
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); }
  process.exit(fail ? 1 : 0);
})();
