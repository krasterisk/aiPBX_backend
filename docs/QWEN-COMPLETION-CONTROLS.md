# Qwen completion controls — R47

Coordinator: helpdesk thread 01a151fb-190f-7d72-a1fb-ce8c05fef753, codex-direct.
User authorized source fix and backend-only aipbx.net deploy:1.
Release branch starts at deployed 0143cc37200d9cbf8c4d5410070b0379bbecae29; unrelated master changes and staged analytics are excluded.

Plan: validate explicit think, JSON object/schema and sampling options in the HTTP contract, forward to native Ollama, propagate caller disconnect; preserve omitted controls/defaults/routes/auth. Run gateway regression tests, production TypeScript build and full backend test suite. Build immutable image from committed sources. Back up old backend image/container settings; replace only backend using existing Compose config and no-deps; verify health and unchanged IDs/start times of other containers, retain rollback image. Never run broad deploy workflow or image prune.

Acceptance: real DeepSeek and qwen3.5:9b JSON responses plus injected-primary-failure to real Qwen on exact helpdesk candidate before helpdesk transfer. No SMTP or customer commands in model checks.

Status: implemented; checks and release pending. Runtime JS hotpatch is superseded.
