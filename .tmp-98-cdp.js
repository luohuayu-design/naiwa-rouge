// 第 98 块 · CDP 冒烟（真实面板，走 UI 链路）
//   ① 管理员模式二里填最终值 → 面板显示的就是填的值
//   ② 同一条属性的「基础 X」仍然是代码里的原值（第 98 块用户的核心诉求）
//   ③ 切回普通态，最终值与基础值的关系不变（不会每渲染一次漂一点）
//   ④ 关掉管理员模式（退出沙盒 reloadFromStorage）→ 改动还在（落盘到了本机存档）
//   ⑤ 老存档里的 statBases 被清掉，不再影响「基础」
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-98-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9396;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-98');
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
    '--window-size=430,932', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
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
      }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable'); await send('Page.enable');
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

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(600);
    for (const sel of ['#noticeX', '#signX', '#promoX']) {
      await ev(`(() => { const x = document.querySelector('${sel}'); if (x) x.click(); return 1; })()`);
      await sleep(450);
    }

    // 第 95 块的老存档：statBases 里有被放大的 base，必须被丢弃
    await ev(`(() => {
      const k = 'naiwa_rouge_profile_v1';
      const cur = JSON.parse(localStorage.getItem(k) || '{}');
      cur.statBases = { maxHp: 88, attack: 63.6667 };
      localStorage.setItem(k, JSON.stringify(cur));
      return 1;
    })()`);
    await send('Page.reload', { ignoreCache: true });
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    await sleep(700);
    for (const sel of ['#noticeX', '#signX', '#promoX']) {
      await ev(`(() => { const x = document.querySelector('${sel}'); if (x) x.click(); return 1; })()`);
      await sleep(450);
    }

    console.log('\n—— ① 老存档 statBases 被清掉 ——');
    ok(!('statBases' in (await ev(`JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}')`))),
      '页面加载后磁盘上的 statBases 已经没了');

    console.log('\n—— ② 打开属性页 + 管理员模式二 ——');
    await ev(`__game.setAdmin(true)`);
    await sleep(300);
    ok(await ev(`__game.admin`) === true, '管理员模式一已开');
    await ev(`document.getElementById('btnStats').click()`);
    await waitFor(`document.querySelectorAll('#statRows .st-row').length > 0`, 12000, '属性页渲染出属性行');
    await sleep(400);
    ok(await ev(`document.getElementById('stAdminBar').hidden`) === false,
      '管理员模式二那一栏出现了（共用密码）');

    // 真实基础值从 STAT_DEFS 拿不到？用面板上的「基础 X」反读
    const readRow = (key) => `(() => {
      const inp = [...document.querySelectorAll('#statRows .st-input')].find((i) => i.dataset.key === '${key}');
      if (inp) {
        const row = inp.closest('.st-row');
        const base = row.querySelector('.st-base');
        return { mode: 'edit', value: Number(inp.value), baseText: base ? base.textContent.trim() : '' };
      }
      return null;
    })()`;

    // 先进编辑态
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(400);
    ok(await ev(`document.querySelectorAll('#statRows .st-input').length > 0`), '进入编辑态，每行都变成输入框');

    const originBase = await ev(`(() => {
      const inp = [...document.querySelectorAll('#statRows .st-input')].find((i) => i.dataset.key === 'maxHp');
      const base = inp.closest('.st-row').querySelector('.st-base');
      return base ? base.textContent.trim() : '';
    })()`);
    ok(/基础\s*\d/.test(originBase), `编辑态标出了基础值（${originBase}）`);

    console.log('\n—— ③ 填最终值 100 ——');
    await ev(`(() => {
      const inp = [...document.querySelectorAll('#statRows .st-input')].find((i) => i.dataset.key === 'maxHp');
      inp.value = '100';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    })()`);
    await sleep(500);
    const afterEdit = await ev(readRow('maxHp'));
    ok(afterEdit && afterEdit.value === 100, `输入框回读 100（实际 ${afterEdit && afterEdit.value}）`);
    ok(afterEdit && afterEdit.baseText === originBase,
      `★ 基础值一个字节没变（${afterEdit && afterEdit.baseText}，改之前是 ${originBase}）`);

    console.log('\n—— ④ 切回普通态 ——');
    await ev(`document.getElementById('stAdminToggle').click()`);
    await sleep(500);
    const plain = await ev(`(() => {
      const rows = [...document.querySelectorAll('#statRows .st-row')];
      const row = rows.find((r) => {
        const b = r.querySelector('.st-base');
        return b && /基础/.test(b.textContent);
      });
      // 找「生命上限」那一行：按顺序读第 1 组第 1 行最容易错，改成读所有带「已改」标记的
      const edited = rows.filter((r) => r.classList.contains('st-edited')).map((r) => ({
        name: r.querySelector('.st-name').textContent.trim(),
        val: r.querySelector('.st-val') ? r.querySelector('.st-val').textContent.trim() : '',
        base: r.querySelector('.st-base') ? r.querySelector('.st-base').textContent.trim() : '',
        flag: r.querySelector('.st-flag') ? r.querySelector('.st-flag').textContent.trim() : '',
      }));
      return { edited, total: rows.length };
    })()`);
    ok(plain && plain.edited.length === 1, `只有一条被标记「已改」（${plain && plain.edited.length}）`,
      JSON.stringify(plain && plain.edited));
    const row0 = plain && plain.edited[0];
    ok(!!row0 && Math.abs(Number(row0.val) - 100) < 1e-9, `普通态显示 100（实际 ${row0 && row0.val}）`);
    ok(!!row0 && row0.base === `（基础 ${originBase.replace(/^基础\s*/, '')}）`,
      `★ 普通态的「基础」仍是原值（${row0 && row0.base}）`);
    ok(!!row0 && row0.flag === '已改', '带「已改」角标');

    console.log('\n—— ⑤ 退出管理员模式（reloadFromStorage）→ 改动还在 ——');
    await ev(`__game.setAdmin(false)`);
    await sleep(600);
    await ev(`document.getElementById('btnStats').click()`);
    await waitFor(`document.querySelectorAll('#statRows .st-row').length > 0`, 12000, '属性页再次渲染');
    await sleep(400);
    const kept = await ev(`(() => {
      const rows = [...document.querySelectorAll('#statRows .st-row')];
      const r = rows.find((x) => x.classList.contains('st-edited'));
      return r ? { val: r.querySelector('.st-val').textContent.trim(),
                   base: r.querySelector('.st-base').textContent.trim() } : null;
    })()`);
    ok(!!kept && Math.abs(Number(kept.val) - 100) < 1e-9, `退出沙盒后最终值仍是 100（${kept && kept.val}）`);
    ok(!!kept && /基础/.test(kept.base) && kept.base.indexOf(originBase.replace(/^基础\s*/, '')) >= 0,
      `退出沙盒后基础仍是原值（${kept && kept.base}）`);

    console.log('\n—— ⑥ 恢复默认 ——');
    await ev(`__game.setAdmin(true)`);
    await sleep(300);
    await ev(`document.getElementById('stAdminReset').click()`);
    await sleep(500);
    const cleared = await ev(`document.querySelectorAll('#statRows .st-edited').length`);
    ok(cleared === 0, `恢复默认后没有「已改」行（${cleared}）`);

    console.log('\n—— 收尾 ——');
    ok(jsErrors.length === 0, '全程没有 JS 异常', jsErrors.slice(0, 2).join(' | '));

    console.log('\n------------------------------');
    if (fail === 0) console.log(`第 98 块 CDP：全绿 ${pass}/${pass + fail}`);
    else {
      console.log(`第 98 块 CDP：${pass} 通过 / ${fail} 失败`);
      for (const f of fails) console.log('  - ' + f);
    }
  } catch (e) {
    console.log('\n✗ 脚本异常：' + (e && e.message ? e.message : e));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* 忽略 */ }
    try { chrome.kill(); } catch (_) { /* 忽略 */ }
  }
  process.exit(fail === 0 ? 0 : 1);
})();
