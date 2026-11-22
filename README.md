# classGame · 学习闯关乐园

面向小学课堂的 Windows 离线学习游戏。当前源码版本 `0.3.0`，包含三通道跑酷、听音找精灵、拼音/单词拼装、记忆翻牌配对、古诗朗读节拍和小组知识守护战。

## 本次整改重点

- 游戏运行态隐藏全局 Header，跑酷压缩为单一 HUD、Phaser 场景和底部三段式操作条。
- 三条跑道统一土色材质，蓝、绿、琥珀只用于门牌；删除独立答案对照条、重复 Banner、星形光晕和过度粒子。
- 主角使用 `Male Adventurer`，保持原始比例并按场景高度缩放；三扇门统一门框与门扇。
- 正确与错误反馈各只保留一个面板，正确冲门保留金币、连击和克制的粒子反馈。
- 其余五种玩法统一为紧凑标题栏和内容区，移除以 Kenney 亮面按钮图片铺满控件的做法。
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

- Playwright 21 项自动回归通过；内容校验 3 个内容包、20 道题通过。
- 1920×1080、1366×768、1280×800、1175×803、1024×768、390×844 六档视口下，六个玩法与跑酷结算页均无横向、纵向页面滚动。
- 三车道变道、答案门碰撞、正确/错误判定、计分、连击、暂停冻结、真实时钟碰撞、十题连续结算。
- 记忆翻牌错误锁定、音游判定窗口、班级模式轮流计分。
- 跑酷运行时远程请求数为 0，BGM 文件约 41 秒而非短循环。

## Windows 交付物

本轮 `0.3.0` 只完成源码视觉收敛，尚未重新生成安装版和便携版。`release/` 中若存在 `0.2.0` 产物，仅为上一轮历史构建，不代表本轮源码验收结果。

## 证据

- 0.3.0 视觉收敛报告：`docs/0.3.0视觉收敛报告.md`
- 0.2.0 历史整改报告：`docs/整改执行报告.md`
- 0.2.0 历史发布校验：`docs/发布校验报告.md`
- 开源许可：`docs/开源许可说明.md`
- 关键截图：`docs/screenshots/`
- 交互录屏：`docs/video/classGame-runner-demo.webm`

## 内容与限制

- 内容包：`data/*.json`；范读音频：`audio/zh`、`audio/en`。
- 当前范读由本机 Windows TTS 生成，仅供原型验证；正式发行前必须教师逐条试听。
- 尚未在真实希沃 Windows 大屏验证触控、全屏和扬声器效果，不能据此宣称希沃真机兼容。
- 录屏为静音视觉演示，音频播放已通过自动化状态日志和本机运行验证，未混入录屏音轨。
