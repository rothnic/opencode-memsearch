import { backfillAllSessions } from "../lib/queue/backfill";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

console.log("🔄 Regenerating All Markdown Files\n");
console.log("=".repeat(70));

async function main() {
  console.log("\nStarting backfill process...\n");
  
  const startTime = Date.now();
  const result = await backfillAllSessions();
  const duration = (Date.now() - startTime) / 1000;
  
  console.log(`\n✅ Backfill complete!`);
  console.log(`   Sessions processed: ${result.processed}`);
  console.log(`   Total sessions: ${result.total}`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Rate: ${(result.processed / duration).toFixed(1)} sessions/sec`);
  
  // Check generated files
  console.log("\n📁 Verifying generated files:\n");
  
  const projectDirs = [
    "/Users/nroth/workspace/opencode-memsearch",
    "/Users/nroth/workspace/udd",
    "/Users/nroth/workspace/multi-backend",
    "/Users/nroth/workspace/dokploy-gitops",
  ];
  
  let totalFiles = 0;
  let totalSize = 0;
  
  for (const dir of projectDirs) {
    const sessionsDir = join(dir, ".memsearch", "sessions");
    if (existsSync(sessionsDir)) {
      const files = readdirSync(sessionsDir).filter(f => f.endsWith('.md'));
      let dirSize = 0;
      let sampleSize = 0;
      
      for (const file of files.slice(0, 5)) {
        const stats = statSync(join(sessionsDir, file));
        dirSize += stats.size;
        sampleSize += stats.size;
      }
      
      // Estimate total size
      const avgSize = files.length > 0 ? sampleSize / Math.min(files.length, 5) : 0;
      const estimatedTotal = files.length * avgSize;
      
      totalFiles += files.length;
      totalSize += estimatedTotal;
      
      console.log(`   ${dir.split('/').pop()}: ${files.length} files (~${Math.round(estimatedTotal/1024)} KB estimated)`);
    }
  }
  
  console.log(`\n📊 Total: ${totalFiles} files (~${Math.round(totalSize/1024/1024)} MB estimated)`);
  
  // Check for actual content
  console.log("\n🔍 Checking file content quality:\n");
  
  const opencodeDir = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions";
  if (existsSync(opencodeDir)) {
    const files = readdirSync(opencodeDir).filter(f => f.endsWith('.md'));
    let hasContent = 0;
    let onlyMetadata = 0;
    
    for (const file of files.slice(0, 10)) {
      const content = require('fs').readFileSync(join(opencodeDir, file), 'utf8');
      // Check if it has actual conversation content vs just metadata
      if (content.includes('## user') && content.length > 1000) {
        hasContent++;
      } else if (content.includes('Metadata:') && content.split('\n').length < 20) {
        onlyMetadata++;
      }
    }
    
    console.log(`   Sampled: ${Math.min(files.length, 10)} files from opencode-memsearch`);
    console.log(`   Files with content: ${hasContent}`);
    console.log(`   Files with only metadata: ${onlyMetadata}`);
    
    if (hasContent > onlyMetadata) {
      console.log(`   ✅ Files have actual content!`);
    } else {
      console.log(`   ⚠️  Most files only have metadata`);
    }
  }
  
  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch(console.error);
