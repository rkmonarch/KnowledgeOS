import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../src/normalize.js";
import { extractionOutputSchema } from "../src/schemas.js";

const section = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  sourceId: "00000000-0000-4000-8000-000000000002",
  sourceName: "Architecture.md",
  sourceRevisionId: "00000000-0000-4000-8000-000000000003",
  sourceSectionId: "00000000-0000-4000-8000-000000000004",
  headingPath: ["Authentication"],
  title: "Authentication",
  body: "OAuth is used.",
  startLine: 4,
  endLine: 8
};

describe("normalizeExtraction", () => {
  it("normalizes slugs, tags, line references, and duplicate claims", () => {
    const [concept] = normalizeExtraction(section, {
      concepts: [
        {
          title: "Authentication",
          summary: "Auth",
          body: "OAuth is used.",
          type: "system",
          tags: ["Security", "security", "Backend APIs"],
          confidence: 1.2,
          owner: null,
          status: "active",
          claims: [
            {
              text: " OAuth is used. ",
              confidence: 0.8,
              status: "active",
              startLine: 1,
              endLine: 99,
              quote: "OAuth is used."
            },
            {
              text: "OAuth is used.",
              confidence: 0.6,
              status: "active",
              startLine: 5,
              endLine: 5,
              quote: "OAuth is used."
            }
          ],
          relationships: []
        }
      ]
    });

    expect(concept?.slug).toBe("authentication");
    expect(concept?.tags).toEqual(["backend-apis", "security"]);
    expect(concept?.confidence).toBe(1);
    expect(concept?.claims).toHaveLength(1);
    expect(concept?.claims[0]?.startLine).toBe(4);
    expect(concept?.claims[0]?.endLine).toBe(8);
  });

  it("validates and normalizes typed relationships with target references", () => {
    const parsed = extractionOutputSchema.parse({
      concepts: [
        {
          title: "Authentication Service",
          summary: "Auth service",
          body: "Authentication Service uses OAuth Device Flow.",
          type: "system",
          tags: ["Auth"],
          confidence: 0.82,
          owner: null,
          status: "active",
          claims: [],
          relationships: [
            {
              type: "uses",
              targetTitle: "OAuth Device Flow",
              description: "Authentication Service uses OAuth Device Flow.",
              confidence: 0.77,
              evidence: "uses OAuth Device Flow"
            },
            {
              type: "signed_by",
              targetSlug: "key-management-service",
              confidence: 0.71
            }
          ]
        }
      ]
    });

    const [concept] = normalizeExtraction(section, parsed);

    expect(concept?.relationships).toEqual([
      {
        type: "uses",
        targetSlug: "oauth-device-flow",
        targetTitle: "OAuth Device Flow",
        description: "Authentication Service uses OAuth Device Flow.",
        confidence: 0.77
      },
      {
        type: "signed_by",
        targetSlug: "key-management-service",
        targetTitle: "Key Management Service",
        description: "",
        confidence: 0.71
      }
    ]);
  });

  it("normalizes common model relationship aliases before persistence", () => {
    const parsed = extractionOutputSchema.parse({
      concepts: [
        {
          title: "Recipient",
          summary: "Payment recipient",
          body: "The recipient receives settled funds from Atlas.",
          type: "term",
          tags: [],
          confidence: 0.82,
          owner: null,
          status: "active",
          claims: [],
          relationships: [
            {
              type: "received",
              targetTitle: "Settled Funds",
              description: "The recipient receives settled funds.",
              confidence: 0.76
            },
            {
              type: "provides",
              targetTitle: "Route Quote",
              description: "Atlas provides a route quote.",
              confidence: 0.79
            }
          ]
        }
      ]
    });

    const [concept] = normalizeExtraction(section, parsed);

    expect(concept?.relationships.map((relationship) => relationship.type)).toEqual(["related_to", "produces"]);
  });
});
