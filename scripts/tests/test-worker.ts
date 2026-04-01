import { Worker } from "bunqueue/client";

console.log("Testing worker connection...");

// Check if we can connect to the queue
const worker = new Worker(
  "memsearch-memory",
  async (job) => {
    console.log("Processing job:", job.id);
    return { success: true };
  },
  {
    embedded: false, // Try non-embedded mode
    concurrency: 1,
  }
);

console.log("Worker created, waiting for jobs...");
console.log("(Press Ctrl+C to stop)");

// Keep process alive
setInterval(() => {
  console.log("Worker heartbeat - " + new Date().toISOString());
}, 10000);
