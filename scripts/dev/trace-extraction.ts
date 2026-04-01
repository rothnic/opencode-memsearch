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

console.log("🔍 Tracing Message Extraction\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Simulate exactly what fetchSessionMessages does
  const messageRows = db.query(`
    SELECT id, session_id, time_created, data
    FROM message
    WHERE session_id = ?
    ORDER BY time_created ASC
  `).all(sessionId) as any[];
  
  const partRows = db.query(`
    SELECT id, message_id, session_id, time_created, data
    FROM part
    WHERE session_id = ?
    ORDER BY time_created ASC
  `).all(sessionId) as any[];
  
  console.log(`Messages: ${messageRows.length}, Parts: ${partRows.length}\n`);
  
  // Group parts
  const partsByMessage = new Map();
  for (const row of partRows.slice(0, 10)) {
    const partData = JSON.parse(row.data || "{}");
    console.log(`Part ${row.id.substring(0, 20)}... for msg ${row.message_id.substring(0, 20)}...`);
    console.log(`  Type: ${partData.type}`);
    console.log(`  Has state: ${!!partData.state}`);
    
    if (partData.state) {
      console.log(`  State.output exists: ${!!partData.state.output}`);
      if (partData.state.output) {
        console.log(`  Output type: ${typeof partData.state.output}`);
        console.log(`  Output length: ${partData.state.output.length}`);
      }
    }
    
    if (!partsByMessage.has(row.message_id)) {
      partsByMessage.set(row.message_id, []);
    }
    partsByMessage.get(row.message_id).push({
      data: partData
    });
  }
  
  console.log(`\n\nNow simulating formatMessage for first assistant message...\n`);
  
  // Find first assistant message
  for (const msgRow of messageRows.slice(0, 5)) {
    const msgData = JSON.parse(msgRow.data);
    if (msgData.role === 'assistant') {
      console.log(`\nMessage: ${msgRow.id.substring(0, 20)}...`);
      console.log(`Role: ${msgData.role}`);
      
      const parts = partsByMessage.get(msgRow.id) || [];
      console.log(`Parts for this message: ${parts.length}`);
      
      const toolOutputs = [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        console.log(`\n  Processing part ${i + 1}:`);
        console.log(`    part.data.type: ${part.data.type}`);
        console.log(`    part.data.state exists: ${!!part.data.state}`);
        
        if (part.data.type === "tool" && part.data.state) {
          console.log(`    ✓ Found tool with state`);
          console.log(`    part.data.state.output exists: ${!!part.data.state.output}`);
          
          if (part.data.state.output) {
            const output = part.data.state.output;
            console.log(`    Output type: ${typeof output}`);
            console.log(`    Output preview: ${output.substring(0, 50)}...`);
            toolOutputs.push(output.substring(0, 100));
          }
        }
      }
      
      console.log(`\n  Tool outputs collected: ${toolOutputs.length}`);
      if (toolOutputs.length > 0) {
        console.log(`  First output: ${toolOutputs[0]}`);
      }
      
      break; // Only check first assistant
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
