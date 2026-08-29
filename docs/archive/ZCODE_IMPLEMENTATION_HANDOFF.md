# ZCode 实施交接说明

> 历史交接文档：仅对应已经完成的阶段 A，不再作为当前开发提示词或任务清单。当前开发入口见 `CURRENT_STATUS.md` 与 `NEXT_DEVELOPMENT_PLAN.md`。

## 1. 本地位置

- 实际开发项目：`D:\DSH-Story-Engine`
- DSH 原版参考与运行环境：`D:\DeepSeek-Harness`
- 界面正式规范：`D:\DSH-Story-Engine\docs\TEXT_GAME_SOCIAL_UI_SPEC.md`
- 连载玩法规范：`D:\DSH-Story-Engine\docs\SERIAL_GAMEPLAY_SPEC.md`
- 总体路线：`D:\DSH-Story-Engine\docs\DEVELOPMENT.md`

`D:\DSH-Story-Engine` 已经是指定项目根目录。不得在其中再创建一个对话名称或项目名称包装目录，也不得把项目复制到 Codex 默认工作区。

## 2. 不可违反的边界

1. 不修改、删除或格式化 `D:\DeepSeek-Harness` 中的任何源码；它只作为只读参考、依赖和运行环境。
2. 不移动、重装或覆盖 DSH。
3. 不删除或改写现有 Story Engine 功能、测试、内容包和私人 Dispatch 资源。
4. 不把私人 Dispatch 内容硬编码进通用客户端插件，也不把私有资源加入公开产物。
5. DSH 启动后仍默认进入普通 AI 聊天，不增加启动选择页。
6. 文字游戏必须是独立界面，不得实现为普通聊天内部的标签页。
7. 第一里程碑不接入真实 AI、存档迁移或剧情内容，只使用原创模拟数据。
8. 不引入在线聊天服务、账号系统、遥测或未确认许可证的微信仿制资源。

## 3. 开工前必须阅读

按顺序完整阅读：

1. `docs/TEXT_GAME_SOCIAL_UI_SPEC.md`
2. `docs/SERIAL_GAMEPLAY_SPEC.md`
3. `docs/DEVELOPMENT.md`
4. `D:\DeepSeek-Harness\packages\client\AGENTS.md`
5. `D:\DeepSeek-Harness\packages\client\ui-layout\src\client\index.ts`
6. `D:\DeepSeek-Harness\packages\client\ui-sidebar\src\client\contract\slots.ts`
7. `D:\DeepSeek-Harness\packages\client\ui-conversation\src\client\contract\slots.ts`
8. `D:\DeepSeek-Harness\docs\subsystems\client-modules.zh.md`

先检查 Story Engine 当前工作树并保留所有既有改动。项目当前可能尚未建立首个 Git 提交，不能用“全部未跟踪”作为删除或重建文件的理由。

## 4. 第一里程碑：阶段 A

第一轮只完成“外置客户端插件装载 + 模式切换 + 独立游戏壳”。

### 4.1 必须实现

- 在 Story Engine 项目内建立独立的 Web Client 插件包或等价隔离模块。
- 为该包提供 DSH 要求的空 Host 入口、`./client` 导出、`dsh.client` 清单和可重现构建命令。
- 通过 Story Engine 自己的配置补丁装入该插件，不修改 DSH 自带 bundle 配置。
- 使用 `sidebar.footer.action` 增加“文字游戏”入口，宽侧栏显示图标和中文文字，折叠侧栏保留可识别图标和无障碍名称。
- 使用 `shell.overlay` 渲染游戏壳，不替换 DSH 的 `root`、`sidebar` 或 `conversation` 单占组件。
- 默认 `gameMode = false`，每次刷新或启动首先显示普通聊天。
- 进入游戏模式后显示独立游戏库／游戏主界面原型；游戏壳内有明确的“返回普通聊天”按钮。
- 切换前后保留普通聊天当前会话、输入草稿和阅读位置。
- 游戏壳隐藏时不拦截指针、键盘和屏幕阅读器焦点。
- 使用原创模拟人物和消息验证私聊、群聊、现场频道及三栏布局；不得读取 Dispatch 私有包。
- 窄屏至少能把左右栏收起或降级为可用布局，不能产生无法退出的遮挡。

### 4.2 建议的 DSH 扩展位

- 模式入口：`sidebar.footer.action`
- 独立游戏壳：`shell.overlay`

这两个位置均为列表型增量插槽，优先使用 `ctx.slots.inject(name, () => ctx.slots.register(...))` 等待声明生命周期。不要直接争抢 `root`、`sidebar`、`conversation` 或 `details` 的单占位置。

浮层外层在 DSH 中默认是点击穿透的，游戏壳活动时应在自己的根元素恢复指针事件、覆盖可见框架并正确管理焦点；非活动状态最好不渲染 DOM。

### 4.3 第一里程碑不实现

- `story_emit_messages` 等真实 Host API。
- 游戏存档、未读持久化和数据库迁移。
- AI 流式输出、人物关系和季集推进。
- 内容包封面或 Dispatch 人物头像。
- 搜索、语音、视频、表情、联网通信。
- 对 DSH 原始消息列表的任何样式修改。

## 5. 实施前技术验证

在大规模编写界面前完成一个最小探针：

1. 外置 Client bundle 能由 Story Engine 构建。
2. DSH 能通过补丁发现并加载它。
3. 侧边栏入口实际出现。
4. 点击后 `shell.overlay` 能显示最小面板并返回。
5. `D:\DeepSeek-Harness` 工作树没有被修改。

如果外置 bundle 格式或配置装载出现阻碍，应保留错误输出，检查 DSH 的 `dsh.client` 清单、`./client` 导出和 lazy-CJS 构建要求。不得通过把插件源码复制进 DSH 仓库解决。

## 6. 质量要求

- 使用 TypeScript、React 18 和 CSS Modules，优先复用 DSH 已提供的共享 React 与基础模块。
- 阶段 A 不添加第三方聊天 UI 依赖；先证明插件边界和布局，再决定是否局部采用 MIT 组件。
- 新状态逻辑必须有单元测试；模式切换至少覆盖默认状态、进入、返回和重复切换。
- 为侧边栏入口、返回按钮和主要区域提供键盘操作与可访问名称。
- 不使用内联远程图片、外部字体或网络请求。
- 不吞掉插件加载失败；错误必须能定位，同时普通聊天应保持可用。
- 保持现有 API 和脚本兼容，不做无关重构。

## 7. 验证命令

在 `D:\DSH-Story-Engine` 中至少运行：

```powershell
pwsh -File .\setup-links.ps1
npm run typecheck
npm test
npm run build
```

新增客户端包后，还必须运行它自己的类型检查、测试和 bundle 构建命令。随后通过：

```powershell
pwsh -File D:\DSH-Story-Engine\start.ps1
```

手动验证 `http://127.0.0.1:3080` 的默认普通聊天、侧边栏入口、游戏壳、返回操作和刷新默认值。

不要为了验证而要求 API Key；阶段 A 必须能用不调用模型的方式检查界面。

## 8. 完成交付格式

完成第一里程碑后报告：

1. 实现结果和用户可见行为。
2. 新增或修改的文件。
3. 插件如何被 DSH 发现和构建。
4. 自动测试与手动验证结果。
5. `D:\DeepSeek-Harness` 未被修改的检查结果。
6. 已知限制和进入阶段 B 前仍需决定的问题。

在阶段 A 未通过全部验证前，不进入阶段 B。
