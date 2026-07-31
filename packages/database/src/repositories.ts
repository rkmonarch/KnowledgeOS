import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  type ClaimRecord,
  type ClaimStatus,
  type ConceptRecord,
  type ConceptStatus,
  type ConceptType,
  type EmbeddableEntityType,
  type JobStatus,
  type JobType,
  type Metadata,
  NotFoundError,
  type RelationshipType,
  type SourceCitation,
  type SourceKind,
  claimStatusSchema,
  conceptStatusSchema,
  conceptTypeSchema,
  embeddableEntityTypeSchema,
  jobStatusSchema,
  jobTypeSchema,
  relationshipTypeSchema,
  sourceKindSchema
} from "@knowledgeos/shared";
import type { Database } from "./client.js";
import {
  claimSources,
  claims,
  conceptSources,
  concepts,
  embeddings,
  jobs,
  relationships,
  sourceRevisions,
  sourceSections,
  sources,
  workspaces
} from "./schema.js";

export interface CreateSourceInput {
  workspaceId: string;
  kind: SourceKind;
  name: string;
  externalUri?: string;
  metadata: Metadata;
}

export interface CreateSourceRevisionInput {
  sourceId: string;
  contentHash: string;
  content: string;
  metadata: Metadata;
}

export interface InsertSourceSectionInput {
  sourceRevisionId: string;
  ordinal: number;
  headingPath: string[];
  title: string;
  body: string;
  startLine: number;
  endLine: number;
  contentHash: string;
}

export interface EnqueueJobInput {
  workspaceId: string;
  type: JobType;
  payload: Metadata;
  idempotencyKey: string;
  maxAttempts?: number;
  runAfter?: Date;
}

export interface ClaimedJob {
  id: string;
  workspaceId: string;
  type: JobType;
  status: JobStatus;
  payload: Metadata;
  attempts: number;
  maxAttempts: number;
}

export interface SourceRevisionWithSections {
  revision: {
    id: string;
    sourceId: string;
    content: string;
    contentHash: string;
    createdAt: Date;
  };
  source: {
    id: string;
    workspaceId: string;
    name: string;
    kind: SourceKind;
  };
  sections: Array<{
    id: string;
    ordinal: number;
    headingPath: string[];
    title: string;
    body: string;
    startLine: number;
    endLine: number;
    contentHash: string;
  }>;
}

export interface PersistClaimInput {
  text: string;
  confidence: number;
  status: ClaimStatus;
  sourceSectionId: string;
  startLine: number;
  endLine: number;
  quote: string;
}

export interface PersistRelationshipInput {
  type: RelationshipType;
  targetSlug: string;
  confidence: number;
}

export interface PersistConceptInput {
  slug: string;
  title: string;
  summary: string;
  body: string;
  type: ConceptType;
  tags: string[];
  confidence: number;
  owner: string | null;
  status: ConceptStatus;
  sourceSectionId: string;
  startLine: number;
  endLine: number;
  claims: PersistClaimInput[];
  relationships: PersistRelationshipInput[];
}

export interface PersistExtractionInput {
  workspaceId: string;
  sourceRevisionId: string;
  concepts: PersistConceptInput[];
}

export interface PersistExtractionResult {
  conceptIds: string[];
  claimIds: string[];
}

export interface UpsertEmbeddingInput {
  workspaceId: string;
  entityType: EmbeddableEntityType;
  entityId: string;
  model: string;
  dimensions: number;
  embedding: number[];
  contentHash: string;
}

export interface EmbeddableEntity {
  workspaceId: string;
  entityType: EmbeddableEntityType;
  entityId: string;
  text: string;
}

export interface SemanticSearchInput {
  workspaceId: string;
  embedding: number[];
  limit: number;
  model: string;
  filters?: {
    sourceIds?: string[];
    conceptTypes?: ConceptType[];
    tags?: string[];
  };
}

export interface SemanticSearchHit {
  concept: ConceptRecord;
  claims: ClaimRecord[];
  vectorScore: number;
  citations: SourceCitation[];
}

export class KnowledgeRepository {
  constructor(private readonly db: Database) {}

  async ensureWorkspace(name: string) {
    const [workspace] = await this.db
      .insert(workspaces)
      .values({ name })
      .onConflictDoUpdate({
        target: workspaces.name,
        set: { updatedAt: sql`now()` }
      })
      .returning();

    if (!workspace) {
      throw new NotFoundError("Workspace could not be created", { name });
    }

    return workspace;
  }

  async createOrUpdateSource(input: CreateSourceInput) {
    const [source] = await this.db
      .insert(sources)
      .values({
        workspaceId: input.workspaceId,
        kind: input.kind,
        name: input.name,
        externalUri: input.externalUri ?? null,
        metadata: input.metadata
      })
      .onConflictDoUpdate({
        target: [sources.workspaceId, sources.name],
        set: {
          kind: input.kind,
          externalUri: input.externalUri ?? null,
          metadata: input.metadata,
          updatedAt: sql`now()`
        }
      })
      .returning();

    if (!source) {
      throw new NotFoundError("Source could not be created", { name: input.name });
    }

    return source;
  }

  async findSourceRevisionByHash(sourceId: string, contentHash: string) {
    const [revision] = await this.db
      .select()
      .from(sourceRevisions)
      .where(and(eq(sourceRevisions.sourceId, sourceId), eq(sourceRevisions.contentHash, contentHash)))
      .limit(1);

    return revision ?? null;
  }

  async createSourceRevision(input: CreateSourceRevisionInput) {
    const [revision] = await this.db
      .insert(sourceRevisions)
      .values({
        sourceId: input.sourceId,
        contentHash: input.contentHash,
        content: input.content,
        metadata: input.metadata
      })
      .onConflictDoNothing()
      .returning();

    if (revision) {
      return revision;
    }

    const existing = await this.findSourceRevisionByHash(input.sourceId, input.contentHash);
    if (!existing) {
      throw new NotFoundError("Source revision could not be created or found", {
        sourceId: input.sourceId,
        contentHash: input.contentHash
      });
    }

    return existing;
  }

  async insertSourceSections(inputs: InsertSourceSectionInput[]) {
    if (inputs.length === 0) {
      return [];
    }

    return this.db.insert(sourceSections).values(inputs).onConflictDoNothing().returning();
  }

  async countSourceSections(sourceRevisionId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceSections)
      .where(eq(sourceSections.sourceRevisionId, sourceRevisionId));

    return result?.count ?? 0;
  }

  async enqueueJob(input: EnqueueJobInput): Promise<string> {
    const [created] = await this.db
      .insert(jobs)
      .values({
        workspaceId: input.workspaceId,
        type: input.type,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        maxAttempts: input.maxAttempts ?? 3,
        runAfter: input.runAfter ?? new Date()
      })
      .onConflictDoNothing()
      .returning({ id: jobs.id });

    if (created) {
      return created.id;
    }

    const [existing] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Idempotent job could not be created or found", {
        idempotencyKey: input.idempotencyKey
      });
    }

    return existing.id;
  }

  async claimNextJob(types: JobType[], workerId: string): Promise<ClaimedJob | null> {
    for (const type of types) {
      const result = await this.db.execute(sql`
        update jobs
        set
          status = 'running'::job_status,
          attempts = attempts + 1,
          locked_at = now(),
          locked_by = ${workerId},
          updated_at = now()
        where id = (
          select id
          from jobs
          where status = 'queued'::job_status
            and type = ${type}::job_type
            and run_after <= now()
          order by created_at asc
          for update skip locked
          limit 1
        )
        returning
          id,
          workspace_id,
          type,
          status,
          payload,
          attempts,
          max_attempts
      `);

      const row = claimedJobRowSchema.array().parse(rowsFromExecute(result)).at(0);
      if (row) {
        return {
          id: row.id,
          workspaceId: row.workspace_id,
          type: row.type,
          status: row.status,
          payload: row.payload,
          attempts: row.attempts,
          maxAttempts: row.max_attempts
        };
      }
    }

    return null;
  }

  async completeJob(jobId: string): Promise<void> {
    await this.db
      .update(jobs)
      .set({
        status: "completed",
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: sql`now()`
      })
      .where(eq(jobs.id, jobId));
  }

  async failJob(jobId: string, message: string): Promise<void> {
    await this.db.execute(sql`
      update jobs
      set
        status = case when attempts >= max_attempts then 'failed'::job_status else 'queued'::job_status end,
        run_after = case when attempts >= max_attempts then run_after else now() + interval '30 seconds' end,
        locked_at = null,
        locked_by = null,
        last_error = ${message},
        updated_at = now()
      where id = ${jobId}
    `);
  }

  async getSourceRevisionWithSections(sourceRevisionId: string): Promise<SourceRevisionWithSections> {
    const [revisionRow] = await this.db
      .select({
        revisionId: sourceRevisions.id,
        sourceId: sourceRevisions.sourceId,
        contentHash: sourceRevisions.contentHash,
        content: sourceRevisions.content,
        revisionCreatedAt: sourceRevisions.createdAt,
        workspaceId: sources.workspaceId,
        sourceName: sources.name,
        sourceKind: sources.kind
      })
      .from(sourceRevisions)
      .innerJoin(sources, eq(sourceRevisions.sourceId, sources.id))
      .where(eq(sourceRevisions.id, sourceRevisionId))
      .limit(1);

    if (!revisionRow) {
      throw new NotFoundError("Source revision was not found", { sourceRevisionId });
    }

    const sectionRows = await this.db
      .select()
      .from(sourceSections)
      .where(eq(sourceSections.sourceRevisionId, sourceRevisionId))
      .orderBy(asc(sourceSections.ordinal));

    return {
      revision: {
        id: revisionRow.revisionId,
        sourceId: revisionRow.sourceId,
        content: revisionRow.content,
        contentHash: revisionRow.contentHash,
        createdAt: revisionRow.revisionCreatedAt
      },
      source: {
        id: revisionRow.sourceId,
        workspaceId: revisionRow.workspaceId,
        name: revisionRow.sourceName,
        kind: revisionRow.sourceKind
      },
      sections: sectionRows.map((section) => ({
        id: section.id,
        ordinal: section.ordinal,
        headingPath: section.headingPath,
        title: section.title,
        body: section.body,
        startLine: section.startLine,
        endLine: section.endLine,
        contentHash: section.contentHash
      }))
    };
  }

  async persistExtraction(input: PersistExtractionInput): Promise<PersistExtractionResult> {
    return this.db.transaction(async (tx) => {
      const conceptIds: string[] = [];
      const claimIds: string[] = [];
      const conceptIdBySlug = new Map<string, string>();

      for (const concept of input.concepts) {
        const [conceptRow] = await tx
          .insert(concepts)
          .values({
            workspaceId: input.workspaceId,
            slug: concept.slug,
            title: concept.title,
            summary: concept.summary,
            body: concept.body,
            type: concept.type,
            tags: concept.tags,
            confidence: concept.confidence,
            owner: concept.owner,
            status: concept.status
          })
          .onConflictDoUpdate({
            target: [concepts.workspaceId, concepts.slug],
            set: {
              title: concept.title,
              summary: concept.summary,
              body: concept.body,
              type: concept.type,
              tags: concept.tags,
              confidence: concept.confidence,
              owner: concept.owner,
              status: concept.status,
              updatedAt: sql`now()`
            }
          })
          .returning();

        if (!conceptRow) {
          continue;
        }

        conceptIds.push(conceptRow.id);
        conceptIdBySlug.set(concept.slug, conceptRow.id);

        await tx
          .insert(conceptSources)
          .values({
            conceptId: conceptRow.id,
            sourceRevisionId: input.sourceRevisionId,
            sourceSectionId: concept.sourceSectionId,
            startLine: concept.startLine,
            endLine: concept.endLine,
            confidence: concept.confidence
          })
          .onConflictDoNothing();

        for (const claim of concept.claims) {
          const [claimRow] = await tx
            .insert(claims)
            .values({
              workspaceId: input.workspaceId,
              conceptId: conceptRow.id,
              text: claim.text,
              confidence: claim.confidence,
              status: claim.status
            })
            .onConflictDoUpdate({
              target: [claims.conceptId, claims.text],
              set: {
                confidence: claim.confidence,
                status: claim.status,
                updatedAt: sql`now()`
              }
            })
            .returning();

          if (!claimRow) {
            continue;
          }

          claimIds.push(claimRow.id);

          await tx
            .insert(claimSources)
            .values({
              claimId: claimRow.id,
              sourceRevisionId: input.sourceRevisionId,
              sourceSectionId: claim.sourceSectionId,
              startLine: claim.startLine,
              endLine: claim.endLine,
              quote: claim.quote
            })
            .onConflictDoNothing();
        }
      }

      for (const concept of input.concepts) {
        const sourceConceptId = conceptIdBySlug.get(concept.slug);
        if (!sourceConceptId) {
          continue;
        }

        for (const relationship of concept.relationships) {
          const targetConceptId = conceptIdBySlug.get(relationship.targetSlug);
          const existingTargetConceptId = targetConceptId
            ? null
            : (
                await tx
                  .select({ id: concepts.id })
                  .from(concepts)
                  .where(and(eq(concepts.workspaceId, input.workspaceId), eq(concepts.slug, relationship.targetSlug)))
                  .limit(1)
              )[0]?.id;
          const resolvedTargetConceptId = targetConceptId ?? existingTargetConceptId;

          if (!resolvedTargetConceptId || resolvedTargetConceptId === sourceConceptId) {
            continue;
          }

          await tx
            .insert(relationships)
            .values({
              workspaceId: input.workspaceId,
              sourceConceptId,
              targetConceptId: resolvedTargetConceptId,
              type: relationship.type,
              confidence: relationship.confidence
            })
            .onConflictDoUpdate({
              target: [
                relationships.workspaceId,
                relationships.sourceConceptId,
                relationships.targetConceptId,
                relationships.type
              ],
              set: {
                confidence: relationship.confidence,
                updatedAt: sql`now()`
              }
            });
        }
      }

      return { conceptIds, claimIds };
    });
  }

  async findConceptIdBySlug(workspaceId: string, slug: string): Promise<string | null> {
    const [concept] = await this.db
      .select({ id: concepts.id })
      .from(concepts)
      .where(and(eq(concepts.workspaceId, workspaceId), eq(concepts.slug, slug)))
      .limit(1);

    return concept?.id ?? null;
  }

  async listConcepts(workspaceId: string, limit = 100): Promise<ConceptRecord[]> {
    const rows = await this.db
      .select()
      .from(concepts)
      .where(eq(concepts.workspaceId, workspaceId))
      .orderBy(desc(concepts.updatedAt))
      .limit(limit);

    return Promise.all(rows.map((row) => this.toConceptRecord(row)));
  }

  async getConcept(conceptId: string): Promise<ConceptRecord> {
    const [row] = await this.db.select().from(concepts).where(eq(concepts.id, conceptId)).limit(1);
    if (!row) {
      throw new NotFoundError("Concept was not found", { conceptId });
    }
    return this.toConceptRecord(row);
  }

  async listClaimsForConcept(conceptId: string): Promise<ClaimRecord[]> {
    const rows = await this.db
      .select()
      .from(claims)
      .where(eq(claims.conceptId, conceptId))
      .orderBy(desc(claims.updatedAt));

    return Promise.all(rows.map((row) => this.toClaimRecord(row)));
  }

  async getEmbeddableEntity(input: {
    workspaceId: string;
    entityType: EmbeddableEntityType;
    entityId: string;
  }): Promise<EmbeddableEntity> {
    if (input.entityType === "concept") {
      const [concept] = await this.db
        .select()
        .from(concepts)
        .where(and(eq(concepts.id, input.entityId), eq(concepts.workspaceId, input.workspaceId)))
        .limit(1);

      if (!concept) {
        throw new NotFoundError("Concept was not found for embedding", input);
      }

      return {
        workspaceId: input.workspaceId,
        entityType: "concept",
        entityId: input.entityId,
        text: [concept.title, concept.summary, concept.body, `Tags: ${concept.tags.join(", ")}`].join("\n\n")
      };
    }

    const [claim] = await this.db
      .select()
      .from(claims)
      .where(and(eq(claims.id, input.entityId), eq(claims.workspaceId, input.workspaceId)))
      .limit(1);

    if (!claim) {
      throw new NotFoundError("Claim was not found for embedding", input);
    }

    return {
      workspaceId: input.workspaceId,
      entityType: "claim",
      entityId: input.entityId,
      text: claim.text
    };
  }

  async upsertEmbedding(input: UpsertEmbeddingInput): Promise<void> {
    await this.db
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.entityType, input.entityType),
          eq(embeddings.entityId, input.entityId),
          eq(embeddings.model, input.model)
        )
      );

    await this.db.insert(embeddings).values({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      model: input.model,
      dimensions: input.dimensions,
      embedding: input.embedding,
      contentHash: input.contentHash
    });
  }

  async semanticSearch(input: SemanticSearchInput): Promise<SemanticSearchHit[]> {
    const vectorLiteral = `[${input.embedding.join(",")}]`;
    const whereClauses: SQL[] = [
      sql`e.workspace_id = ${input.workspaceId}`,
      sql`e.model = ${input.model}`,
      sql`e.entity_type = 'concept'::embeddable_entity_type`
    ];

    if (input.filters?.conceptTypes && input.filters.conceptTypes.length > 0) {
      whereClauses.push(sql`c.type = any(${input.filters.conceptTypes}::concept_type[])`);
    }

    if (input.filters?.tags && input.filters.tags.length > 0) {
      whereClauses.push(sql`c.tags && ${input.filters.tags}::text[]`);
    }

    if (input.filters?.sourceIds && input.filters.sourceIds.length > 0) {
      whereClauses.push(sql`
        exists (
          select 1
          from concept_sources cs
          join source_revisions sr on sr.id = cs.source_revision_id
          where cs.concept_id = c.id
            and sr.source_id = any(${input.filters.sourceIds}::uuid[])
        )
      `);
    }

    const result = await this.db.execute(sql`
      select
        c.id as concept_id,
        greatest(0, 1 - (e.embedding <=> ${vectorLiteral}::vector))::float8 as vector_score
      from embeddings e
      join concepts c on c.id = e.entity_id
      where ${sql.join(whereClauses, sql` and `)}
      order by e.embedding <=> ${vectorLiteral}::vector
      limit ${input.limit}
    `);

    const rows = semanticSearchRowSchema.array().parse(rowsFromExecute(result));

    return Promise.all(
      rows.map(async (row) => {
        const concept = await this.getConcept(row.concept_id);
        const claimsForConcept = await this.listClaimsForConcept(row.concept_id);
        return {
          concept,
          claims: claimsForConcept,
          vectorScore: clampScore(row.vector_score),
          citations: concept.citations
        };
      })
    );
  }

  private async toConceptRecord(row: {
    id: string;
    workspaceId: string;
    slug: string;
    title: string;
    summary: string;
    body: string;
    type: ConceptType;
    tags: string[];
    confidence: number;
    owner: string | null;
    status: ConceptStatus;
    createdAt: Date;
    updatedAt: Date;
    verifiedAt: Date | null;
  }): Promise<ConceptRecord> {
    const citations = await this.getConceptCitations(row.id);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      type: conceptTypeSchema.parse(row.type),
      tags: row.tags,
      confidence: clampScore(row.confidence),
      owner: row.owner,
      status: conceptStatusSchema.parse(row.status),
      citations,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString() ?? null
    };
  }

  private async toClaimRecord(row: {
    id: string;
    conceptId: string;
    text: string;
    confidence: number;
    status: ClaimStatus;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<ClaimRecord> {
    const citations = await this.getClaimCitations(row.id);
    return {
      id: row.id,
      conceptId: row.conceptId,
      text: row.text,
      confidence: clampScore(row.confidence),
      status: claimStatusSchema.parse(row.status),
      citations,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private async getConceptCitations(conceptId: string): Promise<SourceCitation[]> {
    const rows = await this.db
      .select({
        sourceId: sources.id,
        sourceRevisionId: conceptSources.sourceRevisionId,
        sourceSectionId: conceptSources.sourceSectionId,
        sourceName: sources.name,
        headingPath: sourceSections.headingPath,
        startLine: conceptSources.startLine,
        endLine: conceptSources.endLine
      })
      .from(conceptSources)
      .innerJoin(sourceRevisions, eq(sourceRevisions.id, conceptSources.sourceRevisionId))
      .innerJoin(sources, eq(sources.id, sourceRevisions.sourceId))
      .innerJoin(sourceSections, eq(sourceSections.id, conceptSources.sourceSectionId))
      .where(eq(conceptSources.conceptId, conceptId));

    return rows.map((row) => ({
      sourceId: row.sourceId,
      sourceRevisionId: row.sourceRevisionId,
      sourceSectionId: row.sourceSectionId,
      sourceName: row.sourceName,
      headingPath: row.headingPath,
      startLine: row.startLine,
      endLine: row.endLine
    }));
  }

  private async getClaimCitations(claimId: string): Promise<SourceCitation[]> {
    const rows = await this.db
      .select({
        sourceId: sources.id,
        sourceRevisionId: claimSources.sourceRevisionId,
        sourceSectionId: claimSources.sourceSectionId,
        sourceName: sources.name,
        headingPath: sourceSections.headingPath,
        startLine: claimSources.startLine,
        endLine: claimSources.endLine,
        quote: claimSources.quote
      })
      .from(claimSources)
      .innerJoin(sourceRevisions, eq(sourceRevisions.id, claimSources.sourceRevisionId))
      .innerJoin(sources, eq(sources.id, sourceRevisions.sourceId))
      .innerJoin(sourceSections, eq(sourceSections.id, claimSources.sourceSectionId))
      .where(eq(claimSources.claimId, claimId));

    return rows.map((row) => ({
      sourceId: row.sourceId,
      sourceRevisionId: row.sourceRevisionId,
      sourceSectionId: row.sourceSectionId,
      sourceName: row.sourceName,
      headingPath: row.headingPath,
      startLine: row.startLine,
      endLine: row.endLine,
      quote: row.quote
    }));
  }
}

const claimedJobRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  payload: z.record(z.unknown()),
  attempts: z.number(),
  max_attempts: z.number()
});

const semanticSearchRowSchema = z.object({
  concept_id: z.string().uuid(),
  vector_score: z.coerce.number()
});

function rowsFromExecute(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }

  if (typeof result === "object" && result !== null && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export const repositoryEnums = {
  sourceKindSchema,
  relationshipTypeSchema,
  embeddableEntityTypeSchema
};
