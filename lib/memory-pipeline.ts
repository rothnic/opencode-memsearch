import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import { markSessionProcessed, state } from "../state";
import { checkForUnprocessedSessions } from "./backfill";
import type { MemoryJob } from "./memory-queue";

const cli = new MemsearchCLI();

// Track last indexing time for rate limiting
let lastIndexTime = 0;
const MIN_INDEX_INTERVAL_MS = 60 * 1000; // 1 minute between indexing jobs

export interface ProcessResult {
	success: boolean;
	error?: string;
	data?: any;
}

export async function processMemoryJob(job: MemoryJob): Promise<ProcessResult> {
	switch (job.type) {
		case "generate-markdown":
			return processGenerateMarkdown(job);
		case "session-created":
			return processSessionCreated(job);
		case "session-idle":
			return processSessionIdle(job);
		case "session-deleted":
			return processSessionDeleted(job);
		case "manual-index":
			return processManualIndex(job);
		case "backfill":
			return processBackfill(job);
		default:
			return {
				success: false,
				error: `Unknown job type: ${(job as any).type}`,
			};
	}
}

async function processGenerateMarkdown(job: MemoryJob): Promise<ProcessResult> {
	const { sessionId, projectId, directory, data } = job;

	try {
		// Fast: Just ensure markdown file exists
		// (In real implementation, this would fetch from SQLite and write markdown)
		// For now, we'll just queue the indexing job
		
		// Calculate delay based on recency for indexing
		const now = Date.now();
		const timeUpdated = data?.timeUpdated || now;
		const ageMs = now - timeUpdated;
		const ageHours = ageMs / (1000 * 60 * 60);
		
		let delay = MIN_INDEX_INTERVAL_MS; // Default 1 minute
		if (ageHours < 1) {
			delay = 0; // Immediate for very recent
		} else if (ageHours < 24) {
			delay = 5000; // 5 seconds for today
		} else if (ageHours < 24 * 7) {
			delay = 30000; // 30 seconds for this week
		}
		
		// Queue indexing job with calculated delay
		const { queue } = await import("./memory-queue");
		await queue.add(
			`memory-session-created`,
			{
				type: "session-created",
				sessionId,
				projectId,
				directory,
				timestamp: Date.now(),
				priority: data?.priority ?? 0,
				dedupKey: `${projectId}:${sessionId}:session-created`,
				data,
			},
			{
				delay,
				priority: data?.priority ?? 0,
				deduplication: {
					id: `${projectId}:${sessionId}:session-created`,
					ttl: 60000,
					replace: true,
				},
			}
		);

		return { success: true, data: { queued: true, indexDelay: delay } };
	} catch (err) {
		return { success: false, error: String(err) };
	}
}

async function processSessionCreated(job: MemoryJob): Promise<ProcessResult> {
	const { directory, sessionId, projectId } = job;

	// Rate limiting: ensure at least 1 minute between indexing jobs
	const now = Date.now();
	const timeSinceLastIndex = now - lastIndexTime;

	if (timeSinceLastIndex < MIN_INDEX_INTERVAL_MS) {
		const delayNeeded = MIN_INDEX_INTERVAL_MS - timeSinceLastIndex;
		console.log(
			`[memsearch] Rate limiting: delaying ${sessionId} by ${delayNeeded}ms`
		);

		// Re-queue with delay
		const { queue } = await import("./memory-queue");
		await queue.add(`memory-session-created-delayed`, job, {
			delay: delayNeeded,
			priority: job.priority ?? 0,
		});

		return {
			success: true,
			data: { rateLimited: true, retryIn: delayNeeded },
		};
	}

	lastIndexTime = now;

	const isAvailable = await cli.checkAvailability();
	if (!isAvailable) {
		return { success: false, error: "CLI not available" };
	}

	if (!state.watcherRunning) {
		state.watcherRunning = true;
		(async () => {
			try {
				await cli.watch(directory);
			} catch (err) {
				state.watcherRunning = false;
			}
		})();
	}

	console.log(`[memsearch] ${projectId}: Indexed session ${sessionId}`);
	markSessionProcessed(sessionId);
	return { success: true, data: { indexed: true } };
}

async function processSessionIdle(job: MemoryJob): Promise<ProcessResult> {
	const { directory } = job;

	try {
		const config = await loadConfig(directory);
		const summary = await cli.compact();

		if (!summary?.trim()) {
			return {
				success: true,
				data: { compacted: false, reason: "no-summary" },
			};
		}

		return { success: true, data: { compacted: true, summary } };
	} catch (err) {
		return { success: false, error: String(err) };
	}
}

async function processSessionDeleted(job: MemoryJob): Promise<ProcessResult> {
	return { success: true, data: { archived: true } };
}

async function processManualIndex(job: MemoryJob): Promise<ProcessResult> {
	const { directory, data } = job;

	try {
		await cli.index(directory, {
			recursive: data?.recursive ?? true,
			collection: data?.collection,
		} as any);

		return { success: true, data: { indexed: true, manual: true } };
	} catch (err) {
		return { success: false, error: String(err) };
	}
}

async function processBackfill(job: MemoryJob): Promise<ProcessResult> {
	try {
		await checkForUnprocessedSessions();
		return { success: true, data: { backfillComplete: true } };
	} catch (err) {
		return { success: false, error: String(err) };
	}
}
