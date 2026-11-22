# classGame · 学习闯关乐园

面向小学课堂的 Windows 离线学习游戏。当前源码版本 `0.4.0`，包含森林寻宝记、听音找精灵、拼音/单词拼装、记忆翻牌配对、诗词小剧场和小组知识守护战。

## 本次整改重点

- `三道门跑酷` 更名为 `森林寻宝记`，副标题为“看题选路，一路寻宝”。
- 跑酷画面改为真正的三跑道透视场景：任务牌位于场景内，木柱纸牌门从远处驶近，角色固定近端并左右变道。
- 三段冒险各 3 题，共 9 题；只在开始时倒计时一次，答对/答错后自动进入下一题。
- 答对显示局部拾取胶囊与粒子；答错只显示一次局部纠错与范读，不再弹出大面板或要求点“继续”。
- 金币只在实际跑过金币所在跑道时拾取，不会因为答对自动发放。
- 完成时任务牌显示“抵达终点”，底部切换为“林间小径 / 再走一次 / 完成”。
- `古诗朗读节拍` 改为 `诗词小剧场`：支持《静夜思》《春晓》切换、逐句本地范读、上一句/下一句、补全诗句和老师控场。
- 其余玩法统一为紧凑标题栏和内容区，移除以 Kenney 亮面按钮图片铺满控件的做法。
- 跑酷 BGM 使用本地 CC0 `Overworld Theme` 循环文件，不再用短 jingle 冒充正式 BGM。

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

- Playwright 22 项自动回归通过；内容校验 3 个内容包、20 道题和两首古诗通过。
- 1920×1080、1366×768、1280×800、1175×803、1024×768、390×844 六档视口下，六个玩法与跑酷结算页均无横向、纵向页面滚动。
- 三车道变道、纸牌门透视缩放、道路内外几何检查、正确/错误自动换题、金币拾取、暂停冻结、真实时钟碰撞、九题连续结算。
- 记忆翻牌错误锁定、诗词逐句共读、诗句补全、班级模式轮流计分。
- 跑酷运行时远程请求数为 0，BGM 文件约 41 秒而非短循环。

## Windows 交付物

- 安装版：`release/classGame-0.4.0-x64-setup.exe`，约 111 MB。
- 便携版：`release/classGame-0.4.0-x64-portable.exe`，约 96 MB。
- 免安装目录：`release/win-unpacked/学习闯关乐园.exe`。
- 打包后的免安装程序已本机启动验证：完成 9/9 题、进入结算页、运行时远程请求为 0。
- 安装版与便携版尚未执行本轮静默安装、卸载和断网双击启动验收；也没有代码签名证书，Windows 可能显示未知发布者。

## 证据

- 0.4.0 森林寻宝与诗词小剧场报告：`docs/0.4.0森林寻宝与诗词小剧场报告.md`
- 0.3.0 历史视觉收敛报告：`docs/0.3.0视觉收敛报告.md`
- 0.2.0 历史整改报告：`docs/整改执行报告.md`
- 0.2.0 历史发布校验：`docs/发布校验报告.md`
- 开源许可：`docs/开源许可说明.md`
- 关键截图：`docs/screenshots/`
- 打包程序验证截图：`docs/screenshots/packaged-040-runner.png`
- 交互录屏：`docs/video/classGame-runner-demo.webm`

## 内容与限制

- 内容包：`data/*.json`；范读音频：`audio/zh`、`audio/en`。
- 当前范读（含两首古诗的 8 段分句音频）由本机 Windows TTS 生成，仅供原型验证；正式发行前必须教师逐条试听。
- 尚未在真实希沃 Windows 大屏验证触控、全屏和扬声器效果，不能据此宣称希沃真机兼容。
- 现有 Kenney Toon Characters 包没有背向跑步动作；本轮使用正式角色素材的正面跑步帧，未伪造背向动画。
- 录屏为静音视觉演示，音频播放已通过自动化状态日志和本机运行验证，未混入录屏音轨。
