import { describe, expect, it } from "vitest";
import { conceptDetailResponseSchema, relationshipTypeSchema } from "../src/domain.js";

describe("relationship domain schemas", () => {
  it("accepts the Phase 1 relationship vocabulary", () => {
    expect(
      relationshipTypeSchema.parse("uses")
    ).toBe("uses");
    expect(
      relationshipTypeSchema.parse("mitigates")
    ).toBe("mitigates");
    expect(
      relationshipTypeSchema.parse("signed_by")
    ).toBe("signed_by");
  });

  it("requires relationship groups in concept detail responses", () => {
    const parsed = conceptDetailResponseSchema.parse({
      concept: {
        id: "00000000-0000-4000-8000-000000000001",
        workspaceId: "00000000-0000-4000-8000-000000000002",
        slug: "authentication-service",
        title: "Authentication Service",
        summary: "Handles sign-in.",
        body: "Handles OAuth sign-in.",
        type: "system",
        tags: ["authentication"],
        confidence: 0.9,
        owner: null,
        status: "active",
        citations: [],
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z",
        verifiedAt: null
      },
      claims: [],
      relationships: {
        incoming: [],
        outgoing: [],
        unresolved: []
      }
    });

    expect(parsed.relationships).toEqual({
      incoming: [],
      outgoing: [],
      unresolved: []
    });
  });
});
