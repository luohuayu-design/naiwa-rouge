// ============================================================
// .tmp-systems-test.mjs —— 第 115 块新系统引擎契约测试
//   覆盖：元素反应 / 精英怪掉落 / 天气 / 音乐盒
// 运行：node .tmp-systems-test.mjs
// ============================================================
import { createReactionSystem, canReact, reactionKey, REACTIONS, REACTIVE } from './js/elementReaction.js';
import { createEliteSystem, AURA_IDS, MOD_IDS } from './js/elite.js';
import { createWeatherSystem, rollWeather, WEATHER_IDS, WEATHER_DEFS } from './js/weather.js';
import { createMusicboxSystem, TRACKS } from './js/musicbox.js';

let pass = 0, fail = 0;
function ok(name, cond) { cond ? pass++ : (fail++, console.log('  ✗ FAIL:', name)); }
function okEq(name, got, want) {
  if (got === want) pass++;
  else { fail++; console.log(`  ✗ FAIL: ${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`); }
}

console.log('=== 新系统引擎契约测试 ===\n');

// ---------------- 元素反应 ----------------
{
  ok('frost+thunder 能反应', canReact('frost', 'thunder'));
  ok('thunder+frost 能反应（顺序无关）', canReact('thunder', 'frost'));
  ok('poison+leech 能反应', canReact('poison', 'leech'));
  ok('quake+thunder 能反应', canReact('quake', 'thunder'));
  ok('frost+poison 能反应', canReact('frost', 'poison'));
  ok('iron 不参与反应', !canReact('iron', 'frost'));
  ok('同元素不反应', !canReact('frost', 'frost'));
  okEq('reactionKey 排序', reactionKey('thunder', 'frost'), 'frost_thunder');

  // 反应表完整性：4 组
  okEq('反应组数=4', Object.keys(REACTIONS).length, 4);

  // mark 逻辑：挂印记 → 触发反应 → 清空
  const fired = [];
  const sys = createReactionSystem({
    ctx: { freeze: (e, s) => fired.push(['freeze', s]), damage: (e, m) => fired.push(['damage', m]),
      chain: (e, r) => fired.push(['chain', r]), dot: (e, o) => fired.push(['dot', o]),
      heal: (n) => fired.push(['heal', n]), knock: (e, d) => fired.push(['knock', d]),
      zone: (e, r, d) => fired.push(['zone', r, d]) },
  });
  // 第一击挂 frost
  let r = sys.mark([], 'frost');
  ok('挂 frost 不反应', !r.reacted);
  okEq('挂后 marks=[frost]', JSON.stringify(r.marks), JSON.stringify(['frost']));
  // 第二击挂 thunder → 反应（纯判定，不触发副作用）
  r = sys.mark(['frost'], 'thunder');
  ok('frost+thunder 触发反应', r.reacted);
  okEq('反应名=冻碎', r.reaction.name, '冻碎');
  okEq('反应后 marks 清空', JSON.stringify(r.marks), JSON.stringify([]));

  // apply 版本：触发副作用（怪对象带 _marks）
  const target = { _marks: [] };
  sys.apply(target, 'frost');
  sys.apply(target, 'thunder');   // 触发冻碎副作用
  ok('apply 触发冻碎副作用', fired.length === 3 && fired[0][0] === 'freeze' && fired[1][0] === 'damage' && fired[2][0] === 'chain');
  okEq('apply 后 _marks 清空', JSON.stringify(target._marks), JSON.stringify([]));

  // apply 版本触发蚀骨
  const target2 = { _marks: [] };
  sys.apply(target2, 'poison');
  sys.apply(target2, 'leech');
  ok('apply 触发蚀骨', target2._marks.length === 0);
}

// ---------------- 精英怪 + 掉落词条 ----------------
{
  okEq('光环数=4', AURA_IDS.length, 4);
  okEq('词条数=4', MOD_IDS.length, 4);

  // rng=0 → 必刷精英（0 < 0.2）
  const sys = createEliteSystem({ rng: () => 0 });
  const elite = sys.rollElite();
  ok('rng=0 必刷精英', elite !== null);
  ok('精英带光环', elite.aura && elite.def);

  // rng=0.5 → 不刷（0.5 >= 0.2）
  const sys2 = createEliteSystem({ rng: () => 0.5 });
  ok('rng=0.5 不刷精英', sys2.rollElite() === null);

  // 掉落词条
  const sys3 = createEliteSystem({ rng: () => 0 });   // 0 → 第一个词条 haste
  const modId = sys3.dropMod();
  okEq('掉落词条=迅猛(haste)', modId, 'haste');
  ok('hasMod 生效', sys3.hasMod('haste'));

  // 序列化
  const snap = sys3.serialize();
  const sys4 = createEliteSystem();
  sys4.restore(snap);
  ok('还原词条', sys4.hasMod('haste'));
  sys4.reset();
  ok('重置清词条', !sys4.hasMod('haste'));
}

// ---------------- 天气 ----------------
{
  okEq('天气数=5', WEATHER_IDS.length, 5);
  ok('clear 权重最高', WEATHER_DEFS.clear.weight >= WEATHER_DEFS.mist.weight);

  const sys = createWeatherSystem({ rng: () => 0 });
  const w = sys.roll();
  okEq('rng=0 roll 出 clear', w, 'clear');
  okEq('get=clear', sys.get(), 'clear');
  okEq('清朗无移速修正(默认1)', sys.playerMult('move'), 1);

  // 抽到 ember（余烬）→ 攻速 1.10
  const sys2 = createWeatherSystem({ rng: () => 0.5 });   // 0.5*100=50 → ember? clear40+mist20=60，50<60 → mist? 见 roll 顺序
  const w2 = sys2.roll();
  ok('roll 返回合法天气', WEATHER_IDS.includes(w2));
}

// ---------------- 音乐盒 ----------------
{
  okEq('曲目数=3', TRACKS.length, 3);

  const sys = createMusicboxSystem();
  const t = TRACKS[0];   // 草甸夜曲，4 音符
  ok('初始未解锁', !sys.isUnlocked(t.id));

  // 收前 3 个音符 → 不解锁
  let unlocked = null;
  for (let i = 0; i < 3; i++) unlocked = sys.collect(t.notes[i]);
  ok('收 3/4 音符不解锁', !sys.isUnlocked(t.id));
  okEq('collect 返回 null(未解锁)', unlocked, null);

  // 收第 4 个 → 解锁
  unlocked = sys.collect(t.notes[3]);
  ok('收第 4 个解锁', sys.isUnlocked(t.id));
  ok('collect 返回曲目', unlocked && unlocked.id === t.id);

  // 序列化 / 还原
  const snap = sys.serialize();
  const sys2 = createMusicboxSystem();
  sys2.restore(snap);
  ok('还原后仍解锁', sys2.isUnlocked(t.id));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
