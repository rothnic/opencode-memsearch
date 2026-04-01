import { backfillAllSessions } from "./lib/backfill";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

async function testBackfill() {
  console.log("🔄 Testing Backfill with Fixed Generator\n");
  console.log("=".repeat(70));
  
  console.log("\nRunning backfill...\n");
  const result = await backfillAllSessions();
  
  console.log(`Backfill result:`);
  console.log(`  Total sessions: ${result.total}`);
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Queued: ${result.queued}`);
  
  // Check how many files were created
  console.log("\nChecking generated files...\n");
  
  // Check a few project directories
  const projectDirs = [
    "/Users/nroth/workspace/opencode-memsearch",
    "/Users/nroth/workspace/udd",
    "/Users/nroth/workspace/multi-backend",
  ];
  
  let totalFiles = 0;
  let totalSize = 0;
  
  for (const dir of projectDirs) {
    const sessionsDir = join(dir, ".memsearch", "sessions");
    if (existsSync(sessionsDir)) {
      const files = readdirSync(sessionsDir);
      let dirSize = 0;
      for (const file of files) {
        const stat = require("fs").statSync(join(sessionsDir, file));
        dirSize += stat.size;
      }
      totalFiles += files.length;
      totalSize += dirSize;
      console.log(`  ${dir.split('/').pop()}: ${files.length} files (${Math.round(dirSize/1024)} KB)`);
    } else {
      console.log(`  ${dir.split('/').pop()}: no .memsearch directory`);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  Total files generated: ${totalFiles}`);
  console.log(`  Total size: ${Math.round(totalSize/1024)} KB`);
  
  if (result.processed > 0) {
    console.log(`\n✅ Backfill successful!`);
  } else {
    console.log(`\n⚠️  No sessions processed`);
  }
  
  console.log("\n" + "=".repeat(70) + "\n");
}

testBackfill().catch(console.error);
