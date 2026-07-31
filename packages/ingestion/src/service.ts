import {
  type IngestMarkdownRequest,
  type IngestMarkdownResponse,
  type Metadata,
  type SourceKind,
  ingestMarkdownRequestSchema,
  sha256Hex
} from "@knowledgeos/shared";
import { normalizeLineEndings, splitMarkdownIntoSections } from "./markdown.js";

export interface IngestionRepository {
  ensureWorkspace(name: string): Promise<{ id: string }>;
  createOrUpdateSource(input: {
    workspaceId: string;
    kind: SourceKind;
    name: string;
    externalUri?: string;
    metadata: Metadata;
  }): Promise<{ id: string }>;
  findSourceRevisionByHash(
    sourceId: string,
    contentHash: string
  ): Promise<{ id: string; sourceId: string } | null>;
  createSourceRevision(input: {
    sourceId: string;
    contentHash: string;
    content: string;
    metadata: Metadata;
  }): Promise<{ id: string }>;
  insertSourceSections(
    inputs: Array<{
      sourceRevisionId: string;
      ordinal: number;
      headingPath: string[];
      title: string;
      body: string;
      startLine: number;
      endLine: number;
      contentHash: string;
    }>
  ): Promise<unknown[]>;
  countSourceSections(sourceRevisionId: string): Promise<number>;
  enqueueJob(input: {
    workspaceId: string;
    type: "extract_concepts_from_source_revision";
    payload: Metadata;
    idempotencyKey: string;
  }): Promise<string>;
}

export interface IngestMarkdownDependencies {
  repository: IngestionRepository;
  defaultWorkspaceName: string;
}

export async function ingestMarkdown(
  rawInput: IngestMarkdownRequest,
  deps: IngestMarkdownDependencies
): Promise<IngestMarkdownResponse> {
  const input = ingestMarkdownRequestSchema.parse(rawInput);
  const workspaceId = input.workspaceId ?? (await deps.repository.ensureWorkspace(deps.defaultWorkspaceName)).id;
  const normalizedContent = normalizeLineEndings(input.content);
  const contentHash = sha256Hex(normalizedContent);

  const source = await deps.repository.createOrUpdateSource({
    workspaceId,
    kind: "markdown",
    name: input.name,
    ...(input.externalUri ? { externalUri: input.externalUri } : {}),
    metadata: input.metadata
  });

  const existingRevision = await deps.repository.findSourceRevisionByHash(source.id, contentHash);
  if (existingRevision) {
    const sectionCount = await deps.repository.countSourceSections(existingRevision.id);
    return {
      sourceId: source.id,
      sourceRevisionId: existingRevision.id,
      changed: false,
      sectionCount,
      extractionJobId: null
    };
  }

  const revision = await deps.repository.createSourceRevision({
    sourceId: source.id,
    contentHash,
    content: normalizedContent,
    metadata: input.metadata
  });

  const sections = splitMarkdownIntoSections(normalizedContent);
  await deps.repository.insertSourceSections(
    sections.map((section) => ({
      sourceRevisionId: revision.id,
      ordinal: section.ordinal,
      headingPath: section.headingPath,
      title: section.title,
      body: section.body,
      startLine: section.startLine,
      endLine: section.endLine,
      contentHash: section.contentHash
    }))
  );

  const extractionJobId = await deps.repository.enqueueJob({
    workspaceId,
    type: "extract_concepts_from_source_revision",
    payload: {
      workspaceId,
      sourceRevisionId: revision.id
    },
    idempotencyKey: `extract:${revision.id}`
  });

  return {
    sourceId: source.id,
    sourceRevisionId: revision.id,
    changed: true,
    sectionCount: sections.length,
    extractionJobId
  };
}

