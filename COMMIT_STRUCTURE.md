# Commit Structure for Configurable Extraction Pipeline

## Commit 1: Foundation - Config System
feat(config): add .memsearch.yaml config file schema and loader

- Add lib/config-yaml.ts with MemsearchConfig schema
- Add lib/config-yaml.test.ts with comprehensive tests (542 lines)
- Support environment variable interpolation
- Add memoryTypes, extraction, collections, deduplication, compaction config sections
- Update config.ts to integrate new config loading

## Commit 2: Memory Type System
feat(memory-types): add memory type registry and config loader

- Add lib/memory-type-config.ts with Zod schema validation
- Add lib/memory-type-config-loader.ts for scanning memory/*/config.yaml
- Add lib/memory-types.ts registry with O(1) lookups
- Add lib/memory-type-collection-resolver.ts for collection name mapping
- Create default configs: memory/decision/, memory/convention/, memory/context/
- Add documentation: docs/memory-type-config-schema.md

## Commit 3: Session Processor Agent Core
feat(agent): implement session processor agent infrastructure

- Add lib/session-processor.ts with SessionProcessorAgent interface
- Add lib/prompt-builder.ts for dynamic prompt generation per memory type
- Add lib/llm-client.ts with OpenAI/Ollama support and retry logic
- Add lib/scoped-writer.ts for path traversal protection
- Add comprehensive tests for all agent components

## Commit 4: Duplicate Detection & Security
feat(security): add duplicate detection and scoped write permissions

- Add lib/duplicate-detector.ts with 3 similarity algorithms:
  - Levenshtein distance (20% weight)
  - Jaccard similarity (40% weight)
  - Cosine similarity (40% weight)
- Validate all writes against allowed paths per memory type
- Prevent path traversal attacks
- Add comprehensive tests (473 lines)

## Commit 5: Collection Management & Metadata
feat(collections): implement automatic collection creation and lifecycle

- Add lib/collection-manager.ts for memsearch CLI integration
- Add lib/collection-lifecycle.ts for tracking and cleanup
- Add lib/tag-extractor.ts for technology/framework detection (80+ techs)
- Add lib/filter-builder.ts for Milvus-compatible filter expressions
- Support metadata fields: tags, source_session, technology

## Commit 6: Integration & Hooks
feat(integration): add extraction pipeline hooks and compaction capture

- Add lib/compaction-capture.ts for compaction output handling
- Add lib/extraction-hooks.ts for session-created/idle integration
- Add lib/extraction-tracker.ts for status tracking
- Add lib/command-registry.ts for custom OpenCode commands
- Respect frequency control settings (manual/per-session/interval)

## Commit 7: Migration & Documentation
docs(migration): add migration guide and finalize documentation

- Add docs/migration-guide.md from opencode.json to .memsearch.yaml
- Document all breaking changes and new features
- Add troubleshooting section
- Include configuration examples
- Update README with new capabilities

## Commit 8: refactor(agent): replace direct LLM calls with OpenCode subagents

- Replace OpenAI/Ollama direct API calls with OpenCode subagent spawning
- Use task tool with session_id to pass parent context
- Update LLMClient interface to work with OpenCode agent framework
- Maintain retry logic and error handling for subagent calls
- Update tests for new subagent-based approach
