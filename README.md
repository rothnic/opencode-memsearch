# opencode-memsearch-plugin

A plugin for OpenCode that integrates the memsearch CLI to provide local semantic memory: indexing, searching, compaction, transcripts, and configuration helpers.

## Overview

This plugin exposes a set of tools that call the memsearch CLI (requires the `memsearch` Python package) via a thin Bun-based wrapper. It enables automatic memory capture and retrieval, progressive compaction/summarization, and programmatic access to the memsearch index from OpenCode.

Important: the plugin calls the external `memsearch` binary. If the binary isn't available the tools return an error instructing you to install it.

## Installation

1. Ensure you have Python and pip available.
2. Install the memsearch CLI:

   pip install memsearch

3. (Optional) Configure your project `opencode.json` (see Configuration below).

4. The plugin is discovered automatically when placed under `.opencode/plugin/memsearch/` in your project.

## Tools

The plugin registers the following tools (all return JSON-serializable string results per the OpenCode tool SDK):

- /mem-index
  - Description: Index files or directories into the memsearch local index.
  - Args:
    - path (string) — Path to index (file or directory)
    - recursive (boolean, optional) — Whether to index recursively
  - Behavior: Calls `memsearch index <path>` and returns a small stats summary (via the CLI `stats` call). If memsearch is not installed the tool returns an error object with guidance.

- /mem-search
  - Description: Search the memsearch index and return formatted results (includes chunk_hash).
  - Args:
    - query (string) — Search query string
    - topK (number, optional) — Maximum number of results to return
    - minScore (number, optional) — Minimum score threshold (0..1)
    - smart (boolean, optional) — Use smart search (semantic rerank / expansion)
  - Behavior: Calls `memsearch search --json` via the CLI wrapper and returns a JSON object with query, options, durationMs, count, and results. Each result includes a preview, chunk_hash, score, chunk_index and metadata.

- /mem-watch
  - Description: Start a memsearch filesystem watcher for a path.
  - Args:
    - path (string) — Path to watch with memsearch
  - Behavior: Launches `memsearch watch <path>` in a child process and returns immediately with running: true. Only one watcher runs per process; repeated starts return a friendly error. If memsearch is missing the tool returns installation guidance.

- /mem-compact
  - Description: Run memsearch compaction and return the LLM-produced summary.
  - Args: none
  - Behavior: Runs `memsearch compact` and returns the summary text produced by the CLI.

- /mem-expand
  - Description: Expand a chunk_hash into full context (source, heading, and full content).
  - Args:
    - chunk_hash (string) — Chunk hash to expand
  - Behavior: Calls `memsearch expand <chunk_hash> --json` and returns an array of expanded segments, plus a consolidated markdown rendering useful for LLM consumption.

- /mem-transcript
  - Description: Fetch transcript entries for a memsearch session (returns turns)
  - Args:
    - sessionId (string) — Transcript session id
    - index (number, optional) — Optional index of a specific turn
  - Behavior: Attempts to read local .memsearch/history/<sessionId>.jsonl in the project directory; if not present, falls back to `memsearch transcript <sessionId> --json` via the CLI. Returns an array of turns (messages, tool_execution, or search entries).

- /mem-config
  - Description: Get or set memsearch configuration values.
  - Args:
    - action ("get" | "set") — Action to perform
    - key (string, optional) — Configuration key (required for set)
    - value (string, optional) — Value to set (required for set)
  - Behavior: Uses `memsearch config get --json [key]` and `memsearch config set` to read/update configuration. For `get` returns the config (or specific key); for `set` applies the change and returns confirmation.

- /mem-stats
  - Description: Return memsearch index statistics (documentCount, chunkCount, indexSize, etc.)
  - Args: none
  - Behavior: Calls `memsearch stats --json` and returns the parsed stats object.

- /mem-reset
  - Description: Reset (drop) the memsearch index. Requires explicit confirmation
  - Args:
    - confirm (boolean) — Must be true to drop indexed data (acts like --yes)
  - Behavior: Destructive operation that runs `memsearch reset --force` when confirm=true. Without confirmation the tool returns an error instructing to pass confirm=true.

Note on errors: All tools that rely on the memsearch CLI detect if the binary is missing and return a structured error with the message: "memsearch CLI not found. Please install it with: pip install memsearch". The plugin defines a MemsearchNotFoundError for programmatic handling.

## Configuration (opencode.json)

The plugin reads memsearch configuration from your project's opencode.json under the `memsearch` key. The plugin has sensible defaults; call loadConfig(workdir) to see final merged values. The available options are:

- memoryDirectory (string) — Directory where memory / index files are stored. Default: <workdir>/memsearch_data
- embeddingProvider ("openai" | "local" | "cohere" | "huggingface" | "ollama" | "voyage" | "custom") — Embedding provider. Default: "openai"
- embeddingApiKey (string, optional) — API key for the embedding provider. If absent the plugin falls back to OPENAI_API_KEY env var.
- topK (number) — Default number of results to return for queries. Default: 10
- persist (boolean) — Whether to persist newly added documents to disk. Default: true
- smartSearch (object) — Smart search settings (defaults shown below):
  - enabled (boolean) — Whether smart search (rerank/query expansion) is enabled. Default: true
  - rerankerModel (string, optional) — Reranker model name (e.g. "text-embedding-3-small")
  - rerankTopK (number, optional) — Number of top candidates to rerank
  - queryExpansion (boolean, optional) — Whether to expand the query
- distanceMetric ("cosine" | "euclidean" | "dot") — Distance metric for vector comparisons. Default: "cosine"
- ollamaEndpoint (string, optional) — URL for Ollama service when embeddingProvider === 'ollama'
- customEmbeddingEndpoint (string, optional) — URL or path for a custom embedding service when embeddingProvider === 'custom'
- embeddingTimeoutMs (number) — Timeout in milliseconds for remote embedding calls. Default: 10000
- extras (object) — Catch-all for plugin-specific experimental options (string|number|boolean)

Example opencode.json snippet:

```
{
  "memsearch": {
    "memoryDirectory": ".memsearch/data",
    "embeddingProvider": "openai",
    "embeddingApiKey": "sk-...",
    "topK": 8,
    "smartSearch": { "enabled": true, "rerankerModel": "text-embedding-3-small", "rerankTopK": 10 }
  }
}
```

The plugin will merge your settings with defaults and also read OPENAI_API_KEY from the environment as a fallback for embeddingApiKey.

## Features

- Automatic memory capture via registered hooks: the plugin listens to session and message events to capture relevant context into memsearch.
- L1/L2/L3 progressive disclosure during compaction: compact runs an LLM-based summarization and returns a readable summary (see /mem-compact).
- Daily memory summaries: the compaction/background hooks create consolidated summaries; check /mem-compact output for LLM-produced summaries.

## Usage Examples

- Index a directory:

  Call tool /mem-index with { path: "./docs", recursive: true }

- Search for a concept:

  Call tool /mem-search with { query: "how to configure opencode plugin", topK: 5 }

- Expand a result for quoting/citation in an LLM prompt:

  Call tool /mem-expand with { chunk_hash: "<chunk-hash>" }

- Get current memsearch stats:

  Call tool /mem-stats (no args)

- Reset index (destructive):

  Call tool /mem-reset with { confirm: true }

## Troubleshooting

- MemsearchNotFoundError / CLI not found:
  - Symptom: Tools return { ok: false, error: "memsearch CLI not found. Please install it with: pip install memsearch" }
  - Fix: Install the memsearch CLI in the environment where OpenCode runs: `pip install memsearch`. Ensure the `memsearch` command is on PATH for the runtime (the plugin uses Bun's $`` to invoke the command).

- Watcher exits immediately or cannot start:
  - Ensure only a single watcher is started per process. If a watcher previously crashed, restart the process or ensure state.watcherRunning is cleared.

- Config set/get failures:
  - /mem-config set requires both key and value. /mem-config get returns the full config when key is omitted.

If you find inconsistencies or missing behavior, inspect the plugin source under `.opencode/plugin/memsearch/` for implementation details and open an issue with relevant logs.

## Developer notes

- Tools live under `.opencode/plugin/memsearch/tools/` and are thin wrappers around `cli-wrapper.ts` which invokes the `memsearch` binary using Bun's $`` helper.
- The configuration loader `config.ts` merges `opencode.json` -> `memsearch` with safe defaults and uses Zod for validation.
- Hooks are registered in `index.ts` and live under `.opencode/plugin/memsearch/hooks/`.

---

If you need a more detailed example or want the plugin to perform additional automatic captures, describe a single change you'd like and I will implement it.
