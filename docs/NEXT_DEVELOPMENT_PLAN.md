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

Stage A、B、C 已完成。Stage D 第一事务切片——AI canonical social commit 幂等与宿主 identical replay——已经完成、合并并通过本地自动测试和真实 crash-window 验收。当前正在开发 D1 / PR #5；在其本地验证和合并前不得宣称 D1 完成。

## M3：完成阶段 D

目标：把 v0.7 连载后端完整呈现在独立游戏界面中，并使跨隐藏 DSH、social projection 与 core runtime 的 retry/recovery 不重复应用 canonical effect。

### D1：Core Runtime operation-level idempotency（当前 PR #5）

D1 只解决“一个已经带稳定 identity 的 core canonical mutation 如何安全重放”。D1 不建立顶层 transaction journal，不负责 hidden DSH turn recovery，也不负责浏览器在崩溃后重新推导 operation identity；这些属于 D2。

- 顶层调用可以携带可选 `transactionId` 作为 receipt 关联信息，但 D1 不因为收到该字段就宣称 transaction journal 已存在。
- 所有可能被 retry/recovery 重复调用、且会修改 core runtime canonical state 的公开 `story_*` mutation 使用各自独立稳定 `operationId`。
- **调用方必须在第一次 core mutation 调用前确定 `operationId`**；D1 接口接收这个稳定 ID，自动测试中由调用方显式传入。D1 不负责在 mutation 之前单独写 durable operation intent。
- 同一原子 mutation 的重试复用相同 `operationId`；同一 transaction 内两个不同 mutations 必须使用不同 `operationId`。
- D2 coordinator/journal 后续负责在真正的玩家 transaction 中，把 `transactionId + 持久 step identity / operationId` 在执行前落盘，以保证重启后仍能重新得到同一个 ID；不能依赖临时 request/tool-call index。
- 使用 request fingerprint 检测同 operation ID 不同 tool/payload/transaction identity；冲突必须显式失败，并且不得改变已有 receipt。
- matching receipt 必须在 `expectedVersion` 检查前返回原结果，不增加 state version、不重复追加事件、不再次应用选择、关系、consequence 或内部场景检查点。
- 新 operation 没有 matching receipt 时才执行 optimistic version 与领域前置条件检查。
- receipt 与其保护的 runtime mutation 在同一次 `state.json` 原子持久化提交中写入；D1 不采用“先改 state、再补 receipt”的两次提交。
- 首次返回的 receipt result 必须先按 JSON 持久化语义规范化，保证重启后的 replay 与首次响应 shape 一致。
- Runtime state 从 schema v2 向前 normalize 到 v3，在 `_engine.operationReceipts` 保存 receipt；未知更高 Runtime schema 不静默降级。
- checkpoint restore 可以回滚 gameplay state，但不能释放或发明已经消费过的 operation ID；checkpoint 中的 receipt 必须是当前 receipt 集合的已知一致子集，否则拒绝恢复。
- `expectedVersion` 继续负责 stale writer 防护，不用 operation idempotency 取代 optimistic locking。
- `story_create_checkpoint` 是显式恢复工件创建接口，不属于 D1 的 canonical mutation receipt 集合；由 scene mutation 自动创建的 pre-scene checkpoint 对同一 operation 使用稳定 identity，但在 operation 尚无 receipt 时必须按当前 base state 刷新，不能复用失败尝试留下的旧 snapshot。

验收：顺序/并发重放只应用一次；response-lost 后即使调用方携带旧 `expectedVersion` 也返回原 receipt；同 ID 不同 payload/tool/transaction identity 冲突且不污染原 receipt；版本冲突的新 operation 不留下 receipt；不同 IDs 即使 payload 相同仍作为不同逻辑操作；首次/replay receipt JSON shape 一致；v2 state 可由新代码读取；未知未来 schema 拒绝；checkpoint restore 保留当前 receipts、拒绝未知/冲突 receipt evidence，失败尝试留下的 deterministic checkpoint 可按新 base 刷新；九个 canonical mutation tool contract 要求稳定 `operation_id`。

### D2：Durable transaction journal 与跨域恢复

D2 在 D1 的“core 已能安全重放”之上解决“谁生成、提前保存、恢复这些 identity，以及多域中断后应该补哪一步”。

- 在首次向隐藏 DSH/外部步骤调用前生成并持久化 `transactionId`、input fingerprint 和恢复所需 intent/status。
- 对计划执行的 core canonical step，在首次执行前把稳定 step identity / `operationId` 关联进 durable journal；恢复时复用它，而不是让模型或临时网络请求重新发明一个 ID。
- journal 持久记录一个 transaction 已知的 ordered hidden `turnId` references、当前 active/pending turn，以及实际产生最终 canonical social result 的 `turnId`；选择 continuation 或安全 retry 可以在同一 transaction 下产生新的 hidden turn。
- hidden dispatch 如果发生“DSH 可能已接受 turn、但客户端尚未拿到或持久化 `turnId`”的不确定窗口，必须按 DSH 实际支持的 idempotency/correlation/history 能力先对账；无法可靠判断时进入 `needs-recovery`，不宣称 transport exactly-once，也不盲目重发玩家输入。
- journal 记录 child `operationId`/step identities，使多 mutation transaction 在中间崩溃后只补未完成步骤。
- 不在等待模型、网络或用户选择期间持有 save/runtime 写锁。
- 支持 `prepared`、`committed`、`cancelled`、`failed`、`needs-recovery` 的最低语义；AI bridge 自身的回合状态保持独立。
- core canonical effect 存在时，先通过 D1 receipt 确认是否已经提交，再投影该 effect 的 social 可见结果。
- crash/restart 后重新读取 journal、hidden DSH 可查询状态、core receipts/runtime state 与 host projection 进行 reconciliation，不用“最后一个 HTTP 是否成功返回”猜测事实。
- `cancelled` 只适用于尚无 canonical effect 的 transaction；canonical effect 已落盘后收到取消时不得倒改历史，应完成 recovery/reconciliation。
- 定义非终态 transaction 与“另存为”的边界；首版可选择非终态期间禁止 fork，而不是复制一个仍依赖旧 hidden context/turn references 的不完整 transaction。

正式行为见 `TRANSACTION_AND_RECOVERY_SPEC.md`。

验收：至少覆盖 intent 后崩溃、operation step identity 落盘后但 core 执行前崩溃、hidden dispatch 不确定窗口的 correlation/recovery、同 transaction 多 hidden retry/continuation turns、模型完成后提交前崩溃、单/多 core operation 部分提交、core commit 后 social 前崩溃、social host save 后 acknowledge 前崩溃、取消后结果晚到、ID collision、跨存档隔离、fork 边界和进程重启恢复。

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
10. 一个 transaction 内存在多个 core mutations 时，部分提交后的恢复只补剩余步骤；
11. 一个 transaction 经过 hidden retry/continuation 后只提交实际 canonical-result turn 的消息，不重新追加原始玩家输入。

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
- save/projection/runtime Schema 迁移矩阵；D1 的 Runtime v2→v3 只是第一条具体迁移规则，不取代 Stage E 的完整矩阵。
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

## 私人内容包验证线：Dispatch（本地完成）

这条独立验证线已经在本地私人环境完成，不阻塞 Stage D、Stage E 或 v1.0，也不进入公开发布物。

已完成：

- 私人内容包完成专用 UI 描述、稳定人物/频道映射和续作启动入口；
- 历史连续性、实际选择映射、结局状态和未知字段策略已经本地核对；
- 建立重复导入不回退最终化结果的私人覆盖层，并通过源文件哈希与重复导入一致性检查；
- 游戏库状态为 `ready`，新建存档模拟通过；
- 私人最终化后的公开引擎回归仍通过当时的核心/Client 测试、typecheck 与 build，原版 DSH 工作树保持干净。

后续只做维护性验证：当公开引擎的内容包 Schema、游戏库、导入器或 Stage D 运行链发生变化时，重新执行私人防退化检查。任何私人资料、商业游戏文本、提取资源、私人存档、验证摘要或最终化覆盖层均不得进入公开 Git。

“可新建”不等于完整正式玩法已经完成；季／集／场景自动联动、动态频道成员和其余运行时链路仍按公开 Stage D 计划推进。

## 每轮开发的统一完成条件

1. 修改实现与相应测试；纯文档 PR 则验证内部链接、术语和事实一致性。
2. 同步 `CURRENT_STATUS.md`、`TRACEABILITY.md` 和相关正式契约，但不要把短期进度复制到长期 Spec。
3. 运行与改动范围相匹配的核心/客户端类型检查、测试和生产构建；纯文档 PR 不要求无意义地重跑完整 build，除非文档变更涉及生成流程或版本号。
4. 涉及界面或真实恢复路径时执行真实浏览器验收，并记录断言结果。
5. 确认 `D:\DeepSeek-Harness` 工作树干净；不得修改原版 DSH 业务源码。
6. 已知 repo-side blocker 必须先在当前 PR 处理完，再交给本地 Codex/真实 DSH 做最终环境验证。
