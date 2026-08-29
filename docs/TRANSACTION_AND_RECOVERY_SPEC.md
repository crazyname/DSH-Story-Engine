# 事务、幂等与崩溃恢复规范

## 1. 目的

本文定义 DSH Story Engine 在浏览器 social projection、隐藏 DSH Session 与 core Story Runtime 之间执行可重试写操作时的正式行为契约。

目标不是模拟跨进程 ACID，也不承诺分布式 exactly-once。首版采用：

- **at-least-once delivery**：恢复或重试可以再次投递同一逻辑操作；
- **idempotent application**：同一逻辑操作不得重复应用 canonical effect；
- **durable reconciliation**：进程或页面在任意已定义崩溃窗口退出后，可以根据稳定 ID、持久状态与 receipt 判断已经发生了什么，并继续完成剩余步骤。

本文与 `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` 共同构成正式契约。当前实现状态以 `CURRENT_STATUS.md` 为准，开发顺序以 `NEXT_DEVELOPMENT_PLAN.md` 为准。

## 2. 事务域

一次玩家回合可能跨越以下三个持久域：

1. **隐藏 DSH 回合**：模型上下文、工具调用、选择等待、取消和完成结果。
2. **core runtime**：`source_canon`、`authored_script`、`played_canon`、当前 episode/scene、检查点、修订和会修改游戏事实的 `story_*` 操作。
3. **social projection**：频道、结构化 canonical messages、草稿、阅读位置及用于客户端恢复的 `StorySaveProjection`。

三个域不能被假定为一个原子数据库事务。协调器必须允许其中某一域已经提交而另一个域尚未提交，并通过幂等重放恢复，而不是通过猜测回滚已经确认的 canonical history。

## 3. 术语

### 3.1 `operationId`

标识一次**逻辑玩家操作或 canonical runtime mutation**的稳定 ID。

- 在首次向外部模型或 runtime 发起可能产生 canonical effect 的动作之前生成。
- 同一次重试、刷新恢复或崩溃恢复必须复用同一 `operationId`。
- 玩家重新执行一个新的动作，即使文本完全相同，也必须生成新的 `operationId`。
- `operationId` 的作用域至少包含一个 save/runtime domain；不同存档不能因为字符串巧合互相命中 receipt。

### 3.2 `turnId`

隐藏 DSH AI 回合的稳定 ID。`turnId` 可以作为该 AI 回合 social canonical messages 的提交键，但不能自动替代所有 core runtime mutation 的 `operationId`；两者的映射如存在，必须持久化并可恢复。

### 3.3 request fingerprint

对决定逻辑操作语义的规范化请求计算的稳定指纹。实现可以使用规范 JSON 哈希或等价机制。

同一 `operationId`：

- fingerprint 相同：视为同一逻辑操作的重试或恢复；
- fingerprint 不同：必须报告 **idempotency conflict**，不得覆盖旧 receipt，也不得当作新操作执行。

### 3.4 receipt

已经成功应用 canonical effect 后保存的持久结果。receipt 至少能够证明：

- `operationId`；
- request fingerprint；
- 操作类型；
- 成功结果或可重新返回的最小结果摘要；
- 操作完成后的 runtime/state version；
- 必要时对应的 episode、scene、turn 或 revision 信息。

receipt 必须与其保护的 canonical runtime mutation 原子持久化，不能先改状态、后以另一次非原子写入补 receipt。

## 4. Canonical commit 原则

### 4.1 原始模型输出不是正史

流式文本、未完成 JSON、工具轨迹、模型自由文本和调试信息均为非正史材料。只有经过结构校验、权限/玩家控制权校验、人物知识边界校验和当前 runtime 状态校验后的数据才能进入 canonical commit。

### 4.2 已提交历史不能靠重试倒改

重试只能：

- 返回已有 receipt；
- 完成尚未完成的其他持久域投影；
- 或在尚无 canonical effect 时重新执行可安全重试步骤。

重试不得生成新的 ID 来绕过冲突，也不得静默修改已经发生的 `played_canon`。

### 4.3 不跨模型/网络调用持锁

每个 save/runtime 可以使用进程内串行队列保护本地提交临界区，但不得在等待模型、网络或用户选择期间长期占有写锁。

推荐顺序：

1. 在短临界区内持久化操作意图；
2. 释放锁；
3. 执行模型/网络/选择等待；
4. 获得可验证结果后重新进入短临界区；
5. 重新读取操作状态与当前版本；
6. 幂等提交 canonical effect。

## 5. 操作状态

事务 journal 的状态与 AI bridge 自身的 `queued/running/waiting-choice/completed/failed/cancelled` 回合状态是两个概念，不应混用。

事务 journal 至少支持以下语义状态；实现可以使用不同字段名，但不得削弱状态含义：

- `prepared`：操作意图已经持久化，尚无 canonical effect。
- `committed`：所有本操作要求的 canonical effects 已确认，receipt 可用于重放。
- `cancelled`：在 canonical commit 前持久化取消；这是终态，之后晚到的模型结果不能提交。
- `failed`：确定性的、不可通过同请求重试修复的终态错误，例如 schema/权限/idempotency conflict。
- `needs-recovery`：发生进程退出、网络结果不确定或跨域提交中断，不能安全宣称 committed/failed；恢复器必须重新读取各域状态并幂等协调。

实现可以增加 `running`、`external-complete`、`committing` 等中间状态，但这些状态不能成为绕过 receipt/idempotency 检查的另一套提交路径。

## 6. Core Runtime 幂等契约

所有会改变 core runtime canonical state、且可能被 retry/recovery 再次调用的 `story_*` 操作，必须具备 operation-level idempotency。

在同一 session/runtime 的串行 `mutate()` 临界区中，推荐执行顺序：

1. 查找 `operationId` 对应 receipt。
2. 若 receipt 存在且 fingerprint 相同，直接返回原结果；不得增加 state version，不得重复追加事件或再次应用状态变化。
3. 若 receipt 存在但 fingerprint 不同，报告 idempotency conflict。
4. 若 receipt 不存在，再校验 expected version、当前 episode/scene、选择可用性和其他领域前置条件。
5. 应用一次 canonical mutation。
6. 在**同一次持久化提交**中写入 receipt。
7. 仅在真正首次应用 canonical mutation 时增加 state version。

因此，以下情况必须安全：

- 相同 choice 被同一 `operationId` 重放；
- 相同 consequence 在进程崩溃后重试；
- core 已提交但调用方没有收到成功响应；
- social projection 尚未完成而 core receipt 已存在。

`expectedVersion` 与 `operationId` 解决不同问题：前者防止 stale writer 覆盖当前状态，后者防止同一逻辑操作被重复应用。两者必须同时保留。

## 7. Social Projection 幂等契约

隐藏 DSH AI 回合提交 canonical social messages 时：

- 使用真实 `turnId` 作为该 AI result 的稳定提交键；
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

一次操作可能只影响 social projection，也可能同时影响 core runtime 与 social projection。

若存在 core canonical mutation，core runtime 必须先形成可查询的 idempotent receipt，social projection 再投影其可见结果。原因是：如果 core 已经提交而 social 写入失败，恢复器可以通过 receipt 确认“不能再次应用 core effect”，然后只补 social projection。

对于只有 AI social messages、没有独立 core mutation 的回合，可以直接使用 `turnId` social idempotency + identical host replay，再 acknowledge hidden turn。

协调器不得把“最后一个 HTTP 请求是否成功返回”当作唯一事实来源。恢复时必须重新读取持久状态。

## 9. 必须支持的崩溃窗口

### 9.1 intent 已保存，外部调用尚未完成

恢复：保留同一 `operationId`；根据外部回合状态继续等待或安全重试。不得生成新 operation。

### 9.2 模型结果已完成，canonical commit 尚未开始

恢复：重新取得并校验已完成结果，再以原 `operationId`/`turnId` 进入提交路径。

### 9.3 core runtime 已提交，调用方在收到成功前崩溃

恢复：同一 `operationId` 命中 receipt，返回原结果，不重复应用状态；继续完成尚未完成的 social projection。

### 9.4 social projection 已写入宿主，pending AI turn 尚未 acknowledge

恢复：同一 `turnId` 的 social commit 为 no-op；identical same-revision host replay 成功；随后 acknowledge 并清除 pending completed turn。

### 9.5 用户取消后模型结果晚到

恢复/轮询必须先读取持久取消状态。已经 `cancelled` 的操作不得因为晚到 history、流式片段、解析错误或 completed result 重新进入 commit/failed。

### 9.6 同一 ID 被不同请求复用

立即报告 idempotency conflict。不得选择其中一个请求静默覆盖，也不得自动生成新 ID 后继续执行。

## 10. Journal 与 Projection 的关系

v1 首版**不要求把整个客户端重写为完整 event sourcing**。

正式方向是：

```text
stable operation / turn IDs
          ↓
durable journal + runtime receipts
          ↓
authoritative runtime/social state
          ↓
StorySaveProjection
          ↓
UI
```

- journal/receipts 负责幂等、恢复和审计；
- runtime/social authoritative state 负责当前真实状态；
- `StorySaveProjection` 负责客户端高效加载与恢复；
- 可选的领域事件可以用于历史审计、迁移或未来增量同步，但首版不要求所有草稿、阅读游标和 UI 状态都通过 append-only event log 完整重建。

Projection 不是 receipt 的替代品；receipt 也不要求 UI 直接消费。

## 11. Fork、另存为与 receipt

`session.fork` / Runtime clone 创建新存档时，已有 canonical history 与用于证明这段历史的 receipts 应随 runtime 一起复制，从而保证恢复旧的 pending operation 时不会重复应用历史。

复制后的新存档拥有新的 save/session scope。之后新产生的逻辑玩家操作必须生成新的 `operationId`，不能因为两个存档来自同一祖先而共享未来操作身份。

## 12. Receipt 保留与压缩

在某个 operation 仍可能通过 pending turn、journal、旧客户端请求或恢复流程被重新投递时，不得删除其 receipt。

未来允许基于 durable checkpoint / recovery watermark 做 receipt compaction，但必须先证明被压缩的 operation 已不可能合法重试，并保留足够的历史一致性信息。v1 初始实现可以选择不主动压缩 receipts。

## 13. 最低测试矩阵

实现 core/runtime 事务层时至少覆盖：

1. 同一 `operationId` 顺序重放，只应用一次 effect。
2. 同一 `operationId` 并发重放，只应用一次 effect。
3. 同一 `operationId` + 不同 payload/fingerprint 冲突。
4. 首次提交成功后重试不增加 state version。
5. core commit 后、social commit 前崩溃恢复。
6. social host save 后、AI acknowledge 前崩溃恢复。
7. `cancelled` 后晚到 completed result 不提交。
8. stale expected version 与 idempotent replay 的优先级正确：已有 matching receipt 可以返回原结果；新的 stale operation 仍被拒绝。
9. 两个 save 的相同/相似操作互不命中 receipt。
10. fork 后历史 receipt 保持有效，新操作身份独立。
11. 进程重启后仍能发现并恢复非终态 journal 记录。
12. deterministic build 与 tracked artifact 一致性不因事务实现破坏。

## 14. 非目标

本文不要求：

- 跨 DSH、浏览器和 Story Runtime 的分布式数据库锁；
- 真正的 exactly-once network delivery；
- 为了事务语义修改 DSH 原版源码；
- 在 Stage D 期间把全部 UI 状态重构为 event-sourced architecture；
- 自动回滚已经确认的 `played_canon`。

出现无法确定外部调用是否产生 canonical effect 的情况时，优先进入 `needs-recovery` 并通过持久 receipt/state 对账，不得以“可能没成功”为理由盲目重复执行。
