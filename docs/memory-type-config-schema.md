# MemoryTypeConfigSchema

This document describes the MemoryTypeConfigSchema defined in lib/memory-type-config.ts.
It lists each field, its type, validation rules, defaults, and examples. The Zod schema in the source file
is the authoritative source of truth; this document reflects its current shape.

Key constants referenced
- ModelNameRegex: ^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$  (provider/model)
- CollectionNameRegex: ^[a-zA-Z][a-zA-Z0-9_\-]{2,63}$  (start with letter, 3-64 chars)
- MIN_PROMPT_LENGTH: 10
- MAX_PROMPT_LENGTH: 2000

Schema fields

1) name
- type: string
- required: yes
- validation: non-empty (min length 1)
- description: Human readable short name for this memory type.
- example: "sessions"

2) description
- type: string
- required: optional
- default: none
- description: Longer human description of the memory type's purpose.
- example: "Indexed session transcripts for quick lookup"

3) collection
- type: string
- required: yes
- validation: must match CollectionNameRegex
  - Regex: /^[a-zA-Z][a-zA-Z0-9_\-]{2,63}$/
  - Meaning: must start with a letter, may contain letters, digits, underscore, or hyphen, length between 3 and 64 characters
- description: Backend collection name used by the indexing backend (memsearch / Milvus collection name).
- example: "sessions"

4) extractionPrompt
- type: string
- required: yes
- validation: length between MIN_PROMPT_LENGTH and MAX_PROMPT_LENGTH
  - MIN_PROMPT_LENGTH = 10
  - MAX_PROMPT_LENGTH = 2000
- description: Prompt text sent to the extraction model to convert raw content into memory items. Keep it concise but complete.
- example:
  "Extract discrete facts and metadata from the following session transcript. For each fact provide a short title, tags, and a one-paragraph summary."

5) model
- type: string
- required: optional
- validation: if present, must match provider/model format per ModelNameRegex
  - Regex: /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/
  - Example valid: "openai/gpt-4", "anthropic/claude-2"
- default: none (undefined)
- description: Optional model identifier in provider/model form. If omitted the system may choose a default model.
- example: "openai/gpt-4"

6) enabled
- type: boolean
- required: optional
- default: true
- description: Toggle to enable or disable this memory type without deleting its config.
- example: true

7) tags
- type: string[]
- required: optional
- default: []
- description: Arbitrary tags attached to the memory type for filtering or UI grouping.
- example: ["sessions", "auto-index"]

8) frequency
- type: object
- required: optional
- default: { mode: "manual", intervalMinutes: 60, onCompact: false }
- fields:
  - mode: enum["manual", "per-session", "interval-minutes", "on-demand"] (default: "manual")
    - description: Controls when extraction runs for this memory type.
    - meaning:
      - manual: only run when explicitly triggered
      - per-session: run once per session (e.g. when session is closed or saved)
      - interval-minutes: run on a repeating interval; use intervalMinutes for cadence
      - on-demand: run when other events request extraction
  - intervalMinutes: integer > 0 (default: 60)
    - used when mode is "interval-minutes"
  - onCompact: boolean (default: false)
    - if true, extraction may also run when compacting sessions/storage

9) output
- type: object (see MemoryConfigOutputSchema)
- required: optional
- default: { path: "memory", filenamePattern: "{date}_{session_id}.md" }
- fields:
  - path: string (default: "memory") — directory path where generated artifacts are written
  - filenamePattern: string (default: "{date}_{session_id}.md") — pattern used for filenames; tokens are implementation-defined but {date} and {session_id} are commonly used

Full valid example

```yaml
name: sessions
description: "Indexed session transcripts for quick lookup"
collection: sessions
extractionPrompt: "Extract discrete facts and metadata from the following session transcript. For each fact provide a short title, tags, and a one-paragraph summary."
model: openai/gpt-4
enabled: true
tags:
  - sessions
  - auto-index
frequency:
  mode: per-session
  intervalMinutes: 60
  onCompact: false
output:
  path: memory
  filenamePattern: "{date}_{session_id}.md"
```

Short invalid example (and why it fails)

```yaml
name: ""
collection: 1sessions
extractionPrompt: "short"
model: badformatmodel
```

- Problems:
  - name: empty string, fails min(1)
  - collection: "1sessions" starts with a digit, fails CollectionNameRegex
  - extractionPrompt: too short (below MIN_PROMPT_LENGTH = 10)
  - model: "badformatmodel" does not match provider/model regex

Notes and validation reminders
- Model name must be provider/model; provider and model segments allow letters, digits, underscore, hyphen in provider and letters, digits, dot, underscore, hyphen in model (see ModelNameRegex).
- Collection names must start with a letter and be 3 to 64 characters long.
- extractionPrompt must be between 10 and 2000 characters.
- frequency.mode defaults to "manual"; intervalMinutes defaults to 60 and must be a positive integer.
- The schema is intentionally narrow and follows a fail-open philosophy where missing optional fields fall back to safe defaults.

Source
- lib/memory-type-config.ts (MemoryTypeConfigSchema)
