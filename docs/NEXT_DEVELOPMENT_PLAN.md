# 后续开发计划

## 路线

当前产品线：`v0.8.0-beta.1`。

```text
Stage D / M3：连载玩法与事务完整性
        ↓
Stage E / M4：公开发布质量
        ↓
M5：1.0 Release Candidate
        ↓
v1.0.0 Stable
```

Stage A、B、C 已完成。Stage D 第一事务切片（AI canonical social commit 幂等 + Host identical replay）已合并并完成真实 crash-window 验收。D1 / PR #5 Core Runtime operation-level idempotency 已合并；当前开发进入 D2。

## M3：Stage D

目标：把 v0.7 连载 runtime 完整呈现在独立游戏界面，并让跨 hidden DSH、core runtime、social projection 的 retry/recovery 不重复 canonical effect。

### D1：Core Runtime operation-level idempotency — 已完成

D1 的完成边界：

- 九个会修改 canonical runtime state 的公开 `story_*` mutation 要求稳定 `operation_id`。
- matching receipt 在 optimistic version 校验前返回，response-lost retry 不重复 mutation。
- 同 `operationId` 不同 fingerprint/tool/payload/transaction identity 显式冲突。
- receipt 与 canonical mutation 在同一次 `state.json` 原子持久化中提交。
- Runtime schema v3 使用 `_engine.operationReceipts`；v2 可向前 normalize，未知未来 schema fail-closed。
- checkpoint restore 保留并校验 receipt evidence。

D1 不建立顶层 transaction journal，也不负责 hidden DSH recovery；这些属于 D2。

### D2：Durable transaction journal 与跨域恢复 — 当前阶段

D2 分成小而可验证的交付片段，不用一个巨型 PR 同时改 journal、AI bridge、core coordinator 和 UI。

#### D2a：Transaction journal foundation — 已完成验证，待合并

分支：`codex/stage-d-transaction-journal-foundation`。

目标：先把 durable identity/evidence 层做正确，再把现有玩家 submit/recover 流程接上去。

范围：

- `StoryTransactionRecord` schema v1：`transactionId`、input fingerprint、base projection revision、status、hidden refs、child operation refs、diagnostic、revision/timestamps。
- transaction 状态：`prepared`、`needs-recovery`、`committed`、`cancelled`、`failed`；终态不可产生新 revision。
- hidden turn evidence 单向推进，不允许 completed/failed/cancelled 被 late result 倒写。
- hidden identity 明确区分：
  - Story Engine `turnId`：稳定逻辑 hidden turn / social commit identity；
  - `dshRequestId`：DSH prompt correlation identity，必须在 dispatch 前持久化；
  - `dshTurn`：从 DSH durable history 对账得到的原生数字 turn。
- Host journal store：按 save/transaction 隔离、原子写、进程内串行、optimistic revision、identical replay、collision conflict、corrupt journal fail-closed。
- Windows-safe journal filenames：有界 base64url，不直接使用 transactionId 作为文件名。
- Host journal API + browser persistence primitive。
- 自动测试覆盖 identity collision、状态机、并发 revision、跨存档、Windows 路径和损坏 journal。

D2a 完成条件已经满足：Client typecheck 通过；17 个测试文件 / 108 项测试通过；`build:node` 与 `build:client` 通过；tracked `client/story-ui/lib/*` 已由真实 bundler 同步并在重复构建后保持干净；Host API/Spec/traceability 已同步。以上是 D2a foundation 的自动验证，不代表真实 DSH correlation、浏览器 crash recovery 或 D2 整体完成。

#### D2b：Player transaction coordinator

D2a 合并后进入。

目标：真正把现有 `StoryGameShell` submit/retry/recover 链接入 durable transaction journal。

必须做到：

1. 玩家提交前创建并保存 `prepared` transaction，之后才允许 hidden dispatch。
2. 在 prompt 前持久化稳定 `dshRequestId`；retry/restart 复用 journal identity，不盲目重新发送原始玩家输入。
3. 通过 DSH durable `user/message.source.rpcId` 与 `turn/start` / `turn/end` 数字 turn 对账；不确定时进入 `needs-recovery`。
4. 一个 transaction 可有多个 retry/continuation hidden turns，但只有 canonical-result Story Engine `turnId` 能提交对应 social canonical messages。
5. social-only transaction 在 Host projection 保存成功并确认 identical replay 后再 acknowledge hidden turn，然后 journal 收敛到 `committed`。
6. `cancelled` 只用于尚无 canonical effect 的 transaction；late result 不能复活终态。
7. 页面刷新/进程恢复必须从 Host journal 重新发现非终态 transaction，而不是只相信浏览器内存状态。

#### D2c：Core step journal + cross-domain reconciliation

目标：把 D1 core receipts 接到 transaction coordinator。

- 每个计划中的 canonical core step 在第一次 mutation 前持久化稳定 step key / `operationId`。
- 已有 matching core receipt 的 step 只 replay 原结果；未完成 step 才执行。
- core effect 需要 social 可见结果时：先确认 core receipt，再补 social projection。
- 支持多个 core mutations 部分提交后的恢复。
- canonical effect 已存在后收到 cancel 不倒改历史，而是完成 reconciliation。
- recovery 不用“最后一次 HTTP 是否成功”判断事实，而是读取 journal + DSH history + core receipts/runtime + Host projection。

#### D2d：Fork / restart / failure matrix

- 非终态 transaction 与 Save As / fork 的首版策略明确并实现；最安全的 v1 方向是非终态期间拒绝 fork。
- restart 后发现并恢复非终态 journal。
- 覆盖 hidden dispatch ambiguity、core→social crash window、多 operation partial commit、cancel late result、ID collision、cross-save isolation。
- 完成真实 DSH/browser crash-window 验收。

只有 D2a–D2d 全部满足，才把 D2 宣称完成。

### D3：季、集、场景与频道联动

- season / episode / scene 由 core runtime 权威状态驱动。
- scene/episode 变化投影到正确的 `scene/direct/group/work/system` 频道。
- 切换频道不改变 runtime 剧情位置。
- 刷新、继续游戏、fork 后 UI frame 与 `played_canon` 一致。

### D4：正式玩法界面

- 工作内轻量事件：事件名、派遣角色、简要结果、必要后果。
- 工作外主线：详细场景与分支。
- 重大选择支持预设选项和自由输入。
- 越界输入：产生后果前暂停 → 保存输入 → 修订 authored script → 校验 → 恢复。
- 集末总结只基于真实 played canon，不泄露隐藏 authored branch。

### D5：整集端到端验收

至少用一个可公开分发的原创示例包完成：开场 → scene → 工作事件 → 详细剧情 → 选择/自由输入 → 越界修订 → 集末总结 → 刷新恢复 → fork 独立连续性，并验证 retry/recovery 不重复 core effect 或 social canonical messages。

## M4：Stage E

完成公开发布质量：

- 无障碍、键盘/焦点、窄屏和高缩放。
- 长历史分页/增量加载、大存档性能基线。
- save/projection/runtime/journal migration matrix 与未知版本 fail-closed。
- 游戏库封面、主题、重命名、导入/导出边界。
- 路径、Host API、同源写、输入校验、安全/隐私/许可证审计。
- 正式安装、升级、卸载、故障排查和内容作者文档。
- 建立 `COMPATIBILITY.md` 与 `RELEASE_CHECKLIST.md`。

## M5：1.0 RC / Stable

RC 前冻结并评审：

- `pack.json` / episode-script / `ui/story-ui.json` V1 compatibility；
- save/projection/runtime/journal migration policy；
- 公开 `story_*` tool contract；
- Host API contract；
- DSH compatibility 范围；
- 1.x 向后兼容边界与需要 major version 的变更。

RC 必须至少经过一次干净安装、旧存档升级、原创示例整集、插件故障隔离和发布包审计。Stable 只在 RC 阻塞问题清零后发布。
