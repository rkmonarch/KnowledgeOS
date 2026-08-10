import { describe, expect, it } from "vitest";
import { resolveRelationshipDrafts } from "../src/relationship-resolution.js";

describe("resolveRelationshipDrafts", () => {
  it("resolves targets from the current extraction and stores unknown targets as pending", () => {
    const result = resolveRelationshipDrafts({
      concepts: [
        {
          id: "concept-auth",
          slug: "authentication-service",
          sourceSectionId: "section-auth",
          relationships: [
            {
              type: "depends_on",
              targetSlug: "user-service",
              targetTitle: "User Service",
              description: "Authentication Service depends on User Service.",
              confidence: 0.84
            },
            {
              type: "uses",
              targetSlug: "oauth-device-flow",
              targetTitle: "OAuth Device Flow",
              description: "Authentication Service uses OAuth Device Flow.",
              confidence: 0.76
            }
          ]
        },
        {
          id: "concept-user",
          slug: "user-service",
          sourceSectionId: "section-user",
          relationships: []
        }
      ],
      existingConceptIdsBySlug: new Map()
    });

    expect(result.resolved).toEqual([
      expect.objectContaining({
        sourceConceptId: "concept-auth",
        targetConceptId: "concept-user",
        targetConceptSlug: "user-service",
        type: "depends_on"
      })
    ]);
    expect(result.pending).toEqual([
      expect.objectContaining({
        sourceConceptId: "concept-auth",
        targetConceptSlug: "oauth-device-flow",
        type: "uses"
      })
    ]);
  });

  it("resolves targets that already exist outside the current extraction", () => {
    const result = resolveRelationshipDrafts({
      concepts: [
        {
          id: "concept-mobile",
          slug: "mobile-sdk",
          sourceSectionId: "section-mobile",
          relationships: [
            {
              type: "uses",
              targetSlug: "oauth-device-flow",
              targetTitle: "OAuth Device Flow",
              description: "Mobile SDK uses OAuth Device Flow.",
              confidence: 0.81
            }
          ]
        }
      ],
      existingConceptIdsBySlug: new Map([["oauth-device-flow", "concept-oauth-device-flow"]])
    });

    expect(result.pending).toHaveLength(0);
    expect(result.resolved).toEqual([
      expect.objectContaining({
        sourceConceptId: "concept-mobile",
        targetConceptId: "concept-oauth-device-flow",
        type: "uses"
      })
    ]);
  });

  it("deduplicates relationships and keeps the strongest evidence", () => {
    const result = resolveRelationshipDrafts({
      concepts: [
        {
          id: "concept-api-gateway",
          slug: "api-gateway",
          sourceSectionId: "section-api",
          relationships: [
            {
              type: "requires",
              targetSlug: "authentication-service",
              targetTitle: "Authentication Service",
              description: "API Gateway requires Authentication Service.",
              confidence: 0.72
            },
            {
              type: "requires",
              targetSlug: "authentication-service",
              targetTitle: "Authentication Service",
              description: "API Gateway requires Authentication Service before routing protected requests.",
              confidence: 0.9
            }
          ]
        }
      ],
      existingConceptIdsBySlug: new Map([["authentication-service", "concept-auth"]])
    });

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      targetConceptId: "concept-auth",
      confidence: 0.9,
      description: "API Gateway requires Authentication Service before routing protected requests."
    });
  });

  it("allows circular relationships without recursion and skips self loops", () => {
    const result = resolveRelationshipDrafts({
      concepts: [
        {
          id: "concept-energy",
          slug: "energy-grid",
          sourceSectionId: "section-energy",
          relationships: [
            {
              type: "affects",
              targetSlug: "transportation",
              targetTitle: "Transportation",
              description: "Energy Grid affects Transportation.",
              confidence: 0.8
            },
            {
              type: "related_to",
              targetSlug: "energy-grid",
              targetTitle: "Energy Grid",
              description: "Self reference.",
              confidence: 0.9
            }
          ]
        },
        {
          id: "concept-transportation",
          slug: "transportation",
          sourceSectionId: "section-transportation",
          relationships: [
            {
              type: "affects",
              targetSlug: "energy-grid",
              targetTitle: "Energy Grid",
              description: "Transportation affects Energy Grid demand.",
              confidence: 0.74
            }
          ]
        }
      ],
      existingConceptIdsBySlug: new Map()
    });

    expect(result.pending).toHaveLength(0);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved.map((relationship) => relationship.targetConceptId).sort()).toEqual([
      "concept-energy",
      "concept-transportation"
    ]);
  });
});
