# MERGE_CHECKLIST.md - OpenCode Memsearch Consolidation

## Three Copies Analysis

### 1. Root (`/Users/nroth/workspace/opencode-memsearch/`)
**Files:** 73+ test scripts in root, hooks/, tools/, lib/, scripts/

**Unique Features to Preserve:**
- [x] `index.ts`: Backfill initialization, recurring jobs, event handlers
- [x] `lib/backfill.ts`: Backfill logic
- [x] `lib/unified-scheduler.ts`, `memory-extraction-scheduler.ts`: Scheduling
- [x] `lib/session-processor-agent.ts`, `session-generator.ts`: Processing
- [x] `lib/memory-config-monitor.ts`: Config monitoring
- [x] `lib/queue-cleanup.ts`: Cleanup utilities
- [x] `lib/session-indexer.ts`: Indexing logic
- [x] `lib/collection-*.ts`: Collection management
- [x] `lib/duplicate-detector.ts`: Deduplication
- [x] `lib/filter-builder.ts`: Filtering
- [x] `lib/prompt-builder.ts`: Prompts
- [x] `lib/scoped-writer.ts`: Writing utilities
- [x] `lib/tag-extractor.ts`: Tag extraction
- [x] `lib/memory-types.ts`, `memory-type-*.ts`: Type management
- [x] `lib/llm-client.ts`: LLM client
- [x] `lib/config-yaml.ts`: YAML config
- [x] `lib/compaction-capture.ts`: Compaction
- [x] `hooks/message-updated.ts`: Message update hook
- [x] `scripts/`: Various utility scripts (incremental-compaction, nightly-compaction, etc.)

**Issues to Fix:**
- [ ] Remove debug console.logs from `hooks/session-created.ts`
- [ ] Remove debug console.logs from `hooks/session-idle.ts` (if any)
- [ ] Root version has simplified session-idle (needs feature flag)

### 2. .opencode/plugin/memsearch/ (Production Version)
**Files:** Clean structure with tests/

**Unique Features to Merge:**
- [ ] `lib/toast.ts`: Toast notifications (not in root)
- [ ] `hooks/session-to-markdown.ts`: Markdown conversion (not in root)
- [ ] `hooks/session-idle.ts`: Rich LLM summarization (expensive - needs feature flag)
- [ ] `tests/`: Full test suite (not in root)
- [ ] `tools/backfill.ts`: mem-backfill tool (in root's lib/ but not tools/)
- [ ] `tools/history.ts`: mem-history tool (not in root)

**Better Implementations:**
- [ ] `hooks/session-created.ts`: Clean version without debug logs

### 3. packages/opencode-memsearch/ (Package Version)
**Files:** Similar to .opencode but with bin entries

**Unique Features to Merge:**
- [ ] `package.json`: bin entries (`om`, `opencode-memsearch`) for CLI
- [ ] `scripts/queue-status.ts`: Queue status utility
- [ ] `cli.ts`: CLI entry point (different from cli-wrapper.ts)

## Consolidation Plan

### Files to Merge/Update in Root:

1. **New files to add from .opencode:**
   - `lib/toast.ts` → copy to root
   - `hooks/session-to-markdown.ts` → copy to root
   - `tests/` → copy to root
   - `tools/backfill.ts` → check if needed (root has lib/backfill.ts)
   - `tools/history.ts` → copy to root

2. **Files to update (merge better implementations):**
   - `hooks/session-created.ts` → use .opencode version (no debug logs)
   - `hooks/session-idle.ts` → keep root's simple version, add feature flag for .opencode's rich version
   - `index.ts` → keep root's version (has backfill/recurring jobs)
   - `package.json` → add bin entries from packages/

3. **Debug cleanup:**
   - Remove all console.log from hooks/session-created.ts
   - Check other hooks for debug logs

4. **Test scripts cleanup:**
   - Move all `test-*.ts`, `check-*.ts`, `debug-*.ts` from root to `scripts/dev/`

## Feature Flags to Implement

Based on performance issues, these need feature flags:

| Feature | Default | Reason |
|---------|---------|--------|
| `enableBackfill` | true | Automatic backfill on first session |
| `enableSessionIdleSummarization` | false | EXPENSIVE - makes LLM calls per turn |
| `enableSystemTransform` | true | Search injection |
| `enableRecurringJobs` | true | 6-hour backfill check |
| `enableAsyncIndexing` | true | Debounced indexing |

## Verification Checklist

- [ ] All files from .opencode/plugin merged
- [ ] All files from packages/opencode-memsearch merged
- [ ] Debug logs removed from hooks
- [ ] Feature flags implemented
- [ ] Test scripts moved to scripts/dev/
- [ ] packages/ directory deleted
- [ ] .opencode/opencode.jsonc created
- [ ] Global config updated
- [ ] Typecheck passes
- [ ] No test files in root
</content>