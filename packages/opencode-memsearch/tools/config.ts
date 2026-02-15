import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import type { MemsearchConfig, MemsearchToolContext } from "../types";

export const memConfigTool = tool({
  description: "Get or set memsearch configuration values",
  args: {
    action: tool.schema.enum(["get", "set"]).describe("Action to perform: get or set"),
    key: tool.schema.string().optional().describe("Configuration key (required for set, optional for get)"),
    value: tool.schema.string().optional().describe("Value to set (required for set)") ,
  },

  async execute(rawArgs, _context) {
    const context = _context as MemsearchToolContext;
    const { action, key, value } = rawArgs as { action: "get" | "set"; key?: string; value?: string };

    try {
      const cli = new MemsearchCLI(context.$);
      if (action === "get") {
        // If key provided, return specific value; otherwise return full config
        const conf: Partial<MemsearchConfig> = await cli.config("get", key);
        return JSON.stringify({ ok: true, action: "get", key: key ?? null, config: conf });
      }

      // set
      if (!key || value === undefined) {
        return JSON.stringify({ ok: false, message: "key and value are required for action 'set'" });
      }

      await cli.config("set", key, value);
      return JSON.stringify({ ok: true, action: "set", key, value });
    } catch (err: any) {
      if (err instanceof MemsearchNotFoundError) {
        return JSON.stringify({
          ok: false,
          error: "memsearch CLI not found. Please install it with: pip install memsearch",
        });
      }
      return JSON.stringify({ ok: false, message: err?.message ?? String(err) });
    }
  },
});

export default memConfigTool;
