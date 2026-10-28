// ============================================================
// .tmp-story-test.mjs —— 第 32 块：主线《笑不出来的那一夜》数据层测试
// 不开浏览器，纯 Node 跑表结构 / 调度 / 结局结算 / 文案体量。
// 跑法：node .tmp-story-test.mjs
// ============================================================
import {
  STORY_ARC, STORY_CHAPTERS, STORY_ENDINGS, MARK_INFO,
  storyChapterAt, storyChapterById, storyEndingKey, storySeenCount,
} from './js/story.js';

let pass = 0;
const fails = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; return; }
  fails.push(name + (extra ? ` —— ${extra}` : ''));
}

const CH = STORY_CHAPTERS;

// ---------------- 1. 基本结构 ----------------
ok('卷信息齐全', !!(STORY_ARC.title && STORY_ARC.sub));
ok('一共 18 夜', CH.length === 18, `实际 ${CH.length}`);
ok('章节 id 唯一', new Set(CH.map((c) => c.id)).size === CH.length);
ok('序号 1~18 连续', CH.every((c, i) => c.no === i + 1));
ok('每章都有标题/图标/说话人/地点',
  CH.every((c) => c.title && c.icon && c.who && c.place));
ok('每章都有开场旁白（>=40 字）', CH.every((c) => (c.story || '').length >= 40));
ok('每章至少 3 拍', CH.every((c) => c.talk.length >= 3),
  CH.filter((c) => c.talk.length < 3).map((c) => c.id).join(','));
ok('每拍都有说话人和台词', CH.every((c) => c.talk.every((b) => b.who && b.say)));
ok('每拍至少一个回话', CH.every((c) => c.talk.every((b) => b.replies && b.replies.length >= 1)));
ok('每个回话都有 label/hint/say', CH.every((c) => c.talk.every((b) => b.replies.every(
  (r) => r.label && r.hint && (r.say || r.say === '__ENDING__')))));

// ---------------- 2. 拍数 / 字数体量 ----------------
const beats = CH.reduce((a, c) => a + c.talk.length, 0);
let chars = 0;
for (const c of CH) {
  chars += (c.story || '').length;
  for (const b of c.talk) {
    chars += b.say.length;
    for (const r of b.replies || []) chars += (r.say || '').length + (r.close || '').length;
  }
  for (const k in (c.endings || {})) {
    for (const b of c.endings[k].beats) chars += (b.say || '').length;
  }
}
ok('总拍数 >= 60', beats >= 60, `实际 ${beats}`);
ok('总字数 >= 18000（约 1.8 万字）', chars >= 18000, `实际 ${chars}`);
ok('每章正文 >= 700 字', CH.every((c) => {
  let n = (c.story || '').length;
  for (const b of c.talk) { n += b.say.length; for (const r of b.replies || []) n += (r.say || '').length; }
  return n >= 700;
}), CH.filter((c) => {
  let n = (c.story || '').length;
  for (const b of c.talk) { n += b.say.length; for (const r of b.replies || []) n += (r.say || '').length; }
  return n < 700;
}).map((c) => c.id).join(','));

// ---------------- 3. 局内四夜：章节 ←→ 关卡 一对一 ----------------
const live = CH.filter((c) => c.levelId != null);
// 第 63 块：s05/s06 接上第五、六关 —— 局内从 4 夜变 6 夜（用户定：总共 18 夜 = 18 关）
// 第 71 块：第七关「骨塔井底」接了 s07，局内变成 7 夜绑 1~7 关
// 第 81 块：s08 接上第八关 → 8 夜
// 第 82 块：s09 接上第九关（「骨塔登记庭」）→ 9 夜
// 第 107 块：s10 接上第十关（「塔顶井台」）→ 10 夜
// 第 114 块：s11 接上第十一关（「钟楼雾原」）→ 11 夜；第 116 块：s12 接上第十二关 → 12 夜
ok('局内有 12 夜', live.length === 12, `实际 ${live.length}`);
ok('局内十二夜分别绑 1~12 关', live.map((c) => c.levelId).sort((a,b)=>a-b).join() === '1,2,3,4,5,6,7,8,9,10,11,12');
ok('局内每夜都在第 2 回合结束触发', live.every((c) => c.atRound === 2));
ok('其余 6 夜 levelId 为 null（第十三夜起还没接关）', CH.filter((c) => c.levelId == null).length === 6);

// ---------------- 4. 调度：storyChapterAt ----------------
ok('第 1 关第 1 回合不播（还没到 2 回合）', storyChapterAt(1, 1, {}) === null);
ok('第 1 关第 2 回合播 s01', storyChapterAt(1, 2, {})?.id === 's01');
ok('已经看过就不再播', storyChapterAt(1, 2, { s01: true }) === null);
ok('第 2 关第 2 回合播 s02', storyChapterAt(2, 2, {})?.id === 's02');
ok('第 3 关第 2 回合播 s03', storyChapterAt(3, 2, {})?.id === 's03');
ok('第 4 关第 2 回合播 s04', storyChapterAt(4, 2, {})?.id === 's04');
ok('第 2 关不会播到第 1 关的夜', storyChapterAt(2, 2, {})?.levelId === 2);
ok('第 4 回合补播漏掉的夜（读档跳过也能补）', storyChapterAt(1, 9, {})?.id === 's01');
ok('不存在的关卡返回 null', storyChapterAt(99, 5, {}) === null);
ok('levelId 为 null 不会命中', storyChapterAt(0, 20, {}) === null);

// ---------------- 5. 印记：只在局内三夜、每夜恰好三种 ----------------
const markChapters = CH.filter((c) => c.talk.some((b) => b.replies.some((r) => r.mark)));
ok('带印记的章节正好 3 章', markChapters.length === 3,
  markChapters.map((c) => c.id).join(','));
ok('印记章节就是局内三夜', markChapters.every((c) => c.levelId != null));
for (const c of markChapters) {
  const kinds = c.talk.flatMap((b) => b.replies.filter((r) => r.mark).map((r) => r.mark));
  ok(`${c.id} 恰好三个印记选项`, kinds.length === 3, `实际 ${kinds.length}`);
  ok(`${c.id} 三个印记互不相同`, new Set(kinds).size === 3, kinds.join(','));
  ok(`${c.id} 印记都是合法类型`, kinds.every((k) => MARK_INFO[k]));
  ok(`${c.id} 印记选项都带效果`, c.talk.flatMap((b) => b.replies.filter((r) => r.mark))
    .every((r) => r.effects && (r.effects.rep || r.effects.gold || r.effects.hp || r.effects.permanent)));
}

// ---------------- 6. 结局 ----------------
ok('四个结局都在', Object.keys(STORY_ENDINGS).length === 4);
ok('三个主结局 + 隐藏', ['laughter', 'name', 'memory', 'none'].every((k) => STORY_ENDINGS[k]));
ok('结局都有标题/图标/一句话',
  Object.values(STORY_ENDINGS).every((e) => e.title && e.icon && e.line));
ok('s18 有四个分支文本', Object.keys(CH[17].endings).length === 4);
ok('每个结局至少 3 段', Object.values(CH[17].endings).every((e) => e.beats.length >= 3));
ok('结局段落都有说话人与台词',
  Object.values(CH[17].endings).every((e) => e.beats.every((b) => b.who && b.say)));

ok('三交笑声 → 笑到最后', storyEndingKey({ laughter: 2, name: 1 }) === 'laughter');
ok('三交名字 → 被记住', storyEndingKey({ name: 3 }) === 'name');
ok('三交记忆 → 被忘掉', storyEndingKey({ memory: 2, laughter: 1 }) === 'memory');
ok('各交一次 → 隐藏', storyEndingKey({ laughter: 1, name: 1, memory: 1 }) === 'none');
ok('一次都没交 → 隐藏', storyEndingKey({}) === 'none');
ok('两笑一名 → 笑到最后', storyEndingKey({ laughter: 2, name: 1 }) === 'laughter');
ok('两笑一记 → 笑到最后', storyEndingKey({ laughter: 2, memory: 1 }) === 'laughter');

// ---------------- 7. 终章结构：最后一拍靠 __ENDING__ 占位 ----------------
const lastBeat = CH[17].talk[CH[17].talk.length - 1];
const hasEndingSlot = lastBeat.replies.some((r) => r.say === '__ENDING__');
ok('终章最后一拍留了结局占位', hasEndingSlot);
ok('结局占位没有 go（点了就结算）', lastBeat.replies.every((r) => r.say !== '__ENDING__' || r.go == null));

// ---------------- 8. 按 id 查 / 已看计数 ----------------
ok('按 id 能查到', storyChapterById('s09')?.no === 9);
ok('查不到返回 null', storyChapterById('nope') === null);
ok('已看计数', storySeenCount({ s01: true, s03: true }) === 2);

// ---------------- 9. 配角出场（这是这次的主线要求） ----------------
const allText = CH.map((c) => JSON.stringify(c)).join('');
for (const who of ['蛙爷', '阿速', '阿井', '小满', '空白']) {
  const n = (allText.match(new RegExp(who, 'g')) || []).length;
  ok(`配角「${who}」出场（出现 ${n} 次）`, n >= 2, `仅 ${n}`);
}

// ---------------- 10. 奶蛙梗：随机抽查几个关键词 ----------------
const memes = ['齁', '画错', '生母', '抽象', '躺平', '上岸', '内卷', '功德', '木鱼', '立牌', '黄色三幻神', '系统派的单'];
for (const m of memes) {
  ok(`梗「${m}」在稿子里`, allText.includes(m));
}

// ---------------- 收尾 ----------------
console.log(`\n主线测试：${pass} 通过 / ${fails.length} 失败`);
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log(`章数 ${CH.length} · 拍数 ${beats} · 正文约 ${chars} 字`);
