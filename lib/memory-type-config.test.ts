import { describe, expect, test } from "bun:test";
import {
	CollectionNameRegex,
	MAX_PROMPT_LENGTH,
	MemoryTypeConfigSchema,
	MIN_PROMPT_LENGTH,
	ModelNameRegex,
} from "./memory-type-config";

describe("memory-type-config schema", () => {
	test("accepts a valid config", () => {
		const cfg = {
			name: "decision",
			description: "Architectural decisions",
			collection: "memory_decision",
			extractionPrompt:
				"Extract key decisions and rationale from the session content.",
			model: "openai/gpt-4",
			enabled: true,
			tags: ["architecture", "design"],
			frequency: { mode: "manual" },
			output: { path: "memory", filenamePattern: "{date}_{session_id}.md" },
		};

		const parsed = MemoryTypeConfigSchema.parse(cfg);
		expect(parsed.name).toBe("decision");
		expect(parsed.collection).toBe("memory_decision");
		expect(parsed.model).toBe("openai/gpt-4");
	});

	test("rejects short prompt", () => {
		const cfg = {
			name: "short",
			collection: "mem_short",
			extractionPrompt: "tiny",
		};

		expect(() => MemoryTypeConfigSchema.parse(cfg)).toThrow();
	});

	test("rejects overly long prompt", () => {
		const long = "x".repeat(MAX_PROMPT_LENGTH + 1);
		const cfg = {
			name: "long",
			collection: "mem_long",
			extractionPrompt: long,
		};

		expect(() => MemoryTypeConfigSchema.parse(cfg)).toThrow();
	});

	test("validates model format", () => {
		expect(ModelNameRegex.test("openai/gpt-4")).toBe(true);
		expect(ModelNameRegex.test("gpt-4")).toBe(false);
	});

	test("validates collection name rules", () => {
		expect(CollectionNameRegex.test("memory_sessions")).toBe(true);
		// must start with letter
		expect(CollectionNameRegex.test("1invalid")).toBe(false);
		// too short
		expect(CollectionNameRegex.test("ab")).toBe(false);
	});
});
