import {
  type ClaimRecord,
  type ConceptRecord,
  type ConceptType,
  type EmbeddableEntityType,
  type RetrievalExplanation,
  type SearchRequest,
  type SearchResponse,
  searchRequestSchema,
  sha256Hex
} from "@knowledgeos/shared";
import type { EmbeddingProvider } from "./providers.js";

export interface RetrievalRepository {
  getEmbeddableEntity(input: {
    workspaceId: string;
    entityType: EmbeddableEntityType;
    entityId: string;
  }): Promise<{
    workspaceId: string;
    entityType: EmbeddableEntityType;
    entityId: string;
    text: string;
  }>;
  upsertEmbedding(input: {
    workspaceId: string;
    entityType: EmbeddableEntityType;
    entityId: string;
    model: string;
    dimensions: number;
    embedding: number[];
    contentHash: string;
  }): Promise<void>;
  semanticSearch(input: {
    workspaceId: string;
    embedding: number[];
    limit: number;
    model: string;
    filters?: {
      sourceIds?: string[];
      conceptTypes?: ConceptType[];
      tags?: string[];
    };
  }): Promise<
    Array<{
      concept: ConceptRecord;
      claims: ClaimRecord[];
      vectorScore: number;
      citations: ConceptRecord["citations"];
    }>
  >;
}

export interface RetrievalDependencies {
  repository: RetrievalRepository;
  embeddings: EmbeddingProvider;
  weights?: RetrievalWeights;
}

export interface RetrievalWeights {
  vector: number;
  keyword: number;
  graph: number;
  freshness: number;
}

export const defaultRetrievalWeights: RetrievalWeights = {
  vector: 0.9,
  keyword: 0,
  graph: 0,
  freshness: 0.1
};

export async function embedEntity(
  input: {
    workspaceId: string;
    entityType: EmbeddableEntityType;
    entityId: string;
  },
  deps: RetrievalDependencies
): Promise<void> {
  const entity = await deps.repository.getEmbeddableEntity(input);
  const [embedding] = await deps.embeddings.embedTexts([entity.text]);
  if (!embedding) {
    throw new Error("Embedding provider returned no vector");
  }

  await deps.repository.upsertEmbedding({
    workspaceId: entity.workspaceId,
    entityType: entity.entityType,
    entityId: entity.entityId,
    model: deps.embeddings.model,
    dimensions: deps.embeddings.dimensions,
    embedding,
    contentHash: sha256Hex(entity.text)
  });
}

export async function searchKnowledge(rawInput: SearchRequest, deps: RetrievalDependencies): Promise<SearchResponse> {
  const input = searchRequestSchema.parse(rawInput);
  const [queryEmbedding] = await deps.embeddings.embedTexts([input.query]);
  if (!queryEmbedding) {
    throw new Error("Embedding provider returned no query vector");
  }

  const filters = normalizeSearchFilters(input.filters);
  const hits = await deps.repository.semanticSearch({
    workspaceId: input.workspaceId,
    embedding: queryEmbedding,
    limit: input.limit,
    model: deps.embeddings.model,
    ...(filters ? { filters } : {})
  });

  const weights = normalizeWeights(deps.weights ?? defaultRetrievalWeights);

  return {
    query: input.query,
    results: hits.map((hit) => {
      const freshnessScore = freshnessFromIsoDate(hit.concept.updatedAt);
      const explanation = buildExplanation({
        vectorScore: hit.vectorScore,
        keywordScore: 0,
        graphScore: 0,
        freshnessScore,
        weights
      });

      return {
        concept: hit.concept,
        claims: hit.claims,
        score: explanation.finalScore,
        explanation,
        citations: hit.citations
      };
    })
  };
}

function buildExplanation(input: {
  vectorScore: number;
  keywordScore: number;
  graphScore: number;
  freshnessScore: number;
  weights: RetrievalWeights;
}): RetrievalExplanation {
  const finalScore =
    input.vectorScore * input.weights.vector +
    input.keywordScore * input.weights.keyword +
    input.graphScore * input.weights.graph +
    input.freshnessScore * input.weights.freshness;

  return {
    vectorScore: roundScore(input.vectorScore),
    keywordScore: roundScore(input.keywordScore),
    graphScore: roundScore(input.graphScore),
    freshnessScore: roundScore(input.freshnessScore),
    finalScore: roundScore(finalScore),
    reasons: [
      `semantic match contributed ${roundScore(input.vectorScore * input.weights.vector)}`,
      `freshness contributed ${roundScore(input.freshnessScore * input.weights.freshness)}`
    ]
  };
}

function normalizeWeights(weights: RetrievalWeights): RetrievalWeights {
  const total = weights.vector + weights.keyword + weights.graph + weights.freshness;
  if (total <= 0) {
    return defaultRetrievalWeights;
  }
  return {
    vector: weights.vector / total,
    keyword: weights.keyword / total,
    graph: weights.graph / total,
    freshness: weights.freshness / total
  };
}

function normalizeSearchFilters(filters: SearchRequest["filters"]):
  | {
      sourceIds?: string[];
      conceptTypes?: ConceptType[];
      tags?: string[];
    }
  | undefined {
  const normalized = {
    ...(filters.sourceIds && filters.sourceIds.length > 0 ? { sourceIds: filters.sourceIds } : {}),
    ...(filters.conceptTypes && filters.conceptTypes.length > 0 ? { conceptTypes: filters.conceptTypes } : {}),
    ...(filters.tags && filters.tags.length > 0 ? { tags: filters.tags } : {})
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function freshnessFromIsoDate(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 0.5;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.max(0, Math.min(1, 1 - ageDays / 365));
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}
