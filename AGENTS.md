# AGENTS.md

## Project Overview

**OpenCode MemSearch** - Semantic memory search plugin for OpenCode

This plugin provides persistent memory capabilities for OpenCode agents through semantic search using Milvus vector database.

---

## Directory Structure

```
.
├── src/                           # All source code
│   ├── main.ts                   # Plugin entry point
│   ├── config.ts                 # Configuration loading
│   ├── state.ts                  # State management
│   ├── cli-wrapper.ts            # CLI wrapper utilities
│   ├── collection/               # Collection management
│   ├── opencode-hooks/           # OpenCode integration hooks
│   │   ├── session-created.ts
│   │   ├── session-idle.ts
│   │   ├── session-deleted.ts
│   │   ├── session-compacting.ts
│   │   ├── system-transform.ts
│   │   └── tool-executed.ts
│   ├── cli-tools/                # CLI tool implementations
│   │   ├── index.ts              # mem-index command
│   │   ├── search.ts             # mem-search command
│   │   ├── watch.ts              # mem-watch command
│   │   ├── compact.ts            # mem-compact command
│   │   ├── expand.ts             # mem-expand command
│   │   ├── stats.ts              # mem-stats command
│   │   ├── config.ts             # mem-config command
│   │   ├── doctor.ts             # mem-doctor command
│   │   ├── reset.ts              # mem-reset command
│   │   ├── transcript.ts         # mem-transcript command
│   │   └── version.ts            # mem-version command
│   ├── queue/                    # Queue management
│   │   ├── memory-queue.ts
│   │   ├── memory-worker.ts
│   │   ├── backfill.ts
│   │   └── queue-state.ts
│   ├── processing/               # Session processing
│   │   ├── session-generator.ts
│   │   ├── memory-pipeline.ts
│   │   └── session-indexer.ts
│   ├── types/                    # Type definitions
│   └── storage/                  # Storage adapters
├── scripts/                       # Utility scripts (TS, shell, Python)
├── docs/                          # Documentation
├── config/                        # Configuration files
│   └── milvus-compose.yaml
├── .memsearch/                    # Runtime data and memory storage
├── .weave/                        # Weave multi-agent plans
├── .opencode/                     # OpenCode configuration
└── .github/                       # GitHub workflows
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Plugin entry point - registers hooks and tools |
| `src/config.ts` | Configuration loading and validation |
| `src/state.ts` | Plugin state management |
| `src/cli-wrapper.ts` | Wrapper for CLI operations |
| `README.md` | Project documentation |
| `LICENSE.md` | MIT License |
| `package.json` | Package configuration |
| `tsconfig.json` | TypeScript configuration |
| `lefthook.yml` | Git hooks configuration |
| `.ls-lint.yml` | File naming rules |

---

## Conventions

### File Naming

- **Source files**: `kebab-case.ts`
- **Documentation**: `kebab-case.md` (in docs/)
- **Special files**: `SCREAMING_SNAKE_CASE.md` (README.md, AGENTS.md, LICENSE.md)
- **Directories**: `kebab-case`

### Required Root Files

The ls-lint configuration enforces that these files MUST exist at root:
- `README.md`
- `AGENTS.md`

### Code Organization

All TypeScript source code is in `src/`:
- **Core logic**: Config, state, CLI wrapper at root of src/
- **OpenCode integration**: `src/opencode-hooks/` - event handlers
- **User commands**: `src/cli-tools/` - tool implementations
- **Queue system**: `src/queue/` - background job processing
- **Processing**: `src/processing/` - session/memory processing
- **Types**: `src/types/` - shared type definitions

---

## Development

### Commands

```bash
# Type checking
bun run typecheck

# Run tests
bun test --run

# Run ls-lint
bunx ls-lint

# Build
bun run build
```

### Hooks

This project uses lefthook for git hooks:
- **pre-commit**: Runs ls-lint, typecheck, and other quality checks
- **pre-push**: Runs tests

---

## Architecture

### Plugin Entry Point (src/main.ts)

The main.ts file:
1. Imports hooks from `src/opencode-hooks/`
2. Imports tools from `src/cli-tools/`
3. Registers them with the OpenCode plugin system
4. Handles session lifecycle events

### OpenCode Hooks (src/opencode-hooks/)

Event handlers that integrate with OpenCode:
- `session-created.ts` - New session started
- `session-idle.ts` - Session becomes idle
- `session-deleted.ts` - Session deleted
- `session-compacting.ts` - Session compaction
- `system-transform.ts` - System message transformation
- `tool-executed.ts` - Tool execution tracking

### CLI Tools (src/cli-tools/)

User-facing commands:
- `mem-search` - Search memory
- `mem-index` - Index sessions
- `mem-watch` - Watch session
- `mem-compact` - Compact memory
- `mem-expand` - Expand memory
- `mem-stats` - Show statistics
- `mem-config` - Configuration
- `mem-doctor` - Diagnostics
- `mem-reset` - Reset memory
- `mem-transcript` - Get transcript
- `mem-version` - Show version

### Queue System (src/queue/)

Background job processing:
- `memory-queue.ts` - Job queue management
- `memory-worker.ts` - Worker implementation
- `backfill.ts` - Historical session backfill
- `queue-state.ts` - Queue state management

---

## Dependencies

- **@opencode-ai/plugin** - OpenCode plugin SDK
- **bunqueue** - Queue implementation
- **js-yaml** - YAML parsing
- **lefthook** - Git hooks
- **@ls-lint/ls-lint** - File naming linter

---

## License

MIT License - See LICENSE file
