import { describe, expect, it } from "vitest";
import type { Metadata } from "@knowledgeos/shared";
import { ingestMarkdown, type IngestionRepository } from "../src/service.js";

class MemoryIngestionRepository implements IngestionRepository {
  readonly workspace = { id: "00000000-0000-4000-8000-000000000001" };
  readonly source = { id: "00000000-0000-4000-8000-000000000002" };
  readonly revisions = new Map<string, { id: string; sourceId: string; contentHash: string }>();
  readonly sectionsByRevision = new Map<string, unknown[]>();
  readonly jobs: string[] = [];

  async ensureWorkspace(): Promise<{ id: string }> {
    return this.workspace;
  }

  async createOrUpdateSource(): Promise<{ id: string }> {
    return this.source;
  }

  async findSourceRevisionByHash(sourceId: string, contentHash: string) {
    return this.revisions.get(`${sourceId}:${contentHash}`) ?? null;
  }

  async createSourceRevision(input: { sourceId: string; contentHash: string; content: string; metadata: Metadata }) {
    const revision = {
      id: "00000000-0000-4000-8000-000000000003",
      sourceId: input.sourceId,
      contentHash: input.contentHash
    };
    this.revisions.set(`${input.sourceId}:${input.contentHash}`, revision);
    return revision;
  }

  async insertSourceSections(inputs: unknown[]): Promise<unknown[]> {
    this.sectionsByRevision.set("00000000-0000-4000-8000-000000000003", inputs);
    return inputs;
  }

  async countSourceSections(sourceRevisionId: string): Promise<number> {
    return this.sectionsByRevision.get(sourceRevisionId)?.length ?? 0;
  }

  async enqueueJob(): Promise<string> {
    const jobId = "00000000-0000-4000-8000-000000000004";
    this.jobs.push(jobId);
    return jobId;
  }
}

describe("ingestMarkdown", () => {
  it("stores a new revision and enqueues extraction once", async () => {
    const repository = new MemoryIngestionRepository();

    const first = await ingestMarkdown(
      {
        name: "Architecture.md",
        content: "# Authentication\n\nOAuth is used.",
        metadata: {}
      },
      { repository, defaultWorkspaceName: "Default" }
    );

    const second = await ingestMarkdown(
      {
        name: "Architecture.md",
        content: "# Authentication\r\n\r\nOAuth is used.",
        metadata: {}
      },
      { repository, defaultWorkspaceName: "Default" }
    );

    expect(first.changed).toBe(true);
    expect(first.sectionCount).toBe(1);
    expect(first.extractionJobId).toBe("00000000-0000-4000-8000-000000000004");
    expect(second.changed).toBe(false);
    expect(second.extractionJobId).toBeNull();
    expect(repository.jobs).toHaveLength(1);
  });
});

