# Visual Asset System 规范

## 1. 文档状态

本文定义 Story Engine 视觉资产的长期产品边界与版本演进方向，覆盖人物头像、立绘、聊天背景、场景图和剧情 CG。

本文只定义产品/架构契约，不表示相关代码已经实现。实时开发状态仍以 `CURRENT_STATUS.md` 为准，实施顺序以 `NEXT_DEVELOPMENT_PLAN.md` 为准。

核心原则：

- 视觉资产不能成为 gameplay canonical truth 的替代来源。
- 人物、服装、伤势、地点、时间等用于生图的事实必须来自允许公开给视觉系统的 canonical state / authored visual metadata。
- 未游玩分支、未发现秘密、角色未知信息和不应向玩家泄漏的 authored 内容不得通过 Prompt 或生成图片提前暴露。
- 上层只引用稳定 `visualAssetId`，不得把本机绝对路径、厂商 URL 或具体模型名写进人物/剧情核心领域模型。

## 2. 资产类型

首批视觉资产至少覆盖：

- `avatar`：聊天头像、小尺寸人物标识。
- `portrait`：人物正式立绘或较高分辨率角色图。
- `background`：聊天/场景背景。
- `scene-cg`：重大剧情、事件或场景插图。

后续可以增加物品、地图、Logo、UI theme 等类型，但不得为了未来功能提前扩大 v1.0 实现范围。

## 3. 统一资产模型

长期数据模型至少需要表达：

```ts
interface VisualAsset {
  id: string
  kind: 'avatar' | 'portrait' | 'background' | 'scene-cg'
  source: 'pack' | 'imported' | 'generated'
  ownerScope: 'pack' | 'save' | 'creator'
  contentRef: string
  prompt?: string
  provider?: string
  model?: string
  referenceAssetIds?: string[]
  createdAt?: string
}
```

以上字段是方向性结构，不冻结具体 Schema。实现时可以调整命名，但必须保留以下语义：

1. 逻辑资产 ID 与物理文件/URL 分离。
2. 记录资产来源，区分内容包、手工导入和模型生成。
3. 生成资产可以追溯 Prompt 和必要的 reference asset，但不得把 API key 等凭据写入资产元数据。
4. Player/Creator 共享同一资产模型，不为两个表面复制数据格式。

人物、频道或场景只保存逻辑引用，例如：

```text
participant.avatarAssetId -> VisualAsset
scene.backgroundAssetId   -> VisualAsset
```

不得把 `D:\...\image.png` 直接作为人物长期领域字段。

## 4. v1.0 Personal 工作流

v1.0 不直接调用任何在线图片生成 API。

### 4.1 本地图片导入

个人版允许用户为自己的存档/内容包导入本地视觉素材，包括头像、背景、立绘和场景图。

导入必须满足：

- 不把源文件绝对路径写入可移植的内容/存档核心契约。
- 导入后由 Story Engine 的受控资产存储/引用层管理，避免原文件移动后整个存档失效。
- 不允许路径穿越、越出允许资产根目录或通过特殊文件读取任意本机文件。
- 私人/不可再发布图片不得进入公开 Git、示例包或测试 fixture。
- v1.0 本地导入是 Personal convenience，不代表 2.0 普通 Player 必须暴露同一入口。

### 4.2 Visual Prompt Builder

v1.0 提供“导出生图 Prompt”的能力，而不是直接生图。

Prompt Builder 输入可以包括：

- 角色稳定视觉身份：年龄段、发型、发色、面部特征、体型、标志性细节。
- 当前可见状态：服装、伤势、情绪、姿态。
- 场景：地点、时间、天气、光线、环境。
- 画面要求：构图、镜头、风格、背景、尺寸用途。
- 连续性约束：需要保持不变的人脸/发型/服装/标记。

Prompt Builder 必须经过可见性过滤：

- 不输出 `authored_script` 中尚未发生的秘密和反转。
- 不把 NPC 内心事实、隐藏身份等内容仅因为模型“知道”就写进玩家可见 Prompt。
- `(系统)` 指令或调试信息不能自动变成世界内视觉事实。

典型 v1.0 流程：

```text
Story canonical / visual state
        ↓
Visual Prompt Builder
        ↓
导出 Prompt
        ↓
用户在外部生图产品中生成
        ↓
导入 Story Engine
        ↓
VisualAsset(imported)
```

### 4.3 v1.0 明确不做

- 不接 Gemini / OpenAI / 其他图片 API。
- 不保存线上 Provider API key。
- 不做自动扣费、Credits、重画付费。
- 不要求内容作者准备完整商业美术资产流水线。
- 不因为没有图片阻止纯文字游戏正常运行。

## 5. v1.x 架构过渡

v1.x 建立 2.0 需要的抽象，但不要求立刻把在线生图作为默认玩家功能。

### 5.1 Visual Asset Manager

职责：

- 通过稳定 ID 解析资产。
- 管理内容包资产、存档生成资产和 Creator 导入资产。
- 缓存已生成/已导入结果，避免每次渲染都重新生产图片。
- 管理变体与 reference asset 关系。
- 对缺失、损坏和不兼容资产 fail-safe，不影响 canonical gameplay state。

建议解析优先级由具体产品模式决定，但不能依赖本机路径作为身份。一个合理方向是：

```text
save-local selected/generated asset
        ↓
pack canonical asset
        ↓
runtime generated fallback
        ↓
system placeholder
```

v1.0 的个人 imported override 可以作为 Personal profile 的额外优先层；2.0 普通 Player 不需要暴露这项入口。

### 5.2 Image Provider Port

上层调用能力 profile，而不是具体厂商：

```text
image-fast
image-quality
image-edit
```

Provider adapter 再映射到实际模型。Gameplay/UI 代码不得写死例如 `gemini-*`、`gpt-image-*` 等模型名。

Image Provider 必须支持取消、超时、失败诊断和可重试边界；生成失败只影响视觉展示，不得回滚已经合法提交的剧情 canonical state。

### 5.3 Model Router

图片能力与文本模型路由使用同一“任务 profile → provider/model”思想。

文本长期至少可以区分：

- `simulation`：小事件、低成本模拟。
- `state`：状态整理/摘要。
- `dialogue`：普通 NPC 对话。
- `narrative`：重大场景文本。
- `planning`：剧情规划。
- `audit`：剧本/连续性审查。
- `image`：视觉生成/编辑。

具体供应商和价格属于配置/产品策略，不进入 gameplay contract。

## 6. v2.0 Public Product 工作流

v2.0 的普通 Player 必须在不手工准备图片的情况下直接可玩。

### 6.1 默认视觉来源

角色/场景需要视觉资产时：

1. 内容包若已有 Creator 提供的原创/授权 canonical asset，优先使用。
2. 没有可用资产时，允许通过 Image Provider 自动生成默认图片。
3. 第一次生成成功后持久缓存并复用，不在每次打开频道时重新生成。
4. 需要服装、情绪、伤势、昼夜等变体时，尽量基于稳定 visual identity/reference asset 生成，而不是无条件从纯文字随机重画。
5. Provider 失败时显示已有资产或 placeholder；游戏本身仍可继续。

### 6.2 Player Surface

2.0 普通 Player：

- 默认生成或使用内容包已有头像/背景，不要求上传图片。
- **不提供 v1.0 Personal 的“从本机导入自己的照片/图片作为常规玩家入口”。**
- 上述移除只发生在 Player 产品表面；底层 `source: imported` 继续存在，因为 Creator 仍需要它。
- 可以允许玩家重新生成、选择候选、编辑风格或创建变体，但免费额度、Credits、价格和支付规则由商业产品层决定，不在本规范固定。

### 6.3 Creator / Studio Surface

Creator 必须可以：

- 导入自己原创、已授权或允许再发布的头像、背景、CG 等素材。
- 为角色设置 canonical visual identity/reference assets。
- 调用 Image Provider 生成候选、变体和编辑结果。
- 将选中的资产写入内容包或 Creator asset library。
- 从 Creator 视图直接进入 Player 测试，检查资产在实际剧情/频道中的效果。

Creator 导入不意味着 Story Engine 获得素材传播权。公开内容包仍必须遵循 `pack.json` license 和仓库再发布规则。

## 7. 生成触发原则

视觉生成不应该对每条聊天消息自动调用模型。

适合触发：

- 新主要角色第一次需要头像且没有 pack asset。
- 角色视觉身份发生明确、长期、玩家可见的变化。
- 进入重要新地点且需要背景。
- 重大剧情节点需要 scene CG。
- 玩家/Creator 明确请求重画或变体。

不适合触发：

- 每次打开频道。
- 每句普通对白。
- canonical state 没有视觉变化时仅为了“刷新”。
- 依赖未发生剧情或隐藏信息的提前生成。

## 8. 缓存与连续性

- 生成成功的视觉资产视为持久素材，不是一次性 UI response。
- 资产重新生成必须产生新资产/版本，不应静默覆盖旧文件导致存档不可审计。
- 角色 identity reference 应能跨服装、场景和表情变体复用。
- 图片本身不反向修改 canonical gameplay state。若图片与文字状态冲突，以 Story Runtime / played canon 为准。
- Save As / fork 对视觉资产的复制或共享策略需要与未来资产存储设计一起确定；不能让 fork 修改另一存档的独立生成资产。

## 9. Provider、隐私与成本边界

- v1.0 本地导入素材不自动上传给任何第三方模型。
- 2.0 Creator 对 imported image 发起在线编辑/参考生成时，产品必须明确这是向配置的 Provider 发送图片数据；具体隐私提示和 Provider policy 在 Public Release 阶段审计。
- API key 不进入内容包、存档、Prompt、资产元数据或 Git。
- 图片生成成本由 Provider/Model Router 和产品层管理，核心 gameplay 不直接维护价格。
- Player 重画的付费/额度设计可以建立在 Visual Asset System 上，但不得通过降低首张默认图质量来制造强制付费。

## 10. 与版本路线的关系

```text
v1.0 Personal
Local Import + Prompt Export
        ↓
v1.x
VisualAsset + PromptBuilder + ModelRouter + ImageProvider Port
        ↓
v2.0 Public
Default Model Generation + Cache
Player no local-import surface
Creator retains authorized import
```

该路线的目标是让 v1.0 的手工“生成 → 导入”与 v2.0 的自动 `ImageProvider.generate()` 共用同一资产/Prompt 基础，而不是在 2.0 重写人物、场景和 UI 数据模型。