# 学习闯关乐园

一个面向小学课堂的 Windows 离线单机原型，包含 6 种玩法：

1. 三道门跑酷
2. 听音找精灵
3. 拼音/单词拼装
4. 记忆翻牌配对
5. 古诗朗读节拍
6. 小组知识守护战

## 运行

```powershell
npm install
npm start
```

## 验证

```powershell
npm test
npm run validate
```

## 内容与环境

- 内容包：`data/*.json`
- 范读音频：`audio/zh`、`audio/en`
- Anaconda 环境名称：`GAME`
- 内容校验命令：`npm run validate`
- 范读再生成命令：`conda run -n GAME python tools/generate_audio.py`
- 一键安装入口：`dist-app/一键安装.bat`
- 单文件安装器：`dist-app/LearningAdventurePark-installer.exe`
- 便携发布包：`dist-app/LearningAdventurePark-portable.zip`

## 限制

- 这是本地原型，尚未完成真实希沃大屏、触控和断网安装验收。
- 范读由本机 Windows TTS 生成，仅适合原型验证；正式发行前必须教师逐条审核并替换为授权音频。
- 单文件免管理员安装器位于 `dist-app/LearningAdventurePark-installer.exe`，实测可安装、创建快捷方式并启动应用。
- 免安装便携版位于 `dist-app/LearningAdventurePark-win32-x64/electron.exe`，可直接复制到 Windows 电脑运行。
- 原创角色已提供待机、奔跑、庆祝、跳跃、惊讶、失误、挥手七个 SVG 基础动作，并已实现待机呼吸与奔跑帧动画。
