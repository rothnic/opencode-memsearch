/**
 * @file memory-type-collection-resolver.ts
 * @description Resolve a physical collection name for a memory type.
 * - Honors explicit config.collection when a registry/config is available
 * - Produces a deterministic, validated fallback name for unknown types
 */

import { CollectionNameRegex } from "./memory-type-config";
import type { MemoryTypeRegistry } from "./memory-types";

export interface ResolverOptions {
	prefix?: string; // prefix for generated collection names (default: 'memory_')
}

/**
 * Sanitize and produce a collection name that satisfies CollectionNameRegex.
 * Deterministic: same input -> same output.
 */
export function sanitizeCollectionName(
	input: string,
	prefix = "memory_",
): string {
	// normalize
	const lower = String(input ?? "").toLowerCase();

	// replace invalid characters with underscore (allowed: letters, digits, _ and -)
	const body = lower.replace(/[^a-z0-9_-]/g, "_");

	// join with prefix
	let candidate = `${prefix}${body}`;

	// Ensure starts with a letter (CollectionNameRegex requires starting letter)
	if (!/^[a-z]/.test(candidate)) {
		candidate = `m${candidate}`; // prefix with letter
	}

	// Enforce length limits (3..64) by truncation at 64
	if (candidate.length > 64) {
		candidate = candidate.slice(0, 64);
	}

	// Guarantee minimum length of 3
	if (candidate.length < 3) {
		candidate = candidate.padEnd(3, "x");
	}

	// Final guard: if it doesn't match regex, fallback to a safe constant
	if (!CollectionNameRegex.test(candidate)) {
		// should be very rare; return a safe default
		return "memory_default";
	}

	return candidate;
}

/**
 * Resolve a collection name for the given memory type name.
 * If a registry is provided and contains the type, the registry's config.collection
 * is returned (honors custom collection values). Otherwise a deterministic
 * sanitized fallback is returned.
 */
export function resolveCollectionName(
	typeName: string,
	registry?: MemoryTypeRegistry,
	opts: ResolverOptions = {},
): string {
	// If registry provided and has the type, return configured collection
	try {
		if (registry && typeof registry.getByName === "function") {
			const conf = registry.getByName(typeName);
			if (
				conf &&
				typeof conf.collection === "string" &&
				CollectionNameRegex.test(conf.collection)
			) {
				return conf.collection;
			}
		}
	} catch (e) {
		// fail-open: fall back to deterministic name
	}

	const prefix = opts.prefix ?? "memory_";
	return sanitizeCollectionName(typeName, prefix);
}

export default resolveCollectionName;
