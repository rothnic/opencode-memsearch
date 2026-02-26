#!/usr/bin/env bun
/**
 * Global Queue Status CLI for memsearch bunqueue
 * 
 * Usage: bun queue-status.ts [options]
 *        memsearch-queue-status (when installed globally)
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";

const queueDbPath = join(homedir(), ".config", "opencode", "memsearch", "queue", "memory.db");

interface Job {
  id: string;
  queue: string;
  state: string;
  priority: number;
  created_at: number;
  run_at: number;
  started_at?: number;
  completed_at?: number;
  attempts: number;
  max_attempts: number;
  unique_key?: string;
  custom_id?: string;
  progress?: number;
  progress_msg?: string;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function showHelp() {
  console.log(`
Global Queue Status - Memsearch Bunqueue

Usage:
  memsearch-queue-status [options]

Options:
  --watch, -w       Watch mode (refresh every 2 seconds)
  --limit, -l N     Show N jobs (default: 10)
  --state, -s S     Filter by state (waiting, active, completed, failed)
  --project, -p P   Filter by project ID
  --help, -h        Show this help

Examples:
  memsearch-queue-status                    # Show summary + recent jobs
  memsearch-queue-status -w                 # Watch mode
  memsearch-queue-status -s active          # Show only active jobs
  memsearch-queue-status -l 20              # Show 20 most recent jobs
  memsearch-queue-status -p bossman-project # Show jobs for specific project
`);
}

function getStats(db: Database) {
  const stats = db.query(`
    SELECT 
      state,
      COUNT(*) as count
    FROM jobs
    GROUP BY state
  `).all() as { state: string; count: number }[];

  const result = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    total: 0
  };

  for (const row of stats) {
    result.total += row.count;
    if (row.state in result) {
      result[row.state as keyof typeof result] = row.count;
    }
  }

  return result;
}

function getJobs(db: Database, limit: number, stateFilter?: string, projectFilter?: string): Job[] {
  let query = `
    SELECT 
      id, queue, state, priority, created_at, run_at, 
      started_at, completed_at, attempts, max_attempts,
      unique_key, custom_id, progress, progress_msg
    FROM jobs
  `;

  const conditions: string[] = [];
  
  if (stateFilter) {
    conditions.push(`state = '${stateFilter}'`);
  }
  
  if (projectFilter) {
    conditions.push(`unique_key LIKE '${projectFilter}:%'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += ` ORDER BY created_at DESC LIMIT ${limit}`;

  return db.query(query).all() as Job[];
}

function getActiveJobs(db: Database): Job[] {
  return db.query(`
    SELECT 
      id, queue, state, priority, created_at, run_at, 
      started_at, completed_at, attempts, max_attempts,
      unique_key, custom_id, progress, progress_msg
    FROM jobs
    WHERE state = 'active'
    ORDER BY started_at DESC
  `).all() as Job[];
}

function displayStatus(db: Database, limit: number, stateFilter?: string, projectFilter?: string) {
  const stats = getStats(db);
  
  console.clear();
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     🔄 Global Queue Status - Memsearch Bunqueue           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // Summary
  console.log("📊 Summary:");
  console.log(`   ⏳ Waiting:   ${stats.waiting.toString().padStart(4)}`);
  console.log(`   🔄 Active:    ${stats.active.toString().padStart(4)}`);
  console.log(`   ✅ Completed: ${stats.completed.toString().padStart(4)}`);
  console.log(`   ❌ Failed:    ${stats.failed.toString().padStart(4)}`);
  console.log(`   📅 Total:     ${stats.total.toString().padStart(4)}`);
  console.log();

  // Active jobs (always show if any)
  const activeJobs = getActiveJobs(db);
  if (activeJobs.length > 0) {
    console.log("🔴 Currently Processing:");
    console.log("─".repeat(80));
    for (const job of activeJobs) {
      const projectId = job.unique_key?.split(":")[0] || "unknown";
      const duration = job.started_at ? Date.now() - job.started_at : 0;
      console.log(`   Project: ${projectId}`);
      console.log(`   Job ID:  ${job.id}`);
      console.log(`   Started: ${formatDate(job.started_at || 0)}`);
      console.log(`   Duration: ${formatDuration(duration)}`);
      if (job.progress !== undefined && job.progress > 0) {
        console.log(`   Progress: ${job.progress}% ${job.progress_msg || ""}`);
      }
      console.log();
    }
    console.log();
  }

  // Recent jobs
  const jobs = getJobs(db, limit, stateFilter, projectFilter);
  if (jobs.length > 0) {
    const title = stateFilter 
      ? `📋 Recent ${stateFilter.charAt(0).toUpperCase() + stateFilter.slice(1)} Jobs`
      : "📋 Recent Jobs";
    console.log(`${title} (last ${limit}):`);
    console.log("─".repeat(80));
    console.log(`${"State".padEnd(12)} ${"Project".padEnd(20)} ${"Created".padEnd(20)} ${"Duration"}`);
    console.log("─".repeat(80));
    
    for (const job of jobs) {
      const projectId = job.unique_key?.split(":")[0] || "unknown";
      const state = job.state.padEnd(12);
      const project = projectId.length > 18 ? projectId.slice(0, 18) + ".." : projectId;
      const created = formatDate(job.created_at);
      
      let duration = "N/A";
      if (job.completed_at && job.created_at) {
        duration = formatDuration(job.completed_at - job.created_at);
      } else if (job.started_at && job.created_at) {
        duration = formatDuration(Date.now() - job.created_at) + " (running)";
      }

      console.log(`${state} ${project.padEnd(20)} ${created.padEnd(20)} ${duration}`);
    }
    console.log();
  }

  // Database info
  console.log("💾 Database:");
  console.log(`   Path: ${queueDbPath}`);
  console.log(`   Updated: ${new Date().toLocaleString()}`);
}

async function watchMode(limit: number, stateFilter?: string, projectFilter?: string) {
  const db = new Database(queueDbPath, { readonly: true });
  
  console.log("👀 Watch mode enabled (Ctrl+C to exit)...");
  
  const run = () => {
    try {
      displayStatus(db, limit, stateFilter, projectFilter);
    } catch (err) {
      console.error("Error reading database:", err);
    }
  };

  run();
  setInterval(run, 2000);
}

function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let watch = false;
  let limit = 10;
  let stateFilter: string | undefined;
  let projectFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "--watch" || arg === "-w") {
      watch = true;
    } else if ((arg === "--limit" || arg === "-l") && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if ((arg === "--state" || arg === "-s") && args[i + 1]) {
      stateFilter = args[++i];
    } else if ((arg === "--project" || arg === "-p") && args[i + 1]) {
      projectFilter = args[++i];
    }
  }

  // Check if database exists
  try {
    const db = new Database(queueDbPath, { readonly: true });
    
    if (watch) {
      watchMode(limit, stateFilter, projectFilter);
    } else {
      displayStatus(db, limit, stateFilter, projectFilter);
      db.close();
    }
  } catch (err) {
    console.error("❌ Error accessing queue database:");
    console.error(`   Path: ${queueDbPath}`);
    console.error(`   Error: ${err}`);
    console.error();
    console.error("The queue database may not exist yet.");
    console.error("Start OpenCode with the memsearch plugin to initialize it.");
    process.exit(1);
  }
}

main();
