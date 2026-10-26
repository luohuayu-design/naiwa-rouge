"""第 83 块：重写第八关（删队形怪 / 掉牌机制 / 看守）"""
import io
import re

P = 'js/wave.js'
s = io.open(P, 'r', encoding='utf-8', newline='').read()

start = s.index("// ============================================================\n// 第八关 · 骨塔寄存层（第 81 块）")
end = s.index("// ============================================================\n// 第九关 · 骨塔登记庭（第 82 块）")

NEW = """// ============================================================
// 第八关 · 骨塔寄存层（第 81 块立，第 83 块重做）
//
// 剧情接 s08《一百层台阶》：骨塔的台阶是螺旋的，每一级都刻着名字。
// 第七十层是个大平台，平台边上有间木头柜子 —— 这一层的骷髅死后，
// 胸前那块被雾吹花了的木牌会被它收进去。
//
// 【第 83 块为什么整个换掉】用户原话：「那个一起移动的问题太大，直接换掉」。
// 旧机制是「一排不追人的骷髅 + 旗手崩散 + 柜子攒 8 块放出一支新队伍」，
// 队形系统（槽位 / 法线对齐 / 撞墙换向 / 崩散）整块删了，两只队形怪也删了。
// 现在的循环短得多，也硬得多：
//
//   任何一只怪死 → 木牌进柜（柜面 8 格可见）
//   → 玩家可以走到柜边按「取牌」，敲对一串四位数字 → 柜里牌子全清
//   → 攒满 8 块就**封柜**，5 秒后**寄存处看守**走出来（三套攻击 + 半血暴怒）
//
// 所以这一关真正的压力不是「场上有多少怪」，而是「你敢不敢停下来按键」：
// 取牌面板不暂停游戏，12 秒里怪还在追你。
//
// 场地：arena 18 —— 比第七关的窄井（13）宽，因为要留出绕到柜边清牌的空间；
//       比第六关机房（19）略小，位置上的容错更低（柜子那侧只有一条窄路）。
// 数值：hp 0.34 / dmg 0.20，整体系数 hpMul 1.28 / dmgMul 1.55（七关是 1.20 / 1.45）。
//       看守的数值单列在 enemy.js 的 warden（hp 20 / 三套攻击 / 半血 ×1.4），
//       不吃这里的 hpMul 之外的额外加成 —— 一只就够硬了。
// ============================================================
export const LEVEL_8 = {
  id: 8,
  name: '第八关 · 骨塔寄存层',
  theme: 'ossuary',         // 第 81 块：骨白 + 灰绿 + 干白雾（scene.js 的 THEMES）
  arena: 18,
  order: [
    ['minion', 1], ['warrior', 1.6], ['archer', 2.0], ['bowman', 2.2],
    ['leaper', 2.2], ['wraith', 2.4], ['shielder', 2.4], ['mender', 2.6],
    ['brood', 2.6], ['reboot', 2.8], ['charger', 2.8],
  ],
  spawnRadius: 16.2,
  spawnJitter: 0.5,
  minPlayerDistance: 8.0,
  minSpawnGap: 2.4,
  gapScale: 1.35,
  gap: 2.6,
  upgradeAfter: [1, 2, 3, 4, 5, 8, 10, 12, 15, 17, 19, 20],
  shopAfter: [3, 6, 9, 12, 15, 18],
  weaponAt: 4,
  scale: { hp: 0.34, damage: 0.20, speed: 0.035, hpMul: 1.28, dmgMul: 1.55 },
  // 寄存柜：不在场地里，立在边界石圈外面（像间哨亭）。
  //   x/z 是柜子中心，r 是它的碰撞半径，summon 是封柜开门时放出来的怪。
  //   玩家走到场地边缘（r≈17.7）离柜子 1.5 格，落在「取牌」范围（3.6）里。
  //   summon 也进 levelTypes()，所以进关时看守的模型就一起预载好了（第 83 块）。
  deposit: { x: 0, z: -19.2, r: 1.5, summon: 'warden' },
  rounds: [
    // ---- 第一幕（R1~R4）：寄存层 · 认识柜子 ----
    { minion: 4, warrior: 1, archer: 0, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.90, tip: '骨塔第七十层：场边那间木柜是寄存柜 —— 每死一只怪，木牌都会被它收进去' },
    { minion: 5, warrior: 2, archer: 1, bowman: 0, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.84, tip: '柜面有 8 个格子，右下角写着已经收了几块' },
    { minion: 5, warrior: 2, archer: 2, bowman: 1, leaper: 0, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.80, tip: '走到柜子旁边，屏幕底下会冒出「取牌」按钮' },
    { minion: 6, warrior: 3, archer: 2, bowman: 1, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.76, tip: '按下取牌会给你一串四位数字：用面板上的键盘敲进去，敲完自动判定' },
    // ---- 第二幕（R5~R8）：清柜 ----
    { minion: 6, warrior: 3, archer: 2, bowman: 2, leaper: 1, wraith: 0, shielder: 0, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.72, tip: '输对了柜里的牌子全被取走 —— 趁场上没几只的时候按' },
    { minion: 6, warrior: 3, archer: 3, bowman: 2, leaper: 2, wraith: 0, shielder: 1, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.70, tip: '面板不暂停游戏：按键盘的时候怪还在往你身上走' },
    { minion: 7, warrior: 3, archer: 3, bowman: 2, leaper: 2, wraith: 1, shielder: 1, brood: 0, mender: 0, reboot: 0, charger: 0, gap: 0.66, tip: '输错或超时只是白跑一趟，牌子还在柜里，3 秒后能再按' },
    { minion: 7, warrior: 4, archer: 3, bowman: 2, leaper: 2, wraith: 1, shielder: 2, brood: 0, mender: 1, reboot: 0, charger: 0, gap: 0.62, tip: '攒满 8 块会**当场封柜** —— 到那一刻就再也清不掉了' },
    // ---- 第三幕（R9~R13）：看守 ----
    { minion: 7, warrior: 4, archer: 3, bowman: 3, leaper: 2, wraith: 1, shielder: 2, brood: 1, mender: 1, reboot: 0, charger: 0, gap: 0.60, tip: '封柜 5 秒后柜门打开：寄存处看守会自己走出来' },
    { minion: 8, warrior: 4, archer: 3, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, charger: 0, gap: 0.58, tip: '看守有三套攻击：贴脸横扫、中距砸地、拉远了投木牌' },
    { minion: 8, warrior: 5, archer: 4, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, charger: 0, gap: 0.56, tip: '地上亮起金圈就往外走：那是落锤的位置，站里面必挨' },
    { minion: 8, warrior: 5, archer: 4, bowman: 3, leaper: 3, wraith: 2, shielder: 2, brood: 1, mender: 1, reboot: 1, charger: 1, gap: 0.54, tip: '它半血之后会暴怒：移速和出手频率一起涨，别在原地跟它换血' },
    { minion: 8, warrior: 5, archer: 4, bowman: 4, leaper: 3, wraith: 2, shielder: 3, brood: 1, mender: 1, reboot: 1, charger: 1, gap: 0.52, tip: '别等它出现：这一关的正解是满 8 块之前清一次' },
    // ---- 第四幕（R14~R17）：两个机制一起压 ----
    { minion: 9, warrior: 5, archer: 4, bowman: 4, leaper: 3, wraith: 3, shielder: 3, brood: 2, mender: 1, reboot: 1, charger: 1, gap: 0.50, tip: '雾鬼也来了：一种是隐着身的，一种是明着走过来的' },
    { minion: 9, warrior: 6, archer: 4, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 1, charger: 1, gap: 0.48, tip: '投牌是从柜子那个方向飞过来的：别背对着柜子打' },
    { minion: 9, warrior: 6, archer: 5, bowman: 4, leaper: 4, wraith: 3, shielder: 3, brood: 2, mender: 2, reboot: 2, charger: 1, gap: 0.46, tip: '第 16 回合：这一层的牌子从来收不完' },
    { minion: 10, warrior: 6, archer: 5, bowman: 4, leaper: 4, wraith: 3, shielder: 4, brood: 2, mender: 2, reboot: 2, charger: 2, gap: 0.44, tip: '第 17 回合：每一波都要绕到柜边一次，取牌就是「顺路」' },
    // ---- 第五幕（R18~R20）：毕业考 ----
    { minion: 10, warrior: 6, archer: 5, bowman: 5, leaper: 4, wraith: 4, shielder: 4, brood: 2, mender: 2, reboot: 2, charger: 2, gap: 0.42, tip: '还剩三回合：血别花在看守身上' },
    { minion: 10, warrior: 7, archer: 5, bowman: 5, leaper: 5, wraith: 4, shielder: 4, brood: 3, mender: 2, reboot: 3, charger: 2, gap: 0.40, tip: '倒数第二波：先看一眼柜里有几块，再决定要不要输出' },
    { minion: 11, warrior: 7, archer: 6, bowman: 5, leaper: 5, wraith: 4, shielder: 5, brood: 3, mender: 2, reboot: 3, charger: 2, gap: 0.38, tip: '最后一波：把这一层的牌子全收走' },
  ],
};

"""

s = s[:start] + NEW + s[end:]
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('LEVEL_8 rewritten')
