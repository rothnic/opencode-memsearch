import Database from "bun:sqlite";
import { join } from "path";

const sessionId = "ses_365b95080ffeKGFkQC650LG1px";
const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Debugging Message Fetch\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log(`\nFetching messages for session: ${sessionId}\n`);
  
  const rows = db
    .query(
      `SELECT 
        id,
        role,
        parts,
        time_created
       FROM message
       WHERE session_id = ?
       ORDER BY time_created ASC`
    )
    .all(sessionId) as any[];
  
  console.log(`Found ${rows.length} messages\n`);
  
  if (rows.length > 0) {
    console.log("First message:");
    const first = rows[0];
    console.log(`  ID: ${first.id}`);
    console.log(`  Role: ${first.role}`);
    console.log(`  Parts type: ${typeof first.parts}`);
    console.log(`  Parts preview: ${first.parts?.substring(0, 100)}...`);
    
    try {
      const parsed = JSON.parse(first.parts || "[]");
      console.log(`  Parsed parts count: ${parsed.length}`);
      if (parsed.length > 0) {
        console.log(`  First part: ${JSON.stringify(parsed[0]).substring(0, 100)}`);
      }
    } catch (err) {
      console.log(`  ❌ Failed to parse parts: ${err}`);
    }
  } else {
    console.log("⚠️  No messages found - this is why file isn't created!");
  }
  
  db.close();
  
} catch (err) {
  console.error("❌ Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
