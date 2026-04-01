import { Queue } from "bunqueue/client";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { checkForUnprocessedSessions } from "./backfill";
import { cleanupOldState } from "../../state";

const queueDataDir = join(
	homedir(),
	".config",
	"opencode",
	"memsearch",
	"queue",
);
mkdirSync(queueDataDir, { recursive: true });
process.env.DATA_PATH = join(queueDataDir, "memory.db");

export interface MemoryJob {
	type:
		| "session-created"
		| "session-idle"
		| "session-deleted"
		| "manual-index"
		| "backfill";
	sessionId: string;
	projectId: string;
	directory: string;
	timestamp: number;
	priority: number;
	dedupKey: string;
	data?: any;
}

export const queue = new Queue<MemoryJob>("memsearch-memory", {
	embedded: true,
	defaultJobOptions: {
		attempts: 3,
		backoff: 5000,
		removeOnComplete: 10,
		removeOnFail: 5,
	},
});

export async function signalSessionActivity(
	type: MemoryJob["type"],
	sessionId: string,
	projectId: string,
	directory: string,
	data?: any,
) {
	const dedupKey = `${projectId}:${sessionId}:${type}`;
	// Priority: lower number = higher priority in bunqueue
	// Real-time events (session-created): priority 10
	// Manual index: priority 20
	// Backfill: priority 50+ (lowest)
	const priority = data?.priority ?? (type === "backfill" ? 50 : type === "manual-index" ? 20 : 10);

	await queue.add(
		`memory-${type}`,
		{
			type,
			sessionId,
			projectId,
			directory,
			timestamp: Date.now(),
			priority,
			dedupKey,
			data,
		},
		{
			priority,
			deduplication: {
				id: dedupKey,
				ttl: 60000,
				replace: true,
			},
		},
	);
}

let recurringJobsSetup = false;

export async function setupRecurringJobs(): Promise<void> {
	if (recurringJobsSetup) {
		return;
	}

	recurringJobsSetup = true;

	try {
		// Schedule backfill every 6 hours (generates markdown for new sessions)
		await queue.upsertJobScheduler(
			"backfill-check",
			{
				every: 6 * 60 * 60 * 1000, // 6 hours
			},
			{
				name: "backfill-check",
				data: {
					type: "backfill",
					sessionId: "backfill-check",
					projectId: "global",
					directory: "",
					timestamp: Date.now(),
					priority: 0,
					dedupKey: "backfill-check",
				} as MemoryJob,
				opts: {
					priority: 0,
				},
			},
		);

		// Schedule indexing discovery every hour (queues projects for indexing)
		await queue.upsertJobScheduler(
			"index-discovery",
			{
				every: 60 * 60 * 1000, // 1 hour
			},
			{
				name: "index-discovery",
				data: {
					type: "manual-index",
					sessionId: "index-discovery",
					projectId: "discovery",
					directory: "",
					timestamp: Date.now(),
					priority: 10,
					dedupKey: "index-discovery",
				} as MemoryJob,
				opts: {
					priority: 10,
				},
			},
		);

		// Schedule state cleanup every hour to prevent memory leaks
		setInterval(() => {
			cleanupOldState();
		}, 60 * 60 * 1000); // 1 hour
	} catch {
		// Silent fail
	}
}
