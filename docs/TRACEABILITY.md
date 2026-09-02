# 契约—实现—验证追踪

本文用于回答一个工程问题：正式契约中的关键保证，当前由哪段实现、哪项自动测试和哪次真实环境验收支撑。

它不是实时开发计划。当前阶段与下一步仍以 `CURRENT_STATUS.md`、`NEXT_DEVELOPMENT_PLAN.md` 为准；正式语义仍以各 Spec 为准。这里的 `完成` 只表示该行所列契约已经有实现和相应验证证据，不代表整个 Stage 完成。

| 契约 / 风险 | 正式契约 | 主要实现 | 自动测试 | 真实环境验收 | 状态 |
|---|---|---|---|---|---|
| AI canonical social messages 按 Story Engine 稳定 `turnId` 幂等提交 | `TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/client/story-domain.ts`、`StoryGameShell.tsx`、`ai-bridge.ts` | `client/story-ui/test/story-domain.test.ts` | host-save 后、acknowledge 前 crash-window 刷新恢复 | 完成 |
| Host identical same-revision replay；不同 stale content 仍冲突 | `HOST_API.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/host-store.ts` | `client/story-ui/test/host-store.test.ts` | 同一 crash-window 验收 | 完成 |
| AI cancellation 晚到结果不得改写 `cancelled` | `TEXT_GAME_SOCIAL_UI_SPEC.md` | `client/story-ui/src/client/ai-bridge.ts`、`StoryGameShell.tsx` | Client AI bridge / view-state 测试 | Stage C 浏览器故障矩阵 | 完成 |
| `played_canon` 不包含未游玩 authored branch | `SERIAL_GAMEPLAY_SPEC.md` | `src/serial-state.ts` | `src/serial-integration.test.ts` | v0.7 / canon-integrity 本地集成验证 | 完成 |
| 选择只能记录在当前实际游玩 episode/scene | `SERIAL_GAMEPLAY_SPEC.md` | `src/serial-state.ts` | `src/serial-integration.test.ts` | v0.7 / canon-integrity 本地集成验证 | 完成 |
| Core canonical mutation 使用稳定 `operationId`、fingerprint 与持久 receipt | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/operation-idempotency.ts`、`src/serial-state.ts`、`src/plugin.ts` | `src/operation-idempotency.test.ts`、`src/serial-integration.test.ts`、`src/plugin.test.ts` | PR #5 最终 HEAD 本地自动验证通过；未执行真实 DSH tool smoke | 完成（PR #5 已合并） |
| Matching core receipt 在 optimistic version 检查前重放，不重复 state/event/checkpoint | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::mutateOperation` | `src/serial-integration.test.ts`、`src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | 完成（PR #5 已合并） |
| Receipt 首次返回与磁盘 replay 使用相同 JSON-persisted result shape | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::replayableJson`、`mutateOperation` | `src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | 完成（PR #5 已合并） |
| Runtime v2 → v3 receipt 兼容；未知未来 schema 拒绝 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-types.ts`、`src/serial-state.ts::normalize` | `src/serial-integration.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | 完成（PR #5 已合并） |
| Checkpoint restore 只回滚 gameplay state，不释放/发明 operation receipt；receipt 缺失或冲突拒绝 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::restoreCheckpoint` | `src/serial-integration.test.ts`、`src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | 完成（PR #5 已合并） |
| 未提交 operation 的 deterministic pre-scene checkpoint 会按当前 base state 刷新 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::checkpoint` | `src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | 完成（PR #5 已合并） |
| Durable `transactionId` intent、规范化 input/fingerprint、Story UI channel identity、单向 transaction/hidden-turn journal | `TRANSACTION_AND_RECOVERY_SPEC.md`、`HOST_API.md` | `client/story-ui/src/transaction-journal.ts` | `client/story-ui/test/transaction-journal.test.ts` | PR #6 Windows 自动验证通过；未执行真实 DSH/browser recovery | D2a 完成（PR #6 已合并） |
| Bootstrap 只能写 `prepared` 空证据 intent；新增 hidden turn 从 `planned` 开始且不得伪造 native turn | `TRANSACTION_AND_RECOVERY_SPEC.md`、`HOST_API.md` | `client/story-ui/src/transaction-journal.ts`、`client/story-ui/src/transaction-store.ts` | `client/story-ui/test/transaction-journal.test.ts`、`client/story-ui/test/transaction-store.test.ts` | PR #6 Windows 自动验证通过 | D2a 完成（PR #6 已合并） |
| Story `turnId` 使用 social-safe ID；`dshRequestId` 独立；`sessionId+dshTurn` 唯一；`planned/uncertain` 不伪造 native turn | `TRANSACTION_AND_RECOVERY_SPEC.md`、`HOST_API.md` | `client/story-ui/src/transaction-journal.ts` | `client/story-ui/test/transaction-journal.test.ts` | D2a contract 与 PR #9 rc.2 correlation 自动验证通过；真实 DSH/browser 待 D2d | D2b 实现已合并 |
| Hidden dispatch evidence 单向收敛：`uncertain → dispatched/结果态`，已确认 `dispatched` 不倒退到 `uncertain` | `TRANSACTION_AND_RECOVERY_SPEC.md`、`HOST_API.md` | `client/story-ui/src/transaction-journal.ts`、`client/story-ui/src/client/player-transaction-coordinator.ts` | `client/story-ui/test/transaction-journal.test.ts`、`client/story-ui/test/player-transaction-*.test.ts` | PR #9 自动 lifecycle/recovery 验证通过；真实故障注入矩阵待 D2d | D2b 实现已合并 |
| `activeTurnId` / `canonicalResultTurnId` 引用合法 lifecycle；terminal record standalone 语义非法时 fail-closed | `HOST_API.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/transaction-journal.ts`、`client/story-ui/src/transaction-store.ts` | `client/story-ui/test/transaction-journal.test.ts`、`client/story-ui/test/transaction-store.test.ts` | PR #6 Windows 自动验证通过 | D2a 完成（PR #6 已合并） |
| Transaction journal 原子持久化、重启可读、同 transaction 串行、identical replay、collision/fail-closed、fingerprint 重算 | `HOST_API.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/transaction-store.ts` | `client/story-ui/test/transaction-store.test.ts` | PR #6 Windows 自动验证通过 | D2a 完成（PR #6 已合并） |
| Host transaction GET/list/PUT、同源写、400/409、optimistic/collision 冲突 | `HOST_API.md` | `client/story-ui/src/index.ts` | `client/story-ui/test/transaction-api.test.ts` | PR #6 Windows 自动验证通过；真实浏览器调用待 D2d | D2a 完成（PR #6 已合并） |
| Browser transaction bridge load/list/save：path identity、duplicate list 与 exact canonical PUT acknowledgement fail-closed | `HOST_API.md` | `client/story-ui/src/client/host-transactions.ts` | `client/story-ui/test/host-transactions.test.ts` | PR #6 Windows 自动验证通过；真实浏览器 recovery 待 D2d | D2a 完成（PR #6 已合并） |
| Hidden identity 分离：Story Engine `turnId`、DSH `dshRequestId/rpcId`、DSH numeric `dshTurn` | `TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/transaction-journal.ts`、`client/story-ui/src/client/ai-bridge.ts`；上游 DSH session contract/history | `client/story-ui/test/transaction-journal.test.ts`、`client/story-ui/test/ai-correlation-pagination.test.ts`、`client/story-ui/test/ai-dispatch-uncertain.test.ts` | PR #9 认证 rc.2 事件形态自动验证通过；真实 DSH/browser 待 D2d | D2b 实现已合并 |
| 玩家 submit/retry/recover 真正接入 journal；hidden dispatch ambiguity reconciliation | `TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/client/player-transaction-coordinator.ts`、`ai-bridge.ts`、`StoryGameShell.tsx`、`index.ts` | `client/story-ui/test/player-transaction-*.test.ts`、`ai-correlation-pagination.test.ts`、`ai-dispatch-uncertain.test.ts` | PR #9 与 PR #11 后根项目 38/38、Client 142/142 及两端 typecheck/build 通过；真实 crash/restart matrix 待 D2d | D2b 实现与 hotfix 已合并 |
| Host 玩家 projection 保存后、hidden evidence 产生前的 session/bootstrap 或 journal 失败保持可恢复；浏览器 projection 回滚后按同 transaction 恢复且不重复玩家输入 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/client/player-transaction-coordinator.ts` | `client/story-ui/test/player-transaction-pre-dispatch-failure.test.ts` | PR #11 自动故障注入覆盖 session bootstrap 与 `beforeDispatch` journal 写入失败；真实浏览器 crash-window 待 D2d | D2b hotfix 已合并 |
| Child `stepKey + operationId` 在 mutating `story_*` body 前持久化；session ownership / identity collision fail-closed | `TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/core-step-journal.ts`、`transaction-store.ts::findOpenBySession`、`index.ts` 的 rc.2 `tools/execute` hook | `client/story-ui/test/core-step-journal.test.ts`、`transaction-api.test.ts` | 当前 D2c-1 分支尚未执行 Windows typecheck/test/build；真实 DSH tool dispatch 待适用验收 | D2c-1 已实现，待验证/合并 |
| `operationRef` 与 canonical effect 明确区分；只有 matching Core Runtime receipt 证明 applied/replayed，条件 no-op 可无 receipt | `TRANSACTION_AND_RECOVERY_SPEC.md` | D1 receipt 已有；D2c-1 只记录 planned/preflight evidence；result/receipt coordinator 待 D2c-2 | D1 receipt 测试已有；D2c-2 对账测试待实现 | 待 D2c-2 / D2d | 部分完成 |
| 多 operation partial commit、core receipt → social projection、late cancel after canonical effect reconciliation | `TRANSACTION_AND_RECOVERY_SPEC.md` | 待 D2c-2 | 待 D2c-2 | 待 D2d crash-recovery matrix | 未完成 |
| 非终态 transaction 阻止 fork/另存为 | `HOST_API.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | 待 D2d | 待 D2d | 待 D2d | 未完成 |
| 季 / 集 / 场景与频道由 Runtime 权威状态联动 | `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` | 待 D3 | 待 D3 | 待整集验收 | 未开始 |
| 越界暂停 → 修订 → 校验 → 恢复的正式游戏 UI | `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` | Runtime 基础已有；正式 UI 待 D4 | Runtime 测试已有；UI 待 D4 | 待整集验收 | 部分能力已有 |

## 维护规则

- 只有实现和验证证据都存在时，才把一行标记为 `完成`；自动 contract 验证与真实 DSH/browser 集成验收必须分开记录。
- 代码文件移动或测试重命名时，同一个 PR 更新本表。
- 本表不复制大段测试输出；精确测试数量和最新验证基线放 `CURRENT_STATUS.md`。
- 浏览器 / 真实 DSH 验收只记录已经实际执行过的场景，不用计划中的 smoke 代替通过证据。
- 历史实现报告位于 `docs/archive/`，可以提供背景，但不作为当前契约状态来源。
