import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import { createIsolatedEnv, getOpencodeCmd } from "../utils/isolated-env";
import { join } from "node:path";
import { writeFile, chmod, mkdir } from "node:fs/promises";
import plugin from "../../index.ts";

describe("memsearch E2E", () => {
  let env: any;
  let opencode: any;
  let tools: any;
  let hooks: any;

  const TIMEOUT = 120000;

  let mockContext: any;

  beforeAll(async () => {
    env = await createIsolatedEnv();
    opencode = getOpencodeCmd(env);

    const startScript = join(env.pluginPath, "scripts", "start-milvus.sh");
    await $`${startScript}`;

    const mockBinDir = join(env.home, "bin");
    await mkdir(mockBinDir, { recursive: true });
    const mockMemsearch = join(mockBinDir, "memsearch");
    
    const mockContent = `#!/usr/bin/env bun
const fs = require("node:fs");
const args = Bun.argv.slice(2);
const logFile = "${join(env.home, "mock.log")}";

fs.appendFileSync(logFile, "Received args: " + JSON.stringify(args) + "\\n");

if (args.includes("--version")) {
  process.stdout.write("memsearch-mock 0.1.0\\n");
  process.exit(0);
}
if (args[0] === "index") {
  fs.appendFileSync(logFile, "index called\\n");
  process.exit(0);
}
if (args[0] === "stats") {
  process.stdout.write(JSON.stringify({ documentCount: 1, chunkCount: 1, indexSize: 1024 }) + "\\n");
  process.exit(0);
}
if (args[0] === "search") {
  fs.appendFileSync(logFile, "search called with " + args.slice(1).join(" ") + "\\n");
  const results = {
    query: args[1],
    options: {},
    results: [
      {
        content: "dummy content",
        score: 0.9,
        chunk_hash: "hash1",
        source: { uri: "test.txt" }
      }
    ]
  };
  process.stdout.write(JSON.stringify(results) + "\\n");
  process.exit(0);
}
`;
    await writeFile(mockMemsearch, mockContent);
    await chmod(mockMemsearch, 0o755);
    env.mockBinDir = mockBinDir;

    // Add mock bin to PATH so the plugin can find it via global $
    process.env.PATH = `${mockBinDir}:${process.env.PATH}`;

    // Initialize tools directly
    mockContext = {
      project: {},
      client: {},
      $: (strings: any, ...values: any[]) => {
        const path = env.mockBinDir ? `${env.mockBinDir}:${process.env.PATH}` : process.env.PATH;
        return $.env({
          ...process.env,
          HOME: env.home,
          XDG_CONFIG_HOME: join(env.home, ".config"),
          XDG_DATA_HOME: join(env.home, ".local/share"),
          XDG_STATE_HOME: join(env.home, ".local/state"),
          XDG_CACHE_HOME: join(env.home, ".cache"),
          OPENCODE_TEST_HOME: env.home,
          PATH: path,
        })(strings, ...values).cwd(join(env.home, "worktree")).quiet();
      },
      directory: join(env.home, "worktree"),
      worktree: join(env.home, "worktree"),
    };
    const instance = await plugin(mockContext);
    tools = instance.tool;
    hooks = instance.hook;
  }, TIMEOUT);

  afterAll(async () => {
    try {
      const composeFile = join(env.pluginPath, "milvus-compose.yaml");
      await $`docker compose -f ${composeFile} down -v`.quiet();
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
    await env.cleanup();
  }, TIMEOUT);

  it("should load the memsearch plugin", async () => {
    expect(tools).toBeDefined();
    expect(tools["mem-index"]).toBeDefined();
    expect(tools["mem-search"]).toBeDefined();
  }, TIMEOUT);

  it("should index and search content", async () => {
    const worktree = join(env.home, "worktree");
    const dummyFile = join(worktree, "test.txt");
    await writeFile(dummyFile, "dummy content");

    console.log("Running mem-index...");
    const indexResult = await tools["mem-index"].execute({ path: "test.txt" }, mockContext);
    console.log("Index result:", indexResult);

    console.log("Running mem-search...");
    const searchResult = await tools["mem-search"].execute({ query: "dummy" }, mockContext);
    console.log("Search result:", searchResult);
    
    expect(JSON.stringify(searchResult)).toContain("dummy content");
    
    // Verify mock was called
    const logContent = await $`cat ${join(env.home, "mock.log")}`.text();
    expect(logContent).toContain("index called");
    expect(logContent).toContain("search called");
  }, TIMEOUT);

  it("should perform multi-source context injection", async () => {
    const configPath = join(env.home, "worktree", "opencode.json");
    const multiSourceConfig = {
      memsearch: {
        sources: [
          {
            id: "source1",
            name: "Source 1",
            pathOrCollection: "coll1",
            enabled: true,
            search: { maxResults: 2 },
            injection: { template: "## {{name}}\\n{{content}}", maxContentLength: 100 }
          },
          {
            id: "source2",
            name: "Source 2",
            pathOrCollection: "coll2",
            enabled: true,
            search: { maxResults: 3 },
            injection: { template: "## {{name}}\\n{{content}}", maxContentLength: 100 }
          }
        ]
      }
    };
    await writeFile(configPath, JSON.stringify(multiSourceConfig));

    const input = {
      messages: [
        { role: "user", content: "hello world" }
      ]
    };
    const output = {
      system: []
    };

    console.log("Running system-transform hook...");
    await hooks["experimental.chat.system.transform"](input, output, mockContext);
    
    console.log("Output system prompts:", output.system);
    expect(output.system.length).toBeGreaterThan(0);
    expect(output.system[0]).toContain("<memsearch-context>");
    expect(output.system[0]).toContain("Source 1");
    expect(output.system[0]).toContain("Source 2");

    // Verify mock was called for both collections
    const logContent = await $`cat ${join(env.home, "mock.log")}`.text();
    expect(logContent).toContain('--collection","coll1"');
    expect(logContent).toContain('--collection","coll2"');
  }, TIMEOUT);

  it("should handle grouping by source", async () => {
    const configPath = join(env.home, "worktree", "opencode.json");
    const groupedConfig = {
      memsearch: {
        sources: [
          {
            id: "session-memory",
            enabled: false
          },
          {
            id: "global-skills",
            enabled: false
          },
          {
            id: "project-skills",
            enabled: false
          },
          {
            id: "docs",
            enabled: false
          },
          {
            id: "grouped-source",
            name: "Grouped Source",
            pathOrCollection: "grouped_coll",
            enabled: true,
            search: { 
              maxResults: 2,
              groupBySource: true,
              maxChunksPerSource: 1
            },
            injection: { template: "## {{source}}\\n{{content}}", maxContentLength: 100 }
          }
        ]
      }
    };
    await writeFile(configPath, JSON.stringify(groupedConfig));

    const mockMemsearch = join(env.home, "bin", "memsearch");
    const mockContent = `#!/usr/bin/env bun
const fs = require("node:fs");
const args = Bun.argv.slice(2);
const logFile = "${join(env.home, "mock.log")}";
fs.appendFileSync(logFile, "Received args: " + JSON.stringify(args) + "\\n");
if (args[0] === "search") {
  const results = {
    query: args[1],
    options: {},
    results: [
      { content: "chunk 1", score: 0.9, source: { uri: "file1.txt" } },
      { content: "chunk 2", score: 0.8, source: { uri: "file1.txt" } },
      { content: "chunk 3", score: 0.7, source: { uri: "file2.txt" } },
      { content: "chunk 4", score: 0.6, source: { uri: "file3.txt" } },
    ]
  };
  process.stdout.write(JSON.stringify(results) + "\\n");
  process.exit(0);
}
if (args.includes("--version")) { process.stdout.write("0.1.0\\n"); process.exit(0); }
`;
    await writeFile(mockMemsearch, mockContent);

    const input = { messages: [{ role: "user", content: "test" }] };
    const output = { system: [] };

    await hooks["experimental.chat.system.transform"](input, output, mockContext);

    const prompt = output.system[0];
    expect(prompt).toContain("file1.txt");
    expect(prompt).toContain("chunk 1");
    expect(prompt).not.toContain("chunk 2");
    expect(prompt).toContain("file2.txt");
    expect(prompt).toContain("chunk 3");
    expect(prompt).not.toContain("file3.txt");

    const logContent = await $`cat ${join(env.home, "mock.log")}`.text();
    expect(logContent).toContain('--top-k","10"');
  }, TIMEOUT);
});
