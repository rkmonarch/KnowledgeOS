import { NextResponse } from "next/server";
import { z } from "zod";
import { KnowledgeOSError } from "@knowledgeos/shared";

const maxJsonBodyBytes = 5_000_000;

export async function readJsonBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > maxJsonBodyBytes) {
    throw new KnowledgeOSError("PAYLOAD_TOO_LARGE", "Request body exceeds 5 MB");
  }

  if (body.length === 0) {
    return {};
  }

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new KnowledgeOSError("INVALID_JSON", "Request body is not valid JSON", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function jsonResponse(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, { status });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return jsonResponse(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.flatten()
        }
      },
      400
    );
  }

  if (error instanceof KnowledgeOSError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      },
      statusForCode(error.code)
    );
  }

  return jsonResponse(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unknown server error"
      }
    },
    500
  );
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
