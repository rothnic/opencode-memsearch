# Queue Management & Backlog Processing Plan

## Problem Statement

Current issues:
1. **Multiple config files** - ~/.memsearch.toml exists in multiple locations
2. **No backlog processing** - Historical sessions aren't being processed when first discovering a project
3. **No prioritization** - Old sessions processed at same priority as new ones
4. **No rate limiting** - Can overwhelm system with too many concurrent jobs

## Solution: Smart Backlog Processing

### Phase 1: Config Consolidation

**Single Source of Truth**: `~/.config/opencode/memsearch/config.toml`

```toml
[milvus]
uri = "http://agentmemory-milvus.on.nickroth.com:19530"

[embedding]
provider = "ollama"
model = "embeddinggemma"
host = "http://100.79.168.98:11434"

[llm]
provider = "ollama"
model = "llama3.2"
host = "http://100.79.168.98:11434"

[search]
default_top_k = 10
min_score = 0.01

[processing]
# Backlog processing limits
max_concurrent_projects = 2
max_sessions_per_batch = 5
session_processing_delay_ms = 2000  # 2 seconds between sessions

# Prioritization weights
recent_session_weight = 10     # Sessions from last 24h
medium_session_weight = 5      # Sessions from last week
old_session_weight = 1         # Sessions older than week

# Auto-processing settings
auto_index_new_sessions = true
auto_compact_on_idle = false   # Disabled until Ollama compaction works
```

Remove all other ~/.memsearch.toml files and symlink to the single location.

### Phase 2: Backlog Detection

When a project is first discovered (session.created event):

1. **Query OpenCode database** for all unprocessed sessions
2. **Check existing indexed sessions** in Milvus
3. **Calculate backlog** = all_sessions - indexed_sessions
4. **Queue sessions with priority based on age**:
   - Last 24h: Priority 10
   - Last week: Priority 5
   - Older: Priority 1

### Phase 3: Rate-Limited Processing

Implement a "Backlog Processor" that:

1. **Limits concurrent projects** - Only process 2 projects at a time
2. **Batch processing** - Process max 5 sessions, then pause
3. **Priority queue** - Always process newest sessions first
4. **Time delays** - 2 second delay between sessions to avoid overwhelming
5. **Progress tracking** - Save state so we can resume after restart

### Phase 4: Priority Scheduling

Job priority calculation:
```
priority = base_priority + age_weight + project_priority

Where:
- base_priority: 0 for backlog, 10 for real-time
- age_weight: 10 (<24h), 5 (<7d), 1 (older)
- project_priority: 5 (active project), 1 (backlog project)
```

This ensures:
✅ New sessions in active projects processed first
✅ Recent backlog sessions processed before old ones
✅ Old sessions still get processed, just slowly
✅ Multiple projects don't starve each other

### Phase 5: Implementation Plan

**Files to modify:**

1. **lib/backlog-processor.ts** (new)
   - Detect unprocessed sessions
   - Calculate priorities
   - Queue with proper weights

2. **lib/memory-queue.ts**
   - Add priority calculation function
   - Support weighted job scheduling

3. **lib/memory-worker.ts**
   - Add rate limiting (delay between jobs)
   - Track concurrent project count
   - Implement project serialization

4. **hooks/session-created.ts**
   - Trigger backlog detection on first session
   - Only trigger once per project

5. **scripts/cleanup-configs.ts** (new)
   - Find and remove duplicate ~/.memsearch.toml files
   - Create symlinks to single location

**Data flow:**

```
session.created event
    ↓
Backlog Detection
    ↓
Calculate Priorities (newest first)
    ↓
Queue Jobs (with priority weights)
    ↓
Worker Rate-Limited Processing
    ↓
Incremental Updates (as new sessions created)
```

## Implementation Steps

1. Create backlog-processor.ts
2. Update memory-queue.ts with priority calculation
3. Add rate limiting to memory-worker.ts
4. Modify session-created.ts to trigger backlog on first discovery
5. Create config cleanup script
6. Test with multiple projects
7. Monitor queue status and adjust limits

## Success Metrics

- [ ] Config exists in only one location
- [ ] New sessions processed within 5 seconds
- [ ] Backlog sessions processed at 1-2 per minute
- [ ] No project waits more than 10 minutes for recent sessions
- [ ] Old sessions (30+ days) processed within 24 hours
- [ ] System remains responsive under load

## Testing Strategy

1. Start with empty queue
2. Open 3 projects with historical sessions
3. Verify prioritization (newest first)
4. Check rate limiting (not too fast)
5. Ensure no duplicate processing
6. Test restart recovery
