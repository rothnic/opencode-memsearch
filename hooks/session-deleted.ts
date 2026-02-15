import { state } from "../state";
import type { PluginInput } from "@opencode-ai/plugin";

export const onSessionDeleted = async (event: any, ctx: PluginInput) => {
  const sessionId = event.sessionID || event.sessionId;
  if (!sessionId) return;

  try {
    // Remove any per-session summarized marker
    if (state.summarizedSessions.has(sessionId)) {
      state.summarizedSessions.delete(sessionId);
    }

    // Per plan: stop watcher and reset the flag. The actual watcher process
    // is owned by session.created which sets watcherRunning=true when started.
    // We cannot reliably stop an external process here, so we just flip the
    // flag to false as a cleanup precaution.
    state.watcherRunning = false;
  } catch (err) {
    // Non-blocking: log errors but don't throw to avoid blocking host
    console.error("memsearch: session.deleted hook failed:", err);
  }
};
