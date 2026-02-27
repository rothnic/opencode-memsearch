import type { MemoryJob } from './memory-queue';
import { MemsearchCLI } from '../cli-wrapper';
import { loadConfig } from '../config';
import { state, markSessionProcessed } from '../state';

const cli = new MemsearchCLI();

export interface ProcessResult {
  success: boolean;
  error?: string;
  data?: any;
}

export async function processMemoryJob(job: MemoryJob): Promise<ProcessResult> {
  switch (job.type) {
    case 'session-created':
      return processSessionCreated(job);
    case 'session-idle':
      return processSessionIdle(job);
    case 'session-deleted':
      return processSessionDeleted(job);
    case 'manual-index':
      return processManualIndex(job);
    default:
      return { success: false, error: `Unknown job type: ${(job as any).type}` };
  }
}

async function processSessionCreated(job: MemoryJob): Promise<ProcessResult> {
  const { directory, sessionId, projectId } = job;
  
  const isAvailable = await cli.checkAvailability();
  if (!isAvailable) {
    return { success: false, error: 'CLI not available' };
  }
  
  // Start file watcher if not already running (non-blocking)
  if (!state.watcherRunning) {
    state.watcherRunning = true;
    (async () => {
      try {
        await cli.watch(directory);
      } catch (err) {
        state.watcherRunning = false;
      }
    })();
  }
  
  // Note: Full indexing on every session creation is too slow for large projects.
  // The watcher handles incremental updates. Manual indexing can be triggered
  // via the mem-index tool when needed.
  console.log(`[memsearch] ${projectId}: Started watcher for ${directory}`);
  markSessionProcessed(sessionId);
  return { success: true, data: { watcherStarted: true } };
}

async function processSessionIdle(job: MemoryJob): Promise<ProcessResult> {
  const { directory } = job;
  
  try {
    const config = await loadConfig(directory);
    const summary = await cli.compact();
    
    if (!summary?.trim()) {
      return { success: true, data: { compacted: false, reason: 'no-summary' } };
    }
    
    return { success: true, data: { compacted: true, summary } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function processSessionDeleted(job: MemoryJob): Promise<ProcessResult> {
  return { success: true, data: { archived: true } };
}

async function processManualIndex(job: MemoryJob): Promise<ProcessResult> {
  const { directory, data } = job;
  
  try {
    await cli.index(directory, {
      recursive: data?.recursive ?? true,
      collection: data?.collection,
    } as any);
    
    return { success: true, data: { indexed: true, manual: true } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
