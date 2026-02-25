/**
 * @file prompt-builder.ts
 * @description Agent prompt builder for memory extraction (Task 12).
 * Bridges MemoryTypeConfig (memory-type-config.ts: extractionPrompt + tags[])
 * and config-yaml MemoryTypeConfig (tagLists[] + additionalPrompt).
 */

import type { MemoryTypeConfig } from "./memory-type-config";
import type { SessionWithHistory, SessionHistoryEntry } from "./session-indexer";

export interface TagListInfo {
  id: string;
  description: string;
  tags: string[];
  manageable: boolean;
}

/** Extends base MemoryTypeConfig with optional YAML-only fields for prompt building. */
export interface PromptMemoryType extends MemoryTypeConfig {
  additionalPrompt?: string;
  tagLists?: TagListInfo[];
}

export interface PromptBuilderOptions {
  customSystemBase?: string;
  projectPath?: string;
  maxSessionContentLength?: number;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export const DEFAULT_MAX_SESSION_CONTENT_LENGTH = 100_000;

export const BASE_SYSTEM_PROMPT = `You are a memory extraction agent. Your role is to analyze sessions and extract valuable memories to be stored in typed memory collections.

## Core Instructions
- Only extract memories that match the configured memory types below
- Be selective: only emit items that represent genuine, distinct memories
- Do NOT fabricate information not present in the session
- Search existing memories before creating new ones to avoid duplicates
- Always include required metadata fields

## Output Format

Return a single JSON object with an "extracts" array. Each element must follow this exact shape:

\`\`\`json
{
  "extracts": [
    {
      "memoryType": "<type name>",
      "collection": "<collection name>",
      "title": "<concise title, 5-15 words>",
      "content": "<markdown body>",
      "confidence": 0.0,
      "metadata": {
        "sessionId": "<session id>",
        "tags": ["<tag1>", "<tag2>"],
        "technologies": ["<tech1>", "<tech2>"],
        "extractedAt": "<ISO 8601 timestamp>",
        "projectPath": "<project path if available>"
      }
    }
  ]
}
\`\`\`

Rules:
- confidence: 0.0 (uncertain) to 1.0 (definitive). Use >0.7 for clear, explicit items.
- tags: draw from the configured tag lists for each memory type
- technologies: infer from session content (languages, frameworks, tools mentioned)
- content: use markdown, be concise but complete
- If no memories of a given type are found, omit that type (do NOT create empty entries)
- Return an empty extracts array if nothing relevant is found`;

function buildMemoryTypeSection(mt: PromptMemoryType): string {
  const lines: string[] = [];

  lines.push(`### ${mt.name} (collection: ${mt.collection})`);

  if (mt.description) {
    lines.push(`Description: ${mt.description.trim()}`);
  }

  lines.push(`Output path: ${mt.output.path}`);
  lines.push(`Filename pattern: ${mt.output.filenamePattern}`);

  lines.push("");
  lines.push("**Extraction instructions:**");
  lines.push(mt.extractionPrompt.trim());

  if (mt.tagLists && mt.tagLists.length > 0) {
    lines.push("");
    lines.push("**Tag lists:**");
    for (const list of mt.tagLists) {
      const access = list.manageable ? "modifiable" : "read-only";
      lines.push(`- ${list.id} (${access}): ${list.description}`);
      if (list.tags.length > 0) {
        lines.push(`  Current tags: ${list.tags.join(", ")}`);
      }
    }
  } else if (mt.tags.length > 0) {
    lines.push("");
    lines.push(`**Available tags:** ${mt.tags.join(", ")}`);
  }

  if (mt.additionalPrompt) {
    lines.push("");
    lines.push("**Additional instructions:**");
    lines.push(mt.additionalPrompt.trim());
  }

  return lines.join("\n");
}

function formatHistoryEntry(entry: SessionHistoryEntry): string {
  const role = entry.role ?? "unknown";
  const content = entry.content ?? "";
  const tool = entry.tool ? ` [tool: ${entry.tool}]` : "";
  return `[${role}]${tool}: ${content}`;
}

/** Build the system prompt: base instructions + per-type extraction sections. */
export function buildSystemPrompt(
  memoryTypes: PromptMemoryType[],
  options?: PromptBuilderOptions,
): string {
  const base = options?.customSystemBase ?? BASE_SYSTEM_PROMPT;
  const sections: string[] = [base];

  if (memoryTypes.length > 0) {
    sections.push("\n## Available Memory Collections\n");
    for (const mt of memoryTypes) {
      sections.push(buildMemoryTypeSection(mt));
      sections.push("");
    }
  }

  return sections.join("\n").trimEnd();
}

/** Build the user prompt: session metadata + transcript formatted for analysis. */
export function buildUserPrompt(
  session: SessionWithHistory,
  memoryTypes: PromptMemoryType[],
  options?: PromptBuilderOptions,
): string {
  const maxLen =
    options?.maxSessionContentLength ?? DEFAULT_MAX_SESSION_CONTENT_LENGTH;
  const projectPath = options?.projectPath ?? session.metadata.directory;

  const lines: string[] = [];

  lines.push("## Session Information");
  lines.push(`- Session ID: ${session.metadata.id}`);
  lines.push(`- Title: ${session.metadata.title}`);
  lines.push(`- Project: ${projectPath}`);
  lines.push(
    `- Created: ${new Date(session.metadata.time.created).toISOString()}`,
  );
  lines.push(
    `- Updated: ${new Date(session.metadata.time.updated).toISOString()}`,
  );
  lines.push("");

  lines.push("## Memory Types to Extract");
  for (const mt of memoryTypes) {
    const desc = mt.description?.trim() ?? mt.extractionPrompt.substring(0, 80);
    lines.push(`- ${mt.name}: ${desc}`);
  }
  lines.push("");

  lines.push("## Session Transcript");
  lines.push("");

  let totalLen = 0;
  for (const entry of session.history) {
    const formatted = formatHistoryEntry(entry);
    totalLen += formatted.length;
    if (totalLen > maxLen) {
      lines.push("[... session content truncated due to length ...]");
      break;
    }
    lines.push(formatted);
  }

  lines.push("");
  lines.push("---");
  lines.push(
    "Analyze the session above and extract memories for each requested type. " +
      "Return the JSON output as specified in your system instructions.",
  );

  return lines.join("\n");
}

/** JSON Schema for extraction output — mirrors MemoryExtract from session-processor.ts. */
export function buildExtractionSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["extracts"],
    properties: {
      extracts: {
        type: "array",
        items: {
          type: "object",
          required: [
            "memoryType",
            "collection",
            "title",
            "content",
            "confidence",
            "metadata",
          ],
          properties: {
            memoryType: {
              type: "string",
              description: "Memory type name (e.g. 'decision', 'convention')",
            },
            collection: {
              type: "string",
              description: "Target collection name",
            },
            title: {
              type: "string",
              description: "Concise title, 5-15 words",
            },
            content: {
              type: "string",
              description: "Markdown body of the memory",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Extraction confidence score",
            },
            metadata: {
              type: "object",
              required: [
                "sessionId",
                "tags",
                "technologies",
                "extractedAt",
              ],
              properties: {
                sessionId: { type: "string" },
                tags: {
                  type: "array",
                  items: { type: "string" },
                },
                technologies: {
                  type: "array",
                  items: { type: "string" },
                },
                extractedAt: {
                  type: "string",
                  format: "date-time",
                },
                projectPath: { type: "string" },
                extra: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function buildPromptForType(
  memoryType: PromptMemoryType,
  session: SessionWithHistory,
  options?: PromptBuilderOptions,
): BuiltPrompt {
  return {
    systemPrompt: buildSystemPrompt([memoryType], options),
    userPrompt: buildUserPrompt(session, [memoryType], options),
  };
}

export function buildPromptForTypes(
  memoryTypes: PromptMemoryType[],
  session: SessionWithHistory,
  options?: PromptBuilderOptions,
): BuiltPrompt {
  return {
    systemPrompt: buildSystemPrompt(memoryTypes, options),
    userPrompt: buildUserPrompt(session, memoryTypes, options),
  };
}

/** Bridge: convert base MemoryTypeConfig to PromptMemoryType with optional YAML fields. */
export function toPromptMemoryType(
  config: MemoryTypeConfig,
  overrides?: { additionalPrompt?: string; tagLists?: TagListInfo[] },
): PromptMemoryType {
  return {
    ...config,
    additionalPrompt: overrides?.additionalPrompt,
    tagLists: overrides?.tagLists,
  };
}
