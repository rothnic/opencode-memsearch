import Database from "bun:sqlite";
import { join } from "path";

const queueDbPath = join(
  process.env.HOME || "",
  ".config",
  "opencode",
  "memsearch",
  "queue",
  "memory.db"
);

console.log("🔍 Raw Job Data Inspection\n");
console.log("=".repeat(70));

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  // Get raw data from completed jobs
  console.log("\n📋 Sample Raw Data (first 3 completed jobs):\n");
  const completed = db.query(`
    SELECT id, data, state
    FROM jobs
    WHERE state = 'completed'
    ORDER BY completed_at DESC
    LIMIT 3
  `).all() as any[];
  
  for (let i = 0; i < completed.length; i++) {
    const job = completed[i];
    console.log(`\n--- Job ${i + 1} ---`);
    console.log(`ID: ${job.id}`);
    console.log(`State: ${job.state}`);
    console.log(`Data (first 200 chars):`);
    console.log(job.data?.substring(0, 200) || '(empty)');
    console.log();
  }
  
  // Check waiting jobs
  console.log("\n\n⏳ Sample Waiting Jobs (first 3):\n");
  const waiting = db.query(`
    SELECT id, data, state
    FROM jobs
    WHERE state = 'waiting'
    ORDER BY created_at DESC
    LIMIT 3
  `).all() as any[];
  
  for (let i = 0; i < waiting.length; i++) {
    const job = waiting[i];
    console.log(`\n--- Job ${i + 1} ---`);
    console.log(`ID: ${job.id}`);
    console.log(`State: ${job.state}`);
    console.log(`Data (first 500 chars):`);
    console.log(job.data?.substring(0, 500) || '(empty)');
    console.log();
  }
  
  // Check active job
  console.log("\n\n▶️  Active Job:\n");
  const active = db.query(`
    SELECT id, data, state
    FROM jobs
    WHERE state = 'active'
    LIMIT 1
  `).all() as any[];
  
  for (const job of active) {
    console.log(`ID: ${job.id}`);
    console.log(`State: ${job.state}`);
    console.log(`Data (first 500 chars):`);
    console.log(job.data?.substring(0, 500) || '(empty)');
  }
  
  db.close();
  
  console.log("\n" + "=".repeat(70));
  
} catch (err) {
  console.error("Error:", err);
}
