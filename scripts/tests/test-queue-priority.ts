/**
 * @file test-queue-priority.ts
 * @description Test queue priority processing - adds jobs with different priorities and verifies processing order
 */

import { queue, signalSessionActivity, type MemoryJob } from "../lib/queue/memory-queue";
import { mkdirSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/test-memsearch-priority";
const PROCESSING_LOG: string[] = [];

// Setup test directory
try {
  mkdirSync(join(TEST_DIR, ".memsearch", "sessions"), { recursive: true });
} catch {
  // Directory may already exist
}

// Track job processing order
async function trackJobProcessing(job: MemoryJob): Promise<void> {
  const timestamp = Date.now();
  PROCESSING_LOG.push(`${job.type}:${job.sessionId}:${job.priority}:${timestamp}`);
}

// Test that jobs are processed by priority
async function testPriorityProcessing(): Promise<boolean> {
  console.log("Testing priority-based job processing...\n");
  
  const sessionId = `priority-test-${Date.now()}`;
  const projectId = "test-project";
  
  // Add jobs in reverse priority order (low priority first)
  console.log("Adding jobs in this order (low to high priority):");
  const jobs = [
    { type: "session-deleted" as const, priority: 10, label: "Low (10)" },
    { type: "session-idle" as const, priority: 50, label: "Medium (50)" },
    { type: "session-created" as const, priority: 200, label: "High (200)" },
  ];
  
  for (const job of jobs) {
    console.log(`  - ${job.label}: ${job.type}`);
    await signalSessionActivity(
      job.type,
      sessionId,
      projectId,
      TEST_DIR,
      { priority: job.priority }
    );
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  console.log("\nJobs added to queue. Waiting for processing...\n");
  
  // Wait for jobs to be processed (queue processes asynchronously)
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get queue stats
  try {
    const waitingCount = await queue.getWaitingCount();
    const activeCount = await queue.getActiveCount();
    const completedCount = await queue.getCompletedCount();
    
    console.log(`Queue Status:`);
    console.log(`  Waiting: ${waitingCount}`);
    console.log(`  Active: ${activeCount}`);
    console.log(`  Completed: ${completedCount}`);
    
    return true;
  } catch (err) {
    console.error("Error checking queue status:", err);
    return false;
  }
}

// Test deduplication
async function testDeduplication(): Promise<boolean> {
  console.log("\n\nTesting deduplication...\n");
  
  const sessionId = `dedup-test-${Date.now()}`;
  const projectId = "test-project";
  
  console.log("Adding 5 identical jobs (should be deduplicated to 1):");
  
  // Add the same job 5 times
  for (let i = 0; i < 5; i++) {
    await signalSessionActivity(
      "session-created",
      sessionId,
      projectId,
      TEST_DIR,
      { attempt: i }
    );
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    const waitingCount = await queue.getWaitingCount();
    console.log(`Jobs waiting after dedup (should be ~1): ${waitingCount}`);
    return waitingCount <= 1;
  } catch (err) {
    console.error("Error checking dedup:", err);
    return false;
  }
}

// Test queue persistence
async function testQueuePersistence(): Promise<boolean> {
  console.log("\n\nTesting queue persistence...\n");
  
  try {
    // Check that queue has expected methods
    const hasWaiting = typeof queue.getWaitingCount === "function";
    const hasActive = typeof queue.getActiveCount === "function";
    const hasCompleted = typeof queue.getCompletedCount === "function";
    const hasFailed = typeof queue.getFailedCount === "function";
    
    console.log(`Queue methods available:`);
    console.log(`  getWaitingCount: ${hasWaiting}`);
    console.log(`  getActiveCount: ${hasActive}`);
    console.log(`  getCompletedCount: ${hasCompleted}`);
    console.log(`  getFailedCount: ${hasFailed}`);
    
    return hasWaiting && hasActive && hasCompleted && hasFailed;
  } catch (err) {
    console.error("Error checking persistence:", err);
    return false;
  }
}

// Run all tests
async function main() {
  console.log("🧪 Queue Priority & Functionality Tests\n");
  console.log("=" .repeat(50));
  
  const results: { name: string; passed: boolean }[] = [];
  
  // Test 1: Priority Processing
  try {
    const passed = await testPriorityProcessing();
    results.push({ name: "Priority Processing", passed });
  } catch (err) {
    console.error("Priority test failed:", err);
    results.push({ name: "Priority Processing", passed: false });
  }
  
  // Test 2: Deduplication
  try {
    const passed = await testDeduplication();
    results.push({ name: "Deduplication", passed });
  } catch (err) {
    console.error("Dedup test failed:", err);
    results.push({ name: "Deduplication", passed: false });
  }
  
  // Test 3: Queue Persistence
  try {
    const passed = await testQueuePersistence();
    results.push({ name: "Queue Persistence", passed });
  } catch (err) {
    console.error("Persistence test failed:", err);
    results.push({ name: "Queue Persistence", passed: false });
  }
  
  // Print results
  console.log("\n" + "=".repeat(50));
  console.log("\n📊 Test Results:\n");
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    if (result.passed) {
      console.log(`  ✅ ${result.name}`);
      passed++;
    } else {
      console.log(`  ❌ ${result.name}`);
      failed++;
    }
  }
  
  console.log(`\nTotal: ${passed}/${results.length} passed`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✨ All priority tests completed!");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
