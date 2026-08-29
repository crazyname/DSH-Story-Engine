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
function object(value, path) {
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
	const data = object(value, path);
	for (const [key, item] of Object.entries(data)) {
		if (!validKeys.has(key)) throw new Error(`${path} 引用了不存在的频道：${key}`);
		if (typeof item !== "string") throw new Error(`${path}.${key} 必须是字符串`);
		if (messageIds !== void 0 && item !== "" && !messageIds.has(item)) throw new Error(`${path}.${key} 引用了不存在的消息：${item}`);
	}
}
function timestamp(value, path) {
	const raw = string(value, path);
	if (Number.isNaN(Date.parse(raw))) throw new Error(`${path} 必须是 ISO 日期时间`);
}
/** Validates the schema shape and all participant/channel/message references. */
function validateStoryUiDescriptor(value) {
	const data = object(value, "ui/story-ui.json");
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
		const participant = object(item, `participants[${index}]`);
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
	if (data.participants.filter((item) => object(item, "participant").role === "player").length !== 1) throw new Error("participants 必须且只能有一名玩家角色");
	if (!Array.isArray(data.channels) || data.channels.length === 0) throw new Error("channels 必须是非空数组");
	const channelIds = /* @__PURE__ */ new Set();
	const channelMembers = /* @__PURE__ */ new Map();
	for (const [index, item] of data.channels.entries()) {
		const channel = object(item, `channels[${index}]`);
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
		if (channel.lastActivityAt !== void 0) timestamp(channel.lastActivityAt, `channels[${index}].lastActivityAt`);
	}
	if (!channelIds.has(selectedChannelId)) throw new Error("selectedChannelId 引用了不存在的频道");
	if (!Array.isArray(data.messages)) throw new Error("messages 必须是数组");
	const messageIds = /* @__PURE__ */ new Set();
	const messageChannels = /* @__PURE__ */ new Map();
	for (const [index, item] of data.messages.entries()) {
		const message = object(item, `messages[${index}]`);
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
		const senderRole = data.participants.map((item) => object(item, "participant")).find((participant) => participant.id === senderId)?.role;
		if (!channelMembers.get(channelId)?.has(senderId) && senderRole !== "narrator" && senderRole !== "system") throw new Error(`消息发送者不属于频道：${messageId}`);
		if (!messageKinds.has(message.kind)) throw new Error(`messages[${index}].kind 无效`);
		string(message.content, `messages[${index}].content`);
		timestamp(message.createdAt, `messages[${index}].createdAt`);
		string(message.seasonId, `messages[${index}].seasonId`);
		string(message.episodeId, `messages[${index}].episodeId`);
		id(message.turnId, `messages[${index}].turnId`);
		if (message.sceneId !== void 0) string(message.sceneId, `messages[${index}].sceneId`);
		if (message.choiceId !== void 0) id(message.choiceId, `messages[${index}].choiceId`);
		if (!canonStatuses.has(message.canonStatus)) throw new Error(`messages[${index}].canonStatus 无效`);
	}
	for (const [index, item] of data.channels.entries()) {
		const channel = object(item, `channels[${index}]`);
		if (channel.lastMessageId !== void 0 && (!messageIds.has(channel.lastMessageId) || messageChannels.get(channel.lastMessageId) !== channel.id)) throw new Error(`频道最后消息不存在或不属于该频道：${channel.id}`);
	}
	stringMap(data.drafts, "drafts", channelIds);
	stringMap(data.readCursors, "readCursors", channelIds, messageIds);
	const frame = object(data.frame, "frame");
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
//#endregion
//#region src/index.ts
const inject = ["webServer"];
const SAVE_BASE = "/story-engine/api/saves/";
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
function apply(ctx, config = {}) {
	const saves = new StoryProjectionStore(config.runtimeRoot ?? "D:/DSH-Story-Engine/runtime-ui");
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
				const detail = message(error);
				json(res, detail.includes("版本冲突") ? 409 : 400, { error: detail });
			}
		}
	}), "story-ui: projection API");
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
