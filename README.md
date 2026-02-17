# opencode-memsearch

OpenCode plugin that integrates the memsearch semantic memory CLI with OpenCode. It provides hybrid search (BM25 + semantic embeddings) for session transcripts, project files and other indexed content and hooks to automatically index sessions.

This README covers installation, configuration, usage, available tools and hooks, troubleshooting, and verification steps.

## Features
- Hybrid search: BM25 + semantic (embeddings) to improve relevance
- Automatic session indexing (converts sessions to Markdown and indexes them)
- 11 developer-facing tools for indexing, searching, watching, maintenance and diagnostics
- 8 OpenCode hooks for session lifecycle integration and auto-injection

## Requirements
- memsearch CLI (Python) installed and available on PATH. Upstream memsearch supports Milvus 2.6.2+ for vector storage and BM25 hybrid search.
- Milvus 2.6.2+ (if using Milvus backend for vectors)
- Node/Bun environment for the plugin (the plugin is authored for Bun runtime but works where @opencode-ai/plugin is supported)

Recommended: install memsearch (pip) from the memsearch project and verify `memsearch --help` works.

## Installation

1) Install the memsearch CLI (Python)

```sh
pip install memsearch
# or follow memsearch docs for virtualenv / system installation
```

2) Install plugin into OpenCode config directory

Option A — using bundled installer script

```sh
./install.sh
# or specify destination: ./install.sh ~/.config/opencode/plugin
```

Option B — copy files manually

Copy this repository directory to `$HOME/.config/opencode/plugin/memsearch`.

Option C — npm (developer) publish / install

This package is authored as an OpenCode plugin (package.json included). You may also install or link it with your preferred Node/Bun workflow for development.

## Quick configuration

memsearch CLI uses a TOML config at `~/.memsearch.toml`. Create or edit this file to point to your Milvus instance and embedding settings.

Example ~/.memsearch.toml

```toml
[default]
backend = "milvus"
milvus_addr = "127.0.0.1:19530"
collection_prefix = "opencode"
embedding_model = "openai-embedding-model"
bm25 = true
```

- collection_prefix: (optional) prefix memsearch collections with `opencode` or other namespace
- embedding_model: name of embedding model used by memsearch
- bm25: enable BM25 component for hybrid relevance

The plugin will also create a per-project `.memsearch` directory when indexing sessions to store generated markdown and state.

## How it works

- Hooks in OpenCode capture session lifecycle events and message updates. The plugin converts sessions + history into Markdown and writes them to `.memsearch/sessions/` inside the project workdir.
- A small Bun-side session indexer (lib/session-indexer.ts) tracks indexed sessions in `.memsearch/indexed.json` and triggers the memsearch CLI to index updated sessions into the `sessions` collection.
- Search commands call the memsearch CLI to perform hybrid or semantic queries and return results to the user.

## Tools provided

The plugin registers 11 tools (as in index.ts). Use them via the OpenCode `tool` interface or CLI integration exposed by the host.

1. mem-index — Index local project files / sessions
2. mem-search — Perform a hybrid/semantic search
3. mem-watch — Watch for changes and auto-index
4. mem-compact — Compact collections / storage
5. mem-expand — Expand search results with context
6. mem-version — Show installed memsearch version
7. mem-reset — Reset plugin state and collections
8. mem-stats — Show memsearch / collection statistics
9. mem-config — Print or edit memsearch configuration
10. mem-transcript — Export or view indexed transcripts
11. mem-doctor — Run diagnostics and common fixes

Usage examples

Index sessions for the current project

```sh
opencode tool mem-index --project .
```

Search for a term

```sh
opencode tool mem-search "how to set up milvus" --collection sessions
```

Watch and auto-index

```sh
opencode tool mem-watch --project .
```

## Hooks registered

The plugin registers 8 hooks with OpenCode to integrate indexing and auto-injection:

1. session.created — onSessionCreated: triggers initial indexing or bookkeeping when a session is created
2. session.deleted — onSessionDeleted: cleans up state when a session is removed
3. session.idle — onSessionIdle: may trigger background indexing after inactivity
4. experimental.session.compacting — onSessionCompacting: handle session compaction events
5. experimental.chat.system.transform — onSystemTransform: auto-inject memsearch into system prompts or transform system messages (auto-injection)
6. message.updated — onMessageUpdated: re-index affected session content when messages change
7. message.part.updated — onMessagePartUpdated: finer-grained message updates
8. tool.execute.after — onToolExecuted: hook after mem tools run to update state or trigger follow-up actions

These hooks ensure sessions are converted, saved and indexed automatically with minimal manual steps.

## Configuration options (plugin-level)

- Per-user: ~/.memsearch.toml — primary memsearch CLI config (backend, address, keys, embedding model)
- Per-project: .memsearch/ — generated by the plugin, contains:
  - sessions/ (generated markdown files)
  - history/ (message history JSONL)
  - indexed.json (state of what has been indexed)

You can tweak memsearch CLI flags via the plugin's tools (mem-config) or by editing the global TOML.

## Session indexing details

- The session indexer converts sessions (OpenCode session JSON) and session history JSONL into a single Markdown document per session (.memsearch/sessions/ses_<id>.md).
- It stores indexing state in `.memsearch/indexed.json` and only re-indexes sessions that changed since the last run.
- After writing markdown, the plugin triggers the memsearch CLI to index the sessions directory into a `sessions` collection.

## Troubleshooting

- memsearch command not found: ensure Python installed and `pip install memsearch` completed, and your PATH includes Python scripts. Run `memsearch --help` to verify.
- Milvus connection errors: verify Milvus is running at the address in `~/.memsearch.toml` and that firewall/ports are open.
- Sessions not indexed: confirm `.memsearch/sessions/` contains generated .md files and `.memsearch/indexed.json` updated. Check logs for "memsearch: session indexing failed".
- Hybric search expectations: To get BM25 + semantic, ensure `bm25 = true` in your memsearch config and that the embedding model is configured.

## Verification

1. Create a test session in OpenCode or use an existing one.
2. Run `opencode tool mem-index` (or wait for auto-index). Verify `.memsearch/sessions/ses_<id>.md` exists.
3. Run `memsearch search "some text from session" --collection sessions` and confirm it returns the session.

## Developer notes
- The plugin is written for Bun/node with TypeScript sources. See `lib/session-indexer.ts` for the session-to-markdown conversion and indexing flow.
- package.json declares the plugin and peer dependency on `@opencode-ai/plugin`.

## License
MIT
