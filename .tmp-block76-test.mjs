// 第 76 块契约测试：场地伤害无视防御
// 用户第 8 条：「地图的漏电伤害和水滴伤害，修改为无视防御力，让这个设定更重要」
import { readFileSync } from 'node:fs';
import { createStats, mitigate } from './js/stats.js';
import { LEVEL_6, LEVEL_7 } from './js/wave.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};
const sec = (t) => console.log('\n' + t);

// ============================================================
sec('一、stats.damageTrue：不减防，也不吃「保底 1」');
// ============================================================
{
  const st = createStats();
  st.addMod({ stat: 'armor', flat: 10, src: 'test' });   // 防御堆到 10
  ok(st.get('armor') === 10, '防御确实堆到 10', String(st.get('armor')));

  // 普通伤害：减法 + 保底 1 → 再高防御也留 1 点
  // 第 93 块：玩家受伤多了 ARMOR_FLOOR=0.30 保底 ——
  //   防御 10 打 5 点伤害，现在最多压到 5×0.3=1.5（改造前是 1）。
  //   这条断言跟着改，否则本套会红；「会不会免疫」由 block93 负责守。
  const before = st.hp.cur;
  const takenN = st.damage(5);
  ok(Math.abs(takenN - 1.5) < 1e-9, `普通伤害 5 被防御 10 压到 ${takenN}（第 93 块：攻击的 30% 保底）`);
  ok(Math.abs(st.hp.cur - (before - 1.5)) < 1e-9, '普通伤害扣了 1.5 点血（不再是 1）');

  // 真伤：多少扣多少
  const hpBefore = st.hp.cur;
  const takenT = st.damageTrue(2);
  ok(takenT === 2, `真伤 2 一点没减（实际 ${takenT}）`);
  ok(st.hp.cur === hpBefore - 2, '真伤扣了 2 点血');
  ok(typeof st.damageTrue === 'function', 'damageTrue 挂在 stats 实例上');

  // 负数和 0 不能反向加血
  const hp0 = st.hp.cur;
  ok(st.damageTrue(0) === 0, '真伤 0 → 0');
  ok(st.damageTrue(-5) === 0 && st.hp.cur === hp0, '真伤传负数不会反向回血');

  // 血量不会扣成负数
  st.damageTrue(9999);
  ok(st.hp.cur === 0, '血量下限是 0（不会变负）', String(st.hp.cur));

  // mitigate 本身的行为没被改坏（普通伤害那条路照旧）
  ok(mitigate(5, 10) === 1, 'mitigate 仍是「减法 + 保底 1」');
  ok(mitigate(5, 0) === 5, '没防御时普通伤害不打折');
}

// ============================================================
sec('二、hurtPlayer：场地伤害走真伤通道');
// ============================================================
{
  const mainSrc = readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
  ok(/if \(isHazard\) stats\.damageTrue\(raw\);\s*\n\s*else stats\.damage\(raw\);/.test(mainSrc),
    'isHazard 走 damageTrue，其它走 damage');
  ok(/const raw = amount \* \(1 \+ runCurseDmg\);/.test(mainSrc), '荆棘惩罚先乘、再分流（两边都吃）');
  // 原来那条「无条件 stats.damage(...)」不能再出现
  ok(!/^\s*stats\.damage\(amount \* \(1 \+ runCurseDmg\)\);/m.test(mainSrc),
    '旧的「一律 stats.damage」已经删掉');
  // 绝缘斗篷 / 不吃无敌帧这两条既有语义要保住
  ok(/if \(isHazard && \(relics\.levels\(\)\.insulator \|\| 0\) > 0\)/.test(mainSrc),
    '绝缘斗篷照旧整下免掉（在真伤之前就 return）');
  // 第 82 块：电弧也进了「不吃无敌帧」这一档，所以判据从 isHazard 换成 noIframe
  ok(/const noIframe = isHazard \|\| isArc;/.test(mainSrc), 'noIframe = 场地伤害 或 电弧');
  ok(/if \(!noIframe && iframe > 0\) return;/.test(mainSrc),
    '场地伤害与电弧都不吃无敌帧');
}

// ============================================================
sec('三、数值：漏电调到 2，滴水保持 1');
// ============================================================
{
  const h6 = LEVEL_6.hazards || [];
  ok(h6.length === 6, `第六关 6 块漏电地板（实际 ${h6.length}）`);
  ok(h6.every((h) => h.damage === 2), '每一块都是 2 点',
    [...new Set(h6.map((h) => h.damage))].join(','));
  const h7 = (LEVEL_7.hazards || []).filter((h) => h.kind === 'drip');
  ok(h7.length === 3, `第七关 3 处滴水（实际 ${h7.length}）`);
  ok(h7.every((h) => h.damage === 1), '滴水仍是 1 点（它靠频率压人，不靠单下重）',
    [...new Set(h7.map((h) => h.damage))].join(','));
  // 为什么要调这个数：防御是减法 + 保底 1，伤害 1 时「无视防御」看不出任何差别
  ok(h6[0].damage > 1, '漏电伤害必须 > 1，否则「无视防御」是句空话');
}

// ============================================================
sec('四、玩家看得到的文案同步了');
// ============================================================
{
  const waveSrc = readFileSync(new URL('./js/wave.js', import.meta.url), 'utf8');
  ok(/漏电 —— 防御挡不住/.test(waveSrc), '第六关开场提示写明「防御挡不住」');
  ok(/无视防御/.test(waveSrc), '第七关滴水提示写明「无视防御」');
  const boonsSrc = readFileSync(new URL('./js/boons.js', import.meta.url), 'utf8');
  ok(/地形伤害不吃防御/.test(boonsSrc) || /地形伤害（漏电 \/ 滴水）依旧按原样扣/.test(boonsSrc),
    '防御天赋的说明补了「地形伤害除外」');
}

// ============================================================
sec('五、版本号（以 index.html 为基准）');
// ============================================================
{
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const m = html.match(/main\.js\?v=(\d+)/);
  const VER = m && m[1];
  ok(!!VER && Number(VER) >= 86, `版本号 ${VER} ≥ 86`);
  const mainSrc = readFileSync(new URL('./js/main.js', import.meta.url), 'utf8');
  const imps = [...mainSrc.matchAll(/from '\.\/[a-zA-Z]+\.js\?v=(\d+)'/g)].map((x) => x[1]);
  ok(imps.length > 20 && imps.every((v) => v === VER), `main.js 所有 import 都是 ${VER}`,
    [...new Set(imps)].join(','));
}

console.log(`\n第 76 块契约：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
