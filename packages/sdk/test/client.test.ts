import { describe, expect, it } from "vitest";
import { KnowledgeOSClient } from "../src/index.js";

describe("KnowledgeOSClient", () => {
  it("reports non-JSON API responses with endpoint and status", async () => {
    const fetchImpl = async () =>
      new Response("<!DOCTYPE html><html><body>Build error</body></html>", {
        status: 500,
        headers: {
          "content-type": "text/html"
        }
      });
    const client = new KnowledgeOSClient({ baseUrl: "/api", fetchImpl });

    await expect(client.listJobs("00000000-0000-4000-8000-000000000001")).rejects.toThrow(
      "GET /jobs?workspaceId=00000000-0000-4000-8000-000000000001&limit=50 returned non-JSON response (500)"
    );
  });
});
