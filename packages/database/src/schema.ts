import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type { Metadata } from "@knowledgeos/shared";

export const sourceKindEnum = pgEnum("source_kind", ["markdown", "text"]);
export const conceptTypeEnum = pgEnum("concept_type", [
  "system",
  "component",
  "api",
  "process",
  "policy",
  "decision",
  "person",
  "team",
  "term",
  "other"
]);
export const conceptStatusEnum = pgEnum("concept_status", ["draft", "active", "stale", "archived"]);
export const claimStatusEnum = pgEnum("claim_status", ["active", "superseded", "disputed", "archived"]);
export const relationshipTypeEnum = pgEnum("relationship_type", [
  "depends_on",
  "implements",
  "replaces",
  "contradicts",
  "related_to",
  "part_of",
  "owned_by",
  "documented_in"
]);
export const jobTypeEnum = pgEnum("job_type", [
  "extract_concepts_from_source_revision",
  "embed_concept",
  "embed_claim"
]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed"]);
export const embeddableEntityTypeEnum = pgEnum("embeddable_entity_type", ["concept", "claim"]);

export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (typeof value !== "string") {
      return [];
    }
    const body = value.replace(/^\[/, "").replace(/\]$/, "");
    if (body.length === 0) {
      return [];
    }
    return body.split(",").map((item) => Number(item));
  }
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  ...timestamps
});

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: sourceKindEnum("kind").notNull(),
    name: text("name").notNull(),
    externalUri: text("external_uri"),
    metadata: jsonb("metadata").$type<Metadata>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex("sources_workspace_name_unique").on(table.workspaceId, table.name),
    workspaceIdx: index("sources_workspace_idx").on(table.workspaceId)
  })
);

export const sourceRevisions = pgTable(
  "source_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Metadata>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    sourceHashUnique: uniqueIndex("source_revisions_source_hash_unique").on(table.sourceId, table.contentHash),
    sourceIdx: index("source_revisions_source_idx").on(table.sourceId)
  })
);

export const sourceSections = pgTable(
  "source_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => sourceRevisions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    headingPath: text("heading_path").array().notNull().default(sql`ARRAY[]::text[]`),
    title: text("title").notNull(),
    body: text("body").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    contentHash: text("content_hash").notNull()
  },
  (table) => ({
    revisionOrdinalUnique: uniqueIndex("source_sections_revision_ordinal_unique").on(
      table.sourceRevisionId,
      table.ordinal
    ),
    revisionHashIdx: index("source_sections_revision_hash_idx").on(table.sourceRevisionId, table.contentHash)
  })
);

export const concepts = pgTable(
  "concepts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    type: conceptTypeEnum("type").notNull().default("other"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    confidence: real("confidence").notNull().default(0),
    owner: text("owner"),
    status: conceptStatusEnum("status").notNull().default("draft"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    workspaceSlugUnique: uniqueIndex("concepts_workspace_slug_unique").on(table.workspaceId, table.slug),
    workspaceIdx: index("concepts_workspace_idx").on(table.workspaceId)
  })
);

export const conceptSources = pgTable(
  "concept_sources",
  {
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => sourceRevisions.id, { onDelete: "cascade" }),
    sourceSectionId: uuid("source_section_id")
      .notNull()
      .references(() => sourceSections.id, { onDelete: "cascade" }),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    confidence: real("confidence").notNull().default(0)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conceptId, table.sourceSectionId] }),
    revisionIdx: index("concept_sources_revision_idx").on(table.sourceRevisionId)
  })
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    confidence: real("confidence").notNull().default(0),
    status: claimStatusEnum("status").notNull().default("active"),
    ...timestamps
  },
  (table) => ({
    conceptTextUnique: uniqueIndex("claims_concept_text_unique").on(table.conceptId, table.text),
    workspaceIdx: index("claims_workspace_idx").on(table.workspaceId),
    conceptIdx: index("claims_concept_idx").on(table.conceptId)
  })
);

export const claimSources = pgTable(
  "claim_sources",
  {
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => sourceRevisions.id, { onDelete: "cascade" }),
    sourceSectionId: uuid("source_section_id")
      .notNull()
      .references(() => sourceSections.id, { onDelete: "cascade" }),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    quote: text("quote").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.claimId, table.sourceSectionId] }),
    revisionIdx: index("claim_sources_revision_idx").on(table.sourceRevisionId)
  })
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceConceptId: uuid("source_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    targetConceptId: uuid("target_concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    type: relationshipTypeEnum("type").notNull(),
    confidence: real("confidence").notNull().default(0),
    ...timestamps
  },
  (table) => ({
    relationshipUnique: uniqueIndex("relationships_unique").on(
      table.workspaceId,
      table.sourceConceptId,
      table.targetConceptId,
      table.type
    ),
    sourceIdx: index("relationships_source_idx").on(table.sourceConceptId),
    targetIdx: index("relationships_target_idx").on(table.targetConceptId)
  })
);

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: embeddableEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    entityModelHashUnique: uniqueIndex("embeddings_entity_model_hash_unique").on(
      table.entityType,
      table.entityId,
      table.model,
      table.contentHash
    ),
    workspaceIdx: index("embeddings_workspace_idx").on(table.workspaceId),
    entityIdx: index("embeddings_entity_idx").on(table.entityType, table.entityId)
  })
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Metadata>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex("jobs_idempotency_key_unique").on(table.idempotencyKey),
    queueIdx: index("jobs_queue_idx").on(table.status, table.runAfter, table.type)
  })
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type SourceRevisionRow = typeof sourceRevisions.$inferSelect;
export type SourceSectionRow = typeof sourceSections.$inferSelect;
export type ConceptRow = typeof concepts.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;

