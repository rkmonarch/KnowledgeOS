import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { z } from "zod";
import {
  KnowledgeOSError,
  type Logger,
  createConsoleLogger,
  ingestMarkdownRequestSchema,
  searchRequestSchema
} from "@knowledgeos/shared";
import { ingestMarkdown } from "@knowledgeos/ingestion";
import { searchKnowledge, type EmbeddingProvider } from "@knowledgeos/retrieval";
import type { KnowledgeRepository } from "@knowledgeos/database";

export interface ApiServerOptions {
  repository: KnowledgeRepository;
  embeddingProvider: EmbeddingProvider;
  defaultWorkspaceName: string;
  logger?: Logger;
}

export function createApiServer(options: ApiServerOptions): Server {
  const logger = options.logger ?? createConsoleLogger("api");

  return createServer(async (request, response) => {
    try {
      setCorsHeaders(response);

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/workspaces/default") {
        const workspace = await options.repository.ensureWorkspace(options.defaultWorkspaceName);
        sendJson(response, 200, {
          workspace: {
            id: workspace.id,
            name: workspace.name,
            createdAt: workspace.createdAt.toISOString(),
            updatedAt: workspace.updatedAt.toISOString()
          }
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/sources/markdown") {
        const body = ingestMarkdownRequestSchema.parse(await readJson(request));
        const result = await ingestMarkdown(body, {
          repository: options.repository,
          defaultWorkspaceName: options.defaultWorkspaceName
        });
        sendJson(response, 202, result);
        return;
      }

      if (request.method === "GET" && url.pathname === "/concepts") {
        const workspaceId = z.string().uuid().parse(url.searchParams.get("workspaceId"));
        const concepts = await options.repository.listConcepts(workspaceId);
        sendJson(response, 200, { concepts });
        return;
      }

      if (request.method === "POST" && url.pathname === "/search") {
        const body = searchRequestSchema.parse(await readJson(request));
        const result = await searchKnowledge(body, {
          repository: options.repository,
          embeddings: options.embeddingProvider
        });
        sendJson(response, 200, result);
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: `No route for ${request.method ?? "UNKNOWN"} ${url.pathname}`
        }
      });
    } catch (error) {
      logger.error("API request failed", {}, error instanceof Error ? error : undefined);
      sendError(response, error);
    }
  });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 5_000_000) {
      throw new KnowledgeOSError("PAYLOAD_TOO_LARGE", "Request body exceeds 5 MB");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    throw new KnowledgeOSError("INVALID_JSON", "Request body is not valid JSON", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof z.ZodError) {
    sendJson(response, 400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof KnowledgeOSError) {
    sendJson(response, statusForCode(error.code), {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  sendJson(response, 500, {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown server error"
    }
  });
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function statusForCode(code: string): number {
  if (code === "NOT_FOUND") {
    return 404;
  }
  if (code === "PAYLOAD_TOO_LARGE") {
    return 413;
  }
  if (code === "INVALID_JSON" || code === "VALIDATION_BOUNDARY_ERROR") {
    return 400;
  }
  return 500;
}

