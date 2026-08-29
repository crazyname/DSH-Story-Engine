# 文字游戏宿主接口

## 通用规则

- 基础路径：`/story-engine/api`。
- 响应为 JSON，且设置 `cache-control: no-store`。
- 写操作要求同源；请求体上限 2 MB。
- 存档、内容包和会话 ID 只允许接口实现规定的安全字符。
- 涉及 retry、`transactionId`、`operationId`、receipt 和崩溃恢复的通用语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`。

## 存档

### `GET /story-engine/api/saves`

返回 `{ "saves": SaveSummary[] }`，按更新时间倒序。

### `GET /story-engine/api/saves/{saveId}`

返回完整 `StorySaveProjection`；不存在时返回 `204`。

### `PUT /story-engine/api/saves/{saveId}`

请求体为：

```json
{
  "expectedRevision": 3,
  "projection": {}
}
```

新建存档使用 `expectedRevision: -1`。正常首次写入要求：

```text
宿主当前 revision == expectedRevision
projection.revision == expectedRevision + 1
```

成功后返回宿主确认的完整 projection。

#### Optimistic conflict

如果宿主当前 revision 与 `expectedRevision` 不匹配，默认返回 `409`，防止 stale writer 覆盖已经更新的存档。

#### Identical replay

存在一个专门用于 crash recovery 的幂等例外：

- 宿主当前已存在 projection；
- 提交的 `projection.revision` 与宿主当前 revision 相同；
- 提交 projection 与宿主当前 projection 内容完全一致。

此时该请求视为**已经成功写入结果的重复确认**，返回当前 projection，不返回 `409`，也不产生新的 revision。

如果 revision 相同但 projection 内容不同，则不是 idempotent replay，必须继续返回 `409`。因此 identical replay 不能被用来绕过 optimistic locking。

该语义主要关闭以下崩溃窗口：AI canonical messages 已经由宿主持久化，但页面在 acknowledge pending completed hidden turn 之前退出；恢复时可以重放完全相同的 projection，确认宿主持久化成功后再清除 pending turn。

## `DELETE /story-engine/api/saves/{saveId}`

删除宿主投影；成功返回 `{ "removed": true }`，不存在返回 `204`。

当前不会同时删除已归档的 DSH 隐藏会话。DSH 提供可靠的回合取消接口，但没有面向外置插件的可靠会话删除接口；客户端删除投影后会清除会话绑定，并保留 `dsh-story-ai-orphan:<saveId>` 本地诊断记录（内容包 ID、会话 ID、删除时间和最后回合状态），供后续人工诊断或宿主提供正式回收接口后安全处理。

会话专属的 Story Runtime 目录同样保留：它只能和已归档会话一起作为孤儿诊断对象，不能在缺少原子会话删除契约时单独猜测删除。不会直接删除 DSH 的会话目录或 Runtime。

## 内容包目录

### `GET /story-engine/api/catalog`

递归发现配置根目录中的 `pack.json`，返回 `{ "packs": CatalogPack[] }`。存在并通过基础校验的 `ui/story-ui.json` 才令 `status` 为 `ready`；否则为 `diagnostic` 且游戏库禁用新建。

## Runtime 克隆

### `POST /story-engine/api/runtime/clone`

请求体为 `{ "packId": string, "sourceSessionId": string, "targetSessionId": string }`。接口把源会话 Runtime 原子复制到目标会话目录，并重写状态中指向源目录的内部路径。

客户端执行“另存为”的顺序固定为：DSH `session.fork` → 归档子会话 → 调用 Runtime 克隆 → 写入新的宿主投影和存档到会话映射。任一步失败都不得把原存档改写为副本。

Runtime clone 必须保留已经属于源 canonical history 的 core operation receipts；否则 fork 后恢复历史请求时可能再次应用已经发生的 core effect。新存档在 fork 之后产生的新玩家工作流必须使用新的 `transactionId`，其新 core mutations 使用新的 `operationId`。

如果未来 transaction journal 存在非终态记录，fork/另存为必须有明确策略：首版可以在存在非终态 transaction 时拒绝 fork，也可以先完成/取消并对账；不得无条件复制一个仍依赖旧 hidden context、active turn 或 turn references 的不完整 transaction。

## 未来事务接口边界

当前 Host API 尚未声明通用 transaction journal / core operation endpoint。Stage D 后续若新增此类接口，必须遵守以下约束：

- 顶层 workflow 使用稳定 `transactionId`，retry/recovery 不得自动替换；
- 一个 transaction 可以关联多个 hidden DSH turn references，并明确当前 active/pending turn 与最终 canonical-result `turnId`；
- 一个 transaction 可以包含多个不同 core operations；每个 mutating operation 使用独立稳定 `operationId`；
- API 层传入的 `operationId` 不得在 retry 时自动替换，也不得让同 transaction 中两个不同 mutations 共用同一 operation key；
- matching receipt replay 必须返回原结果而不是重新执行 mutation；
- 同 `operationId` 不同 request fingerprint 必须显式冲突，并保持原 receipt/journal 状态不变；
- receipt 与 core canonical mutation 必须在 Runtime 持久层原子保存，不能只把 receipt 留在浏览器或 social projection；
- transaction journal 必须能够持久关联 `transactionId`、hidden turn references/active turn/canonical-result turn 和 child `operationId`/step identities；
- hidden dispatch 结果不确定时必须基于 DSH 实际 correlation 能力对账或进入 `needs-recovery`，不能通过自动创建新 turn 假装 exactly-once；
- 不宣称跨浏览器、DSH 和 Runtime 存在分布式 exactly-once transaction。
