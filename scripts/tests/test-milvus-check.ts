console.log("🔍 Checking Milvus Connection\n");
console.log("=".repeat(70));

// Test Milvus connection
console.log("\n1. Testing Milvus (agentmemory-milvus.on.nickroth.com:19530):\n");

try {
  // Milvus uses gRPC, but we can check if port is open
  const conn = await Bun.connect({
    hostname: "agentmemory-milvus.on.nickroth.com",
    port: 19530,
    socket: {
      data() {},
      close() {},
      drain() {},
    },
  });
  
  console.log("   ✅ TCP connection successful");
  conn.end();
} catch (err: any) {
  console.log(`   ❌ Cannot connect: ${err.message}`);
}

// Try HTTP health endpoint (if available)
console.log("\n2. Testing HTTP endpoint:\n");
try {
  const response = await fetch("http://agentmemory-milvus.on.nickroth.com:9091/api/v1/health", {
    signal: AbortSignal.timeout(5000)
  });
  console.log(`   Status: ${response.status}`);
  const text = await response.text();
  console.log(`   Response: ${text.substring(0, 200)}`);
} catch (err: any) {
  console.log(`   ❌ HTTP check failed: ${err.message}`);
}

console.log("\n" + "=".repeat(70));
console.log("\n📋 Analysis:\n");
console.log("   If Milvus is not accessible, memsearch will hang");
console.log("   trying to connect when indexing.");
console.log("\n" + "=".repeat(70) + "\n");

export {};
