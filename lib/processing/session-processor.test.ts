import { describe, expect, test } from "bun:test";
import type { MemoryTypeConfig } from "../types/memory-type-config";
import type { SessionWithHistory } from "./session-indexer";
import type {
	ExtractionStats,
	MemoryExtract,
	MemoryExtractMetadata,
	SessionProcessorAgent,
	SessionProcessorError,
	SessionProcessorInput,
	SessionProcessorResult,
	SessionProcessorSuccess,
} from "./session-processor";

const makeSession = (): SessionWithHistory => ({
	metadata: {
		id: "ses_abc123",
		title: "Test session",
		directory: "/tmp/test",
		projectID: "proj_1",
		time: { created: Date.now(), updated: Date.now() },
	},
	history: [
		{ ts: new Date().toISOString(), role: "user", content: "hello" },
		{ ts: new Date().toISOString(), role: "assistant", content: "hi there" },
	],
});

const makeMemoryType = (name = "decision"): MemoryTypeConfig => ({
	name,
	collection: `memory_${name}`,
	extractionPrompt: "Extract decisions from this session",
	enabled: true,
	tags: ["architecture"],
	frequency: { mode: "manual", intervalMinutes: 60, onCompact: false },
	output: { path: "memory", filenamePattern: "{date}_{session_id}.md" },
});

const makeExtract = (memoryType = "decision"): MemoryExtract => ({
	memoryType,
	collection: `memory_${memoryType}`,
	title: "Use PostgreSQL for persistence",
	content: "# Decision\n\nWe chose PostgreSQL because...",
	confidence: 0.9,
	metadata: {
		sessionId: "ses_abc123",
		tags: ["architecture", "database"],
		technologies: ["postgresql", "typescript"],
		extractedAt: new Date().toISOString(),
		projectPath: "/tmp/test",
	},
});

describe("session-processor types", () => {
	describe("MemoryExtractMetadata", () => {
		test("required fields are present", () => {
			const meta: MemoryExtractMetadata = {
				sessionId: "ses_1",
				tags: [],
				technologies: [],
				extractedAt: new Date().toISOString(),
			};
			expect(meta.sessionId).toBe("ses_1");
			expect(meta.tags).toEqual([]);
			expect(meta.technologies).toEqual([]);
			expect(meta.extractedAt).toBeTruthy();
		});

		test("optional fields accepted", () => {
			const meta: MemoryExtractMetadata = {
				sessionId: "ses_1",
				tags: ["arch"],
				technologies: ["react"],
				extractedAt: "2026-01-01T00:00:00Z",
				projectPath: "/my/project",
				extra: { source: "manual" },
			};
			expect(meta.projectPath).toBe("/my/project");
			expect(meta.extra?.source).toBe("manual");
		});
	});

	describe("MemoryExtract", () => {
		test("carries all required fields", () => {
			const extract = makeExtract();
			expect(extract.memoryType).toBe("decision");
			expect(extract.collection).toBe("memory_decision");
			expect(extract.title).toBeTruthy();
			expect(extract.content).toContain("PostgreSQL");
			expect(extract.confidence).toBeGreaterThanOrEqual(0);
			expect(extract.confidence).toBeLessThanOrEqual(1);
			expect(extract.metadata.sessionId).toBe("ses_abc123");
		});
	});

	describe("SessionProcessorInput", () => {
		test("bundles session + memory types", () => {
			const input: SessionProcessorInput = {
				session: makeSession(),
				memoryTypes: [makeMemoryType("decision"), makeMemoryType("convention")],
			};
			expect(input.session.metadata.id).toBe("ses_abc123");
			expect(input.memoryTypes).toHaveLength(2);
		});

		test("accepts optional overrides", () => {
			const input: SessionProcessorInput = {
				session: makeSession(),
				memoryTypes: [makeMemoryType()],
				model: "openai/gpt-4",
				workdir: "/tmp/project",
			};
			expect(input.model).toBe("openai/gpt-4");
			expect(input.workdir).toBe("/tmp/project");
		});
	});

	describe("SessionProcessorResult discriminated union", () => {
		test("success result narrows correctly", () => {
			const result: SessionProcessorResult = {
				ok: true,
				extracts: [makeExtract()],
				stats: {
					typesProcessed: 1,
					totalExtracts: 1,
					perType: { decision: 1 },
					durationMs: 250,
				},
			};

			if (result.ok) {
				expect(result.extracts).toHaveLength(1);
				expect(result.stats.typesProcessed).toBe(1);
				expect(result.stats.perType.decision).toBe(1);
			} else {
				throw new Error("Expected success");
			}
		});

		test("error result narrows correctly", () => {
			const result: SessionProcessorResult = {
				ok: false,
				error: "LLM timeout after 30s",
			};

			if (!result.ok) {
				expect(result.error).toContain("timeout");
				expect(result.partialExtracts).toBeUndefined();
			} else {
				throw new Error("Expected error");
			}
		});

		test("error result with partial extracts", () => {
			const result: SessionProcessorResult = {
				ok: false,
				error: "Failed on convention type",
				partialExtracts: [makeExtract("decision")],
			};

			if (!result.ok) {
				expect(result.partialExtracts).toHaveLength(1);
				expect(result.partialExtracts![0].memoryType).toBe("decision");
			}
		});
	});

	describe("SessionProcessorAgent interface", () => {
		test("mock implementation satisfies interface", async () => {
			const mockAgent: SessionProcessorAgent = {
				analyze: async (input) => ({
					ok: true as const,
					extracts: input.memoryTypes.map((mt) => makeExtract(mt.name)),
					stats: {
						typesProcessed: input.memoryTypes.length,
						totalExtracts: input.memoryTypes.length,
						perType: Object.fromEntries(
							input.memoryTypes.map((mt) => [mt.name, 1]),
						),
						durationMs: 100,
					},
				}),
			};

			const result = await mockAgent.analyze({
				session: makeSession(),
				memoryTypes: [makeMemoryType("decision"), makeMemoryType("convention")],
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.extracts).toHaveLength(2);
				expect(result.stats.typesProcessed).toBe(2);
			}
		});

		test("mock error implementation satisfies interface", async () => {
			const failingAgent: SessionProcessorAgent = {
				analyze: async () => ({
					ok: false as const,
					error: "Service unavailable",
				}),
			};

			const result = await failingAgent.analyze({
				session: makeSession(),
				memoryTypes: [makeMemoryType()],
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("Service unavailable");
			}
		});

		test("mock partial failure satisfies interface", async () => {
			const partialAgent: SessionProcessorAgent = {
				analyze: async (input) => ({
					ok: false as const,
					error: "convention extraction failed",
					partialExtracts: [makeExtract("decision")],
				}),
			};

			const result = await partialAgent.analyze({
				session: makeSession(),
				memoryTypes: [makeMemoryType("decision"), makeMemoryType("convention")],
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.partialExtracts).toHaveLength(1);
			}
		});
	});

	describe("ExtractionStats", () => {
		test("perType tracks multiple types", () => {
			const stats: ExtractionStats = {
				typesProcessed: 3,
				totalExtracts: 5,
				perType: { decision: 2, convention: 2, context: 1 },
				durationMs: 1500,
			};
			expect(Object.keys(stats.perType)).toHaveLength(3);
			expect(stats.totalExtracts).toBe(
				Object.values(stats.perType).reduce((a, b) => a + b, 0),
			);
		});
	});
});
