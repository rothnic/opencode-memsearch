import Database from "bun:sqlite";
import { unpack } from "msgpackr";
import { existsSync } from "fs";

const dbPath = "/Users/nroth/.config/opencode/memsearch/queue/memory.db";
const db = new Database(dbPath, { readonly: true });

const jobs = db.query(`
  SELECT id, data, state, priority
  FROM jobs 
  ORDER BY state, priority DESC
`).all() as any[];

console.log(`Total jobs: ${jobs.length}\n`);

const byState: Record<string, any[]> = {};
for (const job of jobs) {
  if (!byState[job.state]) byState[job.state] = [];
  byState[job.state].push(job);
}

for (const [state, stateJobs] of Object.entries(byState)) {
  console.log(`\n=== ${state.toUpperCase()} (${stateJobs.length}) ===`);
  for (const job of stateJobs.slice(0, 3)) {
    try {
      const data = unpack(job.data);
      console.log(`  Job: ${data.type}`);
      console.log(`    Directory: ${data.directory || '(empty)'}`);
      console.log(`    Priority: ${job.priority}`);
    } catch {
      console.log(`  Job ${job.id}: [parse error]`);
    }
  }
  if (stateJobs.length > 3) {
    console.log(`  ... and ${stateJobs.length - 3} more`);
  }
}

db.close();
