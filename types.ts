/**
 * Types for memsearch OpenCode plugin
 *
 * NOTE: Avoid using `any`. Keep types explicit and narrow where possible.
 */

import type { ToolContext } from "@opencode-ai/plugin";

/** Unique identifier for a search chunk or document */
export type ChunkHash = string;

/**
 * Extended ToolContext that includes the shell runner ($).
 * This is currently missing from the base ToolContext in @opencode-ai/plugin.
 */
export interface MemsearchToolContext extends ToolContext {
  /** Shell runner (Bun.shell compatible) */
  $: any; // Using any for now to avoid complex shell type imports, but we know it's a shell runner
}

/** Source descriptor for where the search result originated */
export interface SearchSource {
  /** Human readable source name (e.g. "notebook", "repo", "web") */
  name: string;
  /** Optional path or URL identifying the original document */
  uri?: string;
  /** Optional provider-specific id */
  id?: string;
}

/** Single search result returned by memsearch */
export interface SearchResult {
  /** Text content of the matched chunk */
  content: string;
  /** Where this chunk came from */
  source: SearchSource;
  /** Stable hash for the chunk (useful for deduping & citations) */
  chunk_hash: ChunkHash;
  /** Relevance score (higher = more relevant). Normalized to [0..1] when possible. */
  score: number;
  /** The 0-based index of this chunk within the originating document, if applicable */
  chunk_index?: number;
  /** Additional per-result metadata (string values) */
  metadata?: Record<string, string>;
  /** Optional embedding vector (may be present for advanced use). Keep narrow: number[] when present. */
  embedding?: number[];
}

/** Available embedding provider identifiers */
export type EmbeddingProvider =
  | "openai"
  | "local"
  | "cohere"
  | "huggingface"
  | "ollama"
  | "voyage"
  | "custom";

/** Settings that control "smart" search behavior */
export interface SmartSearchConfig {
  /** Use context-aware re-ranking (semantic rerank). Default: true */
  enabled: boolean;
  /** Model or algorithm to use for reranking (provider-specific string) */
  rerankerModel?: string;
  /** Maximum number of top candidates to rerank (<= topK) */
  rerankTopK?: number;
  /** Whether to expand the query with synonyms / entailment (if supported) */
  queryExpansion?: boolean;
}

/** Fine-grained search options passed at query time */
export interface SearchOptions {
  /** How many results to return */
  topK?: number;
  /** Minimum score threshold (0-1). Results below are filtered out. */
  minScore?: number;
  /** Whether to include raw embeddings in results (defaults false) */
  includeEmbeddings?: boolean;
  /** Per-call override for smart search settings */
  smart?: Partial<SmartSearchConfig> | false;
  /** Filter expression (e.g. source starts_with "/path") */
  filter?: string;
  /** Collection to search in */
  collection?: string;
}

/** Configuration schema for the memsearch plugin */
export interface MemsearchConfig {
  /** Directory where memory / index files are stored */
  memoryDirectory: string;
  /** Embedding provider to use for vectorization */
  embeddingProvider: EmbeddingProvider;
  /** API key or credential identifier for embedding provider (store secrets externally) */
  embeddingApiKey?: string;
  /** Default number of results to return for queries */
  topK: number;
  /** Whether to persist newly added documents to disk */
  persist?: boolean;
  /** Smart search settings (semantic re-ranking, query expansion, etc.) */
  smartSearch: SmartSearchConfig;
  /** Distance metric: 'cosine' | 'euclidean' | 'dot' */
  distanceMetric?: "cosine" | "euclidean" | "dot";
  /** Optional endpoint for Ollama (when embeddingProvider === 'ollama') */
  ollamaEndpoint?: string;
  /** Optional path or name for a custom embeddings service (when embeddingProvider === 'custom') */
  customEmbeddingEndpoint?: string;
  /** Optional timeout (ms) for remote embedding calls */
  embeddingTimeoutMs?: number;
  /** Memory sources for auto-injection and search */
  sources?: MemorySource[];
  /** Default source for backward compatibility */
  defaultSource?: MemorySource;
  /** Additional plugin-specific options */
  extras?: Record<string, string | number | boolean>;
}

/** Configuration for a specific memory source */
export interface MemorySource {
  /** Unique identifier for this source */
  id: string;
  /** Display name */
  name: string;
  /** Path or collection to search */
  pathOrCollection: string;
  /** Collection name in Milvus (if different from path) */
  collection?: string;
  /** Whether this source is enabled for auto-injection */
  enabled: boolean;
  /** Search configuration for this source */
  search: {
    /** Maximum results to return from this source */
    maxResults: number;
    /** Minimum score threshold */
    minScore?: number;
    /** Custom filter expression */
    filter?: string;
  };
  /** How to format results from this source in injection */
  injection: {
    /** Template for formatting results */
    template: string; // e.g., "## {{name}}\n{{content}}"
    /** Maximum content length per result */
    maxContentLength: number;
    /** Include source attribution */
    includeSource?: boolean;
  };
}

/** Response envelope for a search operation */
export interface SearchResponse {
  /** Query that produced these results */
  query: string;
  /** Effective options used for the search */
  options: SearchOptions;
  /** Ordered list of results (most relevant first) */
  results: SearchResult[];
  /** Time taken to perform search in milliseconds */
  durationMs?: number;
}

/**
 * Result returned by `memsearch expand --json` for a single chunk.
 * Includes the original source descriptor, an optional heading (context/title),
 * the full content for the chunk, and the chunk_hash for citation.
 */
export interface ExpandResult {
  source: SearchSource;
  /** Optional heading or section title where this chunk was extracted from */
  heading?: string;
  /** Full text content for the expanded chunk */
  content: string;
  /** Stable chunk identifier used for later referencing */
  chunk_hash: ChunkHash;
}

/** Utility type: safe numeric score normalized to 0..1 */
export type NormalizedScore = number;

export type { SmartSearchConfig as MemsearchSmartConfig };
