import { $ } from "bun";
import type {
	ExpandResult,
	MemsearchConfig,
	SearchOptions,
	SearchResponse,
} from "./types";

export interface MemsearchStats {
	documentCount: number;
	chunkCount: number;
	indexSize: number;
	lastIndexedAt?: string;
}

export interface TranscriptEntry {
	timestamp: string;
	query: string;
	results: string[];
}

export class MemsearchNotFoundError extends Error {
	constructor() {
		super(
			"memsearch CLI not found. Please install it using: pip install memsearch",
		);
		this.name = "MemsearchNotFoundError";
	}
}

export class MemsearchTimeoutError extends Error {
	constructor(duration: number) {
		super(`memsearch operation timed out after ${duration}ms`);
		this.name = "MemsearchTimeoutError";
	}
}

export class MemsearchCLI {
	private isAvailable: boolean | null = null;
	private shell: any;
	private defaultTimeout: number;

	constructor(shell?: any, defaultTimeout = 60000) {
		this.shell = shell || $;
		this.defaultTimeout = defaultTimeout;
	}

	async checkAvailability(): Promise<boolean> {
		if (this.isAvailable !== null) return this.isAvailable;
		try {
			const result = await this.shell`sh -c "memsearch --version"`.quiet();
			this.isAvailable = result.exitCode === 0;
			return this.isAvailable;
		} catch {
			this.isAvailable = false;
			return false;
		}
	}

	private async ensureAvailable(): Promise<void> {
		if (!(await this.checkAvailability())) {
			throw new MemsearchNotFoundError();
		}
	}

	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
	): Promise<T> {
		const timeout = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new MemsearchTimeoutError(timeoutMs));
			}, timeoutMs);
		});
		return Promise.race([promise, timeout]);
	}

	async index(
		path: string,
		options: { collection?: string; timeout?: number } = {},
	): Promise<void> {
		await this.ensureAvailable();
		let cmd = `memsearch index "${path}"`;
		if (options.collection) {
			cmd += ` --collection "${options.collection}"`;
		}

		const timeoutMs = options.timeout || this.defaultTimeout;
		await this.withTimeout(
			this.shell`sh -c ${cmd}`.throws(true),
			timeoutMs,
		);
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResponse> {
		await this.ensureAvailable();
		let cmd = `memsearch search "${query}" --json-output`;

		if (options.topK !== undefined) {
			cmd += ` --top-k ${options.topK}`;
		}
		if (options.minScore !== undefined) {
			cmd += ` --min-score ${options.minScore}`;
		}
		if (options.filter !== undefined) {
			cmd += ` --filter "${options.filter}"`;
		}
		if (options.collection !== undefined) {
			cmd += ` --collection "${options.collection}"`;
		}
		if (options.includeEmbeddings) {
			cmd += " --include-embeddings";
		}

		if (options.smart) {
			cmd += " --smart";
			if (typeof options.smart === "object") {
				if (options.smart.rerankerModel) {
					cmd += ` --reranker "${options.smart.rerankerModel}"`;
				}
				if (options.smart.queryExpansion) {
					cmd += " --expand-query";
				}
			}
		}

		const output = await this.shell`sh -c ${cmd}`.text();
		return JSON.parse(output) as SearchResponse;
	}

	async watch(path: string): Promise<void> {
		await this.ensureAvailable();
		await this.shell`sh -c "memsearch watch ${path}"`.throws(true);
	}

	async compact(): Promise<string> {
		await this.ensureAvailable();
		// Run memsearch compact and return its stdout as the compaction summary.
		// Use .text() so we capture the summary content produced by memsearch.
		const output = await this
			.shell`sh -c "memsearch compact"`.text();
		return output;
	}

	async expand(query: string): Promise<ExpandResult[]> {
		await this.ensureAvailable();
		const output = await this
			.shell`sh -c "memsearch expand ${query} --json-output"`.text();
		return JSON.parse(output) as ExpandResult[];
	}

	async transcript(sessionId: string): Promise<TranscriptEntry[]> {
		await this.ensureAvailable();
		const output = await this
			.shell`sh -c "memsearch transcript ${sessionId} --json-output"`.text();
		return JSON.parse(output) as TranscriptEntry[];
	}

	async config(
		action: "get",
		key?: string,
	): Promise<Partial<MemsearchConfig>>;
	async config(action: "set", key: string, value: string): Promise<void>;
	async config(
		action: "get" | "set",
		key?: string,
		value?: string,
	): Promise<Partial<MemsearchConfig> | void> {
		await this.ensureAvailable();
		if (action === "get") {
			let cmd = "memsearch config get --json";
			if (key) cmd += ` ${key}`;
			const output = await this.shell`sh -c ${cmd}`.text();
			return JSON.parse(output) as Partial<MemsearchConfig>;
		} else {
			if (!key || value === undefined) {
				throw new Error("Key and value are required for config set");
			}
			await this.shell`sh -c "memsearch config set ${key} ${value}"`.throws(
				true,
			);
		}
	}

	async stats(): Promise<MemsearchStats> {
		await this.ensureAvailable();
		// memsearch stats doesn't support JSON output in 0.1.8. Keep calling
		// the plain text output and attempt to parse if possible. If parsing
		// fails, return zeroed stats to avoid throwing.
		const output = await this.shell`sh -c "memsearch stats"`.text();
		const trimmed = output.trim();
		if (!trimmed) {
			return { documentCount: 0, chunkCount: 0, indexSize: 0 };
		}
		try {
			return JSON.parse(trimmed) as MemsearchStats;
		} catch {
			// Fallback: try to extract numbers from plain text like:
			// "Total indexed chunks: 198" or "Documents: 10\nChunks: 123"
			const chunkMatch = trimmed.match(/chunks?:\s*(\d+)/i);
			const chunkCount = chunkMatch ? Number(chunkMatch[1]) : 0;
			// For now, use chunkCount as documentCount since memsearch
			// stats doesn't distinguish between them in the text output
			const documentCount = chunkCount;
			const indexSize = 0;
			return { documentCount, chunkCount, indexSize };
		}
	}

	async reset(): Promise<void> {
		await this.ensureAvailable();
		await this.shell`sh -c "memsearch reset --force"`.throws(true);
	}

	async version(): Promise<string> {
		// Return the CLI version string from `memsearch --version`.
		// We don't call ensureAvailable() because the version command itself
		// is the availability probe and may throw if the binary is missing.
		try {
			const output = await this
				.shell`sh -c "memsearch --version"`.text();
			return output.trim();
		} catch (err) {
			// Normalize to a consistent error when the binary isn't present.
			throw new MemsearchNotFoundError();
		}
	}
}
