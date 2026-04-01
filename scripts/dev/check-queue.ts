import { queue } from "./lib/memory-queue";
async function check() {
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const completed = await queue.getCompletedCount();
  console.log(`Queue: ${waiting} waiting, ${active} active, ${completed} completed`);
}
check();
