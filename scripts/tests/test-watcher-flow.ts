import { $ } from "bun";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const testDir = "/tmp/test-watcher-flow";
const sessionsDir = join(testDir, ".memsearch", "sessions");

console.log("🧪 Testing Watcher Flow\n");
console.log("=".repeat(70));

// Setup
console.log("\n1. Setting up test directory...");
mkdirSync(sessionsDir, { recursive: true });

// Create initial file BEFORE starting watcher
console.log("\n2. Creating file BEFORE watcher starts...");
writeFileSync(join(sessionsDir, "before.md"), "# Test Before\nThis file exists before watcher starts.");

// Start watcher in background
console.log("\n3. Starting memsearch watch...");
const watchProc = Bun.spawn({
  cmd: ["memsearch", "watch", testDir],
  stdout: "pipe",
  stderr: "pipe",
});

// Wait for watcher to start
console.log("   Waiting 5 seconds for watcher to initialize...");
await new Promise(resolve => setTimeout(resolve, 5000));

// Create file AFTER watcher starts
console.log("\n4. Creating file AFTER watcher starts...");
writeFileSync(join(sessionsDir, "after.md"), "# Test After\nThis file is created after watcher starts.");

// Wait to see if it gets indexed
console.log("   Waiting 10 seconds for indexing...");
await new Promise(resolve => setTimeout(resolve, 10000));

// Check what was indexed
console.log("\n5. Checking what was indexed...");
try {
  const stats = await $`memsearch stats --json`.json();
  console.log(`   Documents: ${stats.documentCount || 0}`);
  console.log(`   Chunks: ${stats.chunkCount || 0}`);
} catch (err) {
  console.log(`   Could not get stats: ${err}`);
}

// Cleanup
console.log("\n6. Stopping watcher...");
watchProc.kill();

console.log("\n" + "=".repeat(70));
console.log("\n📋 Key Question:\n");
console.log("   Does memsearch watch index EXISTING files or only NEW files?");
console.log("   If only NEW files, we need cli.index() for the initial backfill.");
console.log("   If ALL files, the watcher should handle everything.");
console.log("\n" + "=".repeat(70) + "\n");
