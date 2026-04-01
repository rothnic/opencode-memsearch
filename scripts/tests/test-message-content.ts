import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Examining Message Content Structure\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get a few messages
  const messages = db.query(`
    SELECT id, session_id, data
    FROM message
    LIMIT 5
  `).all() as any[];
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`\n--- Message ${i + 1} ---`);
    console.log(`ID: ${msg.id}`);
    
    try {
      const data = JSON.parse(msg.data);
      console.log(`\nParsed data keys: ${Object.keys(data).join(', ')}`);
      
      // Check common content locations
      console.log(`\nContent candidates:`);
      if (data.content) console.log(`  data.content: ${JSON.stringify(data.content).substring(0, 200)}`);
      if (data.text) console.log(`  data.text: ${JSON.stringify(data.text).substring(0, 200)}`);
      if (data.body) console.log(`  data.body: ${JSON.stringify(data.body).substring(0, 200)}`);
      if (data.message) console.log(`  data.message: ${JSON.stringify(data.message).substring(0, 200)}`);
      if (data.summary?.title) console.log(`  data.summary.title: ${JSON.stringify(data.summary.title)}`);
      if (data.parts) console.log(`  data.parts: ${JSON.stringify(data.parts).substring(0, 200)}`);
      
      // Show full data structure
      console.log(`\nFull data (formatted):`);
      console.log(JSON.stringify(data, null, 2).substring(0, 500));
      
    } catch (err) {
      console.log(`Error parsing: ${err}`);
      console.log(`Raw data: ${msg.data?.substring(0, 200)}`);
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
