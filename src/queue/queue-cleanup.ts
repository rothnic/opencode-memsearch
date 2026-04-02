/**
 * @file lib/queue-cleanup.ts
 * @description Clean up legacy jobs from the queue database
 */

import Database from "bun:sqlite";
import { join } from "path";

const queueDbPath = join(
  process.env.HOME || "",
  ".config",
  "opencode",
  "memsearch",
  "queue",
  "memory.db"
);

const LEGACY_JOB_TYPES = ["generate-markdown", "daemon-health-check"];

export async function cleanupLegacyJobs(): Promise<{
  deleted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let deleted = 0;

  try {
    const db = new Database(queueDbPath);

    // Delete legacy jobs
    for (const jobType of LEGACY_JOB_TYPES) {
      try {
        // We can't use json_extract on msgpack data in SQL
        // So we need to select all and filter in code
        const jobs = db
          .query(
            `
          SELECT id, data FROM jobs
          WHERE state = 'completed'
        `
          )
          .all() as { id: string; data: Uint8Array }[];

        const { unpack } = await import("msgpackr");

        for (const job of jobs) {
          try {
            const data = unpack(job.data);
            if (data.type === jobType) {
              db.run("DELETE FROM jobs WHERE id = ?", [job.id]);
              deleted++;
            }
          } catch {
            // Skip jobs we can't decode
          }
        }
      } catch (err) {
        errors.push(`Error cleaning up ${jobType}: ${err}`);
      }
    }

    db.close();
  } catch (err) {
    errors.push(`Database error: ${err}`);
  }

  return { deleted, errors };
}

export async function getQueueStats(): Promise<{
  total: number;
  byState: Record<string, number>;
  byType: Record<string, number>;
}> {
  const db = new Database(queueDbPath, { readonly: true });

  const total = (db.query("SELECT COUNT(*) as count FROM jobs").get() as any)
    .count;

  const byState: Record<string, number> = {};
  const states = db
    .query("SELECT state, COUNT(*) as count FROM jobs GROUP BY state")
    .all() as { state: string; count: number }[];
  for (const s of states) {
    byState[s.state] = s.count;
  }

  const byType: Record<string, number> = {};
  const jobs = db.query("SELECT data FROM jobs").all() as { data: Uint8Array }[];

  const { unpack } = await import("msgpackr");
  for (const job of jobs) {
    try {
      const data = unpack(job.data);
      const type = data.type || "unknown";
      byType[type] = (byType[type] || 0) + 1;
    } catch {
      byType["decode-error"] = (byType["decode-error"] || 0) + 1;
    }
  }

  db.close();

  return { total, byState, byType };
}
