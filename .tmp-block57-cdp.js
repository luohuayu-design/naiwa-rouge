// 第 57 块 CDP：用户七条的真浏览器验证
//   A boot：加载段标题页彻底藏住（不再从遮罩后面闪出来）+ --app-h 全屏浮层高度
//   B 宣传有礼：公告关掉 → 艺术字特效 → 变标题 → 正文 → 今日不再弹 / 主菜单回看
//   C 图鉴：分块渲染 + 签名缓存 + 标题页空闲预热（events 112 条全渲染）
//   D 世界渲染闸门：菜单期间 renderer 不再出帧（backdrop 模糊不再每帧重算）
//   E UI 修复：sr-alt 字号 / 子面板遮挡 .88 / 公告盒几何 / 公告老行为不回归
// 跑法：先 `python -m http.server 8124 --bind 127.0.0.1`（cwd=naiwa-rouge），再 `node .tmp-block57-cdp.js`
// 注意：?debug=1&title = 调试模式但停在标题页（不带 &title 会直接开局，公告/宣传都不弹）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9365;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-57');
const OUT = path.join(os.tmpdir(), 'naiwa-block57');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

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
    '--disable-dev-shm-usage', '--user-data-dir=' + UD,
    '--window-size=420,860', 'about:blank',
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
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
      console.log('  截图:', name);
    };
    await send('Runtime.enable');
    await send('Page.enable');

    // ============================================================
    console.log('\n[A] boot：加载段标题页藏住 + --app-h');
    // ============================================================
    await send('Page.navigate', { url: URL });
    // 从导航开始密集采样：加载段里标题页必须是 display:none（用户截图：它从遮罩后面闪出来）
    let sawHiddenDuringLoad = 0, sawLoadingOn = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      try {
        const st = await ev(`(() => {
          const l = document.getElementById('loading'), t = document.getElementById('titleScr');
          if (!l || !t) return null;
          return { off: l.classList.contains('off'), td: t.style.display, on: !!window.__game };
        })()`);
        if (st) {
          if (!st.off) { sawLoadingOn++; if (st.td === 'none') sawHiddenDuringLoad++; }
          if (st.on) break;
        }
      } catch (_) { /* 导航中读不到就算了 */ }
      await sleep(120);
    }
    ok(sawLoadingOn >= 2, `加载遮罩期间采到 ${sawLoadingOn} 个样本`, String(sawLoadingOn));
    ok(sawHiddenDuringLoad >= 2, `这些样本里标题页全是 display:none（${sawHiddenDuringLoad} 个）—— 不再从遮罩后面闪`, String(sawHiddenDuringLoad));
    await waitFor('!!window.__game', 90000, '__game 就绪（SwiftShader 较慢）');
    // 常驻突变监听：抓「谁又把 on 加回来了」（B/F 段 ✕ 关不掉曾是 flake）
    await ev(`window.__mut57 = [];
      ['promoOv', 'noticeOv'].forEach((id) => {
        const el = document.getElementById(id);
        new MutationObserver((muts) => {
          muts.forEach(() => window.__mut57.push({ id, cls: el.className, at: Date.now() }));
        }).observe(el, { attributes: true, attributeFilter: ['class'] });
      });`);
    // 标题页淡入是过渡完成的，等它而不是一枪断言（boot 慢的时候会假失败）
    await waitFor("document.getElementById('titleScr').style.display !== 'none' && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页显示且淡入完成');
    ok(true, '加载完标题页显示');
    ok(true, '标题页淡入完成（.off 已摘）');
    const appHpx = await ev('window.__game.render.appHpx()');
    ok(/^\d+px$/.test(appHpx || ''), '--app-h 已写成像素值', String(appHpx));
    ok(await ev(`document.getElementById('loading').getBoundingClientRect().height === Math.round(parseFloat('${appHpx}'))`),
      '加载遮罩高度 = --app-h（盖满可视区）');
    await shot('a_title');

    // ============================================================
    console.log('\n[B] 宣传有礼：公告 → 艺术字 → 公告二');
    // ============================================================
    await ev('window.__game.promo.clear(), window.__game.notice.clear()');
    // 公告自动弹（加载淡完 +700ms）→ 关掉 → 350ms 后宣传有礼接着上
    await waitFor("document.getElementById('noticeOv').classList.contains('on')", 20000, '公告自动弹出');
    ok(true, '进主界面公告先弹（老行为没坏）');
    await ev("document.getElementById('noticeOk').click()");
    // 第 59 块：公告后面先接「每日签到」（今天没签的话），签完才轮到宣传有礼。
    // 这里把签到收掉再等宣传 —— 不是宣传坏了，是链路中间多了一站。
    try {
      await waitFor("document.getElementById('signOv').classList.contains('on')", 4000, '签到先跟上（第 59 块）');
      await ev("document.getElementById('signClose').click()");
    } catch (_) { /* 今天已经签过就不弹，直接等宣传 */ }
    await waitFor("document.getElementById('promoOv').classList.contains('on')", 6000, '宣传有礼自动跟上');
    ok(true, '公告关掉 → 宣传有礼自动弹出（链条通）');
    ok(await ev("document.getElementById('promoOv').classList.contains('art')") === true, '自动弹带艺术字特效');
    const artTxt = await ev("document.getElementById('promoArt').textContent");
    ok(/宣传有礼/.test(artTxt), '艺术字主字是「宣传有礼」', artTxt.trim().slice(0, 30));
    await shot('b_promo_art');
    // 特效 1.5s 后散去，标题/正文跟着淡入（.3s 过渡 + .08s/.14s 延迟，等它走完）
    await waitFor("!document.getElementById('promoOv').classList.contains('art')", 6000, '艺术字散去');
    ok(true, '1.5 秒后艺术字特效消散');
    await waitFor("getComputedStyle(document.querySelector('.promo-hd')).opacity === '1' && getComputedStyle(document.querySelector('.promo-bd')).opacity === '1'", 5000, '标题/正文淡入到不透明');
    ok(true, '标题/正文已亮相');
    const promoBody = await ev("document.getElementById('promoOv').textContent");
    ok(/每推荐一个人，得 100 骨币/.test(promoBody), '写明「每推荐一个人得 100 骨币」');
    ok(/推荐礼包码/.test(promoBody), '推荐得「推荐礼包码」');
    ok(/视频剪辑或实机录屏/.test(promoBody), '写明「视频剪辑或实机录屏」');
    ok(/抖音、快手、小红书、哔哩哔哩等平台，或微信朋友圈、QQ 动态/.test(promoBody), '平台列全');
    ok(/得 300 骨币（宣传礼包码）/.test(promoBody), '发视频得「300 骨币（宣传礼包码）」');
    ok(/每获得一个赞、一条评论、一次收藏，都再得 5 骨币/.test(promoBody), '写明「赞/评论/收藏各 5 骨币」');
    ok(/11 月 30 日联系本人，统一结算/.test(promoBody), '写明结算日期');
    ok(/联系本人/.test(promoBody), '写明「联系本人领取」');
    ok(/3829845261/.test(promoBody) && /luohuayu-design\.github\.io\/naiwa-rouge/.test(promoBody), '带 QQ + 网址');
    ok(await ev("document.getElementById('promoHideToday').checked") === false, '打开时勾选框是空的');
    ok(await ev("getComputedStyle(document.getElementById('promoOv')).zIndex") === '47', '遮罩在公告（46）之上');
    await shot('b_promo_body');
    // 勾「今日不再弹出」→ 关 → 写键 → 当天不再自动弹
    await ev("document.getElementById('promoHideToday').checked = true");
    await ev("document.getElementById('promoOk').click()");
    await sleep(200);
    ok(await ev("document.getElementById('promoOv').classList.contains('on')") === false, '「我知道了」能关掉');
    const pKey = await ev('window.__game.promo.key()');
    ok(/^\d{4}-\d{1,2}-\d{1,2}\|\d+$/.test(pKey || ''), '写下「日期|版本」记录', String(pKey));
    ok(await ev('window.__game.promo.show(false)') === false, '当天不再自动弹');
    ok(await ev('window.__game.promo.show(true, false)') === true, '主菜单强制回看（不播特效）');
    ok(await ev("document.getElementById('promoOv').classList.contains('art')") === false, '强制回看没有艺术字');
    ok(await ev("document.getElementById('promoOv').classList.contains('on')") === true, '强制回看成功');
    await ev("document.getElementById('promoX').click()");
    await sleep(150);
    ok(await ev("document.getElementById('promoOv').classList.contains('on')") === false, '✕ 能关掉',
      'class="' + await ev("document.getElementById('promoOv').className") + '"');
    // 主菜单按钮入口
    await ev("document.getElementById('btnPromo').click()");
    await sleep(150);
    ok(await ev("document.getElementById('promoOv').classList.contains('on')") === true, '主菜单「🎁 宣传有礼」按钮能打开');
    await ev("document.getElementById('promoX').click()");
    await sleep(150);

    // ============================================================
    console.log('\n[C] 图鉴：分块 + 缓存 + 空闲预热');
    // ============================================================
    // 标题页已停留超过 1.2s → 预热应已把默认页签（怪物）缓存好
    const cache0 = await ev('window.__game.codex.cache()');
    ok(cache0 && cache0.hot && /^enemies\|/.test(cache0.sig), '标题页停留后预热生效（怪物页签已缓存）', JSON.stringify(cache0));
    await ev('window.__game.codex.show()');
    await waitFor("document.querySelectorAll('#cxList .cx-item').length >= 13", 10000, '怪物页签 13 条');
    ok(true, '打开图鉴即有 13 条怪物（缓存命中，秒开）');
    ok(await ev("document.querySelectorAll('#cxList img.cx-thumb').length") === 13, '13 张缩略图都在');
    // 切奇遇页签：112 条现场分块建（每帧 24 条）
    await ev("document.querySelector('#cxTabs button[data-tab=\"events\"]').click()");
    await waitFor("document.querySelectorAll('#cxList .cx-item').length >= 112", 15000, '奇遇页签 112 条分块建完');
    ok(true, '奇遇页签 112 条全部渲染（分块不卡死）');
    const cache1 = await ev('window.__game.codex.cache()');
    ok(cache1 && cache1.hot && /^events\|/.test(cache1.sig), '建完顺手写缓存（下次秒开）', JSON.stringify(cache1));
    await shot('c_codex_events');
    // 切回怪物 → 缓存命中（同步就有）
    await ev("document.querySelector('#cxTabs button[data-tab=\"enemies\"]').click()");
    ok(await ev("document.querySelectorAll('#cxList .cx-item').length") === 13, '切回怪物页签即时出（缓存命中）');
    // 关掉再开：整窗克隆
    await ev("document.getElementById('cxBack').click()");
    await sleep(150);
    const tc = Date.now();
    await ev('window.__game.codex.show()');
    const n2 = await ev("document.querySelectorAll('#cxList .cx-item').length");
    ok(n2 === 13 && Date.now() - tc < 800, `重开图鉴 ${Date.now() - tc}ms 内出全 13 条`, `n=${n2}`);
    await ev("document.getElementById('cxBack').click()");
    await sleep(150);

    // ============================================================
    console.log('\n[D] 世界渲染闸门（菜单期间不再出帧）');
    // ============================================================
    const f0 = await ev('window.__game.render.frames()');
    ok(await ev('window.__game.render.live()') === false, '标题页闸门关闭（世界不渲染）');
    await ev('window.__game.beginGame({tutorial:false})');
    await waitFor('window.__game.render.live() === true', 20000, '进游戏后闸门打开');
    const f1 = await ev('window.__game.render.frames()');
    await sleep(600);
    const f2 = await ev('window.__game.render.frames()');
    ok(f2 > f1, `战斗中持续出帧（${f1} → ${f2}）`);
    // 局内真实暂停路径：开背包（bagOpen → inGame=false → 闸门关）。
    // 图鉴/夜行记忆没有局内入口（按钮只在标题页），不拿它造局内场景。
    await ev("document.getElementById('bagBtn').click()");
    await sleep(300);
    ok(await ev('window.__game.render.live()') === false, '背包开着 → 闸门关闭');
    const f3 = await ev('window.__game.render.frames()');
    await sleep(600);
    const f4 = await ev('window.__game.render.frames()');
    ok(f4 === f3, `菜单期间帧数冻住（${f3} → ${f4}）—— backdrop 模糊不再每帧重算`);
    await ev("document.getElementById('bagBtn').click()");
    await sleep(200);
    await waitFor('window.__game.render.live() === true', 20000, '关掉背包闸门恢复');
    const f5 = await ev('window.__game.render.frames()');
    await sleep(500);
    const f6 = await ev('window.__game.render.frames()');
    ok(f6 > f5, `关掉菜单恢复出帧（${f5} → ${f6}）`);

    // ============================================================
    console.log('\n[E] UI 修复抽查');
    // ============================================================
    // E1 夜行记忆「换一种说法」字号
    await ev("document.getElementById('btnStory').click()");
    await waitFor("document.getElementById('storyScr').classList.contains('on')", 8000, '夜行记忆打开');
    await ev("document.querySelectorAll('#stList .st-item')[0].click()");
    await waitFor("document.querySelectorAll('#srBody .sr-alt').length > 0", 8000, '第 1 夜有「换一种说法」');
    const altCss = await ev(`(() => {
      const el = document.querySelector('#srBody .sr-alt');
      const cs = getComputedStyle(el);
      return { fs: cs.fontSize, lh: cs.lineHeight, color: cs.color };
    })()`);
    ok(altCss.fs === '12.5px', '「换一种说法」字号 12.5px（原 10.5px）', JSON.stringify(altCss));
    ok(/rgba\(168,\s*206,\s*190/.test(altCss.color || ''), '颜色提亮', altCss.color);
    await shot('e_sr_alt');
    await ev("document.getElementById('srClose').click()");
    await sleep(150);
    await ev("document.getElementById('stBack').click()");
    await sleep(150);
    // E2 子面板遮挡做厚（老 WebView 没模糊时也盖得住主页面）
    await ev("document.getElementById('btnCodex').click()");
    await waitFor("document.getElementById('codexScr').classList.contains('on')", 8000, '图鉴再打开');
    const subBg = await ev("getComputedStyle(document.getElementById('codexScr')).backgroundColor");
    ok(subBg === 'rgba(3, 9, 8, 0.88)', '子面板遮挡 .88（原来 .62 会透出主菜单）', subBg);
    // E3 面板几何：卡片完整落在视口里（按钮不被切）
    const geo = await ev(`(() => {
      const card = document.querySelector('#codexScr .lv-card');
      const r = card.getBoundingClientRect();
      const back = document.getElementById('cxBack').getBoundingClientRect();
      return { bottom: Math.round(r.bottom), vh: window.innerHeight, backBottom: Math.round(back.bottom), backVisible: back.height > 0 };
    })()`);
    ok(geo.bottom <= geo.vh + 1, `卡片底边在视口内（${geo.bottom} <= ${geo.vh}）`, JSON.stringify(geo));
    ok(geo.backVisible && geo.backBottom <= geo.vh + 1, '「‹ 返回」按钮完整可见', JSON.stringify(geo));
    await shot('e_codex_geo');
    await ev("document.getElementById('cxBack').click()");
    await sleep(150);
    // E4 公告盒几何（用户截图：右下角被切）
    await ev('window.__game.notice.show(true)');
    await sleep(250);
    const nGeo = await ev(`(() => {
      const box = document.querySelector('.notice-box');
      const btn = document.getElementById('noticeOk').getBoundingClientRect();
      const r = box.getBoundingClientRect();
      return { boxBottom: Math.round(r.bottom), btnBottom: Math.round(btn.bottom), vh: window.innerHeight, btnH: Math.round(btn.height) };
    })()`);
    ok(nGeo.boxBottom <= nGeo.vh + 1 && nGeo.btnBottom <= nGeo.vh + 1,
      `公告盒 + 「我知道了」完整在视口内`, JSON.stringify(nGeo));
    ok(nGeo.btnH > 30, '「我知道了」按钮有完整高度', JSON.stringify(nGeo));
    await shot('e_notice_geo');
    await ev("document.getElementById('noticeX').click()");
    await sleep(200);

    // ============================================================
    console.log('\n[F] 公告老行为不回归（closeNotice 被接过链条）');
    // ============================================================
    await ev('window.__game.notice.clear()');
    ok(await ev('window.__game.notice.show(false)') === true, '没记录时照样自动弹');
    await ev("document.getElementById('noticeX').click()");
    await sleep(150);
    ok(await ev("document.getElementById('noticeOv').classList.contains('on')") === false, '✕ 能关',
      'class="' + await ev("document.getElementById('noticeOv').className") + '"');
    ok(await ev('window.__game.notice.key()') === '', '没勾「今日不再弹」→ 不写键');
    // 勾选 + OK → 写键。注意：show() 会把勾选框重置成 false，必须先 show 再勾（用户真实顺序）
    await ev('window.__game.notice.show(true)');
    await ev("document.getElementById('noticeHideToday').checked = true");
    await ev("document.getElementById('noticeOk').click()");
    await sleep(150);
    const nKey = await ev('window.__game.notice.key()');
    ok(/^\d{4}-\d{1,2}-\d{1,2}\|\d+$/.test(nKey || ''), '公告键照旧写「日期|版本」', String(nKey));
    ok(await ev('window.__game.notice.show(false)') === false, '当天不再弹（公告自己的键）');
    // 宣传有礼键已在 → 链条不会误弹
    await sleep(600);
    ok(await ev("document.getElementById('promoOv').classList.contains('on')") === false, '宣传今天已关过 → 链条不误弹');

    // ============================================================
    const muts = await ev('window.__mut57 || []');
    const mt0 = muts.length ? muts[0].at : 0;
    console.log(`\npromoOv/noticeOv class 突变（${muts.length} 条，相对 ms）：`);
    muts.forEach((m) => console.log(`  +${m.at - mt0}ms [${m.id}] "${m.cls}"`));
    const realErrors = jsErrors.filter((e) => !/autoplay|AudioContext|play\(\) failed|favicon/i.test(e));
    ok(realErrors.length === 0, `全程无 JS 报错（${realErrors.length}）`, realErrors.slice(0, 3).join(' | '));
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fails.length) { console.log('失败清单：'); fails.forEach((f) => console.log('  · ' + f)); }
  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CDP 套件失败:', e.message); process.exit(1); });
