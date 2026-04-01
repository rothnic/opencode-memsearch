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

async function decodeMsgpack(data: Uint8Array): Promise<any> {
  // Dynamic import msgpackr
  const { unpack } = await import("msgpackr");
  return unpack(data);
}

console.log("🔍 Decoded Queue Data\n");
console.log("=".repeat(70));

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  // Get completed jobs
  console.log("\n✅ Recent Completed Jobs:\n");
  const completed = db.query(`
    SELECT id, data, priority, completed_at
    FROM jobs
    WHERE state = 'completed'
    ORDER BY completed_at DESC
    LIMIT 10
  `).all() as any[];
  
  for (const job of completed) {
    try {
      const data = await decodeMsgpack(job.data);
      console.log(`  ${data.type} | ${data.projectId} | Priority: ${job.priority}`);
    } catch {
      console.log(`  [decode error] | Priority: ${job.priority}`);
    }
  }
  
  // Count job types
  console.log("\n\n📊 Job Type Counts:\n");
  const allJobs = db.query(`
    SELECT data
    FROM jobs
    WHERE state = 'completed'
  `).all() as any[];
  
  const typeCounts = new Map();
  const projectCounts = new Map();
  
  for (const job of allJobs.slice(0, 100)) {
    try {
      const data = await decodeMsgpack(job.data);
      const type = data.type || 'unknown';
      const project = data.projectId || 'no-project';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      projectCounts.set(project, (projectCounts.get(project) || 0) + 1);
    } catch {
      typeCounts.set('decode-error', (typeCounts.get('decode-error') || 0) + 1);
    }
  }
  
  console.log("  By Type:");
  for (const [type, count] of typeCounts) {
    console.log(`    ${type}: ${count}`);
  }
  
  console.log("\n  By Project:");
  for (const [project, count] of projectCounts) {
    console.log(`    ${project}: ${count}`);
  }
  
  // Check waiting jobs
  console.log("\n\n⏳ Waiting Jobs:\n");
  const waiting = db.query(`
    SELECT id, data, priority
    FROM jobs
    WHERE state = 'waiting'
    ORDER BY priority DESC
  `).all() as any[];
  
  for (const job of waiting) {
    try {
      const data = await decodeMsgpack(job.data);
      console.log(`  ${data.type} | ${data.projectId} | Priority: ${job.priority}`);
    } catch {
      console.log(`  [decode error] | Priority: ${job.priority}`);
    }
  }
  
  // Check active job
  console.log("\n\n▶️  Active Job:\n");
  const active = db.query(`
    SELECT id, data, priority
    FROM jobs
    WHERE state = 'active'
    LIMIT 1
  `).all() as any[];
  
  for (const job of active) {
    try {
      const data = await decodeMsgpack(job.data);
      console.log(`  ${data.type} | ${data.projectId} | Priority: ${job.priority}`);
    } catch {
      console.log(`  [decode error] | Priority: ${job.priority}`);
    }
  }
  
  db.close();
  
  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Analysis Complete\n");
  
} catch (err) {
  console.error("Error:", err);
}
