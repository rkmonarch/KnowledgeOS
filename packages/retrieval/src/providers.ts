import { z } from "zod";
import { type KnowledgeOSEnv, ExternalProviderError, sha256Hex } from "@knowledgeos/shared";

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "deterministic";
  readonly model: string;
  readonly dimensions: number;

  constructor(options: { dimensions: number; model?: string }) {
    this.dimensions = options.dimensions;
    this.model = options.model ?? `deterministic-${options.dimensions}`;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map((text) => deterministicEmbedding(text, this.dimensions));
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions: number;

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      dimensions: number;
    }
  ) {
    this.model = options.model;
    this.dimensions = options.dimensions;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        input: texts,
        dimensions: this.options.dimensions
      })
    });

    if (!response.ok) {
      throw new ExternalProviderError("OpenAI embedding request failed", {
        status: response.status,
        body: await response.text()
      });
    }

    const parsed = openAIEmbeddingResponseSchema.parse(await response.json());
    const embeddings = parsed.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    if (embeddings.length !== texts.length) {
      throw new ExternalProviderError("OpenAI embedding response count did not match request", {
        expected: texts.length,
        actual: embeddings.length
      });
    }

    return embeddings;
  }
}

export function createEmbeddingProviderFromEnv(env: KnowledgeOSEnv): EmbeddingProvider {
  if (env.EMBEDDING_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new ExternalProviderError("OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai");
    }
    return new OpenAIEmbeddingProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS
    });
  }

  return new DeterministicEmbeddingProvider({
    dimensions: env.EMBEDDING_DIMENSIONS
  });
}

const openAIEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number())
    })
  )
});

function deterministicEmbedding(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);

  for (const token of tokens) {
    const hash = sha256Hex(token);
    const bucket = Number.parseInt(hash.slice(0, 8), 16) % dimensions;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

