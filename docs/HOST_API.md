# 文字游戏宿主接口

## 通用规则

- 基础路径：`/story-engine/api`。
- JSON 响应设置 `cache-control: no-store`。
- 写操作要求同源；请求体上限 2 MB。
- `saveId` 使用 1–100 位字母、数字、`_`、`-`。
- transaction / operation stable ID 的正式语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`。
- Host transaction / receipt API 提供 durable journal 与只读 reconciliation primitives；D2b/D2c 的浏览器 coordinator 消费这些 primitive，但 Host API 本身仍不等于分布式 ACID transaction service。

## Social projection

### `GET /story-engine/api/saves`

返回：

```json
{ "saves": [] }
```

按 `updatedAt` 倒序。

### `GET /story-engine/api/saves/{saveId}`

返回完整 `StorySaveProjection`；不存在时 `204`。

### `PUT /story-engine/api/saves/{saveId}`

请求：

```json
{
  "expectedRevision": 3,
  "projection": {}
}
```

新建使用 `expectedRevision: -1`。正常首次写满足：

```text
host current revision == expectedRevision
projection.revision == expectedRevision + 1
```

宿主按 save 串行化进程内写入，并以临时文件 + rename 原子替换。

#### Identical replay

如果宿主当前 projection 与请求中的 projection revision 相同且内容完全一致，视为已成功写入结果的重复确认，直接返回当前 projection，不增加 revision。

同 revision 但内容不同仍为 `409`。该例外用于关闭 social projection 已保存但 hidden turn 尚未 acknowledge 的 crash window，不能用来绕过 optimistic locking。

### `DELETE /story-engine/api/saves/{saveId}`

删除宿主 projection。成功返回 `{ "removed": true }`，不存在返回 `204`。

删除 projection 不猜测删除 DSH hidden session 或 Story Runtime；孤儿会话/运行时按诊断与后续安全回收策略处理。

## Transaction journal

D2 journal 使用与 projection 相同的 `runtimeRoot`，但保存于独立的 `transaction-journal/{saveId}/` 域。journal 是恢复 evidence，不提供 DELETE endpoint。

### `GET /story-engine/api/transactions/{saveId}`

返回该 save 的 journal records：

```json
{
  "transactions": []
}
```

列表按 `createdAt`、`transactionId` 稳定排序。若某份 journal JSON 损坏、schema/终态语义无效、input fingerprint 与持久 input 不匹配，或文件名身份与内容身份不一致，读取 fail-closed；不会静默跳过恢复证据。

### `GET /story-engine/api/transactions/{saveId}/{transactionId}`

返回完整 `StoryTransactionRecord`；不存在时 `204`。

`transactionId` 的逻辑 stable-ID 格式为 1–128 位 ASCII：首字符字母或数字，其余可使用字母、数字、`.`、`_`、`:`、`-`。URL path segment 应正常 percent-encode。

transaction input 的 `channelId` 使用现有 Story UI stable-ID 契约：1–100 位，首字符为字母或数字，其余允许字母、数字、`.`、`_`、`-`。玩家 input text 在 durable record 中必须是 trim 后的非空规范形式；Host Store 会根据 `saveId + channelId + input text` 重新计算 input fingerprint 并与 record 比较，而不是只检查 fingerprint 的字符串格式。

Story Engine hidden `turnId` 同样使用 Story UI stable-ID 契约，因为它后续直接作为 social canonical commit key；`dshRequestId` 是独立的 DSH request/rpc correlation identity，不复用 social ID 语义。

宿主磁盘文件名**不是**原 transactionId。Store 使用带固定 `tx-` 前缀的有界 base64url 编码，以兼容 Windows `:`、设备保留名和单文件名长度限制；读取时会反向校验 canonical 编码与 record identity。

### `PUT /story-engine/api/transactions/{saveId}/{transactionId}`

请求：

```json
{
  "expectedRevision": 0,
  "transaction": {}
}
```

新建 journal 使用 `expectedRevision: -1`。bootstrap record 必须是 `revision: 0` 的 `prepared` intent，并且不得预填 hidden-turn evidence、child operation identity、`activeTurnId` 或 `canonicalResultTurnId`；hidden/core child identity 必须在后续 revision 中先持久化，再执行相应外部步骤。后续更新必须满足：

```text
host current transaction revision == expectedRevision
transaction.revision == expectedRevision + 1
```

同 save + transaction 的 Host Store 在进程内串行化写入，并用临时文件 + rename 原子持久化。

#### Journal identical replay

当前 Host 已保存与请求完全一致、revision 相同的 transaction 时，重复 PUT 返回已有 record，不产生新 revision。

如果同 revision 内容不同，则：

- input / transaction identity 发生变化时报告 idempotency conflict；
- 其他 stale/conflicting update 报 transaction version conflict；
- 两者都返回 `409`；
- 原 journal 不被改写。

#### Journal 状态约束

正式状态语义见事务 Spec。当前 schema v1 至少执行：

- `committed` / `cancelled` / `failed` 为不可产生后续 revision 的终态；终态 record 本身也不得保留 `activeTurnId` 或任何非终态 hidden turn，重启读取时同样 fail-closed；
- hidden evidence 只增不删；已有 hidden identity 不可替换；
- 新增 hidden turn 必须从 `planned` 开始；`planned` / `uncertain` 不能携带 native `dshTurn`；
- 一旦 `dispatched` 已确认 dispatch/turn 存在，就不能再降级为 `uncertain`；对账应让 `uncertain` 向 `dispatched` / 结果态收敛，而不是反向抹掉已确认 evidence；
- `completed` / `failed` / `cancelled` hidden turn 不可被 late result 改写；
- `dshTurn` 一旦存在必须同时有 `sessionId`，同一 record 中 `(sessionId, dshTurn)` 不得重复；
- Story Engine `turnId` 与 `dshRequestId` 在同一 transaction 中各自唯一；
- `activeTurnId` 只能引用已知非终态 hidden turn；`canonicalResultTurnId` 只能引用 completed hidden turn，且一旦确定不可替换；
- child `stepKey` / `operationId` evidence 只增不删、不可改写。

#### Hidden DSH identity

不要把三个身份混为一谈：

- Story Engine `turnId`：stable logical hidden-turn identity，并作为 social canonical message commit key；
- `dshRequestId`：DSH prompt request correlation identity；D2b 在 accepted response 后一次性绑定，并用认证 rc.2 durable `user/message.source.rpcId` 对账；
- `dshTurn`：DSH `turn/start` / `turn/end` 中的原生数字 turn，对账后才写入 journal。

D2a foundation 提供这些 evidence 的 Store/API；D2b 已接入 submit/retry/recover 与 hidden correlation；D2c 在此基础上使用 child operation refs、Core receipts 与 durable tool results 决定 transaction 是否能够进入 social canonical commit。

浏览器侧 `HostTransactionJournal` 对 `load/list/save` 返回值再次做 record validation，并核对返回的 `saveId` / `transactionId` 与请求 path identity；list 还会拒绝重复 `transactionId`。PUT 成功响应必须返回与本次提交**完整 canonical record 完全一致**的 transaction（不仅是相同 revision 或 fingerprint）；任何同 identity/revision 但 status、hidden/operation evidence、diagnostic、timestamp 等内容不同的 acknowledgement 都 fail-closed，不会被接受为持久化确认。

## Core operation receipt reconciliation

### `GET /story-engine/api/core-receipts/{saveId}/{transactionId}/{operationId}`

这是 D2c 的只读 reconciliation endpoint，不提供 PUT/DELETE。Host 不接受浏览器自行声明 `packId` 或任意 Runtime session：

1. `transactionId` 必须解析到指定 `saveId` 下的 durable journal；不存在时返回 `204`。
2. `operationId` 必须已经存在于该 transaction 的 `operationRefs`；否则为 identity conflict（`409`）。
3. `packId` 从该 save 的 authoritative Host projection 读取。
4. 可查询的 `sessionId` 只能来自该 transaction 已持久化的 hidden-turn evidence。
5. Host 只读取 Story Runtime schema v3 的 `_engine.operationReceipts`；schema v2 不被当作 D1 receipt 来源，未知/损坏 runtime schema fail-closed。
6. 找不到 matching receipt 返回 `204`；同一 operationId 若在多个 transaction-owned hidden session 中都存在 receipt，视为冲突而不是任选一个。
7. receipt 内 `operationId` 与 path、`transactionId` 与 journal 必须完全匹配。

成功响应：

```json
{
  "sessionId": "hidden-session-id",
  "receipt": {
    "operationId": "op-...",
    "transactionId": "tx-...",
    "operation": "story_commit_state",
    "fingerprint": "...sha256...",
    "stateVersion": 12,
    "committedAt": "2026-09-03T00:00:00.000Z",
    "result": {}
  }
}
```

浏览器 `HostCoreReceiptReader` 会再次校验 receipt 结构、operation identity 与 transaction identity。`operationRef` 本身仍**不证明 mutation 已发生**：matching D1 receipt 才证明 applied/replayed。

没有 receipt 时，D2c coordinator 还会读取认证 DSH rc.2 append-only history，将 transaction-owned `tool/call` 与 `tool/result` 按 callId 配对。当前允许确认的无 receipt 成功 no-op 是 `story_record_work_event` 的高影响升级 `{ escalated: true, recorded: false }`；其它成功 mutating tool result 缺少 matching receipt 一律 fail-closed。pending call、跨 session 重复 evidence、同 operationId 不同 tool/arguments 或损坏 call identity 都不得被猜成成功。

## 内容包目录

### `GET /story-engine/api/catalog`

递归发现配置根目录中的 `pack.json`，返回 `{ "packs": CatalogPack[] }`。只有存在且通过校验的 `ui/story-ui.json` 才令包为 `ready`；否则为 `diagnostic`，游戏库禁止新建。

## Runtime 克隆

### `POST /story-engine/api/runtime/clone`

请求：

```json
{
  "packId": "...",
  "sourceSessionId": "...",
  "targetSessionId": "..."
}
```

把源会话 Story Runtime 原子复制到目标会话目录，并重写指向源 runtime 目录的内部路径。已属于 inherited canonical history 的 core operation receipts 随 runtime 保留。

未来新玩家 workflow 必须使用新的 transaction / operation identities。非终态 journal 与 Save As / fork 的正式产品策略由 D2d 明确定义；在该策略落地前，Host runtime clone 本身不声称已经安全迁移 incomplete transaction。

## 跨域边界

Host API 不提供分布式 ACID 或 network exactly-once。D2c coordinator 依据 durable evidence：

```text
transaction journal
+ DSH durable history/correlation
+ core operation receipts/runtime state
+ social projection
```

matching core receipt 返回原结果；matching social/transaction identical replay 返回已保存内容。hidden dispatch 或 core outcome 无法可靠判断时进入 `needs-recovery`，不能盲目创建新 turn 假装 exactly-once。

当前 D2c 自动测试覆盖 receipt/tool-result reconciliation、partial multi-operation continuation、core→social crash recovery 与 late cancel 语义；完整真实浏览器 restart/crash-window 矩阵仍属于 D2d，不在 Host API 文档中提前声称完成。
