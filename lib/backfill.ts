import Database from "bun:sqlite";
import { join } from "path";
import { signalSessionActivity } from "./memory-queue";
import { $ } from "bun";

interface SessionInfo {
  id: string;
  project_id: string;
  directory: string;
  title?: string;
  time_updated: number;
  message_count: number;
}

/**
 * Get path to OpenCode SQLite database
 */
function getDatabasePath(): string {
  return join(process.env.HOME || "", ".local", "share", "opencode", "opencode.db");
}

/**
 * Query all sessions from OpenCode DB
 */
async function queryAllSessions(): Promise<SessionInfo[]> {
  const dbPath = getDatabasePath();
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const rows = db.query(
      `SELECT 
        s.id,
        s.project_id,
        s.directory,
        s.title,
        s.time_updated,
        COUNT(m.id) as message_count
       FROM session s
       LEFT JOIN message m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.time_updated DESC`,
    ).all() as any[];
    
    db.close();
    
    return rows.map(row => ({
      id: row.id,
      project_id: row.project_id,
      directory: row.directory,
      title: row.title,
      time_updated: row.time_updated,
      message_count: row.message_count,
    }));
  } catch (err) {
    console.error("[backfill] Failed to query sessions:", err);
    return [];
  }
}

/**
 * Calculate priority based on recency
 */
function calculatePriority(session: SessionInfo): number {
  const now = Date.now();
  const ageMs = now - session.time_updated;
  const hoursOld = ageMs / (1000 * 60 * 60);
  
  if (hoursOld < 24) {
    return 100 - hoursOld; // 100 down to 76
  } else if (hoursOld < 24 * 7) {
    return 50 - (hoursOld - 24); // 50 down
  } else {
    return 10; // Old sessions get low priority
  }
}

/**
 * Queue a single session for processing
 */
async function queueSession(session: SessionInfo): Promise<void> {
  try {
    let projectName = session.project_id;
    try {
      const folderName = session.directory.split("/").pop() || session.project_id;
      const result = await $`cd ${session.directory} && git branch --show-current 2>/dev/null`.quiet();
      const branch = result.text().trim();
      if (branch) {
        projectName = `${folderName}:${branch}`;
      } else {
        projectName = folderName;
      }
    } catch {
      projectName = session.directory.split("/").pop() || session.project_id;
    }
    
    const priority = calculatePriority(session);
    
    await signalSessionActivity(
      'session-created',
      session.id,
      projectName,
      session.directory,
      {
        priority,
        messageCount: session.message_count,
        isBackfill: true,
      }
    );
  } catch (err) {
    console.error(`[backfill] Failed to queue session ${session.id}:`, err);
  }
}

/**
 * Backfill all unprocessed sessions on plugin load
 * Call this once when the plugin first loads
 */
export async function backfillAllSessions(): Promise<{ queued: number; total: number }> {
  console.log("[backfill] Starting backfill of all sessions...");
  
  const sessions = await queryAllSessions();
  console.log(`[backfill] Found ${sessions.length} total sessions`);
  
  if (sessions.length === 0) {
    return { queued: 0, total: 0 };
  }
  
  // Calculate priorities and sort
  const prioritized = sessions
    .map(s => ({ session: s, priority: calculatePriority(s) }))
    .sort((a, b) => b.priority - a.priority);
  
  // Queue all sessions
  let queued = 0;
  for (const { session, priority } of prioritized) {
    await queueSession(session);
    queued++;
    
    if (queued % 10 === 0) {
      console.log(`[backfill] Queued ${queued}/${sessions.length} sessions...`);
    }
  }
  
  console.log(`[backfill] Complete: ${queued} sessions queued`);
  return { queued, total: sessions.length };
}

/**
 * Check for unprocessed sessions (called every 6 hours)
 */
export async function checkForUnprocessedSessions(): Promise<void> {
  console.log("[backfill] Running 6-hour check for unprocessed sessions...");
  
  const result = await backfillAllSessions();
  
  if (result.queued > 0) {
    console.log(`[backfill] Found and queued ${result.queued} unprocessed sessions`);
  } else {
    console.log("[backfill] No unprocessed sessions found");
  }
}
