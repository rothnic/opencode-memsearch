import { queue, signalSessionActivity } from "../lib/queue/memory-queue";

async function testDedup() {
  const before = await queue.getWaitingCount();
  console.log(`Jobs before: ${before}`);
  
  const sessionId = `dedup-test-${Date.now()}`;
  
  // Add 5 identical jobs
  for (let i = 0; i < 5; i++) {
    await signalSessionActivity(
      "session-created",
      sessionId,
      "test-project",
      "/tmp/test",
      { attempt: i }
    );
  }
  
  const after = await queue.getWaitingCount();
  console.log(`Jobs after: ${after}`);
  console.log(`New jobs added: ${after - before} (should be 1)`);
  
  if (after - before === 1) {
    console.log("✅ Deduplication working correctly!");
  } else {
    console.log("❌ Deduplication not working as expected");
  }
}

testDedup();
