import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import type { ExpandResult, MemsearchToolContext } from "../types";

export const memExpandTool = tool({
  description: "Expand a chunk_hash into full context: source, heading, and full content",
  args: {
    chunk_hash: tool.schema.string().describe("Chunk hash to expand"),
  },

  async execute(args, _context) {
    const context = _context as MemsearchToolContext;
    try {
      const { chunk_hash } = args as { chunk_hash: string };
      const cli = new MemsearchCLI(context.$);

      // Use the CLI wrapper which returns typed ExpandResult[]
      const results: ExpandResult[] = await cli.expand(chunk_hash);

      // memsearch expand may return multiple entries; return them verbatim but
      // ensure we present a stable structure for callers.
      const expanded = results.map((r) => ({
        source: r.source,
        heading: r.heading,
        content: r.content,
        chunk_hash: r.chunk_hash,
        // Provide a markdown-friendly rendering for LLM consumption.
        // Use fenced block for content to preserve formatting and newlines.
        markdown: `### Source: ${r.source?.uri ?? r.source?.name ?? "unknown"}\n` +
          (r.heading ? `**Heading:** ${r.heading}\n\n` : "") +
          `**Chunk Hash:** ${r.chunk_hash}\n\n` +
          `\n\n` +
          "````text\n" +
          `${r.content}\n` +
          "````",
      }));

      // Top-level consolidated markdown when multiple segments are returned.
      const consolidatedMarkdown = expanded
        .map((e, i) => `---\n` + `**Segment ${i + 1}/${expanded.length}**\n\n` + e.markdown)
        .join("\n\n");

      const out = {
        ok: true,
        count: expanded.length,
        // Individual results with raw fields + markdown rendering
        results: expanded,
        // Convenience field: concatenated markdown of all segments for easy LLM ingest
        markdown: consolidatedMarkdown,
      };

      // Return stringified JSON (per SDK expectations). Callers will parse.
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

export default memExpandTool;
