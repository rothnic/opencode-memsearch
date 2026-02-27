# Simplified Queue Architecture

## Core Insight

**Memsearch already handles upserts** - we don't need content hashing!

## Simplified Design

### 1. Tracking State (Per Session)

Instead of content hashing, track simply:
```json
{
  "sessions": {
    "ses_abc123": {
      "lastMessageId": "msg_456",
      "lastProcessedAt": 1771348459578,
      "status": "indexed"
    }
  }
}
```

When processing:
- Query messages after `lastMessageId`
- Append new messages to session markdown
- Update `lastMessageId`

### 2. Global Background Daemon

**No more session hooks!** Instead:

```typescript
// lib/session-daemon.ts

class SessionDaemon {
  private isRunning = false;
  private pollIntervalMs = 5000; // 5 seconds
  
  async start() {
    this.isRunning = true;
    while (this.isRunning) {
      await this.processCycle();
      await sleep(this.pollIntervalMs);
    }
  }
  
  private async processCycle() {
    // 1. Query ALL recent sessions from OpenCode DB
    const recentSessions = await this.queryRecentSessions();
    
    // 2. Sort by priority:
    //    - Recently active projects first
    //    - Within project: newest sessions first
    const prioritized = this.prioritize(recentSessions);
    
    // 3. Queue top N sessions for processing
    for (const session of prioritized.slice(0, 5)) {
      await queueSession(session);
    }
  }
}
```

### 3. Priority Algorithm

```typescript
function calculatePriority(session: Session): number {
  const now = Date.now();
  const projectLastActive = getProjectLastActive(session.projectId);
  const sessionAge = now - session.lastActive;
  
  // Priority components:
  // 1. Project recency (0-100)
  const projectScore = Math.max(0, 100 - (now - projectLastActive) / (1000 * 60 * 60));
  
  // 2. Session recency (0-50)
  const sessionScore = Math.max(0, 50 - sessionAge / (1000 * 60 * 60));
  
  // 3. Backfill bonus (0-10) for old sessions
  const backfillScore = sessionAge > (7 * 24 * 60 * 60 * 1000) ? 10 : 0;
  
  return projectScore + sessionScore + backfillScore;
}
```

This ensures:
- ✅ Active projects get priority
- ✅ New sessions processed quickly
- ✅ Old sessions still get processed (backfill)
- ✅ No duplicate processing (memsearch upserts)

### 4. Processing Flow

```
┌─────────────────────────────────────────┐
│         Background Daemon               │
│  (polls every 5s)                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Query OpenCode DB                      │
│  - Get sessions updated since last poll │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Check State                            │
│  - Has new messages?                    │
│  - Is project active?                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Calculate Priority                     │
│  - Project activity score               │
│  - Session recency score                │
│  - Backfill bonus                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Queue in Bunqueue                      │
│  - Priority-based ordering              │
│  - Rate limiting (2s delay)             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Worker Processes                       │
│  - Generate markdown                    │
│  - Index in memsearch (upsert)          │
│  - Update state                         │
└─────────────────────────────────────────┘
```

### 5. Benefits

**Compared to event-driven approach:**

| Aspect | Event-Driven | Daemon Approach |
|--------|-------------|-----------------|
| Complexity | High (hooks, events) | Low (single loop) |
| Race Conditions | Many (concurrent sessions) | None (serialized) |
| Global Prioritization | Hard | Easy |
| Backfill Control | Difficult | Built-in |
| Resource Usage | Event spikes | Smooth continuous |
| Testing | Complex | Simple |

### 6. Implementation

**Files to create:**

1. `lib/session-daemon.ts` - Main daemon loop
2. `lib/session-prioritizer.ts` - Priority calculation
3. `lib/session-state.ts` - Simple state tracking (last message ID)

**Files to remove/modify:**

1. Remove: `hooks/session-created.ts` event handling
2. Remove: `hooks/session-idle.ts` event handling  
3. Remove: `lib/backlog-processor.ts` (replaced by daemon)
4. Modify: `index.ts` - Start daemon instead of hooks

### 7. Configuration

```toml
# ~/.config/memsearch/config.toml

[daemon]
poll_interval_ms = 5000
max_concurrent_sessions = 3
rate_limit_ms = 2000
backfill_enabled = true

[daemon.priorities]
active_project_bonus = 100
recent_session_hours = 24
backfill_batch_size = 10
```

### 8. Example Run

```
10:00:00 - Daemon polls DB
         - Finds 3 active sessions
         - Queues: ses_1 (priority 150), ses_2 (priority 120), ses_3 (priority 80)

10:00:02 - Worker starts ses_1
10:00:04 - Worker starts ses_2  
10:00:06 - Worker starts ses_3

10:00:30 - Daemon polls again
         - Finds 1 new session (ses_4, priority 200)
         - Finds 50 old sessions (backfill, priority 10-30)
         - Queues ses_4 immediately
         - Queues 5 backfill sessions

10:00:32 - Worker starts ses_4 (high priority)
10:00:34 - Worker starts old_backfill_1
...
```

## Decision

**Should we implement this daemon approach?**

Pros:
- ✅ Much simpler than event-driven
- ✅ Better prioritization
- ✅ Easier to test and debug
- ✅ No race conditions
- ✅ Built-in backfill

Cons:
- ⚠️ Requires always-running process
- ⚠️ Needs DB polling (minor overhead)

**Recommendation**: YES - this is cleaner and more maintainable.
