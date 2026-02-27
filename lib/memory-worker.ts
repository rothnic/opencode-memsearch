import { Worker } from "bunqueue/client";
import { processMemoryJob } from "./memory-pipeline";
import { type MemoryJob, queue } from "./memory-queue";
import {
	incrementCompleted,
	incrementDeferred,
	incrementFailed,
	isProjectProcessing,
	markProjectProcessing,
	unmarkProjectProcessing,
} from "./queue-state";

// Configurable concurrency (default: 1)
const concurrency = parseInt(process.env.MEMSEARCH_CONCURRENCY || "1", 10);

// Create the worker
const worker = new Worker(
	"memsearch-memory",
	async (job: { id: string; name: string; data: MemoryJob }) => {
		const jobData = job.data;
		console.log(
			`[memsearch] Processing ${jobData.type} for ${jobData.projectId}`,
		);

		// Check if project is already being processed
		if (isProjectProcessing(jobData.projectId)) {
			console.log(
				`[memsearch] Project ${jobData.projectId} busy, deferring job ${job.id}`,
			);

			// Re-queue with delay
			await queue.add(job.name, jobData, {
				delay: 10000, // 10 seconds
				priority: jobData.priority,
				deduplication: {
					id: jobData.dedupKey,
					ttl: 60000,
					replace: true,
				},
			});

			incrementDeferred();
			return { deferred: true, reason: "project-busy" };
		}

		// Mark project as processing
		markProjectProcessing(jobData.projectId);

		try {
			// Execute the pipeline
			const result = await processMemoryJob(jobData);

			if (result.success) {
				incrementCompleted();
				console.log(
					`[memsearch] Completed ${jobData.type} for ${jobData.projectId}`,
				);
			} else {
				incrementFailed();
				console.error(
					`[memsearch] Failed ${jobData.type} for ${jobData.projectId}: ${result.error}`,
				);
			}

			return result;
		} finally {
			// Always unmark project when done
			unmarkProjectProcessing(jobData.projectId);
			// Add small delay between jobs to avoid overwhelming
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	},
	{
		embedded: true,
		concurrency,
	},
);

// Event handlers
worker.on("completed", (job: any, result: any) => {
	if (result?.deferred) {
		console.log(`[memsearch] Job ${job?.id} deferred: ${result.reason}`);
	}
});

worker.on("failed", (job: any, error: Error) => {
	console.error(`[memsearch] Job ${job?.id} failed:`, error.message);
	incrementFailed();
});

console.log(`[memsearch] Worker initialized with concurrency=${concurrency}`);

// Export for potential shutdown handling
export function shutdownWorker() {
	return worker.close();
}
