// ============================================================
// 第 79 块 Node 契约：加载提示改写 + Service Worker 策略
//
// 为什么要在 Node 里测 sw.js：它是独立文件、不碰 DOM、
// 但它决定了「哪些请求该缓存、哪些必须放行」—— 判错了要么发版拿不到新版，
// 要么缓存坏响应把玩家钉死在白屏。用 mock 的 caches / fetch 跑真代码，
// 比读字符串断言靠谱得多。
//
// 跑法：node .tmp-block79-test.mjs
// ============================================================
import fs from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ORIGIN = 'https://site.test';
const SRC = fs.readFileSync('sw.js', 'utf8');

// ---------------- mock 环境 ----------------

function makeCaches() {
  const buckets = new Map();               // name -> Map(url -> {status, body})
  const bucketOf = (name) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    return buckets.get(name);
  };
  const api = {
    buckets,
    bucket: bucketOf,
    async open(name) { return cacheFace(name); },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); },
  };
  function cacheFace(name) {
    const m = bucketOf(name);
    return {
      async match(req) {
        const url = typeof req === 'string' ? req : req.url;
        const hit = m.get(url);
        if (!hit) return undefined;
        return new Response(hit.body, { status: hit.status });
      },
      async put(req, res) {
        const url = typeof req === 'string' ? req : req.url;
        m.set(url, { status: res.status, body: 'cached' });
      },
      async keys() { return [...m.keys()].map((u) => new Request(u)); },
      async delete(req) {
        const url = typeof req === 'string' ? req : req.url;
        return m.delete(url);
      },
    };
  }
  return api;
}

function makeFetch(handler) {
  const calls = [];
  const fn = async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    calls.push(url);
    return handler(url, calls.length);
  };
  fn.calls = calls;
  return fn;
}

// 加载 sw.js：把 self / caches / fetch 换掉，其余走 Node 原生（Request / Response / URL）
function loadSW(env) {
  const listeners = {};
  const self = {
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    skipWaiting() {},
    clients: env.clients || { claim: async () => {}, get: async () => null },
    location: { origin: ORIGIN },
  };
  const run = new Function('self', 'caches', 'fetch', 'Response', 'Request', 'Headers', 'URL', SRC);
  run(self, env.caches, env.fetch, Response, Request, Headers, URL);
  return listeners;
}

function makeEvent(url, clientId) {
  const ev = {
    request: new Request(url.startsWith('http') ? url : ORIGIN + url),
    clientId: clientId || 'client-1',
    responded: false, response: null,
    waits: [],
    respondWith(p) { ev.responded = true; ev.response = Promise.resolve(p); },
    waitUntil(p) { ev.waits.push(p); },
  };
  return ev;
}

// 触发一次 fetch 事件，返回 { responded, res }
async function dispatch(listeners, url, clientId) {
  const ev = makeEvent(url, clientId);
  for (const fn of listeners.fetch || []) fn(ev);
  if (!ev.responded) return { responded: false, res: null };
  const res = await ev.response;
  return { responded: true, res };
}

const okRes = () => new Response('ok', { status: 200 });

// ============================================================
console.log('\n— A 拦截白名单：谁该拦、谁必须放行 —');
// ============================================================
{
  const env = { caches: makeCaches(), fetch: makeFetch(() => okRes()) };
  const L = loadSW(env);

  const cases = [
    ['/index.html', false, 'index.html 必须放行（发版要能立刻拿到新版）'],
    ['/', false, '目录根放行'],
    ['/js/main.js?v=90', true, '带版本号的 js 要拦'],
    ['/style.css?v=90', true, '带版本号的 css 要拦'],
    ['/lib/three.module.js?v=90', true, 'lib 里的三方模块也拦'],
    ['/assets/monsters/frog.glb', true, 'glb 模型要拦（按关预载，慢了进关会卡）'],
    ['/assets/codex/frog.webp', true, '图鉴 webp 要拦'],
    ['/sw.js', false, 'SW 自己必须放行，不然没法更新'],
    ['/api/foo.php', false, '非静态资源放行'],
    ['/README.md', false, 'md 不拦'],
    ['https://other.test/x.js', false, '跨域一律不碰'],
    ['/js/main.js?v=90&nosw=1', false, '请求上显式带 nosw=1 就放行'],
  ];
  for (const [u, want, name] of cases) {
    const { responded } = await dispatch(L, u);
    ok(responded === want, name, `responded=${responded} 期望 ${want}`);
  }
}

// ============================================================
console.log('\n— B 带版本号 = 缓存优先 —');
// ============================================================
{
  const caches = makeCaches();
  const fetchMock = makeFetch(() => okRes());
  const env = { caches, fetch: fetchMock };
  const L = loadSW(env);

  // 第一次：没缓存 → 发网络请求并写缓存
  const r1 = await dispatch(L, '/js/main.js?v=90');
  ok(r1.responded && r1.res.status === 200, '第一次请求拿到 200');
  ok(fetchMock.calls.length === 1, '第一次确实发了 1 次网络请求');
  ok(caches.bucket('naiwa-rouge-v1').size === 1, '结果写进了缓存');
  // ⚠️ 这条是第 79 块修的真 bug：以前把 put 丢进 event.waitUntil，
  // 在 await 之后再调不生效，SW 一回收就丢写（实测 50 个只存下 27 个）。
  ok(caches.bucket('naiwa-rouge-v1').has(ORIGIN + '/js/main.js?v=90'),
    '响应返回时缓存**已经**写好了（不是丢给 waitUntil 靠运气）');

  // 第二次：命中缓存 → 不再发网络
  const r2 = await dispatch(L, '/js/main.js?v=90');
  ok(r2.res.status === 200, '第二次请求也拿到 200');
  ok(fetchMock.calls.length === 1, '第二次完全没发网络请求（缓存命中）');
}

// ============================================================
console.log('\n— C 网络抖动时的重试 —');
// ============================================================
{
  const caches = makeCaches();
  let n = 0;
  const fetchMock = makeFetch(() => {
    n++;
    if (n < 3) throw new Error('net::ERR_CONNECTION_RESET');
    return okRes();
  });
  const L = loadSW({ caches, fetch: fetchMock });
  const t0 = Date.now();
  const r = await dispatch(L, '/js/enemy.js?v=90');
  ok(r.responded && r.res.status === 200, '前两次失败、第三次成功：请求最终拿到了内容');
  ok(fetchMock.calls.length === 3, `一共试了 3 次（实际 ${fetchMock.calls.length} 次）`);
  ok(Date.now() - t0 < 5000, '重试的退避没把人晾在那儿（< 5 秒）');
}

{
  const caches = makeCaches();
  const fetchMock = makeFetch(() => { throw new Error('offline'); });
  const L = loadSW({ caches, fetch: fetchMock });
  let threw = false;
  try { await dispatch(L, '/js/wave.js?v=90'); } catch (_) { threw = true; }
  ok(threw, '一直连不上时如实抛错（不假装成功）');
  ok(fetchMock.calls.length === 3, `最多重试 3 次就放弃（实际 ${fetchMock.calls.length} 次）`);
  ok(caches.bucket('naiwa-rouge-v1').size === 0, '失败时一个字节都没往缓存里写');
}

// 4xx 不该被当成好东西存起来
{
  const caches = makeCaches();
  const fetchMock = makeFetch(() => new Response('nope', { status: 404 }));
  const L = loadSW({ caches, fetch: fetchMock });
  const r = await dispatch(L, '/js/gone.js?v=90');
  ok(r.res.status === 404, '404 原样返回给页面');
  ok(caches.bucket('naiwa-rouge-v1').size === 0, '404 不写进缓存（否则下次命中就是坏数据）');
}

{
  const caches = makeCaches();
  const fetchMock = makeFetch(() => new Response('err', { status: 500 }));
  const L = loadSW({ caches, fetch: fetchMock });
  await dispatch(L, '/js/boom.js?v=90').catch(() => {});
  ok(caches.bucket('naiwa-rouge-v1').size === 0, '500 也不写进缓存');
}

// ============================================================
console.log('\n— D 不带版本号的资源：先用缓存、后台更新 —');
// ============================================================
{
  const caches = makeCaches();
  const fetchMock = makeFetch(() => okRes());
  const L = loadSW({ caches, fetch: fetchMock });

  // 第一次进 glb：没缓存 → 走网络
  const r1 = await dispatch(L, '/assets/monsters/frog.glb');
  ok(r1.res.status === 200, 'glb 第一次拿到 200');
  ok(fetchMock.calls.length === 1, 'glb 第一次走网络');
  ok(caches.bucket('naiwa-rouge-v1').size === 1, 'glb 也进了缓存');

  // 第二次：有缓存 → 立刻给缓存，同时后台更新
  await sleep(30);
  const r2 = await dispatch(L, '/assets/monsters/frog.glb');
  ok(r2.res.status === 200, 'glb 第二次拿到 200');
  await sleep(50);
  ok(fetchMock.calls.length === 2, '第二次仍然悄悄去后台更新了（不然换了模型永远拿不到）');
}

// ============================================================
console.log('\n— E ?nosw=1 的页面完全不碰缓存 —');
// ============================================================
{
  const caches = makeCaches();
  const fetchMock = makeFetch(() => okRes());
  const clients = {
    claim: async () => {},
    get: async (id) => (id === 'nosw-client'
      ? { url: ORIGIN + '/index.html?debug=1&nosw=1' }
      : { url: ORIGIN + '/index.html' }),
  };
  const L = loadSW({ caches, fetch: fetchMock, clients });

  // 普通页面：照常缓存
  const a = await dispatch(L, '/js/main.js?v=90', 'normal-client');
  ok(a.res.status === 200, '普通页面正常拿到文件');
  ok(caches.bucket('naiwa-rouge-v1').size === 1, '普通页面照常写缓存');

  // nosw 页面：透传，不读也不写缓存
  const b = await dispatch(L, '/js/enemy.js?v=90', 'nosw-client');
  ok(b.res.status === 200, 'nosw 页面照常拿到文件');
  ok(caches.bucket('naiwa-rouge-v1').size === 1, 'nosw 页面没往缓存里写东西');
  ok(!caches.bucket('naiwa-rouge-v1').has(ORIGIN + '/js/enemy.js?v=90'), 'nosw 那个文件确实没进缓存');

  // clients.get 抛错也不能让请求挂掉
  const L2 = loadSW({
    caches: makeCaches(), fetch: makeFetch(() => okRes()),
    clients: { claim: async () => {}, get: async () => { throw new Error('boom'); } },
  });
  const c = await dispatch(L2, '/js/wave.js?v=90');
  ok(c.responded && c.res.status === 200, 'clients.get 出错也不影响正常响应（降级成普通缓存）');
}

// ============================================================
console.log('\n— F 旧版本缓存会被清掉，不无限堆积 —');
// ============================================================
{
  const caches = makeCaches();
  const env = { caches, fetch: makeFetch(() => okRes()) };
  // 先手动塞几个版本进去
  caches.bucket('naiwa-rouge-v1').set(ORIGIN + '/js/main.js?v=88', { status: 200, body: 'a' });
  caches.bucket('naiwa-rouge-v1').set(ORIGIN + '/js/main.js?v=89', { status: 200, body: 'b' });
  caches.bucket('naiwa-rouge-v1').set(ORIGIN + '/js/main.js?v=90', { status: 200, body: 'c' });
  caches.bucket('naiwa-rouge-v1').set(ORIGIN + '/assets/x.glb', { status: 200, body: 'd' });
  caches.bucket('some-old-project').set(ORIGIN + '/old.js', { status: 200, body: 'e' });

  const L = loadSW(env);
  const ev = { waits: [], waitUntil(p) { ev.waits.push(p); } };
  for (const fn of L.activate || []) fn(ev);
  await Promise.all(ev.waits);
  await sleep(30);

  const b = caches.bucket('naiwa-rouge-v1');
  ok(!b.has(ORIGIN + '/js/main.js?v=88'), 'v=88 的条目被清掉了（只留最近两个版本）');
  ok(b.has(ORIGIN + '/js/main.js?v=89'), 'v=89 还在');
  ok(b.has(ORIGIN + '/js/main.js?v=90'), 'v=90 还在');
  ok(b.has(ORIGIN + '/assets/x.glb'), '不带版本号的资源一条不删');
  ok(!caches.buckets.has('some-old-project'), '别的缓存桶整个删掉');
  ok(caches.buckets.has('naiwa-rouge-v1'), '自己的桶留着');
}

// ============================================================
console.log('\n— G index.html 的加载提示改写 —');
// ============================================================
const html = fs.readFileSync('index.html', 'utf8');

ok(/id="ldSlow"/.test(html), '有「慢」提示那一行 #ldSlow');
ok(/id="ldRetry"/.test(html), '有重试按钮 #ldRetry');
ok(/id="ldSlow"\s+hidden/.test(html), '#ldSlow 默认是 hidden（不该一进来就显示）');
ok(/id="ldRetry"\s+type="button"\s+hidden/.test(html), '#ldRetry 默认隐藏且是 button（能点、能聚焦）');
// 「加载超时」这四个字在注释里提了一句（说明旧版错在哪），但**不能出现在任何
// 给用户看的文案里** —— 所以只查 fail() 的实参。
ok(!/fail\('[^']*超时/.test(html), '给用户看的文案里再没有「超时」这个误报');
ok(!/加载超时[^\n]{0,10}<\/div>/.test(html), '页面上也没有写死的「加载超时」');
ok(/\}, 9000\)/.test(html), '9 秒那道坎还在（但改成只提示慢）');
ok(/\}, 25000\)/.test(html), '25 秒才给重试按钮');
ok(/网络有点慢/.test(html), '9 秒的文案是「网络有点慢」');
ok(/重载一两次/.test(html), '25 秒的文案给了「重载一两次」的建议');
ok(/脚本加载失败/.test(html), '真失败时仍然说「脚本加载失败」');
ok(/location\.reload\(\)/.test(html), '重试按钮真的会重新加载');
ok(/serviceWorker\.register\('sw\.js'/.test(html), '注册了 sw.js');
ok(/updateViaCache:\s*'none'/.test(html), "注册时带 updateViaCache:'none'（否则 sw.js 自己被缓存住，改了不生效）");
ok(/\[?\?&\]nosw=1|\[\?&\]nosw=1/.test(html), '有 ?nosw=1 后门（SW 出问题时能绕过）');
ok(/'serviceWorker' in navigator/.test(html), '不支持 SW 的浏览器直接跳过（不报错）');
ok(/window\.addEventListener\('load'/.test(html), '等 load 之后再注册，不跟首屏抢带宽');

// 版本号一致性（每次发版都要过）
{
  const m = html.match(/\?v=(\d+)/);
  const V = m ? m[1] : null;
  ok(!!V, 'index.html 里读得到版本号', String(V));
  const jsFiles = fs.readdirSync('js').filter((f) => f.endsWith('.js'));
  const bad = [];
  for (const f of jsFiles) {
    const s = fs.readFileSync('js/' + f, 'utf8');
    for (const mm of s.matchAll(/\?v=(\d+)/g)) {
      if (mm[1] !== V) bad.push(`${f}: v=${mm[1]}`);
    }
  }
  ok(bad.length === 0, `js/ 里所有 ?v= 都跟 index.html 一致（v=${V}）`, bad.slice(0, 5).join(', '));
  const h = fs.readFileSync('index.html', 'utf8');
  const hBad = [...h.matchAll(/\?v=(\d+)/g)].filter((mm) => mm[1] !== V);
  ok(hBad.length === 0, 'index.html 内部版本号也一致', String(hBad.length));
}

// sw.js 自身不该带版本号：带了就每次发版都要改它，而且它自己的更新由浏览器管
ok(!/\?v=\d+/.test(SRC), 'sw.js 里没有写死版本号（它不参与 ?v 体系）');

// 样式存在
const css = fs.readFileSync('style.css', 'utf8');
ok(/\.ld-slow\{/.test(css), '有 .ld-slow 样式');
ok(/\.ld-retry\{/.test(css), '有 .ld-retry 样式');
ok(/#loading \[hidden\]\{display:none!important\}/.test(css), 'hidden 被 !important 压住（父级是 flex，不然藏不住）');
ok(/color:#f0d68a/.test(css), '慢提示是黄字（不是错误红）');

console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
if (fails.length) console.log('\n失败项：\n  ' + fails.join('\n  '));
process.exit(fail === 0 ? 0 : 1);
