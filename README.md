# KnowledgeOS

KnowledgeOS is an open-source knowledge engine for AI applications. It converts messy organisational information into structured concepts, claims, provenance, embeddings, and retrieval-ready context.

This repository is intentionally not a LangChain or LlamaIndex application. The first milestone implements the core loop directly:

1. Ingest Markdown or plain text.
2. Store a source and content-addressed source revision.
3. Split content by semantic headings with line references.
4. Extract concepts and claims through a strict Zod-validated LLM contract.
5. Persist concepts, claims, and citations.
6. Embed concepts and claims into PostgreSQL with pgvector.
7. Search concepts with natural language and return citations.

## Milestone One Scope

Included:

- pnpm monorepo
- Next.js dashboard and route-handler API
- Node worker
- PostgreSQL schema
- pgvector semantic search
- Markdown ingestion
- source revisions and hashing
- concept and claim extraction contracts
- deterministic fixture providers for local tests
- Docker PostgreSQL
- Vitest tests

Deferred:

- Neo4j graph index
- MCP server
- authentication
- billing
- Slack, Notion, GitHub, or PDF connectors
- complex agent workflows

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The dashboard and HTTP API run from `apps/web` on `http://localhost:3000`. The worker remains a separate process because extraction and embedding are background jobs.

## Extraction Jobs

Markdown ingestion creates a source-revision extraction coordinator job. The worker expands that coordinator into one extraction job per non-empty source section, then persists each section independently.

This avoids the all-or-nothing failure mode where one bad LLM response blocks every concept from a long document.

## Groq Extraction

KnowledgeOS can use Groq for concept and claim extraction:

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_CHAT_MODEL=openai/gpt-oss-20b
```

Groq is used only for structured extraction. Semantic search still needs embeddings; milestone one defaults to the local deterministic embedding provider so development does not require a paid embedding API.
