-- Chat entity for text-based helpdesk
CREATE TABLE IF NOT EXISTS "chats" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    instruction TEXT,
    model VARCHAR(100) DEFAULT 'qwen3:8b',
    temperature VARCHAR(10) DEFAULT '0.7',
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_user ON "chats"("userId");

-- Chat ↔ AiTool many-to-many junction
CREATE TABLE IF NOT EXISTS "chat_aiTools" (
    "toolId" INTEGER NOT NULL REFERENCES "aiTools"(id) ON DELETE CASCADE,
    "chatId" INTEGER NOT NULL REFERENCES "chats"(id) ON DELETE CASCADE,
    PRIMARY KEY ("toolId", "chatId")
);
