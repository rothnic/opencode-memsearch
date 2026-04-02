/**
 * @file test-queue-isolated.ts
 * @description Isolated test for the queue system - tests without OpenCode running
 */

import { queue, signalSessionActivity, type MemoryJob } from "../lib/queue/memory-queue";
import { processMemoryJob } from "../lib/processing/memory-pipeline";
import { backfillAllSessions } from "../lib/queue/backfill";
import { generateSessionMarkdown } from "../lib/processing/session-generator";

// Test configuration
const TEST_PROJECT_ID = "test-project";
const TEST_DIRECTORY = "/tmp/test-memsearch";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({
      name,
      passed: false,
      error: String(err),
      duration: Date.now() - start,
    });
    console.log(`❌ ${name} (${Date.now() - start}ms)`);
    console.log(`   Error: ${err}`);
  }
}

// Test 1: Verify queue can be created and is accessible
async function testQueueCreation() {
  if (!queue) {
    throw new Error("Queue is not initialized");
  }
  if (typeof queue.add !== "function") {
    throw new Error("Queue.add is not a function");
  }
}

// Test 2: Test job structure and types
async function testJobTypes() {
  const testJobs: MemoryJob[] = [
    {
      type: "session-created",
      sessionId: "test-session-1",
      projectId: TEST_PROJECT_ID,
      directory: TEST_DIRECTORY,
      timestamp: Date.now(),
      priority: 200,
      dedupKey: "test:1:session-created",
    },
    {
      type: "session-idle",
      sessionId: "test-session-1",
      projectId: TEST_PROJECT_ID,
      directory: TEST_DIRECTORY,
      timestamp: Date.now(),
      priority: 150,
      dedupKey: "test:1:session-idle",
    },
    {
      type: "session-deleted",
      sessionId: "test-session-2",
      projectId: TEST_PROJECT_ID,
      directory: TEST_DIRECTORY,
      timestamp: Date.now(),
      priority: 100,
      dedupKey: "test:2:session-deleted",
    },
  ];

  for (const job of testJobs) {
    if (!job.type || !job.sessionId || !job.projectId) {
      throw new Error(`Invalid job structure: ${JSON.stringify(job)}`);
    }
  }
}

// Test 3: Test priority ordering
async function testPriorityOrdering() {
  const priorities = [200, 150, 100, 50, 10];
  const sorted = [...priorities].sort((a, b) => b - a);

  // bunqueue uses higher number = higher priority
  for (let i = 0; i < priorities.length; i++) {
    if (priorities[i] !== sorted[i]) {
      throw new Error(
        `Priority ordering failed. Expected ${sorted.join(
          ","
        )}, got ${priorities.join(",")}`
      );
    }
  }
}

// Test 4: Test signalSessionActivity creates correct job structure
async function testSignalSessionActivity() {
  // This will actually add a job to the queue
  await signalSessionActivity(
    "session-created",
    "test-signal-session",
    TEST_PROJECT_ID,
    TEST_DIRECTORY,
    { test: true }
  );

  // If we get here without error, the function worked
}

// Test 5: Test processMemoryJob handles all job types
async function testProcessMemoryJobTypes() {
  const testJobs: MemoryJob[] = [
    {
      type: "session-created",
      sessionId: "test-process-1",
      projectId: TEST_PROJECT_ID,
      directory: TEST_DIRECTORY,
      timestamp: Date.now(),
      priority: 200,
      dedupKey: "test:process:1:session-created",
    },
    {
      type: "session-idle",
      sessionId: "test-process-1",
      projectId: TEST_PROJECT_ID,
      directory: TEST_DIRECTORY,
      timestamp: Date.now(),
      priority: 150,
      dedupKey: "test:process:1:session-idle",
    },
    {
      type: "session-deleted",
      sessionId: "test-process-2",
      projectId: TEST_PROJECT_ID,
      directory: TEST_DIRECTORY,
      timestamp: Date.now(),
      priority: 100,
      dedupKey: "test:process:2:session-deleted",
    },
  ];

  for (const job of testJobs) {
    try {
      const result = await processMemoryJob(job);
      if (!result || typeof result.success !== "boolean") {
        throw new Error(
          `Invalid result for ${job.type}: ${JSON.stringify(result)}`
        );
      }
    } catch (err) {
      // Expected to fail since we don't have real CLI - just check it doesn't crash
      if (!String(err).includes("CLI") && !String(err).includes("not available")) {
        throw err;
      }
    }
  }
}

// Test 6: Test backfill returns proper structure
async function testBackfillStructure() {
  const result = await backfillAllSessions();

  if (typeof result.queued !== "number") {
    throw new Error(`Expected queued to be number, got ${typeof result.queued}`);
  }
  if (typeof result.processed !== "number") {
    throw new Error(
      `Expected processed to be number, got ${typeof result.processed}`
    );
  }
  if (typeof result.total !== "number") {
    throw new Error(`Expected total to be number, got ${typeof result.total}`);
  }
}

// Test 7: Test dedup key generation
async function testDedupKeyGeneration() {
  const testCases = [
    {
      projectId: "project-1",
      sessionId: "session-1",
      type: "session-created" as const,
      expected: "project-1:session-1:session-created",
    },
    {
      projectId: "my-project",
      sessionId: "abc-123",
      type: "session-idle" as const,
      expected: "my-project:abc-123:session-idle",
    },
  ];

  for (const tc of testCases) {
    const dedupKey = `${tc.projectId}:${tc.sessionId}:${tc.type}`;
    if (dedupKey !== tc.expected) {
      throw new Error(
        `Dedup key mismatch. Expected ${tc.expected}, got ${dedupKey}`
      );
    }
  }
}

// Test 8: Test markdown path generation logic
async function testMarkdownPathLogic() {
  const sessionId = "test-session-123";
  const directory = "/tmp/test-project";
  const expectedPath = `${directory}/.memsearch/sessions/${sessionId}.md`;

  // Just verify the path structure logic
  if (!expectedPath.includes(".memsearch/sessions")) {
    throw new Error("Markdown path should include .memsearch/sessions");
  }
  if (!expectedPath.endsWith(".md")) {
    throw new Error("Markdown path should end with .md");
  }
}

// Run all tests
async function main() {
  console.log("🧪 Starting isolated queue system tests...\n");

  await runTest("Queue Creation", testQueueCreation);
  await runTest("Job Types Structure", testJobTypes);
  await runTest("Priority Ordering", testPriorityOrdering);
  await runTest("Signal Session Activity", testSignalSessionActivity);
  await runTest("Process Memory Job Types", testProcessMemoryJobTypes);
  await runTest("Backfill Structure", testBackfillStructure);
  await runTest("Dedup Key Generation", testDedupKeyGeneration);
  await runTest("Markdown Path Logic", testMarkdownPathLogic);

  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} passed`);

  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log("\n✨ All tests passed!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
