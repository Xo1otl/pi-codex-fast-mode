import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AgentSession,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	FooterComponent,
	initTheme,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import extension from "./index";

const originalDir = process.env.PI_CODING_AGENT_DIR;
const originalRender = FooterComponent.prototype.render;
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "codex-fast-test-"));
	process.env.PI_CODING_AGENT_DIR = join(dir, "agent");
	initTheme("dark");
});

afterEach(() => {
	FooterComponent.prototype.render = originalRender;
	rmSync(dir, { recursive: true, force: true });
	if (originalDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalDir;
});

function setup(mode: ExtensionContext["mode"] = "json") {
	const handlers = new Map<
		string,
		(event: { payload: unknown }, ctx: ExtensionContext) => unknown
	>();
	let toggle!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
	extension({
		registerCommand: (
			_name: string,
			command: Parameters<ExtensionAPI["registerCommand"]>[1],
		) => {
			toggle = command.handler;
		},
		on: (
			name: string,
			handler: (event: { payload: unknown }, ctx: ExtensionContext) => unknown,
		) => {
			handlers.set(name, handler);
		},
	} as unknown as ExtensionAPI);
	const model = (provider: string, id = "gpt-6.1-sol") => ({
		provider,
		id,
		reasoning: true,
		contextWindow: 200000,
	});
	const ctx = {
		mode,
		model: model("openai-codex"),
		getContextUsage: () => ({
			tokens: 10000,
			percent: 5,
			contextWindow: 200000,
		}),
		ui: {
			notify() {},
			setStatus() {
				throw new Error("fast must not add a status row");
			},
			theme: { fg: (_color: string, text: string) => text },
		},
	} as unknown as ExtensionCommandContext;
	const sessionManager = SessionManager.inMemory("/project/项目");
	sessionManager.appendSessionInfo("test session");
	const statuses = new Map<string, string>();
	const footer = new FooterComponent(
		{
			sessionManager,
			get model() {
				return ctx.model;
			},
			get state() {
				return { model: ctx.model, thinkingLevel: "high" };
			},
			getContextUsage: () => ctx.getContextUsage(),
			modelRuntime: { isUsingSubscription: () => false },
		} as unknown as AgentSession,
		{
			getGitBranch: () => "main",
			getExtensionStatuses: () => statuses,
			getAvailableProviderCount: () => 2,
			onBranchChange: () => () => {},
		},
	);
	const emit = (name: string) =>
		handlers.get(name)!({ payload: undefined }, ctx);
	return {
		toggle: () => toggle("", ctx),
		request: (
			payload: unknown,
			provider = "openai-codex",
			id = "gpt-6.1-sol",
		) =>
			handlers.get("before_provider_request")!({ payload }, {
				...ctx,
				model: model(provider, id),
			} as unknown as ExtensionContext),
		start: () => emit("session_start"),
		shutdown: () => emit("session_shutdown"),
		model: (provider: string) => {
			ctx.model = model(provider) as typeof ctx.model;
		},
		statuses,
		render: (width = 100) => footer.render(width).map(Bun.stripANSI),
		native: (width = 100) =>
			originalRender.call(footer, width).map(Bun.stripANSI),
	};
}

test("off by default, persists across sessions and reloads", async () => {
	const app = setup();
	const payload = { model: "gpt-6.1-sol" };
	app.start();
	expect(app.request(payload)).toBeUndefined();
	await app.toggle();
	app.start();
	expect(app.request(payload)).toEqual({
		...payload,
		service_tier: "priority",
	});
	const reloaded = setup();
	reloaded.start();
	expect(reloaded.request(payload)).toEqual({
		...payload,
		service_tier: "priority",
	});
	await reloaded.toggle();
	expect(app.request(payload)).toBeUndefined();
});

test("already loaded subagents follow the shared toggle", async () => {
	const parent = setup();
	const child = setup();
	const payload = { model: "gpt-6.1-sol" };
	expect(child.request(payload)).toBeUndefined();
	await parent.toggle();
	expect(child.request(payload)).toEqual({
		...payload,
		service_tier: "priority",
	});
	await parent.toggle();
	expect(child.request(payload)).toBeUndefined();
});

test("all Codex models, no other providers, preserves original payload", async () => {
	const app = setup();
	await app.toggle();
	const payload = { model: "future-model", service_tier: "auto", input: [] };
	expect(app.request(payload, "openai-codex", "future-model")).toEqual({
		...payload,
		service_tier: "priority",
	});
	expect(payload.service_tier).toBe("auto");
	for (const provider of ["openai", "anthropic", "openrouter"]) {
		expect(app.request(payload, provider, "future-model")).toBeUndefined();
	}
});

test("ignores invalid and mismatched payloads", async () => {
	const app = setup();
	await app.toggle();
	for (const payload of [
		null,
		undefined,
		1,
		"text",
		[],
		{},
		{ model: "other" },
	]) {
		expect(app.request(payload)).toBeUndefined();
	}
});

test("fast is inline with the model and thinking level, preserving other footer lines", async () => {
	const app = setup("tui");
	app.statuses.set("other", "another extension");
	app.start();
	const normal = app.native();
	expect(app.render()).toEqual(normal);
	await app.toggle();
	const fast = app.render();
	expect(fast).toHaveLength(normal.length);
	expect(fast[0]).toBe(normal[0]);
	expect(fast[1]).toEndWith("gpt-6.1-sol • high • fast");
	expect(fast[2]).toBe(normal[2]);
	app.start();
	expect(app.render()).toEqual(fast);
	app.model("openai");
	expect(app.render()).toEqual(app.native());
	app.model("openai-codex");
	expect(app.render()).toEqual(fast);
	await app.toggle();
	expect(app.render()).toEqual(normal);
});

test("footer fits narrow widths without wrapping or adding rows", async () => {
	const app = setup("tui");
	app.statuses.set("other", "Unicode 状态 ⚡");
	app.start();
	await app.toggle();
	for (const width of [0, 1, 6, 7, 8, 20, 60, 100]) {
		const lines = app.render(width);
		expect(lines).toHaveLength(app.native(width).length);
		for (const line of lines)
			expect(Bun.stringWidth(line)).toBeLessThanOrEqual(width);
	}
});

test("shutdown restores the renderer; reload does not duplicate fast", async () => {
	const app = setup("tui");
	expect(FooterComponent.prototype.render).toBe(originalRender);
	app.start();
	await app.toggle();
	app.shutdown();
	expect(FooterComponent.prototype.render).toBe(originalRender);
	const reloaded = setup("tui");
	reloaded.start();
	expect(reloaded.render()[1]?.match(/fast/g)).toHaveLength(1);
	reloaded.shutdown();
	expect(FooterComponent.prototype.render).toBe(originalRender);
});

for (const mode of ["json", "print", "rpc"] as const) {
	test(`${mode} mode does not modify terminal rendering`, async () => {
		const app = setup(mode);
		app.start();
		await app.toggle();
		expect(app.request({ model: "gpt-6.1-sol" })).toEqual({
			model: "gpt-6.1-sol",
			service_tier: "priority",
		});
		expect(FooterComponent.prototype.render).toBe(originalRender);
		app.shutdown();
		expect(FooterComponent.prototype.render).toBe(originalRender);
	});
}
