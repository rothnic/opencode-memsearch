import Database from "bun:sqlite";
import { unpack } from "msgpackr";

const dbPath = "/Users/nroth/.config/opencode/memsearch/queue/memory.db";
const db = new Database(dbPath, { readonly: true });

// Get all waiting jobs grouped by project
const jobs = db.query(`
  SELECT id, data, state, priority
  FROM jobs 
  WHERE state = 'waiting'
  ORDER BY priority DESC, created_at ASC
`).all() as any[];

console.log(`Waiting jobs: ${jobs.length}\n`);

const byProject: Record<string, any[]> = {};
for (const job of jobs) {
  try {
    const data = unpack(job.data);
    const project = data.projectId || data.directory?.split('/').pop() || 'unknown';
    if (!byProject[project]) byProject[project] = [];
    byProject[project].push({
      type: data.type,
      sessionId: data.sessionId?.substring(0, 20),
      priority: job.priority
    });
  } catch {
    console.log(`Parse error for job ${job.id}`);
  }
}

console.log("Projects with waiting jobs:");
for (const [project, projectJobs] of Object.entries(byProject)) {
  console.log(`\n  ${project}: ${projectJobs.length} jobs`);
  for (const job of projectJobs.slice(0, 3)) {
    console.log(`    - ${job.type} (${job.sessionId}...) priority:${job.priority}`);
  }
  if (projectJobs.length > 3) {
    console.log(`    ... and ${projectJobs.length - 3} more`);
  }
}

db.close();
