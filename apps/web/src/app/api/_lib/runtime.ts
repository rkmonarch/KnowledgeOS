import { createDatabaseClient, KnowledgeRepository } from "@knowledgeos/database";
import { createEmbeddingProviderFromEnv, type EmbeddingProvider } from "@knowledgeos/retrieval";
import { createConsoleLogger, loadEnvFromNearestFile, parseEnv, type Logger } from "@knowledgeos/shared";

interface KnowledgeOSRuntime {
  repository: KnowledgeRepository;
  embeddingProvider: EmbeddingProvider;
  defaultWorkspaceName: string;
  logger: Logger;
  close: () => Promise<void>;
}

const globalRuntime = globalThis as typeof globalThis & {
  __knowledgeOSRuntime?: KnowledgeOSRuntime;
  __knowledgeOSRuntimeRepositoryClass?: typeof KnowledgeRepository;
};

export function getKnowledgeOSRuntime(): KnowledgeOSRuntime {
  if (
    globalRuntime.__knowledgeOSRuntime &&
    globalRuntime.__knowledgeOSRuntimeRepositoryClass === KnowledgeRepository
  ) {
    return globalRuntime.__knowledgeOSRuntime;
  }

  if (globalRuntime.__knowledgeOSRuntime) {
    void globalRuntime.__knowledgeOSRuntime.close().catch(() => undefined);
  }

  loadEnvFromNearestFile();
  const env = parseEnv(process.env);
  const database = createDatabaseClient({
    url: env.DATABASE_URL,
    maxConnections: 5
  });

  const runtime: KnowledgeOSRuntime = {
    repository: new KnowledgeRepository(database.db),
    embeddingProvider: createEmbeddingProviderFromEnv(env),
    defaultWorkspaceName: env.DEFAULT_WORKSPACE_NAME,
    logger: createConsoleLogger("web-api"),
    close: database.close
  };

  globalRuntime.__knowledgeOSRuntime = runtime;
  globalRuntime.__knowledgeOSRuntimeRepositoryClass = KnowledgeRepository;
  return runtime;
}
