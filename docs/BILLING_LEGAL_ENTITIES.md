# Billing, legal entities, and tenant currency

## Ledger vs display currency

- **User balance** in DB and `billing_records.totalCost` remain in **USD** (internal ledger).
- `GET /api/users/balance` returns `balanceUsd` (ledger) and `balance` converted to `TENANT_CURRENCY` using current rates (`rate` = USD→display).
- **Tenant display currency** is set per deployment via `TENANT_CURRENCY` (`USD` default, `RUB` on `aipbx.ru`).
- At charge time, each `billing_record` stores an FX **snapshot**: `currency`, `amountCurrency`, `fxRateUsdToCurrency`, `fxRateSource`, `fxCapturedAt`.
- `ai_cdr` mirrors `cost` (USD), `costCurrency`, and `amountCurrency` for reports.

Historical rows are **not** recalculated when rates or tenant settings change. Missing snapshots can be filled with `POST /api/billing/admin/backfill-fx` (admin only).

## User currency field

On create, `users.currency` is set from `TENANT_CURRENCY`. Non-admin PATCH requests cannot change `currency`; admins may override for support.

## Monthly closing (acts / SF)

`ClosingTask` runs on the 1st of each month for the previous period.

| Tenant | Usage amount for documents | FX on act |
|--------|---------------------------|-----------|
| `RUB`  | `SUM(amountCurrency)` after optional backfill | Weighted average: `SUM(amountCurrency) / SUM(totalCost)` |
| `USD`  | `SUM(totalCost)` × `rubPerUsd` on closing date | Rate from `currency_history` / `CurrencyService` |

Acts and invoices are issued in **RUB** for Russian B2B (SBIS); USD usage is stored on the document as `amountUsd` for reference.

## Operations checklist

1. Apply migrations: `2026-05-15-billing-records-fx-snapshot.sql`, `2026-05-15-ai-cdr-fx-snapshot.sql`.
2. Set `TENANT_CURRENCY=RUB` on `aipbx.ru` production.
3. Run `POST /api/billing/admin/backfill-fx` once after deploy. Optional query: `?userId=1` to backfill only that owner’s records (max 5000 per call).

See `.env.example` for related variables (`CURRENCY_UPDATE_URL`, `SBIS_*`).

## Where billing rows are written (FX snapshot)

| Path | Mechanism |
|------|-----------|
| Realtime / non-realtime calls | `BillingService.accumulate*Tokens` → costs + `applyFxDistribution` / `captureSnapshot` in `finalizeCallBilling` |
| Post-call analytics (CDR) | `BillingService.chargeAnalytics` → `captureSnapshot` |
| Operator file / URL analysis | `OperatorAnalyticsService` → `BillingFxService.fieldsForUsdAmount` |
| Insight generation | `OperatorAnalyticsService.chargeInsightCost` → `fieldsForUsdAmount` |
| Prompt generation | `AssistantsService.generatePrompt` → `fieldsForUsdAmount` |

Do **not** `billingRecordRepository.create()` without spreading `fieldsForUsdAmount(totalCostUsd)` (or going through `BillingService`).
