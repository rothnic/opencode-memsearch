import { Queue } from 'bunqueue/client';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { checkForUnprocessedSessions } from './backfill';

const queueDataDir = join(homedir(), '.config', 'opencode', 'memsearch', 'queue');
mkdirSync(queueDataDir, { recursive: true });
process.env.DATA_PATH = join(queueDataDir, 'memory.db');

export interface MemoryJob {
  type: 'session-created' | 'session-idle' | 'session-deleted' | 'manual-index' | 'backfill';
  sessionId: string;
  projectId: string;
  directory: string;
  timestamp: number;
  priority: number;
  dedupKey: string;
  data?: any;
}

export const queue = new Queue<MemoryJob>('memsearch-memory', {
  embedded: true,
  defaultJobOptions: {
    attempts: 3,
    backoff: 5000,
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export async function signalSessionActivity(
  type: MemoryJob['type'],
  sessionId: string,
  projectId: string,
  directory: string,
  data?: any
) {
  const dedupKey = `${projectId}:${sessionId}:${type}`;
  
  await queue.add(`memory-${type}`, {
    type,
    sessionId,
    projectId,
    directory,
    timestamp: Date.now(),
    priority: type === 'manual-index' ? 10 : 0,
    dedupKey,
    data,
  }, {
    priority: type === 'manual-index' ? 10 : 0,
    deduplication: {
      id: dedupKey,
      ttl: 60000,
      replace: true,
    },
  });
}

let recurringJobsSetup = false;

export async function setupRecurringJobs(): Promise<void> {
  if (recurringJobsSetup) {
    return;
  }
  
  recurringJobsSetup = true;
  
  try {
    await queue.upsertJobScheduler(
      'backfill-check',
      {
        cron: '0 */6 * * *',
      },
      {
        name: 'backfill-check',
        data: {
          type: 'backfill',
          sessionId: 'backfill-check',
          projectId: 'global',
          directory: '',
          timestamp: Date.now(),
          priority: 0,
          dedupKey: 'backfill-check',
        } as MemoryJob,
        opts: {
          priority: 0,
        },
      }
    );
    
    console.log('[queue] Set up 6-hour recurring backfill job (cron: 0 */6 * * *)');
  } catch (err) {
    console.error('[queue] Failed to set up recurring jobs:', err);
  }
}
