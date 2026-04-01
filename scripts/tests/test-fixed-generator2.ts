import { generateSessionMarkdown } from "./lib/session-generator";
import { readFileSync } from "fs";

const sessionId = "ses_39c3338fbffeSgmcJcpr0rcvke";
const directory = "/Users/nroth/workspace/opencode-memsearch";

console.log("🧪 Testing Fixed Generator on Problematic Session\n");
console.log("=".repeat(70));

console.log(`\nSession: ${sessionId}\n`);

generateSessionMarkdown(sessionId, directory)
  .then(() => {
    const path = `${directory}/.memsearch/sessions/${sessionId}.md`;
    const content = readFileSync(path, 'utf8');
    
    console.log(`File size: ${content.length} bytes`);
    console.log(`Lines: ${content.split('\n').length}\n`);
    
    // Count assistant messages with content
    const assistantSections = content.split('## assistant');
    let withContent = 0;
    let withoutContent = 0;
    
    for (let i = 1; i < assistantSections.length; i++) {
      const section = assistantSections[i];
      const text = section.split('---')[0]; // Get content before next separator
      
      if (text.includes('(no content)') || text.trim().length < 50) {
        withoutContent++;
      } else {
        withContent++;
      }
    }
    
    console.log(`Assistant messages:`);
    console.log(`  With content: ${withContent}`);
    console.log(`  Without content: ${withoutContent}`);
    
    console.log(`\nPreview (first 1500 chars):\n`);
    console.log(content.substring(0, 1500));
    console.log("\n...\n");
    
    // Show a sample assistant message
    const firstAssistant = content.indexOf('## assistant');
    if (firstAssistant > 0) {
      const assistantSection = content.substring(firstAssistant, firstAssistant + 800);
      console.log("\nFirst assistant message:\n");
      console.log(assistantSection);
    }
    
    console.log("\n" + "=".repeat(70) + "\n");
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    console.log("\n" + "=".repeat(70) + "\n");
  });
