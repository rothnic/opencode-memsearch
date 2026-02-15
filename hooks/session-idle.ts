import fs from "fs";
import path from "path";
import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import { state } from "../state";
import type { PluginInput } from "@opencode-ai/plugin";

const cli = new MemsearchCLI();

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
  }
}

export const onSessionIdle = async (event: any, ctx: PluginInput) => {
  const sessionId = event.sessionID || event.sessionId;
  if (!sessionId) return;

  if (state.summarizedSessions.has(sessionId)) {
    return;
  }

  try {
    const config = await loadConfig(ctx.directory);
    const summary = await cli.compact();

    if (!summary || summary.trim().length === 0) {
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const memoryFile = path.join(config.memoryDirectory, `${today}.md`);
    
    ensureDir(config.memoryDirectory);

    const timestamp = new Date().toISOString();
    const entry = `\n\n## Session Summary: ${sessionId}\n**Timestamp:** ${timestamp}\n\n${summary.trim()}\n`;

    await fs.promises.appendFile(memoryFile, entry);
    
    state.summarizedSessions.add(sessionId);
  } catch (err) {
    console.error("memsearch: session.idle hook failed:", err);
  }
};
