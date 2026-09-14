import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import {
  type Logger,
  KnowledgeOSError,
  createConsoleLogger,
  embeddingJobPayloadSchema,
  extractionJobPayloadSchema,
  sourceSectionExtractionJobPayloadSchema
} from "@knowledgeos/shared";
import { type KnowledgeRepository } from "@knowledgeos/database";
import { extractKnowledgeFromSection, type JsonLlmProvider } from "@knowledgeos/knowledge-compiler";
import { embedEntity, type EmbeddingProvider, type RetrievalRepository } from "@knowledgeos/retrieval";

type WorkerRepository = Pick<
  KnowledgeRepository,
  | "claimNextJob"
  | "completeJob"
  | "enqueueJob"
  | "failJob"
  | "getSourceRevisionWithSections"
  | "getSourceSectionForExtraction"
  | "persistExtraction"
> &
  RetrievalRepository;

export interface WorkerOptions {
  repository: WorkerRepository;
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
    ["extract_concepts_from_source_revision", "extract_concepts_from_source_section", "embed_concept", "embed_claim"],
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

      let queuedSectionJobs = 0;
      for (const section of revision.sections) {
        if (section.body.trim().length === 0) {
          continue;
        }

        await options.repository.enqueueJob({
          workspaceId: payload.workspaceId,
          type: "extract_concepts_from_source_section",
          payload: {
            workspaceId: payload.workspaceId,
            sourceRevisionId: payload.sourceRevisionId,
            sourceSectionId: section.id
          },
          idempotencyKey: `extract:section:${section.id}`,
          maxAttempts: 5
        });
        queuedSectionJobs += 1;
      }

      logger.info("Queued source section extraction jobs", {
        sourceRevisionId: payload.sourceRevisionId,
        queuedSectionJobs
      });
    } else if (job.type === "extract_concepts_from_source_section") {
      const payload = sourceSectionExtractionJobPayloadSchema.parse(job.payload);
      const section = await options.repository.getSourceSectionForExtraction({
        sourceRevisionId: payload.sourceRevisionId,
        sourceSectionId: payload.sourceSectionId
      });

      if (section.body.trim().length === 0) {
        logger.info("Skipped empty source section extraction", {
          sourceRevisionId: payload.sourceRevisionId,
          sourceSectionId: payload.sourceSectionId
        });
      } else {
        logger.info("Extracting knowledge from source section", {
          sourceRevisionId: payload.sourceRevisionId,
          sourceSectionId: payload.sourceSectionId,
          llmProvider: options.llmProvider.name
        });

        const concepts = await extractKnowledgeFromSection(section, {
          llm: options.llmProvider,
          logger
        });
        const persisted = await options.repository.persistExtraction({
          workspaceId: payload.workspaceId,
          sourceRevisionId: payload.sourceRevisionId,
          concepts
        });

        await enqueueEmbeddingJobs({
          repository: options.repository,
          workspaceId: payload.workspaceId,
          sourceRevisionId: payload.sourceRevisionId,
          sourceSectionId: payload.sourceSectionId,
          conceptIds: persisted.conceptIds,
          claimIds: persisted.claimIds
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
    const message = formatJobErrorMessage(error);
    logger.error("Job failed", { jobId: job.id, jobType: job.type }, error instanceof Error ? error : undefined);
    await options.repository.failJob(job.id, message);
    return true;
  }
}

function formatJobErrorMessage(error: unknown): string {
  if (error instanceof KnowledgeOSError && error.details) {
    return `${error.message} (${formatErrorDetails(error.details)})`;
  }

  return error instanceof Error ? error.message : String(error);
}

function formatErrorDetails(details: unknown): string {
  if (typeof details === "string") {
    return details.slice(0, 240);
  }

  try {
    return JSON.stringify(details).slice(0, 240);
  } catch {
    return String(details).slice(0, 240);
  }
}

async function enqueueEmbeddingJobs(input: {
  repository: WorkerRepository;
  workspaceId: string;
  sourceRevisionId: string;
  sourceSectionId: string;
  conceptIds: string[];
  claimIds: string[];
}): Promise<void> {
  for (const conceptId of input.conceptIds) {
    await input.repository.enqueueJob({
      workspaceId: input.workspaceId,
      type: "embed_concept",
      payload: {
        workspaceId: input.workspaceId,
        entityType: "concept",
        entityId: conceptId
      },
      idempotencyKey: `embed:concept:${conceptId}:section:${input.sourceSectionId}`
    });
  }

  for (const claimId of input.claimIds) {
    await input.repository.enqueueJob({
      workspaceId: input.workspaceId,
      type: "embed_claim",
      payload: {
        workspaceId: input.workspaceId,
        entityType: "claim",
        entityId: claimId
      },
      idempotencyKey: `embed:claim:${claimId}:section:${input.sourceSectionId}`
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
