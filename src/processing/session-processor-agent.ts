/**
 * @file session-processor-agent.ts
 * @description Implementation of SessionProcessorAgent that extracts typed memories
 *              from sessions using LLM with configurable memory types.
 */

import type {
	MemoryExtract,
	SessionProcessorAgent,
	SessionProcessorInput,
	SessionProcessorResult,
} from "./session-processor";
import { buildPromptForTypes, toPromptMemoryType } from "../llm/prompt-builder";
import {
	createLLMClient,
	LLMError,
	parseJsonFromLLMOutput,
} from "../llm/llm-client";
import type { MemoryTypeConfig } from "../types/memory-type-config";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Rate limiting config
const DEFAULT_DELAY_MS = 2000;
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.3;

export interface SessionProcessorAgentConfig {
	model?: string;
	maxTokens?: number;
	temperature?: number;
	delayMs?: number;
	outputBasePath?: string;
	baseUrl?: string;
	apiKey?: string;
}

export interface ProcessingStats {
	sessionsProcessed: number;
	sessionsFailed: number;
	memoriesExtracted: number;
	memoriesWritten: number;
	totalTokensUsed: number;
	errors: Array<{ sessionId: string; error: string }>;
}

export class SimpleSessionProcessorAgent implements SessionProcessorAgent {
	private config: Required<SessionProcessorAgentConfig>;
	private stats: ProcessingStats;

	constructor(config: SessionProcessorAgentConfig = {}) {
		this.config = {
			model: config.model || "openai/gpt-4o-mini",
			maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
			temperature: config.temperature || DEFAULT_TEMPERATURE,
			delayMs: config.delayMs || DEFAULT_DELAY_MS,
			outputBasePath: config.outputBasePath || process.cwd(),
			baseUrl: config.baseUrl || "",
			apiKey: config.apiKey || "",
		};
		this.stats = {
			sessionsProcessed: 0,
			sessionsFailed: 0,
			memoriesExtracted: 0,
			memoriesWritten: 0,
			totalTokensUsed: 0,
			errors: [],
		};
	}

	async analyze(input: SessionProcessorInput): Promise<SessionProcessorResult> {
		const { session, memoryTypes, workdir } = input;
		const startTime = Date.now();

		try {
			const enabledTypes = memoryTypes.filter((mt) => mt.enabled);

			if (enabledTypes.length === 0) {
				return {
					ok: true,
					extracts: [],
					stats: {
						typesProcessed: 0,
						totalExtracts: 0,
						perType: {},
						durationMs: Date.now() - startTime,
					},
				};
			}

			const clientOptions: any = {
				maxTokens: this.config.maxTokens,
				temperature: this.config.temperature,
			};
			
			if (this.config.baseUrl) {
				clientOptions.baseUrl = this.config.baseUrl;
			}
			if (this.config.apiKey) {
				clientOptions.apiKey = this.config.apiKey;
			}

			const client = createLLMClient(this.config.model, clientOptions);

			const promptMemoryTypes = enabledTypes.map((mt) =>
				toPromptMemoryType(mt),
			);
			const { systemPrompt, userPrompt } = buildPromptForTypes(
				promptMemoryTypes,
				session,
				{
					projectPath: workdir || session.metadata.directory,
				},
			);

			console.log(
				`[Memory Extraction] Processing session ${session.metadata.id} with ${enabledTypes.length} memory types...`,
			);

			const response = await client.complete({
				systemPrompt,
				userPrompt,
				temperature: this.config.temperature,
				maxTokens: this.config.maxTokens,
				jsonMode: true,
			});

			if (response.usage) {
				this.stats.totalTokensUsed += response.usage.totalTokens;
			}

			let parsed: { extracts?: MemoryExtract[] };
			try {
				parsed = parseJsonFromLLMOutput<{ extracts?: MemoryExtract[] }>(
					response.content,
				);
			} catch (err) {
				console.warn(
					`[Memory Extraction] Failed to parse JSON for session ${session.metadata.id}:`,
					err,
				);
				parsed = { extracts: [] };
			}

			const extracts = parsed.extracts || [];

			const validExtracts: MemoryExtract[] = extracts
				.filter((ex) => this.isValidExtract(ex))
				.map((ex) => ({
					...ex,
					metadata: {
						...ex.metadata,
						sessionId: session.metadata.id,
						extractedAt: new Date().toISOString(),
						projectPath: workdir || session.metadata.directory,
					},
				}));

			let writtenCount = 0;
			for (const extract of validExtracts) {
				try {
					await this.writeMemoryToDisk(extract, workdir);
					writtenCount++;
				} catch (err) {
					console.warn(
						`[Memory Extraction] Failed to write memory to disk:`,
						err,
					);
				}
			}

			this.stats.sessionsProcessed++;
			this.stats.memoriesExtracted += validExtracts.length;
			this.stats.memoriesWritten += writtenCount;

			const perType: Record<string, number> = {};
			for (const extract of validExtracts) {
				perType[extract.memoryType] = (perType[extract.memoryType] || 0) + 1;
			}

			console.log(
				`[Memory Extraction] Session ${session.metadata.id}: ${validExtracts.length} memories extracted, ${writtenCount} written`,
			);

			return {
				ok: true,
				extracts: validExtracts,
				stats: {
					typesProcessed: enabledTypes.length,
					totalExtracts: validExtracts.length,
					perType,
					durationMs: Date.now() - startTime,
				},
			};
		} catch (err) {
			this.stats.sessionsFailed++;
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.stats.errors.push({
				sessionId: session.metadata.id,
				error: errorMsg,
			});

			console.error(
				`[Memory Extraction] Error processing session ${session.metadata.id}:`,
				err,
			);

			return {
				ok: false,
				error: errorMsg,
				partialExtracts: [],
			};
		}
	}

	private isValidExtract(extract: MemoryExtract): boolean {
		if (!extract) return false;
		if (!extract.memoryType || typeof extract.memoryType !== "string")
			return false;
		if (!extract.collection || typeof extract.collection !== "string")
			return false;
		if (!extract.title || typeof extract.title !== "string") return false;
		if (!extract.content || typeof extract.content !== "string") return false;
		if (typeof extract.confidence !== "number") return false;
		if (!extract.metadata || typeof extract.metadata !== "object")
			return false;
		return true;
	}

	private async writeMemoryToDisk(
		extract: MemoryExtract,
		workdir?: string,
	): Promise<void> {
		interface OutputConfig {
			output?: { path?: string; filenamePattern?: string };
		}
		const config = extract.metadata as unknown as OutputConfig;

		const basePath = workdir || this.config.outputBasePath;
		const outputPath =
			config.output?.path || `memory/${extract.memoryType}`;
		const fullPath = path.join(basePath, outputPath);

		if (!existsSync(fullPath)) {
			await mkdir(fullPath, { recursive: true });
		}

		const date = new Date().toISOString().split("T")[0];
		const sessionId = extract.metadata.sessionId || "unknown";
		const hash = crypto.randomBytes(4).toString("hex");

		const filenamePattern =
			config.output?.filenamePattern || "{date}_{session_id}_{hash}.md";
		const filename = filenamePattern
			.replace("{date}", date)
			.replace("{session_id}", sessionId)
			.replace("{hash}", hash);

		const filepath = path.join(fullPath, filename);

		const frontmatter = {
			title: extract.title,
			memory_type: extract.memoryType,
			collection: extract.collection,
			confidence: extract.confidence,
			session_id: extract.metadata.sessionId,
			extracted_at: extract.metadata.extractedAt,
			project_path: extract.metadata.projectPath,
			tags: extract.metadata.tags || [],
			technologies: extract.metadata.technologies || [],
		};

		const markdown = `---
${Object.entries(frontmatter)
	.map(([key, value]) => {
		if (Array.isArray(value)) {
			return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
		}
		return `${key}: ${JSON.stringify(value)}`;
	})
	.join("\n")}
---

${extract.content}
`;

		await writeFile(filepath, markdown, "utf8");
		console.log(`[Memory Extraction] Written to ${filepath}`);
	}

	async delay(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, this.config.delayMs));
	}

	getStats(): ProcessingStats {
		return { ...this.stats };
	}

	resetStats(): void {
		this.stats = {
			sessionsProcessed: 0,
			sessionsFailed: 0,
			memoriesExtracted: 0,
			memoriesWritten: 0,
			totalTokensUsed: 0,
			errors: [],
		};
	}
}

export function createSessionProcessorAgent(
	config?: SessionProcessorAgentConfig,
): SessionProcessorAgent {
	return new SimpleSessionProcessorAgent(config);
}
