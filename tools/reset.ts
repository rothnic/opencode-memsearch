import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";

const cli = new MemsearchCLI();

export const memResetTool = tool({
  description: "Reset (drop) the memsearch index. Requires explicit confirmation",
  args: {
    confirm: tool.schema.boolean().describe("Must be true to drop indexed data (acts like --yes)")
  },

  async execute(rawArgs, _context) {
    const { confirm } = rawArgs as { confirm: boolean };

    if (!confirm) {
      const out = {
        ok: false,
        error: "Confirmation required. Pass confirm=true to drop indexed data. This is destructive."
      };
      return JSON.stringify(out);
    }

    try {
      await cli.reset();

      const out = {
        ok: true,
        message: "Index reset successfully"
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

export default memResetTool;
