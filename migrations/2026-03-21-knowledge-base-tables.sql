-- Knowledge Base tables for RAG (Retrieval-Augmented Generation)
-- Revised: KnowledgeBase as a reusable entity (not tied to assistant directly)
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge Base — a named collection of documents owned by a user
CREATE TABLE IF NOT EXISTS "knowledgeBases" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "documentsCount" INTEGER DEFAULT 0,
    "chunksCount" INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_user ON "knowledgeBases"("userId");

-- Documents uploaded to a knowledge base
CREATE TABLE IF NOT EXISTS "knowledgeDocuments" (
    id SERIAL PRIMARY KEY,
    "knowledgeBaseId" INTEGER NOT NULL REFERENCES "knowledgeBases"(id) ON DELETE CASCADE,
    "fileName" VARCHAR(500) NOT NULL,
    "fileType" VARCHAR(50),
    "fileSize" INTEGER,
    "sourceUrl" VARCHAR(2000),
    "chunksCount" INTEGER DEFAULT 0,
    "status" VARCHAR(50) DEFAULT 'processing',
    "errorMessage" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_kb ON "knowledgeDocuments"("knowledgeBaseId");

-- Text chunks with vector embeddings for similarity search
CREATE TABLE IF NOT EXISTS "knowledgeChunks" (
    id SERIAL PRIMARY KEY,
    "documentId" INTEGER NOT NULL REFERENCES "knowledgeDocuments"(id) ON DELETE CASCADE,
    "knowledgeBaseId" INTEGER NOT NULL REFERENCES "knowledgeBases"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector similarity search index (IVFFlat for fast approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON "knowledgeChunks" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON "knowledgeChunks"("knowledgeBaseId");
CREATE INDEX IF NOT EXISTS idx_chunks_document ON "knowledgeChunks"("documentId");
