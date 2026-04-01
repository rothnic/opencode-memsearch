# OpenCode Memsearch Cleanup and Performance Optimization Plan

## TL;DR
> **Summary**: Consolidate 3 duplicate plugin copies into a single canonical source, fix 7 critical performance issues (bunqueue memory leaks, blocking LLM calls, priority inversion), and establish clean architecture with proper feature flags and rate limiting.
> **Key Principle**: MINIMAL automatic processing - all heavy operations are opt-in
> **Estimated Effort**: Large (4-6 hours)

## Context

### Original Request
Clean up the opencode-memsearch project which has architectural confusion with THREE copies of the same plugin, fix critical performance issues, and consolidate to a flat structure.

### Key Findings

#### Three Copies of the Plugin
1. **Root** (`/Users/nroth/workspace/opencode-memsearch/`): Main development with 73 test scripts, complex initialization, backfill, recurring jobs
2. **packages/opencode-memsearch/**: Slightly cleaned version with bin entries (`om`, `opencode-memsearch`)
3. **.opencode/plugin/memsearch/**: Production-loaded version with OMO-style summarization, has tests and toast.ts

#### Performance Issues Identified
1. **bunqueue SQLite memory growth** - Embedded queue retains job history (removeOnComplete: 100, removeOnFail: 50)
2. **Per-turn LLM blocking calls** - `session-idle` hook makes synchronous HTTP calls to 9router
3. **Immediate indexing blocks** - `cli.index()` called synchronously on every turn
4. **Unbounded state growth** - `summarizedTurns` Set grows forever without pruning
5. **Priority inversion** - Real-time events priority 0, backfill 10-100 (should be opposite)
6. **No rate limiting** - Backfill queues 5000+ sessions instantly without throttling
7. **system-transform search** - Runs on every message with no caching, adds 200-500ms latency

#### File Count Analysis
- Root: 73 `test-*.ts`, `check-*.ts`, `debug-*.ts` scripts cluttering the root
- packages/: Duplicate of root with minor differences
- .opencode/plugin/: Production version with additional tests/

## Objectives

### Core Objective
Create a single, clean, performant OpenCode plugin for semantic memory search with feature flags for problematic components and proper resource management.

### Processing Philosophy: MINIMAL Automatic Processing

All heavy operations are **opt-in** and **conservatively batched**:

| Operation | Frequency | Trigger | Notes |
|-----------|-----------|---------|-------|
| **Indexing** | Max 1x per 60s per session | Debounced (60s of inactivity) | Batches rapid changes |
| **LLM Summarization** | On session end only | `session.idle` event | Requires `enableSessionIdleSummarization: true` |
| **Backfill** | Once per project on first session | `session.created` event | Conservative batching (10 sessions / 2s), 30min cooldown |
| **Session Created Hook** | Real-time | `session.created` event | Lightweight queue signal only |
| **System Transform** | Per-message | With 2min caching | Cached results, early exits |
| **Queue Cleanup** | Continuous | TTL-based | 24h for state, aggressive pruning |

**Default Disabled Features** (must explicitly enable):
- Session idle summarization (blocks, expensive)
- Verbose logging (console spam)

**Automatic Features** (conservatively batched):
- Backfill runs once per project on first session, then 30min cooldown
- Real-time indexing with 60s debounce per session

### Deliverables
- [ ] Single canonical plugin source at root level
- [ ] All test scripts moved to `scripts/` directory
- [ ] `.opencode/opencode.jsonc` loading root plugin
- [ ] Global config updated to use canonical plugin
- [ ] Feature flags to disable performance-heavy hooks
- [ ] Fixed bunqueue memory leaks (reduced retention)
- [ ] Session state cleanup (prune old entries)
- [ ] Fixed priority inversion
- [ ] Basic rate limiting on backfill
- [ ] Async LLM with timeout for session-idle
- [ ] Debounced indexing
- [ ] Search result caching
- [ ] Circuit breaker for failures

### Definition of Done
```bash
# All these commands should pass:
bun run typecheck
ls *.ts | grep -E "^(test|check|debug)-" | wc -l  # Should be 0
ls packages/ 2>/dev/null | wc -l  # Should be 0 (directory removed)
test -f .opencode/opencode.jsonc  # Should exist
grep -q "opencode-memsearch/index.ts" ~/.config/opencode/opencode.jsonc  # Should be present
```

### Guardrails (Must NOT)
- Do NOT break existing memsearch CLI functionality
- Do NOT lose any production features from .opencode/plugin/ version
- Do NOT delete without verifying content is merged to canonical
- Do NOT over-engineer - focus on quick wins first
- Do NOT add new dependencies without justification

## TODOs

### Phase 1: Structural Cleanup

- [x] **1.1 Merge best parts from all three copies**
  **What**: Consolidate code from root/, packages/, and .opencode/plugin/ into canonical root source
  **Files**:
  - Create: `MERGE_CHECKLIST.md` (temporary tracking)
  - Compare: `hooks/session-created.ts` (root has debug logs, packages/.opencode don't)
  - Compare: `index.ts` (root has backfill/recurring jobs, .opencode is cleaner)
  - Compare: `package.json` (packages has bin entries)
  - Compare: `.opencode/plugin/` has `toast.ts`, tests/, `session-to-markdown.ts`
  **Acceptance**: All unique features from each copy identified and merged

- [x] **1.2 Remove debug console.logs from hooks**
  **What**: Strip console.log statements from session-created.ts and other hooks
  **Files**: `hooks/session-created.ts`, `hooks/session-idle.ts`
  **Acceptance**: No console.log in hooks directory (console.error for actual errors OK)

- [ ] **1.3 Delete packages/ directory**
  **What**: Remove duplicate packages/opencode-memsearch/ after merging content
  **Files**: `rm -rf packages/`
  **Acceptance**: packages/ directory no longer exists

- [x] **1.4 Move test scripts to scripts/dev/**
  **What**: Relocate all 73 test-*.ts, check-*.ts, debug-*.ts from root to organized subdirectories
  **Files**:
  - Create: `scripts/dev/`, `scripts/tests/`, `scripts/debug/`
  - Move: `test-*.ts`, `check-*.ts`, `debug-*.ts`, `trace-*.ts`, `find-*.ts`
  **Acceptance**: Root has no files matching `test-*.ts`, `check-*.ts`, `debug-*.ts`

- [x] **1.5 Create .opencode/opencode.jsonc**
  **What**: Create local plugin config that loads from root
  **Files**: Create `.opencode/opencode.jsonc`
  ```jsonc
  {
    "$schema": "https://opencode.ai/config.json",
    "plugin": [
      "file:///Users/nroth/workspace/opencode-memsearch/index.ts"
    ]
  }
  ```
  **Acceptance**: File exists and references root index.ts

- [x] **1.6 Update global ~/.config/opencode/opencode.jsonc**
  **What**: Uncomment and update memsearch plugin entry to point to canonical source
  **Files**: `~/.config/opencode/opencode.jsonc`
  **Acceptance**: Global config loads `file:///Users/nroth/workspace/opencode-memsearch/index.ts`

### Phase 2: Critical Performance Fixes (Must Have)

- [x] **2.1 Add feature flags config system**
  **What**: Create configuration system to disable problematic hooks
  **Files**:
  - Modify: `config.ts` - add `FeatureFlags` interface
  - Modify: `types.ts` - add `FeatureFlags` type
  ```typescript
  interface FeatureFlags {
    enableBackfill?: boolean;        // default: true
    enableSessionIdleHook?: boolean; // default: false (performance hit)
    enableSystemTransform?: boolean; // default: true
    enableRecurringJobs?: boolean;   // default: true
    enableAsyncIndexing?: boolean;   // default: true
    maxQueueRetention?: number;      // default: 10 (was 100)
  }
  ```
  **Acceptance**: Config loads feature flags from environment and .memsearch.yaml

- [x] **2.2 Fix bunqueue memory leaks**
  **What**: Reduce job retention and add periodic cleanup
  **Files**: `lib/memory-queue.ts`
  **Changes**:
  ```typescript
  // Reduce retention from 100/50 to 10/5
  removeOnComplete: 10,  // was 100
  removeOnFail: 5,       // was 50
  ```
  **Acceptance**: Memory usage stays bounded during long runs

- [x] **2.3 Add session state cleanup**
  **What**: Prune old entries from summarizedTurns Set and lastSessionProcessTime Map
  **Files**: `state.ts`, `lib/memory-queue.ts` (add cleanup call)
  **Changes**:
  ```typescript
  // Add cleanup function
  export function cleanupOldState(maxAgeMs: number = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, time] of state.lastSessionProcessTime) {
      if (time < cutoff) {
        state.lastSessionProcessTime.delete(id);
        state.summarizedSessions.delete(id);
      }
    }
  }
  ```
  **Acceptance**: State doesn't grow unbounded, old entries pruned after 24h

- [x] **2.4 Fix priority inversion**
  **What**: Real-time events should have higher priority than backfill
  **Files**: `lib/memory-queue.ts`, `lib/backfill.ts`
  **Changes**:
  ```typescript
  // In memory-queue.ts - signalSessionActivity
  const priority = data?.priority ?? (type === "backfill" ? 100 : 10);
  
  // In backfill.ts - calculatePriority
  // Keep existing age-based but ensure minimum is 50
  return Math.max(50, calculatedPriority);
  ```
  **Acceptance**: session-created (priority 10) processes before backfill (priority 50+)

- [x] **2.5 Add basic rate limiting to backfill**
  **What**: Limit concurrent backfill batches and add delay between batches
  **Files**: `lib/backfill.ts`
  **Changes**:
  ```typescript
  const BATCH_SIZE = 10;        // was 50
  const BATCH_DELAY_MS = 2000;  // was 500
  const MAX_CONCURRENT_BATCHES = 2;
  ```
  **Acceptance**: Backfill processes max 10 sessions every 2 seconds

- [x] **2.6 Add session-idle hook disable option (DEFAULT: OFF)**
  **What**: Make session-idle hook optional via feature flag; DISABLED by default to prevent blocking
  **Files**: `index.ts`, `hooks/session-idle.ts`
  **Changes**:
  ```typescript
  // In index.ts - default to disabled to prevent performance issues
  "session.idle": config.featureFlags?.enableSessionIdleSummarization === true
    ? onSessionIdle 
    : async () => {},
  ```
  **Config**:
  ```json
  {
    "memsearch": {
      "featureFlags": {
        "enableSessionIdleSummarization": false  // Default: OFF
      }
    }
  }
  ```
  **Acceptance**: session-idle hook disabled by default; must explicitly enable

- [x] **2.7 Implement conservative automatic backfill (DEFAULT: ON)**
  **What**: Run backfill automatically on first session for a project, with conservative batching and cooldown
  **Files**: `index.ts`, `lib/memory-queue.ts`, `lib/backfill.ts`
  **Changes**:
  ```typescript
  // In index.ts - run backfill once per project on first session
  let backfillInitialized = new Set<string>(); // Track per project
  
  // On session.created:
  const projectId = ctx.project?.id || ctx.directory;
  if (!backfillInitialized.has(projectId)) {
    backfillInitialized.add(projectId);
    // Run conservative backfill in background
    runConservativeBackfill(projectId).catch(() => {});
  }
  
  // Conservative settings:
  const BATCH_SIZE = 10;           // Process 10 sessions at a time
  const BATCH_DELAY_MS = 2000;     // 2 second pause between batches
  const COOLDOWN_MS = 30 * 60000;  // 30 minute cooldown before next backfill
  const MAX_SESSIONS_PER_BACKFILL = 100; // Limit to recent 100 sessions
  ```
  **Backfill only runs when**:
  1. First session is created for a project
  2. 30 minutes have passed since last backfill
  3. Manual trigger via `mem-backfill` tool
  
  **Acceptance**: 
  - Backfill runs automatically on first project session
  - Processes max 10 sessions per 2 seconds
  - Waits 30 minutes before considering another backfill
  - Limits to 100 most recent sessions

### Phase 3: Architecture Improvements (Should Have)

- [ ] **3.1 Async LLM calls with timeout (per-session only)**
  **What**: Convert session-idle LLM calls to async with timeout; only run when session ends, NOT per-turn
  **Files**: `hooks/session-idle.ts`, `lib/memory-pipeline.ts`
  **Changes**:
  ```typescript
  // Only summarize when session ends, not per-turn
  const LLM_TIMEOUT_MS = 10000; // 10s timeout (generous for local 9router)
  const MIN_SESSION_MESSAGES = 5; // Only summarize sessions with substance
  
  async function callLLMWithTimeout<T>(
    fn: () => Promise<T>, 
    timeoutMs: number
  ): Promise<T | null> {
    return Promise.race([
      fn(),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
      )
    ]).catch(() => null);
  }
  ```
  **Acceptance**: LLM calls timeout after 10s, only run on session end, skip sessions with <5 messages

- [ ] **3.2 Debounced indexing (conservative)**
  **What**: Debounce indexing calls to batch changes - only index after 60s of inactivity per session
  **Files**: `lib/memory-pipeline.ts`, `tools/index.ts`
  **Changes**:
  ```typescript
  const indexingDebounceMap = new Map<string, NodeJS.Timeout>();
  const MIN_INDEX_INTERVAL_MS = 60000; // 60 seconds minimum between indexing
  
  export function debouncedIndex(
    sessionId: string, 
    fn: () => Promise<void>,
    delayMs: number = MIN_INDEX_INTERVAL_MS
  ) {
    const existing = indexingDebounceMap.get(sessionId);
    if (existing) {
      // Reset timer on new activity
      clearTimeout(existing);
    }
    
    const timeout = setTimeout(() => {
      indexingDebounceMap.delete(sessionId);
      fn().catch(() => {});
    }, delayMs);
    
    indexingDebounceMap.set(sessionId, timeout);
  }
  ```
  **Acceptance**: Indexing happens at most once per 60s per session; resets on new activity

- [ ] **3.3 Search result caching (aggressive)**
  **What**: Cache search results for system-transform with longer TTL
  **Files**: `hooks/system-transform.ts`
  **Changes**:
  ```typescript
  const searchCache = new Map<string, { results: any; timestamp: number }>();
  const CACHE_TTL_MS = 120000; // 2 minutes
  const MAX_CACHE_SIZE = 100; // Prevent unbounded growth
  
  function getCachedSearch(query: string, sourceId: string) {
    const key = `${sourceId}:${query}`;
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.results;
    }
    return null;
  }
  
  function setCachedSearch(query: string, sourceId: string, results: any) {
    // Evict oldest if cache too large
    if (searchCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    searchCache.set(`${sourceId}:${query}`, { results, timestamp: Date.now() });
  }
  ```
  **Acceptance**: Same query within 2min returns cached results; cache capped at 100 entries

- [ ] **3.4 Circuit breaker for failures**
  **What**: Prevent cascade failures by breaking circuit after repeated errors
  **Files**: `lib/circuit-breaker.ts` (new), `hooks/system-transform.ts`, `lib/memory-pipeline.ts`
  **Changes**:
  ```typescript
  // Simple circuit breaker
  class CircuitBreaker {
    private failures = 0;
    private lastFailure = 0;
    private readonly threshold = 5;
    private readonly resetTimeoutMs = 60000;
    
    isOpen(): boolean {
      if (this.failures >= this.threshold) {
        if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
          this.failures = 0;
          return false;
        }
        return true;
      }
      return false;
    }
    
    recordSuccess() { this.failures = 0; }
    recordFailure() { 
      this.failures++;
      this.lastFailure = Date.now();
    }
  }
  ```
  **Acceptance**: After 5 failures, circuit opens for 60s before retrying

- [ ] **3.5 Optimize system-transform search**
  **What**: Add early exit and batch search to reduce latency
  **Files**: `hooks/system-transform.ts`
  **Changes**:
  - Skip search if query is too short (< 10 chars)
  - Skip if query is a command (starts with `/`)
  - Batch all source searches into single call if possible
  **Acceptance**: system-transform adds <50ms for short/command queries

### Phase 4: Nice to Have

- [ ] **4.1 Queue status tool**
  **What**: Add tool to inspect queue health and pending jobs
  **Files**: Create `tools/queue-status.ts`
  **Acceptance**: Tool shows queue depth, processing rate, recent errors

- [ ] **4.2 Health check endpoint**
  **What**: Simple health check for monitoring
  **Files**: Create `lib/health.ts`, update `tools/doctor.ts`
  **Acceptance**: Tool reports queue health, memory usage, recent errors

- [ ] **4.3 Monitoring/metrics**
  **What**: Track and expose key metrics
  **Files**: Create `lib/metrics.ts`
  **Metrics to track**:
  - Sessions processed per hour
  - Average indexing latency
  - Search latency (p50, p95, p99)
  - Queue depth
  - Error rate
  **Acceptance**: Metrics exposed via tool or logged periodically

## Verification

- [ ] All tests pass: `bun test`
- [ ] Typecheck passes: `bun run typecheck`
- [ ] No test scripts in root: `ls *.ts | grep -E "^(test|check|debug)-" | wc -l` == 0
- [ ] Single canonical source: `test -d packages && echo "FAIL" || echo "PASS"`
- [ ] Plugin loads correctly: Start OpenCode, verify memsearch tools available
- [ ] Performance: Backfill processes max 10 sessions per 2 seconds
- [ ] Feature flags work: Disable `enableSessionIdleHook`, verify hook not called
- [ ] Memory bounded: Run for 1 hour, memory usage doesn't grow unbounded

## Implementation Order

1. **Phase 1 first** - Must complete structural cleanup before any other changes
2. **Phase 2 in order** - Each performance fix builds on previous
3. **Phase 3 parallel** - Can implement improvements in any order
4. **Phase 4 optional** - Only if time permits after core fixes

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Keep .opencode/plugin/ backup until verification complete |
| Lost features during merge | Use MERGE_CHECKLIST.md to track all features |
| Performance regression | Test with feature flags off first |
| Plugin fails to load | Keep previous version in git history, easy rollback |

## Testing Strategy

1. **Unit tests**: Test config loading, feature flags, state cleanup
2. **Integration tests**: Test queue operations with reduced retention
3. **E2E tests**: Full session flow with plugin enabled
4. **Performance tests**: Monitor memory and latency during backfill

## Notes

- The .opencode/plugin/memsearch/ version appears to be the most "production" ready
- Root version has more features (backfill, recurring jobs) but also more debug code
- packages/ version has bin entries which are useful for CLI usage
- Must preserve all unique features from each version during merge
