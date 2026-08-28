# v0.7 实施报告：连载式可执行剧本

> 历史版本交付记录。v0.7 后端能力继续包含在当前 `v0.8.0-alpha.1` 中；当前状态见 `CURRENT_STATUS.md`。

## 结论

v0.7 已完成。此前未完成的草稿实现已重建为可编译、可测试的正式实现，并保持 v0.6 内容包和 10 个通用工具兼容。DSH 原版目录没有被修改。

## 已实现能力

- 从内容包的 `story/episodes/**/*.json` 发现分季分集剧本；没有该目录的旧内容包仍可正常使用。
- 严格检查剧本元数据、场景、2–4 项选择、工作场景、修订信息、全局 ID、场景引用和可达性。
- 将 `sourceCanon`、`authoredScript`、`playedCanon` 分层保存；通用状态提交不能覆盖这些保护层。
- 所有状态变更要求 `expected_version`，同一版本的并发写入只允许一次成功。
- 场景推进前自动创建检查点；支持列出和恢复本会话检查点。
- 玩家选择必须属于指定正式场景，已选项、自由输入和后果写入已玩正史。
- 普通工作内事件只记录事件名、派遣人员、结果和状态效果；死亡、永久改变、主线、道德、感情、重大伤势或灾难会在落盘前被升级为工作外场景。
- 实质性越界会保存原始输入并暂停。修订必须提交完整剧本、通过格式和引用校验、使用更高版本号，并且只能写入当前会话的运行时修订目录；失败不会改变暂停状态或污染剧本。
- 集末总结由引擎依据真实记录计算已选和当时未选的重要选项，保留自由输入及公开后果，不接受调用方伪造未选项，不输出联网比例、秘密或隐藏分支。

## 工具清单

v0.6 兼容工具：`story_get_pack_info`、`story_search_content`、`story_get_record`、`story_get_entity`、`story_read_state`、`story_commit_state`、`story_create_checkpoint`、`story_list_checkpoints`、`story_advance_scene`、`story_present_choice`。

v0.7 工具：`story_list_episode_scripts`、`story_get_episode_script`、`story_validate_episode_scripts`、`story_initialize_episode_state`、`story_enter_episode_scene`、`story_record_script_choice`、`story_record_work_event`、`story_pause_for_revision`、`story_submit_script_revision`、`story_record_episode_summary`。

## 验证范围

- 根项目 TypeScript 类型检查、单元/集成测试和生产构建。
- 独立文字游戏客户端的类型检查、测试和生产构建。
- 原始 DSH 工作树状态检查。
- 剧本发现、无剧本旧包兼容、引用错误、不可达场景、状态保护、并发版本冲突、真实选择总结、无效/有效修订流程。

## 边界

v0.7 提供可执行剧本和正史状态后端，不负责预先创作某个商业游戏的续篇文本，也不把未经确认的存档推断写成事实。独立社交式游戏界面仍由客户端阶段继续接入这些工具。
