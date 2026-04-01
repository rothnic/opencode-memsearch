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
  
  // Job types
  console.log("\n\n📋 Job Types:\n");
  const jobTypes = db.query(`
    SELECT 
      json_extract(data, '$.type') as job_type,
      COUNT(*) as count
    FROM jobs
    GROUP BY job_type
    ORDER BY count DESC
  `).all() as any[];
  
  for (const row of jobTypes) {
    console.log(`  ${row.job_type || 'unknown'}: ${row.count}`);
  }
  
  // Projects
  console.log("\n\n📁 Projects:\n");
  const projects = db.query(`
    SELECT 
      json_extract(data, '$.projectId') as project,
      COUNT(*) as count
    FROM jobs
    GROUP BY project
    ORDER BY count DESC
    LIMIT 10
  `).all() as any[];
  
  for (const row of projects) {
    console.log(`  ${row.project || 'unknown'}: ${row.count}`);
  }
  
  // Recent completed jobs
  console.log("\n\n✅ Recent Completed Jobs:\n");
  const completed = db.query(`
    SELECT 
      id,
      json_extract(data, '$.type') as type,
      json_extract(data, '$.projectId') as project,
      priority,
      completed_at,
      attempts
    FROM jobs
    WHERE state = 'completed'
    ORDER BY completed_at DESC
    LIMIT 10
  `).all() as any[];
  
  for (const job of completed) {
    console.log(`  ${job.type} | ${job.project} | Priority: ${job.priority} | Attempts: ${job.attempts}`);
  }
  
  // Failed jobs
  console.log("\n\n❌ Recent Failed Jobs:\n");
  const failed = db.query(`
    SELECT 
      id,
      json_extract(data, '$.type') as type,
      json_extract(data, '$.projectId') as project,
      priority,
      attempts
    FROM jobs
    WHERE state = 'failed'
    ORDER BY completed_at DESC
    LIMIT 5
  `).all() as any[];
  
  if (failed.length === 0) {
    console.log("  (No failed jobs)");
  } else {
    for (const job of failed) {
      console.log(`  ${job.type} | ${job.project} | Priority: ${job.priority}`);
    }
  }
  
  // Waiting jobs
  console.log("\n\n⏳ Current Waiting Jobs:\n");
  const waiting = db.query(`
    SELECT 
      id,
      json_extract(data, '$.type') as type,
      json_extract(data, '$.projectId') as project,
      priority,
      created_at
    FROM jobs
    WHERE state = 'waiting'
    ORDER BY priority DESC, created_at ASC
    LIMIT 10
  `).all() as any[];
  
  if (waiting.length === 0) {
    console.log("  (No waiting jobs)");
  } else {
    for (const job of waiting) {
      console.log(`  ${job.type} | ${job.project} | Priority: ${job.priority}`);
    }
    const waitingCount = db.query(`SELECT COUNT(*) as count FROM jobs WHERE state = 'waiting'`).get() as any;
    if (waitingCount.count > 10) {
      console.log(`  ... and ${waitingCount.count - 10} more`);
    }
  }
  
  // Priority distribution
  console.log("\n\n🎯 Priority Distribution:\n");
  const priorities = db.query(`
    SELECT 
      priority,
      COUNT(*) as count,
      state
    FROM jobs
    GROUP BY priority, state
    ORDER BY priority DESC
  `).all() as any[];
  
  const priorityMap = new Map();
  for (const row of priorities) {
    if (!priorityMap.has(row.priority)) {
      priorityMap.set(row.priority, {});
    }
    priorityMap.get(row.priority)[row.state] = row.count;
  }
  
  for (const [priority, states] of priorityMap) {
    const completed = states.completed || 0;
    const waiting = states.waiting || 0;
    const active = states.active || 0;
    const failed = states.failed || 0;
    console.log(`  Priority ${priority}: ${completed} completed, ${waiting} waiting, ${active} active, ${failed} failed`);
  }
  
  // Job results (to see what types of work were done)
  console.log("\n\n📝 Job Results Summary:\n");
  const results = db.query(`
    SELECT 
      j.id,
      json_extract(j.data, '$.type') as type,
      json_extract(j.data, '$.projectId') as project,
      jr.data as result
    FROM jobs j
    JOIN job_results jr ON j.id = jr.job_id
    WHERE j.state = 'completed'
    ORDER BY j.completed_at DESC
    LIMIT 10
  `).all() as any[];
  
  for (const row of results) {
    try {
      const resultData = JSON.parse(row.result);
      const resultSummary = resultData.success ? '✅' : '❌';
      console.log(`  ${resultSummary} ${row.type} | ${row.project}`);
    } catch {
      console.log(`  ? ${row.type} | ${row.project}`);
    }
  }
  
  db.close();
  
  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Analysis Complete\n");
  
} catch (err) {
  console.error("Error:", err);
}
