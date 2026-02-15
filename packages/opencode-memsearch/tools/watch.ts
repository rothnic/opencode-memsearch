import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import { state } from "../state";
import type { MemsearchToolContext } from "../types";

export const memWatchTool = tool({
  description: "Start a memsearch filesystem watcher for a path",
  args: {
    path: tool.schema.string().describe("Path to watch with memsearch"),
  },
  async execute(args, _context) {
    const context = _context as MemsearchToolContext;
    const { path } = args as { path: string };
    const cli = new MemsearchCLI(context.$);

    if (state.watcherRunning) {
      return JSON.stringify({
        ok: false,
        message: "Watcher already running in this process",
      });
    }

    // Mark running before launching to avoid races.
    state.watcherRunning = true;

    // Launch watcher without blocking the main thread. MemsearchCLI.watch
    // is implemented to await the underlying bun $`memsearch watch` call which
    // will run until cancelled. We spawn it and don't await so the tool
    // returns immediately while the child process continues.
    (async () => {
      try {
        await cli.watch(path);
      } catch (err) {
        // If the watcher exits with error, clear the flag so it can be restarted.
        state.watcherRunning = false;
        // eslint-disable-next-line no-console
        console.error("mem-watch: watcher exited:", err);
      }
    })();

    try {
      return JSON.stringify({
        ok: true,
        message: `Watcher started for ${path}`,
        running: true,
      });
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

export default memWatchTool;
