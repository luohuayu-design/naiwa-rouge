// 第 105 块 CDP：签到改版（随机 0~100 / 3·5·7 天档）+ 盲盒属性幅度统一下调
//   A 面板：三档里程碑（3 / 5 / 7 天）、火种那档单独样式、0~100 文案
//   B 七日签到（时间旅行）：每天金额 0~100、3 天 +100、5 天 +150、7 天不给骨币
//   C 第 7 天换到火种：关掉签到面板就地接上三选一，选一张 pending 归零
//   D 盲盒：奖池「强度 ×0.9 / ×1.4 / ×2.1」、四条新属性进池、实掷数值都是缩放后的
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-105-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9386;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-105');
const OUT = path.join(os.tmpdir(), 'naiwa-block105');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
// ⚠️ 签名是 ok(条件, 名字, 附注) —— 别写成 ok(名字, 条件)：非空字符串恒真，会整片假绿
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
    // 让「公告 → 签到 → 宣传有礼」那条链不来打扰（本套自己驱动签到）
    await ev('window.__game.promo.clear(); window.__game.notice.seenReset && window.__game.notice.seenReset(); 1');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    // ⚠️ 公告浮层在 z 轴最上面：只做 DOM 断言无所谓，但**截图会被它整张盖住**。
    // 而且「公告 → 签到 → 宣传有礼」是一条 350ms 一环的定时器链，公告本身还是
    // **延时自动弹**的 —— 不等它真弹出来就 hide()，等于什么都没做，随后照样盖上来
    //（第一版就是这么翻的：`__game.notice.close` 钩子名写错 + 关早了，四张截图全被公告挡）。
    // 正确姿势：等它自己出现 → 按链的顺序一站一站关 → 每一站都等够 350ms。
    try { await waitFor('__game.notice.open()', 8000, '公告自动弹出'); } catch (_) { /* 这个存档已经看过就不弹 */ }
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(600);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(600);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);
    const clean = await ev('JSON.stringify({ n: __game.notice.open(), s: __game.sign.open(), p: __game.promo.open() })');
    ok(JSON.parse(clean).n === false && JSON.parse(clean).s === false && JSON.parse(clean).p === false,
      '三个浮层都收干净了（截图才不会被盖住）', clean);

    // ============================================================
    console.log('\n[A] 面板结构（三档 + 火种档）');
    // ============================================================
    await ev('__game.sign.hide(), __game.sign.show(), 1');
    await sleep(300);
    {
      const n = await ev("document.querySelectorAll('#signTiers .sign-tier').length");
      ok(n === 3, '三档里程碑条', String(n));
      const txt = await ev("document.getElementById('signTiers').textContent");
      ok(/累计 3 天/.test(txt) && /\+100 骨币/.test(txt), '3 天 +100 骨币', txt);
      ok(/累计 5 天/.test(txt) && /\+150 骨币/.test(txt), '5 天 +150 骨币', txt);
      ok(/累计 7 天/.test(txt) && /永夜火种 ×1/.test(txt), '7 天换成永夜火种 ×1', txt);
      ok(!/200 骨币/.test(txt) && !/累计 6 天/.test(txt), '旧的「6 天 +200」不在了', txt);
      ok(await ev("document.querySelectorAll('#signTiers .sign-tier.boon').length") === 1, '火种那档单独一个样式类');
      const boonColor = await ev("getComputedStyle(document.querySelector('#signTiers .sign-tier.boon .st-v')).color");
      ok(!/rgb\(255, 217, 160\)/.test(boonColor), '火种档颜色和骨币两档不一样', boonColor);
      const sub = await ev("document.getElementById('signSub').textContent");
      ok(/0~100/.test(sub), '副标题写明每天随机 0~100', sub);
      const btn = await ev("document.getElementById('signBtn').textContent");
      ok(/随机 0~100/.test(btn), '按钮文案写明随机区间', btn);
      const h = await ev("JSON.stringify([...document.querySelectorAll('.tt-row-chal .tt-daily')].map(e => Math.round(e.getBoundingClientRect().height)))");
      ok(new Set(JSON.parse(h)).size === 1, '「今日挑战」那一排按钮仍等高', h);
      await shot('sign-panel-105.png');
    }

    // ============================================================
    console.log('\n[B] 七日签到（时间旅行）');
    // ============================================================
    // 用 Date 垫片把「今天」往后推：signToday() 的默认参数是 new Date()，
    // 模块里读到的是全局 Date 的绑定，所以换掉 window.Date 就能真的过七天。
    // ⚠️ 偏移量的基准必须是「本周一」而不是「今天」：签到以周为单位，
    // 从今天往后推 6 天会直接跨到下一周，第 7 天就变成新一周的第 1 天，
    // 7 天档永远凑不满（这个坑第一次写这套测试时就踩了）。
    await ev(`(() => {
      const R = Date;
      const now = new R();
      const wd = (now.getDay() + 6) % 7;      // 周一=0 … 周日=6
      window.__baseOff = -wd;                  // 第 1 天落在本周一
      window.__tOff = window.__baseOff * 86400000;
      window.Date = class extends R {
        constructor(...a) { a.length ? super(...a) : super(R.now() + window.__tOff); }
        static now() { return R.now() + window.__tOff; }
      };
      return wd;
    })()`);
    {
      const bones0 = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).bones');
      const rolls = [];
      let expect = bones0;
      let day3 = null, day5 = null, day7 = null;
      for (let i = 0; i < 7; i++) {
        await ev(`window.__tOff = (window.__baseOff + ${i}) * 86400000; 1`);
        // 重开一次面板，让「今天已签」的禁用态按新的一天重算
        await ev('__game.sign.hide(); __game.sign.show(); 1');
        await sleep(160);
        const before = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).bones');
        await ev("document.getElementById('signBtn').click(), 1");
        await sleep(220);
        const after = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).bones');
        const gain = await ev("document.getElementById('signGain').textContent");
        const m = gain.match(/(\d+) 骨币/);
        const roll = m ? Number(m[1]) : NaN;
        rolls.push(roll);
        ok(Number.isFinite(roll) && roll >= 0 && roll <= 100, `第 ${i + 1} 天随机值在 0~100（${roll}）`, gain);
        const milestone = i === 2 ? 100 : (i === 4 ? 150 : 0);
        expect += roll + milestone;
        ok(after === expect, `第 ${i + 1} 天落账对得上（${before} → ${after}）`, `期望 ${expect}｜${gain}`);
        const days = await ev('__game.sign.state().days');
        ok(days === i + 1, `本周天数 ${i + 1}`, String(days));
        if (i === 2) day3 = { after, gain };
        if (i === 4) day5 = { after, gain };
        if (i === 6) day7 = { after, gain, pending: await ev('__game.sign.pendingBoons()') };
      }
      ok(day3 && /本周累计 3 天：\+100 骨币/.test(day3.gain), '第 3 天补发 100 骨币', day3 && day3.gain);
      ok(day5 && /本周累计 5 天：\+150 骨币/.test(day5.gain), '第 5 天补发 150 骨币', day5 && day5.gain);
      ok(day7 && /本周累计 7 天：永夜火种 ×1/.test(day7.gain), '第 7 天给的是火种', day7 && day7.gain);
      ok(day7 && day7.pending === 1, '待抽的永夜火种 = 1', day7 && String(day7.pending));
      const persisted = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).boonPending');
      ok(persisted === 1, '火种次数写进了本机存档（关网页也不丢）', String(persisted));
      const total = rolls.reduce((a, b) => a + b, 0);
      ok(total >= 0 && total <= 700, '七天随机值合计在 0~700', String(total));
      const tierDone = await ev("JSON.stringify([...document.querySelectorAll('#signTiers .sign-tier')].map(e => e.classList.contains('done')))");
      ok(JSON.parse(tierDone).every(Boolean), '三档全部变「已领」', tierDone);
      await shot('sign-week-full-105.png');
    }

    // ============================================================
    console.log('\n[C] 关掉签到 → 火种三选一接上');
    // ============================================================
    {
      await ev('__game.sign.hide(), 1');
      await waitFor('__game.boons.open()', 6000, '火种面板接上');
      ok(await ev('__game.boons.open()') === true, '关掉签到面板就地弹出火种三选一');
      ok(await ev("document.getElementById('upgrade').classList.contains('boon') && document.getElementById('upgrade').classList.contains('on')"), '用的是三选一那套面板（#upgrade + boon + on）');
      const cards = await ev("document.querySelectorAll('#upList .up-item').length");
      ok(cards === 3, '摆出三张永久卡', String(cards));
      const hd = await ev("document.getElementById('upTitle').textContent");
      ok(/永夜火种/.test(hd), '标题写着永夜火种', hd);
      // 第一次开火种面板会叠一张「这张火种会跟着你一辈子」的确认卡，外加一条
      // 「成就解锁 · 满勤」的 toast（签满 7 天必然触发）—— 截图前都等它们退场
      await ev("(() => { const b = document.getElementById('caOk'); if (b) b.click(); return 1; })()");
      await sleep(1800);
      await shot('boon-from-signin-105.png');
      // 选一张：pending 归零、层数 +1
      const before = await ev('__game.boons.totalStacks()');
      await ev("document.querySelector('#upList .up-item').click(), 1");
      await sleep(400);
      ok(await ev('__game.boons.pending()') === 0, '选完次数归零', String(await ev('__game.boons.pending()')));
      ok(await ev('__game.boons.totalStacks()') === before + 1, '永久层数 +1', `${before} → ${await ev('__game.boons.totalStacks()')}`);
      await waitFor('!__game.boons.open()', 5000, '面板收起');
    }

    // ============================================================
    console.log('\n[D] 盲盒：强度显示与四条新属性');
    // ============================================================
    {
      // 先抽一批，确认浏览器里跑的就是缩放后的数值
      const stats = await ev(`(() => {
        const seen = { attack: [], stats: new Set() };
        for (let i = 0; i < 500; i++) {
          const r = __game.meta.roll('gold');
          if (!r || r.kind !== 'stat') continue;
          seen.stats.add(r.stat);
          if (r.stat === 'attack') seen.attack.push(+r.pct.toFixed(4));
        }
        return { stats: [...seen.stats], attack: [...new Set(seen.attack)] };
      })()`);
      ok(stats.attack.length > 0 && stats.attack.every((v) => Math.abs(Math.abs(v) - 0.1267) < 0.0006 || Math.abs(Math.abs(v) - 0.1056) < 0.0006),
        '金匣攻击力只出 12.67% / −10.56%（旧值 14.4% 已消失）', stats.attack.join(','));
      const need = ['swordCrit', 'attackRange', 'swordOrbit', 'elementRadius'];
      const got = need.filter((k) => stats.stats.includes(k));
      ok(got.length === 4, '四条新属性都能真的抽到', got.join(',') + ' / 全部 ' + stats.stats.join(','));

      // 奖池面板：强度显示 + 新条目进池
      await ev('__game.camp.show(), 1');
      await sleep(500);
      await ev("(() => { const b = document.getElementById('caOk'); if (b) b.click(); return 1; })()");
      await sleep(300);
      await ev("document.getElementById('shopTabBox').click(), 1");
      await sleep(500);
      const subs = await ev("JSON.stringify([...document.querySelectorAll('#boxPoolRoot .ac-sec .ac-sub')].map(e => e.textContent))");
      const subList = JSON.parse(subs);
      ok(subList.length === 3, '三个匣子三行说明', subs);
      ok(/强度 ×0\.9/.test(subList[0] || ''), '木匣显示强度 ×0.9', subList[0]);
      ok(/强度 ×1\.4/.test(subList[1] || ''), '银匣显示强度 ×1.4', subList[1]);
      ok(/强度 ×2\.1/.test(subList[2] || ''), '金匣显示强度 ×2.1', subList[2]);

      const pool = await ev(`(() => {
        const out = {};
        for (const id of ['box-wood', 'box-gold']) {
          const hd = document.querySelector('#boxPoolRoot .ac-sec[data-sec="' + id + '"] .ac-hd');
          if (hd) hd.click();
        }
        for (const id of ['box-wood', 'box-gold']) {
          const sec = document.querySelector('#boxPoolRoot .ac-sec[data-sec="' + id + '"]');
          out[id] = [...sec.querySelectorAll('.ac-pl')].map((r) => {
            const box = r.querySelector('.ac-pl-n');
            // ⚠️ .ac-pl-n 里装着「名字 + 数值」两层，取 textContent 会粘成一串；
            //    名字是第一个子 div，数值是 .ac-pl-s（第一次写这套断言就踩了这个坑）
            const nameEl = box ? box.firstElementChild : null;
            return {
              k: r.classList.contains('rare') ? 'rare' : (r.classList.contains('neg') ? 'neg' : 'pos'),
              n: nameEl ? nameEl.textContent : '',
              s: (r.querySelector('.ac-pl-s') || {}).textContent || '',
            };
          });
        }
        return out;
      })()`);
      const names = (id, kind) => pool[id].filter((r) => r.k === kind).map((r) => r.n);
      ok(pool['box-wood'].length > 0 && pool['box-gold'].length > 0, '两组都展开了', String(pool['box-wood'].length) + '/' + String(pool['box-gold'].length));
      ok(names('box-wood', 'pos').includes('远臂') && names('box-wood', 'pos').includes('锋线'),
        '木匣池里有「远臂 / 锋线」', names('box-wood', 'pos').join(','));
      ok(names('box-gold', 'pos').includes('环绕') && names('box-gold', 'pos').includes('扩散'),
        '金匣池里有「环绕 / 扩散」', names('box-gold', 'pos').join(','));
      ok(names('box-wood', 'neg').includes('短臂') && names('box-wood', 'neg').includes('钝锋'),
        '诅咒池里有对应的「短臂 / 钝锋」', names('box-wood', 'neg').join(','));
      ok(names('box-gold', 'neg').includes('滞环') && names('box-gold', 'neg').includes('收束'),
        '金匣诅咒池里有「滞环 / 收束」', names('box-gold', 'neg').join(','));
      const rangeRow = pool['box-wood'].find((r) => r.n === '远臂');
      ok(rangeRow && /攻击范围 \+0\.09/.test(rangeRow.s), '池子里写的是缩放后的 +0.09 格', rangeRow && rangeRow.s);
      const critRow = pool['box-gold'].find((r) => r.n === '锋线');
      ok(critRow && /剑暴击率 \+0\.04/.test(critRow.s), '金匣剑暴击率 +0.04', critRow && critRow.s);
      const pcts = await ev(`JSON.stringify([...document.querySelectorAll('#boxPoolRoot .ac-sec[data-sec="box-gold"] .ac-pl-p')].map(e => parseFloat(e.textContent)))`);
      const sum = JSON.parse(pcts).reduce((a, b) => a + b, 0);
      ok(Math.abs(sum - 100) < 0.6, '金匣奖池合计仍是 100%', sum.toFixed(2) + '%');
      // 截图：滚到金匣那一组，等选完火种留下的 toast 散掉
      await ev(`document.querySelector('#boxPoolRoot .ac-sec[data-sec="box-gold"]').scrollIntoView({ block: 'start' }), 1`);
      await sleep(1200);
      await shot('box-pool-105.png');
      await ev('__game.camp.hide ? __game.camp.hide() : 1');
    }

    ok(jsErrors.length === 0, '整个过程没有 JS 异常', jsErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('崩溃: ' + e.message);
    console.log('\n✗ 崩溃: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) console.log('失败项：\n - ' + fails.join('\n - '));
  console.log('截图目录：' + OUT);
  process.exit(fail ? 1 : 0);
})();
