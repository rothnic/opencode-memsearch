import { tool } from "@opencode-ai/plugin";
import path from "path";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import type { TranscriptEntry } from "../cli-wrapper";
import type { MemsearchToolContext } from "../types";

interface Turn {
  type: "message" | "tool_execution" | "search";
  timestamp: string;
  role?: string;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  query?: string;
  results?: string[];
}

export const memTranscriptTool = tool({
  description: "Fetch transcript entries for a memsearch session (returns turns)",
  args: {
    sessionId: tool.schema.string().describe("Transcript session id"),
    index: tool.schema.number().optional().describe("Optional index of a specific turn"),
  },

  async execute(args, _context) {
    const context = _context as MemsearchToolContext;
    try {
      const { sessionId, index } = args as { sessionId: string; index?: number };
      const cli = new MemsearchCLI(context.$);

      const historyDir = path.join(context.directory, ".memsearch", "history");
      const historyFile = path.join(historyDir, `${sessionId}.jsonl`);
      const file = Bun.file(historyFile);

      let turns: Turn[] = [];

      if (await file.exists()) {
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === "tool_execution") {
              turns.push({
                type: "tool_execution",
                timestamp: entry.ts,
                tool: entry.tool,
                args: entry.args,
              });
            } else if (entry.role) {
              turns.push({
                type: "message",
                timestamp: entry.ts,
                role: entry.role,
                content: entry.content,
              });
            }
          } catch (e) {
          }
        }
      } else {
        const entries: TranscriptEntry[] = await cli.transcript(sessionId);
        turns = entries.map((e) => ({
          type: "search",
          timestamp: e.timestamp,
          query: e.query,
          results: e.results,
        }));
      }

      if (typeof index === "number") {
        const selected = turns[index];
        turns = selected ? [selected] : [];
      }

      const out = {
        ok: true,
        count: turns.length,
        turns,
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

export default memTranscriptTool;
