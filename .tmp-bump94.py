import os, re, io

OLD, NEW = '104', '105'

def rw(p):
    with open(p, 'r', encoding='utf-8', newline='') as f:
        t = f.read()
    n = t.replace('?v=' + OLD, '?v=' + NEW)
    if n != t:
        with open(p, 'w', encoding='utf-8', newline='') as f:
            f.write(n)
    return t.count('?v=' + OLD)

tot = 0
for root, dirs, files in os.walk('js'):
    for fn in sorted(files):
        if fn.endswith('.js'):
            tot += rw(os.path.join(root, fn))
# index.html 里的 style.css 与 main.js（入口），第 76 块起 sv 里还有一处
rw('index.html')
print('js ?v= replaced:', tot)
