// ============================================================
// guide.js —— 攻略面板（第 62 块，用户需求）
//
// 触发：战败后弹的「温馨提示」上加一个「查看攻略」按钮。
// 形态：手风琴 —— 三组（武器类 / 属性加成类 / 技能类），点标题展开，
//       每条再点开看「它到底是什么 / 什么时候最强 / 什么时候别用」。
//
// 文案原则（用户 2026-10-24 提的例子）：
//   不讲数值表，讲**判断**。「雷剑人越多越强」「万剑齐发留到被围的时候」——
//   这些是新手输一局之后真正需要知道的东西。
// ============================================================

export const GUIDE_SECTIONS = [
  // ================= 武器类 =================
  {
    id: 'weapon',
    title: '武器类',
    icon: '⚔',
    lead: '环上的剑决定你「怎么打人」。数量靠商店买，种类靠运气和取舍 —— 混着带，别只堆一种。',
    items: [
      {
        name: '铁剑',
        sub: '稳定输出 · 没有花招',
        body: '没有附加效果，胜在便宜可靠。环上每多一把剑，就是一个「多碰一次」的机会 —— 前几关的正确答案几乎永远是先买剑，把环从 1 把填到 4、5 把，再谈花活。',
        best: '开局、清杂兵、你不确定该买什么的时候。买它不会错，只是不会给你惊喜。',
        warn: '后期人多的时候最吃亏：它一次只打一只，而雷剑能打全场、冰剑能买时间。第 12 回合以后还在只堆铁剑，会觉得「怎么打都打不完」。',
      },
      {
        name: '雷剑',
        sub: '闪电连锁 · 怪越密越强',
        body: '命中时一道闪电打到场上所有怪身上，每道 45% 伤害。注意是**全场**，不管多远、不管有多少只，也不管它们在不在你背后 —— 五种元素里只有它是「不限距离」的。',
        best: '被围住、怪扎堆涌过来的时候 —— 一记命中等于同时打了十几只，是全场最强的一张清场牌。第六关那种「同一波里挤着四五个重启体」的场面，它一次能把一整层血都削下去。',
        warn: '单挑一只怪时几乎等于白板（45% 也就是多挠一下）。剩最后一只别指望它，那时候带冰剑或铁剑更实在。',
      },
      {
        name: '冰剑',
        sub: '命中炸开一圈 · 全部冻住 1.6 秒',
        body: '命中点周围一圈（7.0 格）里的怪**全部**被冻住 1.6 秒，定身期间既不能动也不能出手。投手的骨刀、蛮牛的冲锋、孢生菇的孵化、擦名者的擦名读条全都会被这一下掐断 —— 它买的是「时间」，不是伤害。',
        best: '对面有冲锋 / 读条 / 跳劈这类「一出手就很疼」的怪时，先冻住再拆；怪挤成一排的时候更值，一次冻一片。第五关的擦名者尤其吃这一下：冻住它就跑不掉，剑也就拿得回来。',
        warn: '冻住的怪也打不到你，所以别把它当输出手段。它的价值在「节奏」，不在「数字」。',
      },
      {
        name: '毒剑',
        sub: '一片中毒 · 持续掉血可叠时间',
        body: '命中点周围一圈（7.0 格）里的怪全部中毒：每秒 0.15 毒伤、持续 5 秒，重复命中会把时间叠上去。它不吃护甲：盾兵举盾也照样往下掉。',
        best: '皮厚的大怪（盾斧兽人、孢冠菌王、戴盾的重甲兵）和你打不动的东西。怪挤成一堆的时候收益翻倍 —— 一圈下去十几只一起掉血。',
        warn: '小兵一刀就死，毒还没跳就没了。快攻流、清杂兵为主的关卡别带它。',
      },
      {
        name: '血剑',
        sub: '一圈回血 · 按总伤害算',
        body: '命中时血色的环向外扫一圈：按「这一剑对周围所有怪造成的总伤害 × 15%」回血。一圈扫到五只，就按五只的总伤害算 —— 这是它和别的元素剑最大的区别。',
        best: '站撸流、怪多但你攻速快的时候 —— 越是围着你，回得越猛。血剑 + 吸血 + 高攻速是同一套东西的三个零件。',
        warn: '血少的时候它救不了你：伤害不够，回得也少。命快见底先用回血技能，再考虑血剑。',
      },
      {
        name: '震剑',
        sub: '一圈震退 · 打断蓄力',
        body: '命中点周围一圈里的**每一只**怪各自 35% 概率被推开 1.4 格，同时打断它正在做的动作（蓄力 / 读条 / 冲锋 / 跳劈）。被推开的怪要重新走过来 —— 你白赚了一段安全时间。',
        best: '对面有「一读条就出事」的怪：骨骑冲锋、孵骨召唤、孢生菇孵化、擦名者读条。一场里只要有两只这种怪，震剑就值得带；怪挤在一起时能一次推散一整片。',
        warn: '把怪推散对雷剑和箭雨是反效果（它们要怪扎堆），组队前先想清楚你这一局靠「扎堆」还是靠「打断」赢。',
      },
      {
        name: '法器（地刺 / 霜环 / 震钟 / 棘甲 / 暖炉 / 路口灯 / 绝缘斗篷 / 镇牌铃）',
        sub: '商店里买的「被动解场」',
        body: '地刺踩上去掉血、霜环减速、震钟敲一下把周围全打断、棘甲挨打反伤、暖炉持续烧身边、路口灯把隐身怪照出来并减速、绝缘斗篷让你站在漏电地板上不掉血、镇牌铃让第八关的寄存柜收牌变慢。它们不需要你操作，站得越久越值。',
        best: '地刺 / 暖炉：你懒得管、只想站桩的时候。震钟：对面有一读条就出事的怪。路口灯：场上有会隐身的雾鬼时（**唯一的反隐手段**）。绝缘斗篷：第六关那种地上漏电的场地 —— 穿上它，那块地板就从惩罚变成你的武器（**只在第六关商店出售**）。镇牌铃：第八关不想让寄存处看守出来的时候（**只在第八关第 9 / 12 回合的商店出售**）。',
        warn: '前五个都属「守株待兔」型 —— 你得让怪走到它上面，怪被你追着打散时收益很低。后三件更挑关卡：没有雾鬼、没有漏电地板、没有寄存柜，它们基本等于白买。',
      },
    ],
  },

  // ================= 属性加成类 =================
  {
    id: 'attr',
    title: '属性加成类',
    icon: '📈',
    lead: '升级卡和商店给的是「底层数值」。挑属性要看这一局你打算怎么活 —— 别什么都点一点。',
    items: [
      {
        name: '吸血',
        sub: '按伤害比例回血',
        body: '每一刀打出去的伤害，按比例变成你的血。它是「越能打越能活」的滚雪球属性 —— 伤害越高、出手越密，回得越快；反过来，你打不出伤害的时候它就等于没有。',
        best: '攻速和攻击都起来之后；配合血剑是站撸流的两条腿，环转一圈回来血就满了，敢一直站在怪堆里。',
        warn: '只点吸血不点攻击，等于回了空气 —— 伤害是分母。开局第一张卡点吸血是最常见的浪费。',
      },
      {
        name: '攻击速度',
        sub: '环转得更快',
        body: '环上的剑转得快 = 单位时间碰到的次数多。它是几乎所有输出属性的乘数：攻击、暴击、毒、吸血全都跟着它放大，所以攻速永远比同等价位的攻击更值。',
        best: '你已经有 5 把以上的剑时，一点攻速抵一点攻击的两三倍收益 —— 它乘的是「剑的数量 × 每次伤害」两个数。',
        warn: '剑很少的时候点攻速收益很低（转得再快也没几把剑）。先买剑，再点攻速，顺序反了会输得很憋。',
      },
      {
        name: '攻击 / 攻击范围',
        sub: '一刀多疼 · 剑转的圈多大',
        body: '攻击决定单次伤害；攻击范围决定环的半径 —— 范围同时是你的拾取半径（金币进圈就吸），所以它其实是「输出 + 捡钱」双属性。',
        best: '范围在前几关很好用：不追人、边跑边吸钱；攻击在中后期补。前期把钱捡干净，等于白拿一截商店预算。',
        warn: '范围堆太大，近战判定会「提前打到」，但你也更容易同时惹到一群。怪打不过的时候，大圈反而是负担。',
      },
      {
        name: '防御',
        sub: '减法减伤 · 最多减 70%',
        body: '受到的伤害先减掉防御值，最低保底 1 点。但防御最多只能减掉 70% —— 无论堆到多高，每一下都还得吃至少 30% 的伤害，它永远压不到 0。',
        best: '被小兵贴身自爆烦到的时候最值：小兵的伤害基数本来就只有一两点，加两点防御就把满场小怪全变成挠痒痒。',
        warn: '后期间伤害涨到六七点，防御的边际收益一路往下掉，而且永远到不了免伤 —— 堆到四五点就该停手，把命交给走位。',
      },
      {
        name: '暴击 / 暴击伤害',
        sub: '按概率放大单次伤害',
        body: '暴击率和暴击倍率是一对：没有率，倍率永远不生效；没有倍率，率再高也只是普通伤害。两个一起点才叫暴击，只点一个就是白板。',
        best: '攻速高、出手多的时候（出手越多，暴击越容易落到实处）。它和攻速是朋友，和「慢慢磨」的流派没关系。',
        warn: '概率这种东西，一局里可能就是不给你面子 —— 别把命押在它上面，尤其别在血少的时候赌暴击。',
      },
      {
        name: '生命上限 / 生命回复',
        sub: '能扛几下 · 慢慢回',
        body: '上限就是「还能被试错几次」。第 87 块把每秒回复砍到 0.05~0.16 以后，它只够抹掉零星的擦伤 —— 真正让你活过 20 回合的是上限本身：血够厚，才敢在怪堆里换血。',
        best: '打算打满 20 回合、或者进第六关以后（怪伤害 ×1.35）。事件里给上限的选项现在普遍是 +2~+8，是最稳的一条生存线。',
        warn: '血量存量路线最怕「没有恢复手段」：上限再高，一路掉下去也是死。药水、篝火、事件回血要留一两个兜底。',
      },
      {
        name: '幸运',
        sub: '影响好事件和好卡的出现',
        body: '幸运越高，抽到吉兆型奇遇、高品质升级卡的概率越大。它不直接变强，但它决定你这一局「运气好不好」—— 而运气在这游戏里是能换算成资源的。',
        best: '你觉得这一局手气差的时候 —— 它是唯一能改手气的属性。配合「民心」高的时候触发的好事件，收益会翻倍。',
        warn: '前几关点它看不出来，属于长期投资。命快没了的时候别点，那是拿命换彩票。',
      },
      {
        name: '金币掉落',
        sub: '同一只怪掉更多钱',
        body: '直接乘在金币掉落上。金币是所有商店东西的来源：多一把剑、多一件法器都靠它，而商店每 3 回合才开一次 —— 所以这是最容易被低估、回报又最慢兑现的属性。',
        best: '你发现这一局「想买的东西都差一点钱」的时候。早点点它，后面每一只怪都在替你还钱。',
        warn: '命快没了就别点了 —— 钱得活着才花得出去。它是滚雪球属性里最需要「先活下来」的那种。',
      },
    ],
  },

  // ================= 技能类 =================
  {
    id: 'skill',
    title: '技能类',
    icon: '✦',
    lead: '技能栏在右下角，一格一个键。它们都有冷却 —— 什么时候按，比按多少次重要。',
    items: [
      {
        name: '万剑齐发',
        sub: '技能 1 · 冷却 6 秒 · 向四周辐射你拥有的每一把剑',
        body: '把你拥有的每一把剑一次性朝四周射出去（射出去的剑会自己飞回来），不打乱环上正在转的那些。你买的剑越多，这一下越壮观 —— 它是「剑的数量」这件事的总兑现。',
        best: '**被围住的时候**。四面都是怪、环顾不过来的那两秒，按下去等于把所有剑同时甩一圈。怪越密越值，因为每把剑都打到了东西。',
        warn: '怪只有一两只、还在你正前方的时候按，等于把剑浪费在空气里。冷却 6 秒不算长，但也别一路空放。',
      },
      {
        name: '箭雨',
        sub: '技能 2 · 冷却 8 秒起 · 在最近的怪头上落一片箭',
        body: '锁定最近的一群怪，在它们头顶标出一片区域，片刻后群箭落下。它是范围伤害，不是单体 —— 落点看的是「那群怪现在挤在哪」。三选一的箭雨卡和商店的「强化箭袋」都能让它更强（更多箭 / 更疼 / 更大圈 / 更快转好）。',
        best: '怪扎堆、或者远程怪站桩的时候 —— 它们不动，箭就全落在它们头上。配合冰剑先冻住一片，箭雨就能吃满。',
        warn: '怪散开时落空一大半。先走两步把它们引到一起再按，别对着零星几只放。',
      },
      {
        name: '回血',
        sub: '技能 3 · 冷却 25 秒 · 瞬间回 5 点（第四关通关后解锁）',
        body: '不用读条、不会被打断，按下去当场回 5 点血，不超上限。满血时按不动 —— 它不会吃掉你的冷却，所以可以放心先点一下试试。',
        best: '血量见底、无敌帧刚过去，而下一波已经贴到脸上的那一瞬间。它是「再撑一波」的底气，不是治疗站。',
        warn: '它只回 5 点，救不了被围住的你。冷却 25 秒意味着一局里大概只能按 6~8 次，别把它当常规续航。',
      },
    ],
  },
];

// 渲染成手风琴：组标题点一下展开/收起，条目再点一下展开详情。
// 全部用 DOM 拼（不拼字符串），文案里有中文引号和加粗标记，走 textContent 更安全。
//
// 第 64 块修：文案里的 **加粗** 以前是原样打到屏幕上的（textContent 不认 markdown），
// 玩家看到的是「注意是**全场**」。现在由 richText 把这个标记渲染成真正的 <b>。
export function richText(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text == null ? '' : text).split('**');
  parts.forEach((seg, i) => {
    if (!seg) return;
    if (i % 2 === 1) {
      const b = document.createElement('b');
      b.className = 'gd-b';
      b.textContent = seg;
      frag.appendChild(b);
    } else {
      frag.appendChild(document.createTextNode(seg));
    }
  });
  return frag;
}
export function renderGuide(root, { openSection = 'weapon' } = {}) {
  root.textContent = '';
  for (const sec of GUIDE_SECTIONS) {
    const box = document.createElement('section');
    box.className = 'gd-sec';
    box.dataset.sec = sec.id;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'gd-sec-hd';
    head.setAttribute('aria-expanded', 'false');
    const ic = document.createElement('span');
    ic.className = 'gd-sec-ic';
    ic.textContent = sec.icon;
    const ti = document.createElement('span');
    ti.className = 'gd-sec-t';
    ti.textContent = sec.title;
    const ct = document.createElement('span');
    ct.className = 'gd-sec-c';
    ct.textContent = sec.items.length + ' 条';
    const ar = document.createElement('span');
    ar.className = 'gd-sec-ar';
    ar.textContent = '›';
    head.append(ic, ti, ct, ar);

    const body = document.createElement('div');
    body.className = 'gd-sec-bd';
    const lead = document.createElement('p');
    lead.className = 'gd-lead';
    lead.textContent = sec.lead;
    body.appendChild(lead);

    for (const it of sec.items) {
      const row = document.createElement('div');
      row.className = 'gd-item';
      const rh = document.createElement('button');
      rh.type = 'button';
      rh.className = 'gd-item-hd';
      const nm = document.createElement('span');
      nm.className = 'gd-item-n';
      nm.textContent = it.name;
      const sb = document.createElement('span');
      sb.className = 'gd-item-s';
      sb.textContent = it.sub;
      const ia = document.createElement('span');
      ia.className = 'gd-item-ar';
      ia.textContent = '+';
      rh.append(nm, sb, ia);

      const bd = document.createElement('div');
      bd.className = 'gd-item-bd';
      const mk = (cls, label, text) => {
        const p = document.createElement('p');
        p.className = 'gd-p ' + cls;
        if (label) {
          const b = document.createElement('b');
          b.textContent = label;
          p.appendChild(b);
        }
        p.appendChild(richText(text));
        return p;
      };
      bd.appendChild(mk('gd-p-what', '是什么 · ', it.body));
      bd.appendChild(mk('gd-p-best', '最强的时候 · ', it.best));
      bd.appendChild(mk('gd-p-warn', '注意 · ', it.warn));

      rh.addEventListener('click', () => {
        const open = row.classList.toggle('open');
        rh.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      row.append(rh, bd);
      body.appendChild(row);
    }

    // 真正的手风琴：开一组就收起其它组（同一时间只展开一组）
    head.addEventListener('click', () => {
      const willOpen = !box.classList.contains('open');
      for (const other of root.querySelectorAll('.gd-sec')) {
        if (other === box) continue;
        other.classList.remove('open');
        const oh = other.querySelector('.gd-sec-hd');
        if (oh) oh.setAttribute('aria-expanded', 'false');
      }
      box.classList.toggle('open', willOpen);
      head.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    box.append(head, body);
    root.appendChild(box);
    if (sec.id === openSection) {
      box.classList.add('open');
      head.setAttribute('aria-expanded', 'true');
    }
  }
}
