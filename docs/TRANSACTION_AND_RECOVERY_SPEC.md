# 事务、幂等与崩溃恢复规范

## 1. 目的

本文定义 DSH Story Engine 在浏览器 social projection、隐藏 DSH Session 与 core Story Runtime 之间执行可重试写操作时的正式行为契约。

目标不是模拟跨进程 ACID，也不承诺分布式 exactly-once。首版采用：

- **at-least-once delivery**：恢复或重试可以再次投递同一逻辑步骤；
- **idempotent application**：同一 canonical mutation 不得重复应用；
- **durable reconciliation**：进程或页面在已定义崩溃窗口退出后，可以根据稳定身份、持久状态与 receipt 判断已经发生了什么，并继续完成剩余步骤。

本文与 `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` 共同构成正式契约。当前实现状态以 `CURRENT_STATUS.md` 为准，开发顺序以 `NEXT_DEVELOPMENT_PLAN.md` 为准。

## 2. 事务域

一次玩家回合可能跨越以下三个持久域：

1. **隐藏 DSH 回合**：模型上下文、工具调用、选择等待、取消和完成结果。
2. **core runtime**：`source_canon`、`authored_script`、`played_canon`、当前 episode/scene、检查点、修订和会修改游戏事实的 `story_*` 操作。
3. **social projection**：频道、结构化 canonical messages、草稿、阅读位置及用于客户端恢复的 `StorySaveProjection`。

三个域不能被假定为一个原子数据库事务。协调器必须允许其中某一域已经提交而另一个域尚未提交，并通过幂等重放恢复，而不是通过猜测回滚已经确认的 canonical history。

## 3. 稳定身份层级

### 3.1 `transactionId`

标识一次顶层逻辑工作流，例如“玩家提交一句话并等待这一回合最终落盘”。

- 在首次向隐藏 DSH 或其他外部步骤发起调用之前生成并持久化。
- 同一次 retry、刷新恢复或崩溃恢复必须复用同一 `transactionId`。
- 玩家重新发起一个新的动作，即使文本完全相同，也必须生成新的 `transactionId`。
- transaction journal 以 `transactionId` 为主要恢复身份。

一个 transaction 可以包含 0、1 或多个 hidden DSH turns，也可以包含 0、1 或多个 core canonical mutations，因此 `transactionId` 不能直接被假定为所有 DSH turn 或 `story_*` mutation 共用的 idempotency key。

### 3.2 `operationId`

标识一个**原子 canonical mutation**的稳定幂等键，例如一次真实选择记录、一次 consequence 应用或一次场景状态变更。

- 每个可能被 retry/recovery 重复调用的 mutating `story_*` operation 都必须有 `operationId`。
- 同一个原子 mutation 的重试复用同一 `operationId`。
- 同一 transaction 内两个不同 mutation，即使调用同一个 tool、payload 相似，也必须使用不同 `operationId`。
- 调用方必须在**第一次 core mutation 调用之前确定**稳定 `operationId`，不能让每次 retry 根据临时网络 request ID 或未持久化 tool-call index 重新生成。
- 首版 core stable ID 使用 1–128 位 ASCII：首字符必须为字母或数字，其余字符可使用字母、数字、`.`、`_`、`:`、`-`。`transactionId` 若通过 core tool 一并传入，使用同一格式约束。
- Core Runtime 的职责是接收这个稳定 ID，并在 canonical mutation 成功时把 receipt 与 mutation 原子持久化；core 不需要为了 D1 幂等能力单独先写一份 operation intent。
- 在完整跨域 transaction 中，coordinator / transaction journal 负责在首次执行该 child step 之前把稳定 step identity / `operationId` 持久化，从而保证进程重启后仍能恢复同一个 ID。这属于 journal/recovery 层，而不是 core receipt 提交本身。
- 实现可以把 `operationId` 设计成随机稳定 ID，也可以由 `transactionId + 持久 step key` 确定性派生；关键是恢复后能够得到同一个值。
- `operationId` 的作用域至少包含一个 save/runtime domain；不同存档不能因为字符串巧合互相命中 receipt。

一个只有单个 core mutation 的简单 transaction 可以选择让 transaction/operation identity 一一映射，但接口和持久化模型仍必须承认“一个 transaction 多个 operation”的情况。

### 3.3 `turnId`

`turnId` 是一个实际隐藏 DSH AI turn 的身份。它用于该 turn 的生命周期以及由该 turn 最终产生的 social canonical messages 的幂等提交。

`transactionId` 与 `turnId` 不是同一概念：transaction 在发送模型前已经存在；一个 transaction 在选择继续、安全 retry 或其他控制续跑中可能关联多个 hidden turns。journal 至少要能记录：

- 已知的 ordered turn references / attempts；
- 当前 active/pending turn（如有）；
- 哪个 completed `turnId` 最终产生了要提交的 canonical social result。

只有实际产出该 canonical message sequence 的 `turnId` 才作为这组 social messages 的提交键。其他 retry/control turns 不能因为属于同一 transaction 而把玩家输入或 canonical result 重复提交。

### 3.4 request fingerprint

对决定一个 transaction 或 operation 语义的规范化请求计算稳定指纹。实现可以使用规范 JSON 哈希或等价机制。

对于同一 `operationId`：

- fingerprint 相同：视为同一原子 mutation 的重试或恢复；
- fingerprint 不同：必须报告 **idempotency conflict**，不得覆盖旧 receipt，也不得当作新 operation 执行。

发生 conflict 时，已有 operation/journal/receipt 的状态保持不变。尤其不能把一个已经 `committed` 的原 operation 改写成 `failed`。

transaction 自身也应保存足够的 input fingerprint，防止同一 `transactionId` 被另一份玩家输入错误复用。

### 3.5 receipt

已经成功应用一个 core canonical mutation 后保存的持久结果。receipt 至少能够证明：

- `operationId`；
- 所属 `transactionId`（如存在）；
- request fingerprint；
- operation 类型；
- 成功结果或可重新返回的最小结果摘要；
- operation 完成后的 runtime/state version；
- 必要时对应的 episode、scene、turn 或 revision 信息。

receipt 必须与其保护的 canonical runtime mutation 原子持久化，不能先改状态、后以另一次非原子写入补 receipt。receipt 的 replay result 必须能够稳定序列化；不能依赖 JSON 会丢失的 `undefined` 结果来表示成功。

可选 `transactionId` 出现在 receipt 中只表示关联关系，不等于该 transaction 已经拥有 durable journal 或跨域恢复能力。

## 4. Canonical commit 原则

### 4.1 原始模型输出不是正史

流式文本、未完成 JSON、工具轨迹、模型自由文本和调试信息均为非正史材料。只有经过结构校验、权限/玩家控制权校验、人物知识边界校验和当前 runtime 状态校验后的数据才能进入 canonical commit。

### 4.2 已提交历史不能靠重试倒改

重试只能：

- 返回已有 operation receipt；
- 完成同一 transaction 中尚未完成的其他 operation 或 social projection；
- 或在尚无 canonical effect 时重新执行可安全重试步骤。

重试不得生成新的 transaction/operation identity 来绕过冲突，也不得静默修改已经发生的 `played_canon`。

### 4.3 不跨模型/网络调用持锁

每个 save/runtime 可以使用进程内串行队列保护本地提交临界区，但不得在等待模型、网络或用户选择期间长期占有写锁。

完整 D2 coordinator 的推荐顺序：

1. 在短临界区内持久化 transaction intent；
2. 释放锁；
3. 执行模型/网络/选择等待；
4. 获得新的 hidden `turnId` 后尽快把 turn reference 写回 journal；
5. 对每个需要 canonical mutation 的步骤，由 coordinator 确定稳定 `operationId`，并在首次 core 调用之前把 child step identity 写入 journal；
6. 获得可验证结果后调用 Core Runtime，传入稳定 `operationId` 与必要 optimistic version；
7. Core Runtime 在自己的短临界区重新读取 receipt 与当前版本，并按第 6 节幂等提交；
8. coordinator 根据 core receipt 继续其余 operation 或 social projection。

只验证 D1 Core Runtime 能力的直接调用可以由测试/调用方显式提供稳定 `operationId`，不要求为了测试 core receipt 先实现 transaction journal。

## 5. Transaction Journal 状态

transaction journal 的状态与 AI bridge 自身的 `queued/running/waiting-choice/completed/failed/cancelled` 回合状态是两个概念，不应混用。

transaction journal 至少支持以下语义状态；实现可以使用不同字段名，但不得削弱状态含义：

- `prepared`：transaction intent 已持久化，尚无 canonical effect。
- `committed`：本 transaction 要求的 canonical operations 和必要 social projection 均已确认。
- `cancelled`：在任何 canonical effect 应用前持久化取消；这是终态，之后晚到的模型结果不能提交。
- `failed`：transaction 在尚无 canonical effect 时遇到确定性的、不可通过同请求重试修复的终态错误，例如 schema 或权限校验失败。
- `needs-recovery`：发生进程退出、网络结果不确定或跨域提交中断，不能安全宣称 committed/failed；恢复器必须重新读取各域状态并幂等协调。

journal 还应保存恢复所需的最小关联信息，例如 `saveId`、input fingerprint、已知 hidden turn references/active turn/canonical-result turn、child `operationId` 列表或 step keys、必要 base revision/version 和时间戳。

`idempotency conflict` 是对错误调用的拒绝，不得自动改写已经存在的原 transaction/operation 状态。

一旦某个 canonical effect 已经提交，后续用户取消不能把该 effect 回滚并把整个 transaction 改写成 `cancelled`。如果仍有其他域尚未完成，应进入或保持 `needs-recovery`，完成对账后收敛到 `committed` 或明确的人工诊断状态。

实现可以增加 `running`、`external-complete`、`committing` 等中间状态，但这些状态不能成为绕过 receipt/idempotency 检查的另一套提交路径。

## 6. Core Runtime 幂等契约

所有会改变 core runtime canonical state、且可能被 retry/recovery 再次调用的公开 `story_*` operation，必须具备 operation-level idempotency。

在同一 session/runtime 的串行提交临界区中，执行顺序固定为：

1. 查找 `operationId` 对应 receipt。
2. 若 receipt 存在且 fingerprint 相同，直接返回原结果；不得增加 state version，不得重复追加事件或再次应用状态变化。
3. 若 receipt 存在但 fingerprint 不同，报告 idempotency conflict，并保持原 receipt/operation 不变。
4. 若 receipt 不存在，再校验 expected version、当前 episode/scene、选择可用性和其他领域前置条件。
5. 应用一次 canonical mutation。
6. 在**同一次持久化提交**中写入 receipt。
7. 仅在真正首次应用 canonical mutation 时增加 state version。

因此，以下情况必须安全：

- 相同 choice operation 被同一 `operationId` 重放；
- 相同 consequence operation 在进程崩溃后重试；
- core 已提交但调用方没有收到成功响应，即使 retry 携带首次调用时已经 stale 的 `expectedVersion`，matching receipt 仍先返回；
- 一个 transaction 中第一个 core operation 已提交、第二个尚未执行；
- social projection 尚未完成而一个或多个 core receipts 已存在。

`expectedVersion` 与 `operationId` 解决不同问题：前者防止 stale writer 覆盖当前状态，后者防止同一原子 mutation 被重复应用。两者必须同时保留。

### 6.1 Runtime receipt 存储与 Schema

D1 的 Runtime state 使用 schema v3，并把 receipts 保存在 `_engine.operationReceipts`。该字段属于引擎保护元数据，普通 `story_commit_state` 不能直接改写。

兼容规则：

- 旧 Runtime schema v2 没有 receipt 字段时，新代码按空 receipt map 向前 normalize；
- 首次后续 canonical 写入会以当前 schema 持久化状态；
- 遇到高于当前实现支持的未知 Runtime schema 时必须拒绝读取/写入，不能静默当作旧版本降级；
- 不要求旧版本代码能够读取未来的新 schema；向后兼容的主要方向是新代码读取受支持的旧存档。

D1 不主动压缩 receipts。保留/compaction 见第 12 节。

### 6.2 Checkpoint、restore 与 receipts

Checkpoint 是 gameplay recovery 工件，不得成为释放已经消费过的 operation identity 的手段。

- 由 canonical scene mutation 自动创建的 pre-scene checkpoint 对同一个 `operationId` 使用稳定 checkpoint identity；同 operation replay 不创建第二份内部 checkpoint。
- `story_create_checkpoint` 是显式恢复工件创建接口，本身不是 D1 canonical mutation receipt 集合的一员。
- restore 可以把 gameplay state 回滚到旧 checkpoint，但必须保留当前 Runtime 已经存在的 operation receipts；否则 checkpoint 之后已经执行过的旧 operation 会在 retry 时再次应用。
- 如果 checkpoint 与当前 Runtime 对同一 `operationId` 保存了两份内容不一致的 receipt，这是冲突 evidence，restore 必须拒绝，不能任选一份静默覆盖。
- restore 会修改 Runtime state，因此必须和 canonical mutation 使用同一个 per-session 写串行化边界，不能与正在提交的 operation 互相覆盖。
- restore 后若玩家希望在新时间线上再次执行语义相似的动作，必须产生新的 logical operation identity；旧 operation ID 仍表示历史上已经消费过的那次操作。

## 7. Social Projection 幂等契约

隐藏 DSH AI 回合提交 canonical social messages 时：

- 使用**实际产出这组 canonical result 的真实 `turnId`**作为稳定提交键；
- 同一 `turnId` + 相同 canonical message sequence 重放必须为严格 no-op；
- no-op 不增加 projection revision，不生成新的 message ID；
- 同一 `turnId` + 不同 canonical content 必须报告提交冲突；
- canonical message ID 应由稳定提交键确定性派生或具备等价稳定性。

宿主保存 `StorySaveProjection` 时：

- 正常写入仍使用 optimistic revision；
- 如果宿主当前 projection 与提交 projection **revision 相同且内容完全一致**，重复 PUT 视为成功；
- 如果 revision 相同但内容不同，仍必须返回版本冲突；
- 客户端只有在宿主确认保存成功后，才能 acknowledge 对应 pending completed AI turn。

该规则用于关闭“宿主已经保存 AI 正史，但页面在 acknowledge 前崩溃”的窗口。

## 8. 跨域提交与恢复顺序

一次 transaction 可能只影响 social projection，也可能包含多个 hidden turns、多个 core operations 并最终投影 social 可见结果。

若一个 canonical effect 同时需要进入 core runtime 与 social 可见结果，对应 core operation 必须先形成可查询的 idempotent receipt，social projection 再投影**该 canonical effect 的可见结果**。如果 core 已经提交而 social 写入失败，恢复器通过 receipt 确认“不能再次应用该 core operation”，然后只补 social projection。

玩家原始输入、pending indicator 或其他尚未表示 canonical result 的 UI intent 可以在 core commit 前被单独持久化；它们不能被当作“core effect 已经提交”的证明。

对于只有 AI social messages、没有独立 core mutation 的 transaction，可以直接使用 canonical-result `turnId` social idempotency + identical host replay，再 acknowledge hidden turn。

协调器不得把“最后一个 HTTP 请求是否成功返回”当作唯一事实来源。恢复时必须重新读取 transaction journal、hidden DSH history/turn state（能力允许时）、core receipts/runtime state 与 host projection。

## 9. 必须支持的崩溃窗口

### 9.1 Transaction intent 已保存，外部调用尚未完成

恢复：保留同一 `transactionId`；根据外部回合状态继续等待或安全重试。不得生成新 transaction。

### 9.2 Hidden dispatch 结果不确定

最危险的窗口是：DSH 可能已经接受新的 hidden turn，但页面/进程在收到或持久化该 `turnId` 前退出。

优先策略：

1. 如果 DSH 支持客户端幂等键或可查询 correlation metadata，使用 `transactionId`/稳定 dispatch key 对账，恢复已存在 turn，而不是创建第二个。
2. 如果只能通过 history/请求内容中的安全 correlation marker 可靠识别，则必须先完成对账再决定是否重发。
3. 如果 DSH 既没有稳定幂等/metadata，也无法可靠从 history 判断，transaction 必须进入 `needs-recovery`；实现不得宣称 hidden transport exactly-once。

在第三种情况下，如最终恢复策略不得不产生重复 hidden transcript artifact，这些重复 transport artifacts 仍然不是 canonical history。core `operationId` receipts 和 social `turnId` commit rules 必须保证它们不能重复应用 core effect 或重复进入 canonical social messages。该限制和 DSH 能力边界必须在 Stage D 集成测试中明确记录。

### 9.3 多个 Hidden turns / retry continuation

安全 retry、选择 continuation 或控制提示可能在同一 transaction 下创建新的 hidden `turnId`。恢复必须保留已有 turn references，不重新追加原始玩家输入；只有实际产生最终 canonical result 的 turn 才进入 social commit。

### 9.4 模型结果已完成，canonical commit 尚未开始

恢复：重新取得并校验已完成结果，再以原 `transactionId`、canonical-result `turnId` 和已持久化 child operation identities 进入提交路径。

### 9.5 某个 core operation 已提交，调用方在收到成功前崩溃

恢复：同一 `operationId` 命中 receipt，返回原结果，不重复应用状态；继续同一 transaction 中尚未完成的 operation/social projection。

### 9.6 多个 core operations 只完成了一部分

恢复：逐个检查 child `operationId` receipt；已 committed 的步骤只复用结果，未执行步骤才继续。不得通过重新执行整个 transaction 重复应用前半段。

### 9.7 social projection 已写入宿主，pending AI turn 尚未 acknowledge

恢复：同一 canonical-result `turnId` 的 social commit 为 no-op；identical same-revision host replay 成功；随后 acknowledge 并清除 pending completed turn。

### 9.8 用户取消后模型结果晚到

恢复/轮询必须先读取持久取消状态。已经在 canonical commit 前持久化为 `cancelled` 的 transaction，不得因为晚到 history、流式片段、解析错误或 completed result 重新进入 commit/failed。

如果 canonical effect 已在取消到达前提交，则不能把该事实倒改为未发生；剩余跨域状态按 `needs-recovery` 对账。

### 9.9 同一 ID 被不同请求复用

同一 transaction 或 operation identity 被不同 fingerprint 复用时立即报告 conflict。不得选择其中一个请求静默覆盖，也不得自动生成新 ID 后继续执行；已有 journal/receipt 不得被该冲突调用改写。

## 10. Journal、Core Runtime 与 Projection 的关系

v1 首版**不要求把整个客户端重写为完整 event sourcing**。

正式方向是：

```text
transactionId
    ↓
durable transaction journal
    ├─ hidden DSH turnId[] lifecycle / canonical-result turn
    ├─ core operationId → atomic receipt + core runtime canonical state
    └─ canonical-result turnId → StorySaveProjection social commit
                                     ↓
                                     UI
```

权威边界：

- **core runtime** 是游戏 canonical state（尤其 `played_canon`、当前 episode/scene、选择和后果）的权威来源；
- **StorySaveProjection** 是当前 social/UI state 的宿主持久化权威投影；它不能反向覆盖 core canonical truth；
- **transaction journal** 协调跨域流程并保存恢复身份/阶段；
- **operation receipts** 证明具体 core mutation 是否已经应用；
- UI 主要读取 projection，不直接消费 receipts；
- 可选的 append-only domain events 可以用于历史审计、迁移或未来增量同步，但 v1 首版不要求所有草稿、阅读游标和 UI 状态都通过 event log 完整重建。

Projection 不是 core receipt 的替代品；receipt 也不是 social projection 的替代品。

## 11. Fork、另存为与身份

`session.fork` / Runtime clone 创建新存档时，已有 canonical history 与用于证明这段历史的 receipts 应随 runtime 一起复制，从而保证恢复历史请求时不会重复应用已经发生的 core effect。

复制后的新存档拥有新的 save/session scope。之后新产生的玩家 transaction 必须生成新的 `transactionId`，其 child operations 也生成新的 `operationId`；不能因为两个存档来自同一祖先而共享未来操作身份。

如果 fork 时存在非终态 transaction，产品必须定义是禁止 fork、先完成/取消该 transaction，还是把其完整恢复映射（包括所有必要 hidden turn references）显式迁移到新存档；不得隐式复制一个仍指向旧隐藏 DSH context 的不完整 transaction。首版可以选择在非终态 transaction 存在时禁止另存为。

## 12. Receipt 与 Journal 保留/压缩

在某个 transaction/operation 仍可能通过 pending turn、journal、旧客户端请求或恢复流程被重新投递时，不得删除其恢复记录或 receipt。

未来允许基于 durable checkpoint / recovery watermark 做 compaction，但必须先证明被压缩的 identity 已不可能合法重试，并保留足够的历史一致性信息。v1 初始实现可以选择不主动压缩 receipts。

## 13. 最低测试矩阵

实现 core/runtime 事务层时至少覆盖：

1. 同一 `operationId` 顺序重放，只应用一次 effect。
2. 同一 `operationId` 并发重放，只应用一次 effect。
3. 同一 `operationId` + 不同 payload/fingerprint 冲突，并且不改变原 operation/receipt 状态。
4. 同一 `transactionId` 被不同玩家 input fingerprint 复用时冲突。
5. 一个 transaction 内两个不同 core mutations 使用不同 `operationId`，能够各自提交和重放。
6. 首次 operation 提交成功后重试不增加 state version；matching receipt 的优先级高于首次调用遗留的 stale `expectedVersion`。
7. 新 operation 遇到 stale expected version 时失败且不产生 receipt。
8. Runtime v2 state 向前 normalize 到 v3；未知更高 schema 被拒绝。
9. checkpoint restore 保留当前 receipts、拒绝同 ID 冲突 evidence，并与 canonical mutation 串行。
10. hidden dispatch 在 turnId 持久化前进入不确定状态时，按实际 DSH 能力进行 correlation/recovery，不盲目宣称 exactly-once。
11. 同一 transaction 包含多个 hidden retry/continuation turns 时，不重复提交原始玩家输入，只提交最终 canonical result。
12. core operation commit 后、social commit 前崩溃恢复。
13. 多 operation transaction 在中间崩溃后只补未完成步骤。
14. social host save 后、AI acknowledge 前崩溃恢复。
15. `cancelled` 后晚到 completed result 不提交。
16. canonical effect 已提交后才收到 cancel 时，不倒改历史并正确进入 reconciliation。
17. 两个 save 的相同/相似 transaction/operation 互不命中 receipt。
18. fork 后历史 receipt 保持有效，新 transaction/operation 身份独立；非终态 transaction 的 fork 策略有测试。
19. 进程重启后仍能发现并恢复非终态 journal 记录。
20. deterministic build 与 tracked artifact 一致性不因事务实现破坏。

D1 可以先覆盖第 1、2、3、5、6、7、8、9 项的 core-side 子集；涉及 transaction journal、hidden turn 与跨域 restart 的项目属于 D2 及之后的集成验收。不能因为 D1 测试通过就宣称第 4、10–19 项已经完成。

## 14. 非目标

本文不要求：

- 跨 DSH、浏览器和 Story Runtime 的分布式数据库锁；
- 真正的 exactly-once network delivery；
- 为了事务语义修改 DSH 原版源码；
- 在 Stage D 期间把全部 UI 状态重构为 event-sourced architecture；
- 自动回滚已经确认的 `played_canon`。

出现无法确定外部调用是否产生 canonical effect 的情况时，优先进入 `needs-recovery` 并通过持久 journal/receipt/state 对账，不得以“可能没成功”为理由盲目重复执行。
