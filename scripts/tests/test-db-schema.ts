import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Database Schema Check\n");

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get message table schema
  const schema = db.query("PRAGMA table_info(message)").all();
  console.log("Message table columns:\n");
  for (const col of schema) {
    console.log(`  ${col.name} (${col.type})`);
  }
  
  // Sample a message
  console.log("\n\nSample message:\n");
  const sample = db.query("SELECT * FROM message LIMIT 1").get();
  console.log(JSON.stringify(sample, null, 2).substring(0, 500));
  
  db.close();
} catch (err) {
  console.error("Error:", err);
}
