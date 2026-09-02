# 事务、幂等与崩溃恢复规范

## 1. 目的

本文定义 DSH Story Engine 在浏览器 social projection、隐藏 DSH Session 与 core Story Runtime 之间执行可重试写操作时的正式行为契约。

目标不是模拟跨进程 ACID，也不承诺分布式 exactly-once。首版采用：

- **at-least-once delivery**：恢复或重试可以再次投递同一逻辑步骤；
- **idempotent application**：同一 canonical mutation 不得重复应用；
- **durable reconciliation**：页面或进程在已定义崩溃窗口退出后，根据稳定身份、持久状态与 receipt 判断已经发生了什么，再完成剩余步骤。

本文与 `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` 共同构成正式契约。当前实现状态以 `CURRENT_STATUS.md` 为准，开发顺序以 `NEXT_DEVELOPMENT_PLAN.md` 为准。

## 2. 事务域

一次玩家工作流可能跨越三个持久域：

1. **隐藏 DSH 回合**：模型上下文、工具调用、选择等待、取消与完成结果；
2. **core runtime**：`source_canon`、`authored_script`、`played_canon`、当前 episode/scene、检查点、修订和会改变游戏事实的 `story_*` 操作；
3. **social projection**：频道、结构化 canonical messages、草稿、阅读位置及 `StorySaveProjection`。

三个域不能被假定为一个原子数据库事务。协调器必须允许其中某一域已经提交而另一域尚未提交，并通过幂等重放恢复，而不是猜测并回滚已经确认的 canonical history。

## 3. 稳定身份层级

### 3.1 `transactionId`

`transactionId` 标识一次顶层逻辑工作流，例如“玩家提交一句话并等待这一轮最终落盘”。

- 在首次向隐藏 DSH、core runtime 或其他外部步骤发起调用之前生成并持久化；
- 同一次 retry、刷新恢复或崩溃恢复必须复用同一 `transactionId`；
- 玩家重新发起一个新动作，即使文本完全相同，也必须生成新的 `transactionId`；
- journal 保存 input fingerprint，防止相同 `transactionId` 被另一份玩家输入错误复用；
- 一个 transaction 可以包含 0、1 或多个 hidden turns，也可以包含 0、1 或多个 core mutations。

因此 `transactionId` 不是所有 hidden turn 或 `story_*` mutation 共用的 idempotency key。

### 3.2 Hidden turn：`turnId`、`dshRequestId` 与 `dshTurn`

隐藏 DSH 回合存在三个不同身份，必须区分：

- **`turnId`**：Story Engine 为一个逻辑 hidden turn 生成的稳定 ID。它在 dispatch 前即可持久化，用于 journal 生命周期、active/canonical-result 引用，以及 social canonical message 的稳定提交键。
- **`dshRequestId`**：DSH prompt correlation identity。若当前 DSH transport 允许业务调用方预先指定 request identity，则必须在 dispatch 前持久化；若 transport 由 carrier 内部生成 identity，则只能在 accepted response 后立即绑定到 journal。认证 DSH `0.1.1-rc.2` 属于后一种：公开 client 由 carrier 生成 rpcId，并在 accepted response 中返回，业务调用方不能在 prompt 前伪造或预占该 ID。
- **`dshTurn`**：DSH Session log 中 `turn/start` / `turn/end` 使用的原生数字 turn 序号。它只有在 DSH 已接受并能从 history 对账后才成为已知事实，并且必须与 `sessionId` 一起解释。

`turnId` **不是** DSH 原生数字 turn 的别名。实现不得因为二者都描述“回合”而混用。

一个 transaction 可以关联多个 hidden turns，例如 initial、safe retry、choice continuation。journal 至少保存：

- ordered hidden turn references；
- 每个 turn 的 `turnId`、已知时的 `dshRequestId`、kind/state；
- 已知时的 `sessionId + dshTurn`；
- 当前 active `turnId`（如有）；
- 哪个 completed `turnId` 最终产生要提交的 canonical social result。

只有实际产出该 canonical message sequence 的 `turnId` 才作为该组 social messages 的提交键。其他 retry/control turns 不能因为属于同一 transaction 而重复追加玩家输入或 canonical result。

若 accepted response 丢失而 carrier-generated `dshRequestId` 未能绑定，或当前部署的 DSH 不提供可靠 request correlation，协调器必须按第 9.2 节降级为显式对账或 `needs-recovery`，不能伪造 exactly-once。

### 3.3 `operationId`

`operationId` 标识一个**原子 canonical mutation**的稳定幂等键，例如一次真实选择记录、一次 consequence 应用或一次场景状态变更。

- 每个可能被 retry/recovery 重复调用的 mutating `story_*` operation 都必须有独立 `operationId`；
- 同一个原子 mutation 的重试复用同一 `operationId`；
- 同一 transaction 内两个不同 mutations 即使 tool/payload 相似，也必须使用不同 `operationId`；
- 调用方必须在第一次 core mutation 调用之前确定并持久化稳定 `operationId`；
- 可以随机生成，也可以由 `transactionId + 持久 stepKey` 确定性派生，但不能依赖未持久化的临时网络 request/tool-call index；
- stable ID 使用 1–128 位 ASCII：首字符为字母或数字，其余字符可使用字母、数字、`.`、`_`、`:`、`-`；
- `operationId` 的作用域至少包含一个 save/runtime domain，不同存档不能因为字符串巧合互相命中 receipt。

Core Runtime 接收这个稳定 ID，并在 canonical mutation 成功时把 receipt 与 mutation 原子持久化。完整 transaction 中由 journal/coordinator 在首次 core call 前保存 child step identity / `operationId`。

### 3.4 Request fingerprint

对决定 transaction 或 operation 语义的规范化请求计算稳定指纹，可使用规范 JSON 哈希或等价机制。

对于同一 `operationId`：

- fingerprint 相同：同一原子 mutation 的 retry/recovery；
- fingerprint 不同：**idempotency conflict**，不得覆盖旧 receipt，也不得当成新 operation 执行。

对于同一 `transactionId`，玩家 input fingerprint 不同同样属于 conflict。冲突调用只能被拒绝，不得把原 journal/receipt 从 `committed` 改写成 `failed`，也不得自动换新 ID 后继续。

### 3.5 Receipt

core canonical mutation 成功后保存持久 receipt。receipt 至少能够证明：

- `operationId`；
- 所属 `transactionId`（如存在）；
- request fingerprint；
- operation 类型；
- 成功结果或可重新返回的最小结果；
- operation 完成后的 runtime/state version；
- 必要时对应 episode、scene、turn 或 revision 信息。

receipt 与其保护的 canonical mutation 必须在同一次持久化提交中写入，不能“先改 state、再补 receipt”。replay result 必须具备稳定 JSON 形状。

## 4. Canonical commit 原则

### 4.1 原始模型输出不是正史

流式文本、未完成 JSON、工具轨迹、模型自由文本和调试信息均为非正史材料。只有经过结构、权限/玩家控制权、人物知识边界和当前 runtime 状态校验后的数据才能进入 canonical commit。

### 4.2 已提交历史不能靠重试倒改

重试只能：

- 返回已有 operation receipt；
- 完成同一 transaction 中尚未完成的 operation 或 social projection；
- 或在尚无 canonical effect 时重新执行明确可安全重试的步骤。

重试不得生成新 transaction/operation identity 来绕过冲突，也不得静默修改已经发生的 `played_canon`。

### 4.3 不跨模型/网络调用持锁

每个 save/runtime 可以使用短期进程内串行队列保护本地提交临界区，但不得在等待模型、网络或用户选择期间长期占有写锁。

完整 coordinator 的推荐顺序：

1. 在短临界区持久化 transaction intent；
2. 为下一 hidden turn 持久化 Story Engine `turnId` 与当前已知的 dispatch evidence；若 DSH 支持 caller-controlled request identity，则同时持久化 `dshRequestId`。认证 rc.2 的 carrier-generated `dshRequestId` 在 accepted response 后立即绑定；为下一 core step 则在 tool body 前持久化 `stepKey + operationId`；
3. 释放 journal 写锁；
4. 执行 DSH / 网络 / 用户选择等待；
5. accepted response 或 DSH durable history 能提供新证据时，把 `dshRequestId`、`sessionId + dshTurn`、hidden state 写回 journal；
6. 获得可验证结果后，以已持久化 `operationId` 调用 Core Runtime；
7. Core Runtime 先查 receipt，再检查 optimistic version，并按第 6 节原子提交；
8. coordinator 根据 receipt 继续其他 operation 或 social projection；
9. 所有必要域完成后再把 transaction 收敛到 `committed`。

## 5. Transaction Journal

### 5.1 最小持久字段

journal 至少保存：

- `transactionId`、`saveId`；
- 原始玩家 input 与稳定 input fingerprint；
- 用于协调的 base projection/runtime revision 信息；
- transaction status；
- ordered hidden turn references；
- active `turnId` 与 canonical-result `turnId`；
- child `stepKey + operationId` identities；
- 必要 diagnostic、journal revision 与时间戳。

journal 是恢复协调证据，不替代 core receipt 或 social projection。

`operationRefs` 中的 `stepKey + operationId` 只证明某个 core step identity 已经被 transaction 计划/预登记，并且可以安全用于后续调用或对账；它**不证明**对应 canonical mutation 已发生。只有 Runtime 中 matching operation receipt 才能证明该 mutation 已 applied/replayed。某些工具允许在进入 mutation 路径前根据领域规则返回合法 no-op/upgrade 结果，因此可以存在 operationRef 而没有 receipt；恢复器不得把“缺少 receipt”一律解释为崩溃、失败或尚待无条件重放。

### 5.2 Transaction 状态

最低状态语义：

- `prepared`：intent 已持久化；尚不能宣称 canonical effect 已完成；
- `committed`：该 transaction 所需 canonical operations 与必要 social projection 均已确认；
- `cancelled`：任何 canonical effect 应用前已确认取消；终态；
- `failed`：尚无 canonical effect 时出现确定性不可恢复错误；终态；
- `needs-recovery`：dispatch 结果不确定、跨域部分提交或进程中断，不能安全宣称 committed/failed。

`committed`、`cancelled`、`failed` 一旦持久化即为不可改写终态；identical same-revision replay 只能返回原记录，不能制造新 revision。

允许的最低收敛关系：

- `prepared` 可继续保持 prepared，或进入 `committed` / `cancelled` / `failed` / `needs-recovery`；
- `needs-recovery` 可在继续对账时保持原状态，最终进入 `committed`，或在确认不存在 canonical effect 且错误确定时进入 `failed`；
- `needs-recovery` 不应通过“用户再次取消”直接变成 `cancelled`，因为它的定义本身表示可能已有未知/部分 effect。

### 5.3 Hidden turn 状态

journal 至少支持 `planned`、`dispatched`、`uncertain`、`completed`、`failed`、`cancelled`。

- `planned`：Story Engine `turnId` 和当前已知 dispatch evidence 已持久化，尚未确认 DSH 接受；对于 carrier-generated request identity，planned 时允许尚无 `dshRequestId`；
- `dispatched`：已经确认 dispatch/turn 存在，但尚未完成；
- `uncertain`：请求可能已被 DSH 接受，当前尚不能证明；
- `completed` / `failed` / `cancelled`：hidden turn 终态，不得被后续轮询倒改。

`dshRequestId` 一旦绑定、`dshTurn` 一旦从 DSH durable history 对账得到，都不得在后续 revision 中换成另一身份。

### 5.4 Journal 写入语义

- 同一 transaction 的写入使用 optimistic journal revision，并在进程内串行化临界区；
- 同 revision、内容完全相同的重放可以作为 already-applied replay 返回原记录；
- 同 revision、内容不同必须冲突；
- 同 `transactionId` 不同 input identity 必须显式冲突；
- journal 文件损坏或身份不一致时恢复流程 fail-closed，不得静默跳过一条可能非终态的 recovery evidence；
- 首版可以不主动删除/压缩 journal；删除与 compaction 见第 12 节。

## 6. Core Runtime 幂等契约

所有会改变 core runtime canonical state、且可能被 retry/recovery 再次调用的公开 `story_*` operation，必须具备 operation-level idempotency。

在同一 session/runtime 的串行提交临界区中顺序固定为：

1. 查找 `operationId` receipt；
2. matching receipt：直接返回原结果，不增加 state version、不重复 event/effect；
3. 同 ID 不同 fingerprint：报告 idempotency conflict，原 receipt 不变；
4. receipt 不存在时才检查 expected version、episode/scene、选择可用性等领域前置条件；
5. 应用一次 canonical mutation；
6. 同一次原子持久化写入 receipt；
7. 只有首次真正应用 mutation 时增加 state version。

因此 response-lost 后，即使 retry 携带首次调用遗留的 stale `expectedVersion`，matching receipt 仍必须优先返回；一个新 operation 的 stale expected version 则仍然失败。

### 6.1 Runtime receipt 与 Schema

当前 Runtime schema v3 把 receipts 保存在 `_engine.operationReceipts`。该字段属于引擎保护元数据。

- v2 state 没有 receipts 时，新代码按空 receipt map 向前 normalize；
- 后续 canonical 写入以当前 schema 持久化；
- 未知更高 Runtime schema 必须拒绝，不能静默降级读取；
- receipt 首次结果与磁盘 replay 使用相同 JSON-persisted shape。

### 6.2 Checkpoint / restore

Checkpoint 不得成为释放已消费 operation identity 的手段。

- canonical scene mutation 自动创建的 pre-scene checkpoint 对同一 `operationId` 使用稳定 identity；
- explicit `story_create_checkpoint` 是恢复工件创建接口，不属于 canonical mutation receipt 集合；
- restore 可以回滚 gameplay state，但必须保留当前 Runtime 已有 receipts；
- checkpoint 与当前 Runtime 对同一 `operationId` 存在冲突 receipt evidence 时必须拒绝；
- restore 与 canonical mutation 使用同一 per-session 串行边界；
- 在新时间线上再次执行语义相似动作必须使用新的 logical operation ID。

## 7. Social Projection 幂等契约

隐藏回合提交 canonical social messages 时：

- 使用实际产出该 canonical result 的 Story Engine `turnId` 作为稳定提交键；
- 同一 `turnId` + 相同 canonical message sequence 重放必须为严格 no-op；
- no-op 不增加 projection revision，不生成新 message ID；
- 同一 `turnId` + 不同 canonical content 必须冲突；
- canonical message IDs 应由稳定提交键确定性派生或具备等价稳定性。

宿主保存 `StorySaveProjection` 时仍使用 optimistic revision；但当前 projection 与提交 projection **revision 相同且内容完全一致**时，重复 PUT 视为成功。revision 相同但内容不同仍为冲突。

客户端只有在宿主确认 social projection 保存成功后，才能 acknowledge 对应 pending completed hidden turn。这关闭“宿主已经保存 AI 正史，但页面在 acknowledge 前崩溃”的窗口。

## 8. 跨域提交顺序

一次 transaction 可以只有 social messages，也可以包含多个 hidden turns、多个 core operations 并最终产生 social 可见结果。

若某 canonical effect 同时影响 core 与 social：

1. 先让 core operation 形成可查询的 idempotent receipt；
2. 再把该 effect 的可见结果投影到 social；
3. social 失败时，恢复器先用 receipt 证明 core 已执行，再只补 social，不重新应用 core。

玩家原始输入、pending indicator 或其他 UI intent 可以在 core commit 前单独持久化，但它们不是“core effect 已提交”的证明。transaction journal 中预登记的 operationRef 同样不是该证明。

只有 AI social messages、没有独立 core mutation 的 transaction，可以使用 canonical-result `turnId` social idempotency + identical host replay，再 acknowledge hidden turn。

恢复事实必须来自重新读取 journal、DSH durable history、core receipts/runtime 与 host projection，不能只看“最后一次 HTTP 是否返回成功”。

## 9. 必须支持的崩溃窗口

### 9.1 Intent 已保存，外部调用尚未开始/完成

恢复保留同一 `transactionId`，读取 journal 决定继续哪个已计划步骤，不生成新 transaction。

玩家 social projection 一旦已经向 Host 发起保存，就必须按“可能已落盘”处理。此后即使 hidden session bootstrap、archive、baseline history 或 `beforeDispatch` journal 写入失败，transaction 也只能保持非终态并进入 `needs-recovery`，不得在缺少 hidden-turn evidence 时直接写成 terminal `failed`。恢复器必须先以 base revision 和 input fingerprint 对账/恢复该玩家 projection，再在同一 transaction 内继续首次 hidden dispatch；不得要求浏览器内存仍保留 pending turn，也不得重复追加玩家输入。

### 9.2 Hidden dispatch 结果不确定

最危险窗口是：DSH 可能已经接受 prompt，但页面在确认 durable history 前退出。

安全策略按能力排序：

1. dispatch 前必须持久化 Story Engine `turnId`、目标 hidden `sessionId` 与可用于恢复的当前 evidence；
2. 若 DSH 支持 caller-controlled request correlation，则同时在 dispatch 前持久化 `dshRequestId`；若像认证 rc.2 一样由 carrier 内部生成 rpcId，则 accepted response 成功返回后立即把该 ID 一次性绑定到 journal；
3. 已知 `dshRequestId` 时，在同一 hidden `sessionId` history 中查找该 identity（例如认证 rc.2 的 `user/message.source.rpcId`），把它关联到所在 `turn/start` / `turn/end` bracket 的原生 `dshTurn`；
4. 找到已接受 request 时恢复已有 turn，不再次发送原始玩家输入；
5. 能证明 request 未被接受时才允许安全重发同一逻辑 attempt；
6. accepted response 丢失导致 carrier-generated request identity 未知、当前 DSH 没有可靠 correlation，或 history 无法唯一判定时，进入 `needs-recovery`，不盲目创建第二个 turn，也不宣称 transport exactly-once。

即使 transport 最终留下重复 transcript artifact，core receipts 与 social `turnId` commit 仍必须阻止重复 canonical effect。

### 9.3 多 hidden turns / retry / continuation

同一 transaction 可增加新的 logical hidden `turnId`。旧 references 保留；retry/control turn 不重新追加原始玩家输入。只有最终实际产生 canonical result 的 completed turn 被设置为 `canonicalResultTurnId`。

### 9.4 模型结果已完成，canonical commit 尚未开始

恢复重新读取 completed hidden evidence，以原 `transactionId`、canonical-result `turnId` 和已持久化 child operation identities 进入提交路径。

### 9.5 Core 已提交，调用方未收到成功

同一 `operationId` 命中 receipt 并返回原结果；继续 transaction 剩余步骤。

### 9.6 多 core operations 只完成部分

逐个检查 child `operationId` receipt；已提交步骤只复用结果，未执行步骤才继续。若某 operationRef 对应的是领域允许的 no-op/upgrade 结果，则必须结合 durable tool/result evidence 或等价权威证据判定为 skipped，而不是因为缺少 receipt 就自动再次执行。

### 9.7 Social host save 已完成，hidden acknowledge 尚未完成

同一 canonical-result `turnId` social commit 为 no-op；identical same-revision host replay 成功；随后 acknowledge/清理 pending turn。

### 9.8 用户取消后结果晚到

恢复/轮询先读取持久 transaction 状态。已在任何 canonical effect 前持久化为 `cancelled` 的 transaction，不得因晚到结果重新进入 commit/failed。

如果 canonical effect 已在取消前提交，不能把该事实倒改为未发生；剩余域进入/保持 `needs-recovery` 并完成对账。

### 9.9 Identity collision

同一 transaction/operation identity 被不同 fingerprint 复用时立即冲突。不得静默覆盖，也不得自动换新 ID 继续；原 journal/receipt 保持不变。

## 10. Journal、Core Runtime 与 Projection 的关系

v1 首版不要求把客户端重写成完整 event sourcing。

```text
transactionId
    ↓
durable transaction journal
    ├─ Story turnId[]
    │    └─ dshRequestId ↔ sessionId + native dshTurn
    ├─ core stepKey / operationId → atomic receipt + runtime canonical state
    └─ canonical-result turnId → StorySaveProjection social commit
                                     ↓
                                     UI
```

权威边界：

- **core runtime**：游戏 canonical state 的权威来源；
- **StorySaveProjection**：social/UI state 的宿主持久化权威投影，不能反向覆盖 core canonical truth；
- **transaction journal**：保存跨域恢复身份、阶段与关联证据；
- **operation receipts**：证明具体 core mutation 是否已应用；
- UI 主要读取 projection，不直接把 journal/receipt 当作聊天历史。

Projection 不是 core receipt 的替代品；receipt 也不是 social projection 的替代品。

## 11. Fork / 另存为

Runtime clone 必须保留已属于继承 canonical history 的 receipts，保证历史 retry 不重复应用旧 effect。

fork 后的新 save/session scope：

- 后续新玩家工作流生成新的 `transactionId`；
- 新 child core mutations 使用新的 `operationId`；
- 新 hidden attempts 使用新的 `turnId/dshRequestId`；
- 不因两个存档来自同一祖先而共享未来 operation/transaction identities。

存在非终态 transaction 时必须有显式策略。v1 最安全策略是暂时禁止另存为，直到 transaction 收敛或人工恢复；不得无条件复制仍依赖旧 hidden session/context 的不完整 journal。

## 12. Receipt 与 Journal 保留 / 压缩

只要某 transaction/operation 仍可能通过 pending turn、旧客户端请求或恢复流程合法重放，就不得删除其 journal/receipt。

未来可以依据 durable checkpoint / recovery watermark 做 compaction，但必须证明被压缩 identity 已不可能合法重试，并保留足够历史一致性证据。v1 初始实现可以选择不主动压缩。

## 13. 最低测试矩阵

至少覆盖：

1. 同一 `operationId` 顺序重放只应用一次；
2. 同一 `operationId` 并发重放只应用一次；
3. 同 ID 不同 operation payload/fingerprint 冲突且原 receipt 不变；
4. 同一 `transactionId` 不同玩家 input fingerprint 冲突且原 journal 不变；
5. 一个 transaction 内多个 core mutations 使用不同 `operationId` 并独立重放；
6. matching receipt 不增加 state version，且优先于旧 `expectedVersion`；
7. 新 operation 遇到 stale expected version 失败且不产生 receipt；
8. Runtime v2 → v3 normalize，未知未来 schema 拒绝；
9. checkpoint restore 保留 receipts、拒绝冲突 evidence；
10. journal create/read/list/update、identical replay、同 revision 冲突与进程重启读取；
11. journal 文件损坏 fail-closed；跨 save 隔离；Windows-safe journal 路径；
12. hidden dispatch 前 Story Engine `turnId` 与 session evidence 已 durable；caller-controlled `dshRequestId` 在支持时也必须 pre-dispatch durable，carrier-generated identity 则验证 accepted 后一次性绑定与 response-loss `needs-recovery`；
13. hidden dispatch 不确定窗口通过真实 DSH `dshRequestId/rpcId` correlation 对账出 native `dshTurn`，或明确进入 `needs-recovery`；
14. 同 transaction 多 hidden retry/continuation turns 不重发原始玩家 input，只提交 canonical-result turn；
15. mutating core tool body 前 `stepKey + operationId` 已 durable，journal preflight 失败时 body 未执行，并发不同 step 不丢失 identity；
16. operationRef 无 receipt 的 planned/no-op 与 matching receipt 的 applied/replayed 能被区分；
17. core commit 后、social commit 前崩溃恢复；
18. 多 operation transaction 中间崩溃只补未完成步骤；
19. social host save 后、AI acknowledge 前恢复；
20. cancelled 后晚到 completed result 不提交；
21. canonical effect 已提交后才收到 cancel 时不倒改历史；
22. fork 后历史 receipts 有效、新 identities 独立，非终态 fork 策略有测试；
23. deterministic build 与 tracked artifacts 一致。

单个阶段切片只能宣称其实际覆盖的子集，不能因为 core receipt 或 journal primitive 测试通过就宣称完整跨域 recovery 已完成。

## 14. 非目标

本文不要求：

- 跨 DSH、浏览器和 Story Runtime 的分布式数据库锁；
- 真正的 exactly-once network delivery；
- 为事务语义修改 DSH 原版源码；
- 在 Stage D 期间把全部 UI 状态重构为 event-sourced architecture；
- 自动回滚已经确认的 `played_canon`。

无法确定外部调用是否产生 canonical effect 时，优先进入 `needs-recovery` 并通过 durable journal/receipt/history 对账，不得以“可能没成功”为理由盲目重复执行。
