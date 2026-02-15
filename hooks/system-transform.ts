import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import type { PluginInput } from "@opencode-ai/plugin";

const cli = new MemsearchCLI();

/**
 * Hook to inject relevant memories into the system prompt based on user query.
 */
export const onSystemTransform = async (input: any, output: any, ctx: PluginInput) => {
  try {
    const isAvailable = await cli.checkAvailability();
    if (!isAvailable) return;

    // 1. Get user's latest message from input.messages as per task requirement
    const messages = input.messages || [];
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();

    let query = "";
    if (lastUserMessage) {
      if (typeof lastUserMessage.content === "string") {
        query = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.parts)) {
        query = lastUserMessage.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n")
          .trim();
      }
    }

    if (!query) return;

    const config = await loadConfig(ctx.directory);
    const projectPath = ctx.directory;

    const results: any[] = [];

    // Tier 1: Search current project collection
    const projectResults = await cli.search(query, {
      topK: config.topK,
      filter: `source starts_with "${projectPath}"`,
      minScore: 0.01,
    });

    if (projectResults.results) {
      results.push(...projectResults.results.map((r) => ({ ...r, tier: "project" })));
    }

    // Tier 2: Search global memories if project results are few or query is general
    // Heuristic: if fewer than 3 project results, try global search
    const shouldSearchGlobal = results.length < 3;

    if (shouldSearchGlobal) {
      try {
        const globalResults = await cli.search(query, {
          collection: "memsearch_global",
          topK: Math.max(3, Math.floor(config.topK / 2)),
          minScore: 0.01,
        });
        if (globalResults.results) {
          results.push(...globalResults.results.map((r) => ({ ...r, tier: "global" })));
        }
      } catch (e) {
        // Global collection might not exist or search might fail; degrade gracefully
      }
    }

    if (results.length === 0) return;

    // Deduplicate by chunk_hash and sort by score
    const uniqueResults = Array.from(new Map(results.map((r) => [r.chunk_hash, r])).values())
      .sort((a, b) => b.score - a.score)
      .slice(0, config.topK);

    // Format results with source, heading, and content
    const formatted = uniqueResults
      .map((r) => {
        const source = r.source?.uri || r.source?.name || "unknown";
        const relativeSource = source.startsWith(projectPath)
          ? source.slice(projectPath.length).replace(/^\//, "")
          : source;

        const heading = r.metadata?.heading ? `\nHeading: ${r.metadata.heading}` : "";
        
        const content = r.content.trim();
        let preview = content;
        if (content.length > 200) {
          const lastSpace = content.lastIndexOf(" ", 200);
          preview = (lastSpace > 0 ? content.slice(0, lastSpace) : content.slice(0, 200)) + "...";
        }

        return `Source: ${relativeSource}${heading}\nChunk Hash: ${r.chunk_hash}\nConfidence: ${r.score.toFixed(2)}\nContent: ${preview}`;
      })
      .join("\n---\n");

    if (formatted) {
      output.system.push(`<memsearch-context>\n${formatted}\n</memsearch-context>`);
    }
  } catch (err) {
    // Degrade gracefully: don't block the chat if search fails
    console.error("memsearch system-transform hook failed:", err);
  }
};
