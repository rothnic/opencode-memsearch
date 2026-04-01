#!/usr/bin/env bun
/**
 * Nightly compaction job for memsearch
 * 
 * Workflow:
 * 1. Check if there's indexed content to compact
 * 2. Run memsearch compact to generate daily summary
 * 3. Index the summary file
 * 
 * Note: Sessions should already be indexed by the memory-worker.
 * Compaction summarizes what's already indexed, not re-index everything.
 */

import { MemsearchCLI, MemsearchTimeoutError } from "../lib/cli-wrapper";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";
const MEMORY_DIR = join(WORKDIR, "memory");

interface CompactionResult {
  compacted: boolean;
  summaryPath?: string;
  chunksCompacted?: number;
  error?: string;
}

async function runNightlyCompaction(): Promise<CompactionResult> {
  const cli = new MemsearchCLI(undefined, 120000); // 2 minute timeout
  
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║     Nightly Memsearch Compaction Job                     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Check memsearch availability
  const isAvailable = await cli.checkAvailability();
  if (!isAvailable) {
    return {
      compacted: false,
      error: "memsearch CLI not available"
    };
  }

  // Check stats before compaction
  console.log("📊 Checking index stats...");
  try {
    const stats = await cli.stats();
    console.log(`   Total indexed chunks: ${stats.documentCount}\n`);
    
    if (stats.documentCount === 0) {
      console.log("   No indexed content to compact\n");
      return { compacted: false };
    }
  } catch (err) {
    console.warn("   Could not get stats, continuing anyway\n");
  }

  // Ensure memory directory exists
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }

  // Run compaction
  console.log("🗜️  Running compaction...");
  let compacted = false;
  let summaryPath: string | undefined;
  let chunksCompacted = 0;

  try {
    const today = new Date().toISOString().split("T")[0];
    summaryPath = join(MEMORY_DIR, `${today}.md`);
    
    console.log(`   Compacting all indexed chunks...`);
    console.log(`   Output will be appended to memory/${today}.md`);
    
    const summary = await cli.compact();
    
    compacted = true;
    chunksCompacted = summary.split("\n").length; // Rough estimate
    
    console.log(`   ✓ Compaction complete\n`);
    console.log("   Summary preview (first 500 chars):");
    console.log("   " + summary.slice(0, 500).replace(/\n/g, "\n   "));
    console.log("\n");

    // Index the summary file
    console.log("📚 Indexing daily summary...");
    if (existsSync(summaryPath)) {
      await cli.index(summaryPath);
      console.log(`   ✓ Indexed ${summaryPath}\n`);
    } else {
      console.log(`   ⚠ Summary file not found at ${summaryPath}\n`);
    }

  } catch (err) {
    if (err instanceof MemsearchTimeoutError) {
      console.error("   ✗ Compaction timed out (2 minutes exceeded)");
      return {
        compacted: false,
        error: "Compaction timeout - too many chunks to process"
      };
    }
    console.error("   ✗ Compaction failed:", err);
    return {
      compacted: false,
      error: String(err)
    };
  }

  // Summary
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║     Compaction Complete                                   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`Compacted: ${compacted}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(`Chunks processed: ~${chunksCompacted}`);

  return {
    compacted,
    summaryPath,
    chunksCompacted
  };
}

// Run if called directly
if (import.meta.main) {
  runNightlyCompaction()
    .then(result => {
      if (result.error) {
        console.error("\n❌ Job failed:", result.error);
        process.exit(1);
      }
      console.log("\n✅ Job completed successfully");
      process.exit(0);
    })
    .catch(err => {
      console.error("\n💥 Fatal error:", err);
      process.exit(1);
    });
}

export { runNightlyCompaction };
