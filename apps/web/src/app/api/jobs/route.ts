import { z } from "zod";
import { retryJobRequestSchema } from "@knowledgeos/shared";
import { errorResponse, jsonResponse, readJsonBody } from "../_lib/http";
import { getKnowledgeOSRuntime } from "../_lib/runtime";

export const runtime = "nodejs";

const listJobsQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = listJobsQuerySchema.parse(Object.fromEntries(url.searchParams));
    const runtimeContext = getKnowledgeOSRuntime();
    const jobs = await runtimeContext.repository.listJobs(query.workspaceId, query.limit);

    return jsonResponse({ jobs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    const input = retryJobRequestSchema.parse(body);
    const runtimeContext = getKnowledgeOSRuntime();
    const jobId = await runtimeContext.repository.retryFailedJob(input.workspaceId, input.jobId);

    return jsonResponse({ jobId });
  } catch (error) {
    return errorResponse(error);
  }
}
