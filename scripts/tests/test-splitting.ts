import { generateSessionMarkdown } from "../lib/processing/session-generator";
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const sessionId = "ses_365b95080ffeKGFkQC650LG1px";  // Large session
const directory = "/Users/nroth/workspace/opencode-memsearch";
const sessionsDir = join(directory, ".memsearch", "sessions");

console.log("🧪 Testing File Splitting\n");
console.log("=".repeat(70));

// First, delete existing files to force regeneration
const files = readdirSync(sessionsDir).filter(f => f.includes(sessionId));
console.log(`Deleting ${files.length} existing files...`);
for (const file of files) {
  require("fs").unlinkSync(join(sessionsDir, file));
}

console.log(`\nRegenerating session: ${sessionId}\n`);

generateSessionMarkdown(sessionId, directory)
  .then(() => {
    const newFiles = readdirSync(sessionsDir)
      .filter(f => f.includes(sessionId))
      .sort();
    
    console.log(`Generated ${newFiles.length} file(s):\n`);
    
    let totalSize = 0;
    for (const file of newFiles) {
      const path = join(sessionsDir, file);
      const stats = statSync(path);
      totalSize += stats.size;
      console.log(`  ${file}: ${(stats.size / 1024).toFixed(1)} KB`);
    }
    
    console.log(`\nTotal size: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`Average per file: ${(totalSize / newFiles.length / 1024).toFixed(1)} KB`);
    
    if (newFiles.length > 1) {
      console.log(`\n✅ Successfully split into ${newFiles.length} parts!`);
    } else {
      console.log(`\nℹ️  File fits within size limit (no splitting needed)`);
    }
    
    // Show first part preview
    if (newFiles.length > 0) {
      const content = readFileSync(join(sessionsDir, newFiles[0]), 'utf8');
      console.log(`\nFirst part preview:\n`);
      console.log(content.substring(0, 500));
      console.log("\n...");
    }
    
    console.log("\n" + "=".repeat(70) + "\n");
  })
  .catch(console.error);
