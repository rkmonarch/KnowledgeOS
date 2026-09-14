import {
  type ConceptDetailResponse,
  type GraphNeighborhoodResponse,
  type IngestMarkdownRequest,
  type IngestMarkdownResponse,
  type ListConceptsResponse,
  type ListJobsResponse,
  type RetryJobRequest,
  type RetryJobResponse,
  type SearchRequest,
  type SearchResponse,
  apiErrorResponseSchema,
  conceptDetailResponseSchema,
  defaultWorkspaceResponseSchema,
  graphNeighborhoodResponseSchema,
  ingestMarkdownResponseSchema,
  listConceptsResponseSchema,
  listJobsResponseSchema,
  retryJobResponseSchema,
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

  async getGraphNeighborhood(input: {
    workspaceId: string;
    conceptId: string;
    depth?: number;
    limit?: number;
  }): Promise<GraphNeighborhoodResponse> {
    const searchParams = new URLSearchParams({
      workspaceId: input.workspaceId,
      conceptId: input.conceptId,
      depth: String(input.depth ?? 1),
      limit: String(input.limit ?? 80)
    });

    return this.request(`/graph/neighborhood?${searchParams.toString()}`, {
      method: "GET",
      schema: graphNeighborhoodResponseSchema
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

  async retryJob(input: RetryJobRequest): Promise<RetryJobResponse> {
    return this.request("/jobs", {
      method: "POST",
      body: input,
      schema: retryJobResponseSchema
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

    const requestUrl = `${this.baseUrl}${path}`;
    const response = await this.fetchImpl(requestUrl, requestInit);
    const responseText = await response.text();
    const payload = parseJsonResponse(responseText, options.method, path, response.status);

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

function parseJsonResponse(responseText: string, method: string, path: string, status: number): unknown {
  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    const detail = responseText.trim().slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      `${method} ${path} returned non-JSON response (${status})${detail.length > 0 ? `: ${detail}` : ""}`
    );
  }
}

export function createKnowledgeOSClient(baseUrl: string): KnowledgeOSClient {
  return new KnowledgeOSClient({ baseUrl });
}
