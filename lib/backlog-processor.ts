import { signalSessionActivity } from './memory-queue';
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import Database from "bun:sqlite";

interface SessionInfo {
  id: string;
  project_id: string;
  created_at: number;
  title?: string;
}

interface BacklogJob {
  sessionId: string;
  projectId: string;
  directory: string;
  priority: number;
  age: number; // in days
}

// Config for backlog processing
const BACKLOG_CONFIG = {
  maxSessionsPerBatch: 5,
  processingDelayMs: 2000,
  weights: {
    recent: 10,      // < 24 hours
    medium: 5,       // < 7 days  
    old: 1,          // > 7 days
  },
  thresholds: {
    recent: 1,       // 1 day
    medium: 7,       // 7 days
  }
};

/**
 * Calculate priority based on session age
 */
function calculatePriority(createdAt: number): number {
  const now = Date.now();
  const ageMs = now - createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  if (ageDays <= BACKLOG_CONFIG.thresholds.recent) {
    return BACKLOG_CONFIG.weights.recent;
  } else if (ageDays <= BACKLOG_CONFIG.thresholds.medium) {
    return BACKLOG_CONFIG.weights.medium;
  } else {
    return BACKLOG_CONFIG.weights.old;
  }
}

/**
 * Get all sessions from OpenCode database for a project
 */
async function getProjectSessions(projectId: string): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = [];
  
  // Try to find OpenCode database
  const dbPaths = [
    join(process.env.HOME || '', '.opencode', 'state.db'),
    join(process.env.HOME || '', '.config', 'opencode', 'state.db'),
  ];
  
  for (const dbPath of dbPaths) {
    if (!existsSync(dbPath)) continue;
    
    try {
      const db = new Database(dbPath, { readonly: true });
      
      // Query sessions for this project
      const rows = db.query(
        `SELECT id, project_id, created_at, title 
         FROM sessions 
         WHERE project_id = ? 
         ORDER BY created_at DESC`
      ).all(projectId) as any[];
      
      db.close();
      
      for (const row of rows) {
        sessions.push({
          id: row.id,
          project_id: row.project_id,
          created_at: row.created_at,
          title: row.title,
        });
      }
      
      break; // Found and processed
    } catch (err) {
      console.error(`[memsearch] Failed to query ${dbPath}:`, err);
    }
  }
  
  return sessions;
}

/**
 * Get already indexed sessions from Milvus/memsearch
 */
async function getIndexedSessions(projectId: string): Promise<Set<string>> {
  const indexed = new Set<string>();
  
  try {
    // Query memsearch for indexed sessions in this project
    const result = await $`memsearch query --project ${projectId} --format json`.quiet().json();
    
    if (result?.sessions) {
      for (const session of result.sessions) {
        indexed.add(session.id);
      }
    }
  } catch {
    // memsearch query might fail if no sessions indexed yet
  }
  
  return indexed;
}

/**
 * Detect and queue backlog sessions for a project
 * 
 * This should be called ONCE when first discovering a project
 * (on first session.created event)
 */
export async function detectAndQueueBacklog(
  projectId: string,
  directory: string
): Promise<{ queued: number; total: number }> {
  console.log(`[memsearch] Detecting backlog for ${projectId}...`);
  
  // Get all sessions for this project
  const allSessions = await getProjectSessions(projectId);
  console.log(`[memsearch] Found ${allSessions.length} total sessions in database`);
  
  if (allSessions.length === 0) {
    return { queued: 0, total: 0 };
  }
  
  // Get already indexed sessions
  const indexedSessions = await getIndexedSessions(projectId);
  console.log(`[memsearch] ${indexedSessions.size} sessions already indexed`);
  
  // Calculate backlog
  const backlog: BacklogJob[] = [];
  
  for (const session of allSessions) {
    if (indexedSessions.has(session.id)) {
      continue; // Skip already indexed
    }
    
    const priority = calculatePriority(session.created_at);
    const ageMs = Date.now() - session.created_at;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    backlog.push({
      sessionId: session.id,
      projectId,
      directory,
      priority,
      age: ageDays,
    });
  }
  
  console.log(`[memsearch] Backlog: ${backlog.length} sessions need indexing`);
  
  if (backlog.length === 0) {
    return { queued: 0, total: allSessions.length };
  }
  
  // Sort by priority (highest first), then by age (newest first)
  backlog.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.age - b.age;
  });
  
  // Queue sessions with rate limiting
  let queued = 0;
  
  for (let i = 0; i < backlog.length; i++) {
    const job = backlog[i];
    
    try {
      // Add delay every N sessions to avoid overwhelming
      if (i > 0 && i % BACKLOG_CONFIG.maxSessionsPerBatch === 0) {
        console.log(`[memsearch] Pausing backlog processing after ${i} sessions...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second pause
      }
      
      // Small delay between each session
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, BACKLOG_CONFIG.processingDelayMs));
      }
      
      // Queue the session
      await signalSessionActivity(
        'session-created',
        job.sessionId,
        projectId,
        directory,
        { 
          isBacklog: true,
          age: job.age,
          priority: job.priority,
        }
      );
      
      queued++;
      
      if (queued % 10 === 0) {
        console.log(`[memsearch] Queued ${queued}/${backlog.length} backlog sessions...`);
      }
      
    } catch (err) {
      console.error(`[memsearch] Failed to queue session ${job.sessionId}:`, err);
    }
  }
  
  console.log(`[memsearch] Backlog processing complete: ${queued} sessions queued`);
  
  return { queued, total: allSessions.length };
}

/**
 * Check if backlog has been processed for this project
 */
const backlogProcessed = new Set<string>();

export function hasBacklogBeenProcessed(projectId: string): boolean {
  return backlogProcessed.has(projectId);
}

export function markBacklogProcessed(projectId: string): void {
  backlogProcessed.add(projectId);
}
