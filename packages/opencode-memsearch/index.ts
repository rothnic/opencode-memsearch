import type { Plugin } from "@opencode-ai/plugin";
import memIndexTool from "./tools/index";
import memSearchTool from "./tools/search";
import memWatchTool from "./tools/watch";
import memCompactTool from "./tools/compact";
import memExpandTool from "./tools/expand";
import { onSessionCreated } from "./hooks/session-created";
import { onSessionCompacting } from "./hooks/session-compacting";
import { onSystemTransform } from "./hooks/system-transform";
import { onToolExecuted } from "./hooks/tool-executed";
import { onSessionIdle } from "./hooks/session-idle";

const plugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Register tools so the OpenCode host can discover them.
      tool: {
        "mem-index": memIndexTool,
        "mem-search": memSearchTool,
        "mem-watch": memWatchTool,
        "mem-compact": memCompactTool,
        "mem-expand": memExpandTool,
        "mem-version": (await import("./tools/version")).default,
        "mem-reset": (await import("./tools/reset")).default,
        "mem-stats": (await import("./tools/stats")).default,
        "mem-config": (await import("./tools/config")).default,
        "mem-transcript": (await import("./tools/transcript")).default,
        "mem-doctor": (await import("./tools/doctor")).default,
      },
      hook: {
        "session.created": onSessionCreated,
        "session.deleted": (await import("./hooks/session-deleted")).onSessionDeleted,
        "session.idle": onSessionIdle,
        "experimental.session.compacting": onSessionCompacting,
        "experimental.chat.system.transform": onSystemTransform,
        "message.updated": (await import("./hooks/message-updated")).onMessageUpdated,
        "message.part.updated": (await import("./hooks/message-updated")).onMessagePartUpdated,
        "tool.execute.after": onToolExecuted,
      },
  };
};

export default plugin;
