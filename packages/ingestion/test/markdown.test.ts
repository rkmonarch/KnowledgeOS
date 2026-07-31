import { describe, expect, it } from "vitest";
import { splitMarkdownIntoSections } from "../src/markdown.js";

describe("splitMarkdownIntoSections", () => {
  it("splits Markdown by headings and preserves line ranges", () => {
    const sections = splitMarkdownIntoSections(`# Authentication

Users authenticate with OAuth.

## Device Flow

Mobile clients use device flow.

\`\`\`md
# Not a heading
\`\`\`

## API Keys

Legacy API keys are deprecated.
`);

    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({
      ordinal: 0,
      title: "Authentication",
      headingPath: ["Authentication"],
      startLine: 1,
      endLine: 3
    });
    expect(sections[1]?.title).toBe("Device Flow");
    expect(sections[1]?.headingPath).toEqual(["Authentication", "Device Flow"]);
    expect(sections[1]?.body).toContain("# Not a heading");
    expect(sections[2]).toMatchObject({
      title: "API Keys",
      headingPath: ["Authentication", "API Keys"]
    });
  });
});

