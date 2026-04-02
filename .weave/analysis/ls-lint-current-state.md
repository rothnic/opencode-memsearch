# ls-lint Current State Analysis

**Date**: 2026-04-02
**Project**: opencode-memsearch
**Total Root Items**: 33 (15 directories, 18 files)

---

## Root Directory Inventory

### Files (18 total)

| # | File | Classification | Required? | Notes |
|---|------|----------------|-----------|-------|
| 1 | `:` | Artifact | DELETE | Erroneous file (just a colon) |
| 2 | `.DS_Store` | System | N/A | macOS system file, add to ignore |
| 3 | `.gitignore` | Config | Optional | Git ignore rules |
| 4 | `.ls-lint.yml` | Config | Optional | ls-lint configuration |
| 5 | `.memsearch.toml` | Config | Optional | MemSearch config (embedding/compact/llm) |
| 6 | `.memsearch.yaml` | Config | Optional | MemSearch config (extraction/defaults) |
| 7 | `bun.lock` | Lock file | Optional | Dependency lock |
| 8 | `index.ts` | Source | N/A | Moving to `src/main.ts` |
| 9 | `lefthook.yml` | Config | Optional | Git hooks config |
| 10 | `LICENSE` | License | Optional | MIT license |
| 11 | `package.json` | Config | Optional | Package configuration |
| 12 | `README.md` | Doc | **REQUIRED** | Must exist at root |
| 13 | `tsconfig.json` | Config | Optional | TypeScript config |

### Directories (15 total)

| # | Directory | Classification | Action | Notes |
|---|-----------|----------------|--------|-------|
| 1 | `.git/` | VCS | ignore | Git repository |
| 2 | `.github/` | GitHub | Optional | CI/CD workflows |
| 3 | `.maestro/` | Empty | **DELETE** | Empty directory |
| 4 | `.memsearch/` | Runtime | Optional | Runtime data |
| 5 | `.opencode/` | Config | Optional | OpenCode config |
| 6 | `.ruff_cache/` | Cache | Optional | Python cache |
| 7 | `.sisyphus/` | Personal | Optional | Personal notes/plans |
| 8 | `.weave/` | Weave | Optional | Weave plans |
| 9 | `config/` | Config | Optional | Milvus/docker configs |
| 10 | `docs/` | Docs | Optional | Documentation |
| 11 | `hooks/` | Hooks | **RENAME** | → `opencode-hooks/` |
| 12 | `lib/` | Source | **RENAME** | → `src/` (REQUIRED) |
| 13 | `logs/` | Empty | **DELETE** | Empty directory |
| 14 | `memory/` | Runtime | **MOVE** | → `.memsearch/memory/` |
| 15 | `memsearch_data/` | Empty | **DELETE** | Empty directory |
| 16 | `node_modules/` | Dependencies | ignore | npm packages |
| 17 | `scripts/` | Scripts | Optional | Mixed TS/shell/Python |
| 18 | `tmpcd/` | Empty | **DELETE** | Empty directory |
| 19 | `tools/` | Tools | **RENAME** | → `cli-tools/` |

---

## Classification Summary

| Category | Count | Items |
|----------|-------|-------|
| **REQUIRED Files** | 1 | README.md |
| **REQUIRED Dirs** | 1 | lib/ (renaming to src/) |
| **Optional Files** | 10 | .gitignore, .ls-lint.yml, .memsearch.toml, .memsearch.yaml, bun.lock, lefthook.yml, LICENSE, package.json, tsconfig.json |
| **Optional Dirs** | 10 | .github, .memsearch, .opencode, .ruff_cache, .sisyphus, .weave, config, docs, scripts |
| **To Delete** | 5 | `:`, .maestro/, logs/, memsearch_data/, tmpcd/ |
| **To Rename** | 3 | lib/→src/, hooks/→opencode-hooks/, tools/→cli-tools/ |
| **To Move** | 1 | memory/→.memsearch/memory/ |
| **System/Ignore** | 3 | .git/, .DS_Store, node_modules/ |

---

## Special Notes

### AGENTS.md Required
- Currently MISSING from root
- Must be created as required file
- Should document project structure and conventions

### Dual MemSearch Configs
Both `.memsearch.toml` and `.memsearch.yaml` are valid and different:
- `.memsearch.toml`: Contains embedding, compaction, LLM config
- `.memsearch.yaml`: Contains extraction, defaults config
- **DO NOT delete either**

### scripts/ Directory
- Mixed content: TypeScript, shell scripts, Python
- NOT appropriate to rename to `bin/` (bin implies executables only)
- Keep as `scripts/`

### Current ls-lint Status
Running `bunx ls-lint` currently shows violations in `.memsearch/sessions/` (screamingsnakecase rule), but these are in the ignore list already.

---

## Target State

After implementation:
- Root will have: README.md, AGENTS.md (required), LICENSE, package.json, tsconfig.json, bun.lock, .gitignore, .ls-lint.yml, lefthook.yml, .memsearch.toml, .memsearch.yaml
- Root directories: src/ (required), docs/, scripts/, config/, cli-tools/, opencode-hooks/, .github/, .memsearch/, .opencode/, .weave/, .sisyphus/, .ruff_cache/
- No TypeScript files at root
- No markdown files at root (except README.md, AGENTS.md)
- All runtime data in `.memsearch/`
