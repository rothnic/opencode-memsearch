#!/usr/bin/env bun
import { createUnifiedScheduler } from "../src/scheduler/unified-scheduler";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";

async function test() {
  console.log("Testing unified scheduler...\n");
  
  const scheduler = createUnifiedScheduler(WORKDIR, {
    checkIntervalMs: 5 * 60 * 1000,
    maxSessionsPerCheck: 5,
    maxQueueDepth: 50,
    maxSessionAgeDays: 30,
  });
  
  const result = await scheduler.run();
  
  console.log("\n✅ Run complete:");
  console.log(`   Sessions queued: ${result.sessionsQueued}`);
  console.log(`   Configs changed: ${result.configsChanged.join(", ") || "none"}`);
  console.log(`   Sessions changed: ${result.sessionsChanged.length}`);
  if (result.reasons.length > 0) {
    console.log(`   Reasons: ${result.reasons.join(", ")}`);
  }
  
  scheduler.stop();
}

test().catch(console.error);
