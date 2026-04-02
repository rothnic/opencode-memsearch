import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "os";
import path from "path";
import {
	getConfigPath,
	hasYamlConfig,
	loadYamlConfig,
	mergeWithLegacyConfig,
} from "./config-yaml";

const tmpRoot = path.join(os.tmpdir(), "memsearch-config-test-" + Date.now());

beforeAll(async () => {
	await rm(tmpRoot, { recursive: true, force: true });
	await mkdir(tmpRoot, { recursive: true });
});

beforeEach(async () => {
	await rm(path.join(tmpRoot, ".memsearch.yaml"), {
		recursive: true,
		force: true,
	});
});

afterAll(async () => {
	await rm(tmpRoot, { recursive: true, force: true });
});

describe("config-yaml", () => {
	describe("loadYamlConfig", () => {
		test("returns null when .memsearch.yaml doesn't exist", async () => {
			const result = loadYamlConfig(tmpRoot);
			expect(result).toBeNull();
		});

		test("loads .memsearch.yaml when present", async () => {
			const yamlContent = `
version: 1
memoryTypes:
  - name: decision
    collection: memory_decision
    enabled: true
    description: Architectural decisions
extraction:
  defaultModel: gpt-4
  timeout: 30
  autoExtract: true
  frequency:
    mode: manual
    intervalMinutes: 60
    onCompact: false
collections:
  autoCreate: true
  metadataFields:
    - technologies
    - tags
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result).not.toBeNull();
			expect(result?.memoryTypes).toHaveLength(1);
			expect(result?.memoryTypes?.[0].name).toBe("decision");
			expect(result?.extraction?.defaultModel).toBe("gpt-4");
			expect(result?.extraction?.timeout).toBe(30);
			expect(result?.collections?.autoCreate).toBe(true);
		});

		test("parses extraction.frequency modes and onCompact default", async () => {
			const yamlContent = `
extraction:
  frequency:
    mode: per-session
    onCompact: true
`;

			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result).not.toBeNull();
			expect(result?.extraction?.frequency?.mode).toBe("per-session");
			expect(result?.extraction?.frequency?.onCompact).toBe(true);
			expect(result?.extraction?.onCompact).toBe(false);
		});

		test("parses interval-minutes mode and intervalMinutes value", async () => {
			const yamlContent = `
extraction:
  frequency:
    mode: interval-minutes
    intervalMinutes: 15
`;

			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result).not.toBeNull();
			expect(result?.extraction?.frequency?.mode).toBe("interval-minutes");
			expect(result?.extraction?.frequency?.intervalMinutes).toBe(15);
			expect(result?.extraction?.onCompact).toBe(false);
		});

		test("defaults to manual when frequency absent and keeps onCompact default false", async () => {
			const yamlContent = `
memoryTypes: []
`;

			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result).not.toBeNull();
			expect(result?.extraction?.frequency?.mode).toBe("manual");
			expect(result?.extraction?.frequency?.onCompact).toBe(false);
			expect(result?.extraction?.onCompact).toBe(false);
		});

		test("explicit top-level extraction.onCompact parsed and compatible with frequency.onCompact", async () => {
			const yamlContent = `
extraction:
  onCompact: true
`;

			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result).not.toBeNull();
			expect(result?.extraction?.onCompact).toBe(true);
			expect(result?.extraction?.frequency?.onCompact).toBe(false);
		});

		test("applies defaults for missing optional fields", async () => {
			const yamlContent = `
memoryTypes: []
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result).not.toBeNull();
			expect(result?.extraction?.autoExtract).toBe(true);
			expect(result?.extraction?.timeout).toBe(30);
			expect(result?.collections?.autoCreate).toBe(true);
			expect(result?.deduplication?.enabled).toBe(true);
		});

		test("supports memory type tag lists", async () => {
			const yamlContent = `
memoryTypes:
  - name: decision
    collection: memory_decision
    enabled: true
    tagLists:
      - id: semantic
        description: Categories for decisions
        tags:
          - architecture
          - patterns
        manageable: true
      - id: technology
        description: Tech stack
        tags:
          - react
          - typescript
        manageable: false
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result?.memoryTypes?.[0].tagLists).toHaveLength(2);
			expect(result?.memoryTypes?.[0].tagLists?.[0].id).toBe("semantic");
			expect(result?.memoryTypes?.[0].tagLists?.[0].tags).toEqual([
				"architecture",
				"patterns",
			]);
			expect(result?.memoryTypes?.[0].tagLists?.[0].manageable).toBe(true);
		});

		test("supports deduplication and compaction config", async () => {
			const yamlContent = `
deduplication:
  enabled: true
  similarityThreshold: 0.9
  autoMerge: false
compaction:
  capture: true
  memoryType: context
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result?.deduplication?.enabled).toBe(true);
			expect(result?.deduplication?.similarityThreshold).toBe(0.9);
			expect(result?.compaction?.capture).toBe(true);
			expect(result?.compaction?.memoryType).toBe("context");
		});

		test("supports agent config with defaults", async () => {
			const yamlContent = `
agent:
  model: gpt-4
  temperature: 0.5
  maxTokens: 3000
  systemPrompt: "You are a helpful assistant"
  scopedWritePaths:
    - memory/
    - notes/
  enabled: true
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result?.agent).not.toBeNull();
			expect(result?.agent?.model).toBe("gpt-4");
			expect(result?.agent?.temperature).toBe(0.5);
			expect(result?.agent?.maxTokens).toBe(3000);
			expect(result?.agent?.systemPrompt).toBe("You are a helpful assistant");
			expect(result?.agent?.scopedWritePaths).toEqual(["memory/", "notes/"]);
			expect(result?.agent?.enabled).toBe(true);
		});

		test("applies agent defaults when not specified", async () => {
			const yamlContent = `
memoryTypes: []
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result?.agent).not.toBeNull();
			expect(result?.agent?.temperature).toBe(0.7);
			expect(result?.agent?.maxTokens).toBe(2000);
			expect(result?.agent?.scopedWritePaths).toEqual(["memory/"]);
			expect(result?.agent?.enabled).toBe(true);
			expect(result?.agent?.model).toBeUndefined();
		});
	});

	describe("env var interpolation", () => {
		test("interpolates environment variables in strings", async () => {
			const yamlContent = `
extraction:
  defaultModel: \${TEST_MODEL}
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			process.env.TEST_MODEL = "gpt-4";
			const result = loadYamlConfig(tmpRoot);
			expect(result?.extraction?.defaultModel).toBe("gpt-4");
			delete process.env.TEST_MODEL;
		});

		test("uses default value when env var not set", async () => {
			const yamlContent = `
extraction:
  defaultModel: \${NONEXISTENT_VAR:-default-model}
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result?.extraction?.defaultModel).toBe("default-model");
		});

		test("returns empty string when env var and default not set", async () => {
			const yamlContent = `
extraction:
  defaultModel: \${NONEXISTENT_VAR}
`;
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), yamlContent);

			const result = loadYamlConfig(tmpRoot);
			expect(result?.extraction?.defaultModel).toBe("");
		});
	});

	describe("hasYamlConfig", () => {
		test("returns false when no yaml config", () => {
			expect(hasYamlConfig(tmpRoot)).toBe(false);
		});

		test("returns true when yaml config exists", async () => {
			await writeFile(path.join(tmpRoot, ".memsearch.yaml"), "memoryTypes: []");
			expect(hasYamlConfig(tmpRoot)).toBe(true);
		});
	});

	describe("getConfigPath", () => {
		test("returns correct path", () => {
			const result = getConfigPath(tmpRoot);
			expect(result).toBe(path.join(tmpRoot, ".memsearch.yaml"));
		});
	});

	describe("mergeWithLegacyConfig", () => {
		test("returns legacy config when yaml is null", () => {
			const legacyConfig = { memoryDirectory: "/test", topK: 5 };
			const result = mergeWithLegacyConfig(null, legacyConfig as any);
			expect(result).toEqual(legacyConfig);
		});

		test("merges yaml config with legacy config", () => {
			const yamlConfig = {
				version: 1,
				memoryTypes: [
					{ name: "decision", collection: "memory_decision", enabled: true },
				],
				extraction: { defaultModel: "gpt-4", timeout: 30 },
				collections: { autoCreate: true },
			};
			const legacyConfig = { memoryDirectory: "/test", topK: 5 };

			const result = mergeWithLegacyConfig(
				yamlConfig as any,
				legacyConfig as any,
			);

			expect((result as any).memoryDirectory).toBe("/test");
			expect((result as any).topK).toBe(5);
			expect((result as any).extraction).toEqual({
				defaultModel: "gpt-4",
				timeout: 30,
			});
			expect((result as any).memoryTypes).toHaveLength(1);
		});

		test("merges agent config with legacy config", () => {
			const yamlConfig = {
				version: 1,
				agent: {
					model: "gpt-4",
					temperature: 0.5,
					maxTokens: 3000,
					systemPrompt: "You are helpful",
					scopedWritePaths: ["memory/", "notes/"],
					enabled: true,
				},
			};
			const legacyConfig = { memoryDirectory: "/test", topK: 5 };

			const result = mergeWithLegacyConfig(
				yamlConfig as any,
				legacyConfig as any,
			);

			expect((result as any).memoryDirectory).toBe("/test");
			expect((result as any).agent).toEqual({
				model: "gpt-4",
				temperature: 0.5,
				maxTokens: 3000,
				systemPrompt: "You are helpful",
				scopedWritePaths: ["memory/", "notes/"],
				enabled: true,
			});
		});
	});

	describe("loadConfig integration with memory types", () => {
		const testRoot = path.join(
			os.tmpdir(),
			"memsearch-config-integration-test-" + Date.now(),
		);

		beforeAll(async () => {
			await rm(testRoot, { recursive: true, force: true });
			await mkdir(testRoot, { recursive: true });
		});

		afterAll(async () => {
			await rm(testRoot, { recursive: true, force: true });
		});

		test("loadConfig includes scanned memory types from project directory", async () => {
			const memoryDir = path.join(testRoot, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions.
`,
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(testRoot);

			expect(config).toBeDefined();
			expect((config as any).memoryTypes).toBeDefined();
			expect((config as any).memoryTypes.length).toBeGreaterThan(0);
			expect(
				(config as any).memoryTypes.some((m: any) => m.name === "decision"),
			).toBe(true);
		});

		test("loadConfig merges scanned and yaml memory types with correct precedence", async () => {
			const memoryDir = path.join(testRoot, "memory");
			await mkdir(path.join(memoryDir, "decision"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "decision", "config.yaml"),
				`
name: decision
collection: memory_decision_scanned
extractionPrompt: Scanned prompt.
`,
			);

			await writeFile(
				path.join(testRoot, ".memsearch.yaml"),
				`
memoryTypes:
  - name: decision
    collection: memory_decision_yaml
    extractionPrompt: YAML prompt.
`,
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(testRoot);

			const decision = (config as any).memoryTypes.find(
				(m: any) => m.name === "decision",
			);
			expect(decision).toBeDefined();
		});

		test("loadConfig surfaces validation errors in extras", async () => {
			const memoryDir = path.join(testRoot, "memory");
			await mkdir(path.join(memoryDir, "invalid"), { recursive: true });
			await writeFile(
				path.join(memoryDir, "invalid", "config.yaml"),
				`
name: invalid
collection: invalid
extractionPrompt: x
`,
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(testRoot);

			const extras = (config as any).extras;
			expect(extras).toBeDefined();
			expect(extras.memoryTypeValidationErrors).toBeDefined();
			expect(extras.memoryTypeValidationErrors.length).toBeGreaterThan(0);
			expect(extras.memoryTypeValidationErrors[0].source).toBe("project");
		});

		test("loadConfig works when no memory types exist", async () => {
			const { loadConfig } = await import("../config");
			const config = await loadConfig(testRoot);

			expect(config).toBeDefined();
			expect(config.memoryDirectory).toBeDefined();
		});
	});

	describe("migration warning from legacy opencode.json", () => {
		const migrationTestRoot = path.join(
			os.tmpdir(),
			"memsearch-migration-test-" + Date.now(),
		);

		beforeAll(async () => {
			await rm(migrationTestRoot, { recursive: true, force: true });
			await mkdir(migrationTestRoot, { recursive: true });
		});

		afterAll(async () => {
			await rm(migrationTestRoot, { recursive: true, force: true });
		});

		beforeEach(async () => {
			// Clean up any test files
			await rm(path.join(migrationTestRoot, "opencode.json"), {
				recursive: true,
				force: true,
			});
			await rm(path.join(migrationTestRoot, ".memsearch.yaml"), {
				recursive: true,
				force: true,
			});
		});

		test("shows migration warning when legacy opencode.json has memsearch config but no .memsearch.yaml", async () => {
			// Create legacy opencode.json with memsearch section
			const opencodeJson = {
				memsearch: {
					memoryDirectory: "/test/memory",
					topK: 5,
				},
			};
			await writeFile(
				path.join(migrationTestRoot, "opencode.json"),
				JSON.stringify(opencodeJson),
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(migrationTestRoot);

			const extras = (config as any).extras;
			expect(extras).toBeDefined();
			expect(extras.migrationWarning).toBeDefined();
			expect(extras.migrationWarning.type).toBe("migrate_to_yaml");
			expect(extras.migrationWarning.legacyConfigPresent).toBe(true);
			expect(extras.migrationWarning.yamlConfigPresent).toBe(false);
			expect(extras.migrationWarning.message).toContain(
				"Legacy memsearch configuration detected",
			);
			expect(extras.migrationWarning.instruction).toContain(".memsearch.yaml");
		});

		test("shows info message when both opencode.json and .memsearch.yaml exist", async () => {
			// Create both config files
			const opencodeJson = {
				memsearch: {
					memoryDirectory: "/test/memory",
					topK: 5,
				},
			};
			await writeFile(
				path.join(migrationTestRoot, "opencode.json"),
				JSON.stringify(opencodeJson),
			);

			await writeFile(
				path.join(migrationTestRoot, ".memsearch.yaml"),
				"memoryTypes: []",
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(migrationTestRoot);

			const extras = (config as any).extras;
			expect(extras).toBeDefined();
			expect(extras.migrationWarning).toBeDefined();
			expect(extras.migrationWarning.type).toBe("migrate_to_yaml");
			expect(extras.migrationWarning.legacyConfigPresent).toBe(true);
			expect(extras.migrationWarning.yamlConfigPresent).toBe(true);
			expect(extras.migrationWarning.message).toContain("Both");
			expect(extras.migrationWarning.message).toContain(
				"YAML takes precedence",
			);
		});

		test("no migration warning when only .memsearch.yaml exists", async () => {
			// Only create .memsearch.yaml (no legacy config)
			await writeFile(
				path.join(migrationTestRoot, ".memsearch.yaml"),
				"memoryTypes: []",
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(migrationTestRoot);

			const extras = (config as any).extras;
			// Should not have a migration warning when there's no legacy config
			expect(extras.migrationWarning).toBeUndefined();
		});

		test("no migration warning when neither config file exists", async () => {
			const { loadConfig } = await import("../config");
			const config = await loadConfig(migrationTestRoot);

			const extras = (config as any).extras;
			expect(extras.migrationWarning).toBeUndefined();
		});

		test("no migration warning when opencode.json has no memsearch section", async () => {
			// Create opencode.json WITHOUT memsearch section
			const opencodeJson = {
				otherConfig: "value",
			};
			await writeFile(
				path.join(migrationTestRoot, "opencode.json"),
				JSON.stringify(opencodeJson),
			);

			const { loadConfig } = await import("../config");
			const config = await loadConfig(migrationTestRoot);

			const extras = (config as any).extras;
			expect(extras.migrationWarning).toBeUndefined();
		});
	});
});
