import { Queue } from "bunqueue/client";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Ensure queue data directory exists
const queueDataDir = join(
	homedir(),
	".config",
	"opencode",
	"memsearch",
	"queue",
);
mkdirSync(queueDataDir, { recursive: true });
process.env.DATA_PATH = join(queueDataDir, "memory.db");

// Job type definition
export interface MemoryJob {
	type: "session-created" | "session-idle" | "session-deleted" | "manual-index";
	sessionId: string;
	projectId: string;
	directory: string;
	timestamp: number;
	priority: number;
	dedupKey: string;
	data?: any;
}

// Create the global queue
export const queue = new Queue<MemoryJob>("memsearch-memory", {
	embedded: true,
	defaultJobOptions: {
		attempts: 3,
		backoff: 5000,
		removeOnComplete: 100,
		removeOnFail: 50,
	},
});

// Job scheduling function
export async function signalSessionActivity(
	type: MemoryJob["type"],
	sessionId: string,
	projectId: string,
	directory: string,
	data?: any,
) {
	const dedupKey = `${projectId}:${sessionId}:${type}`;

	await queue.add(
		`memory-${type}`,
		{
			type,
			sessionId,
			projectId,
			directory,
			timestamp: Date.now(),
			priority: type === "manual-index" ? 10 : 0,
			dedupKey,
			data,
		},
		{
			priority: type === "manual-index" ? 10 : 0,
			deduplication: {
				id: dedupKey,
				ttl: 60000,
				replace: true,
			},
		},
	);
}
