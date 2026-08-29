# DSH Story Engine

基于 DeepSeek Harness 的开放文字游戏引擎。作者通过内容包导入原创或已获授权的世界观、人物、机制和剧情资料，AI 负责主持世界、NPC 与后果，玩家负责对话和选择。

## 当前状态：v0.8.0-beta.1 测试版（阶段 C 部分完成）

已经实现 V1 内容包加载、DSH 外置插件、动态主持规则、全文与人物检索、逐记录无损读取、独立会话存档、版本锁、检查点、场景推进、原生选择界面、内容包安全安装、本地图形化管理页面、零代码内容包制作向导、连载式可执行剧本（v0.7），以及独立文字游戏界面（v0.8 阶段 A/B 完成，阶段 C 部分完成）：五类频道、结构化消息、宿主存档持久化、真实模型端到端闭环、选择卡、动态内容包目录、多存档、长回合刷新恢复，以及基于 DSH 会话分叉和 Runtime 克隆的真正另存为。

私人 Dispatch 续作包已作为本地私人内容包被引擎发现，原始游戏内容、只读存档快照和解析审计位于 `packs/private/dispatch-personal-continuation`，默认不会进入 Git。它目前缺少经过人工核对的 `ui/story-ui.json`，游戏库会显示“需诊断”并禁止新建；这不等于已经可以安装游玩。

当前唯一状态基线、版本含义和文档阅读顺序见 `docs/CURRENT_STATUS.md`；后续任务、优先级和验收标准见 `docs/NEXT_DEVELOPMENT_PLAN.md`。

当前 Git 测试版标签为 `v0.8.0-beta.1`。提交和私人数据排除规则见 `docs/DEVELOPMENT.md` 的“Git 工作规范”，版本变化见 `CHANGELOG.md`。

GitHub 项目地址：<https://github.com/crazyname/DSH-Story-Engine>

## 打开内容包管理页面

```powershell
pwsh -File D:\DSH-Story-Engine\manager.ps1
```

保持窗口开启，然后访问 `http://127.0.0.1:3091`。

同时启动管理页面和 DSH：

```powershell
pwsh -File D:\DSH-Story-Engine\start-all.ps1
```

## 运行原创示例

```powershell
pwsh -File D:\DSH-Story-Engine\start.ps1
```

打开 `http://127.0.0.1:3080`。页面默认进入普通 AI 聊天；从侧边栏选择“文字游戏”，在游戏库中找到“雾海灯塔站”并新建游戏。退出游戏模式后仍返回普通聊天。

## 开发验证

```powershell
pwsh -File D:\DSH-Story-Engine\setup-links.ps1
cd D:\DSH-Story-Engine
npm run typecheck
npm test
npm run build
```

详细设计见 `docs/DEVELOPMENT.md`，宿主接口见 `docs/HOST_API.md`，内容包格式见 `docs/CONTENT_PACK_V1.md`，连载式游戏规则见 `docs/SERIAL_GAMEPLAY_SPEC.md`，独立文字游戏界面规范见 `docs/TEXT_GAME_SOCIAL_UI_SPEC.md`，分集剧本格式见 `schemas/episode-script.schema.json`，文字游戏界面描述格式见 `schemas/story-ui.schema.json`。`STAGE_A_REPORT.md`、`STAGE_B_PROGRESS.md`、`V07_IMPLEMENTATION_REPORT.md` 和 `ZCODE_IMPLEMENTATION_HANDOFF.md` 是历史交付记录，不作为当前任务清单。
