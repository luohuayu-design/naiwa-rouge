# 第 90 块：文档（关卡事件表.txt）里「生命 -N.N」的文案同步翻倍（单遍，避免链式放大）
import io
import re

MAP = {1.0: 2.0, 1.5: 3.0, 2.0: 4.0, 3.0: 6.0}
PAT = re.compile(r'生命 -([0-9.]+)')

p = '关卡事件表.txt'
src = io.open(p, encoding='utf-8', newline='').read()
hits = []


def fn(m):
    v = float(m.group(1))
    nv = MAP.get(v)
    if nv is None:
        return m.group(0)
    hits.append(v)
    return '生命 -%.1f' % nv


out = PAT.sub(fn, src)
io.open(p, 'w', encoding='utf-8', newline='').write(out)
print('替换', len(hits), '处：', {v: hits.count(v) for v in sorted(set(hits))})
