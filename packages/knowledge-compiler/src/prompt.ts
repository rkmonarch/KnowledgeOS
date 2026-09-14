import type { SourceSectionForExtraction } from "./schemas.js";

export const extractionSystemPrompt = [
  "You extract structured organisational knowledge for KnowledgeOS.",
  "Return only valid JSON. Do not include markdown fences or commentary.",
  "Every claim must be supported by the supplied source section.",
  "Every relationship must be supported by the supplied source section.",
  "Do not invent relationship types; use only the relationship type strings shown in outputShape.",
  "Use absolute source line numbers from the input metadata.",
  "Use realistic confidence scores between 0.6 and 0.95 for clear source-backed knowledge.",
  "Omit optional fields instead of setting them to null.",
  "Prefer stable concept titles and kebab-case slugs for relationship targets.",
  "If the section does not contain durable knowledge, return an empty concepts array."
].join("\n");

export function buildExtractionPrompt(section: SourceSectionForExtraction): string {
  return JSON.stringify(
    {
      task: "Extract concepts, claims, and relationships from this source section.",
      outputShape: {
        concepts: [
          {
            slug: "optional-kebab-case-stable-id",
            title: "Concept title",
            summary: "One or two sentence summary",
            body: "Durable explanatory body grounded in the section",
            type: "system | component | api | process | policy | decision | person | team | term | other",
            tags: ["short", "normalized", "tags"],
            confidence: 0.85,
            owner: null,
            status: "active",
            claims: [
              {
                text: "Factual statement",
                confidence: 0.85,
                status: "active",
                startLine: section.startLine,
                endLine: section.endLine,
                quote: "Exact short supporting quote from the source"
              }
            ],
            relationships: [
              {
                type: "depends_on | used_by | uses | implements | part_of | related_to | replaces | contradicts | requires | produces | affects | mitigates | signed_by | owned_by | documented_in",
                targetTitle: "Related concept title",
                targetSlug: "optional-related-concept-slug",
                description: "Short explanation of the relationship grounded in the source",
                confidence: 0.8,
                evidence: "Short source-backed evidence"
              }
            ]
          }
        ]
      },
      source: {
        sourceId: section.sourceId,
        sourceName: section.sourceName,
        sourceRevisionId: section.sourceRevisionId,
        sourceSectionId: section.sourceSectionId,
        headingPath: section.headingPath,
        title: section.title,
        startLine: section.startLine,
        endLine: section.endLine,
        body: section.body
      }
    },
    null,
    2
  );
}
