import { beforeEach, describe, expect, test, vi } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import {
	type CleanupUnusedOptions,
	CollectionLifecycle,
	type CollectionLifecycleConfig,
	type CollectionLifecycleError,
	type DeleteCollectionOptions,
	type LifecycleResult,
	type LifecycleStatusReport,
	type TrackedCollection,
} from "./collection-lifecycle";

const isLifecycleSuccess = <T>(
	result: LifecycleResult<T>,
): result is { ok: true; data: T } => {
	return result.ok === true;
};

const isLifecycleError = <T>(
	result: LifecycleResult<T>,
): result is { ok: false; error: CollectionLifecycleError } => {
	return result.ok === false;
};

const createMockShell = (
	responses: Record<
		string,
		{ stdout: string; stderr: string; exitCode: number }
	>,
) => {
	const mockFn = vi.fn(
		(strings: TemplateStringsArray, ...values: unknown[]) => {
			let key = "";
			for (let i = 0; i < strings.length; i++) {
				key += strings[i];
				if (i < values.length) {
					key += String(values[i]);
				}
			}
			key = key.trim();
			const response = responses[key] ?? {
				stdout: "",
				stderr: "",
				exitCode: 0,
			};
			const result = {
				exitCode: response.exitCode,
				stdout: response.stdout,
				stderr: response.stderr,
			};
			return {
				quiet: vi.fn().mockResolvedValue(result),
				text: vi.fn().mockResolvedValue(response.stdout),
				throws: vi.fn().mockImplementation(() => {
					if (response.exitCode !== 0) {
						throw new Error(
							response.stderr ||
								`Command failed with exit code ${response.exitCode}`,
						);
					}
					return {
						stdout: response.stdout,
						stderr: response.stderr,
						exitCode: response.exitCode,
					};
				}),
			};
		},
	);
	return Object.assign(mockFn, {
		quiet: vi.fn().mockReturnValue({ exitCode: 0, stdout: "", stderr: "" }),
		text: vi.fn().mockReturnValue(""),
		throws: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
	});
};

describe("CollectionLifecycle Factory", () => {
	test("fromConfig creates instance with workdir", () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: "/tmp/test" });
		expect(lifecycle).toBeDefined();
		expect(lifecycle.getTrackingFilePath()).toBe(
			"/tmp/test/.memsearch/collections.json",
		);
	});

	test("fromConfig accepts custom shell", () => {
		const mockShell = createMockShell({});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: "/tmp/test",
			shell: mockShell,
		});
		expect(lifecycle).toBeDefined();
	});
});

describe("trackCollection", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("tracks new collection with metadata", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.trackCollection("test-collection", {
			documentCount: 10,
			memoryType: "context",
		});
		expect(result.ok).toBe(true);
		if (isLifecycleSuccess(result)) {
			expect(result.data.name).toBe("test-collection");
			expect(result.data.documentCount).toBe(10);
			expect(result.data.memoryType).toBe("context");
			expect(result.data.createdAt).toBeDefined();
			expect(result.data.lastAccessed).toBeDefined();
		}
	});

	test("tracks collection without metadata", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.trackCollection("simple-collection");
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data.name).toBe("simple-collection");
		expect(result.data.documentCount).toBe(0);
		expect(result.data.memoryType).toBeUndefined();
	});

	test("updates existing collection metadata", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("existing", { documentCount: 5 });
		const result = await lifecycle.trackCollection("existing", {
			documentCount: 15,
		});
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data.documentCount).toBe(15);
		expect(result.data.createdAt).toBeDefined();
	});

	test("fails with empty name", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.trackCollection("");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});

	test("fails with whitespace-only name", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.trackCollection("   ");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});
});

describe("untrackCollection", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("removes tracked collection", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("to-remove");
		const result = await lifecycle.untrackCollection("to-remove");
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toBe(true);
	});

	test("fails when collection not tracked", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.untrackCollection("not-tracked");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("collection_not_tracked");
	});

	test("fails with empty name", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.untrackCollection("");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});
});

describe("getTrackedCollections", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("returns empty array when no collections tracked", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.getTrackedCollections();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toEqual([]);
	});

	test("returns all tracked collections", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("collection-1");
		await lifecycle.trackCollection("collection-2");
		await lifecycle.trackCollection("collection-3");
		const result = await lifecycle.getTrackedCollections();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data.length).toBe(3);
	});
});

describe("isTracked", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("returns true for tracked collection", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("tracked");
		const result = await lifecycle.isTracked("tracked");
		expect(result).toBe(true);
	});

	test("returns false for untracked collection", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.isTracked("not-tracked");
		expect(result).toBe(false);
	});
});

describe("getTrackedCollection", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("returns tracked collection data", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("my-collection", {
			documentCount: 25,
			memoryType: "decision",
		});
		const result = await lifecycle.getTrackedCollection("my-collection");
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data?.name).toBe("my-collection");
		expect(result.data?.documentCount).toBe(25);
		expect(result.data?.memoryType).toBe("decision");
	});

	test("returns null for untracked collection", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.getTrackedCollection("unknown");
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toBeNull();
	});
});

describe("deleteCollection", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("fails for untracked collection", async () => {
		const mockShell = createMockShell({});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: testRoot,
			shell: mockShell,
		});
		const result = await lifecycle.deleteCollection("not-tracked");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("collection_not_tracked");
	});

	test("fails with empty name", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.deleteCollection("");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});

	test("calls memsearch delete command", async () => {
		const mockShell = createMockShell({
			'sh -c "memsearch delete --collection test-collection"': {
				stdout: "",
				stderr: "",
				exitCode: 0,
			},
		});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: testRoot,
			shell: mockShell,
		});
		await lifecycle.trackCollection("test-collection");
		const result = await lifecycle.deleteCollection("test-collection", {
			untrack: true,
		});
		expect(mockShell).toHaveBeenCalled();
	});
});

describe("cleanupUnused", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("fails with invalid olderThanDays", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.cleanupUnused(0);
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});

	test("returns empty array when no unused collections", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("recent", { documentCount: 5 });
		const result = await lifecycle.cleanupUnused(30);
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toEqual([]);
	});
});

describe("getStatus", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("returns empty status when no collections", async () => {
		const mockShell = createMockShell({});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: testRoot,
			shell: mockShell,
		});
		const result = await lifecycle.getStatus();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data.totalTracked).toBe(0);
		expect(result.data.collections).toEqual([]);
	});

	test("returns status with tracked collections", async () => {
		const mockShell = createMockShell({
			'sh -c "memsearch stats --collection existing"': {
				stdout: '{"documentCount": 100}',
				stderr: "",
				exitCode: 0,
			},
		});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: testRoot,
			shell: mockShell,
		});
		await lifecycle.trackCollection("existing", { documentCount: 50 });
		const result = await lifecycle.getStatus();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data.totalTracked).toBe(1);
		expect(result.data.collections[0].name).toBe("existing");
	});
});

describe("syncWithMemsearch", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("removes collections that no longer exist in memsearch", async () => {
		const mockShell = createMockShell({
			'sh -c "memsearch stats --collection ghost-collection"': {
				stdout: "",
				stderr: "collection not found",
				exitCode: 1,
			},
		});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: testRoot,
			shell: mockShell,
		});
		await lifecycle.trackCollection("ghost-collection");
		const result = await lifecycle.syncWithMemsearch();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toContain("ghost-collection");
	});

	test("keeps collections that exist in memsearch", async () => {
		const mockShell = createMockShell({
			'sh -c "memsearch stats --collection valid-collection"': {
				stdout: '{"documentCount": 10}',
				stderr: "",
				exitCode: 0,
			},
		});
		const lifecycle = CollectionLifecycle.fromConfig({
			workdir: testRoot,
			shell: mockShell,
		});
		await lifecycle.trackCollection("valid-collection");
		const result = await lifecycle.syncWithMemsearch();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toEqual([]);
	});
});

describe("touchCollection", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("updates lastAccessed timestamp", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("test");
		await new Promise((resolve) => setTimeout(resolve, 10));
		const result = await lifecycle.touchCollection("test");
		expect(isLifecycleSuccess(result)).toBe(true);
		const tracked = await lifecycle.getTrackedCollection("test");
		expect(isLifecycleSuccess(tracked)).toBe(true);
		expect(tracked.data?.lastAccessed).toBeDefined();
	});

	test("fails for untracked collection", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.touchCollection("unknown");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("collection_not_tracked");
	});

	test("fails with empty name", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.touchCollection("");
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});
});

describe("updateDocumentCount", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("updates document count", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("test", { documentCount: 10 });
		const result = await lifecycle.updateDocumentCount("test", 50);
		expect(isLifecycleSuccess(result)).toBe(true);
		const tracked = await lifecycle.getTrackedCollection("test");
		expect(isLifecycleSuccess(tracked)).toBe(true);
		expect(tracked.data?.documentCount).toBe(50);
	});

	test("fails with negative count", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("test");
		const result = await lifecycle.updateDocumentCount("test", -1);
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});

	test("fails for untracked collection", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.updateDocumentCount("unknown", 10);
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("collection_not_tracked");
	});
});

describe("getUnusedCollections", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("fails with invalid olderThanDays", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.getUnusedCollections(0);
		expect(isLifecycleError(result)).toBe(true);
		expect(result.error.code).toBe("invalid_options");
	});

	test("returns empty array when no unused collections", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("recent");
		const result = await lifecycle.getUnusedCollections(30);
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toEqual([]);
	});
});

describe("clearAllTracking", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("clears all tracking data", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("collection-1");
		await lifecycle.trackCollection("collection-2");
		const result = await lifecycle.clearAllTracking();
		expect(isLifecycleSuccess(result)).toBe(true);
		const collections = await lifecycle.getTrackedCollections();
		expect(isLifecycleSuccess(collections)).toBe(true);
		expect(collections.data).toEqual([]);
	});
});

describe("getTotalDocumentCount", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("returns zero when no collections", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle.getTotalDocumentCount();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toBe(0);
	});

	test("returns total document count", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("col1", { documentCount: 10 });
		await lifecycle.trackCollection("col2", { documentCount: 20 });
		await lifecycle.trackCollection("col3", { documentCount: 30 });
		const result = await lifecycle.getTotalDocumentCount();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data).toBe(60);
	});
});

describe("clearCache", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("clears internal cache", async () => {
		const lifecycle = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle.trackCollection("cached");
		lifecycle.clearCache();
		const result = await lifecycle.getTrackedCollections();
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data.length).toBe(1);
	});
});

describe("persistence", () => {
	const testRoot = join("/tmp", `lifecycle-test-${Date.now()}`);

	beforeEach(async () => {
		await mkdir(join(testRoot, ".memsearch"), { recursive: true }).catch(
			() => {},
		);
		await rm(join(testRoot, ".memsearch", "collections.json"), {
			force: true,
		}).catch(() => {});
	});

	test("persists data across instances", async () => {
		const lifecycle1 = CollectionLifecycle.fromConfig({ workdir: testRoot });
		await lifecycle1.trackCollection("persistent", { documentCount: 100 });
		const lifecycle2 = CollectionLifecycle.fromConfig({ workdir: testRoot });
		const result = await lifecycle2.getTrackedCollection("persistent");
		expect(isLifecycleSuccess(result)).toBe(true);
		expect(result.data?.documentCount).toBe(100);
	});
});
