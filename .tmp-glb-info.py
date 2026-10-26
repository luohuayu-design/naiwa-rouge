"""列出 glb 的动画名 / 节点名 / 网格数 / 贴图数（只读 JSON chunk，不依赖 three）"""
import json
import struct
import sys


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not glb'
    off = 12
    js = None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        off += 8
        if ctype == 0x4E4F534A:
            js = data[off:off + clen].decode('utf-8')
        off += clen
    return json.loads(js)


for p in sys.argv[1:]:
    g = read_glb(p)
    print('==', p)
    print('  meshes', len(g.get('meshes', [])), 'nodes', len(g.get('nodes', [])),
          'skins', len(g.get('skins', [])), 'images', len(g.get('images', [])),
          'materials', len(g.get('materials', [])))
    print('  animations:', [a.get('name') for a in g.get('animations', [])])
    print('  roots:', [g['nodes'][i].get('name') for i in g['scenes'][0]['nodes']])
    print('  nodeNames:', [n.get('name') for n in g['nodes']][:12])
