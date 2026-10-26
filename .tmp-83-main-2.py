"""第 83 块：提示卡支持多步 + 第八关寄存柜教程"""
import io

P = 'js/main.js'
s = io.open(P, 'r', encoding='utf-8', newline='').read()


def rep(old, new):
    global s
    assert old in s, 'anchor missing:\n' + old[:150]
    s = s.replace(old, new, 1)


# ---------------- 1. 新增一份「第八关 · 寄存柜」教程（多步） ----------------
rep("""    cast: {
      kicker: '地图知识 · 读条',""",
    """    // 第 83 块：第八关开局的专用教程（用户要求「这一块要专门设计新手教程」）。
    // 数据里写 steps：每一步一张卡，按钮从「下一步」变成「知道了」，
    // 世界在整个教程期间是冻住的（gameState='hint'）—— 讲机制的时候就该停。
    deposit: {
      kicker: '第八关 · 寄存柜',
      steps: [
        {
          kicker: '第八关 · 寄存柜 1/4',
          title: '每一只怪倒下，都会把木牌留在这间柜子里',
          text: [
            '场边那间木头柜子是这一层的<b>寄存柜</b>。这一层的骷髅胸前都挂着一块木牌 —— '
              + '牌子上本来刻着名字，被雾吹过只剩一道划痕。',
            '它们倒下时，牌子会被柜子收进去。柜面上有 <b>8 个格子</b>，'
              + '每进一块牌子就填满一格，右下角的数字是「已经收了几块」。',
            '注意：这一关<b>任何一只怪</b>死了都会掉牌，不只是某几种。',
          ],
        },
        {
          kicker: '第八关 · 寄存柜 2/4',
          title: '走到柜子旁边，会出现一个「取牌」按钮',
          text: [
            '站到柜子边（<b>3.6 格</b>内），屏幕底下会冒出「取牌」按钮 —— '
              + '上面写着柜里现在有几块牌子。',
            '按下去不是直接把牌拿走：柜子会亮出一串<b>四位数字</b>（比如 3928），'
              + '你要用面板上的键盘把它敲进去。',
            '为什么要多这一道：这是本关唯一「你自己能控制节奏」的地方，'
              + '多花两秒，换掉一场硬仗。',
          ],
        },
        {
          kicker: '第八关 · 寄存柜 3/4',
          title: '输满四位自动判定，错了牌子一块不少',
          text: [
            '面板<b>不会暂停游戏</b> —— 你按键盘的时候，怪还在往你身上走。'
              + '一次给 <b>12 秒</b>，右下角的细条就是剩余时间。',
            '输满四位<b>自动判定</b>：对了，柜里<b>所有</b>牌子一起被取走（计数归零）；'
              + '错了或者超时，面板会关掉，<b>3 秒后</b>才能再按一次。',
            '所以它是有代价的：想清柜，就得在安全的时候腾出手来。',
          ],
        },
        {
          kicker: '第八关 · 寄存柜 4/4',
          title: '攒满 8 块 → 封柜 5 秒 → 寄存处看守',
          text: [
            '八格全满的那一刻，柜子<b>当场封柜</b>：牌再也取不出来，地上亮起一圈金环，'
              + '<b>5 秒</b>之后柜门打开。',
            '走出来的东西叫<b>寄存处看守</b>：血量厚、有横扫 / 砸地 / 投牌三套攻击，'
              + '半血之后还会暴怒（更快、更疼）。它不是普通怪，是一场硬仗。',
            '所以这一关的正解是<b>算账</b>：在满 8 块之前找空档清一次，'
              + '而不是等它开门之后硬拼。',
          ],
        },
      ],
    },
    cast: {
      kicker: '地图知识 · 读条',""")

# ---------------- 2. 提示卡：支持 steps ----------------
rep("""  let hintOpen = false;
  let hintBack = 'playing';       // 关掉后回哪个状态（正常都是 playing）
  const hintQueue = [];           // 待弹的 key（FIFO）""",
    """  let hintOpen = false;
  let hintBack = 'playing';       // 关掉后回哪个状态（正常都是 playing）
  const hintQueue = [];           // 待弹的 key（FIFO）
  // 第 83 块：一张卡讲不完的机制（第八关寄存柜）走 steps ——
  // hintSteps 非空时，「知道了」变成「下一步」，逐条渲染同一张卡。
  let hintSteps = null;
  let hintStepIx = 0;""")

rep("""  function showHint(key, back) {
    const cfg = HINTS[key];
    if (!cfg || hintOpen) return false;
    hintOpen = true;
    hintBack = back || 'playing';
    hiKicker.textContent = cfg.kicker;
    hiTitle.textContent = cfg.title;
    hiText.innerHTML = cfg.text.map((t) => `<div>${t}</div>`).join('');
    hintCard.classList.add('on');""",
    """  // 渲染当前这一页（单页卡 = steps 里只有一条）
  function renderHintPage() {
    if (!hintSteps) return;
    const st = hintSteps[hintStepIx] || hintSteps[0];
    hiKicker.textContent = st.kicker || '';
    hiTitle.textContent = st.title || '';
    hiText.innerHTML = (st.text || []).map((t) => `<div>${t}</div>`).join('');
    hiOk.textContent = hintStepIx < hintSteps.length - 1 ? '下一步' : '知道了';
  }

  function showHint(key, back) {
    const cfg = HINTS[key];
    if (!cfg || hintOpen) return false;
    hintOpen = true;
    hintBack = back || 'playing';
    // 单页卡（heal / cast）也当成只有一步的 steps —— 只有一条代码路径
    hintSteps = cfg.steps || [{ kicker: cfg.kicker, title: cfg.title, text: cfg.text }];
    hintStepIx = 0;
    renderHintPage();
    hintCard.classList.add('on');""")

rep("""  function closeHint() {
    if (!hintOpen) return;
    hintOpen = false;
    hintCard.classList.remove('on');""",
    """  function closeHint() {
    if (!hintOpen) return;
    hintOpen = false;
    hintSteps = null;
    hintStepIx = 0;
    hintCard.classList.remove('on');""")

rep("""  hiOk.addEventListener('click', closeHint);""",
    """  hiOk.addEventListener('click', () => {
    // 还有下一页就翻页，最后一页才收卡
    if (hintSteps && hintStepIx < hintSteps.length - 1) {
      hintStepIx++;
      renderHintPage();
      audio.sfx('uiSwitch');
      return;
    }
    closeHint();
  });""")

# ---------------- 3. 开局排队：只在第八关，且调试模式默认不拦路 ----------------
rep("""  // 第一局「已经解锁回血」的开局：教一次那个绿十字（用户第 1 条）""",
    """  // 第 83 块：第八关开局讲一次寄存柜（一档只讲一次，写进档案 tut）。
  // ⚠️ 和「新怪信息卡」同一个约定（第 55 块）：生产默认开，调试要显式加 &hints ——
  // 它会冻结世界，老 CDP 套件一开局就被拦（block63/75 的花式超时都是这么来的）。
  function queueDepositHint() {
    if (curLevelId !== 8) return false;
    if (DEBUG && !params.has('hints')) return false;
    return queueHint('deposit');
  }

  // 第一局「已经解锁回血」的开局：教一次那个绿十字（用户第 1 条）""")

rep("""    queueHealHint();
    perfReset();""",
    """    queueHealHint();
    queueDepositHint();               // 第 83 块：第八关开局专门讲寄存柜
    perfReset();""")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('main.js patched step 2')
