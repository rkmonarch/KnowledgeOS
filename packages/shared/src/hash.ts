import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function stableJsonHash(input: unknown): string {
  return sha256Hex(JSON.stringify(sortJson(input)));
}

function sortJson(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(sortJson);
  }

  if (input !== null && typeof input === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortJson((input as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return input;
}

