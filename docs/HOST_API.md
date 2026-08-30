# 文字游戏宿主接口

## 通用规则

- 基础路径：`/story-engine/api`。
- JSON 响应设置 `cache-control: no-store`。
- 写操作要求同源；请求体上限 2 MB。
- `saveId` 使用 1–100 位字母、数字、`_`、`-`。
- transaction / operation stable ID 的正式语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`。
- 当前 Host transaction API 是 durable journal primitive，不等于完整跨域 transaction coordinator；玩家 submit/recover 接线属于 D2 后续片段。

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

列表按 `createdAt`、`transactionId` 稳定排序。若某份 journal JSON 损坏、schema 无效或文件名身份与内容身份不一致，读取 fail-closed；不会静默跳过恢复证据。

### `GET /story-engine/api/transactions/{saveId}/{transactionId}`

返回完整 `StoryTransactionRecord`；不存在时 `204`。

`transactionId` 的逻辑 stable-ID 格式为 1–128 位 ASCII：首字符字母或数字，其余可使用字母、数字、`.`、`_`、`:`、`-`。URL path segment 应正常 percent-encode。

宿主磁盘文件名**不是**原 transactionId。Store 使用带固定 `tx-` 前缀的有界 base64url 编码，以兼容 Windows `:`、设备保留名和单文件名长度限制；读取时会反向校验 canonical 编码与 record identity。

### `PUT /story-engine/api/transactions/{saveId}/{transactionId}`

请求：

```json
{
  "expectedRevision": 0,
  "transaction": {}
}
```

新建 journal 使用 `expectedRevision: -1`，且 record `revision` 必须为 `0`。后续更新必须满足：

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

- `committed` / `cancelled` / `failed` 为不可产生后续 revision 的终态；
- hidden evidence 只增不删；已有 hidden identity 不可替换；
- `completed` / `failed` / `cancelled` hidden turn 不可被 late result 改写；
- `canonicalResultTurnId` 一旦确定不可替换；
- child `stepKey` / `operationId` evidence 只增不删、不可改写。

#### Hidden DSH identity

不要把三个身份混为一谈：

- Story Engine `turnId`：stable logical hidden-turn identity，并作为 social canonical message commit key；
- `dshRequestId`：DSH prompt request correlation identity，完整 coordinator 必须在 dispatch 前持久化；DSH 会把它写入 durable `user/message.source.rpcId`；
- `dshTurn`：DSH `turn/start` / `turn/end` 中的原生数字 turn，对账后才写入 journal。

D2 foundation 只提供能够保存这些 evidence 的 Store/API。如何调用 DSH、如何把 `rpcId` 对应到数字 turn、如何从 `needs-recovery` 收敛，属于 coordinator/reconciliation 层。

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

未来新玩家 workflow 必须使用新的 transaction / operation identities。非终态 journal 与 Save As / fork 的产品策略由 D2 coordinator 明确定义；在该策略落地前，Host runtime clone 本身不声称已经安全迁移 incomplete transaction。

## 跨域边界

Host API 不提供分布式 ACID 或 network exactly-once。完整恢复必须依据 durable evidence：

```text
transaction journal
+ DSH durable history/correlation
+ core operation receipts/runtime state
+ social projection
```

matching core receipt 返回原结果；matching social/transaction identical replay 返回已保存内容。hidden dispatch 无法可靠判断时进入 `needs-recovery`，不能盲目创建新 turn 假装 exactly-once。
