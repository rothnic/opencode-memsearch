import { $ } from "bun";
import path from "path";
import os from "os";
import { readdir, mkdir } from "node:fs/promises";

/**
 * Session metadata as stored in OpenCode session JSON files.
 */
export interface SessionMetadata {
  id: string;
  title: string;
  directory: string;
  projectID: string;
  time: {
    created: number;
    updated: number;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
}

/**
 * Entry in a session's history recorded as JSONL.
 */
export interface SessionHistoryEntry {
  ts: string;
  role?: string;
  content?: string;
  tool?: string;
  args?: any;
  messageID?: string;
}

/**
 * Combined object for processing a session.
 */
export interface SessionWithHistory {
  metadata: SessionMetadata;
  history: SessionHistoryEntry[];
}

/**
 * Recording for an indexed session in the state file.
 */
export interface IndexedSession {
  indexedAt: number;
  source: 'file' | 'sdk';
}

/**
 * Structure of the indexed.json state file.
 */
export interface IndexedState {
  sessions: Record<string, IndexedSession>;
  lastRun: number;
}

/**
 * Returns the directory where OpenCode stores session JSON files for a specific project.
 */
export function getSessionsDir(projectId: string): string {
  return path.join(os.homedir(), ".local", "share", "opencode", "storage", "session", projectId);
}

/**
 * Loads the indexing state for the project.
 */
export async function loadIndexedState(workdir: string): Promise<IndexedState> {
  const stateFile = path.join(workdir, ".memsearch", "indexed.json");
  const file = Bun.file(stateFile);
  if (await file.exists()) {
    try {
      return await file.json();
    } catch (e) {
      console.warn(`memsearch: failed to parse indexed.json, starting fresh: ${e}`);
    }
  }
  return { sessions: {}, lastRun: 0 };
}

/**
 * Saves the indexing state for the project.
 */
export async function saveIndexedState(workdir: string, state: IndexedState): Promise<void> {
  const stateDir = path.join(workdir, ".memsearch");
  await mkdir(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, "indexed.json");
  await Bun.write(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Converts a session and its history to a Markdown document for indexing.
 */
export function convertSessionToMarkdown(session: SessionWithHistory): string {
  const { metadata, history } = session;
  let md = `# ${metadata.title || "Untitled Session"}\n\n`;
  
  md += `**ID**: ${metadata.id}\n`;
  md += `**Project ID**: ${metadata.projectID}\n`;
  md += `**Created**: ${new Date(metadata.time.created).toLocaleString()}\n`;
  if (metadata.summary) {
    md += `**Stats**: ${metadata.summary.files} files changed, +${metadata.summary.additions} -${metadata.summary.deletions}\n`;
  }
  md += `\n---\n\n`;

  for (const entry of history) {
    if (entry.role) {
      const timestamp = new Date(entry.ts).toLocaleTimeString();
      md += `## ${entry.role.toUpperCase()} (${timestamp})\n\n`;
      md += `${entry.content}\n\n`;
    } else if (entry.tool) {
      md += `### TOOL: ${entry.tool}\n\n`;
      if (entry.args) {
        md += "```json\n" + JSON.stringify(entry.args, null, 2) + "\n```\n\n";
      }
    }
  }

  return md;
}

/**
 * Main function to index project sessions.
 * 
 * @param projectPath Path to the project root.
 * @param workdir Working directory (usually the same as projectPath).
 * @param options Indexing options, including the projectId if known.
 */
export async function indexSessions(
  projectPath: string, 
  workdir: string, 
  options: { projectId?: string } = {}
): Promise<void> {
  const state = await loadIndexedState(workdir);
  
  const projectId = options.projectId;
  if (!projectId) {
    // If projectId is not provided, we can't reliably find the sessions directory.
    // In practice, this should be passed from the hook or config.
    return;
  }

  const sessionsDir = getSessionsDir(projectId);
  const historyDir = path.join(workdir, ".memsearch", "history");
  const outputDir = path.join(workdir, ".memsearch", "sessions");

  // Ensure sessions output directory exists
  await mkdir(outputDir, { recursive: true });

  let sessionFiles: string[] = [];
  try {
    sessionFiles = await readdir(sessionsDir);
  } catch (e) {
    // Sessions directory might not exist yet if no sessions have been created.
    return;
  }

  let updatedCount = 0;

  for (const file of sessionFiles) {
    if (!file.endsWith(".json") || !file.startsWith("ses_")) continue;
    
    const sessionId = file.replace(".json", "");
    const sessionPath = path.join(sessionsDir, file);
    const sessionFile = Bun.file(sessionPath);
    
    if (!(await sessionFile.exists())) continue;
    
    let metadata: SessionMetadata;
    try {
      metadata = await sessionFile.json();
    } catch (e) {
      continue;
    }

    const lastUpdated = metadata.time.updated;
    const indexed = state.sessions[sessionId];
    
    if (indexed && indexed.indexedAt >= lastUpdated) {
      // Session already indexed and not updated since then
      continue;
    }

    // Load history from .memsearch/history
    const historyPath = path.join(historyDir, `${sessionId}.jsonl`);
    const historyFile = Bun.file(historyPath);
    const history: SessionHistoryEntry[] = [];
    
    if (await historyFile.exists()) {
      const text = await historyFile.text();
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          history.push(JSON.parse(line));
        } catch (e) {
          // Skip malformed entries
        }
      }
    }

    // Convert and write markdown
    const md = convertSessionToMarkdown({ metadata, history });
    const outputPath = path.join(outputDir, `${sessionId}.md`);
    await Bun.write(outputPath, md);

    // Update state
    state.sessions[sessionId] = {
      indexedAt: Date.now(),
      source: 'file'
    };
    updatedCount++;
  }

  if (updatedCount > 0) {
    state.lastRun = Date.now();
    await saveIndexedState(workdir, state);
    
    // Trigger memsearch CLI to index the sessions directory
    try {
      const { MemsearchCLI } = await import("../cli-wrapper");
      const cli = new MemsearchCLI($);
      await cli.index(outputDir, { recursive: true, collection: "sessions" });
    } catch (e) {
      console.error(`memsearch: session indexing failed to trigger CLI: ${e}`);
    }
  }
}
