-- Лог фиксации согласия пользователей с правовыми документами (оферта, политика ПДн).
-- Запись идемпотентна по (userId, documentKind, documentVersion):
--  при повторном входе с той же редакцией документа updatedAt обновляется,
--  ip/userAgent перезаписываются на последние, новая строка не создаётся.

CREATE TABLE IF NOT EXISTS "legal_acceptances" (
    "id" BIGSERIAL PRIMARY KEY,
    "userId" VARCHAR(64) NOT NULL,
    "documentKind" VARCHAR(32) NOT NULL,
    "documentVersion" VARCHAR(32) NOT NULL,
    "contentHash" VARCHAR(128) NOT NULL,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "source" VARCHAR(32) NOT NULL DEFAULT 'login',
    "acceptedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "legal_acceptances_uniq_user_doc_version"
    ON "legal_acceptances" ("userId", "documentKind", "documentVersion");

CREATE INDEX IF NOT EXISTS "legal_acceptances_user_idx"
    ON "legal_acceptances" ("userId");
