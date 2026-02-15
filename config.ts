import { existsSync } from "fs";
import path from "path";
import { z } from "zod";
import type { MemsearchConfig, SmartSearchConfig } from "./types";

const DefaultSmartSearch: SmartSearchConfig = {
  enabled: true,
  rerankerModel: "text-embedding-3-small",
  rerankTopK: 10,
  queryExpansion: false,
};

const ConfigSchema = z.object({
  memoryDirectory: z.string().nonempty(),
  embeddingProvider: z.enum(["openai", "local", "cohere", "huggingface", "ollama", "voyage", "custom"]),
  embeddingApiKey: z.string().optional(),
  topK: z.number().int().positive().default(10),
  persist: z.boolean().optional().default(true),
  smartSearch: z
    .object({
      enabled: z.boolean().default(true),
      rerankerModel: z.string().optional(),
      rerankTopK: z.number().int().min(1).optional(),
      queryExpansion: z.boolean().optional(),
    })
    .default(DefaultSmartSearch),
  distanceMetric: z.enum(["cosine", "euclidean", "dot"]).optional().default("cosine"),
  ollamaEndpoint: z.string().optional(),
  customEmbeddingEndpoint: z.string().optional(),
  embeddingTimeoutMs: z.number().int().positive().optional().default(10000),
  // Use object().catchall(...) instead of z.record(...) to avoid signature
  // mismatches across Zod versions while enforcing value types.
  extras: z.object({}).catchall(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
});

/** Load opencode.json from project root if present and merge with defaults */
export async function loadConfig(workdir: string): Promise<MemsearchConfig> {
  // defaults
  const defaults: MemsearchConfig = {
    memoryDirectory: path.resolve(workdir, "memsearch_data"),
    embeddingProvider: "openai",
    topK: 10,
    persist: true,
    smartSearch: DefaultSmartSearch,
    distanceMetric: "cosine",
    embeddingTimeoutMs: 10000,
    extras: {},
  };

  const configPath = path.join(workdir, "opencode.json");
  let userConfig: any = {};

  if (existsSync(configPath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const raw = require(configPath);
      if (raw && typeof raw === "object" && raw.memsearch) {
        userConfig = raw.memsearch;
      }
    } catch (err) {
      // ignore and fallback to defaults
    }
  }

  // Environment fallback for API key
  if (!userConfig.embeddingApiKey && process.env.OPENAI_API_KEY) {
    userConfig.embeddingApiKey = process.env.OPENAI_API_KEY;
  }

  const merged = {
    ...defaults,
    ...userConfig,
    smartSearch: { ...defaults.smartSearch, ...(userConfig.smartSearch || {}) },
    extras: { ...(defaults.extras || {}), ...(userConfig.extras || {}) },
  };

  const parsed = ConfigSchema.parse(merged);

  // Cast to MemsearchConfig (types align with schema)
  return parsed as unknown as MemsearchConfig;
}

export default loadConfig;
