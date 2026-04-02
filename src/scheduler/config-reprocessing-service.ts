import Database from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "os";
import type { ConfigChangeEvent } from "./memory-config-monitor";

const PROCESSING_TRACKER_DB = join(
  homedir(),
  ".config",
  "opencode",
  "memsearch",
  "processing-tracker.db"
);

export interface ReprocessRequest {
  memoryType: string;
  configHash: string;
  reason: string;
}

export class ConfigReprocessingService {
  private trackerDb: Database;
  private workdir: string;

  constructor(workdir: string) {
    this.workdir = workdir;
    this.trackerDb = new Database(PROCESSING_TRACKER_DB);
    this.initializeDb();
  }

  private initializeDb(): void {
    this.trackerDb.exec(`
      CREATE TABLE IF NOT EXISTS processed_sessions (
        session_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        processed_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, memory_type, config_hash)
      );
      
      CREATE INDEX IF NOT EXISTS idx_processed_sessions_type 
      ON processed_sessions(memory_type, config_hash);
      
      CREATE INDEX IF NOT EXISTS idx_processed_sessions_session 
      ON processed_sessions(session_id);
    `);
  }

  async handleConfigChange(event: ConfigChangeEvent): Promise<void> {
    switch (event.type) {
      case "created":
        console.log(`[Reprocessor] New memory type: ${event.memoryType}`);
        await this.queueAllSessionsForType(event.memoryType, event.currentHash!);
        break;
      case "modified":
        console.log(`[Reprocessor] Modified memory type: ${event.memoryType}`);
        await this.queueAllSessionsForType(
          event.memoryType,
          event.currentHash!,
          event.previousHash
        );
        break;
      case "deleted":
        console.log(`[Reprocessor] Deleted memory type: ${event.memoryType}`);
        await this.cleanupDeletedType(event.memoryType);
        break;
    }
  }

  private async queueAllSessionsForType(
    memoryType: string,
    configHash: string,
    previousHash?: string
  ): Promise<void> {
    const opencodeDbPath = join(homedir(), ".local", "share", "opencode", "opencode.db");
    const opencodeDb = new Database(opencodeDbPath, { readonly: true });

    try {
      const sinceTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const rows = opencodeDb.query(
        `SELECT DISTINCT s.id, s.directory, s.time_updated
         FROM session s
         WHERE s.directory LIKE ?
           AND s.time_updated > ?
         ORDER BY s.time_updated DESC`
      ).all(`${this.workdir}%`, sinceTimestamp) as any[];

      console.log(
        `[Reprocessor] Found ${rows.length} sessions to process for ${memoryType}`
      );

      const { signalSessionActivity } = await import("../queue/memory-queue");
      let queued = 0;
      let skipped = 0;

      for (const row of rows) {
        const alreadyProcessed = this.isSessionProcessed(
          row.id,
          memoryType,
          configHash
        );

        if (alreadyProcessed) {
          skipped++;
          continue;
        }

        const projectId = row.directory.split("/").pop() || "unknown";

        await signalSessionActivity(
          "manual-index",
          row.id,
          projectId,
          row.directory,
          {
            memoryType,
            configHash,
            priority: 100,
            reason: `Config ${previousHash ? "modified" : "created"}: ${memoryType}`,
          }
        );

        this.markSessionProcessed(row.id, memoryType, configHash);
        queued++;
      }

      console.log(
        `[Reprocessor] Queued ${queued} sessions, skipped ${skipped} for ${memoryType}`
      );
    } finally {
      opencodeDb.close();
    }
  }

  private isSessionProcessed(
    sessionId: string,
    memoryType: string,
    configHash: string
  ): boolean {
    const result = this.trackerDb
      .query(
        `SELECT 1 FROM processed_sessions 
         WHERE session_id = ? AND memory_type = ? AND config_hash = ?
         LIMIT 1`
      )
      .get(sessionId, memoryType, configHash) as any;

    return !!result;
  }

  private markSessionProcessed(
    sessionId: string,
    memoryType: string,
    configHash: string
  ): void {
    this.trackerDb.run(
      `INSERT OR REPLACE INTO processed_sessions 
       (session_id, memory_type, config_hash, processed_at)
       VALUES (?, ?, ?, ?)`,
      [sessionId, memoryType, configHash, Date.now()]
    );
  }

  private async cleanupDeletedType(memoryType: string): Promise<void> {
    this.trackerDb.run(
      `DELETE FROM processed_sessions WHERE memory_type = ?`,
      [memoryType]
    );
    console.log(`[Reprocessor] Cleaned up tracking for deleted type: ${memoryType}`);
  }

  close(): void {
    this.trackerDb.close();
  }
}

export function createReprocessingService(workdir: string): ConfigReprocessingService {
  return new ConfigReprocessingService(workdir);
}
