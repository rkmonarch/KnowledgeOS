import { z } from "zod";
import { NotFoundError } from "@knowledgeos/shared";
import { errorResponse, jsonResponse } from "../../_lib/http";
import { getKnowledgeOSRuntime } from "../../_lib/runtime";

export const runtime = "nodejs";

const conceptDetailQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  conceptId: z.string().uuid()
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = conceptDetailQuerySchema.parse(Object.fromEntries(url.searchParams));
    const runtimeContext = getKnowledgeOSRuntime();
    const concept = await runtimeContext.repository.getConcept(query.conceptId);

    if (concept.workspaceId !== query.workspaceId) {
      throw new NotFoundError("Concept was not found in workspace", query);
    }

    const [claims, relationships] = await Promise.all([
      runtimeContext.repository.listClaimsForConcept(query.conceptId),
      runtimeContext.repository.listRelationshipsForConcept(query.workspaceId, query.conceptId)
    ]);

    return jsonResponse({ concept, claims, relationships });
  } catch (error) {
    return errorResponse(error);
  }
}
