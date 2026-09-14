import { z } from "zod";

export const metadataSchema = z.record(z.unknown());
export type Metadata = z.infer<typeof metadataSchema>;

export const nonEmptyStringSchema = z.string().trim().min(1);

export const sourceKindSchema = z.enum(["markdown", "text"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const conceptTypeSchema = z.enum([
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
export type ConceptType = z.infer<typeof conceptTypeSchema>;

export const conceptStatusSchema = z.enum(["draft", "active", "stale", "archived"]);
export type ConceptStatus = z.infer<typeof conceptStatusSchema>;

export const claimStatusSchema = z.enum(["active", "superseded", "disputed", "archived"]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const relationshipTypeSchema = z.enum([
  "depends_on",
  "used_by",
  "uses",
  "implements",
  "part_of",
  "related_to",
  "replaces",
  "contradicts",
  "requires",
  "produces",
  "affects",
  "mitigates",
  "signed_by",
  "owned_by",
  "documented_in"
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const jobTypeSchema = z.enum([
  "extract_concepts_from_source_revision",
  "extract_concepts_from_source_section",
  "embed_concept",
  "embed_claim"
]);
export type JobType = z.infer<typeof jobTypeSchema>;

export const jobStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  runAfter: z.string().datetime(),
  lockedAt: z.string().datetime().nullable(),
  lockedBy: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type JobRecord = z.infer<typeof jobRecordSchema>;

export const embeddableEntityTypeSchema = z.enum(["concept", "claim"]);
export type EmbeddableEntityType = z.infer<typeof embeddableEntityTypeSchema>;

export const sourceCitationSchema = z.object({
  sourceId: z.string().uuid(),
  sourceRevisionId: z.string().uuid(),
  sourceSectionId: z.string().uuid(),
  sourceName: z.string(),
  headingPath: z.array(z.string()),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  quote: z.string().optional()
});
export type SourceCitation = z.infer<typeof sourceCitationSchema>;

export const claimRecordSchema = z.object({
  id: z.string().uuid(),
  conceptId: z.string().uuid(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  status: claimStatusSchema,
  citations: z.array(sourceCitationSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ClaimRecord = z.infer<typeof claimRecordSchema>;

export const conceptRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  type: conceptTypeSchema,
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  owner: z.string().nullable(),
  status: conceptStatusSchema,
  citations: z.array(sourceCitationSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable()
});
export type ConceptRecord = z.infer<typeof conceptRecordSchema>;

export const conceptReferenceSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  type: conceptTypeSchema
});
export type ConceptReference = z.infer<typeof conceptReferenceSchema>;

export const relationshipRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceConceptId: z.string().uuid(),
  targetConceptId: z.string().uuid(),
  sourceConcept: conceptReferenceSchema,
  targetConcept: conceptReferenceSchema,
  type: relationshipTypeSchema,
  description: z.string(),
  confidence: z.number().min(0).max(1),
  sourceRevisionId: z.string().uuid().nullable(),
  sourceSectionId: z.string().uuid().nullable(),
  citation: sourceCitationSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type RelationshipRecord = z.infer<typeof relationshipRecordSchema>;

export const unresolvedRelationshipStatusSchema = z.enum(["pending", "resolved", "ignored"]);
export type UnresolvedRelationshipStatus = z.infer<typeof unresolvedRelationshipStatusSchema>;

export const unresolvedRelationshipRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceConceptId: z.string().uuid(),
  sourceConceptSlug: z.string(),
  targetConceptSlug: z.string(),
  targetTitle: z.string(),
  type: relationshipTypeSchema,
  description: z.string(),
  confidence: z.number().min(0).max(1),
  sourceRevisionId: z.string().uuid(),
  sourceSectionId: z.string().uuid(),
  citation: sourceCitationSchema.nullable(),
  status: unresolvedRelationshipStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type UnresolvedRelationshipRecord = z.infer<typeof unresolvedRelationshipRecordSchema>;

export const conceptRelationshipsSchema = z.object({
  incoming: z.array(relationshipRecordSchema),
  outgoing: z.array(relationshipRecordSchema),
  unresolved: z.array(unresolvedRelationshipRecordSchema)
});
export type ConceptRelationships = z.infer<typeof conceptRelationshipsSchema>;

export const graphNodeRoleSchema = z.enum(["selected", "incoming", "outgoing", "both", "expanded"]);
export type GraphNodeRole = z.infer<typeof graphNodeRoleSchema>;

export const graphNodeSchema = z.object({
  id: z.string().uuid(),
  concept: conceptReferenceSchema,
  distance: z.number().int().nonnegative(),
  role: graphNodeRoleSchema,
  relationshipCount: z.number().int().nonnegative()
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string().uuid(),
  sourceConceptId: z.string().uuid(),
  targetConceptId: z.string().uuid(),
  type: relationshipTypeSchema,
  label: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  citation: sourceCitationSchema.nullable()
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphNeighborhoodResponseSchema = z.object({
  workspaceId: z.string().uuid(),
  selectedConceptId: z.string().uuid(),
  depth: z.number().int().positive(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema)
});
export type GraphNeighborhoodResponse = z.infer<typeof graphNeighborhoodResponseSchema>;

export const retrievalExplanationSchema = z.object({
  vectorScore: z.number().min(0).max(1),
  keywordScore: z.number().min(0).max(1),
  graphScore: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  reasons: z.array(z.string())
});
export type RetrievalExplanation = z.infer<typeof retrievalExplanationSchema>;

export const retrievalResultSchema = z.object({
  concept: conceptRecordSchema,
  claims: z.array(claimRecordSchema),
  score: z.number().min(0).max(1),
  explanation: retrievalExplanationSchema,
  citations: z.array(sourceCitationSchema)
});
export type RetrievalResult = z.infer<typeof retrievalResultSchema>;

export const ingestMarkdownRequestSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: nonEmptyStringSchema,
  content: z.string().min(1),
  externalUri: z.string().url().optional(),
  metadata: metadataSchema.default({})
});
export type IngestMarkdownRequest = z.infer<typeof ingestMarkdownRequestSchema>;

export const ingestMarkdownResponseSchema = z.object({
  sourceId: z.string().uuid(),
  sourceRevisionId: z.string().uuid(),
  changed: z.boolean(),
  sectionCount: z.number().int().nonnegative(),
  extractionJobId: z.string().uuid().nullable()
});
export type IngestMarkdownResponse = z.infer<typeof ingestMarkdownResponseSchema>;

export const searchRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  query: nonEmptyStringSchema,
  limit: z.number().int().positive().max(50).default(10),
  filters: z
    .object({
      sourceIds: z.array(z.string().uuid()).optional(),
      conceptTypes: z.array(conceptTypeSchema).optional(),
      tags: z.array(z.string()).optional()
    })
    .default({})
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(retrievalResultSchema)
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const listConceptsResponseSchema = z.object({
  concepts: z.array(conceptRecordSchema)
});
export type ListConceptsResponse = z.infer<typeof listConceptsResponseSchema>;

export const conceptDetailResponseSchema = z.object({
  concept: conceptRecordSchema,
  claims: z.array(claimRecordSchema),
  relationships: conceptRelationshipsSchema
});
export type ConceptDetailResponse = z.infer<typeof conceptDetailResponseSchema>;

export const listJobsResponseSchema = z.object({
  jobs: z.array(jobRecordSchema)
});
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;

export const retryJobRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  jobId: z.string().uuid()
});
export type RetryJobRequest = z.infer<typeof retryJobRequestSchema>;

export const retryJobResponseSchema = z.object({
  jobId: z.string().uuid()
});
export type RetryJobResponse = z.infer<typeof retryJobResponseSchema>;

export const workspaceRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export const defaultWorkspaceResponseSchema = z.object({
  workspace: workspaceRecordSchema
});
export type DefaultWorkspaceResponse = z.infer<typeof defaultWorkspaceResponseSchema>;

export const extractionJobPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  sourceRevisionId: z.string().uuid()
});
export type ExtractionJobPayload = z.infer<typeof extractionJobPayloadSchema>;

export const sourceSectionExtractionJobPayloadSchema = extractionJobPayloadSchema.extend({
  sourceSectionId: z.string().uuid()
});
export type SourceSectionExtractionJobPayload = z.infer<typeof sourceSectionExtractionJobPayloadSchema>;

export const embeddingJobPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  entityType: embeddableEntityTypeSchema,
  entityId: z.string().uuid()
});
export type EmbeddingJobPayload = z.infer<typeof embeddingJobPayloadSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
