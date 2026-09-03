# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-beta.1`（GitHub 测试版）。
- 核心包 `dsh-story-engine`：`0.8.0-beta.1`。
- 客户端包 `dsh-story-client`：`0.8.0-beta.1`。
- 当前阶段：v0.8 阶段 A、B、C 已完成；Stage D 开发中；Stage E 未开始。
- DSH 原版目录：`D:\DeepSeek-Harness`，只作为依赖与运行环境，不修改源码；当前 1.0 认证候选固定为 DSH `0.1.1-rc.2` / tag `dsh-v0.1.1-rc.2` / commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，主开发线不自动追随上游最新版。
- 项目目录：`D:\DSH-Story-Engine`。
- 当前已合并公开基线：`main`，包含 PR #5 / D1 Core Runtime operation idempotency、PR #6 / D2a transaction journal foundation、PR #9 / D2b player transaction coordinator、PR #11 / D2b pre-dispatch recovery hotfix，以及 PR #12 / D2c-1 core preflight operation linking。
- 当前开发重点：D2c-2 / receipt-result reconciliation；工作分支为 `codex/stage-d-receipt-result-reconciliation`。本分支 repo-side implementation 与测试源码已形成，但尚未执行 Windows 本机验证，也尚未同步本分支真实构建产物，因此不能标记为已完成。

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
- PR #9 / D2b 与 PR #11 hotfix 已合并：玩家 submit/retry/recover 接入 Host transaction journal；submit 前保存 `prepared` intent 和 Story Engine hidden `turnId`；accepted response 后绑定 `dshRequestId`；按 rc.2 真实 `user/message.source.rpcId` 与数字 turn 进行分页对账；retry 不重复玩家输入，Host projection 保存后再 acknowledge/journal commit。Host 玩家 projection 可能已落盘、但 hidden evidence 尚未产生的前置失败会保持 `needs-recovery`，浏览器 projection 回滚后仍可按同一 transaction 恢复且不重复玩家输入。
- PR #12 / D2c-1 已合并：九个 mutating `story_*` 在真实 tool body 前先把 `stepKey + operationId` 持久化到 transaction journal；active player transaction 强制 exact `transaction_id`，错配在 body 前拒绝；同 save operation ownership 与 stale journal reread/retry fail-closed。

## 当前开发重点：Stage D / D2c-2

D2 负责在 D1 的 core operation receipts 之上建立顶层 transaction journal 和跨域恢复。D2a、D2b、D2c-1 已进入已合并基线；当前只剩 D2c-2 收口与 D2d 产品/真实故障矩阵。

### 已合并 foundation

1. `StoryTransactionRecord` schema v1 保存 `transactionId`、规范化玩家 input + fingerprint、base projection revision、transaction status、hidden-turn references、child `operationId` references、diagnostic 和 journal revision。
2. transaction 状态：`prepared`、`needs-recovery`、`committed`、`cancelled`、`failed`；`committed/cancelled/failed` 为不可改写终态，终态 record 不能含 active/nonterminal hidden evidence。
3. hidden turn evidence 单向推进：新增 turn 从 `planned` 开始；`planned/uncertain` 不携带 native `dshTurn`；已确认 `dispatched` 不降级回 `uncertain`；`completed/failed/cancelled` 不可倒写。
4. hidden identity 分层：Story Engine `turnId`、DSH `dshRequestId`、DSH numeric `dshTurn`。
5. `StoryTransactionStore` 按 save/transaction 隔离、进程内串行、temp+rename 原子持久化、optimistic revision、identical replay、collision conflict、损坏/语义非法记录 fail-closed。
6. Host transaction API 与 browser `HostTransactionJournal` 已接入 submit/retry/recover；browser bridge 会验证完整 canonical PUT acknowledgement。
7. D2c-1 在 mutating tool body 前持久化 child operation identity，并把 durable transactionId 注入 hidden AI control context；同一原子 mutation retry 保持 transaction/operation identity。
8. D1 receipt 与 D2c-1 operationRef 的语义明确分离：operationRef 证明“body 前已登记这一步”，不证明 canonical effect 已发生。

### D2c-1：Core preflight operation linking — 已完成并合并

PR #12 已合并。主要保证：

- 认证 DSH rc.2 的 `tools/execute` around-dispatch 在最终 `dispatchToolBody()` 前执行 Story Host preflight。
- active transaction 从 durable hidden `sessionId` 反查；同一 session 多 open transaction fail-closed。
- 每个 mutating call 在 body 前追加稳定 `stepKey + operationId`；相同 identity replay 不增加 journal revision，同 operationId 被不同 core step/tool 复用显式冲突。
- active player transaction 的 mutating `story_*` 必须携带 exact `transaction_id`；缺失/错配在 body 前拒绝，D1 receipt fingerprint 因此与顶层 transaction 绑定。
- same-save operation ownership 在最终 journal 写临界区重查；并发 transaction 争用同 operationId 只能有一个 owner。
- operationRef 不等于 effect receipt；高影响 `story_record_work_event` 可合法产生 operationRef 但不写 Runtime receipt。

### D2c-2：Receipt/result reconciliation — 当前工作分支

当前分支已实现以下 repo-side 逻辑：

- `StoryRuntimeStore.readReceipt()` 只读 Runtime schema v3 `_engine.operationReceipts`；schema v2 不作为 D1 receipt 来源，未知/损坏 schema fail-closed。
- Host `GET /story-engine/api/core-receipts/{saveId}/{transactionId}/{operationId}` 只允许读取 transaction-owned operation、Host projection 所属 pack 与 journal-owned hidden sessions；跨 transaction/session receipt 冲突显式拒绝。
- browser `HostCoreReceiptReader` 对 receipt 结构、operationId、transactionId 再校验。
- `DshToolEvidenceReader` 分页读取认证 rc.2 append-only history；`tool/call` 与 `tool/result` 按 callId 配对，并验证 `source.callId` / `toolCallId` 一致。
- 无 receipt evidence 记录规范化 tool arguments identity；同 operationId 被不同 tool/arguments 使用、跨 hidden session 重复、仍有 pending attempt 时 fail-closed。
- `CoreTransactionReconciler` 区分 `applied-or-replayed`、`skipped`、`failed`、`pending`、`inconsistent`。matching D1 receipt 是 applied/replayed 权威证据；当前明确允许的无 receipt success 是高影响 `story_record_work_event` 的 `{ escalated: true, recorded: false }`。
- normal dispatch 和 restart/recover 在外部 hidden/model 等待结束后重新读取 Host journal，避免 D2c-1 preflight 在等待期间推进 revision 后，被 stale browser record 覆盖或丢失 `operationRefs`。
- hidden result 在交给 social commit 路径前先做 Core reconciliation；已 durable 的 social projection 在 recover/acknowledge 时也会再次核对 Core evidence。
- 无 canonical effect 且 core attempts 明确失败可收敛 `failed`；pending/inconsistent 保持 `needs-recovery`。
- 多 operation partial commit 被识别为 `repairablePartial`：已 receipt-confirmed operation 不重做；恢复动作只启动一个 continuation hidden turn；不重发玩家输入；明确 failed 的同一原子 mutation retry 必须复用原 `operation_id`。
- canonical effect 已存在后 cancel 不倒改 canonical history；进入 `needs-recovery` 并通过 reconciliation/continuation 补齐必要结果。只有无 canonical effect 且无 unresolved evidence 才能进入 `cancelled`。

本分支已新增对应自动测试源码，覆盖 receipt store/API、rc.2 tool evidence、reconciler 状态表、stale-journal dispatch/recover、partial continuation、core→social crash recovery、deterministic no-effect failure 与 late cancel。但**这些新增测试尚未在本机执行**，因此当前没有本分支“通过 X 项”的验证数字。

## D2 尚未完成

- D2c-2 尚需 Windows Root/Client typecheck、test、build，以及真实 bundler 同步 tracked `client/story-ui/lib/index.js`、`lib/client.js`、`lib/client.js.map`；源码变更已经触及 Host 与 browser entry，不能手工伪造 artifact。
- D2c-2 尚需适用的 certified DSH `0.1.1-rc.2` ToolRuntime/history smoke，确认当前 receipt/tool-result parser 与真实运行形态一致。
- D2d：非终态 transaction 与 Save As / fork 的正式产品策略。
- D2d：完整真实浏览器 restart/crash-window 矩阵，包括 hidden ambiguity、core→social、partial commit、late cancel、cross-save isolation。

正式事务语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`，当前开发顺序见 `NEXT_DEVELOPMENT_PLAN.md`，实现/验证映射见 `TRACEABILITY.md`。

## 后续阶段

- D3：season / episode / scene 与频道、projection 的权威联动。
- D4：工作内轻量玩法、工作外详细场景、越界修订、集末总结正式 UI。
- D5：原创示例包整集端到端验收。
- Stage E：无障碍、长历史、迁移矩阵、游戏库发布体验、安全/许可证、公开发布文档，以及 certified DSH manifest / compatibility guard 和 DSH-specific boundary inventory。
- 1.0 RC：冻结 V1 compatibility、migration、Host API、公开 `story_*` contract 和认证 DSH runtime baseline；不要求在 1.0 前完成 Standalone Runtime。

## 验证基线

已合并 D1 的验证证据：

- 核心：9 个测试文件、38 项测试通过；typecheck/build 通过。
- Client：13 个测试文件、78 项测试通过；typecheck/build 通过。
- D1 本轮未执行真实 DSH mutating-tool smoke，因此不把上述自动验证描述为真实 DSH 集成验收。
- 更早的 Stage C / social idempotency 浏览器故障矩阵与 host-save-before-acknowledge crash-window 已通过。

D2a / PR #6 本地 Windows 最终自动验证（代码与 artifact HEAD `c822c287e5c0ef72fa37f75ab8629c9b67e09396`）：

- Client `npm run typecheck`：通过。
- Client `npm test`：17 个测试文件、108 项测试全部通过。
- Client `npm run build:node`：通过。
- Client `npm run build:client`：通过。
- `git diff --check`：通过。
- 真实 bundler 更新 `client/story-ui/lib/index.js`；`lib/client.js` 与 `lib/client.js.map` 无变化。
- 重复构建后 tracked artifacts 保持干净。
- 验证 worktree、原主项目未提交文件和 `D:\DeepSeek-Harness` 保持隔离；临时 `node_modules` junction 已删除。
- D2a 该轮当时未执行 D2b coordinator 或真实 DSH/browser 验收；后续 D2b 自动证据见下，真实故障矩阵仍待 D2d。

D2b / PR #9 合并前最终自动验证（修复/artifact HEAD `9865cd9e42c1568091054e66a8f7547464f6dd7d`）：

- 根项目 typecheck/build 通过；9 个测试文件、38 项测试全部通过。
- Client typecheck/build 通过；27 个测试文件、140 项测试全部通过。
- `turn/start` 只携带数字 turn、`user/message.source.rpcId` 携带 request identity 的认证 rc.2 事件形态已纳入回归，包含 start/message 跨页拆分。
- tracked `client/story-ui/lib/client.js`、`client.js.map`、`index.js` 已由真实构建同步，重复构建 hash 一致且工作树干净。
- 本轮未执行真实 certified DSH/browser crash-window 故障矩阵；该验收仍属于 D2d，不得由自动测试代替宣称通过。

D2b / PR #11 pre-dispatch recovery hotfix 自动验证（HEAD `ee0f507303f97925591d1a22aac2c448057b6ee2`）：

- 根项目 typecheck/build 通过；9 个测试文件、38 项测试全部通过。
- Client typecheck/build 通过；28 个测试文件、142 项测试全部通过。
- 自动故障注入覆盖 hidden session bootstrap 与 `beforeDispatch` journal 写入失败；恢复后只派发一次并且不重复玩家输入。
- tracked Client artifacts 已由真实 build 同步，重复构建 hash 一致；`git diff --check` 通过。
- 未执行真实 certified DSH/browser pre-dispatch crash-window；该项仍归入 D2d 完整故障矩阵。

D2c-1 / PR #12 最终验证：

- 根项目 typecheck/build 通过；9 个测试文件、38 项测试全部通过。
- Client typecheck/build 通过；30 个测试文件、154 项测试全部通过。
- 真实 bundler 已同步 `client/story-ui/lib/index.js`、`lib/client.js` 与 `lib/client.js.map`；连续构建 SHA-256 一致且第二次构建没有产生新增 diff。
- 在认证 DSH `0.1.1-rc.2` / commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 的真实 `ToolRuntime` 上加载 Host bundle：core preflight 在实际工具 body 前落盘，真实 D1 receipt 保留同一 `transactionId`，transaction identity 错配在 body 前拒绝且未改变 Runtime/journal。
- `git diff --check` 通过；原项目工作目录和 `D:\DeepSeek-Harness` 工作树保持干净。
- 本切片没有运行完整 `dsh web` 浏览器回合或浏览器 crash-window 矩阵；这些不能由 ToolRuntime smoke 代替，仍在 D2d 适用验收范围内。

D2c-2 当前工作分支验证状态：

- 尚未执行 Root typecheck/test/build。
- 尚未执行 Client typecheck/test/build。
- 尚未生成/提交本分支真实 tracked build artifacts。
- 尚未执行 certified DSH `0.1.1-rc.2` receipt/tool-result history smoke。
- 尚未执行完整浏览器 crash/restart matrix；该完整矩阵仍属于 D2d。
- 因此任何新增测试数量、构建通过或 smoke 通过都必须等本机实际执行后再填写。

## 文档优先级

1. 本文件：当前事实与验证状态。
2. `NEXT_DEVELOPMENT_PLAN.md`：当前及后续里程碑。
3. `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md`：正式行为契约。
4. `TRACEABILITY.md`：契约—实现—验证映射。
5. `DEVELOPMENT.md`：长期架构与 Git 规范。
6. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：内容、数据与宿主接口。
7. `archive/`：历史交付/实施记录，只用于审计。
