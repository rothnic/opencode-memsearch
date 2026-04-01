import { queue } from "./lib/memory-queue";
async function check() {
  const w = await queue.getWaitingCount();
  const a = await queue.getActiveCount();
  const c = await queue.getCompletedCount();
  console.log(`Queue: ${w} waiting, ${a} active, ${c} completed`);
}
check();
