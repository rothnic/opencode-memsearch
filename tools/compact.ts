import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";

const cli = new MemsearchCLI();

export const memCompactTool = tool({
  description: "Run memsearch compaction and return the LLM-produced summary",
  args: {},
  async execute(_args, _context) {
    try {
      const summary = await cli.compact();

      // Return a JSON-serializable string result as required by the tool SDK.
      const out = { ok: true, summary };
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

export default memCompactTool;
