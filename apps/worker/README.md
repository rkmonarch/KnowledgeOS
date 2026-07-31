# @knowledgeos/worker

Background worker for KnowledgeOS.

Milestone one processes PostgreSQL-backed jobs for concept extraction and embeddings. Jobs are claimed transactionally, retried, and keyed for idempotency.

