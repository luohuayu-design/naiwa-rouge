#!/usr/bin/env python3
# ============================================================
# .tmp-shrink-glb.py —— 裁剪 GLB 的动画（第 63 块补回来的回归工具）
#
# 为什么需要它：KayKit 的角色包每只都带 76 段动画（3.6MB），而本游戏一只怪
# 只需要 5 段（idle / walk / death / hit / cast）。之前几块把 skeleton-*.glb
# 从 3.6MB 压到 660KB 用的就是这个思路，但脚本没留下来。
#
# 做法（不依赖任何库，纯标准库解析 GLB）：
#   1. 拆 GLB（12 字节头 + JSON chunk + BIN chunk）
#   2. 只保留名字在 --keep 里的 animations
#   3. 从「保留下来的动画 + 网格 + 蒙皮 + 贴图」里收集真正用到的 accessor
#   4. 把 accessor 引用的 bufferView 原样拷进新 BIN（view 内部偏移不变，
#      所以 accessor.byteOffset 不用改），重新编号
#   5. 拼回 GLB
#
# 用法：
#   python .tmp-shrink-glb.py 输入.glb 输出.glb Idle Walking_A Death_A Hit_A Spellcast_Long
# ============================================================
import json
import struct
import sys

COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def read_glb(path):
    d = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<III', d[:12])
    assert magic == 0x46546C67, '不是 GLB'
    off = 12
    js = None
    bin_ = b''
    while off < len(d):
        clen, ctype = struct.unpack('<II', d[off:off + 8])
        body = d[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(body.decode('utf-8'))
        elif ctype == 0x004E4942:
            bin_ = body
        off += 8 + clen
    return js, bin_


def write_glb(j, bin_, path):
    jb = json.dumps(j, separators=(',', ':')).encode('utf-8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bb = bin_ + b'\x00' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + (8 + len(bb) if bb else 0)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(jb), 0x4E4F534A) + jb
    if bb:
        out += struct.pack('<II', len(bb), 0x004E4942) + bb
    open(path, 'wb').write(out)


def shrink(src, dst, keep_names):
    j, bin_ = read_glb(src)
    anims = j.get('animations', [])
    keep = [a for a in anims if a.get('name') in keep_names]
    missing = [n for n in keep_names if not any(a.get('name') == n for a in anims)]
    if missing:
        print('  ! 模型里没有这些动画（已跳过）:', missing)
    print('  动画 %d → %d' % (len(anims), len(keep)))

    used_acc = set()

    def acc(i):
        if i is not None:
            used_acc.add(i)

    # 动画
    for a in keep:
        for s in a.get('samplers', []):
            acc(s.get('input'))
            acc(s.get('output'))
    # 网格 / 蒙皮 / 贴图
    for m in j.get('meshes', []):
        for p in m.get('primitives', []):
            for v in p.get('attributes', {}).values():
                acc(v)
            acc(p.get('indices'))
            for t in p.get('targets', []) or []:
                for v in t.values():
                    acc(v)
    for s in j.get('skins', []):
        acc(s.get('inverseBindMatrices'))

    # bufferView 的收集顺序 = 新 BIN 的排布顺序
    used_bv = []

    def bv(i):
        if i is not None and i not in used_bv:
            used_bv.append(i)

    for ai in sorted(used_acc):
        a = j['accessors'][ai]
        bv(a.get('bufferView'))
        sp = a.get('sparse')
        if sp:
            bv(sp['indices'].get('bufferView'))
            bv(sp['values'].get('bufferView'))
    for im in j.get('images', []):
        bv(im.get('bufferView'))

    # ---- 重排 BIN：逐个 view 原样拷贝 ----
    src_views = j.get('bufferViews', [])
    new_bin = bytearray()
    view_map = {}
    new_views = []
    for new_idx, old_idx in enumerate(used_bv):
        v = dict(src_views[old_idx])
        start = v.get('byteOffset', 0)
        length = v['byteLength']
        pad = (4 - len(new_bin) % 4) % 4
        new_bin += b'\x00' * pad
        v['byteOffset'] = len(new_bin)
        new_bin += bin_[start:start + length]
        new_views.append(v)
        view_map[old_idx] = new_idx

    # ---- 重排 accessor ----
    acc_sorted = sorted(used_acc)
    acc_map = {old: new for new, old in enumerate(acc_sorted)}
    new_accs = []
    for old in acc_sorted:
        a = dict(j['accessors'][old])
        if a.get('bufferView') is not None:
            a['bufferView'] = view_map[a['bufferView']]
        sp = a.get('sparse')
        if sp:
            sp = dict(sp)
            sp['indices'] = dict(sp['indices'])
            sp['values'] = dict(sp['values'])
            sp['indices']['bufferView'] = view_map[sp['indices']['bufferView']]
            sp['values']['bufferView'] = view_map[sp['values']['bufferView']]
            a['sparse'] = sp
        new_accs.append(a)

    # ---- 动画里的 sampler 索引改成新编号 ----
    new_anims = []
    for a in keep:
        a2 = dict(a)
        a2['samplers'] = []
        for s in a.get('samplers', []):
            s2 = dict(s)
            s2['input'] = acc_map[s['input']]
            s2['output'] = acc_map[s['output']]
            a2['samplers'].append(s2)
        new_anims.append(a2)

    # ---- 贴图的 bufferView 也要跟着改编号 ----
    # ⚠️ 第 63 块的坑：这一步一开始漏了。images 里存的是**旧** bufferView 下标，
    # 重排后那个下标指向了别的东西（顶点数据），模型在网页里就渲染成纯白 ——
    # 而且不会报错，只是贴图没了。裁剪完必须肉眼验一张渲染图。
    for im in j.get('images', []):
        if im.get('bufferView') is not None:
            im['bufferView'] = view_map[im['bufferView']]

    j['accessors'] = new_accs
    j['bufferViews'] = new_views
    j['animations'] = new_anims
    j['buffers'] = [{'byteLength': len(new_bin)}]
    write_glb(j, bytes(new_bin), dst)


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print('用法: python .tmp-shrink-glb.py 输入.glb 输出.glb 动画名...')
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    keep = sys.argv[3:]
    print('裁剪 %s → %s' % (src, dst))
    shrink(src, dst, keep)
    import os
    print('  体积 %.0fKB → %.0fKB' % (os.path.getsize(src) / 1024, os.path.getsize(dst) / 1024))
