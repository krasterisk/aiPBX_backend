# Operator Analytics — offline evaluation (golden set)

Measures how close the analysis LLM is to expert human judgement, so prompt/model
changes can be validated before shipping. Pure stat functions live in
[`eval-metrics.ts`](./eval-metrics.ts) (unit-tested); the runner orchestrates them.

## Golden set

Expert-labeled calls live in [`golden-set/`](./golden-set) as JSON fixtures. Each
file is either a single case object or an array of cases:

```json
{
  "id": "call-042",
  "description": "optional note",
  "language": "ru",
  "transcript": "Оператор: ...\nКлиент: ...",
  "reference": {
    "greeting_quality": 100,
    "script_compliance": 75,
    "politeness_empathy": 100,
    "active_listening": 75,
    "objection_handling": 75,
    "product_knowledge": 75,
    "problem_resolution": 100,
    "speech_clarity_pace": 75,
    "closing_quality": 100,
    "csat": 5,
    "customer_sentiment": "Positive",
    "success": true
  }
}
```

- Numeric scores use the same scale as production: 0/25/50/75/100 for quality
  metrics, csat 1..5.
- `customer_sentiment` ∈ `Positive | Neutral | Negative`.
- Only fields present in **both** reference and prediction are scored, so partial
  labels are fine.
- Target size: 50–200 cases for stable estimates. Ship the sample, add real ones.

## Metrics

- **MAE** (Mean Absolute Error) for numeric scores and csat — lower is better.
- **Accuracy** (proportion of agreement) for `success` and `customer_sentiment`.
- **Cohen's kappa** for categorical agreement corrected for chance (`null` when
  undefined, e.g. a single category).

## Running

```bash
# requires the same env as the app (DB + LLM provider reachable)
npm run eval:operator
npm run eval:operator -- --out=eval-report.json
```

The runner calls `OperatorAnalyticsService.dryRunAnalyze()` which invokes the real
LLM but creates **no** BillingRecord and deducts **no** balance (dry-run from the
platform's accounting perspective). Exit code is non-zero if any case errored.

## When to run

On every prompt edit (bump `PROMPT_VERSION` in `analysis-schema.ts`), model
change, or rubric change. Wire into CI as a gate once enough golden cases exist.
