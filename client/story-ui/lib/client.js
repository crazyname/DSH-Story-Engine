window.__ModuleLoader__.load({
	id: "dsh-story-client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region src/client/mode.ts
		/**
		* Create a game-mode controller. Default snapshot is `false`: DSH always
		* boots into the ordinary chat and a page refresh resets to ordinary chat
		* because the state lives only in memory.
		*/
		function createGameModeController() {
			const listeners = /* @__PURE__ */ new Set();
			let active = false;
			const notify = () => {
				for (const listener of listeners) listener();
			};
			const write = (next) => {
				if (active === next) return;
				active = next;
				notify();
			};
			return {
				source: {
					getSnapshot: () => active,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					}
				},
				enter: () => {
					write(true);
				},
				exit: () => {
					write(false);
				},
				toggle: () => {
					write(!active);
				}
			};
		}
		//#endregion
		//#region \0dsh-css:D:\DSH-Story-Engine\client\story-ui\src\client\StoryGameAction.module.css.mjs
		const css$3 = ".s-a98a_action{width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;font-size:14px;display:flex}.s-a98a_action:hover{background:var(--dsw-alias-interactive-bg-hover)}.s-a98a_action:focus-visible,.s-a98a_railAction:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}.s-a98a_label{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.s-a98a_railAction{width:36px;height:36px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;justify-content:center;align-items:center;margin:8px 0 10px;display:flex}.s-a98a_railAction:hover{background:var(--dsw-alias-interactive-bg-hover)}";
		const tagId$3 = "dsh-story-client/21ce2b68b121.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var StoryGameAction_module_css_default = {
			"action": "s-a98a_action",
			"label": "s-a98a_label",
			"railAction": "s-a98a_railAction"
		};
		//#endregion
		//#region src/client/StoryGameAction.tsx
		/**
		* The 文字游戏 sidebar footer action: a wide row (icon + label) when the
		* sidebar is expanded, an icon-only button with an accessible name when it
		* is folded to the rail. Opening never touches ordinary-chat state — the
		* conversation components stay mounted underneath the overlay.
		*/
		/**
		* Render the sidebar foot entry.
		* @param props - `wide` owner share plus the injected enter callback and bound `useGameMode` hook.
		* @returns the entry button.
		*/
		function StoryGameAction({ wide, enterGame, useGameMode }) {
			const active = useGameMode((mode) => mode);
			if (wide) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: StoryGameAction_module_css_default.action,
				onClick: enterGame,
				"aria-expanded": active,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlayOutline16, { size: 16 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: StoryGameAction_module_css_default.label,
					children: "文字游戏"
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: StoryGameAction_module_css_default.railAction,
				onClick: enterGame,
				"aria-expanded": active,
				"aria-label": "文字游戏",
				title: "文字游戏",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlayOutline16, { size: 18 })
			});
		}
		//#endregion
		//#region src/client/view-state.ts
		/** Initial state: first pinned channel, empty drafts, both columns open. */
		function initialViewState(channels) {
			const first = channels.find((channel) => channel.pinned) ?? channels[0];
			if (first === void 0) throw new Error("view-state: channel list must not be empty");
			return {
				selectedChannelId: first.id,
				drafts: {},
				leftOpen: true,
				rightOpen: true
			};
		}
		/** Selecting another channel keeps every draft where it was written. */
		function selectChannel(state, channelId) {
			if (state.selectedChannelId === channelId) return state;
			return {
				...state,
				selectedChannelId: channelId
			};
		}
		/** Drafts are keyed per channel so switching channels never leaks text. */
		function setDraft(state, channelId, text) {
			if ((state.drafts[channelId] ?? "") === text) return state;
			return {
				...state,
				drafts: {
					...state.drafts,
					[channelId]: text
				}
			};
		}
		/** Read only the error belonging to the selected save. */
		function saveErrorFor(state, saveId) {
			return state[saveId];
		}
		/** Set or clear one save's error without disturbing errors belonging to other saves. */
		function updateSaveError(state, saveId, error) {
			const previous = state[saveId];
			if (previous === error) return state;
			if (error === void 0) {
				if (previous === void 0) return state;
				const next = { ...state };
				delete next[saveId];
				return next;
			}
			return {
				...state,
				[saveId]: error
			};
		}
		function togglePanel(state, side) {
			if (side === "left") return {
				...state,
				leftOpen: !state.leftOpen
			};
			return {
				...state,
				rightOpen: !state.rightOpen
			};
		}
		/**
		* Narrow-viewport fallback: when the viewport drops below the three-column
		* breakpoint the side columns start closed so the message column is never
		* trapped behind an overlay.
		*/
		function narrowFallback(state) {
			if (!state.leftOpen && !state.rightOpen) return state;
			return {
				...state,
				leftOpen: false,
				rightOpen: false
			};
		}
		//#endregion
		//#region src/client/story-domain.ts
		function validateProjection(value) {
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("存档必须是对象");
			const p = value;
			if (p.schemaVersion !== 1 || typeof p.saveId !== "string" || !Array.isArray(p.participants) || !Array.isArray(p.channels) || !Array.isArray(p.messages) || typeof p.revision !== "number") throw new Error("存档结构无效");
			const participants = new Set(p.participants.map((x) => x.id));
			const channels = new Set(p.channels.map((x) => x.id));
			const messages = /* @__PURE__ */ new Set();
			if (participants.size !== p.participants.length || channels.size !== p.channels.length) throw new Error("人物或频道 ID 重复");
			for (const c of p.channels) if (c.participantIds.some((id) => !participants.has(id))) throw new Error(`频道成员不存在：${c.id}`);
			for (const m of p.messages) {
				if (messages.has(m.id)) throw new Error(`消息 ID 重复：${m.id}`);
				messages.add(m.id);
				if (!channels.has(m.channelId) || !participants.has(m.senderId)) throw new Error(`消息引用无效：${m.id}`);
			}
			if (!channels.has(p.selectedChannelId)) throw new Error("当前频道不存在");
			return structuredClone(p);
		}
		function appendPlayerMessage(projection, channelId, text, now = /* @__PURE__ */ new Date()) {
			const content = text.trim();
			if (!content) throw new Error("消息不能为空");
			const channel = projection.channels.find((c) => c.id === channelId);
			if (!channel) throw new Error("频道不存在");
			const player = projection.participants.find((p) => p.role === "player");
			if (!player || !channel.participantIds.includes(player.id)) throw new Error("玩家不属于当前频道");
			const kind = content.startsWith("(系统)") ? "system" : content.startsWith("(行动)") ? "action" : "dialogue";
			const createdAt = now.toISOString();
			const id = `msg-${now.getTime()}-${projection.messages.length + 1}`;
			const message = {
				id,
				channelId,
				senderId: kind === "system" ? projection.participants.find((p) => p.role === "system")?.id ?? player.id : player.id,
				kind,
				content: content.replace(/^\((系统|行动)\)\s*/u, ""),
				createdAt,
				seasonId: projection.frame.seasonLabel,
				episodeId: projection.frame.episodeLabel,
				sceneId: projection.frame.sceneLabel,
				turnId: `turn-${projection.revision + 1}`,
				canonStatus: kind === "system" ? "proposed" : "committed"
			};
			return {
				...projection,
				messages: [...projection.messages, message],
				channels: projection.channels.map((c) => c.id === channelId ? {
					...c,
					lastMessageId: id,
					lastActivityAt: createdAt
				} : c),
				drafts: {
					...projection.drafts,
					[channelId]: ""
				},
				revision: projection.revision + 1,
				updatedAt: createdAt
			};
		}
		function updateDraft(projection, channelId, text) {
			return {
				...projection,
				drafts: {
					...projection.drafts,
					[channelId]: text
				},
				revision: projection.revision + 1,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
		function appendAiMessages(projection, channelId, inputs, now = /* @__PURE__ */ new Date()) {
			const channel = projection.channels.find((c) => c.id === channelId);
			if (!channel) throw new Error("频道不存在");
			const player = projection.participants.find((p) => p.role === "player");
			if (inputs.length === 0) throw new Error("AI 消息不能为空");
			const allowed = new Set([...channel.participantIds, ...projection.participants.filter((p) => p.role === "narrator" || p.role === "system").map((p) => p.id)]);
			const createdAt = now.toISOString();
			const messages = inputs.map((input, index) => {
				if (input.senderId === player?.id) throw new Error("AI 不能替玩家发送消息");
				if (!allowed.has(input.senderId)) throw new Error(`发送者不属于频道：${input.senderId}`);
				if (!input.content.trim()) throw new Error("AI 消息内容不能为空");
				return {
					id: `ai-${now.getTime()}-${projection.messages.length + index + 1}`,
					channelId,
					senderId: input.senderId,
					kind: input.kind,
					content: input.content.trim(),
					createdAt,
					seasonId: projection.frame.seasonLabel,
					episodeId: projection.frame.episodeLabel,
					sceneId: projection.frame.sceneLabel,
					turnId: `turn-${projection.revision + 1}`,
					canonStatus: "committed"
				};
			});
			const last = messages.at(-1);
			return {
				...projection,
				messages: [...projection.messages, ...messages],
				channels: projection.channels.map((c) => c.id === channelId ? {
					...c,
					lastMessageId: last.id,
					lastActivityAt: createdAt
				} : c),
				revision: projection.revision + 1,
				updatedAt: createdAt
			};
		}
		/** Record a player's answer to a story choice as a committed choice message. */
		function appendChoiceRecord(projection, channelId, questionId, selected, custom, now = /* @__PURE__ */ new Date()) {
			const channel = projection.channels.find((c) => c.id === channelId);
			if (!channel) throw new Error("频道不存在");
			const player = projection.participants.find((p) => p.role === "player");
			if (!player || !channel.participantIds.includes(player.id)) throw new Error("玩家不属于当前频道");
			const content = [...selected.length ? selected : [custom?.trim() ?? ""]].filter(Boolean).join("／");
			if (!content) throw new Error("选择不能为空");
			const createdAt = now.toISOString();
			const id = `choice-${now.getTime()}-${projection.messages.length + 1}`;
			const message = {
				id,
				channelId,
				senderId: player.id,
				kind: "choice",
				content,
				createdAt,
				seasonId: projection.frame.seasonLabel,
				episodeId: projection.frame.episodeLabel,
				sceneId: projection.frame.sceneLabel,
				turnId: `turn-${projection.revision + 1}`,
				choiceId: questionId,
				canonStatus: "committed"
			};
			return {
				...projection,
				messages: [...projection.messages, message],
				channels: projection.channels.map((c) => c.id === channelId ? {
					...c,
					lastMessageId: id,
					lastActivityAt: createdAt
				} : c),
				revision: projection.revision + 1,
				updatedAt: createdAt
			};
		}
		//#endregion
		//#region src/client/mock-data.ts
		const PARTICIPANTS = [
			{
				id: "p-player",
				heroNameZh: "岚",
				realNameZh: "岚",
				role: "player",
				status: "active"
			},
			{
				id: "p-hezhou",
				heroNameZh: "鹤舟",
				realNameZh: "鹤舟",
				role: "npc",
				status: "active"
			},
			{
				id: "p-narrator",
				realNameZh: "旁白",
				role: "narrator",
				status: "active"
			},
			{
				id: "p-system",
				realNameZh: "系统",
				role: "system",
				status: "active"
			}
		];
		const CHANNELS = [
			{
				id: "c-direct-hezhou",
				kind: "direct",
				title: "鹤舟",
				participantIds: ["p-player", "p-hezhou"],
				category: "personal",
				pinned: true,
				lastMessageId: "m-d-2",
				lastActivityAt: "22:41"
			},
			{
				id: "c-group-lighthouse",
				kind: "group",
				title: "雾海灯塔站",
				participantIds: [
					"p-player",
					"p-hezhou",
					"p-system"
				],
				category: "work",
				pinned: true,
				lastMessageId: "m-g-2",
				lastActivityAt: "22:37"
			},
			{
				id: "c-scene-lantern-room",
				kind: "scene",
				title: "现场｜灯室",
				participantIds: [
					"p-player",
					"p-hezhou",
					"p-narrator"
				],
				category: "story",
				pinned: false,
				lastMessageId: "m-s-3",
				lastActivityAt: "21:58"
			},
			{
				id: "c-work-dispatch",
				kind: "work",
				title: "工作简报",
				participantIds: [
					"p-player",
					"p-hezhou",
					"p-system"
				],
				category: "work",
				pinned: false,
				lastMessageId: "m-w-2",
				lastActivityAt: "20:15"
			},
			{
				id: "c-system",
				kind: "system",
				title: "系统通知",
				participantIds: ["p-player", "p-system"],
				category: "system",
				pinned: false,
				lastMessageId: "m-sys-1",
				lastActivityAt: "19:00"
			}
		];
		const MESSAGES = [
			{
				id: "m-d-1",
				channelId: "c-direct-hezhou",
				senderId: "p-hezhou",
				kind: "dialogue",
				content: "雾潮提前了。上灯室前，先答应我别碰那组裸线。",
				createdAt: "22:39"
			},
			{
				id: "m-d-2",
				channelId: "c-direct-hezhou",
				senderId: "p-player",
				kind: "dialogue",
				content: "先把风险说清楚，我再决定。",
				createdAt: "22:41"
			},
			{
				id: "m-g-1",
				channelId: "c-group-lighthouse",
				senderId: "p-system",
				kind: "system",
				content: "雾潮预警：预计三十分钟后覆盖近岸航道。",
				createdAt: "22:35"
			},
			{
				id: "m-g-2",
				channelId: "c-group-lighthouse",
				senderId: "p-hezhou",
				kind: "dialogue",
				content: "备用灯负载测试还差最后一轮。",
				createdAt: "22:37"
			},
			{
				id: "m-s-1",
				channelId: "c-scene-lantern-room",
				senderId: "p-narrator",
				kind: "narration",
				content: "旋转灯罩擦过浓雾，主透镜边缘的一道新裂纹在光里一闪。",
				createdAt: "21:55"
			},
			{
				id: "m-s-2",
				channelId: "c-scene-lantern-room",
				senderId: "p-hezhou",
				kind: "dialogue",
				content: "停一下。这道裂纹昨晚还没有。",
				createdAt: "21:56"
			},
			{
				id: "m-s-3",
				channelId: "c-scene-lantern-room",
				senderId: "p-player",
				kind: "choice",
				content: "检查主透镜／启动备用灯／追查昨夜访客／自由输入",
				createdAt: "21:58"
			},
			{
				id: "m-w-1",
				channelId: "c-work-dispatch",
				senderId: "p-system",
				kind: "work-dispatch",
				content: "【工作内简报｜S1E1】校准东侧雾笛——鹤舟——成功，轻度疲劳。",
				createdAt: "20:14"
			},
			{
				id: "m-w-2",
				channelId: "c-work-dispatch",
				senderId: "p-system",
				kind: "work-dispatch",
				content: "【工作内简报｜S1E1】引导迟归渔船——岚——完美，灯塔声誉提升。",
				createdAt: "20:15"
			},
			{
				id: "m-sys-1",
				channelId: "c-system",
				senderId: "p-system",
				kind: "system",
				content: "原创示例包已载入：第一季第一集《雾潮提前抵达》。",
				createdAt: "19:00"
			}
		];
		const STORY_FRAME = {
			packTitle: "雾海灯塔站",
			seasonLabel: "第 1 季",
			episodeLabel: "第 1 集",
			sceneLabel: "灯室里的裂纹"
		};
		//#endregion
		//#region src/client/initial-projection.ts
		function createInitialProjection() {
			return {
				schemaVersion: 1,
				saveId: "lantern-demo-save",
				packId: "lantern-station",
				packTitle: "雾海灯塔站",
				selectedChannelId: CHANNELS.find((c) => c.pinned)?.id ?? CHANNELS[0].id,
				participants: PARTICIPANTS.map((p) => ({
					...p,
					aliases: []
				})),
				channels: CHANNELS.map((c) => ({
					...c,
					muted: false,
					archived: false
				})),
				messages: MESSAGES.map((m, index) => ({
					...m,
					createdAt: `2026-08-28T${m.createdAt}:00.000+08:00`,
					seasonId: "S1",
					episodeId: "E1",
					sceneId: STORY_FRAME.sceneLabel,
					turnId: `fixture-${index + 1}`,
					canonStatus: "committed"
				})),
				drafts: {},
				readCursors: {},
				frame: {
					seasonLabel: STORY_FRAME.seasonLabel,
					episodeLabel: STORY_FRAME.episodeLabel,
					sceneLabel: STORY_FRAME.sceneLabel
				},
				revision: 0,
				updatedAt: "2026-08-28T19:00:00.000+08:00"
			};
		}
		//#endregion
		//#region src/client/persistence.ts
		function createLocalProjectionStorage(storage, prefix = "dsh-story-save:") {
			return {
				load(saveId) {
					const raw = storage.getItem(`${prefix}${saveId}`);
					if (raw === null) return void 0;
					return validateProjection(JSON.parse(raw));
				},
				save(value) {
					storage.setItem(`${prefix}${value.saveId}`, JSON.stringify(validateProjection(value)));
				}
			};
		}
		//#endregion
		//#region src/client/host-persistence.ts
		var HostProjectionStorage = class {
			fetcher;
			tail = Promise.resolve();
			constructor(fetcher = (input, init) => fetch(input, init)) {
				this.fetcher = fetcher;
			}
			async listPacks() {
				const response = await this.fetcher("/story-engine/api/catalog", { headers: { accept: "application/json" } });
				if (!response.ok) throw new Error(`读取内容包目录失败：${response.status}`);
				const body = await response.json();
				if (!Array.isArray(body.packs)) throw new Error("内容包目录格式无效");
				return body.packs.map((pack) => pack.template === void 0 ? pack : {
					...pack,
					template: validateProjection({
						...pack.template,
						saveId: "catalog-template",
						packId: pack.packId,
						packTitle: pack.title,
						agentPreset: pack.agentPreset,
						revision: 0,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					})
				});
			}
			async list() {
				const response = await this.fetcher("/story-engine/api/saves", { headers: { accept: "application/json" } });
				if (!response.ok) throw new Error(`读取存档列表失败：${response.status}`);
				const body = await response.json();
				if (!Array.isArray(body.saves)) throw new Error("存档列表格式无效");
				return body.saves;
			}
			async load(saveId) {
				const response = await this.fetcher(`/story-engine/api/saves/${encodeURIComponent(saveId)}`, { headers: { accept: "application/json" } });
				if (response.status === 204 || response.status === 404) return void 0;
				if (!response.ok) throw new Error(`读取本地存档失败：${response.status}`);
				return validateProjection(await response.json());
			}
			save(value, bootstrap = false) {
				const task = this.tail.then(async () => {
					const response = await this.fetcher(`/story-engine/api/saves/${encodeURIComponent(value.saveId)}`, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							expectedRevision: bootstrap ? -1 : value.revision - 1,
							projection: value
						})
					});
					if (response.status === 409) throw new Error("宿主存档发生版本冲突：此存档已在另一窗口更新，请重新打开后再继续");
					if (!response.ok) {
						const detail = await response.json().catch(() => ({}));
						throw new Error(detail.error ?? `保存失败：${response.status}`);
					}
				});
				this.tail = task.catch(() => {});
				return task;
			}
			async remove(saveId) {
				const response = await this.fetcher(`/story-engine/api/saves/${encodeURIComponent(saveId)}`, { method: "DELETE" });
				if (!response.ok) {
					const detail = await response.json().catch(() => ({}));
					throw new Error(detail.error ?? `删除存档失败：${response.status}`);
				}
			}
		};
		//#endregion
		//#region \0dsh-css:D:\DSH-Story-Engine\client\story-ui\src\client\ChoiceCard.module.css.mjs
		const css$2 = ".gbf0-a_overlay{z-index:20;background:#0a0e168c;justify-content:center;align-items:center;padding:24px;display:flex;position:absolute;inset:0}.gbf0-a_card{color:#1b2430;background:#fff;border-radius:14px;flex-direction:column;gap:12px;width:min(560px,100%);max-height:85%;padding:20px 22px;display:flex;overflow:auto;box-shadow:0 18px 50px #00000059}.gbf0-a_headerRow{justify-content:space-between;align-items:center;gap:12px;display:flex}.gbf0-a_eyebrow{letter-spacing:.08em;color:#667085;text-transform:uppercase;font-size:12px;font-weight:600}.gbf0-a_dismiss{color:#667085;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:2px 6px;font-size:18px;line-height:1}.gbf0-a_dismiss:hover{color:#1b2430;background:#f2f4f7}.gbf0-a_question{color:#1b2430;font-size:16px;font-weight:600;line-height:1.5}.gbf0-a_detail{color:#475467;font-size:13px;line-height:1.6}.gbf0-a_options{flex-direction:column;gap:8px;display:flex}.gbf0-a_option,.gbf0-a_optionActive{text-align:left;cursor:pointer;background:#fff;border:1px solid #d0d5dd;border-radius:10px;flex-direction:column;gap:2px;padding:10px 12px;display:flex}.gbf0-a_option:hover{border-color:#98a2b3}.gbf0-a_optionActive{background:#eef4ff;border-color:#2f6fed;box-shadow:inset 0 0 0 1px #2f6fed}.gbf0-a_optionLabel{color:#1b2430;font-size:14px;font-weight:500}.gbf0-a_optionDesc{color:#475467;font-size:12px;line-height:1.5}.gbf0-a_composer{gap:8px;margin-top:2px;display:flex}.gbf0-a_input{color:#1b2430;background:#fff;border:1px solid #d0d5dd;border-radius:8px;flex:1;padding:8px 10px;font-size:13px}.gbf0-a_input:focus{border-color:#2f6fed;outline:none;box-shadow:0 0 0 2px #2f6fed26}.gbf0-a_send{color:#fff;cursor:pointer;background:#2f6fed;border:none;border-radius:8px;padding:0 16px;font-size:13px;font-weight:600}.gbf0-a_send:disabled{cursor:default;background:#b2c3f0}";
		const tagId$2 = "dsh-story-client/b41a8ba37388.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ChoiceCard_module_css_default = {
			"card": "gbf0-a_card",
			"composer": "gbf0-a_composer",
			"detail": "gbf0-a_detail",
			"dismiss": "gbf0-a_dismiss",
			"eyebrow": "gbf0-a_eyebrow",
			"headerRow": "gbf0-a_headerRow",
			"input": "gbf0-a_input",
			"option": "gbf0-a_option",
			"optionActive": "gbf0-a_optionActive",
			"optionDesc": "gbf0-a_optionDesc",
			"optionLabel": "gbf0-a_optionLabel",
			"options": "gbf0-a_options",
			"overlay": "gbf0-a_overlay",
			"question": "gbf0-a_question",
			"send": "gbf0-a_send"
		};
		//#endregion
		//#region src/client/ChoiceCard.tsx
		/**
		* Game-side choice card for story_present_choice.
		*
		* Rendered inside the game shell when the AI asks the player to choose (the
		* `question/requested` mux frame from the choice bridge). Clicking an option
		* answers through the bridge; free-text input is also offered because the
		* tool allows custom answers. Styling mirrors the shell's card language.
		*/
		function ChoiceCard({ card, onAnswer }) {
			const [selected, setSelected] = (0, react.useState)([]);
			const [custom, setCustom] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const single = card.multiSelect !== true;
			const toggle = (label) => {
				setSelected((prev) => single ? [label] : prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
			};
			const submit = async () => {
				if (busy) return;
				const chosen = [...selected];
				const text = custom.trim();
				if (chosen.length === 0 && text === "") return;
				setBusy(true);
				try {
					await onAnswer(chosen, text === "" ? void 0 : text);
				} catch {} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ChoiceCard_module_css_default.overlay,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: ChoiceCard_module_css_default.card,
					role: "dialog",
					"aria-label": "剧情选择",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ChoiceCard_module_css_default.headerRow,
							children: card.header !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ChoiceCard_module_css_default.eyebrow,
								children: card.header
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ChoiceCard_module_css_default.question,
							children: card.question
						}),
						card.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ChoiceCard_module_css_default.detail,
							children: card.detail
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ChoiceCard_module_css_default.options,
							role: single ? "radiogroup" : "group",
							children: card.options.map((option) => {
								const active = selected.includes(option.label);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: active ? ChoiceCard_module_css_default.optionActive : ChoiceCard_module_css_default.option,
									role: single ? "radio" : "checkbox",
									"aria-checked": active,
									onClick: () => {
										toggle(option.label);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ChoiceCard_module_css_default.optionLabel,
										children: option.label
									}), option.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ChoiceCard_module_css_default.optionDesc,
										children: option.description
									})]
								}, option.label);
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ChoiceCard_module_css_default.composer,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: ChoiceCard_module_css_default.input,
								value: custom,
								placeholder: "或自由输入你的回答…",
								"aria-label": "自由输入回答",
								onChange: (event) => {
									setCustom(event.target.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing) {
										event.preventDefault();
										submit();
									}
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ChoiceCard_module_css_default.send,
								onClick: submit,
								disabled: busy || selected.length === 0 && custom.trim() === "",
								children: busy ? "提交中…" : "确定"
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/library-format.ts
		/** Group saves by pack id (ordered by the given order). */
		function groupSavesBySaveId(saves) {
			const groups = /* @__PURE__ */ new Map();
			for (const save of saves) {
				const list = groups.get(save.packId) ?? [];
				list.push(save);
				groups.set(save.packId, list);
			}
			return groups;
		}
		/** Human-friendly updated time, falling back to the raw string. */
		function formatUpdated(value) {
			if (value === "") return "未知时间";
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return value;
			return new Intl.DateTimeFormat("zh-CN", {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false
			}).format(date);
		}
		//#endregion
		//#region \0dsh-css:D:\DSH-Story-Engine\client\story-ui\src\client\StoryGameLibrary.module.css.mjs
		const css$1 = ".Gwgdiq_library{color:#1b2430;background:#f6f7f9;flex-direction:column;display:flex;position:absolute;inset:0;overflow:auto}.Gwgdiq_header{background:#fff;border-bottom:1px solid #e4e7ec;justify-content:space-between;align-items:center;padding:16px 24px;display:flex}.Gwgdiq_headerTitle{align-items:baseline;gap:10px;display:flex}.Gwgdiq_logo{color:#1b2430;font-size:18px;font-weight:700}.Gwgdiq_tagline{color:#667085;font-size:13px}.Gwgdiq_exit{color:#344054;cursor:pointer;background:#fff;border:1px solid #d0d5dd;border-radius:8px;padding:6px 12px;font-size:13px}.Gwgdiq_exit:hover{border-color:#98a2b3}.Gwgdiq_body{width:100%;max-width:860px;margin:0 auto;padding:24px}.Gwgdiq_error{color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;margin-bottom:16px;padding:10px 14px;font-size:13px}.Gwgdiq_packList{flex-direction:column;gap:16px;display:flex}.Gwgdiq_pack{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:16px 18px}.Gwgdiq_packHead{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.Gwgdiq_packMeta{flex-direction:column;gap:4px;display:flex}.Gwgdiq_packTitle{color:#1b2430;margin:0;font-size:16px;font-weight:600}.Gwgdiq_packInfo{color:#667085;gap:10px;font-size:12px;display:flex}.Gwgdiq_badge{color:#92400e;background:#fef3c7;border-radius:4px;padding:1px 6px}.Gwgdiq_newGame{color:#fff;cursor:pointer;white-space:nowrap;background:#2f6fed;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600}.Gwgdiq_newGame:hover{background:#2459c8}.Gwgdiq_packDesc{color:#475467;margin:10px 0 12px;font-size:13px;line-height:1.6}.Gwgdiq_saveList{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}.Gwgdiq_saveRow{cursor:pointer;text-align:left;background:#fff;border:1px solid #d0d5dd;border-radius:10px;align-items:center;gap:12px;width:100%;padding:10px 12px;display:flex}.Gwgdiq_saveRow:hover{border-color:#2f6fed;box-shadow:inset 0 0 0 1px #2f6fed}.Gwgdiq_saveName{color:#1b2430;flex:1;font-size:13px;font-weight:500}.Gwgdiq_saveMeta{color:#667085;font-size:12px}.Gwgdiq_saveAction{color:#2f6fed;font-size:12px;font-weight:600}.Gwgdiq_empty{color:#98a2b3;margin:8px 0 0;font-size:13px}.Gwgdiq_saveItem{flex-direction:column;gap:4px;display:flex}.Gwgdiq_saveRowWrap{align-items:stretch;gap:6px;display:flex}.Gwgdiq_saveRow{flex:1}.Gwgdiq_saveOps{align-items:stretch;gap:6px;display:flex}.Gwgdiq_opButton,.Gwgdiq_opDanger{cursor:pointer;color:#344054;background:#fff;border:1px solid #d0d5dd;border-radius:8px;padding:0 10px;font-size:12px}.Gwgdiq_opButton:hover{color:#2f6fed;border-color:#2f6fed}.Gwgdiq_opDanger{color:#b42318}.Gwgdiq_opDanger:hover{background:#fef3f2;border-color:#b42318}";
		const tagId$1 = "dsh-story-client/b1698b1c1069.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var StoryGameLibrary_module_css_default = {
			"badge": "Gwgdiq_badge",
			"body": "Gwgdiq_body",
			"empty": "Gwgdiq_empty",
			"error": "Gwgdiq_error",
			"exit": "Gwgdiq_exit",
			"header": "Gwgdiq_header",
			"headerTitle": "Gwgdiq_headerTitle",
			"library": "Gwgdiq_library",
			"logo": "Gwgdiq_logo",
			"newGame": "Gwgdiq_newGame",
			"opButton": "Gwgdiq_opButton",
			"opDanger": "Gwgdiq_opDanger",
			"pack": "Gwgdiq_pack",
			"packDesc": "Gwgdiq_packDesc",
			"packHead": "Gwgdiq_packHead",
			"packInfo": "Gwgdiq_packInfo",
			"packList": "Gwgdiq_packList",
			"packMeta": "Gwgdiq_packMeta",
			"packTitle": "Gwgdiq_packTitle",
			"saveAction": "Gwgdiq_saveAction",
			"saveItem": "Gwgdiq_saveItem",
			"saveList": "Gwgdiq_saveList",
			"saveMeta": "Gwgdiq_saveMeta",
			"saveName": "Gwgdiq_saveName",
			"saveOps": "Gwgdiq_saveOps",
			"saveRow": "Gwgdiq_saveRow",
			"saveRowWrap": "Gwgdiq_saveRowWrap",
			"tagline": "Gwgdiq_tagline"
		};
		//#endregion
		//#region src/client/StoryGameLibrary.tsx
		function StoryGameLibrary({ packs, saves, onContinue, onNewGame, onSaveAs, onDelete, onExit, error }) {
			const bySave = groupSavesBySaveId(saves);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: StoryGameLibrary_module_css_default.library,
				role: "dialog",
				"aria-label": "游戏库",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: StoryGameLibrary_module_css_default.header,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: StoryGameLibrary_module_css_default.headerTitle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: StoryGameLibrary_module_css_default.logo,
							children: "文字游戏"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: StoryGameLibrary_module_css_default.tagline,
							children: "游戏库"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: StoryGameLibrary_module_css_default.exit,
						onClick: onExit,
						children: "返回普通聊天"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: StoryGameLibrary_module_css_default.body,
					children: [error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: StoryGameLibrary_module_css_default.error,
						role: "alert",
						children: error
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: StoryGameLibrary_module_css_default.packList,
						children: packs.map((pack) => {
							const packSaves = bySave.get(pack.packId) ?? [];
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: StoryGameLibrary_module_css_default.pack,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: StoryGameLibrary_module_css_default.packHead,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: StoryGameLibrary_module_css_default.packMeta,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
												className: StoryGameLibrary_module_css_default.packTitle,
												children: pack.title
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: StoryGameLibrary_module_css_default.packInfo,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: pack.author }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["v", pack.version] }),
													pack.status === "diagnostic" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: StoryGameLibrary_module_css_default.badge,
														children: "需诊断"
													})
												]
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: StoryGameLibrary_module_css_default.newGame,
											disabled: pack.status !== "ready",
											title: pack.diagnostic,
											onClick: () => {
												onNewGame(pack.packId);
											},
											children: pack.status === "ready" ? "新游戏" : "待配置"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: StoryGameLibrary_module_css_default.packDesc,
										children: pack.description
									}),
									pack.diagnostic !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: StoryGameLibrary_module_css_default.empty,
										children: pack.diagnostic
									}),
									packSaves.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: StoryGameLibrary_module_css_default.saveList,
										children: packSaves.map((save) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
											className: StoryGameLibrary_module_css_default.saveItem,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: StoryGameLibrary_module_css_default.saveRowWrap,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: StoryGameLibrary_module_css_default.saveRow,
													onClick: () => {
														onContinue(save.saveId);
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: StoryGameLibrary_module_css_default.saveName,
															children: [
																save.packTitle,
																" · ",
																formatUpdated(save.updatedAt)
															]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: StoryGameLibrary_module_css_default.saveMeta,
															children: save.sceneLabel !== "" ? save.sceneLabel : `进度 ${save.revision}`
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: StoryGameLibrary_module_css_default.saveAction,
															children: "继续游戏"
														})
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: StoryGameLibrary_module_css_default.saveOps,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: StoryGameLibrary_module_css_default.opButton,
														onClick: () => {
															onSaveAs(save.saveId);
														},
														children: "另存为"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: StoryGameLibrary_module_css_default.opDanger,
														onClick: () => {
															onDelete(save.saveId);
														},
														children: "删除"
													})]
												})]
											})
										}, save.saveId))
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: StoryGameLibrary_module_css_default.empty,
										children: "暂无存档，点\"新游戏\"开始。"
									})
								]
							}, pack.packId);
						})
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/game-library.ts
		/** Fixture fallback used by isolated tests; production loads the host catalog. */
		const INSTALLED_PACKS = [{
			packId: "lantern-station",
			title: "雾海灯塔站",
			author: "DSH Story Engine",
			version: "1.0.0",
			status: "ready",
			description: "用于测试引擎的原创短篇世界：雾潮提前抵达，主透镜出现裂纹，选择决定整夜的走向。",
			agentPreset: "story-lantern-station",
			template: createInitialProjection()
		}];
		/** A fresh save id: pack slug + timestamp + random suffix, host-safe ([a-zA-Z0-9_-]). */
		function newSaveId(packId) {
			return `${packId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "game"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		}
		/** Create the initial projection for a new game of the given pack. */
		function createNewGame(pack, saveId) {
			if (pack.status !== "ready" || pack.template === void 0) throw new Error(pack.diagnostic ?? "内容包缺少文字游戏界面描述");
			return {
				...structuredClone(pack.template),
				saveId,
				packId: pack.packId,
				packTitle: pack.title,
				agentPreset: pack.agentPreset,
				revision: 0,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
		/** Clone a save under a new id (save-as / branch). Revision resets to 0 so the
		*  new save bootstraps through the host without a stale revision conflict. */
		function cloneSave(source, saveId) {
			return {
				...structuredClone(source),
				saveId,
				revision: 0,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
		//#endregion
		//#region \0dsh-css:D:\DSH-Story-Engine\client\story-ui\src\client\StoryGameShell.module.css.mjs
		const css = ".p8FQLq_shell{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);flex-direction:column;font-size:14px;display:flex;position:absolute;inset:0;overflow:hidden}.p8FQLq_topbar{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;justify-content:space-between;align-items:center;gap:12px;height:52px;padding:0 12px;display:flex}.p8FQLq_topbarTitle{flex-direction:column;align-items:center;gap:2px;min-width:0;display:flex}.p8FQLq_channelTitle{white-space:nowrap;text-overflow:ellipsis;font-weight:600;overflow:hidden}.p8FQLq_frameLabel{color:var(--dsw-alias-label-tertiary);font-size:12px}.p8FQLq_topbarToggle{align-items:center;gap:8px;display:flex}.p8FQLq_iconButton{width:32px;height:32px;color:inherit;cursor:pointer;background:0 0;border:none;border-radius:8px;justify-content:center;align-items:center;display:flex}.p8FQLq_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.p8FQLq_iconButton:focus-visible,.p8FQLq_backButton:focus-visible,.p8FQLq_channelItem:focus-visible,.p8FQLq_sendButton:focus-visible,.p8FQLq_input:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}.p8FQLq_flipIcon{transform:scaleX(-1)}.p8FQLq_backButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:32px;color:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:4px;padding:0 12px;font-size:13px;display:flex}.p8FQLq_backButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.p8FQLq_body{flex:1;min-height:0;display:flex}.p8FQLq_channelPane{border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:none;width:264px;display:flex;overflow-y:auto}.p8FQLq_paneHeader{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;flex:none;padding:12px 12px 8px;font-size:12px;overflow:hidden}.p8FQLq_channelList{flex-direction:column;gap:2px;margin:0;padding:0 8px 12px;list-style:none;display:flex}.p8FQLq_channelItem,.p8FQLq_channelItemActive{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;grid-template-columns:36px 1fr auto;align-items:center;gap:6px;padding:8px;font-size:13px;display:grid}.p8FQLq_channelItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.p8FQLq_channelItemActive{background:var(--dsw-alias-interactive-bg-active);font-weight:600}.p8FQLq_channelKind{color:var(--dsw-alias-label-tertiary);font-size:11px}.p8FQLq_channelName{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.p8FQLq_channelLast{color:var(--dsw-alias-label-tertiary);font-size:11px}.p8FQLq_messagePane{flex-direction:column;flex:1;min-width:0;display:flex}.p8FQLq_messageList{flex-direction:column;flex:1;gap:8px;min-height:0;padding:16px;display:flex;overflow-y:auto}.p8FQLq_preview{border:1px dashed var(--dsw-alias-border-l2);opacity:.72;border-radius:10px;flex-direction:column;gap:8px;padding:10px;display:flex}.p8FQLq_previewLabel{color:var(--dsw-alias-label-tertiary);text-align:center;font-size:12px}.p8FQLq_bubbleRowMine,.p8FQLq_bubbleRowOther{flex-direction:column;max-width:68%;display:flex}.p8FQLq_bubbleRowMine{align-self:flex-end;align-items:flex-end}.p8FQLq_bubbleRowOther{align-self:flex-start;align-items:flex-start}.p8FQLq_senderName{color:var(--dsw-alias-label-tertiary);margin-bottom:2px;font-size:12px}.p8FQLq_bubbleMine,.p8FQLq_bubbleOther{white-space:pre-wrap;word-break:break-word;border-radius:12px;padding:8px 12px}.p8FQLq_bubbleMine{background:var(--dsw-alias-interactive-bg-active)}.p8FQLq_bubbleOther{background:var(--dsw-alias-bg-layer-2)}.p8FQLq_narration{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);text-align:center;border-radius:10px;align-self:stretch;padding:10px 14px;font-style:italic}.p8FQLq_systemNote{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);text-align:center;border-radius:8px;align-self:center;padding:4px 12px;font-size:12px}.p8FQLq_choiceCard{border:1px dashed var(--dsw-alias-border-l2);text-align:center;border-radius:10px;align-self:stretch;padding:10px 14px}.p8FQLq_actionMine,.p8FQLq_actionOther{color:var(--dsw-alias-label-secondary);align-self:stretch;padding:2px 8px;font-size:13px}.p8FQLq_actionMine{text-align:right}.p8FQLq_composer{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;gap:8px;padding:12px;display:flex}.p8FQLq_input{resize:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);min-height:44px;max-height:120px;color:inherit;font:inherit;border-radius:10px;flex:1;padding:10px 12px}.p8FQLq_sendButton{background:var(--dsw-alias-interactive-bg-active);height:40px;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:10px;flex:none;align-self:flex-end;padding:0 18px;font-size:13px}.p8FQLq_cancelButton,.p8FQLq_retryButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:40px;color:inherit;cursor:pointer;border-radius:10px;flex:none;align-self:flex-end;padding:0 12px;font-size:13px}.p8FQLq_retryButton{background:var(--dsw-alias-interactive-bg-active)}.p8FQLq_turnError{border-top:1px solid var(--dsw-alias-border-l1);color:#92400e;background:#fef3c7;flex:none;padding:8px 12px;font-size:12px}.p8FQLq_detailPane{border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:none;width:232px;display:flex;overflow-y:auto}.p8FQLq_detailBody{flex-direction:column;gap:8px;padding:0 12px 12px;display:flex}.p8FQLq_detailSection{margin-top:8px;font-size:12px;font-weight:600}.p8FQLq_detailText{color:var(--dsw-alias-label-secondary);font-size:13px}.p8FQLq_memberList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}.p8FQLq_memberItem{align-items:center;gap:8px;font-size:13px;display:flex}.p8FQLq_memberAvatar{background:var(--dsw-alias-interactive-bg-active);border-radius:50%;justify-content:center;align-items:center;width:26px;height:26px;font-size:12px;display:flex}.p8FQLq_demoNote{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);border-radius:8px;margin-top:12px;padding:8px 10px;font-size:12px}.p8FQLq_shell[data-narrow=true] .p8FQLq_channelPane,.p8FQLq_shell[data-narrow=true] .p8FQLq_detailPane{z-index:2;position:absolute;top:52px;bottom:0;box-shadow:0 0 24px #0000002e}.p8FQLq_shell[data-narrow=true] .p8FQLq_channelPane{left:0}.p8FQLq_shell[data-narrow=true] .p8FQLq_detailPane{right:0}.p8FQLq_shell[data-narrow=true] .p8FQLq_frameLabel{display:none}.p8FQLq_choiceError{color:#92400e;z-index:30;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;max-width:80%;padding:8px 14px;font-size:13px;position:absolute;bottom:84px;left:50%;transform:translate(-50%)}.p8FQLq_libraryButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:32px;color:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:4px;padding:0 12px;font-size:13px;display:flex}.p8FQLq_libraryButton:hover{border-color:var(--dsw-alias-border-l2)}";
		const tagId = "dsh-story-client/0dc4df35d127.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var StoryGameShell_module_css_default = {
			"actionMine": "p8FQLq_actionMine",
			"actionOther": "p8FQLq_actionOther",
			"backButton": "p8FQLq_backButton",
			"body": "p8FQLq_body",
			"bubbleMine": "p8FQLq_bubbleMine",
			"bubbleOther": "p8FQLq_bubbleOther",
			"bubbleRowMine": "p8FQLq_bubbleRowMine",
			"bubbleRowOther": "p8FQLq_bubbleRowOther",
			"cancelButton": "p8FQLq_cancelButton",
			"channelItem": "p8FQLq_channelItem",
			"channelItemActive": "p8FQLq_channelItemActive",
			"channelKind": "p8FQLq_channelKind",
			"channelLast": "p8FQLq_channelLast",
			"channelList": "p8FQLq_channelList",
			"channelName": "p8FQLq_channelName",
			"channelPane": "p8FQLq_channelPane",
			"channelTitle": "p8FQLq_channelTitle",
			"choiceCard": "p8FQLq_choiceCard",
			"choiceError": "p8FQLq_choiceError",
			"composer": "p8FQLq_composer",
			"demoNote": "p8FQLq_demoNote",
			"detailBody": "p8FQLq_detailBody",
			"detailPane": "p8FQLq_detailPane",
			"detailSection": "p8FQLq_detailSection",
			"detailText": "p8FQLq_detailText",
			"flipIcon": "p8FQLq_flipIcon",
			"frameLabel": "p8FQLq_frameLabel",
			"iconButton": "p8FQLq_iconButton",
			"input": "p8FQLq_input",
			"libraryButton": "p8FQLq_libraryButton",
			"memberAvatar": "p8FQLq_memberAvatar",
			"memberItem": "p8FQLq_memberItem",
			"memberList": "p8FQLq_memberList",
			"messageList": "p8FQLq_messageList",
			"messagePane": "p8FQLq_messagePane",
			"narration": "p8FQLq_narration",
			"paneHeader": "p8FQLq_paneHeader",
			"preview": "p8FQLq_preview",
			"previewLabel": "p8FQLq_previewLabel",
			"retryButton": "p8FQLq_retryButton",
			"sendButton": "p8FQLq_sendButton",
			"senderName": "p8FQLq_senderName",
			"shell": "p8FQLq_shell",
			"systemNote": "p8FQLq_systemNote",
			"topbar": "p8FQLq_topbar",
			"topbarTitle": "p8FQLq_topbarTitle",
			"topbarToggle": "p8FQLq_topbarToggle",
			"turnError": "p8FQLq_turnError"
		};
		//#endregion
		//#region src/client/StoryGameShell.tsx
		/**
		* The Stage-A game shell, rendered as a `shell.overlay` entry.
		*
		* While game mode is inactive the component returns null — no DOM at all, so
		* the DSH overlay layer stays click-through and ordinary chat keeps every
		* pointer, keyboard and screen-reader event. While active it paints an
		* opaque full-frame surface with its own header, three-column mock layout
		* and a 返回普通聊天 action, and isolates focus by marking the app frame's
		* other columns inert for as long as it is mounted.
		*/
		/** Narrow breakpoint (px) below which the side columns become drawers. */
		const NARROW_BREAKPOINT = 900;
		/**
		* Render the game shell overlay entry.
		* @param props - injected exit callback plus the bound `useGameMode` hook.
		* @returns the full-frame game shell, or null while game mode is inactive.
		*/
		function StoryGameShell({ exitGame, sendToAI, recoverAiTurn, cancelAiTurn, retryAiTurn, acknowledgeAiTurn, aiTurn, markWaitingChoice, forkAiSession, releaseAiSave, choices, useGameMode }) {
			const active = useGameMode((mode) => mode);
			const storage = (0, react.useMemo)(() => createLocalProjectionStorage(window.localStorage), []);
			const hostStorage = (0, react.useMemo)(() => new HostProjectionStorage(), []);
			const [screen, setScreen] = (0, react.useState)("library");
			const [packs, setPacks] = (0, react.useState)(() => [...INSTALLED_PACKS]);
			const [saves, setSaves] = (0, react.useState)([]);
			const [libraryError, setLibraryError] = (0, react.useState)();
			const [projection, setProjection] = (0, react.useState)(() => storage.load("lantern-demo-save") ?? createInitialProjection());
			const [view, setView] = (0, react.useState)(() => ({
				...initialViewState(projection.channels),
				selectedChannelId: projection.selectedChannelId,
				drafts: projection.drafts
			}));
			const [narrow, setNarrow] = (0, react.useState)(false);
			const [hostReady, setHostReady] = (0, react.useState)(false);
			const [syncErrors, setSyncErrors] = (0, react.useState)({});
			const [generatingSaves, setGeneratingSaves] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [choiceCard, setChoiceCard] = (0, react.useState)();
			const [choiceError, setChoiceError] = (0, react.useState)();
			const [, setTurnRefresh] = (0, react.useState)(0);
			const setSaveSyncError = (saveId, error) => {
				setSyncErrors((current) => updateSaveError(current, saveId, error));
			};
			(0, react.useEffect)(() => {
				if (!active) return;
				return choices.subscribe((card) => {
					setChoiceCard(card);
					if (card !== void 0) markWaitingChoice(projection.saveId, card.sessionId);
					if (card === void 0) setChoiceError(void 0);
				});
			}, [
				active,
				choices,
				markWaitingChoice,
				projection.saveId
			]);
			(0, react.useEffect)(() => {
				if (!active || screen !== "library") return;
				let cancelled = false;
				(async () => {
					try {
						const [list, catalog] = await Promise.all([hostStorage.list(), hostStorage.listPacks()]);
						if (cancelled) return;
						setSaves(list);
						setPacks(catalog);
						setLibraryError(void 0);
					} catch (error) {
						if (!cancelled) setLibraryError(error instanceof Error ? error.message : String(error));
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [
				active,
				screen,
				hostStorage
			]);
			(0, react.useEffect)(() => {
				if (!active || screen !== "game" || hostReady) return;
				let cancelled = false;
				const saveId = projection.saveId;
				(async () => {
					try {
						const remote = await hostStorage.load(saveId);
						if (cancelled) return;
						if (remote !== void 0) {
							storage.save(remote);
							setProjection((current) => current.saveId === saveId ? remote : current);
							setView((state) => ({
								...state,
								selectedChannelId: remote.selectedChannelId,
								drafts: remote.drafts
							}));
						} else await hostStorage.save(projection, true);
						setHostReady(true);
					} catch (error) {
						if (!cancelled) {
							setSaveSyncError(saveId, error instanceof Error ? error.message : String(error));
							setHostReady(true);
						}
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [
				active,
				screen,
				hostReady,
				hostStorage,
				projection,
				storage
			]);
			const persist = (next) => {
				const saveId = next.saveId;
				storage.save(next);
				hostStorage.save(next).then(() => {
					setSaveSyncError(saveId, void 0);
				}, (error) => {
					setSaveSyncError(saveId, error instanceof Error ? error.message : String(error));
				});
			};
			const commitAiResult = (saveId, channelId, result, turnId, fallback) => {
				const next = appendAiMessages(storage.load(saveId) ?? fallback, channelId, result.messages);
				storage.save(next);
				hostStorage.save(next).then(() => {
					if (turnId !== void 0) acknowledgeAiTurn(saveId, turnId);
					setSaveSyncError(saveId, void 0);
				}, (error) => {
					setSaveSyncError(saveId, error instanceof Error ? error.message : String(error));
				});
				setProjection((current) => current.saveId === saveId ? next : current);
			};
			const recoverPending = (save) => {
				if (generatingSaves.has(save.saveId)) return;
				setGeneratingSaves((current) => new Set(current).add(save.saveId));
				recoverAiTurn(save).then((recovered) => {
					if (recovered !== null) commitAiResult(save.saveId, recovered.channelId, recovered.result, recovered.turnId, save);
				}, (error) => {
					setSaveSyncError(save.saveId, error instanceof Error ? error.message : String(error));
				}).finally(() => {
					setGeneratingSaves((current) => {
						const next = new Set(current);
						next.delete(save.saveId);
						return next;
					});
				});
			};
			(0, react.useEffect)(() => {
				if (!active) return;
				const query = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
				const apply = () => {
					setNarrow(query.matches);
					if (query.matches) setView((state) => narrowFallback(state));
				};
				apply();
				query.addEventListener("change", apply);
				return () => {
					query.removeEventListener("change", apply);
				};
			}, [active]);
			(0, react.useEffect)(() => {
				if (!active) return;
				const layer = document.querySelector("[data-shell-overlay]");
				const frame = layer?.parentElement;
				const siblings = frame === void 0 || frame === null ? [] : Array.from(frame.children).filter((el) => el !== layer);
				for (const el of siblings) {
					el.inert = true;
					el.setAttribute("aria-hidden", "true");
				}
				return () => {
					for (const el of siblings) {
						el.inert = false;
						el.removeAttribute("aria-hidden");
					}
				};
			}, [active]);
			const selected = projection.channels.find((channel) => channel.id === view.selectedChannelId) ?? projection.channels[0];
			const playerId = projection.participants.find((participant) => participant.role === "player")?.id;
			const channelMessages = (0, react.useMemo)(() => projection.messages.filter((message) => message.channelId === selected.id), [selected.id, projection.messages]);
			const draft = projection.drafts[selected.id] ?? "";
			const syncError = saveErrorFor(syncErrors, projection.saveId);
			const turn = aiTurn(projection.saveId);
			const generating = generatingSaves.has(projection.saveId) || turn?.state === "queued" || turn?.state === "running" || turn?.state === "waiting-choice";
			(0, react.useEffect)(() => {
				if (!generating) return;
				const timer = window.setInterval(() => {
					setTurnRefresh((value) => value + 1);
				}, 500);
				return () => {
					window.clearInterval(timer);
				};
			}, [generating, projection.saveId]);
			const submit = () => {
				const text = draft.trim();
				if (text === "" || generating) return;
				const submitted = appendPlayerMessage(projection, selected.id, text);
				const saveId = submitted.saveId;
				persist(submitted);
				setProjection(submitted);
				setGeneratingSaves((current) => new Set(current).add(saveId));
				sendToAI(submitted, selected.id, text).then((result) => {
					commitAiResult(saveId, selected.id, result, result.turnId, submitted);
				}, (error) => {
					setSaveSyncError(saveId, error instanceof Error ? error.message : String(error));
				}).finally(() => {
					setGeneratingSaves((current) => {
						const next = new Set(current);
						next.delete(saveId);
						return next;
					});
				});
			};
			const cancelTurn = () => {
				const saveId = projection.saveId;
				cancelAiTurn(saveId).then(() => {
					setSaveSyncError(saveId, void 0);
					setGeneratingSaves((current) => {
						const next = new Set(current);
						next.delete(saveId);
						return next;
					});
				}, (error) => {
					setSaveSyncError(saveId, error instanceof Error ? error.message : String(error));
				});
			};
			const retryTurn = () => {
				if (generating) return;
				const retryProjection = projection;
				const saveId = retryProjection.saveId;
				setGeneratingSaves((current) => new Set(current).add(saveId));
				retryAiTurn(retryProjection).then((result) => {
					commitAiResult(saveId, aiTurn(saveId)?.channelId ?? selected.id, result, result.turnId, retryProjection);
				}, (error) => {
					setSaveSyncError(saveId, error instanceof Error ? error.message : String(error));
				}).finally(() => {
					setGeneratingSaves((current) => {
						const next = new Set(current);
						next.delete(saveId);
						return next;
					});
				});
			};
			const answerChoice = async (selectedLabels, custom) => {
				if (choiceCard === void 0) return;
				setChoiceError(void 0);
				try {
					await choices.answer(choiceCard, selectedLabels, custom);
					const latest = storage.load(projection.saveId) ?? projection;
					const recorded = appendChoiceRecord(latest, latest.channels.some((channel) => channel.id === selected.id) ? selected.id : latest.selectedChannelId, choiceCard.id, selectedLabels, custom);
					persist(recorded);
					setProjection((current) => current.saveId === recorded.saveId ? recorded : current);
					setChoiceCard(void 0);
				} catch (error) {
					setChoiceError(error instanceof Error ? error.message : String(error));
					throw error;
				}
			};
			/** Continue an existing save: load its projection (host first, local cache fallback). */
			const continueGame = (saveId) => {
				setHostReady(false);
				(async () => {
					try {
						const next = await hostStorage.load(saveId) ?? storage.load(saveId);
						if (next === void 0) throw new Error(`找不到存档：${saveId}`);
						storage.save(next);
						choices.bindSave(saveId);
						setProjection(next);
						setView((state) => ({
							...state,
							selectedChannelId: next.selectedChannelId,
							drafts: next.drafts
						}));
						setScreen("game");
						recoverPending(next);
					} catch (error) {
						setLibraryError(error instanceof Error ? error.message : String(error));
					}
				})();
			};
			/** Start a new game: mint a fresh save id and open the shell. */
			const newGame = (packId) => {
				try {
					const pack = packs.find((item) => item.packId === packId);
					if (pack === void 0) throw new Error(`找不到内容包：${packId}`);
					const saveId = newSaveId(packId);
					const next = createNewGame(pack, saveId);
					storage.save(next);
					choices.bindSave(saveId);
					setProjection(next);
					setView((state) => ({
						...state,
						selectedChannelId: next.selectedChannelId,
						drafts: next.drafts
					}));
					setHostReady(false);
					setScreen("game");
				} catch (error) {
					setLibraryError(error instanceof Error ? error.message : String(error));
				}
			};
			/** Back to the library from inside a game. */
			const backToLibrary = () => {
				setChoiceCard(void 0);
				choices.bindSave(null);
				setHostReady(false);
				setScreen("library");
			};
			/** Duplicate a save under a fresh id (save-as), then open the copy. */
			const saveAsGame = (saveId) => {
				(async () => {
					try {
						const source = await hostStorage.load(saveId);
						const fallback = storage.load(saveId);
						const base = source ?? fallback;
						if (base === void 0) throw new Error(`找不到存档：${saveId}`);
						const copy = cloneSave(base, newSaveId(base.packId));
						await forkAiSession(base.saveId, copy.saveId, base.packId);
						storage.save(copy);
						await hostStorage.save(copy, true);
						choices.bindSave(copy.saveId);
						setProjection(copy);
						setView((state) => ({
							...state,
							selectedChannelId: copy.selectedChannelId,
							drafts: copy.drafts
						}));
						setHostReady(false);
						setScreen("game");
						const list = await hostStorage.list().catch(() => void 0);
						if (list !== void 0) setSaves(list);
					} catch (error) {
						setLibraryError(error instanceof Error ? error.message : String(error));
					}
				})();
			};
			/** Delete a save (host + local cache); stays on the library. */
			const deleteSave = (saveId) => {
				if (!window.confirm(`确定删除存档「${saveId}」吗？此操作不可撤销。`)) return;
				(async () => {
					try {
						await cancelAiTurn(saveId);
						await hostStorage.remove(saveId);
						await releaseAiSave(saveId, saves.find((save) => save.saveId === saveId)?.packId);
						try {
							window.localStorage.removeItem(`dsh-story-save:${saveId}`);
						} catch {}
						setSaves(await hostStorage.list());
						setLibraryError(void 0);
					} catch (error) {
						setLibraryError(error instanceof Error ? error.message : String(error));
					}
				})();
			};
			(0, react.useEffect)(() => {
				if (!active) return;
				const onKey = (event) => {
					if (event.key === "Escape" && !event.isComposing) exitGame();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			}, [active, exitGame]);
			if (!active) return null;
			if (screen === "library") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoryGameLibrary, {
				packs,
				saves,
				onContinue: (saveId) => {
					continueGame(saveId);
				},
				onNewGame: (packId) => {
					newGame(packId);
				},
				onSaveAs: (saveId) => {
					saveAsGame(saveId);
				},
				onDelete: (saveId) => {
					deleteSave(saveId);
				},
				onExit: exitGame,
				error: libraryError
			});
			const onToggle = (side) => {
				setView((state) => togglePanel(state, side));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: StoryGameShell_module_css_default.shell,
				role: "dialog",
				"aria-label": "文字游戏",
				"data-narrow": narrow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: StoryGameShell_module_css_default.topbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: StoryGameShell_module_css_default.topbarToggle,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: StoryGameShell_module_css_default.iconButton,
									onClick: () => {
										onToggle("left");
									},
									"aria-label": view.leftOpen ? "收起频道列表" : "展开频道列表",
									"aria-pressed": view.leftOpen,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPanelLeftOutline16, { size: 16 })
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: StoryGameShell_module_css_default.topbarTitle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: StoryGameShell_module_css_default.channelTitle,
									children: selected.title
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: StoryGameShell_module_css_default.frameLabel,
									children: [
										projection.frame.seasonLabel,
										" · ",
										projection.frame.episodeLabel,
										" · ",
										projection.frame.sceneLabel
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: StoryGameShell_module_css_default.topbarToggle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: StoryGameShell_module_css_default.iconButton,
										onClick: () => {
											onToggle("right");
										},
										"aria-label": view.rightOpen ? "收起详情面板" : "展开详情面板",
										"aria-pressed": view.rightOpen,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPanelLeftOutline16, {
											size: 16,
											className: StoryGameShell_module_css_default.flipIcon
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: StoryGameShell_module_css_default.libraryButton,
										onClick: backToLibrary,
										children: "游戏库"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: StoryGameShell_module_css_default.backButton,
										onClick: exitGame,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 14 }), "返回普通聊天"]
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: StoryGameShell_module_css_default.body,
						children: [
							view.leftOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
								className: StoryGameShell_module_css_default.channelPane,
								"aria-label": "频道列表",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: StoryGameShell_module_css_default.paneHeader,
									children: projection.packTitle
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: StoryGameShell_module_css_default.channelList,
									children: projection.channels.map((channel) => {
										const last = projection.messages.filter((message) => message.channelId === channel.id).at(-1);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: channel.id === selected.id ? StoryGameShell_module_css_default.channelItemActive : StoryGameShell_module_css_default.channelItem,
											"aria-current": channel.id === selected.id ? "true" : void 0,
											onClick: () => {
												setView((state) => selectChannel(state, channel.id));
												setProjection((previous) => {
													const next = {
														...previous,
														selectedChannelId: channel.id,
														revision: previous.revision + 1,
														updatedAt: (/* @__PURE__ */ new Date()).toISOString()
													};
													persist(next);
													return next;
												});
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: StoryGameShell_module_css_default.channelKind,
													children: kindLabel(channel.kind)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: StoryGameShell_module_css_default.channelName,
													children: channel.title
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: StoryGameShell_module_css_default.channelLast,
													children: last === void 0 ? "" : formatActivity(last.createdAt)
												})
											]
										}) }, channel.id);
									})
								})]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
								className: StoryGameShell_module_css_default.messagePane,
								"aria-label": "频道消息",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: StoryGameShell_module_css_default.messageList,
										children: [channelMessages.map((message) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageRow, {
											message,
											scene: selected.kind === "scene",
											participants: projection.participants,
											playerId
										}, message.id)), turn?.preview?.channelId === selected.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
											className: StoryGameShell_module_css_default.preview,
											"aria-live": "polite",
											"aria-label": "AI 临时预览",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: StoryGameShell_module_css_default.previewLabel,
												children: "AI 临时预览（尚未写入剧情）"
											}), turn.preview.messages.map((message, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageRow, {
												message: {
													...message,
													id: `preview-${index}`,
													createdAt: "",
													senderId: message.senderId
												},
												scene: selected.kind === "scene",
												participants: projection.participants,
												playerId
											}, `${turn.preview.turnId}-${index}`))]
										}) : null]
									}),
									syncError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: StoryGameShell_module_css_default.turnError,
										role: "alert",
										children: ["存档或 AI 回合错误：", syncError]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: StoryGameShell_module_css_default.composer,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: StoryGameShell_module_css_default.input,
												value: draft,
												placeholder: "输入对白；可使用 (行动) 或 (系统)",
												"aria-label": `在 ${selected.title} 中输入`,
												onChange: (event) => {
													const text = event.target.value;
													setView((state) => setDraft(state, selected.id, text));
													setProjection((previous) => {
														const next = updateDraft(previous, selected.id, text);
														persist(next);
														return next;
													});
												},
												onKeyDown: (event) => {
													if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
														event.preventDefault();
														submit();
													}
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: StoryGameShell_module_css_default.sendButton,
												onClick: submit,
												disabled: generating,
												children: generating ? "生成中…" : "发送"
											}),
											generating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: StoryGameShell_module_css_default.cancelButton,
												onClick: cancelTurn,
												children: "取消"
											}) : null,
											turn !== null && (turn.state === "failed" || turn.state === "cancelled") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: StoryGameShell_module_css_default.retryButton,
												onClick: retryTurn,
												children: "重试"
											}) : null
										]
									}),
									turn?.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: StoryGameShell_module_css_default.turnError,
										role: "alert",
										children: ["AI 回合失败：", turn.error]
									}) : null
								]
							}),
							view.rightOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
								className: StoryGameShell_module_css_default.detailPane,
								"aria-label": "频道详情",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: StoryGameShell_module_css_default.paneHeader,
									children: "频道信息"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: StoryGameShell_module_css_default.detailBody,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: StoryGameShell_module_css_default.detailSection,
											children: ["类型：", kindLabel(selected.kind)]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: StoryGameShell_module_css_default.detailSection,
											children: "成员"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											className: StoryGameShell_module_css_default.memberList,
											children: selected.participantIds.map((id) => {
												const participant = projection.participants.find((item) => item.id === id);
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
													className: StoryGameShell_module_css_default.memberItem,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: StoryGameShell_module_css_default.memberAvatar,
														"aria-hidden": "true",
														children: (participant?.heroNameZh ?? participant?.realNameZh ?? "？").slice(0, 1)
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: participant === void 0 ? id : participant.heroNameZh ?? participant.realNameZh })]
												}, id);
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: StoryGameShell_module_css_default.detailSection,
											children: "当前位置"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: StoryGameShell_module_css_default.detailText,
											children: projection.frame.sceneLabel
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: StoryGameShell_module_css_default.demoNote,
											children: syncError === void 0 ? "v0.8 Beta：频道、消息与草稿已保存到宿主本地存档。" : `本地存档同步异常：${syncError}`
										})
									]
								})]
							}) : null
						]
					}),
					choiceCard !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceCard, {
						card: choiceCard,
						onAnswer: answerChoice
					}) : null,
					choiceError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: StoryGameShell_module_css_default.choiceError,
						role: "alert",
						children: choiceError
					}) : null
				]
			});
		}
		/** Render one structured mock message with the right visual class. */
		function MessageRow({ message, scene, participants, playerId }) {
			const sender = participants.find((participant) => participant.id === message.senderId);
			const name = sender === void 0 ? message.senderId : sender.heroNameZh ?? sender.realNameZh;
			if (message.kind === "narration") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: StoryGameShell_module_css_default.narration,
				children: message.content
			});
			if (message.kind === "system" || message.kind === "work-dispatch" || message.kind === "relationship" || message.kind === "episode-summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: StoryGameShell_module_css_default.systemNote,
				children: message.content
			});
			if (message.kind === "choice") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: StoryGameShell_module_css_default.choiceCard,
				children: message.content
			});
			const mine = message.senderId === playerId;
			if (message.kind === "action") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: mine ? StoryGameShell_module_css_default.actionMine : StoryGameShell_module_css_default.actionOther,
				children: [
					"（",
					name,
					"）",
					message.content
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: mine ? StoryGameShell_module_css_default.bubbleRowMine : StoryGameShell_module_css_default.bubbleRowOther,
				children: [!mine && scene ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: StoryGameShell_module_css_default.senderName,
					children: name
				}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: mine ? StoryGameShell_module_css_default.bubbleMine : StoryGameShell_module_css_default.bubbleOther,
					children: message.content
				})]
			});
		}
		/** Chinese labels for the five channel kinds. */
		function kindLabel(kind) {
			switch (kind) {
				case "direct": return "私聊";
				case "group": return "群聊";
				case "scene": return "现场";
				case "work": return "工作";
				case "system": return "系统";
			}
		}
		function formatActivity(value) {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false
			}).format(date);
		}
		//#endregion
		//#region src/client/rpc-shape.ts
		/** Unwrap a successful RPC result; throws with the host error message otherwise. */
		function unwrap(value, operation) {
			if (!value.result.ok) throw new Error(`${operation}失败：${value.result.error.message}`);
			return value.result.value;
		}
		//#endregion
		//#region src/client/ai-bridge.ts
		function assistantText(events, afterSeq) {
			const blocks = events.map((x) => x.event).filter((e) => e?.type === "assistant/message" && Number(e.seq) > afterSeq).at(-1)?.data?.message?.content;
			if (!Array.isArray(blocks)) return void 0;
			return blocks.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim() || void 0;
		}
		function turnEnded(events, afterSeq) {
			return events.some((x) => x.event?.type === "turn/end" && Number(x.event.seq) > afterSeq);
		}
		function parseMessages(raw, projection, channelId) {
			const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1] ?? raw;
			const parse = (text) => {
				const value = JSON.parse(text);
				if (!Array.isArray(value.messages)) throw new Error("AI 输出缺少 messages 数组");
				const id = (role) => role === "narration" || role === "narrator" ? projection.participants.find((p) => p.role === "narrator")?.id ?? role : role === "system" ? projection.participants.find((p) => p.role === "system")?.id ?? role : role;
				return value.messages.map((item) => ({
					senderId: id(String(item.senderId)),
					kind: String(item.kind),
					content: String(item.content)
				}));
			};
			const repair = (text) => {
				let out = "";
				let open = false;
				const cjk = (c) => c !== void 0 && /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(c);
				for (let i = 0; i < text.length; i++) {
					const ch = text[i];
					if (ch === "\\" && open) {
						out += ch + (text[i + 1] ?? "");
						i++;
						continue;
					}
					if (ch !== "\"") {
						out += ch;
						continue;
					}
					if (!open) {
						open = true;
						out += ch;
						continue;
					}
					const prev = text[i - 1], next = text[i + 1];
					if (cjk(prev) && (cjk(next) || next === "\"") || cjk(prev) && next === void 0) out += "\\\"";
					else {
						open = false;
						out += ch;
					}
				}
				return out;
			};
			try {
				return parse(fenced);
			} catch {
				const fixed = repair(fenced);
				if (fixed !== fenced) try {
					return parse(fixed);
				} catch {}
				throw new Error("AI 返回了无法解析的结构化消息；未写入剧情，请重试");
			}
		}
		var StoryAiBridge = class {
			api;
			storage;
			delay;
			cloneRuntime;
			constructor(api, storage, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), cloneRuntime = async (payload) => {
				const response = await fetch("/story-engine/api/runtime/clone", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
				if (!response.ok) {
					const detail = await response.json().catch(() => ({}));
					throw new Error(detail.error ?? `复制剧情状态失败：${response.status}`);
				}
			}) {
				this.api = api;
				this.storage = storage;
				this.delay = delay;
				this.cloneRuntime = cloneRuntime;
			}
			cached = /* @__PURE__ */ new Map();
			previews = /* @__PURE__ */ new Map();
			key(saveId) {
				return `dsh-story-ai-session:${saveId}`;
			}
			pendingKey(saveId) {
				return `dsh-story-ai-pending:${saveId}`;
			}
			orphanKey(saveId) {
				return `dsh-story-ai-orphan:${saveId}`;
			}
			remember(saveId, sessionId) {
				this.storage.setItem(this.key(saveId), sessionId);
				this.cached.set(saveId, sessionId);
			}
			readTurn(saveId) {
				const raw = this.storage.getItem(this.pendingKey(saveId));
				if (!raw) return null;
				try {
					const value = JSON.parse(raw);
					if (value.version === void 0 && typeof value.sessionId === "string" && typeof value.baseline === "number" && Number.isFinite(value.baseline) && typeof value.channelId === "string") {
						const migrated = {
							version: 1,
							id: `legacy-${value.sessionId}-${value.baseline}`,
							sessionId: value.sessionId,
							baseline: value.baseline,
							channelId: value.channelId,
							prompt: "",
							state: "running"
						};
						this.writeTurn(saveId, migrated);
						return migrated;
					}
					if (value.version !== 1 || typeof value.id !== "string" || typeof value.sessionId !== "string" || !Number.isFinite(value.baseline) || typeof value.channelId !== "string" || typeof value.prompt !== "string" || typeof value.state !== "string" || ![
						"queued",
						"running",
						"waiting-choice",
						"completed",
						"failed",
						"cancelled"
					].includes(value.state)) return null;
					return value;
				} catch {
					return null;
				}
			}
			writeTurn(saveId, turn) {
				this.storage.setItem(this.pendingKey(saveId), JSON.stringify(turn));
			}
			change(saveId, turn, change) {
				const next = {
					...turn,
					...change
				};
				if (next.state === "failed" || next.state === "cancelled") this.previews.delete(saveId);
				this.writeTurn(saveId, next);
				return next;
			}
			refresh(saveId, turn) {
				const stored = this.readTurn(saveId);
				return stored?.id === turn.id ? stored : turn;
			}
			ensureNotCancelled(saveId, turn) {
				const latest = this.refresh(saveId, turn);
				if (latest.state === "cancelled") throw new Error("AI 回合已取消");
				return latest;
			}
			turn(saveId) {
				const turn = this.readTurn(saveId);
				if (turn === null) return null;
				const preview = this.previews.get(saveId);
				return preview?.turnId === turn.id ? {
					...turn,
					preview
				} : turn;
			}
			acknowledge(saveId, turnId) {
				const turn = this.readTurn(saveId);
				if (turn?.id === turnId && turn.state === "completed") {
					this.storage.setItem(this.pendingKey(saveId), "");
					this.previews.delete(saveId);
				}
			}
			async session(saveId, agentPreset) {
				let id = this.currentSessionId(saveId);
				if (id === null) {
					id = crypto.randomUUID();
					this.remember(saveId, id);
				}
				const created = unwrap(await this.api.sessions.create({
					sessionId: id,
					cwd: "D:/DSH-Story-Engine",
					agentPreset
				}), "创建文字游戏会话");
				await this.api.workspace.archiveSession({ sessionId: created.sessionId });
				return created.sessionId;
			}
			currentSessionId(saveId) {
				const cached = this.cached.get(saveId);
				if (cached !== void 0) return cached;
				const persisted = this.storage.getItem(this.key(saveId));
				if (persisted === null || persisted.trim() === "") return null;
				this.cached.set(saveId, persisted);
				return persisted;
			}
			async forkSave(sourceSaveId, targetSaveId, packId) {
				const sourceSessionId = this.currentSessionId(sourceSaveId);
				if (sourceSessionId === null) return null;
				const forked = unwrap(await this.api.sessions.fork({
					sessionId: sourceSessionId,
					increaseTitle: false
				}), "复制文字游戏会话");
				await this.api.workspace.archiveSession({ sessionId: forked.sessionId });
				await this.cloneRuntime({
					packId,
					sourceSessionId,
					targetSessionId: forked.sessionId
				});
				this.remember(targetSaveId, forked.sessionId);
				return forked.sessionId;
			}
			/** DSH exposes archive/cancel but no safe session-delete RPC; retain a local diagnostic rather than guessing. */
			async releaseSave(saveId, packId) {
				const sessionId = this.currentSessionId(saveId);
				const turn = this.readTurn(saveId);
				if (turn !== null && [
					"queued",
					"running",
					"waiting-choice"
				].includes(turn.state)) throw new Error("删除前必须先取消仍在运行的 AI 回合");
				if (sessionId === null) return void 0;
				const diagnostic = {
					saveId,
					...packId === void 0 ? {} : { packId },
					sessionId,
					removedAt: (/* @__PURE__ */ new Date()).toISOString(),
					reason: "save-deleted",
					...turn === null ? {} : { lastTurnState: turn.state }
				};
				this.storage.setItem(this.orphanKey(saveId), JSON.stringify(diagnostic));
				this.storage.setItem(this.key(saveId), "");
				this.storage.setItem(this.pendingKey(saveId), "");
				this.cached.delete(saveId);
				this.previews.delete(saveId);
				return diagnostic;
			}
			async cancel(saveId) {
				const turn = this.readTurn(saveId);
				if (turn === null || ![
					"queued",
					"running",
					"waiting-choice"
				].includes(turn.state)) return;
				try {
					unwrap(await this.api.sessions.cancel({ sessionId: turn.sessionId }), "取消 AI 回合");
					this.previews.delete(saveId);
					this.change(saveId, turn, {
						state: "cancelled",
						error: void 0
					});
				} catch (error) {
					this.change(saveId, turn, {
						state: "failed",
						error: `取消失败：${error instanceof Error ? error.message : String(error)}`
					});
					throw error;
				}
			}
			markWaitingChoice(saveId, sessionId) {
				const turn = this.readTurn(saveId);
				if (turn !== null && turn.sessionId === sessionId && ["queued", "running"].includes(turn.state)) this.change(saveId, turn, { state: "waiting-choice" });
			}
			async wait(projection, initial) {
				let turn = initial;
				for (let attempt = 0; attempt < 3600; attempt += 1) {
					turn = this.ensureNotCancelled(projection.saveId, turn);
					await this.delay(500);
					turn = this.ensureNotCancelled(projection.saveId, turn);
					try {
						const history = unwrap(await this.api.sessions.history({
							sessionId: turn.sessionId,
							maxMessages: 20
						}), "读取回复");
						turn = this.ensureNotCancelled(projection.saveId, turn);
						const raw = assistantText(history.events, turn.baseline);
						if (raw !== void 0 && turnEnded(history.events, turn.baseline)) {
							let result;
							try {
								result = {
									raw,
									messages: parseMessages(raw, projection, turn.channelId)
								};
							} catch (error) {
								this.change(projection.saveId, turn, {
									state: "failed",
									error: error instanceof Error ? error.message : String(error)
								});
								throw error;
							}
							turn = this.change(projection.saveId, turn, {
								state: "completed",
								result,
								error: void 0
							});
							return {
								channelId: turn.channelId,
								result,
								turnId: turn.id
							};
						}
						if (raw !== void 0) try {
							this.previews.set(projection.saveId, {
								turnId: turn.id,
								channelId: turn.channelId,
								messages: parseMessages(raw, projection, turn.channelId)
							});
						} catch {}
						if (raw === void 0 && turnEnded(history.events, turn.baseline)) {
							const error = "AI 回合已结束，但没有产生结构化回复";
							this.change(projection.saveId, turn, {
								state: "failed",
								error
							});
							throw new Error(error);
						}
						if (turn.state === "queued") turn = this.change(projection.saveId, turn, { state: "running" });
					} catch (error) {
						turn = this.refresh(projection.saveId, turn);
						if (turn.state === "cancelled") throw new Error("AI 回合已取消");
						if (error instanceof Error && (error.message === "AI 回合已结束，但没有产生结构化消息" || error.message === "AI 回合已结束，但没有产生结构化回复" || error.message.includes("无法解析的结构化消息"))) throw error;
						this.change(projection.saveId, turn, {
							state: "failed",
							error: `读取 AI 回合失败：${error instanceof Error ? error.message : String(error)}`
						});
						throw error;
					}
				}
				const error = "AI 回合仍在运行；下次打开存档会自动继续等待";
				this.change(projection.saveId, turn, {
					state: "failed",
					error
				});
				throw new Error(error);
			}
			async recover(projection) {
				const turn = this.readTurn(projection.saveId);
				if (turn === null) return null;
				const sessionId = this.currentSessionId(projection.saveId);
				if (sessionId === null || sessionId !== turn.sessionId || !projection.channels.some((channel) => channel.id === turn.channelId)) {
					this.change(projection.saveId, turn, {
						state: "failed",
						error: "待恢复的 AI 回合与当前存档不匹配"
					});
					throw new Error("待恢复的 AI 回合与当前存档不匹配");
				}
				if (turn.state === "completed") {
					if (turn.result === void 0) throw new Error("已完成回合缺少可验证结果");
					return {
						channelId: turn.channelId,
						result: turn.result,
						turnId: turn.id
					};
				}
				if (turn.state === "cancelled" || turn.state === "failed") return null;
				return this.wait(projection, turn);
			}
			promptFor(projection, channelId, playerInput) {
				const channel = projection.channels.find((c) => c.id === channelId);
				if (channel === void 0) throw new Error("频道不存在");
				return `当前文字游戏频道：${channel.title}\n当前进度：${projection.frame.seasonLabel} ${projection.frame.episodeLabel} ${projection.frame.sceneLabel}\n玩家输入：${playerInput}\n可用发送者：${channel.participantIds.join(", ")}，旁白和系统也可使用。请推进剧情并调用必要的 story_* 工具。最终仅输出 JSON：{"messages":[{"senderId":"人物ID","kind":"dialogue|narration|action|system|work-dispatch|relationship|episode-summary","content":"内容"}]}。不得替玩家角色发言或决定。注意：content 内的对白引用请使用中文引号“”或「」，不要使用英文双引号 "，以免破坏 JSON 格式。`;
			}
			retryPrompt(projection, channelId) {
				const channel = projection.channels.find((c) => c.id === channelId);
				if (channel === void 0) throw new Error("频道不存在");
				return `继续刚才未完成的文字游戏回合。不要再次转述或提交玩家输入、选择或已提交的剧情消息。当前频道：${channel.title}；当前进度：${projection.frame.seasonLabel} ${projection.frame.episodeLabel} ${projection.frame.sceneLabel}。只在通过必要的 story_* 工具后输出新的结构化 JSON 回复。`;
			}
			async start(projection, channelId, prompt) {
				const sessionId = await this.session(projection.saveId, projection.agentPreset ?? `story-${projection.packId}`);
				const before = unwrap(await this.api.sessions.history({
					sessionId,
					maxMessages: 20
				}), "读取会话");
				const baseline = Math.max(-1, ...before.events.map((x) => Number(x.event?.seq ?? -1)));
				let turn = {
					version: 1,
					id: crypto.randomUUID(),
					sessionId,
					baseline,
					channelId,
					prompt,
					state: "queued"
				};
				this.previews.delete(projection.saveId);
				this.writeTurn(projection.saveId, turn);
				try {
					unwrap(await this.api.sessions.prompt({
						sessionId,
						mode: "queue",
						content: [{
							type: "text",
							text: prompt
						}],
						clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
					}), "发送");
					turn = this.change(projection.saveId, turn, { state: "running" });
					return await this.wait(projection, turn);
				} catch (error) {
					const latest = this.readTurn(projection.saveId);
					if (latest?.id === turn.id && ![
						"completed",
						"cancelled",
						"failed"
					].includes(latest.state)) this.change(projection.saveId, latest, {
						state: "failed",
						error: `发送 AI 回合失败：${error instanceof Error ? error.message : String(error)}`
					});
					throw error;
				}
			}
			async send(projection, channelId, playerInput) {
				const prior = this.readTurn(projection.saveId);
				if (prior !== null && [
					"queued",
					"running",
					"waiting-choice",
					"completed"
				].includes(prior.state)) throw new Error("当前存档已有待处理 AI 回合；请等待、恢复或取消后再发送");
				const completed = await this.start(projection, channelId, this.promptFor(projection, channelId, playerInput));
				return {
					...completed.result,
					turnId: completed.turnId
				};
			}
			async retry(projection) {
				const prior = this.readTurn(projection.saveId);
				if (prior === null || !["failed", "cancelled"].includes(prior.state) || prior.prompt === "") throw new Error("当前 AI 回合不可安全重试");
				const completed = await this.start(projection, prior.channelId, this.retryPrompt(projection, prior.channelId));
				return {
					...completed.result,
					turnId: completed.turnId
				};
			}
		};
		//#endregion
		//#region src/client/choice-bridge.ts
		/**
		* Create the game choice-card bridge over the DSH api client.
		* @param api - the shared connection api (same object StoryAiBridge receives).
		* @param sessionFor - resolves the active game session id for a save; only
		*   questions addressed to that session are surfaced, so a replayed card from
		*   a different save (or a stale session) never pollutes the current game.
		*/
		function createStoryChoiceBridge(api, sessionFor, onRequested) {
			const listeners = /* @__PURE__ */ new Set();
			const pendingBySession = /* @__PURE__ */ new Map();
			let disposed = false;
			let activeSaveId = null;
			const activeCard = () => {
				if (activeSaveId === null) return void 0;
				const sessionId = sessionFor(activeSaveId);
				return sessionId === null ? void 0 : pendingBySession.get(sessionId);
			};
			/** Bind the bridge to one save's session without discarding other saves' pending cards. */
			const bindSave = (saveId) => {
				activeSaveId = saveId;
				notify();
			};
			const notify = () => {
				const card = activeCard();
				for (const listener of [...listeners]) listener(card);
			};
			const resolveFrame = (rpcId, frame) => {
				if (frame.type === "question/requested") {
					const first = (frame.questions ?? [])[0];
					if (first === void 0) return;
					const next = {
						rpcId,
						sessionId: frame.sessionId,
						id: first.id,
						question: first.question,
						...first.header === void 0 ? {} : { header: first.header },
						...first.detail === void 0 ? {} : { detail: first.detail },
						options: first.options ?? [],
						...first.multiSelect === true ? { multiSelect: true } : {}
					};
					pendingBySession.set(frame.sessionId, next);
					onRequested?.(frame.sessionId);
					if (activeSaveId !== null && sessionFor(activeSaveId) === frame.sessionId) notify();
				} else if (frame.type === "question/resolved") {
					const pending = pendingBySession.get(frame.sessionId);
					if (pending !== void 0 && pending.rpcId === frame.questionRpcId) {
						pendingBySession.delete(frame.sessionId);
						if (activeSaveId !== null && sessionFor(activeSaveId) === frame.sessionId) notify();
					}
				}
			};
			const controller = new AbortController();
			(async () => {
				while (!disposed) {
					try {
						for await (const envelope of api.events.mux({}, controller.signal)) {
							if (disposed) break;
							resolveFrame(envelope.rpcId, envelope.payload);
						}
					} catch (error) {
						if (!disposed) console.error("[story-choice] mux stream ended; reconnecting:", error);
					}
					if (!disposed) await new Promise((resolve) => setTimeout(resolve, 500));
				}
			})();
			return {
				subscribe(listener) {
					listeners.add(listener);
					listener(activeCard());
					return () => {
						listeners.delete(listener);
					};
				},
				bindSave(saveId) {
					bindSave(saveId);
				},
				async answer(current, selected, custom) {
					const pending = pendingBySession.get(current.sessionId);
					if (pending === void 0 || pending.rpcId !== current.rpcId) throw new Error("选择已失效，请重新触发");
					const answer = {
						id: pending.id,
						selected: [...selected],
						...custom === void 0 ? {} : { custom }
					};
					const message = {
						type: "client-response",
						rpcId: pending.rpcId,
						result: {
							ok: true,
							value: {
								sessionId: pending.sessionId,
								answer: { answers: [answer] }
							}
						}
					};
					const receipt = await api.respond(message);
					if (receipt.accepted !== true) throw new Error(`回答未被接受：${receipt.reason ?? "unknown"}`);
					pendingBySession.delete(pending.sessionId);
					if (activeSaveId !== null && sessionFor(activeSaveId) === pending.sessionId) notify();
				},
				dispose() {
					disposed = true;
					controller.abort();
					listeners.clear();
				}
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services: the slot registry (declaration lifetimes + registration). */
		const inject = ["slots", "connection"];
		/**
		* Client plugin body: one shared game-mode controller, then both entries.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const controller = createGameModeController();
			const connection = ctx.get("connection");
			const ai = new StoryAiBridge(connection.api, window.localStorage);
			const choices = createStoryChoiceBridge(connection.api, (saveId) => ai.currentSessionId(saveId));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "story-game",
				inject: () => ({
					enterGame: controller.enter,
					hooks: { gameMode: controller.source }
				})
			}, StoryGameAction));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "story-game-shell",
				inject: () => ({
					exitGame: controller.exit,
					sendToAI: (projection, channelId, input) => ai.send(projection, channelId, input),
					recoverAiTurn: (projection) => ai.recover(projection),
					cancelAiTurn: (saveId) => ai.cancel(saveId),
					retryAiTurn: (projection) => ai.retry(projection),
					acknowledgeAiTurn: (saveId, turnId) => ai.acknowledge(saveId, turnId),
					aiTurn: (saveId) => ai.turn(saveId),
					markWaitingChoice: (saveId, sessionId) => ai.markWaitingChoice(saveId, sessionId),
					forkAiSession: (sourceSaveId, targetSaveId, packId) => ai.forkSave(sourceSaveId, targetSaveId, packId),
					releaseAiSave: (saveId, packId) => ai.releaseSave(saveId, packId),
					choices,
					hooks: { gameMode: controller.source }
				})
			}, StoryGameShell));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map