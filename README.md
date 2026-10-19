# 蛙步 · 夜行（naiwa-rouge）

一个用 Three.js 做的**幸存者类肉鸽游戏**原型。角色是「奶蛙」，来自同作者的音游《蛙步》。
当前完成第 1 块：**3D 角色 + 浮动摇杆 + 可行走场景 + 属性系统**。敌人、战斗、升级还没做（怪物模型已入库）。

在线试玩：<https://luohuayu-design.github.io/naiwa-rouge/>

## 玩法

- 深夜草地圆形竞技场，可走半径 15（边界是发光草圈 + 石头圈，撞边会沿切向滑走，穿不出去）。
- **移动**：左半屏任意位置按住拖动，浮动摇杆就在落点出现；键盘 WASD / 方向键同样可用（斜向已归一化）。右侧 42% 屏幕预留给后续技能键。
- 角色朝向跟随移动方向平滑转身；走路是程序化动画（模型本身无骨骼、无动画）。
- 相机斜俯视约 49° 平滑跟随，注视点略超前；竖屏手机自动拉远。
- **属性面板**：左上角常驻血条（生命 100/100，低于 50% 变黄、25% 变红）+ 三个关键属性（移速/防御/暴击率）；点血条或「属性 ▸」展开完整面板（9 项属性 + 说明），点空白处 / ✕ / Esc 关闭。
- **移速真实生效**：属性里的移动速度直接驱动角色实际跑动（面板加成改了立刻生效）；生命回复在受伤后逐帧结算。
- 左上角 HUD 显示 FPS / 速度 / 坐标 / 朝向（0.25s 刷新一次，朝向已规范到 0~360°）。

## 运行

浏览器不允许 `file://` 下的 ES Module 与 fetch，所以**不能双击 index.html**，起个静态服务器即可：

```bash
# 在仓库根目录
python -m http.server 8000
# 然后打开 http://127.0.0.1:8000/
```

部署到任何静态托管（GitHub Pages / Netlify / Nginx）都是「整个仓库根目录当站点根」，无需构建。

## 目录结构

```
naiwa-rouge/
├── index.html              # 入口：画布 + 触摸层 + 摇杆 DOM + HUD + 加载遮罩 + importmap
├── style.css               # 深色 UI：浮动摇杆、HUD、首次提示、加载条
├── js/
│   ├── main.js             # 主循环：输入→速度→位移→边界→朝向→相机→渲染；可调参数在文件顶部
│   ├── stats.js            # 属性表：9 项基础属性、flat/pct 加成、生命与减伤/暴击公式（战斗直接调用）
│   ├── scene.js            # 场景：程序化草地贴图、月光阴影、雾、萤火虫、星空月亮、边界石圈
│   ├── frog.js             # 奶蛙：GLB 单网格 → 7 骨程序化绑骨 + 距离蒙皮；走/待机动画；加载失败有几何体兜底
│   ├── input.js            # 摇杆 + 键盘合成方向向量（摇杆优先）
│   └── joystick.js         # 浮动摇杆：落点出现、跟手钳制、死区、松手归零、只认第一根手指
├── lib/
│   ├── three.module.js     # Three.js r160（本地内置，不依赖 CDN）
│   └── jsm/
│       ├── loaders/GLTFLoader.js
│       └── utils/BufferGeometryUtils.js   # GLTFLoader 的依赖
├── assets/
│   ├── rigged.glb          # 奶蛙模型（719KB，单网格无骨骼，内嵌 3 张 WebP 贴图）
│   └── monsters/           # 怪物模型（KayKit Skeletons，CC0）
│       ├── skeleton-minion.glb   # 骷髅小兵 643KB
│       ├── skeleton-warrior.glb  # 骷髅战士 691KB
│       ├── skeleton-rogue.glb    # 骷髅盗贼 655KB
│       └── skeleton-mage.glb     # 骷髅法师 591KB
└── .gitignore
```

## 技术要点

- **Three.js 固定 r160**，通过 importmap 指向 `./lib/`，运行时零外部请求（除本地模型）。
- 模型是单网格、无骨骼、无动画（`KHR_mesh_quantization` 量化顶点 + `EXT_texture_webp` 贴图）。骨骼在 `frog.js` 里程序化生成：按顶点高度/横向位置分区 → 7 骨（pelvis/spine/head/armL/armR/legL/legR）→ 逐顶点按「到骨段距离」算蒙皮权重。
- **腿骨枢轴在胯部两侧**（不是脚底），走路才是绕胯摆动；腿骨蒙皮半径有上限，防止权重糊到肚子。
- 模型正面朝 **+Z**。换模型发现倒着走，改 `frog.js` 顶部 `MODEL_YAW = Math.PI`。
- 调手感改 `main.js` 顶部常量：`MOVE_SPEED`(4.4)、`ACCEL`(14)、`TURN_SPEED`(13)、`CAM_OFFSET`、`ARENA_R`(15)。
- 摇杆参数在 `joystick.js` 的 `createJoystick`：`maxRadius`(46px)、`leftRatio`(0.58)、`deadZone`(0.12)。
- **属性数值全部在 `stats.js` 的 `STAT_DEFS` 里调**（初始值/显示格式/说明），不用动 main.js。加成模型：`(基础值 + Σ加法) × (1 + Σ百分比)`，升级/道具只需 `stats.addMod({stat, flat|pct, src})`，撤销用 `removeBySource(src)`。
- 防御减伤固定公式 `伤害 × 100/(100+防御)`（100 防御 = 50% 减伤）；暴击判定 `rollDamage()` 已写好，第 2 块战斗直接用。
- 朝向内部是累加值（转身插值跨 ±180° 继续加减），只在 HUD 显示时规范到 0~360°。

## 怪物模型（已入库，未接入游戏）

来源 [KayKit - Character Pack: Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)，作者 Kay Lousberg，授权 **CC0**（可商用、可修改、无需署名，见其仓库 LICENSE.txt）。

- 原始模型 95 段动画占约 87% 体积（单只 ~4.7MB）。入库前用裁剪脚本（项目根 `.tmp-shrink-glb.py`）只保留 7 段游戏动画：`Idle / Walking_A / Running_A / Hit_A / Death_A / Spawn_Ground / Unarmed_Melee_Attack_Punch_A`，单只压到 591~691KB。
- 每只 41 骨骼、9 个 SkinnedMesh（蒙皮网格），动画由 Three `AnimationMixer` 驱动（与奶蛙的程序化动画是两套机制，接入时注意）。
- 已用无头 Chrome 验证：四只全部加载、蒙皮、`Walking_A` 播放正常。
- 敌人系统（第 2 块）尚未开始，模型先入库备用。

## 已验证

无头 Chrome（CDP）实测：模型 22022 顶点 / 7 骨 / 0 兜底顶点；键盘走位速度 4.40、朝向 180°/90° 正确；松键停稳；触摸摇杆按下即现、摇杆头钳制在 46px、松手归零；顶到边界后沿切向滑动不穿透。

属性系统：Node 单元测试 37 项（初始值/加成/撤销/减伤/生命边界/暴击判定/快照格式）全过；浏览器端 22 项（血条档位、面板 9 行、移速加成后实测 8.8、顺时针绕圈后朝向仍 0~360、控制台无报错）全过。

## 后续计划

- [x] 怪物模型入库（KayKit 骷髅 4 种，已裁剪验证）
- [ ] 敌人生成与波次
- [ ] 自动攻击（武器打最近的敌人）、伤害与死亡
- [ ] 升级三选一
- [ ] 房间推进与局内存档

## 素材与致谢

- 角色模型与灵感来自同作者的音游《蛙步》，其玩法灵感来自原作者**念因**的《奶娃街舞》。
- 怪物模型来自 KayKit（Kay Lousberg），CC0 授权。
- 请勿将本项目用于商业用途；转载/二次创作前请先联系作者。
