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

console.log("Opening database:", queueDbPath);

try {
  const db = new Database(queueDbPath, { readonly: true });
  
  // List all tables
  console.log("\n📋 Tables in database:\n");
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const table of tables) {
    console.log(`  - ${table.name}`);
  }
  
  // Check bunqueue schema
  for (const tableName of ['bullmq', 'jobs', 'queue']) {
    try {
      const count = db.query(`SELECT COUNT(*) as count FROM ${tableName}`).get() as any;
      console.log(`\n${tableName} table: ${count.count} rows`);
      
      // Show schema
      const schema = db.query(`PRAGMA table_info(${tableName})`).all();
      console.log("  Columns:", schema.map((s: any) => s.name).join(", "));
      
      // Sample data
      const sample = db.query(`SELECT * FROM ${tableName} LIMIT 1`).all();
      if (sample.length > 0) {
        console.log("  Sample data keys:", Object.keys(sample[0]).join(", "));
      }
    } catch (err) {
      // Table doesn't exist
    }
  }
  
  db.close();
} catch (err) {
  console.error("Error:", err);
}
