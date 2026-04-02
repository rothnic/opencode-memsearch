#!/usr/bin/env bun
/**
 * Test script for memory extraction - processes only 5 most recent sessions
 * with rate limiting to avoid overwhelming resources
 */

import { SimpleSessionProcessorAgent } from "../src/processing/session-processor-agent";
import { createMemoryTypeRegistry } from "../src/types/memory-types";
import { loadSessionMetadataFromDB, loadMessagesFromDB } from "../src/processing/session-indexer";
import Database from "bun:sqlite";
import path from "path";
import os from "os";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";
const DB_PATH = path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");

// Configuration for controlled testing
// Uses 9router (OpenRouter-compatible endpoint)
const CONFIG = {
  maxSessions: 5,
  delayBetweenSessions: 3000,
  model: "openai/free",  // Use free model via 9router
  maxTokens: 1500,
  temperature: 0.3,
  // 9router configuration - get API key from environment
  baseUrl: "https://9router.on.nickroth.com/v1",
  apiKey: process.env.NINE_ROUTER_API_KEY || "",
};

async function getRecentSessions(limit: number): Promise<string[]> {
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    const rows = db.query(
      `SELECT id FROM session 
       WHERE directory LIKE ? 
       ORDER BY time_updated DESC 
       LIMIT ?`
    ).all(`${WORKDIR}%`, limit) as { id: string }[];
    
    return rows.map(r => r.id);
  } finally {
    db.close();
  }
}

async function loadSessionWithHistory(sessionId: string) {
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    const metadata = loadSessionMetadataFromDB(sessionId, db);
    if (!metadata) return null;
    
    const history = loadMessagesFromDB(sessionId, db);
    
    return {
      metadata,
      history,
    };
  } finally {
    db.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=".repeat(60));
  console.log("Memory Extraction Test - Limited Batch");
  console.log("=".repeat(60));
  console.log(`Configuration:`);
  console.log(`  Max sessions: ${CONFIG.maxSessions}`);
  console.log(`  Delay between: ${CONFIG.delayBetweenSessions}ms`);
  console.log(`  Model: ${CONFIG.model}`);
  console.log(`  Max tokens: ${CONFIG.maxTokens}`);
  console.log("=".repeat(60));
  
  // Get recent sessions
  console.log("\n📋 Fetching recent sessions...");
  const sessionIds = await getRecentSessions(CONFIG.maxSessions);
  console.log(`Found ${sessionIds.length} sessions to process`);
  
  if (sessionIds.length === 0) {
    console.log("❌ No sessions found");
    process.exit(1);
  }
  
  // Load memory type registry
  console.log("\n📚 Loading memory type configurations...");
  const registry = createMemoryTypeRegistry(WORKDIR);
  const memoryTypes = registry.getAll().filter(mt => mt.enabled);
  
  console.log(`Loaded ${memoryTypes.length} memory types:`);
  for (const mt of memoryTypes) {
    console.log(`  - ${mt.name} (${mt.collection})`);
  }
  
  // Create agent with 9router configuration
  const agent = new SimpleSessionProcessorAgent({
    model: CONFIG.model,
    maxTokens: CONFIG.maxTokens,
    temperature: CONFIG.temperature,
    delayMs: CONFIG.delayBetweenSessions,
    outputBasePath: WORKDIR,
    baseUrl: CONFIG.baseUrl,
    apiKey: CONFIG.apiKey,
  });
  
  // Process sessions
  console.log("\n🚀 Starting extraction...\n");
  
  for (let i = 0; i < sessionIds.length; i++) {
    const sessionId = sessionIds[i];
    console.log(`\n[${i + 1}/${sessionIds.length}] Processing ${sessionId}...`);
    
    const session = await loadSessionWithHistory(sessionId);
    if (!session) {
      console.log(`  ⚠️  Could not load session ${sessionId}`);
      continue;
    }
    
    console.log(`  📝 Session: "${session.metadata.title}"`);
    console.log(`  💬 Messages: ${session.history.length}`);
    
    const startTime = Date.now();
    const result = await agent.analyze({
      session,
      memoryTypes,
      workdir: WORKDIR,
    });
    const duration = Date.now() - startTime;
    
    if (result.ok) {
      console.log(`  ✅ Success in ${duration}ms`);
      console.log(`  📦 Extracted: ${result.stats.totalExtracts} memories`);
      if (result.stats.totalExtracts > 0) {
        console.log(`  📊 By type:`);
        for (const [type, count] of Object.entries(result.stats.perType)) {
          console.log(`     - ${type}: ${count}`);
        }
      }
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
    
    // Rate limiting delay
    if (i < sessionIds.length - 1) {
      console.log(`  ⏳ Waiting ${CONFIG.delayBetweenSessions}ms before next session...`);
      await sleep(CONFIG.delayBetweenSessions);
    }
  }
  
  // Print final stats
  const stats = agent.getStats();
  console.log("\n" + "=".repeat(60));
  console.log("📊 Final Statistics");
  console.log("=".repeat(60));
  console.log(`Sessions processed: ${stats.sessionsProcessed}`);
  console.log(`Sessions failed: ${stats.sessionsFailed}`);
  console.log(`Memories extracted: ${stats.memoriesExtracted}`);
  console.log(`Memories written: ${stats.memoriesWritten}`);
  console.log(`Total tokens used: ${stats.totalTokensUsed}`);
  
  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors (${stats.errors.length}):`);
    for (const err of stats.errors.slice(0, 3)) {
      console.log(`  - ${err.sessionId}: ${err.error}`);
    }
  }
  
  console.log("\n✨ Test complete!");
  console.log(`💾 Memories saved to: ${path.join(WORKDIR, "memory")}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
