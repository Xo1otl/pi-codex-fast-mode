# pi-codex-fast-mode

```sh
pi install git:github.com/Xo1otl/pi-codex-fast-mode
```

`/fast` toggles `service_tier: "priority"` for all `openai-codex` models, including `gpt-6.1-sol`. Off at session start. Other providers are untouched.

Priority availability and usage charges depend on the upstream service and account. Sending the tier does not guarantee faster responses.

```sh
bun test
```
