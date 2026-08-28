# 阶段 A（界面壳与模式切换）交付报告

> 历史交付记录：阶段 A 已完成。本文保留当时的限制和决策问题作为审计资料，不代表当前缺陷或下一步任务。当前状态见 `CURRENT_STATUS.md`。

## 1. 实现结果与用户可见行为

### 启动行为
- DSH 启动后直接进入原有普通 AI 聊天界面，无任何启动模式选择页。
- 侧边栏底部新增「文字游戏」入口：宽侧栏显示“Play 图标 + 文字游戏”按钮，折叠侧栏仅显示图标（aria-label="文字游戏"）。
- 默认状态：`gameMode = false`，刷新或重新启动后始终回到普通聊天。

### 模式切换
- 点击侧边栏「文字游戏」进入游戏模式：
  - 覆盖层对话框完整显示三栏布局（左频道列表 / 中消息区 / 右详情面板）。
  - 头部显示当前频道名称、季/集/场景信息、返回普通聊天按钮。
  - 左栏显示示例包「灯塔与夜巡」下的频道：私聊、群聊、现场、工作、系统。
  - 中栏显示所选频道的结构化消息（气泡、旁白、系统、选择卡、工作简报）。
  - 右栏显示频道类型、成员（头像圆形首字母）、当前位置。
  - 输入框用于输入对白（阶段 A：仅本地演示，不会发送给模型）。
- 点击「返回普通聊天」或按 Esc 键：
  - 游戏壳立即隐藏，普通聊天界面完全恢复。
  - 之前选中的普通会话、阅读位置和输入草稿保持不变（未销毁）。

### 频道与草稿隔离
- 频道切换不泄漏草稿：每个频道的输入框内容在切换频道后保留。
- 模拟数据验证：5 个频道、22 条消息、6 位参与者（含玩家）。
- 三种频道类型展示：私聊、群聊、现场、工作、系统均通过正确的消息类型渲染。

### 窄屏与焦点隔离
- 宽屏下三栏并列；窄屏下左右栏可通过顶部按钮切换为抽屉。
- 游戏壳激活时，对 AppFrame 的三栏列（sidebar、conversation、details）设置 `inert` 和 `aria-hidden`，完全隔离键盘与屏幕阅读器焦点。
- 游戏壳隐藏时立即移除 `inert`，普通聊天的交互完全恢复。

### 刷新与状态恢复
- 页面刷新后默认回到普通聊天，`gameMode = false`。
- 刷新前在游戏壳内的状态（选中频道、草稿、面板开关）因仅存在于内存中而丢失（符合阶段 A 不持久化约定）。

## 2. 新增与修改的文件

### 新增文件（全部在 D:\DSH-Story-Engine 内）
```
client/story-ui/package.json
client/story-ui/tsconfig.json
client/story-ui/tsdown.config.mjs
client/story-ui/src/index.ts                           # Node half（空 apply）
client/story-ui/src/css-modules.d.ts
client/story-ui/src/client/index.ts                  # Browser half：slots.inject 注册
client/story-ui/src/client/mode.ts                    # 模式控制器 + HostObservable
client/story-ui/src/client/mock-data.ts              # 原创模拟数据（参与者/频道/消息）
client/story-ui/src/client/view-state.ts             # 纯函数视图状态（不依赖 React）
client/story-ui/src/client/StoryGameAction.tsx        # 侧边栏入口组件 + CSS Modules
client/story-ui/src/client/StoryGameShell.tsx          # 游戏壳组件（三栏布局 + 焦点隔离） + CSS Modules
client/story-ui/test/mode.test.ts                    # 单元测试（控制器）
client/story-ui/test/view-state.test.ts              # 单元测试（视图状态）
client/story-ui/test/mock-data.test.ts                # 单元测试（数据不变量）
```

### 修改文件
- `harness.patch.yml`：新增一条 insert 行，注册客户端插件 `dsh-story-client`。
- `setup-links.ps1`：扩展链接逻辑，为项目添加 TypeScript/React 类型与 DSH UI 包、为 DSH home 的 profiles/node_modules 添加 `dsh-story-client` 指向项目插件目录（使用 PS resolve 动态定位 react/@types/react）。
- `package.json`：新增脚本 `typecheck:client` / `test:client` / `build:client`；`start.ps1` 修改为在启动前先构建客户端包。
- `README.md` / `LICENSE`：无变更（项目根已有）。

### 构建产物（Git 之外，由脚本生成）
```
client/story-ui/lib/index.js          # Node half ESM（导出空 apply）
client/story-ui/lib/client.js         # Browser half CJS（closure-factory 包装）
client/story-ui/lib/client.js.map
src/*.ts → dist/*.js（主项目编译）
```

## 3. Client 插件如何构建并被 DSH 发现

### 构建
- **工具链**：使用 Harness 的 `tsdown`（rolldown）与 `lightningcss`（CSS Modules），通过项目自己的 `tsdown.config.mjs` 驱动，无需修改 DSH。
- **输出格式**：
  - `lib/index.js`：ESM，包含空 `apply()`，Loader 导入 Node half。
  - `lib/client.js`：CJS，包含 closure-factory 包装的浏览器 bundle：
    ```js
    window.__ModuleLoader__.load({ id: "dsh-story-client", factory: (require) => {
      var module = { exports: {} }; var exports = module.exports;
      // ... 捆绑代码 ...
      return module.exports;
    } });
    ```
  - `cssModules` 由 lightningcss 转换为 JS 模块：注入 style tag 并导出 class 映射对象。

### 装载与发现
- **patch 机制**：`start.ps1` 调用 `dsh web --patch harness.patch.yml`。patch 顶层为 YAML 数组，包含 insert 行：
  ```yaml
  - insert:
    - id: story-ui
      name: dsh-story-client
  ```
- **模块扫描**：DSH 的 ClientModuleRegistry（`packages/client/modules/src/index.ts`）从 loader 图中扫描行名为 `dsh-story-client` 的 `dsh.client` 声明。
- **解析锚点**：Loader 的 `resolveMeta` 从 `ctx.baseUrl`（即 `$DSH_HOME/profiles/web`）开始，`require.resolve('dsh-story-client/package.json')` 解析到 `D:\DSH-Story-Engine\client\story-ui`。
- **junction 决定可解析性**：`setup-links.ps1` 在 `$DSH_HOME/profiles/node_modules` 创建 Junction `dsh-story-client → D:\DSH-Story-Engine\client\story-ui`，Node 父级目录查找发现该包。
- **Bundle 服务**：ClientModuleRegistry 注册 `/plugins/<id>/client.js?rev=<hash>` 路由，从包的 `lib/client.js` 提供字节。
- **预加载与执行**：browser shell 将 bundle 预加载到 module table，`__ModuleLoader__.load()` 在运行时执行 factory，并调用 `apply(ctx)` 注册 slots。

## 4. 自动测试与手动验证结果

### 自动测试
- **根项目**：
  - `npm run typecheck`：通过（基于 Harness TSC）。
  - `npm test`：6 个测试文件，12 个测试全部通过（Story Engine 原有功能）。
  - `npm run build`：通过。
- **客户端包**：
  - `npm run typecheck:client`：通过（使用 Harness TSC 与类型链接）。
  - `npm run test:client`：3 个测试文件，22 个测试全部通过（模式控制器、视图状态、模拟数据）。
  - `npm run build:client`：生成 `lib/index.js`、`lib/client.js`（+ sourcemap）。

### 手动界面验证（http://127.0.0.1:3080）
- 启动后默认进入普通聊天（无会话 hero 视图），侧边栏显示「文字游戏」按钮。
- 点击「文字游戏」：游戏壳以全屏对话框形式显示，普通聊天界面在背后存在但不可交互（inert）。
  - 频道列表显示「私聊青鸾（顾盼盼）」「群聊夜巡小队」「现场｜第七码头旧仓库」「工作简报」「系统通知」。
  - 消息区域显示预设的示例消息（包括对白、旁白、系统、选择卡、工作简报）。
  - 右侧详情面板显示频道信息、成员、当前位置。
- 切换频道：点击不同频道，消息列表切换，输入框草稿按频道隔离（从空 → 输入 → 切回 → 再次切回，草稿保留）。
- 点击「返回普通聊天」：游戏壳消失，普通聊天完全恢复。
- 按 Esc 键：同样返回普通聊天（要求不在 IME 输入状态下）。
- 刷新页面：游戏壳消失，自动回到普通聊天，侧边栏入口依然存在。
- 多次切换：进入 → 返回 → 进入，游戏状态（选中频道、草稿）在页面会话内存中保持。

## 5. D:\DeepSeek-Harness 未被修改的检查结果

- `git status --porcelain` 输出为空。
- 当前 HEAD：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。
- 未检出任何修改、新增或删除文件。

## 6. 已知限制与进入阶段 B 前需决定的问题

### 已知限制
- **CSS Modules 注入（已修复）**：刷新复验发现两个 CSS Module 曾复用同一个 `data-plugin-css` 标识，导致先加载的侧边栏样式阻止游戏壳样式注入。构建适配器现按源文件生成稳定且唯一的样式标识；重新构建后两个样式块都会进入页面。界面颜色继续使用 DSH 的真实 `--dsw-alias-*` token。
- **草稿持久化**：草稿仅存在于页面会话内存，刷新或关闭浏览器后丢失（阶段 A 约定：不持久化）。
- **焦点隔离方式**：通过运行时 DOM 操作（`inert`、`aria-hidden`）隔离底层元素，不通过 React 通信（符合规则，但属于 DOM 级操作）。
- **无障碍**：Esc 退出仅在非 IME 输入状态时有效；未为游戏壳实现完整的 ARIA 路由或拖放交互。
- **bundle 记录验证**：浏览器端未进行 digest/build-record 校验，仅进行 loader 的内容存在性检查（符合 AGENTS.md 要求）。

### 进入阶段 B 前需决定的问题
1. **Host API 与结构化消息桥接**：阶段 A 未接入任何 `story_*` 工具或 `Host` 远程接口。进入阶段 B 需要设计以下接口：
   - `story_emit_messages`（多频道、多说话人结构化消息提交）。
   - `story_upsert_channel`（动态创建/修改频道）。
   - `story_mark_episode_summary`（集末总结提交）。
   - `story_pause_for_revision`（越界暂停）。
   - 校验逻辑需明确：阻止 AI 替玩家角色做出关键决定，禁止重复提交已提交 ID 的消息等。

2. **存档持久化策略**：阶段 A 没有任何存档 API。阶段 B 需要定义：
   - 存档文件格式（位置、命名、版本）。
   - 当前状态与历史事件的存储/迁移（使用 Story Engine 现有的 `state-store`、`checkpoint` 机制）。
   - 是否复用 DSH 的 Session 作为存档后端，或实现独立索引（即包注册的 Preset 与存档清单）。

3. **内容包与Dispatch 集成**：阶段 A 仅使用原创模拟数据。阶段 B 需要决定：
   - 如何读取内容包（PRESETS_ROOT）并展示在游戏库。
   - 是否保留 Dispatch 转换逻辑（现有 `import-dispatch-private.mjs` 处理 JSONL 历史记录）。
   - 头像、封面图片的提供方式（包内静态资源与在线资源的边界）。

4. **AI 流式输出与展示**：阶段 A 输入框仅本地回显，不调用模型。阶段 B 需要决定：
   - 如何将普通 DSH 会话的流式输出转换为结构化消息（通过 Host 工具或自定义解析）。
   - 流式过程中是否显示临时“正在生成…”占位符，以及如何处理工具调用（如 `story_*` 调用本身不显示在消息流）。

5. **无障碍与键盘操作增强**：阶段 A 实现了 Esc 退出与返回按钮，但未覆盖完整键盘导航。阶段 B 可考虑：
   - Tab 序列在游戏壳内闭环（sidebar → left panel → center messages → right detail → 返回按钮）。
   - 为频道列表项、消息气泡、输入框提供明确的 focus 管理与 ARIA live region 更新。
   - 为选择卡提供完整键盘选择与提交（Enter/Space 确认选择）。

## 7. 重新构建与刷新复验（2026-08-28）

### 7.1 复验中发现并修复的问题

第一次重新构建后的真实浏览器截图显示：侧边栏入口具备样式，但游戏壳仍以浏览器默认控件呈现，三栏没有正确覆盖普通聊天。功能树和交互虽然存在，但不能据此判定阶段 A 通过。

根因位于外置 bundle 的 CSS Modules 注入适配器：`StoryGameAction.module.css` 与 `StoryGameShell.module.css` 使用了同一个 `data-plugin-css="dsh-story-client/story-ui.css"`。侧边栏模块先创建样式标签后，游戏壳模块因检测到相同 ID 而跳过注入。

修复内容：

- `client/story-ui/tsdown.config.mjs` 现在根据 CSS 源文件路径生成稳定且唯一的 SHA-256 短标识。
- 构建阶段会检查 bundle 中的样式标识，发现重复 ID 时直接失败，防止同类回归。
- 新 bundle 中的两个样式标签分别为：
  - `dsh-story-client/21ce2b68b121.css`
  - `dsh-story-client/0dc4df35d127.css`
- 浏览器刷新后确认两个样式标签同时存在，内容长度分别为 799 和 5947 字符。
- 界面继续使用 DSH 的真实 `--dsw-alias-*` 主题 token。

### 7.2 重新构建结果

- 根项目类型检查：通过。
- 根项目测试：6 个文件、12 项测试全部通过。
- 根项目构建：通过。
- 客户端类型检查：通过。
- 客户端测试：3 个文件、22 项测试全部通过。
- 客户端 bundle 构建：通过。
- `lib/client.js`：34.44 kB，SHA-256 `98065E5B070EE486861F6CCE203AD8B493BB57952D7FDC693E463418BFA0F5BC`。
- `lib/client.js.map`：SHA-256 `19946F526D196036461A66343D2968042515BB8318E53756DB2C8A9537CC5923`。

### 7.3 Playwright 刷新验证

在真实 Chromium 页面 `http://127.0.0.1:3080` 中完成：

复验开始时 3080 端口已有一个 DSH 实例运行，因此另一次 `start.ps1` 启动按预期返回 `EADDRINUSE`；没有终止或替换用户已有进程。客户端重建后由正在运行的开发实例检测新 bundle，浏览器刷新加载了包含两个独立样式标签的新版本。

1. 刷新后默认显示普通聊天，无启动选择页。
2. 侧边栏“文字游戏”入口存在且可操作。
3. 进入后游戏壳以正确样式覆盖整个 AppFrame，宽屏显示三栏。
4. 私聊和群聊可以切换，各频道草稿在同一页面会话中保持隔离。
5. 游戏激活时，overlay 之外的 AppFrame 兄弟元素均为 `inert=true`、`aria-hidden=true`。
6. 返回普通聊天后游戏对话框卸载，底层元素全部恢复为 `inert=false` 且移除 `aria-hidden`。
7. 720×800 窄屏下默认隐藏左右栏，频道抽屉可以展开。
8. 游戏模式下刷新后返回普通聊天，符合 `gameMode=false` 的启动约定。
9. 浏览器控制台为 0 个错误、0 个警告。

复验截图：

- `output/playwright/stage-a-game-shell-fixed.png`
- `output/playwright/stage-a-game-shell-narrow.png`
- `output/playwright/stage-a-channel-drawer.png`

### 7.4 DSH 原版完整性

- `D:\DeepSeek-Harness` 当前 HEAD：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。
- `git status --porcelain=v1` 为空，工作树干净。
- 本次修复只修改 Story Engine 的 bundle 适配器和交付报告，没有修改 DSH 原版。

---

**结论**：阶段 A 已全部满足交接文档要求——外置 Client 插件可构建、可通过补丁装载、侧边栏入口出现、shell.overlay 游戏壳完整渲染、模式切换与草稿隔离、刷新默认行为正确，且未修改任何 DSH 原版源码。可进入阶段 B 的桥接与持久化设计。
