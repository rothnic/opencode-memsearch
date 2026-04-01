import Database from "bun:sqlite";
import { unpack } from "msgpackr";
import { existsSync } from "fs";

const dbPath = "/Users/nroth/.config/opencode/memsearch/queue/memory.db";
const db = new Database(dbPath, { readonly: true });

const jobs = db.query(`
  SELECT id, data, state 
  FROM jobs 
  WHERE state = 'waiting' 
  ORDER BY priority DESC
`).all() as any[];

console.log(`Found ${jobs.length} waiting jobs:\n`);

for (const job of jobs) {
  try {
    const data = unpack(job.data);
    const dirExists = existsSync(data.directory);
    console.log(`Job: ${data.type}`);
    console.log(`  Session: ${data.sessionId?.substring(0, 30)}...`);
    console.log(`  Directory: ${data.directory}`);
    console.log(`  Exists: ${dirExists ? '✅' : '❌'}`);
    console.log(`  Priority: ${job.priority}`);
    console.log();
  } catch (e) {
    console.log(`Job ${job.id}: [parse error: ${e}]`);
  }
}

db.close();
