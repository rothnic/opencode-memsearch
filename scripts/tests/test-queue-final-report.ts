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
  const { unpack } = await import("msgpackr");
  return unpack(data);
}

console.log("🔍 FINAL QUEUE ANALYSIS REPORT\n");
console.log("=".repeat(70));

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  // Get all jobs
  const allJobs = db.query(`
    SELECT data, state, priority, created_at, completed_at
    FROM jobs
  `).all() as any[];
  
  console.log(`\n📊 Total Jobs in Queue: ${allJobs.length}\n`);
  
  // Parse all jobs
  const parsedJobs = [];
  for (const job of allJobs) {
    try {
      const data = await decodeMsgpack(job.data);
      parsedJobs.push({
        ...job,
        type: data.type,
        projectId: data.projectId,
        sessionId: data.sessionId,
      });
    } catch {
      parsedJobs.push({
        ...job,
        type: 'decode-error',
        projectId: 'unknown',
      });
    }
  }
  
  // Categorize by state
  const byState = {
    completed: parsedJobs.filter(j => j.state === 'completed'),
    waiting: parsedJobs.filter(j => j.state === 'waiting'),
    active: parsedJobs.filter(j => j.state === 'active'),
    failed: parsedJobs.filter(j => j.state === 'failed'),
  };
  
  console.log("Status Breakdown:");
  console.log(`  ✅ Completed: ${byState.completed.length}`);
  console.log(`  ⏳ Waiting: ${byState.waiting.length}`);
  console.log(`  ▶️  Active: ${byState.active.length}`);
  console.log(`  ❌ Failed: ${byState.failed.length}`);
  
  // Categorize by job type
  console.log("\n\n📋 Job Types:\n");
  const typeCounts = new Map();
  for (const job of parsedJobs) {
    const type = job.type || 'unknown';
    if (!typeCounts.has(type)) {
      typeCounts.set(type, { completed: 0, waiting: 0, active: 0, failed: 0 });
    }
    typeCounts.get(type)[job.state]++;
  }
  
  for (const [type, counts] of typeCounts) {
    const total = counts.completed + counts.waiting + counts.active + counts.failed;
    console.log(`  ${type}:`);
    console.log(`    Total: ${total} (✅${counts.completed} ⏳${counts.waiting} ▶️${counts.active} ❌${counts.failed})`);
  }
  
  // Identify OLD vs NEW job types
  console.log("\n\n⚠️  LEGACY JOB TYPES (should be cleaned up):\n");
  const legacyTypes = ['generate-markdown', 'daemon-health-check'];
  for (const type of legacyTypes) {
    const count = parsedJobs.filter(j => j.type === type).length;
    if (count > 0) {
      console.log(`  ${type}: ${count} jobs`);
    }
  }
  
  console.log("\n✅ CURRENT JOB TYPES:\n");
  const currentTypes = ['session-created', 'session-idle', 'session-deleted', 'manual-index', 'backfill'];
  for (const type of currentTypes) {
    const jobs = parsedJobs.filter(j => j.type === type);
    if (jobs.length > 0) {
      console.log(`  ${type}: ${jobs.length} jobs`);
    }
  }
  
  // Recent activity
  console.log("\n\n🕐 Recent Activity:\n");
  const recentCompleted = byState.completed
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 10);
  
  for (const job of recentCompleted) {
    const time = new Date(job.completed_at).toLocaleTimeString();
    console.log(`  ${time} | ${job.type} | ${job.projectId}`);
  }
  
  // Current work
  console.log("\n\n🔧 Current Work:\n");
  console.log("Active:");
  for (const job of byState.active) {
    console.log(`  ▶️  ${job.type} | ${job.projectId} | Priority: ${job.priority}`);
  }
  
  console.log("\nWaiting (next 10):");
  const waitingSorted = byState.waiting
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);
  for (const job of waitingSorted) {
    console.log(`  ⏳ ${job.type} | ${job.projectId} | Priority: ${job.priority}`);
  }
  
  // Test project verification
  console.log("\n\n🧪 Test Project Jobs:\n");
  const testJobs = parsedJobs.filter(j => j.projectId === 'test-project');
  console.log(`  Total test jobs: ${testJobs.length}`);
  console.log(`  Completed: ${testJobs.filter(j => j.state === 'completed').length}`);
  console.log(`  Waiting: ${testJobs.filter(j => j.state === 'waiting').length}`);
  
  // Summary
  console.log("\n\n📈 Summary:\n");
  console.log(`  • Queue has ${allJobs.length} total jobs`);
  console.log(`  • ${byState.completed.length} jobs completed over time`);
  console.log(`  • ${parsedJobs.filter(j => legacyTypes.includes(j.type)).length} legacy jobs need cleanup`);
  console.log(`  • ${byState.waiting.length} jobs waiting to be processed`);
  console.log(`  • ${byState.active.length} job currently active`);
  
  db.close();
  
  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Report Complete\n");
  
} catch (err) {
  console.error("Error:", err);
}
