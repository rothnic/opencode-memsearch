import fs from "fs";
import path from "path";
import type { PluginInput } from "@opencode-ai/plugin";

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // intentionally empty
  }
}

interface ToolExecutedEvent {
  sessionID?: string;
  sessionId?: string;
  tool?: string;
  name?: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export const onToolExecuted = async (event: ToolExecutedEvent, ctx: PluginInput) => {
  try {
    const sessionId = event.sessionID ?? event.sessionId ?? "unknown";
    const toolName: string = event.tool ?? event.name ?? "unknown";
    const args: Record<string, unknown> = event.args ?? event.input ?? {};

    const dir = path.join(ctx.directory, ".memsearch", "history");
    ensureDir(dir);
    const file = path.join(dir, `${sessionId}.jsonl`);

    const entry = {
      ts: new Date().toISOString(),
      type: "tool_execution",
      tool: toolName,
      args,
      sessionId,
    } as const;

    fs.appendFile(file, JSON.stringify(entry) + "\n", (err) => {
      if (err) console.error("memsearch: failed to append tool execution history", err);
    });
  } catch (err) {
    console.error("memsearch tool.execute.after hook error:", err);
  }
};

export default { onToolExecuted };
