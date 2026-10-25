// ============================================================
// 蛙步 · 夜行 —— Service Worker（第 79 块）
//
// 为什么需要它：GitHub Pages 只给 `Cache-Control: max-age=600`（10 分钟），
// 而首屏要拉 52 个文件 / 约 1MB。用户隔十几分钟再进，就等于冷启动一次，
// 国内直连要 6 秒起步，网络一抖就撞上加载页 9 秒的兜底提示。
//
// 它只做两件事，都很轻：
//   ① **带 `?v=N` 的 js / css → 缓存优先**。项目发版铁律是「全部 ?v 一起 bump」，
//      所以同一个带版本号的 URL 内容永远不会变，永久缓存绝对安全；换版本自动走新版。
//   ② **其它静态资源（glb / webp / png / 字体 / 音频）→ 先用缓存、后台更新**。
//      这些文件名不跟版本号走（以后换模型可能同名），所以不能缓存优先，否则改不动。
//
// 额外收益：**网络抖动时自动重试**。以前任何一个依赖请求被掐，整个模块图就废、
// 游戏打不开；现在同一个请求最多重试 3 次（退避 250/500ms），用户根本看不到。
//
// index.html **故意不拦** —— 它不带版本号，必须每次走网络，否则发版后玩家永远拿不到新版。
// 不支持 SW 的老浏览器（iOS 11.3 以前 / 老 WebView）静默跳过，行为跟以前完全一样。
// ============================================================

const CACHE = 'naiwa-rouge-v1';
const KEEP_VERSIONS = 2;          // 桶里只留最近 2 个版本号的条目，更早的清掉
const RETRY_TIMES = 3;

const STATIC_RE = /\.(glb|gltf|bin|png|webp|jpg|jpeg|gif|svg|ico|json|woff2?|ttf|otf|mp3|ogg|wav|m4a)$/i;
const VERSION_RE = /[?&]v=(\d+)/;

// ---------------- 生命周期 ----------------

// 新 SW 立刻接管，不等所有标签页关掉（不然发版后玩家要开两次）
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 只保留当前这一个桶，别的（包括别的项目遗留）全删
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    // 顺手把桶里太老的版本号条目清掉，别让配额一直涨
    try {
      const cache = await caches.open(CACHE);
      await pruneOldVersions(cache);
    } catch (_) {}
    await self.clients.claim();
  })());
});

async function pruneOldVersions(cache) {
  const reqs = await cache.keys();
  const versions = new Set();
  for (const r of reqs) {
    const m = VERSION_RE.exec(r.url);
    if (m) versions.add(Number(m[1]));
  }
  const sorted = [...versions].sort((a, b) => b - a);
  const stale = new Set(sorted.slice(KEEP_VERSIONS));
  if (!stale.size) return;
  for (const r of reqs) {
    const m = VERSION_RE.exec(r.url);
    if (m && stale.has(Number(m[1]))) await cache.delete(r).catch(() => {});
  }
}

// ---------------- 工具 ----------------

// 只存「完整成功」的响应。206 分片、opaque、4xx/5xx 一律不存 ——
// 存进去的话下次命中就是坏数据，比不缓存糟糕得多。
function putSafe(cache, req, res) {
  if (!res || res.status !== 200 || res.type === 'opaque' || !res.ok) return Promise.resolve();
  return cache.put(req, res).catch(() => {});
}

// 带退避的重试。GET 无 body，同一个 Request 可以反复 fetch。
// 只重试「可能是暂时的」失败：网络异常、5xx、408 / 429。
// **4xx（尤其 404）原样交回去** —— 文件本来就不存在，重试三次只不过让页面多等 750ms
// 再拿到一个网络错误，反而看不出真正原因（第 79 块 Node 契约测出来的）。
async function fetchWithRetry(req, times) {
  let lastErr = null;
  for (let i = 0; i < times; i++) {
    let res = null;
    try {
      res = await fetch(req);
    } catch (err) {
      lastErr = err;
    }
    if (res) {
      if (res.ok) return res;
      const s = res.status;
      if (s >= 400 && s < 500 && s !== 408 && s !== 429) return res;
      lastErr = new Error('HTTP ' + s);
    }
    if (i < times - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw lastErr || new Error('fetch failed');
}

// ---------------- 两种策略 ----------------

// 缓存优先：带版本号 = 内容不可变，命中最快
// ⚠️ 这里必须 await cache.put，不能丢进 event.waitUntil —— 在 respondWith 的
// async 链里（await 之后）再调 waitUntil 是不生效的，SW 一被回收就丢写，
// 表现为「缓存条目莫名只有一半」（第 79 块实测：50 个请求只存下 27 条）。
async function cacheFirst(event, cache) {
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetchWithRetry(event.request, RETRY_TIMES);
  await putSafe(cache, event.request, res.clone());
  return res;
}

// 先用缓存、后台更新：文件名不跟版本走的资源
async function staleWhileRevalidate(event, cache) {
  const hit = await cache.match(event.request);
  const net = fetchWithRetry(event.request, RETRY_TIMES).then((res) => {
    putSafe(cache, event.request, res.clone());
    return res;
  });
  if (hit) {
    // 有缓存就先给，更新放后台（后台失败不影响这次响应，也不 await —— 别让玩家等更新）
    net.catch(() => {});
    return hit;
  }
  return net;
}

// ?nosw=1 打开的那个页面：完全不经过缓存，也不往里写。
// 光看请求 URL 看不出来（资源 URL 上没有 nosw），得回头问发起请求的那个页面。
async function fromNoSwPage(event) {
  if (!event.clientId) return false;
  try {
    const client = await self.clients.get(event.clientId);
    return !!client && /[?&]nosw=1(&|$)/.test(client.url);
  } catch (_) {
    return false;
  }
}

// ---------------- 首次访问的「补存」 ----------------
//
// 页面是在 load 之后才注册 SW 的，所以**首屏那 50 个 js/css 请求根本没经过它** ——
// 等到 SW 接管，那些文件早就下完了。只靠 runtime caching 的话，
// 第一次访问什么都存不下，第二次照样得重新下一遍 1MB，等于白做（第 79 块踩过）。
//
// 所以页面注册完会把自己这次真正下载过的资源清单 postMessage 过来，
// 这里在后台补存一份。用 SW 自己的 fetch（不会再触发自己的 fetch 事件），
// 网络层已有浏览器缓存，补得很便宜；并发压到 4，不跟正在玩的玩家抢带宽。
const WARM_CONCURRENCY = 4;

async function warm(urls) {
  if (!Array.isArray(urls) || !urls.length) return;
  const cache = await caches.open(CACHE);
  const queue = urls.slice(0, 200);          // 别被一条坏消息灌爆
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const url = queue[cursor++];
      try {
        if (await cache.match(url)) continue;
        const res = await fetchWithRetry(url, 2);
        await putSafe(cache, url, res);
      } catch (_) { /* 单个补存失败无所谓，下次进站会再补 */ }
    }
  }
  const lanes = [];
  for (let i = 0; i < WARM_CONCURRENCY; i++) lanes.push(worker());
  await Promise.all(lanes);
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm') return;
  // 只收同源 URL，别让人拿这个接口去灌别人的东西
  const urls = (data.urls || []).filter((u) => {
    try { return new URL(u).origin === self.location.origin; } catch (_) { return false; }
  });
  event.waitUntil(warm(urls));
});

// ---------------- 拦截 ----------------

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  // 调试 / 测试开关：请求 URL 上带 nosw=1（少见），或发起页面的地址带（常用）
  if (url.searchParams.get('nosw') === '1') return;

  const path = url.pathname;
  if (/\/sw\.js$/.test(path)) return;              // SW 自己交给浏览器管

  const isCode = /\.(js|css)$/i.test(path);
  const isStatic = STATIC_RE.test(path);
  if (!isCode && !isStatic) return;                // index.html 等一律放行

  // 带 ?v=N 的一律视为「内容不可变」→ 缓存优先。
  // 第 80 块：原来只有 js/css 能吃这一档，glb 只能走「先给缓存 + 后台重下」——
  // 怪物模型 7MB，每次刷新 / 重新进关都在后台重下一遍，玩家进关时带宽被自己抢光。
  // 现在 glb 请求也带 ?v=N（见 js/assetUrl.js），同版本第二次进站一个字节都不下。
  const immutable = VERSION_RE.test(url.search);
  event.respondWith((async () => {
    // 发起请求的页面自己要求别走缓存 → 直接透传（也不写缓存）
    if (await fromNoSwPage(event)) return fetch(req);
    const cache = await caches.open(CACHE);
    if (immutable) return cacheFirst(event, cache);
    return staleWhileRevalidate(event, cache);
  })());
});
