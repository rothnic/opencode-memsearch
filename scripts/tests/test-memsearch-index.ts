import { $ } from "bun";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const testDir = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions";

console.log("🧪 Testing memsearch index command\n");
console.log("=".repeat(70));

// Count files
const files = existsSync(testDir) ? readdirSync(testDir) : [];
console.log(`\nTarget: ${testDir}`);
console.log(`Files: ${files.length} markdown files\n`);

if (files.length === 0) {
  console.log("❌ No files to index");
  process.exit(1);
}

console.log("Running: memsearch index " + testDir + "\n");

try {
  // Run memsearch index and capture output
  const proc = Bun.spawn({
    cmd: ["memsearch", "index", testDir],
    stdout: "pipe",
    stderr: "pipe",
  });
  
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  
  console.log(`Exit code: ${exitCode}`);
  if (stdout) console.log(`Stdout:\n${stdout}`);
  if (stderr) console.log(`Stderr:\n${stderr}`);
  
  if (exitCode === 0) {
    console.log("\n✅ Index command completed");
  } else {
    console.log("\n❌ Index command failed");
  }
} catch (err: any) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
