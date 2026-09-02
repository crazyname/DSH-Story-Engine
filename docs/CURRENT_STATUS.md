# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-beta.1`（GitHub 测试版）。
- 核心包 `dsh-story-engine`：`0.8.0-beta.1`。
- 客户端包 `dsh-story-client`：`0.8.0-beta.1`。
- 当前阶段：v0.8 阶段 A、B、C 已完成；Stage D 开发中；Stage E 未开始。
- DSH 原版目录：`D:\DeepSeek-Harness`，只作为依赖与运行环境，不修改源码；当前 1.0 认证候选固定为 DSH `0.1.1-rc.2` / tag `dsh-v0.1.1-rc.2` / commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，主开发线不自动追随上游最新版。
- 项目目录：`D:\DSH-Story-Engine`。
- 当前已合并公开基线：`main`，包含 PR #5 / D1 Core Runtime operation idempotency、PR #6 / D2a transaction journal foundation、PR #9 / D2b player transaction coordinator，以及 PR #11 / D2b pre-dispatch recovery hotfix。
- 当前开发重点：D2c core step journal + cross-domain reconciliation；当前工作分支先交付 D2c-1 / core preflight operation linking，不宣称完整 D2c。

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

## 当前开发重点：Stage D / D2c

D2 负责在 D1 的 core operation receipts 之上建立顶层 transaction journal 和跨域恢复。

已合并基线包含 D2a foundation：

1. `StoryTransactionRecord` 与 schema v1：保存 `transactionId`、规范化玩家 input + fingerprint、base projection revision、transaction status、hidden-turn references、child `operationId` references、diagnostic 和 journal revision。
2. transaction 状态最低语义：`prepared`、`needs-recovery`、`committed`、`cancelled`、`failed`；`committed/cancelled/failed` 为不可改写终态，且终态 record 本身不能含 active/nonterminal hidden evidence。
3. hidden turn evidence 单向推进：新增 turn 必须从 `planned` 开始；`planned/uncertain` 不能携带 native `dshTurn`；一旦 `dispatched` 已确认 dispatch/turn 存在就不能降级回 `uncertain`；`completed/failed/cancelled` 不可倒写。
4. hidden identity 明确拆成三层：
   - Story Engine `turnId`：稳定逻辑 hidden-turn identity，也是 social canonical commit key，并遵守 Story UI stable-ID 格式；
   - `dshRequestId`：认证 rc.2 在 accepted response 后可取得并一次性绑定的 DSH request correlation identity，独立于 Story/social ID；
   - `dshTurn`：从 DSH durable history 对账得到的原生数字 turn。
5. `StoryTransactionStore`：按 save/transaction 隔离、进程内串行、原子 temp+rename、optimistic revision、identical replay、collision conflict、损坏/语义非法记录 fail-closed；新建 journal 只能是 revision 0 的 `prepared` 空证据 intent，持久化和读取时会重算 input fingerprint。
6. transaction input `channelId` 使用现有 Story UI stable-ID 契约；Story `turnId`、`dshRequestId` 与 native `(sessionId,dshTurn)` 在同一 transaction 中执行格式/唯一性/引用约束；`activeTurnId` 与 `canonicalResultTurnId` 只允许引用合法 lifecycle 状态。
7. Windows-safe journal 文件名：transactionId 使用有界 base64url 编码，不直接暴露 `:` 或设备保留名，也不会因最大长度 ID 超出单文件名限制。
8. Host transaction API 与浏览器 persistence primitive 已加入；transaction journal 不提供删除路径，恢复证据当前只增不删。browser bridge 会拒绝跨 save/transaction path identity 的响应以及不匹配的 save acknowledgement。
9. contract/store/client bridge/Host API 自动测试覆盖 deterministic fingerprint、input collision、终态/hidden lifecycle、backward transition、identity duplication、bootstrap bypass、并发 revision、restart persistence、atomic temp+rename、跨存档、JSON/semantic corruption、Windows 文件名、Host GET/list/PUT、optimistic/collision 409、坏 path/percent decode 400、同源写，以及 browser bridge load/save/list/response identity。
10. Client tracked artifacts 已由真实 bundler 同步：`lib/index.js` 随 Node/Host entry 变化更新，`lib/client.js` 与 `lib/client.js.map` 保持不变；重复构建后 worktree 保持干净。

D2b 已把该 foundation 接入玩家 submit/retry/recover 和 hidden DSH history correlation。D2 整体仍未完成：core operation receipts 尚未完成顶层 reconciliation，cancel 后 canonical-effect reconciliation、fork/restart 产品策略及完整真实浏览器故障矩阵仍待 D2c/D2d。

### D2c-1：Core preflight operation linking — 当前工作分支，待验证/合并

当前分支 `codex/stage-d-core-step-reconciliation` 先建立 core mutation 的 durable-before-body 边界：

- 认证 DSH rc.2 的 `tools/execute` around-dispatch 在最终 `dispatchToolBody()` 之前执行；Story Host 只拦截九个 mutating `story_*`，先完成 transaction journal preflight，成功后才调用 `next()` 进入工具 body。
- active transaction 由 journal 中 hidden turn 的 durable `sessionId` 反查，而不是依赖浏览器内存；同一个 DSH session 若同时映射多个 open transaction 会 fail-closed。
- 每个 mutating call 在 body 前把稳定 `stepKey + operationId` 追加到 `operationRefs`；相同 identity replay 不增加 journal revision，同一 `operationId` 被不同 core step/tool 复用显式冲突。
- 可选 `transaction_id` 在此层作为额外 assertion；若提供则必须与 session 解析出的 transaction 匹配。没有 open player transaction、也没有声明 `transaction_id` 的独立 Story 工具调用仍保持可用。
- 并发不同 core step 使用 optimistic reread/retry 合并追加；真实 step/operation identity 冲突在重读后仍拒绝。
- `operationRef` 只证明“该 core step identity 已在工具 body 前持久化”，不证明 canonical mutation 已经发生。是否 applied 必须由匹配的 Core Runtime receipt 证明；这一区分也覆盖 `story_record_work_event` 高影响升级而不落盘的合法 no-op 路径。

该切片目前尚未执行本机 Client typecheck/test/build，也尚未由真实 bundler 同步新的 Host `lib/index.js`；因此不属于已验证/可合并基线。D2c-2 仍需把 tool result / core receipt 与 social projection reconciliation 接起来，才能解决 core→social crash window、partial multi-operation 和 late cancel after canonical effect。

## D2 尚未完成

- D2c-1 当前只实现了 child core step identity / `operationId` 在 mutation body 前的 journal preflight；本机验证、tracked Host artifact 同步和合并仍待完成。
- D2c-2：core receipt / tool result → social projection 的跨域恢复协调器，以及多个 core mutation 部分提交后的 applied/skipped 判定。
- canonical effect 已发生后的 cancel/reconciliation 语义落地。
- 非终态 transaction 与 Save As / fork 的正式产品策略。
- restart、partial commit、hidden retry/continuation、core→social crash-window 的完整自动与真实浏览器矩阵。

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

D2c-1 当前工作分支尚未执行 typecheck/test/build，也没有真实 DSH/browser 验收。由于 Node/Host entry 已修改，`client/story-ui/lib/index.js` 在本分支上预期为 stale，必须由认证 Windows DSH toolchain 真实构建后同步；不得手工伪造 bundle。`lib/client.js` / `client.js.map` 是否变化以真实 build 结果为准。

本文件后续的 docs-only 状态同步不改变上述已验证代码或 tracked artifact 内容，无需把文档提交冒充一次新的代码验证。

## 文档优先级

1. 本文件：当前事实与验证状态。
2. `NEXT_DEVELOPMENT_PLAN.md`：当前及后续里程碑。
3. `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md`：正式行为契约。
4. `TRACEABILITY.md`：契约—实现—验证映射。
5. `DEVELOPMENT.md`：长期架构与 Git 规范。
6. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：内容、数据与宿主接口。
7. `archive/`：历史交付/实施记录，只用于审计。
