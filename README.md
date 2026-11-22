# classGame · 学习闯关乐园

面向小学课堂的 Windows 离线学习游戏。当前源码版本 `0.5.0`，包含森林寻宝记、听音找精灵、拼音/单词拼装、记忆翻牌配对、诗词填空闯关和小组知识守护战。

## 本次整改重点

- 教材冒险地图成为个人玩法主入口：按年级、册次、单元和连续编号关卡组织，支持直接选关、返回原位和各游戏独立进度。
- 语文 1–6 年级上下册和英语 1–6 年级上下册已接入开源同步字词数据；拼音上册内容单独成包。语文只收录字词，不复制受版权保护的课文原文。
- 森林寻宝记使用 Phaser 三跑道透视：角色固定在近端，木柱纸牌门从远处驶近，左右变道、碰撞判定、暂停和连续关卡闭环完整。
- 跑酷场景按教材区域和关卡阶段联动：森林、溪谷、山谷、果园、海岸、雪原六套主题，每套三个阶段，共十八种实际场景状态。
- 场景会改变天空、远山、地面、树林、水岸、桥梁、营地、果园、海岸、冰雪和夜景；HUD 会显示当前区域与阶段进度。
- 地图采用资产包参考稿的连续 7–12 节点路线和分层 Canvas 构图，地形、河道、木桥、树簇、山体与岩石由 `js/adventure-map-art.js`、`js/map-primitives.js` 实际绘制；局内两侧树群复用包内 SVG 的光栅化版本，不再由临时图形冒充。
- 跑酷 BGM 使用本地 CC0 `Overworld Theme` 循环文件，成功和重试音效使用不同的鼓励式/回退式音效。
- 其余五种玩法保留统一的标题栏、暂停、返回地图和结算流程；个人模式与班级模式拥有不同入口和操作流程。

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

- Playwright 37 项自动回归通过；内容校验 26 个内容包、4476 条学习内容通过。
- 1920×1080、1366×768、1280×800、1175×803、1024×768、390×844 六档视口下，六个玩法与跑酷结算页均无横向、纵向页面滚动。
- 三车道变道、纸牌门透视缩放、道路内外几何检查、正确/错误自动换题、暂停冻结、真实时钟碰撞、连续关卡结算。
- 六主题十八阶段场景的真实切换；地图六区域分别校验对应 SVG，场景主题、区域名和 HUD 随教材单元与关卡进度更新。
- 记忆翻牌错误锁定、诗词逐句共读、诗句补全、班级模式轮流计分。
- 跑酷运行时远程请求数为 0，BGM 文件约 41 秒而非短循环。

## 内容覆盖

- 语文：12 册，3141 条生字/词语，约 519 个可玩关卡；不含现代课文原文。
- 英语：12 册，1288 条开源同步词表，需按学校实际教材核对。
- 拼音：一年级上册 47 条。
- 古诗：目前 2 首（《静夜思》《春晓》），尚未完成全年级古诗覆盖。
- 总计：26 个内容包，4476 条学习内容。

## Windows 交付物

- 源码交付以 `master` 分支为准。
- 0.5.0 安装包：`release/classGame-0.5.0-x64-setup.exe`，同时发布在 [GitHub Release v0.5.0](https://github.com/w1-23/classGame/releases/tag/v0.5.0)。
- 本轮只提供安装版，不提供便携版。
- 本轮未执行安装、卸载、断网安装或希沃真机验收；不能据此宣称安装版已在教师电脑正常使用。
- 安装包尚未进行代码签名，Windows 可能显示未知发布者。真实希沃大屏的触控、全屏和扬声器验收仍需单独执行。

## 证据

- 0.5.0 教材冒险地图与分层场景报告：`docs/0.5.0教材冒险地图与分层场景报告.md`
- 0.4.0 森林寻宝与诗词小剧场报告：`docs/0.4.0森林寻宝与诗词小剧场报告.md`
- 0.3.0 历史视觉收敛报告：`docs/0.3.0视觉收敛报告.md`
- 0.2.0 历史整改报告：`docs/整改执行报告.md`
- 0.2.0 历史发布校验：`docs/发布校验报告.md`
- 开源许可：`docs/开源许可说明.md`
- 地图资产来源：`docs/licenses/classgame-map-art.txt`、`docs/map-art-handoff/`。
- 0.5.0 前端页面与构建验收报告：`docs/0.5.0前端页面与构建验收报告.md`
- 关键截图：`docs/screenshots/`，包括地图六档视口、六区域地图、六主题十八阶段场景、暂停和结算。
- 汇总截图：`docs/screenshots/0.5.0-pages-overview.png`、`docs/screenshots/map-six-themes-contact-sheet.png`、`docs/screenshots/runner-six-themes-contact-sheet.png`。
- 打包程序验证截图：`docs/screenshots/packaged-040-runner.png`
- 本轮未生成录屏。

## 内容与限制

- 内容包：`data/*.json`；范读音频：`audio/zh`、`audio/en`。
- 语文字词数据来源为 MIT 授权的 `athenayan123-web/dictation-robot`；英语词表和拼音分别来自 MIT 授权的 `guanchunsheng/guanyiyi-english` 与 `caopengfei/xuepinyin`。
- 当前范读（含两首古诗的 8 段分句音频）由本机 Windows TTS 生成，仅供原型验证；正式发行前必须教师逐条试听。
- 尚未在真实希沃 Windows 大屏验证触控、全屏和扬声器效果，不能据此宣称希沃真机兼容。
- 现有 Kenney Toon Characters 包没有背向跑步动作；本轮使用正式角色素材的正面跑步帧，未伪造背向动画。
- 本轮按交付要求只提供静态页面截图，不提供录屏。
