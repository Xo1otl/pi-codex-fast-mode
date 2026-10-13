# pi-codex-fast-mode

```sh
pi install git:github.com/Xo1otl/pi-codex-fast-mode
```

`/fast` toggles `service_tier: "priority"` for all `openai-codex` models. Other providers are untouched. The footer shows `⚡ fast` when enabled on a Codex model.

Initially off. State is saved globally as the presence of `<agent-dir>/codex-fast-mode` (default `~/.pi/agent/codex-fast-mode`). It survives restarts and reloads. Sessions and subagents loading this extension with the same agent directory share the toggle; changes apply on their next provider request, not to requests already in flight.

Priority availability and usage charges depend on the upstream service and account. Sending the tier does not guarantee faster responses.

```sh
bun test
```
