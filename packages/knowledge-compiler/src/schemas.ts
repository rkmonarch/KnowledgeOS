import { z } from "zod";
import {
  claimStatusSchema,
  conceptStatusSchema,
  conceptTypeSchema,
  type RelationshipType,
  relationshipTypeSchema
} from "@knowledgeos/shared";

const optionalModelStringSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().trim().min(1).optional()
);

export const sourceSectionForExtractionSchema = z
  .object({
    workspaceId: z.string().uuid(),
    sourceId: z.string().uuid(),
    sourceName: z.string(),
    sourceRevisionId: z.string().uuid(),
    sourceSectionId: z.string().uuid(),
    headingPath: z.array(z.string()),
    title: z.string(),
    body: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive()
  })
  .strict();
export type SourceSectionForExtraction = z.infer<typeof sourceSectionForExtractionSchema>;

export const extractedClaimSchema = z
  .object({
    text: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    status: claimStatusSchema.default("active"),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    quote: z.string().trim().min(1)
  })
  .strict();
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;

export const extractedRelationshipSchema = z
  .object({
    type: relationshipTypeSchema,
    targetTitle: optionalModelStringSchema,
    targetSlug: optionalModelStringSchema,
    description: z.string().trim().optional().default(""),
    confidence: z.number().min(0).max(1),
    evidence: z.string().trim().optional()
  })
  .strict()
  .refine((value) => value.targetTitle || value.targetSlug, {
    message: "Relationship must include targetTitle or targetSlug"
  });
export type ExtractedRelationship = z.infer<typeof extractedRelationshipSchema>;

export const extractedConceptSchema = z
  .object({
    slug: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    body: z.string().trim().min(1),
    type: conceptTypeSchema.default("other"),
    tags: z.array(z.string().trim().min(1)).default([]),
    confidence: z.number().min(0).max(1),
    owner: z.string().trim().min(1).nullable().default(null),
    status: conceptStatusSchema.default("active"),
    claims: z.array(extractedClaimSchema).default([]),
    relationships: z.array(extractedRelationshipSchema).default([])
  })
  .strict();
export type ExtractedConcept = z.infer<typeof extractedConceptSchema>;

export const extractionOutputSchema = z
  .object({
    concepts: z.array(extractedConceptSchema).default([])
  })
  .strict();
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

export interface NormalizedClaim {
  text: string;
  confidence: number;
  status: "active" | "superseded" | "disputed" | "archived";
  sourceSectionId: string;
  startLine: number;
  endLine: number;
  quote: string;
}

export interface NormalizedRelationship {
  type: RelationshipType;
  targetSlug: string;
  targetTitle: string;
  description: string;
  confidence: number;
}

export interface NormalizedConcept {
  slug: string;
  title: string;
  summary: string;
  body: string;
  type: "system" | "component" | "api" | "process" | "policy" | "decision" | "person" | "team" | "term" | "other";
  tags: string[];
  confidence: number;
  owner: string | null;
  status: "draft" | "active" | "stale" | "archived";
  sourceSectionId: string;
  startLine: number;
  endLine: number;
  claims: NormalizedClaim[];
  relationships: NormalizedRelationship[];
}

export interface CompiledExtraction {
  workspaceId: string;
  sourceRevisionId: string;
  concepts: NormalizedConcept[];
}
