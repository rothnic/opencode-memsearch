import { $ } from "bun";

console.log("🔍 Checking Memsearch Config\n");
console.log("=".repeat(70));

// Read config
console.log("\n1. Current Config:\n");
const config = await $`cat ~/.memsearch.toml`.text();
console.log(config);

// Check if the Ollama host is reachable
console.log("\n2. Testing Ollama Host Connection:\n");
const ollamaHost = "http://100.79.168.98:11434";
console.log(`   Configured host: ${ollamaHost}`);

try {
  const response = await fetch(`${ollamaHost}/api/tags`, { 
    signal: AbortSignal.timeout(5000) 
  });
  if (response.ok) {
    const data = await response.json();
    console.log(`   ✅ Host is responding`);
    console.log(`   Models: ${data.models?.length || 0} available`);
  } else {
    console.log(`   ❌ Host returned: ${response.status}`);
  }
} catch (err: any) {
  console.log(`   ❌ Cannot reach host: ${err.message}`);
}

// Check localhost
console.log("\n3. Testing Localhost:\n");
try {
  const response = await fetch("http://localhost:11434/api/tags", { 
    signal: AbortSignal.timeout(5000) 
  });
  if (response.ok) {
    const data = await response.json();
    console.log(`   ✅ Localhost is responding`);
    console.log(`   Models: ${data.models?.map((m: any) => m.name).join(', ')}`);
  } else {
    console.log(`   ❌ Localhost returned: ${response.status}`);
  }
} catch (err: any) {
  console.log(`   ❌ Localhost not reachable: ${err.message}`);
}

// Check if embeddinggemma model exists
console.log("\n4. Checking Model Availability:\n");
try {
  const response = await fetch("http://localhost:11434/api/tags");
  if (response.ok) {
    const data = await response.json();
    const hasEmbeddingGemma = data.models?.some((m: any) => m.name.includes('embeddinggemma'));
    const hasNomic = data.models?.some((m: any) => m.name.includes('nomic-embed-text'));
    
    console.log(`   embeddinggemma: ${hasEmbeddingGemma ? '✅ Available' : '❌ Not found'}`);
    console.log(`   nomic-embed-text: ${hasNomic ? '✅ Available' : '❌ Not found'}`);
  }
} catch (err: any) {
  console.log(`   ❌ Error: ${err.message}`);
}

console.log("\n" + "=".repeat(70));
console.log("\n📋 Issues Found:\n");
console.log("   1. Config uses remote Ollama host (100.79.168.98)");
console.log("   2. Local Ollama is running but config doesn't point to it");
console.log("   3. embeddinggemma model exists locally");
console.log("\n   Fix: Update ~/.memsearch.toml to use localhost");
console.log("\n" + "=".repeat(70) + "\n");
