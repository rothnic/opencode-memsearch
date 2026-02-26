/**
 * @file llm-client.ts
 * @description Agent execution wrapper for LLM calls (Task 13).
 * Supports multiple providers (OpenAI, Ollama) with configurable timeout,
 * retry with exponential backoff, and JSON extraction from LLM output.
 */

export type LLMErrorCode =
	| "timeout"
	| "rate_limit"
	| "auth"
	| "server_error"
	| "connection"
	| "invalid_response"
	| "unknown";

export class LLMError extends Error {
	readonly code: LLMErrorCode;
	readonly statusCode?: number;
	readonly retryable: boolean;
	readonly retryAfterSeconds?: number;

	constructor(
		code: LLMErrorCode,
		message: string,
		options?: {
			statusCode?: number;
			retryable?: boolean;
			retryAfterSeconds?: number;
			cause?: unknown;
		},
	) {
		super(message, { cause: options?.cause });
		this.name = "LLMError";
		this.code = code;
		this.statusCode = options?.statusCode;
		this.retryAfterSeconds = options?.retryAfterSeconds;
		this.retryable =
			options?.retryable ??
			(code === "rate_limit" ||
				code === "server_error" ||
				code === "timeout" ||
				code === "connection");
	}
}

export interface LLMRequest {
	systemPrompt: string;
	userPrompt: string;
	temperature?: number;
	maxTokens?: number;
	jsonMode?: boolean;
}

export interface LLMUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface LLMResponse {
	content: string;
	usage?: LLMUsage;
	model?: string;
}

export interface LLMClientConfig {
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	timeoutMs?: number;
	maxRetries?: number;
	temperature?: number;
	maxTokens?: number;
}

export interface LLMClient {
	readonly provider: string;
	readonly model: string;
	complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface RetryOptions {
	maxRetries: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;

/**
 * Exponential backoff retry. Only retries LLMError with retryable=true.
 * Respects Retry-After header from rate limit responses.
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions,
): Promise<T> {
	const {
		maxRetries,
		baseDelayMs = DEFAULT_BASE_DELAY_MS,
		maxDelayMs = DEFAULT_MAX_DELAY_MS,
	} = options;

	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;

			if (attempt >= maxRetries) break;
			if (!(err instanceof LLMError) || !err.retryable) break;

			let delayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
			if (err.retryAfterSeconds !== undefined) {
				delayMs = Math.max(delayMs, err.retryAfterSeconds * 1000);
			}

			await sleep(delayMs);
		}
	}

	throw lastError;
}

export let sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function _setSleep(fn: (ms: number) => Promise<void>): void {
	sleep = fn;
}

export function _resetSleep(): void {
	sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract JSON from LLM output. Tries in order:
 * 1. Raw JSON, 2. ```json blocks, 3. ``` blocks, 4. embedded {}/[] anywhere.
 * Throws LLMError("invalid_response") if no valid JSON found.
 */
export function parseJsonFromLLMOutput<T = unknown>(raw: string): T {
	const trimmed = raw.trim();

	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed) as T;
		} catch {
			/* try next strategy */
		}
	}

	const jsonBlockMatch = trimmed.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
	if (jsonBlockMatch?.[1]) {
		try {
			return JSON.parse(jsonBlockMatch[1].trim()) as T;
		} catch {
			/* try next strategy */
		}
	}

	const genericBlockMatch = trimmed.match(/```\s*\n?([\s\S]*?)\n?\s*```/);
	if (genericBlockMatch?.[1]) {
		try {
			return JSON.parse(genericBlockMatch[1].trim()) as T;
		} catch {
			/* try next strategy */
		}
	}

	const jsonObjectMatch = trimmed.match(/(\{[\s\S]*\})/);
	if (jsonObjectMatch?.[1]) {
		try {
			return JSON.parse(jsonObjectMatch[1]) as T;
		} catch {
			/* try next strategy */
		}
	}

	const jsonArrayMatch = trimmed.match(/(\[[\s\S]*\])/);
	if (jsonArrayMatch?.[1]) {
		try {
			return JSON.parse(jsonArrayMatch[1]) as T;
		} catch {
			/* try next strategy */
		}
	}

	throw new LLMError(
		"invalid_response",
		`Failed to extract JSON from LLM output. Raw output starts with: "${trimmed.substring(0, 100)}"`,
	);
}

function classifyHttpError(
	status: number,
	body: string,
	retryAfter?: string | null,
): LLMError {
	const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

	if (status === 401 || status === 403) {
		return new LLMError("auth", `Authentication failed (${status}): ${body}`, {
			statusCode: status,
			retryable: false,
		});
	}
	if (status === 429) {
		return new LLMError("rate_limit", `Rate limited (429): ${body}`, {
			statusCode: status,
			retryable: true,
			retryAfterSeconds:
				retryAfterSeconds && !Number.isNaN(retryAfterSeconds)
					? retryAfterSeconds
					: undefined,
		});
	}
	if (status >= 500) {
		return new LLMError("server_error", `Server error (${status}): ${body}`, {
			statusCode: status,
			retryable: true,
		});
	}

	return new LLMError("unknown", `HTTP ${status}: ${body}`, {
		statusCode: status,
		retryable: false,
	});
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new LLMError("timeout", `Request timed out after ${timeoutMs}ms`, {
				retryable: true,
			});
		}
		throw new LLMError("connection", `Connection failed: ${String(err)}`, {
			retryable: true,
			cause: err,
		});
	} finally {
		clearTimeout(timer);
	}
}

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @deprecated Use OpenCodeSubagentClient instead for OpenCode integration.
 * OpenAIClient makes direct HTTP calls to OpenAI API.
 * Consider using 'opencode/memory-extractor' provider for subagent-based execution.
 */
export class OpenAIClient implements LLMClient {
	readonly provider = "openai";
	readonly model: string;
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly maxRetries: number;
	private readonly defaultTemperature?: number;
	private readonly defaultMaxTokens?: number;

	constructor(config: {
		model: string;
		apiKey?: string;
		baseUrl?: string;
		timeoutMs?: number;
		maxRetries?: number;
		temperature?: number;
		maxTokens?: number;
	}) {
		this.model = config.model;
		this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
		this.baseUrl = (config.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(
			/\/$/,
			"",
		);
		this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.maxRetries = config.maxRetries ?? 2;
		this.defaultTemperature = config.temperature;
		this.defaultMaxTokens = config.maxTokens;
	}

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const temperature = request.temperature ?? this.defaultTemperature;
		const maxTokens = request.maxTokens ?? this.defaultMaxTokens;

		const body: Record<string, unknown> = {
			model: this.model,
			messages: [
				{ role: "system", content: request.systemPrompt },
				{ role: "user", content: request.userPrompt },
			],
		};

		if (temperature !== undefined) body.temperature = temperature;
		if (maxTokens !== undefined) body.max_tokens = maxTokens;
		if (request.jsonMode) body.response_format = { type: "json_object" };

		const url = `${this.baseUrl}/chat/completions`;

		const doRequest = async (): Promise<LLMResponse> => {
			const response = await fetchWithTimeout(
				url,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
					},
					body: JSON.stringify(body),
				},
				this.timeoutMs,
			);

			if (!response.ok) {
				const text = await response.text();
				throw classifyHttpError(
					response.status,
					text,
					response.headers.get("retry-after"),
				);
			}

			const json = (await response.json()) as OpenAIChatResponse;
			const choice = json.choices?.[0];

			if (!choice?.message?.content) {
				throw new LLMError(
					"invalid_response",
					"No content in OpenAI response",
					{ retryable: false },
				);
			}

			return {
				content: choice.message.content,
				model: json.model,
				usage: json.usage
					? {
							promptTokens: json.usage.prompt_tokens,
							completionTokens: json.usage.completion_tokens,
							totalTokens: json.usage.total_tokens,
						}
					: undefined,
			};
		};

		return withRetry(doRequest, { maxRetries: this.maxRetries });
	}
}

interface OpenAIChatResponse {
	id: string;
	model: string;
	choices: Array<{
		index: number;
		message: { role: string; content: string | null };
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
const OLLAMA_DEFAULT_TIMEOUT_MS = 60_000;

/**
 * @deprecated Use OpenCodeSubagentClient instead for OpenCode integration.
 * OllamaClient makes direct HTTP calls to Ollama API.
 * Consider using 'opencode/memory-extractor' provider for subagent-based execution.
 */
export class OllamaClient implements LLMClient {
	readonly provider = "ollama";
	readonly model: string;
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly maxRetries: number;
	private readonly defaultTemperature?: number;
	private readonly defaultMaxTokens?: number;

	constructor(config: {
		model: string;
		baseUrl?: string;
		timeoutMs?: number;
		maxRetries?: number;
		temperature?: number;
		maxTokens?: number;
	}) {
		this.model = config.model;
		this.baseUrl = (
			config.baseUrl ??
			process.env.OLLAMA_HOST ??
			OLLAMA_DEFAULT_BASE_URL
		).replace(/\/$/, "");
		this.timeoutMs = config.timeoutMs ?? OLLAMA_DEFAULT_TIMEOUT_MS;
		this.maxRetries = config.maxRetries ?? 2;
		this.defaultTemperature = config.temperature;
		this.defaultMaxTokens = config.maxTokens;
	}

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const temperature = request.temperature ?? this.defaultTemperature;
		const maxTokens = request.maxTokens ?? this.defaultMaxTokens;

		const body: Record<string, unknown> = {
			model: this.model,
			messages: [
				{ role: "system", content: request.systemPrompt },
				{ role: "user", content: request.userPrompt },
			],
			stream: false,
		};

		const ollamaOptions: Record<string, unknown> = {};
		if (temperature !== undefined) ollamaOptions.temperature = temperature;
		if (maxTokens !== undefined) ollamaOptions.num_predict = maxTokens;
		if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

		if (request.jsonMode) body.format = "json";

		const url = `${this.baseUrl}/api/chat`;

		const doRequest = async (): Promise<LLMResponse> => {
			const response = await fetchWithTimeout(
				url,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
				this.timeoutMs,
			);

			if (!response.ok) {
				const text = await response.text();
				throw classifyHttpError(
					response.status,
					text,
					response.headers.get("retry-after"),
				);
			}

			const json = (await response.json()) as OllamaChatResponse;

			if (!json.message?.content) {
				throw new LLMError(
					"invalid_response",
					"No content in Ollama response",
					{ retryable: false },
				);
			}

			return {
				content: json.message.content,
				model: json.model,
				usage:
					json.prompt_eval_count !== undefined && json.eval_count !== undefined
						? {
								promptTokens: json.prompt_eval_count,
								completionTokens: json.eval_count,
								totalTokens: json.prompt_eval_count + json.eval_count,
							}
						: undefined,
			};
		};

		return withRetry(doRequest, { maxRetries: this.maxRetries });
	}
}

interface OllamaChatResponse {
	model: string;
	message: { role: string; content: string };
	done: boolean;
	total_duration?: number;
	prompt_eval_count?: number;
	eval_count?: number;
}

/**
 * OpenCode SDK client type for session forking.
 * This is the shape of the client passed via PluginInput.
 */
export interface OpenCodeSDKClient {
	sessions: {
		fork: (options: {
			session_id: string;
			message_id?: string;
			body: {
				agent?: string;
				prompt?: string;
			};
		}) => Promise<{
			data?: {
				id?: string;
			};
			error?: string;
		}>;
	};
}

/**
 * Configuration for OpenCodeForkedSessionClient.
 * Uses OpenCode SDK session forking instead of taskFn.
 */
export interface OpenCodeForkedSessionConfig {
	/** The subagent type to spawn (e.g., 'memory-extractor', 'planning-subagent') */
	model: string;
	/** Session ID to fork from (current parent session) */
	sessionId: string;
	/** OpenCode SDK client (from PluginInput) */
	sdkClient: OpenCodeSDKClient;
	/** Timeout for subagent execution in ms */
	timeoutMs?: number;
	/** Max retries for subagent failures */
	maxRetries?: number;
	/** Default temperature for requests */
	temperature?: number;
	/** Default maxTokens for requests */
	maxTokens?: number;
}

/**
 * Client that uses OpenCode SDK session forking to spawn subagents.
 * Creates a forked session from the parent with full context.
 *
 * Usage:
 * ```typescript
 * const client = new OpenCodeForkedSessionClient({
 *   model: 'memory-extractor',
 *   sessionId: 'ses_xxx',
 *   sdkClient: pluginInput.client,
 * });
 * const response = await client.complete({ systemPrompt, userPrompt });
 * ```
 */
export class OpenCodeForkedSessionClient implements LLMClient {
	readonly provider = "opencode";
	readonly model: string;
	private readonly sdkClient: OpenCodeSDKClient;
	private readonly sessionId: string;
	private readonly timeoutMs: number;
	private readonly maxRetries: number;
	private readonly defaultTemperature?: number;
	private readonly defaultMaxTokens?: number;

	constructor(config: OpenCodeForkedSessionConfig) {
		this.model = config.model;
		this.sdkClient = config.sdkClient;
		this.sessionId = config.sessionId;
		this.timeoutMs = config.timeoutMs ?? 60_000;
		this.maxRetries = config.maxRetries ?? 2;
		this.defaultTemperature = config.temperature;
		this.defaultMaxTokens = config.maxTokens;
	}

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const temperature = request.temperature ?? this.defaultTemperature;
		const maxTokens = request.maxTokens ?? this.defaultMaxTokens;

		// Build the prompt combining system and user prompts
		let fullPrompt = request.systemPrompt
			? `${request.systemPrompt}

${request.userPrompt}`
			: request.userPrompt;

		// Add JSON mode instruction if requested
		if (request.jsonMode) {
			fullPrompt += " Please respond with valid JSON only.";
		}

		// Add temperature/maxTokens guidance if specified
		if (temperature !== undefined) {
			fullPrompt += `

Temperature: ${temperature}`;
		}
		if (maxTokens !== undefined) {
			fullPrompt += `

Max tokens: ${maxTokens}`;
		}

		const doRequest = async (): Promise<LLMResponse> => {
			try {
				const result = await this.callForkedSession(fullPrompt);

				// Note: For forked sessions, we don't validate the response as JSON
				// because the response is the session ID (string), not JSON content.
				// The JSON mode instruction is added to the prompt sent to the forked session,
				// and the forked session is responsible for outputting valid JSON.

				return {
					content: result.content,
					model: this.model,
					// Forked sessions don't provide token usage info
					usage: undefined,
				};
			} catch (err) {
				if (err instanceof LLMError) {
					throw err;
				}

				const errorMessage = err instanceof Error ? err.message : String(err);

				// Check for timeout
				if (
					errorMessage.includes("timeout") ||
					errorMessage.includes("timed out")
				) {
					throw new LLMError(
						"timeout",
						`Forked session timed out: ${errorMessage}`,
						{
							retryable: true,
						},
					);
				}

				// Check for rate limiting
				if (
					errorMessage.includes("rate limit") ||
					errorMessage.includes("rate_limit")
				) {
					throw new LLMError(
						"rate_limit",
						`Forked session rate limited: ${errorMessage}`,
						{
							retryable: true,
						},
					);
				}

				// Generic fork error - treat as retryable for robustness
				throw new LLMError("unknown", `Forked session error: ${errorMessage}`, {
					retryable: true,
				});
			}
		};

		return withRetry(doRequest, { maxRetries: this.maxRetries });
	}

	/**
	 * Call the forked session with the given prompt.
	 * Uses timeout to prevent hanging.
	 */
	private async callForkedSession(
		prompt: string,
	): Promise<{ content: string }> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(
					new Error(`Forked session call timed out after ${this.timeoutMs}ms`),
				);
			}, this.timeoutMs);
		});

		const forkPromise = this.sdkClient.sessions.fork({
			session_id: this.sessionId,
			body: {
				agent: this.model,
				prompt,
			},
		});

		try {
			const result = await Promise.race([forkPromise, timeoutPromise]);

			if (result.error) {
				throw new Error(result.error);
			}

			if (!result.data?.id) {
				throw new Error("Forked session returned no session ID");
			}

			// Return the forked session ID as content
			// The actual work happens in the background forked session
			return { content: result.data.id };
		} catch (err) {
			if (err instanceof Error && err.message.includes("timed out")) {
				throw err;
			}
			throw new Error(
				`Forked session call failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

/**
 * Task function signature for spawning OpenCode subagents.
 * This function is injected from the OpenCode runtime context.
 */
export type OpenCodeTaskFn = (params: {
	subagent_type?: string;
	category?: string;
	description?: string;
	prompt: string;
	session_id?: string;
	run_in_background?: boolean;
	load_skills?: string[];
}) => Promise<{ result?: string; error?: string }>;

/**
 * Configuration for OpenCodeSubagentClient.
 * Extends LLMClientConfig with OpenCode-specific options.
 */
export interface OpenCodeSubagentConfig {
	/** The subagent type to spawn (e.g., 'memory-extractor', 'planning-subagent') */
	model: string;
	/** Session ID to pass parent context to the subagent */
	sessionId?: string;
	/** Optional task function. If not provided, will look for global task function. */
	taskFn?: OpenCodeTaskFn;
	/** Timeout for subagent execution in ms */
	timeoutMs?: number;
	/** Max retries for subagent failures */
	maxRetries?: number;
	/** Default temperature for requests */
	temperature?: number;
	/** Default maxTokens for requests */
	maxTokens?: number;
}

/**
 * Client that uses OpenCode subagents instead of direct LLM API calls.
 * Spawns subagents via the task tool with parent session context.
 *
 * Usage:
 * ```typescript
 * const client = new OpenCodeSubagentClient({
 *   model: 'memory-extractor',
 *   sessionId: 'ses_xxx',
 *   taskFn: async (params) => { /* call task tool *!/ }
 * });
 * const response = await client.complete({ systemPrompt, userPrompt });
 * ```
 */
export class OpenCodeSubagentClient implements LLMClient {
	readonly provider = "opencode";
	readonly model: string;
	private readonly sessionId?: string;
	private readonly taskFn: OpenCodeTaskFn;
	private readonly timeoutMs: number;
	private readonly maxRetries: number;
	private readonly defaultTemperature?: number;
	private readonly defaultMaxTokens?: number;

	constructor(config: OpenCodeSubagentConfig) {
		this.model = config.model;
		this.sessionId = config.sessionId;
		this.taskFn = config.taskFn ?? this.getGlobalTaskFn();
		this.timeoutMs = config.timeoutMs ?? 60_000; // Default 60s for subagent
		this.maxRetries = config.maxRetries ?? 2;
		this.defaultTemperature = config.temperature;
		this.defaultMaxTokens = config.maxTokens;
	}

	/**
	 * Get global task function if available (for runtime context).
	 */
	private getGlobalTaskFn(): OpenCodeTaskFn {
		// In OpenCode runtime, the task function should be available globally
		// or injected via constructor. This is a placeholder that throws a clear error.
		throw new LLMError(
			"connection",
			"OpenCodeSubagentClient requires a taskFn to be provided or running in OpenCode runtime context",
			{ retryable: false },
		);
	}

	async complete(request: LLMRequest): Promise<LLMResponse> {
		const temperature = request.temperature ?? this.defaultTemperature;
		const maxTokens = request.maxTokens ?? this.defaultMaxTokens;

		// Build the prompt combining system and user prompts
		let fullPrompt = request.systemPrompt
			? `${request.systemPrompt}

${request.userPrompt}`
			: request.userPrompt;

		// Add JSON mode instruction if requested
		if (request.jsonMode) {
			fullPrompt += " Please respond with valid JSON only.";
		}

		// Add temperature/maxTokens guidance if specified
		if (temperature !== undefined) {
			fullPrompt += `

Temperature: ${temperature}`;
		}
		if (maxTokens !== undefined) {
			fullPrompt += `

Max tokens: ${maxTokens}`;
		}

		const doRequest = async (): Promise<LLMResponse> => {
			try {
				const result = await this.callSubagent(fullPrompt);

				// If jsonMode was requested, parse and validate JSON
				if (request.jsonMode) {
					try {
						parseJsonFromLLMOutput(result.content);
					} catch {
						// JSON parsing failed - this is an error
						throw new LLMError(
							"invalid_response",
							"Subagent did not return valid JSON despite jsonMode request",
							{ retryable: false },
						);
					}
				}

				return {
					content: result.content,
					model: this.model,
					// Subagents don't provide token usage info
					usage: undefined,
				};
			} catch (err) {
				// Map subagent errors to LLMError codes
				if (err instanceof LLMError) {
					throw err;
				}

				const errorMessage = err instanceof Error ? err.message : String(err);

				// Check for timeout
				if (
					errorMessage.includes("timeout") ||
					errorMessage.includes("timed out")
				) {
					throw new LLMError(
						"timeout",
						`Subagent execution timed out: ${errorMessage}`,
						{
							retryable: true,
						},
					);
				}

				// Check for rate limiting
				if (
					errorMessage.includes("rate limit") ||
					errorMessage.includes("rate_limit")
				) {
					throw new LLMError(
						"rate_limit",
						`Subagent rate limited: ${errorMessage}`,
						{
							retryable: true,
						},
					);
				}

				// Check for connection/spawn failures
				if (
					errorMessage.includes("failed to spawn") ||
					errorMessage.includes("could not spawn") ||
					errorMessage.includes("no such agent")
				) {
					throw new LLMError(
						"connection",
						`Failed to spawn subagent: ${errorMessage}`,
						{
							retryable: true,
						},
					);
				}

				// Generic subagent error - treat as retryable for robustness
				throw new LLMError("unknown", `Subagent error: ${errorMessage}`, {
					retryable: true,
				});
			}
		};

		return withRetry(doRequest, { maxRetries: this.maxRetries });
	}

	/**
	 * Call the subagent with the given prompt.
	 * Uses timeout to prevent hanging.
	 */
	private async callSubagent(prompt: string): Promise<{ content: string }> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Subagent call timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
		});

		const subagentPromise = this.taskFn({
			subagent_type: this.model,
			description: `LLM request to ${this.model}`,
			prompt,
			session_id: this.sessionId,
			run_in_background: false,
		});

		try {
			const result = await Promise.race([subagentPromise, timeoutPromise]);

			if (result.error) {
				throw new Error(result.error);
			}

			if (!result.result) {
				throw new Error("Subagent returned no result");
			}

			return { content: result.result };
		} catch (err) {
			if (err instanceof Error && err.message.includes("timed out")) {
				throw err; // Re-throw timeout for proper handling
			}
			// Wrap other errors
			throw new Error(
				`Subagent call failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

/**
 * Extended config for createLLMClient that includes OpenCode-specific options.
 */
export interface CreateLLMClientOptions
	extends Omit<LLMClientConfig, "provider" | "model"> {
	/** Session ID for OpenCode subagent context */
	sessionId?: string;
	/** Task function for OpenCode subagent (for backward compatibility with taskFn-based client) */
	taskFn?: OpenCodeTaskFn;
	/** OpenCode SDK client (from PluginInput) - preferred over taskFn */
	sdkClient?: OpenCodeSDKClient;
}

export type KnownProvider = "opencode" | "openai" | "ollama";

const KNOWN_PROVIDERS = new Set<string>(["opencode", "openai", "ollama"]);

export function parseModelString(modelString: string): [string, string] {
	const slashIndex = modelString.indexOf("/");
	if (
		slashIndex === -1 ||
		slashIndex === 0 ||
		slashIndex === modelString.length - 1
	) {
		throw new LLMError(
			"unknown",
			`Invalid model string "${modelString}". Expected "provider/model" format (e.g. "openai/gpt-4", "ollama/llama2").`,
			{ retryable: false },
		);
	}
	return [
		modelString.substring(0, slashIndex),
		modelString.substring(slashIndex + 1),
	];
}

export function createLLMClient(
	modelString: string,
	options?: CreateLLMClientOptions,
): LLMClient {
	const [provider, model] = parseModelString(modelString);

	if (!KNOWN_PROVIDERS.has(provider)) {
		throw new LLMError(
			"unknown",
			`Unknown LLM provider "${provider}". Supported providers: ${[...KNOWN_PROVIDERS].join(", ")}`,
			{ retryable: false },
		);
	}

	const commonConfig = {
		model,
		apiKey: options?.apiKey,
		baseUrl: options?.baseUrl,
		timeoutMs: options?.timeoutMs,
		maxRetries: options?.maxRetries,
		temperature: options?.temperature,
		maxTokens: options?.maxTokens,
	};

	switch (provider as KnownProvider) {
		case "opencode":
			// Prefer SDK client if provided, otherwise fall back to taskFn-based client
			if (options?.sdkClient) {
				if (!options.sessionId) {
					throw new LLMError(
						"unknown",
						"sessionId is required when using OpenCode SDK client",
						{ retryable: false },
					);
				}
				return new OpenCodeForkedSessionClient({
					model,
					sessionId: options.sessionId,
					sdkClient: options.sdkClient,
					timeoutMs: options.timeoutMs,
					maxRetries: options.maxRetries,
					temperature: options.temperature,
					maxTokens: options.maxTokens,
				});
			}
			// Fall back to taskFn-based client for backward compatibility
			return new OpenCodeSubagentClient({
				model,
				sessionId: options?.sessionId,
				taskFn: options?.taskFn,
				timeoutMs: options?.timeoutMs,
				maxRetries: options?.maxRetries,
				temperature: options?.temperature,
				maxTokens: options?.maxTokens,
			});
		case "openai":
			return new OpenAIClient(commonConfig);
		case "ollama":
			return new OllamaClient(commonConfig);
	}
}
