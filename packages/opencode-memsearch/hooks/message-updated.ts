import fs from "fs";
import path from "path";
import type { PluginInput } from "@opencode-ai/plugin";

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function partsToText(message: any) {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p: any) => p.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("\n")
      .trim();
  }
  return "";
}

export const onMessageUpdated = async (event: any, ctx: PluginInput) => {
  try {
    const sessionId = event.sessionID || event.sessionId || "unknown";
    const role = event.message?.role || "unknown";
    const content = partsToText(event.message || {});
    if (!content) return;

    const dir = path.join(ctx.directory, ".memsearch", "history");
    ensureDir(dir);
    const file = path.join(dir, `${sessionId}.jsonl`);

    const entry = {
      ts: new Date().toISOString(),
      role,
      content,
      messageID: event.message?.id,
    };

    // Append as JSONL
    fs.appendFile(file, JSON.stringify(entry) + "\n", (err) => {
      if (err) console.error("memsearch: failed to append message history", err);
    });
  } catch (err) {
    console.error("memsearch message.updated hook error:", err);
  }
};

export const onMessagePartUpdated = async (event: any, ctx: PluginInput) => {
  try {
    // message.part.updated may fire multiple times for the same message as parts arrive.
    // We'll treat these as upserts: overwrite the last line for the same messageID if present.
    const sessionId = event.sessionID || event.sessionId || "unknown";
    const role = event.message?.role || "unknown";
    const content = partsToText(event.message || {});
    if (!content) return;

    const dir = path.join(ctx.directory, ".memsearch", "history");
    ensureDir(dir);
    const file = path.join(dir, `${sessionId}.jsonl`);

    const entry = {
      ts: new Date().toISOString(),
      role,
      content,
      messageID: event.message?.id,
      partID: event.partID,
    };

    // Simple strategy: append the partial update. Dedup / compaction can run later.
    fs.appendFile(file, JSON.stringify(entry) + "\n", (err) => {
      if (err) console.error("memsearch: failed to append message part history", err);
    });
  } catch (err) {
    console.error("memsearch message.part.updated hook error:", err);
  }
};

export default { onMessageUpdated, onMessagePartUpdated };
