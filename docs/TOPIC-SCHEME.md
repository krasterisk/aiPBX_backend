# Structured call topics

Projects opt in when an authenticated owner or administrator applies a checked draft. Existing projects with a null `topicSchemeState` keep their previous analysis behavior. Topic IDs stay stable across renaming and priority changes.

Each non-fallback topic has selection criteria, exclusions and examples. One compiled block supplies these definitions to the full native analysis request. The model returns `topic_eligibility` for every non-fallback ID with a strict boolean and explanation. The backend chooses the first matching non-fallback topic in configured order, or the fallback when none match. A model-supplied final label cannot override this choice. Context and metric rubrics do not define category selection in this mode.

Authenticated endpoints under `/api/operator-analytics/projects/:id/topic-scheme`:

- `GET`: active version, current draft and the last 20 applied versions.
- `POST /draft`: `{scheme, expectedDraftRevision}`; use null for the first draft and the current UUID thereafter. An optional `businessContext` supports cleaning legacy context atomically with the scheme; omission preserves the current context.
- `POST /check`: `{revision, cases: [{text, expectedTopicId?}]}`. Runs full native analysis with the proposed configuration, without changing call analyses or billing records. Provider API usage still occurs. Runs at most two cases concurrently; the project cannot start another check for the same running draft.
- `POST /apply`: `{revision}`. Requires a completed successful check run, at least one labelled passing example per topic and no incorrect labelled example in that draft. Changing the project context, metrics, taxonomy or active revision invalidates pending checks. Activation updates the derived legacy taxonomy and enables one-topic mode in one transaction.

Draft/history store input hashes, selected/expected IDs, model and timestamps. They do not store test transcripts or quoted model evidence. Topic examples are explicit configuration and remain saved. UI test sets are kept in memory only until the form closes. Check responses include explanations for immediate display.

Restoring a historical scheme means saving it as a new unchecked draft. History never grants reusable approval. Existing topic-edit APIs reject changes to an active managed taxonomy; all managed criteria changes must use checked drafts. Manual labels already on historical analyses are preserved.

## Deployment

Before replacing the backend, run `scripts/migrate-topic-scheme.cjs` with the currently running image's Sequelize and DB configuration. The production workflow does this after the existing call-type migration. It adds only nullable `operator_projects.topicSchemeState` (JSONB on PostgreSQL, JSON on MySQL), tolerates duplicate-column races and never fills/updates existing project or call rows. Standalone SQL equivalents are in `migrations/{postgres,mysql}/2026-10-24-topic-scheme.sql`.

Export the bounded analytics API contract with `npx ts-node -r tsconfig-paths/register scripts/export-analytics-openapi.ts`; this does not connect to a database. Sync `openapi.json` to the frontend and regenerate API types.

Back up the project row and runtime image before activating a customer scheme. Qualify frozen expected labels using the actual configured provider and full native response validator. Synthetic tests are not evidence of real-transcript accuracy. A failed or pending real-data gate must not be represented as production acceptance.


## Scoped helpdesk adapter (2026-10-28)

`POST /api/helpdesk/tools/bound-topic-scheme` uses the existing HELPDESK_TOOLS API-key scope and bound-context ADMIN/key-owner plus cabinet/project checks. Input is exactly `{cabinetId, projectId, stage, input}`; stages are read/draft/check/apply. The adapter always delegates with the confirmed cabinet owner and `admin=false`; model-provided account or connection fields are not accepted. Read returns full active criteria, current draft metadata, taxonomy hash and `topicSchemeBaseline`, excluding old scheme history and test text.

Draft input is `{scheme, expectedDraftRevision, expectedBaselineHash, helpdeskRequestId}`. The baseline is compared inside the project lock, and the helpdesk path preserves topic IDs, names, priority order, count and fallback. Business context edits are excluded. The request marker permits only the same helpdesk preparation to resume an inactive draft after a transport failure; it is not approval. The browser draft workflow keeps its original optional-context behavior.

Check input is `{revision, cases:[{text, expectedTopicId}]}` with3–20 labelled cases. It reuses native full analysis, stores only hashes/outcomes, and does not activate rules or reanalyse historical records. Apply accepts only `{revision}` and reuses all existing checked-draft/baseline/topic-coverage guards. The helpdesk must freeze exact fields/checks/revision in its own separately approved Telegram action before calling apply. Transport uncertainty requires a fresh active/draft read, never an automatic repeated apply.

Qualification:18Jest tests151.556s, full TypeScript build and10Linux module/DI/workflow smoke checks with network=none and fixture-only state passed. Exact12compiled-artifact overlay built on the then-current production image; a concurrent unrelated release was preserved after byte-checking the3assigned modules. Installed imagecec49db3… on basef657f8ae…;1291other runtime artifacts, environment key/value pairs, commands, mounts and inspected project state preserved; health and real scoped read passed. ENV ordering alone is not a value change. Earlier guarded/superseded attempts are not final release evidence. No active customer scheme, historical analysis or customer mail changed during API release. Private backup/qualification receipts remain outside Git.
