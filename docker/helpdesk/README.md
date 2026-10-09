# Helpdesk console, Telegram Mini App and email processing

Browser/Mini App: https://ipbx.krasterisk.ru/helpdesk-clients/
n8n scheduler: https://ipbx.krasterisk.ru/helpdesk/
Server runtime: /opt/aipbx-helpdesk. Dedicated bot: @aiPBXhelpdeskbot, menu «Кабинет».

## Access and roles
Initial owner login/password are the existing n8n owner credentials, already saved locally in C:/Users/Professional/.config/aipbx-helpdesk-access.env. No registration endpoint. The console stores scrypt password hashes; JWT HS256 sessions have fixed issuer/audience, eight-hour expiry, HttpOnly/Secure/SameSite cookies. Validated Mini App logins also receive a JWT held only in JavaScript memory (never localStorage), with partitioned cross-site cookies as an optional aid; this supports Telegram Web when third-party cookies are blocked. Logout, password reset and account disabling revoke sessions using the account version. POST requests require the console Origin. Login failures are rate-limited. Telegram initData, when present, is validated with the bot signature/time and must match the account's Telegram ID; it does not bypass the password.

The owner creates operator accounts in «Исполнители» and assigns clients or individual tickets. Operators see assigned clients/tickets and can run allowed reads, edit drafts, add comments and change case status. Only the owner configures clients/sources/credentials/accounts, changes assignments and approves an email send. Telegram approval remains restricted to the designated approver/chat. Employee Telegram IDs are optional for browser login, required to validate their Mini App identity.

Credentials are write-only in the console: blank fields preserve existing values; the clear checkbox removes previous credentials. AES-GCM encrypted secret files and separate vault/JWT signing keys live under private/, owned by service UID 10001, mode 0600 inside a 0700 directory. The vault key must be restored together with its encrypted files. No secret values are returned by the API, included in model tool descriptions, logged, or added to Git/Docker build context. The connection adapter loads them internally. Root-only backups contain these files and must be protected accordingly.

## Workflow
1. Create a client in «Клиенты»; email can be entered here or attached from a ticket. Enter notes and optionally assign a staff member.
2. Add/edit shared servers or knowledge sources in «Источники». Enter address/operations and secrets in their separate fields. Enable the source when configured.
3. In «Привязки и проверки», choose client/source, enter the client's tenant selectors and search instructions, tick allowed operations, and save. The owner can test disabled configurations before activating them. Test an operation here to inspect scoped results.
4. In Telegram: /client TICKET_NUMBER CLIENT_ID. This attaches the incoming email address. Received/held tickets resume preparation; historical sent/rejected tickets are linked without resending. Conflicting email ownership is rejected. You can also reply to the bot notification with just the client ID. The same action is available in the ticket card.
5. Review the proposed exact draft in Telegram or in the ticket card, edit if needed, then approve/reject. SMTP sending requires human approval of the exact saved revision/hash.

New/unregistered senders become numbered tickets with setup-required status. There is no implicit aiPBX lookup/import. Client identity is always the operator-owned registry. Once a registered contact has enabled bindings/sources, already held tickets resume on the next inbox tick. Source bindings, scoped history and allowed operations persist for future emails. The preconfigured aiPBX source reuses the existing authorized API token; no clients are automatically created.

## Source adapters
All connectors are bounded reads. Operators configure SQL/commands/paths; the model chooses only operations bound to the current client, plus an optional search query. It cannot select a URL, client, SQL, shell command, secret or recipient. Tool selection uses a validated DeepSeek JSON read plan, up to two rounds and three operations per round. Descriptions/instructions and scrubbed results are sent separately; the repository/full documentation are not dumped into the prompt. Results have source/operation IDs, timestamp and config/binding revisions.

- aiPBX API: HTTPS base URL, bearer token; cabinet/analytics operations. Binding params: account_email (explicit account selector), cabinet_id (optional ownership check), project_id (for specific analytics). Sender email is not implicitly passed to aiPBX. Project scope only belongs to analytics.
- HTTP / remote RAG: HTTPS, GET/POST read operations with relative path and configured params; headers/bearer in secret fields. Query text can be mapped using query_param. Redirects disabled.
- PostgreSQL: host/port/database/sslmode, secret user/password, SELECT with %(account_id)s parameters. Read-only transaction, 10-second statement timeout, 50 rows. Use a least-privileged read-only DB account.
- MySQL/MariaDB: equivalent SELECT adapter, read-only transaction, timeouts, TLS default on. Use a read-only DB account. No other DB engines currently implemented.
- SSH: host/port, verified SHA256 host fingerprint; private key/user/passphrase in secret fields. Preconfigured argv for cat/head/tail/ls/grep/journalctl/systemctl status/show/is-active/docker logs/inspect/ps. Every argument is separately shell-quoted; the model cannot generate commands. No arbitrary shell, script execution, file writes or remote remediation.
- Knowledge: stored title/text documents, lexical retrieval of up to three bounded fragments. For shared per-client documents set group and binding knowledge_group; mismatched groups are excluded. This is lexical retrieval; vector RAG is connected through HTTP/MCP sources.
- MCP: configured read-only tool names/arguments over Streamable HTTP (2025-03-26, 2025-06-18 or 2025-11-25), initialize/session/initialized/tools-call; JSON or SSE results. Query text can be mapped by query_argument. Stdio, legacy standalone SSE, OAuth interactive flows and arbitrary discovered tools are not implemented.

Connector exceptions expose only class names, not URLs/credentials. Known secret literals/secret-like fields in results are scrubbed. A unavailable source appears as unavailable, never as a fabricated fact. Remote API/MCP read semantics and tenant filters are part of the administrator's configured contract; connections need matching real access to pass live verification.

## Tickets and history
«Тикеты» is the default view: search, lifecycle filter, pagination, automatic queue refresh. Each card contains client/sender, responsible staff, technical status and last update. Detail: original letters, outgoing replies, immutable draft revisions, model read plans, source reads/results/errors, operator comments, approvals and SMTP audit; previous tickets of the same registered client.

Case status (new/in progress/waiting client/resolved/closed) is separate from technical status (received/setup required/pending approval/sending/sent/rejected/send uncertain). Closed/resolved cases cannot be approved. SMTP accepted moves the case to waiting client. New replies that reference an existing message from the same sender append to that ticket; queued replies reopen it and invalidate prior pending drafts. Sending/uncertain cases defer new messages until reconciliation. Historical tickets keep their original numbers; no merging/renumbering was performed.

Audit starts at the actions actually recorded. Prior data are backfilled as messages/drafts; unavailable historic model/source traces are not invented. The local message ID audit indicates SMTP acceptance, not recipient receipt. Sending state is persisted before SMTP; uncertainty is never automatically retried. Duplicate/stale approvals do not resend.

## Deployment and checks
Compose runs n8n 2.42.5, PostgreSQL17 and the private Python bridge. Bridge UI port 8088 and n8n 5678 bind only 127.0.0.1 behind additive nginx TLS routes. Existing PBX/MySQL/VPN/backend services are preserved. n8n runs inbox every minute and approval every five seconds, retains execution metadata with 168h pruning. Public source/binding configuration revisions are retained separately for audit; private credential values are never included. The bridge owns cursors, history, tool reads and send guards.

Build: docker compose build bridge. Initialize owner/schema/proxy and deploy: python3 deploy-console.py (private auth initialized from access.env). Migration is additive. prior-source.tar (a69e75c) is retained to rebuild the previous image if unavailable for tagging. Configure the bot menu: copy configure-miniapp.py into bridge, execute with PYTHONPATH=/app. No backend API redeploy needed for this console.

Tests (isolated helpdesk_test; SMTP/provider fixtures mocked where stated): docker compose run --rm --no-deps -v /opt/aipbx-helpdesk/run-tests.py:/app/run-tests.py:ro bridge python /app/run-tests.py.
Browser QA helper verify-console-ui.cjs reads the existing local access file internally; never prints password/token or Playwright fill error details. It checks login, empty secret fields, ticket view, desktop/mobile layout and JS errors.

Daily root-only backup timer 03:20 Asia/Krasnoyarsk, retention 14 days. python3 backup.py includes both DB dumps, n8n files, private credentials/auth, source/registry/UI runtime and configuration. Restore both DBs and private/auth material before enabling processing; encrypted n8n credentials also need original .env encryption key. Off-server backup is not configured. Original PostgreSQL16 volume/migration dumps retained.