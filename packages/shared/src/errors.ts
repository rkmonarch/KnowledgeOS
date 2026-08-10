export class KnowledgeOSError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "KnowledgeOSError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationBoundaryError extends KnowledgeOSError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_BOUNDARY_ERROR", message, details);
    this.name = "ValidationBoundaryError";
  }
}

export class ExternalProviderError extends KnowledgeOSError {
  constructor(message: string, details?: unknown) {
    super("EXTERNAL_PROVIDER_ERROR", message, details);
    this.name = "ExternalProviderError";
  }
}

export class NotFoundError extends KnowledgeOSError {
  constructor(message: string, details?: unknown) {
    super("NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

export class DuplicateSourceRevisionError extends KnowledgeOSError {
  constructor(message: string, details?: unknown) {
    super("DUPLICATE_SOURCE_REVISION", message, details);
    this.name = "DuplicateSourceRevisionError";
  }
}
