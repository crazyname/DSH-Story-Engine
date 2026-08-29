# 当前开发状态

## 唯一状态基线

- 产品开发版本：`v0.8.0-beta.1`（GitHub 测试版）。
- 核心包 `dsh-story-engine`：`0.8.0-beta.1`。
- 客户端包 `dsh-story-client`：`0.8.0-beta.1`。
- 当前阶段：v0.8 阶段 A、B、C 已完成；阶段 D 开发中；阶段 E 未完成。
- DSH 原版目录：`D:\DeepSeek-Harness`，仅作为依赖与运行环境，不修改源码。
- 项目目录：`D:\DSH-Story-Engine`。
- Git 基线：`main` 分支上的 `v0.8.0-beta.1` 标签；标签后的已合并改动属于同一 beta 开发线，具体代码基线以当前 `main` 为准。

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
- AI 回合 `queued/running/waiting-choice/completed/failed/cancelled` 状态机、可验证临时预览、取消、重试、刷新恢复和按存档隔离均已完成；取消在进行中的 history 请求晚到后仍保持 `cancelled`。
- Stage C 故障验证已覆盖运行中取消、选择等待、断连、retry 去重、跨存档隔离和同 revision 并发写冲突；最新构建产物可重复构建并在真实 DSH 中完成 smoke。
- 另存为通过 DSH `session.fork` 和 Story Runtime 原子克隆创建独立分支。
- Stage D 第一事务切片已完成并合并：完成 AI turn 的 canonical social messages 使用真实 `turnId` 幂等提交；同 turn 同内容重放为 strict no-op，同 turn 不同内容冲突；宿主允许 identical same-revision projection replay，同时继续拒绝同 revision 的不同 stale content。
- Stage D 第一事务切片的真实 crash-window 已验证：宿主已经保存 AI canonical result、pending completed turn 尚未 acknowledge 时刷新恢复，不重复消息、不增加 projection revision、不再产生 409，最终 pending turn 被正常清除。

## 当前开发重点

阶段 D 当前重点是把已经验证的 social projection 幂等继续推进到 core runtime 和跨域恢复：

1. 顶层玩家提交/恢复流程使用稳定 `transactionId`；transaction journal 持久关联已知 hidden turn references、当前 active/pending turn 和最终 canonical-result `turnId`。
2. 同一 transaction 内每个可重试 core `story_*` canonical mutation 使用独立稳定 `operationId`、request fingerprint 和持久 receipt；一个 transaction 可以包含多个 operations。
3. 保持 optimistic `expectedVersion` 与 operation-level idempotency 两套保护：前者拒绝 stale writer，后者拒绝重复应用同一原子 mutation。
4. 建立 durable transaction journal / recovery 协调，使“部分 core operations 已提交但 social 未提交”等跨域中断能够逐步对账恢复，而不是盲目重放整个玩家回合；hidden dispatch 结果不确定时按实际 DSH correlation 能力进入 reconciliation，而不宣称传输层 exactly-once。
5. 在事务边界稳定后继续季/集/场景/频道联动、工作内轻量结算、越界修订界面和集末总结界面。

正式事务语义见 `TRANSACTION_AND_RECOVERY_SPEC.md`。

## 尚未完成

- 阶段 D：`transactionId` journal、hidden turn reference/recovery、core runtime child `operationId`/receipt、部分提交恢复与跨域 reconciliation。
- 阶段 D：季/集/场景与频道的完整自动联动、工作内轻量结算的正式界面、越界修订操作界面、集末总结界面。
- 阶段 E：无障碍、长历史分页、存档迁移矩阵、主题/头像、发布审计和第三方许可证清单。
- 1.0 前：V1 兼容承诺、版本/迁移政策、release checklist、公开安装与升级文档和正式发布包。
- 存档重命名、覆盖保存、封面等游戏库细节。

## Dispatch 私人包状态

`packs/private/dispatch-personal-continuation` 已能被内容包目录发现，但目前缺少经过人工核对的 `ui/story-ui.json`，因此状态为“需诊断”，不能从游戏库新建。不得把原创示例包的人物、频道或开场复制给 Dispatch。

将它标记为可新建前，必须核对中文英雄名/本名、稳定人物 ID、玩家身份、频道成员、第一至第八集连续性、关系与结局状态、恋爱对象为“无人”、死亡状态，以及通关后的续作起点。

这条私人内容包验证线不属于公开引擎 1.0 的阻塞依赖；公开版本不得包含 `packs/private` 或商业游戏资料。通用目录/Schema 技术底座已经完成，私人资料核对可以与公开引擎开发独立推进。

## 验证基线

当前已合并并由本地环境验证的最新基线：

- 核心：7 个测试文件、22 项测试通过；typecheck 与生产 build 通过。
- Client：13 个测试文件、78 项测试通过；typecheck 与生产 build 通过。
- v0.7 canon-integrity：`src/serial-integration.test.ts` 10 项通过。
- Stage C 浏览器故障矩阵：普通聊天回归、游戏库、公开示例存档、五频道、结构化 AI 回合、运行中取消、选择等待、断连、retry 去重、跨存档隔离和并发写冲突通过。
- Stage D 第一事务切片：story-domain 两项 AI turn 幂等测试、host-store identical replay / stale conflict 测试和真实 crash-window 浏览器验收通过。
- 重复 Client build 后 tracked artifacts 保持一致；`D:\DeepSeek-Harness` 工作树保持干净。

## 文档优先级

1. 本文件：当前事实和版本的唯一入口。
2. `NEXT_DEVELOPMENT_PLAN.md`：当前及后续里程碑和验收顺序。
3. `SERIAL_GAMEPLAY_SPEC.md`、`TEXT_GAME_SOCIAL_UI_SPEC.md`、`TRANSACTION_AND_RECOVERY_SPEC.md`：正式行为契约。
4. `DEVELOPMENT.md`：长期架构、版本路线和 Git 规范。
5. `CONTENT_PACK_V1.md`、Schema、`HOST_API.md`：内容、数据和宿主接口契约。
6. `STAGE_A_REPORT.md`、`STAGE_B_PROGRESS.md`、`V07_IMPLEMENTATION_REPORT.md`、`ZCODE_IMPLEMENTATION_HANDOFF.md`：历史记录，不作为当前任务清单。

Git 分支、提交、安全排除和验证要求见 `DEVELOPMENT.md` 的“Git 工作规范”。
