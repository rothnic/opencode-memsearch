#!/usr/bin/env bun
import { createScheduler } from "../src/scheduler/memory-extraction-scheduler";
import { createConfigMonitor } from "../src/scheduler/memory-config-monitor";
import { createReprocessingService } from "../src/scheduler/config-reprocessing-service";

const WORKDIR = "/Users/nroth/workspace/opencode-memsearch";
const MEMORY_DIR = `${WORKDIR}/memory`;

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Memory Extraction System with Config Monitoring        ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scheduler = createScheduler(WORKDIR, {
    checkIntervalMs: 5 * 60 * 1000,
    maxSessionsPerCheck: 10,
    maxQueueDepth: 50,
  });

  const reprocessor = createReprocessingService(WORKDIR);

  const configMonitor = createConfigMonitor({
    memoryDir: MEMORY_DIR,
    pollIntervalMs: 10000,
    onChange: async (event) => {
      await reprocessor.handleConfigChange(event);
    },
  });

  process.on("SIGINT", () => {
    console.log("\n\nShutting down...");
    scheduler.stop();
    configMonitor.stop();
    reprocessor.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\nShutting down...");
    scheduler.stop();
    configMonitor.stop();
    reprocessor.close();
    process.exit(0);
  });

  console.log("🚀 Starting services...\n");

  await configMonitor.initialize();
  await configMonitor.start();

  console.log("\n📅 Starting scheduler (runs every 5 minutes)...\n");
  await scheduler.start(WORKDIR);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
