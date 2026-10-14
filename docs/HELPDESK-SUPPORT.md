# Scoped analytics support context

Canonical assignment: aiPBX-helpdesk/docs/PLAN.md revision9. Coordinator /root, codex-direct, sole writer. Only helpdesk-email-context service/controller/DTO/tests are assigned. Foreign operator analytics changes excluded; source worktree baselineaf85175.

`POST /helpdesk/tools/analytics-support-context` with `{email,cabinetId,projectId}` and an active ADMIN-owned API key of scope HELPDESK_TOOLS. Cabinet/project must be explicit positive IDs. The exact normalized sender must resolve to one active account and the project must belong to that cabinet. Scope alone never permits cross-cabinet enumeration.

The read returns product capabilities and actual callTaxonomy/customMetricsSchema/schemaVersion. It excludes calls, recordings, transcripts and credentials. Daily unique reports require verification; primary/repeat patients require a patient registry. A repeated call does not establish patient status. No new analytics report or patient integration is implemented by this change.

14targeted tests and clean source typecheck passed. Source version2.9.2 prepared; commit/push pending this snapshot. Full backend production deployment and live customer data checks not performed. Configure the source only after that backend release is installed through its own deployment process. Existing email-project-context remains compatible.


# Revision14: candidate discovery and confirmed metadata

All endpoints are POST /api/helpdesk/tools/* and require an active ADMIN-owned API key with HELPDESK_TOOLS scope. Existing email-project-context stays compatible.

- identity-candidates: optional contactEmail, company, company domain. Bounded cabinet/project labels only; no credentials, balances, calls or transcripts. Common public email domains alone are rejected. A candidate always has confirmed=false and requires owner confirmation in the helpdesk binding; a name/domain match is never authorization.
- bound-support-context: positive cabinetId/projectId selected by the trusted executor from a confirmed binding, never supplied by the model. The project is checked against the selected cabinet; nested or unavailable cabinets are rejected. Returns classification/report metadata and existing filter capabilities, no conversations. It does not require the sender to have an aiPBX login email.
- analytics-support-context: compatible email-based metadata endpoint with explicit matching cabinet/project.

Read operations cannot change analytics. Success rules belong to projects; operatorNameExact and success filter analyzed CDRs. New per-operator classification or patient dedup reports are separate product work.

Revision14 checks: full existing backend suite 81 suites/959 tests passed; modified helpdesk suite 19 tests passed; Nest production build passed. Deployment uses existing deploy.yml, target aipbxru_production or master commit [deploy:3]. Push alone is not evidence of release; inspect Actions quality/deploy jobs and verify real scoped API reads after deployment.
