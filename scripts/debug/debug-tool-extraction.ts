import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

const sessionId = "ses_39c3338fbffeSgmcJcpr0rcvke";

console.log("🔍 Debugging Tool Output Extraction\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get first few assistant messages with their parts
  const messages = db.query(`
    SELECT m.id, m.data as msg_data, m.time_created
    FROM message m
    WHERE m.session_id = ?
      AND json_extract(m.data, '$.role') = 'assistant'
    ORDER BY m.time_created ASC
    LIMIT 5
  `).all(sessionId) as any[];
  
  for (const msg of messages) {
    const msgData = JSON.parse(msg.msg_data);
    console.log(`\n--- Assistant Message ${msg.id.substring(0, 20)}... ---`);
    console.log(`Time: ${new Date(msg.time_created).toISOString()}`);
    
    // Get parts
    const parts = db.query(`
      SELECT data FROM part WHERE message_id = ?
    `).all(msg.id) as any[];
    
    console.log(`Parts: ${parts.length}`);
    
    for (let i = 0; i < parts.length; i++) {
      const data = JSON.parse(parts[i].data);
      console.log(`\n  Part ${i + 1}:`);
      console.log(`    Type: ${data.type}`);
      
      if (data.type === 'tool') {
        console.log(`    ✓ Is tool type`);
        console.log(`    Has state: ${!!data.state}`);
        
        if (data.state) {
          console.log(`    State keys: ${Object.keys(data.state).join(', ')}`);
          console.log(`    Has output: ${!!data.state.output}`);
          console.log(`    Has input: ${!!data.state.input}`);
          
          if (data.state.output) {
            const outputType = typeof data.state.output;
            console.log(`    Output type: ${outputType}`);
            console.log(`    Output length: ${data.state.output.length || 'N/A'}`);
            console.log(`    Output preview: ${JSON.stringify(data.state.output).substring(0, 100)}...`);
          }
        }
      } else if (data.text) {
        console.log(`    ✓ Has text: ${data.text.substring(0, 100)}...`);
      } else {
        console.log(`    Keys: ${Object.keys(data).join(', ')}`);
      }
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
