import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "./index";

function setup() {
  const handlers = new Map<string, (event: { payload: unknown }, ctx: ExtensionContext) => unknown>();
  let toggle!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  extension({
    registerCommand: (_name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => { toggle = command.handler; },
    on: (name: string, handler: (event: { payload: unknown }, ctx: ExtensionContext) => unknown) => { handlers.set(name, handler); },
  } as unknown as ExtensionAPI);
  const context = (provider: string, id = "gpt-6.1-sol") => ({
    model: { provider, id },
    ui: { notify() {} },
  }) as unknown as ExtensionCommandContext;
  return {
    toggle: () => toggle("", context("openai-codex")),
    request: (payload: unknown, provider = "openai-codex", id = "gpt-6.1-sol") =>
      handlers.get("before_provider_request")!({ payload }, context(provider, id)),
    reset: () => handlers.get("session_start")!({ payload: undefined }, context("openai-codex")),
  };
}

test("off by default, toggle on and off, reset on session start", async () => {
  const app = setup();
  const payload = { model: "gpt-6.1-sol" };
  expect(app.request(payload)).toBeUndefined();
  await app.toggle();
  expect(app.request(payload)).toEqual({ ...payload, service_tier: "priority" });
  await app.toggle();
  expect(app.request(payload)).toBeUndefined();
  await app.toggle();
  app.reset();
  expect(app.request(payload)).toBeUndefined();
});

test("all Codex models, no other providers, preserves original payload", async () => {
  const app = setup();
  await app.toggle();
  const payload = { model: "future-model", service_tier: "auto", input: [] };
  expect(app.request(payload, "openai-codex", "future-model")).toEqual({ ...payload, service_tier: "priority" });
  expect(payload.service_tier).toBe("auto");
  for (const provider of ["openai", "anthropic", "openrouter"]) {
    expect(app.request(payload, provider, "future-model")).toBeUndefined();
  }
});

test("ignores invalid and mismatched payloads", async () => {
  const app = setup();
  await app.toggle();
  for (const payload of [null, undefined, 1, "text", [], {}, { model: "other" }]) {
    expect(app.request(payload)).toBeUndefined();
  }
});
