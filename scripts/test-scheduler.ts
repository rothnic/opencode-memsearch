#!/usr/bin/env bun
import { createScheduler } from "../lib/memory-extraction-scheduler";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";

async function testScheduler() {
  console.log("Testing scheduler - single run mode...\n");
  
  const scheduler = createScheduler(WORKDIR, {
    checkIntervalMs: 5 * 60 * 1000,
    maxSessionsPerCheck: 5,
    maxQueueDepth: 50,
  });
  
  const result = await scheduler.run(WORKDIR);
  
  console.log("\n✅ Test complete:");
  console.log(`   Sessions checked: ${result.checked}`);
  console.log(`   Sessions queued: ${result.queued}`);
  console.log(`   Sessions skipped: ${result.skipped}`);
  if (result.reasons.length > 0) {
    console.log(`   Reasons: ${result.reasons.join(", ")}`);
  }
}

testScheduler().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
