console.log("🔍 Checking Milvus gRPC Connectivity\n");
console.log("=".repeat(70));

const MILVUS_HOST = "agentmemory-milvus.on.nickroth.com";
const MILVUS_PORT = 19530;

console.log(`\nTarget: ${MILVUS_HOST}:${MILVUS_PORT}\n`);

// Try TCP connection
console.log("1. Testing TCP connection...");
try {
  const socket = await Bun.connect({
    hostname: MILVUS_HOST,
    port: MILVUS_PORT,
  });
  console.log("   ✅ TCP connection successful");
  socket.end();
} catch (err: any) {
  console.log(`   ❌ TCP connection failed: ${err.message}`);
}

// Check if we can resolve the hostname
console.log("\n2. Resolving hostname...");
try {
  const dns = await import("dns");
  const addresses = await dns.promises.resolve(MILVUS_HOST);
  console.log(`   IPs: ${addresses.join(', ')}`);
} catch (err: any) {
  console.log(`   ❌ DNS resolution failed: ${err.message}`);
}

// Try netcat-style test
console.log("\n3. Testing with nc...");
const proc = Bun.spawn({
  cmd: ["nc", "-zv", "-w", "5", MILVUS_HOST, String(MILVUS_PORT)],
  stdout: "pipe",
  stderr: "pipe",
});

const [stdout, stderr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
]);

await proc.exited;

if (stdout) console.log(`   stdout: ${stdout}`);
if (stderr) console.log(`   stderr: ${stderr}`);

console.log("\n" + "=".repeat(70));
console.log("\n📋 Analysis:\n");
console.log("   If TCP connection works but memsearch hangs,");
console.log("   the issue is likely gRPC protocol compatibility");
console.log("   or Milvus authentication/authorization.");
console.log("\n" + "=".repeat(70) + "\n");
