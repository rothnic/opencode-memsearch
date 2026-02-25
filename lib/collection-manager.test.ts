import { describe, expect, test, beforeEach, vi } from "bun:test";
import {
  CollectionManager,
  CollectionManagerError,
  isValidCollectionName,
  DEFAULT_METADATA_FIELDS,
  type CollectionManagerConfig,
  type CollectionSchema,
  type CollectionMetadataField,
  type CollectionResult,
  type CollectionInfo,
} from "./collection-manager";

const isCollectionSuccess = <T>(result: CollectionResult<T>): result is { ok: true; data: T } => {
  return result.ok === true;
};

const isCollectionError = <T>(result: CollectionResult<T>): result is { ok: false; error: CollectionManagerError } => {
  return result.ok === false;
};

const createMockShell = (responses: Record<string, { stdout: string; stderr: string; exitCode: number }>) => {
  const mockFn = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    let key = "";
    for (let i = 0; i < strings.length; i++) {
      key += strings[i];
      if (i < values.length) {
        key += String(values[i]);
      }
    }
    key = key.trim();
    const response = responses[key] ?? { stdout: "", stderr: "", exitCode: 0 };
    const result = { exitCode: response.exitCode, stderr: response.stderr };
    return {
      quiet: vi.fn().mockResolvedValue(result),
      text: vi.fn().mockResolvedValue(response.stdout),
      throws: vi.fn().mockImplementation(() => {
        if (response.exitCode !== 0) {
          throw new Error(response.stderr || `Command failed with exit code ${response.exitCode}`);
        }
        return { stdout: response.stdout, stderr: response.stderr, exitCode: response.exitCode };
      }),
    };
  });
  return Object.assign(mockFn, {
    quiet: vi.fn().mockReturnValue({ exitCode: 0 }),
    text: vi.fn().mockReturnValue(""),
    throws: vi.fn().mockResolvedValue(undefined),
  });
};

describe("isValidCollectionName", () => {
  test("returns true for valid collection names", () => {
    expect(isValidCollectionName("abc")).toBe(true);
    expect(isValidCollectionName("my_collection")).toBe(true);
    expect(isValidCollectionName("my-collection")).toBe(true);
    expect(isValidCollectionName("collection123")).toBe(true);
    expect(isValidCollectionName("MyCollection")).toBe(true);
  });

  test("returns false for names starting with non-letter", () => {
    expect(isValidCollectionName("123collection")).toBe(false);
    expect(isValidCollectionName("_collection")).toBe(false);
    expect(isValidCollectionName("-collection")).toBe(false);
  });

  test("returns false for invalid characters", () => {
    expect(isValidCollectionName("my collection")).toBe(false);
    expect(isValidCollectionName("my@collection")).toBe(false);
    expect(isValidCollectionName("my.collection")).toBe(false);
  });

  test("returns false for names outside length bounds", () => {
    expect(isValidCollectionName("ab")).toBe(false);
    expect(isValidCollectionName("a")).toBe(false);
    expect(isValidCollectionName("a".repeat(65))).toBe(false);
    expect(isValidCollectionName("")).toBe(false);
  });

  test("returns false for undefined or null", () => {
    expect(isValidCollectionName(undefined as unknown as string)).toBe(false);
    expect(isValidCollectionName(null as unknown as string)).toBe(false);
  });
});

describe("DEFAULT_METADATA_FIELDS", () => {
  test("includes tags field as string array", () => {
    const tagsField = DEFAULT_METADATA_FIELDS.find((f) => f.name === "tags");
    expect(tagsField).toBeDefined();
    expect(tagsField?.type).toBe("string[]");
  });

  test("includes source_session field as string", () => {
    const sourceField = DEFAULT_METADATA_FIELDS.find((f) => f.name === "source_session");
    expect(sourceField).toBeDefined();
    expect(sourceField?.type).toBe("string");
  });

  test("includes technology field as string", () => {
    const techField = DEFAULT_METADATA_FIELDS.find((f) => f.name === "technology");
    expect(techField).toBeDefined();
    expect(techField?.type).toBe("string");
  });

  test("has exactly 3 default fields", () => {
    expect(DEFAULT_METADATA_FIELDS).toHaveLength(3);
  });
});

describe("CollectionManagerError", () => {
  test("creates error with correct properties", () => {
    const error = new CollectionManagerError("cli_not_found", "CLI not found", { retryable: true });
    expect(error.code).toBe("cli_not_found");
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("CLI not found");
    expect(error.name).toBe("CollectionManagerError");
  });

  test("defaults retryable to false", () => {
    const error = new CollectionManagerError("invalid_collection_name", "Invalid name");
    expect(error.retryable).toBe(false);
  });

  test("preserves cause when provided", () => {
    const cause = new Error("original error");
    const error = new CollectionManagerError("io_error", "IO error", { cause });
    expect(error.cause).toBe(cause);
  });
});

describe("CollectionManager.fromConfig", () => {
  test("creates instance with default config", () => {
    const manager = CollectionManager.fromConfig();
    expect(manager).toBeInstanceOf(CollectionManager);
  });

  test("creates instance with custom tempDir", () => {
    const manager = CollectionManager.fromConfig({ tempDir: "/custom/tmp" });
    expect(manager).toBeInstanceOf(CollectionManager);
  });

  test("creates instance with custom metadata fields", () => {
    const customFields: CollectionMetadataField[] = [
      { name: "custom_field", type: "string" },
    ];
    const manager = CollectionManager.fromConfig({ defaultMetadataFields: customFields });
    expect(manager).toBeInstanceOf(CollectionManager);
  });

  test("creates instance with custom shell", () => {
    const mockShell = createMockShell({});
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    expect(manager).toBeInstanceOf(CollectionManager);
  });

  test("creates instance with onIndex callback", () => {
    const callback = vi.fn();
    const manager = CollectionManager.fromConfig({ onIndex: callback });
    expect(manager).toBeInstanceOf(CollectionManager);
  });
});

describe("CollectionManager.getDefaultMetadataFields", () => {
  test("returns copy of default fields", () => {
    const manager = CollectionManager.fromConfig();
    const fields1 = manager.getDefaultMetadataFields();
    const fields2 = manager.getDefaultMetadataFields();
    expect(fields1).not.toBe(fields2);
    expect(fields1).toEqual(fields2);
  });

  test("returns custom fields when configured", () => {
    const customFields: CollectionMetadataField[] = [
      { name: "custom", type: "string" },
    ];
    const manager = CollectionManager.fromConfig({ defaultMetadataFields: customFields });
    const fields = manager.getDefaultMetadataFields();
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("custom");
  });
});

describe("CollectionManager.isCliAvailable", () => {
  test("returns true when CLI is available", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const available = await manager.isCliAvailable();
    expect(available).toBe(true);
  });

  test("returns false when CLI is not available", async () => {
    const mockShell = createMockShell({});
    mockShell.mockImplementation(() => {
      throw new Error("command not found");
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    manager.resetCliCache();
    const available = await manager.isCliAvailable();
    expect(available).toBe(false);
  });

  test("caches CLI availability result", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    await manager.isCliAvailable();
    await manager.isCliAvailable();
    expect(mockShell).toHaveBeenCalledTimes(1);
  });

  test("resetCliCache clears the cache", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    await manager.isCliAvailable();
    manager.resetCliCache();
    await manager.isCliAvailable();
    expect(mockShell).toHaveBeenCalledTimes(2);
  });
});

describe("CollectionManager.collectionExists", () => {
  test("throws on invalid collection name", async () => {
    const manager = CollectionManager.fromConfig();
    await expect(manager.collectionExists("!invalid")).rejects.toThrow(CollectionManagerError);
  });

  test("throws on empty name", async () => {
    const manager = CollectionManager.fromConfig();
    await expect(manager.collectionExists("")).rejects.toThrow(CollectionManagerError);
  });

  test("returns true when collection exists", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection test_collection"': { stdout: "Documents: 10", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const exists = await manager.collectionExists("test_collection");
    expect(exists).toBe(true);
  });

  test("returns false when collection does not exist", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection nonexistent"': { stdout: "", stderr: "collection not found", exitCode: 1 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const exists = await manager.collectionExists("nonexistent");
    expect(exists).toBe(false);
  });

  test("throws on CLI error other than not found", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection test"': { stdout: "", stderr: "connection refused", exitCode: 1 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    await expect(manager.collectionExists("test")).rejects.toThrow(CollectionManagerError);
  });
});

describe("CollectionManager.getCollectionInfo", () => {
  test("returns info with exists true when collection exists", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection my_collection"': { stdout: '{"documentCount": 5, "chunkCount": 100}', stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const info = await manager.getCollectionInfo("my_collection");
    expect(info.exists).toBe(true);
    expect(info.name).toBe("my_collection");
    expect(info.documentCount).toBe(5);
    expect(info.chunkCount).toBe(100);
  });

  test("returns info with exists false when collection does not exist", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection missing"': { stdout: "", stderr: "collection not found", exitCode: 1 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const info = await manager.getCollectionInfo("missing");
    expect(info.exists).toBe(false);
    expect(info.name).toBe("missing");
  });

  test("parses plain text stats output", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection text_stats"': { stdout: "Documents: 25\nChunks: 500", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const info = await manager.getCollectionInfo("text_stats");
    expect(info.documentCount).toBe(25);
    expect(info.chunkCount).toBe(500);
  });
});

describe("CollectionManager.createCollection", () => {
  test("returns error for invalid collection name", async () => {
    const manager = CollectionManager.fromConfig();
    const result = await manager.createCollection("!invalid");
    expect(result.ok).toBe(false);
    if (isCollectionError(result)) {
      expect(result.error.code).toBe("invalid_collection_name");
    }
  });

  test("returns success when collection already exists", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection existing"': { stdout: "Documents: 5", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const result = await manager.createCollection("existing");
    expect(result.ok).toBe(true);
    if (isCollectionSuccess(result)) {
      expect(result.data.exists).toBe(true);
    }
  });

  test("validates metadata fields schema", async () => {
    const manager = CollectionManager.fromConfig();
    const schema: CollectionSchema = {
      metadataFields: [{ name: "", type: "string" }],
    };
    const result = await manager.createCollection("test_collection", schema);
    expect(result.ok).toBe(false);
    if (isCollectionError(result)) {
      expect(result.error.code).toBe("schema_validation_failed");
    }
  });

  test("validates metadata field types", async () => {
    const manager = CollectionManager.fromConfig();
    const schema: CollectionSchema = {
      metadataFields: [{ name: "field", type: "invalid" as never }],
    };
    const result = await manager.createCollection("test_collection", schema);
    expect(result.ok).toBe(false);
    if (isCollectionError(result)) {
      expect(result.error.code).toBe("schema_validation_failed");
    }
  });
});

describe("CollectionManager.ensureCollection", () => {
  test("returns success when collection exists", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection existing"': { stdout: "Documents: 5", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const result = await manager.ensureCollection("existing");
    expect(result.ok).toBe(true);
    if (isCollectionSuccess(result)) {
      expect(result.data.exists).toBe(true);
    }
  });

  test("creates collection when it does not exist", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection new_collection"': { stdout: "", stderr: "collection not found", exitCode: 1 },
    });
    const manager = CollectionManager.fromConfig({ 
      shell: mockShell as never,
      tempDir: "/tmp",
    });
    const result = await manager.ensureCollection("new_collection");
    expect(result.ok).toBe(true);
  });
});

describe("CollectionManager.listCollections", () => {
  test("returns empty array (no list command in CLI)", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const result = await manager.listCollections();
    expect(result.ok).toBe(true);
    if (isCollectionSuccess(result)) {
      expect(result.data).toEqual([]);
    }
  });
});

describe("CollectionManager result discriminated union", () => {
  test("correctly narrows ok: true branch", async () => {
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection test"': { stdout: "Documents: 1", stderr: "", exitCode: 0 },
    });
    const manager = CollectionManager.fromConfig({ shell: mockShell as never });
    const result = await manager.ensureCollection("test");
    
    if (result.ok) {
      expect(result.data.exists).toBe(true);
      expect(result.data.name).toBe("test");
    } else {
      throw new Error("Expected success result");
    }
  });

  test("correctly narrows ok: false branch", async () => {
    const manager = CollectionManager.fromConfig();
    const result = await manager.createCollection("");
    
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(CollectionManagerError);
      expect(result.error.code).toBe("invalid_collection_name");
    } else {
      throw new Error("Expected error result");
    }
  });
});

describe("CollectionManager with onIndex callback", () => {
  test("calls onIndex before creating collection", async () => {
    const onIndex = vi.fn();
    const mockShell = createMockShell({
      'sh -c "memsearch --version"': { stdout: "1.0.0", stderr: "", exitCode: 0 },
      'sh -c "memsearch stats --collection callback_test"': { stdout: "", stderr: "collection not found", exitCode: 1 },
    });
    const manager = CollectionManager.fromConfig({ 
      shell: mockShell as never,
      tempDir: "/tmp",
      onIndex,
    });
    await manager.createCollection("callback_test");
    expect(onIndex).toHaveBeenCalledWith("callback_test");
  });
});
