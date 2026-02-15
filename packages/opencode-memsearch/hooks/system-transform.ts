import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import type { PluginInput } from "@opencode-ai/plugin";

/**
 * Hook to inject relevant memories into the system prompt based on user query.
 */
export const onSystemTransform = async (input: any, output: any, ctx: PluginInput) => {
  try {
    const cli = new MemsearchCLI(ctx.$);
    const isAvailable = await cli.checkAvailability();
    if (!isAvailable) return;

    // 1. Get user's latest message from input.messages
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
    const sources = config.sources || [];
    const projectPath = ctx.directory;

    const injectionBlocks: string[] = [];

    for (const source of sources) {
      if (!source.enabled) continue;

      try {
        const topK = source.search.groupBySource
          ? source.search.maxResults * 5
          : source.search.maxResults;

        const searchResults = await cli.search(query, {
          collection: source.collection || source.pathOrCollection,
          topK,
          minScore: source.search.minScore || 0.01,
          filter: source.search.filter,
        });

        if (searchResults.results && searchResults.results.length > 0) {
          let resultsToProcess = searchResults.results;

          if (source.search.groupBySource) {
            const groups = new Map<string, typeof resultsToProcess>();
            for (const r of resultsToProcess) {
              const uri = r.source?.uri || r.source?.name || "unknown";
              if (!groups.has(uri)) {
                groups.set(uri, []);
              }
              groups.get(uri)!.push(r);
            }

            const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
              const scoreA = Math.max(...a[1].map((r) => r.score));
              const scoreB = Math.max(...b[1].map((r) => r.score));
              return scoreB - scoreA;
            });

            const topGroups = sortedGroups.slice(0, source.search.maxResults);

            resultsToProcess = topGroups.flatMap(([_, chunks]) => {
              return chunks
                .sort((a, b) => b.score - a.score)
                .slice(0, source.search.maxChunksPerSource || 1);
            });
          }

          const formattedResults = resultsToProcess
            .map((r) => {
              const rawContent = r.content.trim();
              const content = rawContent.length > source.injection.maxContentLength
                ? rawContent.slice(0, source.injection.maxContentLength) + "..."
                : rawContent;

              const sourceUri = r.source?.uri || r.source?.name || "unknown";
              const relativeSource = sourceUri.startsWith(projectPath)
                ? sourceUri.slice(projectPath.length).replace(/^\//, "")
                : sourceUri;

              let template = source.injection.template;
              
              // Simple template replacement
              template = template.replace(/{{content}}/g, content);
              template = template.replace(/{{name}}/g, r.source?.name || source.name);
              template = template.replace(/{{source}}/g, relativeSource);
              template = template.replace(/{{score}}/g, r.score.toFixed(2));
              
              return template;
            })
            .join("\n---\n");

          if (formattedResults) {
            injectionBlocks.push(formattedResults);
          }
        }
      } catch (e) {
        // Source might not exist or search might fail; degrade gracefully
        console.error(`Search failed for source ${source.id}:`, e);
      }
    }

    if (injectionBlocks.length > 0) {
      const combined = injectionBlocks.join("\n\n");
      output.system.push(`<memsearch-context>\n${combined}\n</memsearch-context>`);
    }
  } catch (err) {
    // Degrade gracefully: don't block the chat if search fails
    console.error("memsearch system-transform hook failed:", err);
  }
};
