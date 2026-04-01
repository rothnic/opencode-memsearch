import Database from "bun:sqlite";
import { join } from "path";
import { existsSync, readdirSync } from "fs";

const dbPath = join(
  process.env.HOME || "",
  ".local",
  "share",
  "opencode",
  "opencode.db"
);

console.log("🔍 Checking All Projects with Sessions\n");
console.log("=".repeat(70));

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get all unique project directories from sessions
  const projects = db.query(`
    SELECT DISTINCT directory, COUNT(*) as session_count
    FROM session
    WHERE time_updated > ?
    GROUP BY directory
    ORDER BY session_count DESC
  `).all(Date.now() - 30 * 24 * 60 * 60 * 1000) as { directory: string; session_count: number }[];
  
  console.log(`\nFound ${projects.length} projects with sessions in last 30 days:\n`);
  
  let totalSessions = 0;
  let withMarkdown = 0;
  let withoutMarkdown = 0;
  
  for (const project of projects) {
    const dirName = project.directory.split('/').pop();
    const sessionsDir = join(project.directory, ".memsearch", "sessions");
    const hasMarkdown = existsSync(sessionsDir);
    let fileCount = 0;
    
    if (hasMarkdown) {
      fileCount = readdirSync(sessionsDir).filter(f => f.endsWith('.md')).length;
      withMarkdown++;
    } else {
      withoutMarkdown++;
    }
    
    totalSessions += project.session_count;
    const status = hasMarkdown ? `✅ ${fileCount} files` : '❌ no .memsearch';
    console.log(`   ${dirName}: ${project.session_count} sessions - ${status}`);
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total projects: ${projects.length}`);
  console.log(`   Total sessions: ${totalSessions}`);
  console.log(`   With markdown: ${withMarkdown}`);
  console.log(`   Without markdown: ${withoutMarkdown}`);
  
  // List projects without markdown
  if (withoutMarkdown > 0) {
    console.log(`\n⚠️  Projects missing markdown files:`);
    for (const project of projects) {
      const sessionsDir = join(project.directory, ".memsearch", "sessions");
      if (!existsSync(sessionsDir)) {
        console.log(`   - ${project.directory}`);
      }
    }
  }
  
  db.close();
  
} catch (err) {
  console.error("Error:", err);
}

console.log("\n" + "=".repeat(70) + "\n");
