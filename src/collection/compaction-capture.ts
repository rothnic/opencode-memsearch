/**
 * @file compaction-capture.ts
 * @description Hooks into memsearch compaction process and captures summaries to memory collections.
 *              Provides integration with experimental.session.compacting hook.
 */

import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CompactionConfig, MemoryTypeConfig } from "../types/config-yaml";
import type { ScopedWriter } from "../llm/scoped-writer";

/**
 * Error codes for compaction capture operations
 */
export type CompactionCaptureErrorCode =
	| "capture_disabled"
	| "memory_type_not_found"
	| "write_failed"
	| "invalid_config"
	| "session_parse_error"
	| "io_error";

/**
 * Custom error class for compaction capture operations
 */
export class CompactionCaptureError extends Error {
	readonly code: CompactionCaptureErrorCode;
	readonly retryable: boolean;

	constructor(
		code: CompactionCaptureErrorCode,
		message: string,
		options?: {
			retryable?: boolean;
			cause?: unknown;
		},
	) {
		super(message, { cause: options?.cause });
		this.name = "CompactionCaptureError";
		this.code = code;
		this.retryable = options?.retryable ?? false;
	}
}

/**
 * Compaction event summary data
 */
export interface CompactionSummary {
	/** Session ID that was compacted */
	sessionId: string;
	/** Original session path or identifier */
	sessionPath?: string;
	/** Timestamp of compaction */
	timestamp: string;
	/** Number of messages processed */
	messageCount: number;
	/** Number of tokens condensed */
	tokenCount?: number;
	/** Original message count before compaction */
	originalMessageCount?: number;
	/** Summary text content */
	summary: string;
	/** Any metadata from the compaction */
	metadata?: Record<string, unknown>;
}

/**
 * Result type for compaction capture operations - discriminated union
 */
export type CompactionCaptureResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: CompactionCaptureError };

/**
 * Configuration for CompactionCapture
 */
export interface CompactionCaptureConfig {
	/** Compaction settings from config */
	compaction?: {
		capture?: boolean;
		memoryType?: string;
	};
	/** Map of memory type name to MemoryTypeConfig */
	memoryTypes?: Map<string, MemoryTypeConfig>;
	/** Project working directory for scoped writes */
	workdir?: string;
	/** ScopedWriter instance for path validation */
	scopedWriter?: ScopedWriter;
	/** Default memory type when not specified */
	defaultMemoryType?: string;
}

/**
 * Captured summary entry with metadata
 */
export interface CapturedSummary {
	summary: CompactionSummary;
	memoryType: string;
	outputPath: string;
	capturedAt: string;
}

/**
 * CompactionCapture handles capturing compaction summaries to configured memory collections.
 * Hooks into experimental.session.compacting events and writes summaries to the
 * configured memory type (default: context).
 */
export class CompactionCapture {
	private readonly captureEnabled: boolean;
	private readonly defaultMemoryType: string;
	private readonly memoryTypes: Map<string, MemoryTypeConfig>;
	private readonly scopedWriter?: ScopedWriter;
	private readonly workdir: string;
	private capturedSummaries: CapturedSummary[] = [];

	/**
	 * Private constructor - use factory method fromConfig() to create instances
	 */
	private constructor(config: CompactionCaptureConfig) {
		this.captureEnabled = config.compaction?.capture ?? true;
		this.defaultMemoryType =
			config.compaction?.memoryType ?? config.defaultMemoryType ?? "context";
		this.memoryTypes = config.memoryTypes ?? new Map();
		this.scopedWriter = config.scopedWriter;
		this.workdir = config.workdir ?? process.cwd();
	}

	/**
	 * Factory method to create a CompactionCapture from configuration.
	 * @param config Configuration options
	 * @returns Configured CompactionCapture instance
	 */
	static fromConfig(config: CompactionCaptureConfig): CompactionCapture {
		return new CompactionCapture(config);
	}

	/**
	 * Check if compaction capture is enabled.
	 * @returns true if capture is enabled
	 */
	isEnabled(): boolean {
		return this.captureEnabled;
	}

	/**
	 * Get the configured default memory type.
	 * @returns Default memory type name
	 */
	getDefaultMemoryType(): string {
		return this.defaultMemoryType;
	}

	/**
	 * Get all configured memory types.
	 * @returns Map of memory type name to config
	 */
	getMemoryTypes(): Map<string, MemoryTypeConfig> {
		return new Map(this.memoryTypes);
	}

	/**
	 * Check if a memory type is configured.
	 * @param memoryType Memory type name
	 * @returns true if memory type exists in config
	 */
	hasMemoryType(memoryType: string): boolean {
		return this.memoryTypes.has(memoryType);
	}

	/**
	 * Get memory type configuration by name.
	 * @param memoryType Memory type name
	 * @returns MemoryTypeConfig or undefined if not found
	 */
	getMemoryTypeConfig(memoryType: string): MemoryTypeConfig | undefined {
		return this.memoryTypes.get(memoryType);
	}

	/**
	 * Parse compaction event data into a CompactionSummary.
	 * Handles various input formats from the experimental.session.compacting hook.
	 * @param eventData Raw event data from the compaction hook
	 * @returns CompactionResult with parsed CompactionSummary
	 */
	parseCompactionEvent(
		eventData: unknown,
	): CompactionCaptureResult<CompactionSummary> {
		if (!this.isEnabled()) {
			return {
				ok: false,
				error: new CompactionCaptureError(
					"capture_disabled",
					"Compaction capture is disabled in configuration",
					{ retryable: false },
				),
			};
		}

		// Handle various input formats
		let sessionId: string;
		let summary: string;
		let messageCount = 0;
		let tokenCount: number | undefined;
		let originalMessageCount: number | undefined;
		let timestamp: string;
		let sessionPath: string | undefined;
		let metadata: Record<string, unknown> | undefined;

		if (typeof eventData === "string") {
			// Simple string format - treat as summary
			sessionId = "unknown";
			summary = eventData;
			timestamp = new Date().toISOString();
		} else if (typeof eventData === "object" && eventData !== null) {
			const data = eventData as Record<string, unknown>;

			sessionId =
				typeof data.sessionId === "string"
					? data.sessionId
					: typeof data.session_id === "string"
						? data.session_id
						: typeof data.session === "string"
							? data.session
							: "unknown";

			summary =
				typeof data.summary === "string"
					? data.summary
					: typeof data.content === "string"
						? data.content
						: typeof data.compacted === "string"
							? data.compacted
							: "";

			if (!summary) {
				return {
					ok: false,
					error: new CompactionCaptureError(
						"session_parse_error",
						"No summary content found in compaction event data",
						{ retryable: false },
					),
				};
			}

			messageCount =
				typeof data.messageCount === "number"
					? data.messageCount
					: typeof data.messages === "number"
						? data.messages
						: typeof data.count === "number"
							? data.count
							: 0;

			tokenCount =
				typeof data.tokenCount === "number"
					? data.tokenCount
					: typeof data.tokens === "number"
						? data.tokens
						: undefined;

			originalMessageCount =
				typeof data.originalMessageCount === "number"
					? data.originalMessageCount
					: typeof data.originalMessages === "number"
						? data.originalMessages
						: undefined;

			timestamp =
				typeof data.timestamp === "string"
					? data.timestamp
					: typeof data.time === "string"
						? data.time
						: new Date().toISOString();

			sessionPath =
				typeof data.sessionPath === "string"
					? data.sessionPath
					: typeof data.path === "string"
						? data.path
						: undefined;

			// Extract remaining fields as metadata
			const knownFields = [
				"sessionId",
				"session_id",
				"session",
				"summary",
				"content",
				"compacted",
				"messageCount",
				"messages",
				"count",
				"tokenCount",
				"tokens",
				"originalMessageCount",
				"originalMessages",
				"timestamp",
				"time",
				"sessionPath",
				"path",
			];
			metadata = {};
			for (const [key, value] of Object.entries(data)) {
				if (!knownFields.includes(key)) {
					metadata[key] = value;
				}
			}
			metadata = Object.keys(metadata).length > 0 ? metadata : undefined;
		} else {
			return {
				ok: false,
				error: new CompactionCaptureError(
					"session_parse_error",
					"Invalid compaction event data: expected string or object",
					{ retryable: false },
				),
			};
		}

		return {
			ok: true,
			data: {
				sessionId,
				sessionPath,
				timestamp,
				messageCount,
				tokenCount,
				originalMessageCount,
				summary,
				metadata,
			},
		};
	}

	/**
	 * Process a compaction event and capture the summary.
	 * @param sessionId Session ID being compacted
	 * @param summary Summary content or event data
	 * @param memoryType Optional memory type override (defaults to configured value)
	 * @returns CompactionCaptureResult with capture status
	 */
	async onCompaction(
		sessionId: string,
		summary: CompactionSummary | unknown,
		memoryType?: string,
	): Promise<CompactionCaptureResult<CapturedSummary>> {
		if (!this.isEnabled()) {
			return {
				ok: false,
				error: new CompactionCaptureError(
					"capture_disabled",
					"Compaction capture is disabled in configuration",
					{ retryable: false },
				),
			};
		}

		// Parse the summary if it's raw event data
		let parsedSummary: CompactionSummary;

		// Only use direct object if it has all required CompactionSummary fields
		if (
			typeof summary === "object" &&
			summary !== null &&
			"sessionId" in summary &&
			"timestamp" in summary &&
			"summary" in summary
		) {
			// Already a complete CompactionSummary object
			parsedSummary = summary as CompactionSummary;
		} else {
			const parseResult = this.parseCompactionEvent(summary);
			if (!parseResult.ok) {
				return { ok: false, error: parseResult.error };
			}
			parsedSummary = parseResult.data;
		}

		// Override sessionId if provided
		if (sessionId && sessionId !== "unknown") {
			parsedSummary.sessionId = sessionId;
		}

		// Use specified memory type or default
		const targetMemoryType = memoryType ?? this.defaultMemoryType;

		return this.captureSummary(parsedSummary, targetMemoryType);
	}

	/**
	 * Capture a summary to the specified memory type.
	 * @param summary Compaction summary to capture
	 * @param memoryType Target memory type (e.g., 'context', 'decision', 'convention')
	 * @returns CompactionCaptureResult with capture status
	 */
	async captureSummary(
		summary: CompactionSummary,
		memoryType: string,
	): Promise<CompactionCaptureResult<CapturedSummary>> {
		if (!this.isEnabled()) {
			return {
				ok: false,
				error: new CompactionCaptureError(
					"capture_disabled",
					"Compaction capture is disabled in configuration",
					{ retryable: false },
				),
			};
		}

		// Check if memory type is configured
		const memTypeConfig = this.memoryTypes.get(memoryType);
		if (!memTypeConfig) {
			// Still allow capture even if not configured - use defaults
			// But log for debugging (could be extended to use proper logger)
		}

		// Determine output path
		const outputPath = this.determineOutputPath(
			summary,
			memoryType,
			memTypeConfig,
		);

		// Generate content with frontmatter
		const content = this.formatSummaryContent(
			summary,
			memoryType,
			memTypeConfig,
		);

		// Write using scoped writer if available
		let writeResult: CompactionCaptureResult<CapturedSummary>;

		if (this.scopedWriter) {
			try {
				const validatedPath = this.scopedWriter.writeFile(
					outputPath,
					memoryType,
				);
				await writeFile(validatedPath, content);
				writeResult = {
					ok: true,
					data: {
						summary,
						memoryType,
						outputPath: validatedPath,
						capturedAt: new Date().toISOString(),
					},
				};
			} catch (err) {
				return {
					ok: false,
					error: new CompactionCaptureError(
						"write_failed",
						`Failed to write summary to ${outputPath}: ${String(err)}`,
						{ retryable: true, cause: err },
					),
				};
			}
		} else {
			// Direct write without scoped validation (for testing or fallback)

			try {
				// Ensure directory exists
				const dir = path.dirname(outputPath);

				if (!existsSync(dir)) {
					await mkdir(dir, { recursive: true });
				}

				await writeFile(outputPath, content);

				writeResult = {
					ok: true,
					data: {
						summary,
						memoryType,
						outputPath,
						capturedAt: new Date().toISOString(),
					},
				};
			} catch (err) {
				return {
					ok: false,
					error: new CompactionCaptureError(
						"write_failed",
						`Failed to write summary to ${outputPath}: ${String(err)}`,
						{ retryable: true, cause: err },
					),
				};
			}
		}

		// Track captured summaries
		if (writeResult.ok) {
			this.capturedSummaries.push(writeResult.data);
		}

		return writeResult;
	}

	/**
	 * Determine the output file path for a summary.
	 */
	private determineOutputPath(
		summary: CompactionSummary,
		memoryType: string,
		memTypeConfig?: MemoryTypeConfig,
	): string {
		// Use configured output path if available
		const basePath = memTypeConfig?.output?.path ?? "memory";
		const filenamePattern =
			memTypeConfig?.output?.filenamePattern ?? "{date}_{session_id}.md";

		// Generate filename from pattern
		const date =
			new Date(summary.timestamp).toISOString().split("T")[0] || "unknown";
		const sessionId = summary.sessionId || "unknown";

		const filename = filenamePattern
			.replace("{date}", date)
			.replace("{session_id}", sessionId)
			.replace("{timestamp}", summary.timestamp.replace(/[:.]/g, "-"));

		// Join with workdir and base path
		return path.join(this.workdir, basePath, memoryType, filename);
	}

	/**
	 * Format summary content with YAML frontmatter.
	 */
	private formatSummaryContent(
		summary: CompactionSummary,
		memoryType: string,
		memTypeConfig?: MemoryTypeConfig,
	): string {
		// Build frontmatter fields
		const frontmatterFields = memTypeConfig?.output?.frontmatter ?? [
			"session_id",
			"project_path",
			"tags",
			"extracted_at",
		];

		const frontmatter: Record<string, unknown> = {};

		if (frontmatterFields.includes("session_id")) {
			frontmatter.session_id = summary.sessionId;
		}
		if (frontmatterFields.includes("project_path")) {
			frontmatter.project_path = this.workdir;
		}
		if (frontmatterFields.includes("tags")) {
			frontmatter.tags = ["compaction", memoryType];
		}
		if (frontmatterFields.includes("extracted_at")) {
			frontmatter.extracted_at = new Date().toISOString();
		}
		if (frontmatterFields.includes("timestamp")) {
			frontmatter.timestamp = summary.timestamp;
		}
		if (frontmatterFields.includes("message_count")) {
			frontmatter.message_count = summary.messageCount;
		}
		if (
			frontmatterFields.includes("original_message_count") &&
			summary.originalMessageCount
		) {
			frontmatter.original_message_count = summary.originalMessageCount;
		}
		if (frontmatterFields.includes("memory_type")) {
			frontmatter.memory_type = memoryType;
		}

		// Add custom tags from config if available
		if (memTypeConfig?.tagLists && memTypeConfig.tagLists.length > 0) {
			const defaultTags = memTypeConfig.tagLists.find(
				(t) => t.id === "default",
			);
			if (defaultTags?.tags) {
				frontmatter.tags = [
					...((frontmatter.tags as string[]) || []),
					...defaultTags.tags,
				];
			}
		}

		// Build YAML frontmatter
		const yamlLines = Object.entries(frontmatter)
			.map(([key, value]) => {
				if (Array.isArray(value)) {
					return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
				}
				return `${key}: ${JSON.stringify(value)}`;
			})
			.join("\n");

		return `---
${yamlLines}
---

# Compaction Summary: ${summary.sessionId}

${summary.summary}

---
*Captured from session compaction on ${new Date().toISOString()}*
`;
	}

	/**
	 * Get all captured summaries.
	 * @returns Array of captured summaries
	 */
	getCapturedSummaries(): CapturedSummary[] {
		return [...this.capturedSummaries];
	}

	/**
	 * Get count of captured summaries.
	 * @returns Number of captured summaries
	 */
	getCaptureCount(): number {
		return this.capturedSummaries.length;
	}

	/**
	 * Clear captured summaries (useful for testing).
	 */
	clearCapturedSummaries(): void {
		this.capturedSummaries = [];
	}

	/**
	 * Validate that a memory type is available for capture.
	 * @param memoryType Memory type to validate
	 * @returns true if memory type is configured and enabled
	 */
	isMemoryTypeAvailable(memoryType: string): boolean {
		const config = this.memoryTypes.get(memoryType);
		return config?.enabled ?? true; // Default to enabled if not specified
	}
}

export default CompactionCapture;
