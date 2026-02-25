import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import path from "path";
import os from "os";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import {
  loadMemoryTypes,
  loadProjectMemoryTypes,
  loadGlobalMemoryTypes,
  hasProjectMemoryTypes,
  hasGlobalMemoryTypes,
  getGlobalMemoryTypesDir,
  getProjectMemoryTypesDir,
} from "./memory-type-config-loader";

const testRoot = path.join(os.tmpdir(), "memsearch-memory-type-test-" + Date.now());
const projectDir = path.join(testRoot, "project");
const globalDir = path.join(os.homedir(), ".config", "opencode", "memory");

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

describe("memory-type-config-loader", () => {
  describe("loadMemoryTypes", () => {
    test("returns empty when no memory directories exist", async () => {
      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors).toHaveLength(0);
    });

    test("loads project memory type configs", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "decision"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "decision", "config.yaml"),
        `
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions from sessions.
enabled: true
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(1);
      expect(result.memoryTypes[0].name).toBe("decision");
      expect(result.memoryTypes[0].collection).toBe("memory_decision");
      expect(result.validationErrors).toHaveLength(0);
    });

    test("loads multiple project memory types", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "decision"), { recursive: true });
      await mkdir(path.join(memoryDir, "convention"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "decision", "config.yaml"),
        `
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions.
`
      );
      await writeFile(
        path.join(memoryDir, "convention", "config.yaml"),
        `
name: convention
collection: memory_convention
extractionPrompt: Extract coding conventions.
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(2);
      const names = result.memoryTypes.map((m) => m.name).sort();
      expect(names).toEqual(["convention", "decision"]);
    });

    test("collects validation errors for invalid configs", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "invalid"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "invalid", "config.yaml"),
        `
name: invalid
collection: invalid
extractionPrompt: x
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0].source).toBe("project");
      expect(result.validationErrors[0].error).toContain("extractionPrompt");
    });

    test("handles empty directories gracefully", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "empty-dir"), { recursive: true });

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors).toHaveLength(0);
    });
  });

  describe("loadProjectMemoryTypes", () => {
    test("loads only project configs", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "decision"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "decision", "config.yaml"),
        `
name: decision
collection: memory_decision
extractionPrompt: Extract architectural decisions.
`
      );

      const result = loadProjectMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(1);
      expect(result.memoryTypes[0].name).toBe("decision");
    });
  });

  describe("getGlobalMemoryTypesDir", () => {
    test("returns correct global directory path", () => {
      const result = getGlobalMemoryTypesDir();
      expect(result).toBe(path.join(os.homedir(), ".config", "opencode", "memory"));
    });
  });

  describe("getProjectMemoryTypesDir", () => {
    test("returns correct project directory path", () => {
      const result = getProjectMemoryTypesDir(projectDir);
      expect(result).toBe(path.join(projectDir, "memory"));
    });
  });

  describe("hasProjectMemoryTypes", () => {
    test("returns false when no memory directory", async () => {
      expect(hasProjectMemoryTypes(projectDir)).toBe(false);
    });

    test("returns false when memory directory is empty", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(memoryDir, { recursive: true });
      expect(hasProjectMemoryTypes(projectDir)).toBe(false);
    });

    test("returns true when memory types exist", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "decision"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "decision", "config.yaml"),
        `
name: decision
collection: memory_decision
extractionPrompt: Extract decisions.
`
      );
      expect(hasProjectMemoryTypes(projectDir)).toBe(true);
    });
  });

  describe("merge precedence", () => {
    test("project overrides global on name collision", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "decision"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "decision", "config.yaml"),
        `
name: decision
collection: memory_decision_project
extractionPrompt: Project level extraction prompt.
enabled: true
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(1);
      expect(result.memoryTypes[0].collection).toBe("memory_decision_project");
    });

    test("combines project and global when no collision", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "project-type"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "project-type", "config.yaml"),
        `
name: project-type
collection: memory_project_type
extractionPrompt: Project specific extraction.
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes.some((m) => m.name === "project-type")).toBe(true);
    });
  });

  describe("validation behavior", () => {
    test("validates all required fields", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "incomplete"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "incomplete", "config.yaml"),
        `
name: incomplete
# missing collection and extractionPrompt
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    test("accepts optional fields with defaults", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "minimal"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "minimal", "config.yaml"),
        `
name: minimal
collection: memory_minimal
extractionPrompt: Extract minimal info.
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(1);
      expect(result.memoryTypes[0].enabled).toBe(true);
      expect(result.memoryTypes[0].frequency?.mode).toBe("manual");
    });

    test("validates model format when provided", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "bad-model"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "bad-model", "config.yaml"),
        `
name: bad-model
collection: memory_bad_model
extractionPrompt: Extract something.
model: invalid-model
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors.some((e) => e.error.includes("model"))).toBe(true);
    });
  });

  describe("error handling", () => {
    test("handles non-existent workdir gracefully", async () => {
      const result = loadMemoryTypes("/non/existent/path");
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors).toHaveLength(0);
    });

    test("handles malformed YAML gracefully", async () => {
      const memoryDir = path.join(projectDir, "memory");
      await mkdir(path.join(memoryDir, "malformed"), { recursive: true });
      await writeFile(
        path.join(memoryDir, "malformed", "config.yaml"),
        `
name: malformed
collection: memory_malformed
extractionPrompt: 
  - this: is
    not: valid yaml structure
`
      );

      const result = loadMemoryTypes(projectDir);
      expect(result.memoryTypes).toHaveLength(0);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });
  });
});
