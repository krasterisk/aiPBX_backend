# n8n email helpdesk

Server: https://ipbx.krasterisk.ru/helpdesk/.
Runtime files: `/opt/aipbx-helpdesk`. Existing PBX/MySQL/nginx/VPN services are preserved.

Docker Compose runs n8n 2.42.5, PostgreSQL 17 (image digest pinned in compose.yaml), and a private Python integration adapter. n8n schedules two workflows; the adapter owns durable inbox cursors, drafts/revisions, approval checks, SMTP state and client agreements in a separate `helpdesk` database. No database port is published; n8n binds 127.0.0.1:5678 behind the existing TLS nginx server.

## Credentials and entry

Owner login/password: server `/opt/aipbx-helpdesk/access.env`; authorized local copy `C:/Users/Professional/.config/aipbx-helpdesk-access.env`. Never commit secret files.
Integration credentials: `integrations.env` (Yandex email/application password, DeepSeek, Telegram bot/approver/chat, aiPBX URL/key). Infrastructure encryption key/database password/internal HTTP token: `.env`. Both must be included in backups; encrypted n8n credentials cannot be restored without the encryption key.

## aiPBX API contract

`POST /api/helpdesk/tools/email-project-context`, `Authorization: Bearer <raw API key>`, scope `helpdesk:tools`. The key owner must be an active, non-banned ADMIN. Body: `{ "email": "sender@example.com", "projectId": 123 }`; projectId is optional when the email resolves to exactly one cabinet and one project.

The method matches exact normalized account email; a sub-user maps to its cabinet owner. It returns `found`, `ambiguous`, and on success `clientId`, `projectId`, allowed project configuration, topic taxonomy, up to three bounded transcripts and five recent analysis samples. Project, transcript and call queries are constrained to the cabinet owner. Webhook headers, API keys and account credentials are excluded. Unknown/multiple accounts or multiple projects never select a guessed match.

Bridge requires the returned client/project IDs to match explicit verified selections. On ambiguity, the designated Telegram approver can choose `/project TICKET_ID PROJECT_ID`; the backend revalidates ownership. Optional pre-verified selections can be placed in `client-projects.json`: `{ "sender@example.com": { "clientId": "20", "projectId": 7, "verified": true } }`. Do not guess these identifiers.

## Approval and send behavior

`/edit TICKET_ID REVISION new text` creates a new immutable draft revision. Telegram approval buttons contain ticket ID and exact text hash. Only the configured user ID in the configured chat can approve. Old/repeated approvals do not send; changing the draft invalidates approval. The recipient is the original sender, never a model-supplied address or Reply-To. SMTP replies preserve In-Reply-To/References and persist their generated Message-ID.

The database records `sending` before SMTP. A failure or crash around SMTP acceptance requires manual reconciliation using Message-ID; no automatic send retry. This favors avoiding duplicates over automatic delivery recovery. `/rule TICKET_ID text` stores a human-approved agreement with its source ticket/message and project. Email/model text alone never becomes an approved client rule.

First mailbox initialization starts at the latest UID; historical mail is skipped. IMAP is read-only with BODY.PEEK. UIDVALIDITY change stops ingestion for manual reconciliation. HTML-only and oversized messages need manual handling; attachments are not processed in this initial version. IMAP/SMTP authentication tests do not send mail. Never reuse a Telegram bot with an existing webhook/poller; webhook conflicts are checked.

## Operations and verification

`docker compose ps`, `docker compose logs --tail 50 bridge`, and internal `GET http://bridge:8080/health` report health. Internal POST tick endpoints require the encrypted n8n header credential; they are not exposed by nginx. Set `PROCESSING_ENABLED=true` only after the deployed API contract and designated bot/chat are verified; then activate/publish the two imported workflows.

`python3 run-tests.py` runs safety and PostgreSQL state tests in `helpdesk_test` with SMTP mocked. `python3 check-integrations.py` checks Yandex, a minimal DeepSeek completion, and Telegram access without sending mail. `python3 verify-api.py` probes API access using an unknown test email and checks that Telegram has no webhook.

Daily backup timer: `aipbx-helpdesk-backup.timer`, 03:20 Asia/Krasnoyarsk with up to five minutes jitter. `python3 backup.py` saves both database dumps, n8n persistent files, and configuration under root-only `backups/`; 14-day retention. `verify-deployment.py` validates checksums and restores both databases into dedicated test databases (initial run). Off-server backups are not configured.

Restore into a fresh isolated stack: restore configuration/encryption key first, restore each database dump using pg_restore, unpack n8n-files into the named n8n volume with node ownership, and validate owner login and health before enabling processing. Original PostgreSQL 16 volume and migration dumps are retained as recovery evidence from the initial installation; current runtime uses PostgreSQL 17.

No live customer email send has been used as a test. End-to-end acceptance requires a new test email and the configured human's approval of its concrete reply.

Telegram egress uses TELEGRAM_PROXY from the existing backend configuration. SOCKS5 URLs use proxy-side DNS (socks5h). The adapter limits direct Telegram connection attempts and prefers the working IPv6 route when no proxy is configured. Proxy credentials stay in integrations.env, outside Git. A dedicated helpdesk bot is required because the original bot has an active webhook; it is preserved. Run check-proxy.py inside the bridge container with PYTHONPATH=/app.

## Product routing (2026-10-08)
The runtime guide is knowledge/products.md: a short reviewed overview, not the repository or a full documentation dump. routing.py asks DeepSeek for a JSON read plan from a closed tool list: cabinet and analytics_project. This is adapter-mediated reading, not native function calling or MCP. The model cannot choose tenants, URLs, credentials or recipients. The adapter validates the plan and calls the scoped API with email from the original envelope.

API scope=cabinet returns the owner's balance in tenant currency and up to 50 assistant configurations, with an explicit unverified live-status flag. No analytics project is required. scope=analytics retains project selection and tenant checks. General product questions do not require a project. Mixed questions can receive cabinet facts plus a clarification for unavailable project information. Account history/rules use the internal cabinet sentinel separately from analytics project IDs.

Both model stages receive the short guide; the drafting stage separately receives JSON email/context/history/approved rules. DeepSeek JSON mode follows https://api-docs.deepseek.com/guides/json_mode/. No documentation search or MCP discovery is implemented. The guide is version-controlled and should be updated from verified product changes.

Execution metadata is retained for success/error with 168-hour pruning. Workflows contain only tick status/counts, not email text. This fixes uncompleted metadata observed with save=none; historical running rows are retained as diagnostic evidence.

## Telegram callback handling
Approval polling runs every 5 seconds; inbox polling remains every minute. Callback acknowledgement happens before durable decisions/SMTP. Expired or failed acknowledgements are logged without tokens and do not stop the decision/result message or poison the update cursor. Sent/rejected tickets return explicit status on repeated clicks; no duplicate send. Unit regression tests cover expired callbacks for both actions and acknowledgement order, in addition to isolated-database idempotent SMTP tests.
