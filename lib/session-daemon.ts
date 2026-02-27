import Database from "bun:sqlite";
import { join } from "path";
import { signalSessionActivity, type MemoryJob } from "./memory-queue";
import { $ } from "bun";

interface SessionInfo {
  id: string;
  project_id: string;
  directory: string;
  title?: string;
  time_created: number;
  time_updated: number;
  message_count: number;
}

interface ProjectInfo {
  id: string;
  lastActive: number;
  sessionCount: number;
}

// Daemon state
let isRunning = false;
let lastPollTime = 0;
let lastHealthCheck = Date.now();
let processedCount = 0;
let errorCount = 0;

// Configuration
const CONFIG = {
  pollIntervalMs: 5000,        // 5 seconds between DB polls
  healthCheckIntervalMs: 30000, // 30 seconds between health checks
  maxSessionsPerPoll: 10,      // Max sessions to queue per poll
  rateLimitMs: 2000,           // 2 seconds between session processing
  priorityThresholds: {
    recent: 24 * 60 * 60 * 1000,     // 24 hours
    medium: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};

/**
 * Get path to OpenCode SQLite database
 */
function getDatabasePath(): string {
  return join(process.env.HOME || "", ".local", "share", "opencode", "opencode.db");
}

/**
 * Query all sessions from OpenCode DB with activity info
 */
async function querySessions(): Promise<SessionInfo[]> {
  const dbPath = getDatabasePath();
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const rows = db.query(
      `SELECT 
        s.id,
        s.project_id,
        s.directory,
        s.title,
        s.time_created,
        s.time_updated,
        COUNT(m.id) as message_count
       FROM session s
       LEFT JOIN message m ON m.session_id = s.id
       WHERE s.time_updated > ?
       GROUP BY s.id
       ORDER BY s.time_updated DESC`,
    ).all(lastPollTime) as any[];
    
    db.close();
    
    return rows.map(row => ({
      id: row.id,
      project_id: row.project_id,
      directory: row.directory,
      title: row.title,
      time_created: row.time_created,
      time_updated: row.time_updated,
      message_count: row.message_count,
    }));
  } catch (err) {
    console.error("[memsearch-daemon] Failed to query sessions:", err);
    errorCount++;
    return [];
  }
}

/**
 * Query project activity info
 */
async function queryProjects(): Promise<Map<string, ProjectInfo>> {
  const dbPath = getDatabasePath();
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const rows = db.query(
      `SELECT 
        project_id,
        MAX(time_updated) as last_active,
        COUNT(*) as session_count
       FROM session
       GROUP BY project_id`,
    ).all() as any[];
    
    db.close();
    
    const projects = new Map<string, ProjectInfo>();
    for (const row of rows) {
      projects.set(row.project_id, {
        id: row.project_id,
        lastActive: row.last_active,
        sessionCount: row.session_count,
      });
    }
    
    return projects;
  } catch (err) {
    console.error("[memsearch-daemon] Failed to query projects:", err);
    return new Map();
  }
}

/**
 * Calculate priority score for a session
 */
function calculatePriority(
  session: SessionInfo,
  projects: Map<string, ProjectInfo>
): number {
  const now = Date.now();
  const project = projects.get(session.project_id);
  
  // Project activity score (0-100)
  // Recently active projects get higher priority
  let projectScore = 0;
  if (project) {
    const hoursSinceActive = (now - project.lastActive) / (1000 * 60 * 60);
    projectScore = Math.max(0, 100 - hoursSinceActive * 5); // Decay 5 points per hour
  }
  
  // Session recency score (0-50)
  const ageMs = now - session.time_updated;
  let sessionScore = 0;
  if (ageMs < CONFIG.priorityThresholds.recent) {
    sessionScore = 50;
  } else if (ageMs < CONFIG.priorityThresholds.medium) {
    sessionScore = 25;
  } else {
    sessionScore = 10; // Backfill bonus for old sessions
  }
  
  // Message count bonus (0-20)
  // Sessions with more messages likely have more content
  const messageScore = Math.min(20, session.message_count / 10);
  
  return projectScore + sessionScore + messageScore;
}

/**
 * Queue a session for processing
 */
async function queueSession(session: SessionInfo, priority: number): Promise<void> {
  try {
    // Get project display name with git branch
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
    
    await signalSessionActivity(
      'session-created',
      session.id,
      projectName,
      session.directory,
      {
        priority,
        messageCount: session.message_count,
        isDaemon: true,
      }
    );
    
    processedCount++;
  } catch (err) {
    console.error(`[memsearch-daemon] Failed to queue session ${session.id}:`, err);
    errorCount++;
  }
}

/**
 * Main daemon loop
 */
async function daemonLoop(): Promise<void> {
  while (isRunning) {
    try {
      // Query sessions
      const sessions = await querySessions();
      
      if (sessions.length > 0) {
        // Query project info for prioritization
        const projects = await queryProjects();
        
        // Calculate priorities and sort
        const prioritized = sessions
          .map(s => ({ session: s, priority: calculatePriority(s, projects) }))
          .sort((a, b) => b.priority - a.priority);
        
        // Queue top sessions with rate limiting
        const toProcess = prioritized.slice(0, CONFIG.maxSessionsPerPoll);
        
        for (let i = 0; i < toProcess.length; i++) {
          const { session, priority } = toProcess[i];
          
          // Rate limiting delay
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitMs));
          }
          
          await queueSession(session, priority);
        }
        
        console.log(`[memsearch-daemon] Queued ${toProcess.length} sessions`);
      }
      
      // Update poll time
      lastPollTime = Date.now();
      lastHealthCheck = Date.now();
      
    } catch (err) {
      console.error("[memsearch-daemon] Error in daemon loop:", err);
      errorCount++;
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, CONFIG.pollIntervalMs));
  }
}

/**
 * Start the session daemon
 */
export function startSessionDaemon(): void {
  if (isRunning) {
    console.log("[memsearch-daemon] Daemon already running");
    return;
  }
  
  isRunning = true;
  console.log("[memsearch-daemon] Starting daemon...");
  
  // Start daemon loop in background
  daemonLoop().catch(err => {
    console.error("[memsearch-daemon] Daemon crashed:", err);
    isRunning = false;
    errorCount++;
  });
}

/**
 * Stop the session daemon
 */
export function stopSessionDaemon(): void {
  isRunning = false;
  console.log("[memsearch-daemon] Stopping daemon...");
}

/**
 * Check daemon health
 */
export function checkDaemonHealth(): {
  healthy: boolean;
  isRunning: boolean;
  lastPollTime: number;
  lastHealthCheck: number;
  processedCount: number;
  errorCount: number;
  message: string;
} {
  const now = Date.now();
  const timeSinceLastPoll = now - lastPollTime;
  const timeSinceHealthCheck = now - lastHealthCheck;
  
  // Consider unhealthy if:
  // - Not running
  // - No poll in last 60 seconds
  // - Error count > 10
  const healthy = isRunning && 
    timeSinceLastPoll < 60000 && 
    errorCount < 10;
  
  return {
    healthy,
    isRunning,
    lastPollTime,
    lastHealthCheck,
    processedCount,
    errorCount,
    message: healthy 
      ? "Daemon healthy" 
      : `Daemon unhealthy: running=${isRunning}, lastPoll=${timeSinceLastPoll}ms ago, errors=${errorCount}`,
  };
}

/**
 * Restart the daemon
 */
export function restartSessionDaemon(): void {
  console.log("[memsearch-daemon] Restarting...");
  stopSessionDaemon();
  
  // Wait a bit for cleanup
  setTimeout(() => {
    startSessionDaemon();
  }, 1000);
}

// Auto-start when module loads (if not already running)
if (!isRunning) {
  startSessionDaemon();
}
