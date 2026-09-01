# DSH Story Engine 开发文档

> 本文件描述长期架构、版本路线和仓库工作规范，不记录逐轮实时进度。当前事实以 `CURRENT_STATUS.md` 为准，下一步任务以 `NEXT_DEVELOPMENT_PLAN.md` 为准。

## 1. 目标

构建一个与具体作品无关的 DSH 外置文字游戏插件。用户可以导入自己的背景、人物、机制、剧情资料和初始状态；引擎提供检索、主持规则、选择交互、状态持久化与检查点。

## 2. 不做什么

- 核心代码不得出现特定商业游戏的人名、剧情或资源路径。
- 开源仓库不得捆绑用户私有内容或从商业游戏提取的资料。
- AI 不直接获得通用 Shell 或任意文件写入权限。
- 内容包不能通过相对路径读取包目录之外的文件。
- 不为了跨域恢复假装存在浏览器、DSH 和 Story Runtime 之间的分布式 ACID / exactly-once transaction。

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

UI/宿主集成额外包含 social projection、隐藏 DSH Session 和事务协调层；它们不能绕过 Game Runtime 的 canonical state 规则。顶层可恢复工作流使用 `transactionId`，其中每个可重试 core canonical mutation 使用独立 `operationId` 和 receipt。跨域 retry/recovery 见 `docs/TRANSACTION_AND_RECOVERY_SPEC.md`。

## 4. 公开 API 方向

基础通用能力包括：

- `story_search_content`
- `story_get_record`
- `story_get_entity`
- `story_read_state`
- `story_commit_state`
- `story_present_choice`
- `story_create_checkpoint`
- `story_advance_scene`

v0.7 起还提供剧本发现/校验、正式场景进入、真实选择记录、工作事件、越界修订和集末总结等通用 `story_*` 工具；实际公开工具集合以代码和当前接口文档为准。

所有修改 canonical state 的工具必须保留 optimistic version 防护。进入 Stage D 后，可被 retry/recovery 重复调用的 mutation 还必须具备 operation-level idempotency；`expectedVersion` 与 `operationId` 解决不同问题，不能互相替代。一个 transaction 可以包含多个不同 `operationId`。

玩家控制权由内容包清单定义，默认 `aiMayControlPlayer: false`。

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

初始通用工具：

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

原计划中的旧 Dispatch 转换不再作为通用引擎依赖。私人内容包验证与公开引擎开发分离。

### v0.4：图形化内容包管理（已完成）

- 本地中文内容包列表与诊断展示。
- 路径输入、校验、原子安装和 Preset 同步。
- 仅监听回环地址，限制请求体并阻止跨站写操作。
- 响应式非技术用户界面。

稳定的管理能力可以通过 DSH Client 插件进入设置/游戏库区域，但不得干扰普通聊天功能。

### v0.5：内容包制作向导（已完成）

- 从页面填写游戏名称、ID、玩家角色、其他人物、世界背景和开场。
- 在 `packs/private` 原子生成合规 V1 内容包。
- 自动生成玩家控制规则、人物 JSON、主持提示词和初始状态。
- 创建完成后自动生成 DSH Preset。
- 输入长度限制、ID 校验、同 ID 防覆盖和失败回滚。

### v0.6：无损记录与私人存档迁移（已完成）

- JSONL/NDJSON 逐记录加载与稳定记录 ID。
- 搜索预览后用 `story_get_record` 读取未截断原文。
- 私人内容包可以保留原始文件、逐记录索引、只读存档快照、连续性状态、哈希和迁移审计，但这些材料不进入公开 Git。
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

### v0.8：独立文字游戏界面、社交叙事与连载玩法集成

v0.8 产品线的长期目标：

- DSH 启动后保持普通 AI 聊天为默认界面。
- 通过侧边栏入口切换到独立文字游戏界面，不增加启动选择页，也不混入普通聊天标签页。
- 游戏内部提供私聊、群聊、现场、工作和系统频道。
- 使用结构化消息保存频道、说话人、季集、场景和 canonical 状态。
- 普通会话与游戏频道、存档、草稿和消息列表完全隔离。
- 每个游戏存档使用独立隐藏 DSH Session，后台复用模型、工具和会话能力，但原始技术轨迹不直接成为游戏正史。
- 使用 transaction journal、隐藏 `turnId`、core `operationId` receipts 与 social projection 幂等使 retry/recovery 可对账恢复。
- 将 v0.7 的季/集/场景、工作内/外、选择、越界修订和集末总结完整呈现在游戏界面。
- 达到公开发布所需的无障碍、性能、迁移、安全、许可证和文档质量。

阶段 A–E 的正式能力边界见 `docs/TEXT_GAME_SOCIAL_UI_SPEC.md`；当前哪个阶段已完成、正在做什么，只在 `CURRENT_STATUS.md` 和 `NEXT_DEVELOPMENT_PLAN.md` 维护。

事务与崩溃恢复的正式语义见 `docs/TRANSACTION_AND_RECOVERY_SPEC.md`。宿主 HTTP 行为见 `docs/HOST_API.md`。

### v1.0：公开稳定版

v1.0 不只是功能完成，还意味着 V1 公共契约被冻结并有明确兼容承诺。至少包括：

- `pack.json`、剧本/UI Schema 和存档迁移边界。
- 公开 `story_*` tool contract 与 Host API contract。
- 支持的 DSH / Client plugin 兼容范围。
- 安全与隐私审计。
- 第三方许可证和可再发布示例检查。
- 安装、升级、卸载、故障排查和内容包作者文档。
- Release Candidate、干净安装、旧存档升级、完整原创示例回归和最终发布包审计。

正式 RC/Stable 路线以 `NEXT_DEVELOPMENT_PLAN.md` 为准；在 Stage E 文档工作中建立 `COMPATIBILITY.md` 和 `RELEASE_CHECKLIST.md`，并在进入 1.0 RC 前完成评审。

#### 1.0 的 DSH 认证与升级政策

Story Engine 1.0 固定并认证一个明确的 DSH Runtime 基线，不自动跟随 DSH 最新版本。当前认证候选为：

```text
DeepSeek Harness version: 0.1.1-rc.2
Git tag: dsh-v0.1.1-rc.2
Git commit: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
```

“固定”必须成为可验证的工程约束，而不只是开发者当前恰好没有执行 `git pull`：

- Stage E 建立机器可读的 certified-runtime manifest，记录 runtime 名称、version、tag、commit 和 compatibility profile。
- 构建、测试和发布检查验证实际 DSH commit、package version、必需包和能力；不匹配时 fail-closed，并给出清晰诊断。
- 公开构建流程不得把 `D:\DeepSeek-Harness` 这类单机绝对路径当作产品契约；本地开发可以使用该目录，但公开配置必须通过受控依赖解析或显式的 DSH root 配置进入。
- DSH 发布新版时，不直接更新主开发线。升级在独立 compatibility branch 中完成，并重新运行 typecheck、自动测试、Client build、Host/Runtime 集成测试和适用的真实浏览器故障矩阵。
- 只有兼容性证据完整、迁移影响已记录时，才更新 certified baseline；Story Engine 可以长期停留在已认证版本。
- 严重安全漏洞、数据损坏或运行阻塞可以触发紧急兼容分支，但仍不得跳过验证后直接追随上游最新版。

当前 `D:\DeepSeek-Harness` 是官方仓库的本地 clone，只作为依赖与运行环境；Story Engine 代码、补丁和发布物不得写入或提交到该仓库。

#### Runtime Ports and Adapters 战略

DSH 在 1.0 中仍是认证运行后端，但它不应定义 Story Engine 的核心产品契约。长期架构采用 Ports and Adapters / anti-corruption layer：

```text
Story Engine
├── Gameplay Runtime
├── Transaction Engine
├── Save / Projection
├── Content Pack
├── Social UI
├── Authoring
└── Host / AI Runtime Ports
    ├── DSH Adapter
    └── Standalone Adapter（未来）
```

`played_canon`、episode/scene、operation receipt、transaction journal、`StorySaveProjection`、内容包和三层真相继续由 Story Engine 定义。以下 DSH-specific 能力逐步收缩到 adapter 边界：

- Cordis Context 与插件 bootstrap；
- `@deepseek-ai/dsh-*` tool registration；
- hidden session 创建、turn dispatch、取消和 history 读取；
- DSH RPC、request correlation 与 native numeric turn；
- Host WebServer 路由和持久化桥接；
- Client plugin 注入、模块加载和界面挂载。

迁移采用渐进方式，不在 1.0 前进行大爆炸式重写：

1. Stage E 先盘点全部 DSH-specific imports、RPC、Host 和 Client 挂载点，并定义最小稳定 ports。
2. 1.x 每次迁移一个边界到 `adapters/dsh`，保持 V1 内容包、存档、Host API、剧情和事务契约不变。
3. Port 使用 Story Engine 自己的类型；DSH 类型不得泄漏进 gameplay、canon、transaction、content-pack 等领域层。
4. 抽象必须保留真实语义，不能把 streaming、`AbortSignal`、waiting-choice、late result、uncertain dispatch、correlation、idempotency 和 recovery 压缩成简单字符串调用。
5. 不为尚未出现的后端提前制造宽泛接口；优先围住已经确认会受 DSH 变化影响的危险边界。
6. DSH Adapter 与未来 Standalone Adapter 必须共享同一套 runtime conformance tests，覆盖正常回合、取消、选择等待、断连、retry、跨存档隔离、crash/restart、tool idempotency 和 canonical result 唯一性。

在 adapter 收缩完成前，Story Engine 仍应明确描述为使用认证 DSH Runtime 的产品；目录重命名或把 import 移动到 `adapters/` 本身不等于已经脱离 DSH。

### Post-1.0 方向（非承诺路线）

以下内容是方向性 backlog，不属于 V1 compatibility promise，也不构成已排期功能。具体是否进入 1.x、后续 major version 或被放弃，应在 v1.0 发布后的真实使用、维护成本和兼容性约束下重新评估。

- **Gameplay / UX**：频道与消息搜索、收藏、引用回复、更丰富的消息/媒体表现、内容包主题和 UI 扩展。
- **Authoring ecosystem**：更强的内容包制作工具、剧本可视化编辑与校验、lint、测试工具和作者 SDK。
- **Runtime capabilities**：后台异步剧情事件、更复杂的 simulation module、更强的长期历史管理、checkpoint/receipt compaction 和诊断工具。
- **Portability / Sync**：更完善的导入导出、可选云同步与多设备连续性。
- **Runtime portability**：1.x 逐步把 DSH-specific code 收缩到 `adapters/dsh`，并在 conformance suite 保护下探索最小 Standalone Runtime。
- **Possible 2.0 territory**：Standalone Runtime 成熟后成为默认、DSH 降为可选兼容后端；需要 breaking change 的 Runtime/API/Schema 重构、多人联机、移动端原生运行，以及任何无法在 V1 兼容承诺内安全演进的架构变化。

2.0 不由“功能看起来很大”自动触发；只有当 V1 公共契约无法保持向后兼容时，才进入新的 major-version 设计与迁移评审。

Standalone Runtime 不因为“减少依赖”本身启动。投入实现前至少需要同时观察到：DSH API 变化持续消耗维护时间；DSH 约束妨碍 Story Engine 产品设计；项目需要上游不适合承载的 runtime 能力；已有真实用户足以承担长期运行时维护成本；Story Engine 自己的 transaction/session/tool contracts 已稳定。未满足这些条件时，继续使用认证 DSH 比重写 agent loop、tool execution、streaming、provider routing 和 context management 更可靠。

## 7. 开源策略

引擎采用 MIT。示例包必须是原创、CC0 或具备明确再发布授权。每个内容包必须声明 `license`；`packs/private`、运行存档、索引缓存和导入源文件默认不进入 Git。

私人 Dispatch 等商业作品相关验证线不属于公开 1.0 的阻塞依赖，也不得把其资料、文本、提取资源或私人存档放入公开发布物。

## 8. Git 工作规范

### 8.1 仓库和分支

- `D:\DSH-Story-Engine` 是本项目唯一 Git 仓库；不得把工作树复制到 `D:\DeepSeek-Harness`，也不得在 DSH 原版仓库中提交本项目代码。
- `main` 只保存已经通过回归的可恢复基线。日常功能和修复使用 `codex/<简短任务名>` 分支；合并前保持提交边界清晰。
- 开始任务时必须检查工作树。如果 `main` 存在 tracked 未提交修改，先确认来源和范围：属于完整、可验证工作的修改应尽快迁入具名分支，不得因“保护未提交修改”而无限期滞留在 `main`；来源不明或与当前任务无关的修改仍必须保留并单独报告。
- 产品版本以根 `package.json`、客户端 `package.json` 和 `CURRENT_STATUS.md` 三者一致为准；Git 标签表示已验证发布/预发布点，不自动代表标签之后的 main 没有同产品线修复。

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

私人内容包如包含人工核对后的连续性、结局或 UI，最终化文件必须存放在同样被忽略的本地 overlay 中，并由导入脚本逐文件校验哈希后应用。不得只手工修改最终输出目录，否则下一次重建可能丢失已核对结果；overlay、清单和本机验收报告同样不得提交。公开文档只描述这套通用维护规则，不记录某台开发机的私人包是否 ready 或其中的商业内容统计。

### 8.4 提交前验证

代码、Schema、构建配置或 tracked artifact 发生变化时，默认完整验证为：

```powershell
npm run typecheck
npm test
npm run build
npm run typecheck:client
npm run test:client
npm run build:client
git -C D:\DeepSeek-Harness status --short
```

如果 PR 明确为纯文档变更，且没有修改 package version、生成流程、Schema 或 build 输入，则不要求为了形式重跑完整编译测试；必须检查文档内部链接、术语、状态事实和相互引用一致性，并确认 diff 中没有非文档文件。

涉及界面交互或真实恢复路径时，还必须在隔离端口完成真实浏览器验证。测试服务和临时浏览器会话在提交前关闭；验证结果写入当前阶段记录，不提交运行存档和截图，除非截图被明确选为公开文档资产。

### 8.5 状态与版本更新

- `CURRENT_STATUS.md` 是实时事实的唯一入口；每次已验证里程碑或重要切片合并后更新。
- `NEXT_DEVELOPMENT_PLAN.md` 只维护当前和未来任务、依赖及验收条件；已完成的大段实施细节不长期占据 roadmap。
- 长期 Spec 只定义 normative behavior，不写“部分完成”“待验证”等短期状态；需要引用进度时链接 `CURRENT_STATUS.md`。
- 历史报告只保留审计与纠偏价值，统一放在 `docs/archive/`；归档文件不要求随着当前实现持续更新。
- 发布或预发布时同步两个 `package.json` 的版本，完成全套验证后再创建同名 Git 标签。
- 内容包的 `version` 和各 Schema 的 `schemaVersion` 独立演进，不随产品版本机械修改。
