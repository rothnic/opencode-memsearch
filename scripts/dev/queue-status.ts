import { queue } from "../../src/queue/memory-queue";
async function check() {
  const w = await queue.getWaitingCount();
  const a = await queue.getActiveCount();
  const c = await queue.getCompletedCount();
  const f = await queue.getFailedCount();
  process.stdout.write(`[${new Date().toLocaleTimeString()}] Waiting: ${w}, Active: ${a}, Completed: ${c}, Failed: ${f}    \r`);
}
check();
