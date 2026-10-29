# Versioned quality score

## Q2 production preview release

The current release exposes the new scheme only at `/calls-preview`. `/calls` and the existing dashboard keep legacy scoring. Keep `QUALITY_SCORE_V2_ENABLED` unset/false; **do not run the canonical Q1 backfill below for this release**.

Apply `2026-10-25-quality-score-v2.sql`, then `2026-10-25-quality-preview.sql` before the backend image. The preview uses separate `quality_preview_*` analytics, values, overrides, runs, scorecards and project rules. Old answers, corrections, prompts and project scoring settings are never updated by preview operations. Shadow persistence after legacy analyses is best effort; failure cannot fail the original analysis. Disable it with `QUALITY_PREVIEW_ENABLED=false` if necessary.

Populate preview history without AI using the compiled standalone runner:

```sh
node dist/operator-analytics/quality/quality-preview-backfill.js --user 99 --project 5 --limit 250
```

Dry-run is the default; `--apply` writes only preview tables, `--after-id` continues a bounded batch. Repeat is idempotent. Saved-answer derivations have incomplete historical context; no inferred N/A is claimed. Rule changes apply to subsequent evaluations, never silently replace frozen history.

API namespace `/quality-preview`: project rules, call detail/history and supervisor corrections. `/reports/quality-preview` lists/sorts/filters the independent projection. Admin-only `POST /quality-preview/calls/:channelId/analyze` explicitly runs the strict applicability contract over the saved operator transcript, with no STT, legacy write, tag mutation, webhook, platform balance deduction or canonical billing record. Provider tokens are used only on that explicit action. This matches the existing analytical preview/eval accounting model; it is not an automatic production reanalysis. The previous preview remains available if the provider fails. AI results and corrections stay in immutable preview history.

Rollback: restore the held previous frontend/backend images, retain additive columns and preview tables. No legacy data conversion needs reversal. Independent human calibration and production aggregate/performance qualification remain prerequisites for replacing the main dashboard and globally enabling Q1.

## Canonical engine (prepared, global activation deferred)

`quality-score.ts` is the only scoring calculator. Model answers are observations, not an overall score. Built-in metrics and custom criteria with a score scale contribute by default. Boolean false contributes zero, true contributes 100; a custom null without an explicit evidence status is excluded from both the score and coverage denominator. Missing keys and explicit missing/insufficient-evidence statuses remain distinct. Unmapped text or numbers without a defined scale cannot contribute. CSAT prediction, sentiment and business outcome are independent indicators.

Formula quality-v2.2 corrects custom-criterion inclusion. Preview detail reads refresh an older current projection under a CDR lock and append an immutable revision, preserving the stored scales, raw answers, supervisor corrections and previous history. No AI request is made. The existing preview backfill runner also visits existing projections via `ensure`; run bounded batches after release to update journal list/sort projections before general use. Detail cards at `/calls` and `/dashboard/call-records` share the same endpoint. No production refresh or backfill is performed by editing this source.

The promoted dashboard reads `/quality-preview/dashboard`, drilldowns read `/quality-preview/cdrs` and `/quality-preview/operator-evidence`. These use `quality_preview_analytics`, `quality_preview_values` and `quality_preview_runs`, just like `/calls` detail; legacy readers remain separate. A successful analysis awaits its quality projection. Current detail reads invalidate journal, dashboard and evidence caches. List/aggregate readers do not rewrite history or run an implicit bulk backfill: previous-formula scores are omitted from current scores and ordering until their projections are refreshed. This can leave fewer scored calls than total calls if an operator has declined historical backfill; the browser must render a missing aggregate as a dash rather than zero or an old score.

For included, assessed criteria, score = 100 × weighted mean of normalized answers. N/A is excluded from the applicable weight. Missing/invalid/insufficient answers reduce evidence coverage; they are never silently zero. Default minimum coverage is 80%. All-N/A, unusable recognition or no assessed criteria yields a null score. A critical flag is separate; explicit `fail` policy sets the score to zero only for an observed zero-valued violation. Unknown critical evidence requires review. Rounding belongs to presentation.

Each analysis captures its rubric/context before the model request. `quality_scorecard_revisions` and `quality_analysis_runs` are immutable application records. One transaction writes the run, current `aiAnalytics` projection and existing `operator_metric_values`. A scoped CDR lock serializes regeneration/corrections; analysis operation keys make retries idempotent. Supervisor applicability/value corrections create revisions and preserve raw AI. Corrections to a previous evaluation do not silently carry into a new model answer.

Reads use the published projection. Dashboard and evidence aggregate in PostgreSQL; they do not implement the formula or transfer all calls into Node. Journal order uses the persisted score. Journal list omits full transcripts/assessment JSON; detail and cursor history are lazy. Evidence values retain their raw answer and expose normalized values under the stored rubric. A null score is not zero.

Historical backfill never calls AI. It preserves original metrics JSON and labels the derived score `contextIncomplete=true`, because old rubric/applicability context cannot be reconstructed completely. Regeneration preserves a legacy baseline if backfill has not run. Historical detail never substitutes today's transcript for an unavailable historical transcript.

## Activation boundary

Implementation is disabled by default (`QUALITY_SCORE_V2_ENABLED` must equal `true`). Apply the additive migration **before deploying code containing the new model columns**, even while this flag is false. No migration/backfill/enablement is performed automatically at startup.

Qualified database: PostgreSQL 14. The additive MySQL migration is prepared for compatibility but has not been executed against MySQL; v2 aggregate/evidence activation is explicitly PostgreSQL-only. Do not enable it on a MySQL tenant without implementing and qualifying those read paths.

Backfill runs as a standalone CLI with the existing `DB_*` environment, without starting Nest, providers or schedulers:

```sh
npx ts-node -r tsconfig-paths/register scripts/quality-backfill.ts --user 99 --project 5 --limit 100
```

This is a dry-run. `--apply` explicitly publishes derived revisions; `--after-id` continues a bounded batch. Maximum batch size is 1000. The CLI emits counts/cursor only, never transcripts, credentials or raw answers. It must not be imported into a running application with already-bound sequelize-typescript model classes.

Before release: backup, apply migration, deploy flag-off backend, qualify dry-run distributions, apply bounded backfill with verified owner/project scope, then enable the v2 writer/read paths and release the corresponding frontend. This is an operational release gate, not authorization to perform it.

Rollback must coordinate readers and writers. A flag-off Q1 backend preserves versioned write history; an older binary does not know these invariants. Do not resume analysis/correction writes on an older binary against versioned records without a qualified compatibility procedure. Additive tables/raw revisions should be retained, not dropped.

## Verification limits

Arithmetic/schema/transactions, idempotency, tenant isolation, cursor ties, corrections, CLI dry-run/apply and SQL aggregation have local automated coverage. Provider contract checks use synthetic dialogs. These do not establish broad scoring accuracy: rubric agreement and score calibration still require an independently labeled pilot. Production p50/p95 and large-period EXPLAIN qualification remain release gates.
