import { createDatabaseClient, KnowledgeRepository } from "@knowledgeos/database";
import { createLlmProviderFromEnv } from "@knowledgeos/knowledge-compiler";
import { createEmbeddingProviderFromEnv } from "@knowledgeos/retrieval";
import { createConsoleLogger, loadEnvFromNearestFile, parseEnv } from "@knowledgeos/shared";
import { runWorkerLoop } from "./worker.js";

loadEnvFromNearestFile();
const env = parseEnv(process.env);
const logger = createConsoleLogger("worker");
const database = createDatabaseClient({ url: env.DATABASE_URL });

void runWorkerLoop({
  repository: new KnowledgeRepository(database.db),
  llmProvider: createLlmProviderFromEnv(env),
  embeddingProvider: createEmbeddingProviderFromEnv(env),
  logger
});

async function shutdown(): Promise<void> {
  logger.info("Shutting down worker");
  await database.close();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
