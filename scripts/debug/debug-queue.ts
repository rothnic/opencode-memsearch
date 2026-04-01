// Set data path first
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const queueDataDir = join(homedir(), ".config", "opencode", "memsearch", "queue");
mkdirSync(queueDataDir, { recursive: true });
process.env.DATA_PATH = join(queueDataDir, "memory.db");

console.log("DATA_PATH set to:", process.env.DATA_PATH);

// Now import queue and worker
import { Queue } from "bunqueue/client";
import { Worker } from "bunqueue/client";

const testQueue = new Queue("test-queue", { embedded: true });
console.log("Queue created");

const testWorker = new Worker(
  "test-queue",
  async (job) => {
    console.log("Worker processing job:", job.id, job.data);
    return { processed: true };
  },
  { embedded: true, concurrency: 1 }
);
console.log("Worker created");

// Add a test job
console.log("Adding test job...");
await testQueue.add("test", { message: "hello" });

// Wait and check
await new Promise(r => setTimeout(r, 5000));

const waiting = await testQueue.getWaitingCount();
const completed = await testQueue.getCompletedCount();
console.log(`Waiting: ${waiting}, Completed: ${completed}`);

// Cleanup
await testWorker.close();
await testQueue.close();
