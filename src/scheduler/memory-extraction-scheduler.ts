/**
 * Memory extraction scheduler service
 * Continuously fills the backlog with priority-ordered sessions
 * Respects system limits and prevents overwhelming resources
 */

import Database from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import type { MemoryTypeConfig } from "../types/memory-type-config";
import { createMemoryTypeRegistry } from "../types/memory-types";
import { loadSessionMetadataFromDB, loadMessagesFromDB } from "../processing/session-indexer";

const OPENCODE_DB_PATH = join(homedir(), ".local", "share", "opencode", "opencode.db");
const LAST_RUN_TRACKER_FILE = join(homedir(), ".config", "opencode", "memsearch", ".scheduler-last-run");

export interface SchedulerConfig {
  // How often to check for new sessions (default: 5 minutes)
  checkIntervalMs: number;
  
  // Max sessions to queue per check (default: 10)
  maxSessionsPerCheck: number;
  
  // Min time between processing the same session (default: 1 hour)
  minSessionReprocessMs: number;
  
  // Max total queue depth before pausing (default: 50)
  maxQueueDepth: number;
  
  // Priority weights
  priorityWeights: {
    recencyHours: number;      // Weight for session age (higher = newer sessions prioritized)
    messageCount: number;      // Weight for message count (higher = longer sessions prioritized)
    projectActivity: number;   // Weight for recent project activity
  };
}

export interface SessionPriority {
  sessionId: string;
  projectId: string;
  directory: string;
  priority: number;
  lastActivity: number;
  messageCount: number;
  reason: string;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  checkIntervalMs: 5 * 60 * 1000,  // 5 minutes
  maxSessionsPerCheck: 10,
  minSessionReprocessMs: 60 * 60 * 1000,  // 1 hour
  maxQueueDepth: 50,
  priorityWeights: {
    recencyHours: 100,      // 100 points per hour of recency
    messageCount: 1,        // 1 point per message
    projectActivity: 50,    // 50 points for active projects
  },
};

export class MemoryExtractionScheduler {
  private config: SchedulerConfig;
  private opencodeDb: Database;
  private memoryTypes: MemoryTypeConfig[];
  private isRunning: boolean = false;
  private lastRunTime: number = 0;

  constructor(
    workdir: string,
    config: Partial<SchedulerConfig> = {}
  ) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.opencodeDb = new Database(OPENCODE_DB_PATH, { readonly: true });
    
    const registry = createMemoryTypeRegistry(workdir);
    this.memoryTypes = registry.getAll().filter(mt => mt.enabled);
    
    this.loadLastRunTime();
  }

  private loadLastRunTime(): void {
    try {
      const fs = require("fs");
      if (fs.existsSync(LAST_RUN_TRACKER_FILE)) {
        const content = fs.readFileSync(LAST_RUN_TRACKER_FILE, "utf8");
        this.lastRunTime = parseInt(content, 10) || 0;
      }
    } catch {
      this.lastRunTime = 0;
    }
  }

  private saveLastRunTime(): void {
    try {
      const fs = require("fs");
      const dir = join(homedir(), ".config", "opencode", "memsearch");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(LAST_RUN_TRACKER_FILE, Date.now().toString());
    } catch (err) {
      console.warn("[Scheduler] Failed to save last run time:", err);
    }
  }

  /**
   * Calculate priority score for a session
   * Higher score = higher priority
   */
  calculatePriority(
    sessionId: string,
    lastActivity: number,
    messageCount: number,
    projectId: string
  ): number {
    const now = Date.now();
    const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
    
    // Recency score (inverse - newer is better)
    const recencyScore = Math.max(0, 24 - hoursSinceActivity) * this.config.priorityWeights.recencyHours;
    
    // Message count score
    const messageScore = messageCount * this.config.priorityWeights.messageCount;
    
    // Check if project has recent activity
    const projectActive = this.isProjectActive(projectId);
    const activityScore = projectActive ? this.config.priorityWeights.projectActivity : 0;
    
    const totalScore = recencyScore + messageScore + activityScore;
    
    return Math.round(totalScore);
  }

  private isProjectActive(projectId: string): boolean {
    // Check if project has had sessions in last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const rows = this.opencodeDb.query(
      `SELECT 1 FROM session 
       WHERE directory LIKE ? 
       AND time_updated > ? 
       LIMIT 1`
    ).all(`%${projectId}%`, oneDayAgo) as any[];
    
    return rows.length > 0;
  }

  /**
   * Get sessions that need memory extraction
   * Returns sessions sorted by priority (highest first)
   */
  async getSessionsToProcess(workdir: string): Promise<SessionPriority[]> {
    const sinceTimestamp = this.lastRunTime || (Date.now() - 24 * 60 * 60 * 1000);
    
    // Get all sessions updated since last run
    const rows = this.opencodeDb.query(
      `SELECT 
        s.id,
        s.directory,
        s.time_updated,
        COUNT(m.id) as message_count
      FROM session s
      LEFT JOIN message m ON m.session_id = s.id
      WHERE s.time_updated > ?
        AND s.directory LIKE ?
      GROUP BY s.id
      ORDER BY s.time_updated DESC`
    ).all(sinceTimestamp, `${workdir}%`) as any[];

    const sessions: SessionPriority[] = [];
    
    for (const row of rows) {
      const projectId = this.extractProjectId(row.directory);
      const priority = this.calculatePriority(
        row.id,
        row.time_updated,
        row.message_count,
        projectId
      );
      
      sessions.push({
        sessionId: row.id,
        projectId,
        directory: row.directory,
        priority,
        lastActivity: row.time_updated,
        messageCount: row.message_count,
        reason: `Priority ${priority}: ${row.message_count} msgs, ${Math.round((Date.now() - row.time_updated) / (1000 * 60))}m ago`,
      });
    }

    // Sort by priority (highest first)
    return sessions.sort((a, b) => b.priority - a.priority);
  }

  private extractProjectId(directory: string): string {
    const parts = directory.split("/");
    return parts[parts.length - 1] || "unknown";
  }

  /**
   * Check current queue depth
   */
  async getQueueDepth(): Promise<number> {
    const { queue } = await import("../queue/memory-queue");
    // Note: bunqueue doesn't expose getJobCounts easily, so we check DB directly
    const queueDbPath = join(homedir(), ".config", "opencode", "memsearch", "queue", "memory.db");
    const queueDb = new Database(queueDbPath, { readonly: true });
    
    const result = queueDb.query(
      `SELECT COUNT(*) as count FROM jobs WHERE state IN ('waiting', 'active')`
    ).get() as { count: number };
    
    queueDb.close();
    return result.count;
  }

  /**
   * Main scheduler run
   * Checks for new sessions and adds them to queue
   */
  async run(workdir: string): Promise<{
    checked: number;
    queued: number;
    skipped: number;
    reasons: string[];
  }> {
    const startTime = Date.now();
    const reasons: string[] = [];
    
    console.log(`\n[Scheduler] Starting run at ${new Date().toISOString()}`);
    console.log(`[Scheduler] Last run: ${this.lastRunTime ? new Date(this.lastRunTime).toISOString() : "never"}`);
    
    // Check queue depth
    const queueDepth = await this.getQueueDepth();
    console.log(`[Scheduler] Current queue depth: ${queueDepth}/${this.config.maxQueueDepth}`);
    
    if (queueDepth >= this.config.maxQueueDepth) {
      reasons.push(`Queue full (${queueDepth}/${this.config.maxQueueDepth})`);
      console.log(`[Scheduler] Queue is full, skipping this run`);
      return { checked: 0, queued: 0, skipped: 0, reasons };
    }
    
    // Get available queue slots
    const availableSlots = this.config.maxQueueDepth - queueDepth;
    const maxToQueue = Math.min(this.config.maxSessionsPerCheck, availableSlots);
    
    // Get sessions to process
    const sessions = await this.getSessionsToProcess(workdir);
    console.log(`[Scheduler] Found ${sessions.length} sessions since last run`);
    
    let queued = 0;
    let skipped = 0;
    
    const { signalSessionActivity } = await import("../queue/memory-queue");
    
    for (const session of sessions.slice(0, maxToQueue)) {
      try {
        // Queue extraction job for each enabled memory type
        for (const memoryType of this.memoryTypes) {
          // Only queue if frequency mode supports it
          if (memoryType.frequency?.mode === "manual") {
            continue; // Skip manual-only types
          }
          
          await signalSessionActivity(
            "manual-index",  // Using manual-index as the job type for extraction
            session.sessionId,
            session.projectId,
            session.directory,
            {
              priority: session.priority,
              memoryType: memoryType.name,
              reason: session.reason,
            }
          );
          
          console.log(`[Scheduler] Queued ${memoryType.name} extraction for ${session.sessionId} (priority: ${session.priority})`);
        }
        
        queued++;
      } catch (err) {
        console.warn(`[Scheduler] Failed to queue ${session.sessionId}:`, err);
        skipped++;
      }
    }
    
    // Update last run time
    this.lastRunTime = startTime;
    this.saveLastRunTime();
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Completed in ${duration}ms: ${queued} queued, ${skipped} skipped`);
    
    return {
      checked: sessions.length,
      queued,
      skipped,
      reasons,
    };
  }

  /**
   * Start continuous scheduler
   */
  async start(workdir: string): Promise<void> {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }
    
    this.isRunning = true;
    console.log(`[Scheduler] Starting continuous mode (interval: ${this.config.checkIntervalMs}ms)`);
    
    // Run immediately
    await this.run(workdir);
    
    // Schedule recurring runs
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, this.config.checkIntervalMs));
      
      if (this.isRunning) {
        await this.run(workdir);
      }
    }
  }

  stop(): void {
    console.log("[Scheduler] Stopping...");
    this.isRunning = false;
  }
}

export function createScheduler(
  workdir: string,
  config?: Partial<SchedulerConfig>
): MemoryExtractionScheduler {
  return new MemoryExtractionScheduler(workdir, config);
}
