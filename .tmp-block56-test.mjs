// 第 56 块 —— 用户五条
// 纯 Node 跑：`node .tmp-block56-test.mjs`（cwd = naiwa-rouge）
//   A 生命条统一大小（enemy.js createBar：固定世界宽度，不再随缩放变）
//   B 后续关卡开局自带环剑（profile.ringGot + main.js prefillRing）
//   C 万剑齐发改版（CD + 辐射 n=拥有数 + 不动环绕；技能介绍/教程/卡片文案同步）
//   D 冰剑冻结 + 雷剑连锁全场（属性表/升级卡/商店/教程/敌人冻结机制）
//   E 技能栏让开教程卡（--sk-lift + syncSkillLift）
import fs from 'fs';
import { ringObtained, markRingObtained } from './js/profile.js';
import { UPGRADES } from './js/upgrade.js?v=87';

let pass = 0, fail = 0;
const fails = [];
// 参数顺序：cond 在前、名字在后（写反会打一屏假绿）
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function sec(t) { console.log('\n—— ' + t + ' ——'); }

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const htmlSrc = read('./index.html');
const mainSrc = read('./js/main.js');
const cssSrc = read('./style.css');
const enemySrc = read('./js/enemy.js');
const weaponSrc = read('./js/weapon.js');
const skillsSrc = read('./js/skills.js');
const profSrc = read('./js/profile.js');
const wstatsSrc = read('./js/weaponStats.js');
const upgradeSrc = read('./js/upgrade.js');
const shopSrc = read('./js/shop.js');
const kindsSrc = read('./js/swordKinds.js');

// ============================================================
// A. 生命条统一大小（用户第 1 条）
// ============================================================
sec('A、生命条统一大小');

ok(/const BAR_W = 1\.5;/.test(enemySrc), '有统一宽度常量 BAR_W');
ok(/const BAR_LIFT = 0\.95;/.test(enemySrc), '头顶抬升常量 BAR_LIFT');
ok(/spr\.scale\.set\(BAR_W, BAR_W \* \(H \/ W\), 1\)/.test(enemySrc), '血条宽度用固定的 BAR_W（不随身高/缩放）');
ok(/spr\.position\.y = hh \+ BAR_LIFT;/.test(enemySrc), '挂高仍按实际头顶（缩放怪的脑袋在别的高度）');
ok(!/\* 1\.18/.test(enemySrc), '宽度不再按身高 ×1.18 算（旧的「随身高」写法没了）');
ok(!/0\.95 \* Math\.max\(0\.7, scale\)/.test(enemySrc), '抬升不再随 scale 缩放（卫队 0.7 / 菌王 3.24 一个样）');
ok(/const hh = cfg\.height \* scale;/.test(enemySrc), '仍按 cfg.height × scale 取实际头顶（卫队/菌王的定位不能飘）');
ok(/createBar\(cfg, scaleMul\)/.test(enemySrc), 'spawn 里照旧把 scaleMul 传进去（定位要用）');

// ============================================================
// B. 后续关卡开局自带环剑（用户第 2 条）
// ============================================================
sec('B、后续关卡开局自带环剑');

ok(/ringGot: false,/.test(profSrc), 'DEFAULT_PROFILE 有 ringGot 字段');
ok(/export function ringObtained\(\)/.test(profSrc), 'profile.js 导出 ringObtained()');
ok(/export function markRingObtained\(\)/.test(profSrc), 'profile.js 导出 markRingObtained()');
ok(/ringObtained, markRingObtained/.test(mainSrc), 'main.js 导入了这两个函数');

// 功能：真模块跑一遍（内存档，不落盘也没关系）
markRingObtained();
ok(ringObtained() === true, 'markRingObtained 之后 ringObtained() 为真');
const again = markRingObtained();
ok(again === false, '重复标记返回 false（幂等，不会反复写档）');

// main.js 的 prefillRing：四道闸 + 送的东西
// 第 66 块给 prefillRing 加了参数（{ quiet }），正则不能写死空括号
const pre = (mainSrc.match(/function prefillRing\([^)]*\)[\s\S]*?\n  }/) || [''])[0];
ok(pre.length > 50, 'main.js 里有 prefillRing()');
ok(/if \(weapon\.granted\) return;/.test(pre), '闸 1：这一局已经有了就不送');
// 第 65 块（用户第 8 条）：技能的「有 / 无」不再看现在打第几关，只看**有没有解锁过**。
// 所以原来那条「第一关不送」的闸拆了 —— 反过来断言它已经不在。
ok(!/curLevelId < 2/.test(pre), '闸 2 已拆：不再按关卡判断（重打第一关也带着，第 65 块）');
ok(/if \(!ringObtained\(\)\) return;/.test(pre), '闸 3：没拿到过就不送');
ok(/weapon\.grant\(\);/.test(pre), '送的就是最初那 3 把铁剑（weapon.grant）');
ok(/if \(rainUnlockedBefore\(\)\) \{[\s\S]{0,80}?arrowRain\.unlock\(\);/.test(pre),
  '箭雨改按「解锁过没有」判断（rainUnlockedBefore）');
ok(/function rainUnlockedBefore\(\)/.test(mainSrc), 'main.js 有 rainUnlockedBefore()');
ok(/markRainObtained\(\);/.test(pre), '送箭雨时把「已获得」记进档案');
ok(/renderSkill\(\);/.test(pre), '送完立刻刷技能栏');
ok(/queueWeaponTut\('ring'\)/.test(pre), '没看教程的补教（看过的会被 wtSeen 拦下）');
ok(/setLevel\(pendingLevelId\);[\s\S]{0,400}?prefillRing\(\);/.test(mainSrc), 'startPlay 里 setLevel 之后调用 prefillRing');

// grantRingThen 里记档
const grant = (mainSrc.match(/function grantRingThen\(next\)[\s\S]*?\n  }/) || [''])[0];
ok(/markRingObtained\(\);/.test(grant), '第一关第 5 回合拿到环剑时记进档案（之后关卡才送）');

// 读档路线不能误触：续读走 weapon.restore，不走 startPlay
ok(/weapon\.restore\(saved\.weapon\)/.test(mainSrc), '读档仍走 weapon.restore（存档里有什么就还原什么）');

// ============================================================
// C. 万剑齐发改版（用户第 3 条）
// ============================================================
sec('C、万剑齐发：CD + 辐射 n 把');

ok(/const FIRE_CD = 6\.0;/.test(weaponSrc), '冷却常量 FIRE_CD = 6 秒');
ok(/let fireCd = 0;/.test(weaponSrc), '有 fireCd 状态');
ok(/if \(!granted \|\| fireCd > 0\) return false;/.test(weaponSrc), '冷却中按不动（fire 直接返回 false）');
ok(/const n = owned\.length;/.test(weaponSrc), 'n = 拥有的总剑数（不是环上恢复了几把）');
ok(/if \(n === 0\) return false;/.test(weaponSrc), '一把都没有时不放（兜底）');
ok(/flyers\.push\(\{ kind: owned\[i\], holder: acquire\(owned\[i\]\), a, ox: p\.x, oz: p\.z, dist: 0, spin: -a \}\);/.test(weaponSrc),
  '辐射的剑按 owned 顺序取元素、全走对象池');
ok(!/orbiting\.length = 0;/.test((weaponSrc.match(/function fire\([\s\S]*?\n  }/) || [''])[0]),
  'fire 不再清空环绕（释放技能不改变正在环绕的数量）');
ok(/fireCd = FIRE_CD \* cdMul;/.test(weaponSrc), '放完进入冷却（乘冷却缩减属性）');
ok(/if \(fireCd > 0\) fireCd = Math\.max\(0, fireCd - dt\);/.test(weaponSrc), 'update 里冷却走表');
ok(/get fireReady\(\)/.test(weaponSrc) && /get fireCdLeft\(\)/.test(weaponSrc)
  && /get fireCdTotal\(\)/.test(weaponSrc) && /get fireCdProgress\(\)/.test(weaponSrc),
  '对外暴露 fireReady / fireCdLeft / fireCdTotal / fireCdProgress');
ok(/fireCd = 0;/.test((weaponSrc.match(/function reset\(\)[\s\S]*?\n  }/) || [''])[0]), 'reset 时冷却一起归零');

// 技能定义：ready/progress/cdText/hint 全换成 CD 语义
ok(/ready: \(ctx\) => ctx\.playing && ctx\.weapon\.granted && ctx\.weapon\.fireReady/.test(skillsSrc), '技能就绪条件 = 冷却走完');
ok(/progress: \(ctx\) => \(ctx\.weapon\.granted \? ctx\.weapon\.fireCdProgress : 0\)/.test(skillsSrc), '按钮进度条 = 冷却填充');
ok(/cdText: \(ctx\) => \(ctx\.weapon\.granted && !ctx\.weapon\.fireReady/.test(skillsSrc), '冷却中显示剩余秒数');
ok(/hint: '向四周辐射出你拥有的每一把剑（不影响环上转的），冷却 6 秒'/.test(skillsSrc), '技能介绍改了说法（辐射 / 不影响环上 / 冷却）');
ok(!/把环上的剑一次全射出去/.test(skillsSrc) && !/每两把之间再补一把/.test(skillsSrc), '旧的「全射出去 / 每两把补一把」说法已清');
ok(!/regenProgress/.test(skillsSrc), '技能栏不再用恢复进度（那是环剑补剑的，不是技能 CD）');

// 教程与武器卡文案同步
ok(/你拥有的每一把剑都会向四周辐射出去（商店买的也算，不影响环上正在转的）。冷却 6 秒/.test(mainSrc), '环剑教程第三步换成新说法');
ok(!/把环上的剑一次全射出去（每两把之间再补一把）/.test(mainSrc), '教程里的旧说法已清');
ok(/你拥有的每一把剑都向外辐射（不影响环上转的）/.test(htmlSrc), '武器卡上的技能一行同步改');

// ============================================================
// D. 冰剑冻结 + 雷剑连锁全场（用户第 4 条）
// ============================================================
sec('D、冰剑冻结 + 雷剑全场连锁');

// 属性表
ok(/key: 'frostTime',\s+name: '冰冻持续',\s+base: 1\.6/.test(wstatsSrc), 'frostTime 改成「冰冻持续」1.6 秒（第 64 块上调）');
ok(/key: 'chainRatio',\s+name: '闪电伤害',\s+base: 0\.45/.test(wstatsSrc), 'chainRatio 0.45（每道闪电的伤害比例，第 64 块上调）');
ok(!/key: 'frostSlow'/.test(wstatsSrc), 'frostSlow（旧冰缓）已从属性表撤掉');
ok(!/key: 'chainCount'/.test(wstatsSrc), 'chainCount（旧链数）已从属性表撤掉');

// weapon.js 的元素效果
ok(/const fz = \{ time: wstats\.get\('frostTime'\) \};/.test(weaponSrc) && /for \(const o of around\) enemies\.applyFreeze\(o, fz\);/.test(weaponSrc), '冰剑命中 → applyFreeze 波及一圈（不再是 applySlow）');
ok(!/applySlow/.test(weaponSrc), 'weapon.js 不再调用 applySlow');
ok(/enemies\.chainTargets\(e, Infinity, Infinity\)/.test(weaponSrc), '雷剑连锁目标 = 全场（不限只数不限距离）');
ok(/const ratio = wstats\.get\('chainRatio'\);/.test(weaponSrc), '闪电伤害走 chainRatio');
ok(/const MAX_BOLT_VIS = 8;/.test(weaponSrc) && /if \(vis < MAX_BOLT_VIS\) \{ bolt\(e\.pos, tgt\.pos\); vis\+\+; \}/.test(weaponSrc),
  '闪电线只画最近的 8 道（全场链也不糊屏）');

// enemy.js 的冻结机制
ok(/freezeT: 0,/.test(enemySrc) && /freezeFxT: 0,/.test(enemySrc), '敌人有 freezeT / freezeFxT 字段');
ok(/function applyFreeze\(e, \{ time \}\) \{/.test(enemySrc), 'enemy.js 实现 applyFreeze');
ok(/e\.freezeT = Math\.max\(e\.freezeT, time\);/.test(enemySrc), '冰冻时长取更强的（后命中刷新）');
ok(/applyDot, applySlow, applyFreeze, chainTargets,/.test(enemySrc), 'applyFreeze 进了系统导出');
ok(/frozenCount: \(\) =>/.test(enemySrc), '有 frozenCount 观测口（测试用）');
ok(/if \(e\.freezeT > 0 && e\.state !== 'dead'\) \{/.test(enemySrc), '冰冻分支只拦活怪（死亡消散不受影响）');
ok(/e\.mixer\.timeScale = 0;/.test(enemySrc), '冻住时动画也停');
ok(/if \(e\.mixer\.timeScale === 0\) e\.mixer\.timeScale = 1;/.test(enemySrc), '解冻后恢复动画（兜底）');

// 升级卡 / 商店 / 种类文案
// 第 73 块：卡池改成生成式的「一族三档」，源码里已经没有字面量卡片了 ——
// 改成直接读运行时的卡（小档与原版同 id 同数值，这两条断言的语义不变）。
const card73 = (id) => UPGRADES.find((u) => u.id === id);
const chill73 = card73('chill');
ok(chill73 && chill73.stat === 'frostTime' && Math.abs(chill73.flat - 0.6) < 1e-9
  && chill73.title === '冰冻 +0.6 秒', `「严寒」卡改成延长冰冻（第 64 块 +0.6，实际 ${chill73 && chill73.title}）`);
const volt73 = card73('volt');
ok(volt73 && volt73.stat === 'chainRatio' && Math.abs(volt73.flat - 0.20) < 1e-9
  && volt73.title === '闪电伤害 +20%', `「导电」卡改成加强闪电伤害（第 64 块 +20%，实际 ${volt73 && volt73.title}）`);
ok(!/stat: 'chainCount'/.test(upgradeSrc) && !/stat: 'frostSlow'/.test(upgradeSrc), '升级卡不再引用旧属性键');
ok(/命中点周围 7\.0 格内的怪全部冻住 1\.6 秒/.test(shopSrc), '商店冰剑文案：一片冻住 1.6 秒（第 68 块半径改 7.0 格）');
ok(/一道闪电打到场上所有怪（不限距离、不限只数）/.test(shopSrc), '商店雷剑文案：全场连锁');
ok(/tagline: '一片冻住'/.test(kindsSrc), '冰剑 tagline 是「一片冻住」');
ok(/每道 45% 伤害（属性可升级）/.test(kindsSrc), '雷剑描述改「所有怪 + 45%」');
ok(!/命中后减速/.test(kindsSrc), '种类表里不再写「命中后减速」');

// ============================================================
// E. 技能栏让开教程卡（用户第 5 条）
// ============================================================
sec('E、技能按钮让开技能介绍');

ok(/bottom:calc\(16px \+ var\(--sk-lift,0px\) \+ env\(safe-area-inset-bottom\)\)/.test(cssSrc), '#skillBar 底边距走 --sk-lift 变量');
ok(/transition:bottom \.22s ease/.test(cssSrc), '上移有 0.22s 过渡（平滑滑上去，不跳变）');
ok(/function syncSkillLift\(\)/.test(mainSrc), 'main.js 有 syncSkillLift()');
const lift = (mainSrc.match(/function syncSkillLift\(\)[\s\S]*?\n  \}/) || [''])[0];
// 第 65 块：居中的提示卡（.hint-card）不参与抬升计算，否则技能栏会被顶到屏幕中间
ok(/document\.querySelector\('\.tut-card\.on:not\(\.hint-card\)'\)/.test(lift),
  '只认 .tut-card.on 且排除居中的 .hint-card（新手教程 + 武器教程共用此类）');
ok(/skillBar\.style\.setProperty\('--sk-lift', '0px'\)/.test(lift), '没有卡片时归零（平时仍贴右下角）');
ok(/\(window\.innerHeight - top\) \+ 12 - 16/.test(lift), '抬升量 = 卡片顶边换算出来的差值 + 12px 间距');
ok(/Math\.min\(lift, Math\.max\(0, window\.innerHeight - barH - 24\)\)/.test(lift), '有上限保护（横屏矮屏不许把整栏顶出屏幕）');
ok(/window\.addEventListener\('resize', syncSkillLift\)/.test(mainSrc), '窗口尺寸变化时重新量');
ok(/orientationchange/.test(mainSrc), '手机横竖屏切换也重新量');
// 调用点：开 / 换步 / 收 三处都不能少
ok((mainSrc.match(/syncSkillLift\(\);/g) || []).length >= 7, '调用点够多（武器教程开/换步/收 + 新手教程开/换步/收 + startPlay 收）');
ok(/wtRender\(\);\n    syncSkillLift\(\);/.test(mainSrc), '武器教程换步后重新量（文案换了高度会变）');
ok(/syncSkillLift\(\);          \/\/ 第 56 块：卡片收了，技能栏落回右下角/.test(mainSrc), '教程收起时归零');

// 用实测几何验算一遍公式：最坏情况（320px 宽、最长文案卡高 235px、底边距底 86px）
// 卡片顶边距底 86+235=321；要求技能栏底边 ≥ 卡片顶 + 12 = 333；公式给 16 + lift，
// lift = 321 + 12 - 16 = 317 → 底边 333 ✓（两个按钮 126px 高时顶边 207，全在卡片下方）
{
  const cardTopFromBottom = 86 + 235;
  const lift2 = cardTopFromBottom + 12 - 16;
  const barBottom = 16 + lift2;
  ok(barBottom >= cardTopFromBottom + 12, `公式算得过最坏的卡（底边 ${barBottom} ≥ 卡片顶+12 = ${cardTopFromBottom + 12}）`);
  ok(16 + lift2 + 126 < 844, 'iPhone 竖屏高度下整栏仍在屏幕内');
}

// ============================================================
// 结果
// ============================================================
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fails.length) console.log('失败项：\n  ' + fails.join('\n  '));
process.exit(fail ? 1 : 0);
