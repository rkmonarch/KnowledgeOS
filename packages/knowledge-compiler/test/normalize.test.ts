import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../src/normalize.js";

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
});

