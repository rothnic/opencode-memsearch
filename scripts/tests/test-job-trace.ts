import { processMemoryJob } from "../../src/processing/memory-pipeline";
import type { MemoryJob } from "../../src/queue/memory-queue";

console.log("🔍 Tracing Job Processing\n");
console.log("=".repeat(70));

// Create a test job
const testJob: MemoryJob = {
  type: "session-created",
  sessionId: "test-trace-session",
  projectId: "test-project",
  directory: "/Users/nroth/workspace/opencode-memsearch",
  timestamp: Date.now(),
  priority: 200,
  dedupKey: "test:trace:session-created",
};

console.log("\n1. Processing test job:\n");
console.log(`   Type: ${testJob.type}`);
console.log(`   Directory: ${testJob.directory}`);
console.log(`   Session: ${testJob.sessionId}`);

console.log("\n2. Calling processMemoryJob...\n");

processMemoryJob(testJob)
  .then((result) => {
    console.log("\n3. Result:\n");
    console.log(`   Success: ${result.success}`);
    console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log("\n" + "=".repeat(70) + "\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Exception:\n");
    console.error(err);
    console.log("\n" + "=".repeat(70) + "\n");
    process.exit(1);
  });
