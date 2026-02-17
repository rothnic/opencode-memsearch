import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import path from "path";
import os from "os";
import { mkdir, rm, readFile } from "node:fs/promises";
import {
  convertSessionToMarkdown,
  loadIndexedState,
  saveIndexedState,
  indexSessions,
  IndexedState,
  SessionWithHistory,
  SessionMetadata,
} from "./session-indexer";

// Helper to create a temporary project workspace
const tmpRoot = path.join(process.cwd(), "tmp-test-workdir");
const projectId = "test-project-123";
const sessionsDir = path.join(os.homedir(), ".local", "share", "opencode", "storage", "session", projectId);

beforeAll(async () => {
  // Clean previous runs
  await rm(tmpRoot, { recursive: true, force: true });
  // Ensure workdir exists
  await mkdir(tmpRoot, { recursive: true });
  // Ensure sessions dir exists
  await mkdir(sessionsDir, { recursive: true });
});

afterAll(async () => {
  // Cleanup
  await rm(tmpRoot, { recursive: true, force: true });
});

test("convertSessionToMarkdown includes ID, title, role, content", () => {
  const metadata: SessionMetadata = {
    id: "ses_abc",
    title: "My Session",
    directory: "/tmp",
    projectID: projectId,
    time: { created: Date.now(), updated: Date.now() },
    summary: { additions: 2, deletions: 1, files: 3 },
  };

  const history: SessionWithHistory["history"] = [
    { ts: new Date().toISOString(), role: "user", content: "Hello world" },
    { ts: new Date().toISOString(), role: "assistant", content: "Hi back" },
  ];

  const md = convertSessionToMarkdown({ metadata, history } as SessionWithHistory);

  // markdown uses bold labels for metadata
  expect(md).toContain("**ID**: ses_abc");
  expect(md).toContain("My Session");
  expect(md).toContain("USER");
  expect(md).toContain("Hello world");
});

test("loadIndexedState / saveIndexedState round-trip", async () => {
  const statePath = tmpRoot;
  // ensure clean
  await rm(path.join(statePath, ".memsearch"), { recursive: true, force: true });

  const state: IndexedState = { sessions: { "ses_1": { indexedAt: 1000, source: 'file' } }, lastRun: 1000 };
  await saveIndexedState(statePath, state);

  const loaded = await loadIndexedState(statePath);
  expect(loaded.sessions["ses_1"].indexedAt).toBe(1000);
  expect(loaded.lastRun).toBe(1000);
});

test("indexSessions writes markdown and updates state for new sessions", async () => {
  // Create a session JSON in the sessionsDir
  const sessionId = "ses_test1";
  const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
  const now = Date.now();
  const metadata: SessionMetadata = {
    id: sessionId,
    title: "Session One",
    directory: "/tmp",
    projectID: projectId,
    time: { created: now, updated: now },
  };

  await mkdir(path.dirname(sessionFile), { recursive: true });
  await Bun.write(sessionFile, JSON.stringify(metadata, null, 2));

  // Create history file expected in .memsearch/history
  const historyDir = path.join(tmpRoot, ".memsearch", "history");
  await mkdir(historyDir, { recursive: true });
  const historyPath = path.join(historyDir, `${sessionId}.jsonl`);
  await Bun.write(historyPath, JSON.stringify({ ts: new Date().toISOString(), role: "user", content: "hey" }) + "\n");

  // Ensure no indexed state
  await rm(path.join(tmpRoot, ".memsearch", "indexed.json"), { force: true }).catch(() => {});

  // Run indexer
  await indexSessions(tmpRoot, tmpRoot, { projectId });

  // Check that markdown was written
  const outMd = path.join(tmpRoot, ".memsearch", "sessions", `${sessionId}.md`);
  const mdText = await readFile(outMd, "utf-8");
  expect(mdText).toContain("Session One");

  // Check indexed state updated
  const state = await loadIndexedState(tmpRoot);
  expect(state.sessions[sessionId]).toBeTruthy();
});
