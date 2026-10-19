# Stable operator identity and call extension

Coordinator: Codex helpdesk task EM-20261019-333, codex-direct. This release targets aipbx.ru only (`deploy:3`). The source checkout is isolated; unrelated staged files in the original repository are not part of the release.

## API compatibility

`operatorName` remains the human display name. Two optional string properties are accepted by JSON, URL and multipart analysis endpoints:

```json
{
  "operatorName": "Anna Smith",
  "operatorId": "krasterisk-v3:instance-uuid:tenant-id:employee-id",
  "operatorExtension": "0301"
}
```

`operatorId` is a stable employee account identifier, at most 128 characters. Namespace it by source instance and source tenant; do not put a phone extension into it. aiPBX additionally scopes it by the owning account. Account deletion and recreation creates a different employee. For krasterisk_v3, `agent_status.user_uid` references `users.uniqueid`, the auto-increment employee account primary key. `users.user_uid` is a different field for account ownership. The observed source journal retains one employee ID across multiple agentId workplaces.

`operatorExtension` stores the internal number for this particular call, at most 64 characters. It is a string, retaining leading zeroes. Moving an employee to another number does not change operator identity. Calls retain their historical names and extensions; grouped cards use the latest recorded display name.

Existing callers can continue sending just `operatorName`; these calls keep legacy exact-name grouping. Missing identity is not inferred globally from a name. Same-name employees with different IDs remain separate. Dashboard, evidence, insights and CDR endpoints accept optional `operatorId`, taking precedence over name filters while retaining account/project access control. No API token scope or authentication change is required.

The frontend keeps names as names and displays extension as separate call metadata. Drill-downs from identified scorecards/topic rows pass the ID rather than the display name. Existing name-only links continue working.

## Migration and release order

1. Back up schema, affected metadata, configuration checksums and old runtime images. Keep stopped image-holder containers if a deployment workflow prunes unused images.
2. Apply `migrations/postgres/2026-10-19-operator-identity.sql` (or the matching MySQL script) before deploying the new backend. Both scripts are additive and repeatable. New columns are nullable; legacy callers and the old application remain valid.
3. Deploy compatible backend through GitHub Actions, target `aipbxru_production` / `[deploy:3]`. Deploy the frontend after its quality checks pass. Other targets and GPU services are excluded.
4. Change the source exporter to send plain display name, stable ID and call extension separately. Keep a persistent source namespace across code updates and host/IP changes.
5. Backfill only a reviewed account/project cohort with an exact mapping and private preimage. Do not parse arbitrary parenthesized names, guess missing employees or rerun speech/LLM analysis. Existing display-name attribution is not proof of historical workplace assignment; preserve that limitation explicitly. Refuse conflicting nonempty IDs. Preserve IDs, timestamps, metrics, costs, tags and billing.
6. Verify installed health, API metadata, identity filters, account isolation and dashboard totals. Keep exact SHA/run/backup receipts privately; do not commit keys, recordings, transcripts or production dumps.

Rollback the application using the preserved images first. Additive nullable columns may remain safely. A guarded metadata rollback can restore only backed-up rows whose current identity matches the expected migration result; it must not delete newer calls or overwrite subsequent staff changes.

## Restricted production SSH

aipbx.ru permits SSH only from trusted addresses. For its deployment job, Actions publishes an ephemeral `production-ssh-access-<run>-<attempt>` artifact containing only the runner IPv4 and release identifiers. The helper verifies that the configured destination resolves to aipbx.ru and then waits up to 15 minutes for SSH. It does not open a firewall or receive firewall credentials. Other deployment targets do not run this helper.

An authorized operator verifies the exact repository, master SHA, run/attempt, fresh artifact timestamp and public IPv4. Before permitting only this IPv4/32 to TCP/22, schedule automatic deletion after 20 minutes and verify that timer is active. Delete the rule immediately after deployment and stop its timer. Preserve existing rules and never expose SSH to all addresses. A new runner needs a new explicitly scoped exception; no permanent runner range is added. This temporary access was explicitly authorized for EM-20261019-333.

## Baseline preservation and validation

Public master 52ef132 had reverted operator-service fixes from the already released 436ff00, causing compilation and five existing tests to fail. This release preserves the exact released service baseline before adding identity. The original staged service blob was verified to equal that published commit and remains untouched. Published Qwen completion-control commit a837441 is included to preserve the existing production compatibility behavior; its old default-token test is aligned with master's existing 4096-token default.

Validation covers old/new payloads through the real DTO/controller, persisted processing-record metadata, one employee/two workplaces, two employees with one display name, source/account separation, ID-first filters, topic counts, leading zeroes and invalid input. Both PostgreSQL and MySQL migrations are run twice against isolated synthetic databases with no model keys or production data. The affected OpenAPI schema is generated from actual decorators by the isolated schema-only exporter; it starts no DB, telephony or workers. Full backend/frontend tests and builds, generated-type consistency, and final GitHub Actions checks are required. Own review is not an independent audit.
