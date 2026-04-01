import Database from "bun:sqlite";
import { join } from "path";
import { $ } from "bun";

const queueDbPath = join(
  process.env.HOME || "",
  ".config",
  "opencode",
  "memsearch",
  "queue",
  "memory.db"
);

async function decodeMsgpack(data: Uint8Array): Promise<any> {
  const { unpack } = await import("msgpackr");
  return unpack(data);
}

console.log("🔍 Checking Worker Processing\n");
console.log("=".repeat(70));

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  // Check completed jobs and their results
  console.log("\n1. Completed Job Results:\n");
  const completed = db.query(`
    SELECT j.id, j.data, j.finished_at, jr.data as result
    FROM jobs j
    LEFT JOIN job_results jr ON j.id = jr.job_id
    WHERE j.state = 'completed'
    ORDER BY j.finished_at DESC
    LIMIT 10
  `).all() as any[];
  
  for (const job of completed) {
    try {
      const data = await decodeMsgpack(job.data);
      const result = job.result ? JSON.parse(job.result) : null;
      
      console.log(`  Job: ${data.type}`);
      console.log(`    Project: ${data.projectId}`);
      console.log(`    Success: ${result?.success}`);
      console.log(`    Result: ${JSON.stringify(result).substring(0, 100)}`);
      console.log();
    } catch {
      console.log(`  [decode error]\n`);
    }
  }
  
  // Check failed jobs
  console.log("\n2. Failed Jobs:\n");
  const failed = db.query(`
    SELECT j.id, j.data, j.failed_reason
    FROM jobs j
    WHERE j.state = 'failed'
    ORDER BY j.finished_at DESC
    LIMIT 5
  `).all() as any[];
  
  if (failed.length === 0) {
    console.log("   (No failed jobs)");
  } else {
    for (const job of failed) {
      try {
        const data = await decodeMsgpack(job.data);
        console.log(`  Job: ${data.type}`);
        console.log(`    Error: ${job.failed_reason?.substring(0, 100)}`);
        console.log();
      } catch {
        console.log(`  [decode error]`);
      }
    }
  }
  
  // Check job attempts
  console.log("\n3. Job Attempts Distribution:\n");
  const attempts = db.query(`
    SELECT attempts, COUNT(*) as count
    FROM jobs
    GROUP BY attempts
    ORDER BY attempts
  `).all() as any[];
  
  for (const row of attempts) {
    console.log(`   ${row.attempts} attempts: ${row.count} jobs`);
  }
  
  db.close();
  
  // Test memsearch availability from this environment
  console.log("\n4. Memsearch Availability:\n");
  try {
    const version = await $`memsearch --version`.text();
    console.log(`   Version: ${version.trim()}`);
    console.log(`   Status: ✅ Available`);
  } catch (err: any) {
    console.log(`   Status: ❌ Not available`);
    console.log(`   Error: ${err.message}`);
  }
  
  // Check if index command works now
  console.log("\n5. Testing Index Command:\n");
  const testDir = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions";
  console.log(`   Target: ${testDir}`);
  console.log(`   Files: ${require("fs").readdirSync(testDir).length} markdown files`);
  console.log(`   Status: Ready for indexing`);
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
