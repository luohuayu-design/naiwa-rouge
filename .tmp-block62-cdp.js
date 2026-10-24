// 第 62 块 CDP：怪物尺寸 / 缝合小巫奶范围 / 雾鬼新规则 / 民心上限
//   A 五只怪尺寸：盾斧兽人 1.90、孢生菇 1.90、雾鬼·雾猎狼·缝补小巫 1.85
//   B 缝补小巫奶半径 8.0（不画判定圈，只在被治的怪身上冒特效）
//   C 雾鬼：贴脸不再强制显形；隐身时玩家打不到它；隐身时它照样能打人
//   D 民心：上限 120，涨到头不再假装还在涨；商店折扣跟着放宽到 0.65
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block62-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9376;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-62');
const OUT = path.join(os.tmpdir(), 'naiwa-block62');
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
    await send('Runtime.enable');
    await send('Page.enable');

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(1200);

    // 摘掉标题页上可能自动弹的公告 / 签到 / 宣传
    await ev(`['noticeOv','promoOv','signOv'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
    }); 1`);
    await sleep(300);

    // ============================================================
    console.log('\n[A] 五只怪的尺寸');
    // ============================================================
    await ev("document.getElementById('btnStart').click(), 1");
    await sleep(400);
    await ev("document.querySelector('.lv-item[data-level=\"4\"]').click(), 1");
    await sleep(400);
    await ev("document.getElementById('diffNext')?.click(), 1");
    await sleep(400);
    await ev("document.getElementById('curseStart')?.click(), 1");
    await sleep(600);
    if (await ev("document.getElementById('tutAsk')?.classList.contains('on')")) {
      await ev("document.getElementById('tutNo').click(), 1");
    }
    await waitFor("__game.getState() === 'playing'", 25000, '进入第四关');
    await sleep(1000);
    // 只停「新怪上场」，别停 enemies.update —— setPaused 会把 AI 一起冻住，
    // 那样刚放出来的怪永远停在 spawn 状态，后面所有行为断言都读不到东西。
    await ev('__game.setWaves(true), 1');

    const sizes = JSON.parse(await ev(`(() => {
      const out = {};
      const put = (kind, x) => {
        const e = __game.enemies.spawn(kind, { x: x, z: 0 }, {});
        if (!e) { out[kind] = null; return; }
        out[kind] = {
          h: +e.height.toFixed(2),
          r: +e.cfg.radius.toFixed(2),
          atk: e.cfg.attackRange != null ? +e.cfg.attackRange.toFixed(2) : null,
        };
      };
      put('shielder', 7); put('brood', -7); put('wraith', 9);
      put('leaper', -9); put('mender', 11);
      return JSON.stringify(out);
    })()`));
    ok(sizes.shielder && Math.abs(sizes.shielder.h - 1.90) < 0.02, '盾斧兽人身高 1.90（战士 1.38 的 1.4 倍）', JSON.stringify(sizes.shielder));
    ok(sizes.shielder && Math.abs(sizes.shielder.r - 0.62) < 0.02, '盾斧兽人半径收到 0.62（不堵路）', JSON.stringify(sizes.shielder));
    ok(sizes.shielder && Math.abs(sizes.shielder.atk - 1.45) < 0.03, '盾斧兽人近战距离跟着收到 1.45', JSON.stringify(sizes.shielder));
    ok(sizes.brood && Math.abs(sizes.brood.h - 1.90) < 0.02, '孢生菇身高 1.90', JSON.stringify(sizes.brood));
    ok(sizes.brood && Math.abs(sizes.brood.r - 0.55) < 0.02, '孢生菇半径 0.55', JSON.stringify(sizes.brood));
    for (const k of ['wraith', 'leaper', 'mender']) {
      ok(sizes[k] && Math.abs(sizes[k].h - 1.85) < 0.02, `${k} 身高 1.85`, JSON.stringify(sizes[k]));
    }

    // 等五只都从「钻出来」变成正常状态（spawn → walk）
    await waitFor("__game.enemies.list.filter((e) => e.cfg && e.state !== 'spawn' && e.state !== 'dead').length >= 4",
      12000, '怪出场动画结束');

    // ============================================================
    console.log('\n[B] 缝补小巫：范围放大、不画判定圈');
    // ============================================================
    const mend = JSON.parse(await ev(`(() => {
      const m = __game.enemies.list.find((e) => e.cfg.spell && e.cfg.spell.kind === 'mend');
      return JSON.stringify({ radius: m ? m.cfg.spell.radius : null, heal: m ? m.cfg.spell.heal : null });
    })()`));
    ok(mend.radius === 8, '奶半径 8.0（原 3.2）', JSON.stringify(mend));
    // 「不画判定圈」的结构依据：奶妈自己不带 ringColor（脚下范围圈），
    // 治疗特效只挂在被治的那只身上（见 enemy.js mendWounds）。
    const mendNoRing = await ev(`(() => {
      const m = __game.enemies.list.find((e) => e.cfg.spell && e.cfg.spell.kind === 'mend');
      return m ? !m.cfg.ringColor : false;
    })()`);
    ok(mendNoRing === true, '缝补小巫脚下不画范围圈（半径 8 的圈会把战场糊满）');

    // ============================================================
    console.log('\n[C] 雾鬼新规则');
    // ============================================================
    const ghostCfg = JSON.parse(await ev(`(() => {
      const w = __game.enemies.list.find((e) => e.cfg.ghost);
      return JSON.stringify({ revealDist: w.cfg.ghost.revealDist, keys: Object.keys(w.cfg.ghost) });
    })()`));
    ok(ghostCfg.revealDist === undefined, '贴脸强制显形的参数已经删掉（revealDist 不存在）', JSON.stringify(ghostCfg));
    // 等它自己进入隐身（世界一直在跑）
    const hiddenOk = await (async () => {
      for (let i = 0; i < 40; i++) {
        if (await ev('__game.enemies.hiddenCount() > 0')) return true;
        await sleep(200);
      }
      return false;
    })();
    ok(hiddenOk === true, '雾鬼会自己进入隐身');
    const hiddenDmg = JSON.parse(await ev(`(() => {
      const w = __game.enemies.list.find((e) => e.ghostHidden);
      if (!w) return JSON.stringify({ ok: false });
      const before = w.hp;
      const dealt = __game.enemies.takeDamage(w, 3, false, {});
      return JSON.stringify({ ok: true, dealt: dealt, before: before, after: w.hp });
    })()`));
    ok(hiddenDmg.ok && hiddenDmg.dealt === false, '隐身时玩家打不到它（takeDamage 返回 false）', JSON.stringify(hiddenDmg));
    ok(hiddenDmg.ok && hiddenDmg.after === hiddenDmg.before, '隐身时血量没掉', JSON.stringify(hiddenDmg));
    // 源码级确认两条「强制显形」的旧分支都不在了 —— 行为断言靠时机，容易假绿
    const src = JSON.parse(await ev(`(async () => {
      const t = await (await fetch('js/enemy.js')).text();
      return JSON.stringify({
        revealOnNear: t.indexOf('g.revealDist') >= 0,
        revealOnAttack: t.indexOf("if (e.cfg.ghost && e.ghostHidden) revealGhost(e)") >= 0,
        hasRevealDist: t.indexOf('revealDist:') >= 0,
      });
    })()`));
    ok(src.revealOnNear === false, '源码里没有「靠近就显形」的分支', JSON.stringify(src));
    ok(src.revealOnAttack === false, '源码里没有「出手就显形」的分支', JSON.stringify(src));
    ok(src.hasRevealDist === false, 'revealDist 这个参数已经彻底删掉', JSON.stringify(src));

    // 隐身时它照样是活怪：会动、会追击（不再因为隐身而变成雕像）
    const stillMoves = await ev(`(() => {
      const w = __game.enemies.list.find((e) => e.cfg.ghost);
      if (!w) return false;
      return w.speed > 0 && w.state !== 'dead';
    })()`);
    ok(stillMoves === true, '隐身的雾鬼照常行动（不是雕像）');

    // ============================================================
    console.log('\n[D] 民心上限 120');
    // ============================================================
    const rep0 = await ev('__game.rep');
    await ev('__game.addRep(500), 1');
    const repTop = await ev('__game.rep');
    ok(repTop === 120, '民心涨到上限是 120（不再是 100）', `${rep0} → ${repTop}`);
    const mul = await ev('__game.repMul');
    ok(Math.abs(mul - 0.65) < 0.005, '满民心商店价 = 0.65 倍', String(mul));
    await ev('__game.addRep(-500), 1');
    ok(await ev('__game.rep') === 0, '跌到下限是 0', String(await ev('__game.rep')));

    // ============================================================
    console.log('\n[E] 回血技能（CD 25s / 回 5 点 / 满血按不动）');
    // ============================================================
    const heal0 = JSON.parse(await ev('JSON.stringify(__game.heal.state())'));
    ok(heal0.unlocked === false || heal0.unlocked === true, '读得到回血技能状态', JSON.stringify(heal0));
    ok(await ev('__game.heal.visible() === false'), '没解锁时技能栏里没有这一格', JSON.stringify(heal0));
    await ev('__game.heal.unlock(), 1');
    ok(await ev('__game.heal.visible() === true'), '解锁后技能栏多一格');

    // 满血：按不动，而且不该浪费一次冷却
    await ev('__game.heal.fill(), 1');
    const full0 = JSON.parse(await ev('JSON.stringify(__game.heal.state())'));
    ok(full0.status === 'full' && full0.cd === 0, '满血时状态是 full、冷却还是 0', JSON.stringify(full0));
    const noop = await ev('__game.heal.press()');
    ok(noop === false, '满血按下去什么都不发生', String(noop));
    ok(await ev('__game.heal.state().cd') === 0, '满血空按不吃冷却');

    const hp0 = JSON.parse(await ev('JSON.stringify(__game.heal.hp())'));
    await ev('__game.heal.hurt(6), 1');
    const hp1 = JSON.parse(await ev('JSON.stringify(__game.heal.hp())'));
    ok(Math.abs(hp1.cur - (hp0.max - 6)) < 0.05 || hp1.cur < hp0.max - 0.5,
      '先把血打掉一截', `${hp0.cur}/${hp0.max} → ${hp1.cur}/${hp1.max}`);
    const got = await ev('__game.heal.press()');
    ok(got === true, '按下技能键真的放出回血', String(got));
    const hp2 = JSON.parse(await ev('JSON.stringify(__game.heal.hp())'));
    ok(Math.abs(hp2.cur - Math.min(hp2.max, hp1.cur + 5)) < 0.05, '回 5 点血、且不超过上限', `${hp1.cur} → ${hp2.cur}/${hp2.max}`);
    const heal1 = JSON.parse(await ev('JSON.stringify(__game.heal.state())'));
    ok(heal1.status === 'cd' && Math.abs(heal1.cd - 25) < 0.6, '进 25 秒冷却', JSON.stringify(heal1));
    // CD 中再按：无效
    const hp3 = JSON.parse(await ev('JSON.stringify(__game.heal.hp())'));
    await ev('__game.heal.press(), 1');
    const hp4 = JSON.parse(await ev('JSON.stringify(__game.heal.hp())'));
    ok(Math.abs(hp4.cur - hp3.cur) < 0.01, '冷却中按不动（血量不变）', `${hp3.cur} → ${hp4.cur}`);
    // 走真实技能键：第 3 格存在且键位是 3
    const sk = JSON.parse(await ev('JSON.stringify(__game.skillList())'));
    const healSk = sk.find((x) => x.id === 'heal');
    ok(!!healSk && healSk.key === '3', '技能栏第 3 格是回血、快捷键 3', JSON.stringify(healSk));
    // 冷却会自己往下走（不是卡死在 25）
    await sleep(1200);
    const cdLater = await ev('__game.heal.state().cd');
    ok(cdLater < 25, '冷却在走（1.2 秒后小于 25）', String(cdLater));

    // ============================================================
    console.log('\n[F] 民心专属事件（良性池 / 恶性池）');
    // ============================================================
    const pools = JSON.parse(await ev('JSON.stringify(__game.repEv.pools())'));
    ok(pools.good.length >= 4, `良性池有 ${pools.good.length} 条`, JSON.stringify(pools.good.map((x) => x.tier)));
    ok(pools.bad.length >= 3, `恶性池有 ${pools.bad.length} 条`, JSON.stringify(pools.bad.map((x) => x.tier)));
    ok(pools.good.some((x) => x.tier === 3), '最高档（拥戴 100）有自己的专属事件');
    ok(pools.bad.every((x) => x.tier < 0), '恶性池全在负档位');

    // 每一条：有剧情、有选项、有真正的收益（permanent / mods）
    const richness = JSON.parse(await ev(`(() => {
      const ids = __game.repEv.pools().good.concat(__game.repEv.pools().bad).map((x) => x.id);
      const bad = [];
      for (const id of ids) {
        const ev = __game.repEv.get(id);
        if (!ev) { bad.push(id + ':缺内容'); continue; }
        const storyOk = (ev.story || '').length >= 60;
        const chOk = (ev.choices || []).length >= 2;
        const effOk = (ev.choices || []).every((c) => {
          const e = c.effects || {};
          return !!(e.permanent || e.mods || e.rep || e.gold || e.drain || e.hp);
        });
        const sayOk = (ev.choices || []).every((c) => (c.say || '').length >= 20);
        if (!storyOk) bad.push(id + ':剧情太短');
        if (!chOk) bad.push(id + ':选项不足');
        if (!effOk) bad.push(id + ':没有实际收益');
        if (!sayOk) bad.push(id + ':缺回话');
      }
      return JSON.stringify({ n: ids.length, bad: bad });
    })()`));
    ok(richness.bad.length === 0, `${richness.n} 条民心事件都有剧情 / 选项 / 收益 / 回话`, JSON.stringify(richness.bad));

    // 跨档 → 入队
    await ev('__game.repEv.clear(), 1');
    await ev('__game.addRep(120), 1');            // 一路涨到顶：只算一次跨档（0 → 3）
    const qUp = JSON.parse(await ev('JSON.stringify(__game.repEv.queue())'));
    ok(qUp.length === 1, '民心上到顶档 → 队列里排了一条良性事件', JSON.stringify(qUp));
    ok(/repGood/.test(qUp[0] || ''), '排进来的是良性池的那条', String(qUp[0]));

    await ev('__game.repEv.clear(), 1');
    await ev('__game.addRep(-120), 1');            // 一路跌到底
    const qDown = JSON.parse(await ev('JSON.stringify(__game.repEv.queue())'));
    ok(qDown.length === 1 && /repBad/.test(qDown[0] || ''), '民心跌到敌视 → 队列里排了一条恶性事件', JSON.stringify(qDown));

    // 同一档一局只触发一次
    const once = JSON.parse(await ev(`(() => {
      __game.repEv.clear();
      __game.addRep(120);           // 涨到拥戴：排一条
      __game.addRep(-120);          // 跌回谷底：排一条
      const first = __game.repEv.fired().length;
      __game.addRep(120);           // 再涨到拥戴：这一档已经用过，不该再排
      return JSON.stringify({ fired: first, queue: __game.repEv.queue().length, firedAfter: __game.repEv.fired().length });
    })()`));
    ok(once.firedAfter === once.fired, '同一档位一局只触发一次（反复上下不会再排）', JSON.stringify(once));

    // ============================================================
    console.log('\n[G] 攻略面板（手风琴）');
    // ============================================================
    const secs = JSON.parse(await ev('JSON.stringify(__game.guide.sections())'));
    ok(secs.length === 3, '三组：武器 / 属性 / 技能', JSON.stringify(secs.map((x) => x.title)));
    ok(secs.map((x) => x.title).join('/') === '武器类/属性加成类/技能类', '组名和顺序正确', secs.map((x) => x.title).join('/'));
    ok(secs.every((x) => x.n >= 3), '每组至少 3 条', JSON.stringify(secs.map((x) => x.n)));

    await ev('__game.guide.open(), 1');
    await sleep(400);
    ok(await ev('__game.guide.open_()') === true, '点开能打开');
    const dom = JSON.parse(await ev('JSON.stringify(__game.guide.dom())'));
    ok(dom.built === true && dom.secs.length === 3, '面板真的渲染出三组', JSON.stringify(dom.secs));
    ok(dom.secs.filter((x) => x.open).length === 1, '默认只展开第一组（手风琴）', JSON.stringify(dom.secs));
    ok(dom.secs[0].items >= 6, '武器组里有 6 种剑 + 法器', String(dom.secs[0].items));
    ok(dom.text > 1200, '攻略正文足够长（不是占位空壳）', String(dom.text));

    // 点第二组：它展开、第一组收起
    await ev("document.querySelectorAll('#guideBody .gd-sec-hd')[1].click(), 1");
    await sleep(200);
    const dom2 = JSON.parse(await ev('JSON.stringify(__game.guide.dom())'));
    ok(dom2.secs[1].open === true && dom2.secs[0].open === false, '点第二组：它展开、第一组收起', JSON.stringify(dom2.secs));
    // 点条目：展开正文
    await ev("document.querySelectorAll('#guideBody .gd-sec')[1].querySelector('.gd-item-hd').click(), 1");
    await sleep(200);
    ok(await ev("document.querySelectorAll('#guideBody .gd-sec')[1].querySelector('.gd-item').classList.contains('open')") === true,
      '点条目能展开详情');
    await shot('guide.png');
    await ev('__game.guide.close(), 1');
    ok(await ev('__game.guide.open_()') === false, '能关掉');

    await shot('sizes_after.png');

    // ============================================================
    console.log('\n-------------------------------');
    console.log(`通过 ${pass} / 失败 ${fail}`);
    if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('测试中断:', e.message);
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
