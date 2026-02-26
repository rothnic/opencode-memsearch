import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "os";
import path from "path";
import {
	resolveCollectionName,
	sanitizeCollectionName,
} from "./memory-type-collection-resolver";
import MemoryTypeRegistry from "./memory-types";

const testRoot = path.join(
	os.tmpdir(),
	"memsearch-resolver-test-" + Date.now(),
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

describe("sanitizeCollectionName", () => {
	test("produces valid name for simple input", () => {
		const out = sanitizeCollectionName("decision");
		expect(out).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/);
		expect(out).toBe("memory_decision");
	});

	test("normalizes and strips invalid chars", () => {
		const out = sanitizeCollectionName("My Type!* ");
		expect(out).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/);
	});

	test("enforces length constraints", () => {
		const long = "a".repeat(200);
		const out = sanitizeCollectionName(long);
		expect(out.length).toBeLessThanOrEqual(64);
	});
});

describe("resolveCollectionName", () => {
	test("returns configured collection when present in registry", async () => {
		const memoryDir = path.join(projectDir, "memory");
		await mkdir(path.join(memoryDir, "decision"), { recursive: true });
		await writeFile(
			path.join(memoryDir, "decision", "config.yaml"),
			`
name: decision
collection: custom_decision
extractionPrompt: Extract decisions.
`,
		);

		const registry = new MemoryTypeRegistry(projectDir);
		const resolved = resolveCollectionName("decision", registry);
		expect(resolved).toBe("custom_decision");
	});

	test("falls back to deterministic sanitized name when missing in registry", () => {
		const resolved = resolveCollectionName("Some Type!@#");
		expect(resolved).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/);
		expect(resolved).toContain("some_type");
	});

	test("uses provided prefix option", () => {
		const resolved = resolveCollectionName("alpha", undefined, {
			prefix: "px_",
		});
		expect(resolved.startsWith("px_") || resolved.startsWith("m" + "px_")).toBe(
			true,
		);
	});
});
