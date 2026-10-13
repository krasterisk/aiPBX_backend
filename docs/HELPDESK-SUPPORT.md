# Scoped analytics support context

Canonical assignment: aiPBX-helpdesk/docs/PLAN.md revision9. Coordinator /root, codex-direct, sole writer. Only helpdesk-email-context service/controller/DTO/tests are assigned. Foreign operator analytics changes excluded; source worktree baselineaf85175.

`POST /helpdesk/tools/analytics-support-context` with `{email,cabinetId,projectId}` and an active ADMIN-owned API key of scope HELPDESK_TOOLS. Cabinet/project must be explicit positive IDs. The exact normalized sender must resolve to one active account and the project must belong to that cabinet. Scope alone never permits cross-cabinet enumeration.

The read returns product capabilities and actual callTaxonomy/customMetricsSchema/schemaVersion. It excludes calls, recordings, transcripts and credentials. Daily unique reports require verification; primary/repeat patients require a patient registry. A repeated call does not establish patient status. No new analytics report or patient integration is implemented by this change.

14targeted tests and clean source typecheck passed. Source version2.9.2 prepared; commit/push pending this snapshot. Full backend production deployment and live customer data checks not performed. Configure the source only after that backend release is installed through its own deployment process. Existing email-project-context remains compatible.
