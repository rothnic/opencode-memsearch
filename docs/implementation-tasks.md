# Implementation Tasks

## Task 1: Config Consolidation
**File**: `scripts/cleanup-configs.ts`

1. Find all `~/.memsearch.toml` files:
   - `~/.memsearch.toml`
   - `~/.config/opencode/memsearch/.memsearch.toml`
   - Any other locations

2. Consolidate to: `~/.config/opencode/memsearch/config.toml`

3. Update config format for 9router:
```toml
[milvus]
uri = "http://agentmemory-milvus.on.nickroth.com:19530"

[embedding]
provider = "ollama"
model = "embeddinggemma"
host = "http://100.79.168.98:11434"

[llm]
provider = "openai"  # Use 9router's OpenAI-compatible endpoint
model = "if/kimi-k2-thinking"
api_key = "sk-..."  # From 9router dashboard
base_url = "http://localhost:20128/v1"

[processing]
max_concurrent_projects = 2
max_sessions_per_batch = 5
session_processing_delay_ms = 2000
```

4. Create symlinks from old locations to new
5. Delete duplicate configs

## Task 2: Backlog Detection Integration
**Files**: `hooks/session-created.ts`, `lib/backlog-processor.ts`

1. On first `session.created` for a project:
   - Check if backlog has been processed
   - Query OpenCode database for all sessions
   - Check Milvus for already-indexed sessions
   - Calculate backlog (not indexed)
   - Queue with priority (recent first)
   - Mark backlog as processed for project

2. Priority calculation:
   - Last 24h: Priority 10
   - Last week: Priority 5
   - Older: Priority 1
   - Within same priority: newest first

## Task 3: Content Hashing (Upsert Support)
**Files**: `lib/session-indexer.ts`, `lib/memory-pipeline.ts`

1. When indexing a session:
   - Calculate content hash (SHA256 of session messages)
   - Check `indexed.json` for existing entry
   - If hash matches: skip (no changes)
   - If hash different or new: process and update hash
   - If existing but different: delete old, insert new

2. Update `indexed.json` format:
```json
{
  "sessions": {
    "ses_abc123": {
      "indexedAt": 1771348459578,
      "contentHash": "sha256:abc123...",
      "status": "indexed",
      "chunks": 15,
      "lastModified": 1771348459000
    }
  }
}
```

## Task 4: Rate-Limited Worker
**File**: `lib/memory-worker.ts`

1. Add delay between job processing:
   - 2 second delay between sessions
   - 10 second pause every 5 sessions
   
2. Limit concurrent projects:
   - Track active projects being processed
   - Max 2 concurrent projects
   - Queue jobs from other projects with lower priority

3. Progress persistence:
   - Save processing state to SQLite
   - Resume on plugin restart

## Task 5: 9router LLM Integration
**Files**: `~/.config/opencode/memsearch/config.toml`, `lib/memory-pipeline.ts`

1. Config for 9router:
```toml
[llm]
provider = "openai"
base_url = "http://localhost:20128/v1"
api_key = "sk-..."  # User copies from 9router dashboard
model = "if/kimi-k2-thinking"  # Free tier model
```

2. Update compaction to use 9router:
   - memsearch CLI should read LLM config from config.toml
   - If 9router not available, skip compaction (don't fail)
   - Log which model is being used

## Task 6: Testing & Verification

1. Test config consolidation:
   ```bash
   bun run scripts/cleanup-configs.ts
   ls -la ~/.memsearch.toml  # Should be symlink
   cat ~/.config/opencode/memsearch/config.toml
   ```

2. Test backlog detection:
   - Open new project with historical sessions
   - Check queue: `om queue-status`
   - Verify recent sessions queued first
   - Verify old sessions queued with low priority

3. Test content hashing:
   - Index session
   - Check `indexed.json` for hash
   - Trigger re-index
   - Verify skipped (no changes)
   - Modify session
   - Verify re-indexed

4. Test rate limiting:
   - Open 3 projects simultaneously
   - Check only 2 process at once
   - Verify delays between sessions

## Success Criteria

- [ ] Config exists in only one location
- [ ] 9router configured for LLM tasks
- [ ] Backlog auto-detected on first session
- [ ] Recent sessions processed before old ones
- [ ] Unchanged sessions skipped on re-processing
- [ ] Max 2 projects processed concurrently
- [ ] Rate limiting prevents system overload
- [ ] All tests pass
