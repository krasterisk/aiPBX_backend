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

## Monthly closing (UPD status 2, USN)

`ClosingTask` cron (`0 3 1 * *`) delegates to `ClosingService` for the **previous calendar month**. Only when `TENANT_CURRENCY=RUB` and invoice billing is enabled (same gate as payment invoices).

One **`upd`** per organization and period (idempotent). Nomenclature: `SBIS_CLOSING_UPD_SUBJECT` or `CLOSING_UPD_SUBJECT_DEFAULT`. SBIS **Примечание**: personal account + service period (`buildClosingDocumentNote`).

| Tenant | Usage amount for documents | FX on UPD |
|--------|---------------------------|-----------|
| `RUB`  | `SUM(amountCurrency)` after optional backfill | Weighted average: `SUM(amountCurrency) / SUM(totalCost)` |
| `USD`  | `SUM(totalCost)` × `rubPerUsd` on closing date | Rate from `currency_history` / `CurrencyService` |

**Two-phase SBIS flow**

1. **Phase 1:** `SbisService.createUpdDraft` → `СБИС.ЗаписатьДокумент` (shell **without** `Номер` — SBIS assigns document number) + **ON_NSCHFDOPPR 5.03** with that number via `ЗаписатьВложение`. Local row in `organization_documents` (`type=upd`, `number` from SBIS `Номер`, `sbisId` for PDF). **PDF in ЛК:** proxy from SBIS (`fetchDocumentPdfBytes` / `GET …/documents/:id/pdf`), not a local `upd-pdf.ts` file. Shell: `SBIS_CLOSING_DOC_TYPE` (default `ДокОтгрИсх`), `ФункцияКЧ: false` unless `SBIS_CLOSING_UPD_STATUS=off`.
2. **Phase 2 (optional):** If `CLOSING_AUTO_SEND_EDO` is not `false` (cron default **true**) and the org is `edoReady` (invitation state 7) with issuer `sbisCertThumbprint` → `sendDocumentToEdo`.

Historical `act` / `sf` rows in DB are unchanged; new closings do not create them.

**Admin debug:** `POST /api/billing/admin/run-closing-documents` — `organizationId` (required), optional `periodFrom` / `periodTo`, `dryRun`, `sendViaEdo` (default `false` for manual runs). `dryRun` + `confirmAll=true` previews all orgs without INSERT/SBIS.

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
