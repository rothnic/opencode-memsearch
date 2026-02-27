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

const concurrency = parseInt(process.env.MEMSEARCH_CONCURRENCY || "1", 10);

const worker = new Worker(
	"memsearch-memory",
	async (job: { id: string; name: string; data: MemoryJob }) => {
		const jobData = job.data;

		if (isProjectProcessing(jobData.projectId)) {
			await queue.add(job.name, jobData, {
				delay: 10000,
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

		markProjectProcessing(jobData.projectId);

		try {
			const result = await processMemoryJob(jobData);

			if (result.success) {
				incrementCompleted();
			} else {
				incrementFailed();
			}

			return result;
		} finally {
			unmarkProjectProcessing(jobData.projectId);
		}
	},
	{
		embedded: true,
		concurrency,
	},
);

worker.on("failed", () => {
	incrementFailed();
});

export function shutdownWorker() {
	return worker.close();
}
