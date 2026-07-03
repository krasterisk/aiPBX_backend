# aiPBX Backend — Planning Workspace

Canonical GSD planning lives in the **frontend sibling repo**:

```
../aiPBX/.planning/
├── PROJECT.md      — full-stack context
├── ROADMAP.md      — phase roadmap
├── GAPS.md         — prioritized backlog
├── STATE.md        — current execution state
├── DOD.md          — definition of done
├── REQUIREMENTS.md — phase requirements
└── intel/          — FEATURES, ARCHITECTURE, API-MAP, RISKS, DOCS-INDEX
```

**Absolute path:** `c:/Users/Professional/WebstormProjects/aiPBX/.planning/`

Agents working in `aiPBX_backend` must read planning from the frontend repo before executing phases.

Backend-specific ops docs:
- `docs/` — SBIS, billing, operator analytics env, migration runbooks
- `.docs/` — event routing, MCP, API keys, integration plans
