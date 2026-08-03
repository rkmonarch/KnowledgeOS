import { describe, expect, it } from "vitest";
import type {
  EnqueueJobInput,
  EmbeddableEntity,
  PersistExtractionInput,
  PersistExtractionResult,
  SemanticSearchHit,
  SemanticSearchInput,
  SourceRevisionWithSections,
  SourceSectionForExtractionRecord,
  UpsertEmbeddingInput
} from "@knowledgeos/database";
import type { JobType, Metadata } from "@knowledgeos/shared";
import type { JsonLlmProvider } from "@knowledgeos/knowledge-compiler";
import type { EmbeddingProvider } from "@knowledgeos/retrieval";
import { runWorkerOnce, type WorkerOptions } from "../src/worker.js";

type TestRepository = WorkerOptions["repository"];

const workspaceId = "00000000-0000-4000-8000-000000000001";
const sourceId = "00000000-0000-4000-8000-000000000002";
const sourceRevisionId = "00000000-0000-4000-8000-000000000003";
const sourceSectionId = "00000000-0000-4000-8000-000000000004";

class MemoryWorkerRepository implements TestRepository {
  readonly enqueuedJobs: EnqueueJobInput[] = [];
  readonly completedJobs: string[] = [];
  readonly failedJobs: Array<{ jobId: string; message: string }> = [];
  readonly persistedExtractions: PersistExtractionInput[] = [];

  constructor(
    private readonly jobs: Array<{
      id: string;
      workspaceId: string;
      type: JobType;
      payload: Metadata;
      attempts: number;
      maxAttempts: number;
    }>,
    private readonly revision: SourceRevisionWithSections,
    private readonly section: SourceSectionForExtractionRecord
  ) {}

  async claimNextJob(types: JobType[]) {
    const index = this.jobs.findIndex((job) => types.includes(job.type));
    const [job] = index >= 0 ? this.jobs.splice(index, 1) : [];
    if (!job) {
      return null;
    }

    return {
      ...job,
      status: "running" as const,
      attempts: job.attempts + 1
    };
  }

  async completeJob(jobId: string): Promise<void> {
    this.completedJobs.push(jobId);
  }

  async enqueueJob(input: EnqueueJobInput): Promise<string> {
    this.enqueuedJobs.push(input);
    return `00000000-0000-4000-8000-${String(this.enqueuedJobs.length).padStart(12, "0")}`;
  }

  async failJob(jobId: string, message: string): Promise<void> {
    this.failedJobs.push({ jobId, message });
  }

  async getSourceRevisionWithSections(): Promise<SourceRevisionWithSections> {
    return this.revision;
  }

  async getSourceSectionForExtraction(): Promise<SourceSectionForExtractionRecord> {
    return this.section;
  }

  async persistExtraction(input: PersistExtractionInput): Promise<PersistExtractionResult> {
    this.persistedExtractions.push(input);
    return {
      conceptIds: ["00000000-0000-4000-8000-000000000101"],
      claimIds: ["00000000-0000-4000-8000-000000000102"]
    };
  }

  async getEmbeddableEntity(): Promise<EmbeddableEntity> {
    return {
      workspaceId,
      entityType: "concept",
      entityId: "00000000-0000-4000-8000-000000000101",
      text: "Energy Grid"
    };
  }

  async upsertEmbedding(_input: UpsertEmbeddingInput): Promise<void> {}

  async semanticSearch(_input: SemanticSearchInput): Promise<SemanticSearchHit[]> {
    return [];
  }
}

class StaticLlmProvider implements JsonLlmProvider {
  readonly name = "static";

  async generateJson() {
    return {
      concepts: [
        {
          title: "Energy Grid",
          summary: "The energy grid supplies electricity to city services.",
          body: "The energy grid supplies electricity to every critical service.",
          type: "system",
          tags: ["energy", "city"],
          confidence: 0.88,
          owner: null,
          status: "active",
          claims: [
            {
              text: "The energy grid supplies electricity to every critical service.",
              confidence: 0.9,
              status: "active",
              startLine: 40,
              endLine: 40,
              quote: "The energy grid supplies electricity to every critical service."
            }
          ],
          relationships: []
        }
      ]
    };
  }
}

class NoopEmbeddingProvider implements EmbeddingProvider {
  readonly name = "noop";
  readonly model = "noop";
  readonly dimensions = 3;

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0, 0]);
  }
}

describe("runWorkerOnce", () => {
  it("turns revision extraction jobs into one job per non-empty source section", async () => {
    const repository = new MemoryWorkerRepository(
      [
        {
          id: "00000000-0000-4000-8000-000000000201",
          workspaceId,
          type: "extract_concepts_from_source_revision",
          payload: { workspaceId, sourceRevisionId },
          attempts: 0,
          maxAttempts: 3
        }
      ],
      buildRevision([
        { id: sourceSectionId, title: "Energy Grid", body: "The grid supplies power." },
        { id: "00000000-0000-4000-8000-000000000005", title: "Glossary", body: "" }
      ]),
      buildSection()
    );

    await runWorkerOnce({
      repository,
      llmProvider: new StaticLlmProvider(),
      embeddingProvider: new NoopEmbeddingProvider(),
      workerId: "test-worker"
    });

    expect(repository.enqueuedJobs).toHaveLength(1);
    expect(repository.enqueuedJobs[0]).toMatchObject({
      type: "extract_concepts_from_source_section",
      idempotencyKey: `extract:section:${sourceSectionId}`,
      maxAttempts: 5
    });
    expect(repository.completedJobs).toEqual(["00000000-0000-4000-8000-000000000201"]);
    expect(repository.failedJobs).toHaveLength(0);
  });

  it("persists one source section independently and queues embeddings", async () => {
    const repository = new MemoryWorkerRepository(
      [
        {
          id: "00000000-0000-4000-8000-000000000202",
          workspaceId,
          type: "extract_concepts_from_source_section",
          payload: { workspaceId, sourceRevisionId, sourceSectionId },
          attempts: 0,
          maxAttempts: 5
        }
      ],
      buildRevision([]),
      buildSection()
    );

    await runWorkerOnce({
      repository,
      llmProvider: new StaticLlmProvider(),
      embeddingProvider: new NoopEmbeddingProvider(),
      workerId: "test-worker"
    });

    expect(repository.persistedExtractions).toHaveLength(1);
    expect(repository.persistedExtractions[0]?.concepts[0]).toMatchObject({
      slug: "energy-grid",
      sourceSectionId
    });
    expect(repository.enqueuedJobs.map((job) => job.type)).toEqual(["embed_concept", "embed_claim"]);
    expect(repository.completedJobs).toEqual(["00000000-0000-4000-8000-000000000202"]);
    expect(repository.failedJobs).toHaveLength(0);
  });
});

function buildRevision(
  sections: Array<{ id: string; title: string; body: string }>
): SourceRevisionWithSections {
  return {
    revision: {
      id: sourceRevisionId,
      sourceId,
      content: "",
      contentHash: "hash",
      createdAt: new Date("2026-08-03T00:00:00.000Z")
    },
    source: {
      id: sourceId,
      workspaceId,
      name: "city.md",
      kind: "markdown"
    },
    sections: sections.map((section, index) => ({
      id: section.id,
      ordinal: index,
      headingPath: [section.title],
      title: section.title,
      body: section.body,
      startLine: index + 1,
      endLine: index + 1,
      contentHash: `hash-${index}`
    }))
  };
}

function buildSection(): SourceSectionForExtractionRecord {
  return {
    workspaceId,
    sourceId,
    sourceName: "city.md",
    sourceRevisionId,
    sourceSectionId,
    headingPath: ["Energy Grid"],
    title: "Energy Grid",
    body: "The energy grid supplies electricity to every critical service.",
    startLine: 40,
    endLine: 40
  };
}
