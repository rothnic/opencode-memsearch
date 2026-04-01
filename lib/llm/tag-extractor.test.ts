import { describe, expect, test } from "bun:test";
import {
	type ExtractionResult,
	extractTechnologyTags,
	getAllDetectableTechnologies,
	type TagExtractionResult,
	TagExtractor,
} from "./tag-extractor";

describe("TagExtractor", () => {
	describe("constructor", () => {
		test("creates instance with default config", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			expect(extractor).toBeDefined();
		});

		test("creates instance with custom tags", () => {
			const extractor = new TagExtractor({
				defaultTags: ["react", "typescript"],
				customTags: ["custom-tag"],
			});
			expect(extractor).toBeDefined();
		});

		test("creates instance with memory type tags", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: {
					decision: [
						{
							id: "tech",
							description: "Technologies",
							tags: ["react", "vue"],
							manageable: true,
						},
					],
				},
			});
			expect(extractor).toBeDefined();
		});

		test("applies minConfidence default", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("react");
			expect(result.ok).toBe(true);
		});

		test("applies enableHeuristics default", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("import React from 'react'");
			expect(result.ok).toBe(true);
		});
	});

	describe("fromConfig", () => {
		test("creates extractor from empty config", () => {
			const extractor = TagExtractor.fromConfig({});
			expect(extractor).toBeDefined();
		});

		test("creates extractor from config with defaults", () => {
			const extractor = TagExtractor.fromConfig({
				defaults: { tags: ["python", "docker"] },
			});
			expect(extractor).toBeDefined();
		});

		test("creates extractor from config with memory types", () => {
			const extractor = TagExtractor.fromConfig({
				memoryTypes: [
					{
						name: "decision",
						collection: "decisions",
						extractionPrompt: "extract decisions",
						tagLists: [
							{
								id: "t1",
								description: "tech",
								tags: ["react"],
								manageable: false,
							},
						],
					},
				],
			});
			expect(extractor).toBeDefined();
			expect(extractor.hasMemoryType("decision")).toBe(true);
		});

		test("handles memory types without tagLists", () => {
			const extractor = TagExtractor.fromConfig({
				memoryTypes: [
					{
						name: "context",
						collection: "contexts",
						extractionPrompt: "extract context",
						enabled: true,
					},
				],
			});
			expect(extractor.hasMemoryType("context")).toBe(false);
		});
	});

	describe("extractTags", () => {
		test("extracts React from content", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"We built this with React and TypeScript",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("React");
				expect(result.tags).toContain("TypeScript");
			}
		});

		test("extracts multiple technologies", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"Using Python with Django and PostgreSQL for the backend, React for frontend",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Python");
				expect(result.tags).toContain("PostgreSQL");
				expect(result.tags).toContain("React");
			}
		});

		test("returns empty result for empty content", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe("empty_content");
			}
		});

		test("returns empty result for whitespace content", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("   ");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe("empty_content");
			}
		});

		test("extracts from code imports", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"import React, { useState } from 'react'",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("React");
			}
		});

		test("extracts from file extensions", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				enableHeuristics: true,
			});
			const result = extractor.extractTags("src/components/App.tsx");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("TypeScript");
				expect(result.tags).toContain("React");
			}
		});

		test("extracts Docker from Dockerfile content", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"FROM node:18\
RUN npm install\
COPY . /app",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Docker");
			}
		});

		test("extracts Kubernetes from k8s content", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"Deploy to Kubernetes using kubectl and helm",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Kubernetes");
			}
		});

		test("extracts cloud providers", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("Deploy to AWS using Lambda and S3");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("AWS");
			}
		});

		test("extracts databases", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"Connect to MongoDB using Mongoose, store in Redis",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("MongoDB");
				expect(result.tags).toContain("Redis");
			}
		});

		test("extracts testing frameworks", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags(
				"Write tests with Jest and React Testing Library",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Jest");
				expect(result.tags).toContain("React");
			}
		});

		test("returns confidence scores", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("React React React");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.confidence.React).toBeGreaterThan(0);
				expect(result.confidence.React).toBeLessThanOrEqual(1);
			}
		});

		test("sorts tags by confidence", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("React React React Python Python");
			expect(result.ok).toBe(true);
			if (result.ok) {
				const reactIdx = result.tags.indexOf("React");
				const pythonIdx = result.tags.indexOf("Python");
				expect(reactIdx).toBeLessThan(pythonIdx);
			}
		});

		test("handles case insensitivity", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTags("USING REACT AND TYPESCRIPT");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("React");
				expect(result.tags).toContain("TypeScript");
			}
		});

		test("respects minConfidence threshold", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				minConfidence: 0.5,
			});
			const result = extractor.extractTags("react");
			expect(result.ok).toBe(true);
		});
	});

	describe("extractTagsForType", () => {
		test("extracts tags for specific memory type with tag lists", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: {
					decision: [
						{
							id: "tech",
							description: "Tech stack",
							tags: ["react", "python"],
							manageable: true,
						},
					],
				},
			});

			const result = extractor.extractTagsForType(
				"We use React for frontend and Python for backend",
				"decision",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("React");
				expect(result.tags).toContain("Python");
				expect(result.memoryType).toBe("decision");
			}
		});

		test("filters tags not in memory type tag list", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: {
					decision: [
						{
							id: "tech",
							description: "Tech",
							tags: ["python"],
							manageable: false,
						},
					],
				},
			});

			const result = extractor.extractTagsForType(
				"React and Python",
				"decision",
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Python");
				expect(result.tags).not.toContain("React");
			}
		});

		test("returns base result for unknown memory type", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTagsForType("React Python", "unknown");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("React");
				expect(result.tags).toContain("Python");
			}
		});

		test("returns error for empty content", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.extractTagsForType("", "decision");
			expect(result.ok).toBe(false);
		});

		test("includes manageable tags from config", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: {
					decision: [
						{
							id: "manage",
							description: "Manageable",
							tags: ["rust"],
							manageable: true,
						},
					],
				},
			});

			const result = extractor.extractTagsForType(
				"Working with rust",
				"decision",
			);
			expect(result.ok).toBe(true);
		});
	});

	describe("addCustomTags", () => {
		test("adds custom tags at runtime", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			extractor.addCustomTags(["myCustomTag"]);
			const result = extractor.extractTags("Mentioning myCustomTag in content");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("mycustomtag");
			}
		});

		test("adds multiple custom tags", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			extractor.addCustomTags(["tag1", "tag2"]);
			const result = extractor.extractTags("tag1 and tag2 in content");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("tag1");
				expect(result.tags).toContain("tag2");
			}
		});
	});

	describe("getAvailableTags", () => {
		test("returns default tags", () => {
			const extractor = new TagExtractor({ defaultTags: ["react", "vue"] });
			const tags = extractor.getAvailableTags();
			expect(tags).toContain("react");
			expect(tags).toContain("vue");
		});

		test("returns custom tags", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				customTags: ["custom"],
			});
			const tags = extractor.getAvailableTags();
			expect(tags).toContain("custom");
		});

		test("returns memory type tags", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: {
					decision: [
						{ id: "t1", description: "t", tags: ["python"], manageable: false },
					],
				},
			});
			const tags = extractor.getAvailableTags("decision");
			expect(tags).toContain("python");
		});

		test("returns combined tags", () => {
			const extractor = new TagExtractor({
				defaultTags: ["default-tag"],
				customTags: ["custom-tag"],
				memoryTypeTags: {
					decision: [
						{
							id: "t1",
							description: "t",
							tags: ["memory-tag"],
							manageable: false,
						},
					],
				},
			});
			const tags = extractor.getAvailableTags("decision");
			expect(tags).toContain("default-tag");
			expect(tags).toContain("custom-tag");
			expect(tags).toContain("memory-tag");
		});

		test("returns sorted tags", () => {
			const extractor = new TagExtractor({
				defaultTags: ["zebra", "apple"],
			});
			const tags = extractor.getAvailableTags();
			expect(tags[0]).toBe("apple");
			expect(tags[1]).toBe("zebra");
		});
	});

	describe("helper methods", () => {
		test("getMemoryTypes returns configured types", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: {
					decision: [],
					context: [],
				},
			});
			const types = extractor.getMemoryTypes();
			expect(types).toContain("decision");
			expect(types).toContain("context");
		});

		test("getTagListsForType returns tag lists", () => {
			const tagLists = [
				{ id: "t1", description: "test", tags: ["a", "b"], manageable: true },
			];
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: { decision: tagLists },
			});
			const result = extractor.getTagListsForType("decision");
			expect(result).toEqual(tagLists);
		});

		test("getTagListsForType returns undefined for unknown type", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			const result = extractor.getTagListsForType("unknown");
			expect(result).toBeUndefined();
		});

		test("hasMemoryType returns true for configured type", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				memoryTypeTags: { decision: [] },
			});
			expect(extractor.hasMemoryType("decision")).toBe(true);
		});

		test("hasMemoryType returns false for unknown type", () => {
			const extractor = new TagExtractor({ defaultTags: [] });
			expect(extractor.hasMemoryType("unknown")).toBe(false);
		});
	});

	describe("heuristics", () => {
		test("disables heuristics when configured", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				enableHeuristics: false,
			});
			const result = extractor.extractTags("src/App.tsx");
			expect(result.ok).toBe(true);
		});

		test("detects Python from .py extension", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				enableHeuristics: true,
			});
			const result = extractor.extractTags("main.py");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Python");
			}
		});

		test("detects Go from .go extension", () => {
			const extractor = new TagExtractor({
				defaultTags: [],
				enableHeuristics: true,
			});
			const result = extractor.extractTags("server.go");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.tags).toContain("Go");
			}
		});
	});
});

describe("extractTechnologyTags utility", () => {
	test("quick extraction works", () => {
		const result = extractTechnologyTags("Using React and Node.js");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tags).toContain("React");
			expect(result.tags).toContain("Node.js");
		}
	});

	test("handles empty content", () => {
		const result = extractTechnologyTags("");
		expect(result.ok).toBe(false);
	});
});

describe("getAllDetectableTechnologies", () => {
	test("returns array of technologies", () => {
		const techs = getAllDetectableTechnologies();
		expect(Array.isArray(techs)).toBe(true);
		expect(techs.length).toBeGreaterThan(0);
	});

	test("includes common frameworks", () => {
		const techs = getAllDetectableTechnologies();
		expect(techs).toContain("React");
		expect(techs).toContain("Vue");
		expect(techs).toContain("Angular");
		expect(techs).toContain("Svelte");
	});

	test("includes languages", () => {
		const techs = getAllDetectableTechnologies();
		expect(techs).toContain("TypeScript");
		expect(techs).toContain("JavaScript");
		expect(techs).toContain("Python");
		expect(techs).toContain("Go");
		expect(techs).toContain("Rust");
	});

	test("includes databases", () => {
		const techs = getAllDetectableTechnologies();
		expect(techs).toContain("PostgreSQL");
		expect(techs).toContain("MongoDB");
		expect(techs).toContain("Redis");
	});

	test("includes cloud platforms", () => {
		const techs = getAllDetectableTechnologies();
		expect(techs).toContain("AWS");
		expect(techs).toContain("GCP");
		expect(techs).toContain("Azure");
	});

	test("returns sorted array", () => {
		const techs = getAllDetectableTechnologies();
		const sorted = [...techs].sort();
		expect(techs).toEqual(sorted);
	});
});

describe("discriminated union result", () => {
	test("ExtractionResult has ok: true", () => {
		const result: TagExtractionResult = {
			ok: true,
			tags: ["React"],
			confidence: { React: 0.8 },
		};
		expect(result.ok).toBe(true);
	});

	test("ExtractionError has ok: false", () => {
		const result: TagExtractionResult = {
			ok: false,
			error: "test",
			code: "empty_content",
		};
		expect(result.ok).toBe(false);
	});

	test("type narrowing works", () => {
		const extractor = new TagExtractor({ defaultTags: [] });
		const result = extractor.extractTags("React");
		if (result.ok) {
			expect(result.tags).toBeDefined();
			expect(result.confidence).toBeDefined();
		} else {
			expect(result.error).toBeDefined();
			expect(result.code).toBeDefined();
		}
	});
});
