# 音频素材来源与许可

本目录所有音频均为 **CC0 1.0（公有领域）**，可自由商用、修改、再分发，无需署名。
来源记录如下（保留这份文件即视为已履行全部义务）。

## 背景音乐（bgm/）

| 文件 | 来源 | 许可 |
| --- | --- | --- |
| bgm_night.mp3 / bgm_battle.mp3 / bgm_shop.mp3 | [RezaParsian/free-sfx-bgm-pack](https://github.com/RezaParsian/free-sfx-bgm-pack)（代码合成的免版税音乐包） | CC0 1.0 |

- 原曲分别为 `bgm_ambient_underscore` / `bgm_cinematic_tension` / `bgm_playful_marimba`。
- 已做处理：尾部 2 秒与开头交叉淡化 → **无缝循环**；响度归一（RMS −18.5 dBFS）。

## 音效（sfx/）

| 文件 | 来源 | 许可 |
| --- | --- | --- |
| swing / hit / die / card / buy / event / swordHit | [Kenney《RPG Audio》](https://kenney.nl)（经 Boyquotes/kenney-rpg-audio-for-godot 打包） | CC0 1.0 |
| uiClick / uiSwitch | [Kenney《UI Audio》](https://kenney.nl)（经 Calinou/kenney-ui-audio 打包） | CC0（Kenney 许可） |
| crit / explode / hurt / coin / swordFire / ice / thunder / poison / heal / upgrade / repDown | [RezaParsian/free-sfx-bgm-pack](https://github.com/RezaParsian/free-sfx-bgm-pack) | CC0 1.0 |
| roundStart / roundClear / boss / victory / defeat | [Beatscribe/homebrew_vgm](https://github.com/Beatscribe/homebrew_vgm)（SNES 曲集，作者欢迎署名 "Beatscribe" 但不强制） | CC0 1.0 |

- 全部已做处理：转 44.1kHz 单声道、去掉首尾静音、峰值归一 −3 dBFS。
- 生成脚本：仓库根目录 `.tmp-audio-build.py`（换素材时改清单重跑即可）。
