import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const file = join(getAgentDir(), "codex-fast-mode");
  const refresh = (ctx: ExtensionContext) => {
    const enabled = existsSync(file);
    ctx.ui.setStatus("codex-fast", enabled && ctx.model?.provider === "openai-codex" ? "⚡ fast" : undefined);
    return enabled;
  };

  pi.registerCommand("fast", {
    description: "Toggle Codex priority service tier",
    handler: async (_args, ctx) => {
      if (existsSync(file)) rmSync(file, { force: true });
      else {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "");
      }
      ctx.ui.notify(`Codex fast mode ${refresh(ctx) ? "on" : "off"}`, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => { refresh(ctx); });
  pi.on("model_select", (_event, ctx) => { refresh(ctx); });

  pi.on("before_provider_request", (event, ctx) => {
    if (!refresh(ctx) || ctx.model?.provider !== "openai-codex") return;
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (!("model" in payload) || payload.model !== ctx.model.id) return;
    return { ...payload, service_tier: "priority" };
  });
}
