import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "./index";

const originalDir = process.env.PI_CODING_AGENT_DIR;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "codex-fast-test-"));
  process.env.PI_CODING_AGENT_DIR = join(dir, "agent");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (originalDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalDir;
});

function setup() {
  const handlers = new Map<string, (event: { payload: unknown }, ctx: ExtensionContext) => unknown>();
  let toggle!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  let status: string | undefined;
  extension({
    registerCommand: (_name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => { toggle = command.handler; },
    on: (name: string, handler: (event: { payload: unknown }, ctx: ExtensionContext) => unknown) => { handlers.set(name, handler); },
  } as unknown as ExtensionAPI);
  const context = (provider: string, id = "gpt-6.1-sol") => ({
    model: { provider, id },
    ui: { notify() {}, setStatus(_key: string, value: string | undefined) { status = value; } },
  }) as unknown as ExtensionCommandContext;
  return {
    toggle: () => toggle("", context("openai-codex")),
    request: (payload: unknown, provider = "openai-codex", id = "gpt-6.1-sol") =>
      handlers.get("before_provider_request")!({ payload }, context(provider, id)),
    start: () => handlers.get("session_start")!({ payload: undefined }, context("openai-codex")),
    model: (provider: string) => handlers.get("model_select")!({ payload: undefined }, context(provider)),
    status: () => status,
  };
}

test("off by default, persists across sessions and reloads", async () => {
  const app = setup();
  const payload = { model: "gpt-6.1-sol" };
  app.start();
  expect(app.status()).toBeUndefined();
  expect(app.request(payload)).toBeUndefined();
  await app.toggle();
  expect(app.status()).toBe("⚡ fast");
  app.start();
  expect(app.request(payload)).toEqual({ ...payload, service_tier: "priority" });
  const reloaded = setup();
  reloaded.start();
  expect(reloaded.status()).toBe("⚡ fast");
  expect(reloaded.request(payload)).toEqual({ ...payload, service_tier: "priority" });
  await reloaded.toggle();
  expect(app.request(payload)).toBeUndefined();
  expect(app.status()).toBeUndefined();
});

test("already loaded subagents follow the shared toggle", async () => {
  const parent = setup();
  const child = setup();
  const payload = { model: "gpt-6.1-sol" };
  expect(child.request(payload)).toBeUndefined();
  await parent.toggle();
  expect(child.request(payload)).toEqual({ ...payload, service_tier: "priority" });
  await parent.toggle();
  expect(child.request(payload)).toBeUndefined();
});

test("all Codex models, no other providers, preserves original payload", async () => {
  const app = setup();
  await app.toggle();
  const payload = { model: "future-model", service_tier: "auto", input: [] };
  expect(app.request(payload, "openai-codex", "future-model")).toEqual({ ...payload, service_tier: "priority" });
  expect(payload.service_tier).toBe("auto");
  for (const provider of ["openai", "anthropic", "openrouter"]) {
    expect(app.request(payload, provider, "future-model")).toBeUndefined();
    expect(app.status()).toBeUndefined();
  }
  app.model("openai-codex");
  expect(app.status()).toBe("⚡ fast");
  app.model("openai");
  expect(app.status()).toBeUndefined();
});

test("ignores invalid and mismatched payloads", async () => {
  const app = setup();
  await app.toggle();
  for (const payload of [null, undefined, 1, "text", [], {}, { model: "other" }]) {
    expect(app.request(payload)).toBeUndefined();
  }
});
