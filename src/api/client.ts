import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import { ApiAuthenticationError, ApiRateLimitError, ApiTimeoutError, ProviderResponseError } from "./errors.js";
import type { CompletionOptions, NormalizedCompletionResponse, ToolCall } from "./types.js";
import { retry } from "../utils/retry.js";
import { Semaphore } from "../utils/semaphore.js";
import { FixedWindowRateLimiter } from "../utils/rate-limit.js";
import { secureMessages } from "../utils/prompt-security.js";

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

export class ApiClient {
  private readonly semaphore: Semaphore;
  private readonly providerLimiter: FixedWindowRateLimiter | undefined;

  constructor(
    private readonly config: Config,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.semaphore = new Semaphore(config.maxConcurrentRequests ?? 3);
    const perMinute = config.providerRateLimitPerMinute ?? 0;
    this.providerLimiter = perMinute > 0 ? new FixedWindowRateLimiter(perMinute, 60_000) : undefined;
  }

  async complete(options: CompletionOptions): Promise<NormalizedCompletionResponse> {
    const rate = this.providerLimiter?.check("provider");
    if (rate && !rate.allowed) {
      throw new ApiRateLimitError(`Local provider rate limit exceeded. Retry after ${rate.retryAfterSeconds} seconds.`);
    }

    const release = await this.semaphore.acquire();
    const requestId = randomUUID();
    const started = Date.now();
    const deadline = started + (this.config.timeoutMs ?? 120_000);
    try {
      const run = await retry(() => this.request(options, deadline), {
        retries: this.config.maxRetries ?? 0,
        baseDelayMs: this.config.retryBaseDelayMs ?? 500,
        deadline,
        shouldRetry: (error) =>
          (error instanceof ProviderResponseError && [502, 503, 504].includes(error.status ?? 0)) || error instanceof ApiRateLimitError,
      });
      return this.normalize(run.value, options, requestId, Date.now() - started, run.retries);
    } finally {
      release();
    }
  }

  private async request(options: CompletionOptions, deadline: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    const body: Record<string, unknown> = {
      model: options.model,
      messages: secureMessages(options.messages),
      max_tokens: this.config.maxOutputTokens ?? 8192,
      stream: false,
    };
    if (options.enableReasoning) {
      if (this.config.provider === "openrouter") {
        body.reasoning = { enabled: true, ...(options.reasoningBudget ? { max_tokens: options.reasoningBudget } : {}), exclude: true };
      } else {
        body.thinking = { type: "enabled" };
      }
    }
    if (options.tools?.length) body.tools = options.tools;
    if (options.responseJson) body.response_format = { type: "json_object" };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream;q=0.8",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.provider === "openrouter") {
      if (this.config.appName) headers["X-Title"] = this.config.appName;
      if (this.config.appUrl) headers["HTTP-Referer"] = this.config.appUrl;
    }

    let response: Response;
    try {
      response = await this.fetchFn(this.config.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new ApiTimeoutError();
      throw new ProviderResponseError("Unable to reach the provider.");
    } finally {
      clearTimeout(timer);
    }

    const payload = await parseProviderPayload(response);
    if (!response.ok) {
      const message = providerMessage(payload) ?? `Provider request failed (${response.status}).`;
      if (response.status === 401 || response.status === 403) throw new ApiAuthenticationError();
      if (response.status === 429) throw new ApiRateLimitError(message);
      throw new ProviderResponseError(message, response.status);
    }
    return payload;
  }

  private normalize(
    payload: unknown,
    options: CompletionOptions,
    requestId: string,
    durationMs: number,
    retryCount: number,
  ): NormalizedCompletionResponse {
    const root = record(payload);
    const choices = root && Array.isArray(root.choices) ? root.choices : [];
    const first = record(choices[0]);
    const message = first && record(first.message);
    const content = message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    const calls = normalizeToolCalls(message);
    if (!text && !calls.length) throw new ProviderResponseError("Provider returned an empty or malformed assistant response.");

    const usageRoot = record(root?.usage);
    const promptTokens = usageRoot ? num(usageRoot.prompt_tokens) : undefined;
    const completionTokens = usageRoot ? num(usageRoot.completion_tokens) : undefined;
    const totalTokens = usageRoot ? num(usageRoot.total_tokens) : undefined;
    const reasoningTokens = usageRoot ? num(usageRoot.reasoning_tokens) : undefined;
    const usage = usageRoot
      ? {
          ...(promptTokens !== undefined ? { promptTokens } : {}),
          ...(completionTokens !== undefined ? { completionTokens } : {}),
          ...(totalTokens !== undefined ? { totalTokens } : {}),
          ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        }
      : undefined;

    return {
      text,
      model: typeof root?.model === "string" ? root.model : options.model,
      provider: this.config.provider,
      requestId,
      durationMs,
      retryCount,
      ...(typeof first?.finish_reason === "string" ? { finishReason: first.finish_reason } : {}),
      ...(usage && Object.keys(usage).length ? { usage } : {}),
      ...(calls.length ? { toolCalls: calls } : {}),
      ...(root ? { rawMetadata: { id: root.id, created: root.created } } : {}),
    };
  }
}

function normalizeToolCalls(message: Record<string, unknown> | undefined): ToolCall[] {
  return message && Array.isArray(message.tool_calls)
    ? message.tool_calls.flatMap((value) => {
        const call = record(value);
        const fn = record(call?.function);
        return typeof call?.id === "string" && typeof fn?.name === "string" && typeof fn?.arguments === "string"
          ? [{ id: call.id, name: fn.name, arguments: fn.arguments }]
          : [];
      })
    : [];
}

async function parseProviderPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.text().catch(() => "");
  if (!text.trim()) return undefined;
  if (contentType.includes("text/event-stream") || text.trimStart().startsWith("data:")) {
    return parseSsePayload(text);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 1000) };
  }
}

function parseSsePayload(text: string): unknown {
  const contentParts: string[] = [];
  const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>();
  let model: string | undefined;
  let id: string | undefined;
  let created: unknown;
  let finishReason: string | undefined;
  let usage: unknown;
  let errorPayload: unknown;

  for (const event of text.split(/\n\n+/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      continue;
    }
    const root = record(parsed);
    if (!root) continue;
    if (root.error) {
      errorPayload = root;
      continue;
    }
    if (typeof root.model === "string") model = root.model;
    if (typeof root.id === "string") id = root.id;
    if (root.created !== undefined) created = root.created;
    if (root.usage !== undefined) usage = root.usage;
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const first = record(choices[0]);
    if (!first) continue;
    if (typeof first.finish_reason === "string") finishReason = first.finish_reason;
    const delta = record(first.delta) ?? record(first.message);
    const deltaContent = delta?.content;
    if (typeof deltaContent === "string") contentParts.push(deltaContent);
    if (Array.isArray(delta?.tool_calls)) {
      for (const raw of delta.tool_calls) {
        const call = record(raw);
        if (!call) continue;
        const index = typeof call.index === "number" ? call.index : toolCalls.size;
        const existing = toolCalls.get(index) ?? { arguments: "" };
        if (typeof call.id === "string") existing.id = call.id;
        const fn = record(call.function);
        if (typeof fn?.name === "string") existing.name = `${existing.name ?? ""}${fn.name}`;
        if (typeof fn?.arguments === "string") existing.arguments += fn.arguments;
        toolCalls.set(index, existing);
      }
    }
  }

  if (errorPayload) return errorPayload;
  return {
    ...(id ? { id } : {}),
    ...(model ? { model } : {}),
    ...(created !== undefined ? { created } : {}),
    choices: [
      {
        message: {
          content: contentParts.join(""),
          ...(toolCalls.size
            ? {
                tool_calls: [...toolCalls.values()].flatMap((call, index) =>
                  call.id && call.name ? [{ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } }] : [],
                ),
              }
            : {}),
        },
        ...(finishReason ? { finish_reason: finishReason } : {}),
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

function providerMessage(payload: unknown): string | undefined {
  const root = record(payload);
  const error = record(root?.error);
  return typeof error?.message === "string" ? error.message : typeof root?.message === "string" ? root.message : undefined;
}
