# DSH Story Engine 开发文档

> 当前开发版本：`v0.8.0-alpha.1`。本文件描述长期架构和版本路线；当前事实以 `CURRENT_STATUS.md` 为准，下一步任务以 `NEXT_DEVELOPMENT_PLAN.md` 为准。

## 1. 目标

构建一个与具体作品无关的 DSH 外置文字游戏插件。用户可以导入自己的背景、人物、机制、剧情资料和初始状态；引擎提供检索、主持规则、选择交互、状态持久化与检查点。

## 2. 不做什么

- 核心代码不得出现特定商业游戏的人名、剧情或资源路径。
- 开源仓库不得捆绑用户私有内容或从商业游戏提取的资料。
- AI 不直接获得通用 Shell 或任意文件写入权限。
- 内容包不能通过相对路径读取包目录之外的文件。

## 3. 分层

```text
DSH Preset / UI
       ↓
Story Engine Plugin：主持规则、通用 story_* 工具
       ↓
Game Runtime：状态、选择、检查点、场景推进
       ↓
Content API：人物、世界、机制、事件查询
       ↓
Content Pack：用户导入的 Markdown / JSON / TXT
```

核心层只认识通用概念：`entity`、`document`、`scene`、`choice`、`state`、`module`。关系、任务、资源、战斗、前作继承均为可选模块。

## 4. 公开 API 方向

- `story_search_content`
- `story_get_record`
- `story_get_entity`
- `story_read_state`
- `story_commit_state`
- `story_present_choice`
- `story_create_checkpoint`
- `story_advance_scene`

所有修改状态的工具使用版本号，拒绝过期提交。玩家控制权由内容包清单定义，默认 `aiMayControlPlayer: false`。

## 5. 内容导入

V1 使用 `pack.json` 作为规范入口，支持 Markdown、JSON、JSONL/NDJSON 与 TXT。后续适配器负责把 YAML、DOCX、PDF、网页或 Wiki 转换为 V1 标准目录；核心加载器不直接承担复杂格式解析。

导入阶段：

1. 校验清单和 Schema 版本。
2. 解析并限制所有路径在内容包根目录内。
3. 加载人物、世界、剧情和机制文档。
4. 生成统一文档 ID 与检索索引。
5. 校验初始状态与启用模块。
6. 注册可选择的 DSH 游戏 Preset。

## 6. 版本路线

### v0.1：内容包内核（已完成）

- V1 清单与路径安全。
- Markdown、JSON、TXT 加载。
- 原创示例包与全文检索。

### v0.2：可运行 DSH 插件（已完成）

- 通用 `story_*` 工具。
- 独立会话状态、检查点与选择界面。
- 根据内容包生成主持提示词。

当前通用工具：

- `story_get_pack_info`
- `story_search_content`
- `story_get_record`
- `story_get_entity`
- `story_read_state`
- `story_commit_state`
- `story_create_checkpoint`
- `story_list_checkpoints`
- `story_advance_scene`
- `story_present_choice`

### v0.3：内容包管理（已完成）

- 内容包发现、校验和重复 ID 报告。
- 受文件数、大小和链接策略保护的原子安装。
- 根据已发现内容包自动生成 DSH Preset。
- `list`、`validate`、`install`、`sync-presets` CLI。

原计划中的旧 Dispatch 转换不再执行，因为旧插件已按用户明确要求清除。通用引擎不再依赖该项目。

### v0.4：图形化内容包管理（已完成）

- 本地中文内容包列表与诊断展示。
- 路径输入、校验、原子安装和 Preset 同步。
- 仅监听回环地址，限制请求体并阻止跨站写操作。
- 响应式非技术用户界面。

后续再把稳定的管理页面作为 DSH Client 插件嵌入设置区；当前独立页面不会干扰 DSH 聊天功能。

### v0.5：内容包制作向导（已完成）

- 从页面填写游戏名称、ID、玩家角色、其他人物、世界背景和开场。
- 在 `packs/private` 原子生成合规 V1 内容包。
- 自动生成玩家控制规则、人物 JSON、主持提示词和初始状态。
- 创建完成后自动生成 DSH Preset。
- 输入长度限制、ID 校验、同 ID 防覆盖和失败回滚。

### v0.6：无损记录与私人存档迁移（已完成）

- JSONL/NDJSON 逐记录加载与稳定记录 ID。
- 搜索预览后用 `story_get_record` 读取未截断原文。
- 私人 Dispatch 内容包保留原始文件、逐记录索引、只读存档快照、连续性状态、哈希和迁移审计。
- 未验证的存档选择 ID 不自动映射为剧情结论，交由玩家确认。

### v0.7：连载式可执行剧本（已完成）

- 分季、分集、场景与分支的机器可读剧本装载。
- 工作内轻量自动结算与工作外主线场景分层。
- 详细场景与分支、关键对白锚点和受限即兴范围。
- 无标识对白、`(行动)`与`(系统)`输入协议。
- 实质性越界时立即暂停、修订、校验并恢复。
- 集末关键选择总结，不依赖联网统计数据。
- 本地剧本版本、修订历史和已玩正史隔离。

实现提供 20 个 `story_*` 工具：保留 v0.6 的 10 个通用工具，并增加剧本发现与校验、会话剧本初始化、正式场景进入、真实选择记录、工作内事件分流、越界暂停与版本化修订、服务器生成的集末总结。所有会话写入均使用乐观版本锁；原作资料、预写剧本和已玩正史不能通过通用状态提交互相覆盖。

正式行为契约见 `docs/SERIAL_GAMEPLAY_SPEC.md`，剧本格式见 `schemas/episode-script.schema.json`。

### v0.8.0-alpha.1：独立文字游戏界面与社交叙事（阶段 C 部分完成）

- DSH 启动后保持原有普通 AI 聊天为默认界面。
- 通过侧边栏入口切换到独立文字游戏界面，不增加启动选择页，也不混入普通聊天标签页。
- 游戏内部提供私聊、群聊、现场、工作和系统频道。
- 使用结构化消息保存频道、说话人、季集、场景和正史状态。
- 普通会话与游戏频道、存档、草稿和消息列表完全隔离。
- 后台复用 DSH 的模型、工具和会话能力，原始技术轨迹只在开发者面板显示。

进度（2026-08-28）：

- 阶段 A 完成：外置 Web Client 插件经 `sidebar.footer.action` + `shell.overlay` 装载，模式切换与游戏壳已验证。
- 阶段 B 完成：五类频道、结构化消息、草稿/游标/版本投影、宿主存档接口 `GET/PUT/DELETE /story-engine/api/saves/<saveId>` 与列表 `GET /story-engine/api/saves`、浏览器持久化队列。
- 阶段 C 部分完成：真实模型端到端闭环已跑通——隐藏 AI 会话桥接、结构化 JSON 回复提取（含引号容错与角色 ID 映射）、`story_present_choice` 选择卡已绑定为游戏壳内界面（`choice-bridge.ts` + `ChoiceCard.tsx`，经 `/api/respond` 回答，支持刷新恢复重放）。待完成回合按存档持久化为 `dsh-story-ai-pending:<saveId>`，具有 `queued`、`running`、`waiting-choice`、`completed`、`failed`、`cancelled` 明确状态；完成结果在宿主投影前保留，刷新后能够恢复投影。取消经 DSH `session.cancel` 确认；重试复用原提示，不会追加玩家输入、选择或已提交消息。无法解析的结构化输出显示为非正史错误，绝不降级为旁白。DSH 没有可靠会话删除 RPC，所以删除存档仅保留已归档隐藏会话及其会话专属 Runtime，并写入本地孤儿诊断；缺少原子删除契约时不单独回收 Runtime。
- 游戏库与多存档 UI 完成：进入游戏模式先显示游戏库（`StoryGameLibrary.tsx` + `game-library.ts`），通过 `/story-engine/api/catalog` 动态列出已安装内容包及各自存档，支持"新游戏/继续游戏/另存为/删除"，游戏内可返回游戏库；另存为使用 DSH `session.fork` 与宿主 Runtime 原子克隆，副本具有独立会话和运行状态。
- AI 会话按存档隔离：隐藏会话 key 为 `dsh-story-ai-session:<saveId>`，每个存档独立会话；选择卡桥接按会话保留 pending 卡，只表面当前存档的问题卡，外档残留卡不会污染当前游戏，也不会因切换存档被误删。
- 已知边界：`story_present_choice` 问题卡曾因渲染在普通聊天 composer 区被游戏壳盖住而挂起，已在客户端桥接修复；`respond` 返回裸 receipt（`{accepted}`）而非 RPC 包络，不做 `unwrap`。
- 内容包界面边界：只有提供并通过校验的 `ui/story-ui.json` 才在游戏库中标记为可新建；缺少该文件的包仍可由核心引擎发现，但界面显示“需诊断”，避免套用其他包的示例人物、频道或开场。

正式界面、数据和集成契约见 `docs/TEXT_GAME_SOCIAL_UI_SPEC.md`。
外部编码助手的首阶段实施边界和验证清单见 `docs/ZCODE_IMPLEMENTATION_HANDOFF.md`。
逐轮进度和修复记录见 `docs/STAGE_B_PROGRESS.md`。

### v1.0：公开稳定版

- 固定 V1 兼容承诺。
- 安全审计、文档、示例和发布包。

## 7. 开源策略

引擎采用 MIT。示例包必须是原创、CC0 或具备明确再发布授权。每个内容包必须声明 `license`；`packs/private`、运行存档、索引缓存和导入源文件默认不进入 Git。

## 8. Git 工作规范

### 8.1 仓库和分支

- `D:\DSH-Story-Engine` 是本项目唯一 Git 仓库；不得把工作树复制到 `D:\DeepSeek-Harness`，也不得在 DSH 原版仓库中提交本项目代码。
- `main` 只保存已经通过回归的可恢复基线。日常功能和修复使用 `codex/<简短任务名>` 分支；合并前保持提交边界清晰。
- 当前预发布基线使用标签 `v0.8.0-alpha.1`。产品版本以根 `package.json`、客户端 `package.json` 和 `CURRENT_STATUS.md` 三者一致为准。

### 8.2 提交内容

- 使用 Conventional Commits 前缀：`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`。
- 文本文件遵循仓库 `.gitattributes` 的 LF 规则，不把整文件换行变化混入功能提交。
- 一个提交只完成一个可说明、可验证的目标；实现、对应测试和必要文档应放在同一提交中。
- 提交前检查 `git diff --cached` 和 `git status --ignored`，确认没有私人资料、密钥、存档或测试输出。
- 不使用 `git reset --hard`、强制覆盖或清除用户未提交改动；发现不属于当前任务的改动时保留并单独报告。

### 8.3 永不提交的本地数据

- `packs/private/`：私人或不可再发布的内容包，包括 Dispatch 原始资料和迁移结果。
- `runtime/`、`runtime-ui/`、`work/`：AI 会话状态、玩家存档、检查点和处理中间文件。
- `output/`、`.playwright-cli/`、日志和压缩包：浏览器截图、验证轨迹与生成产物。
- 本机生成的私人 Preset，例如 `presets/story-dispatch-personal-continuation/`。
- API Key、访问令牌、Cookie、账号配置和任何其他凭据。

### 8.4 提交前验证

必须依次通过：

```powershell
npm run typecheck
npm test
npm run build
npm run typecheck:client
npm run test:client
npm run build:client
git -C D:\DeepSeek-Harness status --short
```

涉及界面交互时，还必须在隔离端口完成真实浏览器验证。测试服务和临时浏览器会话在提交前关闭；验证结果写入当前阶段记录，不提交运行存档和截图，除非截图被明确选为公开文档资产。

### 8.5 状态与版本更新

- 每次里程碑结束后更新 `CURRENT_STATUS.md`；任务优先级或验收条件变化时更新 `NEXT_DEVELOPMENT_PLAN.md`。
- 历史报告只追加纠偏说明，不改写成当前任务清单。
- 发布或预发布时同步两个 `package.json` 的版本，完成全套验证后再创建同名 Git 标签。
- 内容包的 `version` 和各 Schema 的 `schemaVersion` 独立演进，不随产品版本机械修改。
