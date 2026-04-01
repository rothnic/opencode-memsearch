import { generateSessionMarkdown } from "./lib/session-generator";
import { readFileSync, unlinkSync, existsSync } from "fs";

const sessionId = "ses_39c3338fbffeSgmcJcpr0rcvke";
const directory = "/Users/nroth/workspace/opencode-memsearch";
const path = `${directory}/.memsearch/sessions/${sessionId}.md`;

console.log("🧪 Force Regenerating Session\n");
console.log("=".repeat(70));

// Delete existing file to force regeneration
if (existsSync(path)) {
  console.log("Deleting existing file...");
  unlinkSync(path);
}

generateSessionMarkdown(sessionId, directory)
  .then(() => {
    const content = readFileSync(path, 'utf8');
    
    console.log(`\n✅ File regenerated`);
    console.log(`Size: ${content.length} bytes`);
    console.log(`Lines: ${content.split('\n').length}\n`);
    
    // Check assistant messages
    const assistantMatches = content.match(/## assistant/g);
    const noContentMatches = content.match(/\(no content\)/g);
    
    console.log(`Assistant sections: ${assistantMatches?.length || 0}`);
    console.log(`"(no content)" occurrences: ${noContentMatches?.length || 0}\n`);
    
    // Show first assistant with content
    const sections = content.split('## assistant');
    let foundContent = false;
    
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const contentPart = section.split('---')[0];
      
      if (!contentPart.includes('(no content)') && contentPart.trim().length > 50) {
        console.log(`First assistant with content (message ${i}):\n`);
        console.log('## assistant' + contentPart.substring(0, 600));
        console.log("\n...\n");
        foundContent = true;
        break;
      }
    }
    
    if (!foundContent) {
      console.log("❌ No assistant messages with substantial content found");
    }
    
    console.log("\n" + "=".repeat(70) + "\n");
  })
  .catch(console.error);
