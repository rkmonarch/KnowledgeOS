import type { ExtractionOutput, NormalizedConcept, SourceSectionForExtraction } from "./schemas.js";

export function normalizeExtraction(section: SourceSectionForExtraction, output: ExtractionOutput): NormalizedConcept[] {
  const conceptsBySlug = new Map<string, NormalizedConcept>();

  for (const concept of output.concepts) {
    const slug = slugify(concept.slug ?? concept.title);
    const existing = conceptsBySlug.get(slug);
    const normalized: NormalizedConcept = {
      slug,
      title: concept.title.trim(),
      summary: concept.summary.trim(),
      body: concept.body.trim(),
      type: concept.type,
      tags: normalizeTags(concept.tags),
      confidence: clampConfidence(concept.confidence),
      owner: concept.owner ? concept.owner.trim() : null,
      status: concept.status,
      sourceSectionId: section.sourceSectionId,
      startLine: section.startLine,
      endLine: section.endLine,
      claims: dedupeBy(
        concept.claims.map((claim) => ({
          text: normalizeWhitespace(claim.text),
          confidence: clampConfidence(claim.confidence),
          status: claim.status,
          sourceSectionId: section.sourceSectionId,
          startLine: clampLine(claim.startLine, section.startLine, section.endLine),
          endLine: clampLine(claim.endLine, section.startLine, section.endLine),
          quote: claim.quote.trim()
        })),
        (claim) => claim.text.toLowerCase()
      ),
      relationships: dedupeBy(
        concept.relationships.map((relationship) => ({
          type: relationship.type,
          targetSlug: slugify(relationship.targetSlug ?? relationship.targetTitle ?? ""),
          confidence: clampConfidence(relationship.confidence)
        })),
        (relationship) => `${relationship.type}:${relationship.targetSlug}`
      ).filter((relationship) => relationship.targetSlug.length > 0)
    };

    if (!existing) {
      conceptsBySlug.set(slug, normalized);
      continue;
    }

    conceptsBySlug.set(slug, mergeConcepts(existing, normalized));
  }

  return [...conceptsBySlug.values()];
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => slugify(tag)).filter((tag) => tag.length > 0))].sort();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampLine(value: number, startLine: number, endLine: number): number {
  return Math.max(startLine, Math.min(endLine, value));
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function mergeConcepts(left: NormalizedConcept, right: NormalizedConcept): NormalizedConcept {
  return {
    ...left,
    summary: right.summary.length > left.summary.length ? right.summary : left.summary,
    body: right.body.length > left.body.length ? right.body : left.body,
    confidence: Math.max(left.confidence, right.confidence),
    tags: normalizeTags([...left.tags, ...right.tags]),
    claims: dedupeBy([...left.claims, ...right.claims], (claim) => claim.text.toLowerCase()),
    relationships: dedupeBy(
      [...left.relationships, ...right.relationships],
      (relationship) => `${relationship.type}:${relationship.targetSlug}`
    )
  };
}

