import { tool } from "@opencode-ai/plugin";
import { MemsearchCLI, MemsearchNotFoundError } from "../cli-wrapper";
import type { SearchOptions, SearchResponse, SearchResult, MemsearchToolContext } from "../types";

export const memSearchTool = tool({
  description: "Search the memsearch index and return formatted results (includes chunk_hash)",
  args: {
    query: tool.schema.string().describe("Search query string"),
    topK: tool.schema.number().optional().describe("Maximum number of results to return"),
    minScore: tool.schema.number().optional().describe("Minimum score threshold (0..1)"),
    smart: tool.schema.boolean().optional().describe("Use smart search (semantic rerank / expansion)"),
    filter: tool.schema.string().optional().describe("Metadata filter expression (e.g. 'source == \"file.txt\"')"),
  },

  async execute(rawArgs, _context) {
    const context = _context as MemsearchToolContext;
    try {
      const cli = new MemsearchCLI(context.$);
    const { query, topK, minScore, smart, filter } = rawArgs as {
      query: string;
      topK?: number;
      minScore?: number;
      smart?: boolean;
      filter?: string;
    };

    const options: SearchOptions = {};
    if (topK !== undefined) options.topK = topK;
    if (minScore !== undefined) options.minScore = minScore;
    if (smart !== undefined) options.smart = smart ? { enabled: true } : false;
    if (filter !== undefined) options.filter = filter;

    // Call the CLI wrapper which returns typed SearchResponse
    const resp: SearchResponse = await cli.search(query, options);

    // Format results concisely for OpenCode display and include chunk_hash
    const formatted = resp.results.map((r: SearchResult) => {
      const preview = (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      return {
        source: {
          name: r.source?.name ?? "unknown",
          uri: r.source?.uri,
          id: r.source?.id,
        },
        preview: preview + (r.content.length > preview.length ? "…" : ""),
        chunk_hash: r.chunk_hash,
        score: r.score,
        chunk_index: r.chunk_index,
        metadata: r.metadata,
      };
    });

    const out = {
      ok: true,
      query: resp.query,
      options: resp.options,
      durationMs: resp.durationMs,
      count: formatted.length,
      results: formatted,
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

export default memSearchTool;
