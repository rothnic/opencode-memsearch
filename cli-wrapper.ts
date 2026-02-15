import { $ } from "bun";
import type {
  SearchOptions,
  SearchResponse,
  MemsearchConfig,
  ExpandResult,
} from "./types";

export interface MemsearchStats {
  documentCount: number;
  chunkCount: number;
  indexSize: number;
  lastIndexedAt?: string;
}

export interface TranscriptEntry {
  timestamp: string;
  query: string;
  results: string[];
}

export class MemsearchNotFoundError extends Error {
  constructor() {
    super("memsearch CLI not found. Please install it using: pip install memsearch");
    this.name = "MemsearchNotFoundError";
  }
}

export class MemsearchCLI {
  private isAvailable: boolean | null = null;

  async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) return this.isAvailable;
    try {
      const result = await $`memsearch --version`.quiet();
      this.isAvailable = result.exitCode === 0;
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  private async ensureAvailable(): Promise<void> {
    if (!(await this.checkAvailability())) {
      throw new MemsearchNotFoundError();
    }
  }

  async index(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    await this.ensureAvailable();
    const args: string[] = ["index", path];
    if (options.recursive) {
      args.push("--recursive");
    }
    await $`memsearch ${args}`.throws(true);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    await this.ensureAvailable();
    const args: string[] = ["search", query, "--json"];
    
    if (options.topK !== undefined) {
      args.push("--top-k", options.topK.toString());
    }
    if (options.minScore !== undefined) {
      args.push("--min-score", options.minScore.toString());
    }
    if (options.filter !== undefined) {
      args.push("--filter", options.filter);
    }
    if (options.collection !== undefined) {
      args.push("--collection", options.collection);
    }
    if (options.includeEmbeddings) {
      args.push("--include-embeddings");
    }
    
    if (options.smart) {
      args.push("--smart");
      if (typeof options.smart === 'object') {
        if (options.smart.rerankerModel) {
          args.push("--reranker", options.smart.rerankerModel);
        }
        if (options.smart.queryExpansion) {
          args.push("--expand-query");
        }
      }
    }

    const output = await $`memsearch ${args}`.text();
    return JSON.parse(output) as SearchResponse;
  }

  async watch(path: string): Promise<void> {
    await this.ensureAvailable();
    await $`memsearch watch ${path}`.throws(true);
  }

  async compact(): Promise<string> {
    await this.ensureAvailable();
    // Run memsearch compact and return its stdout as the compaction summary.
    // Use .text() so we capture the summary content produced by memsearch.
    const output = await $`memsearch compact`.text();
    return output;
  }

  async expand(query: string): Promise<ExpandResult[]> {
    await this.ensureAvailable();
    const output = await $`memsearch expand ${query} --json`.text();
    return JSON.parse(output) as ExpandResult[];
  }

  async transcript(sessionId: string): Promise<TranscriptEntry[]> {
    await this.ensureAvailable();
    const output = await $`memsearch transcript ${sessionId} --json`.text();
    return JSON.parse(output) as TranscriptEntry[];
  }

  async config(action: "get", key?: string): Promise<Partial<MemsearchConfig>>;
  async config(action: "set", key: string, value: string): Promise<void>;
  async config(action: "get" | "set", key?: string, value?: string): Promise<Partial<MemsearchConfig> | void> {
    await this.ensureAvailable();
    if (action === "get") {
      const args: string[] = ["config", "get", "--json"];
      if (key) args.push(key);
      const output = await $`memsearch ${args}`.text();
      return JSON.parse(output) as Partial<MemsearchConfig>;
    } else {
      if (!key || value === undefined) {
        throw new Error("Key and value are required for config set");
      }
      await $`memsearch config set ${key} ${value}`.throws(true);
    }
  }

  async stats(): Promise<MemsearchStats> {
    await this.ensureAvailable();
    const output = await $`memsearch stats --json`.text();
    return JSON.parse(output) as MemsearchStats;
  }

  async reset(): Promise<void> {
    await this.ensureAvailable();
    await $`memsearch reset --force`.throws(true);
  }

  async version(): Promise<string> {
    // Return the CLI version string from `memsearch --version`.
    // We don't call ensureAvailable() because the version command itself
    // is the availability probe and may throw if the binary is missing.
    try {
      const output = await $`memsearch --version`.text();
      return output.trim();
    } catch (err) {
      // Normalize to a consistent error when the binary isn't present.
      throw new MemsearchNotFoundError();
    }
  }
}
