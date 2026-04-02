import { MemsearchCLI, MemsearchTimeoutError } from "../cli-wrapper";
import { loadConfig } from "../config";
import { markSessionProcessed, state } from "../state";
import { checkForUnprocessedSessions } from "../queue/backfill";
import { join } from "path";
import { type MemoryJob } from "../queue/memory-queue";

const cli = new MemsearchCLI();

const INDEX_TIMEOUT_MS = 60000;

export interface ProcessResult {
	success: boolean;
	error?: string;
	data?: any;
}

export async function processMemoryJob(job: MemoryJob): Promise<ProcessResult> {
	switch (job.type) {
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

async function processSessionCreated(job: MemoryJob): Promise<ProcessResult> {
	const { directory, sessionId, projectId } = job;

	const isAvailable = await cli.checkAvailability();
	if (!isAvailable) {
		return { success: false, error: "CLI not available" };
	}

	if (!state.watcherRunning) {
		state.watcherRunning = true;
		(async () => {
			try {
				await cli.watch(directory);
			} catch {
				state.watcherRunning = false;
			}
		})();
	}

	try {
		const sessionsDir = join(directory, ".memsearch", "sessions");
		await cli.index(sessionsDir, { timeout: INDEX_TIMEOUT_MS });
		markSessionProcessed(sessionId);
		return { success: true, data: { indexed: true } };
	} catch (err) {
		if (err instanceof MemsearchTimeoutError) {
			return {
				success: false,
				error: `Indexing timed out after ${INDEX_TIMEOUT_MS / 1000}s - Ollama may be unresponsive`,
			};
		}
		return { success: false, error: String(err) };
	}
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
	const { directory, data, projectId } = job;
	if (projectId === "discovery" && !directory) {
		return discoverAndQueueProjects();
	}

	const indexPath = data?.directory || directory;
	if (!indexPath) {
		return { success: false, error: "No directory specified for indexing" };
	}

	try {
		await cli.index(indexPath, {
			recursive: data?.recursive ?? true,
			collection: data?.collection,
			timeout: INDEX_TIMEOUT_MS,
		} as any);
		return { success: true, data: { indexed: true, manual: true } };
	} catch (err) {
		if (err instanceof MemsearchTimeoutError) {
			return {
				success: false,
				error: `Indexing timed out after ${INDEX_TIMEOUT_MS / 1000}s - Ollama may be unresponsive`,
			};
		}
		return { success: false, error: String(err) };
	}
}

async function discoverAndQueueProjects(): Promise<ProcessResult> {
	const { readdirSync, existsSync } = await import("fs");
	const { join } = await import("path");
	const { signalSessionActivity } = await import("../queue/memory-queue");

	const baseDir = process.env.HOME || "";
	const workspaceDir = join(baseDir, "workspace");
	let queued = 0;

	try {
		for (const entry of readdirSync(workspaceDir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const sessionsDir = join(workspaceDir, entry.name, ".memsearch", "sessions");
				if (existsSync(sessionsDir)) {
					const files = readdirSync(sessionsDir);
					if (files.some((f) => f.endsWith(".md"))) {
						const projectDir = join(workspaceDir, entry.name);
						await signalSessionActivity(
							"manual-index",
							`index-${entry.name}-${Date.now()}`,
							entry.name,
							projectDir,
							{ directory: sessionsDir, recursive: true }
						);
						queued++;
					}
				}
			}
		}

		return {
			success: true,
			data: { discovered: true, projectsQueued: queued },
		};
	} catch (err) {
		return {
			success: false,
			error: `Discovery failed: ${err}`,
		};
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
