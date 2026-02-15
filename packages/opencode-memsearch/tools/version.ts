import { tool } from "@opencode-ai/plugin";
import pkg from "../package.json";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import type { MemsearchToolContext } from "../types";

export default tool({
  description: "Return plugin and memsearch CLI versions",
  args: {},
  async execute(_args, _context) {
    const context = _context as MemsearchToolContext;
    try {
      const cli = new MemsearchCLI(context.$);
      const pluginVersion = (pkg as any).version as string;
      const cliVersion = await cli.version();
      return JSON.stringify({ pluginVersion, cliVersion });
    } catch (err: any) {
      if (err instanceof MemsearchNotFoundError) {
        return JSON.stringify({ pluginVersion: (pkg as any).version, cliVersion: null, ok: false, error: "memsearch CLI not found" });
      }
      throw err;
    }
  },
});
