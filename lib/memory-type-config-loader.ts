/**
 * @file memory-type-config-loader.ts
 * @description Loads and merges memory type configs from project memory/ directories
 *              and global memory type configs. Validates all configs on load.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import yaml from "js-yaml";
import { homedir } from "os";
import path from "path";
import {
	type MemoryTypeConfig,
	MemoryTypeConfigSchema,
} from "./memory-type-config";

/** Global memory types directory following project conventions */
const GLOBAL_MEMORY_TYPES_DIR = path.join(
	homedir(),
	".config",
	"opencode",
	"memory",
);

/** Project memory types directory */
const PROJECT_MEMORY_DIR = "memory";

/** Config filename in each memory type directory */
const CONFIG_FILENAME = "config.yaml";

/** Validation errors collected during loading */
export interface ValidationError {
	source: string; // "project" | "global"
	path: string;
	error: string;
}

/** Loaded memory type result */
export interface LoadedMemoryTypes {
	/** Successfully loaded memory types (merged) */
	memoryTypes: MemoryTypeConfig[];
	/** Validation errors encountered (non-fatal) */
	validationErrors: ValidationError[];
}

/**
 * Load and parse a single memory type config file.
 * Returns null if file doesn't exist or is invalid.
 */
function loadSingleMemoryTypeConfig(
	configPath: string,
): MemoryTypeConfig | null {
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf8");
		const raw = yaml.load(content);

		if (!raw || typeof raw !== "object") {
			return null;
		}

		return MemoryTypeConfigSchema.parse(raw);
	} catch (err) {
		// Invalid config - will be reported as validation error
		return null;
	}
}

/**
 * Scan a directory for memory type configs (subdirectories with config.yaml).
 * Returns a map of memory type name -> config.
 */
function scanMemoryTypeConfigs(
	baseDir: string,
	source: "project" | "global",
): Map<string, MemoryTypeConfig> {
	const configs = new Map<string, MemoryTypeConfig>();

	if (!existsSync(baseDir)) {
		return configs;
	}

	try {
		const entries = readdirSync(baseDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const configPath = path.join(baseDir, entry.name, CONFIG_FILENAME);
			const config = loadSingleMemoryTypeConfig(configPath);

			if (config) {
				configs.set(config.name, config);
			}
		}
	} catch (err) {
		// Directory read error - skip silently
		console.warn(
			`memsearch: failed to scan ${source} memory types directory: ${baseDir}`,
		);
	}

	return configs;
}

/**
 * Validate a raw config object against MemoryTypeConfigSchema.
 * Returns validation errors if any.
 */
function validateMemoryTypeConfig(
	raw: unknown,
	source: "project" | "global",
	configPath: string,
): ValidationError[] {
	const errors: ValidationError[] = [];

	try {
		MemoryTypeConfigSchema.parse(raw);
	} catch (err) {
		if (err instanceof Error) {
			errors.push({
				source,
				path: configPath,
				error: err.message,
			});
		} else {
			errors.push({
				source,
				path: configPath,
				error: "Unknown validation error",
			});
		}
	}

	return errors;
}

/**
 * Scan for memory type configs in a directory and return with validation errors.
 */
function scanMemoryTypeConfigsWithValidation(
	baseDir: string,
	source: "project" | "global",
): { configs: Map<string, MemoryTypeConfig>; errors: ValidationError[] } {
	const configs = new Map<string, MemoryTypeConfig>();
	const errors: ValidationError[] = [];

	if (!existsSync(baseDir)) {
		return { configs, errors };
	}

	try {
		const entries = readdirSync(baseDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const configPath = path.join(baseDir, entry.name, CONFIG_FILENAME);

			if (!existsSync(configPath)) {
				continue;
			}

			try {
				const content = readFileSync(configPath, "utf8");
				const raw = yaml.load(content);

				if (!raw || typeof raw !== "object") {
					errors.push({
						source,
						path: configPath,
						error: "Empty or invalid YAML",
					});
					continue;
				}

				const validated = MemoryTypeConfigSchema.parse(raw);
				configs.set(validated.name, validated);
			} catch (err) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown validation error";
				errors.push({
					source,
					path: configPath,
					error: errorMessage,
				});
			}
		}
	} catch (err) {
		// Directory read error
		console.warn(
			`memsearch: failed to scan ${source} memory types directory: ${baseDir}`,
		);
	}

	return { configs, errors };
}

/**
 * Get the global memory types directory path.
 */
export function getGlobalMemoryTypesDir(): string {
	return GLOBAL_MEMORY_TYPES_DIR;
}

/**
 * Get the project memory types directory path for a given workdir.
 */
export function getProjectMemoryTypesDir(workdir: string): string {
	return path.join(workdir, PROJECT_MEMORY_DIR);
}

/**
 * Load all memory type configs from project and global locations.
 *
 * Merge strategy:
 * - Project-level configs take precedence over global configs on name collision
 * - Invalid configs are collected as non-fatal errors
 * - Returns all valid configs combined
 *
 * @param workdir - The project working directory
 * @returns Loaded memory types with any validation errors encountered
 */
export function loadMemoryTypes(workdir: string): LoadedMemoryTypes {
	const globalDir = getGlobalMemoryTypesDir();
	const projectDir = getProjectMemoryTypesDir(workdir);

	// Scan both locations with validation
	const globalResult = scanMemoryTypeConfigsWithValidation(globalDir, "global");
	const projectResult = scanMemoryTypeConfigsWithValidation(
		projectDir,
		"project",
	);

	// Start with global configs as base
	const merged = new Map<string, MemoryTypeConfig>();

	// Add global configs first (lower precedence)
	for (const [name, config] of globalResult.configs) {
		merged.set(name, config);
	}

	// Override with project configs (higher precedence)
	for (const [name, config] of projectResult.configs) {
		merged.set(name, config);
	}

	// Combine validation errors (project errors first for visibility)
	const allErrors: ValidationError[] = [
		...projectResult.errors,
		...globalResult.errors,
	];

	return {
		memoryTypes: Array.from(merged.values()),
		validationErrors: allErrors,
	};
}

/**
 * Load memory types from just the project directory.
 * Useful when you don't want global configs.
 *
 * @param workdir - The project working directory
 * @returns Loaded memory types with any validation errors encountered
 */
export function loadProjectMemoryTypes(workdir: string): LoadedMemoryTypes {
	const projectDir = getProjectMemoryTypesDir(workdir);
	const result = scanMemoryTypeConfigsWithValidation(projectDir, "project");

	return {
		memoryTypes: Array.from(result.configs.values()),
		validationErrors: result.errors,
	};
}

/**
 * Load memory types from just the global directory.
 *
 * @returns Loaded memory types with any validation errors encountered
 */
export function loadGlobalMemoryTypes(): LoadedMemoryTypes {
	const globalDir = getGlobalMemoryTypesDir();
	const result = scanMemoryTypeConfigsWithValidation(globalDir, "global");

	return {
		memoryTypes: Array.from(result.configs.values()),
		validationErrors: result.errors,
	};
}

/**
 * Check if a project has memory type configs.
 */
export function hasProjectMemoryTypes(workdir: string): boolean {
	const projectDir = getProjectMemoryTypesDir(workdir);

	if (!existsSync(projectDir)) {
		return false;
	}

	try {
		const entries = readdirSync(projectDir, { withFileTypes: true });
		return entries.some(
			(entry) =>
				entry.isDirectory() &&
				existsSync(path.join(projectDir, entry.name, CONFIG_FILENAME)),
		);
	} catch {
		return false;
	}
}

/**
 * Check if global memory types exist.
 */
export function hasGlobalMemoryTypes(): boolean {
	if (!existsSync(GLOBAL_MEMORY_TYPES_DIR)) {
		return false;
	}

	try {
		const entries = readdirSync(GLOBAL_MEMORY_TYPES_DIR, {
			withFileTypes: true,
		});
		return entries.some(
			(entry) =>
				entry.isDirectory() &&
				existsSync(
					path.join(GLOBAL_MEMORY_TYPES_DIR, entry.name, CONFIG_FILENAME),
				),
		);
	} catch {
		return false;
	}
}

export default loadMemoryTypes;
