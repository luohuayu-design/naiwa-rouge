// 第 100 块契约（纯 Node，不起浏览器）
// 用户第二次报：「改属性那里基础值还是变了」。
// 实测（.tmp-100-diag.js 15/15）证明 v112+ 的面板逻辑是对的，基础值确实不动 ——
// 用户看到的是**浏览器 / CDN 缓存里的旧前端**（第 97 块 v=111 那套「反解 base」）。
// 所以本块不重做属性逻辑，而是补三条硬约束 + 一条真 bug：
//   ① 改完属性，**本局那个 stats 实例也要立刻跟上**（以前只写了档案，局内得等下一局）
//   ② 首页启动时自检远端版本，比本地新就带着 `_v=` 参数换掉自己（绕开 HTML 缓存）
//   ③ 设置页底部标出版本号 —— 用户报问题时能一句话说清跑的是哪一版
//   ④ 自检不能打断玩家：局内 / 设置页 / 属性页 / 篝火页开着时一律不动
// 跑法：node .tmp-block100-test.mjs（cwd = naiwa-rouge）
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
};
const sec = (t) => console.log('\n—— ' + t + ' ——');
const eq = (a, b, name) => ok(a === b, name, `${a} !== ${b}`);

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const mainSrc = read('./js/main.js');
const htmlSrc = read('./index.html');

// 版本号以 index.html 为准（运行时一起 bump，测试别写死数字）
const VER = (() => {
  const m = htmlSrc.match(/main\.js\?v=(\d+)/);
  return m ? Number(m[1]) : 0;
})();

// 只保留真正执行的代码行（注释里留着「以前怎样」的说明是好事，不该被当成回退）
const codeLines = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const mainCode = codeLines(mainSrc);

// ============================================================
sec('① 改完属性，本局 stats 立刻跟上');
// ============================================================
{
  // submitStatFinal 里 setStatAdmin 之后必须紧跟 stats.applyAdmin(...)
  const m = mainCode.match(/function submitStatFinal\([\s\S]{0,1200}?\n  \}/);
  ok(!!m, '找得到 submitStatFinal');
  const body = m ? m[0] : '';
  ok(/setStatAdmin\(key,\s*v - nat\)/.test(body), '存的仍然是「目标最终值 − 自然最终值」这个追加项');
  ok(/setStatAdmin\(key,[\s\S]{0,300}?stats\.applyAdmin\(getStatAdmin\(\)\)/.test(body),
    '★ 写完档案立刻 stats.applyAdmin(...)，本局不用等下一局');
  ok(!/\.base\s*\[|\.base\s*\.\w+\s*=/.test(body), 'submitStatFinal 里一个 base 都没写');

  // 「恢复默认」同样要同步，否则本局还留着上一份追加项
  const rst = mainCode.match(/stAdminReset\.addEventListener\('click'[\s\S]{0,400}?\n  \}\);/);
  ok(!!rst, '找得到「恢复默认」的点击处理');
  ok(rst && /resetStatAdmin\(\);[\s\S]{0,200}?stats\.applyAdmin\(getStatAdmin\(\)\)/.test(rst[0]),
    '★ 恢复默认之后也立刻同步本局');

  // 面板里的「基础」只能读代码原值
  ok(/const effectiveBase = d\.base;/.test(mainCode), '面板「基础」直接读 d.base（STAT_DEFS 的原值）');
  ok(!/const effectiveBase = ov\[/.test(mainCode), '不再有任何「从覆盖表里取基础」的写法');
}

// ============================================================
sec('② 启动时自检远端版本');
// ============================================================
{
  ok(/const BUILD = \(\(\) => \{/.test(mainCode), 'BUILD 版本号常量存在');
  ok(/querySelectorAll\('script\[src\]'\)/.test(mainCode)
    && /match\(\/\[\?&\]v=\(\\d\+\)\//.test(mainCode),
    'BUILD 是从自己那个 <script src="…?v=N"> 上读的（不写死，不会和 bump 走散）');

  ok(/function checkUpdate\(\)/.test(mainCode), 'checkUpdate 存在');
  ok(/fetch\(`index\.html\?_\=\$\{Date\.now\(\)\}`?,?\s*\{ cache: 'no-store' \}\)|fetch\(`index\.html\?_\=\$\{Date\.now\(\)\}`,\s*\{ cache: 'no-store' \}\)/.test(mainCode)
    || /cache: 'no-store'/.test(mainCode),
    '拉 index.html 时带时间戳 + no-store（绕开 CDN / 浏览器缓存）');
  ok(/main\\\.js\\\?v=\(\\d\+\)|main\.js\\\?v=\(\\d\+\)/.test(mainCode), '从远端 HTML 里抠出 main.js?v=N');
  ok(/Number\(m\[1\]\) <= BUILD/.test(mainCode), '只有远端版本比本地大才动');
  ok(/searchParams\.set\('_v'/.test(mainCode), '换 URL 时带上 _v=N（下次加载一定拿新 HTML）');
  ok(/location\.replace\(u\.toString\(\)\)/.test(mainCode), '用 replace 而不是 href（不往历史里塞垃圾）');

  // 不打断玩家
  ok(/if \(gameState !== 'title'\) return;/.test(mainCode), '不在局内刷（只在标题页）');
  ok(/'setScr', 'statScr'/.test(mainCode), '设置页 / 属性页开着时不刷');
  ok(/'campScr'/.test(mainCode), '篝火页开着时也不刷');
  ok(/\.catch\(\(\) => \{/.test(mainCode), '网络失败静默（离线也得能玩）');
  ok(/setTimeout\(checkUpdate, 2500\)/.test(mainCode) && /setTimeout\(checkUpdate, 9000\)/.test(mainCode),
    '启动后查两次（首查可能撞上网络抖动）');
  // 手机上最常见的「一直是旧版」是标签页切后台再切回来 —— 页面压根没重载
  ok(/addEventListener\('visibilitychange'/.test(mainCode)
    && /if \(document\.hidden\) return;[\s\S]{0,200}?setTimeout\(checkUpdate, 600\)/.test(mainCode),
    '★ 切回前台也查一次（页面没重载也能拿到新版）');
  ok(/now - lastVisCheck < 60000/.test(mainCode), '一分钟内不重复查（省流量）');
}

// ============================================================
sec('③ 设置页底部标出版本号');
// ============================================================
{
  ok(/querySelector\('#setScr \.lv-foot'\)/.test(mainCode), '找的是设置页页脚那行字');
  ok(/· v\$\{BUILD\}/.test(mainCode), '页脚里拼上 · vN');
  ok(/id="setScr"/.test(htmlSrc) && /class="lv-foot"/.test(htmlSrc), '设置页确实有 .lv-foot 这个元素');
}

// ============================================================
sec('④ 版本号全站一致');
// ============================================================
{
  ok(VER > 0, `从 index.html 读到版本号 v${VER}`);
  // ⚠️ 这里必须 new RegExp：写成 /(?!' + VER + ')/ 这种字面量，拼接**不会生效**，
  //    断言内容就变成 `' + VER + '` 这一串字符，于是什么都能匹配上（第一版就踩了这个）。
  const stale = new RegExp('\\?v=(?!' + VER + ')\\d+', 'g');
  const jsFiles = ['main.js', 'stats.js', 'profile.js', 'saveIO.js', 'enemy.js', 'wave.js'];
  for (const f of jsFiles) {
    const s = read('./js/' + f);
    const bad = (s.match(stale) || []);
    ok(bad.length === 0, `${f} 里的 ?v= 全是 ${VER}`, bad.slice(0, 3).join(','));
  }
  // index.html 自己也别留旧版本
  const bads = (htmlSrc.match(stale) || []);
  eq(bads.length, 0, 'index.html 里没有更老的 ?v=');
}

// ============================================================
sec('⑤ 「基础值」这条路只此一条，别再冒出第二条');
// ============================================================
{
  // 全站只有属性页会显示「基础」二字（别的页面显示基础值 = 又一个让用户困惑的来源）
  const files = ['main.js', 'stats.js', 'profile.js', 'wave.js', 'enemy.js', 'codex.js',
    'camp.js', 'boon.js', 'shop.js', 'upgrade.js'];
  const hits = [];
  for (const f of files) {
    let s;
    try { s = read('./js/' + f); } catch (_) { continue; }
    // 去掉注释行再找
    for (const line of s.split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      // 只看**真正渲染到屏幕上的**那句：xxx.textContent = ...基础...
      if (/textContent\s*=[^;]*基础/.test(line)) hits.push(f + ': ' + line.trim().slice(0, 50));
    }
  }
  ok(hits.length <= 2, '渲染「基础 X」的地方只有属性页那两行', hits.join(' | '));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：\n - ' + fails.join('\n - '));
  process.exit(1);
}
