import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
//#region src/host-store.ts
function safe(id) {
	return basename(id.replace(/[^a-zA-Z0-9_-]/g, "_")).slice(0, 100) || "default";
}
function summaryOf(value) {
	return {
		saveId: String(value.saveId),
		packId: String(value.packId ?? "unknown"),
		packTitle: String(value.packTitle ?? "未命名存档"),
		revision: Number(value.revision ?? 0),
		updatedAt: String(value.updatedAt ?? ""),
		sceneLabel: String(value.frame?.sceneLabel ?? "")
	};
}
var StoryProjectionStore = class {
	root;
	queues = /* @__PURE__ */ new Map();
	constructor(root) {
		this.root = root;
	}
	directory() {
		return join(this.root, "social-saves");
	}
	path(id) {
		return join(this.directory(), `${safe(id)}.json`);
	}
	async exclusive(id, work) {
		const previous = this.queues.get(id) ?? Promise.resolve();
		let release;
		const current = new Promise((resolve) => {
			release = resolve;
		});
		const queued = previous.then(() => current);
		this.queues.set(id, queued);
		await previous;
		try {
			return await work();
		} finally {
			release();
			if (this.queues.get(id) === queued) this.queues.delete(id);
		}
	}
	async read(id) {
		try {
			return JSON.parse(await readFile(this.path(id), "utf8"));
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
	}
	async list() {
		const names = await readdir(this.directory()).catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		const summaries = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			try {
				const value = await this.read(name.slice(0, -5));
				if (value !== void 0) summaries.push(summaryOf(value));
			} catch {}
		}
		return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
	async write(id, expectedRevision, value) {
		return this.exclusive(id, async () => {
			const current = await this.read(id);
			const revision = current === void 0 ? -1 : Number(current.revision);
			if (value.saveId !== id || !Number.isInteger(value.revision) || Number(value.revision) !== expectedRevision + 1) throw new Error("存档 ID 或新版本无效");
			if (current !== void 0 && revision === Number(value.revision) && isDeepStrictEqual(current, value)) return current;
			if (revision !== expectedRevision) throw new Error(`存档版本冲突：当前 ${revision}，提交基于 ${expectedRevision}`);
			const path = this.path(id);
			await mkdir(dirname(path), { recursive: true });
			const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
			await rename(temporary, path);
			return value;
		});
	}
	/** Remove one save. Returns false when the save did not exist. */
	async remove(id) {
		return this.exclusive(id, async () => {
			try {
				await rm(this.path(id));
				return true;
			} catch (error) {
				if (error.code === "ENOENT") return false;
				throw error;
			}
		});
	}
};
//#endregion
//#region src/runtime-store.ts
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;
function assertId(value, label) {
	if (!SAFE_ID.test(value)) throw new Error(`${label} 无效`);
}
function replacePaths(value, source, target) {
	if (typeof value === "string") return value.replaceAll(source, target).replaceAll(source.replaceAll("\\", "/"), target.replaceAll("\\", "/"));
	if (Array.isArray(value)) return value.map((item) => replacePaths(item, source, target));
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePaths(item, source, target)]));
	return value;
}
/** Copies one session-scoped Story Engine runtime into an independent child. */
var StoryRuntimeStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	directory(packId, sessionId) {
		return join(this.root, packId, sessionId);
	}
	async clone(packId, sourceSessionId, targetSessionId) {
		assertId(packId, "内容包 ID");
		assertId(sourceSessionId, "源会话 ID");
		assertId(targetSessionId, "目标会话 ID");
		if (sourceSessionId === targetSessionId) throw new Error("源会话与目标会话不能相同");
		const source = this.directory(packId, sourceSessionId);
		const target = this.directory(packId, targetSessionId);
		try {
			await access(source);
		} catch (error) {
			if (error.code === "ENOENT") return false;
			throw error;
		}
		try {
			await access(target);
			throw new Error("目标剧情状态已存在");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
		await mkdir(dirname(target), { recursive: true });
		try {
			await cp(source, temporary, {
				recursive: true,
				errorOnExist: true,
				force: false
			});
			const statePath = join(temporary, "state.json");
			const state = JSON.parse(await readFile(statePath, "utf8"));
			await writeFile(statePath, `${JSON.stringify(replacePaths(state, source, target), null, 2)}\n`, "utf8");
			await rename(temporary, target);
			return true;
		} finally {
			await rm(temporary, {
				recursive: true,
				force: true
			});
		}
	}
};
//#endregion
//#region src/story-ui-descriptor.ts
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const roles = new Set([
	"player",
	"npc",
	"narrator",
	"system"
]);
const statuses = new Set([
	"active",
	"missing",
	"injured",
	"dead",
	"retired"
]);
const channelKinds = new Set([
	"direct",
	"group",
	"scene",
	"work",
	"system"
]);
const categories = new Set([
	"personal",
	"work",
	"story",
	"system"
]);
const messageKinds = new Set([
	"dialogue",
	"narration",
	"action",
	"system",
	"choice",
	"work-dispatch",
	"relationship",
	"episode-summary"
]);
const canonStatuses = new Set([
	"proposed",
	"committed",
	"retracted"
]);
function object$1(value, path) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} 必须是对象`);
	return value;
}
function string(value, path) {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${path} 必须是非空字符串`);
	return value;
}
function id(value, path) {
	const result = string(value, path);
	if (!idPattern.test(result)) throw new Error(`${path} 必须是有效 ID`);
	return result;
}
function exactKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path} 不允许字段：${key}`);
}
function stringMap(value, path, validKeys, messageIds) {
	const data = object$1(value, path);
	for (const [key, item] of Object.entries(data)) {
		if (!validKeys.has(key)) throw new Error(`${path} 引用了不存在的频道：${key}`);
		if (typeof item !== "string") throw new Error(`${path}.${key} 必须是字符串`);
		if (messageIds !== void 0 && item !== "" && !messageIds.has(item)) throw new Error(`${path}.${key} 引用了不存在的消息：${item}`);
	}
}
function timestamp$1(value, path) {
	const raw = string(value, path);
	if (Number.isNaN(Date.parse(raw))) throw new Error(`${path} 必须是 ISO 日期时间`);
}
/** Validates the schema shape and all participant/channel/message references. */
function validateStoryUiDescriptor(value) {
	const data = object$1(value, "ui/story-ui.json");
	exactKeys(data, [
		"schemaVersion",
		"selectedChannelId",
		"participants",
		"channels",
		"messages",
		"drafts",
		"readCursors",
		"frame"
	], "ui/story-ui.json");
	if (data.schemaVersion !== 1) throw new Error("ui/story-ui.json.schemaVersion 必须为 1");
	const selectedChannelId = id(data.selectedChannelId, "selectedChannelId");
	if (!Array.isArray(data.participants) || data.participants.length === 0) throw new Error("participants 必须是非空数组");
	const participantIds = /* @__PURE__ */ new Set();
	for (const [index, item] of data.participants.entries()) {
		const participant = object$1(item, `participants[${index}]`);
		exactKeys(participant, [
			"id",
			"heroNameZh",
			"realNameZh",
			"aliases",
			"role",
			"status"
		], `participants[${index}]`);
		const participantId = id(participant.id, `participants[${index}].id`);
		if (participantIds.has(participantId)) throw new Error(`人物 ID 重复：${participantId}`);
		participantIds.add(participantId);
		if (participant.heroNameZh !== void 0) string(participant.heroNameZh, `participants[${index}].heroNameZh`);
		string(participant.realNameZh, `participants[${index}].realNameZh`);
		if (!Array.isArray(participant.aliases) || participant.aliases.some((alias) => typeof alias !== "string")) throw new Error(`participants[${index}].aliases 必须是字符串数组`);
		if (new Set(participant.aliases).size !== participant.aliases.length) throw new Error(`participants[${index}].aliases 不得重复`);
		if (!roles.has(participant.role)) throw new Error(`participants[${index}].role 无效`);
		if (!statuses.has(participant.status)) throw new Error(`participants[${index}].status 无效`);
	}
	if (data.participants.filter((item) => object$1(item, "participant").role === "player").length !== 1) throw new Error("participants 必须且只能有一名玩家角色");
	if (!Array.isArray(data.channels) || data.channels.length === 0) throw new Error("channels 必须是非空数组");
	const channelIds = /* @__PURE__ */ new Set();
	const channelMembers = /* @__PURE__ */ new Map();
	for (const [index, item] of data.channels.entries()) {
		const channel = object$1(item, `channels[${index}]`);
		exactKeys(channel, [
			"id",
			"kind",
			"title",
			"participantIds",
			"category",
			"pinned",
			"muted",
			"archived",
			"lastMessageId",
			"lastActivityAt"
		], `channels[${index}]`);
		const channelId = id(channel.id, `channels[${index}].id`);
		if (channelIds.has(channelId)) throw new Error(`频道 ID 重复：${channelId}`);
		channelIds.add(channelId);
		if (!channelKinds.has(channel.kind)) throw new Error(`channels[${index}].kind 无效`);
		string(channel.title, `channels[${index}].title`);
		if (!Array.isArray(channel.participantIds) || channel.participantIds.length === 0) throw new Error(`channels[${index}].participantIds 必须是非空数组`);
		const members = /* @__PURE__ */ new Set();
		for (const member of channel.participantIds) {
			const memberId = id(member, `channels[${index}].participantIds`);
			if (!participantIds.has(memberId)) throw new Error(`频道成员不存在：${channelId}.${memberId}`);
			if (members.has(memberId)) throw new Error(`频道成员重复：${channelId}.${memberId}`);
			members.add(memberId);
		}
		if (!categories.has(channel.category)) throw new Error(`channels[${index}].category 无效`);
		channelMembers.set(channelId, members);
		for (const key of [
			"pinned",
			"muted",
			"archived"
		]) if (typeof channel[key] !== "boolean") throw new Error(`channels[${index}].${key} 必须是布尔值`);
		if (channel.lastMessageId !== void 0) id(channel.lastMessageId, `channels[${index}].lastMessageId`);
		if (channel.lastActivityAt !== void 0) timestamp$1(channel.lastActivityAt, `channels[${index}].lastActivityAt`);
	}
	if (!channelIds.has(selectedChannelId)) throw new Error("selectedChannelId 引用了不存在的频道");
	if (!Array.isArray(data.messages)) throw new Error("messages 必须是数组");
	const messageIds = /* @__PURE__ */ new Set();
	const messageChannels = /* @__PURE__ */ new Map();
	for (const [index, item] of data.messages.entries()) {
		const message = object$1(item, `messages[${index}]`);
		exactKeys(message, [
			"id",
			"channelId",
			"senderId",
			"kind",
			"content",
			"createdAt",
			"seasonId",
			"episodeId",
			"sceneId",
			"turnId",
			"choiceId",
			"canonStatus"
		], `messages[${index}]`);
		const messageId = id(message.id, `messages[${index}].id`);
		if (messageIds.has(messageId)) throw new Error(`消息 ID 重复：${messageId}`);
		messageIds.add(messageId);
		messageChannels.set(messageId, String(message.channelId));
		const channelId = id(message.channelId, `messages[${index}].channelId`);
		const senderId = id(message.senderId, `messages[${index}].senderId`);
		if (!channelIds.has(channelId) || !participantIds.has(senderId)) throw new Error(`消息引用无效：${messageId}`);
		const senderRole = data.participants.map((item) => object$1(item, "participant")).find((participant) => participant.id === senderId)?.role;
		if (!channelMembers.get(channelId)?.has(senderId) && senderRole !== "narrator" && senderRole !== "system") throw new Error(`消息发送者不属于频道：${messageId}`);
		if (!messageKinds.has(message.kind)) throw new Error(`messages[${index}].kind 无效`);
		string(message.content, `messages[${index}].content`);
		timestamp$1(message.createdAt, `messages[${index}].createdAt`);
		string(message.seasonId, `messages[${index}].seasonId`);
		string(message.episodeId, `messages[${index}].episodeId`);
		id(message.turnId, `messages[${index}].turnId`);
		if (message.sceneId !== void 0) string(message.sceneId, `messages[${index}].sceneId`);
		if (message.choiceId !== void 0) id(message.choiceId, `messages[${index}].choiceId`);
		if (!canonStatuses.has(message.canonStatus)) throw new Error(`messages[${index}].canonStatus 无效`);
	}
	for (const [index, item] of data.channels.entries()) {
		const channel = object$1(item, `channels[${index}]`);
		if (channel.lastMessageId !== void 0 && (!messageIds.has(channel.lastMessageId) || messageChannels.get(channel.lastMessageId) !== channel.id)) throw new Error(`频道最后消息不存在或不属于该频道：${channel.id}`);
	}
	stringMap(data.drafts, "drafts", channelIds);
	stringMap(data.readCursors, "readCursors", channelIds, messageIds);
	const frame = object$1(data.frame, "frame");
	exactKeys(frame, [
		"seasonLabel",
		"episodeLabel",
		"sceneLabel"
	], "frame");
	string(frame.seasonLabel, "frame.seasonLabel");
	string(frame.episodeLabel, "frame.episodeLabel");
	string(frame.sceneLabel, "frame.sceneLabel");
	return structuredClone(data);
}
//#endregion
//#region src/catalog-store.ts
async function manifests(root) {
	const found = [];
	async function visit(directory) {
		const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile() && entry.name === "pack.json") found.push(path);
		}
	}
	await visit(root);
	return found.sort();
}
var StoryCatalogStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	async list() {
		const packs = [];
		for (const manifestPath of await manifests(this.root)) try {
			const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
			if (typeof manifest.id !== "string" || typeof manifest.name !== "string" || typeof manifest.version !== "string") continue;
			const directory = dirname(manifestPath);
			let template;
			let diagnostic = "缺少 ui/story-ui.json，暂不能从游戏库新建存档";
			try {
				template = validateStoryUiDescriptor(JSON.parse(await readFile(join(directory, "ui", "story-ui.json"), "utf8")));
			} catch (error) {
				if (error.code !== "ENOENT") diagnostic = `ui/story-ui.json 无效：${error instanceof Error ? error.message : String(error)}`;
			}
			packs.push({
				packId: manifest.id,
				title: manifest.name,
				author: manifest.license === "Private-Use-Only" ? "私人内容包" : "本地内容包",
				version: manifest.version,
				status: template === void 0 ? "diagnostic" : "ready",
				description: String(manifest.description ?? ""),
				agentPreset: `story-${manifest.id}`,
				...template === void 0 ? { diagnostic } : { template }
			});
		} catch {}
		return packs;
	}
};
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAVE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/u;
const STORY_UI_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
function object(value, label) {
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
	const raw = object(value, "transaction");
	if (raw.schemaVersion !== 1) throw new Error("transaction.schemaVersion 必须为 1");
	const transactionId = stableString(raw.transactionId, "transactionId");
	const saveId = text(raw.saveId, "saveId");
	assertSaveId(saveId);
	const inputRaw = object(raw.input, "input");
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
		const entry = object(item, `hiddenTurns[${index}]`);
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
		const entry = object(item, `operationRefs[${index}]`);
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
		const entry = object(raw.diagnostic, "diagnostic");
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
function assertInitialTransactionRecord(record) {
	if (record.revision !== 0) throw new Error("初始 transaction revision 必须为 0");
	if (record.status !== "prepared") throw new Error("初始 transaction 必须是 prepared");
	if (record.hiddenTurns.length !== 0) throw new Error("初始 transaction 不能预填 hidden turn evidence");
	if (record.operationRefs.length !== 0) throw new Error("初始 transaction 不能预填 operation identity evidence");
	if (record.activeTurnId !== void 0 || record.canonicalResultTurnId !== void 0) throw new Error("初始 transaction 不能预填 turn result identity");
}
const TERMINAL_TRANSACTION = new Set([
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
const TERMINAL_TURN = new Set([
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
	if (TERMINAL_TRANSACTION.has(current.status)) conflict(`终态 ${current.status} 不可产生新 revision`);
	if (!TRANSACTION_TRANSITIONS[current.status].has(next.status)) conflict(`transaction 状态不能从 ${current.status} 迁移到 ${next.status}`);
	if (next.hiddenTurns.length < current.hiddenTurns.length) conflict("hidden turn evidence 不可删除");
	for (let index = 0; index < current.hiddenTurns.length; index += 1) {
		const before = current.hiddenTurns[index];
		const after = next.hiddenTurns[index];
		if (after.turnId !== before.turnId || after.kind !== before.kind) conflict("hidden turn identity 不可修改");
		if (before.dshRequestId !== void 0 && after.dshRequestId !== before.dshRequestId) conflict("DSH request identity 不可修改");
		if (before.sessionId !== void 0 && after.sessionId !== before.sessionId) conflict("hidden session identity 不可修改");
		if (before.dshTurn !== void 0 && after.dshTurn !== before.dshTurn) conflict("DSH native turn 不可修改");
		if (TERMINAL_TURN.has(before.state)) {
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
	if (TERMINAL_TRANSACTION.has(next.status)) {
		if (next.activeTurnId !== void 0) conflict(`终态 ${next.status} 不能保留 activeTurnId`);
		const pending = next.hiddenTurns.find((turn) => !TERMINAL_TURN.has(turn.state));
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
//#endregion
//#region src/transaction-store.ts
var StoryTransactionStore = class {
	root;
	queues = /* @__PURE__ */ new Map();
	constructor(root) {
		this.root = root;
	}
	directory(saveId) {
		assertSaveId(saveId);
		return join(this.root, "transaction-journal", saveId);
	}
	filename(transactionId) {
		assertTransactionId(transactionId);
		return `tx-${Buffer.from(transactionId, "utf8").toString("base64url")}.json`;
	}
	transactionIdFromFilename(name) {
		if (!name.startsWith("tx-") || !name.endsWith(".json")) throw new Error(`transaction journal 文件名格式无效：${name}`);
		const encoded = name.slice(3, -5);
		let transactionId;
		try {
			transactionId = Buffer.from(encoded, "base64url").toString("utf8");
		} catch {
			throw new Error(`transaction journal 文件名编码无效：${name}`);
		}
		assertTransactionId(transactionId);
		if (this.filename(transactionId) !== name) throw new Error(`transaction journal 文件名非规范编码：${name}`);
		return transactionId;
	}
	path(saveId, transactionId) {
		return join(this.directory(saveId), this.filename(transactionId));
	}
	async validate(value) {
		const record = validateTransactionRecord(value);
		const fingerprint = await fingerprintTransactionInput(record.saveId, record.input.channelId, record.input.text);
		if (record.inputFingerprint !== fingerprint) throw new Error("inputFingerprint 与 transaction input 不一致");
		return record;
	}
	async exclusive(saveId, transactionId, work) {
		const key = `${saveId}:${transactionId}`;
		const previous = this.queues.get(key) ?? Promise.resolve();
		let release;
		const current = new Promise((resolve) => {
			release = resolve;
		});
		const queued = previous.then(() => current);
		this.queues.set(key, queued);
		await previous;
		try {
			return await work();
		} finally {
			release();
			if (this.queues.get(key) === queued) this.queues.delete(key);
		}
	}
	async read(saveId, transactionId) {
		assertSaveId(saveId);
		assertTransactionId(transactionId);
		try {
			const value = await this.validate(JSON.parse(await readFile(this.path(saveId, transactionId), "utf8")));
			if (value.saveId !== saveId || value.transactionId !== transactionId) throw new Error("transaction journal 路径身份不匹配");
			return value;
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
	}
	async list(saveId) {
		assertSaveId(saveId);
		const names = await readdir(this.directory(saveId)).catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		const records = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const transactionId = this.transactionIdFromFilename(name);
			const record = await this.read(saveId, transactionId);
			if (record === void 0) throw new Error(`transaction journal 在列表期间消失：${transactionId}`);
			records.push(record);
		}
		return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.transactionId.localeCompare(b.transactionId));
	}
	async write(saveId, transactionId, expectedRevision, value) {
		assertSaveId(saveId);
		assertTransactionId(transactionId);
		if (!Number.isInteger(expectedRevision) || expectedRevision < -1) throw new Error("expectedRevision 无效");
		const next = await this.validate(value);
		if (next.saveId !== saveId || next.transactionId !== transactionId) throw new Error("transaction journal 路径身份不匹配");
		if (next.revision !== expectedRevision + 1) throw new Error("transaction 新版本无效");
		return this.exclusive(saveId, transactionId, async () => {
			const current = await this.read(saveId, transactionId);
			const revision = current === void 0 ? -1 : current.revision;
			if (current !== void 0 && revision === next.revision) {
				if (isDeepStrictEqual(current, next)) return current;
				assertTransactionUpdate(current, next);
				throw new Error(`transaction 版本冲突：revision ${revision} 的内容不同`);
			}
			if (revision !== expectedRevision) throw new Error(`transaction 版本冲突：当前 ${revision}，提交基于 ${expectedRevision}`);
			if (current === void 0) assertInitialTransactionRecord(next);
			else assertTransactionUpdate(current, next);
			const path = this.path(saveId, transactionId);
			await mkdir(this.directory(saveId), { recursive: true });
			const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
			await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
			await rename(temporary, path);
			return next;
		});
	}
};
//#endregion
//#region src/index.ts
const inject = ["webServer"];
const SAVE_BASE = "/story-engine/api/saves/";
const TRANSACTION_BASE = "/story-engine/api/transactions/";
const RUNTIME_CLONE = "/story-engine/api/runtime/clone";
const CATALOG = "/story-engine/api/catalog";
async function body(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += bytes.length;
		if (size > 2e6) throw new Error("请求体超过 2 MB");
		chunks.push(bytes);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function json(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(value));
}
function sameOrigin(req) {
	const origin = req.headers.origin;
	return origin === void 0 || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}
function message(error) {
	return error instanceof Error ? error.message : String(error);
}
function statusFor(error) {
	return message(error).includes("冲突") ? 409 : 400;
}
function apply(ctx, config = {}) {
	const runtimeRoot = config.runtimeRoot ?? "D:/DSH-Story-Engine/runtime-ui";
	const saves = new StoryProjectionStore(runtimeRoot);
	const transactions = new StoryTransactionStore(runtimeRoot);
	const runtime = new StoryRuntimeStore(config.storyRuntimeRoot ?? "D:/DSH-Story-Engine/runtime");
	const catalog = new StoryCatalogStore(config.packsRoot ?? "D:/DSH-Story-Engine/packs");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: SAVE_BASE.slice(0, -1),
		async handler(req, res) {
			try {
				const url = new URL(req.url ?? "/", "http://localhost");
				const id = decodeURIComponent(url.pathname.slice(24));
				if (id === "") {
					if (req.method === "GET") {
						json(res, 200, { saves: await saves.list() });
						return;
					}
					json(res, 405, { error: "方法不允许" });
					return;
				}
				if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
					json(res, 400, { error: "存档 ID 无效" });
					return;
				}
				if (req.method === "GET") {
					const value = await saves.read(id);
					if (value === void 0) {
						res.writeHead(204, { "cache-control": "no-store" });
						res.end();
						return;
					}
					json(res, 200, value);
					return;
				}
				if (req.method === "PUT") {
					if (!sameOrigin(req)) {
						json(res, 403, { error: "拒绝跨站写入" });
						return;
					}
					const payload = await body(req);
					if (!Number.isInteger(payload.expectedRevision) || !payload.projection || typeof payload.projection !== "object") {
						json(res, 400, { error: "请求格式无效" });
						return;
					}
					json(res, 200, await saves.write(id, Number(payload.expectedRevision), payload.projection));
					return;
				}
				if (req.method === "DELETE") {
					if (!sameOrigin(req)) {
						json(res, 403, { error: "拒绝跨站写入" });
						return;
					}
					if (!await saves.remove(id)) {
						res.writeHead(204, { "cache-control": "no-store" });
						res.end();
						return;
					}
					json(res, 200, { removed: true });
					return;
				}
				res.setHeader("allow", "GET, PUT, DELETE");
				json(res, 405, { error: "方法不允许" });
			} catch (error) {
				json(res, statusFor(error), { error: message(error) });
			}
		}
	}), "story-ui: projection API");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: TRANSACTION_BASE.slice(0, -1),
		async handler(req, res) {
			try {
				const url = new URL(req.url ?? "/", "http://localhost");
				if (!url.pathname.startsWith(TRANSACTION_BASE)) {
					json(res, 400, { error: "transaction 路径无效" });
					return;
				}
				const encodedParts = url.pathname.slice(31).split("/");
				if (encodedParts.length < 1 || encodedParts.length > 2 || encodedParts.some((part) => part === "")) {
					json(res, 400, { error: "transaction 路径无效" });
					return;
				}
				const parts = encodedParts.map((part) => decodeURIComponent(part));
				const saveId = parts[0];
				assertSaveId(saveId);
				if (parts.length === 1) {
					if (req.method !== "GET") {
						res.setHeader("allow", "GET");
						json(res, 405, { error: "方法不允许" });
						return;
					}
					json(res, 200, { transactions: await transactions.list(saveId) });
					return;
				}
				const transactionId = parts[1];
				assertTransactionId(transactionId);
				if (req.method === "GET") {
					const value = await transactions.read(saveId, transactionId);
					if (value === void 0) {
						res.writeHead(204, { "cache-control": "no-store" });
						res.end();
						return;
					}
					json(res, 200, value);
					return;
				}
				if (req.method === "PUT") {
					if (!sameOrigin(req)) {
						json(res, 403, { error: "拒绝跨站写入" });
						return;
					}
					const payload = await body(req);
					if (!Number.isInteger(payload.expectedRevision) || payload.transaction === void 0) {
						json(res, 400, { error: "请求格式无效" });
						return;
					}
					json(res, 200, await transactions.write(saveId, transactionId, Number(payload.expectedRevision), payload.transaction));
					return;
				}
				res.setHeader("allow", "GET, PUT");
				json(res, 405, { error: "方法不允许" });
			} catch (error) {
				json(res, statusFor(error), { error: message(error) });
			}
		}
	}), "story-ui: transaction journal API");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: RUNTIME_CLONE,
		async handler(req, res) {
			try {
				if (req.method !== "POST") {
					res.setHeader("allow", "POST");
					json(res, 405, { error: "方法不允许" });
					return;
				}
				if (!sameOrigin(req)) {
					json(res, 403, { error: "拒绝跨站写入" });
					return;
				}
				const payload = await body(req);
				if (typeof payload.packId !== "string" || typeof payload.sourceSessionId !== "string" || typeof payload.targetSessionId !== "string") {
					json(res, 400, { error: "请求格式无效" });
					return;
				}
				json(res, 200, { cloned: await runtime.clone(payload.packId, payload.sourceSessionId, payload.targetSessionId) });
			} catch (error) {
				json(res, 400, { error: message(error) });
			}
		}
	}), "story-ui: runtime clone API");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: CATALOG,
		async handler(req, res) {
			try {
				if (req.method !== "GET") {
					res.setHeader("allow", "GET");
					json(res, 405, { error: "方法不允许" });
					return;
				}
				json(res, 200, { packs: await catalog.list() });
			} catch (error) {
				json(res, 400, { error: message(error) });
			}
		}
	}), "story-ui: content pack catalog API");
}
//#endregion
export { apply, inject };
