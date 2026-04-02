import { queue } from "../../src/queue/memory-queue";

async function checkQueueStatus() {
  console.log("📊 Queue Status Check\n");
  
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const completed = await queue.getCompletedCount();
  const failed = await queue.getFailedCount();
  const delayed = await queue.getDelayedCount();
  
  console.log(`Waiting:   ${waiting}`);
  console.log(`Active:    ${active}`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Delayed:   ${delayed}`);
  console.log(`\nTotal:     ${waiting + active + completed + failed + delayed}`);
  
  // Check if worker is configured
  try {
    const workers = await queue.getWorkers();
    console.log(`\nWorkers: ${workers.length}`);
    if (workers.length > 0) {
      console.log("✅ Worker is connected");
    } else {
      console.log("⚠️  No workers connected");
    }
  } catch (err) {
    console.log("\n⚠️  Could not check workers (may not be supported)");
  }
}

checkQueueStatus().then(() => process.exit(0));
