// 把「关卡事件表.txt」里每个选项的「→ 后半句」按当前代码重算。
// 只改「   · 选「label」→ xxx」这一类行，故事、标题、章节一个字不动。
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_EVENTS, eventChoices, effectLines, costShort } from './js/events.js';

const PATH = '关卡事件表.txt';
const src = readFileSync(PATH, 'utf8');
const lines = src.split('\n');

// 标题 → 事件（标题重复的按先出现的算；报告一下）
const byTitle = new Map();
const dupTitle = [];
// 用全表查：连锁后续 / 民心事也会在文档后半段列出来
for (const ev of ALL_EVENTS) {
  if (!ev.title) continue;
  if (byTitle.has(ev.title)) dupTitle.push(ev.title);
  else byTitle.set(ev.title, ev);
}

function tail(c) {
  const cost = costShort(c);
  const parts = [];
  if (cost) parts.push('代价 ' + cost);
  const eff = c.effects ? effectLines(c.effects) : [];
  if (!eff.length) parts.push(c.effects && c.effects.roll ? '（概率分支，见游戏内）' : '无变化');
  else parts.push(eff.join('、'));
  return parts.join('；');
}

let cur = null, changed = 0, unmatched = [];
const out = lines.map((line) => {
  // 图标可能是 emoji（星平面，占两个 UTF-16 码元），用 \p{Extended_Pictographic}+ 整体吃
  const mTitle = line.match(/^ {2}(\p{Extended_Pictographic}+)\s(.+?)　——\s*(.*)$/u);
  if (mTitle) {
    // 标题后面可能跟着标记：⟳ 连锁 / 💬 对话，查表前先摘掉
    cur = byTitle.get(mTitle[2].trim().replace(/\s*[⟳💬]+$/, '')) || null;
    return line;
  }
  const mChoice = line.match(/^( {5}· 选「)(.+?)(」→ ?)(.*)$/);
  if (!mChoice) return line;
  const label = mChoice[2];
  if (!cur) { unmatched.push('[无事件] ' + label); return line; }
  const c = eventChoices(cur).find((x) => x.label === label);
  if (!c) { unmatched.push('[' + cur.id + '] ' + label); return line; }
  const next = mChoice[1] + label + mChoice[3] + tail(c);
  if (next !== line) changed++;
  return next;
});

writeFileSync(PATH, out.join('\n'), 'utf8');
console.log('改了', changed, '行');
console.log('标题重复:', [...new Set(dupTitle)].join(' / ') || '无');
console.log('没对上:', unmatched.length);
console.log(unmatched.slice(0, 20).join('\n'));
