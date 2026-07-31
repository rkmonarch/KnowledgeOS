CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE source_kind AS ENUM ('markdown', 'text');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE concept_type AS ENUM ('system', 'component', 'api', 'process', 'policy', 'decision', 'person', 'team', 'term', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE concept_status AS ENUM ('draft', 'active', 'stale', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM ('active', 'superseded', 'disputed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE relationship_type AS ENUM ('depends_on', 'implements', 'replaces', 'contradicts', 'related_to', 'part_of', 'owned_by', 'documented_in');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_type AS ENUM ('extract_concepts_from_source_revision', 'embed_concept', 'embed_claim');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE embeddable_entity_type AS ENUM ('concept', 'claim');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind source_kind NOT NULL,
  name text NOT NULL,
  external_uri text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sources_workspace_name_unique ON sources(workspace_id, name);
CREATE INDEX IF NOT EXISTS sources_workspace_idx ON sources(workspace_id);

CREATE TABLE IF NOT EXISTS source_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS source_revisions_source_hash_unique ON source_revisions(source_id, content_hash);
CREATE INDEX IF NOT EXISTS source_revisions_source_idx ON source_revisions(source_id);

CREATE TABLE IF NOT EXISTS source_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_revision_id uuid NOT NULL REFERENCES source_revisions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  heading_path text[] NOT NULL DEFAULT ARRAY[]::text[],
  title text NOT NULL,
  body text NOT NULL,
  start_line integer NOT NULL,
  end_line integer NOT NULL,
  content_hash text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS source_sections_revision_ordinal_unique ON source_sections(source_revision_id, ordinal);
CREATE INDEX IF NOT EXISTS source_sections_revision_hash_idx ON source_sections(source_revision_id, content_hash);

CREATE TABLE IF NOT EXISTS concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  body text NOT NULL,
  type concept_type NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  confidence real NOT NULL DEFAULT 0,
  owner text,
  status concept_status NOT NULL DEFAULT 'draft',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS concepts_workspace_slug_unique ON concepts(workspace_id, slug);
CREATE INDEX IF NOT EXISTS concepts_workspace_idx ON concepts(workspace_id);

CREATE TABLE IF NOT EXISTS concept_sources (
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  source_revision_id uuid NOT NULL REFERENCES source_revisions(id) ON DELETE CASCADE,
  source_section_id uuid NOT NULL REFERENCES source_sections(id) ON DELETE CASCADE,
  start_line integer NOT NULL,
  end_line integer NOT NULL,
  confidence real NOT NULL DEFAULT 0,
  PRIMARY KEY (concept_id, source_section_id)
);

CREATE INDEX IF NOT EXISTS concept_sources_revision_idx ON concept_sources(source_revision_id);

CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  text text NOT NULL,
  confidence real NOT NULL DEFAULT 0,
  status claim_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS claims_concept_text_unique ON claims(concept_id, text);
CREATE INDEX IF NOT EXISTS claims_workspace_idx ON claims(workspace_id);
CREATE INDEX IF NOT EXISTS claims_concept_idx ON claims(concept_id);

CREATE TABLE IF NOT EXISTS claim_sources (
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  source_revision_id uuid NOT NULL REFERENCES source_revisions(id) ON DELETE CASCADE,
  source_section_id uuid NOT NULL REFERENCES source_sections(id) ON DELETE CASCADE,
  start_line integer NOT NULL,
  end_line integer NOT NULL,
  quote text NOT NULL,
  PRIMARY KEY (claim_id, source_section_id)
);

CREATE INDEX IF NOT EXISTS claim_sources_revision_idx ON claim_sources(source_revision_id);

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  type relationship_type NOT NULL,
  confidence real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS relationships_unique ON relationships(workspace_id, source_concept_id, target_concept_id, type);
CREATE INDEX IF NOT EXISTS relationships_source_idx ON relationships(source_concept_id);
CREATE INDEX IF NOT EXISTS relationships_target_idx ON relationships(target_concept_id);

CREATE TABLE IF NOT EXISTS embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type embeddable_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  embedding vector(1536) NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS embeddings_entity_model_hash_unique ON embeddings(entity_type, entity_id, model, content_hash);
CREATE INDEX IF NOT EXISTS embeddings_workspace_idx ON embeddings(workspace_id);
CREATE INDEX IF NOT EXISTS embeddings_entity_idx ON embeddings(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw_idx ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency_key_unique ON jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs(status, run_after, type);

