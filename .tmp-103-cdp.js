// 第 103 块 CDP 回归：兑换之后「已兑换」列表要立刻显示刚兑的那条
//
// 用户 bug：「兑换之后下面的兑换记录没有显示，（建群大典）」
// 复现结论（.tmp-103-diag.js）：老代码 sort 升序 + slice(0, 8) = 只画**最早**的 8 个，
// 玩家已兑满 8 个之后新兑的永远进不了列表。
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，后台），再 `node .tmp-103-cdp.js`
// 硬要求：一次只跑这一套；--num-raster-threads=2；跑完杀干净 Chrome。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9344;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-103');
const KEY = 'naiwa_rouge_profile_v1';
// ⚠️ 明文码不写进本文件（.tmp-* 是被 git 跟踪的）：从 gitignore 的 gift-codes.local.md 读，
//    照 .tmp-101-cdp.js 的做法。没有这个文件（换了台机器）就直说跑不了，别猜。
const LOCAL_MD = path.join(__dirname, 'gift-codes.local.md');
const LOCAL_TXT = fs.existsSync(LOCAL_MD) ? fs.readFileSync(LOCAL_MD, 'utf8') : '';
const CODE = (LOCAL_TXT.match(/\|\s*\d+\s*\|\s*`([A-Z][A-Z0-9-]{6,})`\s*\|\s*888\s*\|/) || [, ''])[1];
// 码表里现成的哈希（A 类 300）—— 拿它们当「以前兑过的记录」，这样 giftByHash 能查出组名
const OLD = ['440f992b263512b7', 'cb1f955cfe39c2dc', 'd9a249fe405cd87e', '43b38aeb4c9b8017',
  '074589ed80960a09', '425ab4a5e0690891', '4895e77e6c298cfe', 'ef1f9557361cae3b',
  '595828d49d02a524', '0c3dc35f33ecca33', '4b6ba947451b49eb', '3f76c707021da5cb',
  'ff47db66192f9a76', '2e092dbae057dca2', '97aefece7282e2ce', 'daf996f081366158',
  'af7fe1a25618d99a', '1071ed7b0f1da007', '93d7a5eee8bacc8e', '0de37957341c265b'];

let pass = 0, fail = 0;
const fails = [];
// ⚠️ 本套签名是 ok(name, cond, extra)。别的老套件里有 ok(cond, name) 的写法，别串味。
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  if (!CODE) { console.error('gift-codes.local.md 里没读到 888 那枚码，没法跑（换了台机器就先补这个文件）'); process.exit(2); }
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2',
    '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--user-data-dir=' + UD,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await httpJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, 'PUT');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    function send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 还没就绪 */ }
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }
    async function readLog() {
      return await ev(`(() => {
        const box = document.getElementById('giftLog');
        if (!box) return { missing: true };
        const rows = [...box.querySelectorAll('.gf-row')].map((r) => ({
          tier: r.querySelector('.gf-tier').textContent,
          when: r.querySelector('.gf-when').textContent,
          w: Math.round(r.getBoundingClientRect().width),
          h: Math.round(r.getBoundingClientRect().height),
          vis: getComputedStyle(r).visibility,
        }));
        return {
          cls: box.className,
          display: getComputedStyle(box).display,
          head: box.querySelector('h4') ? box.querySelector('h4').textContent : '',
          rows,
          text: box.innerText.replace(/\\n/g, ' | '),
          vw: innerWidth,
        };
      })()`);
    }
    // 预置 n 条「很早以前兑的」记录；order='shuffle' 时把时间戳打乱，验证排序真按 at 走
    async function seed(n, mode) {
      return await ev(`(() => {
        const KEY = ${JSON.stringify(KEY)};
        const OLD = ${JSON.stringify(OLD)}.slice(0, ${n});
        const p = JSON.parse(localStorage.getItem(KEY) || '{}');
        const now = Date.now();
        p.gifts = {};
        OLD.forEach((h, i) => {
          // 每条间隔 100 秒，全部早于「现在」
          const at = now - (${n} - i) * 100000;
          p.gifts[h] = at;
        });
        if ('${mode}' === 'shuffle') {
          // 键插入顺序打乱（值不变）—— 排序必须只看时间戳
          const keys = Object.keys(p.gifts).reverse();
          const g = {};
          for (const k of keys) g[k] = p.gifts[k];
          p.gifts = g;
        }
        localStorage.setItem(KEY, JSON.stringify(p));
        return Object.keys(p.gifts).length;
      })()`);
    }
    async function fresh() {
      await send('Page.navigate', { url: PAGE + '&_r=' + Math.random().toString(36).slice(2) });
      await sleep(1000);
      await waitFor('!!window.__game', 90000, '__game 就绪');
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

    // ---------- A. 全新档：首兑就该有一行 ----------
    console.log('\n[A] 全新档（0 条）→ 兑建群大典');
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await ev('localStorage.clear()');
    await fresh();
    await ev('window.__game.gift.open()');
    await sleep(500);
    const before = await readLog();
    ok('兑换前列表是收起的', before.cls.indexOf('on') < 0 && before.display === 'none', before.cls + '/' + before.display);
    ok('兑换前行数为 0', before.rows.length === 0, String(before.rows.length));
    await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(500);
    const a = await readLog();
    ok('兑换后列表展开了', a.display === 'flex', a.display);
    ok('兑换后有 1 行', a.rows.length === 1, String(a.rows.length));
    ok('这一行写着「建群大典 · +888 骨币」', a.rows[0] && a.rows[0].tier === '建群大典 · +888 骨币', a.rows[0] && a.rows[0].tier);
    ok('标题是「本机已兑换 1 个礼包」', a.head === '本机已兑换 1 个礼包', a.head);
    ok('1 条时不出现「显示最近」的说明', !/显示最近/.test(a.head), a.head);
    ok('这一行有实际尺寸', a.rows[0].w > 100 && a.rows[0].h > 10, a.rows[0] && `${a.rows[0].w}×${a.rows[0].h}`);
    ok('这一行不横向溢出', a.rows[0].w <= a.vw, `${a.rows[0].w} / ${a.vw}`);
    ok('这一行没被 visibility 藏掉', a.rows[0].vis === 'visible', a.rows[0].vis);

    // ---------- B. 老 bug 的正现场：本机已有 8 条，再兑第 9 个 ----------
    console.log('\n[B] 本机已有 8 条 → 兑第 9 个（用户报的就是这一档）');
    await seed(8);
    await fresh();
    await ev('window.__game.gift.open()');
    await sleep(500);
    const b0 = await readLog();
    ok('兑换前就能看到 8 行老记录', b0.rows.length === 8, String(b0.rows.length));
    ok('兑换前标题是「本机已兑换 8 个礼包」', b0.head === '本机已兑换 8 个礼包', b0.head);
    await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(500);
    const b1 = await readLog();
    ok('兑换后行数仍是 8（上限没变）', b1.rows.length === 8, String(b1.rows.length));
    ok('第一行变成了刚兑的「建群大典」', b1.rows[0] && b1.rows[0].tier === '建群大典 · +888 骨币', b1.rows[0] && b1.rows[0].tier);
    ok('列表里真的出现「建群大典」四个字', /建群大典/.test(b1.text), b1.text.slice(0, 80));
    ok('标题报总数 9', /本机已兑换 9 个礼包/.test(b1.head), b1.head);
    ok('标题补了「显示最近 8 个」', /显示最近 8 个/.test(b1.head), b1.head);
    ok('列表里只剩一条建群大典（没有重复）', (b1.text.match(/建群大典/g) || []).length === 1,
      String((b1.text.match(/建群大典/g) || []).length));
    ok('被挤掉的是最早那条（A 类仍占 7 行）', b1.rows.filter((r) => /A 类/.test(r.tier)).length === 7,
      String(b1.rows.filter((r) => /A 类/.test(r.tier)).length));
    ok('第一行的时间就是刚才（含今天日期）', /^\d{4}\/\d{1,2}\/\d{1,2}/.test(b1.rows[0].when), b1.rows[0].when);

    // 时间倒序：第一行的「when」不该比最后一行更早
    const times = b1.rows.map((r) => new Date(r.when.replace(/\//g, '-')).getTime());
    ok('可见行从新到旧排列', times.every((v, i, arr) => i === 0 || arr[i - 1] >= v), JSON.stringify(b1.rows.map((r) => r.when)));

    // ---------- C. 记录多到 20 条，也一样 ----------
    console.log('\n[C] 本机已有 20 条 → 兑第 21 个');
    await seed(20, 'shuffle');
    await fresh();
    await ev('window.__game.gift.open()');
    await sleep(500);
    const c0 = await readLog();
    ok('20 条时只画 8 行', c0.rows.length === 8, String(c0.rows.length));
    ok('20 条时标题报 20 并说明「显示最近 8 个」',
      /本机已兑换 20 个礼包/.test(c0.head) && /显示最近 8 个/.test(c0.head), c0.head);
    await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(500);
    const c1 = await readLog();
    ok('第 21 个兑换后第一行仍是建群大典', c1.rows[0] && c1.rows[0].tier === '建群大典 · +888 骨币', c1.rows[0] && c1.rows[0].tier);
    ok('标题报总数 21', /本机已兑换 21 个礼包/.test(c1.head), c1.head);

    // ---------- D. 已兑过的码再兑一次：拦下、列表不新增 ----------
    console.log('\n[D] 同一个码再兑一次');
    const msg = await ev(`window.__game.gift.redeem(${JSON.stringify(CODE)})`);
    await sleep(400);
    ok('提示「本机已经用过了」', /用过了/.test(String(msg)), String(msg));
    const d = await readLog();
    ok('列表行数没变（还是 8）', d.rows.length === 8, String(d.rows.length));
    ok('列表里仍然只有一条建群大典', (d.text.match(/建群大典/g) || []).length === 1,
      String((d.text.match(/建群大典/g) || []).length));

    // ---------- E. 刷新之后记录还在，且顺序不乱 ----------
    console.log('\n[E] 刷新后');
    await fresh();
    await ev('window.__game.gift.open()');
    await sleep(500);
    const e1 = await readLog();
    ok('刷新后第一行还是建群大典', e1.rows[0] && e1.rows[0].tier === '建群大典 · +888 骨币', e1.rows[0] && e1.rows[0].tier);
    ok('刷新后标题还是 21', /本机已兑换 21 个礼包/.test(e1.head), e1.head);
    const logCount = Object.keys(await ev('window.__game.gift.log()')).length;
    ok('档案里确实是 21 条', logCount === 21, String(logCount));

    console.log('\n-------------------------------');
    console.log(`通过 ${pass} / 失败 ${fail}`);
    if (fail) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1; }
  } finally {
    if (ws) try { ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
