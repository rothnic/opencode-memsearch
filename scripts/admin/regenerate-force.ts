import Database from "bun:sqlite";
import { join } from "path";
import { generateSessionMarkdown } from "./lib/session-generator";
import { readdirSync, unlinkSync } from "fs";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔄 Force Regenerating ALL Markdown Files\n");
console.log("=".repeat(70));

async function main() {
  const db = new Database(dbPath, { readonly: true });
  
  // Get all sessions from last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sessions = db.query(`
    SELECT id, directory
    FROM session
    WHERE time_updated > ?
    ORDER BY time_updated DESC
  `).all(cutoff) as { id: string; directory: string }[];
  
  db.close();
  
  console.log(`\nFound ${sessions.length} sessions to regenerate\n`);
  
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  
  // Process in batches to avoid memory issues
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (session) => {
      try {
        await generateSessionMarkdown(session.id, session.directory);
        processed++;
      } catch (err) {
        errors++;
      }
    }));
    
    if (i % 500 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      console.log(`  Progress: ${processed}/${sessions.length} (${rate.toFixed(1)}/sec)`);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  console.log(`\n✅ Complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Rate: ${(processed / duration).toFixed(1)} sessions/sec`);
  
  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch(console.error);
