import {
  type ConceptDetailResponse,
  type IngestMarkdownRequest,
  type IngestMarkdownResponse,
  type ListConceptsResponse,
  type ListJobsResponse,
  type SearchRequest,
  type SearchResponse,
  apiErrorResponseSchema,
  conceptDetailResponseSchema,
  defaultWorkspaceResponseSchema,
  ingestMarkdownResponseSchema,
  listConceptsResponseSchema,
  listJobsResponseSchema,
  searchResponseSchema
} from "@knowledgeos/shared/domain";
import type { z } from "zod";

export interface KnowledgeOSClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class KnowledgeOSClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KnowledgeOSClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async ingestMarkdown(input: IngestMarkdownRequest): Promise<IngestMarkdownResponse> {
    return this.request("/sources/markdown", {
      method: "POST",
      body: input,
      schema: ingestMarkdownResponseSchema
    });
  }

  async listConcepts(workspaceId: string): Promise<ListConceptsResponse> {
    return this.request(`/concepts?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "GET",
      schema: listConceptsResponseSchema
    });
  }

  async getConceptDetail(workspaceId: string, conceptId: string): Promise<ConceptDetailResponse> {
    const searchParams = new URLSearchParams({
      workspaceId,
      conceptId
    });

    return this.request(`/concepts/detail?${searchParams.toString()}`, {
      method: "GET",
      schema: conceptDetailResponseSchema
    });
  }

  async listJobs(workspaceId: string, limit = 50): Promise<ListJobsResponse> {
    const searchParams = new URLSearchParams({
      workspaceId,
      limit: limit.toString()
    });

    return this.request(`/jobs?${searchParams.toString()}`, {
      method: "GET",
      schema: listJobsResponseSchema
    });
  }

  async search(input: SearchRequest): Promise<SearchResponse> {
    return this.request("/search", {
      method: "POST",
      body: input,
      schema: searchResponseSchema
    });
  }

  async getDefaultWorkspace() {
    return this.request("/workspaces/default", {
      method: "GET",
      schema: defaultWorkspaceResponseSchema
    });
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      schema: TSchema;
    }
  ): Promise<z.infer<TSchema>> {
    const requestInit: RequestInit = {
      method: options.method,
      headers: {
        "content-type": "application/json"
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    };

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, requestInit);

    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const parsedError = apiErrorResponseSchema.safeParse(payload);
      if (parsedError.success) {
        throw new Error(`${parsedError.data.error.code}: ${parsedError.data.error.message}`);
      }
      throw new Error(`KnowledgeOS API request failed with status ${response.status}`);
    }

    return options.schema.parse(payload);
  }
}

export function createKnowledgeOSClient(baseUrl: string): KnowledgeOSClient {
  return new KnowledgeOSClient({ baseUrl });
}
