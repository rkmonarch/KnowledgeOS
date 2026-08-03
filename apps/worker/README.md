# @knowledgeos/worker

Background worker for KnowledgeOS.

Milestone one processes PostgreSQL-backed jobs for concept extraction and embeddings. Jobs are claimed transactionally, retried, and keyed for idempotency.

Revision extraction jobs fan out into one job per non-empty source section. Each section job persists its own concepts and claims before enqueueing embeddings, so long documents can make partial progress when one section fails provider validation or rate limits.
