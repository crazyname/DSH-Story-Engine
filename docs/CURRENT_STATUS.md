# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-alpha.1`。
- 核心包 `dsh-story-engine`：`0.8.0-alpha.1`。
- 客户端包 `dsh-story-client`：`0.8.0-alpha.1`。
- 当前阶段：v0.8 阶段 A、B 已完成；阶段 C 部分完成；阶段 D、E 未完成。
- DSH 原版目录：`D:\DeepSeek-Harness`，仅作为依赖与运行环境，不修改源码。
- 项目目录：`D:\DSH-Story-Engine`。
- Git 基线：`main` 分支上的 `v0.8.0-alpha.1` 标签；具体提交以 `git rev-list -n 1 v0.8.0-alpha.1` 查询为准。

内容包、剧本和存档 Schema 有独立版本，不与产品版本强制相同：`pack.json`、`episode-script` 和 `ui/story-ui.json` 当前均使用 `schemaVersion: 1`；每个内容包的 `version` 由内容作者独立维护。

## 已完成能力

- V1 内容包加载、校验、安全安装、管理页面和制作向导。
- v0.7 连载式可执行剧本后端及 20 个通用 `story_*` 工具。
- 普通聊天默认启动，侧边栏进入独立文字游戏界面，两个模式状态隔离。
- 五类频道、结构化消息、人物、草稿、阅读游标和剧情位置投影。
- 宿主本地存档列表、读取、写入、删除与乐观版本锁。
- 动态内容包目录；缺少有效 `ui/story-ui.json` 的包只显示诊断，不允许新建。
- 内容包目录对 `ui/story-ui.json` 执行完整 Schema 对齐校验及人物、频道、消息、草稿和阅读游标的引用完整性检查；无效描述符显示具体诊断并禁用新建。
- 每份存档使用独立隐藏 DSH 会话；选择卡在游戏壳内回答。
- 待完成 AI 回合按存档持久化，长回合和页面刷新后可恢复。
- 另存为通过 DSH `session.fork` 和 Story Runtime 原子克隆创建独立分支。

## 尚未完成

- 阶段 C：流式临时预览仍未完成；AI 回合取消/重试状态机与隐藏会话孤儿诊断已完成。重试不会将原始玩家文本再次发送到隐藏会话。
- 阶段 D：季/集/场景与频道的完整自动联动、工作内轻量结算的正式界面、越界修订操作界面、集末总结界面。
- 阶段 E：无障碍、长历史分页、存档迁移矩阵、主题/头像、发布审计和第三方许可证清单。
- 存档重命名、覆盖保存、封面等游戏库细节。

## Dispatch 私人包状态

`packs/private/dispatch-personal-continuation` 已能被内容包目录发现，但目前缺少经过人工核对的 `ui/story-ui.json`，因此状态为“需诊断”，不能从游戏库新建。不得把原创示例包的人物、频道或开场复制给 Dispatch。

将它标记为可新建前，必须核对中文英雄名/本名、稳定人物 ID、玩家身份、频道成员、第一至第八集连续性、关系与结局状态、恋爱对象为“无人”、死亡状态，以及通关后的续作起点。

M1 的通用技术底座已补齐：目录会拒绝所有不满足 `story-ui.schema.json` 字段约束或引用完整性要求的描述符，并返回具体诊断。Dispatch 仍未提供 `ui/story-ui.json`；在私人资料中的人物本名与续作频道成员完成可追溯核对前，不能以该技术能力把它提前标为可新建。

## 验证基线

最近一次完整回归：核心 7 个测试文件共 20 项，客户端 11 个测试文件共 61 项；两端类型检查和生产构建通过。隔离浏览器验证覆盖动态目录、长回合刷新恢复和真正另存为。`D:\DeepSeek-Harness` 保持干净。

## 文档优先级

1. 本文件：当前事实和版本的唯一入口。
2. `NEXT_DEVELOPMENT_PLAN.md`：尚未完成的任务和验收顺序。
3. `DEVELOPMENT.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`SERIAL_GAMEPLAY_SPEC.md`：长期架构与产品契约。
4. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：数据和接口契约。
5. `STAGE_A_REPORT.md`、`STAGE_B_PROGRESS.md`、`V07_IMPLEMENTATION_REPORT.md`、`ZCODE_IMPLEMENTATION_HANDOFF.md`：历史记录，不作为当前任务清单。

Git 分支、提交、安全排除和验证要求见 `DEVELOPMENT.md` 的“Git 工作规范”。
