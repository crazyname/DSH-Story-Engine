# 后续开发计划

## 目标版本与路线

当前产品线为 `v0.8.0-beta.1`。公开引擎按照以下主线推进：

```text
Stage D / M3：连载玩法与事务完整性
        ↓
Stage E / M4：公开发布质量
        ↓
M5：1.0 Release Candidate
        ↓
v1.0.0 Stable
```

私人 Dispatch 内容包属于独立验证线，不是公开引擎 1.0 的前置依赖。公开产品里程碑之间仍按顺序验收：前一公开里程碑未满足完成条件时，不把后一公开里程碑宣称为完成。

Stage A、B、C 已完成。Stage D 第一事务切片——AI canonical social commit 幂等与宿主 identical replay——已经完成、合并并通过本地自动测试和真实 crash-window 验收。

## M3：完成阶段 D

目标：把 v0.7 连载后端完整呈现在独立游戏界面中，并使跨隐藏 DSH、social projection 与 core runtime 的 retry/recovery 不重复应用 canonical effect。

### D1：Core Runtime operation-level idempotency

- 顶层玩家提交/恢复流程预留稳定 `transactionId`；一个 transaction 可以包含多个 core mutations。
- 所有可能被 retry/recovery 重复调用、且会修改 core runtime canonical state 的 `story_*` mutation 使用各自独立稳定 `operationId`。
- 同一原子 mutation 的重试复用相同 `operationId`；同一 transaction 内两个不同 mutations 必须使用不同 `operationId`。
- `operationId` 在首次 mutation 执行前确定并持久化，可以由 `transactionId + 持久 step key` 派生，但不能依赖重试时可能变化的临时 request/tool-call index。
- 使用 request fingerprint 检测同 operation ID 不同 payload；冲突必须显式失败，并且不得改变已有 journal/receipt 状态。
- matching receipt 重放直接返回原结果，不增加 state version、不重复追加事件、不再次应用选择、关系或 consequence。
- receipt 与其保护的 runtime mutation 在同一次持久化提交中写入。
- `expectedVersion` 继续负责 stale writer 防护，不用 operation idempotency 取代 optimistic locking。

验收：顺序/并发重放只应用一次；同 ID 不同 payload 冲突且不污染原 receipt；一个 transaction 内多个不同 operations 可分别提交/重放；“core 已提交但调用方未收到成功”恢复时返回 receipt，不重复修改 runtime。

### D2：Durable transaction journal 与跨域恢复

- 在首次向隐藏 DSH/外部步骤调用前持久化 `transactionId`、input fingerprint 和恢复所需 intent/status。
- 获得隐藏 DSH `turnId` 后，把 `transactionId ↔ turnId` 映射持久化。
- journal 记录 child `operationId`/step identities，使多 mutation transaction 在中间崩溃后只补未完成步骤。
- 不在等待模型、网络或用户选择期间持有 save/runtime 写锁。
- 支持 `prepared`、`committed`、`cancelled`、`failed`、`needs-recovery` 的最低语义；AI bridge 自身的回合状态保持独立。
- core canonical effect 存在时，先形成可查询的 core receipt，再投影该 effect 的 social 可见结果。
- crash/restart 后重新读取 journal、core receipts/runtime state 与 host projection 进行 reconciliation，不用“最后一个 HTTP 是否成功返回”猜测事实。
- `cancelled` 只适用于尚无 canonical effect 的 transaction；canonical effect 已落盘后收到取消时不得倒改历史，应完成 recovery/reconciliation。
- 定义非终态 transaction 与“另存为”的边界；首版可选择非终态期间禁止 fork，而不是复制一个仍指向旧 hidden turn 的不完整 transaction。

正式行为见 `TRANSACTION_AND_RECOVERY_SPEC.md`。

验收：至少覆盖 intent 后崩溃、hidden turn 映射恢复、模型完成后提交前崩溃、单/多 core operation 部分提交、core commit 后 social 前崩溃、social host save 后 acknowledge 前崩溃、取消后结果晚到、ID collision、跨存档隔离、fork 边界和进程重启恢复。

### D3：季、集、场景与频道联动

- 当前 season / episode / scene 由 runtime 权威状态驱动，不让浏览器自行猜测剧情位置。
- scene 进入、退出和 episode 推进投影到正确的 `scene` / `direct` / `group` / `work` / `system` 频道。
- 切换频道不得改变 runtime 当前剧情位置；反之，正式场景推进必须更新 UI 可见剧情位置。
- 刷新、继续游戏和另存为后 season/episode/scene 与 `played_canon` 一致。

### D4：正式玩法界面

- 工作内小事件按“事件名 + 派遣英雄 + 简要结果 + 必要后果”输出，不展开为完整任务模拟。
- 工作外主线使用详细场景与分支，支持已有内容发展、反转和新内容。
- 重大选择继续支持参考选项和自由输入，不能限制玩家只能点击预写选项。
- 玩家超出预写范围时在产生后果前暂停，保存原始输入，修订 authored script，校验后恢复。
- 越界修订界面必须区分玩家世界内动作与 `(系统)` 修正。
- 每集结束显示玩家实际选择、当时真实可用但未选择的重要节点和自由输入形成的新路线，不伪造联网玩家比例，不泄露隐藏分支。

### D5：整集端到端验收

至少使用一个可公开分发的原创示例包完成一整集：

1. 开场与正式 scene 进入；
2. 工作内轻量事件；
3. 工作外详细剧情；
4. 重大选择与自由输入；
5. 至少一次越界暂停、剧本修订、校验与恢复；
6. 集末总结；
7. 刷新恢复；
8. 另存为后两个存档连续性独立；
9. retry/recovery 不重复 core operation effect 或 canonical social messages；
10. 一个 transaction 内存在多个 core mutations 时，部分提交后的恢复只补剩余步骤。

只有上述链路在自动测试和真实浏览器中成立，Stage D 才可宣称完成。

## M4：阶段 E 与公开发布质量

目标：形成可作为 Release Candidate 基础的通用文字游戏插件，不包含私人 Dispatch 内容。

### E1：无障碍与交互质量

- 键盘导航、焦点顺序、焦点陷阱和返回普通聊天路径。
- 屏幕阅读器语义。
- 窄屏、窗口缩放和高缩放验证。
- 游戏 overlay 活跃/隐藏时的输入和焦点隔离。

### E2：历史、性能与迁移

- 长历史分页或等价的增量加载策略。
- 大存档性能基线和回归测试。
- save/projection/runtime Schema 迁移矩阵。
- 损坏或未知版本存档以只读诊断打开，不自动覆盖。
- transaction journal / receipt 的保留和未来 compaction 边界。

### E3：游戏库发布体验

- 内容包封面和可选主题。
- 存档重命名。
- 导出/导入策略及冲突语义。
- 如保留“覆盖保存”，必须定义清晰的 revision 与 fork/overwrite 边界。

### E4：安全、隐私和许可证

- 第三方许可证清单。
- 内容包路径、Host API、同源写保护、请求体限制和输入校验复核。
- 私人内容、运行存档、API Key、日志和构建输出的发布排除检查。
- 公开示例只能使用原创、CC0 或具备明确再发布授权的内容。
- 插件故障时普通 DSH 聊天仍可正常进入和使用。

### E5：公开文档

- 安装、升级、卸载和故障排查。
- 内容包作者教程与 Schema 入口。
- Runtime / Host API 集成说明。
- 将本机专用路径示例与正式公共路径约定分离。
- 建立正式 `COMPATIBILITY.md` 和 `RELEASE_CHECKLIST.md`，作为 1.0 RC 前置产物。

验收：Stage E 发布清单全部通过；公开仓库和产物不包含 `packs/private`、运行存档、API Key、商业游戏文本或提取资源。

## M5：1.0 Release Candidate 与 Stable

目标：从“功能和发布质量已完成”进入“V1 公共契约冻结”。

RC 前必须定义并评审：

- `pack.json` V1 兼容承诺；
- `episode-script` 和 `ui/story-ui.json` Schema 兼容策略；
- save/projection/runtime Schema 迁移政策；
- 公开 `story_*` tool contract；
- Host API contract；
- Client plugin/DSH compatibility 范围；
- 1.x 中什么变化允许作为向后兼容增强，什么变化需要新的 schema/API major version。

RC 至少执行一次干净安装、旧存档升级、原创示例整集、插件故障隔离和发布包审计。RC 暴露的问题通过独立修复 PR 关闭；全部 release gate 通过后再发布 `v1.0.0`。

## 私人内容包验证线：Dispatch

该工作可以与公开主线并行，不阻塞 Stage D、Stage E 或 v1.0。

目标：让私人 Dispatch 包从“需诊断”变为经过人工核对的可新建内容包，但不修改或重新分发原始商业游戏资源。

- 生成 `ui/story-ui.json`，使用稳定人物 ID 和经私人资料核对的中文英雄名/本名。
- 定义私聊、群聊、现场、工作、系统频道及成员。
- 核对第一至第八集过程、玩家选择、人物关系、死亡和具体结局。
- 未验证字段保持未知，不自动推断。
- 定义通关后续作起点。
- 通过 `schemas/story-ui.schema.json`、内容包校验和人工清单。

验收只针对本地私人环境；任何私人资料、商业游戏文本、提取资源、私人存档或生成索引均不得进入公开 Git。

## 每轮开发的统一完成条件

1. 修改实现与相应测试；纯文档 PR 则验证内部链接、术语和事实一致性。
2. 同步 `CURRENT_STATUS.md` 和相关正式契约，但不要把短期进度复制到长期 Spec。
3. 运行与改动范围相匹配的核心/客户端类型检查、测试和生产构建；纯文档 PR 不要求无意义地重跑完整 build，除非文档变更涉及生成流程或版本号。
4. 涉及界面或真实恢复路径时执行真实浏览器验收，并记录断言结果。
5. 确认 `D:\DeepSeek-Harness` 工作树干净；不得修改原版 DSH 业务源码。
6. 已知 repo-side blocker 必须先在当前 PR 处理完，再交给本地 Codex/真实 DSH 做最终环境验证。
