# 文字游戏宿主接口

## 通用规则

- 基础路径：`/story-engine/api`。
- 响应为 JSON，且设置 `cache-control: no-store`。
- 写操作要求同源；请求体上限 2 MB。
- 存档、内容包和会话 ID 只允许接口实现规定的安全字符。

## 存档

### `GET /story-engine/api/saves`

返回 `{ "saves": SaveSummary[] }`，按更新时间倒序。

### `GET /story-engine/api/saves/{saveId}`

返回完整 `StorySaveProjection`；不存在时返回 `204`。

### `PUT /story-engine/api/saves/{saveId}`

请求体为 `{ "expectedRevision": number, "projection": StorySaveProjection }`。新建存档使用 `expectedRevision: -1`；版本冲突返回 `409`。成功后返回写入的投影。

### `DELETE /story-engine/api/saves/{saveId}`

删除宿主投影；成功返回 `{ "removed": true }`，不存在返回 `204`。当前不会同时删除已归档的 DSH 隐藏会话。

## 内容包目录

### `GET /story-engine/api/catalog`

递归发现配置根目录中的 `pack.json`，返回 `{ "packs": CatalogPack[] }`。存在并通过基础校验的 `ui/story-ui.json` 才令 `status` 为 `ready`；否则为 `diagnostic` 且游戏库禁用新建。

## Runtime 克隆

### `POST /story-engine/api/runtime/clone`

请求体为 `{ "packId": string, "sourceSessionId": string, "targetSessionId": string }`。接口把源会话 Runtime 原子复制到目标会话目录，并重写状态中指向源目录的内部路径。

客户端执行“另存为”的顺序固定为：DSH `session.fork` → 归档子会话 → 调用 Runtime 克隆 → 写入新的宿主投影和存档到会话映射。任一步失败都不得把原存档改写为副本。
