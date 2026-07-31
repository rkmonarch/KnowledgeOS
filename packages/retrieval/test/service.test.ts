import { describe, expect, it } from "vitest";
import type { ClaimRecord, ConceptRecord, EmbeddableEntityType } from "@knowledgeos/shared";
import { DeterministicEmbeddingProvider } from "../src/providers.js";
import { embedEntity, searchKnowledge, type RetrievalRepository } from "../src/service.js";

const now = new Date().toISOString();

class MemoryRetrievalRepository implements RetrievalRepository {
  embeddings = new Map<string, number[]>();

  async getEmbeddableEntity(input: { workspaceId: string; entityType: EmbeddableEntityType; entityId: string }) {
    return {
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      text: "Authentication OAuth backend security"
    };
  }

  async upsertEmbedding(input: {
    workspaceId: string;
    entityType: EmbeddableEntityType;
    entityId: string;
    model: string;
    dimensions: number;
    embedding: number[];
    contentHash: string;
  }): Promise<void> {
    this.embeddings.set(`${input.entityType}:${input.entityId}:${input.model}`, input.embedding);
  }

  async semanticSearch(): Promise<
    Array<{
      concept: ConceptRecord;
      claims: ClaimRecord[];
      vectorScore: number;
      citations: ConceptRecord["citations"];
    }>
  > {
    const citation = {
      sourceId: "00000000-0000-4000-8000-000000000002",
      sourceRevisionId: "00000000-0000-4000-8000-000000000003",
      sourceSectionId: "00000000-0000-4000-8000-000000000004",
      sourceName: "Architecture.md",
      headingPath: ["Authentication"],
      startLine: 1,
      endLine: 3
    };
    const concept: ConceptRecord = {
      id: "00000000-0000-4000-8000-000000000005",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      slug: "authentication",
      title: "Authentication",
      summary: "Authentication summary",
      body: "Authentication body",
      type: "system",
      tags: ["security"],
      confidence: 0.8,
      owner: null,
      status: "active",
      citations: [citation],
      createdAt: now,
      updatedAt: now,
      verifiedAt: null
    };
    return [
      {
        concept,
        claims: [],
        vectorScore: 0.8,
        citations: concept.citations
      }
    ];
  }
}

describe("retrieval service", () => {
  it("embeds an entity through the injected provider", async () => {
    const repository = new MemoryRetrievalRepository();
    const embeddings = new DeterministicEmbeddingProvider({ dimensions: 8 });

    await embedEntity(
      {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        entityType: "concept",
        entityId: "00000000-0000-4000-8000-000000000005"
      },
      { repository, embeddings }
    );

    expect(repository.embeddings.size).toBe(1);
  });

  it("returns scored results with explanations", async () => {
    const response = await searchKnowledge(
      {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        query: "How does authentication work?",
        limit: 5,
        filters: {}
      },
      {
        repository: new MemoryRetrievalRepository(),
        embeddings: new DeterministicEmbeddingProvider({ dimensions: 8 })
      }
    );

    expect(response.results[0]?.concept.slug).toBe("authentication");
    expect(response.results[0]?.explanation.reasons[0]).toContain("semantic match");
  });
});

