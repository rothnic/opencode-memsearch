import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import { createIsolatedEnv } from "../utils/isolated-env";
import { join } from "node:path";
import { writeFile, rm } from "node:fs/promises";
import plugin from "../../index.ts";

const TIMEOUT = 180_000;

describe("memsearch E2E (True)", () => {
  let env: any;
  let tools: any;
  let hooks: any;
  let mockContext: any;

  beforeAll(async () => {
    env = await createIsolatedEnv();

    const binDir = join(env.home, "bin");
    await $`mkdir -p ${binDir}`;

    const wrapperContent = `#!/usr/bin/env bash
export HOME="${env.home}"
export XDG_CONFIG_HOME="${env.home}/.config"
export XDG_DATA_HOME="${env.home}/.local/share"
export XDG_STATE_HOME="${env.home}/.local/state"
export XDG_CACHE_HOME="${env.home}/.cache"
export OPENCODE_TEST_HOME="${env.home}"
exec python3 -m memsearch "$@"
`;
    await writeFile(join(binDir, "memsearch"), wrapperContent, { mode: 0o755 });

    mockContext = {
      $: (strings: any, ...values: any[]) => {
        const pathPrefix = `${binDir}:${process.env.PATH}`;
        return $.env({
          ...process.env,
          HOME: env.home,
          XDG_CONFIG_HOME: join(env.home, ".config"),
          XDG_DATA_HOME: join(env.home, ".local/share"),
          XDG_STATE_HOME: join(env.home, ".local/state"),
          XDG_CACHE_HOME: join(env.home, ".cache"),
          OPENCODE_TEST_HOME: env.home,
          PATH: pathPrefix,
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
    await rm(join(env.home, ".memsearch"), { recursive: true, force: true }).catch(() => {});
    await env.cleanup();
  }, TIMEOUT);

  it("loads plugin and memsearch CLI is available", async () => {
    const raw = await tools["mem-version"].execute({}, mockContext);
    const parsed = JSON.parse(raw as string);
    expect(parsed).toBeDefined();
    expect(parsed.cliVersion).toBeTruthy();
  }, TIMEOUT);

  it("indexes real files into named collections and returns stats", async () => {
    const file1 = join(env.home, "worktree", "doc-animals.md");
    const file2 = join(env.home, "worktree", "doc-fruit.md");

    await writeFile(file1, "# Animals\nThe quick brown fox jumps over the lazy dog. Bananas are yellow.\n");
    await writeFile(file2, "# Fruit\nApples and bananas are common fruits. Bananas are great for smoothies.\n");

    const idx1 = await tools["mem-index"].execute({ path: file1, collection: "e2e_coll_animals" }, mockContext);
    const idx2 = await tools["mem-index"].execute({ path: file2, collection: "e2e_coll_fruit" }, mockContext);

    const parsed1 = JSON.parse(idx1 as string);
    const parsed2 = JSON.parse(idx2 as string);

    expect(parsed1.ok).toBe(true);
    expect(parsed2.ok).toBe(true);
    expect(parsed1.stats).toBeDefined();
    expect(parsed2.stats).toBeDefined();
    expect(parsed1.stats.documentCount + parsed2.stats.documentCount).toBeGreaterThan(0);
  }, TIMEOUT);

  it("performs real search against indexed collections", async () => {
    const rawSearch = await tools["mem-search"].execute({ query: "bananas", collection: "e2e_coll_fruit", topK: 5 }, mockContext);
    const resp = JSON.parse(rawSearch as string);

    expect(resp.ok).toBe(true);
    expect(resp.count).toBeGreaterThan(0);
    expect(Array.isArray(resp.results)).toBe(true);

    const r = resp.results[0];
    expect(r.preview).toBeTruthy();
    expect(typeof r.score).toBe("number");
    expect(r.score).toBeGreaterThan(0);
    expect(r.preview.toLowerCase().includes("banana") || r.preview.toLowerCase().includes("bananas")).toBe(true);
  }, TIMEOUT);

  it("supports multi-source context injection via real collections", async () => {
    const opencodeConfig = {
      memsearch: {
        sources: [
          {
            id: "animals-src",
            name: "Animals",
            pathOrCollection: "e2e_coll_animals",
            collection: "e2e_coll_animals",
            enabled: true,
            search: { maxResults: 3, groupBySource: false },
            injection: { template: "## Animals Source\n{{content}}\n(Score: {{score}})", maxContentLength: 500, includeSource: true }
          },
          {
            id: "fruit-src",
            name: "Fruit",
            pathOrCollection: "e2e_coll_fruit",
            collection: "e2e_coll_fruit",
            enabled: true,
            search: { maxResults: 3, groupBySource: false },
            injection: { template: "## Fruit Source\n{{content}}\n(Score: {{score}})", maxContentLength: 500, includeSource: true }
          }
        ]
      }
    };

    await writeFile(join(env.home, "worktree", "opencode.json"), JSON.stringify(opencodeConfig, null, 2));

    const input = { messages: [{ role: "user", content: "Tell me about bananas" }] };
    const output: any = { system: [] };

    const hook = hooks["experimental.chat.system.transform"];
    expect(typeof hook).toBe("function");

    await hook(input, output, mockContext);

    const joinedSystem = (output.system || []).join("\n");
    expect(joinedSystem).toContain("<memsearch-context>");
    expect(joinedSystem).toContain("</memsearch-context>");
    expect(joinedSystem).toMatch(/Animals/i);
    expect(joinedSystem).toMatch(/Fruit/i);
  }, TIMEOUT);

  it("supports search options (minScore, topK) producing filtered results", async () => {
    const rawTopK = await tools["mem-search"].execute({ query: "bananas", topK: 1 }, mockContext);
    const respTopK = JSON.parse(rawTopK as string);
    expect(respTopK.count).toBeLessThanOrEqual(1);

    const rawMin = await tools["mem-search"].execute({ query: "bananas", minScore: 0.99 }, mockContext);
    const respMin = JSON.parse(rawMin as string);
    expect(respMin.ok).toBe(true);
    expect(Array.isArray(respMin.results)).toBe(true);
  }, TIMEOUT);
});
