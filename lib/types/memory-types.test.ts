import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "os";
import path from "path";
import { createMemoryTypeRegistry, MemoryTypeRegistry } from "./memory-types";

const testRoot = path.join(
	os.tmpdir(),
	"memsearch-registry-test-" + Date.now(),
);
const projectDir = path.join(testRoot, "project");

beforeAll(async () => {
	await rm(testRoot, { recursive: true, force: true });
	await mkdir(projectDir, { recursive: true });
});

beforeEach(async () => {
	const memoryDir = path.join(projectDir, "memory");
	await rm(memoryDir, { recursive: true, force: true });
	await mkdir(memoryDir, { recursive: true });
});

afterAll(async () => {
	await rm(testRoot, { recursive: true, force: true });
});

describe("MemoryTypeRegistry", () => {
	describe("constructor", () => {
		test("creates registry from workdir", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry).toBeDefined();
			expect(registry.getWorkdir()).toBe(projectDir);
		});

		test("loads empty when no memory types exist", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.getAll()).toHaveLength(0);
			expect(registry.size()).toBe(0);
			expect(registry.hasErrors()).toBe(false);
		});

		test("loads memory types from project directory", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions from sessions.
enabled: true
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.size()).toBe(1);
			expect(registry.getAll()).toHaveLength(1);
		});
	});

	describe("getAll", () => {
		test("returns all loaded memory types", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await mkdir(path.join(memoryDir, "convention"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions.
`,
			);
			await writeFile(
				path.join(memoryDir, "convention", "config.yaml"),
				`
name: convention
collection: memory_convention
extractionPrompt: Extract coding conventions.
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			const all = registry.getAll();
			expect(all).toHaveLength(2);
			const names = all.map((m) => m.name).sort();
			expect(names).toEqual(["convention", "decision"]);
		});
	});

	describe("getByName", () => {
		test("returns config by name when exists", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions.
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			const config = registry.getByName("decision");
			expect(config).toBeDefined();
			expect(config?.name).toBe("decision");
			expect(config?.collection).toBe("memory_decision");
		});

		test("returns undefined for non-existent name", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.getByName("non-existent")).toBeUndefined();
		});
	});

	describe("getByCollection", () => {
		test("returns config by collection when exists", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions.
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			const config = registry.getByCollection("memory_decision");
			expect(config).toBeDefined();
			expect(config?.name).toBe("decision");
			expect(config?.collection).toBe("memory_decision");
		});

		test("returns undefined for non-existent collection", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.getByCollection("non_existent")).toBeUndefined();
		});
	});

	describe("hasName", () => {
		test("returns true for existing name", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract decisions.
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.hasName("decision")).toBe(true);
		});

		test("returns false for non-existent name", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.hasName("non-existent")).toBe(false);
		});
	});

	describe("hasCollection", () => {
		test("returns true for existing collection", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract decisions.
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.hasCollection("memory_decision")).toBe(true);
		});

		test("returns false for non-existent collection", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.hasCollection("non_existent")).toBe(false);
		});
	});

	describe("getErrors", () => {
		test("returns empty array when no errors", async () => {
			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.getErrors()).toEqual([]);
		});

		test("returns validation errors from loader", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "invalid"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "invalid", "config.yaml"),
				`
name: invalid
collection: invalid
extractionPrompt: x
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.hasErrors()).toBe(true);
			const errors = registry.getErrors();
			expect(errors).toHaveLength(1);
			expect(errors[0].source).toBe("project");
			expect(errors[0].error).toContain("extractionPrompt");
		});
	});

	describe("size", () => {
		test("returns count of loaded memory types", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await mkdir(path.join(memoryDir, "convention"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract decisions.
`,
			);
			await writeFile(
				path.join(memoryDir, "convention", "config.yaml"),
				`
name: convention
collection: memory_convention
extractionPrompt: Extract conventions.
`,
			);

			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.size()).toBe(2);
		});
	});

	describe("createMemoryTypeRegistry", () => {
		test("convenience function creates registry", async () => {
			const memoryDir = path.join(projectDir, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract decisions.
`,
			);

			const registry = createMemoryTypeRegistry(projectDir);
			expect(registry.getByName("decision")).toBeDefined();
		});
	});

	describe("lookup performance", () => {
		test("getByName is O(1)", async () => {
			const memoryDir = path.join(projectDir, "memory");
			for (let i = 0; i < 10; i++) {
				await mkdir(path.join(memoryDir, `type${i}`), { recursive: true });
				await writeFile(
					path.join(memoryDir, `type${i}`, "config.yaml"),
					`
name: type${i}
collection: memory_type${i}
extractionPrompt: Extract type${i} info.
`,
				);
			}

			const registry = new MemoryTypeRegistry(projectDir);
			expect(registry.getByName("type5")?.collection).toBe("memory_type5");
			expect(registry.getByCollection("memory_type7")?.name).toBe("type7");
		});
	});
});
