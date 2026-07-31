import { describe, expect, it } from "vitest";
import { compileSourceRevision } from "../src/compiler.js";
import { FixtureLlmProvider } from "../src/providers.js";

describe("compileSourceRevision", () => {
  it("extracts concepts with a provider and returns persistence-ready provenance", async () => {
    const result = await compileSourceRevision(
      {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        sourceId: "00000000-0000-4000-8000-000000000002",
        sourceName: "Architecture.md",
        sourceRevisionId: "00000000-0000-4000-8000-000000000003",
        sections: [
          {
            workspaceId: "00000000-0000-4000-8000-000000000001",
            sourceId: "00000000-0000-4000-8000-000000000002",
            sourceName: "Architecture.md",
            sourceRevisionId: "00000000-0000-4000-8000-000000000003",
            sourceSectionId: "00000000-0000-4000-8000-000000000004",
            headingPath: ["Authentication"],
            title: "Authentication",
            body: "The backend authentication service uses OAuth.",
            startLine: 1,
            endLine: 3
          }
        ]
      },
      { llm: new FixtureLlmProvider() }
    );

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]).toMatchObject({
      slug: "authentication",
      title: "Authentication",
      sourceSectionId: "00000000-0000-4000-8000-000000000004"
    });
    expect(result.concepts[0]?.claims[0]?.quote).toBe("The backend authentication service uses OAuth.");
  });
});

