import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Finding Assistant Text Content\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Look for parts with text from assistant messages
  const parts = db.query(`
    SELECT p.id, p.message_id, p.data, p.type, m.data as msg_data
    FROM part p
    JOIN message m ON m.id = p.message_id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND p.data LIKE '%text%'
    LIMIT 20
  `).all() as any[];
  
  console.log(`\nFound ${parts.length} assistant parts with 'text' field\n`);
  
  for (let i = 0; i < Math.min(5, parts.length); i++) {
    const part = parts[i];
    const partData = JSON.parse(part.data);
    const msgData = JSON.parse(part.msg_data);
    
    console.log(`\n--- Part ${i + 1} ---`);
    console.log(`Type: ${partData.type}`);
    console.log(`Has text: ${!!partData.text}`);
    
    if (partData.text) {
      console.log(`Text preview: ${partData.text.substring(0, 150)}...`);
    }
    
    // Show all fields
    console.log(`All fields: ${Object.keys(partData).join(', ')}`);
  }
  
  // Check what types assistant parts have
  console.log("\n\n📊 Assistant Part Types Distribution:\n");
  const types = db.query(`
    SELECT 
      json_extract(p.data, '$.type') as part_type,
      COUNT(*) as count
    FROM part p
    JOIN message m ON m.id = p.message_id
    WHERE json_extract(m.data, '$.role') = 'assistant'
    GROUP BY part_type
    ORDER BY count DESC
  `).all() as any[];
  
  for (const t of types) {
    console.log(`   ${t.part_type || 'unknown'}: ${t.count}`);
  }
  
  // Check if any parts have content in other fields
  console.log("\n\n🔍 Checking for content in other fields:\n");
  const sampleParts = db.query(`
    SELECT p.data
    FROM part p
    JOIN message m ON m.id = p.message_id
    WHERE json_extract(m.data, '$.role') = 'assistant'
    LIMIT 10
  `).all() as any[];
  
  for (let i = 0; i < sampleParts.length; i++) {
    const data = JSON.parse(sampleParts[i].data);
    console.log(`\nPart ${i + 1}:`);
    console.log(`  Keys: ${Object.keys(data).join(', ')}`);
    
    // Check for any field that might contain content
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.length > 50) {
        console.log(`  ${key}: ${value.substring(0, 100)}...`);
      } else if (key === 'state' && value) {
        console.log(`  state keys: ${Object.keys(value).join(', ')}`);
      }
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
