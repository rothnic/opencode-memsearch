import Database from "bun:sqlite";
import { unpack } from "msgpackr";

const dbPath = "/Users/nroth/.config/opencode/memsearch/queue/memory.db";
const db = new Database(dbPath, { readonly: true });

// Get completed jobs
const completed = db.query("SELECT data FROM jobs WHERE state = 'completed' LIMIT 5").all() as any[];
console.log("=== Completed Jobs ===");
for (const job of completed) {
  try {
    const data = unpack(job.data);
    console.log(`  ${data.type} | ${data.projectId}`);
  } catch {}
}

// Get waiting jobs
const waiting = db.query("SELECT data FROM jobs WHERE state = 'waiting' LIMIT 5").all() as any[];
console.log("\n=== Waiting Jobs ===");
for (const job of waiting) {
  try {
    const data = unpack(job.data);
    console.log(`  ${data.type} | ${data.projectId} | ${data.directory || 'no-dir'}`);
  } catch {}
}

db.close();
