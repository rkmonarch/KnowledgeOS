import { searchKnowledge } from "@knowledgeos/retrieval";
import { searchRequestSchema } from "@knowledgeos/shared";
import { errorResponse, jsonResponse, readJsonBody } from "../_lib/http";
import { getKnowledgeOSRuntime } from "../_lib/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const runtimeContext = getKnowledgeOSRuntime();
    const body = searchRequestSchema.parse(await readJsonBody(request));
    const result = await searchKnowledge(body, {
      repository: runtimeContext.repository,
      embeddings: runtimeContext.embeddingProvider
    });

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
