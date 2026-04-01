import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Debugging Assistant Message Parts\n");
console.log("=".repeat(70));

const sessionId = "ses_39c3338fbffeSgmcJcpr0rcvke";

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get messages for this session
  const messages = db.query(`
    SELECT id, data, time_created
    FROM message
    WHERE session_id = ?
    ORDER BY time_created ASC
  `).all(sessionId) as any[];
  
  console.log(`\nFound ${messages.length} messages\n`);
  
  for (let i = 0; i < Math.min(5, messages.length); i++) {
    const msg = messages[i];
    const msgData = JSON.parse(msg.data);
    
    console.log(`\n--- Message ${i + 1} ---`);
    console.log(`ID: ${msg.id}`);
    console.log(`Role: ${msgData.role}`);
    console.log(`Time: ${new Date(msg.time_created).toISOString()}`);
    
    // Get parts for this message
    const parts = db.query(`
      SELECT id, data
      FROM part
      WHERE message_id = ?
      ORDER BY time_created ASC
    `).all(msg.id) as any[];
    
    console.log(`\nParts: ${parts.length}`);
    
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      const partData = JSON.parse(part.data);
      
      console.log(`\n  Part ${j + 1}:`);
      console.log(`    Type: ${partData.type}`);
      
      if (partData.text) {
        console.log(`    Text: ${partData.text.substring(0, 100)}...`);
      } else {
        console.log(`    Text: (none)`);
        // Show what fields ARE present
        console.log(`    Fields: ${Object.keys(partData).join(', ')}`);
        console.log(`    Data: ${JSON.stringify(partData).substring(0, 200)}`);
      }
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
