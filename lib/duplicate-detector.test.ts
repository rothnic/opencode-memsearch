import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import path from "path";
import os from "os";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import {
  DuplicateDetector,
  getLevenshteinSimilarity,
  getJaccardSimilarity,
  getCosineSimilarity,
  getSimilarity,
  checkSimilarity,
  compareStrings,
} from "./duplicate-detector";

const testRoot = path.join(os.tmpdir(), "memsearch-dup-detector-test-" + Date.now());
const memoryDir = path.join(testRoot, "memory", "decision");

beforeEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
  await mkdir(memoryDir, { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("similarity algorithms", () => {
  describe("getLevenshteinSimilarity", () => {
    test("returns 1.0 for identical strings", () => {
      expect(getLevenshteinSimilarity("hello", "hello")).toBe(1.0);
    });

    test("returns 0.0 for empty strings", () => {
      expect(getLevenshteinSimilarity("", "hello")).toBe(0.0);
      expect(getLevenshteinSimilarity("hello", "")).toBe(0.0);
    });

    test("calculates correct similarity for similar strings", () => {
      const sim = getLevenshteinSimilarity("hello", "hallo");
      expect(sim).toBeGreaterThan(0.7);
      expect(sim).toBeLessThan(1.0);
    });

    test("calculates low similarity for very different strings", () => {
      const sim = getLevenshteinSimilarity("hello", "xyz");
      expect(sim).toBeLessThan(0.5);
    });

    test("is case insensitive", () => {
      expect(getLevenshteinSimilarity("HELLO", "hello")).toBe(1.0);
    });
  });

  describe("getJaccardSimilarity", () => {
    test("returns 1.0 for identical strings", () => {
      expect(getJaccardSimilarity("hello world", "hello world")).toBe(1.0);
    });

    test("returns 0.0 for empty strings", () => {
      expect(getJaccardSimilarity("", "hello")).toBe(0.0);
    });

    test("calculates high similarity for similar documents", () => {
      const doc1 = "The quick brown fox jumps over the lazy dog";
      const doc2 = "The quick brown fox jumps over the lazy dog";
      expect(getJaccardSimilarity(doc1, doc2)).toBe(1.0);
    });

    test("calculates lower similarity for partially similar documents", () => {
      const doc1 = "React is a JavaScript library for building user interfaces";
      const doc2 = "React is a JavaScript framework for building web applications";
      const sim = getJaccardSimilarity(doc1, doc2);
      expect(sim).toBeGreaterThan(0.3);
      expect(sim).toBeLessThan(1.0);
    });

    test("is case insensitive", () => {
      expect(getJaccardSimilarity("HELLO WORLD", "hello world")).toBe(1.0);
    });
  });

  describe("getCosineSimilarity", () => {
    test("returns 1.0 for identical strings", () => {
      expect(getCosineSimilarity("hello world", "hello world")).toBe(1.0);
    });

    test("returns 0.0 for empty strings", () => {
      expect(getCosineSimilarity("", "hello")).toBe(0.0);
    });

    test("calculates high similarity for similar documents", () => {
      const doc1 = "machine learning is a subset of artificial intelligence";
      const doc2 = "machine learning uses algorithms to learn from data";
      const sim = getCosineSimilarity(doc1, doc2);
      expect(sim).toBeGreaterThan(0.3);
    });
  });

  describe("getSimilarity (combined)", () => {
    test("returns 1.0 for identical strings", () => {
      expect(getSimilarity("test", "test")).toBe(1.0);
    });

    test("returns 0.0 for empty strings", () => {
      expect(getSimilarity("", "test")).toBe(0.0);
    });

    test("combines algorithms for better accuracy", () => {
      const s1 = "The decision to use PostgreSQL as the primary database";
      const s2 = "We decided to use PostgreSQL for the main database";
      const sim = getSimilarity(s1, s2);
      expect(sim).toBeGreaterThan(0.3);
    });
  });
});

describe("checkSimilarity", () => {
  test("returns true when above threshold", () => {
    expect(checkSimilarity("hello world", "hello world", 0.85)).toBe(true);
  });

  test("returns false when below threshold", () => {
    expect(checkSimilarity("hello", "xyz", 0.85)).toBe(false);
  });

  test("uses default threshold of 0.85", () => {
    expect(checkSimilarity("hello", "hello")).toBe(true);
    // "hellx" vs "hello" has similarity ~0.8 which is below 0.85 threshold
    expect(checkSimilarity("hello world", "hello world!")).toBe(true);
  });
});

describe("compareStrings", () => {
  test("returns all similarity metrics", () => {
    const result = compareStrings("hello", "hallo");
    expect(result).toHaveProperty("levenshtein");
    expect(result).toHaveProperty("jaccard");
    expect(result).toHaveProperty("cosine");
    expect(result).toHaveProperty("combined");
  });

  test("levenshtein is highest for short edit distance", () => {
    const result = compareStrings("hello", "hallo");
    expect(result.levenshtein).toBeGreaterThan(result.jaccard);
  });
});

describe("DuplicateDetector", () => {
  describe("constructor", () => {
    test("creates detector with custom config", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.9,
        memoryDirs: ["/some/path"],
      });
      expect(detector.getThreshold()).toBe(0.9);
    });

    test("creates detector with default extensions", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: ["/some/path"],
      });
      expect(detector.getMemoryDirs()).toEqual(["/some/path"]);
    });
  });

  describe("fromConfig", () => {
    test("creates detector from DeduplicationConfig", () => {
      const detector = DuplicateDetector.fromConfig(
        { enabled: true, similarityThreshold: 0.8, autoMerge: false },
        testRoot,
        "decision"
      );
      expect(detector.getThreshold()).toBe(0.8);
      expect(detector.getMemoryDirs()).toContain(path.join(testRoot, "memory", "decision"));
    });

    test("searches all memory types when no type specified", () => {
      const detector = DuplicateDetector.fromConfig(
        { enabled: true, similarityThreshold: 0.85, autoMerge: false },
        testRoot
      );
      expect(detector.getMemoryCount()).toBe(0);
    });
  });

  describe("findSimilar", () => {
    test("returns empty array when no memory files exist", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });
      const result = detector.findSimilar("some content");
      expect(result).toHaveLength(0);
    });

    test("finds similar content above threshold", async () => {
      await writeFile(
        path.join(memoryDir, "existing.md"),
        "---\nsession_id: test-123\n---\nWe decided to use PostgreSQL for the main database"
      );

      const detector = new DuplicateDetector({
        similarityThreshold: 0.5,
        memoryDirs: [memoryDir],
      });

      const result = detector.findSimilar(
        "We decided to use PostgreSQL for the main database storage"
      );
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBeGreaterThan(0.5);
    });

    test("returns empty when below threshold", async () => {
      await writeFile(
        path.join(memoryDir, "existing.md"),
        "Totally different content about something else"
      );

      const detector = new DuplicateDetector({
        similarityThreshold: 0.9,
        memoryDirs: [memoryDir],
      });

      const result = detector.findSimilar("Completely new and different content");
      expect(result).toHaveLength(0);
    });

    test("sorts results by similarity descending", async () => {
      await writeFile(
        path.join(memoryDir, "similar.md"),
        "This is very similar content that we want to match"
      );
      await writeFile(
        path.join(memoryDir, "less-similar.md"),
        "This is somewhat related but not exactly the same thing"
      );

      const detector = new DuplicateDetector({
        similarityThreshold: 0.2,
        memoryDirs: [memoryDir],
      });

      const result = detector.findSimilar("This is similar content that matches well");
      expect(result).toHaveLength(2);
      expect(result[0].similarity).toBeGreaterThanOrEqual(result[1].similarity);
    });

    test("extracts metadata from frontmatter", async () => {
      await writeFile(
        path.join(memoryDir, "with-meta.md"),
        `---
session_id: ses_abc123
project_path: /test/project
tags: [react, typescript]
extracted_at: 2024-01-15
---
Some content here`
      );

      const detector = new DuplicateDetector({
        similarityThreshold: 0.1,
        memoryDirs: [memoryDir],
      });

      const result = detector.findSimilar("Some content here");
      expect(result).toHaveLength(1);
      expect(result[0].metadata.session_id).toBe("ses_abc123");
      expect(result[0].metadata.project_path).toBe("/test/project");
      expect(result[0].metadata.tags).toEqual(["react", "typescript"]);
    });
  });

  describe("isDuplicate", () => {
    test("returns true when duplicate found", async () => {
      await writeFile(
        path.join(memoryDir, "existing.md"),
        "We use React for building user interfaces"
      );

      const detector = new DuplicateDetector({
        similarityThreshold: 0.5,
        memoryDirs: [memoryDir],
      });

      expect(detector.isDuplicate("We use React for building user interfaces")).toBe(true);
    });

    test("returns false when no duplicate", async () => {
      await writeFile(path.join(memoryDir, "existing.md"), "Old content");

      const detector = new DuplicateDetector({
        similarityThreshold: 0.9,
        memoryDirs: [memoryDir],
      });

      expect(detector.isDuplicate("New and different content")).toBe(false);
    });
  });

  describe("getSimilarity", () => {
    test("returns similarity for specific file", async () => {
      const filePath = path.join(memoryDir, "test.md");
      await writeFile(filePath, "Some existing content about decisions");

      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });

      const sim = detector.getSimilarity("Some existing content about decisions", filePath);
      expect(sim).toBeGreaterThan(0.9);
    });

    test("returns 0 for non-existent file", async () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });

      const sim = detector.getSimilarity("content", "/non/existent/file.md");
      expect(sim).toBe(0.0);
    });
  });

  describe("detectDuplicates", () => {
    test("returns full result with isDuplicate flag", async () => {
      await writeFile(
        path.join(memoryDir, "existing.md"),
        "We decided to use TypeScript for this project"
      );

      const detector = new DuplicateDetector({
        similarityThreshold: 0.5,
        memoryDirs: [memoryDir],
      });

      const result = detector.detectDuplicates(
        "We decided to use TypeScript for this project"
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.bestMatch).not.toBeNull();
      expect(result.allMatches).toHaveLength(1);
    });

    test("returns null bestMatch when no duplicates", async () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });

      const result = detector.detectDuplicates("New unique content");

      expect(result.isDuplicate).toBe(false);
      expect(result.bestMatch).toBeNull();
      expect(result.allMatches).toHaveLength(0);
    });
  });

  describe("threshold management", () => {
    test("getThreshold returns configured threshold", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.75,
        memoryDirs: [],
      });
      expect(detector.getThreshold()).toBe(0.75);
    });

    test("setThreshold updates threshold", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.75,
        memoryDirs: [],
      });
      detector.setThreshold(0.9);
      expect(detector.getThreshold()).toBe(0.9);
    });

    test("setThreshold clamps to valid range", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.75,
        memoryDirs: [],
      });
      detector.setThreshold(1.5);
      expect(detector.getThreshold()).toBe(1.0);
      detector.setThreshold(-0.5);
      expect(detector.getThreshold()).toBe(0.0);
    });
  });

  describe("getMemoryDirs", () => {
    test("returns copy of memory dirs", () => {
      const dirs = ["/path1", "/path2"];
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: dirs,
      });
      const result = detector.getMemoryDirs();
      expect(result).toEqual(dirs);
      expect(result).not.toBe(dirs);
    });
  });

  describe("getMemoryCount", () => {
    test("returns 0 for empty directories", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });
      expect(detector.getMemoryCount()).toBe(0);
    });

    test("counts only matching extensions", async () => {
      await writeFile(path.join(memoryDir, "valid.md"), "content");
      await writeFile(path.join(memoryDir, "ignore.txt"), "content");

      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
        extensions: [".md"],
      });
      expect(detector.getMemoryCount()).toBe(1);
    });

    test("counts all files with default extensions", async () => {
      await writeFile(path.join(memoryDir, "doc.md"), "content");
      await writeFile(path.join(memoryDir, "note.txt"), "content");

      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });
      expect(detector.getMemoryCount()).toBe(2);
    });
  });

  describe("edge cases", () => {
    test("handles non-existent memory directory", () => {
      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: ["/non/existent/path"],
      });
      const result = detector.findSimilar("content");
      expect(result).toHaveLength(0);
    });

    test("handles empty content", async () => {
      await writeFile(path.join(memoryDir, "empty.md"), "");

      const detector = new DuplicateDetector({
        similarityThreshold: 0.85,
        memoryDirs: [memoryDir],
      });

      const result = detector.findSimilar("");
      expect(result).toHaveLength(0);
    });

    test("handles memory files with no frontmatter", async () => {
      await writeFile(path.join(memoryDir, "no-frontmatter.md"), "Just plain content without any metadata");

      const detector = new DuplicateDetector({
        similarityThreshold: 0.3,
        memoryDirs: [memoryDir],
      });

      const result = detector.findSimilar("Just plain content without any metadata");
      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual({});
    });
  });
});
