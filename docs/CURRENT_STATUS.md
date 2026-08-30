# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-beta.1`（GitHub 测试版）。
- 核心包 `dsh-story-engine`：`0.8.0-beta.1`。
- 客户端包 `dsh-story-client`：`0.8.0-beta.1`。
- 当前阶段：v0.8 阶段 A、B、C 已完成；Stage D 开发中；Stage E 未开始。
- DSH 原版目录：`D:\DeepSeek-Harness`，只作为依赖与运行环境，不修改源码。
- 项目目录：`D:\DSH-Story-Engine`。
- 当前已合并公开基线：`main`，包含 PR #5 / D1 Core Runtime operation idempotency。
- 当前开发分支：`codex/stage-d-transaction-journal-foundation`，实现 D2 transaction journal foundation；分支代码尚未完成本地 Windows 验证，因此不计入已合并基线。

内容包、剧本和 UI 描述 Schema 独立演进：`pack.json`、`episode-script`、`ui/story-ui.json` 当前均使用 `schemaVersion: 1`。Story Runtime state 已在 D1 升到 schema v3，以 `_engine.operationReceipts` 保存 operation receipts。

## 已完成能力

- V1 内容包加载、校验、安全安装、管理页面和制作向导。
- v0.7 连载式可执行剧本后端及 20 个通用 `story_*` 工具。
- `played_canon` 完整性加固：未实际游玩的 authored branch 不进入 played canon；选择只能记录在当前真实 episode/scene。
- 普通 DSH 聊天默认启动；文字游戏使用独立 overlay，普通聊天与游戏状态隔离。
- 五类频道、结构化消息、人物、草稿、阅读游标和剧情位置投影。
- 宿主 projection 持久化、乐观 revision、同存档进程内串行写和 identical same-revision replay。
- 每份存档使用独立隐藏 DSH session；选择卡、取消、retry、刷新恢复和跨存档隔离已具备。
- AI canonical social messages 按稳定 Story Engine `turnId` 幂等提交；宿主保存成功后才 acknowledge pending completed turn。
- PR #5 / D1 已合并：九个会修改 canonical runtime state 的公开 mutation 接受稳定 `operation_id`；matching receipt 在 optimistic version 检查前 replay；同 ID 不同 fingerprint 显式冲突；receipt 与 mutation 原子落盘；checkpoint restore 保留已消费 receipt evidence。

## 当前开发重点：Stage D / D2

D2 负责在 D1 的 core operation receipts 之上建立顶层 transaction journal 和跨域恢复。

当前分支已经实现的 D2 foundation：

1. `StoryTransactionRecord` 与 schema v1：保存 `transactionId`、玩家 input fingerprint、base projection revision、transaction status、hidden-turn references、child `operationId` references、diagnostic 和 journal revision。
2. transaction 状态最低语义：`prepared`、`needs-recovery`、`committed`、`cancelled`、`failed`；`committed/cancelled/failed` 为不可改写终态。
3. hidden turn 状态单向推进：`planned`、`dispatched`、`uncertain` 可向结果态推进；`completed/failed/cancelled` 不可倒写。
4. hidden identity 明确拆成三层：
   - Story Engine `turnId`：稳定逻辑 hidden-turn identity，也是 social canonical commit key；
   - `dshRequestId`：发 prompt 前持久化的 DSH request correlation identity；
   - `dshTurn`：从 DSH durable history 对账得到的原生数字 turn。
5. `StoryTransactionStore`：按 save/transaction 隔离、进程内串行、原子 temp+rename、optimistic revision、identical replay、collision conflict、损坏记录 fail-closed。
6. Windows-safe journal 文件名：transactionId 使用有界 base64url 编码，不直接暴露 `:` 或设备保留名，也不会因最大长度 ID 超出单文件名限制。
7. Host transaction API 与浏览器 persistence primitive 已加入；transaction journal 不提供删除路径，恢复证据当前只增不删。
8. 已新增 contract/store/client bridge 自动测试源码，覆盖相同 transaction ID 不同 input、并发 revision、终态不可改写、Windows 文件名、跨存档隔离和损坏 journal。

这些内容目前仍是**分支实现**，尚未运行项目级 Client typecheck/test/build，也尚未生成并核对最新 tracked `client/story-ui/lib/index.js` 构建产物，因此不能表述为已验证完成。

## D2 尚未完成

- 把 journal 正式接入 `StoryGameShell` 的玩家 submit / retry / recover 流程：必须先持久化 intent，再进行 hidden DSH dispatch。
- 在第一次 hidden prompt 前持久化可复用 `dshRequestId`，并用 DSH `user/message.source.rpcId` 与数字 `turn` history 进行 correlation/reconciliation。
- 不确定 hidden dispatch 的 `needs-recovery` 收敛逻辑。
- child core step identity / `operationId` 在第一次 core mutation 前的 journal 持久化与多 operation 部分恢复。
- core receipt → social projection 的跨域恢复协调器。
- canonical effect 已发生后的 cancel/reconciliation 语义落地。
- 非终态 transaction 与 Save As / fork 的正式产品策略。
- restart、partial commit、hidden retry/continuation、core→social crash-window 的完整自动与真实浏览器矩阵。

正式事务语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`，当前开发顺序见 `NEXT_DEVELOPMENT_PLAN.md`，实现/验证映射见 `TRACEABILITY.md`。

## 后续阶段

- D3：season / episode / scene 与频道、projection 的权威联动。
- D4：工作内轻量玩法、工作外详细场景、越界修订、集末总结正式 UI。
- D5：原创示例包整集端到端验收。
- Stage E：无障碍、长历史、迁移矩阵、游戏库发布体验、安全/许可证和公开发布文档。
- 1.0 RC：冻结 V1 compatibility、migration、Host API 和公开 `story_*` contract。

## 验证基线

已合并 D1 的验证证据：

- 核心：9 个测试文件、38 项测试通过；typecheck/build 通过。
- Client：13 个测试文件、78 项测试通过；typecheck/build 通过。
- D1 本轮未执行真实 DSH mutating-tool smoke，因此不把上述自动验证描述为真实 DSH 集成验收。
- 更早的 Stage C / social idempotency 浏览器故障矩阵与 host-save-before-acknowledge crash-window 已通过。

当前 D2 foundation 分支：**尚未完成本地项目级验证**。新增测试文件存在不等于测试已经运行通过。

## 文档优先级

1. 本文件：当前事实与验证状态。
2. `NEXT_DEVELOPMENT_PLAN.md`：当前及后续里程碑。
3. `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md`：正式行为契约。
4. `TRACEABILITY.md`：契约—实现—验证映射。
5. `DEVELOPMENT.md`：长期架构与 Git 规范。
6. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：内容、数据与宿主接口。
7. `archive/`：历史交付/实施记录，只用于审计。
