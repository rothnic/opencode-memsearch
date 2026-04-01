import Database from "bun:sqlite";
import { join } from "path";
import { $ } from "bun";

const queueDbPath = join(
  process.env.HOME || "",
  ".config",
  "opencode",
  "memsearch",
  "queue",
  "memory.db"
);

interface JobRecord {
  id: string;
  name: string;
  data: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  attempts: number;
  returnvalue?: string;
  failedReason?: string;
}

async function checkQueueDatabase() {
  console.log("🔍 Deep Queue Diagnostics\n");
  console.log("=".repeat(60));
  
  try {
    const db = new Database(queueDbPath, { readonly: true });
    
    // Get job counts by status
    console.log("\n📊 Job Status Breakdown:\n");
    const statusCounts = db.query(`
      SELECT 
        CASE 
          WHEN finishedOn IS NOT NULL AND failedReason IS NULL THEN 'completed'
          WHEN failedReason IS NOT NULL THEN 'failed'
          WHEN processedOn IS NOT NULL AND finishedOn IS NULL THEN 'active'
          ELSE 'waiting'
        END as status,
        COUNT(*) as count
      FROM job
      GROUP BY status
    `).all() as { status: string; count: number }[];
    
    for (const row of statusCounts) {
      console.log(`  ${row.status}: ${row.count}`);
    }
    
    // Get recent completed jobs with details
    console.log("\n\n📋 Recent Completed Jobs (last 10):\n");
    const completedJobs = db.query(`
      SELECT id, name, data, finishedOn, returnvalue
      FROM job
      WHERE finishedOn IS NOT NULL AND failedReason IS NULL
      ORDER BY finishedOn DESC
      LIMIT 10
    `).all() as any[];
    
    for (const job of completedJobs) {
      const data = JSON.parse(job.data || '{}');
      const result = job.returnvalue ? JSON.parse(job.returnvalue) : null;
      console.log(`  Job: ${job.name}`);
      console.log(`    Type: ${data.type || 'unknown'}`);
      console.log(`    Project: ${data.projectId || 'unknown'}`);
      console.log(`    Priority: ${data.priority || 'default'}`);
      console.log(`    Result: ${result ? (result.success ? '✅ success' : '❌ failed') : 'unknown'}`);
      console.log();
    }
    
    // Get failed jobs
    console.log("\n❌ Recent Failed Jobs (last 5):\n");
    const failedJobs = db.query(`
      SELECT id, name, data, failedReason
      FROM job
      WHERE failedReason IS NOT NULL
      ORDER BY finishedOn DESC
      LIMIT 5
    `).all() as any[];
    
    for (const job of failedJobs) {
      const data = JSON.parse(job.data || '{}');
      console.log(`  Job: ${job.name}`);
      console.log(`    Type: ${data.type || 'unknown'}`);
      console.log(`    Error: ${job.failedReason?.substring(0, 100)}...`);
      console.log();
    }
    
    // Get job type distribution
    console.log("\n📈 Job Type Distribution:\n");
    const typeDist = db.query(`
      SELECT 
        json_extract(data, '$.type') as job_type,
        COUNT(*) as count
      FROM job
      GROUP BY job_type
      ORDER BY count DESC
    `).all() as { job_type: string; count: number }[];
    
    for (const row of typeDist) {
      console.log(`  ${row.job_type || 'unknown'}: ${row.count}`);
    }
    
    // Get project distribution
    console.log("\n📁 Project Distribution:\n");
    const projectDist = db.query(`
      SELECT 
        json_extract(data, '$.projectId') as project,
        COUNT(*) as count
      FROM job
      GROUP BY project
      ORDER BY count DESC
      LIMIT 10
    `).all() as { project: string; count: number }[];
    
    for (const row of projectDist) {
      console.log(`  ${row.project || 'unknown'}: ${row.count}`);
    }
    
    db.close();
    
  } catch (err) {
    console.error("Error reading queue database:", err);
  }
}

async function checkMemsearchData() {
  console.log("\n\n" + "=".repeat(60));
  console.log("\n🔎 Memsearch Data Verification\n");
  
  try {
    // Check if memsearch is available
    const version = await $`memsearch version 2>/dev/null`.text().catch(() => null);
    if (!version) {
      console.log("❌ memsearch CLI not available");
      return;
    }
    console.log(`✅ memsearch version: ${version.trim()}`);
    
    // Get stats
    console.log("\n📊 Collection Stats:\n");
    try {
      const stats = await $`memsearch stats --json 2>/dev/null`.json();
      console.log(`  Documents: ${stats.documentCount || 0}`);
      console.log(`  Chunks: ${stats.chunkCount || 0}`);
      console.log(`  Collections: ${(stats.collections || []).length}`);
      
      if (stats.collections && stats.collections.length > 0) {
        console.log("\n  Collections:");
        for (const coll of stats.collections) {
          console.log(`    - ${coll.name}: ${coll.documentCount || 0} docs`);
        }
      }
    } catch (err) {
      console.log("  Could not get stats:", err);
    }
    
    // Test search
    console.log("\n🔍 Test Search for 'session':\n");
    try {
      const searchResult = await $`memsearch search "session" --json --top-k 3 2>/dev/null`.json();
      if (searchResult.results && searchResult.results.length > 0) {
        console.log(`  Found ${searchResult.results.length} results:\n`);
        for (const result of searchResult.results.slice(0, 3)) {
          console.log(`  Score: ${result.score?.toFixed(3) || 'N/A'}`);
          console.log(`  Source: ${result.metadata?.source || 'unknown'}`);
          console.log(`  Preview: ${result.preview?.substring(0, 100) || 'N/A'}...`);
          console.log();
        }
      } else {
        console.log("  No results found");
      }
    } catch (err) {
      console.log("  Search failed:", err);
    }
    
  } catch (err) {
    console.error("Error checking memsearch:", err);
  }
}

async function checkMarkdownFiles() {
  console.log("\n" + "=".repeat(60));
  console.log("\n📝 Generated Markdown Files\n");
  
  // Check common locations
  const searchPaths = [
    "/tmp/test-memsearch/.memsearch/sessions",
    "/tmp/test-memsearch-priority/.memsearch/sessions",
  ];
  
  for (const dir of searchPaths) {
    try {
      const files = await $`ls -la ${dir} 2>/dev/null || echo "Directory not found"`.text();
      console.log(`\n${dir}:`);
      console.log(files);
    } catch {
      console.log(`\n${dir}: Not accessible`);
    }
  }
}

async function main() {
  await checkQueueDatabase();
  await checkMemsearchData();
  await checkMarkdownFiles();
  
  console.log("\n" + "=".repeat(60));
  console.log("\n✅ Diagnostics Complete\n");
}

main().catch(console.error);
