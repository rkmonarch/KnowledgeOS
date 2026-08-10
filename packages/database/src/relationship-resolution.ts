import type { RelationshipType } from "@knowledgeos/shared";

export interface RelationshipResolutionInput {
  type: RelationshipType;
  targetSlug: string;
  targetTitle: string;
  description: string;
  confidence: number;
}

export interface RelationshipResolutionConcept {
  id: string;
  slug: string;
  sourceSectionId: string;
  relationships: RelationshipResolutionInput[];
}

export interface ResolvedRelationshipDraft {
  sourceConceptId: string;
  sourceConceptSlug: string;
  targetConceptId: string;
  targetConceptSlug: string;
  targetTitle: string;
  type: RelationshipType;
  description: string;
  confidence: number;
  sourceSectionId: string;
}

export interface PendingRelationshipDraft {
  sourceConceptId: string;
  sourceConceptSlug: string;
  targetConceptSlug: string;
  targetTitle: string;
  type: RelationshipType;
  description: string;
  confidence: number;
  sourceSectionId: string;
}

export interface RelationshipResolutionResult {
  resolved: ResolvedRelationshipDraft[];
  pending: PendingRelationshipDraft[];
}

export function resolveRelationshipDrafts(input: {
  concepts: RelationshipResolutionConcept[];
  existingConceptIdsBySlug: ReadonlyMap<string, string>;
}): RelationshipResolutionResult {
  const currentConceptIdsBySlug = new Map(input.concepts.map((concept) => [concept.slug, concept.id]));
  const resolved = new Map<string, ResolvedRelationshipDraft>();
  const pending = new Map<string, PendingRelationshipDraft>();

  for (const concept of input.concepts) {
    for (const relationship of concept.relationships) {
      const targetConceptId =
        currentConceptIdsBySlug.get(relationship.targetSlug) ?? input.existingConceptIdsBySlug.get(relationship.targetSlug);

      if (targetConceptId === concept.id) {
        continue;
      }

      if (!targetConceptId) {
        const draft: PendingRelationshipDraft = {
          sourceConceptId: concept.id,
          sourceConceptSlug: concept.slug,
          targetConceptSlug: relationship.targetSlug,
          targetTitle: relationship.targetTitle,
          type: relationship.type,
          description: relationship.description,
          confidence: relationship.confidence,
          sourceSectionId: concept.sourceSectionId
        };
        upsertPreferred(pending, `${draft.sourceConceptId}:${draft.targetConceptSlug}:${draft.type}`, draft);
        continue;
      }

      const draft: ResolvedRelationshipDraft = {
        sourceConceptId: concept.id,
        sourceConceptSlug: concept.slug,
        targetConceptId,
        targetConceptSlug: relationship.targetSlug,
        targetTitle: relationship.targetTitle,
        type: relationship.type,
        description: relationship.description,
        confidence: relationship.confidence,
        sourceSectionId: concept.sourceSectionId
      };
      upsertPreferred(resolved, `${draft.sourceConceptId}:${draft.targetConceptId}:${draft.type}`, draft);
    }
  }

  return {
    resolved: [...resolved.values()],
    pending: [...pending.values()]
  };
}

function upsertPreferred<T extends { confidence: number; description: string }>(
  records: Map<string, T>,
  key: string,
  candidate: T
): void {
  const existing = records.get(key);
  if (!existing || candidate.confidence > existing.confidence) {
    records.set(key, candidate);
    return;
  }

  if (candidate.confidence === existing.confidence && candidate.description.length > existing.description.length) {
    records.set(key, candidate);
  }
}
