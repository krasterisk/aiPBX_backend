# Unified Analyze Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /operator-analytics/analyze` accepting either URL(s) or Base64 file(s) (XOR), reusing existing analysis pipeline.

**Architecture:** Pure helpers in `lib/base64-audio.ts` for decode/validation; DTO for Swagger/class-validator; new handler in `OperatorAnalyticsController` that branches to existing `analyzeFile` / `analyzeUrl` / `processUrlInBackground` / `startBatch`.

**Tech Stack:** NestJS, class-validator, Jest, axios (existing URL download).

## Global Constraints

- Auth: `ApiTokenGuard` only
- Max decoded size: 50 MB
- One source type per request (URL XOR Base64)
- Do not modify/remove `upload`, `analyze-file`, `analyze-url`
- `filename` required for every Base64 item
- sync only for single item

---

### Task 1: Base64 / filename helpers + unit tests

**Files:**
- Create: `src/operator-analytics/lib/base64-audio.ts`
- Create: `src/operator-analytics/lib/base64-audio.spec.ts`

**Produces:**
- `decodeBase64Audio(input: string): { buffer: Buffer; mime?: string }`
- `assertAudioFilename(filename: string): void` (throws HttpException)
- `assertDecodedSize(buffer: Buffer, maxBytes?: number): void`
- `ALLOWED_AUDIO_EXTENSIONS` / mime allowlist constants

- [x] **Step 1:** Write failing tests (raw base64, data-URI, invalid, oversized, bad extension)
- [x] **Step 2:** Implement helpers
- [x] **Step 3:** Run `npx jest src/operator-analytics/lib/base64-audio.spec.ts` — PASS
- [ ] **Step 4:** Commit (awaiting user request)

### Task 2: AnalyzeRequestDto

**Files:**
- Create: `src/operator-analytics/dto/analyze.dto.ts`

**Produces:** `AnalyzeRequestDto`, nested `AnalyzeBase64FileDto`

- [x] **Step 1:** Add DTO with optional `url`, `urls`, `file`, `filename`, `files`, shared options, `sync`
- [ ] **Step 2:** Commit (awaiting user request)

### Task 3: Controller endpoint

**Files:**
- Modify: `src/operator-analytics/operator-analytics.controller.ts`

**Produces:** `POST analyze` handler

- [x] **Step 1:** Implement XOR validation + URL/Base64 branches (sync/async) matching design response shapes
- [ ] **Step 2:** Commit (awaiting user request)

### Task 4: Service smoke tests for decode path via sync Base64

**Files:**
- Modify: `src/operator-analytics/operator-analytics.service.spec.ts` (optional thin coverage) OR keep coverage in lib + manual controller logic review

- [x] **Step 1:** Ensure lib tests cover design cases; add service test only if sync Base64 path needs integration stub
- [x] **Step 2:** Run targeted jest; fix failures
- [ ] **Step 3:** Final commit if needed

---

**Spec:** `docs/superpowers/specs/2026-08-06-unified-analyze-endpoint-design.md`
