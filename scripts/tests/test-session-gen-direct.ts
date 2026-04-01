import { generateSessionMarkdown } from "./lib/session-generator";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const TEST_SESSION_ID = "ses_365b95080ffeKGFkQC650LG1px";  // Session with 912 messages
const TEST_DIRECTORY = "/Users/nroth/workspace/opencode-memsearch";

async function testDirectGeneration() {
  console.log("🧪 Testing Session Generation Directly\n");
  console.log("=".repeat(70));
  
  console.log(`\nSession ID: ${TEST_SESSION_ID}`);
  console.log(`Directory: ${TEST_DIRECTORY}\n`);
  
  try {
    console.log("Calling generateSessionMarkdown...");
    await generateSessionMarkdown(TEST_SESSION_ID, TEST_DIRECTORY);
    console.log("✅ Function completed\n");
    
    // Check if file was created
    const expectedPath = join(TEST_DIRECTORY, ".memsearch", "sessions", `${TEST_SESSION_ID}.md`);
    console.log(`Expected file: ${expectedPath}`);
    
    if (existsSync(expectedPath)) {
      console.log("✅ File was created!");
      
      const content = await import("fs").then(fs => fs.readFileSync(expectedPath, 'utf8'));
      console.log(`\nFile size: ${content.length} bytes`);
      console.log(`\nPreview (first 500 chars):\n`);
      console.log(content.substring(0, 500));
    } else {
      console.log("❌ File was NOT created");
      
      // Check if parent directories exist
      const memsearchDir = join(TEST_DIRECTORY, ".memsearch");
      const sessionsDir = join(memsearchDir, "sessions");
      
      console.log(`\nDirectory check:`);
      console.log(`  .memsearch exists: ${existsSync(memsearchDir)}`);
      console.log(`  sessions exists: ${existsSync(sessionsDir)}`);
    }
    
  } catch (err) {
    console.error("❌ Error:", err);
    console.error("Stack:", (err as Error).stack);
  }
  
  console.log("\n" + "=".repeat(70) + "\n");
}

testDirectGeneration();
