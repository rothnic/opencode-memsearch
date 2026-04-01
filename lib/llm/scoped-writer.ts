/**
 * @file scoped-writer.ts
 * @description Scoped write permission system for the configurable extraction pipeline (Task 14).
 *              Validates all file writes against allowed paths per memory type to prevent path traversal attacks.
 */

import path from "node:path";

/**
 * Configuration for a single memory type's allowed write paths
 */
export interface MemoryTypeScope {
	/** Memory type name (e.g., 'decision', 'convention', 'context') */
	type: string;
	/** Allowed base paths for this memory type - can be relative or absolute */
	allowedPaths: string[];
}

/**
 * ScopedWriter validates all write operations against allowed paths.
 * Prevents path traversal attacks by normalizing and validating paths before any write.
 */
export class ScopedWriter {
	private scopes: Map<string, string[]> = new Map();

	/**
	 * Create a new ScopedWriter with the given memory type scopes.
	 * @param scopes Array of MemoryTypeScope configurations
	 */
	constructor(scopes: MemoryTypeScope[] = []) {
		for (const scope of scopes) {
			this.addScope(scope.type, scope.allowedPaths);
		}
	}

	/**
	 * Add or update a scope for a memory type.
	 * @param type Memory type name
	 * @param allowedPaths Allowed base paths (will be normalized to absolute)
	 */
	addScope(type: string, allowedPaths: string[]): void {
		// Normalize all paths to absolute
		const normalizedPaths = allowedPaths.map((p) => this.normalizePath(p));
		this.scopes.set(type, normalizedPaths);
	}

	/**
	 * Remove a scope for a memory type.
	 * @param type Memory type name
	 */
	removeScope(type: string): void {
		this.scopes.delete(type);
	}

	/**
	 * Get allowed paths for a memory type.
	 * @param type Memory type name
	 * @returns Array of allowed absolute paths, or empty array if not configured
	 */
	getAllowedPaths(type: string): string[] {
		return this.scopes.get(type) ?? [];
	}

	/**
	 * Check if a memory type has any scopes configured.
	 * @param type Memory type name
	 * @returns true if scope exists
	 */
	hasScope(type: string): boolean {
		return this.scopes.has(type);
	}

	/**
	 * Normalize a path: resolve to absolute, normalize separators, remove trailing slashes.
	 * @param filePath Path to normalize
	 * @returns Normalized absolute path
	 */
	private normalizePath(filePath: string): string {
		// Resolve to absolute path (handles ~, relative paths, etc.)
		const resolved = path.resolve(filePath);
		// Normalize separators and remove trailing slashes
		return path.normalize(resolved);
	}

	/**
	 * Validate that a path is within allowed scopes.
	 * @param targetPath Path to validate
	 * @param type Memory type scope to validate against
	 * @returns Validated absolute path if allowed
	 * @throws Error if path is outside allowed scopes or contains traversal
	 */
	validatePath(targetPath: string, type: string): string {
		const allowedPaths = this.scopes.get(type);
		if (!allowedPaths || allowedPaths.length === 0) {
			throw new Error(
				`[ScopedWriter] No allowed paths configured for memory type '${type}'. ` +
					`Use addScope() to configure allowed paths first.`,
			);
		}

		// Check for path traversal patterns on ORIGINAL path BEFORE any normalization
		// This catches attempts like "../../../etc/passwd" or "subdir/../other"
		if (this.containsTraversal(targetPath)) {
			throw new Error(
				`[ScopedWriter] Path traversal detected in '${targetPath}'. ` +
					`Paths containing '..' are not allowed.`,
			);
		}

		// Now normalize the target path
		const normalizedTarget = this.normalizePath(targetPath);

		// Check if target is within any of the allowed paths
		for (const allowedPath of allowedPaths) {
			if (this.isWithinScope(normalizedTarget, allowedPath)) {
				return normalizedTarget;
			}
		}

		// Build error message with allowed paths
		const allowedList = allowedPaths.join(", ");
		throw new Error(
			`[ScopedWriter] Access denied: Path '${targetPath}' is not within allowed paths for '${type}'. ` +
				`Allowed paths: [${allowedList}]. ` +
				`Normalized target: '${normalizedTarget}'.`,
		);
	}

	/**
	 * Check if a path contains traversal sequences.
	 * @param filePath Original path to check (before normalization)
	 * @returns true if path contains '..' segments
	 */
	private containsTraversal(filePath: string): boolean {
		// Check for ".." as path component in the original string
		// Use path.sep to handle both Unix and Windows separators
		const parts = filePath.split(/[/\\]/);
		return parts.includes("..");
	}

	/**
	 * Check if target path is within (or equal to) the scope path.
	 * @param targetPath Absolute target path
	 * @param scopePath Absolute scope/base path
	 * @returns true if target is within scope
	 */
	private isWithinScope(targetPath: string, scopePath: string): boolean {
		// Ensure scope ends with separator for accurate prefix matching
		const scopeWithSep = scopePath.endsWith(path.sep)
			? scopePath
			: scopePath + path.sep;
		return targetPath === scopePath || targetPath.startsWith(scopeWithSep);
	}

	/**
	 * Validate a write operation. Returns the validated absolute path.
	 * Use this before any file write operation.
	 * @param targetPath Path to write to
	 * @param type Memory type scope
	 * @returns Validated absolute path
	 * @throws Error if path is not allowed
	 */
	validateWrite(targetPath: string, type: string): string {
		return this.validatePath(targetPath, type);
	}

	/**
	 * Validate a directory creation operation.
	 * Use this before ensureDir or mkdir operations.
	 * @param dirPath Directory path to validate
	 * @param type Memory type scope
	 * @returns Validated absolute directory path
	 * @throws Error if path is not allowed
	 */
	validateDir(dirPath: string, type: string): string {
		return this.validatePath(dirPath, type);
	}

	/**
	 * Write a file (validation only - returns path for actual write).
	 * Call this to get the validated path, then perform the actual write.
	 * @param filePath File path to write
	 * @param type Memory type scope
	 * @returns Validated absolute file path
	 * @throws Error if path is not allowed
	 */
	writeFile(filePath: string, type: string): string {
		return this.validateWrite(filePath, type);
	}

	/**
	 * Ensure a directory exists (validation only - returns path for actual operation).
	 * Call this to get the validated path, then perform the actual mkdir.
	 * @param dirPath Directory path
	 * @param type Memory type scope
	 * @returns Validated absolute directory path
	 * @throws Error if path is not allowed
	 */
	ensureDir(dirPath: string, type: string): string {
		return this.validateDir(dirPath, type);
	}

	/**
	 * Get all configured scopes.
	 * @returns Map of memory type to allowed paths
	 */
	getAllScopes(): Map<string, string[]> {
		return new Map(this.scopes);
	}

	/**
	 * Check if a path would be allowed (without throwing).
	 * Useful for UI hints or preflight checks.
	 * @param targetPath Path to check
	 * @param type Memory type scope
	 * @returns true if path is allowed
	 */
	isAllowed(targetPath: string, type: string): boolean {
		try {
			this.validatePath(targetPath, type);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Create a ScopedWriter from memory type configurations.
 * Extracts output.path from each memory type config.
 * @param memoryTypes Array of memory type configs with output.path field
 * @returns Configured ScopedWriter instance
 */
export function createScopedWriterFromConfig<
	T extends { name: string; output?: { path?: string } },
>(memoryTypes: T[]): ScopedWriter {
	const scopes: MemoryTypeScope[] = memoryTypes
		.filter((mt) => mt.output?.path)
		.map((mt) => ({
			type: mt.name,
			allowedPaths: [mt.output!.path!],
		}));

	return new ScopedWriter(scopes);
}

export default ScopedWriter;
