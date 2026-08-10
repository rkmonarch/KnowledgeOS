import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  type ClaimRecord,
  type ClaimStatus,
  type ConceptRelationships,
  type ConceptRecord,
  type ConceptStatus,
  type ConceptType,
  type EmbeddableEntityType,
  type JobRecord,
  type JobStatus,
  type JobType,
  type Metadata,
  NotFoundError,
  type RelationshipRecord,
  type RelationshipType,
  type SourceCitation,
  type UnresolvedRelationshipRecord,
  unresolvedRelationshipStatusSchema,
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
  unresolvedRelationships,
  workspaces
} from "./schema.js";
import { resolveRelationshipDrafts } from "./relationship-resolution.js";

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

export interface SourceSectionForExtractionRecord {
  workspaceId: string;
  sourceId: string;
  sourceName: string;
  sourceRevisionId: string;
  sourceSectionId: string;
  headingPath: string[];
  title: string;
  body: string;
  startLine: number;
  endLine: number;
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
  targetTitle: string;
  description: string;
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
  relationshipIds: string[];
  unresolvedRelationshipIds: string[];
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

  async listJobs(workspaceId: string, limit = 50): Promise<JobRecord[]> {
    const rows = await this.db
      .select({
        id: jobs.id,
        workspaceId: jobs.workspaceId,
        type: jobs.type,
        status: jobs.status,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        runAfter: jobs.runAfter,
        lockedAt: jobs.lockedAt,
        lockedBy: jobs.lockedBy,
        lastError: jobs.lastError,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt
      })
      .from(jobs)
      .where(eq(jobs.workspaceId, workspaceId))
      .orderBy(desc(jobs.updatedAt), desc(jobs.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      type: jobTypeSchema.parse(row.type),
      status: jobStatusSchema.parse(row.status),
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      runAfter: row.runAfter.toISOString(),
      lockedAt: row.lockedAt?.toISOString() ?? null,
      lockedBy: row.lockedBy,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
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

  async getSourceSectionForExtraction(input: {
    sourceRevisionId: string;
    sourceSectionId: string;
  }): Promise<SourceSectionForExtractionRecord> {
    const [row] = await this.db
      .select({
        workspaceId: sources.workspaceId,
        sourceId: sources.id,
        sourceName: sources.name,
        sourceRevisionId: sourceRevisions.id,
        sourceSectionId: sourceSections.id,
        headingPath: sourceSections.headingPath,
        title: sourceSections.title,
        body: sourceSections.body,
        startLine: sourceSections.startLine,
        endLine: sourceSections.endLine
      })
      .from(sourceSections)
      .innerJoin(sourceRevisions, eq(sourceRevisions.id, sourceSections.sourceRevisionId))
      .innerJoin(sources, eq(sources.id, sourceRevisions.sourceId))
      .where(
        and(
          eq(sourceRevisions.id, input.sourceRevisionId),
          eq(sourceSections.id, input.sourceSectionId)
        )
      )
      .limit(1);

    if (!row) {
      throw new NotFoundError("Source section was not found for extraction", input);
    }

    return row;
  }

  async persistExtraction(input: PersistExtractionInput): Promise<PersistExtractionResult> {
    return this.db.transaction(async (tx) => {
      const conceptIds: string[] = [];
      const claimIds: string[] = [];
      const relationshipIds: string[] = [];
      const unresolvedRelationshipIds: string[] = [];
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

      const relationshipTargetSlugs = [
        ...new Set(
          input.concepts
            .flatMap((concept) => concept.relationships.map((relationship) => relationship.targetSlug))
            .filter((targetSlug) => !conceptIdBySlug.has(targetSlug))
        )
      ];
      const existingTargetRows =
        relationshipTargetSlugs.length === 0
          ? []
          : await tx
              .select({ id: concepts.id, slug: concepts.slug })
              .from(concepts)
              .where(and(eq(concepts.workspaceId, input.workspaceId), inArray(concepts.slug, relationshipTargetSlugs)));
      const existingConceptIdsBySlug = new Map(existingTargetRows.map((concept) => [concept.slug, concept.id]));
      const resolution = resolveRelationshipDrafts({
        concepts: input.concepts.flatMap((concept) => {
          const id = conceptIdBySlug.get(concept.slug);
          if (!id) {
            return [];
          }

          return [
            {
              id,
              slug: concept.slug,
              sourceSectionId: concept.sourceSectionId,
              relationships: concept.relationships
            }
          ];
        }),
        existingConceptIdsBySlug
      });

      for (const relationship of resolution.pending) {
        const [unresolvedRow] = await tx
          .insert(unresolvedRelationships)
          .values({
            workspaceId: input.workspaceId,
            sourceConceptId: relationship.sourceConceptId,
            sourceConceptSlug: relationship.sourceConceptSlug,
            targetConceptSlug: relationship.targetConceptSlug,
            targetTitle: relationship.targetTitle,
            type: relationship.type,
            description: relationship.description,
            confidence: relationship.confidence,
            sourceRevisionId: input.sourceRevisionId,
            sourceSectionId: relationship.sourceSectionId,
            status: "pending"
          })
          .onConflictDoUpdate({
            target: [
              unresolvedRelationships.workspaceId,
              unresolvedRelationships.sourceRevisionId,
              unresolvedRelationships.sourceSectionId,
              unresolvedRelationships.sourceConceptId,
              unresolvedRelationships.targetConceptSlug,
              unresolvedRelationships.type
            ],
            set: {
              targetTitle: relationship.targetTitle,
              description: relationship.description,
              confidence: relationship.confidence,
              status: "pending",
              resolvedRelationshipId: null,
              updatedAt: sql`now()`
            }
          })
          .returning({ id: unresolvedRelationships.id });

        if (unresolvedRow) {
          unresolvedRelationshipIds.push(unresolvedRow.id);
        }
      }

      for (const relationship of resolution.resolved) {
        const [relationshipRow] = await tx
          .insert(relationships)
          .values({
            workspaceId: input.workspaceId,
            sourceConceptId: relationship.sourceConceptId,
            targetConceptId: relationship.targetConceptId,
            type: relationship.type,
            description: relationship.description,
            confidence: relationship.confidence,
            sourceRevisionId: input.sourceRevisionId,
            sourceSectionId: relationship.sourceSectionId
          })
          .onConflictDoUpdate({
            target: [
              relationships.workspaceId,
              relationships.sourceConceptId,
              relationships.targetConceptId,
              relationships.type
            ],
            set: {
              description: relationship.description,
              confidence: relationship.confidence,
              sourceRevisionId: input.sourceRevisionId,
              sourceSectionId: relationship.sourceSectionId,
              updatedAt: sql`now()`
            }
          })
          .returning({ id: relationships.id });

        if (!relationshipRow) {
          continue;
        }

        relationshipIds.push(relationshipRow.id);

        await tx
          .update(unresolvedRelationships)
          .set({
            status: "resolved",
            resolvedRelationshipId: relationshipRow.id,
            updatedAt: sql`now()`
          })
          .where(
            and(
              eq(unresolvedRelationships.workspaceId, input.workspaceId),
              eq(unresolvedRelationships.sourceConceptId, relationship.sourceConceptId),
              eq(unresolvedRelationships.targetConceptSlug, relationship.targetConceptSlug),
              eq(unresolvedRelationships.type, relationship.type),
              eq(unresolvedRelationships.status, "pending")
            )
          );
      }

      const resolvedPendingRelationshipIds = await this.resolvePendingRelationships(tx, input.workspaceId);
      relationshipIds.push(...resolvedPendingRelationshipIds);

      return { conceptIds, claimIds, relationshipIds, unresolvedRelationshipIds };
    });
  }

  private async resolvePendingRelationships(
    tx: Pick<Database, "insert" | "select" | "update">,
    workspaceId: string
  ): Promise<string[]> {
    const pendingRows = await tx
      .select()
      .from(unresolvedRelationships)
      .where(and(eq(unresolvedRelationships.workspaceId, workspaceId), eq(unresolvedRelationships.status, "pending")));
    const relationshipIds: string[] = [];

    for (const pending of pendingRows) {
      const [targetConcept] = await tx
        .select({ id: concepts.id })
        .from(concepts)
        .where(and(eq(concepts.workspaceId, workspaceId), eq(concepts.slug, pending.targetConceptSlug)))
        .limit(1);

      if (!targetConcept || targetConcept.id === pending.sourceConceptId) {
        continue;
      }

      const [relationshipRow] = await tx
        .insert(relationships)
        .values({
          workspaceId,
          sourceConceptId: pending.sourceConceptId,
          targetConceptId: targetConcept.id,
          type: pending.type,
          description: pending.description,
          confidence: pending.confidence,
          sourceRevisionId: pending.sourceRevisionId,
          sourceSectionId: pending.sourceSectionId
        })
        .onConflictDoUpdate({
          target: [
            relationships.workspaceId,
            relationships.sourceConceptId,
            relationships.targetConceptId,
            relationships.type
          ],
          set: {
            description: pending.description,
            confidence: pending.confidence,
            sourceRevisionId: pending.sourceRevisionId,
            sourceSectionId: pending.sourceSectionId,
            updatedAt: sql`now()`
          }
        })
        .returning({ id: relationships.id });

      if (!relationshipRow) {
        continue;
      }

      relationshipIds.push(relationshipRow.id);

      await tx
        .update(unresolvedRelationships)
        .set({
          status: "resolved",
          resolvedRelationshipId: relationshipRow.id,
          updatedAt: sql`now()`
        })
        .where(eq(unresolvedRelationships.id, pending.id));
    }

    return relationshipIds;
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

  async listRelationshipsForConcept(workspaceId: string, conceptId: string): Promise<ConceptRelationships> {
    const [outgoingResult, incomingResult, unresolvedResult] = await Promise.all([
      this.db.execute(relationshipSelectSql(workspaceId, conceptId, "outgoing")),
      this.db.execute(relationshipSelectSql(workspaceId, conceptId, "incoming")),
      this.db.execute(sql`
        select
          ur.id,
          ur.workspace_id,
          ur.source_concept_id,
          ur.source_concept_slug,
          ur.target_concept_slug,
          ur.target_title,
          ur.type,
          ur.description,
          ur.confidence,
          ur.source_revision_id,
          ur.source_section_id,
          ur.status,
          ur.created_at,
          ur.updated_at,
          s.id as citation_source_id,
          s.name as citation_source_name,
          ss.heading_path as citation_heading_path,
          ss.start_line as citation_start_line,
          ss.end_line as citation_end_line
        from unresolved_relationships ur
        join source_revisions sr on sr.id = ur.source_revision_id
        join sources s on s.id = sr.source_id
        join source_sections ss on ss.id = ur.source_section_id
        where ur.workspace_id = ${workspaceId}
          and ur.source_concept_id = ${conceptId}
          and ur.status = 'pending'
        order by ur.type asc, ur.target_title asc
      `)
    ]);

    return {
      outgoing: relationshipReadRowSchema.array().parse(rowsFromExecute(outgoingResult)).map(toRelationshipRecord),
      incoming: relationshipReadRowSchema.array().parse(rowsFromExecute(incomingResult)).map(toRelationshipRecord),
      unresolved: unresolvedRelationshipReadRowSchema
        .array()
        .parse(rowsFromExecute(unresolvedResult))
        .map(toUnresolvedRelationshipRecord)
    };
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

function relationshipSelectSql(workspaceId: string, conceptId: string, direction: "incoming" | "outgoing"): SQL {
  const conceptFilter =
    direction === "outgoing"
      ? sql`r.source_concept_id = ${conceptId}`
      : sql`r.target_concept_id = ${conceptId}`;

  return sql`
    select
      r.id,
      r.workspace_id,
      r.source_concept_id,
      r.target_concept_id,
      r.type,
      r.description,
      r.confidence,
      r.source_revision_id,
      r.source_section_id,
      r.created_at,
      r.updated_at,
      sc.slug as source_concept_slug,
      sc.title as source_concept_title,
      sc.type as source_concept_type,
      tc.slug as target_concept_slug,
      tc.title as target_concept_title,
      tc.type as target_concept_type,
      s.id as citation_source_id,
      s.name as citation_source_name,
      ss.heading_path as citation_heading_path,
      ss.start_line as citation_start_line,
      ss.end_line as citation_end_line
    from relationships r
    join concepts sc on sc.id = r.source_concept_id
    join concepts tc on tc.id = r.target_concept_id
    left join source_revisions sr on sr.id = r.source_revision_id
    left join sources s on s.id = sr.source_id
    left join source_sections ss on ss.id = r.source_section_id
    where r.workspace_id = ${workspaceId}
      and ${conceptFilter}
    order by r.type asc, tc.title asc
  `;
}

const relationshipReadRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  source_concept_id: z.string().uuid(),
  target_concept_id: z.string().uuid(),
  type: relationshipTypeSchema,
  description: z.string(),
  confidence: z.coerce.number(),
  source_revision_id: z.string().uuid().nullable(),
  source_section_id: z.string().uuid().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  source_concept_slug: z.string(),
  source_concept_title: z.string(),
  source_concept_type: conceptTypeSchema,
  target_concept_slug: z.string(),
  target_concept_title: z.string(),
  target_concept_type: conceptTypeSchema,
  citation_source_id: z.string().uuid().nullable(),
  citation_source_name: z.string().nullable(),
  citation_heading_path: z.array(z.string()).nullable(),
  citation_start_line: z.number().int().positive().nullable(),
  citation_end_line: z.number().int().positive().nullable()
});

function toRelationshipRecord(row: z.infer<typeof relationshipReadRowSchema>): RelationshipRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceConceptId: row.source_concept_id,
    targetConceptId: row.target_concept_id,
    sourceConcept: {
      id: row.source_concept_id,
      slug: row.source_concept_slug,
      title: row.source_concept_title,
      type: row.source_concept_type
    },
    targetConcept: {
      id: row.target_concept_id,
      slug: row.target_concept_slug,
      title: row.target_concept_title,
      type: row.target_concept_type
    },
    type: row.type,
    description: row.description,
    confidence: clampScore(row.confidence),
    sourceRevisionId: row.source_revision_id,
    sourceSectionId: row.source_section_id,
    citation: toNullableCitation({
      sourceId: row.citation_source_id,
      sourceRevisionId: row.source_revision_id,
      sourceSectionId: row.source_section_id,
      sourceName: row.citation_source_name,
      headingPath: row.citation_heading_path,
      startLine: row.citation_start_line,
      endLine: row.citation_end_line
    }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

const unresolvedRelationshipReadRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  source_concept_id: z.string().uuid(),
  source_concept_slug: z.string(),
  target_concept_slug: z.string(),
  target_title: z.string(),
  type: relationshipTypeSchema,
  description: z.string(),
  confidence: z.coerce.number(),
  source_revision_id: z.string().uuid(),
  source_section_id: z.string().uuid(),
  status: unresolvedRelationshipStatusSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  citation_source_id: z.string().uuid().nullable(),
  citation_source_name: z.string().nullable(),
  citation_heading_path: z.array(z.string()).nullable(),
  citation_start_line: z.number().int().positive().nullable(),
  citation_end_line: z.number().int().positive().nullable()
});

function toUnresolvedRelationshipRecord(
  row: z.infer<typeof unresolvedRelationshipReadRowSchema>
): UnresolvedRelationshipRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceConceptId: row.source_concept_id,
    sourceConceptSlug: row.source_concept_slug,
    targetConceptSlug: row.target_concept_slug,
    targetTitle: row.target_title,
    type: row.type,
    description: row.description,
    confidence: clampScore(row.confidence),
    sourceRevisionId: row.source_revision_id,
    sourceSectionId: row.source_section_id,
    citation: toNullableCitation({
      sourceId: row.citation_source_id,
      sourceRevisionId: row.source_revision_id,
      sourceSectionId: row.source_section_id,
      sourceName: row.citation_source_name,
      headingPath: row.citation_heading_path,
      startLine: row.citation_start_line,
      endLine: row.citation_end_line
    }),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toNullableCitation(input: {
  sourceId: string | null;
  sourceRevisionId: string | null;
  sourceSectionId: string | null;
  sourceName: string | null;
  headingPath: string[] | null;
  startLine: number | null;
  endLine: number | null;
}): SourceCitation | null {
  if (
    !input.sourceId ||
    !input.sourceRevisionId ||
    !input.sourceSectionId ||
    !input.sourceName ||
    !input.headingPath ||
    input.startLine === null ||
    input.endLine === null
  ) {
    return null;
  }

  return {
    sourceId: input.sourceId,
    sourceRevisionId: input.sourceRevisionId,
    sourceSectionId: input.sourceSectionId,
    sourceName: input.sourceName,
    headingPath: input.headingPath,
    startLine: input.startLine,
    endLine: input.endLine
  };
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
