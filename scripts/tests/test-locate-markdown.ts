import Database from "bun:sqlite";
import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Locating Generated Markdown Files\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Find recent sessions with directories
  const sessions = db.query(`
    SELECT id, directory, time_updated
    FROM session
    WHERE time_updated > ?
    ORDER BY time_updated DESC
    LIMIT 20
  `).all(Date.now() - 7 * 24 * 60 * 60 * 1000) as { id: string; directory: string; time_updated: number }[];
  
  console.log(`\nFound ${sessions.length} recent sessions\n`);
  
  let foundCount = 0;
  let totalSize = 0;
  
  for (const session of sessions) {
    const memsearchDir = join(session.directory, ".memsearch", "sessions");
    const mdFile = join(memsearchDir, `${session.id}.md`);
    
    if (existsSync(mdFile)) {
      const stats = statSync(mdFile);
      const age = Math.round((Date.now() - stats.mtimeMs) / (1000 * 60));
      console.log(`  ✅ ${session.id.substring(0, 30)}...`);
      console.log(`     Location: ${mdFile.substring(0, 60)}...`);
      console.log(`     Size: ${stats.size} bytes`);
      console.log(`     Age: ${age} minutes`);
      console.log();
      foundCount++;
      totalSize += stats.size;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Sessions checked: ${sessions.length}`);
  console.log(`   Markdown files found: ${foundCount}`);
  console.log(`   Total size: ${Math.round(totalSize / 1024)} KB`);
  
  if (foundCount === 0) {
    console.log(`\n   ⚠️  No markdown files found in session directories`);
    console.log(`   This suggests markdown generation may not be working`);
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}
