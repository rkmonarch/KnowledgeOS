import { z } from "zod";
import { errorResponse, jsonResponse } from "../_lib/http";
import { getKnowledgeOSRuntime } from "../_lib/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspaceId"));
    const runtimeContext = getKnowledgeOSRuntime();
    const concepts = await runtimeContext.repository.listConcepts(workspaceId);

    return jsonResponse({ concepts });
  } catch (error) {
    return errorResponse(error);
  }
}
