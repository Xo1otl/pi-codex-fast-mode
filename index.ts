import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	FooterComponent,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const file = join(getAgentDir(), "codex-fast-mode");
	const enabled = (ctx: ExtensionContext) =>
		ctx.model?.provider === "openai-codex" && existsSync(file);
	let restoreFooter: (() => void) | undefined;

	pi.registerCommand("fast", {
		description: "Toggle Codex priority service tier",
		handler: async (_args, ctx) => {
			if (existsSync(file)) rmSync(file, { force: true });
			else {
				mkdirSync(dirname(file), { recursive: true });
				writeFileSync(file, "");
			}
			ctx.ui.notify(
				`Codex fast mode ${existsSync(file) ? "on" : "off"}`,
				"info",
			);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		restoreFooter?.();
		if (ctx.mode !== "tui") return;
		// setStatus adds a row; keep the built-in footer and decorate its stats row.
		const render = FooterComponent.prototype.render;
		const inline = function (this: FooterComponent, width: number) {
			const lines = render.call(this, width);
			if (enabled(ctx) && width >= 7) {
				lines[1] =
					render.call(this, width - 7)[1] + ctx.ui.theme.fg("dim", " • fast");
			}
			return lines;
		};
		FooterComponent.prototype.render = inline;
		restoreFooter = () => {
			if (FooterComponent.prototype.render === inline)
				FooterComponent.prototype.render = render;
		};
	});
	pi.on("session_shutdown", () => {
		restoreFooter?.();
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled(ctx)) return;
		const payload = event.payload;
		if (!payload || typeof payload !== "object" || Array.isArray(payload))
			return;
		if (!("model" in payload) || payload.model !== ctx.model?.id) return;
		return { ...payload, service_tier: "priority" };
	});
}
