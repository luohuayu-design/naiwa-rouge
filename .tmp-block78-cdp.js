// ============================================================
// 第 78 块 CDP：存档导出 / 导入（真点按钮、真下载、真粘码、真重载）
//   A 设置页里四个按钮都在、都看得见
//   B 「导出文件」真的落到磁盘上，内容对不对（该有的有、不该导的没有）
//   C 「复制存档码」产出的码没有空白（能塞进微信）
//   D 「粘贴存档码」端到端：粘折过行的码 → 确认弹窗数字对 → 重载后进度真的变了
//     且**本机的设备设置没被别人的存档搬走**
//   E 坏码在输入框里直接报错、弹窗不关（不让人白跑一趟）
//   F 「导入文件」能把 B 那个文件读回来
//   G 全程 0 JS 报错
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block78-cdp.js`
// ⚠️ 一次只跑一套；套间跑 node .tmp-cdp-clean.js
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9478;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-78-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block78-dl-' + process.pid);
const BASE = 'http://127.0.0.1:8124';
const URL = BASE + '/index.html?debug=1&title';
// 版本号从 index.html 读，别写死（记忆里的铁律：写死会加载出两份模块实例）
const V = (fs.readFileSync('index.html', 'utf8').match(/\?v=(\d+)/) || [])[1];

// DBG=1 时给每个新文档注入写入钩子，抓「谁把档案写成 0」
const DBG = !!process.env.DBG;
const NL = String.fromCharCode(10);
const WRITE_HOOK = '(function () {'
  + 'window.__w = [];'
  + 'try {'
  + '  var orig = Storage.prototype.setItem;'
  + '  Storage.prototype.setItem = function (k, v) {'
  + '    if (k === "naiwa_rouge_profile_v1") {'
  + '      var bones = "?";'
  + '      try { bones = JSON.parse(v).bones; } catch (e) {}'
  + '      window.__w.push({ bones: bones, at: Math.round(performance.now()),'
  + '        st: (new Error()).stack.split(String.fromCharCode(10)).slice(1, 6).join(" | ") });'
  + '    }'
  + '    return orig.call(this, k, v);'
  + '  };'
  + '} catch (e) {}'
  + '})();';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 本机档案：骨币设成一个好认的数，等下确认「导入盖掉了」
const LOCAL_PROFILE = {
  v: 1,
  settings: { sfx: 0.8, music: 0.55, quality: 'high', joySize: 'large', joyHand: 'left', shake: true, speedFov: true },
  stats: { runs: 1, wins: 0, kills: 3, seconds: 60, coins: 10, dmgTaken: 5, cards: {}, lanternReveal: 0 },
  codex: { enemies: { minion: 3 }, cards: {}, swords: {}, relics: {}, events: {} },
  ach: {}, bones: 11, camp: {}, boons: {}, boonPending: 0,
  story: { seen: {}, read: {}, marks: {}, ending: '' },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=430,900', 'about:blank',
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
        const d = m.params.exceptionDetails;
        jsErrors.push((d.exception && d.exception.description) || d.text || '');
      }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (ex) => {
      const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (((r.exceptionDetails.exception || {}).description) || '').split('\n')[0]);
      return r.result.value;
    };
    const waitFor = async (ex, ms, label) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await ev(ex)) return true; } catch (_) { /* 导航中上下文会短暂消失 */ } await sleep(150); }
      throw new Error('等待超时: ' + (label || ex));
    };
    const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return false; e.click(); return true; })()`);
    const toast = () => ev(`(() => { const t = document.getElementById('waveToast');
      if (!t || !t.classList.contains('on')) return '';
      return document.getElementById('wtTitle').textContent + ' | ' + document.getElementById('wtSub').textContent; })()`);
    const vis = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return 'missing';
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return 'hidden';
      return e.getClientRects().length > 0 ? 'visible' : 'norect'; })()`);
    // 公告（46）/ 签到（46）/ 宣传（47）这几层比任何弹窗都高，还默认自动弹。
    // 不关掉的话 .click() 这种合成点击会绕过命中测试、照样生效，
    // 但真人点下去会被它们吃掉 —— 后面的层级检查也就测不出真东西。
    // 公告关掉后 350ms 还会接着弹「签到」→「宣传有礼」（main.js 的 afterNoticeChain），
    // 所以点两轮。
    const closeOverlays = async () => {
      for (let round = 0; round < 2; round++) {
        for (const id of ['noticeX', 'signX', 'promoX']) {
          const r = await ev(`(() => { const b = document.getElementById(${JSON.stringify(id)});
            if (!b) return '';
            const r = b.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) { b.click(); return ${JSON.stringify(id)}; }
            return ''; })()`);
          if (r) console.log('  .. 关掉了自动弹出的 ' + r);
        }
        await sleep(450);
      }
    };

    // ⚠️ Page.reload 是异步的：不等导航真的开始，waitFor('!!window.__game')
    // 会在**旧文档**上立刻为真 —— 接着的任何操作都作用在旧的内存缓存上，
    // 一 save 就把刚塞进去的档案写回默认值（第 78 块踩过，表现为「骨币莫名变 0」）。
    // 先打一个窗口标记，等它被新文档冲掉，才算真的重载了。
    const hardReload = async () => {
      await ev('window.__bootMark = 1');
      await send('Page.reload', {});
      await waitFor('typeof window.__bootMark === "undefined"', 30000, '重载已开始');
      await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
      await sleep(700);
      await closeOverlays();
    };

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('DOM.enable', {});
    if (DBG) await send('Page.addScriptToEvaluateOnNewDocument', { source: WRITE_HOOK });
    // 下载落到我们指定的目录（headless 默认不落盘）
    for (const m of ['Browser.setDownloadBehavior', 'Page.setDownloadBehavior']) {
      try { await send(m, { behavior: 'allow', downloadPath: OUT, eventsEnabled: true }); } catch (_) { /* 版本差异，忽略 */ }
    }
    try {
      await send('Browser.grantPermissions', {
        origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      });
    } catch (_) { /* 授予不了就走兜底 */ }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await ev(`localStorage.setItem('naiwa_rouge_profile_v1', ${JSON.stringify(JSON.stringify(LOCAL_PROFILE))})`);
    await ev("localStorage.setItem('naiwa_rouge_runs_v1', JSON.stringify([{id:'r1'}]))");
    // 故意塞两个「不该跟着存档走」的键
    await ev("localStorage.setItem('naiwa_rouge_audio_v1', JSON.stringify({sfx:0.2}))");
    await ev("localStorage.setItem('naiwa_rouge_admin_v1', JSON.stringify({on:true}))");
    await hardReload();

    // ============================================================
    console.log('\n— A 设置页：四个按钮都在，而且真的看得见 —');
    // ============================================================
    await ev('__game.ui.showSettings()');
    await sleep(350);
    ok(await ev("document.getElementById('setScr').classList.contains('on')"), '设置页打开了');
    for (const [sel, name] of [
      ['#ioExportFile', '导出文件'], ['#ioExportCode', '复制存档码'],
      ['#ioImportFile', '导入文件'], ['#ioImportCode', '粘贴存档码'],
    ]) {
      ok((await vis(sel)) === 'visible', `#${sel.slice(1)}（${name}）可见`);
    }
    ok((await vis('.set-io-tip')) === 'visible', '存档备份那段说明文字可见');
    ok(await ev("document.getElementById('ioFileInput').type === 'file'"), '文件选择框是 type=file');

    // ============================================================
    console.log('\n— B 导出文件：真的落盘，内容对不对 —');
    // ============================================================
    console.log('  .. 诊断：localStorage bones = ' + await ev("(JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1')||'{}')).bones")
      + ' · 内存 bones = ' + await ev('__game.ui.bones()')
      + ' · admin = ' + await ev('JSON.stringify(localStorage.getItem("naiwa_rouge_admin_v1"))'));
    if (DBG) {
      const w = JSON.parse(await ev('JSON.stringify(window.__w || [])'));
      console.log('  .. 写入记录 ' + w.length + ' 条：');
      for (const x of w) console.log('     bones=' + x.bones + ' @' + x.at + 'ms  ' + x.st);
    }
    ok(await click('#ioExportFile'), '点了「导出文件」');
    let dlFile = '';
    for (let i = 0; i < 60; i++) {
      const fs2 = fs.readdirSync(OUT).filter((f) => f.endsWith('.json'));
      if (fs2.length) { dlFile = path.join(OUT, fs2[0]); break; }
      await sleep(200);
    }
    ok(!!dlFile, '磁盘上出现了导出的文件', fs.readdirSync(OUT).join(',') || '(空目录)');
    if (dlFile) {
      ok(/^蛙步夜行-存档-\d{8}-\d{4}\.json$/.test(path.basename(dlFile)), `文件名带日期时间（${path.basename(dlFile)}）`);
      const raw = fs.readFileSync(dlFile, 'utf8');
      ok(/\n/.test(raw) && /\n {2}"/.test(raw), '文件是缩进过的 JSON（人能直接看/改）');
      const p = JSON.parse(raw);
      ok(p.app === 'naiwa-rouge' && p.kind === 'save', `文件头是《蛙步·夜行》存档（app=${p.app}）`);
      ok(p.ver === 1, `格式号 ${p.ver}`);
      ok(typeof p.at === 'string' && /\d{4}-\d{2}-\d{2}T/.test(p.at), `带导出时间 ${p.at}`);
      ok(!!p.data && typeof p.data === 'object', '有 data 块');
      const keys = Object.keys(p.data);
      for (const k of ['naiwa_rouge_profile_v1', 'naiwa_rouge_runs_v1']) ok(keys.includes(k), `带上了 ${k}`);
      ok(!keys.includes('naiwa_rouge_audio_v1'), '没带上音量（换设备该重调）');
      ok(!keys.includes('naiwa_rouge_admin_v1'), '没带上管理员标记');
      const pf = JSON.parse(p.data.naiwa_rouge_profile_v1);
      ok(!('settings' in pf), '进度里的设备设置被剥掉了');
      ok(pf.bones === 11, `带了骨币（${pf.bones}）`);
      ok(pf.settings === undefined && pf.stats && pf.codex, '进度数据本身是完整的');
    }
    const tB = await toast();
    ok(/存档已导出/.test(tB), `导出后给了提示（${tB}）`);

    // ============================================================
    console.log('\n— C 复制存档码：一串没有空白的文本 —');
    // ============================================================
    await click('#ioExportCode');
    await sleep(500);
    let tC = await toast();
    ok(/存档码已复制|复制失败/.test(tC), `点了复制有反馈（${tC}）`);
    let code = '';
    try { code = await ev('navigator.clipboard.readText()'); } catch (_) { code = ''; }
    if (!code || !/^NWSAVE1:/.test(code)) {
      // 无头环境剪贴板读不回来就自己按同一份数据生成一份（逻辑完全一样）
      console.log('  .. 剪贴板读不回来，改用页内同一份数据生成的码继续后面的检查');
      code = await ev(`(async () => { const io = await import('./js/saveIO.js?v=${V}');
        return io.payloadCode(io.snapshot()); })()`);
    } else {
      ok(true, '剪贴板里读回来的就是存档码');
    }
    ok(/^NWSAVE1:/.test(code), `码以 NWSAVE1: 开头（长 ${code.length}）`);
    ok(!/\s/.test(code), '码里没有任何空白（塞进微信不会被截断）');

    // ============================================================
    console.log('\n— D 粘贴存档码导入：端到端，重载后进度真的变了 —');
    // ============================================================
    // 先把本机换成另一份进度（骨币 11 → 要变成码里那份 555）
    await ev(`(() => {
      const P = ${JSON.stringify(LOCAL_PROFILE)};
      P.bones = 11;
      P.settings.joySize = 'large';      // 本机摇杆：大。导入后必须还是「大」
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(P));
      return 1;
    })()`);
    await hardReload();
    // 现在造一份「外来存档」：骨币 555、摇杆 small —— 用页内模块直接生成码
    const foreignCode = await ev(`(async () => {
      const io = await import('./js/saveIO.js?v=${V}');
      const P = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1'));
      P.bones = 555; P.camp = { atk: 2, hp: 1 };
      P.settings.joySize = 'small';      // 别人手机的摇杆尺寸，不该搬过来
      P.settings.sfx = 0.05;
      const keep = localStorage.getItem('naiwa_rouge_profile_v1');
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(P));
      const snap = io.snapshot();
      localStorage.setItem('naiwa_rouge_profile_v1', keep);   // 本机进度放回去
      return io.payloadCode(snap);
    })()`);
    ok(/^NWSAVE1:/.test(foreignCode), '备好一份外来存档码');

    await ev('__game.ui.showSettings()');
    await sleep(300);
    ok(await click('#ioImportCode'), '点了「粘贴存档码」');
    await sleep(350);
    ok(await ev("document.getElementById('saveCodeAsk').classList.contains('on')"), '粘贴弹窗打开了');
    // 第 70 块踩过的坑：设置页是 .tt-sub-scr（21），弹窗层级不够就会被盖住。
    // 公告那几层（46/47）比任何弹窗都高，而且是「进主界面后延迟弹出」的，
    // 可能刚好在这一刻冒出来 —— 先再关一遍，再量层级。
    await closeOverlays();
    const hit = await ev(`(() => {
      const card = document.querySelector('#saveCodeAsk .md-card');
      const r = card.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + 12;
      const stack = document.elementsFromPoint(cx, cy).slice(0, 4)
        .map((e) => e.id ? '#' + e.id : (e.className ? '.' + String(e.className).split(' ')[0] : e.tagName));
      const el = document.elementFromPoint(cx, cy);
      return (el && el.closest('#saveCodeAsk') ? 'inside' : 'covered') + ' | ' + stack.join(' > ');
    })()`);
    ok(hit.startsWith('inside'), `弹窗盖在设置页上面（命中最上层：${hit}）`);

    // 粘进去的码故意折行 + 带空格，模拟微信转发
    await ev(`(() => {
      const ta = document.getElementById('saveCodeInput');
      ta.value = ${JSON.stringify(foreignCode.replace(/(.{48})/g, '$1\n ').replace(/^/, '\n  '))};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    ok(await click('#saveCodeYes'), '点了「下一步」');
    await sleep(500);
    ok(await ev("document.getElementById('confirmAsk').classList.contains('on')"), '确认弹窗弹出来了（导入前要让人看清）');
    const caSub = await ev("document.getElementById('caSub').textContent");
    ok(/555/.test(caSub), `确认弹窗里写着外来存档的骨币数（${caSub.replace(/\n/g, ' / ')}）`);
    ok(/骨币/.test(caSub) && /篝火/.test(caSub) && /本机现在是/.test(caSub), '确认弹窗同时给了「外来」和「本机」两组数字');
    ok(/不能撤/.test(caSub), '确认弹窗说明了盖掉不能撤回');
    ok(!(await ev("document.getElementById('saveCodeAsk').classList.contains('on')")), '确认弹窗出现时粘贴框已经关了');

    await ev('window.__bootMark = 1');
    ok(await click('#caOk'), '点了「导入」');
    // 导入完 main.js 自己会 location.reload()（延迟 800ms）：同样等标记被冲掉
    await waitFor('typeof window.__bootMark === "undefined"', 30000, '导入后的刷新已开始');
    await waitFor('!!window.__game', 90000, '导入后重载完成');
    await sleep(700);
    await closeOverlays();

    const after = JSON.parse(await ev("localStorage.getItem('naiwa_rouge_profile_v1')"));
    ok(after.bones === 555, `进度真的被盖掉了（骨币 11 → ${after.bones}）`);
    ok(Object.keys(after.camp || {}).length === 2, `篝火等级跟着来了（${Object.keys(after.camp).join(',')}）`);
    ok(after.settings && after.settings.joySize === 'large', `摇杆大小保留本机的 large（没被搬成 ${after.settings && after.settings.joySize}）`);
    ok(after.settings && Math.abs(after.settings.sfx - 0.8) < 1e-6, `音量保留本机的 0.8（没被搬成 ${after.settings && after.settings.sfx}）`);
    ok(after.stats && after.stats.runs === 1, '统计块完整带过来了');
    const audioAfter = JSON.parse(await ev("localStorage.getItem('naiwa_rouge_audio_v1') || 'null'"));
    ok(audioAfter && Math.abs(audioAfter.sfx - 0.2) < 1e-6, '音量独立键没被导入覆盖');
    const adminAfter = JSON.parse(await ev("localStorage.getItem('naiwa_rouge_admin_v1') || 'null'"));
    ok(adminAfter && adminAfter.on === true, '管理员标记没被导入覆盖');

    // ============================================================
    console.log('\n— E 坏码：在输入框里直接报错，不白跑一趟 —');
    // ============================================================
    await ev('__game.ui.showSettings()');
    await sleep(300);
    await click('#ioImportCode');
    await sleep(300);
    await ev(`(() => { const ta = document.getElementById('saveCodeInput');
      ta.value = 'NWSAVE1:abcdefghijklmn'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await click('#saveCodeYes');
    await sleep(450);
    const errTxt = await ev("document.getElementById('saveCodeErr').textContent");
    ok(await ev("document.getElementById('saveCodeErr').classList.contains('on')"), '坏码时红字提示亮起来了');
    ok(errTxt.length > 3, `提示有具体原因（${errTxt}）`);
    ok(await ev("document.getElementById('saveCodeAsk').classList.contains('on')"), '弹窗没关（让人直接改，不用从头点）');
    ok(!(await ev("document.getElementById('confirmAsk').classList.contains('on')")), '没进到确认那一步（坏数据不往下走）');
    // 空内容也要拦
    await ev("document.getElementById('saveCodeInput').value = ''");
    await click('#saveCodeYes');
    await sleep(300);
    ok(/空/.test(await ev("document.getElementById('saveCodeErr').textContent")), '空内容报「存档码是空的」');
    await click('#saveCodeNo');
    await sleep(300);
    ok(!(await ev("document.getElementById('saveCodeAsk').classList.contains('on')")), '点取消能关掉弹窗');

    // ============================================================
    console.log('\n— F 导入文件：把 B 那个文件读回来 —');
    // ============================================================
    if (dlFile) {
      const { root } = await send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#ioFileInput' });
      ok(!!nodeId, '找到 #ioFileInput 节点');
      await send('DOM.setFileInputFiles', { files: [dlFile], nodeId });
      await ev("document.getElementById('ioFileInput').dispatchEvent(new Event('change', { bubbles: true }))");
      await sleep(700);
      ok(await ev("document.getElementById('confirmAsk').classList.contains('on')"), '选完文件直接弹确认弹窗');
      const subF = await ev("document.getElementById('caSub').textContent");
      ok(/11/.test(subF) && /骨币/.test(subF), `文件里的骨币数读对了（${subF.split('\n')[0]}）`);
      await click('#caCancel');
      await sleep(300);
      ok(!(await ev("document.getElementById('confirmAsk').classList.contains('on')")), '点取消不导入');
      const unchanged = JSON.parse(await ev("localStorage.getItem('naiwa_rouge_profile_v1')"));
      ok(unchanged.bones === 555, '取消后本机进度一点没动');
    } else {
      ok(false, 'F 段没有可用的导出文件');
    }

    // ============================================================
    console.log('\n— G 全程 0 JS 报错 —');
    // ============================================================
    ok(jsErrors.length === 0, `没有 JS 报错（${jsErrors.length} 条）`, jsErrors.slice(0, 2).join(' | '));

    console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
    if (fails.length) console.log('\n失败项：\n  ' + fails.join('\n  '));
  } catch (err) {
    console.error('\nFAIL', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
