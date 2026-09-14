import { describe, expect, it } from "vitest";
import {
  conceptDetailResponseSchema,
  graphNeighborhoodResponseSchema,
  relationshipTypeSchema,
  retryJobRequestSchema,
  retryJobResponseSchema
} from "../src/domain.js";

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

  it("validates graph neighborhood responses", () => {
    const parsed = graphNeighborhoodResponseSchema.parse({
      workspaceId: "00000000-0000-4000-8000-000000000002",
      selectedConceptId: "00000000-0000-4000-8000-000000000001",
      depth: 1,
      nodes: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          concept: {
            id: "00000000-0000-4000-8000-000000000001",
            slug: "authentication-service",
            title: "Authentication Service",
            type: "system"
          },
          distance: 0,
          role: "selected",
          relationshipCount: 1
        }
      ],
      edges: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          sourceConceptId: "00000000-0000-4000-8000-000000000001",
          targetConceptId: "00000000-0000-4000-8000-000000000004",
          type: "uses",
          label: "Uses",
          description: "Authentication Service uses OAuth.",
          confidence: 0.82,
          citation: null
        }
      ]
    });

    expect(parsed.nodes[0]?.role).toBe("selected");
    expect(parsed.edges[0]?.label).toBe("Uses");
  });

  it("validates retry job API contracts", () => {
    expect(
      retryJobRequestSchema.parse({
        workspaceId: "00000000-0000-4000-8000-000000000002",
        jobId: "00000000-0000-4000-8000-000000000003"
      })
    ).toEqual({
      workspaceId: "00000000-0000-4000-8000-000000000002",
      jobId: "00000000-0000-4000-8000-000000000003"
    });

    expect(
      retryJobResponseSchema.parse({
        jobId: "00000000-0000-4000-8000-000000000003"
      })
    ).toEqual({
      jobId: "00000000-0000-4000-8000-000000000003"
    });
  });
});
