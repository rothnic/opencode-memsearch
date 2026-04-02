# Memory type default configs

This folder provides example memory type configs for three conservative, broadly useful
memory categories: decision, convention, and context. These files are intentionally small
and safe to enable by default in a project.

Quick notes on customization
- extractionPrompt: Tweak wording to bias extraction. Keep prompts between 10 and 2000 chars.
- collection: Must match /^[a-zA-Z][a-zA-Z0-9_\-]{2,63}$/.
- tags: Default tags are suggestions. Use project technology tags to improve filtering.
- model: To pin a model for extraction, add model: provider/model (e.g. openai/gpt-4).
- frequency: Defaults to manual. Use mode: interval-minutes for periodic extraction.

Where to put overrides
- Project-specific overrides: place a memory/<type>/config.yaml in your project root. The
  loader will prefer project configs over global configs at ~/.config/opencode/memory/<type>/config.yaml.

Validation
- Files are validated against the MemoryTypeConfigSchema. Invalid configs are reported by the
  loader but will not crash the host.

Example quick edit
  - To restrict convention extraction to TypeScript topics, add tags: ["typescript","style"].
  - To run extraction every 60 minutes set frequency:

    frequency:
      mode: interval-minutes
      intervalMinutes: 60
