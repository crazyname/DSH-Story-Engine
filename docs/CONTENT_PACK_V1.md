# 内容包 V1 规范

## 必需文件

每个内容包根目录必须包含 `pack.json`。清单必须声明：

- `schemaVersion`：固定为 `1`。
- `id`：2–64 位小写字母、数字或连字符。
- `name`、`version`、`language`、`license`。
- `player.controlledCharacters`：至少一个玩家控制角色。
- `player.aiMayControlPlayer`：是否允许 AI 控制玩家角色，推荐为 `false`。
- `modules`：启用的可选游戏模块。
- `content.initialState`：初始状态 JSON 路径。

## 内容目录

`content` 可以声明：`world`、`characters`、`lore`、`mechanics`、`story` 和 `gameMasterPrompt`。每项可以指向单个文件或目录，目录会递归读取。

V1 支持：

- `.md`：叙述性设定和主持规则。
- `.json`：人物、地点、机制和结构化事件。
- `.jsonl` / `.ndjson`：每行一个独立 JSON 记录；适合完整台词库和大型剧情资料。搜索返回记录 ID，`story_get_record` 可按 ID 读取未截断原文。
- `.txt`：简单文本资料。

其他扩展名会被忽略。路径必须位于包目录内，绝对路径和 `../` 越界最终都会被拒绝。

## 初始状态

初始状态必须是 JSON 对象。推荐字段：

```json
{
  "campaign": { "scene": "opening", "turn": 0 },
  "world": {},
  "relationships": {},
  "resources": {},
  "activeMissions": [],
  "openThreads": [],
  "flags": {},
  "history": []
}
```

模块可以扩展状态，但不得覆盖引擎维护的状态版本、会话所有权和检查点元数据。

## 许可证和来源

`license` 不能省略。开源仓库只接受原创、公共领域或有明确再发布授权的内容包。用户可以在 `packs/private` 使用合法持有但不可再发布的私人资料；引擎不会因此赋予其传播权。

## 可选文字游戏界面描述

需要从独立文字游戏界面的“游戏库”直接新建存档时，内容包应提供 `ui/story-ui.json`。当前界面描述的 `schemaVersion` 固定为 `1`，用于声明初始投影，而不是替代 `pack.json`、剧情脚本或运行时状态。

正式机器校验格式见 `schemas/story-ui.schema.json`。目录加载器必须按该 Schema 校验全部必填字段和禁止的额外字段；它还必须校验唯一玩家角色、人物、频道和消息之间的 ID 引用、频道成员资格、频道最后消息、草稿／阅读游标和 `selectedChannelId`。任一项失败时，游戏库显示具体“需诊断”原因且禁用新建，不能退化为仅检查顶层数组。

建议字段包括：

- `participants`：人物稳定 ID、中文显示名、类型和简介。
- `channels`：私聊、群聊、现场、工作、系统等频道及成员 ID。
- `selectedChannelId`：新游戏默认打开的频道。
- `messages`：开场消息，可为空。
- `drafts`、`readCursors`：各频道初始草稿与阅读位置，可为空对象。
- `frame`：初始季、集、场景 ID 与中文场景标题。

界面描述缺失不会阻止核心 Story Engine 读取内容包，但游戏库会把该包标为“需诊断”并禁用新建。这样可以防止把另一个内容包的示例人物、频道或开场错误套入当前作品。私人商业作品内容包应在本地补齐并人工核对该文件，不应把受版权保护的资料提交到开源仓库。
