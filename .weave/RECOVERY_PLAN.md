# Recovery Plan: Strict ls-lint Implementation

**Status**: RESTORED - Starting from commit a740dee15793cc5f0f8aff2447eb280643ea1488  
**Original Plan**: `.weave/plans/strict-ls-lint-implementation.md`  
**Current State**: Original directory structure restored  
**Created**: 2026-04-02  

---

## Critical Lessons Learned

### What Went Wrong
1. **No commits during work** - All restructuring was staged but not committed
2. **Dangerous git command** - `git rm -rf ":"` interpreted as "remove everything"
3. **No rollback point** - Had to restore from original HEAD, losing all progress
4. **Special filename handling** - The `:` file couldn't be deleted safely

### Prevention Measures (Now in cc-safety-net)
- `git rm -rf` blocked entirely when uncommitted changes exist
- Must commit before any destructive git operation
- Use regular `rm` for individual files, not `git rm`

---

## Recovery Resume Point

### What Was Completed Before Crash
- [x] Phase 1.1-1.4: Setup and planning ✓ (files preserved in .weave/)
- [x] Created AGENTS.md ✓ (preserved, untracked)
- [x] Deleted empty directories ✓ (need to redo)
- [x] Moved lib/ → src/ ✓ (need to redo)
- [x] Moved hooks/ → src/opencode-hooks/ ✓ (need to redo)
- [x] Moved tools/ → src/cli-tools/ ✓ (need to redo)
- [x] Moved index.ts → src/main.ts ✓ (need to redo)
- [x] Renamed LICENSE → LICENSE.md ✓ (need to redo)
- [x] Updated package.json ✓ (need to redo)
- [x] Updated imports in src/main.ts ✓ (need to redo)
- [~] Updated imports in cli-tools/ ✗ (incomplete)
- [~] Updated imports in opencode-hooks/ ✗ (incomplete)
- [~] Updated imports in scripts/ ✗ (incomplete)

### What Was Working at Crash Time
- ls-lint passed ✓
- TypeScript compilation passed ✓
- All source code consolidated in src/ ✓
- Import paths updated for main.ts ✓

---

## Key Decisions (DO NOT CHANGE)

### Directory Organization
Based on user feedback, ALL source code goes in `src/`:

```
src/
├── main.ts                    # Plugin entry point (was index.ts)
├── config.ts                  # Configuration loading
├── state.ts                   # State management
├── cli-wrapper.ts             # CLI wrapper utilities
├── cli-tools/                 # CLI tool implementations (was tools/)
│   ├── index.ts              # mem-index command
│   ├── search.ts             # mem-search command
│   ├── watch.ts              # mem-watch command
│   ├── compact.ts            # mem-compact command
│   ├── expand.ts             # mem-expand command
│   ├── stats.ts              # mem-stats command
│   ├── config.ts             # mem-config command
│   ├── doctor.ts             # mem-doctor command
│   ├── reset.ts              # mem-reset command
│   ├── transcript.ts         # mem-transcript command
│   └── version.ts            # mem-version command
├── opencode-hooks/            # OpenCode integration (was hooks/)
│   ├── session-created.ts
│   ├── session-idle.ts
│   ├── session-deleted.ts
│   ├── session-compacting.ts
│   ├── system-transform.ts
│   ├── tool-executed.ts
│   └── message-updated.ts
├── queue/                     # Queue management (was lib/queue/)
├── processing/                # Session processing (was lib/processing/)
├── types/                     # Type definitions (was lib/types/)
├── collection/                # Collection management (was lib/collection/)
├── llm/                       # LLM client (was lib/llm/)
├── scheduler/                 # Scheduler (was lib/scheduler/)
├── search/                    # Search utilities (was lib/search/)
├── config/                    # Config loading (was lib/config/)
└── storage/                   # Storage adapters (was lib/storage/)
```

### Rationale
- **All code in src/**: Makes testing, building, and understanding the project simpler
- **No separate top-level directories**: Avoids confusion about where code lives
- **Clear naming**: `cli-tools` and `opencode-hooks` are descriptive

### Files at Root (Required + Optional)
```
Required:
- README.md
- AGENTS.md (created)
- src/ (directory)

Optional but allowed:
- LICENSE (will be LICENSE.md)
- package.json
- tsconfig.json
- .gitignore
- .ls-lint.yml
- lefthook.yml
- .memsearch.toml
- .memsearch.yaml
- bun.lock

Dot directories (optional):
- .github/
- .memsearch/
- .opencode/
- .ruff_cache/
- .sisyphus/
- .weave/
```

---

## Recovery Implementation Plan

### Phase 1: Setup & Safety (CRITICAL - COMMIT AFTER EACH STEP)

#### Task 1.1: Install ls-lint package ✅ ALREADY DONE
**Status**: Package already installed  
**Verification**: `./node_modules/.bin/ls-lint --version` shows v2.3.1

#### Task 1.2: Clean up dangerous files
**Files to delete**:
- `:` (erroneous colon file) - Use `rm -f ":"` NOT `git rm`
- `.ls-lint.yml.backup` if exists

**Commit point**: After deletion  
**Command**: `git add -A && git commit -m "chore: remove erroneous files before restructuring"`

#### Task 1.3: Document current state
**Reference**: `.weave/analysis/ls-lint-current-state.md` ALREADY EXISTS  
**Action**: Review and update if needed  
**Commit point**: If updated

---

### Phase 2: Directory Restructure (COMMIT AFTER ALL MOVES)

#### Task 2.1: Create src/ directory structure
```bash
# Create the new src/ layout
mkdir -p src/cli-tools
mkdir -p src/opencode-hooks
```

#### Task 2.2: Move lib/ → src/ (preserve git history)
```bash
git mv lib/* src/
# Note: lib/ should now be empty and will be removed
```

#### Task 2.3: Move hooks/ → src/opencode-hooks/
```bash
git mv hooks/* src/opencode-hooks/
```

#### Task 2.4: Move tools/ → src/cli-tools/
```bash
git mv tools/* src/cli-tools/
```

#### Task 2.5: Delete empty directories
```bash
# These should be empty now
rmdir lib 2>/dev/null || true
rmdir hooks 2>/dev/null || true
rmdir tools 2>/dev/null || true

# Delete other empty directories
rmdir logs 2>/dev/null || true
rmdir memsearch_data 2>/dev/null || true
rmdir tmpcd 2>/dev/null || true
rmdir .maestro 2>/dev/null || true
```

#### Task 2.6: Move memory/ → .memsearch/memory/
```bash
mkdir -p .memsearch/memory
git mv memory/* .memsearch/memory/
rmdir memory 2>/dev/null || true
```

#### Task 2.7: Move index.ts → src/main.ts
```bash
git mv index.ts src/main.ts
```

#### Task 2.8: Rename LICENSE → LICENSE.md
```bash
git mv LICENSE LICENSE.md
```

**CRITICAL COMMIT POINT**:  
```bash
git add -A
git commit -m "refactor: reorganize directory structure

- Move lib/ → src/
- Move hooks/ → src/opencode-hooks/
- Move tools/ → src/cli-tools/
- Move index.ts → src/main.ts
- Move memory/ → .memsearch/memory/
- Rename LICENSE → LICENSE.md
- Delete empty directories (logs, memsearch_data, tmpcd, .maestro)"
```

---

### Phase 3: Update Imports (COMMIT AFTER EACH GROUP)

#### Task 3.1: Update src/main.ts imports
**Before**:
```typescript
import { onSessionCompacting } from "./hooks/session-compacting";
import { memIndexTool } from "./tools/index";
import loadConfig from "./lib/config";
```

**After**:
```typescript
import { onSessionCompacting } from "./opencode-hooks/session-compacting";
import { memIndexTool } from "./cli-tools/index";
import loadConfig from "./config";
```

**Also update**:
- All dynamic imports (`await import("./hooks/...")` → `await import("./opencode-hooks/...")`)
- All tool imports ("./tools/" → "./cli-tools/")
- Remove all "./lib/" prefixes (now "./")

**Commit**: `git commit -am "refactor: update imports in src/main.ts"`

#### Task 3.2: Update src/cli-tools/ imports
**Pattern**: Change `from "../lib/..."` → `from "../..."`

**Files to update**:
- src/cli-tools/compact.ts
- src/cli-tools/config.ts
- src/cli-tools/doctor.ts
- src/cli-tools/expand.ts
- src/cli-tools/index.ts
- src/cli-tools/reset.ts
- src/cli-tools/search.ts
- src/cli-tools/stats.ts
- src/cli-tools/transcript.ts
- src/cli-tools/version.ts
- src/cli-tools/watch.ts

**Commit**: `git commit -am "refactor: update imports in cli-tools"`

#### Task 3.3: Update src/opencode-hooks/ imports
**Pattern**: Change `from "../lib/..."` → `from "../..."`

**Files to update**:
- src/opencode-hooks/session-compacting.ts
- src/opencode-hooks/session-created.ts
- src/opencode-hooks/session-deleted.ts
- src/opencode-hooks/session-idle.ts
- src/opencode-hooks/system-transform.ts

**Commit**: `git commit -am "refactor: update imports in opencode-hooks"`

#### Task 3.4: Update scripts/ imports
**Pattern**: Change `from "../lib/..."` → `from "../src/..."`

**Files**: All .ts files in scripts/ and subdirectories

**Commit**: `git commit -am "refactor: update imports in scripts"`

---

### Phase 4: Configuration & Validation (COMMIT AFTER VALIDATION)

#### Task 4.1: Update package.json
**Changes**:
```json
{
  "main": "src/main.ts",
  "exports": "./src/main.ts",
  "files": [
    "src/",
    "README.md",
    "LICENSE.md"
  ]
}
```

**Commit**: `git commit -am "chore: update package.json for new structure"`

#### Task 4.2: Create strict ls-lint.yml
**Reference**: `.weave/design/strict-ls-lint-config.yml`  
**Key points**:
- README.md and AGENTS.md required at root
- All source in src/
- No .ts files at root
- No extra .md files at root

**Commit**: `git commit -am "chore: add strict ls-lint configuration"`

#### Task 4.3: Update AGENTS.md
**Reference**: The preserved AGENTS.md (already updated)  
**Verify**: Document reflects final src/ structure

#### Task 4.4: Validation
**Commands**:
```bash
# 1. ls-lint check
./node_modules/.bin/ls-lint

# 2. TypeScript compilation
bun run typecheck

# 3. Test suite
bun test --run
```

**If all pass**:  
```bash
git commit -am "test: validation passes - ls-lint, typecheck, tests"
```

---

## Quick Reference: Import Path Mapping

| Before | After |
|--------|-------|
| `"./lib/config"` | `"./config"` (in src/) |
| `"./lib/queue/memory-queue"` | `"./queue/memory-queue"` (in src/) |
| `"./hooks/session-created"` | `"./opencode-hooks/session-created"` (in src/) |
| `"./tools/search"` | `"./cli-tools/search"` (in src/) |
| `"../lib/cli-wrapper"` | `"../cli-wrapper"` (from cli-tools/) |
| `"../lib/queue/backfill"` | `"../queue/backfill"` (from scripts/) |
| `"../lib/..."` | `"../src/..."` (from scripts/) |

---

## Recovery Checklist

- [ ] Phase 1: Delete dangerous files (`:`, backup)
- [ ] Phase 1: COMMIT
- [ ] Phase 2: Move directories (lib/, hooks/, tools/, memory/)
- [ ] Phase 2: Move files (index.ts, LICENSE)
- [ ] Phase 2: COMMIT
- [ ] Phase 3: Update src/main.ts imports
- [ ] Phase 3: COMMIT
- [ ] Phase 3: Update cli-tools imports
- [ ] Phase 3: COMMIT
- [ ] Phase 3: Update opencode-hooks imports
- [ ] Phase 3: COMMIT
- [ ] Phase 3: Update scripts imports
- [ ] Phase 3: COMMIT
- [ ] Phase 4: Update package.json
- [ ] Phase 4: COMMIT
- [ ] Phase 4: Write ls-lint.yml
- [ ] Phase 4: COMMIT
- [ ] Phase 4: Run validation (ls-lint, typecheck, tests)
- [ ] Phase 4: COMMIT
- [ ] Final: Push to remote

---

## Current State Summary

**STARTING FROM**: Original structure restored  
**UNTRACKED PRESERVED**:
- `.weave/analysis/ls-lint-current-state.md` - State analysis
- `.weave/design/strict-ls-lint-config.yml` - Config design
- `AGENTS.md` - Created documentation

**NEXT ACTION**: Delete `:` file using `rm -f ":"` (NOT git rm)

