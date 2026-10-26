// 第 81 块浏览器契约 —— **已于第 83 块退役**（同 .tmp-block81-test.mjs）
//
// 它测的是「无名者列队推进 + 旗手崩散 + 寄存柜站桩取牌」。
// 第 83 块用户要求「那个一起移动的怪物移动逻辑问题太大，直接换掉」，
// 并把寄存柜改成「满 8 封柜 → 召唤看守 → 四位数字取牌」，
// 这些实现已经整块删除，脚本里的 spawn('ranker') / squadState() 都不存在了。
//
// 替代：
//   · .tmp-block83-test.mjs —— 纯 Node，59 条（配置 / 接线 / 事件数值 / 版本号）
//   · .tmp-83-smoke.js      —— 起浏览器，45 条（掉牌 → 封柜 → 召唤 → 三招 → 暴怒 → 输码）
console.log('[退役] 第 81 块队形/站桩取牌契约已由第 83 块替换：');
console.log('  静态：node .tmp-block83-test.mjs');
console.log('  真机：node .tmp-83-smoke.js（需要 python -m http.server 8124 常驻）');
process.exit(0);
