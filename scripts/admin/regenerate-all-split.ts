import Database from "bun:sqlite";
import { join } from "path";
import { generateSessionMarkdown } from "../../src/processing/session-generator";
import { readdirSync, unlinkSync, existsSync } from "fs";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔄 Regenerating ALL Files with Splitting\n");
console.log("=".repeat(70));

async function main() {
  const db = new Database(dbPath, { readonly: true });
  
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sessions = db.query(`
    SELECT DISTINCT s.id, s.directory, COUNT(m.id) as msg_count
    FROM session s
    LEFT JOIN message m ON m.session_id = s.id
    WHERE s.time_updated > ?
    GROUP BY s.id
    ORDER BY s.time_updated DESC
  `).all(cutoff) as { id: string; directory: string; msg_count: number }[];
  
  db.close();
  
  console.log(`\nFound ${sessions.length} sessions\n`);
  
  // Delete all existing session markdown files
  console.log("Deleting existing files...");
  const projects = new Set(sessions.map(s => s.directory));
  let deleted = 0;
  for (const dir of projects) {
    const sessionsDir = join(dir, ".memsearch", "sessions");
    if (existsSync(sessionsDir)) {
      const files = readdirSync(sessionsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        unlinkSync(join(sessionsDir, file));
        deleted++;
      }
    }
  }
  console.log(`Deleted ${deleted} files\n`);
  
  // Regenerate all
  let processed = 0;
  let totalParts = 0;
  const startTime = Date.now();
  
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (session) => {
      try {
        await generateSessionMarkdown(session.id, session.directory);
        processed++;
      } catch (err) {
        console.error(`Error: ${session.id}`, err);
      }
    }));
    
    if (i % 500 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`  Progress: ${processed}/${sessions.length} (${(processed/elapsed).toFixed(1)}/sec)`);
    }
  }
  
  // Count total files created
  let totalFiles = 0;
  for (const dir of projects) {
    const sessionsDir = join(dir, ".memsearch", "sessions");
    if (existsSync(sessionsDir)) {
      totalFiles += readdirSync(sessionsDir).filter(f => f.endsWith('.md')).length;
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  console.log(`\n✅ Complete!`);
  console.log(`   Sessions: ${processed}`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Rate: ${(processed / duration).toFixed(1)} sessions/sec`);
  
  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch(console.error);
