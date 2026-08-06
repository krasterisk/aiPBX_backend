# Unified Analyze Endpoint — Design

**Date:** 2026-08-06  
**Status:** Approved for implementation after user review  
**Module:** `src/operator-analytics`

## Goal

Add a single External API endpoint that accepts audio for operator analysis either by **URL** (server downloads) or by **Base64 in the JSON body**. Exactly one source type per request. Existing `upload`, `analyze-file`, and `analyze-url` remain unchanged.

## Endpoint

| | |
|---|---|
| Method / path | `POST /operator-analytics/analyze` |
| Auth | `ApiTokenGuard` |
| Content-Type | `application/json` |
| Placement | Existing `OperatorAnalyticsController` + `OperatorAnalyticsService` (approach A) |

## Request body

### Source (exactly one)

**URL mode**

```json
{ "url": "https://cdn.example.com/call.mp3" }
```

```json
{ "urls": ["https://a.example/1.mp3", "https://a.example/2.mp3"] }
```

**Base64 mode**

```json
{
  "file": "<raw base64 or data:audio/mpeg;base64,...>",
  "filename": "call.mp3"
}
```

```json
{
  "files": [
    { "data": "<base64>", "filename": "a.mp3" },
    { "data": "data:audio/wav;base64,...", "filename": "b.wav" }
  ]
}
```

### Shared options (all optional)

Same semantics as `analyze-file` / `analyze-url`:

- `operatorName`, `clientPhone`, `language`
- `customMetrics` (array of metric defs, JSON)
- `provider`, `projectId` (body overrides token default project)
- `consentObtained`, `consentSource`
- `sync` — boolean or `"true"` string; only meaningful for a **single** item

### Validation rules

1. **One source type:** URL fields (`url` / `urls`) XOR Base64 fields (`file` / `files`). Mix → `400`.
2. **At least one source:** empty / missing → `400` (`url or urls or file or files is required`).
3. **Base64 decode:** strip `data:<mime>;base64,` prefix if present; `Buffer.from(..., 'base64')`. Invalid/empty → `400`.
4. **Size:** decoded buffer ≤ **50 MB** (same as multipart). Over → `413`.
5. **Filename:** required for each Base64 item (`file` + top-level `filename`, or each `files[].filename`). Missing/empty → `400`.
6. **Format:** validate by filename extension against the same audio set as multipart MIME allowlist maps to (`mp3`, `mpeg`, `wav`, `ogg`, `mp4`, `m4a`, `webm`, `flac`). Unsupported → `400`. Data-URI MIME, if present, must be an allowed audio type when provided.
7. **URL sanitize / download:** reuse existing `sanitizeUrl` + axios download (`arraybuffer`, 120s timeout, 50 MB, redirects) via `processUrlInBackground` / sync path equivalent to `analyzeUrl`.

## Processing / response

| Case | Behavior | Response shape |
|---|---|---|
| Single item, `sync: true` | Download (if URL) or decode Base64 → `analyzeFile(...)` | Full analysis record (same as sync `analyze-file`) |
| Single item, async (default) | `createProcessingRecord` + background | `{ id, filename, status: 'processing', url? }` |
| Multiple items | Always async (ignore `sync`) | `{ batchId?, items: [{ id, filename, status, url? }] }` — URL path may omit `batchId` and match current `analyze-url` multi response `{ items }`; Base64 multi uses existing `startBatch` → `{ batchId, total, items }` |

Prefer consistency:

- **URL single async:** same as today `analyze-url` → `{ id, filename, url, status: 'processing' }` (no batchId).
- **URL multi:** `{ items: [...] }` (each item fires `processUrlInBackground`).
- **Base64 single async / multi:** reuse `startAsyncFileUpload` pattern → `{ batchId, total, items }`.

`projectId` resolution: body `projectId` if set, else `apiToken.projectId`.

## Service changes

In `OperatorAnalyticsService` (or small private helpers used by controller):

- `decodeBase64Audio(input: string): Buffer` — data-URI aware.
- Optionally `assertAudioFilename(filename: string): void` for extension check.
- No new Nest provider/module; reuse `analyzeFile`, `createProcessingRecord`, `processUrlInBackground`, `startBatch` / `processInBackground`.

Controller owns:

- Source XOR validation
- Mapping body → options
- Sync vs async branching
- Calling decode + size checks before enqueue

## Out of scope

- Multipart on the new endpoint
- Deprecating `analyze-file` / `analyze-url`
- Changing STT / LLM / billing / dedup behavior
- Frontend JWT upload (`/upload`)

## Tests

1. XOR validation: mix URL + file → 400; empty → 400.
2. Raw Base64 and data-URI decode to expected buffer.
3. Oversized decoded payload → 413.
4. Unsupported extension → 400.
5. Single Base64 + `sync: true` calls `analyzeFile`.
6. Single URL async creates processing record and schedules download (mock axios / spy).

## Implementation notes

- Add DTO `AnalyzeRequestDto` under `src/operator-analytics/dto/` with class-validator + Swagger decorators (custom class-level validator or controller-level check for XOR is fine).
- Keep `MAX_FILE_SIZE` / allowlist constants shared or duplicated once next to controller helpers to avoid drift.
- Do not commit secrets; no new env vars.
