#!/usr/bin/env bun
import { createConfigMonitor } from "../src/scheduler/memory-config-monitor";

const MEMORY_DIR = "/Users/nroth/workspace/opencode-memsearch/memory";

async function test() {
  console.log("Testing config monitor...\n");

  const monitor = createConfigMonitor({
    memoryDir: MEMORY_DIR,
    pollIntervalMs: 5000,
    onChange: (event) => {
      console.log("Config change detected:", event);
    },
  });

  await monitor.initialize();

  console.log("\nTracked configs:", monitor.getTrackedConfigs());

  monitor.stop();
  console.log("\nTest complete!");
}

test().catch(console.error);
