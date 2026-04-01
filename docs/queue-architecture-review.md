# Queue Architecture Review & Recommendations

## Current System Overview

### Job Types Defined
1. **session-created** - Main processing job (used for backfill + real-time)
2. **session-idle** - Compaction when session goes idle
3. **session-deleted** - Cleanup (not implemented)
4. **manual-index** - Manual indexing via CLI
5. **backfill** - Recurring 6h check
6. **generate-markdown** - REMNANT (defined in interface but broken)

### Triggers

| Trigger | Source | Frequency | Job Type | Priority |
|---------|--------|-----------|----------|----------|
| Plugin Load | `startBackfillInBackground()` | Once | session-created | 100/50/10 (age-based) |
| Session Created | OpenCode event | Real-time | session-created | 0 (default) |
| Session Idle | OpenCode event | Real-time | session-idle | 0 (default) |
| Recurring | `upsertJobScheduler` | Every 6h | backfill | 0 |
| Manual | User tool call | On-demand | manual-index | 10 |

### Processing Flow

```
Job Added to Queue
    ↓
Worker (concurrency=1) picks up job
    ↓
Check: Is project already processing?
    ├─ YES → Re-queue with 10s delay, return deferred
    └─ NO → Mark project processing
              ↓
         Process job
              ↓
         Unmark project
```

### Rate Limiting Layers

1. **Worker concurrency**: 1 job at a time globally
2. **Project serialization**: 1 job per project at a time
3. **Pipeline rate limit**: 1 minute between indexing jobs (line 11, 98-119 in memory-pipeline.ts)
4. **Arbitrary delays**: In generate-markdown (0s, 5s, 30s, 60s based on age)

## Critical Issues Found

### 🔴 Issue 1: Broken generate-markdown Handler
**Location**: `lib/memory-pipeline.ts` lines 41-93

The `generate-markdown` job type handler still exists but:
- It's been removed from backfill.ts (now uses session-created directly)
- It tries to queue ANOTHER session-created job with arbitrary delays
- This creates duplicate jobs and confusion

**Impact**: When generate-markdown job is processed, it creates a nested session-created job

### 🔴 Issue 2: Double/Triple Rate Limiting
**Current**: 
- Worker: 1 concurrent job globally
- Project lock: 1 per project
- Pipeline: 1 minute between ANY indexing
- Arbitrary delays: 0-60s based on age

**Problem**: Multiple overlapping rate limits create unpredictable behavior. A job might be delayed by:
1. Project lock (10s)
2. Global pipeline limit (up to 60s)
3. Age-based delay (0-60s)

### 🔴 Issue 3: Backfill Queues Everything Immediately
**Location**: `lib/backfill.ts` lines 124-127

```typescript
for (const session of sessions) {
    await queueSession(session);  // No delay, no batching
    queued++;
}
```

With 5421 sessions, this fires 5421 jobs into the queue instantly. SQLite queue must handle all the writes.

### 🔴 Issue 4: Priority System Not Working
**Current priority assignment**:
- Backfill: 100 (<24h), 50 (<7d), 10 (older)
- Real-time events: 0 (not set)
- Manual: 10

**Problem**: Real-time sessions get priority 0, but backfill recent gets 100. So backfill blocks real-time!

### 🟡 Issue 5: Recurring Backfill Re-queues Everything
**Location**: `lib/backfill.ts` line 143

Every 6 hours, `checkForUnprocessedSessions()` calls `backfillAllSessions()`, which queues ALL sessions again. While deduplication exists (60s TTL), it's not effective for a 6h period.

### 🟡 Issue 6: No Progress Tracking
There's no way to know:
- How many jobs are queued
- How many processed
- What's the backlog
- Which sessions are indexed

## Recommended Fixes

### Fix 1: Remove generate-markdown Completely
```typescript
// Remove from memory-queue.ts interface
// Remove handler from memory-pipeline.ts
// Clean up any references
```

### Fix 2: Simplify Rate Limiting
**Option A**: Remove pipeline rate limit, keep project serialization
**Option B**: Remove project serialization, keep pipeline 1/min
**Recommendation**: Option A - Project serialization is more intuitive

### Fix 3: Fix Priority System
Real-time events should have HIGHEST priority:
```typescript
// Real-time session created
priority: 200

// Real-time session idle  
priority: 150

// Backfill recent (<1h)
priority: 100

// Backfill today
priority: 50

// Backfill older
priority: 10

// Manual
priority: 250
```

### Fix 4: Batch Backfill with Delays
```typescript
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000; // 1 second between batches

for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(queueSession));
    
    // Pause between batches to let queue breathe
    if (i + BATCH_SIZE < sessions.length) {
        await sleep(BATCH_DELAY_MS);
    }
}
```

### Fix 5: Smart Backfill (Check Before Queue)
```typescript
// Only queue sessions not already in queue or recently processed
async function queueSession(session) {
    const alreadyQueued = await isSessionQueued(session.id);
    if (alreadyQueued) return;
    
    const recentlyProcessed = await isSessionRecentlyProcessed(session.id);
    if (recentlyProcessed) return;
    
    await signalSessionActivity(...);
}
```

### Fix 6: Remove Console Logs
All `[memsearch]` logs should be removed or converted to debug-only.

## Ideal Architecture

```
Event Triggers:
├─ session.created (real-time) → priority 200
├─ session.idle (real-time) → priority 150
├─ manual-index (user) → priority 250
└─ backfill (6h recurring) → priority 10-100 based on age

Worker:
├─ Concurrency: 1-3 (configurable)
├─ Pick highest priority job first
├─ Project serialization: optional
└─ No arbitrary delays

Backfill:
├─ Batch size: 100
├─ Batch delay: 1s
├─ Check if already queued before adding
└─ Process newest first
```

## Questions for You

1. **Concurrency**: Should we process 1, 2, or 3 sessions simultaneously?
2. **Project serialization**: Do we need to ensure only 1 session per project at a time?
3. **Backfill frequency**: Is 6 hours good, or should it be daily?
4. **Age cutoff**: Should we only backfill sessions from last 30 days, or all time?
5. **Progress visibility**: Do you want a `om queue-status` command to see progress?