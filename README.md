# DSH Story Engine

基于 DeepSeek Harness 的开放文字游戏引擎。作者通过内容包导入原创或已获授权的世界观、人物、机制和剧情资料，AI 负责主持世界、NPC 与后果，玩家负责对话和选择。

## 当前状态：v0.8.0-beta.1 测试版（阶段 D 开发中）

已经实现 V1 内容包加载、DSH 外置插件、动态主持规则、全文与人物检索、逐记录无损读取、独立会话存档、版本锁、检查点、场景推进、原生选择界面、内容包安全安装、本地图形化管理页面、零代码内容包制作向导、连载式可执行剧本（v0.7），以及独立文字游戏界面（v0.8 阶段 A/B/C 完成）：五类频道、结构化消息、宿主存档持久化、真实模型端到端闭环、选择卡、动态内容包目录、多存档、长回合刷新恢复，以及基于 DSH 会话分叉和 Runtime 克隆的真正另存为。

Stage D 已完成 AI canonical social commit 幂等、D1 core operation receipts、D2a durable transaction journal、D2b player transaction coordinator 和 D2c-1 core preflight operation linking；当前进入 D2c-2 core receipt / tool result → social projection 跨域 reconciliation。

私人 Dispatch 验证线只存在于被忽略的本地目录；商业游戏内容、存档、最终化 overlay 和具体校验结果不会进入公开仓库。私人内容可以用于 v1.0 Personal 的本机长时游玩验收，但不构成 v2.0 Public Product 的发布内容或依赖。

当前版本路线明确区分：v1.0 是基于认证 DSH Runtime 的个人长期游玩版；v1.x 用于 Runtime/Model/Visual/Product abstraction；v2.0 才是默认 Native Runtime、无需安装 DSH 的首个正式对外产品版本。详细边界见 `docs/DEVELOPMENT.md` 和 `docs/NEXT_DEVELOPMENT_PLAN.md`。

当前唯一状态基线和文档阅读顺序见 `docs/CURRENT_STATUS.md`；后续任务、优先级和验收标准见 `docs/NEXT_DEVELOPMENT_PLAN.md`。

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

详细设计见 `docs/DEVELOPMENT.md`，宿主接口见 `docs/HOST_API.md`，内容包格式见 `docs/CONTENT_PACK_V1.md`，连载式游戏规则见 `docs/SERIAL_GAMEPLAY_SPEC.md`，独立文字游戏界面规范见 `docs/TEXT_GAME_SOCIAL_UI_SPEC.md`，视觉资产与生图演进见 `docs/VISUAL_ASSET_SYSTEM_SPEC.md`，事务/幂等/崩溃恢复契约见 `docs/TRANSACTION_AND_RECOVERY_SPEC.md`，分集剧本格式见 `schemas/episode-script.schema.json`，文字游戏界面描述格式见 `schemas/story-ui.schema.json`。

历史交付、实施、交接和退役记录统一保存在 `docs/archive/`；它们只用于审计，不代表当前状态或当前开发任务。