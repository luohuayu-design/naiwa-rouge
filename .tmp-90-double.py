# 第 90 块：把随机事件里「减少生命值」的数值整体翻倍。
#   · effects 里的 hp < 0（事件结算扣血）
#   · cost 里的 hp（选项代价，正数，语义是「要付多少点血」）
# 只处理最外层的 effects / cost 块（内层嵌套块由外层扫描覆盖，避免双重放大 —— 第 88 块的坑）。
# 文案不动：hint 的「生命 -N」上一轮已经单独翻过了。
import io
import re

FILES = ['js/events.js', 'js/eventsExtra.js', 'js/eventsSide.js', 'js/repEvents.js']
# 键是绝对值；effects 里只认负值（正的 +2/+4 是第 88 块翻过的上限，绝不能再翻）
EFF_MAP = {1.0: 2.0, 1.5: 3.0, 2.0: 4.0, 3.0: 6.0}
COST_MAP = {1.0: 2.0, 2.0: 4.0}

BLOCK_PAT = re.compile(r'effects\s*:\s*\{')
COST_PAT = re.compile(r'cost\s*:\s*\{')
HP_PAT = re.compile(r'hp:\s*(-?[0-9.]+)')


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
                    out.append((m.start(), j + 1))
                    break
    return out


def outer(src, pat):
    allb = blocks(src, pat)
    return [(a, b) for a, b in allb
            if not any((a2 < a and b <= b2) for a2, b2 in allb)]


def fmt(v):
    return '%g' % abs(v)


def rewrite(src, ranges, table, sign):
    def fn(m):
        v = float(m.group(1))
        if sign < 0 and v >= 0:
            return m.group(0)
        if sign > 0 and v <= 0:
            return m.group(0)
        nv = table.get(abs(v))
        if nv is None:
            return m.group(0)
        return 'hp: ' + ('-' if sign < 0 else '') + fmt(nv)

    n = 0
    for a, b in sorted(ranges, reverse=True):
        seg = src[a:b]
        new = HP_PAT.sub(fn, seg)
        if new != seg:
            n += sum(1 for mm in HP_PAT.finditer(seg) if float(mm.group(1)) * sign > 0)
            src = src[:a] + new + src[b:]
    return src, n


total_eff = total_cost = 0
for f in FILES:
    src = io.open(f, encoding='utf-8', newline='').read()
    src, n1 = rewrite(src, outer(src, BLOCK_PAT), EFF_MAP, -1)
    src, n2 = rewrite(src, outer(src, COST_PAT), COST_MAP, +1)
    io.open(f, 'w', encoding='utf-8', newline='').write(src)
    print(f, 'effects 扣血改动', n1, '| cost 代价改动', n2)
    total_eff += n1
    total_cost += n2
print('合计 effects', total_eff, '| cost', total_cost)
