import Database from "bun:sqlite";
import { join } from "path";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Debugging Backfill Process\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Check database connection
  console.log("\n1. Database Connection:");
  console.log(`   Path: ${dbPath}`);
  const test = db.query("SELECT 1").get();
  console.log(`   Status: ✅ Connected`);
  
  // Check session table
  console.log("\n2. Session Table:");
  const sessionCount = db.query("SELECT COUNT(*) as count FROM session").get() as any;
  console.log(`   Total sessions: ${sessionCount.count}`);
  
  // Check recent sessions
  const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCount = db.query("SELECT COUNT(*) as count FROM session WHERE time_updated > ?").get(cutoffTime) as any;
  console.log(`   Sessions in last 30 days: ${recentCount.count}`);
  
  // Sample a session
  console.log("\n3. Sample Session:");
  const sample = db.query("SELECT id, directory, time_updated FROM session WHERE time_updated > ? LIMIT 1").get(cutoffTime) as any;
  if (sample) {
    console.log(`   ID: ${sample.id}`);
    console.log(`   Directory: ${sample.directory}`);
    console.log(`   Updated: ${new Date(sample.time_updated).toISOString()}`);
    
    // Check messages for this session
    const msgCount = db.query("SELECT COUNT(*) as count FROM message WHERE session_id = ?").get(sample.id) as any;
    console.log(`   Messages: ${msgCount.count}`);
  }
  
  // Check if backfill function would find anything
  console.log("\n4. Backfill Query Test:");
  const rows = db.query(`
    SELECT 
      s.id,
      s.project_id,
      s.directory,
      s.title,
      s.time_updated,
      COUNT(m.id) as message_count
    FROM session s
    LEFT JOIN message m ON m.session_id = s.id
    WHERE s.time_updated > ?
    GROUP BY s.id
    ORDER BY s.time_updated DESC
    LIMIT 5
  `).all(cutoffTime) as any[];
  
  console.log(`   Found ${rows.length} sessions`);
  for (const row of rows.slice(0, 3)) {
    console.log(`   - ${row.id?.substring(0, 30)}... (${row.message_count} messages)`);
    console.log(`     Dir: ${row.directory?.substring(0, 50)}...`);
  }
  
  db.close();
  
  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Database is accessible and has data\n");
  
} catch (err) {
  console.error("\n❌ Error:", err);
}
