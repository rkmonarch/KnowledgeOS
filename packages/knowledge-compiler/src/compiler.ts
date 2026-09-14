import { ValidationBoundaryError, type Logger, noopLogger } from "@knowledgeos/shared";
import { buildExtractionPrompt, extractionSystemPrompt } from "./prompt.js";
import type { JsonLlmProvider } from "./providers.js";
import {
  type CompiledExtraction,
  type SourceSectionForExtraction,
  extractionOutputSchema,
  sourceSectionForExtractionSchema
} from "./schemas.js";
import { normalizeExtraction } from "./normalize.js";

export interface CompileSourceRevisionInput {
  workspaceId: string;
  sourceId: string;
  sourceName: string;
  sourceRevisionId: string;
  sections: SourceSectionForExtraction[];
}

export interface KnowledgeCompilerDependencies {
  llm: JsonLlmProvider;
  logger?: Logger;
}

export async function extractKnowledgeFromSection(
  rawSection: SourceSectionForExtraction,
  deps: KnowledgeCompilerDependencies
) {
  const section = sourceSectionForExtractionSchema.parse(rawSection);
  const rawOutput = await deps.llm.generateJson({
    system: extractionSystemPrompt,
    prompt: buildExtractionPrompt(section)
  });

  const parsed = extractionOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw new ValidationBoundaryError(
      `LLM extraction output failed schema validation: ${formatFirstSchemaIssue(parsed.error)}`,
      parsed.error.flatten()
    );
  }

  return normalizeExtraction(section, parsed.data);
}

function formatFirstSchemaIssue(error: { issues: Array<{ path: Array<string | number>; message: string }> }): string {
  const issue = error.issues[0];
  if (!issue) {
    return "unknown schema mismatch";
  }

  const path = issue.path.length > 0 ? issue.path.join(".") : "root";
  return `${path} ${issue.message}`;
}

export async function compileSourceRevision(
  input: CompileSourceRevisionInput,
  deps: KnowledgeCompilerDependencies
): Promise<CompiledExtraction> {
  const logger = deps.logger ?? noopLogger;
  const concepts = [];

  for (const section of input.sections) {
    if (section.body.trim().length === 0) {
      continue;
    }

    logger.info("Extracting knowledge from source section", {
      sourceRevisionId: input.sourceRevisionId,
      sourceSectionId: section.sourceSectionId,
      llmProvider: deps.llm.name
    });

    const sectionConcepts = await extractKnowledgeFromSection(section, deps);
    concepts.push(...sectionConcepts);
  }

  return {
    workspaceId: input.workspaceId,
    sourceRevisionId: input.sourceRevisionId,
    concepts
  };
}
