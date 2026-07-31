import { createDatabaseClient, KnowledgeRepository } from "@knowledgeos/database";
import { createEmbeddingProviderFromEnv } from "@knowledgeos/retrieval";
import { createConsoleLogger, loadEnvFromNearestFile, parseEnv } from "@knowledgeos/shared";
import { createApiServer } from "./server.js";

loadEnvFromNearestFile();
const env = parseEnv(process.env);
const logger = createConsoleLogger("api");
const database = createDatabaseClient({ url: env.DATABASE_URL });
const repository = new KnowledgeRepository(database.db);
const embeddingProvider = createEmbeddingProviderFromEnv(env);

const server = createApiServer({
  repository,
  embeddingProvider,
  defaultWorkspaceName: env.DEFAULT_WORKSPACE_NAME,
  logger
});

server.listen(env.KNOWLEDGEOS_API_PORT, () => {
  logger.info("KnowledgeOS API listening", {
    port: env.KNOWLEDGEOS_API_PORT
  });
});

async function shutdown(): Promise<void> {
  logger.info("Shutting down API");
  server.close();
  await database.close();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
