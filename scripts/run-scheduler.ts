#!/usr/bin/env bun
import { createScheduler } from "../src/scheduler/memory-extraction-scheduler";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";

const scheduler = createScheduler(WORKDIR, {
  checkIntervalMs: 5 * 60 * 1000,
  maxSessionsPerCheck: 10,
  maxQueueDepth: 50,
});

process.on("SIGINT", () => {
  scheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  scheduler.stop();
  process.exit(0);
});

console.log("Starting memory extraction scheduler...");
console.log("Runs every 5 minutes, max 10 sessions per run, pauses if queue > 50");
scheduler.start(WORKDIR);
