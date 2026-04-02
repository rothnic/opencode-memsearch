import { signalSessionActivity } from "../lib/queue/memory-queue";
import { readdirSync } from "fs";
import { join } from "path";

// Find all projects with session files
const baseDir = "/Users/nroth/workspace";
const projects: string[] = [];

// Check main workspace
for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const sessionsDir = join(baseDir, entry.name, ".memsearch", "sessions");
    try {
      const files = readdirSync(sessionsDir);
      if (files.length > 0 && files.some(f => f.endsWith('.md'))) {
        projects.push(entry.name);
      }
    } catch {
      // Directory doesn't exist
    }
  }
}

console.log(`Found ${projects.length} projects with sessions:\n`);

// Add each project to queue for indexing
let added = 0;
for (const project of projects) {
  const projectDir = join(baseDir, project);
  const sessionId = `index-${project}-${Date.now()}`;
  
  await signalSessionActivity(
    "manual-index",
    sessionId,
    project,
    projectDir,
    { directory: join(projectDir, ".memsearch", "sessions"), recursive: true }
  );
  
  added++;
  console.log(`  ✅ Queued: ${project}`);
}

console.log(`\n✅ Added ${added} projects to indexing queue`);
