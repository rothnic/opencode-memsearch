# Plan: Strict ls-lint Implementation - Execution Phase

**Status**: Recovered from crash - Ready to execute  
**Recovery Source**: `.weave/RECOVERY_PLAN.md`  
**Original Plan**: `.weave/plans/strict-ls-lint-implementation.md`  
**Created**: 2026-04-02  
**Pre-requisites**: 
- cc-safety-net updated to prevent `git rm -rf` with uncommitted changes
- All previous work was lost, restoring from commit a740dee

---

## Problem Context

### What We're Solving
Implement strict file naming conventions using ls-lint with a deny-first configuration. The project needs:
- Required files at root (README.md, AGENTS.md)
- All source code consolidated in `src/`
- Clear separation of concerns (hooks, tools, core)
- No orphaned files at root

### What Went Wrong Before (Critical Context)
1. **No incremental commits** - All restructuring was staged but never committed
2. **Dangerous git command** - Attempted `git rm -rf ":"` which git interpreted as "remove everything recursively"
3. **Lost all progress** - Had to restore from HEAD, losing:
   - Directory restructuring (lib→src, hooks→src/opencode-hooks, tools→src/cli-tools)
   - Import path updates
   - Configuration changes
   - ~2 hours of work

### Prevention Measures Now Active
- cc-safety-net blocks `git rm -rf` when uncommitted changes exist
- Must commit after EACH phase in this plan
- Use regular `rm` for individual files, never `git rm` with special characters

---

## Key Decisions (LOCKED - Do Not Change)

### 1. Directory Organization: ALL Code in `src/`

**Rationale**: User explicitly stated multiple src-related directories "complicates things in terms of running tests, etc." and "All src should be in src unless it is a package or something completely different."

**Final Structure**:
```
src/
├── main.ts                    # Plugin entry (was index.ts)
├── config.ts                  # Configuration
├── state.ts                   # State management
├── cli-wrapper.ts             # CLI wrapper
├── cli-tools/                 # User-facing commands (was tools/)
│   ├── index.ts              # mem-index
│   ├── search.ts             # mem-search
│   ├── watch.ts              # mem-watch
│   ├── compact.ts            # mem-compact
│   ├── expand.ts             # mem-expand
│   ├── stats.ts              # mem-stats
│   ├── config.ts             # mem-config
│   ├── doctor.ts             # mem-doctor
│   ├── reset.ts              # mem-reset
│   ├── transcript.ts         # mem-transcript
│   └── version.ts            # mem-version
├── opencode-hooks/            # Event handlers (was hooks/)
│   ├── session-created.ts
│   ├── session-idle.ts
│   ├── session-deleted.ts
│   ├── session-compacting.ts
│   ├── system-transform.ts
│   ├── tool-executed.ts
│   └── message-updated.ts
├── queue/                     # Background jobs
├── processing/                # Session/memory processing
├── types/                     # Type definitions
├── collection/                # Collection management
├── llm/                       # LLM client
├── scheduler/                 # Schedulers
├── search/                    # Search utilities
├── config/                    # Config loading
└── storage/                   # Storage adapters
```

### 2. Files at Root

**Required** (MUST exist):
- README.md
- AGENTS.md
- src/ (directory)

**Optional but allowed**:
- LICENSE → LICENSE.md (rename for consistency)
- package.json
- tsconfig.json
- .gitignore
- .ls-lint.yml
- lefthook.yml
- .memsearch.toml
- .memsearch.yaml
- bun.lock

**Dot directories** (ignored by ls-lint):
- .github/
- .memsearch/
- .opencode/
- .ruff_cache/
- .sisyphus/
- .weave/

### 3. Import Path Mapping

| Before | After |
|--------|-------|
| `"./lib/config"` | `"./config"` |
| `"./lib/queue/memory-queue"` | `"./queue/memory-queue"` |
| `"./hooks/session-created"` | `"./opencode-hooks/session-created"` |
| `"./tools/search"` | `"./cli-tools/search"` |
| `"../lib/cli-wrapper"` (from cli-tools/) | `"../cli-wrapper"` |
| `"../lib/queue/backfill"` (from scripts/) | `"../src/queue/backfill"` |

---

## Execution Phases

### Phase 1: Cleanup & Safety

**Goal**: Remove dangerous/erroneous files and commit baseline

#### Task 1.1: Delete colon file
**Command**: `rm -f ":"` (NOT git rm)
**Why**: File named `:` causes git to interpret commands incorrectly

#### Task 1.2: Check for backup files
**Command**: `rm -f .ls-lint.yml.backup`

#### Task 1.3: Commit baseline
**Commands**:
```bash
git add -A
git commit -m "chore: clean up erroneous files before restructuring

- Remove ':' file that was causing git issues
- Remove backup file if exists
- Establish clean baseline for restructuring"
```

**Verification**: `git status` shows clean working tree

---

### Phase 2: Directory Restructure

**Goal**: Move all directories into src/ with git history preserved

#### Task 2.1: Create src/ subdirectories
```bash
mkdir -p src/cli-tools
mkdir -p src/opencode-hooks
```

#### Task 2.2: Move lib/ → src/ (preserve structure)
```bash
git mv lib/* src/
rmdir lib 2>/dev/null || true
```

#### Task 2.3: Move hooks/ → src/opencode-hooks/
```bash
git mv hooks/* src/opencode-hooks/
rmdir hooks 2>/dev/null || true
```

#### Task 2.4: Move tools/ → src/cli-tools/
```bash
git mv tools/* src/cli-tools/
rmdir tools 2>/dev/null || true
```

#### Task 2.5: Delete empty directories
```bash
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

#### Task 2.9: COMMIT
**Commands**:
```bash
git add -A
git commit -m "refactor: reorganize directory structure

- Move lib/ contents → src/
- Move hooks/ → src/opencode-hooks/
- Move tools/ → src/cli-tools/
- Move index.ts → src/main.ts
- Move memory/ → .memsearch/memory/
- Rename LICENSE → LICENSE.md
- Delete empty directories (logs, memsearch_data, tmpcd, .maestro)"
```

**Verification**: `ls -la` shows:
- src/ directory exists
- No lib/, hooks/, tools/, memory/ at root
- No empty directories
- LICENSE.md exists

---

### Phase 3: Update Import Statements

**Goal**: Fix all import paths to match new structure

#### Task 3.1: Update src/main.ts
**Changes**:
```typescript
// BEFORE:
import { onSessionCompacting } from "./hooks/session-compacting";
import { onSessionCreated } from "./hooks/session-created";
import { memIndexTool } from "./tools/index";
import loadConfig from "./lib/config";

// AFTER:
import { onSessionCompacting } from "./opencode-hooks/session-compacting";
import { onSessionCreated } from "./opencode-hooks/session-created";
import { memIndexTool } from "./cli-tools/index";
import loadConfig from "./config";
```

**Also update**:
- All dynamic imports: `import("./hooks/...")` → `import("./opencode-hooks/...")`
- All tool imports: `"./tools/"` → `"./cli-tools/"`
- Remove `"./lib/"` prefixes → `"./"`

#### Task 3.2: COMMIT
```bash
git commit -am "refactor: update imports in src/main.ts"
```

#### Task 3.3: Update src/cli-tools/*
**Pattern**: Change `from "../lib/..."` → `from "../..."`

**Files**:
- compact.ts, config.ts, doctor.ts, expand.ts, index.ts
- reset.ts, search.ts, stats.ts, transcript.ts, version.ts, watch.ts

#### Task 3.4: COMMIT
```bash
git commit -am "refactor: update imports in cli-tools"
```

#### Task 3.5: Update src/opencode-hooks/*
**Pattern**: Change `from "../lib/..."` → `from "../..."`

**Files**:
- session-compacting.ts, session-created.ts, session-deleted.ts
- session-idle.ts, system-transform.ts

#### Task 3.6: COMMIT
```bash
git commit -am "refactor: update imports in opencode-hooks"
```

#### Task 3.7: Update scripts/*
**Pattern**: Change `from "../lib/..."` → `from "../src/..."`

**Files**: All .ts files in scripts/ and subdirectories

#### Task 3.8: COMMIT
```bash
git commit -am "refactor: update imports in scripts"
```

---

### Phase 4: Configuration

**Goal**: Update package.json and create ls-lint config

#### Task 4.1: Update package.json
**Changes**:
```json
{
  "main": "src/main.ts",
  "exports": "./src/main.ts",
  "files": ["src/", "README.md", "LICENSE.md"]
}
```

#### Task 4.2: COMMIT
```bash
git commit -am "chore: update package.json for new structure"
```

#### Task 4.3: Write .ls-lint.yml
**Content** (from `.weave/design/strict-ls-lint-config.yml`):
```yaml
ls:
  .:
    README.md: screamingsnakecase
    AGENTS.md: screamingsnakecase
    LICENSE.md: screamingsnakecase
    package.json: kebabcase
    tsconfig.json: kebabcase
    src: kebabcase
  src:
    .ts: kebabcase
    .dir: kebabcase
  
ignore:
  - node_modules
  - .git
  - .memsearch
  - .sisyphus
  - .weave
  - .opencode
```

#### Task 4.4: COMMIT
```bash
git commit -am "chore: add strict ls-lint configuration"
```

---

### Phase 5: Validation

**Goal**: Verify everything works

#### Task 5.1: Run ls-lint
```bash
./node_modules/.bin/ls-lint
```
**Expected**: No violations

#### Task 5.2: Run TypeScript check
```bash
bun run typecheck
```
**Expected**: No errors

#### Task 5.3: Run tests
```bash
bun test --run
```
**Expected**: Tests pass (or fail for pre-existing reasons)

#### Task 5.4: Final commit
```bash
git commit -am "test: validation passes - ls-lint, typecheck complete"
```

---

## Tracking: What About .weave/ Directory?

**Question**: Should .weave/ contents be tracked or not?

**Analysis**:
- `.weave/plans/` - Plans for work: **SHOULD BE TRACKED** - valuable history of decisions
- `.weave/analysis/` - Analysis documents: **SHOULD BE TRACKED** - reference material
- `.weave/design/` - Design documents: **SHOULD BE TRACKED** - architectural decisions
- `.weave/state.json` - Runtime state: **SHOULD NOT BE TRACKED** - temporary, per-session

**Recommendation**: Add to `.gitignore`:
```
.weave/state.json
```

But keep plans, analysis, and design tracked. They provide valuable context for future work.

---

## Current State

**Starting Point**:
- Clean working tree at commit a740dee
- Original structure restored
- AGENTS.md preserved (untracked)
- .weave/ analysis and design preserved

**Next Action**: Delete `:` file and commit baseline

**Risk Mitigation**: 
- Commit after EVERY phase
- Use `git status` frequently
- Never use `git rm -rf` with special characters

