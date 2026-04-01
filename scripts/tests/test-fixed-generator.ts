import { generateSessionMarkdown } from "./lib/session-generator";
import { readFileSync } from "fs";

const sessionId = "ses_365b95080ffeKGFkQC650LG1px";
const directory = "/Users/nroth/workspace/opencode-memsearch";

console.log("🧪 Testing Fixed Session Generator\n");
console.log("=".repeat(70));

console.log(`\nGenerating markdown for session: ${sessionId}\n`);

generateSessionMarkdown(sessionId, directory)
  .then(() => {
    const path = `${directory}/.memsearch/sessions/${sessionId}.md`;
    console.log("✅ Generation complete\n");
    
    const content = readFileSync(path, 'utf8');
    console.log(`File size: ${content.length} bytes\n`);
    console.log("Preview (first 1000 chars):\n");
    console.log(content.substring(0, 1000));
    console.log("\n...\n");
    
    // Check if it has actual content
    const hasContent = content.includes('## user') || content.includes('## assistant');
    const hasMetadata = content.includes('Metadata:');
    
    console.log("\n📊 Analysis:");
    console.log(`   Has role headers: ${hasContent}`);
    console.log(`   Has metadata: ${hasMetadata}`);
    console.log(`   Total lines: ${content.split('\n').length}`);
    
    if (content.length > 1000) {
      console.log("\n   ✅ Looks like it has substantial content!");
    } else {
      console.log("\n   ⚠️  File seems short, may not have full content");
    }
    
    console.log("\n" + "=".repeat(70) + "\n");
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    console.log("\n" + "=".repeat(70) + "\n");
  });
