import { Worker } from "bunqueue/client";
import { processMemoryJob } from "./memory-pipeline";
import { type MemoryJob, queue } from "./memory-queue";
import {
	incrementCompleted,
	incrementFailed,
} from "./queue-state";

const concurrency = parseInt(process.env.MEMSEARCH_CONCURRENCY || "1", 10);
const STALL_TIMEOUT_MS = 120000;

const processingProjects = new Set<string>();

const worker = new Worker(
	"memsearch-memory",
	async (job: { id: string; name: string; data: MemoryJob }) => {
		const jobData = job.data;
		const { projectId } = jobData;

		if (processingProjects.has(projectId)) {
			await queue.add(job.name, jobData, {
				priority: Math.max(1, (jobData.priority || 10) - 5),
				deduplication: {
					id: jobData.dedupKey,
					ttl: 60000,
					replace: true,
				},
			});
			return { deferred: true, reason: "project-busy", requeued: true };
		}

		processingProjects.add(projectId);

		try {
			const result = await processMemoryJob(jobData);

			if (result.success) {
				incrementCompleted();
			} else {
				incrementFailed();
			}

			return result;
		} catch (error) {
			incrementFailed();
			return { success: false, error: String(error) };
		} finally {
			processingProjects.delete(projectId);
		}
	},
	{
		embedded: true,
		concurrency,
		useLocks: true,
		lockDuration: STALL_TIMEOUT_MS,
		maxStalledCount: 2,
	},
);

worker.on("failed", () => {
	incrementFailed();
});

worker.on("error", () => {});

worker.on("stalled", (jobId: string) => {
	console.error(`Job ${jobId} stalled after ${STALL_TIMEOUT_MS}ms`);
});

const heartbeat = setInterval(() => {}, 30000);

process.on("SIGINT", () => {
	clearInterval(heartbeat);
	worker.close().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
	clearInterval(heartbeat);
	worker.close().then(() => process.exit(0));
});

export function shutdownWorker() {
	clearInterval(heartbeat);
	return worker.close();
}
