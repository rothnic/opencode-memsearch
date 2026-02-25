import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import CompactionCapture, {
  CompactionCaptureError,
  type CompactionSummary,
  type CompactionCaptureResult,
} from "./compaction-capture";

function isOk<T>(result: CompactionCaptureResult<T>): result is { ok: true; data: T } {
  return result.ok === true;
}

describe("CompactionCapture", () => {
  let testWorkdir: string;

  beforeEach(async () => {
    testWorkdir = path.join(tmpdir(), `compaction-capture-test-${Date.now()}`);
    await mkdir(testWorkdir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testWorkdir, { recursive: true, force: true });
  });

  describe("fromConfig factory", () => {
    it("should create instance with default config", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture).toBeInstanceOf(CompactionCapture);
      expect(capture.isEnabled()).toBe(true);
      expect(capture.getDefaultMemoryType()).toBe("context");
    });

    it("should create instance with capture disabled", () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: false },
      });
      expect(capture.isEnabled()).toBe(false);
    });

    it("should use custom default memory type", () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: true, memoryType: "decision" },
      });
      expect(capture.getDefaultMemoryType()).toBe("decision");
    });

    it("should accept memory types map", () => {
      const memoryTypes = new Map([
        ["context", { name: "context", collection: "ctx", enabled: true, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
        ["decision", { name: "decision", collection: "dec", enabled: true, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
      ]);
      const capture = CompactionCapture.fromConfig({ memoryTypes });
      expect(capture.hasMemoryType("context")).toBe(true);
      expect(capture.hasMemoryType("decision")).toBe(true);
      expect(capture.hasMemoryType("unknown")).toBe(false);
    });

    it("should accept custom workdir", () => {
      const capture = CompactionCapture.fromConfig({
        workdir: "/custom/path",
      });
      expect(capture).toBeInstanceOf(CompactionCapture);
    });
  });

  describe("isEnabled", () => {
    it("should return true when capture enabled", () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: true },
      });
      expect(capture.isEnabled()).toBe(true);
    });

    it("should return false when capture disabled", () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: false },
      });
      expect(capture.isEnabled()).toBe(false);
    });
  });

  describe("getMemoryTypes", () => {
    it("should return empty map when no memory types configured", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture.getMemoryTypes().size).toBe(0);
    });

    it("should return configured memory types", () => {
      const memoryTypes = new Map([
        ["ctx", { name: "ctx", collection: "ctx-coll", enabled: true, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
      ]);
      const capture = CompactionCapture.fromConfig({ memoryTypes });
      expect(capture.getMemoryTypes().size).toBe(1);
    });
  });

  describe("hasMemoryType", () => {
    it("should return true for configured memory type", () => {
      const memoryTypes = new Map([
        ["decision", { name: "decision", collection: "dec", enabled: true, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
      ]);
      const capture = CompactionCapture.fromConfig({ memoryTypes });
      expect(capture.hasMemoryType("decision")).toBe(true);
    });

    it("should return false for unconfigured memory type", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture.hasMemoryType("unknown")).toBe(false);
    });
  });

  describe("getMemoryTypeConfig", () => {
    it("should return config for configured memory type", () => {
      const memoryTypes = new Map([
        ["context", { name: "context", collection: "ctx", enabled: true, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
      ]);
      const capture = CompactionCapture.fromConfig({ memoryTypes });
      const config = capture.getMemoryTypeConfig("context");
      expect(config?.name).toBe("context");
    });

    it("should return undefined for unconfigured memory type", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture.getMemoryTypeConfig("unknown")).toBeUndefined();
    });
  });

  describe("isMemoryTypeAvailable", () => {
    it("should return true for enabled memory type", () => {
      const memoryTypes = new Map([
        ["context", { name: "context", collection: "ctx", enabled: true, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
      ]);
      const capture = CompactionCapture.fromConfig({ memoryTypes });
      expect(capture.isMemoryTypeAvailable("context")).toBe(true);
    });

    it("should return false for disabled memory type", () => {
      const memoryTypes = new Map([
        ["context", { name: "context", collection: "ctx", enabled: false, tagLists: [], output: { path: "memory", filenamePattern: "{date}_{session_id}.md", frontmatter: [] }, frequency: { mode: "manual" } }],
      ]);
      const capture = CompactionCapture.fromConfig({ memoryTypes });
      expect(capture.isMemoryTypeAvailable("context")).toBe(false);
    });

    it("should return true for unconfigured memory type (default enabled)", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture.isMemoryTypeAvailable("unknown")).toBe(true);
    });
  });

  describe("parseCompactionEvent", () => {
    it("should parse string input as summary", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent("Test summary content");
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.summary).toBe("Test summary content");
        expect(result.data.sessionId).toBe("unknown");
      }
    });

    it("should parse object with sessionId and summary", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent({
        sessionId: "ses_123",
        summary: "Session was compacted",
        messageCount: 50,
      });
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.sessionId).toBe("ses_123");
        expect(result.data.summary).toBe("Session was compacted");
        expect(result.data.messageCount).toBe(50);
      }
    });

    it("should parse object with alternative field names", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent({
        session_id: "ses_456",
        content: "Alternative field content",
        messages: 100,
        tokens: 5000,
      });
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.sessionId).toBe("ses_456");
        expect(result.data.summary).toBe("Alternative field content");
        expect(result.data.messageCount).toBe(100);
        expect(result.data.tokenCount).toBe(5000);
      }
    });

    it("should extract unknown fields as metadata", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent({
        sessionId: "ses_789",
        summary: "Summary",
        customField: "customValue",
        anotherField: 123,
      });
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.metadata?.customField).toBe("customValue");
        expect(result.data.metadata?.anotherField).toBe(123);
      }
    });

    it("should return error for empty object", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent({});
      expect(result.ok).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe("session_parse_error");
      }
    });

    it("should return error when capture disabled", () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: false },
      });
      const result = capture.parseCompactionEvent("summary");
      expect(result.ok).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe("capture_disabled");
      }
    });

    it("should handle sessionPath field", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent({
        sessionId: "ses_abc",
        summary: "Test",
        sessionPath: "/path/to/session",
      });
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.sessionPath).toBe("/path/to/session");
      }
    });

    it("should handle timestamp field", () => {
      const capture = CompactionCapture.fromConfig({});
      const result = capture.parseCompactionEvent({
        sessionId: "ses_def",
        summary: "Test",
        timestamp: "2024-01-15T10:30:00Z",
      });
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.timestamp).toBe("2024-01-15T10:30:00Z");
      }
    });
  });

  describe("onCompaction", () => {
    it("should capture summary with default memory type", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_test",
        timestamp: new Date().toISOString(),
        messageCount: 10,
        summary: "Compaction summary text",
      };

      const result = await capture.onCompaction("ses_test", summary);
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.memoryType).toBe("context");
      }
    });

    it("should capture with custom memory type", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_test2",
        timestamp: new Date().toISOString(),
        messageCount: 20,
        summary: "Another summary",
      };

      const result = await capture.onCompaction("ses_test2", summary, "decision");
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.memoryType).toBe("decision");
      }
    });

    it("should return error when capture disabled", async () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: false },
      });
      const summary: CompactionSummary = {
        sessionId: "ses_test3",
        timestamp: new Date().toISOString(),
        messageCount: 5,
        summary: "Summary",
      };

      const result = await capture.onCompaction("ses_test3", summary);
      expect(result.ok).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe("capture_disabled");
      }
    });

    it("should parse raw event data", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const eventData = {
        sessionId: "ses_parsed",
        summary: "Parsed summary",
        messageCount: 15,
      };

      const result = await capture.onCompaction("ses_parsed", eventData);
      expect(result.ok).toBe(true);
    });

    it("should track captured summaries", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_track",
        timestamp: new Date().toISOString(),
        messageCount: 5,
        summary: "Tracking test",
      };

      await capture.onCompaction("ses_track", summary);
      expect(capture.getCaptureCount()).toBe(1);
      const summaries = capture.getCapturedSummaries();
      expect(summaries[0]?.summary.sessionId).toBe("ses_track");
    });

    it("should allow clearing captured summaries", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_clear",
        timestamp: new Date().toISOString(),
        messageCount: 5,
        summary: "Clear test",
      };

      await capture.onCompaction("ses_clear", summary);
      expect(capture.getCaptureCount()).toBe(1);
      capture.clearCapturedSummaries();
      expect(capture.getCaptureCount()).toBe(0);
    });
  });

  describe("captureSummary", () => {
    it("should write summary to correct path", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_write",
        timestamp: "2024-01-15T10:00:00Z",
        messageCount: 10,
        summary: "Write test summary",
      };

      const result = await capture.captureSummary(summary, "context");
      if (!result.ok) {
        console.log("Error:", result.error);
      }
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        expect(result.data.outputPath).toContain("memory/context/");
      }
    });

    it("should return error when capture disabled", async () => {
      const capture = CompactionCapture.fromConfig({
        compaction: { capture: false },
      });
      const summary: CompactionSummary = {
        sessionId: "ses_err",
        timestamp: new Date().toISOString(),
        messageCount: 5,
        summary: "Error test",
      };

      const result = await capture.captureSummary(summary, "context");
      expect(result.ok).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe("capture_disabled");
      }
    });

    it("should generate content with frontmatter", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_frontmatter",
        timestamp: "2024-01-15T10:00:00Z",
        messageCount: 10,
        summary: "Frontmatter test",
      };

      const result = await capture.captureSummary(summary, "context");
      if (!result.ok) {
        console.log("Error:", result.error);
      }
      expect(result.ok).toBe(true);
      if (isOk(result)) {
        const content = await readFile(result.data.outputPath, "utf8");
        expect(content).toContain("---");
        expect(content).toContain("session_id: \"ses_frontmatter\"");
        expect(content).toContain("Frontmatter test");
      }
    });

    it("should create nested directories", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_nested",
        timestamp: "2024-01-15T10:00:00Z",
        messageCount: 5,
        summary: "Nested dir test",
      };

      const result = await capture.captureSummary(summary, "context");
      if (!result.ok) {
        console.log("Error:", result.error);
      }
      expect(result.ok).toBe(true);
    });
  });

  describe("getCapturedSummaries", () => {
    it("should return empty array initially", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture.getCapturedSummaries()).toEqual([]);
    });

    it("should return all captured summaries", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary1: CompactionSummary = {
        sessionId: "ses_1",
        timestamp: new Date().toISOString(),
        messageCount: 5,
        summary: "First",
      };
      const summary2: CompactionSummary = {
        sessionId: "ses_2",
        timestamp: new Date().toISOString(),
        messageCount: 10,
        summary: "Second",
      };

      await capture.onCompaction("ses_1", summary1);
      await capture.onCompaction("ses_2", summary2);
      const summaries = capture.getCapturedSummaries();
      expect(summaries.length).toBe(2);
    });
  });

  describe("getCaptureCount", () => {
    it("should return 0 initially", () => {
      const capture = CompactionCapture.fromConfig({});
      expect(capture.getCaptureCount()).toBe(0);
    });

    it("should return correct count after captures", async () => {
      const capture = CompactionCapture.fromConfig({ workdir: testWorkdir });
      const summary: CompactionSummary = {
        sessionId: "ses_count",
        timestamp: new Date().toISOString(),
        messageCount: 5,
        summary: "Count test",
      };

      await capture.onCompaction("ses_count", summary);
      expect(capture.getCaptureCount()).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should have correct error codes", () => {
      const error1 = new CompactionCaptureError("capture_disabled", "Disabled");
      expect(error1.code).toBe("capture_disabled");
      expect(error1.retryable).toBe(false);

      const error2 = new CompactionCaptureError("write_failed", "Write error", {
        retryable: true,
      });
      expect(error2.code).toBe("write_failed");
      expect(error2.retryable).toBe(true);
    });

    it("should preserve error cause", () => {
      const cause = new Error("Original error");
      const error = new CompactionCaptureError("write_failed", "Wrapped", {
        cause,
      });
      expect(error.cause).toBe(cause);
    });
  });
});
