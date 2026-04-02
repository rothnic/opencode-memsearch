import { queue } from "../../src/queue/memory-queue";

async function clear() {
	try {
		// Get waiting jobs and remove them one by one
		// Note: bunqueue API may vary - this is a best-effort implementation
		const waitingJobs = await queue.getWaiting();
		let removed = 0;
		
		if (waitingJobs && waitingJobs.length > 0) {
			for (const job of waitingJobs) {
				try {
					await job.remove();
					removed++;
				} catch {
					// Ignore individual job removal errors
				}
			}
		}
		
		console.log(`Queue cleared: ${removed} jobs removed`);
	} catch (err) {
		console.error("Failed to clear queue:", err);
		console.log("Note: You may need to manually clear the queue database at ~/.config/opencode/memsearch/queue/memory.db");
	}
}

clear();
