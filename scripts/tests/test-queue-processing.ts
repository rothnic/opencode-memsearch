import { queue, signalSessionActivity } from "../../src/queue/memory-queue";
import "../../src/queue/memory-worker";

async function waitForProcessing(timeoutMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    
    console.log(`Waiting: ${waiting}, Active: ${active}`);
    
    if (waiting === 0 && active === 0) {
      console.log("✅ All jobs processed!");
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("⏱️  Timeout reached");
}

async function testProcessing() {
  console.log("Testing job processing...\n");
  
  // Import worker to ensure it's initialized
  console.log("Worker module imported\n");
  
  const beforeCompleted = await queue.getCompletedCount();
  const beforeWaiting = await queue.getWaitingCount();
  
  console.log(`Before test:`);
  console.log(`  Completed: ${beforeCompleted}`);
  console.log(`  Waiting: ${beforeWaiting}\n`);
  
  // Add a test job
  const sessionId = `process-test-${Date.now()}`;
  await signalSessionActivity(
    "session-created",
    sessionId,
    "test-project",
    "/tmp/test",
    { test: true }
  );
  
  console.log(`Added test job for session ${sessionId}\n`);
  
  // Wait for it to be processed
  await waitForProcessing(15000);
  
  const afterCompleted = await queue.getCompletedCount();
  const afterWaiting = await queue.getWaitingCount();
  
  console.log(`\nAfter test:`);
  console.log(`  Completed: ${afterCompleted} (was ${beforeCompleted})`);
  console.log(`  Waiting: ${afterWaiting} (was ${beforeWaiting})`);
  
  if (afterCompleted > beforeCompleted) {
    console.log("\n✅ Jobs are being processed!");
  } else {
    console.log("\n⚠️  Jobs may not be processing - check worker configuration");
  }
}

testProcessing().then(() => process.exit(0)).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
