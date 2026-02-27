import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import { markSessionProcessed, state } from "../state";
import type { MemoryJob } from "./memory-queue";

const cli = new MemsearchCLI();

export interface ProcessResult {
	success: boolean;
	error?: string;
	data?: any;
	retryable?: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function withRetry<T>(
	operation: () => Promise<T>,
	operationName: string,
	context: string,
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			console.log(
				`[memsearch] ${context}: ${operationName} (attempt ${attempt}/${MAX_RETRIES})`,
			);
			return await operation();
		} catch (err) {
			lastError = err as Error;
			const errorMsg = String(err);

			// Check if error is retryable
			const isRetryable =
				errorMsg.includes("ConnectionError") ||
				errorMsg.includes("Connection refused") ||
				errorMsg.includes("Failed to connect") ||
				errorMsg.includes("timeout") ||
				errorMsg.includes("ECONNREFUSED") ||
				errorMsg.includes("ENOTFOUND");

			if (!isRetryable) {
				console.error(
					`[memsearch] ${context}: Non-retryable error - ${errorMsg}`,
				);
				throw err;
			}

			if (attempt < MAX_RETRIES) {
				console.warn(
					`[memsearch] ${context}: Service unavailable, retrying in ${RETRY_DELAY_MS}ms...`,
				);
				console.warn(`[memsearch] ${context}: Error: ${errorMsg}`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
			} else {
				console.error(
					`[memsearch] ${context}: All ${MAX_RETRIES} attempts failed`,
				);
				console.error(`[memsearch] ${context}: Final error: ${errorMsg}`);
				throw err;
			}
		}
	}

	throw lastError;
}

export async function processMemoryJob(job: MemoryJob): Promise<ProcessResult> {
	console.log(`[memsearch] Starting ${job.type} job for ${job.projectId}`);

	try {
		switch (job.type) {
			case "session-created":
				return await processSessionCreated(job);
			case "session-idle":
				return await processSessionIdle(job);
			case "session-deleted":
				return await processSessionDeleted(job);
			case "manual-index":
				return await processManualIndex(job);
			default:
				return {
					success: false,
					error: `Unknown job type: ${(job as any).type}`,
				};
		}
	} catch (err) {
		const errorMsg = String(err);
		console.error(`[memsearch] Job ${job.id} failed: ${errorMsg}`);

		// Determine if error is retryable
		const isRetryable =
			errorMsg.includes("ConnectionError") ||
			errorMsg.includes("Connection refused") ||
			errorMsg.includes("Failed to connect") ||
			errorMsg.includes("timeout");

		return {
			success: false,
			error: errorMsg,
			retryable: isRetryable,
		};
	}
}

async function processSessionCreated(job: MemoryJob): Promise<ProcessResult> {
	const { directory, sessionId, projectId } = job;

	console.log(`[memsearch] Processing session-created for ${projectId}`);

	// Check CLI availability with retry
	const isAvailable = await withRetry(
		() => cli.checkAvailability(),
		"Checking CLI availability",
		projectId,
	);

	if (!isAvailable) {
		console.error(
			`[memsearch] ${projectId}: Memsearch CLI not available. Please install: pip install memsearch`,
		);
		return { success: false, error: "CLI not available", retryable: false };
	}

	console.log(`[memsearch] ${projectId}: CLI is available`);

	// Start watcher if not running
	if (!state.watcherRunning) {
		console.log(`[memsearch] ${projectId}: Starting file watcher`);
		state.watcherRunning = true;
		(async () => {
			try {
				await cli.watch(directory);
			} catch (err) {
				console.error(`[memsearch] ${projectId}: Watcher failed: ${err}`);
				state.watcherRunning = false;
			}
		})();
	}

	// Index the directory with retry
	try {
		console.log(`[memsearch] ${projectId}: Indexing ${directory}`);
		await withRetry(
			() => cli.index(directory, {}),
			"Indexing directory",
			projectId,
		);

		markSessionProcessed(sessionId);
		console.log(`[memsearch] ${projectId}: Successfully indexed`);
		return { success: true, data: { indexed: true } };
	} catch (err) {
		const errorMsg = String(err);
		console.error(`[memsearch] ${projectId}: Indexing failed: ${errorMsg}`);

		// Check for specific service errors
		if (errorMsg.includes("ollama") || errorMsg.includes("Ollama")) {
			console.error(
				`[memsearch] ${projectId}: Ollama embedding service issue. Check:`,
			);
			console.error(
				`[memsearch] ${projectId}:   - Ollama is running: ollama serve`,
			);
			console.error(
				`[memsearch] ${projectId}:   - Config has correct host in .memsearch.toml`,
			);
			console.error(
				`[memsearch] ${projectId}:   - Model is pulled: ollama pull nomic-embed-text`,
			);
		}

		if (errorMsg.includes("milvus") || errorMsg.includes("Milvus")) {
			console.error(
				`[memsearch] ${projectId}: Milvus vector database issue. Check:`,
			);
			console.error(`[memsearch] ${projectId}:   - Milvus is running`);
			console.error(
				`[memsearch] ${projectId}:   - Connection URI in .memsearch.toml`,
			);
		}

		return { success: false, error: errorMsg, retryable: true };
	}
}

async function processSessionIdle(job: MemoryJob): Promise<ProcessResult> {
	const { directory, projectId } = job;

	console.log(`[memsearch] Processing session-idle for ${projectId}`);

	try {
		const summary = await withRetry(
			() => cli.compact(),
			"Compacting memories",
			projectId,
		);

		if (!summary?.trim()) {
			console.log(`[memsearch] ${projectId}: No summary generated`);
			return {
				success: true,
				data: { compacted: false, reason: "no-summary" },
			};
		}

		console.log(`[memsearch] ${projectId}: Successfully compacted`);
		return { success: true, data: { compacted: true, summary } };
	} catch (err) {
		const errorMsg = String(err);
		console.error(`[memsearch] ${projectId}: Compaction failed: ${errorMsg}`);
		return { success: false, error: errorMsg, retryable: true };
	}
}

async function processSessionDeleted(job: MemoryJob): Promise<ProcessResult> {
	console.log(`[memsearch] Processing session-deleted for ${job.projectId}`);
	return { success: true, data: { archived: true } };
}

async function processManualIndex(job: MemoryJob): Promise<ProcessResult> {
	const { directory, data, projectId } = job;

	console.log(`[memsearch] Processing manual-index for ${projectId}`);

	try {
		await withRetry(
			() =>
				cli.index(directory, {
					collection: data?.collection,
				}),
			"Manual indexing",
			projectId,
		);

		console.log(`[memsearch] ${projectId}: Manual indexing complete`);
		return { success: true, data: { indexed: true, manual: true } };
	} catch (err) {
		const errorMsg = String(err);
		console.error(
			`[memsearch] ${projectId}: Manual indexing failed: ${errorMsg}`,
		);
		return { success: false, error: errorMsg, retryable: true };
	}
}
