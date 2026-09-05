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
		//#region \0dsh-css:src/client/StoryGameAction.module.css.mjs
		const css$3 = ".t9akCq_action{width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;font-size:14px;display:flex}.t9akCq_action:hover{background:var(--dsw-alias-interactive-bg-hover)}.t9akCq_action:focus-visible,.t9akCq_railAction:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}.t9akCq_label{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.t9akCq_railAction{width:36px;height:36px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;justify-content:center;align-items:center;margin:8px 0 10px;display:flex}.t9akCq_railAction:hover{background:var(--dsw-alias-interactive-bg-hover)}";
		const tagId$3 = "dsh-story-client/3824d67190b4.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var StoryGameAction_module_css_default = {
			"action": "t9akCq_action",
			"label": "t9akCq_label",
			"railAction": "t9akCq_railAction"
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
		function appendAiMessages(projection, channelId, inputs, now = /* @__PURE__ */ new Date(), commitTurnId) {
			const channel = projection.channels.find((c) => c.id === channelId);
			if (!channel) throw new Error("频道不存在");
			const player = projection.participants.find((p) => p.role === "player");
			if (inputs.length === 0) throw new Error("AI 消息不能为空");
			const allowed = new Set([...channel.participantIds, ...projection.participants.filter((p) => p.role === "narrator" || p.role === "system").map((p) => p.id)]);
			const normalized = inputs.map((input) => {
				if (input.senderId === player?.id) throw new Error("AI 不能替玩家发送消息");
				if (!allowed.has(input.senderId)) throw new Error(`发送者不属于频道：${input.senderId}`);
				const content = input.content.trim();
				if (!content) throw new Error("AI 消息内容不能为空");
				return {
					senderId: input.senderId,
					kind: input.kind,
					content
				};
			});
			const stableTurnId = commitTurnId?.trim();
			if (commitTurnId !== void 0 && !stableTurnId) throw new Error("AI 回合 ID 不能为空");
			if (stableTurnId) {
				const existing = projection.messages.filter((message) => message.turnId === stableTurnId);
				if (existing.length) {
					if (existing.length === normalized.length && existing.every((message, index) => {
						const expected = normalized[index];
						return message.channelId === channelId && message.senderId === expected.senderId && message.kind === expected.kind && message.content === expected.content && message.canonStatus === "committed";
					})) return projection;
					throw new Error(`AI 回合提交冲突：${stableTurnId}`);
				}
			}
			const createdAt = now.toISOString();
			const turnId = stableTurnId ?? `turn-${projection.revision + 1}`;
			const messages = normalized.map((input, index) => ({
				id: stableTurnId ? `ai-${stableTurnId}-${index + 1}` : `ai-${now.getTime()}-${projection.messages.length + index + 1}`,
				channelId,
				senderId: input.senderId,
				kind: input.kind,
				content: input.content,
				createdAt,
				seasonId: projection.frame.seasonLabel,
				episodeId: projection.frame.episodeLabel,
				sceneId: projection.frame.sceneLabel,
				turnId,
				canonStatus: "committed"
			}));
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
		//#region src/client/submission-failure-reconciliation.ts
		/**
		* Reconcile the projection after sendToAI rejects.
		*
		* The player projection is persisted to Host before hidden dispatch. A later
		* deterministic terminal failure can therefore clear the local AI turn while
		* the Host still durably owns the submitted player message. Never infer
		* rollback from `aiTurn === null`; re-read Host first. If Host availability is
		* itself uncertain, keep the submitted local projection rather than erasing a
		* write that may already be durable.
		*/
		async function projectionAfterFailedSubmission(host, saveId, beforeSubmit, submitted, hasPendingOrRecoveryTurn) {
			try {
				const authoritative = await host.load(saveId);
				if (authoritative !== void 0) return authoritative;
			} catch {
				return submitted;
			}
			return hasPendingOrRecoveryTurn ? submitted : beforeSubmit;
		}
		//#endregion
		//#region \0dsh-css:src/client/ChoiceCard.module.css.mjs
		const css$2 = ".RZQ40W_overlay{z-index:20;background:#0a0e168c;justify-content:center;align-items:center;padding:24px;display:flex;position:absolute;inset:0}.RZQ40W_card{color:#1b2430;background:#fff;border-radius:14px;flex-direction:column;gap:12px;width:min(560px,100%);max-height:85%;padding:20px 22px;display:flex;overflow:auto;box-shadow:0 18px 50px #00000059}.RZQ40W_headerRow{justify-content:space-between;align-items:center;gap:12px;display:flex}.RZQ40W_eyebrow{letter-spacing:.08em;color:#667085;text-transform:uppercase;font-size:12px;font-weight:600}.RZQ40W_dismiss{color:#667085;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:2px 6px;font-size:18px;line-height:1}.RZQ40W_dismiss:hover{color:#1b2430;background:#f2f4f7}.RZQ40W_question{color:#1b2430;font-size:16px;font-weight:600;line-height:1.5}.RZQ40W_detail{color:#475467;font-size:13px;line-height:1.6}.RZQ40W_options{flex-direction:column;gap:8px;display:flex}.RZQ40W_option,.RZQ40W_optionActive{text-align:left;cursor:pointer;background:#fff;border:1px solid #d0d5dd;border-radius:10px;flex-direction:column;gap:2px;padding:10px 12px;display:flex}.RZQ40W_option:hover{border-color:#98a2b3}.RZQ40W_optionActive{background:#eef4ff;border-color:#2f6fed;box-shadow:inset 0 0 0 1px #2f6fed}.RZQ40W_optionLabel{color:#1b2430;font-size:14px;font-weight:500}.RZQ40W_optionDesc{color:#475467;font-size:12px;line-height:1.5}.RZQ40W_composer{gap:8px;margin-top:2px;display:flex}.RZQ40W_input{color:#1b2430;background:#fff;border:1px solid #d0d5dd;border-radius:8px;flex:1;padding:8px 10px;font-size:13px}.RZQ40W_input:focus{border-color:#2f6fed;outline:none;box-shadow:0 0 0 2px #2f6fed26}.RZQ40W_send{color:#fff;cursor:pointer;background:#2f6fed;border:none;border-radius:8px;padding:0 16px;font-size:13px;font-weight:600}.RZQ40W_send:disabled{cursor:default;background:#b2c3f0}";
		const tagId$2 = "dsh-story-client/846fbcd8f2fe.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ChoiceCard_module_css_default = {
			"card": "RZQ40W_card",
			"composer": "RZQ40W_composer",
			"detail": "RZQ40W_detail",
			"dismiss": "RZQ40W_dismiss",
			"eyebrow": "RZQ40W_eyebrow",
			"headerRow": "RZQ40W_headerRow",
			"input": "RZQ40W_input",
			"option": "RZQ40W_option",
			"optionActive": "RZQ40W_optionActive",
			"optionDesc": "RZQ40W_optionDesc",
			"optionLabel": "RZQ40W_optionLabel",
			"options": "RZQ40W_options",
			"overlay": "RZQ40W_overlay",
			"question": "RZQ40W_question",
			"send": "RZQ40W_send"
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
		//#region \0dsh-css:src/client/StoryGameLibrary.module.css.mjs
		const css$1 = "._4DdU4q_library{color:#1b2430;background:#f6f7f9;flex-direction:column;display:flex;position:absolute;inset:0;overflow:auto}._4DdU4q_header{background:#fff;border-bottom:1px solid #e4e7ec;justify-content:space-between;align-items:center;padding:16px 24px;display:flex}._4DdU4q_headerTitle{align-items:baseline;gap:10px;display:flex}._4DdU4q_logo{color:#1b2430;font-size:18px;font-weight:700}._4DdU4q_tagline{color:#667085;font-size:13px}._4DdU4q_exit{color:#344054;cursor:pointer;background:#fff;border:1px solid #d0d5dd;border-radius:8px;padding:6px 12px;font-size:13px}._4DdU4q_exit:hover{border-color:#98a2b3}._4DdU4q_body{width:100%;max-width:860px;margin:0 auto;padding:24px}._4DdU4q_error{color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;margin-bottom:16px;padding:10px 14px;font-size:13px}._4DdU4q_packList{flex-direction:column;gap:16px;display:flex}._4DdU4q_pack{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:16px 18px}._4DdU4q_packHead{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}._4DdU4q_packMeta{flex-direction:column;gap:4px;display:flex}._4DdU4q_packTitle{color:#1b2430;margin:0;font-size:16px;font-weight:600}._4DdU4q_packInfo{color:#667085;gap:10px;font-size:12px;display:flex}._4DdU4q_badge{color:#92400e;background:#fef3c7;border-radius:4px;padding:1px 6px}._4DdU4q_newGame{color:#fff;cursor:pointer;white-space:nowrap;background:#2f6fed;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600}._4DdU4q_newGame:hover{background:#2459c8}._4DdU4q_packDesc{color:#475467;margin:10px 0 12px;font-size:13px;line-height:1.6}._4DdU4q_saveList{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}._4DdU4q_saveRow{cursor:pointer;text-align:left;background:#fff;border:1px solid #d0d5dd;border-radius:10px;align-items:center;gap:12px;width:100%;padding:10px 12px;display:flex}._4DdU4q_saveRow:hover{border-color:#2f6fed;box-shadow:inset 0 0 0 1px #2f6fed}._4DdU4q_saveName{color:#1b2430;flex:1;font-size:13px;font-weight:500}._4DdU4q_saveMeta{color:#667085;font-size:12px}._4DdU4q_saveAction{color:#2f6fed;font-size:12px;font-weight:600}._4DdU4q_empty{color:#98a2b3;margin:8px 0 0;font-size:13px}._4DdU4q_saveItem{flex-direction:column;gap:4px;display:flex}._4DdU4q_saveRowWrap{align-items:stretch;gap:6px;display:flex}._4DdU4q_saveRow{flex:1}._4DdU4q_saveOps{align-items:stretch;gap:6px;display:flex}._4DdU4q_opButton,._4DdU4q_opDanger{cursor:pointer;color:#344054;background:#fff;border:1px solid #d0d5dd;border-radius:8px;padding:0 10px;font-size:12px}._4DdU4q_opButton:hover{color:#2f6fed;border-color:#2f6fed}._4DdU4q_opDanger{color:#b42318}._4DdU4q_opDanger:hover{background:#fef3f2;border-color:#b42318}";
		const tagId$1 = "dsh-story-client/4fbeb0e61a5c.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var StoryGameLibrary_module_css_default = {
			"badge": "_4DdU4q_badge",
			"body": "_4DdU4q_body",
			"empty": "_4DdU4q_empty",
			"error": "_4DdU4q_error",
			"exit": "_4DdU4q_exit",
			"header": "_4DdU4q_header",
			"headerTitle": "_4DdU4q_headerTitle",
			"library": "_4DdU4q_library",
			"logo": "_4DdU4q_logo",
			"newGame": "_4DdU4q_newGame",
			"opButton": "_4DdU4q_opButton",
			"opDanger": "_4DdU4q_opDanger",
			"pack": "_4DdU4q_pack",
			"packDesc": "_4DdU4q_packDesc",
			"packHead": "_4DdU4q_packHead",
			"packInfo": "_4DdU4q_packInfo",
			"packList": "_4DdU4q_packList",
			"packMeta": "_4DdU4q_packMeta",
			"packTitle": "_4DdU4q_packTitle",
			"saveAction": "_4DdU4q_saveAction",
			"saveItem": "_4DdU4q_saveItem",
			"saveList": "_4DdU4q_saveList",
			"saveMeta": "_4DdU4q_saveMeta",
			"saveName": "_4DdU4q_saveName",
			"saveOps": "_4DdU4q_saveOps",
			"saveRow": "_4DdU4q_saveRow",
			"saveRowWrap": "_4DdU4q_saveRowWrap",
			"tagline": "_4DdU4q_tagline"
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
		//#region \0dsh-css:src/client/StoryGameShell.module.css.mjs
		const css = ".Swldya_shell{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);flex-direction:column;font-size:14px;display:flex;position:absolute;inset:0;overflow:hidden}.Swldya_topbar{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;justify-content:space-between;align-items:center;gap:12px;height:52px;padding:0 12px;display:flex}.Swldya_topbarTitle{flex-direction:column;align-items:center;gap:2px;min-width:0;display:flex}.Swldya_channelTitle{white-space:nowrap;text-overflow:ellipsis;font-weight:600;overflow:hidden}.Swldya_frameLabel{color:var(--dsw-alias-label-tertiary);font-size:12px}.Swldya_topbarToggle{align-items:center;gap:8px;display:flex}.Swldya_iconButton{width:32px;height:32px;color:inherit;cursor:pointer;background:0 0;border:none;border-radius:8px;justify-content:center;align-items:center;display:flex}.Swldya_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.Swldya_iconButton:focus-visible,.Swldya_backButton:focus-visible,.Swldya_channelItem:focus-visible,.Swldya_sendButton:focus-visible,.Swldya_input:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}.Swldya_flipIcon{transform:scaleX(-1)}.Swldya_backButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:32px;color:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:4px;padding:0 12px;font-size:13px;display:flex}.Swldya_backButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.Swldya_body{flex:1;min-height:0;display:flex}.Swldya_channelPane{border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:none;width:264px;display:flex;overflow-y:auto}.Swldya_paneHeader{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;flex:none;padding:12px 12px 8px;font-size:12px;overflow:hidden}.Swldya_channelList{flex-direction:column;gap:2px;margin:0;padding:0 8px 12px;list-style:none;display:flex}.Swldya_channelItem,.Swldya_channelItemActive{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;grid-template-columns:36px 1fr auto;align-items:center;gap:6px;padding:8px;font-size:13px;display:grid}.Swldya_channelItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.Swldya_channelItemActive{background:var(--dsw-alias-interactive-bg-active);font-weight:600}.Swldya_channelKind{color:var(--dsw-alias-label-tertiary);font-size:11px}.Swldya_channelName{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.Swldya_channelLast{color:var(--dsw-alias-label-tertiary);font-size:11px}.Swldya_messagePane{flex-direction:column;flex:1;min-width:0;display:flex}.Swldya_messageList{flex-direction:column;flex:1;gap:8px;min-height:0;padding:16px;display:flex;overflow-y:auto}.Swldya_preview{border:1px dashed var(--dsw-alias-border-l2);opacity:.72;border-radius:10px;flex-direction:column;gap:8px;padding:10px;display:flex}.Swldya_previewLabel{color:var(--dsw-alias-label-tertiary);text-align:center;font-size:12px}.Swldya_bubbleRowMine,.Swldya_bubbleRowOther{flex-direction:column;max-width:68%;display:flex}.Swldya_bubbleRowMine{align-self:flex-end;align-items:flex-end}.Swldya_bubbleRowOther{align-self:flex-start;align-items:flex-start}.Swldya_senderName{color:var(--dsw-alias-label-tertiary);margin-bottom:2px;font-size:12px}.Swldya_bubbleMine,.Swldya_bubbleOther{white-space:pre-wrap;word-break:break-word;border-radius:12px;padding:8px 12px}.Swldya_bubbleMine{background:var(--dsw-alias-interactive-bg-active)}.Swldya_bubbleOther{background:var(--dsw-alias-bg-layer-2)}.Swldya_narration{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);text-align:center;border-radius:10px;align-self:stretch;padding:10px 14px;font-style:italic}.Swldya_systemNote{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);text-align:center;border-radius:8px;align-self:center;padding:4px 12px;font-size:12px}.Swldya_choiceCard{border:1px dashed var(--dsw-alias-border-l2);text-align:center;border-radius:10px;align-self:stretch;padding:10px 14px}.Swldya_actionMine,.Swldya_actionOther{color:var(--dsw-alias-label-secondary);align-self:stretch;padding:2px 8px;font-size:13px}.Swldya_actionMine{text-align:right}.Swldya_composer{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;gap:8px;padding:12px;display:flex}.Swldya_input{resize:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);min-height:44px;max-height:120px;color:inherit;font:inherit;border-radius:10px;flex:1;padding:10px 12px}.Swldya_sendButton{background:var(--dsw-alias-interactive-bg-active);height:40px;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:10px;flex:none;align-self:flex-end;padding:0 18px;font-size:13px}.Swldya_cancelButton,.Swldya_retryButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:40px;color:inherit;cursor:pointer;border-radius:10px;flex:none;align-self:flex-end;padding:0 12px;font-size:13px}.Swldya_retryButton{background:var(--dsw-alias-interactive-bg-active)}.Swldya_turnError{border-top:1px solid var(--dsw-alias-border-l1);color:#92400e;background:#fef3c7;flex:none;padding:8px 12px;font-size:12px}.Swldya_detailPane{border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:none;width:232px;display:flex;overflow-y:auto}.Swldya_detailBody{flex-direction:column;gap:8px;padding:0 12px 12px;display:flex}.Swldya_detailSection{margin-top:8px;font-size:12px;font-weight:600}.Swldya_detailText{color:var(--dsw-alias-label-secondary);font-size:13px}.Swldya_memberList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}.Swldya_memberItem{align-items:center;gap:8px;font-size:13px;display:flex}.Swldya_memberAvatar{background:var(--dsw-alias-interactive-bg-active);border-radius:50%;justify-content:center;align-items:center;width:26px;height:26px;font-size:12px;display:flex}.Swldya_demoNote{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);border-radius:8px;margin-top:12px;padding:8px 10px;font-size:12px}.Swldya_shell[data-narrow=true] .Swldya_channelPane,.Swldya_shell[data-narrow=true] .Swldya_detailPane{z-index:2;position:absolute;top:52px;bottom:0;box-shadow:0 0 24px #0000002e}.Swldya_shell[data-narrow=true] .Swldya_channelPane{left:0}.Swldya_shell[data-narrow=true] .Swldya_detailPane{right:0}.Swldya_shell[data-narrow=true] .Swldya_frameLabel{display:none}.Swldya_choiceError{color:#92400e;z-index:30;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;max-width:80%;padding:8px 14px;font-size:13px;position:absolute;bottom:84px;left:50%;transform:translate(-50%)}.Swldya_libraryButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:32px;color:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:4px;padding:0 12px;font-size:13px;display:flex}.Swldya_libraryButton:hover{border-color:var(--dsw-alias-border-l2)}";
		const tagId = "dsh-story-client/78d12c003b1c.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-story-client";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var StoryGameShell_module_css_default = {
			"actionMine": "Swldya_actionMine",
			"actionOther": "Swldya_actionOther",
			"backButton": "Swldya_backButton",
			"body": "Swldya_body",
			"bubbleMine": "Swldya_bubbleMine",
			"bubbleOther": "Swldya_bubbleOther",
			"bubbleRowMine": "Swldya_bubbleRowMine",
			"bubbleRowOther": "Swldya_bubbleRowOther",
			"cancelButton": "Swldya_cancelButton",
			"channelItem": "Swldya_channelItem",
			"channelItemActive": "Swldya_channelItemActive",
			"channelKind": "Swldya_channelKind",
			"channelLast": "Swldya_channelLast",
			"channelList": "Swldya_channelList",
			"channelName": "Swldya_channelName",
			"channelPane": "Swldya_channelPane",
			"channelTitle": "Swldya_channelTitle",
			"choiceCard": "Swldya_choiceCard",
			"choiceError": "Swldya_choiceError",
			"composer": "Swldya_composer",
			"demoNote": "Swldya_demoNote",
			"detailBody": "Swldya_detailBody",
			"detailPane": "Swldya_detailPane",
			"detailSection": "Swldya_detailSection",
			"detailText": "Swldya_detailText",
			"flipIcon": "Swldya_flipIcon",
			"frameLabel": "Swldya_frameLabel",
			"iconButton": "Swldya_iconButton",
			"input": "Swldya_input",
			"libraryButton": "Swldya_libraryButton",
			"memberAvatar": "Swldya_memberAvatar",
			"memberItem": "Swldya_memberItem",
			"memberList": "Swldya_memberList",
			"messageList": "Swldya_messageList",
			"messagePane": "Swldya_messagePane",
			"narration": "Swldya_narration",
			"paneHeader": "Swldya_paneHeader",
			"preview": "Swldya_preview",
			"previewLabel": "Swldya_previewLabel",
			"retryButton": "Swldya_retryButton",
			"sendButton": "Swldya_sendButton",
			"senderName": "Swldya_senderName",
			"shell": "Swldya_shell",
			"systemNote": "Swldya_systemNote",
			"topbar": "Swldya_topbar",
			"topbarTitle": "Swldya_topbarTitle",
			"topbarToggle": "Swldya_topbarToggle",
			"turnError": "Swldya_turnError"
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
		function StoryGameShell({ exitGame, sendToAI, recoverAiTurn, cancelAiTurn, retryAiTurn, acknowledgeAiTurn, assertAiSaveQuiescent, aiTurn, markWaitingChoice, forkAiSession, releaseAiSave, choices, useGameMode }) {
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
				const next = appendAiMessages(storage.load(saveId) ?? fallback, channelId, result.messages, /* @__PURE__ */ new Date(), turnId);
				storage.save(next);
				hostStorage.save(next).then(async () => {
					if (turnId !== void 0) await acknowledgeAiTurn(saveId, turnId);
					setSaveSyncError(saveId, void 0);
				}).catch((error) => {
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
			const submitBlocked = generating || turn !== null;
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
				if (text === "" || submitBlocked) return;
				const beforeSubmit = projection;
				const submitted = appendPlayerMessage(beforeSubmit, selected.id, text);
				const saveId = submitted.saveId;
				storage.save(submitted);
				setProjection(submitted);
				setGeneratingSaves((current) => new Set(current).add(saveId));
				sendToAI(submitted, selected.id, text).then((result) => {
					commitAiResult(saveId, selected.id, result, result.turnId, submitted);
				}, async (error) => {
					const reconciled = await projectionAfterFailedSubmission(hostStorage, saveId, beforeSubmit, submitted, aiTurn(saveId) !== null);
					storage.save(reconciled);
					setProjection((current) => current.saveId === saveId ? reconciled : current);
					setView((state) => ({
						...state,
						selectedChannelId: reconciled.selectedChannelId,
						drafts: reconciled.drafts
					}));
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
						if (aiTurn(saveId) !== null) throw new Error("当前存档仍有未收口 AI 回合，完成恢复/重试后才能另存为");
						await assertAiSaveQuiescent(saveId);
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
						if (aiTurn(saveId) !== null) throw new Error("当前存档仍有未收口 AI 回合，完成事务对账后才能删除");
						await assertAiSaveQuiescent(saveId);
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
											disabled: submitBlocked,
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
												disabled: submitBlocked,
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
												disabled: submitBlocked,
												children: generating ? "生成中…" : turn?.state === "cancelled" ? "待 D2c 对账" : turn !== null ? "待恢复" : "发送"
											}),
											generating || turn?.state === "uncertain" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: StoryGameShell_module_css_default.cancelButton,
												onClick: cancelTurn,
												children: "取消"
											}) : null,
											turn !== null && (turn.state === "uncertain" || turn.state === "completed") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: StoryGameShell_module_css_default.retryButton,
												onClick: () => {
													recoverPending(projection);
												},
												children: "恢复"
											}) : null,
											turn?.state === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
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
		function eventTurn(event) {
			const value = Number(event?.data?.turn);
			return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		function eventSeq$1(event) {
			const value = Number(event?.seq);
			return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		function nativeTurnForRequest(events, afterSeq, requestId) {
			const ordered = events.map((entry) => entry.event).filter((event) => eventSeq$1(event) !== void 0 && Number(event.seq) > afterSeq).sort((left, right) => Number(left.seq) - Number(right.seq));
			const turns = /* @__PURE__ */ new Set();
			let activeTurn;
			for (const event of ordered) {
				if (event?.type === "turn/start") {
					activeTurn = eventTurn(event);
					continue;
				}
				if (event?.type !== "user/message") continue;
				const source = event?.data?.source;
				if (source?.kind !== "user" || source.rpcId !== requestId) continue;
				if (activeTurn !== void 0) turns.add(activeTurn);
			}
			if (turns.size > 1) throw new Error(`DSH request correlation 匹配多个 native turn：${requestId}`);
			return turns.values().next().value;
		}
		function hasNativeTurnStart(events, afterSeq, dshTurn) {
			return events.some((entry) => entry.event?.type === "turn/start" && Number(entry.event.seq) > afterSeq && eventTurn(entry.event) === dshTurn);
		}
		function assistantText(events, afterSeq, dshTurn) {
			const data = events.map((x) => x.event).filter((e) => e?.type === "assistant/message" && Number(e.seq) > afterSeq && (dshTurn === void 0 || eventTurn(e) === dshTurn)).at(-1)?.data;
			const blocks = data?.message?.content ?? data?.content;
			if (!Array.isArray(blocks)) return void 0;
			return blocks.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim() || void 0;
		}
		function turnEnded(events, afterSeq, dshTurn) {
			return events.some((x) => {
				const event = x.event;
				return event?.type === "turn/end" && Number(event.seq) > afterSeq && (dshTurn === void 0 || eventTurn(event) === dshTurn);
			});
		}
		function responseRpcId(value) {
			const raw = value.rpcId;
			return typeof raw === "string" && raw.trim() !== "" ? raw : void 0;
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
					if (value.version !== 1 || typeof value.id !== "string" || typeof value.sessionId !== "string" || !Number.isFinite(value.baseline) || typeof value.channelId !== "string" || typeof value.prompt !== "string" || typeof value.state !== "string" || value.dshRequestId !== void 0 && typeof value.dshRequestId !== "string" || value.dshTurn !== void 0 && (!Number.isSafeInteger(value.dshTurn) || value.dshTurn < 0) || ![
						"queued",
						"running",
						"waiting-choice",
						"uncertain",
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
				if (turn?.id === turnId && [
					"completed",
					"failed",
					"cancelled"
				].includes(turn.state)) {
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
					"waiting-choice",
					"uncertain"
				].includes(turn.state)) throw new Error("删除前必须先取消仍在运行或结果不确定的 AI 回合");
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
					"waiting-choice",
					"uncertain"
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
						state: "uncertain",
						error: `取消结果不确定：${error instanceof Error ? error.message : String(error)}`
					});
					throw error;
				}
			}
			markWaitingChoice(saveId, sessionId) {
				const turn = this.readTurn(saveId);
				if (turn !== null && turn.sessionId === sessionId && [
					"queued",
					"running",
					"uncertain"
				].includes(turn.state)) this.change(saveId, turn, { state: "waiting-choice" });
			}
			async correlatedHistory(turn, tail) {
				const requestId = turn.dshRequestId;
				if (requestId === void 0) return {
					events: tail.events,
					...turn.dshTurn === void 0 ? {} : { dshTurn: turn.dshTurn }
				};
				let page = tail;
				let events = [...tail.events];
				let dshTurn = turn.dshTurn ?? nativeTurnForRequest(events, turn.baseline, requestId);
				for (let pages = 0; pages < 64; pages += 1) {
					if (dshTurn !== void 0 && hasNativeTurnStart(events, turn.baseline, dshTurn)) return {
						events,
						dshTurn
					};
					const seqs = page.events.map((entry) => eventSeq$1(entry.event)).filter((seq) => seq !== void 0);
					const first = seqs.length === 0 ? void 0 : Math.min(...seqs);
					if (first === void 0 || first <= turn.baseline + 1 || page.hasMore !== true) return {
						events,
						...dshTurn === void 0 ? {} : { dshTurn }
					};
					page = unwrap(await this.api.sessions.history({
						sessionId: turn.sessionId,
						beforeSeq: first,
						maxMessages: 20
					}), "读取回复关联历史");
					events = [...page.events, ...events];
					if (dshTurn === void 0) dshTurn = nativeTurnForRequest(events, turn.baseline, requestId);
				}
				throw new Error(`DSH request correlation 历史回溯超过安全页数：${requestId}`);
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
						const correlated = await this.correlatedHistory(turn, history);
						let dshTurn = correlated.dshTurn;
						if (dshTurn !== void 0 && turn.dshTurn === void 0) turn = this.change(projection.saveId, turn, { dshTurn });
						else if (dshTurn === void 0) dshTurn = turn.dshTurn;
						const correlationPending = turn.dshRequestId !== void 0 && dshTurn === void 0;
						const raw = correlationPending ? void 0 : assistantText(correlated.events, turn.baseline, dshTurn);
						const ended = correlationPending ? false : turnEnded(correlated.events, turn.baseline, dshTurn);
						if (raw !== void 0 && ended) {
							let result;
							try {
								result = {
									raw,
									messages: parseMessages(raw, projection, turn.channelId),
									...dshTurn === void 0 ? {} : { dshTurn }
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
						if (raw === void 0 && ended) {
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
							state: "uncertain",
							error: `读取 AI 回合结果不确定：${error instanceof Error ? error.message : String(error)}`
						});
						throw error;
					}
				}
				const error = "AI 回合仍在运行；下次打开存档会继续从 history 恢复";
				this.change(projection.saveId, turn, {
					state: "uncertain",
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
			async recoverFromEvidence(projection, evidence) {
				if (!projection.channels.some((channel) => channel.id === evidence.channelId)) throw new Error(`journal recovery channel 不存在：${evidence.channelId}`);
				const currentSession = this.currentSessionId(projection.saveId);
				if (currentSession !== null && currentSession !== evidence.sessionId) throw new Error(`journal recovery session 冲突：${currentSession} != ${evidence.sessionId}`);
				if (currentSession === null) this.remember(projection.saveId, evidence.sessionId);
				const existing = this.readTurn(projection.saveId);
				if (existing !== null) {
					if (existing.id !== evidence.turnId || existing.sessionId !== evidence.sessionId || existing.channelId !== evidence.channelId) throw new Error("本地 pending turn 与 journal recovery identity 冲突");
					if (existing.dshRequestId !== void 0 && existing.dshRequestId !== evidence.dshRequestId) throw new Error("本地 pending turn 与 journal DSH request identity 冲突");
					const merged = existing.dshRequestId === void 0 || existing.dshTurn === void 0 && evidence.dshTurn !== void 0 ? this.change(projection.saveId, existing, {
						dshRequestId: evidence.dshRequestId,
						...existing.dshTurn === void 0 && evidence.dshTurn !== void 0 ? { dshTurn: evidence.dshTurn } : {}
					}) : existing;
					const recovered = merged.state === "completed" ? merged.result === void 0 ? null : {
						channelId: merged.channelId,
						result: merged.result,
						turnId: merged.id
					} : await this.recover(projection);
					if (recovered === null) throw new Error(`journal hidden turn ${evidence.turnId} 无法从本地状态恢复`);
					return recovered;
				}
				const rebuilt = {
					version: 1,
					id: evidence.turnId,
					sessionId: evidence.sessionId,
					baseline: -1,
					channelId: evidence.channelId,
					prompt: "journal-recovery",
					state: "uncertain",
					dshRequestId: evidence.dshRequestId,
					...evidence.dshTurn === void 0 ? {} : { dshTurn: evidence.dshTurn }
				};
				this.writeTurn(projection.saveId, rebuilt);
				return this.wait(projection, rebuilt);
			}
			transactionInstruction(transactionId) {
				return transactionId === void 0 ? "" : `当前 player transaction_id：${transactionId}。本回合所有会修改 canonical runtime state 的 story_* 调用必须携带完全相同的 transaction_id；同一原子写操作重试必须复用原 operation_id。\n`;
			}
			promptFor(projection, channelId, playerInput, transactionId) {
				const channel = projection.channels.find((c) => c.id === channelId);
				if (channel === void 0) throw new Error("频道不存在");
				return `当前文字游戏频道：${channel.title}\n当前进度：${projection.frame.seasonLabel} ${projection.frame.episodeLabel} ${projection.frame.sceneLabel}\n玩家输入：${playerInput}\n${this.transactionInstruction(transactionId)}可用发送者：${channel.participantIds.join(", ")}，旁白和系统也可使用。请推进剧情并调用必要的 story_* 工具。最终仅输出 JSON：{"messages":[{"senderId":"人物ID","kind":"dialogue|narration|action|system|work-dispatch|relationship|episode-summary","content":"内容"}]}。不得替玩家角色发言或决定。注意：content 内的对白引用请使用中文引号“”或「」，不要使用英文双引号 "，以免破坏 JSON 格式。`;
			}
			retryPrompt(projection, channelId, transactionId) {
				const channel = projection.channels.find((c) => c.id === channelId);
				if (channel === void 0) throw new Error("频道不存在");
				return `继续刚才未完成的文字游戏回合。不要再次转述或提交玩家输入、选择或已提交的剧情消息。当前频道：${channel.title}；当前进度：${projection.frame.seasonLabel} ${projection.frame.episodeLabel} ${projection.frame.sceneLabel}。\n${this.transactionInstruction(transactionId)}只在通过必要的 story_* 工具后输出新的结构化 JSON 回复。`;
			}
			continuationPrompt(projection, channelId, instruction, transactionId) {
				const channel = projection.channels.find((c) => c.id === channelId);
				if (channel === void 0) throw new Error("频道不存在");
				if (instruction.trim() === "") throw new Error("transaction continuation 指令不能为空");
				return `继续同一 player transaction 的恢复回合。不要再次转述或提交原玩家输入，也不要重复已经由 Core receipt 确认 applied/replayed 的 canonical mutation。当前频道：${channel.title}；当前进度：${projection.frame.seasonLabel} ${projection.frame.episodeLabel} ${projection.frame.sceneLabel}。\n${this.transactionInstruction(transactionId)}恢复要求：${instruction}\n需要重试的同一原子 mutation 必须复用原 operation_id。完成必要修复后，仅输出这一轮新的结构化 JSON 回复。`;
			}
			async start(projection, channelId, prompt, hooks = {}) {
				const sessionId = await this.session(projection.saveId, projection.agentPreset ?? `story-${projection.packId}`);
				const before = unwrap(await this.api.sessions.history({
					sessionId,
					maxMessages: 20
				}), "读取会话");
				const baseline = Math.max(-1, ...before.events.map((x) => Number(x.event?.seq ?? -1)));
				const evidence = {
					turnId: hooks.turnId ?? crypto.randomUUID(),
					sessionId,
					baseline
				};
				await hooks.beforeDispatch?.(evidence);
				let turn = {
					version: 1,
					id: evidence.turnId,
					sessionId,
					baseline,
					channelId,
					prompt,
					state: "queued"
				};
				this.previews.delete(projection.saveId);
				this.writeTurn(projection.saveId, turn);
				let acceptedEvidence = evidence;
				try {
					const response = await this.api.sessions.prompt({
						sessionId,
						mode: "queue",
						content: [{
							type: "text",
							text: prompt
						}],
						clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
					});
					unwrap(response, "发送");
					const dshRequestId = responseRpcId(response);
					if (dshRequestId !== void 0) acceptedEvidence = {
						...evidence,
						dshRequestId
					};
				} catch (error) {
					const latest = this.readTurn(projection.saveId);
					if (latest?.id === turn.id && ![
						"completed",
						"cancelled",
						"failed"
					].includes(latest.state)) turn = this.change(projection.saveId, latest, {
						state: "uncertain",
						error: `发送结果不确定：${error instanceof Error ? error.message : String(error)}`
					});
					await hooks.afterUncertain?.(evidence, error);
					throw error;
				}
				turn = this.change(projection.saveId, turn, {
					state: "running",
					error: void 0,
					...acceptedEvidence.dshRequestId === void 0 ? {} : { dshRequestId: acceptedEvidence.dshRequestId }
				});
				try {
					await hooks.afterAccepted?.(acceptedEvidence);
				} catch (error) {
					const latest = this.readTurn(projection.saveId);
					if (latest?.id === turn.id && ![
						"completed",
						"cancelled",
						"failed"
					].includes(latest.state)) turn = this.change(projection.saveId, latest, {
						state: "uncertain",
						error: `AI 回合已接受，但事务记录结果不确定：${error instanceof Error ? error.message : String(error)}`
					});
					await hooks.afterUncertain?.(acceptedEvidence, error);
					throw error;
				}
				return this.wait(projection, turn);
			}
			async send(projection, channelId, playerInput, hooks = {}) {
				const prior = this.readTurn(projection.saveId);
				if (prior !== null && [
					"queued",
					"running",
					"waiting-choice",
					"uncertain",
					"completed"
				].includes(prior.state)) throw new Error("当前存档已有待处理 AI 回合；请等待、恢复或取消后再发送");
				const completed = await this.start(projection, channelId, this.promptFor(projection, channelId, playerInput, hooks.transactionId), hooks);
				return {
					...completed.result,
					turnId: completed.turnId
				};
			}
			async retry(projection, hooks = {}) {
				const prior = this.readTurn(projection.saveId);
				if (prior === null || !["failed", "cancelled"].includes(prior.state) || prior.prompt === "") throw new Error("当前 AI 回合不可安全重试");
				const completed = await this.start(projection, prior.channelId, this.retryPrompt(projection, prior.channelId, hooks.transactionId), hooks);
				return {
					...completed.result,
					turnId: completed.turnId
				};
			}
			async continueTransaction(projection, channelId, instruction, hooks = {}) {
				const prior = this.readTurn(projection.saveId);
				if (prior !== null && ![
					"completed",
					"failed",
					"cancelled"
				].includes(prior.state)) throw new Error(`当前 AI 回合状态为 ${prior.state}，不能启动 transaction continuation`);
				if (prior === null && this.currentSessionId(projection.saveId) === null) throw new Error("transaction continuation 缺少可恢复 hidden session");
				const completed = await this.start(projection, channelId, this.continuationPrompt(projection, channelId, instruction, hooks.transactionId), hooks);
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
		const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
		const SAVE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/u;
		const STORY_UI_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
		const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
		function object$1(value, label) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
			return value;
		}
		function text(value, label) {
			if (typeof value !== "string" || value.length === 0) throw new Error(`${label} 必须是非空字符串`);
			return value;
		}
		function timestamp(value, label) {
			const raw = text(value, label);
			if (Number.isNaN(Date.parse(raw))) throw new Error(`${label} 必须是 ISO 日期时间`);
			return raw;
		}
		function assertTransactionId(value, label = "transactionId") {
			if (!TRANSACTION_ID_PATTERN.test(value)) throw new Error(`${label} 无效`);
		}
		function assertSaveId(value, label = "saveId") {
			if (!SAVE_ID_PATTERN.test(value)) throw new Error(`${label} 无效`);
		}
		function assertStoryUiId(value, label = "Story UI id") {
			if (!STORY_UI_ID_PATTERN.test(value)) throw new Error(`${label} 无效`);
		}
		function assertFingerprint(value) {
			if (!FINGERPRINT_PATTERN.test(value)) throw new Error("inputFingerprint 无效");
		}
		function stableString(value, label) {
			const raw = text(value, label);
			assertTransactionId(raw, label);
			return raw;
		}
		function storyUiId(value, label) {
			const raw = text(value, label);
			assertStoryUiId(raw, label);
			return raw;
		}
		function validateTransactionRecord(value) {
			const raw = object$1(value, "transaction");
			if (raw.schemaVersion !== 1) throw new Error("transaction.schemaVersion 必须为 1");
			const transactionId = stableString(raw.transactionId, "transactionId");
			const saveId = text(raw.saveId, "saveId");
			assertSaveId(saveId);
			const inputRaw = object$1(raw.input, "input");
			const channelId = storyUiId(inputRaw.channelId, "input.channelId");
			const inputText = text(inputRaw.text, "input.text");
			if (inputText.trim() !== inputText) throw new Error("input.text 必须是已规范化的非空字符串");
			const inputFingerprint = text(raw.inputFingerprint, "inputFingerprint");
			assertFingerprint(inputFingerprint);
			if (!Number.isInteger(raw.baseProjectionRevision) || Number(raw.baseProjectionRevision) < 0) throw new Error("baseProjectionRevision 必须是非负整数");
			if (!new Set([
				"prepared",
				"committed",
				"cancelled",
				"failed",
				"needs-recovery"
			]).has(raw.status)) throw new Error("transaction.status 无效");
			const status = raw.status;
			if (!Array.isArray(raw.hiddenTurns)) throw new Error("hiddenTurns 必须是数组");
			const turnIds = /* @__PURE__ */ new Set();
			const requestIds = /* @__PURE__ */ new Set();
			const nativeTurns = /* @__PURE__ */ new Set();
			const hiddenTurns = raw.hiddenTurns.map((item, index) => {
				const entry = object$1(item, `hiddenTurns[${index}]`);
				const turnId = storyUiId(entry.turnId, `hiddenTurns[${index}].turnId`);
				const dshRequestId = entry.dshRequestId === void 0 ? void 0 : stableString(entry.dshRequestId, `hiddenTurns[${index}].dshRequestId`);
				if (turnIds.has(turnId)) throw new Error(`hidden turnId 重复：${turnId}`);
				turnIds.add(turnId);
				if (dshRequestId !== void 0) {
					if (requestIds.has(dshRequestId)) throw new Error(`hidden dshRequestId 重复：${dshRequestId}`);
					requestIds.add(dshRequestId);
				}
				if (![
					"initial",
					"retry",
					"continuation"
				].includes(String(entry.kind))) throw new Error(`hiddenTurns[${index}].kind 无效`);
				if (![
					"planned",
					"dispatched",
					"completed",
					"failed",
					"cancelled",
					"uncertain"
				].includes(String(entry.state))) throw new Error(`hiddenTurns[${index}].state 无效`);
				const state = entry.state;
				const sessionId = entry.sessionId === void 0 ? void 0 : stableString(entry.sessionId, `hiddenTurns[${index}].sessionId`);
				let dshTurn;
				if (entry.dshTurn !== void 0) {
					if (!Number.isSafeInteger(entry.dshTurn) || Number(entry.dshTurn) < 0) throw new Error(`hiddenTurns[${index}].dshTurn 必须是非负安全整数`);
					if (sessionId === void 0) throw new Error(`hiddenTurns[${index}].dshTurn 需要 sessionId`);
					if (state === "planned" || state === "uncertain") throw new Error(`hiddenTurns[${index}].${state} 状态不能携带 dshTurn`);
					dshTurn = Number(entry.dshTurn);
					const nativeKey = `${sessionId}:${dshTurn}`;
					if (nativeTurns.has(nativeKey)) throw new Error(`DSH native turn 重复：${nativeKey}`);
					nativeTurns.add(nativeKey);
				}
				return {
					turnId,
					...dshRequestId === void 0 ? {} : { dshRequestId },
					kind: entry.kind,
					state,
					...sessionId === void 0 ? {} : { sessionId },
					...dshTurn === void 0 ? {} : { dshTurn }
				};
			});
			if (!Array.isArray(raw.operationRefs)) throw new Error("operationRefs 必须是数组");
			const stepKeys = /* @__PURE__ */ new Set();
			const operationIds = /* @__PURE__ */ new Set();
			const operationRefs = raw.operationRefs.map((item, index) => {
				const entry = object$1(item, `operationRefs[${index}]`);
				const stepKey = stableString(entry.stepKey, `operationRefs[${index}].stepKey`);
				const operationId = stableString(entry.operationId, `operationRefs[${index}].operationId`);
				if (stepKeys.has(stepKey)) throw new Error(`operation stepKey 重复：${stepKey}`);
				if (operationIds.has(operationId)) throw new Error(`operationId 重复：${operationId}`);
				stepKeys.add(stepKey);
				operationIds.add(operationId);
				return {
					stepKey,
					operationId
				};
			});
			const activeTurnId = raw.activeTurnId === void 0 ? void 0 : storyUiId(raw.activeTurnId, "activeTurnId");
			if (activeTurnId !== void 0) {
				const active = hiddenTurns.find((turn) => turn.turnId === activeTurnId);
				if (active === void 0) throw new Error("activeTurnId 未引用已知 hidden turn");
				if ([
					"completed",
					"failed",
					"cancelled"
				].includes(active.state)) throw new Error("activeTurnId 不能引用终态 hidden turn");
			}
			const canonicalResultTurnId = raw.canonicalResultTurnId === void 0 ? void 0 : storyUiId(raw.canonicalResultTurnId, "canonicalResultTurnId");
			if (canonicalResultTurnId !== void 0) {
				const canonical = hiddenTurns.find((turn) => turn.turnId === canonicalResultTurnId);
				if (canonical === void 0) throw new Error("canonicalResultTurnId 未引用已知 hidden turn");
				if (canonical.state !== "completed") throw new Error("canonicalResultTurnId 必须引用 completed hidden turn");
			}
			if ([
				"committed",
				"cancelled",
				"failed"
			].includes(status)) {
				if (activeTurnId !== void 0) throw new Error(`终态 ${status} 不能保留 activeTurnId`);
				const pending = hiddenTurns.find((turn) => ![
					"completed",
					"failed",
					"cancelled"
				].includes(turn.state));
				if (pending !== void 0) throw new Error(`终态 ${status} 不能包含非终态 hidden turn：${pending.turnId}`);
			}
			let diagnostic;
			if (raw.diagnostic !== void 0) {
				const entry = object$1(raw.diagnostic, "diagnostic");
				diagnostic = {
					code: text(entry.code, "diagnostic.code"),
					message: text(entry.message, "diagnostic.message")
				};
			}
			if (!Number.isInteger(raw.revision) || Number(raw.revision) < 0) throw new Error("transaction.revision 必须是非负整数");
			const createdAt = timestamp(raw.createdAt, "createdAt");
			const updatedAt = timestamp(raw.updatedAt, "updatedAt");
			return {
				schemaVersion: 1,
				transactionId,
				saveId,
				input: {
					channelId,
					text: inputText
				},
				inputFingerprint,
				baseProjectionRevision: Number(raw.baseProjectionRevision),
				status,
				hiddenTurns,
				operationRefs,
				...activeTurnId === void 0 ? {} : { activeTurnId },
				...canonicalResultTurnId === void 0 ? {} : { canonicalResultTurnId },
				...diagnostic === void 0 ? {} : { diagnostic },
				revision: Number(raw.revision),
				createdAt,
				updatedAt
			};
		}
		const TERMINAL_TRANSACTION$1 = new Set([
			"committed",
			"cancelled",
			"failed"
		]);
		const TRANSACTION_TRANSITIONS = {
			prepared: new Set([
				"prepared",
				"committed",
				"cancelled",
				"failed",
				"needs-recovery"
			]),
			committed: /* @__PURE__ */ new Set(),
			cancelled: /* @__PURE__ */ new Set(),
			failed: /* @__PURE__ */ new Set(),
			"needs-recovery": new Set([
				"needs-recovery",
				"committed",
				"failed"
			])
		};
		const TERMINAL_TURN$1 = new Set([
			"completed",
			"failed",
			"cancelled"
		]);
		const TURN_TRANSITIONS = {
			planned: new Set([
				"planned",
				"dispatched",
				"failed",
				"cancelled",
				"uncertain"
			]),
			dispatched: new Set([
				"dispatched",
				"completed",
				"failed",
				"cancelled"
			]),
			completed: /* @__PURE__ */ new Set(),
			failed: /* @__PURE__ */ new Set(),
			cancelled: /* @__PURE__ */ new Set(),
			uncertain: new Set([
				"uncertain",
				"dispatched",
				"completed",
				"failed",
				"cancelled"
			])
		};
		function conflict(message) {
			throw new Error(`transaction 幂等冲突：${message}`);
		}
		function assertTransactionUpdate(current, next) {
			if (next.transactionId !== current.transactionId || next.saveId !== current.saveId) conflict("identity 不可修改");
			if (next.inputFingerprint !== current.inputFingerprint || next.input.channelId !== current.input.channelId || next.input.text !== current.input.text || next.baseProjectionRevision !== current.baseProjectionRevision || next.createdAt !== current.createdAt) conflict("input identity 不可修改");
			if (TERMINAL_TRANSACTION$1.has(current.status)) conflict(`终态 ${current.status} 不可产生新 revision`);
			if (!TRANSACTION_TRANSITIONS[current.status].has(next.status)) conflict(`transaction 状态不能从 ${current.status} 迁移到 ${next.status}`);
			if (next.hiddenTurns.length < current.hiddenTurns.length) conflict("hidden turn evidence 不可删除");
			for (let index = 0; index < current.hiddenTurns.length; index += 1) {
				const before = current.hiddenTurns[index];
				const after = next.hiddenTurns[index];
				if (after.turnId !== before.turnId || after.kind !== before.kind) conflict("hidden turn identity 不可修改");
				if (before.dshRequestId !== void 0 && after.dshRequestId !== before.dshRequestId) conflict("DSH request identity 不可修改");
				if (before.sessionId !== void 0 && after.sessionId !== before.sessionId) conflict("hidden session identity 不可修改");
				if (before.dshTurn !== void 0 && after.dshTurn !== before.dshTurn) conflict("DSH native turn 不可修改");
				if (TERMINAL_TURN$1.has(before.state)) {
					if (after.state !== before.state) conflict(`终态 hidden turn 不可改写：${before.turnId}`);
				} else if (!TURN_TRANSITIONS[before.state].has(after.state)) conflict(`hidden turn ${before.turnId} 不能从 ${before.state} 迁移到 ${after.state}`);
			}
			for (let index = current.hiddenTurns.length; index < next.hiddenTurns.length; index += 1) {
				const added = next.hiddenTurns[index];
				if (added.state !== "planned") conflict(`新增 hidden turn 必须从 planned 开始：${added.turnId}`);
				if (added.dshTurn !== void 0) conflict(`新增 hidden turn 不能预填 DSH native turn：${added.turnId}`);
			}
			if (next.operationRefs.length < current.operationRefs.length) conflict("operation identity evidence 不可删除");
			for (let index = 0; index < current.operationRefs.length; index += 1) {
				const before = current.operationRefs[index];
				const after = next.operationRefs[index];
				if (after.stepKey !== before.stepKey || after.operationId !== before.operationId) conflict("operation identity evidence 不可修改");
			}
			if (current.canonicalResultTurnId !== void 0 && next.canonicalResultTurnId !== current.canonicalResultTurnId) conflict("canonicalResultTurnId 不可修改");
			if (TERMINAL_TRANSACTION$1.has(next.status)) {
				if (next.activeTurnId !== void 0) conflict(`终态 ${next.status} 不能保留 activeTurnId`);
				const pending = next.hiddenTurns.find((turn) => !TERMINAL_TURN$1.has(turn.state));
				if (pending !== void 0) conflict(`终态 ${next.status} 不能包含非终态 hidden turn：${pending.turnId}`);
			}
		}
		async function fingerprintTransactionInput(saveId, channelId, inputText) {
			assertSaveId(saveId);
			assertStoryUiId(channelId, "input.channelId");
			const canonical = JSON.stringify({
				saveId,
				channelId,
				inputText
			});
			const bytes = new TextEncoder().encode(canonical);
			const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
			return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
		}
		async function createPreparedTransaction(input) {
			const transactionId = input.transactionId ?? `tx-${globalThis.crypto.randomUUID()}`;
			assertTransactionId(transactionId);
			assertSaveId(input.saveId);
			const channelId = storyUiId(input.channelId, "input.channelId");
			const content = input.text.trim();
			if (content === "") throw new Error("玩家输入不能为空");
			if (!Number.isInteger(input.baseProjectionRevision) || input.baseProjectionRevision < 0) throw new Error("baseProjectionRevision 必须是非负整数");
			const now = (input.now ?? /* @__PURE__ */ new Date()).toISOString();
			return {
				schemaVersion: 1,
				transactionId,
				saveId: input.saveId,
				input: {
					channelId,
					text: content
				},
				inputFingerprint: await fingerprintTransactionInput(input.saveId, channelId, content),
				baseProjectionRevision: input.baseProjectionRevision,
				status: "prepared",
				hiddenTurns: [],
				operationRefs: [],
				revision: 0,
				createdAt: now,
				updatedAt: now
			};
		}
		function reviseTransaction(record, patch, now = /* @__PURE__ */ new Date()) {
			const next = validateTransactionRecord({
				...record,
				...patch,
				revision: record.revision + 1,
				updatedAt: now.toISOString()
			});
			assertTransactionUpdate(record, next);
			return next;
		}
		//#endregion
		//#region src/client/host-transactions.ts
		const TERMINAL = new Set([
			"committed",
			"cancelled",
			"failed"
		]);
		var HostTransactionJournal = class {
			fetcher;
			tails = /* @__PURE__ */ new Map();
			constructor(fetcher = (input, init) => fetch(input, init)) {
				this.fetcher = fetcher;
			}
			key(saveId, transactionId) {
				return `${saveId}:${transactionId}`;
			}
			base(saveId) {
				assertSaveId(saveId);
				return `/story-engine/api/transactions/${encodeURIComponent(saveId)}`;
			}
			endpoint(saveId, transactionId) {
				assertTransactionId(transactionId);
				return `${this.base(saveId)}/${encodeURIComponent(transactionId)}`;
			}
			identity(record, saveId, transactionId) {
				if (record.saveId !== saveId || transactionId !== void 0 && record.transactionId !== transactionId) throw new Error("transaction journal 响应身份不匹配");
				return record;
			}
			serial(saveId, transactionId, work) {
				const key = this.key(saveId, transactionId);
				const previous = this.tails.get(key) ?? Promise.resolve();
				let release;
				const gate = new Promise((resolve) => {
					release = resolve;
				});
				const queued = previous.then(() => gate);
				this.tails.set(key, queued);
				return previous.then(work).finally(() => {
					release();
					if (this.tails.get(key) === queued) this.tails.delete(key);
				});
			}
			async list(saveId) {
				const response = await this.fetcher(this.base(saveId), { headers: { accept: "application/json" } });
				if (!response.ok) throw new Error(`读取 transaction journal 失败：${response.status}`);
				const body = await response.json();
				if (!Array.isArray(body.transactions)) throw new Error("transaction journal 列表格式无效");
				const seen = /* @__PURE__ */ new Set();
				return body.transactions.map((value) => {
					const record = this.identity(validateTransactionRecord(value), saveId);
					if (seen.has(record.transactionId)) throw new Error(`transaction journal 列表包含重复 transactionId：${record.transactionId}`);
					seen.add(record.transactionId);
					return record;
				});
			}
			async listOpen(saveId) {
				return (await this.list(saveId)).filter((record) => !TERMINAL.has(record.status));
			}
			async load(saveId, transactionId) {
				const response = await this.fetcher(this.endpoint(saveId, transactionId), { headers: { accept: "application/json" } });
				if (response.status === 204 || response.status === 404) return void 0;
				if (!response.ok) throw new Error(`读取 transaction 失败：${response.status}`);
				return this.identity(validateTransactionRecord(await response.json()), saveId, transactionId);
			}
			async save(record, bootstrap = false) {
				const submitted = validateTransactionRecord(record);
				return this.serial(submitted.saveId, submitted.transactionId, async () => {
					const response = await this.fetcher(this.endpoint(submitted.saveId, submitted.transactionId), {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							expectedRevision: bootstrap ? -1 : submitted.revision - 1,
							transaction: submitted
						})
					});
					if (response.status === 409) {
						const detail = await response.json().catch(() => ({}));
						throw new Error(detail.error ?? "transaction journal 发生幂等或版本冲突，请重新读取后恢复");
					}
					if (!response.ok) {
						const detail = await response.json().catch(() => ({}));
						throw new Error(detail.error ?? `保存 transaction 失败：${response.status}`);
					}
					const saved = this.identity(validateTransactionRecord(await response.json()), submitted.saveId, submitted.transactionId);
					if (JSON.stringify(saved) !== JSON.stringify(submitted)) throw new Error("transaction journal 保存响应与提交内容不匹配");
					return saved;
				});
			}
			async prepare(input) {
				const record = await createPreparedTransaction(input);
				return this.save(record, true);
			}
		};
		//#endregion
		//#region src/core-receipt.ts
		const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
		const SHA256 = /^[a-f0-9]{64}$/;
		function object(value, label) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 损坏`);
			return value;
		}
		function validateCoreReceipt(value, expectedOperationId) {
			const raw = object(value, "Core operation receipt");
			const operationId = raw.operationId;
			if (typeof operationId !== "string" || !STABLE_ID.test(operationId) || expectedOperationId !== void 0 && operationId !== expectedOperationId || typeof raw.operation !== "string" || raw.operation.length === 0 || typeof raw.fingerprint !== "string" || !SHA256.test(raw.fingerprint) || !Number.isSafeInteger(raw.stateVersion) || Number(raw.stateVersion) < 0 || typeof raw.committedAt !== "string" || Number.isNaN(Date.parse(raw.committedAt)) || !Object.prototype.hasOwnProperty.call(raw, "result")) throw new Error(`Core operation receipt 损坏${expectedOperationId === void 0 ? "" : `：${expectedOperationId}`}`);
			const transactionId = raw.transactionId;
			if (transactionId !== void 0 && (typeof transactionId !== "string" || !STABLE_ID.test(transactionId))) throw new Error(`Core operation receipt transactionId 损坏：${operationId}`);
			return {
				operationId,
				...transactionId === void 0 ? {} : { transactionId },
				operation: raw.operation,
				fingerprint: raw.fingerprint,
				stateVersion: Number(raw.stateVersion),
				committedAt: raw.committedAt,
				result: structuredClone(raw.result)
			};
		}
		//#endregion
		//#region src/client/host-core-receipts.ts
		var HostCoreReceiptReader = class {
			fetcher;
			constructor(fetcher = (input, init) => fetch(input, init)) {
				this.fetcher = fetcher;
			}
			endpoint(saveId, transactionId, operationId) {
				assertSaveId(saveId);
				assertTransactionId(transactionId);
				assertTransactionId(operationId, "operationId");
				return `/story-engine/api/core-receipts/${encodeURIComponent(saveId)}/${encodeURIComponent(transactionId)}/${encodeURIComponent(operationId)}`;
			}
			async load(saveId, transactionId, operationId) {
				const response = await this.fetcher(this.endpoint(saveId, transactionId, operationId), { headers: { accept: "application/json" } });
				if (response.status === 204) return void 0;
				if (!response.ok) {
					const detail = await response.json().catch(() => ({}));
					throw new Error(detail.error ?? `读取 Core receipt 失败：${response.status}`);
				}
				const body = await response.json();
				if (typeof body.sessionId !== "string" || body.sessionId.trim() === "") throw new Error("Core receipt 响应缺少 sessionId");
				assertTransactionId(body.sessionId, "sessionId");
				const receipt = validateCoreReceipt(body.receipt, operationId);
				if (receipt.transactionId !== transactionId) throw new Error(`Core receipt transaction identity 冲突：${operationId}`);
				return {
					sessionId: body.sessionId,
					receipt
				};
			}
		};
		//#endregion
		//#region src/client/tool-operation-evidence.ts
		function seq(event) {
			const value = Number(event?.seq);
			return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		function args(value) {
			if (typeof value !== "string") return void 0;
			try {
				const parsed = JSON.parse(value);
				return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
			} catch {
				return;
			}
		}
		function canonical(value) {
			if (Array.isArray(value)) return value.map(canonical);
			if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
			return value;
		}
		function canonicalIdentity(value) {
			const encoded = JSON.stringify(canonical(value));
			return encoded === void 0 ? "undefined" : encoded;
		}
		function semanticArgs(toolName, value) {
			const { expected_version: _expectedVersion, ...semantic } = value;
			if (toolName === "story_enter_episode_scene" && semantic.branch_id === void 0) semantic.branch_id = "main";
			if (toolName === "story_record_episode_summary" && semantic.relationship_changes === void 0) semantic.relationship_changes = [];
			return semantic;
		}
		function canonicalArgs(toolName, value) {
			return canonicalIdentity(semanticArgs(toolName, value));
		}
		function resultBlock(event) {
			const blocks = event?.data?.message?.content;
			if (!Array.isArray(blocks)) return void 0;
			return blocks.find((block) => block?.type === "tool-result");
		}
		function resultCallId(event, block) {
			const source = event?.data?.message?.source;
			const sourceId = source?.kind === "tool" && typeof source.callId === "string" ? source.callId : void 0;
			const blockId = block?.type === "tool-result" && typeof block.toolCallId === "string" ? block.toolCallId : void 0;
			if (sourceId !== void 0 && blockId !== void 0 && sourceId !== blockId) throw new Error(`DSH tool result call identity 冲突：${sourceId} != ${blockId}`);
			if (sourceId === void 0 || blockId === void 0) return void 0;
			return sourceId;
		}
		function parseCanonicalResult(block) {
			const content = block?.content;
			if (!Array.isArray(content)) return void 0;
			const text = content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n").trim();
			if (text === "") return void 0;
			try {
				return JSON.parse(text);
			} catch {
				return text;
			}
		}
		/** Pair rc.2 durable tool/call and tool/result events for transaction-owned operation ids. */
		function collectToolOperationEvidence(entries, transactionId, operationIds) {
			const calls = /* @__PURE__ */ new Map();
			const ordered = entries.map((entry) => entry.event).filter((event) => seq(event) !== void 0).sort((left, right) => Number(left.seq) - Number(right.seq));
			for (const event of ordered) {
				if (event?.type !== "tool/call") continue;
				const callId = event?.data?.callId, name = event?.data?.name, parsed = args(event?.data?.arguments), callSeq = seq(event);
				if (typeof callId !== "string" || typeof name !== "string" || callSeq === void 0 || parsed === void 0) continue;
				const operationId = parsed.operation_id, claimedTransaction = parsed.transaction_id;
				if (typeof operationId !== "string" || !operationIds.has(operationId) || claimedTransaction !== transactionId) continue;
				const existing = calls.get(callId);
				const next = {
					operationId,
					transactionId,
					toolName: name,
					argumentsCanonical: canonicalArgs(name, parsed),
					callId,
					callSeq
				};
				if (existing !== void 0 && (existing.operationId !== next.operationId || existing.transactionId !== next.transactionId || existing.toolName !== next.toolName || existing.argumentsCanonical !== next.argumentsCanonical || existing.callSeq !== next.callSeq)) throw new Error(`DSH tool call identity 冲突：${callId}`);
				calls.set(callId, existing ?? next);
			}
			for (const event of ordered) {
				if (event?.type !== "tool/result") continue;
				const block = resultBlock(event), resultSeq = seq(event);
				const callId = resultCallId(event, block);
				if (callId === void 0 || resultSeq === void 0) continue;
				const call = calls.get(callId);
				if (call === void 0) continue;
				if (block === void 0 || typeof block.isError !== "boolean") throw new Error(`DSH tool result 结构无效：${callId}`);
				const parsedResult = parseCanonicalResult(block);
				if (call.resultSeq !== void 0) {
					if (call.resultSeq !== resultSeq || call.isError !== block.isError || canonicalIdentity(call.result) !== canonicalIdentity(parsedResult)) throw new Error(`DSH tool result identity 冲突：${callId}`);
					continue;
				}
				call.resultSeq = resultSeq;
				call.isError = block.isError;
				call.result = parsedResult;
			}
			return [...calls.values()].sort((left, right) => left.callSeq - right.callSeq);
		}
		function isKnownSkippedStoryResult(evidence) {
			if (evidence.isError !== false || evidence.toolName !== "story_record_work_event") return false;
			const value = evidence.result;
			return value !== null && typeof value === "object" && !Array.isArray(value) && value.escalated === true && value.recorded === false;
		}
		//#endregion
		//#region src/client/dsh-tool-evidence.ts
		function eventSeq(event) {
			const value = Number(event?.seq);
			return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		/** Reads rc.2 append-only session history to recover transaction-owned tool outcomes. */
		var DshToolEvidenceReader = class {
			api;
			constructor(api) {
				this.api = api;
			}
			async load(sessionIds, transactionId, operationIds) {
				const targets = new Set(operationIds);
				if (targets.size === 0) return [];
				const all = [];
				for (const sessionId of [...new Set(sessionIds)]) {
					let page = unwrap(await this.api.sessions.history({
						sessionId,
						maxMessages: 50
					}), "读取 Core tool evidence");
					let events = [...page.events];
					for (let pages = 0; page.hasMore === true; pages += 1) {
						if (pages >= 127) throw new Error(`DSH tool evidence 历史回溯超过安全页数：${sessionId}`);
						const seqs = page.events.map((entry) => eventSeq(entry.event)).filter((value) => value !== void 0);
						const first = seqs.length === 0 ? void 0 : Math.min(...seqs);
						if (first === void 0) throw new Error(`DSH tool evidence 分页缺少有效 seq：${sessionId}`);
						page = unwrap(await this.api.sessions.history({
							sessionId,
							beforeSeq: first,
							maxMessages: 50
						}), "读取 Core tool evidence");
						events = [...page.events, ...events];
					}
					all.push(...collectToolOperationEvidence(events, transactionId, targets).map((evidence) => ({
						...evidence,
						sessionId
					})));
				}
				return all.sort((left, right) => left.callSeq - right.callSeq);
			}
		};
		//#endregion
		//#region src/client/core-reconciliation.ts
		function crossOperationSemanticIdentity(evidence) {
			const parsed = JSON.parse(evidence.argumentsCanonical);
			if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return `${evidence.toolName}\u0000${evidence.argumentsCanonical}`;
			const semantic = { ...parsed };
			delete semantic.operation_id;
			return `${evidence.toolName}\u0000${JSON.stringify(semantic)}`;
		}
		var CoreTransactionReconciler = class {
			receipts;
			tools;
			constructor(receipts, tools) {
				this.receipts = receipts;
				this.tools = tools;
			}
			async reconcile(record) {
				if (record.operationRefs.length === 0) return {
					operations: [],
					hasCanonicalEffect: false,
					readyForSocialCommit: true,
					deterministicNoEffectFailure: false,
					repairablePartial: false,
					unresolved: false
				};
				const sessionIds = [...new Set(record.hiddenTurns.map((turn) => turn.sessionId).filter((value) => value !== void 0))];
				if (sessionIds.length === 0) throw new Error(`transaction ${record.transactionId} 有 operationRef 但缺少 hidden session evidence`);
				const sessionSet = new Set(sessionIds);
				const receiptEntries = await Promise.all(record.operationRefs.map(async (ref) => ({
					ref,
					evidence: await this.receipts.load(record.saveId, record.transactionId, ref.operationId)
				})));
				const operationIds = record.operationRefs.map((ref) => ref.operationId);
				const toolEvidence = await this.tools.load(sessionIds, record.transactionId, operationIds);
				const byOperation = /* @__PURE__ */ new Map();
				const semanticOwners = /* @__PURE__ */ new Map();
				for (const evidence of toolEvidence) {
					const list = byOperation.get(evidence.operationId) ?? [];
					list.push(evidence);
					byOperation.set(evidence.operationId, list);
					const semanticKey = crossOperationSemanticIdentity(evidence);
					const owners = semanticOwners.get(semanticKey) ?? /* @__PURE__ */ new Set();
					owners.add(evidence.operationId);
					semanticOwners.set(semanticKey, owners);
				}
				const crossOperationConflicts = /* @__PURE__ */ new Set();
				for (const owners of semanticOwners.values()) if (owners.size > 1) for (const operationId of owners) crossOperationConflicts.add(operationId);
				const operations = receiptEntries.map(({ ref, evidence: receiptEvidence }) => {
					const evidence = byOperation.get(ref.operationId) ?? [];
					const receiptOwned = receiptEvidence !== void 0 && sessionSet.has(receiptEvidence.sessionId);
					const withReceipt = receiptOwned ? { receipt: receiptEvidence.receipt } : {};
					const evidenceSessions = new Set(evidence.map((item) => item.sessionId));
					if (receiptEvidence !== void 0) evidenceSessions.add(receiptEvidence.sessionId);
					if (evidenceSessions.size > 1) return {
						ref,
						state: "inconsistent",
						...withReceipt,
						evidence,
						detail: "同一 operationId 在多个 hidden session 出现 receipt/tool evidence"
					};
					if (new Set(evidence.map((item) => `${item.toolName}\u0000${item.argumentsCanonical}`)).size > 1) return {
						ref,
						state: "inconsistent",
						...withReceipt,
						evidence,
						detail: "同一 operationId 被不同 tool 或 arguments 复用"
					};
					if (crossOperationConflicts.has(ref.operationId)) return {
						ref,
						state: "inconsistent",
						...withReceipt,
						evidence,
						detail: "同一语义 mutation 被不同 operationId 复用"
					};
					const pending = evidence.filter((item) => item.resultSeq === void 0);
					if (receiptEvidence !== void 0) {
						if (!receiptOwned) return {
							ref,
							state: "inconsistent",
							evidence,
							detail: "Core receipt 来自 transaction 未登记的 hidden session"
						};
						const receipt = receiptEvidence.receipt;
						if (evidence.some((item) => item.toolName !== receipt.operation)) return {
							ref,
							state: "inconsistent",
							receipt,
							evidence,
							detail: "Core receipt operation 与 durable tool identity 冲突"
						};
						if (pending.length > 0) return {
							ref,
							state: "pending",
							receipt,
							evidence,
							detail: "Core receipt 已存在，但仍有 matching tool attempt 未终态"
						};
						return {
							ref,
							state: "applied-or-replayed",
							receipt,
							evidence
						};
					}
					if (evidence.length === 0) return {
						ref,
						state: "pending",
						evidence,
						detail: "尚未在 DSH durable history 找到 matching tool outcome"
					};
					const successful = evidence.filter((item) => item.resultSeq !== void 0 && item.isError === false);
					const failed = evidence.filter((item) => item.resultSeq !== void 0 && item.isError === true);
					if (pending.length > 0) return {
						ref,
						state: "pending",
						evidence,
						detail: "tool/call 已持久化但仍有未终态 attempt"
					};
					if (successful.length > 0) {
						if (successful.every(isKnownSkippedStoryResult)) return {
							ref,
							state: "skipped",
							evidence
						};
						return {
							ref,
							state: "inconsistent",
							evidence,
							detail: "成功 mutating tool result 缺少 matching Core receipt，且不是已知 no-op"
						};
					}
					if (failed.length > 0) return {
						ref,
						state: "failed",
						evidence,
						detail: "matching mutating tool attempt 已明确失败且无 Core receipt"
					};
					return {
						ref,
						state: "pending",
						evidence,
						detail: "matching tool evidence 尚未形成可判定 terminal outcome"
					};
				});
				const hasCanonicalEffect = operations.some((item) => item.receipt !== void 0 || item.state === "applied-or-replayed");
				const readyForSocialCommit = operations.every((item) => item.state === "applied-or-replayed" || item.state === "skipped");
				const deterministicNoEffectFailure = !hasCanonicalEffect && operations.some((item) => item.state === "failed") && operations.every((item) => item.state === "failed" || item.state === "skipped");
				const unresolved = operations.some((item) => item.state === "pending" || item.state === "inconsistent");
				return {
					operations,
					hasCanonicalEffect,
					readyForSocialCommit,
					deterministicNoEffectFailure,
					repairablePartial: hasCanonicalEffect && !unresolved && operations.some((item) => item.state === "failed") && operations.every((item) => item.state === "applied-or-replayed" || item.state === "skipped" || item.state === "failed"),
					unresolved
				};
			}
		};
		//#endregion
		//#region src/client/player-transaction-coordinator.ts
		const SOCIAL_ONLY_CORE = { async reconcile(record) {
			if (record.operationRefs.length !== 0) throw new Error(`transaction ${record.transactionId} 含 core operation，但 Core reconciler 未配置`);
			return {
				operations: [],
				hasCanonicalEffect: false,
				readyForSocialCommit: true,
				deterministicNoEffectFailure: false,
				repairablePartial: false,
				unresolved: false
			};
		} };
		function detail(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function hiddenTerminal(state) {
			return state === "completed" || state === "failed" || state === "cancelled";
		}
		/** Browser coordinator for hidden, core-reconciliation, and social commit ordering. */
		var PlayerTransactionCoordinator = class {
			journal;
			projections;
			ai;
			core;
			constructor(journal, projections, ai, core = SOCIAL_ONLY_CORE) {
				this.journal = journal;
				this.projections = projections;
				this.ai = ai;
				this.core = core;
			}
			async open(saveId) {
				const records = await this.journal.listOpen(saveId);
				if (records.length > 1) throw new Error(`存档存在多个未完成 transaction，必须先恢复：${records.map((record) => record.transactionId).join(", ")}`);
				return records[0];
			}
			async refresh(state) {
				const current = await this.open(state.record.saveId);
				if (current === void 0) throw new Error(`transaction ${state.record.transactionId} 在外部调用后不再是 open journal`);
				if (current.transactionId !== state.record.transactionId) throw new Error(`transaction identity 在外部调用后发生变化：${state.record.transactionId} != ${current.transactionId}`);
				state.record = current;
			}
			findHidden(record, turnId) {
				const index = record.hiddenTurns.findIndex((turn) => turn.turnId === turnId);
				if (index < 0) throw new Error(`transaction 未记录 hidden turn：${turnId}`);
				return {
					index,
					turn: record.hiddenTurns[index]
				};
			}
			replaceHidden(record, index, turn) {
				return record.hiddenTurns.map((entry, current) => current === index ? turn : entry);
			}
			async save(state, patch) {
				state.record = await this.journal.save(reviseTransaction(state.record, patch));
			}
			persistedCanonical(record, projection) {
				const turnId = record.canonicalResultTurnId;
				if (turnId === void 0) return void 0;
				const { turn } = this.findHidden(record, turnId);
				if (turn.state !== "completed") throw new Error(`canonical hidden turn 尚未完成：${turnId}`);
				return projection.messages.some((message) => message.turnId === turnId && message.canonStatus === "committed") ? turnId : void 0;
			}
			playerInputMatches(record, projection) {
				const raw = record.input.text;
				const kind = raw.startsWith("(系统)") ? "system" : raw.startsWith("(行动)") ? "action" : "dialogue";
				const content = raw.replace(/^\((系统|行动)\)\s*/u, "");
				const player = projection.participants.find((p) => p.role === "player");
				const senderId = kind === "system" ? projection.participants.find((p) => p.role === "system")?.id ?? player?.id : player?.id;
				const last = projection.messages.at(-1);
				return senderId !== void 0 && last !== void 0 && last.channelId === record.input.channelId && last.senderId === senderId && last.kind === kind && last.content === content && last.turnId === `turn-${record.baseProjectionRevision + 1}` && last.canonStatus === (kind === "system" ? "proposed" : "committed");
			}
			async ensurePlayerProjection(record, projection) {
				if (projection.revision === record.baseProjectionRevision) {
					const restored = appendPlayerMessage(projection, record.input.channelId, record.input.text);
					await this.projections.save(restored);
					return restored;
				}
				if (projection.revision === record.baseProjectionRevision + 1 && this.playerInputMatches(record, projection)) {
					await this.projections.save(projection);
					return projection;
				}
				throw new Error(`transaction ${record.transactionId} 的玩家 projection 无法安全恢复：revision ${projection.revision}, base ${record.baseProjectionRevision}`);
			}
			async recoverBeforeHiddenDispatch(state, error, code = "pre-hidden-dispatch-failed") {
				if (state.record.status === "committed" || state.record.status === "cancelled" || state.record.status === "failed" || state.record.hiddenTurns.length !== 0) return;
				const diagnostic = {
					code,
					message: detail(error)
				};
				if (state.record.status === "needs-recovery" && state.record.diagnostic?.code === diagnostic.code && state.record.diagnostic.message === diagnostic.message) return;
				try {
					await this.save(state, {
						status: "needs-recovery",
						diagnostic
					});
				} catch {}
			}
			async needsRecovery(state, turnId, error, code = "hidden-dispatch-uncertain", evidence) {
				if (state.record.status === "committed" || state.record.status === "cancelled" || state.record.status === "failed") return;
				let hiddenTurns = state.record.hiddenTurns;
				const found = hiddenTurns.findIndex((turn) => turn.turnId === turnId);
				if (found >= 0) {
					const current = hiddenTurns[found];
					let next = current;
					if (evidence?.dshRequestId !== void 0 && current.dshRequestId === void 0) next = {
						...next,
						dshRequestId: evidence.dshRequestId
					};
					if (current.state === "planned") next = {
						...next,
						state: "uncertain"
					};
					if (next !== current) hiddenTurns = this.replaceHidden(state.record, found, next);
				}
				const diagnostic = {
					code,
					message: detail(error)
				};
				if (state.record.status === "needs-recovery" && hiddenTurns === state.record.hiddenTurns && state.record.diagnostic?.code === diagnostic.code && state.record.diagnostic.message === diagnostic.message) return;
				try {
					await this.save(state, {
						status: "needs-recovery",
						hiddenTurns,
						diagnostic
					});
				} catch {}
			}
			async recordFailedHidden(state, turnId, error, local) {
				if (local === null || local.id !== turnId || local.state !== "failed") return false;
				if (state.record.activeTurnId !== void 0 && state.record.activeTurnId !== turnId) return false;
				const { index, turn } = this.findHidden(state.record, turnId);
				if (turn.state === "failed") return true;
				if (hiddenTerminal(turn.state)) return false;
				if (turn.dshRequestId !== void 0 && local.dshRequestId !== void 0 && turn.dshRequestId !== local.dshRequestId) return false;
				if (turn.dshTurn !== void 0 && local.dshTurn !== void 0 && turn.dshTurn !== local.dshTurn) return false;
				const failed = {
					...turn,
					state: "failed",
					...turn.dshRequestId === void 0 && local.dshRequestId !== void 0 ? { dshRequestId: local.dshRequestId } : {},
					...turn.dshTurn === void 0 && local.dshTurn !== void 0 ? { dshTurn: local.dshTurn } : {}
				};
				try {
					await this.save(state, {
						status: "needs-recovery",
						hiddenTurns: this.replaceHidden(state.record, index, failed),
						activeTurnId: void 0,
						diagnostic: {
							code: "hidden-failed",
							message: detail(error)
						}
					});
					return true;
				} catch {
					return false;
				}
			}
			hooks(state, turnId, kind) {
				return {
					turnId,
					transactionId: state.record.transactionId,
					beforeDispatch: async (evidence) => {
						const hidden = {
							turnId: evidence.turnId,
							kind,
							state: "planned",
							sessionId: evidence.sessionId
						};
						await this.save(state, {
							hiddenTurns: [...state.record.hiddenTurns, hidden],
							activeTurnId: evidence.turnId
						});
					},
					afterAccepted: async (evidence) => {
						const { index, turn } = this.findHidden(state.record, evidence.turnId);
						await this.save(state, { hiddenTurns: this.replaceHidden(state.record, index, {
							...turn,
							state: "dispatched",
							sessionId: evidence.sessionId,
							...evidence.dshRequestId === void 0 ? {} : { dshRequestId: evidence.dshRequestId }
						}) });
					},
					afterUncertain: async (evidence, error) => {
						await this.needsRecovery(state, evidence.turnId, error, "hidden-dispatch-uncertain", evidence);
					}
				};
			}
			async complete(state, turnId, dshTurn) {
				let found = this.findHidden(state.record, turnId);
				if (found.turn.state === "planned") {
					await this.save(state, { hiddenTurns: this.replaceHidden(state.record, found.index, {
						...found.turn,
						state: "dispatched"
					}) });
					found = this.findHidden(state.record, turnId);
				}
				if (found.turn.state === "completed") {
					if (dshTurn !== void 0) {
						if (found.turn.dshTurn !== void 0 && found.turn.dshTurn !== dshTurn) throw new Error(`hidden turn ${turnId} 的 DSH native turn 冲突：${found.turn.dshTurn} != ${dshTurn}`);
						if (found.turn.dshTurn === void 0) await this.save(state, { hiddenTurns: this.replaceHidden(state.record, found.index, {
							...found.turn,
							dshTurn
						}) });
					}
					return;
				}
				if (found.turn.state !== "dispatched" && found.turn.state !== "uncertain") throw new Error(`hidden turn ${turnId} 不能完成：${found.turn.state}`);
				await this.save(state, {
					hiddenTurns: this.replaceHidden(state.record, found.index, {
						...found.turn,
						state: "completed",
						...dshTurn === void 0 ? {} : { dshTurn }
					}),
					activeTurnId: void 0,
					diagnostic: void 0
				});
			}
			async selectCanonical(state, turnId) {
				const { turn } = this.findHidden(state.record, turnId);
				if (turn.state !== "completed") throw new Error(`canonical hidden turn 尚未完成：${turnId}`);
				if (state.record.canonicalResultTurnId !== void 0) {
					if (state.record.canonicalResultTurnId !== turnId) throw new Error(`transaction canonical result 冲突：${state.record.canonicalResultTurnId}`);
					return;
				}
				await this.save(state, {
					canonicalResultTurnId: turnId,
					diagnostic: void 0
				});
			}
			coreDetail(summary) {
				return summary.operations.map((item) => `${item.ref.operationId}:${item.state}${item.detail ? `(${item.detail})` : ""}`).join(", ") || "无 core operation";
			}
			repairInstruction(summary) {
				const ids = (state) => summary.operations.filter((item) => item.state === state).map((item) => item.ref.operationId);
				const applied = ids("applied-or-replayed"), skipped = ids("skipped"), failed = ids("failed");
				return [
					`已由 Core receipt 确认 applied/replayed 的 operation_id：${applied.join(", ") || "无"}；不得以新 operation_id 重复这些 canonical mutation。`,
					`已确认 skipped/no-op 的 operation_id：${skipped.join(", ") || "无"}；不得为了制造 receipt 再执行。`,
					`需要修复的明确 failed operation_id：${failed.join(", ") || "无"}；若重试同一原子 mutation 必须复用对应 operation_id。`,
					`不要重发或转述原玩家输入；完成必要 core 修复后再输出最终结构化 social JSON。`
				].join(" ");
			}
			async coreReady(state, turnId, allowTerminalFailure) {
				let summary;
				try {
					summary = await this.core.reconcile(state.record);
				} catch (error) {
					await this.save(state, {
						status: "needs-recovery",
						diagnostic: {
							code: "core-evidence-read-failed",
							message: detail(error)
						}
					});
					throw error;
				}
				if (summary.readyForSocialCommit) {
					if (turnId !== void 0) await this.selectCanonical(state, turnId);
					return summary;
				}
				const message = this.coreDetail(summary);
				if (summary.deterministicNoEffectFailure && allowTerminalFailure && turnId !== void 0) {
					await this.save(state, {
						status: "failed",
						activeTurnId: void 0,
						diagnostic: {
							code: "core-operation-failed-no-effect",
							message
						}
					});
					this.ai.acknowledge(state.record.saveId, turnId);
					throw new Error(`Core mutation 明确失败且没有 canonical effect：${message}`);
				}
				await this.save(state, {
					status: "needs-recovery",
					diagnostic: {
						code: summary.repairablePartial ? "core-partial-commit-repairable" : "core-reconciliation-required",
						message
					}
				});
				throw new Error(`Core transaction 尚不能安全提交 social projection：${message}`);
			}
			async dispatch(state, projection, channelId, inputOrInstruction, kind) {
				const turnId = `turn-${crypto.randomUUID()}`;
				let result;
				try {
					const hooks = this.hooks(state, turnId, kind);
					result = kind === "initial" ? await this.ai.send(projection, channelId, inputOrInstruction, hooks) : kind === "retry" ? await this.ai.retry(projection, hooks) : await this.ai.continueTransaction(projection, channelId, inputOrInstruction, hooks);
				} catch (error) {
					try {
						await this.refresh(state);
					} catch (refreshError) {
						throw new Error(`hidden dispatch 失败后无法刷新 transaction journal：${detail(refreshError)}；原错误：${detail(error)}`);
					}
					if (state.record.hiddenTurns.some((turn) => turn.turnId === turnId)) {
						const local = this.ai.turn(projection.saveId);
						if (!await this.recordFailedHidden(state, turnId, error, local)) {
							const evidence = local?.id === turnId ? {
								turnId,
								sessionId: local.sessionId,
								baseline: local.baseline,
								...local.dshRequestId === void 0 ? {} : { dshRequestId: local.dshRequestId }
							} : void 0;
							const current = this.findHidden(state.record, turnId).turn;
							await this.needsRecovery(state, turnId, error, current.state === "dispatched" ? "hidden-recovery-failed" : "hidden-dispatch-uncertain", evidence);
						}
					} else await this.recoverBeforeHiddenDispatch(state, error);
					throw error;
				}
				await this.refresh(state);
				if (result.turnId !== turnId) {
					const error = /* @__PURE__ */ new Error(`AI hidden turn identity 不匹配：expected ${turnId}, got ${result.turnId ?? "missing"}`);
					await this.needsRecovery(state, turnId, error, "hidden-identity-mismatch");
					throw error;
				}
				await this.complete(state, turnId, result.dshTurn);
				await this.coreReady(state, turnId, true);
				return result;
			}
			async recoverAi(projection, state) {
				if (this.ai.turn(projection.saveId) !== null) return this.ai.recover(projection);
				const targetId = state.record.activeTurnId ?? state.record.canonicalResultTurnId ?? [...state.record.hiddenTurns].reverse().find((turn) => turn.state === "completed" || turn.state === "dispatched" || turn.state === "uncertain" || turn.state === "planned")?.turnId;
				if (targetId === void 0) return this.ai.recover(projection);
				const { turn } = this.findHidden(state.record, targetId);
				if (turn.sessionId === void 0 || turn.dshRequestId === void 0) return this.ai.recover(projection);
				return this.ai.recoverFromEvidence(projection, {
					turnId: turn.turnId,
					sessionId: turn.sessionId,
					channelId: state.record.input.channelId,
					dshRequestId: turn.dshRequestId,
					...turn.dshTurn === void 0 ? {} : { dshTurn: turn.dshTurn }
				});
			}
			async maybeContinueCoreRecovery(state, projection) {
				if (state.record.canonicalResultTurnId !== void 0) return null;
				const latest = state.record.hiddenTurns.at(-1);
				if (latest === void 0 || ![
					"completed",
					"failed",
					"cancelled"
				].includes(latest.state)) return null;
				let summary;
				try {
					summary = await this.core.reconcile(state.record);
				} catch (error) {
					await this.save(state, {
						status: "needs-recovery",
						diagnostic: {
							code: "core-evidence-read-failed",
							message: detail(error)
						}
					});
					throw error;
				}
				if ((latest.state === "failed" || latest.state === "cancelled") && summary.deterministicNoEffectFailure) {
					const message = this.coreDetail(summary);
					await this.save(state, {
						status: "failed",
						activeTurnId: void 0,
						diagnostic: {
							code: "core-operation-failed-no-effect",
							message
						}
					});
					this.ai.acknowledge(state.record.saveId, latest.turnId);
					return null;
				}
				const repairCompleted = latest.state === "completed" && summary.repairablePartial;
				const recoverTerminalEffect = (latest.state === "failed" || latest.state === "cancelled") && summary.hasCanonicalEffect && (summary.readyForSocialCommit || summary.repairablePartial);
				if (!repairCompleted && !recoverTerminalEffect) return null;
				const result = await this.dispatch(state, projection, state.record.input.channelId, this.repairInstruction(summary), "continuation");
				return {
					channelId: state.record.input.channelId,
					result,
					turnId: result.turnId
				};
			}
			async send(projection, channelId, input) {
				if (projection.revision < 1) throw new Error("玩家提交后的 projection revision 无效");
				const existing = await this.open(projection.saveId);
				if (existing !== void 0) throw new Error(`当前存档存在未完成 transaction：${existing.transactionId}；请先恢复，不会重复发送玩家输入`);
				const state = { record: await this.journal.prepare({
					saveId: projection.saveId,
					channelId,
					text: input,
					baseProjectionRevision: projection.revision - 1
				}) };
				try {
					await this.projections.save(projection);
				} catch (error) {
					await this.recoverBeforeHiddenDispatch(state, error, "player-projection-save-uncertain");
					throw error;
				}
				return this.dispatch(state, projection, channelId, input, "initial");
			}
			async recover(projection) {
				const record = await this.open(projection.saveId);
				if (record === void 0) return this.ai.recover(projection);
				const state = { record };
				const persistedCanonical = this.persistedCanonical(record, projection);
				if (persistedCanonical !== void 0) {
					await this.coreReady(state, persistedCanonical, false);
					await this.projections.save(projection);
					this.ai.acknowledge(projection.saveId, persistedCanonical);
					await this.save(state, {
						status: "committed",
						activeTurnId: void 0,
						diagnostic: void 0
					});
					return null;
				}
				if (record.hiddenTurns.length === 0) {
					if (record.status !== "prepared" && record.status !== "needs-recovery") throw new Error(`transaction ${record.transactionId} 缺少 hidden evidence，状态为 ${record.status}`);
					const restored = await this.ensurePlayerProjection(record, projection);
					const result = await this.dispatch(state, restored, record.input.channelId, record.input.text, "initial");
					return {
						channelId: record.input.channelId,
						result,
						turnId: result.turnId
					};
				}
				const continuation = await this.maybeContinueCoreRecovery(state, projection);
				if (continuation !== null) return continuation;
				if (state.record.status === "failed" || state.record.status === "cancelled" || state.record.status === "committed") return null;
				let recovered;
				try {
					recovered = await this.recoverAi(projection, state);
				} catch (error) {
					try {
						await this.refresh(state);
					} catch (refreshError) {
						throw new Error(`hidden recovery 失败后无法刷新 transaction journal：${detail(refreshError)}；原错误：${detail(error)}`);
					}
					const active = state.record.activeTurnId;
					if (active !== void 0 && !hiddenTerminal(this.findHidden(state.record, active).turn.state)) {
						const local = this.ai.turn(projection.saveId);
						if (!await this.recordFailedHidden(state, active, error, local)) await this.needsRecovery(state, active, error, "hidden-recovery-failed");
					}
					throw error;
				}
				await this.refresh(state);
				if (recovered === null) {
					const local = this.ai.turn(projection.saveId);
					const active = state.record.activeTurnId;
					if (active !== void 0 && !hiddenTerminal(this.findHidden(state.record, active).turn.state)) {
						if (!await this.recordFailedHidden(state, active, new Error(local?.error ?? `hidden turn 未产生可提交结果：${local?.state ?? "missing"}`), local)) await this.needsRecovery(state, active, /* @__PURE__ */ new Error(local === null ? "本地 pending hidden turn 与可重建 durable correlation evidence 均缺失；禁止盲目重发" : `hidden turn 未产生可提交结果：${local.state}`), "hidden-recovery-required", local?.id === active ? {
							turnId: active,
							sessionId: local.sessionId,
							baseline: local.baseline,
							...local.dshRequestId === void 0 ? {} : { dshRequestId: local.dshRequestId }
						} : void 0);
					}
					return null;
				}
				if (!state.record.hiddenTurns.some((turn) => turn.turnId === recovered.turnId)) {
					await this.needsRecovery(state, state.record.activeTurnId ?? state.record.hiddenTurns.at(-1).turnId, /* @__PURE__ */ new Error(`恢复得到未知 hidden turn：${recovered.turnId}`), "hidden-identity-mismatch");
					throw new Error(`恢复得到的 AI turn 不属于当前 transaction：${recovered.turnId}`);
				}
				await this.complete(state, recovered.turnId, recovered.result.dshTurn);
				await this.coreReady(state, recovered.turnId, true);
				return recovered;
			}
			async retry(projection) {
				const existing = await this.open(projection.saveId);
				if (existing === void 0) return this.ai.retry(projection);
				const state = { record: existing };
				if (existing.canonicalResultTurnId !== void 0) throw new Error(`transaction ${existing.transactionId} 已有 canonical hidden turn ${existing.canonicalResultTurnId}；必须先完成 projection reconciliation`);
				const local = this.ai.turn(projection.saveId);
				if (local === null) throw new Error(`transaction ${existing.transactionId} 缺少本地 failed/cancelled hidden turn；必须先恢复，禁止盲目 retry`);
				if (local.state === "cancelled") {
					const summary = await this.core.reconcile(existing);
					if (!summary.hasCanonicalEffect || !summary.readyForSocialCommit && !summary.repairablePartial) throw new Error(`transaction ${existing.transactionId} 的 cancelled turn 尚不能安全 continuation`);
					return this.dispatch(state, projection, state.record.input.channelId, this.repairInstruction(summary), "continuation");
				}
				if (local.state !== "failed") throw new Error(`transaction ${existing.transactionId} 的 hidden turn 状态为 ${local.state}；只有明确 failed 才允许同 transaction retry`);
				if (existing.activeTurnId !== void 0 && existing.activeTurnId !== local.id) throw new Error(`transaction active hidden turn 与本地 failed turn 不匹配：${existing.activeTurnId} != ${local.id}`);
				const otherPending = existing.hiddenTurns.find((turn) => !hiddenTerminal(turn.state) && turn.turnId !== local.id);
				if (otherPending !== void 0) throw new Error(`transaction 仍有其它非终态 hidden turn：${otherPending.turnId}`);
				let found = this.findHidden(state.record, local.id);
				if (found.turn.state === "completed" || found.turn.state === "cancelled") throw new Error(`hidden turn ${local.id} 已是 ${found.turn.state}，不能作为 retry 来源`);
				if (found.turn.state !== "failed") {
					if (found.turn.dshRequestId !== void 0 && local.dshRequestId !== void 0 && found.turn.dshRequestId !== local.dshRequestId) throw new Error(`hidden turn ${local.id} 的 DSH request identity 冲突`);
					if (found.turn.dshTurn !== void 0 && local.dshTurn !== void 0 && found.turn.dshTurn !== local.dshTurn) throw new Error(`hidden turn ${local.id} 的 DSH native turn 冲突`);
					const failed = {
						...found.turn,
						state: "failed",
						...found.turn.dshRequestId === void 0 && local.dshRequestId !== void 0 ? { dshRequestId: local.dshRequestId } : {},
						...found.turn.dshTurn === void 0 && local.dshTurn !== void 0 ? { dshTurn: local.dshTurn } : {}
					};
					await this.save(state, {
						status: "needs-recovery",
						hiddenTurns: this.replaceHidden(state.record, found.index, failed),
						activeTurnId: void 0,
						diagnostic: {
							code: "hidden-failed-retryable",
							message: local.error ?? "前一 hidden turn 已明确失败，可在同一 transaction 内 retry"
						}
					});
					found = this.findHidden(state.record, local.id);
				}
				if (found.turn.state !== "failed") throw new Error(`hidden turn ${local.id} 未能收敛到 failed`);
				if (state.record.operationRefs.length > 0) {
					let summary;
					try {
						summary = await this.core.reconcile(state.record);
					} catch (error) {
						await this.save(state, {
							status: "needs-recovery",
							diagnostic: {
								code: "core-evidence-read-failed",
								message: detail(error)
							}
						});
						throw error;
					}
					if (summary.unresolved) throw new Error(`transaction ${state.record.transactionId} 的 core evidence 尚未收敛，禁止 generic retry：${this.coreDetail(summary)}`);
					if (summary.readyForSocialCommit || summary.repairablePartial || summary.deterministicNoEffectFailure) return this.dispatch(state, projection, state.record.input.channelId, this.repairInstruction(summary), "continuation");
					throw new Error(`transaction ${state.record.transactionId} 的 core evidence 不能安全 retry：${this.coreDetail(summary)}`);
				}
				return this.dispatch(state, projection, state.record.input.channelId, state.record.input.text, "retry");
			}
			async cancel(saveId) {
				await this.ai.cancel(saveId);
				const record = await this.open(saveId);
				if (record === void 0) return;
				const state = { record };
				const active = record.activeTurnId;
				if (active === void 0) {
					if (record.hiddenTurns.length === 0 && record.status === "prepared") await this.save(state, {
						status: "cancelled",
						diagnostic: void 0
					});
					return;
				}
				const { index, turn } = this.findHidden(record, active);
				if (hiddenTerminal(turn.state)) return;
				const cancelled = this.replaceHidden(state.record, index, {
					...turn,
					state: "cancelled"
				});
				let summary;
				try {
					summary = await this.core.reconcile(state.record);
				} catch (error) {
					await this.save(state, {
						status: "needs-recovery",
						hiddenTurns: cancelled,
						activeTurnId: void 0,
						diagnostic: {
							code: "cancel-core-evidence-read-failed",
							message: detail(error)
						}
					});
					throw error;
				}
				if (!summary.hasCanonicalEffect && !summary.unresolved) {
					await this.save(state, {
						status: "cancelled",
						hiddenTurns: cancelled,
						activeTurnId: void 0,
						diagnostic: void 0
					});
					return;
				}
				await this.save(state, {
					status: "needs-recovery",
					hiddenTurns: cancelled,
					activeTurnId: void 0,
					diagnostic: {
						code: summary.hasCanonicalEffect ? "cancelled-after-core-effect" : "cancel-core-outcome-uncertain",
						message: this.coreDetail(summary)
					}
				});
			}
			async assertQuiescent(saveId) {
				const record = await this.open(saveId);
				if (record !== void 0) throw new Error(`存档存在未完成 transaction：${record.transactionId}；请先恢复或完成对账`);
			}
			async acknowledge(saveId, turnId) {
				const record = await this.open(saveId);
				if (record !== void 0) {
					if (record.canonicalResultTurnId !== turnId) throw new Error(`open transaction ${record.transactionId} 尚未记录 canonical hidden turn ${turnId}；保留 pending turn 供恢复`);
					const state = { record };
					const { turn } = this.findHidden(record, turnId);
					if (turn.state !== "completed") throw new Error(`canonical hidden turn 尚未完成：${turnId}`);
					await this.coreReady(state, turnId, false);
					this.ai.acknowledge(saveId, turnId);
					await this.save(state, {
						status: "committed",
						activeTurnId: void 0,
						diagnostic: void 0
					});
					return;
				}
				this.ai.acknowledge(saveId, turnId);
			}
		};
		//#endregion
		//#region src/client/terminal-turn-reconciliation.ts
		const TERMINAL_TRANSACTION = new Set([
			"committed",
			"cancelled",
			"failed"
		]);
		const TERMINAL_TURN = new Set([
			"completed",
			"failed",
			"cancelled"
		]);
		/**
		* Clear a local terminal AI artifact only when the durable Host journal proves
		* that the same hidden turn already belongs to a terminal transaction.
		*
		* This closes the crash window between terminal journal persistence and local
		* pending-turn cleanup without treating an unjournaled/legacy terminal turn as
		* settled. Identity disagreement is corruption and therefore fails closed.
		*/
		async function reconcileSettledLocalTurn(journal, ai, saveId) {
			const local = ai.turn(saveId);
			if (local === null || !TERMINAL_TURN.has(local.state)) return false;
			const owners = (await journal.list(saveId)).filter((record) => TERMINAL_TRANSACTION.has(record.status) && record.hiddenTurns.some((turn) => turn.turnId === local.id));
			if (owners.length > 1) throw new Error(`terminal hidden turn ${local.id} 同时属于多个 transaction：${owners.map((record) => record.transactionId).join(", ")}`);
			const owner = owners[0];
			if (owner === void 0) return false;
			const durable = owner.hiddenTurns.find((turn) => turn.turnId === local.id);
			const requestConflict = durable.dshRequestId !== void 0 && local.dshRequestId !== void 0 && durable.dshRequestId !== local.dshRequestId;
			const nativeTurnConflict = durable.dshTurn !== void 0 && local.dshTurn !== void 0 && durable.dshTurn !== local.dshTurn;
			if (durable.sessionId !== local.sessionId || durable.state !== local.state || requestConflict || nativeTurnConflict) throw new Error(`terminal hidden turn identity 冲突：${local.id}`);
			ai.acknowledge(saveId, local.id);
			return true;
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
			const hostProjections = new HostProjectionStorage();
			const localProjections = createLocalProjectionStorage(window.localStorage);
			const transactionJournal = new HostTransactionJournal();
			const playerTransactions = new PlayerTransactionCoordinator(transactionJournal, hostProjections, ai, new CoreTransactionReconciler(new HostCoreReceiptReader(), new DshToolEvidenceReader(connection.api)));
			const journalLocks = /* @__PURE__ */ new Map();
			const recoveryChannel = (channelId, authoritative) => channelId ?? authoritative?.selectedChannelId ?? "journal-recovery";
			const syncRecoveryState = async (saveId, channelId) => {
				const authoritative = await hostProjections.load(saveId).catch(() => void 0);
				if (authoritative !== void 0) localProjections.save(authoritative);
				const fallbackChannel = recoveryChannel(channelId, authoritative);
				try {
					await playerTransactions.assertQuiescent(saveId);
					try {
						await reconcileSettledLocalTurn(transactionJournal, ai, saveId);
						journalLocks.delete(saveId);
					} catch {
						journalLocks.set(saveId, fallbackChannel);
					}
				} catch {
					const current = ai.turn(saveId);
					if (current === null || current.state === "cancelled") journalLocks.set(saveId, fallbackChannel);
				}
			};
			const visibleTurn = (saveId) => {
				const lockedChannel = journalLocks.get(saveId);
				if (lockedChannel !== void 0) return {
					version: 1,
					id: `journal-lock-${saveId}`,
					sessionId: "journal-recovery",
					baseline: -1,
					channelId: lockedChannel,
					prompt: "journal-recovery-lock",
					state: "uncertain",
					error: "Host transaction journal 尚未收口；请恢复或完成对账后继续"
				};
				return ai.turn(saveId);
			};
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
					sendToAI: async (projection, channelId, input) => {
						try {
							return await playerTransactions.send(projection, channelId, input);
						} catch (error) {
							await syncRecoveryState(projection.saveId, channelId);
							throw error;
						}
					},
					recoverAiTurn: async (projection) => {
						try {
							if (await reconcileSettledLocalTurn(transactionJournal, ai, projection.saveId)) return null;
							return await playerTransactions.recover(projection);
						} finally {
							await syncRecoveryState(projection.saveId, projection.selectedChannelId);
						}
					},
					cancelAiTurn: async (saveId) => {
						try {
							await playerTransactions.cancel(saveId);
						} finally {
							await syncRecoveryState(saveId);
						}
					},
					retryAiTurn: async (projection) => {
						try {
							if (await reconcileSettledLocalTurn(transactionJournal, ai, projection.saveId)) throw new Error("上一 transaction 已终态；请作为新的玩家动作重新提交，不会绕过 journal retry");
							return await playerTransactions.retry(projection);
						} catch (error) {
							await syncRecoveryState(projection.saveId, projection.selectedChannelId);
							throw error;
						}
					},
					acknowledgeAiTurn: async (saveId, turnId) => {
						await playerTransactions.acknowledge(saveId, turnId);
						await syncRecoveryState(saveId);
					},
					assertAiSaveQuiescent: (saveId) => playerTransactions.assertQuiescent(saveId),
					aiTurn: visibleTurn,
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