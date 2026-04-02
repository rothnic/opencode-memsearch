import { $ } from "bun";
import { MemsearchCLI } from "../../src/cli-wrapper";

console.log("🔍 Debugging Memsearch Integration\n");
console.log("=".repeat(70));

// Test 1: Check if memsearch binary exists
console.log("\n1. Checking memsearch binary:\n");
try {
  const which = await $`which memsearch`.text();
  console.log(`   Location: ${which.trim()}`);
} catch {
  console.log(`   ❌ memsearch not in PATH`);
}

// Test 2: Check memsearch version
console.log("\n2. Checking memsearch version:\n");
try {
  const version = await $`memsearch --version`.text();
  console.log(`   Version: ${version.trim()}`);
} catch (err: any) {
  console.log(`   ❌ Error: ${err}`);
  console.log(`   Exit code: ${err?.exitCode}`);
  console.log(`   Stderr: ${err?.stderr}`);
}

// Test 3: Check memsearch availability via CLI wrapper
console.log("\n3. Checking via CLI wrapper:\n");
const cli = new MemsearchCLI();
try {
  const available = await cli.checkAvailability();
  console.log(`   Available: ${available}`);
} catch (err: any) {
  console.log(`   ❌ Error: ${err}`);
}

// Test 4: Check memsearch config
console.log("\n4. Checking memsearch config:\n");
try {
  const config = await cli.config("get");
  console.log(`   Config: ${JSON.stringify(config, null, 2).substring(0, 200)}...`);
} catch (err: any) {
  console.log(`   ❌ Error: ${err}`);
}

// Test 5: Try to index a test directory
console.log("\n5. Testing index command:\n");
const testDir = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions";
try {
  await cli.index(testDir);
  console.log(`   ✅ Index command succeeded`);
} catch (err: any) {
  console.log(`   ❌ Error: ${err}`);
  if (err?.stderr) console.log(`   Stderr: ${err.stderr}`);
}

// Test 6: Check if we can get stats
console.log("\n6. Testing stats command:\n");
try {
  const stats = await cli.stats();
  console.log(`   Stats: ${JSON.stringify(stats)}`);
} catch (err: any) {
  console.log(`   ❌ Error: ${err}`);
}

console.log("\n" + "=".repeat(70) + "\n");
