import { generateSessionMarkdown } from "../lib/processing/session-generator";
import { backfillAllSessions } from "../lib/queue/backfill";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/test-verify-data";

async function testMarkdownGeneration() {
  console.log("📝 Testing Markdown Generation\n");
  console.log("=".repeat(70));
  
  // Find a real session from opencode db
  console.log("\n1. Finding real sessions from OpenCode database...\n");
  
  try {
    // Try to get a session from backfill
    const result = await backfillAllSessions();
    console.log(`   Backfill result: ${JSON.stringify(result)}`);
    
    // Check what was generated
    const memsearchDir = join(TEST_DIR, ".memsearch", "sessions");
    
    if (!existsSync(memsearchDir)) {
      console.log("   ❌ No .memsearch directory created");
      return false;
    }
    
    const files = readdirSync(memsearchDir);
    console.log(`   ✅ Found ${files.length} markdown files`);
    
    if (files.length > 0) {
      console.log(`\n   Sample files:`);
      for (const file of files.slice(0, 5)) {
        const content = readFileSync(join(memsearchDir, file), 'utf8');
        const lines = content.split('\n').length;
        console.log(`     - ${file} (${lines} lines)`);
      }
      
      // Show content of first file
      if (files.length > 0) {
        console.log(`\n   Content preview (first file):\n`);
        const content = readFileSync(join(memsearchDir, files[0]), 'utf8');
        console.log(content.substring(0, 500));
        console.log("\n   ...");
      }
    }
    
    return files.length > 0;
  } catch (err) {
    console.log(`   ❌ Error: ${err}`);
    return false;
  }
}

async function checkMemsearchIndex() {
  console.log("\n\n" + "=".repeat(70));
  console.log("\n🔍 Checking Memsearch Index\n");
  
  try {
    // Check if memsearch CLI is available
    const { $ } = await import("bun");
    
    try {
      const version = await $`memsearch version`.text();
      console.log(`   ✅ Memsearch version: ${version.trim()}`);
    } catch {
      console.log("   ❌ Memsearch CLI not available");
      return false;
    }
    
    // Get stats
    try {
      const stats = await $`memsearch stats --json`.json();
      console.log(`\n   Collection stats:`);
      console.log(`     Documents: ${stats.documentCount || 0}`);
      console.log(`     Chunks: ${stats.chunkCount || 0}`);
      console.log(`     Collections: ${(stats.collections || []).length}`);
      
      if (stats.collections) {
        for (const coll of stats.collections) {
          console.log(`       - ${coll.name}: ${coll.documentCount || 0} docs`);
        }
      }
    } catch (err) {
      console.log(`   ⚠️  Could not get stats: ${err}`);
    }
    
    // Test search
    console.log(`\n   Testing search for 'session':`);
    try {
      const result = await $`memsearch search "session" --json --top-k 3`.json();
      console.log(`     Found ${result.results?.length || 0} results`);
      
      if (result.results?.length > 0) {
        for (const r of result.results.slice(0, 3)) {
          console.log(`       - Score: ${r.score?.toFixed(3)}, Source: ${r.metadata?.source?.substring(0, 50)}...`);
        }
      }
    } catch (err) {
      console.log(`     ⚠️  Search failed: ${err}`);
    }
    
    return true;
  } catch (err) {
    console.log(`   ❌ Error: ${err}`);
    return false;
  }
}

async function main() {
  const markdownOk = await testMarkdownGeneration();
  const memsearchOk = await checkMemsearchIndex();
  
  console.log("\n\n" + "=".repeat(70));
  console.log("\n📊 Final Results:\n");
  console.log(`   Markdown Generation: ${markdownOk ? '✅' : '❌'}`);
  console.log(`   Memsearch Index: ${memsearchOk ? '✅' : '❌'}`);
  
  if (markdownOk && memsearchOk) {
    console.log("\n   ✨ All systems working!");
  } else {
    console.log("\n   ⚠️  Some issues detected");
  }
  
  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch(console.error);
