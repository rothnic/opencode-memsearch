import { $ } from "bun";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const testDir = "/tmp/test-watcher-only";
const sessionsDir = join(testDir, "sessions");

console.log("🧪 Testing Watcher-Only Approach\n");
console.log("=".repeat(70));

// Clean setup
if (existsSync(testDir)) {
  rmSync(testDir, { recursive: true });
}
mkdirSync(sessionsDir, { recursive: true });

console.log("\n1. Start watcher FIRST (before any files exist)...\n");

const watchProc = Bun.spawn({
  cmd: ["memsearch", "watch", sessionsDir],
  stdout: "pipe",
  stderr: "pipe",
});

// Capture output
let output = "";
let errorOutput = "";

(async () => {
  const reader = watchProc.stdout.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += new TextDecoder().decode(value);
  }
})();

(async () => {
  const reader = watchProc.stderr.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    errorOutput += new TextDecoder().decode(value);
  }
})();

console.log("   Waiting 3 seconds for watcher to start...");
await new Promise(resolve => setTimeout(resolve, 3000));

console.log("\n2. Create files AFTER watcher is running...\n");

for (let i = 1; i <= 3; i++) {
  const content = `# Session ${i}\n\nThis is test content for session ${i}.\nIt has multiple lines.\n`;
  writeFileSync(join(sessionsDir, `session-${i}.md`), content);
  console.log(`   Created session-${i}.md`);
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log("\n3. Wait for watcher to process files...\n");
await new Promise(resolve => setTimeout(resolve, 10000));

console.log("\n4. Check output from watcher:\n");
console.log("   STDOUT:");
console.log(output || "   (no output)");
console.log("\n   STDERR:");
console.log(errorOutput || "   (no errors)");

console.log("\n5. Cleanup...");
watchProc.kill();

console.log("\n" + "=".repeat(70));
console.log("\n📋 Conclusion:\n");
console.log("   If watcher output shows indexing activity,");
console.log("   then watcher-only approach works.");
console.log("   If no output, watcher may not be working or silent.");
console.log("\n" + "=".repeat(70) + "\n");
