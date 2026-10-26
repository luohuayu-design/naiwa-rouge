"""第 83 块：从 enemy.js 删除队形系统（ranker / bearer / squads）。

按「锚点文本」定位，删完逐条打印，方便核对。用 newline='' 读写，避免 CRLF。
"""
import io
import re

P = 'js/enemy.js'
src = io.open(P, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def idx(pred, start=0, what=''):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    raise SystemExit('anchor not found: ' + what)


def cut(a, b):
    """删除 [a, b]（含两端）"""
    del lines[a:b + 1]


# ---------- 1. ranker / bearer 两个类型 ----------
i_title = idx(lambda s: s.strip() == '// 第八关 · 骨塔寄存层（第 81 块）—— 无名者', 0, 'ranker title')
i_end = idx(lambda s: s.strip() == '// 第九关 · 骨塔登记庭（第 82 块）—— 称量官', i_title, 'weigher title')
start = i_title - 1          # 上面那行 ====
end = i_end - 2              # 第九关 ==== 前面的空行
assert lines[start].strip().startswith('// ===='), lines[start]
assert lines[i_end - 1].strip().startswith('// ===='), lines[i_end - 1]
print('1) ranker/bearer 类型：删 %d 行（%s … %s）' % (end - start + 1, lines[start].strip()[:24], lines[end].strip()[:24]))
cut(start, end)

# ---------- 2. spawn 里的 joinSquad ----------
i = idx(lambda s: 'if (cfg.squad) joinSquad(e, opts.newSquad, opts.squadRef);' in s, 0, 'joinSquad call')
# 往上 3 行注释 + 1 行空行
j = i
while lines[j - 1].strip().startswith('//') or lines[j - 1].strip() == '':
    j -= 1
print('2) spawn 编队：删 %d 行' % (i - j + 1))
cut(j, i)

# ---------- 3. die() 里的旗手崩散 ----------
i = idx(lambda s: '第 81 块：旗手倒下 → 整队「散架」' in s, 0, 'leader stun')
j = idx(lambda s: s.strip() == 'if (onDeath) onDeath(e);', i, 'onDeath')
print('3) 旗手崩散：删 %d 行' % (j - i))
cut(i, j - 1)

# ---------- 4. 队形系统整段 ----------
i = idx(lambda s: s.strip() == '// 第八关 · 无名者的队形（第 81 块）', 0, 'squad section')
j = idx(lambda s: s.strip() == 'function updateOne(e, dt, ctx) {', i, 'updateOne')
start = i - 1
while lines[start - 1].strip() == '':
    start -= 1
print('4) 队形系统：删 %d 行' % (j - start))
cut(start, j - 1)

# ---------- 5. updateOne 里的分派 ----------
i = idx(lambda s: 'if (e.cfg.squad) { handleSquadMember(e, dt, ctx); return; }' in s, 0, 'squad dispatch')
j = i
while lines[j - 1].strip().startswith('//') or lines[j - 1].strip() == '':
    j -= 1
print('5) 分派分支：删 %d 行' % (i - j + 1))
cut(j, i)

# ---------- 6. takeDamage 里的双倍伤害 ----------
i = idx(lambda s: 'const stunMul = e.squadStunMul || 1;' in s, 0, 'stunMul')
j = i
while lines[j - 1].strip().startswith('//'):
    j -= 1
cut(j, i)
i = idx(lambda s: 'const dealt = (red > 0 ? amount * (1 - red) : amount) * stunMul;' in s, 0, 'dealt')
lines[i] = lines[i].replace(' * stunMul', '')
print('6) 双倍伤害：已删')

# ---------- 7. 分离循环的同队跳过 ----------
i = idx(lambda s: 'if (a.squad && a.squad === b.squad) continue;' in s, 0, 'separate skip')
j = i
while lines[j - 1].strip().startswith('//'):
    j -= 1
print('7) 分离跳过：删 %d 行' % (i - j + 1))
cut(j, i)

# ---------- 8. reset 里的队伍清理 ----------
i = idx(lambda s: 'squads.length = 0;' in s, 0, 'reset squads')
print('8) reset：删 1 行 ->', lines[i].strip())
cut(i, i)

# ---------- 9. 导出的四个队伍调试口 ----------
i = idx(lambda s: 'squadCount: () => squads.length,' in s, 0, 'squadCount')
j = idx(lambda s: 'eraseCast: () => {' in s, i, 'eraseCast')
k = j
while lines[k - 1].strip().startswith('//'):
    k -= 1
print('9) 调试导出：删 %d 行' % (k - i))
cut(i, k - 1)

io.open(P, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('done, %d lines left' % len(lines))
