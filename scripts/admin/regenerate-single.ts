import Database from "bun:sqlite";
import { join } from "path";
import { generateSessionMarkdown } from "./lib/session-generator";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔄 Regenerating All Files (Single Files)\n");
console.log("=".repeat(70));

async function main() {
  const db = new Database(dbPath, { readonly: true });
  
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sessions = db.query(`
    SELECT DISTINCT s.id, s.directory
    FROM session s
    WHERE s.time_updated > ?
    ORDER BY s.time_updated DESC
  `).all(cutoff) as { id: string; directory: string }[];
  
  db.close();
  
  console.log(`\nFound ${sessions.length} sessions to regenerate\n`);
  
  let processed = 0;
  const startTime = Date.now();
  
  // Process sequentially to avoid overwhelming the system
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    
    try {
      await generateSessionMarkdown(session.id, session.directory);
      processed++;
      
      if (processed % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        console.log(`  Progress: ${processed}/${sessions.length} (${rate.toFixed(1)}/sec)`);
      }
    } catch (err) {
      console.error(`Error: ${session.id}`, err);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  console.log(`\n✅ Complete!`);
  console.log(`   Sessions: ${processed}`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Rate: ${(processed / duration).toFixed(1)} sessions/sec`);
  
  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch(console.error);
