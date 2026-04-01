#!/usr/bin/env bun
/**
 * Test compaction with limited sessions
 */

import { MemsearchCLI } from "../cli-wrapper";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";
const SESSIONS_DIR = `${WORKDIR}/.memsearch/sessions`;

async function test() {
  console.log("Testing compaction with 5 sessions...\n");
  
  const cli = new MemsearchCLI();
  
  const isAvailable = await cli.checkAvailability();
  if (!isAvailable) {
    console.error("memsearch not available");
    process.exit(1);
  }
  
  // Get 5 recent session files
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  
  const files = readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => ({ name: f, path: join(SESSIONS_DIR, f), mtime: statSync(join(SESSIONS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5);
  
  console.log(`Found ${files.length} sessions to index`);
  
  // Index them
  for (const file of files) {
    console.log(`Indexing ${file.name}...`);
    try {
      await cli.index(file.path);
      console.log(`  ✓ Indexed`);
    } catch (err) {
      console.error(`  ✗ Failed:`, err);
    }
  }
  
  // Run compaction
  console.log("\nRunning compaction...");
  try {
    const summary = await cli.compact();
    console.log("✓ Compaction complete");
    console.log("\nSummary preview:");
    console.log(summary.slice(0, 500));
  } catch (err) {
    console.error("✗ Compaction failed:", err);
  }
}

test().catch(console.error);
