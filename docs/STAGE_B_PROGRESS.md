# 阶段 B 收尾记录（更新：真实模型端到端验证通过）

> 历史实施与纠偏记录，覆盖阶段 B 及阶段 C 的部分桥接工作。当前开发版本为 `v0.8.0-alpha.1`；唯一当前状态见 `CURRENT_STATUS.md`，后续任务见 `NEXT_DEVELOPMENT_PLAN.md`。

## 本次已完成

- 独立文字游戏界面已从阶段 A 的内存模拟消息升级为结构化游戏状态。
- 频道、参与者、消息、草稿、阅读游标、集/场景信息和版本号已有统一投影模型。
- 无标识输入默认为玩家对白；`(行动)`写入行动消息；`(系统)`写入待确认的系统消息，不能冒充已发生的世界事实。
- AI 消息进入界面前必须绑定频道和发送者，禁止 AI 以玩家身份发言，禁止向不属于频道的人物发消息。
- 宿主新增本地投影接口：`GET/PUT /story-engine/api/saves/<saveId>`，带请求体大小限制、同源写入检查和版本冲突返回。
- 浏览器存档通过宿主接口持久化，并以本地缓存作为启动期间的快速副本；写入按队列串行化。
- 内容包新增原创可玩示例 S1E1《雾潮提前抵达》，包含工作外场景、工作内简报、两次选择、线索和集末条件。
- DSH 用户 Preset 目录已安装项目 Preset 配置副本，实际内容仍由 Story Engine 项目维护；没有修改 DSH 原版源码。
- 已接入专用 AI 会话桥接设计：会话创建后归档，回复要求结构化 JSON，再经过发送者/频道校验后写入游戏消息。

## 真实模型端到端验证（2026-08-28 完成）

使用本机 DeepSeek API Key（余额验证可用）在隔离实例 3081 上跑通 S1E1 完整闭环：

### 验证通过的环节

1. **会话与 Preset**：`session.create` 使用 `story-lantern-station` Preset 成功，创建后归档，不进入普通聊天列表。
2. **开场 → 玩家输入 → 真实模型回合**：浏览器游戏壳发送玩家输入后，桥接创建隐藏会话并 `session.prompt` 排队；模型真实调用（`deepseek-v4-flash`），回合 70–100 秒正常结束。
3. **工具链完整性**：模型自主调用 16 个 `story_*` 工具且零错误：
   `story_read_state → story_get_pack_info → story_search_content → story_get_entity → story_list_episode_scripts → story_get_episode_script → story_initialize_episode_state → story_enter_episode_scene → story_present_choice → story_record_script_choice → story_enter_episode_scene → story_record_work_event ×2`，随后进入黎明场景并 `story_record_episode_summary`。
4. **选择闭环**：`story_present_choice` 通过 DSH 问题卡向玩家展示 S1E1 第一选择（检查主透镜裂纹 / 立即启动备用灯 / 追查昨夜访客），验证脚本经 `/api/respond` 回答后回合继续；第二选择（上报港务局 / 秘密调查）同样完成。
5. **工作内简报**：模型调用 `story_record_work_event` 记录两项值守事件（雾笛校准成功、渔船引导完美），工作内轻量结算符合规范。
6. **集末总结**：`story_record_episode_summary` 生成总结，包含 2 个已选选择、3 个未选选项、6 条后果和新调查线索；不泄露隐藏分支。
7. **状态落盘**：`runtime/lantern-station/<sessionId>/state.json` 的 `stateVersion` 递增，`currentSceneId` 依次推进 `s1e1-lantern-room → s1e1-dispatch → s1e1-dawn`，事件流完整。
8. **宿主存档持久化**：`GET /story-engine/api/saves/lantern-demo-save` 返回 revision 递增的投影，AI 结构化消息（旁白 `p-narrator`、对白 `p-hezhou`、工作简报 `p-system`）已写入，刷新后可恢复。

### 本次修复的问题

1. **工具输出非 lossless JSON**：`serial-state.ts` 的 `event()` 在 `content`/`metadata` 未传时仍保留 `undefined` 键，导致 `story_enter_episode_scene` 等返回的运行时状态被 DSH 判定为 `INVALID_TOOL_OUTPUT`（状态本身已正确落盘）。已改为仅在值存在时包含可选键，并新增回归测试断言所有事件键值非 `undefined` 且 JSON 往返无损。
2. **结构化 JSON 引号破坏**：模型在 `content` 字符串内使用未转义 ASCII 双引号（对白引用），使整段 JSON 无法解析并回退为单条旁白。两层修复：桥接 prompt 明确要求内容内使用中文引号；`parseMessages` 增加状态机引号修复器（区分内容引号与字符串定界符），解析失败时先修复再解析，仍失败才回退旁白。
3. **角色 ID 映射**：模型输出 `senderId: "narration"/"system"` 而引擎要求人物 ID。`parseMessages` 现在把角色名映射到投影中的 `p-narrator`/`p-system`。

### 验证结果汇总

- 根项目：类型检查通过，**20 项测试**通过，生产构建通过。
- 客户端：类型检查通过，**36 项测试**通过（含 4 个 AI 桥接用例：结构化解析、引号容错、叠引号、角色映射、回退旁白），生产构建通过。
- 示例剧本发现结果：`s1e1-fog-arrives`，全局引用与可达性检查通过。
- `D:\DeepSeek-Harness` 工作树仍保持干净。

## 选择卡 UI 已绑定（2026-08-28 补充）

之前"生成中但没反应"的真实原因是：`story_present_choice` 通过 DSH 用户问题卡机制提问，而问题卡渲染在普通聊天的 composer 区，被全屏游戏壳盖住——玩家看不到也无法回答，回合永远挂起。已修复：

- 新增 `client/story-ui/src/client/choice-bridge.ts`：游戏壳自开一条 mux 流，监听 `question/requested` 帧，直接使用帧自带的 `sessionId`（不依赖 ai-bridge 的会话是否已创建，保证刷新后 mux 重放的卡片能立即重现），点击后通过 `/api/respond` 回答（与 DSH 官方问题协议一致）。`respond` 返回的是裸 receipt（`{accepted}`），不经过 RPC `unwrap`——修复了点击选项时 `Cannot read properties of undefined (reading 'ok')` 的崩溃（回答实际已送达，但 receipt 解析崩溃导致卡片不消失）。
- 新增 `ChoiceCard.tsx` / `ChoiceCard.module.css`：游戏壳内的选择卡界面，支持单选/多选、选项描述、自由输入、确定按钮。
- `StoryGameShell` 订阅选择卡桥接，玩家回答时把选择作为 `choice` 消息写入宿主存档投影（`appendChoiceRecord`），再回答 DSH 问题让模型回合继续。
- 共享 `rpc-shape.ts` 统一 RPC 解包（仅用于 unary 方法；respond 单独处理）。
- 客户端测试增至 **41 项**（新增 5 个选择卡桥接用例：表面问题卡、刷新重放接受、respond 回答、resolved 清除、失效拒绝）。

浏览器 E2E 验证（真实模型）：发送玩家输入后，选择卡在游戏壳内出现（24–28 秒），玩家点击"检查主透镜裂纹"→ 确定 → 引擎记录 `choice:s1e1-first-priority`、结算两项工作事件、推进到黎明场景，宿主存档 revision 递增且包含 `p-player[choice]`，零 console 错误。刷新恢复场景（卡片未回答时刷新页面）验证通过：选择卡在重新进入游戏壳后立即重现并可回答。**"生成中没反应"问题已解决。**

## 游戏库与多存档 UI（2026-08-28 完成）

进入游戏模式现在先显示游戏库，不再硬编码 `lantern-demo-save` 作为默认入口：

- 宿主存档 API 增加列表端点：`GET /story-engine/api/saves`（无 id）返回全部存档摘要（`saveId`、`packId`、`packTitle`、`revision`、`updatedAt`、`sceneLabel`），按更新时间倒序；`StoryProjectionStore.list()` 枚举 `social-saves` 目录并跳过不可读/非 JSON 文件。
- 新增 `game-library.ts`：客户端已安装包目录（`INSTALLED_PACKS`，当前为雾海灯塔站）、按包分组（`groupSavesByPack`）、无存档包报告（`packsWithoutSaves`）、新存档 id 生成（`newSaveId`，host 安全字符）与新游戏投影工厂（`createNewGame`）。
- 新增 `StoryGameLibrary.tsx`：游戏库界面——每个包显示标题/作者/版本/状态/描述、已有存档的"继续游戏"列表、无存档包的"新游戏"入口；包级兼容诊断徽标；顶部"返回普通聊天"。
- `StoryGameShell` 增加 `screen: 'library' | 'game'`：进入游戏模式先刷新宿主存档列表并显示库；`继续游戏`从宿主加载投影（本地缓存兜底）；`新游戏`生成唯一 saveId 并创建初始投影；游戏内顶部栏新增"游戏库"返回按钮。
- 客户端测试增至 **48 项**（新增 5 个 game-library 用例 + 2 个 host-store 列表用例）；根项目 20 项不变。

浏览器 E2E 验证（3081）：进入游戏模式显示游戏库（包 + 存档 + 新游戏/继续游戏）→ 继续游戏进入游戏壳 → 游戏库返回按钮回到库 → 新游戏创建 `lantern-station-*` 新存档并进入游戏壳 → 宿主存档列表返回两个存档，零 console 错误。

## 手工验证问题修复（2026-08-28）

3080 手工验证报告 4 个问题，第一轮定位与修复如下；后续复核发现选择生命周期和超时恢复仍有缺口，最终修复见下方“纠偏复核”：

1. **新游戏后选择卡未出现**：AI 隐藏会话用单一 localStorage key（`dsh-story-ai-session`），新游戏复用了旧存档的会话和剧情状态。修复：会话 key 改为按存档隔离 `dsh-story-ai-session:<saveId>`，每个存档独立会话，新游戏从干净状态开始。
2. **选择卡出现后关闭/刷新找不到、剧情无法推进**：之前为支持刷新恢复移除了选择卡桥接的会话过滤，导致**其他存档残留的 pending 选择卡被 mux 重放污染当前游戏**。修复：`StoryChoiceBridge` 增加 `bindSave(saveId)`，只表面当前存档会话的问题卡；切换存档时清除外档残留卡。验证：新游戏后 6 秒内无外档卡片泄漏，自己的回合 17–30 秒正常出现选择卡。
3. **无法删除存档**：宿主 API 新增 `DELETE /story-engine/api/saves/<saveId>`（含同源检查），`StoryProjectionStore.remove()`；游戏库每行存档新增"删除"按钮（带 `confirm` 确认），删除后刷新列表并清除本地缓存。
4. **无法另存为存档**：新增 `cloneSave()`（深拷贝投影、重置 revision 为 0、新 saveId），游戏库"另存为"按钮复制当前进度为新存档并直接进入副本；宿主列表同步刷新。

客户端测试增至 **52 项**（新增：choice-bridge 跨存档隔离/bindSave 清除 3 项、game-library cloneSave 1 项、host-store remove 1 项、host-persistence delete 1 项）；根项目 20 项不变。

## 纠偏复核与第二轮修复（2026-08-28）

1. **刷新与跨存档隔离**：AI 会话映射改为每次按当前存档从 localStorage 恢复；选择桥接由单卡改为按会话保存的 pending 卡片表。切换存档只隐藏其他存档的卡，不再错误丢弃，mux 在先、存档绑定在后的刷新顺序也能重放。
2. **选择生命周期**：移除会造成回合永久悬挂的关闭按钮；只有 DSH 接受回答后才移除卡片并写入玩家选择。选择消息保留 `choiceId`，不再只留显示文字。
3. **异步回合归属**：生成状态按存档分别维护；即使玩家在模型运行期间切换存档，完成结果也只提交到发起回合的存档，不会覆盖当前打开的另一份存档。
4. **长回合与刷新恢复**：取消会丢失已完成结果的固定 120 秒超时，改为持久化 `dsh-story-ai-pending:<saveId>`（会话、基线序号、频道），前台最长等待 30 分钟，并在刷新后继续查询同一回合。真实模型回合超过 120 秒后，重新进入存档成功恢复 8 条 AI 消息，pending 标记自动清除，浏览器 console 零错误。
5. **真正的另存为**：另存为不再只复制 UI 投影；现在先调用 DSH `session.fork` 创建独立隐藏会话，再由宿主原子克隆 Story Runtime，并重写副本状态中的会话目录路径。实测源/副本 `stateVersion` 均为 7、`currentSceneId` 均为 `s1e1-dispatch`，副本后续可独立推进。
6. **去除界面硬编码**：频道、参与者、当前画面、包标题与 AI Preset 均从存档投影/内容包定义读取；客户端不再用雾海灯塔站的静态人物和频道渲染所有内容包。
7. **动态内容包目录**：宿主通过 `GET /story-engine/api/catalog` 递归发现 `pack.json`。只有带 `ui/story-ui.json` 且通过校验的包可新建游戏；缺少描述文件的包显示“需诊断”并禁用新建，避免错误套用示例人物、频道和开场。原创雾海灯塔站已就绪；Dispatch 私人包已被发现，但当前保持诊断状态。

最终验证：根项目类型检查、**20 项测试**与生产构建通过；客户端类型检查、**61 项测试**与生产构建通过；隔离实例 3081 完成动态目录、新游戏、长回合刷新恢复、真正另存为及运行时克隆的浏览器复核。

## 未分组对话出现"工具调用被中断"提示的诊断（2026-08-28）

现象：DSH 普通聊天工作区的"未分组"（归档）对话历史里出现 `OUT / The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown.` 提示，且没有输出。

诊断结论：**这是开发过程的遗留痕迹，不是当前产品的 bug。**

- 该提示是 DSH 在工具调用被中断时给 agent 的 `TOOL_OUTCOME_UNKNOWN` 返回，伴随 `turn/end reason: interrupted`。
- 排查全部 9 个归档会话：3 个带中断标记（`3d1dcbb0`、`77850188`、`4e0a4a4d`），全部发生在 **18:37 / 19:45 / 19:56 的开发测试时段**——当时正在等待 `story_present_choice` 选择卡回答的回合，被**反复重启 3081/3080 实例**打断。`dd424dd8` 等其余会话回合完整（`turn/end` 正常）。
- 这些会话已归档，不在 `session.list` 活动列表里，仅作为历史记录保留。
- 当前引擎健康验证：新建会话调用 `story_read_state` 后回合正常结束、零工具错误、零中断。

处理建议：刷新页面后，普通聊天列表不应再显示这些已归档调试会话；若仍有残留，直接删除对应对话即可（它们不含有效游戏进度）。这些调试会话与玩家真实存档（宿主 `social-saves`）完全分离，删除不影响游戏。

## 尚未宣称完成的部分

- Dispatch 私人内容包的 `pack.json` 已能被动态目录发现，但尚缺专用 `ui/story-ui.json`，因此当前明确标记为“需诊断”，不能从游戏库新建存档。必须先人工核对中文英雄名、人物 ID、频道成员、开场状态和通关后续起点，不能拿示例包配置代替。
- 存档重命名、覆盖保存、包封面图等游戏库细节尚未实现（当前为文本卡片列表）。
- DSH 当前没有与 `session.fork` 对称的可靠会话删除接口；删除 Story Engine 存档不会删除已归档的隐藏 DSH 会话，可能留下不可见的历史会话数据。

## 推荐的下一次工作

为 Dispatch 私人包制作并人工核对 `ui/story-ui.json`（中文英雄名、稳定人物 ID、频道与成员、通关后开场画面），再在 3080 常规实例做安装前验证：游戏库 → 新游戏 → 真实模型对话 → 选择 → 回到游戏库 → 另存为/删除 → 继续游戏恢复进度。只有这一步通过后才将 Dispatch 标记为可新建。
