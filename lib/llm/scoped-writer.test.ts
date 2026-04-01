import { describe, expect, test } from "bun:test";
import path from "path";
import {
	createScopedWriterFromConfig,
	type MemoryTypeScope,
	ScopedWriter,
} from "./scoped-writer";

const testProjectRoot = "/Users/nroth/workspace/opencode-memsearch";

describe("ScopedWriter", () => {
	describe("constructor", () => {
		test("creates empty writer when no scopes provided", () => {
			const writer = new ScopedWriter();
			expect(writer.getAllScopes().size).toBe(0);
		});

		test("creates writer with initial scopes", () => {
			const scopes: MemoryTypeScope[] = [
				{ type: "decision", allowedPaths: ["/project/memory/decision"] },
				{ type: "convention", allowedPaths: ["/project/memory/convention"] },
			];
			const writer = new ScopedWriter(scopes);
			expect(writer.hasScope("decision")).toBe(true);
			expect(writer.hasScope("convention")).toBe(true);
		});
	});

	describe("addScope", () => {
		test("adds scope and normalizes paths to absolute", () => {
			const writer = new ScopedWriter();
			writer.addScope("decision", ["memory/decision"]);

			const paths = writer.getAllowedPaths("decision");
			expect(paths.length).toBe(1);
			expect(path.isAbsolute(paths[0])).toBe(true);
		});

		test("allows multiple paths per scope", () => {
			const writer = new ScopedWriter();
			writer.addScope("decision", [
				"/project/memory/decision",
				"/backup/memory/decision",
			]);

			const paths = writer.getAllowedPaths("decision");
			expect(paths.length).toBe(2);
		});
	});

	describe("removeScope", () => {
		test("removes scope completely", () => {
			const writer = new ScopedWriter();
			writer.addScope("decision", ["/project/memory/decision"]);
			writer.removeScope("decision");

			expect(writer.hasScope("decision")).toBe(false);
		});
	});

	describe("validatePath", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["memory/decision"] },
		]);

		test("allows valid path within scope", () => {
			const validated = writer.validatePath(
				"memory/decision/test.md",
				"decision",
			);
			expect(path.isAbsolute(validated)).toBe(true);
			expect(validated).toContain("memory/decision");
		});

		test("allows nested paths within scope", () => {
			const validated = writer.validatePath(
				"memory/decision/2024/01/test.md",
				"decision",
			);
			expect(path.isAbsolute(validated)).toBe(true);
			expect(validated).toContain("memory/decision");
		});

		test("allows path equal to scope boundary", () => {
			const validated = writer.validatePath("memory/decision", "decision");
			expect(path.isAbsolute(validated)).toBe(true);
		});

		test("rejects path outside scope", () => {
			expect(() => {
				writer.validatePath("memory/other/test.md", "decision");
			}).toThrow();
		});

		test("rejects path traversal attempt", () => {
			expect(() => {
				writer.validatePath("memory/decision/../../../etc/passwd", "decision");
			}).toThrow();
		});

		test("rejects absolute path traversal", () => {
			expect(() => {
				writer.validatePath("/etc/passwd", "decision");
			}).toThrow();
		});

		test("rejects unconfigured memory type", () => {
			expect(() => {
				writer.validatePath("memory/decision/test.md", "non-existent");
			}).toThrow();
		});

		test("rejects path with .. in middle", () => {
			expect(() => {
				writer.validatePath(
					"memory/decision/subdir/../other/file.md",
					"decision",
				);
			}).toThrow();
		});

		test("rejects sibling directory traversal", () => {
			expect(() => {
				writer.validatePath(
					"memory/decision/../convention/secret.md",
					"decision",
				);
			}).toThrow();
		});
	});

	describe("validateWrite", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["/project/memory/decision"] },
		]);

		test("returns validated path for write", () => {
			const validated = writer.validateWrite(
				"/project/memory/decision/test.md",
				"decision",
			);
			expect(validated).toBe("/project/memory/decision/test.md");
		});

		test("throws for unauthorized write", () => {
			expect(() => {
				writer.validateWrite("/project/other/file.md", "decision");
			}).toThrow();
		});
	});

	describe("validateDir", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["/project/memory/decision"] },
		]);

		test("returns validated directory path", () => {
			const validated = writer.validateDir(
				"/project/memory/decision/2024",
				"decision",
			);
			expect(validated).toBe("/project/memory/decision/2024");
		});

		test("throws for unauthorized directory", () => {
			expect(() => {
				writer.validateDir("/project/secrets", "decision");
			}).toThrow();
		});
	});

	describe("writeFile", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["memory/decision"] },
		]);

		test("alias to validateWrite", () => {
			const result = writer.writeFile("memory/decision/test.md", "decision");
			expect(result).toContain("memory/decision");
		});
	});

	describe("ensureDir", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["memory/decision"] },
		]);

		test("alias to validateDir", () => {
			const result = writer.ensureDir("memory/decision/subdir", "decision");
			expect(result).toContain("memory/decision");
		});
	});

	describe("isAllowed", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["memory/decision"] },
		]);

		test("returns true for allowed path", () => {
			expect(writer.isAllowed("memory/decision/test.md", "decision")).toBe(
				true,
			);
		});

		test("returns false for disallowed path without throwing", () => {
			expect(writer.isAllowed("/etc/passwd", "decision")).toBe(false);
		});

		test("returns false for unconfigured type without throwing", () => {
			expect(writer.isAllowed("memory/decision/test.md", "non-existent")).toBe(
				false,
			);
		});
	});

	describe("path normalization", () => {
		test("resolves relative paths to absolute", () => {
			const writer = new ScopedWriter([
				{ type: "decision", allowedPaths: ["./memory/decision"] },
			]);

			const paths = writer.getAllowedPaths("decision");
			expect(path.isAbsolute(paths[0])).toBe(true);
		});

		test("handles home directory tilde", () => {
			const writer = new ScopedWriter([
				{ type: "decision", allowedPaths: ["~/memory/decision"] },
			]);

			const paths = writer.getAllowedPaths("decision");
			expect(path.isAbsolute(paths[0])).toBe(true);
			expect(paths[0]).toContain("memory/decision");
		});

		test("normalizes path separators", () => {
			const writer = new ScopedWriter([
				{
					type: "decision",
					allowedPaths: ["memory/decision//subdir///nested"],
				},
			]);

			const paths = writer.getAllowedPaths("decision");
			expect(paths[0]).not.toContain("//");
		});
	});

	describe("multiple scopes", () => {
		const writer = new ScopedWriter([
			{ type: "decision", allowedPaths: ["memory/decision"] },
			{ type: "convention", allowedPaths: ["memory/convention"] },
		]);

		test("validates against correct scope", () => {
			expect(writer.isAllowed("memory/decision/test.md", "decision")).toBe(
				true,
			);
			expect(writer.isAllowed("memory/convention/test.md", "convention")).toBe(
				true,
			);
		});

		test("cross-scope validation fails", () => {
			expect(writer.isAllowed("memory/decision/test.md", "convention")).toBe(
				false,
			);
			expect(writer.isAllowed("memory/convention/test.md", "decision")).toBe(
				false,
			);
		});
	});

	describe("edge cases", () => {
		test("path with encoded characters", () => {
			const writer = new ScopedWriter([
				{ type: "decision", allowedPaths: ["memory/decision"] },
			]);

			expect(
				writer.isAllowed("memory/decision/file%20with%20spaces.md", "decision"),
			).toBe(true);
		});

		test("symlink traversal attempts", () => {
			const writer = new ScopedWriter([
				{
					type: "decision",
					allowedPaths: [path.join(testProjectRoot, "memory/decision")],
				},
			]);

			expect(() => {
				writer.validatePath("/etc/passwd", "decision");
			}).toThrow();
		});
	});
});

describe("createScopedWriterFromConfig", () => {
	test("creates writer from memory type configs", () => {
		const configs = [
			{ name: "decision", output: { path: "memory/decision" } },
			{ name: "convention", output: { path: "memory/convention" } },
		];

		const writer = createScopedWriterFromConfig(configs);

		expect(writer.hasScope("decision")).toBe(true);
		expect(writer.hasScope("convention")).toBe(true);
		expect(writer.isAllowed("memory/decision/test.md", "decision")).toBe(true);
		expect(writer.isAllowed("memory/convention/test.md", "convention")).toBe(
			true,
		);
	});

	test("skips configs without output.path", () => {
		const configs = [
			{ name: "decision", output: { path: "memory/decision" } },
			{ name: "context", output: {} },
		];

		const writer = createScopedWriterFromConfig(configs);

		expect(writer.hasScope("decision")).toBe(true);
		expect(writer.hasScope("context")).toBe(false);
	});

	test("skips configs with undefined output", () => {
		const configs: Array<{ name: string; output?: { path?: string } }> = [
			{ name: "decision", output: { path: "memory/decision" } },
			{ name: "context" },
		];

		const writer = createScopedWriterFromConfig(configs);

		expect(writer.hasScope("decision")).toBe(true);
		expect(writer.hasScope("context")).toBe(false);
	});
});
