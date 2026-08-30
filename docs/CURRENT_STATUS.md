# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-beta.1`（GitHub 测试版）。
- 核心包 `dsh-story-engine`：`0.8.0-beta.1`。
- 客户端包 `dsh-story-client`：`0.8.0-beta.1`。
- 当前阶段：v0.8 阶段 A、B、C 已完成；阶段 D 开发中；阶段 E 未完成。
- DSH 原版目录：`D:\DeepSeek-Harness`，仅作为依赖与运行环境，不修改源码。
- 项目目录：`D:\DSH-Story-Engine`。
- Git 基线：`main` 分支上的 `v0.8.0-beta.1` 标签；标签后的已合并改动属于同一 beta 开发线，具体代码基线以当前 `main` 为准。

内容包、剧本和存档 Schema 有独立版本，不与产品版本强制相同：`pack.json`、`episode-script` 和 `ui/story-ui.json` 当前均使用 `schemaVersion: 1`；每个内容包的 `version` 由内容作者独立维护。Story Runtime 内部状态 Schema 独立演进；PR #5 / D1 把 Runtime state 从 schema v2 升到 v3 以加入 operation receipts。该分支最终 HEAD 已通过本地自动验证，但在合并前仍不是 main 基线。

## 已完成能力

- V1 内容包加载、校验、安全安装、管理页面和制作向导。
- v0.7 连载式可执行剧本后端及 20 个通用 `story_*` 工具。
- v0.7 正史完整性加固：选择只能写入当前实际游玩的 episode/scene；集末 `completedScenes` 只来自真实 `scene_entered` 历史，未游玩 authored branch 不进入 played canon。
- 普通聊天默认启动，侧边栏进入独立文字游戏界面，两个模式状态隔离。
- 五类频道、结构化消息、人物、草稿、阅读游标和剧情位置投影。
- 宿主本地存档列表、读取、写入、删除与乐观版本锁；同一存档进程内写入串行化，冲突写不会 lost update。
- 动态内容包目录；缺少有效 `ui/story-ui.json` 的包只显示诊断，不允许新建。
- 内容包目录对 `ui/story-ui.json` 执行完整 Schema 对齐校验及人物、频道、消息、草稿和阅读游标的引用完整性检查；无效描述符显示具体诊断并禁用新建。
- 每份存档使用独立隐藏 DSH 会话；选择卡在游戏壳内回答。
- AI 回合 `queued/running/waiting-choice/completed/failed/cancelled` 状态机、可验证临时预览、取消、重试、刷新恢复和按存档隔离均已完成；取消在进行中的 history 请求晚到后仍保持 `cancelled`。
- Stage C 故障验证已覆盖运行中取消、选择等待、断连、retry 去重、跨存档隔离和同 revision 并发写冲突；最新构建产物可重复构建并在真实 DSH 中完成 smoke。
- 另存为通过 DSH `session.fork` 和 Story Runtime 原子克隆创建独立分支。
- Stage D 第一事务切片已完成并合并：完成 AI turn 的 canonical social messages 使用真实 `turnId` 幂等提交；同 turn 同内容重放为 strict no-op，同 turn 不同内容冲突；宿主允许 identical same-revision projection replay，同时继续拒绝同 revision 的不同 stale content。
- Stage D 第一事务切片的真实 crash-window 已验证：宿主已经保存 AI canonical result、pending completed turn 尚未 acknowledge 时刷新恢复，不重复消息、不增加 projection revision、不再产生 409，最终 pending turn 被正常清除。

## 当前开发重点

PR #5 / D1 的 Core Runtime operation-level idempotency 已完成实现和本地自动验证，等待合并。D1 的边界是“调用方提供稳定 operation identity，core 保证原子 mutation 只应用一次”；它不建立顶层 transaction journal，也不负责 hidden DSH turn 恢复。

D1 当前实现方向：

1. 九个会修改 canonical runtime state 的公开 `story_*` mutation 接受稳定 `operation_id`；可选 `transaction_id` 只作为 receipt 关联信息，不代表 transaction journal 已实现。
2. 同一 operation 的 request fingerprint、canonical mutation 和持久 receipt 由 core runtime 保证一致；matching receipt 在 optimistic version 检查前返回，因此“core 已提交但成功响应丢失”的 stale-version retry 不重复 effect。
3. `expectedVersion` 继续保护真正的新 stale writer；同 `operationId` 不同 payload/tool/transaction identity 显式冲突，不污染原 receipt。
4. Runtime schema v3 把 receipts 存在 `_engine.operationReceipts`；旧 v2 state 向前 normalize，未知更高 schema 拒绝读取。
5. checkpoint restore 回滚 gameplay state 时保留已经消费的 operation receipts；同 ID receipt 证据冲突时拒绝恢复，且 restore 与 canonical mutation 使用同一 per-session 写队列。
6. D1 合并后，D2 负责 `transactionId` durable journal、operation step identity 的提前持久化、hidden turn references 和跨域 reconciliation。

正式事务语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`；契约到实现/测试的对应关系见 `TRACEABILITY.md`。

## 尚未完成

- 阶段 D / D1：PR #5 的 core operation receipt 实现与本地 Windows 自动验证已完成，等待合并；本轮未执行真实 DSH tool smoke，不把 worktree 验证表述为真实 DSH 集成验收。
- 阶段 D / D2：`transactionId` journal、hidden turn reference/recovery、child operation step identity 持久化、部分提交恢复与跨域 reconciliation。
- 阶段 D：季/集/场景与频道的完整自动联动、工作内轻量结算的正式界面、越界修订操作界面、集末总结界面。
- 阶段 E：无障碍、长历史分页、存档迁移矩阵、主题/头像、发布审计和第三方许可证清单。
- 1.0 前：V1 兼容承诺、版本/迁移政策、release checklist、公开安装与升级文档和正式发布包。
- 存档重命名、覆盖保存、封面等游戏库细节。

## Dispatch 私人包状态

Dispatch 私人内容包已在本地私人环境完成 finalization，当前游戏库状态为 `ready`，可创建新存档。专用 UI 描述、人物/频道映射、历史连续性、结局状态、续作启动入口和导入防退化覆盖层均已完成本地校验；无法可靠确认的字段继续显式保留为未知，而不是由引擎推断。

本地最终化验证已覆盖内容加载、历史选择映射、源文件哈希、重复导入一致性、游戏库 ready 状态和新建存档模拟。私人包版本、最终化覆盖层、验证摘要和商业游戏资料继续只存在于受忽略的私人环境，不进入公开 Git；旧验证历史保留用于审计。

“可新建”只表示私人内容包已经通过目录/Schema/连续性和创建存档前置检查，不表示正式玩法链路已经完成。季／集／场景的自动联动、运行时剧情位置推进和动态频道成员调整仍属于公开引擎 Stage D。

这条私人内容包验证线不属于公开引擎 1.0 的阻塞依赖；公开版本不得包含 `packs/private`、商业游戏资料、私人验证摘要或最终化覆盖层。

## 验证基线

当前**已合并**的公开引擎基线仍是 PR #4 合并后的 main。PR #5 最终 HEAD 的分支验证结果单独列出，合并前不计入 main 基线：

- 核心：7 个测试文件、22 项测试通过；typecheck 与生产 build 通过。
- Client：13 个测试文件、78 项测试通过；typecheck 与生产 build 通过。
- v0.7 canon-integrity：`src/serial-integration.test.ts` 10 项通过。
- Stage C 浏览器故障矩阵：普通聊天回归、游戏库、公开示例存档、五频道、结构化 AI 回合、运行中取消、选择等待、断连、retry 去重、跨存档隔离和并发写冲突通过。
- Stage D 第一事务切片：story-domain 两项 AI turn 幂等测试、host-store identical replay / stale conflict 测试和真实 crash-window 浏览器验收通过。
- PR #5 / D1 最终 HEAD：核心 9 个测试文件、38 项测试通过；Client 13 个测试文件、78 项测试通过；双方 typecheck/build 通过。新增 operation-idempotency、serial-checkpoint-idempotency、serial-integration 和 plugin 覆盖均通过；本轮未执行真实 DSH tool smoke。
- Dispatch 私人包 finalization 后的本地回归仍为核心 22/22、Client 78/78、双方 typecheck/build 通过，且 `D:\DeepSeek-Harness` 工作树干净；这些结果证明私人包修复没有破坏当时的已合并公开基线，但**不构成 PR #5 / D1 的新增测试验证**。
- 重复 Client build 后 tracked artifacts 保持一致。

## 文档优先级

1. 本文件：当前事实和版本的唯一入口。
2. `NEXT_DEVELOPMENT_PLAN.md`：当前及后续里程碑和验收顺序。
3. `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md`：正式行为契约。
4. `TRACEABILITY.md`：关键契约对应的实现、自动测试和真实验收索引，不取代状态或 Spec。
5. `DEVELOPMENT.md`：长期架构、版本路线和 Git 规范。
6. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：内容、数据和宿主接口契约。
7. `archive/`：历史交付、实施、交接和退役记录，只用于审计，不作为当前任务清单或正式行为契约。

Git 分支、提交、安全排除和验证要求见 `DEVELOPMENT.md` 的“Git 工作规范”。
