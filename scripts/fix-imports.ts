#!/usr/bin/env bun
/**
 * Script to fix import paths after lib/ directory reorganization
 * Run: bun fix-imports.ts
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";

// Mapping of incorrect imports to correct paths
const importFixes: Record<string, Record<string, string>> = {
  // lib/queue/ files
  "lib/queue/memory-queue.ts": {
    '"../state"': '"../../state"',
  },
  "lib/queue/backfill.ts": {
    '"./session-generator"': '"../processing/session-generator"',
  },
  
  // lib/processing/ files  
  "lib/processing/session-indexer.ts": {
    'import("../cli-wrapper")': 'import("../../cli-wrapper")',
  },
  
  // lib/types/ files
  "lib/types/config-yaml.ts": {
    '"../types"': '"../../types"',
    'import("../config").loadConfig': 'import("../../config").loadConfig',
  },
  
  // lib/search/ files
  "lib/search/duplicate-detector.ts": {
    '"./config-yaml"': '"../types/config-yaml"',
  },
  "lib/search/filter-builder.ts": {
    '"./config-yaml.js"': '"../types/config-yaml.js"',
  },
  
  // lib/scheduler/ files
  "lib/scheduler/unified-scheduler.ts": {
    '"./memory-type-config"': '"../types/memory-type-config"',
    '"./memory-types"': '"../types/memory-types"',
    '"./memory-queue"': '"../queue/memory-queue"',
  },
  "lib/scheduler/config-reprocessing-service.ts": {
    '"./memory-type-config"': '"../types/memory-type-config"',
    '"./memory-queue"': '"../queue/memory-queue"',
    '"./session-processor-agent"': '"../processing/session-processor-agent"',
    '"./config-yaml"': '"../types/config-yaml"',
  },
  "lib/scheduler/memory-extraction-scheduler.ts": {
    '"./memory-type-config"': '"../types/memory-type-config"',
    '"./memory-types"': '"../types/memory-types"',
    '"./session-indexer"': '"../processing/session-indexer"',
    'import("./memory-queue")': 'import("../queue/memory-queue")',
  },
};

let totalFiles = 0;
let totalChanges = 0;

for (const [filePath, replacements] of Object.entries(importFixes)) {
  const fullPath = join(process.cwd(), filePath);
  
  try {
    let content = readFileSync(fullPath, "utf-8");
    let changes = 0;
    
    for (const [oldImport, newImport] of Object.entries(replacements)) {
      const regex = new RegExp(oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g");
      const matches = content.match(regex);
      if (matches) {
        content = content.replace(regex, newImport);
        changes += matches.length;
      }
    }
    
    if (changes > 0) {
      writeFileSync(fullPath, content);
      console.log(`✅ Fixed ${changes} import(s) in ${filePath}`);
      totalFiles++;
      totalChanges += changes;
    }
  } catch (err) {
    console.error(`❌ Error processing ${filePath}:`, err);
  }
}

console.log(`\n📊 Summary: Fixed ${totalChanges} import(s) across ${totalFiles} file(s)`);
