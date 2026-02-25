import { existsSync, readFileSync } from "fs";
import path from "path";
import { homedir } from "os";
import { z } from "zod";
import type { MemsearchConfig, SmartSearchConfig, MemorySource } from "./types";
import { loadYamlConfig, mergeWithLegacyConfig, hasYamlConfig } from "./lib/config-yaml";
import { loadMemoryTypes } from "./lib/memory-type-config-loader";

/**
 * Migration warning details for legacy config users
 */
export interface MigrationWarning {
  type: "migrate_to_yaml";
  message: string;
  instruction: string;
  legacyConfigPresent: boolean;
  yamlConfigPresent: boolean;
}

const DefaultSmartSearch: SmartSearchConfig = {
  enabled: true,
  rerankerModel: "text-embedding-3-small",
  rerankTopK: 10,
  queryExpansion: false,
};

const MemorySourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pathOrCollection: z.string(),
  collection: z.string().optional(),
  enabled: z.boolean(),
  search: z.object({
    maxResults: z.number().int().positive(),
    minScore: z.number().min(0).max(1).optional(),
    filter: z.string().optional(),
    groupBySource: z.boolean().optional(),
    maxChunksPerSource: z.number().int().positive().optional(),
  }),
  injection: z.object({
    template: z.string(),
    maxContentLength: z.number().int().positive(),
    includeSource: z.boolean().optional(),
  }),
});

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
  sources: z.array(MemorySourceSchema).optional(),
  defaultSource: MemorySourceSchema.optional(),
  // Use object().catchall(...) instead of z.record(...) to avoid signature
  // mismatches across Zod versions while enforcing value types.
  extras: z.object({}).catchall(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
});

function getDefaultSources(workdir: string): MemorySource[] {
  const globalSkillsPath = path.join(homedir(), ".config", "opencode", "skills");
  const projectSkillsPath = path.join(workdir, ".opencode", "skills");

  return [
    {
      id: "session-memory",
      name: "Session Memory",
      pathOrCollection: "memsearch_session",
      enabled: true,
      search: { maxResults: 5 },
      injection: {
        template: "## Relevant Context\n{{content}}",
        maxContentLength: 500,
      },
    },
    {
      id: "global-skills",
      name: "Global Skills",
      pathOrCollection: globalSkillsPath,
      collection: "memsearch_global_skills",
      enabled: existsSync(globalSkillsPath),
      search: {
        maxResults: 5,
        groupBySource: true,
        maxChunksPerSource: 3,
      },
      injection: {
        template: "## Relevant Skills (Global)\n{{content}}",
        maxContentLength: 800,
      },
    },
    {
      id: "project-skills",
      name: "Project Skills",
      pathOrCollection: projectSkillsPath,
      collection: "memsearch_project_skills",
      enabled: existsSync(projectSkillsPath),
      search: {
        maxResults: 5,
        groupBySource: true,
        maxChunksPerSource: 3,
      },
      injection: {
        template: "## Project Skills\n{{content}}",
        maxContentLength: 800,
      },
    },
    {
      id: "docs",
      name: "Documentation",
      pathOrCollection: "memsearch_docs",
      enabled: false,
      search: { maxResults: 5 },
      injection: {
        template: "## Relevant Documentation\n{{content}}",
        maxContentLength: 600,
      },
    },
  ];
}

/** Load config from .memsearch.yaml first, falling back to opencode.json, then scan memory types */
export async function loadConfig(workdir: string): Promise<MemsearchConfig> {
  const yamlConfig = loadYamlConfig(workdir);
  const legacyConfig = await loadLegacyConfig(workdir);

  const merged = mergeWithLegacyConfig(yamlConfig, legacyConfig) as Record<string, unknown>;

  const scanned = loadMemoryTypes(workdir);
  const yamlMemoryTypes = yamlConfig?.memoryTypes || [];

  const scannedMap = new Map<string, unknown>();
  for (const mt of scanned.memoryTypes) {
    scannedMap.set(mt.name, mt);
  }
  for (const mt of yamlMemoryTypes) {
    if (!scannedMap.has(mt.name)) {
      scannedMap.set(mt.name, mt);
    }
  }

  merged.memoryTypes = Array.from(scannedMap.values());

  // Build extras object - start with existing extras from scanned errors
  const extras: Record<string, unknown> = { ...(merged.extras as Record<string, unknown>) };

  if (scanned.validationErrors.length > 0) {
    extras.memoryTypeValidationErrors = scanned.validationErrors;
  }

  // Check for legacy config migration warning
  const legacyConfigPath = path.join(workdir, "opencode.json");
  const hasLegacy = existsSync(legacyConfigPath) && legacyConfigHasMemsearch(legacyConfigPath);
  const hasYaml = hasYamlConfig(workdir);

  if (hasLegacy && !hasYaml) {
    // Migration warning - legacy config present but no .memsearch.yaml
    const migrationWarning: MigrationWarning = {
      type: "migrate_to_yaml",
      message: "Legacy memsearch configuration detected in opencode.json",
      instruction: "Run: cp .memsearch.yaml.example .memsearch.yaml (or manually create .memsearch.yaml based on your opencode.json memsearch section)",
      legacyConfigPresent: true,
      yamlConfigPresent: false,
    };
    extras.migrationWarning = migrationWarning;
  } else if (hasLegacy && hasYaml) {
    // Both present - this is OK, but note it in extras for visibility
    const migrationInfo = {
      type: "migrate_to_yaml",
      message: "Both opencode.json and .memsearch.yaml present - YAML takes precedence",
      instruction: "Once migrated, you can remove the memsearch section from opencode.json",
      legacyConfigPresent: true,
      yamlConfigPresent: true,
    };
    extras.migrationWarning = migrationInfo;
  }

  merged.extras = extras;

  return merged as unknown as MemsearchConfig;
}

/**
 * Check if opencode.json has memsearch configuration section.
 */
function legacyConfigHasMemsearch(configPath: string): boolean {
  if (!existsSync(configPath)) {
    return false;
  }
  try {
    const content = readFileSync(configPath, "utf8");
    const raw = JSON.parse(content);
    return !!(raw && typeof raw === "object" && raw.memsearch);
  } catch {
    return false;
  }
}

async function loadLegacyConfig(workdir: string): Promise<MemsearchConfig> {
  const defaultSources = getDefaultSources(workdir);
  const defaults: MemsearchConfig = {
    memoryDirectory: path.resolve(workdir, "memsearch_data"),
    embeddingProvider: "openai",
    topK: 10,
    persist: true,
    smartSearch: DefaultSmartSearch,
    distanceMetric: "cosine",
    embeddingTimeoutMs: 10000,
    sources: defaultSources,
    extras: {},
  };

  const configPath = path.join(workdir, "opencode.json");
  let userConfig: any = {};

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf8");
      const raw = JSON.parse(content);
      if (raw && typeof raw === "object" && raw.memsearch) {
        userConfig = raw.memsearch;
      }
    } catch (err) {
      // ignore and fallback to defaults
    }
  }

  if (!userConfig.embeddingApiKey && process.env.OPENAI_API_KEY) {
    userConfig.embeddingApiKey = process.env.OPENAI_API_KEY;
  }

  const merged = {
    ...defaults,
    ...userConfig,
    smartSearch: { ...defaults.smartSearch, ...(userConfig.smartSearch || {}) },
    sources: mergeSources(defaults.sources || [], userConfig.sources || []),
    extras: { ...(defaults.extras || {}), ...(userConfig.extras || {}) },
  };

  const parsed = ConfigSchema.parse(merged);
  return parsed as unknown as MemsearchConfig;
}

function mergeSources(defaults: MemorySource[], userSources: any[]): MemorySource[] {
  if (!Array.isArray(userSources)) return defaults;

  const merged = [...defaults];
  for (const userSource of userSources) {
    const index = merged.findIndex((s) => s.id === userSource.id);
    if (index !== -1) {
      merged[index] = {
        ...merged[index],
        ...userSource,
        search: { ...merged[index].search, ...(userSource.search || {}) },
        injection: { ...merged[index].injection, ...(userSource.injection || {}) },
      };
    } else {
      merged.push(userSource);
    }
  }
  return merged;
}

export default loadConfig;
