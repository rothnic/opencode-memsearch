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
  
  // Get all parts for assistant messages in a specific session
  const sessionId = "ses_39c3338fbffeSgmcJcpr0rcvke";
  
  const parts = db.query(`
    SELECT p.id, p.message_id, p.data, m.data as msg_data
    FROM part p
    JOIN message m ON m.id = p.message_id
    WHERE m.session_id = ?
      AND json_extract(m.data, '$.role') = 'assistant'
    ORDER BY p.time_created ASC
    LIMIT 50
  `).all(sessionId) as any[];
  
  console.log(`\nFound ${parts.length} assistant parts\n`);
  
  // Group by message
  const byMessage = new Map();
  for (const part of parts) {
    const msgId = part.message_id;
    if (!byMessage.has(msgId)) {
      byMessage.set(msgId, []);
    }
    byMessage.get(msgId).push(part);
  }
  
  console.log(`Grouped into ${byMessage.size} messages\n`);
  
  // Check first few messages
  let msgCount = 0;
  for (const [msgId, msgParts] of byMessage) {
    if (msgCount >= 3) break;
    msgCount++;
    
    console.log(`\n--- Message ${msgId.substring(0, 20)}... ---`);
    console.log(`Parts: ${msgParts.length}`);
    
    for (let i = 0; i < msgParts.length; i++) {
      const part = msgParts[i];
      const data = JSON.parse(part.data);
      
      console.log(`\n  Part ${i + 1} - Type: ${data.type}`);
      
      if (data.text) {
        console.log(`  ✓ Has text: ${data.text.substring(0, 100)}...`);
      } else if (data.state) {
        console.log(`  State keys: ${Object.keys(data.state).join(', ')}`);
        if (data.state.output) {
          console.log(`  Output preview: ${JSON.stringify(data.state.output).substring(0, 100)}...`);
        }
      }
    }
  }
  
  // Look for ANY part with substantial text content
  console.log("\n\n🔍 Searching for parts with substantial text...\n");
  
  const allParts = db.query(`
    SELECT p.data, p.time_created
    FROM part p
    JOIN message m ON m.id = p.message_id
    WHERE m.session_id = ?
    ORDER BY p.time_created ASC
  `).all(sessionId) as any[];
  
  let foundText = 0;
  for (const part of allParts) {
    const data = JSON.parse(part.data);
    if (data.text && data.text.length > 100 && data.type !== 'step-start' && data.type !== 'step-finish') {
      foundText++;
      if (foundText <= 3) {
        console.log(`\n✓ Found substantial text (type: ${data.type}):`);
        console.log(data.text.substring(0, 150) + '...');
      }
    }
  }
  
  console.log(`\n\nTotal parts with substantial text: ${foundText}`);
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
