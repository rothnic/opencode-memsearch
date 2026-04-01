#!/usr/bin/env bun
import { MemsearchCLI, MemsearchTimeoutError } from "../cli-wrapper";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";
const MEMORY_DIR = join(WORKDIR, "memory");
const STATE_FILE = join(WORKDIR, ".memsearch", "compaction-state.json");
const SESSIONS_DIR = join(WORKDIR, ".memsearch", "sessions");

interface CompactionState {
  lastCompactionTime: string;
  compactedChunkHashes: string[];
  dailySummaries: Record<string, string>;
}

interface CompactionResult {
  compacted: boolean;
  summaryPath?: string;
  chunksCompacted: number;
  newChunks: number;
  error?: string;
}

function loadState(): CompactionState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    } catch {
      console.warn("   Could not load state, starting fresh");
    }
  }
  return {
    lastCompactionTime: new Date(0).toISOString(),
    compactedChunkHashes: [],
    dailySummaries: {}
  };
}

function saveState(state: CompactionState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getSessionDate(sessionFile: string): string | null {
  try {
    const stats = statSync(join(SESSIONS_DIR, sessionFile));
    return stats.mtime.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function getChunksForDate(date: string): string[] {
  const sessionFiles: string[] = [];
  const files = readdirSync(SESSIONS_DIR);
  for (const filename of files) {
    if (filename.endsWith(".md")) {
      const sessionDate = getSessionDate(filename);
      if (sessionDate === date) {
        sessionFiles.push(filename);
      }
    }
  }
  return sessionFiles;
}

async function runIncrementalCompaction(): Promise<CompactionResult> {
  const cli = new MemsearchCLI(undefined, 120000);
  const state = loadState();
  
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║     Incremental Memsearch Compaction                     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log(`📅 Last compaction: ${state.lastCompactionTime}\n`);

  const isAvailable = await cli.checkAvailability();
  if (!isAvailable) {
    return { compacted: false, chunksCompacted: 0, newChunks: 0, error: "memsearch CLI not available" };
  }

  console.log("📊 Checking index stats...");
  const stats = await cli.stats();
  console.log(`   Total indexed chunks: ${stats.documentCount}\n`);

  if (stats.documentCount === 0) {
    console.log("   No indexed content to compact\n");
    return { compacted: false, chunksCompacted: 0, newChunks: 0 };
  }

  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0];
  const summaryPath = join(MEMORY_DIR, `${today}.md`);

  if (state.dailySummaries[today] && existsSync(summaryPath)) {
    console.log(`⚠️  Already compacted today (${today})`);
    console.log(`   Existing summary: ${summaryPath}\n`);
    console.log("   To force re-compaction, delete the state file:");
    console.log(`   rm ${STATE_FILE}\n`);
    return { compacted: false, chunksCompacted: 0, newChunks: 0, error: "Already compacted today" };
  }

  console.log("🗜️  Running compaction...");
  console.log(`   Target: ${summaryPath}\n`);

  try {
    const summary = await cli.compact();
    
    console.log("   ✓ Compaction complete\n");
    console.log("   Summary preview (first 500 chars):");
    console.log("   " + summary.slice(0, 500).replace(/\n/g, "\n   "));
    console.log("\n");

    state.lastCompactionTime = new Date().toISOString();
    state.dailySummaries[today] = summaryPath;
    saveState(state);

    console.log("📚 Indexing daily summary...");
    if (existsSync(summaryPath)) {
      await cli.index(summaryPath);
      console.log(`   ✓ Indexed ${summaryPath}\n`);
    }

    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║     Compaction Complete                                   ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log(`Date: ${today}`);
    console.log(`Summary: ${summaryPath}`);
    console.log(`Total chunks in index: ${stats.documentCount}`);

    return {
      compacted: true,
      summaryPath,
      chunksCompacted: stats.documentCount,
      newChunks: stats.documentCount
    };

  } catch (err) {
    if (err instanceof MemsearchTimeoutError) {
      return {
        compacted: false,
        chunksCompacted: 0,
        newChunks: 0,
        error: "Compaction timeout (2 minutes exceeded)"
      };
    }
    return {
      compacted: false,
      chunksCompacted: 0,
      newChunks: 0,
      error: String(err)
    };
  }
}

async function backfillDate(date: string): Promise<CompactionResult> {
  const cli = new MemsearchCLI(undefined, 120000);
  
  console.log(`\n📅 Backfilling date: ${date}\n`);
  
  const summaryPath = join(MEMORY_DIR, `${date}.md`);
  
  if (existsSync(summaryPath)) {
    console.log(`⚠️  Summary already exists for ${date}: ${summaryPath}`);
    return { compacted: false, chunksCompacted: 0, newChunks: 0, error: "Summary already exists" };
  }

  try {
    const sessionFiles = getChunksForDate(date);
    
    if (sessionFiles.length === 0) {
      console.log(`   No sessions found for ${date}\n`);
      return { compacted: false, chunksCompacted: 0, newChunks: 0 };
    }

    console.log(`   Found ${sessionFiles.length} session files\n`);

    const summary = await cli.compact();
    
    console.log(`   ✓ Backfill complete for ${date}\n`);

    return {
      compacted: true,
      summaryPath,
      chunksCompacted: sessionFiles.length,
      newChunks: sessionFiles.length
    };

  } catch (err) {
    return {
      compacted: false,
      chunksCompacted: 0,
      newChunks: 0,
      error: String(err)
    };
  }
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Incremental Memsearch Compaction

Usage:
  bun run scripts/incremental-compaction.ts [options]

Options:
  --backfill DATE    Backfill a specific date (YYYY-MM-DD format)
  --backfill-range START END  Backfill date range
  --force            Force compaction even if already done today
  --help, -h         Show this help

Examples:
  bun run scripts/incremental-compaction.ts
  bun run scripts/incremental-compaction.ts --backfill 2026-02-15
  bun run scripts/incremental-compaction.ts --backfill-range 2026-02-01 2026-02-28
  bun run scripts/incremental-compaction.ts --force
`);
  process.exit(0);
}

if (args.includes("--force")) {
  if (existsSync(STATE_FILE)) {
    console.log("🗑️  Removing state file to force re-compaction\n");
    Bun.file(STATE_FILE).delete();
  }
}

const backfillIndex = args.indexOf("--backfill");
if (backfillIndex !== -1 && args[backfillIndex + 1]) {
  const date = args[backfillIndex + 1];
  backfillDate(date)
    .then(result => {
      if (result.error) {
        console.error("\n❌ Backfill failed:", result.error);
        process.exit(1);
      }
      console.log("\n✅ Backfill complete");
      process.exit(0);
    })
    .catch(err => {
      console.error("\n💥 Fatal error:", err);
      process.exit(1);
    });
} else {
  runIncrementalCompaction()
    .then(result => {
      if (result.error && !result.error.includes("Already compacted")) {
        console.error("\n❌ Compaction failed:", result.error);
        process.exit(1);
      }
      console.log("\n✅ Done");
      process.exit(0);
    })
    .catch(err => {
      console.error("\n💥 Fatal error:", err);
      process.exit(1);
    });
}

export { runIncrementalCompaction, backfillDate };
