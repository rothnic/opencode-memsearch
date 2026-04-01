/**
 * @file collection-manager.ts
 * @description Manages memsearch collection creation and lifecycle.
 *              Checks collection existence, creates with proper schema including metadata fields.
 */

import { $ } from "bun";

type ShellExecutor = ReturnType<typeof $>;

export type CollectionManagerErrorCode =
	| "cli_not_found"
	| "collection_check_failed"
	| "collection_create_failed"
	| "invalid_collection_name"
	| "schema_validation_failed"
	| "io_error";

export class CollectionManagerError extends Error {
	readonly code: CollectionManagerErrorCode;
	readonly retryable: boolean;

	constructor(
		code: CollectionManagerErrorCode,
		message: string,
		options?: {
			retryable?: boolean;
			cause?: unknown;
		},
	) {
		super(message, { cause: options?.cause });
		this.name = "CollectionManagerError";
		this.code = code;
		this.retryable = options?.retryable ?? false;
	}
}

/**
 * Metadata field definition for collections
 */
export interface CollectionMetadataField {
	name: string;
	type: "string" | "string[]" | "number" | "boolean";
	description?: string;
}

/**
 * Schema configuration for a collection
 */
export interface CollectionSchema {
	/** List of metadata fields to include in the collection */
	metadataFields?: CollectionMetadataField[];
}

/**
 * Result type for collection operations - discriminated union
 */
export type CollectionResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: CollectionManagerError };

/**
 * Information about an existing collection
 */
export interface CollectionInfo {
	name: string;
	exists: boolean;
	documentCount?: number;
	chunkCount?: number;
}

/**
 * Configuration for CollectionManager
 */
export interface CollectionManagerConfig {
	/** Base directory for temporary files during collection creation */
	tempDir?: string;
	/** Default metadata fields to include in new collections */
	defaultMetadataFields?: CollectionMetadataField[];
	/** Shell command executor (defaults to Bun's $) */
	shell?: ShellExecutor;
	/** Callback to execute before index operations */
	onIndex?: (collection: string) => void | Promise<void>;
}

/**
 * Default metadata fields for collections
 */
export const DEFAULT_METADATA_FIELDS: CollectionMetadataField[] = [
	{
		name: "tags",
		type: "string[]",
		description: "Array of tags for categorization",
	},
	{
		name: "source_session",
		type: "string",
		description: "Session ID that created this entry",
	},
	{
		name: "technology",
		type: "string",
		description: "Technology or tool associated with this entry",
	},
];

/**
 * Validates a collection name against the expected pattern.
 * Collection names must start with a letter and contain only letters, digits, underscores, and hyphens.
 */
export function isValidCollectionName(name: string): boolean {
	if (!name || name.length < 3 || name.length > 64) {
		return false;
	}
	// Must start with a letter
	if (!/^[a-zA-Z]/.test(name)) {
		return false;
	}
	// Must contain only valid characters
	return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
}

/**
 * CollectionManager handles memsearch collection lifecycle operations.
 * Provides methods to check collection existence, create collections, and ensure
 * collections exist before indexing.
 */
export class CollectionManager {
	private readonly tempDir: string;
	private readonly defaultMetadataFields: CollectionMetadataField[];
	private readonly shell: ShellExecutor;
	private readonly onIndex?: (collection: string) => void | Promise<void>;
	private cliAvailable: boolean | null = null;

	/**
	 * Private constructor - use factory method fromConfig() to create instances
	 */
	private constructor(config: CollectionManagerConfig) {
		this.tempDir = config.tempDir ?? "/tmp";
		this.defaultMetadataFields =
			config.defaultMetadataFields ?? DEFAULT_METADATA_FIELDS;
		this.shell = config.shell ?? $;
		this.onIndex = config.onIndex;
	}

	/**
	 * Factory method to create a CollectionManager from configuration.
	 * @param config Configuration options
	 * @returns Configured CollectionManager instance
	 */
	static fromConfig(config: CollectionManagerConfig = {}): CollectionManager {
		return new CollectionManager(config);
	}

	/**
	 * Check if the memsearch CLI is available in the system PATH.
	 * @returns true if CLI is available
	 */
	async isCliAvailable(): Promise<boolean> {
		if (this.cliAvailable !== null) {
			return this.cliAvailable;
		}

		try {
			await this.shell`sh -c "memsearch --version"`.quiet();
			this.cliAvailable = true;
			return true;
		} catch {
			this.cliAvailable = false;
			return false;
		}
	}

	/**
	 * Ensure memsearch CLI is available, throw if not.
	 * @throws CollectionManagerError if CLI is not available
	 */
	private async ensureCliAvailable(): Promise<void> {
		if (!(await this.isCliAvailable())) {
			throw new CollectionManagerError(
				"cli_not_found",
				"memsearch CLI not found. Please install it with: pip install memsearch",
				{ retryable: true },
			);
		}
	}

	/**
	 * Check if a collection exists in memsearch.
	 * @param name Collection name to check
	 * @returns true if collection exists
	 */
	async collectionExists(name: string): Promise<boolean> {
		if (!isValidCollectionName(name)) {
			throw new CollectionManagerError(
				"invalid_collection_name",
				`Invalid collection name: "${name}". Must be 3-64 chars, start with letter, contain only letters, digits, underscore, hyphen.`,
				{ retryable: false },
			);
		}

		await this.ensureCliAvailable();

		try {
			// Try to get stats for the collection
			// If collection doesn't exist, memsearch stats throws an error with "collection not found"
			const result = await this
				.shell`sh -c "memsearch stats --collection ${name}"`.quiet();
			if (result.exitCode !== 0) {
				// Check if it's a "collection not found" error by looking at stderr
				const errorMsg = result.stderr || "";
				if (errorMsg.includes("collection not found")) {
					return false;
				}
				// For other errors, treat as a check failure
				throw new CollectionManagerError(
					"collection_check_failed",
					`Failed to check collection "${name}": ${errorMsg}`,
					{ retryable: true },
				);
			}
			return true;
		} catch (err) {
			// This catches errors from the shell execution itself (not from exit code)
			const errorMessage = String(err);
			// If error contains "collection not found", the collection doesn't exist
			if (errorMessage.includes("collection not found")) {
				return false;
			}
			// For other errors, treat as a check failure
			throw new CollectionManagerError(
				"collection_check_failed",
				`Failed to check collection "${name}": ${errorMessage}`,
				{ retryable: true, cause: err },
			);
		}
	}

	/**
	 * Get information about a collection.
	 * @param name Collection name
	 * @returns CollectionInfo with existence and stats
	 */
	async getCollectionInfo(name: string): Promise<CollectionInfo> {
		if (!isValidCollectionName(name)) {
			throw new CollectionManagerError(
				"invalid_collection_name",
				`Invalid collection name: "${name}"`,
				{ retryable: false },
			);
		}

		await this.ensureCliAvailable();

		try {
			// Use throws() to properly catch non-zero exit codes
			const result = await this
				.shell`sh -c "memsearch stats --collection ${name}"`.throws();
			const output = result.stdout ?? "";
			const trimmed = output.trim();

			// Parse stats output - could be JSON or plain text
			let documentCount = 0;
			let chunkCount = 0;

			try {
				const parsed = JSON.parse(trimmed);
				documentCount = parsed.documentCount ?? 0;
				chunkCount = parsed.chunkCount ?? 0;
			} catch {
				// Fallback: parse plain text output
				const docMatch = trimmed.match(/Document[s]?:\s*(\d+)/i);
				const chunkMatch = trimmed.match(/Chunk[s]?:\s*(\d+)/i);
				documentCount = docMatch ? Number(docMatch[1]) : 0;
				chunkCount = chunkMatch ? Number(chunkMatch[1]) : 0;
			}

			return {
				name,
				exists: true,
				documentCount,
				chunkCount,
			};
		} catch (err) {
			const errorMessage = String(err);
			if (errorMessage.includes("collection not found")) {
				return { name, exists: false };
			}
			throw new CollectionManagerError(
				"collection_check_failed",
				`Failed to get collection info for "${name}": ${errorMessage}`,
				{ retryable: true, cause: err },
			);
		}
	}

	/**
	 * Create a collection in memsearch.
	 * Collections are created automatically when indexing, so this method
	 * indexes a minimal placeholder file to trigger collection creation with proper schema.
	 * @param name Collection name
	 * @param schema Optional schema configuration (metadata fields)
	 * @returns CollectionResult with CollectionInfo on success
	 */
	async createCollection(
		name: string,
		schema?: CollectionSchema,
	): Promise<CollectionResult<CollectionInfo>> {
		if (!isValidCollectionName(name)) {
			return {
				ok: false,
				error: new CollectionManagerError(
					"invalid_collection_name",
					`Invalid collection name: "${name}". Must be 3-64 chars, start with letter, contain only letters, digits, underscore, hyphen.`,
					{ retryable: false },
				),
			};
		}

		// Validate metadata fields if provided
		if (schema?.metadataFields) {
			for (const field of schema.metadataFields) {
				if (!field.name || !field.type) {
					return {
						ok: false,
						error: new CollectionManagerError(
							"schema_validation_failed",
							`Invalid metadata field: name and type are required`,
							{ retryable: false },
						),
					};
				}
				if (!["string", "string[]", "number", "boolean"].includes(field.type)) {
					return {
						ok: false,
						error: new CollectionManagerError(
							"schema_validation_failed",
							`Invalid metadata field type: "${field.type}". Must be string, string[], number, or boolean.`,
							{ retryable: false },
						),
					};
				}
			}
		}

		// Check if already exists
		const exists = await this.collectionExists(name);
		if (exists) {
			return {
				ok: true,
				data: { name, exists: true },
			};
		}

		await this.ensureCliAvailable();

		try {
			// Trigger callback if provided
			if (this.onIndex) {
				await this.onIndex(name);
			}

			// Create a minimal placeholder file to trigger collection creation
			// Memsearch creates collections automatically when indexing
			const placeholderPath = `${this.tempDir}/memsearch_init_${name}_${Date.now()}.md`;
			const placeholderContent = this.generatePlaceholderContent(name, schema);

			// Write placeholder file
			await this
				.shell`sh -c "echo ${placeholderContent} > ${placeholderPath}"`.throws(
				true,
			);

			try {
				// Index the placeholder to create the collection
				await this
					.shell`sh -c "memsearch index ${placeholderPath} --collection ${name}"`.throws(
					true,
				);

				// Clean up placeholder file
				await this.shell`sh -c "rm -f ${placeholderPath}"`.quiet();

				return {
					ok: true,
					data: { name, exists: true, documentCount: 0, chunkCount: 0 },
				};
			} catch (indexErr) {
				// Clean up on error
				await this.shell`sh -c "rm -f ${placeholderPath}"`.quiet();

				return {
					ok: false,
					error: new CollectionManagerError(
						"collection_create_failed",
						`Failed to create collection "${name}": ${String(indexErr)}`,
						{ retryable: true, cause: indexErr },
					),
				};
			}
		} catch (err) {
			if (err instanceof CollectionManagerError) {
				return { ok: false, error: err };
			}
			return {
				ok: false,
				error: new CollectionManagerError(
					"io_error",
					`IO error while creating collection "${name}": ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Ensure a collection exists, creating it if necessary.
	 * This is a convenience method that checks existence first, then creates if needed.
	 * @param name Collection name
	 * @param schema Optional schema configuration
	 * @returns CollectionResult with CollectionInfo
	 */
	async ensureCollection(
		name: string,
		schema?: CollectionSchema,
	): Promise<CollectionResult<CollectionInfo>> {
		try {
			const exists = await this.collectionExists(name);
			if (exists) {
				return {
					ok: true,
					data: { name, exists: true },
				};
			}
		} catch (err) {
			// If check fails, try to create anyway
		}

		return this.createCollection(name, schema);
	}

	/**
	 * List all collections in memsearch.
	 * Note: memsearch doesn't have a direct list command, so we infer from available data.
	 * This is a best-effort implementation.
	 * @returns Array of collection names (may be empty if none exist)
	 */
	async listCollections(): Promise<CollectionResult<string[]>> {
		await this.ensureCliAvailable();

		// There's no direct way to list all collections in memsearch CLI
		// We could try parsing config or attempting common patterns
		// For now, return empty array as a safe default
		// A more complete implementation would query Milvus directly
		return {
			ok: true,
			data: [],
		};
	}

	/**
	 * Generate placeholder content for collection creation.
	 * Includes metadata field definitions in comments for documentation.
	 */
	private generatePlaceholderContent(
		name: string,
		schema?: CollectionSchema,
	): string {
		const fields = schema?.metadataFields ?? this.defaultMetadataFields;

		const metadataComment = fields
			.map((f) => `  - ${f.name} (${f.type}): ${f.description ?? ""}`)
			.join("\n");

		return `---
tags: []
source_session: ""
technology: ""
---

# Collection Initialization: ${name}

This is an auto-generated placeholder file to initialize the collection "${name}".

## Metadata Fields
${metadataComment}

## Note
This file can be safely deleted after collection is created.
`;
	}

	/**
	 * Get the default metadata fields configuration.
	 * @returns Array of default metadata fields
	 */
	getDefaultMetadataFields(): CollectionMetadataField[] {
		return [...this.defaultMetadataFields];
	}

	/**
	 * Reset CLI availability cache.
	 * Useful for testing or after CLI installation.
	 */
	resetCliCache(): void {
		this.cliAvailable = null;
	}
}

export default CollectionManager;
