import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Checking 'part' Table\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Schema
  console.log("\n1. Part table schema:\n");
  const schema = db.query("PRAGMA table_info(part)").all() as any[];
  for (const col of schema) {
    console.log(`   ${col.name} (${col.type})`);
  }
  
  // Sample data
  console.log("\n2. Sample parts:\n");
  const parts = db.query("SELECT * FROM part LIMIT 5").all() as any[];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    console.log(`\n--- Part ${i + 1} ---`);
    console.log(`ID: ${part.id}`);
    console.log(`Message ID: ${part.message_id}`);
    console.log(`Type: ${part.type}`);
    
    if (part.data) {
      try {
        const data = JSON.parse(part.data);
        console.log(`\nData keys: ${Object.keys(data).join(', ')}`);
        
        if (data.text) {
          console.log(`\nText content (${data.text.length} chars):`);
          console.log(data.text.substring(0, 300));
        } else if (data.content) {
          console.log(`\nContent (${data.content.length} chars):`);
          console.log(data.content.substring(0, 300));
        } else {
          console.log(`\nFull data:`);
          console.log(JSON.stringify(data, null, 2).substring(0, 500));
        }
      } catch {
        console.log(`\nRaw data: ${part.data.substring(0, 300)}`);
      }
    }
  }
  
  // Check relationship to messages
  console.log("\n\n3. Join with message to get full conversation:\n");
  const joined = db.query(`
    SELECT 
      m.id as msg_id,
      m.session_id,
      json_extract(m.data, '$.role') as role,
      p.type as part_type,
      p.data as part_data
    FROM message m
    JOIN part p ON p.message_id = m.id
    LIMIT 10
  `).all() as any[];
  
  console.log(`Found ${joined.length} message-part pairs`);
  
  for (let i = 0; i < Math.min(3, joined.length); i++) {
    const row = joined[i];
    console.log(`\n--- Message ${i + 1} ---`);
    console.log(`Role: ${row.role}`);
    console.log(`Part type: ${row.part_type}`);
    
    try {
      const partData = JSON.parse(row.part_data);
      if (partData.text) {
        console.log(`Content: ${partData.text.substring(0, 200)}...`);
      } else {
        console.log(`Data: ${JSON.stringify(partData).substring(0, 200)}`);
      }
    } catch {
      console.log(`Raw: ${row.part_data?.substring(0, 200)}`);
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
