import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let enabled = false;

  pi.registerCommand("fast", {
    description: "Toggle Codex priority service tier",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      ctx.ui.notify(`Codex fast mode ${enabled ? "on" : "off"}`, "info");
    },
  });

  pi.on("session_start", () => {
    enabled = false;
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!enabled || ctx.model?.provider !== "openai-codex") return;
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (!("model" in payload) || payload.model !== ctx.model.id) return;
    return { ...payload, service_tier: "priority" };
  });
}
