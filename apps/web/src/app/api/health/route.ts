import { errorResponse, jsonResponse } from "../_lib/http";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
