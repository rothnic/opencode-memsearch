import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import { state } from "../state";
import type { PluginInput } from "@opencode-ai/plugin";

const cli = new MemsearchCLI();

export const onSessionCreated = async (event: any, ctx: PluginInput) => {
  const isAvailable = await cli.checkAvailability();
  if (!isAvailable) {
    console.warn(
      "memsearch CLI not found. Please install it with: pip install memsearch. Plugin functionality will be limited."
    );
    return;
  }

  try {
    const config = await loadConfig(ctx.directory);
    
    if (!state.watcherRunning) {
      state.watcherRunning = true;
      (async () => {
        try {
          await cli.watch(ctx.directory);
        } catch (err) {
          state.watcherRunning = false;
          console.error("memsearch auto-watcher exited:", err);
        }
      })();
    }

    (async () => {
      try {
        await cli.index(ctx.directory, { recursive: true });
      } catch (err) {
        console.error("memsearch auto-index failed:", err);
      }
    })();
    
  } catch (err) {
    console.error("Failed to initialize memsearch plugin session:", err);
  }
};
