# Opencode-Memsearch Performance Remediation Plan

## TL;DR
> **Summary**: A phased remediation plan to address severe performance degradation and memory ballooning in the memsearch plugin. Focuses on disabling problematic hooks, implementing proper rate limiting, fixing bunqueue memory leaks, and eventually transitioning to a simpler daemon-based architecture.
> **Estimated Effort**: Large (2-3 weeks)

## Context

### Original Request
The memsearch plugin experienced extreme slowness and memory ballooning issues. After analysis, multiple critical performance and memory issues were identified that need immediate attention.

### Key Findings

1. **Blocking LLM Calls**: `session-idle` hook makes synchronous HTTP calls to 9router for summarization on EVERY turn, blocking the main thread
2. **bunqueue SQLite Issues**: Embedded SQLite queue grows unbounded, causes memory pressure, and has inverted priority system (backfill blocks real-time)
3. **Immediate Indexing Overhead**: Every turn triggers immediate blocking `cli.index()` shell command
4. **Unbounded State Growth**: `summarizedTurns` Set and other tracking structures grow forever without cleanup
5. **No Backpressure**: Backfill queues 5000+ sessions instantly without batching or delays
6. **Double/Triple Rate Limiting**: Multiple overlapping rate limits create unpredictable behavior

## Objectives

### Core Objective
Restore the memsearch plugin to a safe, performant state while maintaining core functionality (memory indexing, search, compaction).

### Deliverables
- [ ] Phase 1: Plugin runs without blocking user interactions or ballooning memory
- [ ] Phase 2: Queue system properly manages memory and respects priorities
- [ ] Phase 3: Performance optimizations for async operations and caching
- [ ] Phase 4: Long-term sustainable architecture (daemon approach)

### Definition of Done
- [ ] `bun run typecheck` passes with no errors
- [ ] Memory usage stays under 100MB during normal operation
- [ ] No blocking operations on the main event loop
- [ ] Real-time sessions process before backfill jobs
- [ ] All existing tests pass

### Guardrails (Must NOT)
- [ ] Do NOT implement new features until stability is restored
- [ ] Do NOT change the public tool API (mem-search, mem-index, etc.)
- [ ] Do NOT remove bunqueue entirely in Phase 1-3 (too disruptive)
- [ ] Do NOT modify the memsearch CLI itself (out of scope)

---

## TODOs

### Phase 1: Immediate Fixes (Critical - Must Do First)

#### 1.1 Disable Blocking Hooks
**What**: Temporarily disable `session-idle` and `system-transform` hooks that cause blocking LLM calls and searches
**Files**: 
- `index.ts` (lines 71, 73)
- Create `lib/feature-flags.ts` (new)
**Acceptance**: 
- Plugin loads without triggering LLM calls
- User interactions are not blocked

**Code Changes**:
```typescript
// lib/feature-flags.ts
export const FEATURE_FLAGS = {
  ENABLE_SESSION_IDLE: process.env.MEMSEARCH_ENABLE_SESSION_IDLE !== 'false',
  ENABLE_SYSTEM_TRANSFORM: process.env.MEMSEARCH_ENABLE_SYSTEM_TRANSFORM !== 'false',
  ENABLE_SESSION_CREATED: process.env.MEMSEARCH_ENABLE_SESSION_CREATED !== 'false',
  ENABLE_BACKFILL: process.env.MEMSEARCH_ENABLE_BACKFILL !== 'false',
};
```

```typescript
// index.ts - modify hook registration
hook: {
  ...(FEATURE_FLAGS.ENABLE_SESSION_CREATED && { "session.created": onSessionCreated }),
  "session.deleted": (await import("./hooks/session-deleted")).onSessionDeleted,
  ...(FEATURE_FLAGS.ENABLE_SESSION_IDLE && { "session.idle": onSessionIdle }),
  "experimental.session.compacting": onSessionCompacting,
  ...(FEATURE_FLAGS.ENABLE_SYSTEM_TRANSFORM && { "experimental.chat.system.transform": onSystemTransform }),
  // ... rest
},
```

#### 1.2 Add Rate Limiting to Session Hooks
**What**: Implement proper rate limiting with cooldown periods to prevent spamming
**Files**: 
- `state.ts`
- `hooks/session-created.ts`
- `hooks/session-idle.ts`
**Acceptance**: 
- Same session cannot trigger processing more than once per 5 minutes
- Rate limits are configurable via environment variables

**Code Changes**:
```typescript
// state.ts - update throttling
export const state = {
  // ... existing
  MIN_PROCESS_INTERVAL_MS: parseInt(process.env.MEMSEARCH_THROTTLE_MS || '300000', 10), // 5 min default
  sessionProcessCounts: new Map<string, number>(), // Track per-session counts
};

export function isThrottled(sessionId: string): boolean {
  const lastTime = state.lastSessionProcessTime.get(sessionId);
  if (!lastTime) return false;
  const elapsed = Date.now() - lastTime;
  const threshold = state.MIN_PROCESS_INTERVAL_MS;
  
  // Exponential backoff after multiple attempts
  const count = state.sessionProcessCounts.get(sessionId) || 0;
  const backoffMultiplier = Math.min(count, 5); // Cap at 5x
  
  return elapsed < (threshold * backoffMultiplier);
}
```

#### 1.3 Fix bunqueue Cleanup Settings
**What**: Reduce job history retention to prevent unbounded database growth
**Files**: 
- `lib/memory-queue.ts` (lines 33-41)
**Acceptance**: 
- Queue database stays under 50MB
- Old jobs are cleaned up promptly

**Code Changes**:
```typescript
// lib/memory-queue.ts
export const queue = new Queue<MemoryJob>("memsearch-memory", {
  embedded: true,
  defaultJobOptions: {
    attempts: 3,
    backoff: 5000,
    removeOnComplete: 10,        // Was 100 - reduce to prevent bloat
    removeOnFail: 5,             // Was 50 - reduce to prevent bloat
    removeOnCompleteAge: 3600,   // Remove completed jobs older than 1 hour
    removeOnFailAge: 7200,       // Remove failed jobs older than 2 hours
  },
});
```

#### 1.4 Add Session State Cleanup
**What**: Periodically clean up old session tracking data
**Files**: 
- `state.ts`
**Acceptance**: 
- `summarizedSessions` Set doesn't grow unbounded
- Old entries are pruned after 7 days

**Code Changes**:
```typescript
// state.ts
export const state = {
  // ... existing
  MAX_TRACKED_SESSIONS: 1000,
  SESSION_RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export function cleanupOldSessions(): void {
  const now = Date.now();
  const cutoff = now - state.SESSION_RETENTION_MS;
  
  // Clean up lastSessionProcessTime
  for (const [sessionId, timestamp] of state.lastSessionProcessTime.entries()) {
    if (timestamp < cutoff) {
      state.lastSessionProcessTime.delete(sessionId);
      state.sessionProcessCounts.delete(sessionId);
    }
  }
  
  // Clean up summarizedSessions (convert to LRU approach)
  if (state.summarizedSessions.size > state.MAX_TRACKED_SESSIONS) {
    // Convert to array, sort by age (we'd need to track this), keep newest
    // Or simpler: just clear old ones periodically
    const toRemove = state.summarizedSessions.size - state.MAX_TRACKED_SESSIONS;
    const sessions = Array.from(state.summarizedSessions);
    for (let i = 0; i < toRemove; i++) {
      state.summarizedSessions.delete(sessions[i]);
    }
  }
}

// Schedule periodic cleanup
setInterval(cleanupOldSessions, 3600000); // Every hour
```

#### 1.5 Fix Priority System (Inverted)
**What**: Correct priority values so real-time events have higher priority than backfill
**Files**: 
- `index.ts` (lines 101, 115)
- `lib/backfill.ts` (lines 69-83)
**Acceptance**: 
- Real-time session events (priority 200) process before backfill (priority 10-100)
- Manual operations have highest priority (250)

**Code Changes**:
```typescript
// index.ts - fix event priorities
if (evType === "session.created" && sessionID) {
  await signalSessionActivity(
    "session-created",
    sessionID,
    projectName,
    directory,
    { event: "session.created", priority: 200 }, // Higher than backfill
  );
}

if (evType === "session.idle" && sessionID) {
  await signalSessionActivity(
    "session-idle",
    sessionID,
    projectName,
    directory,
    { event: "session.idle", priority: 150 }, // Higher than backfill
  );
}
```

```typescript
// lib/backfill.ts - adjust priorities
function calculatePriority(session: SessionInfo): number {
  const now = Date.now();
  const ageMs = now - session.time_updated;
  const hoursOld = ageMs / (1000 * 60 * 60);

  // Backfill priorities should be LOWER than real-time (which are 150-200)
  if (hoursOld < 1) {
    return 100; // Recent but still lower than real-time
  } else if (hoursOld < 24) {
    return 50;
  } else if (hoursOld < 24 * 7) {
    return 25;
  } else {
    return 10;
  }
}
```

---

### Phase 2: Architecture Fixes (High Priority)

#### 2.1 Implement Proper Batching in Backfill
**What**: Add batching and delays to prevent queue flooding
**Files**: 
- `lib/backfill.ts` (lines 94-136)
**Acceptance**: 
- Backfill processes in batches of 50 with 1-second delays
- No more than 100 jobs queued at once

**Code Changes**:
```typescript
// lib/backfill.ts
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;
const MAX_CONCURRENT_QUEUES = 100;

export async function backfillAllSessions(): Promise<{
  queued: number;
  processed: number;
  total: number;
}> {
  if (markdownGenerationInProgress) {
    return { queued: 0, processed: 0, total: 0 };
  }

  markdownGenerationInProgress = true;

  try {
    const sessions = await queryAllSessions();

    if (sessions.length === 0) {
      return { queued: 0, processed: 0, total: 0 };
    }

    let processed = 0;
    let queued = 0;

    // Process in batches with rate limiting
    for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
      const batch = sessions.slice(i, i + BATCH_SIZE);
      
      // Check queue depth before adding more
      if (queued >= MAX_CONCURRENT_QUEUES) {
        console.log(`[memsearch] Queue limit reached (${MAX_CONCURRENT_QUEUES}), pausing backfill`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
        queued = 0; // Reset counter (simplified - ideally check actual queue)
      }

      // Generate markdown for batch
      const results = await Promise.all(
        batch.map((session) => generateMarkdownForSession(session)),
      );

      processed += results.filter(Boolean).length;
      queued += batch.length;

      // Delay between batches
      if (i + BATCH_SIZE < sessions.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    return { queued, processed, total: sessions.length };
  } finally {
    markdownGenerationInProgress = false;
  }
}
```

#### 2.2 Add Queue Health Monitoring
**What**: Add ability to check queue depth and worker status
**Files**: 
- `lib/queue-state.ts` (existing)
- Create `tools/queue-status.ts` (new)
**Acceptance**: 
- `mem-queue-status` tool shows queue depth, active jobs, recent failures
- Health check runs automatically every 5 minutes

**Code Changes**:
```typescript
// tools/queue-status.ts
import type { PluginToolInput } from "@opencode-ai/plugin";
import { queue } from "../lib/memory-queue";

export default async function queueStatusTool(input: PluginToolInput) {
  try {
    // Get queue metrics (if bunqueue exposes them)
    const jobCounts = await queue.getJobCounts();
    
    return {
      success: true,
      data: {
        waiting: jobCounts.waiting || 0,
        active: jobCounts.active || 0,
        completed: jobCounts.completed || 0,
        failed: jobCounts.failed || 0,
        delayed: jobCounts.delayed || 0,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get queue status: ${error}`,
    };
  }
}
```

#### 2.3 Fix Memory Worker Concurrency
**What**: Limit worker concurrency and add circuit breaker pattern
**Files**: 
- `lib/memory-worker.ts` (lines 9-58)
**Acceptance**: 
- Worker concurrency defaults to 1, max 3
- Circuit breaker stops processing after 5 consecutive failures
- Worker gracefully handles SIGINT/SIGTERM

**Code Changes**:
```typescript
// lib/memory-worker.ts
const concurrency = Math.min(
  parseInt(process.env.MEMSEARCH_CONCURRENCY || "1", 10),
  3 // Hard cap at 3
);

// Circuit breaker state
const circuitBreaker = {
  failures: 0,
  threshold: 5,
  resetTimeoutMs: 60000,
  lastFailureTime: 0,
  isOpen: false,
};

function checkCircuitBreaker(): boolean {
  if (circuitBreaker.isOpen) {
    const elapsed = Date.now() - circuitBreaker.lastFailureTime;
    if (elapsed > circuitBreaker.resetTimeoutMs) {
      // Reset circuit
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      console.log("[memsearch] Circuit breaker reset");
      return true;
    }
    return false;
  }
  return true;
}

function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.isOpen = true;
    console.error(`[memsearch] Circuit breaker opened after ${circuitBreaker.threshold} failures`);
  }
}

// Modify worker handler
const worker = new Worker(
  "memsearch-memory",
  async (job: { id: string; name: string; data: MemoryJob }) => {
    // Check circuit breaker
    if (!checkCircuitBreaker()) {
      return { 
        success: false, 
        error: "Circuit breaker open - too many failures",
        deferred: true 
      };
    }

    const jobData = job.data;
    const { projectId } = jobData;

    if (processingProjects.has(projectId)) {
      await queue.add(job.name, jobData, {
        priority: Math.max(1, (jobData.priority || 10) - 5),
        deduplication: {
          id: jobData.dedupKey,
          ttl: 60000,
          replace: true,
        },
      });
      return { deferred: true, reason: "project-busy", requeued: true };
    }

    processingProjects.add(projectId);

    try {
      const result = await processMemoryJob(jobData);

      if (result.success) {
        incrementCompleted();
        circuitBreaker.failures = 0; // Reset on success
      } else {
        incrementFailed();
        recordFailure();
      }

      return result;
    } catch (error) {
      incrementFailed();
      recordFailure();
      return { success: false, error: String(error) };
    } finally {
      processingProjects.delete(projectId);
    }
  },
  {
    embedded: true,
    concurrency,
    useLocks: true,
    lockDuration: STALL_TIMEOUT_MS,
    maxStalledCount: 2,
  },
);
```

#### 2.4 Remove Duplicate Rate Limiting
**What**: Simplify to single rate limit (project serialization) and remove pipeline rate limit
**Files**: 
- `lib/memory-pipeline.ts` (investigate and remove duplicate limits)
**Acceptance**: 
- Only one rate limit layer remains (project-level)
- Behavior is predictable and documented

**Code Changes**:
```typescript
// lib/memory-pipeline.ts - remove arbitrary delays
// Remove the arbitrary delay logic if it exists in processSessionCreated
// Keep only the project-level serialization in memory-worker.ts
```

---

### Phase 3: Performance Optimizations (Medium Priority)

#### 3.1 Async LLM Calls with Timeout
**What**: Make LLM calls in session-idle truly async with proper timeouts
**Files**: 
- `hooks/session-idle.ts`
- `lib/memory-pipeline.ts` (processSessionIdle)
**Acceptance**: 
- LLM calls don't block main thread
- Timeout after 30 seconds
- Failures don't crash the system

**Code Changes**:
```typescript
// lib/memory-pipeline.ts
async function processSessionIdle(job: MemoryJob): Promise<ProcessResult> {
  const { directory } = job;

  try {
    const config = await loadConfig(directory);
    
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const summary = await Promise.race([
        cli.compact(),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('Compaction timeout'));
          });
        })
      ]);
      
      clearTimeout(timeoutId);

      if (!summary?.trim()) {
        return {
          success: true,
          data: { compacted: false, reason: "no-summary" },
        };
      }

      return { success: true, data: { compacted: true, summary } };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
```

#### 3.2 Batched Indexing
**What**: Batch indexing operations instead of running on every turn
**Files**: 
- `lib/memory-pipeline.ts` (processSessionCreated)
**Acceptance**: 
- Indexing runs at most once per minute per project
- Multiple session updates are batched together

**Code Changes**:
```typescript
// lib/memory-pipeline.ts
const pendingIndexes = new Map<string, {
  directory: string;
  timeout: ReturnType<typeof setTimeout>;
}>();

async function processSessionCreated(job: MemoryJob): Promise<ProcessResult> {
  const { directory, sessionId, projectId } = job;

  const isAvailable = await cli.checkAvailability();
  if (!isAvailable) {
    return { success: false, error: "CLI not available" };
  }

  // Debounce indexing - don't index immediately
  const existing = pendingIndexes.get(projectId);
  if (existing) {
    clearTimeout(existing.timeout);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      pendingIndexes.delete(projectId);
      
      try {
        const sessionsDir = join(directory, ".memsearch", "sessions");
        await cli.index(sessionsDir, { timeout: INDEX_TIMEOUT_MS });
        markSessionProcessed(sessionId);
        resolve({ success: true, data: { indexed: true } });
      } catch (err) {
        if (err instanceof MemsearchTimeoutError) {
          resolve({
            success: false,
            error: `Indexing timed out after ${INDEX_TIMEOUT_MS / 1000}s`,
          });
        } else {
          resolve({ success: false, error: String(err) });
        }
      }
    }, 60000); // Wait 1 minute before indexing

    pendingIndexes.set(projectId, { directory, timeout });
  });
}
```

#### 3.3 Search Result Caching
**What**: Cache search results in system-transform to avoid repeated searches
**Files**: 
- `hooks/system-transform.ts`
**Acceptance**: 
- Same query within 30 seconds returns cached results
- Cache respects collection and filter parameters

**Code Changes**:
```typescript
// hooks/system-transform.ts
const searchCache = new Map<string, {
  results: any;
  timestamp: number;
}>();

const CACHE_TTL_MS = 30000; // 30 seconds

function getCacheKey(query: string, options: any): string {
  return `${query}:${options.collection}:${options.topK}:${options.minScore}`;
}

export const onSystemTransform = async (
  input: any,
  output: any,
  ctx: PluginInput,
) => {
  try {
    // ... existing code to extract query ...

    if (!query) return;

    const cacheKey = getCacheKey(query, { collection, topK, minScore });
    const cached = searchCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      // Use cached results
      if (cached.results.length > 0) {
        output.system.push(
          `<memsearch-context>\n${cached.results}\n</memsearch-context>`,
        );
      }
      return;
    }

    // ... perform search ...
    
    // Cache results
    searchCache.set(cacheKey, {
      results: formattedResults,
      timestamp: Date.now(),
    });
    
    // Cleanup old cache entries periodically
    if (searchCache.size > 100) {
      const now = Date.now();
      for (const [key, entry] of searchCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL_MS) {
          searchCache.delete(key);
        }
      }
    }
  } catch (err) {
    console.error("memsearch system-transform hook failed:", err);
  }
};
```

#### 3.4 Optimize bunqueue Database
**What**: Add SQLite optimizations for bunqueue database
**Files**: 
- `lib/memory-queue.ts`
**Acceptance**: 
- WAL mode enabled for better concurrency
- Periodic VACUUM to reclaim space
- Connection pooling if supported

**Code Changes**:
```typescript
// lib/memory-queue.ts
import { Database } from "bun:sqlite";

// Optimize queue database after creation
function optimizeQueueDatabase(): void {
  try {
    const dbPath = join(queueDataDir, "memory.db");
    if (existsSync(dbPath)) {
      const db = new Database(dbPath);
      
      // Enable WAL mode for better concurrency
      db.run("PRAGMA journal_mode=WAL;");
      db.run("PRAGMA synchronous=NORMAL;");
      db.run("PRAGMA temp_store=memory;");
      db.run("PRAGMA mmap_size=268435456;"); // 256MB
      
      db.close();
      console.log("[memsearch] Queue database optimized");
    }
  } catch (error) {
    console.error("[memsearch] Failed to optimize queue database:", error);
  }
}

// Schedule periodic maintenance
setInterval(() => {
  try {
    const dbPath = join(queueDataDir, "memory.db");
    const db = new Database(dbPath);
    db.run("VACUUM;");
    db.close();
  } catch {
    // Silent fail
  }
}, 24 * 60 * 60 * 1000); // Daily

// Run optimization on startup
optimizeQueueDatabase();
```

---

### Phase 4: Long-term Architecture (Lower Priority)

#### 4.1 Design Session Daemon
**What**: Design and document the simplified daemon approach from SIMPLIFIED_ARCHITECTURE.md
**Files**: 
- Create `docs/DAEMON_DESIGN.md` (new)
- Create `lib/daemon/session-daemon.ts` (new, stub)
**Acceptance**: 
- Design document approved
- Daemon stub compiles and passes typecheck
- Migration plan documented

**Code Changes**:
```typescript
// lib/daemon/session-daemon.ts (stub)
/**
 * Session Daemon - Background polling approach
 * 
 * This is the stub for the new daemon-based architecture.
 * See docs/DAEMON_DESIGN.md for full specification.
 */

export class SessionDaemon {
  private isRunning = false;
  private pollIntervalMs = 5000;
  
  async start(): Promise<void> {
    this.isRunning = true;
    console.log("[memsearch] Session daemon starting...");
    
    while (this.isRunning) {
      await this.processCycle();
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log("[memsearch] Session daemon stopping...");
  }
  
  private async processCycle(): Promise<void> {
    // TODO: Implement polling logic
    // 1. Query OpenCode DB for recent sessions
    // 2. Check state for new messages
    // 3. Calculate priorities
    // 4. Queue top N sessions
  }
}

export const sessionDaemon = new SessionDaemon();
```

#### 4.2 Remove Session Hooks (Migration)
**What**: Gradually migrate from event-driven to daemon approach
**Files**: 
- `index.ts`
- `hooks/` directory
**Acceptance**: 
- Hooks are feature-flagged and disabled by default
- Daemon handles all session processing
- No regression in functionality

**Migration Plan**:
1. Implement daemon alongside existing hooks
2. Test daemon with feature flag `MEMSEARCH_USE_DAEMON=true`
3. After 2 weeks of stability, make daemon default
4. Deprecate and remove hooks after 1 month

#### 4.3 Implement Global Prioritization
**What**: Global priority queue that considers project activity
**Files**: 
- `lib/daemon/prioritizer.ts` (new)
**Acceptance**: 
- Active projects get priority boost
- Sessions sorted by combined project + session score
- Backfill doesn't starve real-time processing

**Code Changes**:
```typescript
// lib/daemon/prioritizer.ts
export interface PrioritizationConfig {
  activeProjectBonus: number;
  recentSessionHours: number;
  backfillBatchSize: number;
}

export function calculatePriority(
  session: SessionInfo,
  projectLastActive: number,
  config: PrioritizationConfig
): number {
  const now = Date.now();
  const sessionAge = now - session.time_updated;
  
  // Project recency score (0-100)
  const projectScore = Math.max(
    0, 
    100 - (now - projectLastActive) / (1000 * 60 * 60)
  );
  
  // Session recency score (0-50)
  const sessionScore = Math.max(
    0,
    50 - sessionAge / (1000 * 60 * 60)
  );
  
  // Backfill bonus for old sessions
  const backfillScore = sessionAge > (7 * 24 * 60 * 60 * 1000) ? 10 : 0;
  
  return projectScore + sessionScore + backfillScore;
}
```

#### 4.4 Simplified State Management
**What**: Replace complex state with simple "last message ID" tracking
**Files**: 
- Create `lib/daemon/state-manager.ts` (new)
- Deprecate `state.ts`
**Acceptance**: 
- State tracks only last message ID per session
- Upsert semantics prevent duplicate processing
- State file is small and fast to read/write

**Code Changes**:
```typescript
// lib/daemon/state-manager.ts
interface SessionState {
  lastMessageId: string;
  lastProcessedAt: number;
  status: 'pending' | 'indexed' | 'failed';
}

interface GlobalState {
  sessions: Record<string, SessionState>;
  version: number;
}

const STATE_FILE = join(homedir(), '.config', 'opencode', 'memsearch', 'daemon-state.json');

export class StateManager {
  private state: GlobalState = { sessions: {}, version: 1 };
  private dirty = false;
  
  async load(): Promise<void> {
    try {
      const data = await Bun.file(STATE_FILE).text();
      this.state = JSON.parse(data);
    } catch {
      // Use default state
    }
  }
  
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    await Bun.write(STATE_FILE, JSON.stringify(this.state, null, 2));
    this.dirty = false;
  }
  
  getSessionState(sessionId: string): SessionState | undefined {
    return this.state.sessions[sessionId];
  }
  
  setSessionState(sessionId: string, state: SessionState): void {
    this.state.sessions[sessionId] = state;
    this.dirty = true;
  }
  
  cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, state] of Object.entries(this.state.sessions)) {
      if (state.lastProcessedAt < cutoff) {
        delete this.state.sessions[id];
        this.dirty = true;
      }
    }
  }
}
```

---

## Verification

### Testing Strategy

#### Unit Tests
- [ ] Feature flag tests
- [ ] Rate limiting tests
- [ ] Circuit breaker tests
- [ ] Priority calculation tests

#### Integration Tests
- [ ] End-to-end session processing
- [ ] Queue behavior under load
- [ ] Memory usage monitoring
- [ ] Graceful degradation tests

#### Manual Verification
```bash
# Test 1: Plugin loads without errors
bun run typecheck

# Test 2: Hooks disabled by default
MEMSEARCH_ENABLE_SESSION_IDLE=false MEMSEARCH_ENABLE_SYSTEM_TRANSFORM=false bun test

# Test 3: Memory usage check
# Run plugin for 10 minutes, verify memory < 100MB

# Test 4: Queue health
bun run scripts/check-queue.ts

# Test 5: Backfill doesn't flood
# Trigger backfill, verify max 100 jobs queued
```

### Monitoring Checklist
- [ ] Memory usage tracked (target: < 100MB)
- [ ] Queue depth monitored (target: < 50 waiting)
- [ ] Processing latency tracked (target: < 5s for real-time)
- [ ] Error rate monitored (target: < 1%)
- [ ] Circuit breaker state logged

### Rollback Plan
If issues occur:
1. Set environment variables to disable features:
   ```bash
   export MEMSEARCH_ENABLE_SESSION_IDLE=false
   export MEMSEARCH_ENABLE_SYSTEM_TRANSFORM=false
   export MEMSEARCH_ENABLE_BACKFILL=false
   ```
2. Restart OpenCode
3. Plugin will run in minimal mode (tools only, no hooks)

---

## Success Metrics

| Metric | Before | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|--------|--------|----------------|----------------|----------------|
| Memory Usage | 500MB+ | < 200MB | < 150MB | < 100MB |
| UI Blocking | Every turn | None | None | None |
| Queue Latency | N/A (broken) | < 30s | < 10s | < 5s |
| Backfill Speed | Instant flood | Batched | Rate-limited | Smart priority |
| Test Pass Rate | Unknown | 80% | 90% | 95%+ |

---

## Dependencies

### Phase 1 Blockers
- None - can start immediately

### Phase 2 Blockers
- Phase 1.1 complete (hooks disabled)
- Phase 1.3 complete (queue cleanup)

### Phase 3 Blockers
- Phase 2.1 complete (batching)
- Phase 2.3 complete (worker fixes)

### Phase 4 Blockers
- Phase 3 stable for 1 week
- Daemon design approved
- Migration plan tested

---

## Appendix

### Environment Variables Reference

```bash
# Feature Flags
MEMSEARCH_ENABLE_SESSION_IDLE=false       # Disable session-idle hook
MEMSEARCH_ENABLE_SYSTEM_TRANSFORM=false   # Disable system-transform hook
MEMSEARCH_ENABLE_SESSION_CREATED=true     # Keep session-created hook
MEMSEARCH_ENABLE_BACKFILL=false           # Disable automatic backfill

# Rate Limiting
MEMSEARCH_THROTTLE_MS=300000              # 5 minute throttle between processes
MEMSEARCH_CONCURRENCY=1                   # Worker concurrency (max 3)

# Queue Settings
MEMSEARCH_QUEUE_CLEANUP_INTERVAL=3600000  # Cleanup every hour (ms)
MEMSEARCH_MAX_TRACKED_SESSIONS=1000       # Max sessions to track

# Daemon (Phase 4)
MEMSEARCH_USE_DAEMON=false                # Use new daemon architecture
MEMSEARCH_DAEMON_POLL_INTERVAL=5000       # Poll interval in ms
```

### Related Documentation
- `docs/QUEUE_ARCHITECTURE_REVIEW.md` - Current queue issues
- `docs/SIMPLIFIED_ARCHITECTURE.md` - Proposed daemon design
- `docs/QUEUE_BACKLOG_PLAN.md` - Backlog processing plan
- `COMPACTION.md` - Compaction limitations
