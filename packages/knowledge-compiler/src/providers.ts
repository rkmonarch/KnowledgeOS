import { z } from "zod";
import { type KnowledgeOSEnv, ExternalProviderError } from "@knowledgeos/shared";
import type { ExtractionOutput } from "./schemas.js";

export interface JsonLlmProvider {
  readonly name: string;
  generateJson(input: { system: string; prompt: string }): Promise<unknown>;
}

type ChatRole = "system" | "user";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  temperature: number;
  messages: ChatMessage[];
  reasoning_effort?: "low" | "medium" | "high";
  response_format?: {
    type: "json_object";
  };
}

interface ChatJsonProviderOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  minRequestIntervalMs?: number;
}

export class FixtureLlmProvider implements JsonLlmProvider {
  readonly name = "fixture";

  async generateJson(input: { prompt: string }): Promise<ExtractionOutput> {
    const prompt = fixturePromptSchema.parse(JSON.parse(input.prompt));
    const body = prompt.source.body.trim();
    if (body.length === 0) {
      return { concepts: [] };
    }

    const quote = firstMeaningfulLine(body) ?? prompt.source.title;
    return {
      concepts: [
        {
          slug: prompt.source.title,
          title: prompt.source.title,
          summary: `${prompt.source.title} is described by ${prompt.source.sourceName}.`,
          body,
          type: inferConceptType(prompt.source.title, body),
          tags: inferTags(prompt.source.title, body),
          confidence: 0.72,
          owner: null,
          status: "active",
          claims: [
            {
              text: normalizeSentence(quote),
              confidence: 0.7,
              status: "active",
              startLine: prompt.source.startLine,
              endLine: prompt.source.endLine,
              quote
            }
          ],
          relationships: []
        }
      ]
    };
  }
}

export class OpenAIChatJsonProvider implements JsonLlmProvider {
  readonly name = "openai";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ChatJsonProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async generateJson(input: { system: string; prompt: string }): Promise<unknown> {
    const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new ExternalProviderError("OpenAI extraction request failed", {
        status: response.status,
        body: sanitizeProviderErrorBody(await response.text())
      });
    }

    const parsed = openAIChatCompletionSchema.parse(await response.json());
    const content = parsed.choices[0]?.message.content;
    if (!content) {
      throw new ExternalProviderError("OpenAI extraction response did not contain JSON content");
    }

    return parseJsonFromModelContent("OpenAI", content);
  }
}

export class GroqChatJsonProvider implements JsonLlmProvider {
  readonly name = "groq";
  private readonly fetchImpl: typeof fetch;
  private readonly minRequestIntervalMs: number;
  private nextRequestAt = 0;

  constructor(private readonly options: ChatJsonProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? (isGroqReasoningModel(options.model) ? 15_000 : 2_000);
  }

  async generateJson(input: { system: string; prompt: string }): Promise<unknown> {
    if (isGroqReasoningModel(this.options.model)) {
      try {
        return await this.generateJsonWithoutJsonMode(input);
      } catch (error) {
        if (!isPlainJsonParseFailure(error)) {
          throw error;
        }
      }
    }

    const response = await this.requestCompletion(this.withGroqModelOptions({
      model: this.options.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt }
      ]
    }));

    if (!response.ok) {
      const body = await response.text();
      if (shouldRetryGroqWithoutJsonMode(response.status, body)) {
        return this.generateJsonWithoutJsonMode(input);
      }

      throw new ExternalProviderError(`Groq extraction request failed (${response.status})`, {
        status: response.status,
        body: sanitizeProviderErrorBody(body)
      });
    }

    return parseChatCompletionJson("Groq", await response.json());
  }

  private async generateJsonWithoutJsonMode(input: { system: string; prompt: string }): Promise<unknown> {
    const response = await this.requestCompletion(this.withGroqModelOptions({
      model: this.options.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            input.system,
            "Your entire message content must be a single compact JSON object with a concepts array."
          ].join("\n")
        },
        { role: "user", content: input.prompt }
      ]
    }));

    if (!response.ok) {
      throw new ExternalProviderError(`Groq extraction fallback request failed (${response.status})`, {
        status: response.status,
        body: sanitizeProviderErrorBody(await response.text())
      });
    }

    return parseChatCompletionJson("Groq", await response.json());
  }

  private async requestCompletion(payload: ChatCompletionRequest): Promise<Response> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.waitForRequestSlot();

      const response = await this.fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      this.nextRequestAt = Date.now() + this.minRequestIntervalMs;

      if (response.status !== 429) {
        return response;
      }

      const body = await response.text();
      if (attempt === maxAttempts) {
        throw new ExternalProviderError("Groq extraction request rate-limited (429)", {
          status: response.status,
          body: sanitizeProviderErrorBody(body)
        });
      }

      await sleep(getGroqRetryDelayMs(response.headers.get("retry-after"), body, attempt));
    }

    throw new ExternalProviderError("Groq extraction request rate-limited (429)");
  }

  private withGroqModelOptions(payload: ChatCompletionRequest): ChatCompletionRequest {
    if (!isGroqReasoningModel(this.options.model)) {
      return payload;
    }

    return {
      ...payload,
      reasoning_effort: "low"
    };
  }

  private async waitForRequestSlot(): Promise<void> {
    const delayMs = this.nextRequestAt - Date.now();
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

export function createLlmProviderFromEnv(env: KnowledgeOSEnv): JsonLlmProvider {
  if (env.LLM_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new ExternalProviderError("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
    }
    return new OpenAIChatJsonProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_CHAT_MODEL
    });
  }

  if (env.LLM_PROVIDER === "groq") {
    if (!env.GROQ_API_KEY) {
      throw new ExternalProviderError("GROQ_API_KEY is required when LLM_PROVIDER=groq");
    }
    return new GroqChatJsonProvider({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_CHAT_MODEL
    });
  }

  return new FixtureLlmProvider();
}

const openAIChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable()
      })
    })
  )
});

function parseChatCompletionJson(providerName: string, payload: unknown): unknown {
  const parsed = openAIChatCompletionSchema.parse(payload);
  const content = parsed.choices[0]?.message.content;
  if (!content) {
    throw new ExternalProviderError(`${providerName} extraction response did not contain JSON content`);
  }

  return parseJsonFromModelContent(providerName, content);
}

function parseJsonFromModelContent(providerName: string, content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const extracted = extractFirstJsonObject(content);
    if (extracted) {
      try {
        return JSON.parse(extracted) as unknown;
      } catch (error) {
        throw new ExternalProviderError(`${providerName} extraction response contained malformed JSON`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    throw new ExternalProviderError(`${providerName} extraction response was not valid JSON`, {
      preview: content.slice(0, 500)
    });
  }
}

function extractFirstJsonObject(content: string): string | null {
  const fencedJson = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = fencedJson?.[1]?.trim() ?? content;
  const start = candidate.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const character = candidate[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return null;
}

function shouldRetryGroqWithoutJsonMode(status: number, body: string): boolean {
  return status === 400 && body.includes("json_validate_failed");
}

function isGroqReasoningModel(model: string): boolean {
  return model.startsWith("openai/gpt-oss");
}

function isPlainJsonParseFailure(error: unknown): boolean {
  return (
    error instanceof ExternalProviderError &&
    (error.message.includes("not valid JSON") ||
      error.message.includes("malformed JSON") ||
      error.message.includes("did not contain JSON content"))
  );
}

function getGroqRetryDelayMs(retryAfter: string | null, body: string, attempt: number): number {
  const headerDelay = parseRetryAfterHeaderMs(retryAfter);
  if (headerDelay !== null) {
    return headerDelay;
  }

  const bodyDelay = parseGroqRetryDelayFromBodyMs(body);
  if (bodyDelay !== null) {
    return bodyDelay;
  }

  return Math.min(60_000, 10_000 * attempt);
}

function parseRetryAfterHeaderMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return null;
}

function parseGroqRetryDelayFromBodyMs(body: string): number | null {
  const match = /try again in\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?|m|min|minutes?)/i.exec(body);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2]?.toLowerCase() ?? "s";
  if (unit.startsWith("m") && unit !== "ms") {
    return value * 60_000;
  }
  if (unit === "ms" || unit.startsWith("millisecond")) {
    return value;
  }
  return value * 1_000;
}

function sanitizeProviderErrorBody(body: string): string {
  return body.slice(0, 2_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const fixturePromptSchema = z.object({
  source: z.object({
    sourceName: z.string(),
    title: z.string(),
    body: z.string(),
    startLine: z.number(),
    endLine: z.number()
  })
});

function firstMeaningfulLine(body: string): string | null {
  return body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"))
    ?? null;
}

function normalizeSentence(value: string): string {
  const trimmed = value.replace(/^[-*]\s+/, "").trim();
  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

function inferConceptType(title: string, body: string): ExtractionOutput["concepts"][number]["type"] {
  const text = `${title} ${body}`.toLowerCase();
  if (text.includes("api") || text.includes("endpoint")) {
    return "api";
  }
  if (text.includes("policy") || text.includes("must") || text.includes("required")) {
    return "policy";
  }
  if (text.includes("process") || text.includes("workflow")) {
    return "process";
  }
  if (text.includes("service") || text.includes("system")) {
    return "system";
  }
  return "other";
}

function inferTags(title: string, body: string): string[] {
  const text = `${title} ${body}`.toLowerCase();
  const tags = new Set<string>();
  for (const tag of ["security", "backend", "frontend", "api", "mobile", "authentication", "database"]) {
    if (text.includes(tag)) {
      tags.add(tag);
    }
  }
  return [...tags];
}
