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

console.log("🔍 Data Type Inspection\n");

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  const job = db.query(`
    SELECT id, data, typeof(data) as data_type
    FROM jobs
    LIMIT 1
  `).get() as any;
  
  console.log("Job ID:", job.id);
  console.log("Data type:", job.data_type);
  console.log("Data is buffer:", Buffer.isBuffer(job.data));
  
  if (Buffer.isBuffer(job.data)) {
    console.log("\nData as string (first 500 chars):");
    console.log(job.data.toString('utf8', 0, 500));
  } else {
    console.log("\nData:", job.data);
  }
  
  db.close();
} catch (err) {
  console.error("Error:", err);
}
