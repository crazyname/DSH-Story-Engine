# Story Engine v1.0 Personal 实施计划

## 1. 文档定位

本文是 `v1.0 Personal` 的详细实施顺序和退出条件。它回答“下一步开发什么、为什么先做它、完成到什么程度才能进入下一步”。

- `DEVELOPMENT.md` 负责长期产品/架构方向。
- `NEXT_DEVELOPMENT_PLAN.md` 负责跨版本路线和当前阶段。
- 本文负责 v1.0 Personal 的具体实施顺序。
- `CURRENT_STATUS.md` 仍是实时完成状态的唯一入口。

本文不是功能愿望清单。除非发现阻塞性架构问题，否则 v1.0 Personal 范围按本文冻结；账号、支付、Credits、云同步、Marketplace、在线图片生成 API、完整 Creator Studio、多玩家、移动端原生壳不进入 v1.0。

## 2. 总体开发顺序

```text
当前 Stage D
D2c-2 receipt/result reconciliation（PR #13）
        ↓
D2d fork / restart / failure matrix
        ↓
D3 season / episode / scene 与频道权威联动
        ↓
D4 正式玩法界面基础
        ↓
D5 Stage D 整集端到端基线
        ↓
Stage E / Personal
E1 World Capability + Time + Location 基础
        ↓
E2 Scheduler + NPC Agenda / Availability
        ↓
E3 Knowledge + Provenance + Canon Consistency
        ↓
E4 Communication + Information Sources
        ↓
E5 Objectives / Leads + Choice Suggestions + System Meta
        ↓
E6 Minimal Visual Asset + Prompt Queue
        ↓
E7 Long-term Memory + Search + Timeline + Script Buffer
        ↓
E8 Personal Inspector + Controlled Repair
        ↓
E9 Reliability / Autosave / Model Failure / Compatibility
        ↓
E10 Personal RC 长时游玩验收
        ↓
v1.0.0 Personal Stable
```

每个阶段原则上使用独立分支/PR；单阶段仍过大时继续拆小切片。不得为了“顺手”把后一阶段功能提前塞入当前 PR。

## 3. Stage D：先完成现有可靠性与玩法基线

### D2c-2：Receipt/result reconciliation

当前由 PR #13 负责。该阶段只解决已经计划的 transaction/core/social reconciliation，不因本文新增产品需求扩张范围。

完成条件：

- operationRef、tool result、Core Runtime receipt 能明确区分 planned / skipped / applied / replayed。
- core canonical effect 已发生但 social projection 尚未落盘时可以恢复。
- 多个 core operation 部分提交后按 operationId 对账，不重复 canonical mutation。
- late cancel 在 canonical effect 已存在时不伪造“未发生”，而是继续 reconciliation。
- transaction 最终状态同时基于 journal、hidden DSH、core receipt/runtime、Host projection 收敛。
- 完成 PR #13 自己声明的 typecheck/test/build、tracked artifacts、适用 DSH smoke 和文档收口。

### D2d：Fork / restart / failure matrix

D2c-2 合并后立即开发，不插入新玩法功能。

开发内容：

- 非终态 transaction 与 Save As / fork 的 v1 策略；默认在非终态期间拒绝 fork。
- Host/进程重启后发现并恢复 open transaction。
- hidden dispatch ambiguity、core→social crash window、multi-operation partial commit、late cancel、ID collision、cross-save isolation。
- 认证 DSH / 真实浏览器 crash-window 验收矩阵。

退出条件：D2a–D2d 全部满足后才把 durable transaction/recovery 标记为完成。

### D3：Season / Episode / Scene 与频道权威联动

开发内容：

- 当前 season / episode / scene 只由 Core Runtime 权威状态驱动。
- scene 变化投影到正确 `scene/direct/group/work/system` channel frame。
- 切换 UI channel 不改变剧情位置。
- continue / refresh / fork 后 projection 与 played_canon/current scene 一致。
- 为后续 location/presence 建立稳定 `sceneId` 与 participant reference，不在此阶段加入完整世界位置系统。

退出条件：刷新、切频道、继续游戏和 fork 都不能让 UI 显示错误 scene/episode。

### D4：正式玩法界面基础

开发内容：

- 工作内轻量事件 UI。
- 工作外详细场景 UI。
- authored choice card + 自由输入。
- 越界输入暂停 → 修订 → 校验 → 恢复。
- 集末 played-canon summary。
- choice 基础交互先保证 2–4 项可渲染并与自由输入共存；“默认 3 项、可关闭”的 Personal UX 在 E5 完成。

退出条件：玩家可以完成一集，不需要通过 DSH 原始聊天界面执行剧情操作。

### D5：Stage D 整集端到端基线

目的：在加入 Personal 世界系统前，证明现有 canonical/recovery/gameplay 链条本身稳定。

至少用原创可再发布内容包完成：

- 开场 → scene → 工作事件 → 主线场景 → choice/free input → 越界修订 → 集末总结。
- refresh/restart/retry/recovery/fork 不重复 canonical effect 或 social messages。
- Stage D 基线问题必须在进入 E1 前收口。

## 4. Stage E：v1.0 Personal 具体实施阶段

## E1：World Capability、Story Time、Location / Presence 基础

### 目标

先建立“这个世界允许什么、当前时间是什么、每个人在哪里”的权威状态。后续邮件、手机、NPC 作息、任务过期、Scheduler 都依赖这一层。

### 开发内容

1. Content Pack 增加通用 capability/module 声明，不把现代手机等写死进 Core。

建议语义：

```text
worldCapabilities
  communication: inPerson / phone / sms / email / radio / letter / terminal / custom
  information: mail / news / publicFeed / custom
  world: travel / calendar / weather

modules
  relationship
  objectives
  communication
  mail
  work
  inventory
  economy
  combat
  weather
```

具体 Schema 可以调整，但必须满足：未启用的能力不出现在 Player UI，也不能被 AI/tool 隐式使用。

2. 建立持久 `StoryTime`：

- 单调推进的游戏内时间，不依赖真实墙钟。
- 支持 scene/行动导致时间推进。
- 支持显示日期/时间，但 Core 不绑定现实 timezone。
- save/checkpoint/restart 后完全恢复。

3. 建立 `Location` / character current location / scene presence：

- 人物当前位置属于 canonical runtime state。
- 当前现场 participant 由 scene/location 规则确定，不能仅靠 AI 文本推断。
- scene 进入/退出时更新 presence。

4. 建立基础 state provenance 字段/引用能力，为 E3 状态来源追踪做准备。

### UI

- 顶部/右栏显示当前 story time 与 location（允许内容包关闭）。
- 暂时不做漂亮地图；地图 UI 留后。

### 测试

- phone/email capability 关闭的包不能生成相关 UI/可发送行为。
- 不同存档的 story time/location 隔离。
- checkpoint/fork/restart 后时间和位置一致。
- schema migration / unknown version fail-closed。

### 退出条件

后续系统可以只读 authoritative `StoryTime + Location + Presence + WorldCapabilities`，不再从聊天文本猜时间、地点或通讯能力。

## E2：Scheduler + NPC Agenda / Availability + 离屏行动

### 目标

让世界在玩家不直接与某 NPC 互动时仍能按游戏时间运行。

### 开发内容

1. Durable Story Event Scheduler：

- eventId、due story time、condition、effect/action reference、status。
- time advance / scene transition 时结算到期事件。
- restart 后仍存在；同 event 不重复执行。
- Scheduler 使用游戏时间，不做真实后台定时服务器。

2. NPC Agenda：

- short-term goals / commitments / planned activity。
- NPC 当前 availability：available / busy / sleeping / unavailable / missing 等可扩展状态。
- communication medium 可分别可用，例如能收短信但不能接电话。

3. 离屏行动：

- 玩家忽略某条线索时 NPC 可以自行行动。
- 离屏行动可以产生 canonical world effect，但不得替玩家作关键决定。
- 高影响后果仍遵守现有“升级为详细场景/需要玩家决定”的规则。

4. Debug reproducibility 基础：

- 需要随机结算的非 LLM 事件保留可重放 seed/decision evidence。
- 不要求所有剧情固定随机种子，但 bug reproduction 必须有确定证据。

### 测试

- “NPC 睡觉时短信可发送但不立即回复”。
- “约定时间到达后触发事件”。
- “玩家推进到第二天，昨日 pending event 只结算一次”。
- restart 后 Scheduler 不丢失、不重复。

### 退出条件

邮件送达、延迟回复、任务过期、NPC 自主行动都可以建立在 Scheduler/Agenda 上，而无需专门写一次性逻辑。

## E3：NPC Knowledge + State Provenance + Canon Consistency

### 目标

解决“NPC 不该知道却知道”“已经发生的事实被 AI 后来改口”“状态变了却不知道为什么”。

### 开发内容

1. Knowledge Model：

```text
factId
subject / scope
state: confirmed / believed / suspected / false-belief
source/provenance
learnedAt
visibility
```

具体字段可以调整，但必须支持：知道、相信、怀疑、误解，不只是 boolean。

2. Knowledge acquisition：

- 亲眼看到。
- 玩家/NPC 告知。
- 邮件/新闻/文件等信息来源。
- 自己调查/推理。
- 不得因为模型全局上下文含有秘密就自动进入 NPC knowledge。

3. 通用 State Provenance：

至少覆盖：

- relationship 变化来源。
- knowledge 来源。
- objective 状态变化原因。
- character status/location 重大变化。

4. Canon contradiction guard：

- 规则层先检查生死、地点、时间顺序、身份、已知事实、持有物、objective、重大选择等确定性冲突。
- 高影响且规则无法判定的候选结果可以使用当前 DSH 模型执行 consistency audit；audit 只给出判断/诊断，不自行改 canon。
- 冲突必须在 canonical commit 前阻止或进入系统修订。

### UI

此阶段只需要开发/诊断视图；完整 Personal Inspector 在 E8。

### 退出条件

NPC 的可见上下文由 knowledge filter 产生；重大 canonical candidate 在提交前有一致性检查；重要状态变化可以追溯来源。

## E4：Communication + Information Sources（邮件/手机/现场等）

### 目标

真正解决“只能和当前场景人物面对面聊天，但特定世界可以使用手机/邮件；其他剧本没有手机就不能使用”。

### 开发内容

1. `channel.kind` 与 `communication medium` 分离。

例如：

```text
kind: direct / group / scene / work / system
medium: in_person / phone_call / sms / email / radio / letter / terminal / custom
```

2. Send Guard：发送前同时检查：

- world capability 是否支持该 medium。
- 玩家是否拥有该联系方式/访问权限。
- 当前 location/presence 是否满足 `in_person`。
- NPC availability 是否允许即时回应。
- 当前 scene 是否禁止某类通信。
- channel/participant identity 是否合法。

AI prompt 不能覆盖这些 Runtime guard。

3. Information Source 抽象：

- email inbox 是 v1.0 Personal 首个正式信息源。
- 同一抽象以后可承载新闻、信件、终端、广播等。
- 内容包关闭 email 时 UI 完全不出现邮箱。

4. 邮件：

- inbox / unread / sender / subject / storyTime / body / attachments metadata（如有）。
- 邮件由 authored event、NPC action、Scheduler 或系统合法生成。
- 邮件可更新 NPC/player knowledge。
- 新邮件产生 Notification，但 Notification 不是邮件正文的替代存储。

5. Notification Center：

- 新邮件。
- NPC 新消息。
- objective/lead 更新。
- work event 完成。
- 其他世界内提示。

Notification Center 与 E5 的 System Meta 对话严格分离。

### UI 行为

- 不在场 NPC：若没有任何远程 medium，不能发送；可以显示“当前无法联系”。
- 有 sms 但无 phone：只显示短信能力。
- `in_person` 只允许当前 scene/presence 合法人物。
- 中世纪包可只出现现场/信件，不出现手机/email。

### 退出条件

通过两个测试包证明：现代包可现场+手机+email；无现代通信能力的包完全不能通过 UI/Runtime 偷用手机/email。

## E5：Objectives / Leads + Choice Suggestions + System Meta

### 目标

给长期游玩提供方向感，但不把游戏变成必须跟任务箭头走的传统 RPG。

### 开发内容

1. Objectives / Leads：

建议状态：

```text
available
noticed
active
ignored
expired
resolved
failed
```

- `ignored` 只停止主动提醒，不冻结世界。
- ignored/未处理目标的世界后果仍由 Scheduler/NPC Agenda 继续。
- objective 可以有 deadline，但没有 deadline 时不能制造虚假倒计时。
- objective/lead 变化记录 provenance。

2. Choice Suggestions：

- authored/runtime 仍允许 2–4 个 reference choices。
- Player 默认显示 3 个最相关参考项。
- 位置固定在文字输入框正上方。
- 玩家可以点击选择、完全自由输入、关闭当前建议、在设置中长期关闭建议。
- 关闭 suggestion 只影响 UI，不影响 authored_script、planning、AI 对当前可行路径的理解。

3. System Meta 独立对话/面板：

- 不属于 world channel，不进入 NPC knowledge，不自动进入 played_canon。
- 接受 `(系统)` 指令。
- 用于解释状态、请求脚本修订、报告越界/一致性问题、触发受控工具。
- E6 后可从这里请求生成 Visual Prompt；E8 后可进入 Inspector/Repair。

4. 自由行动优先：

- Objectives 不是强制导航。
- 玩家自由输入形成的新计划可以创建新 lead/branch。
- “没有选择任何推荐项”不能被当作错误。

### 退出条件

玩家关闭所有 choice suggestions 后仍可正常推进；忽略 objective 后世界继续发展；System Meta 内容绝不出现在 NPC 对话/played canon 中。

## E6：Minimal Visual Asset + Avatar / Background + Prompt Queue

### 目标

v1.0 就完成真正可用的头像/背景系统和手工生图闭环，不把核心 VisualAsset 留到 1.x 重构。

### 开发内容

1. Minimal `VisualAsset` 持久模型必须在 v1.0 建立：

- stable visualAssetId。
- kind: avatar / portrait / background / scene-cg。
- source 至少支持 pack / imported。
- owner scope 至少区分 pack / save。
- 逻辑引用与本机物理路径分离。

2. `VisualAssetManager` v1 最小能力：

- import 到 Story Engine 受控资产目录。
- resolve / replace / delete / missing fallback。
- avatar 与 participant 绑定。
- background 与 channel/scene 绑定。
- scene CG 可作为 media/card 使用。
- fork/save 不得因为共享可写文件导致互相污染。

3. Visual Prompt Builder。

4. Prompt Queue：

每条至少包含：

```text
promptId
kind
用途标签
目标：participant / channel / scene
Prompt 正文
创建时间
状态
```

UI 必须提供：

- 一键复制。
- 删除 Prompt。
- 清楚标注“用于谁/哪个场景/哪个背景”。
- “导入生成结果”并自动绑定到原目标。
- 删除 Prompt 不删除已经导入的 VisualAsset，也不改变 canon。

5. Prompt 可见性过滤继续遵守 `VISUAL_ASSET_SYSTEM_SPEC.md`：不泄漏未发生剧情、隐藏身份或 NPC 不应知道的信息。

### 明确不做

- 不直接调用 Gemini/OpenAI 等图片 API。
- 不做 Credits。
- 不做模型选择器。
- 不做高级 reference identity/批量表情生成；这些属于 1.x/2.0。

### 退出条件

玩家可以在 Story Engine 内看到头像和背景；遇到缺图时能生成有明确用途的 Prompt → 一键复制 → 外部生图 → 一键导回正确目标，全程不手改 JSON/文件路径。

## E7：Long-term Memory + Search + Timeline + Player Notes + Script Buffer

### 目标

保证几十小时/多集游玩后 AI 和玩家都不会因为历史过长而失忆。

### 开发内容

1. Context 分层：

```text
当前 scene：高细节上下文
当前 episode：详细结构化 summary
当前 season：连续性 summary
长期：canonical facts / relationships / knowledge / objectives / character state
历史原文：按需 retrieval
```

- 未游玩 authored branch 不得进入 memory summary。
- secret visibility 仍需过滤。

2. Memory compaction：

- scene/episode/season 到期生成结构化摘要。
- 摘要必须能追溯相关 canonical event/scene。
- 不允许摘要静默覆盖 played_canon 原始事实。

3. Retrieval：

- 人物、频道、消息、已玩 scene、timeline event 可以搜索。
- 长期模型 context 优先检索必要历史，而不是把全部聊天塞入 prompt。

4. Player Timeline：

- 用于玩家查看剧情历史，不等于 transaction journal。
- 至少显示 story time、事件、人物、scene、关键状态变化。
- 可跳转到相关聊天/scene。

5. Recent Recap：

- 隔一段时间回来后可以看到“最近发生了什么”。

6. Player Notes：

- 手动记笔记。
- 可从消息/事件添加到笔记。
- 笔记默认是玩家 Meta 数据，不自动成为世界事实/NPC knowledge。

7. Script Buffer / authored lookahead：

- 当前可玩 scene 必须已有 validated authored content。
- 至少保持“当前 scene + 可进入的下一步剧情”有可用 authored/validated buffer；具体 buffer 长度由内容包/运行策略配置，不硬编码固定场景数。
- buffer 不足时先规划/校验再允许进入下一 scene。
- 玩家越界时按既有 revision 流程重写尚未发生 buffer。

### 性能/验收

- 大历史不要求把全部消息装入一次模型 context。
- message/timeline search 有明确分页/上限。
- 多 episode 之后仍能正确回答关键 canonical 事实和 NPC knowledge。

## E8：Personal Inspector + Controlled Repair

### 目标

允许项目所有者在长期自用时查错和修错，不退出游戏手工编辑 JSON。

### 开发内容

System Meta 面板增加 Inspector：

- 当前 story time / location / scene。
- character state / status / availability。
- relationship + provenance/history。
- NPC knowledge + source/provenance。
- objectives/leads。
- Scheduler pending events。
- played_canon / recent timeline。
- current checkpoint。
- Visual Assets / Prompt Queue。
- 最近 transaction/operation 诊断只作为开发信息，不与玩家剧情 timeline 混用。

Controlled Repair：

- 修正 character location/status。
- 修正 relationship。
- 修正/移除错误 knowledge。
- 修正 objective 状态。
- 恢复 checkpoint。
- 必要时重建 summary/index。

所有 repair 通过正式 runtime/tool mutation 进行并保留 repair reason/audit evidence；不得直接编辑底层 JSON 绕过 transaction/canon 规则。

### 退出条件

常见 AI/state 错误可以在应用内定位来源并受控修复，不需要关闭 Story Engine 去改文件。

## E9：Personal Reliability / Autosave / Model Failure / Compatibility

### 目标

把 E1–E8 做成真正可长期使用的个人版，而不是“功能都存在但一次异常就卡死”。

### 开发内容

1. Autosave / Checkpoint policy：

- player submit 前已有 durable transaction intent。
- scene start、重大 choice 前、episode end 创建/确认 checkpoint。
- canonical commit 后 projection/runtime 保存顺序明确。
- autosave 失败不得假装已保存。

2. Model failure policy：

- 流式半截输出永远不是 canon。
- 低风险 simulation/dialogue 可配置备用模型/重试；v1.0 若尚无 ModelRouter，先通过当前 DSH 模型配置实现最小 fallback/手工切换。
- 高影响 narrative/planning/audit 失败时不静默降级为更弱模型继续写正史；显示明确“重试/稍后继续/切换模型”选项。
- tool/structured-output parse failure 不允许自由文本降级写入 canon。

3. Compatibility：

- certified DSH manifest。
- 实际 version/tag/commit/capability mismatch fail-closed。
- 本机 DSH root 可以显式配置；领域数据不保存 `D:\DeepSeek-Harness` 绝对路径。

4. Long-history / migration：

- save/projection/runtime/journal/visual/memory migration matrix。
- unknown future schema fail-closed。
- 长历史分页、搜索、timeline 和 context builder 性能基线。

5. Failure matrix：

- restart。
- API/DSH disconnect。
- model timeout。
- invalid structured output。
- asset missing。
- Scheduler duplicate/restart。
- knowledge/canon conflict。

### 退出条件

上述失败不会破坏 played_canon、重复玩家操作、丢失长期存档或要求手工修文件。

## E10：v1.0 Personal RC 长时游玩验收

只有 E1–E9 全部完成后进入，不得用“功能看起来齐了”代替真实游玩验收。

### 原创公开回归包

必须覆盖：

- 完整 episode。
- scene/channel/time/location。
- choice/free input。
- scheduler/event。
- objective ignored/expired/resolved。
- communication capability on/off。
- email + notification。
- NPC knowledge secrecy。
- visual import/prompt queue。
- search/timeline/recap。
- restart/retry/recovery/fork。

### 私人个人内容包本机长时验收

允许使用私人内容做真实 Personal 验收，但内容、overlay、存档、图片和报告不得提交 Git。

必须实际覆盖至少：

- 跨多个 scene 和 story day 的连续游玩。
- 不在场 NPC 且没有远程通信时无法聊天。
- 有手机/email 的场景按 capability 正常通信。
- NPC 忙碌/睡觉/失联导致延迟回复或不可联系。
- 忽略 objective 后世界继续变化。
- NPC 离屏行动产生后果。
- secret knowledge 不泄漏。
- 头像/背景实际使用；Prompt → 外部生图 → 导回闭环。
- 长历史搜索、timeline、recent recap 可用。
- 至少一次 System Meta/Inspector 受控修复。
- 至少一次模型/DSH失败后的安全恢复。

### Personal Stable 终极验收

v1.0.0 Personal Stable 必须满足：

> 除“把 Prompt 复制到外部图片模型生成图片”这一项是刻意的人工外部步骤外，正常长篇游玩不需要退出 Story Engine 手工修改 JSON、手工管理 DSH Session、手工修存档、手工判断 NPC 是否在场或手工追踪剧情状态。

## 5. v1.0 冻结后的 1.x / 2.0 开发顺序

完成 v1.0 Personal 后才进入以下工作。

### X1：DSH Adapter 收缩

- 把 DSH-specific imports/session/RPC/tool/client mount 逐边界迁入 adapter。
- 保持 v1.0 save/canon/transaction 语义不变。

### X2：Model Router

- gameplay 只请求 simulation/state/dialogue/narrative/planning/audit/image profile。
- provider/model/cost/timeout/structured-output/tool capability 由 Router 管理。

### X3：Advanced Visual / Image Provider

- Image Provider port。
- generated asset lifecycle/cache。
- reference identity / variants / edit。
- 仍可先默认关闭在线自动生图。

### X4：Player / Creator 模块化

- 共用 Core/Runtime/Data contracts。
- Creator 直接测试 Player view。
- 是否物理拆成两个 App 留到 2.0 分发评审，不在 1.x 为拆而拆。

### X5：Native Runtime experimental

- 实现 Story Engine 所需最小 session/turn/tool/stream/cancel/context 能力。
- 与 DSH Adapter 跑同一 conformance suite。

### v2.0 Public Product

只有 Native Runtime、Provider、Player/Creator、安装/迁移、安全/许可证达到 Public RC 标准后：

- Native Runtime 默认。
- 普通用户无需安装 DSH。
- Player 默认使用 pack asset 或自动图片生成；不再暴露 Personal 本地图像导入作为常规玩家入口。
- Creator 继续允许导入原创/授权素材。
- 账号、云、Credits、Marketplace 等商业层在此阶段按独立产品评审决定，不反向污染 Core。
