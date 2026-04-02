import { $ } from "bun";

console.log("🔍 Checking Ollama Status\n");
console.log("=".repeat(70));

// Check if ollama is installed
console.log("\n1. Ollama Installation:\n");
try {
  const which = await $`which ollama`.text();
  console.log(`   Location: ${which.trim()}`);
  
  const version = await $`ollama --version`.text();
  console.log(`   Version: ${version.trim()}`);
} catch {
  console.log(`   ❌ Ollama not installed`);
}

// Check if ollama is running
console.log("\n2. Ollama Service:\n");
try {
  const ps = await $`ps aux | grep ollama | grep -v grep`.text();
  console.log(`   Running processes:\n${ps}`);
} catch {
  console.log(`   ❌ Ollama not running`);
}

// Check ollama models
console.log("\n3. Available Models:\n");
try {
  const models = await $`ollama list`.text();
  console.log(`   ${models}`);
} catch (err: any) {
  console.log(`   ❌ Cannot list models: ${err}`);
}

// Try to start ollama
console.log("\n4. Testing Ollama Start:\n");
try {
  // Check if we can reach the Ollama API
  const response = await fetch("http://localhost:11434/api/tags");
  if (response.ok) {
    const data = await response.json() as {models?: Array<{name: string}>};
    console.log(`   ✅ Ollama API is responding`);
    console.log(`   Models: ${data.models?.map((m: any) => m.name).join(', ') || 'none'}`);
  } else {
    console.log(`   ❌ Ollama API returned: ${response.status}`);
  }
} catch (err: any) {
  console.log(`   ❌ Ollama API not reachable: ${err.message}`);
}

console.log("\n" + "=".repeat(70));
console.log("\n📋 Recommendation:\n");
console.log("   Ollama needs to be running for memsearch to work.");
console.log("   Start it with: ollama serve");
console.log("   Or configure memsearch to use a different embedding provider.");
console.log("\n" + "=".repeat(70) + "\n");
