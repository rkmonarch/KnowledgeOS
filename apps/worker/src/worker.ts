import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import {
  type Logger,
  createConsoleLogger,
  embeddingJobPayloadSchema,
  extractionJobPayloadSchema
} from "@knowledgeos/shared";
import { type KnowledgeRepository } from "@knowledgeos/database";
import { compileSourceRevision, type JsonLlmProvider } from "@knowledgeos/knowledge-compiler";
import { embedEntity, type EmbeddingProvider } from "@knowledgeos/retrieval";

export interface WorkerOptions {
  repository: KnowledgeRepository;
  llmProvider: JsonLlmProvider;
  embeddingProvider: EmbeddingProvider;
  logger?: Logger;
  workerId?: string;
  pollIntervalMs?: number;
}

export async function runWorkerLoop(options: WorkerOptions): Promise<void> {
  const logger = options.logger ?? createConsoleLogger("worker");
  const workerId = options.workerId ?? `${hostname()}-${process.pid}-${randomUUID()}`;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;

  logger.info("KnowledgeOS worker started", { workerId });

  while (true) {
    const processed = await runWorkerOnce({ ...options, logger, workerId });
    if (!processed) {
      await sleep(pollIntervalMs);
    }
  }
}

export async function runWorkerOnce(options: WorkerOptions): Promise<boolean> {
  const logger = options.logger ?? createConsoleLogger("worker");
  const workerId = options.workerId ?? `${hostname()}-${process.pid}`;
  const job = await options.repository.claimNextJob(
    ["extract_concepts_from_source_revision", "embed_concept", "embed_claim"],
    workerId
  );

  if (!job) {
    return false;
  }

  logger.info("Claimed job", {
    jobId: job.id,
    jobType: job.type,
    attempts: job.attempts
  });

  try {
    if (job.type === "extract_concepts_from_source_revision") {
      const payload = extractionJobPayloadSchema.parse(job.payload);
      const revision = await options.repository.getSourceRevisionWithSections(payload.sourceRevisionId);
      const compiled = await compileSourceRevision(
        {
          workspaceId: payload.workspaceId,
          sourceId: revision.source.id,
          sourceName: revision.source.name,
          sourceRevisionId: revision.revision.id,
          sections: revision.sections.map((section) => ({
            workspaceId: payload.workspaceId,
            sourceId: revision.source.id,
            sourceName: revision.source.name,
            sourceRevisionId: revision.revision.id,
            sourceSectionId: section.id,
            headingPath: section.headingPath,
            title: section.title,
            body: section.body,
            startLine: section.startLine,
            endLine: section.endLine
          }))
        },
        {
          llm: options.llmProvider,
          logger
        }
      );

      const persisted = await options.repository.persistExtraction(compiled);

      for (const conceptId of persisted.conceptIds) {
        await options.repository.enqueueJob({
          workspaceId: payload.workspaceId,
          type: "embed_concept",
          payload: {
            workspaceId: payload.workspaceId,
            entityType: "concept",
            entityId: conceptId
          },
          idempotencyKey: `embed:concept:${conceptId}:revision:${payload.sourceRevisionId}`
        });
      }

      for (const claimId of persisted.claimIds) {
        await options.repository.enqueueJob({
          workspaceId: payload.workspaceId,
          type: "embed_claim",
          payload: {
            workspaceId: payload.workspaceId,
            entityType: "claim",
            entityId: claimId
          },
          idempotencyKey: `embed:claim:${claimId}:revision:${payload.sourceRevisionId}`
        });
      }
    } else {
      const payload = embeddingJobPayloadSchema.parse(job.payload);
      await embedEntity(
        {
          workspaceId: payload.workspaceId,
          entityType: payload.entityType,
          entityId: payload.entityId
        },
        {
          repository: options.repository,
          embeddings: options.embeddingProvider
        }
      );
    }

    await options.repository.completeJob(job.id);
    logger.info("Completed job", { jobId: job.id, jobType: job.type });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Job failed", { jobId: job.id, jobType: job.type }, error instanceof Error ? error : undefined);
    await options.repository.failJob(job.id, message);
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

