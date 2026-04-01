import Database from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "os";
import { readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { MemoryTypeConfig } from "./memory-type-config";
import { createMemoryTypeRegistry } from "./memory-types";

const OPENCODE_DB_PATH = join(homedir(), ".local", "share", "opencode", "opencode.db");
const TRACKER_DB_PATH = join(homedir(), ".config", "opencode", "memsearch", "scheduler-tracker.db");

interface SessionState {
  sessionId: string;
  fileHash: string;
  processedAt: number;
  memoryTypes: string;
}

interface ConfigState {
  memoryType: string;
  configHash: string;
  processedAt: number;
}

export interface UnifiedSchedulerConfig {
  checkIntervalMs: number;
  maxSessionsPerCheck: number;
  maxQueueDepth: number;
  maxSessionAgeDays: number;
}

export const DEFAULT_UNIFIED_CONFIG: UnifiedSchedulerConfig = {
  checkIntervalMs: 5 * 60 * 1000,
  maxSessionsPerCheck: 10,
  maxQueueDepth: 50,
  maxSessionAgeDays: 30,
};

export class UnifiedMemoryScheduler {
  private config: UnifiedSchedulerConfig;
  private workdir: string;
  private memoryDir: string;
  private sessionsDir: string;
  private trackerDb: Database;
  private isRunning = false;
  private memoryTypes: MemoryTypeConfig[] = [];

  constructor(workdir: string, config: Partial<UnifiedSchedulerConfig> = {}) {
    this.workdir = workdir;
    this.memoryDir = join(workdir, "memory");
    this.sessionsDir = join(workdir, ".memsearch", "sessions");
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...config };
    
    mkdirSync(join(homedir(), ".config", "opencode", "memsearch"), { recursive: true });
    this.trackerDb = new Database(TRACKER_DB_PATH);
    this.initTrackerDb();
    this.loadMemoryTypes();
  }

  private initTrackerDb(): void {
    this.trackerDb.exec(`
      CREATE TABLE IF NOT EXISTS session_states (
        session_id TEXT PRIMARY KEY,
        file_hash TEXT NOT NULL,
        processed_at INTEGER NOT NULL,
        memory_types TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_session_processed ON session_states(processed_at);
      
      CREATE TABLE IF NOT EXISTS config_states (
        memory_type TEXT PRIMARY KEY,
        config_hash TEXT NOT NULL,
        processed_at INTEGER NOT NULL
      );
    `);
  }

  private loadMemoryTypes(): void {
    const registry = createMemoryTypeRegistry(this.workdir);
    this.memoryTypes = registry.getAll().filter(mt => mt.enabled && mt.frequency?.mode !== "manual");
  }

  private async hashFile(filepath: string): Promise<string> {
    const content = await readFile(filepath, { encoding: "utf8" });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  private getSessionState(sessionId: string): SessionState | null {
    const row = this.trackerDb
      .query("SELECT * FROM session_states WHERE session_id = ?")
      .get(sessionId) as any;
    return row || null;
  }

  private getConfigState(memoryType: string): ConfigState | null {
    const row = this.trackerDb
      .query("SELECT * FROM config_states WHERE memory_type = ?")
      .get(memoryType) as any;
    return row || null;
  }

  private async scanSessionFiles(): Promise<Map<string, { hash: string; mtime: number }>> {
    const sessions = new Map<string, { hash: string; mtime: number }>();
    
    if (!existsSync(this.sessionsDir)) return sessions;

    const files = readdirSync(this.sessionsDir)
      .filter(f => f.endsWith(".md"));

    for (const file of files) {
      const sessionId = file.replace(".md", "");
      const filepath = join(this.sessionsDir, file);
      
      try {
        const hash = await this.hashFile(filepath);
        const stats = statSync(filepath);
        sessions.set(sessionId, { hash, mtime: stats.mtimeMs });
      } catch (err) {
        console.warn(`[Scheduler] Failed to hash ${file}:`, err);
      }
    }

    return sessions;
  }

  private async scanConfigs(): Promise<Map<string, string>> {
    const configs = new Map<string, string>();
    
    if (!existsSync(this.memoryDir)) return configs;

    const entries = readdirSync(this.memoryDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const configPath = join(this.memoryDir, entry.name, "config.yaml");
      if (!existsSync(configPath)) continue;

      try {
        const hash = await this.hashFile(configPath);
        configs.set(entry.name, hash);
      } catch (err) {
        console.warn(`[Scheduler] Failed to hash config ${entry.name}:`, err);
      }
    }

    return configs;
  }

  private async getQueueDepth(): Promise<number> {
    const queueDbPath = join(homedir(), ".config", "opencode", "memsearch", "queue", "memory.db");
    if (!existsSync(queueDbPath)) return 0;
    
    const queueDb = new Database(queueDbPath, { readonly: true });
    const result = queueDb.query(
      "SELECT COUNT(*) as count FROM jobs WHERE state IN ('waiting', 'active')"
    ).get() as { count: number };
    queueDb.close();
    return result.count;
  }

  async run(): Promise<{
    sessionsQueued: number;
    configsChanged: string[];
    sessionsChanged: string[];
    reasons: string[];
  }> {
    const startTime = Date.now();
    const reasons: string[] = [];

    console.log(`\n[Scheduler] Starting run at ${new Date().toISOString()}`);

    // Check queue depth
    const queueDepth = await this.getQueueDepth();
    console.log(`[Scheduler] Queue depth: ${queueDepth}/${this.config.maxQueueDepth}`);
    
    if (queueDepth >= this.config.maxQueueDepth) {
      reasons.push("Queue full");
      return { sessionsQueued: 0, configsChanged: [], sessionsChanged: [], reasons };
    }

    // Reload memory types (in case configs changed)
    this.loadMemoryTypes();

    // Scan current state
    const [sessionFiles, configFiles] = await Promise.all([
      this.scanSessionFiles(),
      this.scanConfigs(),
    ]);

    console.log(`[Scheduler] Found ${sessionFiles.size} session files, ${configFiles.size} configs`);

    const { signalSessionActivity } = await import("./memory-queue");
    let sessionsQueued = 0;
    const configsChanged: string[] = [];
    const sessionsChanged: string[] = [];
    const availableSlots = this.config.maxQueueDepth - queueDepth;
    const maxToQueue = Math.min(this.config.maxSessionsPerCheck, availableSlots);

    // Check for config changes and queue reprocessing
    for (const [memoryType, configHash] of configFiles) {
      const state = this.getConfigState(memoryType);
      
      if (!state || state.configHash !== configHash) {
        console.log(`[Scheduler] Config ${state ? 'modified' : 'new'}: ${memoryType}`);
        configsChanged.push(memoryType);
        
        // Queue ALL sessions for this memory type (up to limit)
        let queuedForType = 0;
        for (const [sessionId, sessionData] of sessionFiles) {
          if (sessionsQueued >= maxToQueue) break;

          const sessionState = this.getSessionState(sessionId);
          const alreadyProcessedForThisConfig = sessionState?.memoryTypes.includes(memoryType) &&
                                                 sessionState?.fileHash === sessionData.hash;
          
          if (alreadyProcessedForThisConfig) continue;

          await signalSessionActivity(
            "manual-index",
            sessionId,
            this.workdir.split("/").pop() || "unknown",
            this.workdir,
            {
              priority: state ? 90 : 100, // Higher priority for new configs
              memoryType,
              configHash,
              reason: state ? `Config modified: ${memoryType}` : `New memory type: ${memoryType}`,
            }
          );

          sessionsQueued++;
          queuedForType++;
        }

        console.log(`[Scheduler] Queued ${queuedForType} sessions for ${memoryType}`);

        // Update config state
        this.trackerDb.run(
          `INSERT OR REPLACE INTO config_states (memory_type, config_hash, processed_at)
           VALUES (?, ?, ?)`,
          [memoryType, configHash, startTime]
        );
      }
    }

    // Check for session file changes (only if we have slots left)
    if (sessionsQueued < maxToQueue) {
      for (const [sessionId, sessionData] of sessionFiles) {
        if (sessionsQueued >= maxToQueue) break;

        const state = this.getSessionState(sessionId);
        const maxAge = Date.now() - (this.config.maxSessionAgeDays * 24 * 60 * 60 * 1000);

        // Skip if too old
        if (sessionData.mtime < maxAge) continue;

        // Check if changed or new
        if (!state || state.fileHash !== sessionData.hash) {
          const isNew = !state;
          sessionsChanged.push(sessionId);
          
          console.log(`[Scheduler] Session ${isNew ? 'new' : 'changed'}: ${sessionId}`);

          // Queue for each memory type
          for (const memoryType of this.memoryTypes) {
            const configState = this.getConfigState(memoryType.name);
            if (!configState) continue; // Skip if config not tracked yet

            await signalSessionActivity(
              "manual-index",
              sessionId,
              this.workdir.split("/").pop() || "unknown",
              this.workdir,
              {
                priority: isNew ? 50 : 75, // Higher priority for changed sessions
                memoryType: memoryType.name,
                configHash: configState.configHash,
                reason: isNew ? `New session: ${sessionId}` : `Session changed: ${sessionId}`,
              }
            );
          }

          sessionsQueued++;

          // Update session state
          const memoryTypesList = this.memoryTypes.map(mt => mt.name).join(",");
          this.trackerDb.run(
            `INSERT OR REPLACE INTO session_states (session_id, file_hash, processed_at, memory_types)
             VALUES (?, ?, ?, ?)`,
            [sessionId, sessionData.hash, startTime, memoryTypesList]
          );
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Completed in ${duration}ms: ${sessionsQueued} sessions queued`);
    console.log(`          Configs changed: ${configsChanged.length}, Sessions changed: ${sessionsChanged.length}`);

    return {
      sessionsQueued,
      configsChanged,
      sessionsChanged,
      reasons,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`[Scheduler] Starting (interval: ${this.config.checkIntervalMs}ms)`);

    while (this.isRunning) {
      await this.run();
      
      if (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, this.config.checkIntervalMs));
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    this.trackerDb.close();
    console.log("[Scheduler] Stopped");
  }
}

export function createUnifiedScheduler(
  workdir: string,
  config?: Partial<UnifiedSchedulerConfig>
): UnifiedMemoryScheduler {
  return new UnifiedMemoryScheduler(workdir, config);
}
