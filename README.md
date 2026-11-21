# classGame · 学习闯关乐园

面向小学课堂的 Windows 离线学习游戏。当前版本 `0.2.0`，包含三通道跑酷、听音找精灵、拼音/单词拼装、记忆翻牌配对、古诗朗读节拍和小组知识守护战。

## 本次整改重点

- 三通道跑酷已改为 Electron + Phaser 3 场景，不再用 DOM/CSS 模拟跑道。
- 三条跑道共享透视消失点，角色固定在近端，三道门从远景向角色移动。
- 变道、碰撞、正确/错误判定、计分、连击、金币、暂停、恢复、倒计时、下一题和结算均进入真实游戏循环。
- 已实际集成 Kenney Toon Characters、New Platformer Pack、UI Pack、Particle Pack、Interface Sounds、Music Jingles。
- 其余五种玩法的角色、场景、按钮、反馈图标和音效已统一到同一套 Kenney 视觉语言。
- 答案门在远景时增加固定在 DOM 的“答案对照”条，保证读题可读性；它不是门体替代品。

## 开发运行

依赖安装在 Anaconda 环境 `GAME` 中：

```powershell
conda activate GAME
npm install
npm start
```

## 验证

```powershell
conda run --no-capture-output -n GAME node tests/smoke.mjs
conda run --no-capture-output -n GAME npx playwright test --reporter=list
conda run --no-capture-output -n GAME python tools/validate_content.py
```

已验证覆盖：

- 1920×1080、1366×768、1280×800、390×844 四种视口无横向溢出。
- 三车道变道、答案门碰撞、正确/错误判定、计分、连击、暂停冻结、真实时钟碰撞、十题连续结算。
- 记忆翻牌错误锁定、音游判定窗口、班级模式轮流计分。
- 打包后的应用断网运行时远程请求数为 0，并完成 10/10 道跑酷题。
- Windows 安装、桌面/开始菜单快捷方式、启动、卸载与目录清理。

## Windows 交付物

| 产物 | 路径 |
|---|---|
| NSIS 安装版 | `release/classGame-0.2.0-x64-setup.exe` |
| 便携版 | `release/classGame-0.2.0-x64-portable.exe` |
| 免安装目录 | `release/win-unpacked/` |

安装版 SHA256：`8C1A8B05A74ABE11A91EC4A756FDA0FC9DA95F97AEAF0416A3218DBB84F13767`
便携版 SHA256：`9D967F19159A6015CC0AD0DF623472575C79BBE0E8547B3FD07D9F5916B9CB95`

当前未配置代码签名证书，Windows SmartScreen 可能显示“未知发布者”。

## 证据

- 整改报告：`docs/整改执行报告.md`
- 发布校验：`docs/发布校验报告.md`
- 开源许可：`docs/开源许可说明.md`
- 关键截图：`docs/screenshots/`
- 交互录屏：`docs/video/classGame-runner-demo.webm`

## 内容与限制

- 内容包：`data/*.json`；范读音频：`audio/zh`、`audio/en`。
- 当前范读由本机 Windows TTS 生成，仅供原型验证；正式发行前必须教师逐条试听。
- 已在当前 Windows 11 主机验证安装、便携启动、卸载和离线运行。
- 尚未在真实希沃 Windows 大屏验证触控、全屏和扬声器效果，不能据此宣称希沃真机兼容。
- 录屏为静音视觉演示，音频播放已通过自动化状态日志和本机运行验证，未混入录屏音轨。
