import { queue } from "../../src/queue/memory-queue";
async function check() {
  const w = await queue.getWaitingCount();
  const a = await queue.getActiveCount();
  const c = await queue.getCompletedCount();
  const f = await queue.getFailedCount();
  console.log(`Waiting: ${w}`);
  console.log(`Active: ${a}`);
  console.log(`Completed: ${c}`);
  console.log(`Failed: ${f}`);
  console.log(`Total: ${w + a + c + f}`);
}
check();
