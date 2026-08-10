ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'used_by';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'uses';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'requires';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'produces';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'affects';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'mitigates';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'signed_by';

ALTER TABLE relationships ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS source_revision_id uuid REFERENCES source_revisions(id) ON DELETE SET NULL;
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS source_section_id uuid REFERENCES source_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS relationships_source_revision_idx ON relationships(source_revision_id);
CREATE INDEX IF NOT EXISTS relationships_source_section_idx ON relationships(source_section_id);

CREATE TABLE IF NOT EXISTS unresolved_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  source_concept_slug text NOT NULL,
  target_concept_slug text NOT NULL,
  target_title text NOT NULL,
  type relationship_type NOT NULL,
  description text NOT NULL DEFAULT '',
  confidence real NOT NULL DEFAULT 0,
  source_revision_id uuid NOT NULL REFERENCES source_revisions(id) ON DELETE CASCADE,
  source_section_id uuid NOT NULL REFERENCES source_sections(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  resolved_relationship_id uuid REFERENCES relationships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unresolved_relationships_unique
  ON unresolved_relationships(workspace_id, source_revision_id, source_section_id, source_concept_id, target_concept_slug, type);

CREATE INDEX IF NOT EXISTS unresolved_relationships_workspace_status_idx
  ON unresolved_relationships(workspace_id, status);

CREATE INDEX IF NOT EXISTS unresolved_relationships_source_concept_idx
  ON unresolved_relationships(source_concept_id);

CREATE INDEX IF NOT EXISTS unresolved_relationships_target_slug_idx
  ON unresolved_relationships(workspace_id, target_concept_slug);
