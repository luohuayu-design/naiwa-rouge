import urllib.request, re, os, sys

PROXY = 'http://127.0.0.1:7897'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY}))

JOBS = [
    ('delapouite/wooden-crate.svg',      'box-wood.svg'),
    ('delapouite/strongbox.svg',         'box-silver.svg'),
    ('skoll/open-treasure-chest.svg',    'box-gold.svg'),
]

BASE = 'https://raw.githubusercontent.com/game-icons/icons/master/'
OUT = 'assets/icons'

def norm(txt):
    # 去掉自带的黑色底板
    txt = re.sub(r'<path[^>]*d="M0 0h512v512H0z"[^>]*/>', '', txt)
    txt = re.sub(r'<path[^>]*d="M\s*0\s+0h512v512H\s*0z"[^>]*/>', '', txt)
    txt = txt.replace('fill="#fff"', 'fill="currentColor"')
    txt = txt.replace("fill='#fff'", "fill='currentColor'")
    txt = re.sub(r'\s+', ' ', txt)
    return txt.strip()

for src, dst in JOBS:
    url = BASE + src
    try:
        raw = opener.open(url, timeout=40).read().decode('utf-8')
    except Exception as e:
        print('FAIL', src, e); continue
    n = norm(raw)
    if 'viewBox' not in n or 'currentColor' not in n:
        print('WARN', src, 'len', len(n), n[:120]); 
    open(os.path.join(OUT, dst), 'w', encoding='utf-8', newline='').write(n)
    print('OK', dst, len(n))
