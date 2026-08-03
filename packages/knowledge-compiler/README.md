# @knowledgeos/knowledge-compiler

Concept extraction and normalization package.

This package owns the LLM extraction contract, prompts, Zod validation, deterministic normalization, and provider interfaces. The model returns structured candidates only; persistence is handled by repositories outside the model provider.

The worker calls this package at source-section granularity. A failed extraction should quarantine only the section job that failed, not the entire source revision.
