/**
 * @file config-yaml.ts
 * @description Configuration loader for .memsearch.yaml with schema validation
 *              and environment variable interpolation support.
 */

import { existsSync, readFileSync } from "fs";
import yaml from "js-yaml";
import path from "path";
import { z } from "zod";
import type { EmbeddingProvider } from "../types";

// ============================================
// YAML Config Schemas
// ============================================

/** Frequency control options for extraction */
export const FrequencyConfigSchema = z.object({
	mode: z
		.enum(["manual", "per-session", "interval-minutes", "on-demand"])
		.default("manual"),
	intervalMinutes: z.number().int().positive().optional().default(60),
	onCompact: z.boolean().optional().default(false),
});

export type FrequencyConfig = z.infer<typeof FrequencyConfigSchema>;

/** Memory type tag list configuration */
export const TagListConfigSchema = z.object({
	id: z.string(),
	description: z.string(),
	tags: z.array(z.string()).default([]),
	manageable: z.boolean().optional().default(false),
});

export type TagListConfig = z.infer<typeof TagListConfigSchema>;

/** Output configuration for a memory type */
export const MemoryTypeOutputSchema = z.object({
	path: z.string().default("memory"),
	filenamePattern: z.string().default("{date}_{session_id}.md"),
	frontmatter: z
		.array(z.string())
		.default(["session_id", "project_path", "tags", "extracted_at"]),
});

export type MemoryTypeOutput = z.infer<typeof MemoryTypeOutputSchema>;

/** Configuration for a single memory type */
export const MemoryTypeConfigSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	collection: z.string(),
	enabled: z.boolean().default(true),
	tagLists: z.array(TagListConfigSchema).default([]),
	model: z.string().optional(),
	additionalPrompt: z.string().optional(),
	output: MemoryTypeOutputSchema.optional().default({
		path: "memory",
		filenamePattern: "{date}_{session_id}.md",
		frontmatter: ["session_id", "project_path", "tags", "extracted_at"],
	}),
	frequency: FrequencyConfigSchema.optional().default({
		mode: "manual",
		intervalMinutes: 60,
		onCompact: false,
	}),
});

export type MemoryTypeConfig = z.infer<typeof MemoryTypeConfigSchema>;

/** Extraction agent configuration */
export const ExtractionConfigSchema = z.object({
	defaultModel: z.string().optional(),
	timeout: z.number().int().positive().optional().default(30),
	maxRetries: z.number().int().nonnegative().optional().default(2),
	autoExtract: z.boolean().optional().default(true),
	frequency: FrequencyConfigSchema.optional().default({
		mode: "manual",
		intervalMinutes: 60,
		onCompact: false,
	}),
	// Top-level convenience flag: run extraction after compaction. Kept for backward compatibility
	// with per-frequency onCompact. Final behavior will OR both flags so either can enable the
	// post-compact run.
	onCompact: z.boolean().optional().default(false),
});

export type ExtractionConfig = z.infer<typeof ExtractionConfigSchema>;

/** Collection settings */
export const CollectionConfigSchema = z.object({
	autoCreate: z.boolean().optional().default(true),
	metadataFields: z
		.array(z.string())
		.default(["technologies", "tags", "session_id", "extracted_at"]),
});

export type CollectionConfig = z.infer<typeof CollectionConfigSchema>;

/** Deduplication settings */
export const DeduplicationConfigSchema = z.object({
	enabled: z.boolean().optional().default(true),
	similarityThreshold: z.number().min(0).max(1).optional().default(0.85),
	autoMerge: z.boolean().optional().default(false),
});

export type DeduplicationConfig = z.infer<typeof DeduplicationConfigSchema>;

/** Compaction capture settings */
export const CompactionConfigSchema = z.object({
	capture: z.boolean().optional().default(true),
	memoryType: z.string().optional().default("context"),
});

export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;

/** Global defaults that can be overridden per memory type */
export const DefaultsConfigSchema = z.object({
	model: z.string().optional(),
	maxTokens: z.number().int().positive().optional().default(2000),
});

export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

/** Agent runtime configuration */
export const AgentConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional().default(0.7),
	maxTokens: z.number().int().positive().optional().default(2000),
	systemPrompt: z.string().optional(),
	scopedWritePaths: z.array(z.string()).default(["memory/"]),
	enabled: z.boolean().optional().default(true),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Main .memsearch.yaml config schema */
export const MemsearchYamlConfigSchema = z.object({
	version: z.number().int().positive().optional().default(1),
	memoryTypes: z.array(MemoryTypeConfigSchema).default([]),
	extraction: ExtractionConfigSchema.optional(),
	collections: CollectionConfigSchema.optional(),
	deduplication: DeduplicationConfigSchema.optional(),
	compaction: CompactionConfigSchema.optional(),
	defaults: DefaultsConfigSchema.optional(),
	agent: AgentConfigSchema.optional(),
});

export type MemsearchYamlConfig = z.infer<typeof MemsearchYamlConfigSchema>;

// ============================================
// Environment Variable Interpolation
// ============================================

/**
 * Interpolate environment variables in a string.
 * Supports ${VAR} and ${VAR:-default} syntax.
 */
function interpolateEnvVars(value: string): string {
	return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
		const [varName, defaultValue] = expr.split(":-");
		const envValue = process.env[varName];
		if (envValue !== undefined) {
			return envValue;
		}
		if (defaultValue !== undefined) {
			return defaultValue;
		}
		// Return empty string if neither env var nor default
		return "";
	});
}

/**
 * Recursively interpolate environment variables in an object.
 */
function interpolateObject(obj: unknown): unknown {
	if (typeof obj === "string") {
		return interpolateEnvVars(obj);
	}
	if (Array.isArray(obj)) {
		return obj.map(interpolateObject);
	}
	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = interpolateObject(value);
		}
		return result;
	}
	return obj;
}

function applyDefaults(config: MemsearchYamlConfig): MemsearchYamlConfig {
	return {
		version: config.version ?? 1,
		memoryTypes: config.memoryTypes ?? [],
		extraction: config.extraction ?? {
			defaultModel: undefined,
			timeout: 30,
			maxRetries: 2,
			autoExtract: true,
			frequency: { mode: "manual", intervalMinutes: 60, onCompact: false },
			onCompact: false,
		},
		collections: config.collections ?? {
			autoCreate: true,
			metadataFields: ["technologies", "tags", "session_id", "extracted_at"],
		},
		deduplication: config.deduplication ?? {
			enabled: true,
			similarityThreshold: 0.85,
			autoMerge: false,
		},
		compaction: config.compaction ?? {
			capture: true,
			memoryType: "context",
		},
		defaults: config.defaults ?? {
			model: undefined,
			maxTokens: 2000,
		},
		agent: config.agent ?? {
			model: undefined,
			temperature: 0.7,
			maxTokens: 2000,
			systemPrompt: undefined,
			scopedWritePaths: ["memory/"],
			enabled: true,
		},
	};
}

// ============================================
// Config Loader
// ============================================

/**
 * Load and parse memsearch config from .opencode/memsearch.yaml.
 * @param workdir Project working directory
 * @returns Parsed config or null if file doesn't exist
 */
export function loadYamlConfig(workdir: string): MemsearchYamlConfig | null {
	const configPath = path.join(workdir, ".opencode", "memsearch.yaml");
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf8");
		const raw = yaml.load(content);

		if (!raw || typeof raw !== "object") {
			console.warn("memsearch: .opencode/memsearch.yaml is empty or invalid, ignoring");
			return null;
		}

		// Interpolate environment variables
		const interpolated = interpolateObject(raw);

		// Validate and parse
		const parsed = MemsearchYamlConfigSchema.parse(interpolated);
		return applyDefaults(parsed);
	} catch (err) {
		console.error("memsearch: failed to load .opencode/memsearch.yaml:", err);
		return null;
	}
}

/**
 * Check if memsearch config exists in .opencode/memsearch.yaml.
 * @param workdir Project working directory
 * @returns true if config file exists
 */
export function hasYamlConfig(workdir: string): boolean {
	return existsSync(path.join(workdir, ".opencode", "memsearch.yaml"));
}

/**
 * Get the path to the memsearch config file.
 * @param workdir Project working directory
 * @returns Path to config file
 */
export function getYamlConfigPath(workdir: string): string {
	return path.join(workdir, ".opencode", "memsearch.yaml");
}

/**
 * Merge YAML config with legacy opencode.json config.
 * YAML config takes precedence for new fields.
 */
export function mergeWithLegacyConfig(
	yamlConfig: MemsearchYamlConfig | null,
	legacyConfig: ReturnType<
		typeof import("../config").loadConfig
	> extends Promise<infer R>
		? R
		: never,
): unknown {
	// If no YAML config, return legacy config as-is
	if (!yamlConfig) {
		return legacyConfig;
	}

	// Start with legacy config as base
	const merged: Record<string, unknown> = { ...legacyConfig } as Record<
		string,
		unknown
	>;

	// Override/add new fields from YAML config
	// Note: Legacy config doesn't have memoryTypes, extraction, etc.
	// These are new fields that only come from YAML

	if (yamlConfig.extraction) {
		(merged as Record<string, unknown>)["extraction"] = yamlConfig.extraction;
	}

	if (yamlConfig.collections) {
		(merged as Record<string, unknown>)["collections"] = yamlConfig.collections;
	}

	if (yamlConfig.deduplication) {
		(merged as Record<string, unknown>)["deduplication"] =
			yamlConfig.deduplication;
	}

	if (yamlConfig.compaction) {
		(merged as Record<string, unknown>)["compaction"] = yamlConfig.compaction;
	}

	if (yamlConfig.defaults) {
		(merged as Record<string, unknown>)["defaults"] = yamlConfig.defaults;
	}

	if (yamlConfig.memoryTypes && yamlConfig.memoryTypes.length > 0) {
		(merged as Record<string, unknown>)["memoryTypes"] = yamlConfig.memoryTypes;
	}

	if (yamlConfig.agent) {
		(merged as Record<string, unknown>)["agent"] = yamlConfig.agent;
	}

	return merged;
}

export default loadYamlConfig;
