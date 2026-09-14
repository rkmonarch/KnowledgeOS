import { z } from "zod";
import { errorResponse, jsonResponse } from "../../_lib/http";
import { getKnowledgeOSRuntime } from "../../_lib/runtime";

export const runtime = "nodejs";

const graphNeighborhoodQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  conceptId: z.string().uuid(),
  depth: z.coerce.number().int().positive().max(3).default(1),
  limit: z.coerce.number().int().positive().max(200).default(80)
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = graphNeighborhoodQuerySchema.parse(Object.fromEntries(url.searchParams));
    const runtimeContext = getKnowledgeOSRuntime();
    const graph = await runtimeContext.repository.getConceptGraphNeighborhood(query);

    return jsonResponse(graph);
  } catch (error) {
    return errorResponse(error);
  }
}
