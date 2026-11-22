# Kenney 运行时素材清单

所有文件均来自 Kenney 官方 CC0 素材包。完整许可文本位于 `licenses/`。

## 角色

`characters/` 来自 **Toon Characters** 的 Male Adventurer，提取：

- `adventurer-idle.png`
- `adventurer-run0.png`、`adventurer-run1.png`、`adventurer-run2.png`
- `adventurer-jump.png`、`adventurer-fall.png`
- `adventurer-hit.png`、`adventurer-hurt.png`
- `adventurer-duck.png`、`adventurer-slide.png`
- `adventurer-talk.png`
- `adventurer-cheer0.png`、`adventurer-cheer1.png`

## 场景、门体和道具

`platformer/` 来自 **New Platformer Pack**，用于：

- 天空、云、山丘、树林背景。
- 草地/石质地形。
- 门、彩色门柱、按钮板。
- 金币、铜币、银币、三色宝石、旗帜、草丛、灌木、蘑菇、岩石。

`particles/` 来自 **Particle Pack**：

- `star.png`
- `spark.png`
- `circle.png`

## UI

`ui/` 来自 **UI Pack**：

- `arrow-left.png`、`arrow-right.png`：底部三段式跑酷控制条的左右方向标识。
- `icon-checkmark.png`、`icon-cross.png`：正确/错误反馈。
- `star.png`：品牌标识、记忆牌背和结算星级。

本轮视觉收敛后，运行时不再使用 `button-*.png`、`button-round-*.png`、
`button-rectangle-*.png` 作为大面积控件背景。主按钮改为 CSS 平面按钮，
避免亮面 UI 与游戏场景争夺视觉焦点。这些原始素材文件保留用于来源追溯。

## 音频

`../../audio/kenney/` 中的文件映射：

| 运行时文件 | 原始素材 |
|---|---|
| `switch_002.ogg` | Interface Sounds / `switch_002.ogg` |
| `confirmation_002.ogg` | Interface Sounds / `confirmation_002.ogg` |
| `error_004.ogg` | Interface Sounds / `error_004.ogg` |
| `click_002.ogg` | Interface Sounds / `click_002.ogg` |
| `select_001.ogg` | Interface Sounds / `select_001.ogg` |
| `coin.ogg` | New Platformer Pack / `sfx_coin.ogg` |
| `hurt.ogg` | New Platformer Pack / `sfx_hurt.ogg` |
| `jump.ogg` | New Platformer Pack / `sfx_jump.ogg` |
| `result.ogg` | Music Jingles / `Pizzicato jingles/jingles_PIZZI07.ogg` |

`result.ogg` 只在结算时播放一次，不用于循环 BGM。

## 跑酷循环音乐

`../../audio/music/runner-loop.ogg` 不属于 Kenney 素材包，来源为：

- OpenGameArt《Overworld Theme》alternate version
- 作者：Louswan
- 许可证：CC0 1.0
- 来源：https://opengameart.org/content/overworld-theme-0
- 工程内许可说明：`../../docs/licenses/Overworld-Theme-CC0.txt`

该曲目约 41 秒，作为跑酷循环 BGM 使用；Kenney Music Jingles 仍只承担短结算提示音。
