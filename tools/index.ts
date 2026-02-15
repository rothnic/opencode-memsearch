import { tool } from "@opencode-ai/plugin";
import { z } from "zod";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";

const cli = new MemsearchCLI();

export const memIndexTool = tool({
  description: "Index files/dirs into memsearch local index",
  args: {
    path: tool.schema.string().describe("Path to index"),
    recursive: tool.schema.boolean().optional().describe("Recursive indexing"),
  },
  async execute(args, _context) {
    try {
      const { path, recursive } = args as { path: string; recursive?: boolean };

      // Use the CLI wrapper to perform indexing. The wrapper already
      // handles shell invocation and errors.
      await cli.index(path, { recursive });

      // After indexing, fetch stats to return a concise summary.
      const stats = await cli.stats();

      const out = {
        ok: true,
        message: `Indexed path ${path}`,
        stats,
      };

      return JSON.stringify(out);
    } catch (err: any) {
      if (err instanceof MemsearchNotFoundError) {
        return JSON.stringify({
          ok: false,
          error: "memsearch CLI not found. Please install it with: pip install memsearch",
        });
      }
      throw err;
    }
  },
});

export default memIndexTool;
