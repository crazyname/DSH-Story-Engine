# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-beta.1`（GitHub 测试版）。
- 核心包 `dsh-story-engine`：`0.8.0-beta.1`。
- 客户端包 `dsh-story-client`：`0.8.0-beta.1`。
- 当前阶段：v0.8 阶段 A、B、C 已完成；阶段 D 开发中；阶段 E 未完成。
- DSH 原版目录：`D:\DeepSeek-Harness`，仅作为依赖与运行环境，不修改源码。
- 项目目录：`D:\DSH-Story-Engine`。
- Git 基线：`main` 分支上的 `v0.8.0-beta.1` 标签；具体提交以 `git rev-list -n 1 v0.8.0-beta.1` 查询为准。

内容包、剧本和存档 Schema 有独立版本，不与产品版本强制相同：`pack.json`、`episode-script` 和 `ui/story-ui.json` 当前均使用 `schemaVersion: 1`；每个内容包的 `version` 由内容作者独立维护。

## 已完成能力

- V1 内容包加载、校验、安全安装、管理页面和制作向导。
- v0.7 连载式可执行剧本后端及 20 个通用 `story_*` 工具。
- v0.7 正史完整性加固：选择只能写入当前实际游玩的 episode/scene；集末 `completedScenes` 只来自真实 `scene_entered` 历史，未游玩 authored branch 不进入 played canon。
- 普通聊天默认启动，侧边栏进入独立文字游戏界面，两个模式状态隔离。
- 五类频道、结构化消息、人物、草稿、阅读游标和剧情位置投影。
- 宿主本地存档列表、读取、写入、删除与乐观版本锁；同一存档进程内写入串行化，冲突写不会 lost update。
- 动态内容包目录；缺少有效 `ui/story-ui.json` 的包只显示诊断，不允许新建。
- 内容包目录对 `ui/story-ui.json` 执行完整 Schema 对齐校验及人物、频道、消息、草稿和阅读游标的引用完整性检查；无效描述符显示具体诊断并禁用新建。
- 每份存档使用独立隐藏 DSH 会话；选择卡在游戏壳内回答。
- AI 回合 queued/running/waiting-choice/completed/failed/cancelled 状态机、可验证临时预览、取消、重试、刷新恢复和按存档隔离均已完成；取消在进行中的 history 请求晚到后仍保持 `cancelled`。
- Stage C 故障验证已覆盖运行中取消、选择等待、断连、retry 去重、跨存档隔离和同 revision 并发写冲突；最新构建产物可重复构建并在真实 DSH 中完成 smoke。
- 另存为通过 DSH `session.fork` 和 Story Runtime 原子克隆创建独立分支。

## 尚未完成

- 阶段 D：跨隐藏 DSH、social projection 与 core runtime 的事务/幂等边界仍需完整收紧；当前第一切片已经实现“已完成 AI turn 的 canonical social 消息提交幂等”和宿主 identical replay，源码与跟踪 node/client 产物已同步，尚待本地自动测试与 crash-window 浏览器验收。之后还需为会修改 core runtime 的 `story_*` 操作建立独立幂等/恢复契约。
- 阶段 D：季/集/场景与频道的完整自动联动、工作内轻量结算的正式界面、越界修订操作界面、集末总结界面。
- 阶段 E：无障碍、长历史分页、存档迁移矩阵、主题/头像、发布审计和第三方许可证清单。
- 存档重命名、覆盖保存、封面等游戏库细节。

## Dispatch 私人包状态

`packs/private/dispatch-personal-continuation` 已能被内容包目录发现，但目前缺少经过人工核对的 `ui/story-ui.json`，因此状态为“需诊断”，不能从游戏库新建。不得把原创示例包的人物、频道或开场复制给 Dispatch。

将它标记为可新建前，必须核对中文英雄名/本名、稳定人物 ID、玩家身份、频道成员、第一至第八集连续性、关系与结局状态、恋爱对象为“无人”、死亡状态，以及通关后的续作起点。

M1 的通用技术底座已补齐：目录会拒绝所有不满足 `story-ui.schema.json` 字段约束或引用完整性要求的描述符，并返回具体诊断。Dispatch 仍未提供 `ui/story-ui.json`；在私人资料中的人物本名与续作频道成员完成可追溯核对前，不能以该技术能力把它提前标为可新建。

## 验证基线

最近已合并并由本地环境验证的基线：核心 7 个测试文件共 22 项通过，客户端 13 个测试文件共 76 项通过；核心与客户端类型检查、生产构建通过。Stage C 真实浏览器验证覆盖普通聊天回归、游戏库、公开示例存档、五频道、结构化 AI 回合、运行中取消、选择等待、断连、retry 去重、跨存档隔离和并发写冲突；重复 Client build 的跟踪产物 SHA-256 稳定一致。随后 v0.7 canon-integrity 回归通过，`src/serial-integration.test.ts` 10 项测试全部通过。`D:\DeepSeek-Harness` 保持干净。

当前 Stage D 开发分支新增测试及浏览器 crash-window 验收尚未计入上述已验证基线，必须在合并前单独验证。

## 文档优先级

1. 本文件：当前事实和版本的唯一入口。
2. `NEXT_DEVELOPMENT_PLAN.md`：尚未完成的任务和验收顺序。
3. `DEVELOPMENT.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`SERIAL_GAMEPLAY_SPEC.md`：长期架构与产品契约。
4. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：数据和接口契约。
5. `STAGE_A_REPORT.md`、`STAGE_B_PROGRESS.md`、`V07_IMPLEMENTATION_REPORT.md`、`ZCODE_IMPLEMENTATION_HANDOFF.md`：历史记录，不作为当前任务清单。

Git 分支、提交、安全排除和验证要求见 `DEVELOPMENT.md` 的“Git 工作规范”。
