import "../lib/queue/memory-worker";
import { queue } from "../lib/queue/memory-queue";

console.log("Worker should be running...");
console.log("(Will stay alive for 30 seconds)");

// Add a test job
await queue.add("test-job", { 
  type: "session-created",
  sessionId: "test-worker-alive",
  projectId: "test",
  directory: "/tmp/test",
  timestamp: Date.now(),
  priority: 100,
  dedupKey: "test:worker:alive"
}, { priority: 100 });

console.log("Test job added");

// Check queue status every 5 seconds
for (let i = 0; i < 6; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const waiting = await queue.getWaitingCount();
  const completed = await queue.getCompletedCount();
  console.log(`[${i+1}/6] Waiting: ${waiting}, Completed: ${completed}`);
}

console.log("Test complete");
