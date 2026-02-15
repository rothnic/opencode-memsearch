import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import type { MemsearchToolContext } from "../types";

export const memStatsTool = tool({
  description: "Return memsearch index statistics (documentCount, chunkCount, indexSize, etc.)",
  args: {},
  async execute(_args, _context) {
    const context = _context as MemsearchToolContext;
    try {
      const cli = new MemsearchCLI(context.$);
      const stats = await cli.stats();

      const out = {
        ok: true,
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

export default memStatsTool;
