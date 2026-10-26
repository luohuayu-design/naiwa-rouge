# 统计 events 四个文件里 effects / cost 的 hp 分布（只读）
import io
import re

FILES = ['js/events.js', 'js/eventsExtra.js', 'js/eventsSide.js', 'js/repEvents.js']
BLOCK_PAT = re.compile(r'effects\s*:\s*\{')
COST_PAT = re.compile(r'cost\s*:\s*\{')
HP_PAT = re.compile(r'\bhp\s*:\s*(-?[0-9.]+)')


def blocks(src, pat):
    out = []
    for m in pat.finditer(src):
        i = m.end() - 1
        depth = 0
        for j in range(i, len(src)):
            c = src[j]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    out.append((m.start(), j + 1, src[i + 1:j]))
                    break
    return out


grand = {}
for f in FILES:
    src = io.open(f, encoding='utf-8').read()
    cnt, ccnt = {}, {}
    for a, b, body in blocks(src, BLOCK_PAT):
        for m in HP_PAT.finditer(body):
            v = float(m.group(1))
            cnt[v] = cnt.get(v, 0) + 1
            grand[v] = grand.get(v, 0) + 1
    for a, b, body in blocks(src, COST_PAT):
        for m in HP_PAT.finditer(body):
            v = float(m.group(1))
            ccnt[v] = ccnt.get(v, 0) + 1
    print(f, dict(sorted(cnt.items())), '| cost', dict(sorted(ccnt.items())))
print('ALL effects.hp', dict(sorted(grand.items())))
print('正数合计', sum(n for v, n in grand.items() if v > 0),
      '| 负数合计', sum(n for v, n in grand.items() if v < 0))
