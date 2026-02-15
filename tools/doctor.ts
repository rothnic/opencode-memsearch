import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import loadConfig from "../config";
import fs from "fs";
import path from "path";

const cli = new MemsearchCLI();

type Check = { name: string; ok: boolean; detail?: string; fix?: string };

export default tool({
  description: "Run diagnostic checks for memsearch plugin and environment",
  args: {},
  async execute(_args, ctx) {
    const workdir = ctx.directory ?? process.cwd();

    const checks: Check[] = [];

    // 1) Is memsearch CLI in PATH?
    try {
      const available = await cli.checkAvailability();
      if (available) {
        checks.push({ name: "memsearch_cli", ok: true, detail: "memsearch CLI found in PATH" });
      } else {
        checks.push({
          name: "memsearch_cli",
          ok: false,
          detail: "memsearch CLI not found in PATH",
          fix: "Install with: pip install memsearch or ensure the 'memsearch' binary is on your PATH",
        });
      }
    } catch (err: any) {
      checks.push({ name: "memsearch_cli", ok: false, detail: String(err), fix: "Install with: pip install memsearch" });
    }

    // 2) Is embeddingApiKey configured for selected provider?
    try {
      const cfg = await loadConfig(workdir);
      const provider = cfg.embeddingProvider;
      const key = cfg.embeddingApiKey;

      if (provider !== "local" && provider !== "ollama" && provider !== "custom") {
        if (key && key.length > 0) {
          checks.push({ name: "embedding_api_key", ok: true, detail: `Provider='${provider}' and embeddingApiKey is set` });
        } else {
          checks.push({
            name: "embedding_api_key",
            ok: false,
            detail: `Provider='${provider}' but embeddingApiKey is not configured`,
            fix: "Set embeddingApiKey in opencode.json under memsearch or set OPENAI_API_KEY env var",
          });
        }
      } else {
        // local/ollama/custom may not require key
        checks.push({ name: "embedding_api_key", ok: true, detail: `Provider='${provider}' does not require embeddingApiKey` });
      }
    } catch (err: any) {
      checks.push({ name: "embedding_api_key", ok: false, detail: `failed to load config: ${String(err)}` });
    }

    // 3) Is memoryDirectory writable?
    try {
      const cfg = await loadConfig(workdir);
      const memdir = path.resolve(cfg.memoryDirectory);
      const exists = fs.existsSync(memdir);
      let writable = false;

      if (!exists) {
        // try to create a temp file to test
        try {
          fs.mkdirSync(memdir, { recursive: true });
          fs.writeFileSync(path.join(memdir, ".memsearch_write_test"), "ok");
          fs.unlinkSync(path.join(memdir, ".memsearch_write_test"));
          writable = true;
        } catch (err) {
          writable = false;
        }
      } else {
        try {
          fs.accessSync(memdir, fs.constants.W_OK);
          writable = true;
        } catch {
          writable = false;
        }
      }

      if (writable) {
        checks.push({ name: "memory_directory_writable", ok: true, detail: `Memory directory '${memdir}' is writable` });
      } else {
        checks.push({
          name: "memory_directory_writable",
          ok: false,
          detail: `Memory directory '${memdir}' is not writable or cannot be created`,
          fix: `Ensure the directory exists and is writable by the current user (chmod / chown) or change memoryDirectory in opencode.json`,
        });
      }
    } catch (err: any) {
      checks.push({ name: "memory_directory_writable", ok: false, detail: `error checking memoryDirectory: ${String(err)}` });
    }

    // 4) Can `pip show memsearch` find the package?
    try {
      // Use bun $ to run shell commands
      // Dynamically import to avoid top-level bun $ in environments without Bun
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { $ } = require("bun");
      try {
        const res = await $`pip show memsearch`.quiet();
        const found = res.exitCode === 0 && res.stdout && String(res.stdout).trim().length > 0;
        if (found) {
          checks.push({ name: "pip_package", ok: true, detail: "pip package 'memsearch' is installed" });
        } else {
          checks.push({ name: "pip_package", ok: false, detail: "pip show memsearch returned no data", fix: "Install with: pip install memsearch" });
        }
      } catch (err: any) {
        checks.push({ name: "pip_package", ok: false, detail: `pip show failed: ${String(err)}`, fix: "Ensure pip is available and memsearch is installed (pip install memsearch)" });
      }
    } catch (err: any) {
      checks.push({ name: "pip_package", ok: false, detail: `failed to run pip show: ${String(err)}` });
    }

    const out = { ok: checks.every((c) => c.ok), checks };
    return JSON.stringify(out);
  },
});
