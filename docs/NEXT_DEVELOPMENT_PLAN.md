# 后续开发计划

## 路线

当前产品线：`v0.8.0-beta.1`。

```text
Stage D / M3：连载玩法与事务完整性
        ↓
Stage E / M4：个人版世界、交互、视觉与长期游玩能力
        ↓
M5：v1.0 Personal RC / Stable
        ↓
M6：v1.x Architecture Transition
        ↓
M7：v2.0 Public Product RC / Stable
```

版本语义：

- **v1.0 Personal**：项目所有者本人长期游玩的完整个人版，继续基于认证 DSH Runtime；不作为首次对外产品发布。
- **v1.x**：在保持 v1.0 存档/玩法可用的前提下完成 DSH adapter 化、Model Router、高级 Visual/Image Provider、Player/Creator 边界和 Native Runtime 准备。
- **v2.0 Public Product**：第一个正式面向外部用户并在 GitHub 发布的产品级版本；Native Runtime 默认运行，DSH 为可选兼容后端。

v1.0 Personal 的精确实施顺序、依赖、测试和退出条件见 `PERSONAL_V1_IMPLEMENTATION_PLAN.md`。本文保留跨版本 roadmap 和阶段摘要；如果两者在 v1.0 实施顺序上发生冲突，以该实施计划为准并同步修订本文。

Stage A、B、C 已完成。D1 / PR #5、D2a / PR #6、D2b / PR #9、pre-dispatch recovery hotfix / PR #11 和 D2c-1 / PR #12 已合并。D2c-2 / PR #13 已完成实现与合并前验证，待合并；PR #14 只调整长期产品/版本/Personal 路线，不改变 D2c 事务契约。

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

#### D2a：Transaction journal foundation — 已完成并合并

已由 PR #6 合并到 `main`；历史开发分支为 `codex/stage-d-transaction-journal-foundation`。

目标：先把 durable identity/evidence 层做正确，再把现有玩家 submit/recover 流程接上去。

范围：

- `StoryTransactionRecord` schema v1：`transactionId`、input fingerprint、base projection revision、status、hidden refs、child operation refs、diagnostic、revision/timestamps。
- transaction 状态：`prepared`、`needs-recovery`、`committed`、`cancelled`、`failed`；终态不可产生新 revision。
- hidden turn evidence 单向推进，不允许 completed/failed/cancelled 被 late result 倒写。
- hidden identity 明确区分：
  - Story Engine `turnId`：稳定逻辑 hidden turn / social commit identity；
  - `dshRequestId`：DSH prompt correlation identity。schema 支持一次性绑定后不可修改；认证 DSH `0.1.1-rc.2` 的公开 `IApiClient` 由 carrier 内部生成该 ID，业务调用方只能在 accepted response 后取得，因此无法在 prompt 前自行持久化。若 response 丢失，则必须进入保守 recovery，不能假装已有 exactly-once request identity；
  - `dshTurn`：从 DSH durable history 对账得到的原生数字 turn。
- Host journal store：按 save/transaction 隔离、原子写、进程内串行、optimistic revision、identical replay、collision conflict、corrupt journal fail-closed。
- Windows-safe journal filenames：有界 base64url，不直接使用 transactionId 作为文件名。
- Host journal API + browser persistence primitive。
- 自动测试覆盖 identity collision、状态机、并发 revision、跨存档、Windows 路径和损坏 journal。

D2a 完成条件已经满足：Client typecheck 通过；17 个测试文件 / 108 项测试通过；`build:node` 与 `build:client` 通过；tracked `client/story-ui/lib/*` 已由真实 bundler 同步并在重复构建后保持干净；Host API/Spec/traceability 已同步。以上是 D2a foundation 的自动验证，不代表真实 DSH correlation、浏览器 crash recovery 或 D2 整体完成。

#### D2b：Player transaction coordinator — 已完成并合并

已由 PR #9 合并到 `main`，随后由 PR #11 修复 Host 玩家 projection 保存后、hidden evidence 产生前的恢复窗口；PR #9 最终 artifact HEAD 为 `9865cd9e42c1568091054e66a8f7547464f6dd7d`，PR #11 hotfix HEAD 为 `ee0f507303f97925591d1a22aac2c448057b6ee2`。

目标：真正把现有 `StoryGameShell` submit/retry/recover 链接入 durable transaction journal。

必须做到：

1. 玩家提交前创建并保存 `prepared` transaction，之后才允许 hidden dispatch。
2. Story Engine `turnId` 必须在 prompt 前持久化；认证 rc.2 返回 accepted response 后立即一次性绑定 `dshRequestId`。若 response 丢失导致 request ID 不可知，transaction 必须进入 `needs-recovery`，禁止盲目重发原始玩家输入。retry/restart 复用已有 transaction identity。
3. 通过 DSH durable `user/message.source.rpcId` 与 `turn/start` / `turn/end` 数字 turn 对账；不确定时进入 `needs-recovery`。
4. 一个 transaction 可有多个 retry/continuation hidden turns，但只有 canonical-result Story Engine `turnId` 能提交对应 social canonical messages。
5. social-only transaction 在 Host projection 保存成功并确认 identical replay 后再 acknowledge hidden turn，然后 journal 收敛到 `committed`。
6. `cancelled` 只用于尚无 canonical effect 的 transaction；late result 不能复活终态。
7. 页面刷新/进程恢复必须从 Host journal 重新发现非终态 transaction，而不是只相信浏览器内存状态。

D2b 已实现 submit 前 durable prepare、accepted rpcId 一次性绑定、按认证 rc.2 `user/message.source.rpcId` 进行 rpcId→native turn durable history 对账与跨页回溯、failed hidden turn 的同 transaction retry、canonical projection→ack→journal commit 顺序，以及 browser pending 丢失但 journal 保留 `sessionId + dshRequestId` 时的 recovery turn 重建。PR #11 进一步保证 Host 玩家 projection 可能已保存、但 hidden evidence 尚未产生时，session/bootstrap 或 journal 前置失败保持非终态并可从浏览器旧 projection 恢复，不重复玩家输入。hotfix 后根项目 9 个测试文件/38 项测试、Client 28 个测试文件/142 项测试及两端 typecheck/build 全部通过，tracked lib 重复构建一致。continuation、cancel/core-effect reconciliation 属于 D2c；restart、partial commit 及真实 certified DSH/browser crash-window 完整矩阵在 D2d 统一验收。

#### D2c：Core step journal + cross-domain reconciliation — 当前阶段

目标：把 D1 core receipts 接到 transaction coordinator。为了不把“计划了 operation”与“operation 已经产生 canonical effect”混成一个状态，D2c 分成两个顺序切片。

##### D2c-1：Core preflight operation linking — 已完成并合并

PR #12 已合并到 `main`。该切片建立不可绕过的 durable-before-body 边界：

- 利用认证 DSH rc.2 的 `tools/execute` around-dispatch：九个 mutating `story_*` 在真正 tool body 执行前，必须先通过 Story Host transaction preflight。
- 由 journal hidden-turn `sessionId` 反查唯一 open transaction；多个 open transaction 争用同一 DSH session 时 fail-closed。
- 第一次 core mutation body 前持久化稳定 `stepKey + operationId`；同一 identity 的 preflight replay 不产生新 revision。
- 同一个 `operationId` 被不同 tool/step 复用显式冲突；同一 save 的 journal 写使用短临界区串行并在最终写入前重查 operation ownership，并发不同 transaction 争用同一 `operationId` 只允许一个 owner；同 transaction 并发不同 operationRef 通过 optimistic reread/retry 追加。
- active player transaction 下每个 mutating `story_*` 必须携带与 session 所属 journal 完全一致的 `transaction_id`；缺失或错配在 body 前拒绝，使 D1 receipt fingerprint transaction-bound。没有 open player transaction 且未声明 transaction identity 的 standalone Story mutation 仍可运行。
- `PlayerTransactionCoordinator` 把 durable journal `transactionId` 作为 hidden control context 传给 initial/retry AI prompt；retry 继续使用同一 transaction identity，同一 atomic mutation retry 复用原 `operation_id`。
- preflight 持久化失败阻止 tool body 执行。
- `operationRef` 是 planned/preflight evidence，不是 effect receipt；条件性不落盘操作允许存在 operationRef 而没有 Core Runtime receipt。

PR #12 最终验证：Root 9 个测试文件 / 38 项通过，Client 30 个测试文件 / 154 项通过，两端 typecheck/build 通过，tracked artifacts 由真实构建同步且连续 build hash 一致；认证 DSH `0.1.1-rc.2` ToolRuntime smoke 验证 preflight 在真实工具 body 前落盘、D1 receipt 保留正确 `transactionId`、transaction 错配在 body 前拒绝且不污染 Runtime/journal。完整浏览器 crash-window 矩阵仍留给 D2d。

##### D2c-2：Receipt/result reconciliation — 已完成验证，PR #13 待合并

目标：用 Core Runtime receipt 与认证 rc.2 durable tool result 判断事实，并把已发生的 canonical effect 安全收敛到 social projection / transaction state。

当前分支 `codex/stage-d-receipt-result-reconciliation` 已实现：

- Host 只读 Core receipt 查询：从 authoritative Host projection 取得 `packId`，只在 transaction-owned hidden sessions 中读取 Runtime schema v3 `_engine.operationReceipts`；operation/transaction/session identity 冲突 fail-closed。
- `operationRef` 与事实状态分离：matching D1 receipt 证明 `applied/replayed`；没有 receipt 时读取认证 rc.2 append-only `tool/call` + `tool/result`，区分 known `skipped/no-op`、明确 `failed`、`pending` 与 `inconsistent`。
- 当前明确允许的无 receipt 成功 no-op 是高影响 `story_record_work_event` 返回 `{ escalated: true, recorded: false }`；其它成功 mutating result 缺 receipt 不被猜成成功。
- 同 operationId 跨 hidden session、不同 tool/arguments、pending retry、损坏 `source.callId/toolCallId` identity 均 fail-closed。
- hidden/model 外部等待期间 Host preflight 可独立推进 journal revision；normal dispatch 与 restart/recover 在外部调用返回后都会重新读取 durable journal，避免 stale browser revision 覆盖 `operationRefs`。
- hidden result 在返回 UI/social commit 路径前先完成 Core reconciliation；Host projection 已经 survived crash 时，recover/acknowledge 也会再次核对 Core evidence。
- 没有 canonical effect 且所有相关 core attempt 明确失败时可收敛为 `failed`，不伪造 social canonical result。
- 多 operation partial commit：已有 receipt 的 operation 不重做，明确 failed 的 operation 进入 `repairablePartial`；恢复动作只启动一个 continuation hidden turn，不能重发玩家输入；同一原子 mutation retry 必须复用原 `operation_id`。
- canonical effect 已存在后的 cancel 不得倒改为 `cancelled`；进入 `needs-recovery`，必要时通过 continuation 补齐 Core/social 后再收敛。无 effect 且无 unresolved evidence 才允许真正 `cancelled`。
- pending/inconsistent evidence 不启动 continuation，也不提交 social projection。

本分支已完成 Windows 本机验证：Root 9 个测试文件 / 38 项、Client 49 个测试文件 / 228 项全部通过，两端 typecheck/build 通过；tracked `client/story-ui/lib/*` 已由真实 bundler 同步，连续三次 Client build hash 一致。适用的认证 DSH `0.1.1-rc.2` ToolRuntime/Fixture-history shape smoke 验证了 transaction-bound receipt、真实 RPC/history envelope 以及 `tool/call`/双 call-id `tool/result` parser 配对。完整浏览器 crash/restart 矩阵仍属于 D2d。

D2c-2 收口条件：

1. Root / Client typecheck、test、build 全部通过。
2. 真实 build 同步 tracked artifacts，连续 build 无新增 diff。
3. 至少完成适用的 certified DSH `0.1.1-rc.2` ToolRuntime/history smoke，确认 receipt/tool-result 形态与当前 parser 一致。
4. `git diff --check` 通过，branch worktree 干净。
5. 文档、traceability、Host API 与实际实现一致。

以上 D2c-2 收口条件已经满足。PR #13 合并后即可把 D2c 标记为已合并完成；完整真实浏览器 restart/crash-window 矩阵、fork 产品策略仍属于 D2d。

PR #13 已完成自身声明的 certified Windows typecheck/test/build、真实 bundler artifact 同步、适用 DSH smoke 和文档事实收口。PR #14 不替代这些验证结果。

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

### D5：Stage D 整集端到端基线

至少使用一个可重复构建的内容包完成：开场 → scene → 工作事件 → 详细剧情 → 选择/自由输入 → 越界修订 → 集末总结 → 刷新恢复 → fork 独立连续性，并验证 retry/recovery 不重复 core effect 或 social canonical messages。

D5 只证明 Stage D canonical/recovery/gameplay 链条稳定，不等于 v1.0 Personal 完成。公开仓库继续使用原创/可再发布示例包做该基线回归。

## M4：Stage E — v1.0 Personal 实施阶段

Stage E 不再是一个笼统的“发布质量”大阶段，而按依赖顺序拆成 E1–E10。详细字段、测试和退出条件见 `PERSONAL_V1_IMPLEMENTATION_PLAN.md`。

### E1：World Capability + Story Time + Location / Presence

先建立权威世界基础：

- 内容包声明可用 communication/information/world capabilities 和 optional modules。
- StoryTime 持久化与推进。
- Location / character location / scene presence。
- 后续 provenance 所需基础引用。

E1 完成前不开发邮件、NPC 作息、任务过期等上层功能。

### E2：Scheduler + NPC Agenda / Availability

在 E1 上建立：

- durable story-time event scheduler。
- NPC goals / commitments / availability。
- medium-specific availability。
- NPC 离屏行动与延迟事件。
- 可重放的非 LLM 随机 evidence/seed 基础。

### E3：NPC Knowledge + Provenance + Canon Consistency

建立：

- confirmed / believed / suspected / false-belief knowledge model。
- knowledge acquisition/source。
- relationship/knowledge/objective/status 等重要状态 provenance。
- canonical candidate deterministic conflict guard；高影响歧义可进入 consistency audit，但 audit 不自行改 canon。

### E4：Communication + Information Sources

在 E1–E3 基础上实现：

- `channel.kind` 与 communication medium 分离。
- `in_person / phone / sms / email / radio / letter / terminal / custom` 等通用 medium。
- Runtime send guard：capability、location/presence、contact/access、availability、scene restrictions。
- Email Inbox 作为 v1.0 首个正式 information source。
- Notification Center。
- 没有手机/email capability 的包在 UI 和 Runtime 都不能使用这些能力。

### E5：Objectives / Leads + Choice Suggestions + System Meta

实现：

- 可忽略 Objectives/Leads；`ignored` 只停止提醒，世界继续运行。
- deadline/expired/resolved/failed 等状态与 provenance。
- 参考选择默认 3 项，支持 2–4 项；固定在输入框上方。
- 点击选择、自由输入、关闭当前建议、全局关闭建议。
- 关闭建议不改变 authored/planning 能力。
- 独立 System Meta 对话/面板；不属于世界 channel，不进入 NPC knowledge 或 played_canon。

### E6：Minimal Visual Asset + Prompt Queue

v1.0 就完成：

- minimal `VisualAsset` / `VisualAssetManager`。
- avatar / portrait / background / scene-cg 稳定 ID 和绑定。
- pack asset + personal imported asset。
- 本地导入到受控资产存储，不保存任意源绝对路径。
- VisualPromptBuilder。
- Prompt Queue：用途标签、目标、Prompt、一键复制、删除、导入生成结果并自动绑定。
- 缺失资产 fallback。

v1.0 不接在线图片生成 API、Credits 或高级 reference identity。

### E7：Long-term Memory + Search + Timeline + Script Buffer

实现：

- scene/episode/season/长期 canonical 分层 memory compaction。
- retrieval，避免把全部历史聊天塞入 context。
- 人物/频道/消息/已玩 scene 搜索。
- 玩家剧情 Timeline，与 transaction journal 分离。
- recent recap。
- Player Notes。
- validated authored Script Buffer / lookahead；进入下一 scene 前必须已有可用、校验通过的剧情缓冲。

### E8：Personal Inspector + Controlled Repair

System Meta 增加：

- story time/location/scene。
- character state/availability。
- relationship provenance。
- NPC knowledge/source。
- objectives。
- Scheduler pending events。
- timeline/played canon。
- checkpoint。
- Visual Assets/Prompt Queue。
- transaction/operation 诊断。

修复必须通过正式 runtime/tool mutation，保留 repair reason/audit evidence；禁止直接编辑底层 JSON 绕过 canonical/transaction 规则。

### E9：Personal Reliability / Autosave / Model Failure / Compatibility

最后统一收口：

- autosave/checkpoint policy。
- partial stream 永不进入 canon。
- model timeout/structured-output/tool failure 策略。
- 高影响 narrative/planning/audit 不静默降级成弱模型继续写正史。
- certified DSH manifest / compatibility guard。
- save/projection/runtime/journal/visual/memory migration matrix。
- long-history performance。
- restart/disconnect/asset-missing/scheduler/knowledge-conflict failure matrix。

### E10：Personal RC 长时游玩验收

原创包自动/端到端回归 + 私人包本机长时真实游玩，至少覆盖：

- 跨多个 scene 和 story day。
- 不在场 NPC 通信限制。
- 现代通信 capability 与无手机剧本对照。
- email + notification。
- NPC 忙碌/睡觉/失联与延迟回复。
- ignored objective 后世界继续。
- NPC 离屏行动。
- knowledge secrecy。
- avatar/background + Prompt → 外部生图 → 导回。
- search/timeline/recap。
- System Meta/Inspector 受控修复。
- 模型/DSH失败后的安全恢复。

私人内容、overlay、存档、图片和验收报告不进入 Git。

## M5：v1.0 Personal RC / Stable

Personal RC 前冻结并评审：

- `PERSONAL_V1_IMPLEMENTATION_PLAN.md` 的 D2c-2 → D2d → D3 → D4 → D5 → E1–E10 是否全部达到退出条件。
- 当前个人存档需要依赖的 `pack.json` / episode-script / `ui/story-ui.json` 语义。
- save/projection/runtime/journal/visual/memory migration policy。
- `story_*` tool contract 与 Host API 在认证 DSH 环境中的可恢复行为。
- certified DSH runtime baseline。
- WorldCapabilities / StoryTime / Location / Presence / Scheduler / Knowledge / Objectives 的长期存档边界。
- v1.0 Visual Asset Personal workflow：Minimal VisualAsset + 本地导入 + Prompt Queue。
- 1.x 解耦时不得破坏的长期个人存档/played canon/transaction evidence 边界。

Personal Stable 的核心标准：除“把 Prompt 复制到外部图片模型生成图片”是刻意保留的人工步骤外，正常长篇游玩不需要退出 Story Engine 手工修改 JSON、管理 DSH Session、修存档、判断人物是否在场或手工追踪剧情状态。

v1.0 Stable **不宣称是面向第三方用户的首次公开产品**，也不因版本号 1.0 自动承诺云服务、商业 SLA、Marketplace 或跨平台安装器。

## M6：v1.x Architecture Transition

目标：把 2.0 独立产品需要的可替换边界做出来，同时保持 v1.0 个人存档和玩法持续可用。

### Runtime

- 逐步把 DSH-specific code 收缩到 `adapters/dsh`；每次只迁移一个已验证边界。
- DSH 新版本只在独立 compatibility branch 验证，通过完整自动与适用真实环境矩阵后才更新 certified baseline；主开发线不自动追随上游。
- 实现最小 Native / Standalone Runtime，并与 DSH Adapter 共用正常回合、取消、waiting-choice、断连、retry、recovery、tool idempotency 和 canonical result conformance tests。

### Model Router

- gameplay code 只选择任务 profile，不写死厂商/模型名。
- 至少定义 `simulation`、`state`、`dialogue`、`narrative`、`planning`、`audit`、`image` 等能力档位。
- Provider 配置、超时、取消、structured output、tool capability 和成本策略由 router/adapter 处理。

### Advanced Visual / Image Provider

v1.0 已经具有 Minimal VisualAsset/Manager/PromptBuilder；1.x 不重写这些基础，而增加：

- generated asset lifecycle/cache。
- reference identity / variants / edit。
- provider/model provenance。
- Image Provider interface。
- 与 Model Router 的 `image-*` profile 对接。
- 默认在线生成可以保持关闭，直到 2.0 Product 验收。

### Product Surfaces

- Player / Creator 共用 Runtime、Content Pack、Save/Canon、Model Router 和 Visual Asset System。
- 可以继续同一应用双模式，但代码结构允许未来拆成不同前端入口。
- Creator 必须可以从编辑上下文直接进入 Player 测试视图。

## M7：v2.0 Public Product RC / Stable

v2.0 是第一个正式面向外部用户并在 GitHub 发布的产品级大版本。

发布门槛：

- Native Runtime 成为默认，普通用户无需安装/clone DSH；DSH Adapter 作为可选兼容 backend。
- Player 默认安装后直接可玩，不要求理解 DSH、tool/session、源码目录或手动准备视觉素材。
- 正式 Player + Creator/Studio 产品表面，共享一个 Core；是否物理拆成两个应用由 2.0 UI/分发评审决定，不允许复制 Runtime。
- Image Provider 接入：内容包已有授权/原创 canonical 视觉资产时直接复用；没有时可自动生成并缓存默认头像、背景或剧情图。
- 普通 Player UI 移除 v1.0 的“个人本地图片导入”常规入口；Creator/Studio 继续允许导入原创或具备授权的素材。
- 图片重画/变体、额度/Credits 属于可选商业产品层；核心规范只定义能力和资产来源，不固定价格或支付策略。
- 完成对外安装、升级、卸载、兼容/迁移、安全、隐私、Provider key 管理、第三方许可证、原创示例、故障排查与完整 `RELEASE_CHECKLIST.md`。
- v2.0 RC 前重新评审开源/闭源/服务边界；除非另有明确许可证 PR，仓库现有 MIT 许可不因本路线自动改变。

2.0 Stable 必须通过 Native Runtime 与 DSH Adapter 的 conformance matrix、全套 Story transaction/canon recovery、长时存档、Player 首次启动、Creator 内容制作/测试、Visual Asset 自动生成/缓存和无私人资料泄漏的发布审计。
