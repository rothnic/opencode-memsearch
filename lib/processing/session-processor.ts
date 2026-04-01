/**
 * @file session-processor.ts
 * @description Session processor agent interface (Task 11). Contract for
 * analyzing sessions and extracting typed memories. Implementations in Tasks 12-15.
 */

import type { MemoryTypeConfig } from "../types/memory-type-config";
import type { SessionWithHistory } from "./session-indexer";

export interface MemoryExtractMetadata {
	sessionId: string;
	tags: string[];
	technologies: string[];
	/** ISO 8601 */
	extractedAt: string;
	projectPath?: string;
	extra?: Record<string, string>;
}

export interface MemoryExtract {
	/** e.g. "decision", "convention" */
	memoryType: string;
	collection: string;
	title: string;
	/** Markdown body */
	content: string;
	/** [0, 1] extraction quality */
	confidence: number;
	metadata: MemoryExtractMetadata;
}

export interface SessionProcessorInput {
	session: SessionWithHistory;
	/** Pre-filtered to enabled types only */
	memoryTypes: MemoryTypeConfig[];
	/** Override model (takes precedence over per-type and default config) */
	model?: string;
	workdir?: string;
}

export interface ExtractionStats {
	typesProcessed: number;
	totalExtracts: number;
	/** Extract count keyed by memory type name */
	perType: Record<string, number>;
	durationMs: number;
}

export interface SessionProcessorSuccess {
	ok: true;
	extracts: MemoryExtract[];
	stats: ExtractionStats;
}

export interface SessionProcessorError {
	ok: false;
	error: string;
	partialExtracts?: MemoryExtract[];
}

/** Discriminated union — check `result.ok` to narrow. */
export type SessionProcessorResult =
	| SessionProcessorSuccess
	| SessionProcessorError;

/**
 * Session processor agent contract.
 *
 * Contract:
 * - MUST NOT throw — all errors captured in the result union
 * - SHOULD return partial results if some types succeed and others fail
 * - MUST produce valid MemoryExtract objects with all required metadata
 *
 * Lifecycle: created once, reused across sessions. analyze() may be called concurrently.
 */
export interface SessionProcessorAgent {
	analyze(input: SessionProcessorInput): Promise<SessionProcessorResult>;
}
