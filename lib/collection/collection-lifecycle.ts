/**
 * @file collection-lifecycle.ts
 * @description Manages collection lifecycle tracking, deletion, and status reporting.
 *              Tracks collections in .memsearch/collections.json with metadata.
 */

import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

type ShellExecutor = typeof $;

/**
 * Error codes for collection lifecycle operations
 */
export type CollectionLifecycleErrorCode =
	| "tracking_file_error"
	| "collection_not_tracked"
	| "deletion_failed"
	| "sync_failed"
	| "invalid_options"
	| "io_error";

/**
 * Custom error class for collection lifecycle operations
 */
export class CollectionLifecycleError extends Error {
	readonly code: CollectionLifecycleErrorCode;
	readonly retryable: boolean;

	constructor(
		code: CollectionLifecycleErrorCode,
		message: string,
		options?: {
			retryable?: boolean;
			cause?: unknown;
		},
	) {
		super(message, { cause: options?.cause });
		this.name = "CollectionLifecycleError";
		this.code = code;
		this.retryable = options?.retryable ?? false;
	}
}

/**
 * Metadata for a tracked collection
 */
export interface TrackedCollection {
	/** Collection name */
	name: string;
	/** ISO timestamp when collection was first tracked */
	createdAt: string;
	/** ISO timestamp when collection was last accessed */
	lastAccessed: string;
	/** Number of documents in the collection */
	documentCount: number;
	/** Associated memory type (if any) */
	memoryType?: string;
}

/**
 * Tracking data stored in collections.json
 */
export interface CollectionTrackingData {
	/** Map of collection name to tracking info */
	collections: Record<string, TrackedCollection>;
	/** Version for future schema migrations */
	version: number;
}

/**
 * Options for deleteCollection operation
 */
export interface DeleteCollectionOptions {
	/** Skip confirmation prompt (for automation) */
	force?: boolean;
	/** Also remove from tracking file */
	untrack?: boolean;
}

/**
 * Options for cleanupUnused operation
 */
export interface CleanupUnusedOptions {
	/** Skip confirmation prompt (for automation) */
	force?: boolean;
	/** Also remove from tracking file */
	untrack?: boolean;
	/** Minimum days since last accessed to consider unused (default: 30) */
	olderThanDays?: number;
}

/**
 * Status information for a collection
 */
export interface CollectionStatus {
	/** Collection name */
	name: string;
	/** Whether the collection exists in memsearch */
	exists: boolean;
	/** Document count */
	documentCount: number;
	/** Last accessed timestamp */
	lastAccessed: string;
	/** Created timestamp */
	createdAt: string;
	/** Associated memory type */
	memoryType?: string;
	/** Days since last accessed */
	daysSinceAccessed: number;
}

/**
 * Comprehensive status report
 */
export interface LifecycleStatusReport {
	/** All tracked collections with their status */
	collections: CollectionStatus[];
	/** Total number of tracked collections */
	totalTracked: number;
	/** Number of collections that exist in memsearch */
	totalExisting: number;
	/** Number of tracked collections not found in memsearch */
	totalMissing: number;
	/** Total document count across all collections */
	totalDocuments: number;
}

/**
 * Result type for lifecycle operations - discriminated union
 */
export type LifecycleResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: CollectionLifecycleError };

/**
 * Configuration for CollectionLifecycle
 */
export interface CollectionLifecycleConfig {
	/** Working directory (project root) */
	workdir: string;
	/** Shell command executor (defaults to Bun's $) */
	shell?: ShellExecutor;
}

/**
 * Default tracking file version
 */
const TRACKING_FILE_VERSION = 1;

/**
 * Default days after which a collection is considered unused
 */
const DEFAULT_UNUSED_DAYS = 30;

/**
 * CollectionLifecycle manages collection tracking, deletion, and status reporting.
 * Provides methods to track collections, delete them, and get comprehensive status.
 */
export class CollectionLifecycle {
	private readonly workdir: string;
	private readonly trackingFilePath: string;
	private readonly shell: ShellExecutor;
	private cachedData: CollectionTrackingData | null = null;

	/**
	 * Private constructor - use factory method fromConfig() to create instances
	 */
	private constructor(config: CollectionLifecycleConfig) {
		this.workdir = config.workdir;
		this.trackingFilePath = join(
			this.workdir,
			".memsearch",
			"collections.json",
		);
		this.shell = config.shell ?? $;
	}

	/**
	 * Factory method to create a CollectionLifecycle from configuration.
	 * @param config Configuration options
	 * @returns Configured CollectionLifecycle instance
	 */
	static fromConfig(config: CollectionLifecycleConfig): CollectionLifecycle {
		return new CollectionLifecycle(config);
	}

	/**
	 * Get the tracking file path
	 */
	getTrackingFilePath(): string {
		return this.trackingFilePath;
	}

	/**
	 * Ensure the .memsearch directory exists
	 */
	private async ensureTrackingDir(): Promise<void> {
		const dir = join(this.workdir, ".memsearch");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}

	/**
	 * Load tracking data from file
	 */
	private async loadTrackingData(): Promise<CollectionTrackingData> {
		if (this.cachedData) {
			return this.cachedData;
		}

		try {
			const file = Bun.file(this.trackingFilePath);
			if (await file.exists()) {
				const text = await file.text();
				const parsed = JSON.parse(text) as CollectionTrackingData;
				this.cachedData = parsed;
				return parsed;
			}
		} catch {
			// File doesn't exist or is invalid, return empty data
		}

		const emptyData: CollectionTrackingData = {
			collections: {},
			version: TRACKING_FILE_VERSION,
		};
		this.cachedData = emptyData;
		return emptyData;
	}

	/**
	 * Save tracking data to file
	 */
	private async saveTrackingData(data: CollectionTrackingData): Promise<void> {
		await this.ensureTrackingDir();
		const file = Bun.file(this.trackingFilePath);
		await file.write(JSON.stringify(data, null, 2));
		this.cachedData = data;
	}

	/**
	 * Clear cached data to force reload from disk
	 */
	clearCache(): void {
		this.cachedData = null;
	}

	/**
	 * Track a collection or update its metadata.
	 * @param name Collection name
	 * @param metadata Optional metadata (documentCount, memoryType)
	 * @returns LifecycleResult with the tracked collection
	 */
	async trackCollection(
		name: string,
		metadata?: { documentCount?: number; memoryType?: string },
	): Promise<LifecycleResult<TrackedCollection>> {
		if (!name || name.trim().length === 0) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"Collection name is required",
					{ retryable: false },
				),
			};
		}

		try {
			const data = await this.loadTrackingData();
			const now = new Date().toISOString();
			const existing = data.collections[name];

			const tracked: TrackedCollection = {
				name,
				createdAt: existing?.createdAt ?? now,
				lastAccessed: now,
				documentCount: metadata?.documentCount ?? existing?.documentCount ?? 0,
				memoryType: metadata?.memoryType ?? existing?.memoryType,
			};

			data.collections[name] = tracked;
			await this.saveTrackingData(data);

			return { ok: true, data: tracked };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to track collection "${name}": ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Remove a collection from tracking.
	 * @param name Collection name
	 * @returns LifecycleResult with true if removed
	 */
	async untrackCollection(name: string): Promise<LifecycleResult<boolean>> {
		if (!name || name.trim().length === 0) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"Collection name is required",
					{ retryable: false },
				),
			};
		}

		try {
			const data = await this.loadTrackingData();

			if (!data.collections[name]) {
				return {
					ok: false,
					error: new CollectionLifecycleError(
						"collection_not_tracked",
						`Collection "${name}" is not being tracked`,
						{ retryable: false },
					),
				};
			}

			delete data.collections[name];
			await this.saveTrackingData(data);

			return { ok: true, data: true };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to untrack collection "${name}": ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Get all tracked collections.
	 * @returns LifecycleResult with array of tracked collections
	 */
	async getTrackedCollections(): Promise<LifecycleResult<TrackedCollection[]>> {
		try {
			const data = await this.loadTrackingData();
			const collections = Object.values(data.collections);
			return { ok: true, data: collections };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to get tracked collections: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Check if a collection is tracked.
	 * @param name Collection name
	 * @returns true if tracked
	 */
	async isTracked(name: string): Promise<boolean> {
		const data = await this.loadTrackingData();
		return name in data.collections;
	}

	/**
	 * Get a specific tracked collection.
	 * @param name Collection name
	 * @returns LifecycleResult with the tracked collection or null if not found
	 */
	async getTrackedCollection(
		name: string,
	): Promise<LifecycleResult<TrackedCollection | null>> {
		try {
			const data = await this.loadTrackingData();
			const tracked = data.collections[name] ?? null;
			return { ok: true, data: tracked };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to get tracked collection "${name}": ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Delete a collection from memsearch and optionally from tracking.
	 * @param name Collection name
	 * @param options Delete options (force, untrack)
	 * @returns LifecycleResult with true if deleted
	 */
	async deleteCollection(
		name: string,
		options: DeleteCollectionOptions = {},
	): Promise<LifecycleResult<boolean>> {
		const { force = false, untrack = true } = options;

		if (!name || name.trim().length === 0) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"Collection name is required",
					{ retryable: false },
				),
			};
		}

		// Check if tracked
		const tracked = await this.getTrackedCollection(name);
		if (tracked.ok && tracked.data === null) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"collection_not_tracked",
					`Collection "${name}" is not being tracked`,
					{ retryable: false },
				),
			};
		}

		// Delete from memsearch using CLI
		try {
			// Use memsearch delete command - try common patterns
			// First, try with collection flag
			const deleteResult = await this
				.shell`sh -c "memsearch delete --collection ${name}"`;

			// If we got here, deletion succeeded
			if (untrack) {
				await this.untrackCollection(name);
			}

			return { ok: true, data: true };
		} catch (err) {
			// If CLI fails, still allow untracking if requested
			const errorMessage = String(err);

			// Check if collection doesn't exist (already deleted)
			if (
				errorMessage.includes("collection not found") ||
				errorMessage.includes("not exist")
			) {
				if (untrack) {
					await this.untrackCollection(name);
				}
				return { ok: true, data: true };
			}

			return {
				ok: false,
				error: new CollectionLifecycleError(
					"deletion_failed",
					`Failed to delete collection "${name}": ${errorMessage}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Clean up unused collections (not accessed for specified days).
	 * @param olderThanDays Collections not accessed for this many days (default: 30)
	 * @param options Cleanup options (force, untrack)
	 * @returns LifecycleResult with array of deleted collection names
	 */
	async cleanupUnused(
		olderThanDays: number = DEFAULT_UNUSED_DAYS,
		options: CleanupUnusedOptions = {},
	): Promise<LifecycleResult<string[]>> {
		const { force = false, untrack = true } = options;

		if (olderThanDays < 1) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"olderThanDays must be at least 1",
					{ retryable: false },
				),
			};
		}

		try {
			const data = await this.loadTrackingData();
			const now = new Date();
			const cutoffDate = new Date(
				now.getTime() - olderThanDays * 24 * 60 * 60 * 1000,
			);
			const deleted: string[] = [];

			for (const [name, tracked] of Object.entries(data.collections)) {
				const lastAccessed = new Date(tracked.lastAccessed);

				if (lastAccessed < cutoffDate) {
					// Try to delete
					const result = await this.deleteCollection(name, { force, untrack });
					if (result.ok) {
						deleted.push(name);
					}
				}
			}

			return { ok: true, data: deleted };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"deletion_failed",
					`Failed to cleanup unused collections: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Get comprehensive status report for all tracked collections.
	 * @returns LifecycleResult with status report
	 */
	async getStatus(): Promise<LifecycleResult<LifecycleStatusReport>> {
		try {
			const data = await this.loadTrackingData();
			const collections: CollectionStatus[] = [];
			let totalExisting = 0;
			let totalMissing = 0;
			let totalDocuments = 0;
			const now = new Date();

			for (const tracked of Object.values(data.collections)) {
				// Try to get actual stats from memsearch
				let exists = false;
				let documentCount = tracked.documentCount;

				try {
					const statsResult = await this
						.shell`sh -c "memsearch stats --collection ${tracked.name}"`.quiet();
					if (statsResult.exitCode === 0) {
						exists = true;
						totalExisting++;

						// Try to parse document count from output
						try {
							const stdoutStr = statsResult.stdout?.toString() ?? "{}";
							const parsed = JSON.parse(stdoutStr);
							documentCount = parsed.documentCount ?? tracked.documentCount;
						} catch {
							// Not JSON, try text parsing
							const stdoutStr = statsResult.stdout?.toString() ?? "";
							const match = stdoutStr.match(
								/Document[s]?:\s*(\d+)/i,
							);
							if (match) {
								documentCount = Number(match[1]);
							}
						}
					}
				} catch {
					// Collection doesn't exist
					exists = false;
					totalMissing++;
				}

				const lastAccessed = new Date(tracked.lastAccessed);
				const daysSinceAccessed = Math.floor(
					(now.getTime() - lastAccessed.getTime()) / (24 * 60 * 60 * 1000),
				);

				totalDocuments += documentCount;

				collections.push({
					name: tracked.name,
					exists,
					documentCount,
					lastAccessed: tracked.lastAccessed,
					createdAt: tracked.createdAt,
					memoryType: tracked.memoryType,
					daysSinceAccessed,
				});
			}

			const report: LifecycleStatusReport = {
				collections,
				totalTracked: collections.length,
				totalExisting,
				totalMissing,
				totalDocuments,
			};

			return { ok: true, data: report };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"sync_failed",
					`Failed to get status: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Sync tracking data with actual memsearch collections.
	 * Removes entries for collections that no longer exist.
	 * @returns LifecycleResult with array of removed collection names
	 */
	async syncWithMemsearch(): Promise<LifecycleResult<string[]>> {
		try {
			const data = await this.loadTrackingData();
			const removed: string[] = [];

			for (const name of Object.keys(data.collections)) {
				// Check if collection exists in memsearch
				try {
					const result = await this
						.shell`sh -c "memsearch stats --collection ${name}"`.quiet();
					// Collection exists if exit code is 0
					if (result.exitCode !== 0) {
						delete data.collections[name];
						removed.push(name);
					}
				} catch {
					// Command failed (CLI error or network issue), assume doesn't exist
					delete data.collections[name];
					removed.push(name);
				}
			}

			if (removed.length > 0) {
				await this.saveTrackingData(data);
			}

			return { ok: true, data: removed };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"sync_failed",
					`Failed to sync with memsearch: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Update last accessed timestamp for a collection.
	 * @param name Collection name
	 * @returns LifecycleResult with true if updated
	 */
	async touchCollection(name: string): Promise<LifecycleResult<boolean>> {
		if (!name || name.trim().length === 0) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"Collection name is required",
					{ retryable: false },
				),
			};
		}

		try {
			const data = await this.loadTrackingData();

			if (!data.collections[name]) {
				return {
					ok: false,
					error: new CollectionLifecycleError(
						"collection_not_tracked",
						`Collection "${name}" is not being tracked`,
						{ retryable: false },
					),
				};
			}

			data.collections[name].lastAccessed = new Date().toISOString();
			await this.saveTrackingData(data);

			return { ok: true, data: true };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to touch collection "${name}": ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Update document count for a tracked collection.
	 * @param name Collection name
	 * @param documentCount New document count
	 * @returns LifecycleResult with true if updated
	 */
	async updateDocumentCount(
		name: string,
		documentCount: number,
	): Promise<LifecycleResult<boolean>> {
		if (!name || name.trim().length === 0) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"Collection name is required",
					{ retryable: false },
				),
			};
		}

		if (documentCount < 0) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"Document count must be non-negative",
					{ retryable: false },
				),
			};
		}

		try {
			const data = await this.loadTrackingData();

			if (!data.collections[name]) {
				return {
					ok: false,
					error: new CollectionLifecycleError(
						"collection_not_tracked",
						`Collection "${name}" is not being tracked`,
						{ retryable: false },
					),
				};
			}

			data.collections[name].documentCount = documentCount;
			data.collections[name].lastAccessed = new Date().toISOString();
			await this.saveTrackingData(data);

			return { ok: true, data: true };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to update document count for "${name}": ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Get list of unused collections (not accessed for specified days).
	 * @param olderThanDays Collections not accessed for this many days (default: 30)
	 * @returns LifecycleResult with array of unused collection names
	 */
	async getUnusedCollections(
		olderThanDays: number = DEFAULT_UNUSED_DAYS,
	): Promise<LifecycleResult<string[]>> {
		if (olderThanDays < 1) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"invalid_options",
					"olderThanDays must be at least 1",
					{ retryable: false },
				),
			};
		}

		try {
			const data = await this.loadTrackingData();
			const now = new Date();
			const cutoffDate = new Date(
				now.getTime() - olderThanDays * 24 * 60 * 60 * 1000,
			);
			const unused: string[] = [];

			for (const [name, tracked] of Object.entries(data.collections)) {
				const lastAccessed = new Date(tracked.lastAccessed);
				if (lastAccessed < cutoffDate) {
					unused.push(name);
				}
			}

			return { ok: true, data: unused };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to get unused collections: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Clear all tracking data (use with caution).
	 * @returns LifecycleResult with true if cleared
	 */
	async clearAllTracking(): Promise<LifecycleResult<boolean>> {
		try {
			const emptyData: CollectionTrackingData = {
				collections: {},
				version: TRACKING_FILE_VERSION,
			};
			await this.saveTrackingData(emptyData);
			return { ok: true, data: true };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to clear tracking: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}

	/**
	 * Get total document count across all tracked collections.
	 * @returns LifecycleResult with total document count
	 */
	async getTotalDocumentCount(): Promise<LifecycleResult<number>> {
		try {
			const data = await this.loadTrackingData();
			let total = 0;
			for (const tracked of Object.values(data.collections)) {
				total += tracked.documentCount;
			}
			return { ok: true, data: total };
		} catch (err) {
			return {
				ok: false,
				error: new CollectionLifecycleError(
					"tracking_file_error",
					`Failed to get total document count: ${String(err)}`,
					{ retryable: true, cause: err },
				),
			};
		}
	}
}

export default CollectionLifecycle;
