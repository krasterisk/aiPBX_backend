-- Issuer organizations (admin) + per-tenant default for invoices / SBIS

CREATE TABLE IF NOT EXISTS "our_organizations" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL,
    "tin" VARCHAR(255) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "kpp" VARCHAR(9),
    "ogrn" VARCHAR(15),
    "legalForm" VARCHAR(8),
    "director" VARCHAR(255),
    "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "our_organizations_is_primary_idx"
    ON "our_organizations" ("isPrimary")
    WHERE "isPrimary" = TRUE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS "ourOrganizationId" INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'users_our_organization_id_fkey'
          AND table_name = 'users'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_our_organization_id_fkey
            FOREIGN KEY ("ourOrganizationId") REFERENCES "our_organizations" (id) ON DELETE SET NULL;
    END IF;
END $$;
