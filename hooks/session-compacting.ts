import { MemsearchCLI } from "../cli-wrapper";
import type { PluginInput } from "@opencode-ai/plugin";

const cli = new MemsearchCLI();

export const onSessionCompacting = async (
  _input: { sessionID: string },
  output: { context: string[]; prompt?: string },
  ctx: PluginInput
) => {
  try {
    const isAvailable = await cli.checkAvailability();
    if (!isAvailable) return;

    const query = "what were the main goals and achievements of this session?";
    const projectPath = ctx.directory;

    const results: any[] = [];

    try {
      const projectResults = await cli.search(query, {
        topK: 5,
        filter: `source starts_with "${projectPath}"`,
        minScore: 0.01,
      });

      if (projectResults.results) {
        results.push(...projectResults.results.map((r) => ({ ...r, tier: "project" })));
      }
    } catch (e) {}

    if (results.length < 3) {
      try {
        const globalResults = await cli.search(query, {
          collection: "memsearch_global",
          topK: 3,
          minScore: 0.01,
        });
        if (globalResults.results) {
          results.push(...globalResults.results.map((r) => ({ ...r, tier: "global" })));
        }
      } catch (e) {}
    }

    if (results.length === 0) return;

    const uniqueResults = Array.from(new Map(results.map((r) => [r.chunk_hash, r])).values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const formatted = uniqueResults
      .map((r) => {
        const source = r.source?.uri || r.source?.name || "unknown";
        const relativeSource = source.startsWith(projectPath)
          ? source.slice(projectPath.length).replace(/^\//, "")
          : source;

        const heading = r.metadata?.heading ? `\nHeading: ${r.metadata.heading}` : "";
        return `Source: ${relativeSource}${heading}\nContent: ${r.content.trim()}`;
      })
      .join("\n---\n");

    if (formatted) {
      output.context.push(
        `<memsearch-compact-context>\nRelevant memories to assist in session summarization:\n${formatted}\n</memsearch-compact-context>`
      );
    }
  } catch (err) {
    console.error("memsearch session-compacting hook failed:", err);
  }
};
