import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  KNOWLEDGEOS_API_PORT: z.coerce.number().int().positive().default(4100),
  DEFAULT_WORKSPACE_NAME: z.string().min(1).default("Default"),
  LLM_PROVIDER: z.enum(["fixture", "openai", "groq"]).default("fixture"),
  EMBEDDING_PROVIDER: z.enum(["deterministic", "openai"]).default("deterministic"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_CHAT_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536)
});

export type KnowledgeOSEnv = z.infer<typeof envSchema>;

export function loadEnvFromNearestFile(startDir = process.cwd()): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function parseEnv(input: NodeJS.ProcessEnv): KnowledgeOSEnv {
  return envSchema.parse(input);
}
