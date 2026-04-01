import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Finding Actual Message Content\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // List all tables
  console.log("\n1. Tables in database:\n");
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[];
  for (const table of tables) {
    console.log(`   - ${table.name}`);
  }
  
  // Check if there's a content or parts field in message
  console.log("\n2. Message table schema:\n");
  const schema = db.query("PRAGMA table_info(message)").all() as any[];
  for (const col of schema) {
    console.log(`   ${col.name} (${col.type})`);
  }
  
  // Check for any message that might have content
  console.log("\n3. Searching for message content...\n");
  const sample = db.query(`
    SELECT data FROM message 
    WHERE data LIKE '%content%' 
       OR data LIKE '%text%' 
       OR data LIKE '%body%' 
       OR data LIKE '%message%'
    LIMIT 3
  `).all() as any[];
  
  if (sample.length > 0) {
    console.log(`   Found ${sample.length} messages with content-like fields`);
    for (let i = 0; i < sample.length; i++) {
      console.log(`\n   Sample ${i + 1}:`);
      const data = JSON.parse(sample[i].data);
      console.log(JSON.stringify(data, null, 2).substring(0, 800));
    }
  } else {
    console.log("   No messages with 'content', 'text', 'body', or 'message' fields found");
  }
  
  // Check message_part table if it exists
  const hasPartsTable = tables.some(t => t.name === 'message_part');
  if (hasPartsTable) {
    console.log("\n4. Message parts table found:\n");
    const partsSchema = db.query("PRAGMA table_info(message_part)").all() as any[];
    for (const col of partsSchema) {
      console.log(`   ${col.name} (${col.type})`);
    }
    
    const parts = db.query("SELECT * FROM message_part LIMIT 2").all() as any[];
    if (parts.length > 0) {
      console.log("\n   Sample parts:");
      for (const part of parts) {
        console.log(JSON.stringify(part, null, 2).substring(0, 500));
      }
    }
  }
  
  // Check for history/transcript tables
  const historyTables = tables.filter(t => 
    t.name.includes('history') || 
    t.name.includes('transcript') || 
    t.name.includes('turn')
  );
  
  if (historyTables.length > 0) {
    console.log("\n5. History/transcript tables found:\n");
    for (const table of historyTables) {
      console.log(`   - ${table.name}`);
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
