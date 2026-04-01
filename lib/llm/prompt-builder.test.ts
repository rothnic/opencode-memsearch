import { describe, expect, test } from "bun:test";
import type { MemoryTypeConfig } from "../types/memory-type-config";
import {
	BASE_SYSTEM_PROMPT,
	buildExtractionSchema,
	buildPromptForType,
	buildPromptForTypes,
	buildSystemPrompt,
	buildUserPrompt,
	DEFAULT_MAX_SESSION_CONTENT_LENGTH,
	type PromptBuilderOptions,
	type PromptMemoryType,
	type TagListInfo,
	toPromptMemoryType,
} from "./prompt-builder";
import type { SessionWithHistory } from "../processing/session-indexer";

const makeSession = (
	overrides?: Partial<SessionWithHistory>,
): SessionWithHistory => ({
	metadata: {
		id: "ses_abc123",
		title: "Test session",
		directory: "/tmp/test",
		projectID: "proj_1",
		time: { created: 1700000000000, updated: 1700003600000 },
	},
	history: [
		{
			ts: "2026-01-01T00:00:00Z",
			role: "user",
			content: "We should use PostgreSQL for persistence",
		},
		{
			ts: "2026-01-01T00:01:00Z",
			role: "assistant",
			content: "Good choice. I'll set up the schema.",
		},
		{
			ts: "2026-01-01T00:02:00Z",
			role: "user",
			content: "Also, let's use kebab-case for all filenames",
		},
	],
	...overrides,
});

const makeMemoryType = (
	name = "decision",
	overrides?: Partial<PromptMemoryType>,
): PromptMemoryType => ({
	name,
	collection: `memory_${name}`,
	extractionPrompt: `Extract ${name}s from this session`,
	enabled: true,
	tags: ["architecture", "database"],
	frequency: { mode: "manual", intervalMinutes: 60, onCompact: false },
	output: { path: `memory/${name}`, filenamePattern: "{date}_{session_id}.md" },
	...overrides,
});

describe("buildSystemPrompt", () => {
	test("includes base prompt with no types", () => {
		const result = buildSystemPrompt([]);
		expect(result).toBe(BASE_SYSTEM_PROMPT);
	});

	test("includes memory type section for single type", () => {
		const mt = makeMemoryType("decision");
		const result = buildSystemPrompt([mt]);

		expect(result).toContain("## Available Memory Collections");
		expect(result).toContain("### decision (collection: memory_decision)");
		expect(result).toContain("**Extraction instructions:**");
		expect(result).toContain("Extract decisions from this session");
		expect(result).toContain("**Available tags:** architecture, database");
		expect(result).toContain("Output path: memory/decision");
		expect(result).toContain("Filename pattern: {date}_{session_id}.md");
	});

	test("includes multiple memory types", () => {
		const types = [makeMemoryType("decision"), makeMemoryType("convention")];
		const result = buildSystemPrompt(types);

		expect(result).toContain("### decision (collection: memory_decision)");
		expect(result).toContain("### convention (collection: memory_convention)");
	});

	test("includes description when present", () => {
		const mt = makeMemoryType("decision", {
			description: "Architectural choices",
		});
		const result = buildSystemPrompt([mt]);

		expect(result).toContain("Description: Architectural choices");
	});

	test("omits description when absent", () => {
		const mt = makeMemoryType("decision");
		const result = buildSystemPrompt([mt]);

		expect(result).not.toContain("Description:");
	});

	test("prefers tagLists over flat tags", () => {
		const tagLists: TagListInfo[] = [
			{
				id: "semantic",
				description: "Categorization tags",
				tags: ["arch", "db"],
				manageable: true,
			},
			{
				id: "tech",
				description: "Technology tags",
				tags: ["postgresql"],
				manageable: false,
			},
		];
		const mt = makeMemoryType("decision", {
			tagLists,
			tags: ["should-not-appear"],
		});
		const result = buildSystemPrompt([mt]);

		expect(result).toContain("**Tag lists:**");
		expect(result).toContain("- semantic (modifiable): Categorization tags");
		expect(result).toContain("  Current tags: arch, db");
		expect(result).toContain("- tech (read-only): Technology tags");
		expect(result).toContain("  Current tags: postgresql");
		expect(result).not.toContain("should-not-appear");
	});

	test("shows flat tags when no tagLists", () => {
		const mt = makeMemoryType("decision", { tags: ["backend", "infra"] });
		const result = buildSystemPrompt([mt]);

		expect(result).toContain("**Available tags:** backend, infra");
		expect(result).not.toContain("**Tag lists:**");
	});

	test("handles empty tags and no tagLists", () => {
		const mt = makeMemoryType("decision", { tags: [] });
		const result = buildSystemPrompt([mt]);

		expect(result).not.toContain("**Available tags:**");
		expect(result).not.toContain("**Tag lists:**");
	});

	test("includes additionalPrompt when present", () => {
		const mt = makeMemoryType("decision", {
			additionalPrompt: "Focus on database-related decisions only.",
		});
		const result = buildSystemPrompt([mt]);

		expect(result).toContain("**Additional instructions:**");
		expect(result).toContain("Focus on database-related decisions only.");
	});

	test("omits additionalPrompt when absent", () => {
		const mt = makeMemoryType("decision");
		const result = buildSystemPrompt([mt]);

		expect(result).not.toContain("**Additional instructions:**");
	});

	test("accepts custom system base override", () => {
		const customBase = "You are a custom agent.";
		const result = buildSystemPrompt([makeMemoryType()], {
			customSystemBase: customBase,
		});

		expect(result).toContain("You are a custom agent.");
		expect(result).not.toContain("You are a memory extraction agent.");
	});

	test("trims trailing whitespace", () => {
		const result = buildSystemPrompt([makeMemoryType()]);
		expect(result).toBe(result.trimEnd());
	});
});

describe("buildUserPrompt", () => {
	test("includes session metadata", () => {
		const session = makeSession();
		const result = buildUserPrompt(session, [makeMemoryType()]);

		expect(result).toContain("## Session Information");
		expect(result).toContain("- Session ID: ses_abc123");
		expect(result).toContain("- Title: Test session");
		expect(result).toContain("- Project: /tmp/test");
		expect(result).toContain("- Created:");
		expect(result).toContain("- Updated:");
	});

	test("uses projectPath override when provided", () => {
		const session = makeSession();
		const result = buildUserPrompt(session, [makeMemoryType()], {
			projectPath: "/custom/path",
		});

		expect(result).toContain("- Project: /custom/path");
		expect(result).not.toContain("- Project: /tmp/test");
	});

	test("lists requested memory types", () => {
		const types = [
			makeMemoryType("decision", { description: "Arch choices" }),
			makeMemoryType("convention"),
		];
		const result = buildUserPrompt(makeSession(), types);

		expect(result).toContain("## Memory Types to Extract");
		expect(result).toContain("- decision: Arch choices");
		expect(result).toContain("- convention:");
	});

	test("falls back to extractionPrompt substring when no description", () => {
		const mt = makeMemoryType("decision");
		const result = buildUserPrompt(makeSession(), [mt]);

		expect(result).toContain("- decision: Extract decisions from this session");
	});

	test("includes session transcript", () => {
		const result = buildUserPrompt(makeSession(), [makeMemoryType()]);

		expect(result).toContain("## Session Transcript");
		expect(result).toContain(
			"[user]: We should use PostgreSQL for persistence",
		);
		expect(result).toContain(
			"[assistant]: Good choice. I'll set up the schema.",
		);
		expect(result).toContain(
			"[user]: Also, let's use kebab-case for all filenames",
		);
	});

	test("formats tool entries with tool annotation", () => {
		const session = makeSession({
			history: [
				{
					ts: "2026-01-01T00:00:00Z",
					role: "assistant",
					content: "running search",
					tool: "mem-search",
				},
			],
		});
		const result = buildUserPrompt(session, [makeMemoryType()]);

		expect(result).toContain("[assistant] [tool: mem-search]: running search");
	});

	test("handles entries with missing role and content", () => {
		const session = makeSession({
			history: [{ ts: "2026-01-01T00:00:00Z" }],
		});
		const result = buildUserPrompt(session, [makeMemoryType()]);

		expect(result).toContain("[unknown]: ");
	});

	test("truncates long session content", () => {
		const longHistory = Array.from({ length: 100 }, (_, i) => ({
			ts: "2026-01-01T00:00:00Z",
			role: "user",
			content: "x".repeat(2000),
		}));
		const session = makeSession({ history: longHistory });
		const result = buildUserPrompt(session, [makeMemoryType()], {
			maxSessionContentLength: 5000,
		});

		expect(result).toContain(
			"[... session content truncated due to length ...]",
		);
	});

	test("includes analysis instruction at end", () => {
		const result = buildUserPrompt(makeSession(), [makeMemoryType()]);

		expect(result).toContain("---");
		expect(result).toContain("Analyze the session above");
		expect(result).toContain(
			"Return the JSON output as specified in your system instructions.",
		);
	});
});

describe("buildExtractionSchema", () => {
	test("returns valid JSON schema structure", () => {
		const schema = buildExtractionSchema();

		expect(schema.type).toBe("object");
		expect(schema.required).toEqual(["extracts"]);
		expect(schema.properties).toBeDefined();
	});

	test("extracts array items have required fields", () => {
		const schema = buildExtractionSchema();
		const props = schema.properties as Record<string, unknown>;
		const extracts = props.extracts as Record<string, unknown>;
		const items = extracts.items as Record<string, unknown>;

		expect(items.required).toEqual([
			"memoryType",
			"collection",
			"title",
			"content",
			"confidence",
			"metadata",
		]);
	});

	test("metadata has required fields", () => {
		const schema = buildExtractionSchema();
		const props = schema.properties as Record<string, unknown>;
		const extracts = props.extracts as Record<string, unknown>;
		const items = extracts.items as Record<string, unknown>;
		const itemProps = items.properties as Record<string, unknown>;
		const metadata = itemProps.metadata as Record<string, unknown>;

		expect(metadata.required).toEqual([
			"sessionId",
			"tags",
			"technologies",
			"extractedAt",
		]);
	});

	test("confidence has min/max bounds", () => {
		const schema = buildExtractionSchema();
		const props = schema.properties as Record<string, unknown>;
		const extracts = props.extracts as Record<string, unknown>;
		const items = extracts.items as Record<string, unknown>;
		const itemProps = items.properties as Record<string, unknown>;
		const confidence = itemProps.confidence as Record<string, unknown>;

		expect(confidence.minimum).toBe(0);
		expect(confidence.maximum).toBe(1);
	});

	test("schema is deterministic across calls", () => {
		const a = buildExtractionSchema();
		const b = buildExtractionSchema();
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe("buildPromptForType", () => {
	test("returns both system and user prompts", () => {
		const mt = makeMemoryType("decision");
		const session = makeSession();
		const result = buildPromptForType(mt, session);

		expect(result.systemPrompt).toContain("memory extraction agent");
		expect(result.systemPrompt).toContain("### decision");
		expect(result.userPrompt).toContain("ses_abc123");
		expect(result.userPrompt).toContain("## Session Transcript");
	});

	test("passes options through", () => {
		const result = buildPromptForType(makeMemoryType(), makeSession(), {
			projectPath: "/override",
		});

		expect(result.userPrompt).toContain("- Project: /override");
	});
});

describe("buildPromptForTypes", () => {
	test("includes all types in system prompt", () => {
		const types = [
			makeMemoryType("decision"),
			makeMemoryType("convention"),
			makeMemoryType("context"),
		];
		const result = buildPromptForTypes(types, makeSession());

		expect(result.systemPrompt).toContain("### decision");
		expect(result.systemPrompt).toContain("### convention");
		expect(result.systemPrompt).toContain("### context");
		expect(result.userPrompt).toContain("- decision:");
		expect(result.userPrompt).toContain("- convention:");
		expect(result.userPrompt).toContain("- context:");
	});
});

describe("toPromptMemoryType", () => {
	test("converts base MemoryTypeConfig without overrides", () => {
		const config: MemoryTypeConfig = {
			name: "decision",
			collection: "memory_decision",
			extractionPrompt: "Extract decisions",
			enabled: true,
			tags: ["arch"],
			frequency: { mode: "manual", intervalMinutes: 60, onCompact: false },
			output: { path: "memory", filenamePattern: "{date}_{session_id}.md" },
		};

		const result = toPromptMemoryType(config);

		expect(result.name).toBe("decision");
		expect(result.collection).toBe("memory_decision");
		expect(result.extractionPrompt).toBe("Extract decisions");
		expect(result.additionalPrompt).toBeUndefined();
		expect(result.tagLists).toBeUndefined();
	});

	test("applies additionalPrompt override", () => {
		const config: MemoryTypeConfig = {
			name: "decision",
			collection: "memory_decision",
			extractionPrompt: "Extract decisions",
			enabled: true,
			tags: [],
			frequency: { mode: "manual", intervalMinutes: 60, onCompact: false },
			output: { path: "memory", filenamePattern: "{date}_{session_id}.md" },
		};

		const result = toPromptMemoryType(config, {
			additionalPrompt: "Focus on DB decisions",
		});

		expect(result.additionalPrompt).toBe("Focus on DB decisions");
	});

	test("applies tagLists override", () => {
		const config: MemoryTypeConfig = {
			name: "decision",
			collection: "memory_decision",
			extractionPrompt: "Extract decisions",
			enabled: true,
			tags: ["old-tag"],
			frequency: { mode: "manual", intervalMinutes: 60, onCompact: false },
			output: { path: "memory", filenamePattern: "{date}_{session_id}.md" },
		};

		const tagLists: TagListInfo[] = [
			{
				id: "semantic",
				description: "Categories",
				tags: ["new-tag"],
				manageable: true,
			},
		];

		const result = toPromptMemoryType(config, { tagLists });

		expect(result.tagLists).toHaveLength(1);
		expect(result.tagLists![0].id).toBe("semantic");
		expect(result.tags).toEqual(["old-tag"]);
	});
});

describe("prompt determinism", () => {
	test("system prompt is identical across calls with same input", () => {
		const mt = makeMemoryType();
		const a = buildSystemPrompt([mt]);
		const b = buildSystemPrompt([mt]);
		expect(a).toBe(b);
	});

	test("user prompt is identical across calls with same input", () => {
		const session = makeSession();
		const mt = makeMemoryType();
		const a = buildUserPrompt(session, [mt]);
		const b = buildUserPrompt(session, [mt]);
		expect(a).toBe(b);
	});
});

describe("real config integration", () => {
	test("works with decision-style config", () => {
		const decision = makeMemoryType("decision", {
			description: "Captures explicit decisions, action items, and outcomes",
			extractionPrompt:
				"You are an assistant that extracts discrete decisions from a conversation transcript. " +
				"For each decision found, produce a short title (5-12 words), the decision details.",
			tags: [
				"decision",
				"action-item",
				"meeting",
				"backend",
				"frontend",
				"infra",
			],
		});

		const session = makeSession();
		const { systemPrompt, userPrompt } = buildPromptForType(decision, session);

		expect(systemPrompt).toContain("Captures explicit decisions");
		expect(systemPrompt).toContain("extracts discrete decisions");
		expect(systemPrompt).toContain(
			"decision, action-item, meeting, backend, frontend, infra",
		);
		expect(userPrompt).toContain("ses_abc123");
	});

	test("works with convention-style config", () => {
		const convention = makeMemoryType("convention", {
			description: "Stores team conventions and style agreements",
			extractionPrompt:
				"You are an assistant that identifies team conventions and style guidance from text.",
			tags: ["convention", "pattern", "style", "typescript", "react", "node"],
		});

		const { systemPrompt } = buildPromptForType(convention, makeSession());

		expect(systemPrompt).toContain("Stores team conventions");
		expect(systemPrompt).toContain("identifies team conventions");
	});

	test("works with context-style config", () => {
		const context = makeMemoryType("context", {
			description: "Captures background context: project facts, glossary terms",
			extractionPrompt:
				"You are an assistant that extracts persistent context items from conversational text.",
			tags: ["context", "glossary", "project-fact", "docker", "ci", "aws"],
		});

		const { systemPrompt } = buildPromptForType(context, makeSession());

		expect(systemPrompt).toContain("background context");
		expect(systemPrompt).toContain("persistent context items");
	});
});
