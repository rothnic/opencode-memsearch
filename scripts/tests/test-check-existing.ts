import { existsSync, statSync } from "fs";
import { join } from "path";

const sessionId = "ses_365b95080ffeKGFkQC650LG1px";
const directory = "/Users/nroth/workspace/opencode-memsearch";
const markdownPath = join(directory, ".memsearch", "sessions", `${sessionId}.md`);

console.log("Checking existing file:\n");
console.log(`Path: ${markdownPath}`);
console.log(`Exists: ${existsSync(markdownPath)}`);

if (existsSync(markdownPath)) {
  const stats = statSync(markdownPath);
  const ageMs = Date.now() - stats.mtimeMs;
  const ageMin = Math.round(ageMs / (1000 * 60));
  const ageHour = Math.round(ageMs / (1000 * 60 * 60));
  
  console.log(`\nFile stats:`);
  console.log(`  Size: ${stats.size} bytes`);
  console.log(`  Modified: ${stats.mtime}`);
  console.log(`  Age: ${ageMin} minutes (${ageHour} hours)`);
  console.log(`  Skip threshold: 60 minutes`);
  console.log(`  Would skip: ${ageMs < 60 * 60 * 1000}`);
  
  if (ageMs < 60 * 60 * 1000) {
    console.log(`\n⚠️  File exists and is recent - generation skipped!`);
  } else {
    console.log(`\n✅ File exists but is old - would regenerate`);
  }
} else {
  console.log(`\n❌ File does not exist - should generate`);
}
