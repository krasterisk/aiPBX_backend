-- Helpdesk module: заявки клиентов Krasterisk (Phase 7)
-- Dialect: PostgreSQL (production)

CREATE TABLE IF NOT EXISTS "helpdesk_tickets" (
    id SERIAL PRIMARY KEY,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    category VARCHAR(32) NOT NULL DEFAULT 'other',
    priority VARCHAR(16) NOT NULL DEFAULT 'normal',
    source VARCHAR(32) NOT NULL DEFAULT 'voice',
    subject VARCHAR(512) NOT NULL DEFAULT '',
    description TEXT,
    "callerPhone" VARCHAR(32),
    "contactPhone" VARCHAR(32),
    "alfawebhookClientId" VARCHAR(128),
    inn VARCHAR(16),
    "clientName" VARCHAR(512),
    "assigneeId" INTEGER,
    "createdByApiKeyId" INTEGER,
    transcript TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_status ON "helpdesk_tickets"(status);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_assignee ON "helpdesk_tickets"("assigneeId");
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_category ON "helpdesk_tickets"(category);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_created ON "helpdesk_tickets"("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "helpdesk_ticket_messages" (
    id SERIAL PRIMARY KEY,
    "ticketId" INTEGER NOT NULL REFERENCES "helpdesk_tickets"(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'system',
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_messages_ticket ON "helpdesk_ticket_messages"("ticketId");

CREATE TABLE IF NOT EXISTS "helpdesk_ticket_status_history" (
    id SERIAL PRIMARY KEY,
    "ticketId" INTEGER NOT NULL REFERENCES "helpdesk_tickets"(id) ON DELETE CASCADE,
    "fromStatus" VARCHAR(32),
    "toStatus" VARCHAR(32) NOT NULL,
    "changedByUserId" INTEGER,
    note TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_status_history_ticket ON "helpdesk_ticket_status_history"("ticketId");

CREATE TABLE IF NOT EXISTS "helpdesk_client_context" (
    id SERIAL PRIMARY KEY,
    "clientKey" VARCHAR(128) NOT NULL UNIQUE,
    "alfawebhookClientId" VARCHAR(128),
    inn VARCHAR(16),
    "contextJson" JSONB NOT NULL DEFAULT '{}',
    "contextMarkdown" TEXT NOT NULL DEFAULT '',
    "contextMarkdownOverride" TEXT,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_client_context_inn ON "helpdesk_client_context"(inn);

CREATE TABLE IF NOT EXISTS "helpdesk_pbx_connections" (
    id SERIAL PRIMARY KEY,
    "alfawebhookClientId" VARCHAR(128) NOT NULL,
    url VARCHAR(512) NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'cloud',
    label VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_pbx_client ON "helpdesk_pbx_connections"("alfawebhookClientId");

CREATE TABLE IF NOT EXISTS "helpdesk_settings" (
    id SERIAL PRIMARY KEY,
    "notificationEmails" JSONB NOT NULL DEFAULT '[]',
    "notificationTelegramChatIds" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO "helpdesk_settings" ("notificationEmails", "notificationTelegramChatIds")
SELECT '[]'::jsonb, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "helpdesk_settings" LIMIT 1);
