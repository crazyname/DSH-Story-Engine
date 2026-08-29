# 独立文字游戏界面与社交聊天系统开发规范

## 1. 文档状态

本文定义 DSH Story Engine 图形界面的正式产品边界、交互结构、数据模型和阶段性能力边界。它与 `SERIAL_GAMEPLAY_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md` 共同构成开发契约：前者规定游戏怎样运行，本文规定玩家怎样进入和操作游戏，事务规范规定 retry、幂等和跨域恢复怎样成立。

本文是长期 normative contract，不记录短期完成度。当前实现状态与下一步任务分别以 `CURRENT_STATUS.md` 和 `NEXT_DEVELOPMENT_PLAN.md` 为准。

本文确认以下决策：

- DSH 启动后直接显示原有普通 AI 聊天，不增加启动模式选择页。
- 文字游戏是独立完整界面，不是普通聊天窗口中的标签页或换皮。
- 普通聊天与文字游戏通过 DSH 侧边栏中的固定入口切换。
- 普通会话、游戏频道、消息列表、草稿和存档不得在界面上混用。
- 文字游戏可以在后台复用 DSH 的模型、工具、流式响应和会话能力。
- DSH 原版业务源码保持不修改；界面及适配代码在 Story Engine 项目中开发。

## 2. 产品目标

为基于 DSH 的开放文字游戏提供一个类似现代社交软件的信息架构：一名角色对应私聊，多名角色对应群聊，同时容纳现场叙事、人物动作、玩家选择、工作派遣和系统修订。

该界面必须满足：

1. 非技术玩家不需要理解 DSH Session、工具调用或上下文窗口。
2. 作者可以通过内容包定义人物、群组、头像、初始频道和界面主题。
3. AI 每次输出都能明确归属到频道、说话人、场景和剧集。
4. 重启、切换模式和加载旧存档后可以确定性恢复。
5. DSH 原有普通聊天保持可用，文字游戏故障不得破坏普通聊天。

## 3. 明确不采用的方案

### 3.1 不设置启动选择首页

打开 DSH 后不询问“普通聊天还是文字游戏”。默认路径始终是原有普通 AI 聊天，避免改变 DSH 的日常使用方式。

### 3.2 不在普通聊天中增加游戏标签页

游戏不是 `Chat / Story` 之类的同会话标签。游戏有独立导航、频道、输入规则和存档生命周期，不能与普通助手消息共用同一视觉消息流。

### 3.3 不把人物映射为多个 DSH Session

每名人物或每个群聊不能对应一个独立 DSH Session。这样会拆散世界状态、人物关系、季集连续性和模型上下文。

一个游戏存档在后台可以绑定一个专用 DSH Session，但所有世界内频道属于该存档内部的数据域。

### 3.4 不引入真实即时通信后端

本项目不需要账号系统、WebSocket 群聊服务器或第三方聊天云服务。私聊和群聊是叙事组织方式，不是真实用户之间的通信。

## 4. 顶层交互

```text
启动 DSH
└─ 普通 AI 聊天（默认）
   ├─ 原有工作区与会话
   ├─ 原有模型、工具和设置
   └─ 侧边栏：文字游戏
      └─ 独立文字游戏界面
         ├─ 游戏库／内容包
         ├─ 新游戏／继续游戏／存档
         ├─ 私聊与群聊
         ├─ 工作派遣
         ├─ 人物与关系
         └─ 返回普通聊天
```

### 4.1 模式切换

侧边栏增加独立的“文字游戏”入口。它不是新建会话按钮，也不占用普通会话列表中的一行。

进入游戏模式时：

- 普通聊天布局退出可见区域，但状态不销毁。
- 恢复上次打开的内容包、存档、频道和滚动位置。
- 没有存档时显示游戏库，而不是普通聊天空白页。

返回普通聊天时：

- 恢复之前选中的普通会话和阅读位置。
- 保留游戏当前频道、草稿和未读状态。
- 不把游戏消息投影进普通聊天消息流。

刷新或重新启动后默认仍进入普通聊天，不自动强制进入上次游戏模式。后续可增加用户设置改变这一行为，但不属于首版。

## 5. 文字游戏界面结构

### 5.1 游戏库

游戏库负责显示已安装内容包以及它们的可用存档：

- 内容包名称、封面、作者、版本和兼容状态。
- 继续游戏、新游戏、存档管理和内容包详情。
- 损坏、缺少资源或版本不兼容时显示明确诊断。
- 私有内容包不得把受版权保护的资源暴露到公开包或遥测中。

### 5.2 游戏主界面

桌面宽度下采用三栏结构：

| 区域 | 主要内容 |
|---|---|
| 左栏 | 私聊、群聊、工作频道、最后消息、时间、未读数和置顶状态 |
| 中栏 | 当前频道消息、叙事卡、选择卡、派遣卡和专用输入框 |
| 右栏 | 群成员、人物资料、关系、当前集与场景，可折叠 |

窄屏时左栏和右栏变为抽屉，中栏始终保留。

### 5.3 顶部栏

顶部栏至少显示：

- 当前频道名称和类型。
- 私聊对象或群成员摘要。
- 当前季、集和场景。
- 游戏暂停、存档和返回普通聊天操作。

不得在剧情主区域持续显示模型名称、Token、工具轨迹等技术信息。它们只进入开发者面板。

## 6. 频道模型

### 6.1 频道种类

首版支持：

- `direct`：玩家角色与一名 NPC 的私聊。
- `group`：三名及以上人物的群组。
- `scene`：面对面场景、战斗、约会或其他非手机交流。
- `work`：工作内派遣、排班和结果简报。
- `system`：游戏诊断、迁移和必要的非角色通知；不承载普通剧情对白。

“社交软件式界面”是信息组织方式，不表示所有剧情都发生在手机中。面对面剧情应使用 `scene` 频道以及对白、旁白和动作卡。

### 6.2 频道记录

```ts
interface StoryChannel {
  id: string
  kind: 'direct' | 'group' | 'scene' | 'work' | 'system'
  title: string
  participantIds: string[]
  avatar?: string
  category: 'personal' | 'work' | 'story' | 'system'
  pinned: boolean
  muted: boolean
  archived: boolean
  lastMessageId?: string
  lastActivityAt?: string
}
```

私聊频道必须通过规范化的成员集合防止重复创建。群聊名称、成员和头像可以随剧情变化，但历史消息保留发送时显示信息的快照。

## 7. 人物模型与命名

```ts
interface StoryParticipant {
  id: string
  heroNameZh?: string
  realNameZh: string
  aliases: string[]
  avatar?: string
  role: 'player' | 'npc' | 'narrator' | 'system'
  identityVisibility: string[]
  status: 'active' | 'missing' | 'injured' | 'dead' | 'retired'
}
```

显示名称遵循连载玩法规范：

- 一般优先使用英雄中文名。
- 私人、家庭和亲密场景可以使用本名中文名。
- 首次切换称呼时显示一次本名与英雄名对应关系。
- 玩家角色根据公开或私人场景使用英雄名或本名。
- 身份未知的角色不能因界面元数据泄露本名。

人物死亡、失踪或退出不会删除人物和历史聊天，只改变状态及可继续互动能力。

## 8. 消息模型

### 8.1 结构化消息

不得依赖解析 `人物名：对白` 的自由文本判断说话人。AI 和运行时必须提交结构化消息：

```ts
interface StoryMessage {
  id: string
  channelId: string
  senderId: string
  type:
    | 'dialogue'
    | 'narration'
    | 'action'
    | 'system'
    | 'choice'
    | 'work-dispatch'
    | 'relationship'
    | 'episode-summary'
    | 'media'
  content: string
  createdAt: string
  storyTime?: string
  seasonId: string
  episodeId: string
  sceneId?: string
  turnId: string
  canonStatus: 'proposed' | 'committed' | 'retracted'
  metadata?: Record<string, unknown>
}
```

同一个模型回合可以产生多条消息，并分别属于不同人物。运行时必须按提交顺序保存，不能把整次模型响应折叠为一个助手气泡。

实际产出某组 canonical messages 的隐藏 DSH AI 回合使用其真实 `turnId` 作为稳定提交身份。一个玩家 transaction 可以包含多个 retry/continuation turns，但只有 canonical-result turn 的消息进入该次 social commit。retry/recovery 重放相同 canonical sequence 必须为 no-op；同 `turnId` 的不同 canonical content 必须冲突。具体语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`。

### 8.2 消息呈现

- 玩家角色默认右侧气泡。
- NPC 默认左侧气泡；群聊显示头像和姓名。
- 连续同一说话人的短消息可以视觉分组，但数据保持逐条独立。
- 旁白使用居中或通栏卡片，不伪装成人物消息。
- `(系统)` 使用明确的系统修订样式，不作为世界内信息。
- 工作派遣使用紧凑卡片，显示事件、派遣英雄、结果和必要后果。
- 重大选择使用选择卡，同时允许自由输入。
- 集末总结使用独立结算页或卡片，列出选择与未选择的重要可用路线。

## 9. 玩家输入协议

游戏输入框与普通 DSH 输入框是两个不同组件和状态源。

在游戏输入框中：

- 无标识文本：玩家角色在当前场景或频道说话。
- `(行动)`：玩家角色动作。
- `(系统)`：对 AI、剧本或规则的非角色修正。
- 点击参考选项：提交对应选择，同时保留自由输入能力。

输入提交前必须绑定当前 `saveId`、`channelId`、`episodeId` 和 `sceneId`，防止切换频道时把草稿发送到错误地点。

不同频道分别保存草稿。切换到普通聊天时，游戏草稿不得进入 DSH 普通输入框。

可能产生 canonical effect 的顶层玩家提交必须在首次隐藏 DSH/外部调用前获得稳定 `transactionId`。如果该 transaction 中需要调用一个或多个 mutating core `story_*` 操作，每个原子 mutation 使用自己的稳定 `operationId`。retry、刷新和恢复不得通过生成新 transaction/operation identity 把同一玩家输入或已完成 core mutation 再提交一次；同一 transaction 下产生新的 hidden continuation turn 也不得重新追加原始玩家输入。

## 10. AI 输出协议

结构化输出能力可以通过以下工具或等价事务接口提供：

- `story_emit_messages`：一次提交一组带频道和发送者的消息。
- `story_upsert_channel`：创建或修改私聊、群聊和场景频道。
- `story_mark_episode_summary`：提交经可见性过滤的集末总结。
- `story_pause_for_revision`：实质性越界时暂停并记录修订请求。

`story_emit_messages` 或等价提交必须先校验：

1. 内容包、存档、频道和人物存在。
2. 发送者属于频道或是获准的旁白／系统身份。
3. 季、集和场景与当前运行状态一致。
4. AI 未替玩家角色作出未经玩家输入的承诺、恋爱接受、道德决定或关键行动。
5. 消息引用的事实没有越过人物知识边界。
6. 所有消息校验成功后才原子提交，禁止半组写入。

流式预览、模型自由文本和未经完整校验的结构化片段都不是正史，不得在解析失败时降级为 canonical narration。

## 11. 游戏状态与持久化

### 11.1 状态分离

至少分离以下数据：

- `source_canon`：只读原作或导入设定。
- `authored_script`：预写季、集、场景、分支与秘密。
- `played_canon`：实际发生的剧情。
- `social_state`：频道、成员、已提交消息、未读游标和草稿。
- `runtime_state`：当前季集、场景、检查点、运行锁和后台 Session 绑定。

普通 DSH 会话列表不能作为游戏存档目录。游戏库从 Story Engine 自己的存档索引读取。

### 11.2 DSH 后台 Session

每个活动存档可以绑定一个专用 DSH Session，用于模型上下文、工具执行和流式生命周期。该 Session 是实现细节：

- 不作为人物或群聊显示。
- 不把原始助手文本直接当作游戏正史。
- 只有通过结构化校验和 canonical commit 的数据进入 `played_canon` 和 `social_state`。
- 调试模式可以查看底层轨迹，普通游戏模式不显示。

### 11.3 Authoritative projection、journal 与历史

首版不要求把所有 UI 状态实现为完整 event sourcing。

跨隐藏 DSH、core runtime 和 social projection 的可重试 transaction 使用稳定身份、durable transaction journal 与 runtime receipts 负责幂等和崩溃恢复；`StorySaveProjection` 是当前 social/UI state 的宿主持久化权威投影。具体见 `TRANSACTION_AND_RECOVERY_SPEC.md`。

正式关系为：

```text
transactionId
    ↓
durable transaction journal
    ├─ hidden DSH turnId[] lifecycle / active / canonical-result turn
    ├─ core operationId → receipt + core runtime canonical state
    └─ canonical-result turnId → StorySaveProjection canonical social commit
                                      ↓
                                      UI
```

这意味着：

- core runtime 是 `played_canon`、当前 episode/scene、选择和后果等游戏 canonical state 的权威来源；
- `StorySaveProjection` 是当前 social/UI state 的宿主持久化权威投影，但不能反向覆盖 core canonical truth；
- transaction journal 保存跨域恢复身份和阶段，包括 hidden turn references；operation receipts 证明具体 core mutation 是否已经应用；
- hidden dispatch 结果不确定时必须按 DSH 实际支持的 correlation/history 能力对账；无法可靠判断时进入 `needs-recovery`，不能通过盲目创建新 turn 宣称 exactly-once；
- 客户端不得从模型原文、工具轨迹或 UI 临时状态猜测 canonical history；
- UI 主要读取 projection，不直接消费 runtime receipts；
- 未来可以增加 append-only domain events 用于审计、迁移或增量同步，但 v1 首版不要求草稿、阅读游标和每个 UI 改动都只能通过 event log 重建；
- 消息编辑或撤回不能静默伪造从未发生过的历史，应保留明确的 retracted/revision 语义和必要原因。

## 12. DSH 集成方式

### 12.1 独立 Client 插件

Story Engine 浏览器侧插件负责：

- 注册侧边栏“文字游戏”入口。
- 管理普通聊天与游戏壳的可见模式。
- 渲染游戏库和完整游戏界面。
- 订阅 Story Engine 的会话投影和远程接口。
- 保持普通 DSH 组件不被修改。

DSH 的客户端插件采用专用 `dsh.client` bundle 格式。由于外置插件不能直接依赖 DSH 仓库内未发布的全部构建预设，本项目维护一层很薄的客户端构建适配，并通过配置把构建产物装入 DSH。不得为了方便直接修改 DSH 原版业务源码。

首版优先使用 DSH 已有的两个增量扩展位，不替换其单占的 `sidebar`、`conversation` 或 `root`：

- 在 `sidebar.footer.action` 注册“文字游戏”模式入口。
- 在 `shell.overlay` 注册游戏壳；非游戏模式返回空内容，游戏模式以覆盖整个 AppFrame 的不透明交互层呈现独立界面。

该方案使普通聊天组件在游戏模式下继续挂载，因此选中会话、滚动位置和草稿不会因切换而被销毁。游戏壳必须自行提供“返回普通聊天”操作。浮层处于活动状态时必须获得完整指针和键盘交互，隐藏时不得拦截普通界面事件。

如果实现验证证明上述扩展位无法满足无障碍、焦点隔离或布局要求，开发者应先记录可复现证据和最小上游扩展建议，不得未经确认直接修改 DSH 原版。

### 12.2 宿主侧插件

Story Engine 宿主插件负责：

- 内容包和存档权限边界。
- 结构化工具与参数校验。
- 持久化、检查点、版本锁、transaction journal、幂等 receipt 和事务提交。
- 面向客户端提供完整投影，不让浏览器自行猜测剧情状态。

### 12.3 故障隔离

- 游戏客户端插件加载失败时，DSH 普通聊天仍能启动。
- 游戏模式发生渲染错误时提供返回普通聊天操作。
- 后台模型或工具失败显示为游戏内非正史错误提示，不提交剧情消息。
- 数据迁移失败时以只读方式打开诊断，不自动覆盖旧存档。

## 13. 开源组件策略

首选方案是复用 DSH 的 React、插槽、运行时和基础组件，自行实现社交叙事视图。

可参考或局部采用：

- ChatScope Chat UI Kit：MIT，适合参考会话列表、消息列表、头像和输入布局。
- React Chat Elements：适合轻量聊天组件原型。
- assistant-ui：只参考 AI 交互与无障碍设计，不引入其聊天运行时。

不采用：

- Stream Chat 等依赖在线聊天服务的 SDK。
- Matrix／Element 等完整通信协议客户端。
- 未明确许可证的微信仿制项目、图标包和素材。

最终界面可以采用用户熟悉的社交软件结构，但不得复制微信名称、商标、官方图标、声音、素材或像素级设计。项目必须形成独立名称、主题和图标系统。

## 14. 实施阶段定义

本节定义阶段能力边界，不作为进度看板。阶段完成状态只在 `CURRENT_STATUS.md` 中维护。

### 阶段 A：界面壳与模式切换

- 默认启动普通聊天。
- 侧边栏文字游戏入口。
- 独立游戏库和游戏主界面壳。
- 返回普通聊天并恢复两侧界面状态。
- 使用模拟数据验证三栏布局。

阶段 A 不要求真实 AI、游戏存档、私人内容或 canonical message commit；它只证明外置 Client 插件装载、模式隔离和独立界面布局。

### 阶段 B：频道和消息域

- 人物、频道和结构化消息模型。
- 私聊、群聊、现场、工作和系统频道。
- 未读、草稿、置顶、滚动位置与重启恢复。
- 旁白、对白、行动、选择和派遣卡片。
- StorySaveProjection、宿主 revision 与客户端持久化队列。

### 阶段 C：Host 与 AI 桥接

- 每存档独立隐藏 DSH Session。
- 结构化 AI result 提取和校验。
- 流式临时预览与 committed canonical messages 分离。
- queued/running/waiting-choice/completed/failed/cancelled AI turn 生命周期。
- 用户取消、安全重试、刷新恢复、跨存档隔离和宿主冲突处理。
- 选择卡在游戏壳内回答并支持恢复。

### 阶段 D：连载玩法集成

- transaction-level journal、hidden turn references/active/canonical-result turn、core operation-level idempotency/receipts 和 durable recovery。
- 季、集、场景与频道联动。
- 工作内轻量输出和工作外详细剧情。
- 越界暂停、剧本修订、校验和恢复。
- 集末选择总结及下一集连续性。

### 阶段 E：公开发布质量

- 主题、头像资源、响应式布局和键盘操作。
- 无障碍、性能、长历史分页和存档迁移测试。
- 原创示例内容包和插件开发文档。
- 第三方许可证清单和发布审计。
- V1 兼容、升级迁移和 release gate 文档。

## 15. 首版验收标准

满足以下全部条件才可称为独立文字游戏界面 MVP：

1. DSH 启动后无需选择，直接进入普通聊天。
2. 侧边栏可以进入文字游戏并返回普通聊天。
3. 两个界面的当前项目、滚动位置和草稿相互隔离。
4. 普通会话列表不出现游戏人物、群组或剧情频道。
5. 一个游戏存档内可以切换至少一个私聊、一个群聊和一个现场频道。
6. 群聊中的每条 NPC 消息有确定的发送者、头像和存档记录。
7. 旁白、玩家行动、系统修订和工作派遣不会被误认成人物对白。
8. 重启后可以恢复频道、消息、未读状态和当前剧情位置。
9. AI 输出未经结构化校验时不能进入已玩正史。
10. 游戏插件失败时普通 DSH 聊天仍然可用。

## 16. 后续但非首版功能

- 频道搜索、消息搜索、收藏和引用回复。
- 动态头像、表情、图片、语音和视频。
- 剧情内定时消息和真正的后台异步事件。
- 多套布局主题与内容包自定义皮肤。
- 存档云同步或多人联机。
- 移动端原生壳。

以上功能不得阻塞模式隔离、结构化消息和确定性存档这三个核心目标。
