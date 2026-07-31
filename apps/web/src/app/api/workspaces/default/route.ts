import { getKnowledgeOSRuntime } from "../../_lib/runtime";
import { errorResponse, jsonResponse } from "../../_lib/http";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const runtimeContext = getKnowledgeOSRuntime();
    const workspace = await runtimeContext.repository.ensureWorkspace(runtimeContext.defaultWorkspaceName);
    return jsonResponse({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
