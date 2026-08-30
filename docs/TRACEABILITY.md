# 契约—实现—验证追踪

本文用于回答一个工程问题：正式契约中的关键保证，当前由哪段实现、哪项自动测试和哪次真实环境验收支撑。

它不是实时开发计划。当前阶段与下一步仍以 `CURRENT_STATUS.md`、`NEXT_DEVELOPMENT_PLAN.md` 为准；正式语义仍以各 Spec 为准。这里的 `完成` 只表示该行所列契约已经有实现和相应验证证据，不代表整个 Stage 完成。

| 契约 / 风险 | 正式契约 | 主要实现 | 自动测试 | 真实环境验收 | 状态 |
|---|---|---|---|---|---|
| AI canonical social messages 按真实 `turnId` 幂等提交 | `TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/client/story-domain.ts`、`StoryGameShell.tsx`、`ai-bridge.ts` | `client/story-ui/test/story-domain.test.ts` | host-save 后、acknowledge 前 crash-window 刷新恢复 | 完成 |
| Host identical same-revision replay；不同 stale content 仍冲突 | `HOST_API.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` | `client/story-ui/src/host-store.ts` | `client/story-ui/test/host-store.test.ts` | 同一 crash-window 验收 | 完成 |
| AI cancellation 晚到结果不得改写 `cancelled` | `TEXT_GAME_SOCIAL_UI_SPEC.md` | `client/story-ui/src/client/ai-bridge.ts`、`StoryGameShell.tsx` | Client AI bridge / view-state 测试 | Stage C 浏览器故障矩阵 | 完成 |
| `played_canon` 不包含未游玩 authored branch | `SERIAL_GAMEPLAY_SPEC.md` | `src/serial-state.ts` | `src/serial-integration.test.ts` | v0.7 / canon-integrity 本地集成验证 | 完成 |
| 选择只能记录在当前实际游玩 episode/scene | `SERIAL_GAMEPLAY_SPEC.md` | `src/serial-state.ts` | `src/serial-integration.test.ts` | v0.7 / canon-integrity 本地集成验证 | 完成 |
| Core canonical mutation 使用稳定 `operationId`、fingerprint 与持久 receipt | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/operation-idempotency.ts`、`src/serial-state.ts`、`src/plugin.ts` | `src/operation-idempotency.test.ts`、`src/serial-integration.test.ts`、`src/plugin.test.ts` | PR #5 最终 HEAD 本地自动验证通过；未执行真实 DSH smoke | **等待合并** |
| Matching core receipt 在 optimistic version 检查前重放，不重复 state/event/checkpoint | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::mutateOperation` | `src/serial-integration.test.ts`、`src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | **等待合并** |
| Receipt 首次返回与磁盘 replay 使用相同 JSON-persisted result shape | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::replayableJson`、`mutateOperation` | `src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | **等待合并** |
| Runtime v2 → v3 receipt 兼容；未知未来 schema 拒绝 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-types.ts`、`src/serial-state.ts::normalize` | `src/serial-integration.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | **等待合并** |
| Checkpoint restore 只回滚 gameplay state，不释放/发明 operation receipt；receipt 缺失或冲突拒绝 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::restoreCheckpoint` | `src/serial-integration.test.ts`、`src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | **等待合并** |
| 未提交 operation 的 deterministic pre-scene checkpoint 会按当前 base state 刷新 | `TRANSACTION_AND_RECOVERY_SPEC.md` | `src/serial-state.ts::checkpoint` | `src/serial-checkpoint-idempotency.test.ts` | PR #5 最终 HEAD 本地自动验证通过 | **等待合并** |
| 顶层 `transactionId` journal、hidden turn references 与跨域 reconciliation | `TRANSACTION_AND_RECOVERY_SPEC.md` | 待 D2 | 待 D2 | 待 D2 crash/restart matrix | **未开始** |
| 季 / 集 / 场景与频道由 Runtime 权威状态联动 | `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` | 待 D3 | 待 D3 | 待整集验收 | **未开始** |
| 越界暂停 → 修订 → 校验 → 恢复的正式游戏 UI | `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md` | Runtime 基础已有；正式 UI 待 D4 | Runtime 测试已有；UI 待 D4 | 待整集验收 | **部分能力已有** |

## 维护规则

- 只有实现和验证证据都存在时，才把一行标记为 `完成`。
- 代码文件移动或测试重命名时，同一个 PR 更新本表。
- 本表不复制大段测试输出；精确测试数量和最新验证基线放 `CURRENT_STATUS.md`。
- 浏览器 / 真实 DSH 验收只记录已经实际执行过的场景，不用计划中的 smoke 代替通过证据。
- 历史实现报告位于 `docs/archive/`，可以提供背景，但不作为当前契约状态来源。
