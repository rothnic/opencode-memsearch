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

console.log("🔍 Queue Database Analysis\n");
console.log("=".repeat(70));

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  // Job status breakdown
  console.log("\n📊 Job Status Breakdown:\n");
  const statusCounts = db.query(`
    SELECT state, COUNT(*) as count 
    FROM jobs 
    GROUP BY state
    ORDER BY count DESC
  `).all() as any[];
  
  let total = 0;
  for (const row of statusCounts) {
    console.log(`  ${row.state}: ${row.count}`);
    total += row.count;
  }
  console.log(`  ─────────────────`);
  console.log(`  Total: ${total}`);
  
  // Recent completed jobs
  console.log("\n\n✅ Recent Completed Jobs:\n");
  const completed = db.query(`
    SELECT id, data, priority, completed_at, attempts
    FROM jobs
    WHERE state = 'completed'
    ORDER BY completed_at DESC
    LIMIT 20
  `).all() as any[];
  
  for (const job of completed.slice(0, 10)) {
    try {
      const data = JSON.parse(job.data);
      console.log(`  ${data.type || 'unknown'} | ${data.projectId || 'no-project'} | Priority: ${job.priority}`);
    } catch {
      console.log(`  [parse error] | Priority: ${job.priority}`);
    }
  }
  
  // Waiting jobs
  console.log("\n\n⏳ Current Waiting Jobs:\n");
  const waiting = db.query(`
    SELECT id, data, priority, created_at
    FROM jobs
    WHERE state = 'waiting'
    ORDER BY priority DESC, created_at ASC
    LIMIT 10
  `).all() as any[];
  
  for (const job of waiting) {
    try {
      const data = JSON.parse(job.data);
      console.log(`  ${data.type || 'unknown'} | ${data.projectId || 'no-project'} | Priority: ${job.priority}`);
    } catch {
      console.log(`  [parse error] | Priority: ${job.priority}`);
    }
  }
  
  // Active job
  console.log("\n\n▶️  Active Job:\n");
  const active = db.query(`
    SELECT id, data, priority, started_at
    FROM jobs
    WHERE state = 'active'
    LIMIT 1
  `).all() as any[];
  
  for (const job of active) {
    try {
      const data = JSON.parse(job.data);
      console.log(`  ${data.type || 'unknown'} | ${data.projectId || 'no-project'} | Priority: ${job.priority}`);
    } catch {
      console.log(`  [parse error] | Priority: ${job.priority}`);
    }
  }
  
  // Check what the 700+ jobs actually are
  console.log("\n\n📈 Analysis of 753 Completed Jobs:\n");
  
  // Sample random completed jobs
  const sample = db.query(`
    SELECT data
    FROM jobs
    WHERE state = 'completed'
    ORDER BY RANDOM()
    LIMIT 20
  `).all() as any[];
  
  const typeCounts = new Map();
  const projectCounts = new Map();
  
  for (const job of sample) {
    try {
      const data = JSON.parse(job.data);
      const type = data.type || 'unknown';
      const project = data.projectId || 'no-project';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      projectCounts.set(project, (projectCounts.get(project) || 0) + 1);
    } catch {
      typeCounts.set('parse-error', (typeCounts.get('parse-error') || 0) + 1);
    }
  }
  
  console.log("  Job types (from 20 sample):");
  for (const [type, count] of typeCounts) {
    console.log(`    ${type}: ${count}`);
  }
  
  console.log("\n  Projects (from 20 sample):");
  for (const [project, count] of projectCounts) {
    console.log(`    ${project}: ${count}`);
  }
  
  // Check timestamps
  console.log("\n\n🕐 Time Analysis:\n");
  const oldestCompleted = db.query(`
    SELECT MIN(completed_at) as oldest, MAX(completed_at) as newest
    FROM jobs
    WHERE state = 'completed'
  `).get() as any;
  
  if (oldestCompleted.oldest) {
    const oldest = new Date(oldestCompleted.oldest).toISOString();
    const newest = new Date(oldestCompleted.newest).toISOString();
    console.log(`  Oldest completion: ${oldest}`);
    console.log(`  Newest completion: ${newest}`);
    
    const duration = new Date(oldestCompleted.newest).getTime() - new Date(oldestCompleted.oldest).getTime();
    console.log(`  Time span: ${Math.round(duration / 1000)} seconds`);
    console.log(`  Rate: ${Math.round(753 / (duration / 1000) * 60)} jobs/minute`);
  }
  
  db.close();
  
  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Analysis Complete\n");
  
} catch (err) {
  console.error("Error:", err);
}
