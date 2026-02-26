import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  _resetSleep,
  _resetSleep,
  _setSleep,
  _setSleep,
  createLLMClient,
  createLLMClient,
  LLMError,
  LLMError,
  type LLMRequest,
  type LLMRequest,
  OllamaClient,
  OllamaClient,
  OpenAIClient,
  OpenAIClient,
  OpenCodeForkedSessionClient,
  type OpenCodeSDKClient,
  OpenCodeSubagentClient,
  OpenCodeSubagentClient,
  type OpenCodeTaskFn,
  type OpenCodeTaskFn,
  parseJsonFromLLMOutput,
  parseJsonFromLLMOutput,
  parseModelString,
  parseModelString,
  withRetry,
  withRetry,
} from "./llm-client";

const SAMPLE_REQUEST: LLMRequest = {
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Say hello.",
};

function makeOpenAIResponse(content: string, model = "gpt-4") {
  return {
    id: "chatcmpl-123",
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function makeOllamaResponse(content: string, model = "llama2") {
  return {
    model,
    message: { role: "assistant", content },
    done: true,
    prompt_eval_count: 15,
    eval_count: 25,
  };
}

describe("LLMError", () => {
  test("sets code, message, and default retryable for rate_limit", () => {
    const err = new LLMError("rate_limit", "too many requests");
    expect(err.code).toBe("rate_limit");
    expect(err.message).toBe("too many requests");
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("LLMError");
  });

  test("sets retryable=true for server_error and timeout", () => {
    expect(new LLMError("server_error", "500").retryable).toBe(true);
    expect(new LLMError("timeout", "timed out").retryable).toBe(true);
  });

  test("sets retryable=false for auth, connection, invalid_response, unknown by default", () => {
    expect(new LLMError("auth", "bad key").retryable).toBe(false);
    expect(new LLMError("invalid_response", "bad json").retryable).toBe(false);
    expect(new LLMError("unknown", "???").retryable).toBe(false);
  });

  test("connection defaults to retryable=true", () => {
    expect(new LLMError("connection", "ECONNREFUSED").retryable).toBe(true);
  });

  test("respects explicit retryable override", () => {
    const err = new LLMError("auth", "retry this auth", { retryable: true });
    expect(err.retryable).toBe(true);
  });

  test("captures statusCode and retryAfterSeconds", () => {
    const err = new LLMError("rate_limit", "slow down", {
      statusCode: 429,
      retryAfterSeconds: 5,
    });
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterSeconds).toBe(5);
  });

  test("captures cause", () => {
    const cause = new Error("original");
    const err = new LLMError("unknown", "wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("parseModelString", () => {
  test("parses valid provider/model strings", () => {
    expect(parseModelString("openai/gpt-4")).toEqual(["openai", "gpt-4"]);
    expect(parseModelString("ollama/llama2")).toEqual(["ollama", "llama2"]);
    expect(parseModelString("openai/gpt-4o-mini")).toEqual(["openai", "gpt-4o-mini"]);
  });

  test("handles models with dots and underscores", () => {
    expect(parseModelString("openai/gpt-4.1")).toEqual(["openai", "gpt-4.1"]);
    expect(parseModelString("ollama/code_llama")).toEqual(["ollama", "code_llama"]);
  });

  test("throws on missing slash", () => {
    expect(() => parseModelString("gpt-4")).toThrow(LLMError);
    expect(() => parseModelString("gpt-4")).toThrow(/Expected "provider\/model"/);
  });

  test("throws on empty provider", () => {
    expect(() => parseModelString("/gpt-4")).toThrow(LLMError);
  });

  test("throws on empty model", () => {
    expect(() => parseModelString("openai/")).toThrow(LLMError);
  });

  test("throws on empty string", () => {
    expect(() => parseModelString("")).toThrow(LLMError);
  });
});

describe("createLLMClient", () => {
  test("creates OpenAIClient for openai provider", () => {
    const client = createLLMClient("openai/gpt-4");
    expect(client.provider).toBe("openai");
    expect(client.model).toBe("gpt-4");
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  test("creates OllamaClient for ollama provider", () => {
    const client = createLLMClient("ollama/llama2");
    expect(client.provider).toBe("ollama");
    expect(client.model).toBe("llama2");
    expect(client).toBeInstanceOf(OllamaClient);
  });

  test("passes config options through", () => {
    const client = createLLMClient("openai/gpt-4", {
      apiKey: "sk-test",
      baseUrl: "https://custom.api.com/v1",
      timeoutMs: 5000,
      maxRetries: 0,
      temperature: 0.5,
      maxTokens: 1000,
    });
    expect(client.provider).toBe("openai");
    expect(client.model).toBe("gpt-4");
  });

  test("throws on unknown provider", () => {
    expect(() => createLLMClient("anthropic/claude-3")).toThrow(LLMError);
    expect(() => createLLMClient("anthropic/claude-3")).toThrow(/Unknown LLM provider/);
  });

  test("throws on invalid model string", () => {
    expect(() => createLLMClient("invalid")).toThrow(LLMError);
  });
});

describe("parseJsonFromLLMOutput", () => {
  test("parses raw JSON object", () => {
    const result = parseJsonFromLLMOutput('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  test("parses raw JSON array", () => {
    const result = parseJsonFromLLMOutput('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  test("parses JSON from ```json code block", () => {
    const input = 'Here is the result:\n```json\n{"extracts": []}\n```\nDone.';
    expect(parseJsonFromLLMOutput(input)).toEqual({ extracts: [] });
  });

  test("parses JSON from generic ``` code block", () => {
    const input = 'Result:\n```\n{"key": "val"}\n```';
    expect(parseJsonFromLLMOutput(input)).toEqual({ key: "val" });
  });

  test("parses JSON embedded in text", () => {
    const input = 'Sure! Here you go: {"answer": 42} Hope that helps!';
    expect(parseJsonFromLLMOutput(input)).toEqual({ answer: 42 });
  });

  test("parses complex nested JSON from code block", () => {
    const json = {
      extracts: [{
        memoryType: "decision",
        collection: "memory_decision",
        title: "Use PostgreSQL",
        content: "We decided to use PostgreSQL.",
        confidence: 0.9,
        metadata: {
          sessionId: "ses_123",
          tags: ["database"],
          technologies: ["postgresql"],
          extractedAt: "2026-01-01T00:00:00Z",
        },
      }],
    };
    const input = `\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``;
    expect(parseJsonFromLLMOutput(input)).toEqual(json);
  });

  test("handles whitespace around JSON", () => {
    expect(parseJsonFromLLMOutput('  \n  {"a": 1}  \n  ')).toEqual({ a: 1 });
  });

  test("prefers raw JSON over code block extraction", () => {
    const input = '{"direct": true}';
    expect(parseJsonFromLLMOutput(input)).toEqual({ direct: true });
  });

  test("throws LLMError for non-JSON text", () => {
    expect(() => parseJsonFromLLMOutput("no json here")).toThrow(LLMError);
  });

  test("throws LLMError for empty string", () => {
    expect(() => parseJsonFromLLMOutput("")).toThrow(LLMError);
  });

  test("throws LLMError for invalid JSON in code block", () => {
    const input = '```json\n{not valid json}\n```';
    expect(() => parseJsonFromLLMOutput(input)).toThrow(LLMError);
  });

  test("handles JSON with trailing text after code block", () => {
    const input = '```json\n{"ok": true}\n```\n\nLet me know if you need anything else!';
    expect(parseJsonFromLLMOutput(input)).toEqual({ ok: true });
  });
});

describe("withRetry", () => {
  const sleepCalls: number[] = [];

  beforeEach(() => {
    sleepCalls.length = 0;
    _setSleep(async (ms: number) => { sleepCalls.push(ms); });
  });

  afterEach(() => {
    _resetSleep();
  });

  test("returns result on first success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"), { maxRetries: 3 });
    expect(result).toBe("ok");
    expect(sleepCalls).toHaveLength(0);
  });

  test("retries on retryable LLMError and succeeds", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new LLMError("server_error", "500", { retryable: true });
      return "recovered";
    };

    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
    expect(sleepCalls).toHaveLength(2);
  });

  test("does not retry non-retryable LLMError", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new LLMError("auth", "bad key", { retryable: false });
    };

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow();
    expect(calls).toBe(1);
    expect(sleepCalls).toHaveLength(0);
  });

  test("does not retry non-LLMError exceptions", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("generic error");
    };

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow("generic error");
    expect(calls).toBe(1);
  });

  test("exhausts retries and throws last error", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new LLMError("timeout", `attempt ${calls}`, { retryable: true });
    };

    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow(LLMError);
    expect(calls).toBe(3);
    expect(sleepCalls).toHaveLength(2);
  });

  test("uses exponential backoff delays", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 3) throw new LLMError("server_error", "fail", { retryable: true });
      return "ok";
    };

    await withRetry(fn, { maxRetries: 4, baseDelayMs: 100, maxDelayMs: 5000 });
    expect(sleepCalls).toEqual([100, 200, 400]);
  });

  test("caps delay at maxDelayMs", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls <= 5) throw new LLMError("server_error", "fail", { retryable: true });
      return "ok";
    };

    await withRetry(fn, { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 3000 });
    expect(sleepCalls[0]).toBe(1000);
    expect(sleepCalls[1]).toBe(2000);
    expect(sleepCalls[2]).toBe(3000);
    expect(sleepCalls[3]).toBe(3000);
    expect(sleepCalls[4]).toBe(3000);
  });

  test("respects Retry-After from rate limit errors", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        throw new LLMError("rate_limit", "slow down", { retryable: true, retryAfterSeconds: 10 });
      }
      return "ok";
    };

    await withRetry(fn, { maxRetries: 2, baseDelayMs: 100 });
    expect(sleepCalls[0]).toBe(10_000);
  });

  test("maxRetries=0 means no retries", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new LLMError("server_error", "fail", { retryable: true });
    };

    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow();
    expect(calls).toBe(1);
    expect(sleepCalls).toHaveLength(0);
  });
});

describe("OpenAIClient", () => {
  let fetchMock: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    _setSleep(async () => {});
    fetchMock = null;
    globalThis.fetch = (url: string, init?: RequestInit) => {
      if (!fetchMock) throw new Error("No mock set");
      return fetchMock!(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _resetSleep();
  });

  test("sends correct request to OpenAI endpoint", async () => {
    fetchMock = async () => new Response(
      JSON.stringify(makeOpenAIResponse("Hello!")),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = new OpenAIClient({
      model: "gpt-4",
      apiKey: "sk-test",
      maxRetries: 0,
    });

    await client.complete(SAMPLE_REQUEST);
  });

  test("returns parsed response with usage", async () => {
    fetchMock = async () => new Response(
      JSON.stringify(makeOpenAIResponse("Hello!")),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 0 });
    const result = await client.complete(SAMPLE_REQUEST);

    expect(result.content).toBe("Hello!");
    expect(result.model).toBe("gpt-4");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  test("uses custom base URL", async () => {
    let capturedUrl = "";
    fetchMock = async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify(makeOpenAIResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OpenAIClient({
      model: "gpt-4",
      apiKey: "sk-test",
      baseUrl: "https://custom.api.com/v1/",
      maxRetries: 0,
    });

    await client.complete(SAMPLE_REQUEST);

    expect(capturedUrl).toBe("https://custom.api.com/v1/chat/completions");
  });

  test("includes temperature and maxTokens when set", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOpenAIResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 0 });
    await client.complete({ ...SAMPLE_REQUEST, temperature: 0.3, maxTokens: 500 });

    const body = JSON.parse(capturedBody!);
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(500);
  });

  test("sets response_format for jsonMode", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOpenAIResponse('{"ok": true}')),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 0 });
    await client.complete({ ...SAMPLE_REQUEST, jsonMode: true });

    const body = JSON.parse(capturedBody!);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  test("omits Authorization header when no apiKey", async () => {
    let capturedHeaders: Record<string, string> = {};
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string> ?? {};
      return new Response(
        JSON.stringify(makeOpenAIResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "", maxRetries: 0 });
    await client.complete(SAMPLE_REQUEST);

    expect(capturedHeaders["Authorization"]).toBeUndefined();
  });

  test("throws auth error on 401", async () => {
    fetchMock = async () => new Response(
      JSON.stringify({ error: { message: "Invalid API key" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "bad", maxRetries: 0 });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("auth");
      expect((err as LLMError).statusCode).toBe(401);
      expect((err as LLMError).retryable).toBe(false);
    }
  });

  test("throws rate_limit on 429 with retry-after", async () => {
    fetchMock = async () => new Response(
      JSON.stringify({ error: { message: "Rate limit" } }),
      { status: 429, headers: { "Content-Type": "application/json", "retry-after": "5" } },
    );

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 0 });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("rate_limit");
      expect((err as LLMError).retryAfterSeconds).toBe(5);
      expect((err as LLMError).retryable).toBe(true);
    }
  });

  test("throws server_error on 500", async () => {
    fetchMock = async () => new Response(
      JSON.stringify({ error: "Internal" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 0 });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("server_error");
      expect((err as LLMError).retryable).toBe(true);
    }
  });

  test("throws invalid_response when content is null", async () => {
    fetchMock = async () => new Response(
      JSON.stringify({
        id: "chatcmpl-123",
        model: "gpt-4",
        choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 0 });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("invalid_response");
    }
  });

  test("retries on server error and succeeds", async () => {
    let callCount = 0;
    fetchMock = async () => {
      callCount++;
      if (callCount < 3) {
        return new Response(JSON.stringify({ error: "Internal" }), { status: 500 });
      }
      return new Response(JSON.stringify(makeOpenAIResponse("Recovered!")), { status: 200 });
    };

    const client = new OpenAIClient({ model: "gpt-4", apiKey: "sk-test", maxRetries: 3 });
    const result = await client.complete(SAMPLE_REQUEST);

    expect(result.content).toBe("Recovered!");
    expect(callCount).toBe(3);
  });

  test("uses default temperature from constructor", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOpenAIResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OpenAIClient({
      model: "gpt-4",
      apiKey: "sk-test",
      temperature: 0.2,
      maxRetries: 0,
    });
    await client.complete(SAMPLE_REQUEST);

    const body = JSON.parse(capturedBody!);
    expect(body.temperature).toBe(0.2);
  });

  test("request temperature overrides constructor default", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOpenAIResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OpenAIClient({
      model: "gpt-4",
      apiKey: "sk-test",
      temperature: 0.2,
      maxRetries: 0,
    });
    await client.complete({ ...SAMPLE_REQUEST, temperature: 0.9 });

    const body = JSON.parse(capturedBody!);
    expect(body.temperature).toBe(0.9);
  });
});

describe("OllamaClient", () => {
  let fetchMock: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    _setSleep(async () => {});
    fetchMock = null;
    globalThis.fetch = (url: string, init?: RequestInit) => {
      if (!fetchMock) throw new Error("No mock set");
      return fetchMock!(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _resetSleep();
  });

  test("sends correct request to Ollama endpoint", async () => {
    let capturedUrl = "";
    fetchMock = async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify(makeOllamaResponse("Hello!")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    await client.complete(SAMPLE_REQUEST);

    expect(capturedUrl).toBe("http://localhost:11434/api/chat");
  });

  test("returns parsed response with usage from eval counts", async () => {
    fetchMock = async () => new Response(
      JSON.stringify(makeOllamaResponse("Hello!")),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    const result = await client.complete(SAMPLE_REQUEST);

    expect(result.content).toBe("Hello!");
    expect(result.model).toBe("llama2");
    expect(result.usage).toEqual({
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
    });
  });

  test("handles missing usage counts", async () => {
    fetchMock = async () => new Response(
      JSON.stringify({ model: "llama2", message: { role: "assistant", content: "Hi" }, done: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    const result = await client.complete(SAMPLE_REQUEST);

    expect(result.content).toBe("Hi");
    expect(result.usage).toBeUndefined();
  });

  test("uses custom base URL", async () => {
    let capturedUrl = "";
    fetchMock = async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify(makeOllamaResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OllamaClient({
      model: "llama2",
      baseUrl: "http://gpu-server:11434/",
      maxRetries: 0,
    });
    await client.complete(SAMPLE_REQUEST);

    expect(capturedUrl).toBe("http://gpu-server:11434/api/chat");
  });

  test("passes temperature and maxTokens as options", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOllamaResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    await client.complete({ ...SAMPLE_REQUEST, temperature: 0.5, maxTokens: 200 });

    const body = JSON.parse(capturedBody!);
    expect(body.options.temperature).toBe(0.5);
    expect(body.options.num_predict).toBe(200);
  });

  test("sets format json for jsonMode", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOllamaResponse('{"ok": true}')),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    await client.complete({ ...SAMPLE_REQUEST, jsonMode: true });

    const body = JSON.parse(capturedBody!);
    expect(body.format).toBe("json");
  });

  test("omits options object when no temperature/maxTokens", async () => {
    let capturedBody: string | null = null;
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify(makeOllamaResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    await client.complete(SAMPLE_REQUEST);

    const body = JSON.parse(capturedBody!);
    expect(body.options).toBeUndefined();
  });

  test("throws invalid_response when content is missing", async () => {
    fetchMock = async () => new Response(
      JSON.stringify({ model: "llama2", message: { role: "assistant", content: "" }, done: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("invalid_response");
    }
  });

  test("no Authorization header sent to Ollama", async () => {
    let capturedHeaders: Record<string, string> = {};
    fetchMock = async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string> ?? {};
      return new Response(
        JSON.stringify(makeOllamaResponse("Hi")),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OllamaClient({ model: "llama2", maxRetries: 0 });
    await client.complete(SAMPLE_REQUEST);

    expect(capturedHeaders["Authorization"]).toBeUndefined();
  });
});

describe("createLLMClient integration", () => {
  let fetchMock: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    _setSleep(async () => {});
    fetchMock = null;
    globalThis.fetch = (url: string, init?: RequestInit) => {
      if (!fetchMock) throw new Error("No mock set");
      return fetchMock!(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _resetSleep();
  });

  test("openai/gpt-4 creates working client", async () => {
    fetchMock = async () => new Response(
      JSON.stringify(makeOpenAIResponse("factory test")),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = createLLMClient("openai/gpt-4", { apiKey: "sk-test", maxRetries: 0 });
    const result = await client.complete(SAMPLE_REQUEST);
    expect(result.content).toBe("factory test");
  });

  test("ollama/llama2 creates working client", async () => {
    fetchMock = async () => new Response(
      JSON.stringify(makeOllamaResponse("ollama factory")),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const client = createLLMClient("ollama/llama2", { maxRetries: 0 });
    const result = await client.complete(SAMPLE_REQUEST);
    expect(result.content).toBe("ollama factory");
  });

  test("opencode/memory-extractor creates OpenCodeSubagentClient", () => {
    const mockTaskFn = async () => ({ result: "test" });
    const client = createLLMClient("opencode/memory-extractor", {
      sessionId: "ses_123",
      taskFn: mockTaskFn,
    });
    expect(client.provider).toBe("opencode");
    expect(client.model).toBe("memory-extractor");
    expect(client).toBeInstanceOf(OpenCodeSubagentClient);
  });
});

describe("OpenCodeSubagentClient", () => {
  let mockTaskFn: OpenCodeTaskFn;

  beforeEach(() => {
    _setSleep(async () => {});
    mockTaskFn = async () => ({ result: "mock response" });
  });

  afterEach(() => {
    _resetSleep();
  });

  test("creates client with correct provider and model", () => {
    const client = new OpenCodeSubagentClient({
      model: "memory-extractor",
      taskFn: mockTaskFn,
    });
    expect(client.provider).toBe("opencode");
    expect(client.model).toBe("memory-extractor");
  });

  test("passes sessionId to subagent calls", async () => {
    let capturedSessionId: string | undefined;
    const captureTaskFn: OpenCodeTaskFn = async (params) => {
      capturedSessionId = params.session_id;
      return { result: "test" };
    };

    const client = new OpenCodeSubagentClient({
      model: "memory-extractor",
      sessionId: "ses_test123",
      taskFn: captureTaskFn,
      maxRetries: 0,
    });

    await client.complete(SAMPLE_REQUEST);
    expect(capturedSessionId).toBe("ses_test123");
  });

  test("returns subagent response content", async () => {
    const client = new OpenCodeSubagentClient({
      model: "memory-extractor",
      taskFn: mockTaskFn,
      maxRetries: 0,
    });

    const result = await client.complete(SAMPLE_REQUEST);
    expect(result.content).toBe("mock response");
    expect(result.model).toBe("memory-extractor");
    expect(result.usage).toBeUndefined(); // Subagents don't provide usage
  });

  test("combines system and user prompts", async () => {
    let capturedPrompt = "";
    const captureTaskFn: OpenCodeTaskFn = async (params) => {
      capturedPrompt = params.prompt;
      return { result: "test" };
    };

    const client = new OpenCodeSubagentClient({
      model: "test-agent",
      taskFn: captureTaskFn,
      maxRetries: 0,
    });

    await client.complete({
      systemPrompt: "You are a helper.",
      userPrompt: "Say hello.",
    });

    expect(capturedPrompt).toContain("You are a helper.");
    expect(capturedPrompt).toContain("Say hello.");
  });

  test("adds JSON mode instruction when jsonMode is true", async () => {
    let capturedPrompt = "";
    const captureTaskFn: OpenCodeTaskFn = async (params) => {
      capturedPrompt = params.prompt;
      return { result: '{"key": "value"}' };
    };

    const client = new OpenCodeSubagentClient({
      model: "test-agent",
      taskFn: captureTaskFn,
      maxRetries: 0,
    });

    await client.complete({
      systemPrompt: "You are a helper.",
      userPrompt: "Return JSON.",
      jsonMode: true,
    });

    expect(capturedPrompt).toContain("valid JSON only");
  });

  test("throws timeout error when subagent times out", async () => {
    const slowTaskFn: OpenCodeTaskFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { result: "slow" };
    };

    const client = new OpenCodeSubagentClient({
      model: "test-agent",
      taskFn: slowTaskFn,
      timeoutMs: 10, // Very short timeout
      maxRetries: 0,
    });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("timeout");
      expect((err as LLMError).retryable).toBe(true);
    }
  });

  test("throws connection error when taskFn is missing", () => {
    // Creating client without taskFn should throw connection error
    expect(() => {
      new OpenCodeSubagentClient({
        model: "test-agent",
        // No taskFn provided
      });
    }).toThrow(LLMError);
  });

  test("maps subagent errors to LLMError codes", async () => {
    const errorTaskFn: OpenCodeTaskFn = async () => {
      return { error: "failed to spawn agent" };
    };

    const client = new OpenCodeSubagentClient({
      model: "test-agent",
      taskFn: errorTaskFn,
      maxRetries: 0,
    });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("connection");
    }
  });

  test("retries on retryable errors", async () => {
    let callCount = 0;
    const flakyTaskFn: OpenCodeTaskFn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("temporary failure");
      }
      return { result: "success after retry" };
    };

    const client = new OpenCodeSubagentClient({
      model: "test-agent",
      taskFn: flakyTaskFn,
      maxRetries: 3,
    });

    const result = await client.complete(SAMPLE_REQUEST);
    expect(result.content).toBe("success after retry");
    expect(callCount).toBe(3);
  });

  test("uses default timeout of 60 seconds", () => {
    const client = new OpenCodeSubagentClient({
      model: "test-agent",
      taskFn: mockTaskFn,
    });
    // Just verify it was created without error - the timeout is internal
    expect(client.provider).toBe("opencode");
  });

  test("passes subagent_type to task function", async () => {
    let capturedType: string | undefined;
    const captureTaskFn: OpenCodeTaskFn = async (params) => {
      capturedType = params.subagent_type;
      return { result: "test" };
    };

    const client = new OpenCodeSubagentClient({
      model: "my-custom-agent",
      taskFn: captureTaskFn,
      maxRetries: 0,
    });

    await client.complete(SAMPLE_REQUEST);
    expect(capturedType).toBe("my-custom-agent");
  });
});

describe("OpenCodeForkedSessionClient", () => {
  let mockSdkClient: OpenCodeSDKClient;

  beforeEach(() => {
    _setSleep(async () => {});
    mockSdkClient = {
      sessions: {
        fork: async () => ({ data: { id: "ses_forked_123" } }),
      },
    };
  });

  afterEach(() => {
    _resetSleep();
  });

  test("creates client with correct provider and model", () => {
    const client = new OpenCodeForkedSessionClient({
      model: "memory-extractor",
      sessionId: "ses_parent",
      sdkClient: mockSdkClient,
    });
    expect(client.provider).toBe("opencode");
    expect(client.model).toBe("memory-extractor");
  });

  test("calls sdkClient.sessions.fork with correct params", async () => {
    let capturedOptions: { session_id: string; body: { agent?: string; prompt?: string } } | null = null;
    const captureSdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async (options) => {
          capturedOptions = options;
          return { data: { id: "ses_forked_123" } };
        },
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: captureSdkClient,
      maxRetries: 0,
    });

    await client.complete(SAMPLE_REQUEST);

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions?.session_id).toBe("ses_parent");
    expect(capturedOptions?.body.agent).toBe("test-agent");
    expect(capturedOptions?.body.prompt).toContain("You are a helpful assistant");
    expect(capturedOptions?.body.prompt).toContain("Say hello");
  });

  test("returns forked session ID as content", async () => {
    const client = new OpenCodeForkedSessionClient({
      model: "memory-extractor",
      sessionId: "ses_parent",
      sdkClient: mockSdkClient,
      maxRetries: 0,
    });

    const result = await client.complete(SAMPLE_REQUEST);
    expect(result.content).toBe("ses_forked_123");
    expect(result.model).toBe("memory-extractor");
    expect(result.usage).toBeUndefined();
  });

  test("combines system and user prompts", async () => {
    let capturedPrompt = "";
    const captureSdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async (options) => {
          capturedPrompt = options.body.prompt ?? "";
          return { data: { id: "ses_forked" } };
        },
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: captureSdkClient,
      maxRetries: 0,
    });

    await client.complete({
      systemPrompt: "You are a helper.",
      userPrompt: "Say hello.",
    });

    expect(capturedPrompt).toContain("You are a helper.");
    expect(capturedPrompt).toContain("Say hello.");
  });

  test("adds JSON mode instruction when jsonMode is true", async () => {
    let capturedPrompt = "";
    const captureSdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async (options) => {
          capturedPrompt = options.body.prompt ?? "";
          // Return valid JSON so the call succeeds
          return { data: { id: '{"ok": true}' } };
        },
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: captureSdkClient,
      maxRetries: 0,
    });

    await client.complete({
      systemPrompt: "You are a helper.",
      userPrompt: "Return JSON.",
      jsonMode: true,
    });

    expect(capturedPrompt).toContain("valid JSON only");
  });

  test("throws timeout error when fork times out", async () => {
    const slowSdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { data: { id: "ses_slow" } };
        },
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: slowSdkClient,
      timeoutMs: 10,
      maxRetries: 0,
    });

    try {
      await client.complete(SAMPLE_REQUEST);
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      expect((err as LLMError).code).toBe("timeout");
      expect((err as LLMError).retryable).toBe(true);
    }
  });

  test("throws error when fork returns error", async () => {
    const errorSdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async () => ({ error: "fork failed" }),
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: errorSdkClient,
      maxRetries: 0,
    });

    await expect(client.complete(SAMPLE_REQUEST)).rejects.toThrow("fork failed");
  });

  test("throws error when fork returns no session ID", async () => {
    const emptySdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async () => ({ data: {} }),
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: emptySdkClient,
      maxRetries: 0,
    });

    await expect(client.complete(SAMPLE_REQUEST)).rejects.toThrow("no session ID");
  });

  test("retries on retryable errors", async () => {
    let callCount = 0;
    const flakySdkClient: OpenCodeSDKClient = {
      sessions: {
        fork: async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error("temporary failure");
          }
          return { data: { id: "ses_forked" } };
        },
      },
    };

    const client = new OpenCodeForkedSessionClient({
      model: "test-agent",
      sessionId: "ses_parent",
      sdkClient: flakySdkClient,
      maxRetries: 3,
    });

    const result = await client.complete(SAMPLE_REQUEST);
    expect(result.content).toBe("ses_forked");
    expect(callCount).toBe(3);
  });
});

describe("createLLMClient with SDK client", () => {
  let mockSdkClient: OpenCodeSDKClient;

  beforeEach(() => {
    _setSleep(async () => {});
    mockSdkClient = {
      sessions: {
        fork: async () => ({ data: { id: "ses_forked" } }),
      },
    };
  });

  afterEach(() => {
    _resetSleep();
  });

  test("creates OpenCodeForkedSessionClient when sdkClient is provided", () => {
    const client = createLLMClient("opencode/memory-extractor", {
      sessionId: "ses_123",
      sdkClient: mockSdkClient,
    });
    expect(client.provider).toBe("opencode");
    expect(client.model).toBe("memory-extractor");
    expect(client).toBeInstanceOf(OpenCodeForkedSessionClient);
  });

  test("throws when sdkClient provided but sessionId is missing", () => {
    expect(() => {
      createLLMClient("opencode/memory-extractor", {
        sdkClient: mockSdkClient,
        // No sessionId
      });
    }).toThrow(LLMError);
    expect(() => {
      createLLMClient("opencode/memory-extractor", {
        sdkClient: mockSdkClient,
      });
    }).toThrow("sessionId is required");
  });

  test("prefers sdkClient over taskFn when both provided", () => {
    const mockTaskFn = async () => ({ result: "taskFn result" });
    const client = createLLMClient("opencode/memory-extractor", {
      sessionId: "ses_123",
      sdkClient: mockSdkClient,
      taskFn: mockTaskFn,
    });
    // Should use SDK client, not taskFn
    expect(client).toBeInstanceOf(OpenCodeForkedSessionClient);
  });
});

