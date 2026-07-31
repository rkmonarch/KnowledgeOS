import { ingestMarkdown } from "@knowledgeos/ingestion";
import { ingestMarkdownRequestSchema } from "@knowledgeos/shared";
import { errorResponse, jsonResponse, readJsonBody } from "../../_lib/http";
import { getKnowledgeOSRuntime } from "../../_lib/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const runtimeContext = getKnowledgeOSRuntime();
    const body = ingestMarkdownRequestSchema.parse(await readJsonBody(request));
    const result = await ingestMarkdown(body, {
      repository: runtimeContext.repository,
      defaultWorkspaceName: runtimeContext.defaultWorkspaceName
    });

    return jsonResponse(result, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
