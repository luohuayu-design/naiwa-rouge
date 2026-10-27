// ============================================================
// accordion.js —— 通用手风琴（第 94 块）
//
// 第 62 块的攻略面板先写了自己的一套（guide.js）。第 94 块要在盲盒奖池和
// 成就面板里再用两次，**不再复制第三份引擎** —— 抽成这个无状态的小模块：
//
//   renderAccordion(root, sections, opts)
//
// sections: [{ id, icon, title, count, sub, build(bodyEl) }]
//   · build 是**懒执行**的：第一次展开才建 DOM。盲盒三组共 65 行、成就八组共 67 行，
//     一次性全建出来在老手机上要几百毫秒，卡片打开那一下会明显顿一下。
//   · 建过一次就打上 built 标记，再展开直接复用（内容和存档无关的静态表）。
//     会变的（成就进度）由调用方自己 rebuild。
//
// 手风琴语义（single）：开一组就收起其它组，同一时刻只有一组是开的。
// 想要「爱开几组开几组」就传 multi:true —— 现在没有这个用法，留着是给以后。
//
// ⚠️ 收起的组不能只靠 opacity：淡出后留在 DOM 里的按钮还会吃点击（第 65 / 66 块
//    的血泪）。这里统一 `.ac-bd{visibility:hidden}` —— visibility 连命中测试都不参加。
// ============================================================

export function renderAccordion(root, sections, opts = {}) {
  const { openId = null, multi = false } = opts;
  if (!root) return null;
  root.textContent = '';
  const boxes = [];

  function setOpen(box, head, open) {
    box.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !box.dataset.built) {
      const body = box.querySelector('.ac-bd');
      if (body) {
        const sec = sections.find((s) => s.id === box.dataset.sec);
        if (sec && sec.build) sec.build(body);
        box.dataset.built = '1';
      }
    }
  }

  for (const sec of sections) {
    const box = document.createElement('section');
    box.className = 'ac-sec';
    box.dataset.sec = sec.id;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'ac-hd';
    head.setAttribute('aria-expanded', 'false');
    if (sec.icon) {
      // 第 94 块：单色 SVG 走 mask（外链 <img> 里的 currentColor 吃不到外面的 CSS
      // 颜色，会渲染成黑色）—— 用 currentColor 当填充色，颜色随 .on / 类别变。
      const im = document.createElement('i');
      im.className = 'ac-hd-ic';
      im.style.setProperty('--ic', `url(${sec.icon})`);
      head.appendChild(im);
    }
    const ti = document.createElement('span');
    ti.className = 'ac-hd-t';
    ti.textContent = sec.title;
    head.appendChild(ti);
    if (sec.count != null) {
      const ct = document.createElement('span');
      ct.className = 'ac-hd-c';
      ct.textContent = sec.count;
      head.appendChild(ct);
    }
    const ar = document.createElement('span');
    ar.className = 'ac-hd-ar';
    ar.textContent = '›';
    head.appendChild(ar);

    const body = document.createElement('div');
    body.className = 'ac-bd';
    if (sec.sub) {
      const sb = document.createElement('p');
      sb.className = 'ac-sub';
      sb.textContent = sec.sub;
      body.appendChild(sb);
    }

    head.addEventListener('click', () => {
      const willOpen = !box.classList.contains('open');
      if (!multi) {
        for (const other of boxes) {
          if (other.box !== box) setOpen(other.box, other.head, false);
        }
      }
      setOpen(box, head, willOpen);
    });

    box.append(head, body);
    root.appendChild(box);
    boxes.push({ box, head, id: sec.id });
  }

  const first = openId ? boxes.find((b) => b.id === openId) : null;
  if (first) setOpen(first.box, first.head, true);
  return { boxes, openFirst: (id) => { const b = boxes.find((x) => x.id === id); if (b) setOpen(b.box, b.head, true); } };
}
