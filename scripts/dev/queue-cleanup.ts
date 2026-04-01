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

const LEGACY_JOB_TYPES = ["generate-markdown", "daemon-health-check"];

async function cleanup() {
  console.log("🧹 Cleaning up legacy queue jobs...\n");
  
  const db = new Database(queueDbPath);
  const { unpack } = await import("msgpackr");
  
  let deleted = 0;
  let scanned = 0;
  
  for (const jobType of LEGACY_JOB_TYPES) {
    console.log(`Processing: ${jobType}`);
    
    const jobs = db
      .query("SELECT id, data FROM jobs WHERE state = 'completed'")
      .all() as { id: string; data: Uint8Array }[];
    
    for (const job of jobs) {
      scanned++;
      try {
        const data = unpack(job.data);
        if (data.type === jobType) {
          db.run(`DELETE FROM jobs WHERE id = '${job.id}'`);
          deleted++;
        }
      } catch {
        // Skip
      }
    }
    
    console.log(`  Scanned: ${scanned}, Deleted: ${deleted}`);
  }
  
  db.close();
  
  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Scanned: ${scanned} jobs`);
  console.log(`   Deleted: ${deleted} legacy jobs`);
}

cleanup().catch(console.error);
