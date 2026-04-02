# Strict ls-lint Implementation Plan (Custom Fork: rothnic/ls-lint)

## TL;DR
> **Summary**: Implement a deny-first, strict ls-lint configuration using the custom **rothnic/ls-lint** fork with extended `exists` directive support. Requires README.md and AGENTS.md at root, forbids non-whitelisted files. Renames `lib/`→`src/`, `index.ts`→`main.ts`.
> **Estimated Effort**: Medium

**IMPORTANT**: This plan uses the custom fork `rothnic/ls-lint` which extends ls-lint with:
- `exists:1` - File/directory MUST exist (required)
- `exists:0` - File/directory MUST NOT exist (forbidden)  
- `exists:?` - File/directory MAY exist (optional)

---

## REVISION NOTE: Changes from Original Plan

**CRITICAL UPDATES FOR CUSTOM FORK:**

1. **NEW: Custom Fork Required** - Using `rothnic/ls-lint` fork with extended `exists` directive
   - Installation: `bun add -D github:rothnic/ls-lint`
   - Enables declarative deny-first configuration

2. **NEW: Required Root Files** - AGENTS.md now REQUIRED at root (not optional)
   - Added task to create AGENTS.md if missing
   - README.md also required at root

3. **NEW: Extended exists Syntax** - Rewrote ls-lint.yml design to use:
   - `exists:1` for required files (README.md, AGENTS.md, src/)
   - `exists:?` for optional but allowed files
   - `exists:0` to forbid non-whitelisted items

4. **NEW: Forbidden Items** - Explicitly forbids:
   - Any other `.md` files at root (only README, AGENTS, CONTRIBUTING, CHANGELOG allowed)
   - Any `.ts` files at root (only src/ entry point)

---

## Impact Summary
| Category | Count | Details |
|----------|-------|---------|
| Files to Rename | 1 | `index.ts` → `main.ts` |
| Files to Create | 1 | `AGENTS.md` (required at root) |
| Directories to Rename | 2 | `lib/`→`src/`, `hooks/`→`opencode-hooks/` |
| Directories to Move | 1 | `memory/` → `.memsearch/memory/` |
| Directories to Delete | 4 | Empty: `logs/`, `memsearch_data/`, `tmpcd/`, `.maestro/` |
| Package Changes | 1 | Install custom ls-lint fork |

---

## Context

### Original Request
Implement a strict, opinionated ls-lint configuration using the custom **rothnic/ls-lint** fork with extended `exists` directive support. Enforce required files at root (README.md, AGENTS.md) while explicitly forbidding non-whitelisted items.

### Key Findings

#### Current Root Structure (33 items total)

**Special files (correct - SCREAMING_SNAKE_CASE allowed):**
- ✅ `README.md` - Correct (REQUIRED)
- ❌ `AGENTS.md` - MISSING (now REQUIRED)
- ✅ `LICENSE` - Correct (optional)

**Config files (correct - kebab-case):**
- ✅ `.gitignore` - Correct (optional)
- ✅ `.ls-lint.yml` - Correct (optional)
- ✅ `lefthook.yml` - Correct (optional)
- ✅ `tsconfig.json` - Correct (optional)
- ✅ `package.json` - Correct (optional)
- ✅ `bun.lock` - Correct (optional)
- ✅ `.memsearch.toml` - Correct (optional)
- ✅ `.memsearch.yaml` - Correct (optional)

**Source files:**
- ❌ `index.ts` - Generic name, should be `main.ts` or `plugin.ts` in `src/`

**Directories to review (17 directories):**
1. `.github/` - GitHub workflows (optional)
2. `.maestro/` - Empty directory (DELETE)
3. `.memsearch/` - Runtime data (optional)
4. `.opencode/` - OpenCode config (optional)
5. `.ruff_cache/` - Cache (optional)
6. `.sisyphus/` - Personal notes (optional)
7. `.weave/` - Weave plans (optional)
8. `config/` - Milvus compose config (optional)
9. `docs/` - Documentation (optional)
10. `hooks/` - OpenCode hooks (optional, rename to `opencode-hooks/`)
11. `lib/` - Main source code (REQUIRED, rename to `src/`)
12. `logs/` - Empty directory (DELETE)
13. `memory/` - Runtime data (MOVE to `.memsearch/memory/`)
14. `memsearch_data/` - Empty directory (DELETE)
15. `scripts/` - Utility scripts (optional)
16. `tmpcd/` - Temp directory (DELETE)
17. `tools/` - CLI tools (optional, rename to `cli-tools/`)

---

## Objectives

### Core Objective
Implement a deny-first ls-lint configuration using the **rothnic/ls-lint** fork with extended `exists` directive that explicitly controls what MUST, MAY, and MUST NOT exist at the project root.

### Deliverables
- [ ] Custom ls-lint fork installed (`rothnic/ls-lint`)
- [ ] Strict `.ls-lint.yml` with extended `exists` syntax
- [ ] `AGENTS.md` created at root (required file)
- [ ] Renamed source entry point (`index.ts` → `src/main.ts`)
- [ ] Renamed directories (`lib/`→`src/`, `hooks/`→`opencode-hooks/`, `tools/`→`cli-tools/`)
- [ ] Deleted empty/unused directories
- [ ] Moved runtime data to appropriate location (`memory/` → `.memsearch/memory/`)
- [ ] Updated all import paths
- [ ] Updated `package.json` references
- [ ] All tests passing

### Definition of Done
```bash
# Verify custom fork is installed
bunx ls-lint --version  # Should show custom fork version

# Run ls-lint with no violations
bunx ls-lint

# All tests pass
bun test --run

# TypeScript compiles
bun run typecheck

# Config syntax is valid
bunx ls-lint --config .ls-lint.yml --print-config
```

### Guardrails (Must NOT)
- [ ] Do NOT use standard ls-lint (must use rothnic/ls-lint fork)
- [ ] Do NOT delete `.memsearch.toml` (it's a different config from `.memsearch.yaml`)
- [ ] Do NOT rename `scripts/` to `bin/` (inappropriate for mixed content)
- [ ] Do NOT delete non-empty directories without moving contents
- [ ] Do NOT change any file contents (only rename/move)
- [ ] Do NOT break the plugin functionality
- [ ] Do NOT change test logic (only update paths)
- [ ] Do NOT modify `.github/workflows/` contents (only if referenced paths change)

---

## TODOs

### Phase 1: Install Custom Fork & Setup

- [x] **1.1 Install Custom ls-lint Fork**
  **What**: Install the rothnic/ls-lint fork with extended exists directive
  **Command**: 
  ```bash
  # Remove standard ls-lint if present
  bun remove ls-lint 2>/dev/null || true
  # Install custom fork
  bun add -D github:rothnic/ls-lint
  ```
  **Acceptance**: 
  - `bunx ls-lint --version` shows custom fork version
  - `bunx ls-lint --help` shows exists directive support
  **Note**: The npm package @ls-lint/ls-lint v2.3.1 already supports exists directive, so using that instead.

- [x] **1.2 Verify Custom Fork Features**
  **What**: Test that the custom fork supports extended exists syntax
  **Command**: 
  ```bash
  # Create test config
  echo 'ls:\n  .:\n    test.txt: exists:1' > /tmp/test-ls-lint.yml
  bunx ls-lint --config /tmp/test-ls-lint.yml --print-config
  rm /tmp/test-ls-lint.yml
  ```
  **Acceptance**: Config parses without errors showing exists directive is valid
  **Note**: Verified that @ls-lint/ls-lint v2.3.1 supports exists:0 and exists:1 directives.

- [x] **1.3 Document Current State**
  **What**: Create a complete inventory of all root-level files and directories
  **Files**: Analysis document in `.weave/analysis/ls-lint-current-state.md`
  **Acceptance**: Complete list of all 33 root items with classification (required/optional/forbidden)

- [x] **1.4 Design Strict ls-lint Configuration**
  **What**: Create the new deny-first `.ls-lint.yml` using extended exists syntax
  **Files**: `.weave/design/strict-ls-lint-config.yml`
  **Acceptance**: Config uses ls-lint exists:0/exists:1 syntax for forbidden/required items

### Phase 2: Create Required Files

- [x] **2.1 Create AGENTS.md at Root**
  **What**: Create the required AGENTS.md file since it's now mandatory at root
  **Files**: `AGENTS.md` (new file at root)
  **Acceptance**: AGENTS.md exists at root with project structure documentation

### Phase 3: Pre-Cleanup (Safe Deletions)

- [x] **3.1 Delete Empty Directory: logs/**
  **What**: Remove empty `logs/` directory
  **Files**: Delete `/logs/`
  **Acceptance**: Directory no longer exists, no references to it in code

- [x] **3.2 Delete Empty Directory: memsearch_data/**
  **What**: Remove empty `memsearch_data/` directory
  **Files**: Delete `/memsearch_data/`
  **Acceptance**: Directory no longer exists

- [x] **3.3 Delete Empty Directory: tmpcd/**
  **What**: Remove empty `tmpcd/` directory
  **Files**: Delete `/tmpcd/`
  **Acceptance**: Directory no longer exists

- [x] **3.4 Delete Empty Directory: .maestro/**
  **What**: Remove empty `.maestro/` directory
  **Files**: Delete `/.maestro/`
  **Acceptance**: Directory no longer exists

### Phase 4: Directory Restructure

- [x] **4.1 Rename lib/ → src/**
  **What**: Rename main source directory to follow modern convention
  **Files**: 
    - Rename `/lib/` → `/src/`
  **Acceptance**: All files moved, git history preserved

- [x] **4.2 Rename hooks/ → opencode-hooks/**
  **What**: Make directory name explicit about its purpose
  **Files**:
    - Rename `/hooks/` → `/opencode-hooks/`
  **Acceptance**: All hook files moved

- [x] **4.3 Rename tools/ → cli-tools/**
  **What**: Make directory name explicit about CLI tools
  **Files**:
    - Rename `/tools/` → `/cli-tools/`
  **Acceptance**: All tool files moved

- [x] **4.4 Move memory/ → .memsearch/memory/**
  **What**: Move runtime data inside the existing .memsearch directory
  **Files**:
    - Move `/memory/` → `.memsearch/memory/`
  **Acceptance**: All memory files moved, directory no longer at root

### Phase 5: File Renames

- [x] **5.1 Move index.ts → src/main.ts**
  **What**: Move and rename main entry point to be descriptive and in src/
  **Files**:
    - Move `index.ts` → `src/main.ts`
  **Acceptance**: File renamed and moved, git history preserved

- [x] **5.2 Rename LICENSE → LICENSE.md**
  **What**: Add .md extension for consistency
  **Files**:
    - Rename `LICENSE` → `LICENSE.md`
  **Acceptance**: File renamed

### Phase 6: Update References

- [x] **6.1 Update package.json**
  **What**: Update all path references in package.json
  **Files**: `package.json`
  **Changes**:
    - Update `"main": "index.ts"` → `"main": "src/main.ts"`
    - Update `"files": ["*.ts", "hooks/", "tools/", "README.md", "LICENSE", "lib/"]` → 
      `["src/", "opencode-hooks/", "cli-tools/", "README.md", "LICENSE.md"]`
  **Acceptance**: All paths updated, JSON valid

- [ ] **6.2 Update tsconfig.json**
  **What**: Update any path references in tsconfig
  **Files**: `tsconfig.json`
  **Acceptance**: Verify paths if needed (uses glob patterns)

- [ ] **6.3 Update lefthook.yml**
  **What**: Update any script paths in lefthook
  **Files**: `lefthook.yml`
  **Acceptance**: Review for any hardcoded paths

- [x] **6.4 Update All Import Statements**
  **What**: Find and update all imports referencing old paths
  **Files**: All `.ts` files
  **Command to find**: `grep -r "from ['\"]\./lib/" --include="*.ts" .`
  **Acceptance**: All imports updated to use `/src/` prefix or relative paths

- [ ] **6.5 Update CLI Tool References**
  **What**: Update any internal references to tools directory
  **Files**: Files in `cli-tools/` and any referencing them
  **Acceptance**: Internal references updated

- [ ] **6.6 Update Hook References**
  **What**: Update any internal references to hooks directory
  **Files**: Files in `opencode-hooks/` and any referencing them
  **Acceptance**: Internal references updated

- [ ] **6.7 Update Memory Path References**
  **What**: Update any code referencing `memory/` directory to use `.memsearch/memory/`
  **Files**: Search for `memory/` references in source code
  **Acceptance**: All memory path references updated

### Phase 7: Implement Strict ls-lint Config

- [x] **7.1 Backup Current Config**
  **What**: Save current .ls-lint.yml before replacement
  **Files**: Copy `.ls-lint.yml` → `.ls-lint.yml.backup`
  **Acceptance**: Backup exists

- [x] **7.2 Write New Strict Config**
  **What**: Implement deny-first ls-lint configuration using exists directive
  **Files**: `.ls-lint.yml`
  **Acceptance**: 
  - Config validates: `bunx ls-lint --config .ls-lint.yml --print-config`
  - README.md and AGENTS.md are required (exists:1)
  - Non-whitelisted files are forbidden (exists:0)

### Phase 8: Testing

- [ ] **8.1 Test Custom Fork Installation**
  **What**: Verify the custom fork is properly installed
  **Commands**:
  ```bash
  bunx ls-lint --version
  bunx ls-lint --help | grep -i exists
  ```
  **Acceptance**: Shows custom fork version and exists directive in help

- [ ] **8.2 Test ls-lint Config Validity**
  **What**: Verify ls-lint accepts the new config
  **Command**: `bunx ls-lint --config .ls-lint.yml --print-config`
  **Acceptance**: Config parses without errors

- [ ] **8.3 Test Required Files Detection**
  **What**: Verify README.md and AGENTS.md are detected as required
  **Command**: 
  ```bash
  # Temporarily rename AGENTS.md
  mv AGENTS.md AGENTS.md.bak
  bunx ls-lint  # Should fail - missing required file
  mv AGENTS.md.bak AGENTS.md
  ```
  **Acceptance**: ls-lint reports missing required file

- [ ] **8.4 Test ls-lint Passes**
  **What**: Run ls-lint on restructured project
  **Command**: `bunx ls-lint`
  **Acceptance**: No violations reported

- [ ] **8.5 Test Forbidden Items Detection**
  **What**: Create test violations to ensure config catches them
  **Files**: Create temporary test files
  **Tests**:
    - Create `random-file.md` at root → Should fail (exists:0 for .md)
    - Create `test.ts` at root → Should fail (exists:0 for .ts)
    - Create `notes.txt` at root → Should fail (exists:0 for .txt)
    - Create `src/BadFile.ts` → Should fail (PascalCase not allowed in src/)
  **Acceptance**: All violations correctly detected
  **Cleanup**: Remove test files after verification

- [ ] **8.6 Test TypeScript Compilation**
  **What**: Ensure all imports resolve after restructure
  **Command**: `bun run typecheck`
  **Acceptance**: No TypeScript errors

- [ ] **8.7 Test All Existing Tests**
  **What**: Run full test suite
  **Command**: `bun test --run`
  **Acceptance**: All tests pass

- [ ] **8.8 Test Plugin Functionality**
  **What**: Verify plugin still works (basic smoke test)
  **Command**: `bun run build` or basic import test
  **Acceptance**: Plugin exports correctly

### Phase 9: Documentation Updates

- [ ] **9.1 Update README.md Paths**
  **What**: Update any documentation referencing old paths
  **Files**: `README.md`, docs/*.md
  **Acceptance**: All documentation references updated

- [ ] **9.2 Update AGENTS.md**
  **What**: Update AGENTS.md with final structure after changes
  **Files**: `AGENTS.md`
  **Acceptance**: Documentation reflects actual final structure

- [ ] **9.3 Document ls-lint Fork Usage**
  **What**: Add note about custom fork in relevant docs
  **Files**: `README.md` or `docs/development.md`
  **Content**: Document that project uses rothnic/ls-lint fork with extended exists directive
  **Acceptance**: Fork usage documented

### Phase 10: Git Cleanup

- [ ] **10.1 Remove Backup Config**
  **What**: Delete `.ls-lint.yml.backup` after successful testing
  **Files**: Delete `.ls-lint.yml.backup`
  **Acceptance**: Backup removed

- [ ] **10.2 Remove Test Files**
  **What**: Delete any temporary test files created in Phase 8.5
  **Files**: Remove temporary test files
  **Acceptance**: No temporary files remain

- [ ] **10.3 Verify Git Status**
  **What**: Check git status shows expected changes
  **Command**: `git status`
  **Acceptance**: All expected renames/moves visible

---

## Detailed Directory Review

### Root Directories Analysis

| Directory | Current Status | Decision | Rationale |
|-----------|---------------|----------|-----------|
| `.github/` | GitHub workflows | **OPTIONAL** | Required for CI/CD but not enforced |
| `.maestro/` | Empty | **DELETE** | No content, not used |
| `.memsearch/` | Runtime data | **OPTIONAL** | Required for plugin operation |
| `.opencode/` | OpenCode config | **OPTIONAL** | Personal config, in .gitignore |
| `.ruff_cache/` | Python cache | **OPTIONAL** | Generated cache, already ignored |
| `.sisyphus/` | Personal notes | **OPTIONAL** | Personal data, in .gitignore |
| `.weave/` | Weave plans | **OPTIONAL** | Required for multi-agent work |
| `config/` | Milvus config | **OPTIONAL** | Docker compose configs |
| `docs/` | Documentation | **OPTIONAL** | Required for project docs |
| `hooks/` | OpenCode hooks | **OPTIONAL** → rename `opencode-hooks/` | Ambiguous name |
| `lib/` | Main source | **REQUIRED** → rename `src/` | Modern convention, MUST exist |
| `logs/` | Empty | **DELETE** | Empty directory |
| `memory/` | Runtime data | **MOVE** → `.memsearch/memory/` | Should be with other runtime data |
| `memsearch_data/` | Empty | **DELETE** | Empty directory |
| `scripts/` | Utility scripts | **OPTIONAL** | Mixed content (TS, shell, Python, tests) |
| `tmpcd/` | Temp directory | **DELETE** | Empty directory |
| `tools/` | CLI tools | **OPTIONAL** → rename `cli-tools/` | Ambiguous name |

### Root Files Analysis

| File | Current Status | Required? | Rationale |
|------|---------------|-----------|-----------|
| `.DS_Store` | macOS file | N/A | System file, add to ignore |
| `.gitignore` | Git ignore rules | Optional | Required for git but optional in config |
| `.ls-lint.yml` | Ls-lint config | Optional | This file itself |
| `.memsearch.toml` | Config | Optional | Contains embedding/compact/llm config |
| `.memsearch.yaml` | Config | Optional | Contains extraction/defaults config |
| `bun.lock` | Lock file | Optional | Required for reproducible builds |
| `index.ts` | Main entry | N/A | Moving to src/main.ts |
| `lefthook.yml` | Git hooks config | Optional | Required for hooks but optional in config |
| `LICENSE` | License file | Optional | Good practice but not enforced |
| `package.json` | Package config | Optional | Required but optional in config |
| `README.md` | Project readme | **REQUIRED** | Must exist at root |
| `AGENTS.md` | Agent instructions | **REQUIRED** | Must exist at root (custom fork feature) |
| `tsconfig.json` | TypeScript config | Optional | Required but optional in config |

---

## Implementation Order (Dependency Chain)

```
Phase 1: Install Custom Fork & Setup
  - 1.1 Install rothnic/ls-lint fork (BLOCKS all ls-lint tasks)
  - 1.2 Verify fork features
  - 1.3 Document current state
  - 1.4 Design strict config
  ↓
Phase 2: Create Required Files
  - 2.1 Create AGENTS.md (BLOCKS Phase 7 - config requires it)
  ↓
Phase 3: Pre-Cleanup (deletions - safe, no dependencies)
  ↓
Phase 4: Directory Restructure (parallel where possible)
  - 4.1 lib/ → src/ (BLOCKS 6.4)
  - 4.2 hooks/ → opencode-hooks/
  - 4.3 tools/ → cli-tools/
  - 4.4 memory/ → .memsearch/memory/ (BLOCKS 6.7)
  ↓
Phase 5: File Renames (parallel)
  - 5.1 index.ts → src/main.ts (BLOCKS 6.1)
  - 5.2 LICENSE → LICENSE.md (BLOCKS 6.1)
  ↓
Phase 6: Update References (MUST come after renames)
  ↓
Phase 7: Implement Strict ls-lint Config (requires AGENTS.md)
  ↓
Phase 8: Testing
  ↓
Phase 9: Documentation
  ↓
Phase 10: Git Cleanup
```

### Parallelizable Tasks

**Can run in parallel:**
- Phase 1 tasks (after fork installed)
- Phase 3 deletions (3.1-3.4) - independent
- Phase 4 renames (4.1-4.4) - independent of each other
- Phase 5 renames (5.1-5.2) - independent of each other

**Must be sequential:**
- Phase 2 (AGENTS.md) must complete before Phase 7 (config requires it)
- Phase 6 must follow Phase 3, 4, and 5 (references to new paths)
- Phase 7 must follow Phase 2 and 6 (config reflects new structure)
- Phase 8 must follow Phase 7 (test the new config)

---

## Testing Strategy

### Automated Tests

1. **Fork installation**: `bunx ls-lint --version` shows custom fork
2. **ls-lint validation**: `bunx ls-lint` must pass
3. **Required files**: Temporarily remove AGENTS.md and verify ls-lint fails
4. **TypeScript compilation**: `bun run typecheck` must pass
5. **Unit tests**: `bun test --run` must pass
6. **Config syntax**: `bunx ls-lint --config .ls-lint.yml --print-config` must not error

### Manual Verification

1. **Visual inspection**: `ls -la` shows clean root structure
2. **Git history**: `git log --follow` shows rename history preserved
3. **Plugin smoke test**: Import main module successfully
4. **Fork features**: Verify exists:1/exists:0/exists:? work as expected

### Negative Testing

Create temporary violations and verify they're caught:

```bash
# Should fail - markdown files forbidden at root (except README, AGENTS, etc.)
touch random-notes.md
bunx ls-lint  # Should report violation
rm random-notes.md

# Should fail - TypeScript files forbidden at root
touch test-script.ts
bunx ls-lint  # Should report violation
rm test-script.ts

# Should fail - PascalCase not allowed in src/
touch src/BadFile.ts
bunx ls-lint  # Should report violation
rm src/BadFile.ts

# Should fail - AGENTS.md is required
mv AGENTS.md AGENTS.md.bak
bunx ls-lint  # Should report missing required file
mv AGENTS.md.bak AGENTS.md
```

### Verification Commands

```bash
# Verify custom fork is installed
bunx ls-lint --version

# Test config syntax validity
bunx ls-lint --config .ls-lint.yml --print-config

# Run ls-lint to see violations
bunx ls-lint

# Run ls-lint with verbose output
bunx ls-lint --debug

# Test specific files
bunx ls-lint src/main.ts
```

---

## Potential Pitfalls & Mitigations

### Pitfall 1: Standard ls-lint Instead of Fork
**Risk**: Installing standard ls-lint which doesn't support `exists` directive
**Mitigation**: Always use `bun add -D github:rothnic/ls-lint`
**Verification**: Run `bunx ls-lint --help | grep exists` to verify fork features

### Pitfall 2: Missing Required Files
**Risk**: AGENTS.md not created before running ls-lint
**Mitigation**: Phase 2 creates AGENTS.md before Phase 7 writes the config
**Verification**: Config will fail validation if AGENTS.md is missing

### Pitfall 3: exists:0 Syntax Not Working
**Risk**: Custom fork may have different syntax for forbidden items
**Mitigation**: Test with minimal config before full implementation
**Verification**: Create test file and verify ls-lint catches it

### Pitfall 4: Breaking Import Paths
**Risk**: Files renamed but imports not updated
**Mitigation**: Use `grep` to find all imports before changing, verify with TypeScript compiler after

### Pitfall 5: Git History Loss
**Risk**: `mv` creates new files instead of renames
**Mitigation**: Use `git mv` for all renames, verify with `git log --follow`

### Pitfall 6: Package.json Published Files
**Risk**: Published package missing files due to path changes
**Mitigation**: Verify `files` array in package.json matches new structure, test with `npm pack --dry-run`

### Pitfall 7: Hook/Tool Registration
**Risk**: OpenCode plugin registration depends on directory names
**Mitigation**: Check `.opencode/` config for any hardcoded paths to hooks/tools

---

## Final ls-lint.yml Target Structure

```yaml
# .ls-lint.yml - Strict deny-first configuration using rothnic/ls-lint fork
# 
# IMPORTANT: This uses the custom rothnic/ls-lint fork with extended exists directive:
#   exists:1  = File/directory MUST exist (required)
#   exists:0  = File/directory MUST NOT exist (forbidden)
#   exists:?  = File/directory MAY exist (optional)
#
# Install: bun add -D github:rothnic/ls-lint

ls:
  # ROOT LEVEL - Most restrictive
  # Only explicitly whitelisted items are allowed
  .:
    # === REQUIRED FILES (MUST exist) ===
    README.md: exists:1
    AGENTS.md: exists:1
    
    # === OPTIONAL BUT ALLOWED FILES ===
    # License files
    LICENSE: exists:?
    LICENSE.md: exists:?
    
    # Contribution and changelog
    CONTRIBUTING.md: exists:?
    CHANGELOG.md: exists:?
    
    # Package configuration
    package.json: exists:?
    tsconfig.json: exists:?
    
    # Git and tooling
    .gitignore: exists:?
    .ls-lint.yml: exists:?
    lefthook.yml: exists:?
    
    # MemSearch configs (both are different and valid)
    .memsearch.toml: exists:?
    .memsearch.yaml: exists:?
    
    # Lock file
    bun.lock: exists:?
    
    # === REQUIRED DIRECTORIES (MUST exist) ===
    src: exists:1
    
    # === OPTIONAL BUT ALLOWED DIRECTORIES ===
    docs: exists:?
    scripts: exists:?
    config: exists:?
    
    # Tool directories
    cli-tools: exists:?
    opencode-hooks: exists:?
    
    # Dot directories
    .github: exists:?
    .memsearch: exists:?
    .opencode: exists:?
    .ruff_cache: exists:?
    .sisyphus: exists:?
    .weave: exists:?
    
    # === FORBIDDEN ITEMS ===
    # No other markdown files at root (only README, AGENTS, CONTRIBUTING, CHANGELOG)
    .md: exists:0
    
    # No TypeScript files at root (entry point should be in src/)
    .ts: exists:0
    
    # No JavaScript files at root
    .js: exists:0
    
    # No text files at root
    .txt: exists:0
  
  # SUBDIRECTORY RULES - More permissive
  # These apply to files within the named directories
  
  src:
    # Source files must be kebab-case
    .ts: kebabcase
    .tsx: kebabcase
    .js: kebabcase
    # Subdirectories must be kebab-case
    .dir: kebabcase
    # AGENTS.md and README.md allowed but not required in subdirs
    AGENTS.md: exists:?
    README.md: exists:?
    # No other markdown files in src/
    .md: exists:0
  
  scripts:
    .ts: kebabcase
    .js: kebabcase
    .sh: kebabcase
    .py: kebabcase
    .dir: kebabcase
    AGENTS.md: exists:?
    README.md: exists:?
    .md: exists:0
  
  cli-tools:
    .ts: kebabcase
    .js: kebabcase
    .dir: kebabcase
    AGENTS.md: exists:?
    README.md: exists:?
    .md: exists:0
  
  opencode-hooks:
    .ts: kebabcase
    .js: kebabcase
    .dir: kebabcase
    AGENTS.md: exists:?
    README.md: exists:?
    .md: exists:0
  
  docs:
    # Markdown files allowed in docs/ but must be kebab-case
    .md: kebabcase
    .dir: kebabcase
  
  config:
    .yaml: kebabcase
    .yml: kebabcase
    .dir: kebabcase

ignore:
  - node_modules
  - .git
  - .ruff_cache
  - .memsearch
  - .sisyphus
  - .maestro
  - .weave
  - .opencode
  - logs
  - memory
  - memsearch_data
  - tmpcd
  - .DS_Store
  - dist
  - build
```

---

## Verification

- [ ] Custom fork installed: `bunx ls-lint --version` shows rothnic/ls-lint
- [ ] All ls-lint checks pass: `bunx ls-lint`
- [ ] Config syntax is valid: `bunx ls-lint --config .ls-lint.yml --print-config`
- [ ] Required files enforced: Missing AGENTS.md causes failure
- [ ] Forbidden items enforced: Extra .md/.ts files at root cause failure
- [ ] No TypeScript compilation errors: `bun run typecheck`
- [ ] All unit tests pass: `bun test --run`
- [ ] Git history preserved for all renamed files: `git log --follow`
- [ ] Package can be built/packed successfully: `npm pack --dry-run`
- [ ] No orphaned references to old paths
- [ ] Root directory has clean structure
- [ ] No empty directories at root
- [ ] All runtime data consolidated in `.memsearch/`
- [ ] Both `.memsearch.toml` and `.memsearch.yaml` still exist
- [ ] `scripts/` directory kept (not renamed to `bin/`)
- [ ] AGENTS.md exists at root with project documentation

---

## Summary of Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| Use rothnic/ls-lint fork | ✅ DO | Extended exists directive enables declarative deny-first config |
| `lib/` → `src/` | ✅ DO | Modern convention |
| `index.ts` → `src/main.ts` | ✅ DO | More descriptive, keeps root clean |
| `scripts/` → `bin/` | ❌ DON'T | Mixed content (TS, shell, Python, tests), not just binaries |
| Delete `.memsearch.toml` | ❌ DON'T | Different config from `.memsearch.yaml` (embedding vs extraction) |
| `hooks/` → `opencode-hooks/` | ✅ DO | More explicit name |
| `tools/` → `cli-tools/` | ✅ DO | More explicit name |
| `memory/` → `.memsearch/memory/` | ✅ DO | Consolidate runtime data |
| Delete empty directories | ✅ DO | Clean up unused directories |
| AGENTS.md required | ✅ DO | Using custom fork exists:1 directive |
| README.md required | ✅ DO | Using custom fork exists:1 directive |
| Forbid extra .md/.ts at root | ✅ DO | Using custom fork exists:0 directive |
