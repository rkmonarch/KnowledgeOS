import { sha256Hex } from "@knowledgeos/shared";

export interface MarkdownSection {
  ordinal: number;
  headingPath: string[];
  title: string;
  body: string;
  startLine: number;
  endLine: number;
  contentHash: string;
}

interface MutableSection {
  headingPath: string[];
  title: string;
  startLine: number;
  bodyLines: string[];
}

export function splitMarkdownIntoSections(content: string): MarkdownSection[] {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.split("\n");
  const headingStack: string[] = [];
  const sections: MarkdownSection[] = [];
  let current: MutableSection = {
    headingPath: [],
    title: "Document",
    startLine: 1,
    bodyLines: []
  };
  let inFence = false;

  function closeSection(endLine: number): void {
    const body = trimBlankBoundaryLines(current.bodyLines).join("\n");
    if (body.trim().length === 0 && current.title === "Document") {
      return;
    }

    const trailingBlankLineCount = countTrailingBlankLines(current.bodyLines);
    const section: MarkdownSection = {
      ordinal: sections.length,
      headingPath: current.headingPath,
      title: current.title,
      body,
      startLine: current.startLine,
      endLine: Math.max(current.startLine, endLine - trailingBlankLineCount),
      contentHash: sha256Hex([current.title, current.headingPath.join("/"), body].join("\n"))
    };
    sections.push(section);
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      current.bodyLines.push(line);
      return;
    }

    const heading = inFence ? null : parseAtxHeading(line);
    if (!heading) {
      current.bodyLines.push(line);
      return;
    }

    closeSection(lineNumber - 1);
    headingStack.length = heading.depth - 1;
    headingStack[heading.depth - 1] = heading.title;

    current = {
      headingPath: headingStack.filter((item): item is string => Boolean(item)),
      title: heading.title,
      startLine: lineNumber,
      bodyLines: []
    };
  });

  closeSection(lines.length);

  return sections;
}

export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function parseAtxHeading(line: string): { depth: number; title: string } | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!match) {
    return null;
  }

  const marker = match[1];
  const rawTitle = match[2];
  if (!marker || !rawTitle) {
    return null;
  }

  return {
    depth: marker.length,
    title: rawTitle.trim()
  };
}

function trimBlankBoundaryLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1]?.trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function countTrailingBlankLines(lines: string[]): number {
  let count = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim() !== "") {
      break;
    }
    count += 1;
  }
  return count;
}
