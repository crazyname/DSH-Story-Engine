# 零代码内容包制作向导

启动管理页面：

```powershell
pwsh -File D:\DSH-Story-Engine\manager.ps1
```

访问 `http://127.0.0.1:3091`，使用“新建自己的文字游戏”。

## 必填内容

- 游戏名称：玩家看到的标题。
- 内容包 ID：小写字母、数字和连字符，例如 `starport-embers`。
- 玩家角色：玩家拥有决定权的主要角色。
- 世界背景：时代、地点、势力、冲突和世界规则。
- 开场：第一次对话开始时正在发生的事情。

“其他人物”每行填写一人，使用 `名字 | 身份`：

```text
岑夏 | 星港维修师
贺寻 | 港务局调查员
```

## 自动生成内容

制作向导会在 `packs\private\<内容包ID>` 中生成：

- `pack.json`
- `world\overview.md`
- `characters\characters.json`
- `story\opening.md`
- `prompts\game-master.md`
- `runtime\initial-state.json`

玩家角色会自动加入人物表，并设置 `controlledBy: player`。AI 默认不得替玩家角色决定、说话、行动或描述内心。

生成过程使用临时目录；只有所有文件写入并通过内容包加载校验后才会发布。同 ID 内容包不会被覆盖。生成的包默认为 `Private-Use-Only`，不会自动上传或开源。

## 创建以后

重启 DSH，在新建对话时选择对应游戏。若要丰富内容，可以直接编辑生成的 Markdown 和 JSON 文件，再运行：

```powershell
cd D:\DSH-Story-Engine
npm run presets:sync
```
